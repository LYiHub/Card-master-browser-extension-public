import type {
  AiAssistantController,
  AiConversationListener,
  AiConversationSnapshot,
  AiImageAttachment,
  AiSpeechRecognitionListener,
  AssistantTabTargetListener,
  AssistantTabTargetState,
} from '../../ai/domain/types';
import {
  connectExtensionPort,
  type ExtensionApi,
  type ExtensionPort,
  sendExtensionRequest,
} from './api';
import {
  type AiAssistantPortEvent,
  type AiAssistantPortRequest,
  type AiAssistantPortRequestPayload,
  assistantPortName,
} from './assistant-protocol';
import { ExtensionSpeechRecognitionController } from './extension-speech-recognition';
import { EXTENSION_CHANNEL } from './protocol';
import type { VolcengineSpeechAuthorization } from './volcengine-speech-session';

function isAssistantEvent(value: unknown): value is AiAssistantPortEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.type === 'received') {
    return typeof record.requestId === 'string';
  }
  if (record.type === 'target') {
    const target =
      record.target &&
      typeof record.target === 'object' &&
      !Array.isArray(record.target)
        ? (record.target as Record<string, unknown>)
        : null;
    return Boolean(
      target &&
        (target.tabId === null || typeof target.tabId === 'number') &&
        (target.windowId === undefined ||
          typeof target.windowId === 'number') &&
        typeof target.title === 'string' &&
        typeof target.url === 'string' &&
        typeof target.active === 'boolean' &&
        typeof target.available === 'boolean' &&
        (target.message === undefined || typeof target.message === 'string'),
    );
  }
  if (record.type === 'ack') {
    return (
      typeof record.requestId === 'string' &&
      (record.error === undefined || typeof record.error === 'string')
    );
  }
  if (record.type === 'message') {
    const message =
      record.message &&
      typeof record.message === 'object' &&
      !Array.isArray(record.message)
        ? (record.message as Record<string, unknown>)
        : null;
    const validSegments =
      message &&
      Array.isArray(message.segments) &&
      message.segments.every((segment) => {
        if (!segment || typeof segment !== 'object' || Array.isArray(segment)) {
          return false;
        }
        const item = segment as Record<string, unknown>;
        if (typeof item.id !== 'string') return false;
        if (item.type === 'text' || item.type === 'reasoning') {
          return typeof item.content === 'string';
        }
        if (item.type === 'image') {
          const attachment =
            item.attachment &&
            typeof item.attachment === 'object' &&
            !Array.isArray(item.attachment)
              ? (item.attachment as Record<string, unknown>)
              : null;
          return Boolean(
            attachment &&
              typeof attachment.id === 'string' &&
              typeof attachment.name === 'string' &&
              typeof attachment.mimeType === 'string' &&
              typeof attachment.size === 'number' &&
              typeof attachment.available === 'boolean' &&
              (attachment.dataUrl === undefined ||
                typeof attachment.dataUrl === 'string'),
          );
        }
        if (item.type !== 'tool') return false;
        const call =
          item.call &&
          typeof item.call === 'object' &&
          !Array.isArray(item.call)
            ? (item.call as Record<string, unknown>)
            : null;
        return Boolean(
          call &&
            typeof call.id === 'string' &&
            typeof call.name === 'string' &&
            typeof call.arguments === 'string' &&
            (call.startedAt === undefined ||
              typeof call.startedAt === 'number') &&
            (call.completedAt === undefined ||
              typeof call.completedAt === 'number') &&
            (call.durationMs === undefined ||
              typeof call.durationMs === 'number') &&
            (call.status === 'pending' ||
              call.status === 'running' ||
              call.status === 'completed' ||
              call.status === 'error'),
        );
      });
    return Boolean(
      typeof record.activeConversationId === 'string' &&
        typeof record.running === 'boolean' &&
        message &&
        typeof message.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        (message.finalSegmentId === undefined ||
          typeof message.finalSegmentId === 'string') &&
        validSegments,
    );
  }
  const snapshot =
    record.snapshot &&
    typeof record.snapshot === 'object' &&
    !Array.isArray(record.snapshot)
      ? (record.snapshot as Record<string, unknown>)
      : null;
  return (
    record.type === 'snapshot' &&
    Boolean(
      snapshot &&
        typeof snapshot.activeConversationId === 'string' &&
        Array.isArray(snapshot.conversations) &&
        Array.isArray(snapshot.messages) &&
        typeof snapshot.running === 'boolean',
    )
  );
}

export const ASSISTANT_HEARTBEAT_INTERVAL_MS = 15_000;

export class ExtensionAssistantController implements AiAssistantController {
  private readonly listeners = new Set<AiConversationListener>();
  private readonly targetListeners = new Set<AssistantTabTargetListener>();
  private readonly speech: ExtensionSpeechRecognitionController;
  private port: ExtensionPort | null = null;
  private snapshot: AiConversationSnapshot = {
    activeConversationId: '',
    conversations: [],
    messages: [],
    running: false,
  };
  private firstSnapshot: Promise<AiConversationSnapshot> | null = null;
  private resolveFirstSnapshot:
    | ((snapshot: AiConversationSnapshot) => void)
    | null = null;
  private readonly pendingRequests = new Map<
    string,
    {
      message: AiAssistantPortRequest;
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout> | null;
      attempts: number;
      received: boolean;
    }
  >();
  private disposed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private target: AssistantTabTargetState;

