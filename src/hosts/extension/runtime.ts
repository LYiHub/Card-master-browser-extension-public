import type {
  UserscriptRuntime,
  UserscriptRuntimeListener,
} from '../../userscript/application/runtime';
import { matchInstalledUserscript } from '../../userscript/domain/matcher';
import type {
  InstalledUserscript,
  ScriptMatchContext,
  UserscriptRuntimeState,
} from '../../userscript/domain/types';
import { runtimeCompatibilityDiagnostics } from '../../userscript/runtime/compatibility';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import {
  EXTENSION_CHANNEL,
  type ExtensionPageContext,
  extensionRuntimeEvent,
} from './protocol';

type RuntimeStateResponse = {
  state?: UserscriptRuntimeState;
  error?: string;
};

type RuntimeInvocationResponse = {
  ok?: boolean;
  value?: unknown;
  error?: string;
  code?:
    | 'instance-not-running'
    | 'command-not-registered'
    | 'invocation-failed';
};

export class ExtensionUserscriptRuntime implements UserscriptRuntime {
  private readonly listeners = new Set<UserscriptRuntimeListener>();
  private readonly states = new Map<string, UserscriptRuntimeState>();
  private readonly generations = new Map<string, number>();
  private readonly documentEligibleGrantNone = new Set<string>();
  private pageContext: ExtensionPageContext = { tabId: 0, frameId: 0 };
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (!extensionRuntimeEvent(message)) return;
    const current = this.states.get(message.scriptId);
    if (
      !current ||
      current.status === 'sleeping' ||
      current.status === 'not-matched'
    ) {
      return;
    }
    this.generations.set(
      message.scriptId,
      (this.generations.get(message.scriptId) ?? 0) + 1,
    );
    this.setState(message.scriptId, message.state);
  };
  private readonly messageSubscription: ExtensionMessageSubscription;

  constructor(private readonly api: ExtensionApi) {
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
    void sendExtensionRequest<ExtensionPageContext>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'get-page-context',
    })
      .then((context) => {
        if (
          typeof context.tabId !== 'number' ||
          typeof context.frameId !== 'number'
        ) {
          return;
        }
        this.pageContext = context;
        for (const [scriptId, state] of this.states) {
          this.setState(scriptId, {
            ...state,
            tabId: context.tabId,
            frameId: context.frameId,
          });
        }
      })
      .catch(() => undefined);
  }

  subscribe(listener: UserscriptRuntimeListener) {
    this.startListening();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  synchronizeState(script: InstalledUserscript, context: ScriptMatchContext) {
    const generation = (this.generations.get(script.id) ?? 0) + 1;
    this.generations.set(script.id, generation);
    const runtimeIdentity = {
      tabId: this.pageContext.tabId,
      frameId: this.pageContext.frameId || context.frameId,
    };
    const previous = this.states.get(script.id);
    if (!script.manager.enabled) {
      return this.setState(script.id, {
        ...runtimeIdentity,
        instanceId: null,
        status: 'sleeping',
        commands: [],
        pendingRefresh: Boolean(
          previous?.instanceId ||
            previous?.status === 'running' ||
            previous?.status === 'ready',
        ),
      });
    }
    if (!matchInstalledUserscript(script, context).eligible) {
      return this.setState(script.id, {
        ...runtimeIdentity,
        instanceId: null,
        status: 'not-matched',
        commands: [],
        pendingRefresh: false,
      });
    }
    const compatibility = runtimeCompatibilityDiagnostics(script).filter(
      (diagnostic) => diagnostic.severity === 'error',
    );
    if (compatibility.length > 0) {
      return this.setState(script.id, {
        ...runtimeIdentity,
        instanceId: null,
        status: 'error',
        commands: [],
        error: compatibility.map((item) => item.message).join(' '),
        pendingRefresh: false,
      });
    }

    const grantNone = script.metadata.grants.includes('none');
    if (!context.softNavigation && grantNone) {
      this.documentEligibleGrantNone.add(script.id);
    }
    const shouldRequireRefresh =
      previous?.status === 'sleeping' ||
      (Boolean(context.softNavigation) &&
        !this.documentEligibleGrantNone.has(script.id));
    const provisional = this.setState(script.id, {
      ...runtimeIdentity,
      instanceId: null,
      status: 'running',
      commands: [],
      pendingRefresh: shouldRequireRefresh,
    });
    this.readRuntimeState(
      script.id,
      generation,
      provisional,
      shouldRequireRefresh,
    );
    return provisional;
  }

  stop(scriptId: string) {
    this.generations.set(scriptId, (this.generations.get(scriptId) ?? 0) + 1);
    this.states.delete(scriptId);
  }

  dispose() {
    this.messageSubscription.stop();
    this.listeners.clear();
    this.states.clear();
    this.generations.clear();
    this.documentEligibleGrantNone.clear();
  }

  async invoke(scriptId: string, commandId: string) {
    const response = await sendExtensionRequest<RuntimeInvocationResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'invoke-command',
        scriptId,
        commandId,
      },
    );
    if (!response.error) return response.value;
    const current = this.states.get(scriptId);
    if (current && response.code === 'instance-not-running') {
      this.setState(scriptId, {
        ...current,
        instanceId: null,
        status: 'idle',
        commands: [],
        error: undefined,
        pendingRefresh: true,
      });
      throw new Error('当前脚本实例未运行，请刷新页面后重试。');
    }
    if (current && response.code === 'command-not-registered') {
      this.setState(scriptId, {
        ...current,
        commands: current.commands.filter(
          (command) => command.id !== commandId,
        ),
      });
      throw new Error('该脚本指令已失效，牌阵状态已经刷新。');
    }
    throw new Error(response.error);
  }

  private startListening() {
    this.messageSubscription.start();
  }

  private readRuntimeState(
    scriptId: string,
    generation: number,
    provisional: UserscriptRuntimeState,
    shouldRequireRefresh: boolean,
  ) {
    void sendExtensionRequest<RuntimeStateResponse>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'get-runtime-state',
      scriptId,
    })
      .then((response) => {
        if (this.generations.get(scriptId) !== generation) return;
        if (response.state) {
          this.setState(scriptId, response.state);
          return;
        }
        if (response.error) {
          this.setState(scriptId, {
            ...provisional,
            status: 'error',
            error: response.error,
          });
          return;
        }
        if (shouldRequireRefresh) {
          this.setState(scriptId, {
            ...provisional,
            status: 'idle',
            pendingRefresh: true,
          });
          return;
        }
        this.setState(scriptId, {
          ...provisional,
          status: 'idle',
          pendingRefresh: false,
        });
      })
      .catch((error) => {
        if (this.generations.get(scriptId) !== generation) return;
        this.setState(scriptId, {
          ...provisional,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  private setState(scriptId: string, state: UserscriptRuntimeState) {
    this.states.set(scriptId, state);
    for (const listener of this.listeners) listener(scriptId, state);
    return state;
  }
}
