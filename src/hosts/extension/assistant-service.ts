import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import type {
  AiConversationMessage,
  AiConversationSegment,
  AiImageAttachment,
} from '../../ai/domain/types';
import type {
  AiModelMessage,
  AiModelToolCall,
} from '../../ai/infrastructure/model-client';
import { toolContinuationMessages } from '../../ai/infrastructure/model-client';
import type { DeckVisibility } from '../../features/userscript-deck/deck-entry';
import type { TransactionalScriptRepository } from '../../userscript/application/script-repository';
import { userscriptSourceRevision } from '../../userscript/application/script-revision';
import type { UserscriptRuntimeState } from '../../userscript/domain/types';
import type { ExtensionAiServices } from './ai-services';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import type { AssistantPageAttachment } from './assistant-page-observer';
import {
  type AiAssistantPortEvent,
  type AiAssistantPortRequest,
  aiAssistantPortRequest,
} from './assistant-protocol';
import {
  type AssistantScriptChange,
  applyAssistantScriptChange,
} from './assistant-script-changes';
import {
  activeAssistantConversation,
  assistantConversation,
  assistantSnapshot,
  compactAssistantInput,
  createStoredAssistantConversation,
  emptyAssistantState,
  rememberAssistantTurnContext,
  type StoredAssistantConversation,
  type StoredAssistantState,
  titleAssistantConversation,
} from './assistant-state';
import { ExtensionAssistantStateStore } from './assistant-state-store';
import {
  type AssistantInitialTabContext,
  ExtensionAssistantTabSession,
  readAssistantTabTargetState,
} from './assistant-tab-session';
import {
  appendConversationSegment,
  appendConversationSegmentBoundary,
  completeConversationToolCall,
  conversationSegmentContentLength,
  startConversationToolCall,
  upsertConversationToolSegment,
} from './assistant-timeline';
import {
  type AssistantUserscriptRuntimeSnapshot,
  assistantToolError,
  assistantTools,
  buildAssistantInstructions,
  executeAssistantTool,
} from './assistant-tools';
import { requestDeckCreationPreview } from './deck-visibility';
import { extensionDiagnostics } from './diagnostics';
import {
  GreasyForkClient,
  type GreasyForkSearchInput,
} from './greasyfork-client';
import type { UserscriptActivationResult } from './userscript-activation-coordinator';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type AssistantToolPlatform = {
  readRuntimeStates(
    tabId: number,
  ): Promise<AssistantUserscriptRuntimeSnapshot[]>;
  readRuntimeState(
    tabId: number,
    scriptId: string,
  ): Promise<UserscriptRuntimeState | undefined>;
  invokeRuntimeCommand(
    tabId: number,
    scriptId: string,
    commandId: string,
  ): Promise<unknown>;
  readPageUrl(tabId: number): Promise<string>;
  setDeckVisibility(tabId: number, visibility: DeckVisibility): Promise<void>;
};

type AssistantGreasyForkClient = Pick<GreasyForkClient, 'search' | 'download'>;

function pageContextText(context: AssistantInitialTabContext, message: string) {
  const { page, target } = context;
  return `<browser_target>
标题：${target.title || '（无标题）'}
URL：${target.url || '（无）'}
活动状态：${target.active ? '当前可见' : '未激活'}
可用状态：${target.available ? '可用' : '不可用'}
${context.error ? `说明：${context.error}` : ''}
</browser_target>

<page_context>
语言：${page?.language || '（未知）'}
选中文字：${page?.selectedText || '（无）'}
可见文本快照：
${page?.visibleText || '（当前没有可用页面快照）'}
</page_context>

<user_message>
${message}
</user_message>`;
}

function assistantScriptMutation(change: AssistantScriptChange) {
  switch (change.operation) {
    case 'create':
      return 'installed';
    case 'edit':
      return 'updated';
    case 'delete':
      return 'removed';
    case 'set-cover-image':
      return 'cover-updated';
    case 'set-enabled':
      return change.enabled ? 'enabled' : 'disabled';
    case 'set-site-enabled':
      return change.enabled ? 'site-enabled' : 'site-disabled';
  }
}