  constructor(
    private readonly api: ExtensionApi,
    private readonly tabId: number,
    initialTarget?: AssistantTabTargetState,
  ) {
    this.target =
      initialTarget ??
      ({
        tabId,
        title: '',
        url: '',
        active: false,
        available: true,
      } satisfies AssistantTabTargetState);
    this.speech = new ExtensionSpeechRecognitionController({
      open: () => this.openSpeechAuthorization(),
      close: (sessionId) => this.closeSpeechAuthorization(sessionId),
    });
  }

  async readConversation() {
    await this.post({ type: 'read' });
    const firstSnapshot = this.firstSnapshot;
    if (!firstSnapshot) return this.snapshot;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        firstSnapshot,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('AI 会话后台未在限定时间内返回状态。')),
            10_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  subscribe(listener: AiConversationListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    try {
      this.connect();
    } catch {
      this.schedulePendingRetry();
    }
    return () => this.listeners.delete(listener);
  }

  subscribeTarget(listener: AssistantTabTargetListener) {
    this.targetListeners.add(listener);
    listener(this.target);
    try {
      this.connect();
    } catch {
      this.schedulePendingRetry();
    }
    return () => this.targetListeners.delete(listener);
  }

  async createConversation() {
    await this.post({ type: 'create' });
  }

  async selectConversation(conversationId: string) {
    await this.post({ type: 'select', conversationId });
  }

  async renameConversation(conversationId: string, title: string) {
    await this.post({ type: 'rename', conversationId, title });
  }

  async deleteConversation(conversationId: string) {
    await this.post({ type: 'delete', conversationId });
  }

  async sendMessage(
    message: string,
    images: readonly AiImageAttachment[] = [],
  ) {
    await this.post({
      type: 'send',
      message,
      ...(images.length > 0 ? { images } : {}),
    });
  }

  async cancelConversation() {
    await this.post({ type: 'cancel' });
  }

  subscribeSpeech(listener: AiSpeechRecognitionListener) {
    return this.speech.subscribeSpeech(listener);
  }

  async startSpeechRecognition() {
    await this.speech.startSpeechRecognition();
  }

  async sendSpeechAudio(pcmBase64: string) {
    await this.speech.sendSpeechAudio(pcmBase64);
  }

  async stopSpeechRecognition() {
    await this.speech.stopSpeechRecognition();
  }

  async cancelSpeechRecognition() {
    await this.speech.cancelSpeechRecognition();
  }