export class ExtensionAssistantService {
  private readonly ports = new Set<ExtensionPort>();
  private readonly portSurfaceIds = new Map<ExtensionPort, number>();
  private readonly surfaceTargets = new Map<number, number | null>();
  private readonly activeTabSessions = new Map<
    number,
    ExtensionAssistantTabSession
  >();
  private readonly stateStore: ExtensionAssistantStateStore;
  private activeRun: {
    conversationId: string;
    controller: AbortController;
    completion: Promise<void>;
  } | null = null;
  private readonly requestOperations = new Map<
    string,
    Promise<string | undefined>
  >();
  private publishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly repository: TransactionalScriptRepository,
    private readonly services: Pick<
      ExtensionAiServices,
      'openModelSession' | 'readView'
    > &
      Partial<Pick<ExtensionAiServices, 'generateCardCover'>>,
    private readonly afterLibraryCommit: (
      previous: Awaited<ReturnType<TransactionalScriptRepository['list']>>,
      next: Awaited<ReturnType<TransactionalScriptRepository['list']>>,
      tabId: number,
    ) => Promise<UserscriptActivationResult>,
    private readonly resolvePageAttachment: (
      tabId: number,
    ) => Promise<AssistantPageAttachment>,
    private readonly toolPlatform: AssistantToolPlatform,
    private readonly greasyFork: AssistantGreasyForkClient = new GreasyForkClient(),
  ) {
    this.stateStore = new ExtensionAssistantStateStore(api.storage.local);
    this.installTabTargetLifecycle();
  }

  connect(port: ExtensionPort, surfaceTabId: number) {
    this.ports.add(port);
    this.portSurfaceIds.set(port, surfaceTabId);
    if (!this.surfaceTargets.has(surfaceTabId)) {
      this.surfaceTargets.set(surfaceTabId, surfaceTabId);
    }
    port.onMessage.addListener((message) => {
      if (!aiAssistantPortRequest(message)) return;
      try {
        port.postMessage({
          type: 'received',
          requestId: message.requestId,
        } satisfies AiAssistantPortEvent);
      } catch {
        // The durable request can still complete and be acknowledged after reconnect.
      }
      void this.handleRequest(message, surfaceTabId).then((error) => {
        try {
          port.postMessage({
            type: 'ack',
            requestId: message.requestId,
            ...(error ? { error } : {}),
          } satisfies AiAssistantPortEvent);
        } catch {
          // The controller reconnects with the same durable request identity.
        }
      });
    });
    port.onDisconnect.addListener(() => {
      void this.api.runtime?.lastError;
      this.forgetPort(port);
    });
    void this.publish().catch(() => undefined);
    void this.publishTarget(port, surfaceTabId).catch(() => undefined);
  }

  private installTabTargetLifecycle() {
    const tabs = this.api.tabs;
    tabs?.onRemoved?.addListener((tabId) => {
      for (const session of this.activeTabSessions.values()) {
        session.invalidateTab(tabId);
      }
      for (const [surfaceTabId, targetTabId] of this.surfaceTargets) {
        if (targetTabId !== tabId) continue;
        this.surfaceTargets.set(surfaceTabId, null);
        void this.publishSurfaceTarget(surfaceTabId).catch(() => undefined);
      }
    });
    tabs?.onUpdated?.addListener((tabId) => {
      for (const [surfaceTabId, targetTabId] of this.surfaceTargets) {
        if (targetTabId === tabId) {
          void this.publishSurfaceTarget(surfaceTabId).catch(() => undefined);
        }
      }
    });
    tabs?.onActivated?.addListener(() => {
      for (const surfaceTabId of this.surfaceTargets.keys()) {
        void this.publishSurfaceTarget(surfaceTabId).catch(() => undefined);
      }
    });
  }

  private setSurfaceTarget(surfaceTabId: number, targetTabId: number | null) {
    this.surfaceTargets.set(surfaceTabId, targetTabId);
    void this.publishSurfaceTarget(surfaceTabId).catch(() => undefined);
  }

  private async publishTarget(port: ExtensionPort, surfaceTabId: number) {
    const selectedTabId = this.surfaceTargets.get(surfaceTabId) ?? null;
    const target = await readAssistantTabTargetState(this.api, selectedTabId);
    const currentSelectedTabId = this.surfaceTargets.get(surfaceTabId) ?? null;
    if (currentSelectedTabId !== selectedTabId) return;
    if (!target.available && selectedTabId !== null) {
      this.surfaceTargets.set(surfaceTabId, null);
    }
    try {
      port.postMessage({
        type: 'target',
        target,
      } satisfies AiAssistantPortEvent);
    } catch {
      this.forgetPort(port);
    }
  }

  private async publishSurfaceTarget(surfaceTabId: number) {
    const ports = [...this.portSurfaceIds]
      .filter(([, candidate]) => candidate === surfaceTabId)
      .map(([port]) => port);
    await Promise.all(
      ports.map((port) =>
        this.publishTarget(port, surfaceTabId).catch(() => undefined),
      ),
    );
  }

  private forgetPort(port: ExtensionPort) {
    this.ports.delete(port);
    this.portSurfaceIds.delete(port);
  }

  private handleRequest(message: AiAssistantPortRequest, surfaceTabId: number) {
    if (message.type === 'heartbeat') return Promise.resolve(undefined);
    const existing = this.requestOperations.get(message.requestId);
    if (existing) return existing;
    const operation = (async () => {
      try {
        if (!aiAssistantPortRequest(message)) {
          return 'AI 会话请求格式无效。';
        }
        switch (message.type) {
          case 'read':
            await this.publish();
            break;
          case 'create':
            await this.createConversation(message.requestId);
            break;
          case 'cancel':
            this.activeRun?.controller.abort(
              new DOMException('Cancelled', 'AbortError'),
            );
            break;
          case 'select':
            await this.selectConversation(message.conversationId);
            break;
          case 'rename':
            await this.renameConversation(
              message.conversationId,
              message.title.trim(),
            );
            break;
          case 'delete':
            await this.deleteConversation(message.conversationId);
            break;
          case 'send':
            await this.startRun(
              message.message.trim(),
              message.images ?? [],
              surfaceTabId,
              message.requestId,
            );
            break;
        }
        return undefined;
      } catch (error) {
        return errorMessage(error);
      }
    })();
    this.requestOperations.set(message.requestId, operation);
    if (this.requestOperations.size > 512) {
      const oldest = this.requestOperations.keys().next().value;
      if (oldest) this.requestOperations.delete(oldest);
    }
    return operation;
  }

  async createConversation(requestId: string = crypto.randomUUID()) {
    const state = await this.readState();
    const existing = assistantConversation(state, requestId);
    if (existing) {
      await this.publish();
      return;
    }
    if (this.activeRun) {
      throw new Error('卡牌大师智能体正在处理另一条请求，暂时无法创建会话。');
    }
    const services = await this.services.readView();
    const conversation = createStoredAssistantConversation(
      services.modelService.model,
      Date.now(),
      requestId,
    );
    state.conversations = state.conversations.filter(
      (candidate) => candidate.messages.length > 0,
    );
    state.conversations.push(conversation);
    state.activeConversationId = conversation.id;
    await this.publish();
  }

  async selectConversation(conversationId: string) {
    const state = await this.readState();
    if (this.activeRun) {
      throw new Error('生成进行中，暂时无法切换会话。');
    }
    if (!assistantConversation(state, conversationId)) {
      throw new Error('要切换的会话不存在。');
    }
    state.activeConversationId = conversationId;
    await this.publish(true);
  }

  async renameConversation(conversationId: string, title: string) {
    const state = await this.readState();
    const conversation = assistantConversation(state, conversationId);
    if (!conversation) throw new Error('要重命名的会话不存在。');
    if (!title) throw new Error('会话名称不能为空。');
    conversation.title = title.slice(0, 256);
    conversation.updatedAt = Date.now();
    await this.publish(true);
  }

  async deleteConversation(conversationId: string) {
    const state = await this.readState();
    if (this.activeRun?.conversationId === conversationId) {
      throw new Error('生成进行中，暂时无法删除当前会话。');
    }
    const index = state.conversations.findIndex(
      (conversation) => conversation.id === conversationId,
    );
    if (index < 0) return;
    state.conversations.splice(index, 1);
    if (state.conversations.length === 0) {
      const services = await this.services.readView();
      state.conversations.push(
        createStoredAssistantConversation(services.modelService.model),
      );
    }
    if (state.activeConversationId === conversationId) {
      const next = [...state.conversations].sort(
        (left, right) => right.updatedAt - left.updatedAt,
      )[0];
      if (!next) throw new Error('AI 会话集合不能为空。');
      state.activeConversationId = next.id;
    }
    await this.publish(true);
  }

  async clearConversations() {
    const activeRun = this.activeRun;
    if (activeRun) {
      activeRun.controller.abort();
      await activeRun.completion;
    }
    const services = await this.services.readView();
    const state = await this.readState();
    Object.assign(state, emptyAssistantState(services.modelService.model));
    await this.publish(true);
  }

  private async applyScriptChange(
    change: AssistantScriptChange,
    tabId: number,
  ) {
    const committed = await this.repository.transact(async (scripts) => {
      if (
        change.operation === 'edit' ||
        change.operation === 'set-cover-image'
      ) {
        const target = scripts.find(
          (script) => script.id === change.targetScriptId,
        );
        if (!target) {
          throw new Error(`找不到目标用户脚本：${change.targetScriptId}`);
        }
        const actualRevision = await userscriptSourceRevision(target);
        if (actualRevision !== change.expectedRevision) {
          throw new Error(
            '脚本源码已经发生变化。请重新读取最新脚本后再执行修改。',
          );
        }
      }
      const application = applyAssistantScriptChange(scripts, change);
      return {
        scripts:
          application.mode === 'removed'
            ? scripts.filter((script) => script.id !== application.scriptId)
            : application.scripts,
        result: {
          application,
          previous: [...scripts],
        },
      };
    });
    const { application, previous } = committed.result;
    let activation: UserscriptActivationResult | null = null;
    let activationStatus: 'completed' | 'failed' = 'completed';
    let activationWarning: string | undefined;
    try {
      activation = await this.afterLibraryCommit(
        previous,
        committed.scripts,
        tabId,
      );
    } catch (error) {
      activationStatus = 'failed';
      activationWarning = errorMessage(error);
    }
    const activationEffect = activation
      ? activation.reloadRequested
        ? 'reload-requested'
        : activation.refreshRequired
          ? 'refresh-required'
          : activation.injection.failed > 0 &&
              activation.injection.succeeded > 0
            ? 'partial'
            : activation.injection.failed > 0
              ? 'failed'
              : activation.injection.succeeded > 0
                ? 'succeeded'
                : activation.injection.eligible > 0
                  ? 'not-attempted'
                  : 'none'
      : activationStatus;
    const runtime = {
      status: activationStatus,
      effect: activationEffect,
      injection: activation?.injection ?? {
        eligible: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
      },
      refreshRequired: activation?.refreshRequired ?? false,
      reloadRequested: activation?.reloadRequested ?? false,
      ...(activationWarning ? { warning: activationWarning } : {}),
    };

    if (application.mode === 'removed') {
      return {
        persisted: true,
        mutation: 'removed',
        scriptId: application.scriptId,
        runtime,
      };
    }

    if (change.operation === 'delete') {
      throw new Error('删除操作返回了无效的脚本结果。');
    }
    return {
      persisted: true,
      mutation: assistantScriptMutation(change),
      script: {
        id: application.script.id,
        name: application.script.metadata.name,
        version: application.script.metadata.version,
        enabled: application.script.manager.enabled,
        revision: await userscriptSourceRevision(application.script),
      },
      ...(change.operation === 'set-site-enabled'
        ? {
            site: {
              pattern: change.sitePattern,
              enabled: change.enabled,
            },
          }
        : {}),
      diagnostics: application.diagnostics.map(
        (diagnostic) => diagnostic.message,
      ),
      runtime,
      ...(activation?.executions.at(-1)
        ? { execution: activation.executions.at(-1) }
        : {}),
    };
  }

  private async createUserscript(
    source: string,
    tabId: number,
    origin?: string,
  ) {
    const committed = await this.applyScriptChange(
      {
        operation: 'create',
        source,
        ...(origin ? { origin } : {}),
      },
      tabId,
    );
    if (!('script' in committed)) {
      throw new Error('创建脚本没有返回有效的脚本结果。');
    }
    await requestDeckCreationPreview(
      this.api,
      tabId,
      crypto.randomUUID(),
      committed.script.id,
    );
    return {
      ...committed,
    };
  }

  private async searchGreasyForkScripts(
    input: GreasyForkSearchInput,
    signal: AbortSignal,
  ) {
    return this.greasyFork.search(input, signal);
  }

  private async installGreasyForkScript(
    scriptId: number,
    tabId: number,
    signal: AbortSignal,
  ) {
    const download = await this.greasyFork.download(scriptId, signal);
    const committed = await this.createUserscript(
      download.source,
      tabId,
      download.sourceUrl,
    );
    return {
      ...committed,
      marketplace: {
        provider: 'greasyfork',
        scriptId: download.scriptId,
        name: download.name,
        detailUrl: download.detailUrl,
      },
    };
  }

  private async generateUserscriptCover(
    targetScriptId: string,
    expectedRevision: string,
    visualConcept: string,
    tabId: number,
    signal: AbortSignal,
  ) {
    if (!this.services.generateCardCover) {
      throw new Error('当前宿主没有提供卡牌封面生成服务。');
    }
    const target = await this.repository.get(targetScriptId);
    if (!target) throw new Error(`找不到用户脚本：${targetScriptId}`);
    if ((await userscriptSourceRevision(target)) !== expectedRevision) {
      throw new Error('脚本源码已经发生变化。请重新读取最新脚本后再生成封面。');
    }
    const cover = await this.services.generateCardCover(visualConcept, signal);
    const committed = await this.applyScriptChange(
      {
        operation: 'set-cover-image',
        targetScriptId,
        expectedRevision,
        coverImage: cover.dataUrl,
        coverAccent: cover.accent,
      },
      tabId,
    );
    return {
      ...committed,
      cover: {
        width: cover.width,
        height: cover.height,
        mimeType: cover.mimeType,
      },
    };
  }

  private async readState() {
    return this.stateStore.read();
  }

  private async persist() {
    await this.stateStore.persist();
  }

  private async publish(persist = false) {
    if (persist && this.publishTimer) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }
    if (persist) await this.persist();
    const state = await this.readState();
    const event: AiAssistantPortEvent = {
      type: 'snapshot',
      snapshot: assistantSnapshot(state),
    };
    this.broadcast(event);
  }

  private async publishActiveMessage() {
    const state = await this.readState();
    const conversation = activeAssistantConversation(state);
    const message = conversation.messages.at(-1);
    if (!message) {
      await this.publish();
      return;
    }
    this.broadcast({
      type: 'message',
      activeConversationId: conversation.id,
      message: structuredClone(message),
      running: state.runningConversationId === conversation.id,
    });
  }

  private broadcast(event: AiAssistantPortEvent) {
    for (const port of this.ports) {
      try {
        port.postMessage(event);
      } catch {
        this.forgetPort(port);
      }
    }
  }

  private schedulePublish() {
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      void this.publishActiveMessage().catch(() => undefined);
    }, 50);
  }

  private async startRun(
    message: string,
    images: readonly AiImageAttachment[],
    surfaceTabId: number,
    requestId: string,
  ) {
    const state = await this.readState();
    const existing = state.conversations.some((conversation) =>
      conversation.messages.some((item) => item.id === requestId),
    );
    if (existing) {
      await this.publish();
      return;
    }
    if (this.activeRun || state.runningConversationId) {
      throw new Error('卡牌大师智能体正在处理另一条请求，请稍后再试。');
    }
    const conversation = activeAssistantConversation(state);
    const controller = new AbortController();
    let completeRun: () => void = () => undefined;
    const completion = new Promise<void>((resolve) => {
      completeRun = resolve;
    });
    const previousTitle = conversation.title;
    const previousUpdatedAt = conversation.updatedAt;
    this.activeRun = {
      conversationId: conversation.id,
      controller,
      completion,
    };
    state.runningConversationId = conversation.id;
    titleAssistantConversation(conversation, message);
    conversation.messages.push({
      id: requestId,
      role: 'user',
      segments: [
        {
          id: crypto.randomUUID(),
          type: 'text',
          content: message,
        },
        ...images.map(
          (attachment) =>
            ({
              id: crypto.randomUUID(),
              type: 'image',
              attachment: structuredClone(attachment),
            }) satisfies AiConversationSegment,
        ),
      ],
      createdAt: Date.now(),
      status: 'complete',
    });
    const assistantMessage: AiConversationMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      segments: [],
      createdAt: Date.now(),
      status: 'streaming',
    };
    conversation.messages.push(assistantMessage);
    conversation.updatedAt = Date.now();

    try {
      await this.publish(true);
    } catch (error) {
      conversation.messages = conversation.messages.filter(
        (item) => item.id !== requestId && item.id !== assistantMessage.id,
      );
      conversation.title = previousTitle;
      conversation.updatedAt = previousUpdatedAt;
      state.runningConversationId = null;
      if (this.activeRun?.controller === controller) this.activeRun = null;
      completeRun();
      throw error;
    }

    void this.continueRun(
      state,
      conversation,
      assistantMessage,
      requestId,
      message,
      images,
      surfaceTabId,
      controller,
    ).finally(completeRun);
  }

  private async continueRun(
    state: StoredAssistantState,
    conversation: StoredAssistantConversation,
    assistantMessage: AiConversationMessage,
    userMessageId: string,
    message: string,
    images: readonly AiImageAttachment[],
    surfaceTabId: number,
    controller: AbortController,
  ) {
    const runDiagnosticId = crypto.randomUUID();
    let phase = 'initializing';
    let round = 0;
    let model = assistantMessage.model ?? '';
    let pendingToolCount = 0;
    try {
      phase = 'reading-page-context';
      const initialTargetTabId = this.surfaceTargets.has(surfaceTabId)
        ? (this.surfaceTargets.get(surfaceTabId) ?? null)
        : surfaceTabId;
      const tabSession = new ExtensionAssistantTabSession(
        this.api,
        initialTargetTabId,
        this.resolvePageAttachment,
        (tabId) => this.setSurfaceTarget(surfaceTabId, tabId),
      );
      this.activeTabSessions.set(surfaceTabId, tabSession);
      const modelUserContent = pageContextText(
        await tabSession.initialContext(),
        message,
      );
      rememberAssistantTurnContext(
        conversation,
        userMessageId,
        modelUserContent,
      );
      conversation.input.push({
        role: 'user',
        content: modelUserContent,
        ...(images.length > 0
          ? {
              images: images.flatMap((image) =>
                image.dataUrl
                  ? [{ mimeType: image.mimeType, dataUrl: image.dataUrl }]
                  : [],
              ),
            }
          : {}),
      });
      phase = 'opening-model-session';
      const modelSession = await this.services.openModelSession();
      const servicesView = modelSession.view;
      const modelService = servicesView.modelService;
      model = modelService.model;
      const cardCoverAvailable = servicesView.imageService.hasCredential;
      conversation.model = modelService.model;
      assistantMessage.model = modelService.model;
      const client = modelSession.client;
      const instructions = buildAssistantInstructions(
        await this.repository.list(),
        { cardCoverAvailable },
      );
      await this.publish();
      while (true) {
        round += 1;
        phase = 'streaming-model-response';
        pendingToolCount = 0;
        const roundStartIndex = assistantMessage.segments.length;
        const textLength = conversationSegmentContentLength(
          assistantMessage,
          'text',
        );
        const reasoningLength = conversationSegmentContentLength(
          assistantMessage,
          'reasoning',
        );
        const completed = await client.stream(
          {
            model: modelService.model,
            instructions,
            reasoningEffort: modelService.reasoningEffort,
            messages: conversation.input,
            tools: assistantTools(),
          },
          {
            onTextDelta: (delta) => {
              appendConversationSegment(assistantMessage, 'text', delta);
              this.schedulePublish();
            },
            onReasoningDelta: (delta) => {
              appendConversationSegment(assistantMessage, 'reasoning', delta);
              this.schedulePublish();
            },
            onReasoningBoundary: () => {
              appendConversationSegmentBoundary(assistantMessage, 'reasoning');
              this.schedulePublish();
            },
            onToolCall: (toolCall) => {
              upsertConversationToolSegment(assistantMessage, toolCall);
              this.schedulePublish();
            },
          },
          controller.signal,
        );
        assistantMessage.model = completed.model;
        assistantMessage.usage = completed.usage;
        pendingToolCount = completed.toolCalls.length;
        if (
          conversationSegmentContentLength(assistantMessage, 'text') ===
            textLength &&
          completed.text
        ) {
          const segment = appendConversationSegment(
            assistantMessage,
            'text',
            completed.text,
          );
          if (segment) {
            this.schedulePublish();
          }
        }
        if (
          conversationSegmentContentLength(assistantMessage, 'reasoning') ===
            reasoningLength &&
          completed.reasoning
        ) {
          appendConversationSegment(
            assistantMessage,
            'reasoning',
            completed.reasoning,
          );
        }
        if (completed.toolCalls.length === 0) {
          phase = 'persisting-final-response';
          const finalSegment = assistantMessage.segments
            .slice(roundStartIndex)
            .find((segment) => segment.type === 'text');
          if (finalSegment?.type === 'text') {
            assistantMessage.finalSegmentId = finalSegment.id;
          }
          assistantMessage.status = 'complete';
          state.runningConversationId = null;
          conversation.updatedAt = Date.now();
          compactAssistantInput(conversation);
          await this.publish(true);
          return;
        }
        phase = 'executing-tools';
        const toolResults = await this.executeTools(
          assistantMessage,
          completed.toolCalls,
          tabSession,
          surfaceTabId,
          controller.signal,
          { runDiagnosticId, round },
        );
        phase = 'preparing-tool-continuation';
        conversation.input.push(
          ...toolContinuationMessages(completed, toolResults),
        );
        await this.publish(true);
      }
    } catch (error) {
      const aborted = controller.signal.aborted;
      assistantMessage.status = aborted ? 'complete' : 'error';
      if (aborted) {
        assistantMessage.error = undefined;
      } else {
        assistantMessage.error = assistantUserFacingError(error);
        extensionDiagnostics.error('assistant-service', 'run-failed', error, {
          runDiagnosticId,
          conversationId: conversation.id,
          assistantMessageId: assistantMessage.id,
          userMessageId,
          surfaceTabId,
          model,
          round,
          phase,
          pendingToolCount,
          textLength: conversationSegmentContentLength(
            assistantMessage,
            'text',
          ),
          reasoningLength: conversationSegmentContentLength(
            assistantMessage,
            'reasoning',
          ),
        });
      }
      if (aborted && !assistantMessage.finalSegmentId) {
        const segment: Extract<AiConversationSegment, { type: 'text' }> = {
          id: crypto.randomUUID(),
          type: 'text',
          content: '本次生成已取消。',
        };
        assistantMessage.segments.push(segment);
        assistantMessage.finalSegmentId = segment.id;
      }
      state.runningConversationId = null;
      conversation.updatedAt = Date.now();
      compactAssistantInput(conversation);
      try {
        await this.publish(true);
      } catch (persistError) {
        assistantMessage.status = 'error';
        assistantMessage.error = `${assistantMessage.error ? `${assistantMessage.error} ` : ''}会话持久化失败：${errorMessage(persistError)}`;
        await this.publish().catch(() => undefined);
      }
    } finally {
      state.runningConversationId = null;
      const activeTabSession = this.activeTabSessions.get(surfaceTabId);
      if (activeTabSession) this.activeTabSessions.delete(surfaceTabId);
      if (this.activeRun?.controller === controller) this.activeRun = null;
    }
  }

  private async executeTools(
    message: AiConversationMessage,
    items: AiModelToolCall[],
    tabSession: ExtensionAssistantTabSession,
    surfaceTabId: number,
    signal: AbortSignal,
    diagnostic: { runDiagnosticId: string; round: number },
  ): Promise<Array<Extract<AiModelMessage, { role: 'tool' }>>> {
    const outputs: Array<Extract<AiModelMessage, { role: 'tool' }>> = [];
    for (const item of items) {
      const rawArguments = item.arguments || '{}';
      const toolCall = upsertConversationToolSegment(message, item);
      toolCall.name = item.name;
      toolCall.arguments = rawArguments;
      startConversationToolCall(toolCall);
      await this.publish();
      const operation = executeAssistantTool(
        { ...toolCall, arguments: rawArguments },
        {
          repository: this.repository,
          page: tabSession,
          tabs: {
            listTabs: () => tabSession.listTabs(),
            selectTab: async (tabId) => {
              const result = await tabSession.selectTab(tabId);
              await this.publishSurfaceTarget(surfaceTabId);
              return result;
            },
            activateTab: async (tabId) => {
              const result = await tabSession.activateTab(tabId);
              await this.publishSurfaceTarget(surfaceTabId);
              return result;
            },
            closeTab: async (tabId) => {
              const result = await tabSession.closeTab(tabId);
              await this.publishSurfaceTarget(surfaceTabId);
              return result;
            },
          },
          readRuntimeStates: () =>
            this.toolPlatform.readRuntimeStates(
              tabSession.requireSelectedTabId(),
            ),
          readRuntimeState: (scriptId) =>
            this.toolPlatform.readRuntimeState(
              tabSession.requireSelectedTabId(),
              scriptId,
            ),
          invokeRuntimeCommand: (scriptId, commandId) =>
            this.toolPlatform.invokeRuntimeCommand(
              tabSession.requireSelectedTabId(),
              scriptId,
              commandId,
            ),
          readPageUrl: () =>
            this.toolPlatform.readPageUrl(tabSession.requireSelectedTabId()),
          setDeckVisibility: (visibility) =>
            this.toolPlatform.setDeckVisibility(
              tabSession.requireSelectedTabId(),
              visibility,
            ),
          applyScriptChange: (change) =>
            this.applyScriptChange(change, tabSession.requireSelectedTabId()),
          createUserscript: (source) =>
            this.createUserscript(source, tabSession.requireSelectedTabId()),
          searchGreasyForkScripts: (input) =>
            this.searchGreasyForkScripts(input, signal),
          installGreasyForkScript: (scriptId) =>
            this.installGreasyForkScript(
              scriptId,
              tabSession.requireSelectedTabId(),
              signal,
            ),
          generateUserscriptCover: (
            targetScriptId,
            expectedRevision,
            visualConcept,
          ) =>
            this.generateUserscriptCover(
              targetScriptId,
              expectedRevision,
              visualConcept,
              tabSession.requireSelectedTabId(),
              signal,
            ),
        },
      );
      try {
        const execution = await operation;
        toolCall.status = 'completed';
        toolCall.result = execution.output;
        outputs.push({
          role: 'tool',
          toolCallId: item.id,
          content: execution.output,
        });
      } catch (error) {
        const output = assistantToolError(error);
        toolCall.status = 'error';
        toolCall.result = output;
        if (!signal.aborted) {
          extensionDiagnostics.warn(
            'assistant-tool',
            'execution-failed',
            error,
            {
              ...diagnostic,
              surfaceTabId,
              toolCallId: item.id,
              toolName: item.name,
              argumentLength: rawArguments.length,
            },
          );
        }
        if (!signal.aborted) {
          outputs.push({
            role: 'tool',
            toolCallId: item.id,
            content: output,
          });
        }
        completeConversationToolCall(toolCall);
        await this.publish(true);
        if (signal.aborted) {
          throw error;
        }
        continue;
      }
      completeConversationToolCall(toolCall);
      await this.publish(true);
    }
    return outputs;
  }
}