  dispose() {
    this.disposed = true;
    this.speech.dispose();
    try {
      this.port?.disconnect();
    } catch {
      // A reloaded extension has already destroyed the stale port.
    }
    this.port = null;
    this.listeners.clear();
    this.targetListeners.clear();
    this.firstSnapshot = null;
    this.resolveFirstSnapshot = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    for (const pending of this.pendingRequests.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error('AI 会话控制器已释放。'));
    }
    this.pendingRequests.clear();
  }

  private connect() {
    if (this.disposed) throw new Error('AI 会话控制器已释放。');
    if (this.port) return this.port;
    this.resetFirstSnapshot();
    let port: ExtensionPort;
    try {
      port = connectExtensionPort(this.api, assistantPortName(this.tabId));
    } catch (error) {
      this.resolveFirstSnapshot?.(this.snapshot);
      this.resolveFirstSnapshot = null;
      throw error;
    }
    this.port = port;
    port.onMessage.addListener((message) => {
      if (!isAssistantEvent(message)) return;
      this.reconnectAttempts = 0;
      if (message.type === 'received') {
        const pending = this.pendingRequests.get(message.requestId);
        if (!pending) return;
        if (pending.timer) clearTimeout(pending.timer);
        pending.timer = null;
        pending.received = true;
        return;
      }
      if (message.type === 'target') {
        this.target = message.target;
        for (const listener of this.targetListeners) listener(this.target);
        return;
      }
      if (message.type === 'ack') {
        const pending = this.pendingRequests.get(message.requestId);
        if (!pending) return;
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingRequests.delete(message.requestId);
        message.error
          ? pending.reject(new Error(message.error))
          : pending.resolve();
        return;
      }
      if (message.type === 'message') {
        if (
          message.activeConversationId !== this.snapshot.activeConversationId
        ) {
          return;
        }
        const index = this.snapshot.messages.findIndex(
          (item) => item.id === message.message.id,
        );
        this.snapshot = {
          ...this.snapshot,
          messages:
            index < 0
              ? [...this.snapshot.messages, message.message]
              : this.snapshot.messages.map((item, itemIndex) =>
                  itemIndex === index ? message.message : item,
                ),
          running: message.running,
        };
      } else {
        this.snapshot = message.snapshot;
      }
      this.syncHeartbeat();
      this.resolveFirstSnapshot?.(this.snapshot);
      this.resolveFirstSnapshot = null;
      for (const listener of this.listeners) listener(this.snapshot);
    });
    port.onDisconnect.addListener(() => {
      void this.api.runtime?.lastError;
      if (this.port !== port) return;
      this.port = null;
      this.stopHeartbeat();
      this.resolveFirstSnapshot?.(this.snapshot);
      this.resolveFirstSnapshot = null;
      if (this.disposed) return;
      for (const pending of this.pendingRequests.values()) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.timer = null;
        pending.received = false;
      }
      this.interruptRunningSnapshot(
        'AI 请求因扩展后台重新加载或连接中断而停止。',
      );
      this.schedulePendingRetry(this.pendingRequests.size > 0 ? 0 : undefined);
    });
    return port;
  }

  private syncHeartbeat() {
    if (!this.snapshot.running || !this.port || this.disposed) {
      this.stopHeartbeat();
      return;
    }
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      try {
        this.port?.postMessage({
          type: 'heartbeat',
          requestId: crypto.randomUUID(),
        } satisfies AiAssistantPortRequest);
      } catch {
        this.stopHeartbeat();
      }
    }, ASSISTANT_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private post(message: AiAssistantPortRequestPayload) {
    const requestId = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      const request: AiAssistantPortRequest = { ...message, requestId };
      this.pendingRequests.set(requestId, {
        message: request,
        resolve,
        reject,
        timer: null,
        attempts: 0,
        received: false,
      });
      this.sendPendingRequest(requestId);
    });
  }

  private async openSpeechAuthorization() {
    const response = await sendExtensionRequest<{
      authorization?: VolcengineSpeechAuthorization;
      error?: string;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'ai-speech-authorization-open',
    });
    if (response.error) throw new Error(response.error);
    if (!response.authorization) {
      throw new Error('扩展未能建立语音识别鉴权会话。');
    }
    return response.authorization;
  }

  private async closeSpeechAuthorization(sessionId: string) {
    const response = await sendExtensionRequest<{
      ok?: boolean;
      error?: string;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'ai-speech-authorization-close',
      sessionId,
    });
    if (response.error) throw new Error(response.error);
  }

  private sendPendingRequest(requestId: string) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending || this.disposed || pending.timer || pending.received) {
      return;
    }
    pending.attempts += 1;
    let port: ExtensionPort;
    try {
      port = this.connect();
      port.postMessage(pending.message);
    } catch {
      this.port = null;
      if (pending.attempts >= 3) {
        this.pendingRequests.delete(requestId);
        pending.reject(new Error('AI 会话请求无法发送到扩展后台。'));
        return;
      }
      this.schedulePendingRetry(150 * pending.attempts);
      return;
    }
    pending.timer = setTimeout(() => {
      pending.timer = null;
      if (!this.pendingRequests.has(requestId)) return;
      if (pending.attempts >= 3) {
        this.pendingRequests.delete(requestId);
        pending.reject(new Error('AI 会话后台未确认请求。'));
        return;
      }
      try {
        port.disconnect();
      } catch {
        // The stale port is already closed.
      }
      if (this.port === port) this.port = null;
      this.schedulePendingRetry();
    }, 2_000);
  }

  private schedulePendingRetry(delay?: number) {
    const hasConsumers =
      this.listeners.size > 0 ||
      this.targetListeners.size > 0 ||
      this.pendingRequests.size > 0;
    if (this.disposed || !hasConsumers || this.reconnectTimer) {
      return;
    }
    const retryDelay =
      delay ?? Math.min(2_000, 150 * 2 ** Math.min(this.reconnectAttempts, 4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts += 1;
      if (this.pendingRequests.size === 0) {
        try {
          this.connect();
        } catch {
          this.schedulePendingRetry();
        }
        return;
      }
      for (const requestId of this.pendingRequests.keys()) {
        this.sendPendingRequest(requestId);
      }
    }, retryDelay);
  }

  private interruptRunningSnapshot(reason: string) {
    if (!this.snapshot.running) return;
    let interruptedIndex = -1;
    for (
      let index = this.snapshot.messages.length - 1;
      index >= 0;
      index -= 1
    ) {
      const message = this.snapshot.messages[index];
      if (message?.role === 'assistant' && message.status === 'streaming') {
        interruptedIndex = index;
        break;
      }
    }
    const messages = this.snapshot.messages.map((message, index) =>
      index === interruptedIndex
        ? {
            ...message,
            status: 'error' as const,
            error: reason,
          }
        : message,
    );
    this.snapshot = {
      ...this.snapshot,
      messages,
      running: false,
    };
    this.stopHeartbeat();
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private resetFirstSnapshot() {
    this.firstSnapshot = new Promise((resolve) => {
      this.resolveFirstSnapshot = resolve;
    });
  }
}
