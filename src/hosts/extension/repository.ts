import type {
  ScriptRepository,
  ScriptRepositoryListener,
  ScriptRepositoryQuery,
  StoredScript,
} from '../../userscript/application/script-repository';
import {
  hydrateScript,
  queryInstalledUserscripts,
  storedScript,
} from '../../userscript/application/script-repository';
import type { InstalledUserscript } from '../../userscript/domain/types';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  ExtensionMessageSubscription,
  sendExtensionRequest,
} from './api';
import { EXTENSION_CHANNEL, extensionLibraryEvent } from './protocol';

type LibraryResponse = {
  scripts?: StoredScript[];
  error?: string;
};

type LibraryMutationResponse = LibraryResponse & {
  orderedIds?: string[];
};

function hydrateResponse(response: LibraryResponse) {
  if (response.error) throw new Error(response.error);
  if (!Array.isArray(response.scripts)) {
    throw new Error('扩展返回了无效的用户脚本仓库。');
  }
  return response.scripts.map(hydrateScript);
}

function hydrateMutationResponse(response: LibraryMutationResponse) {
  if (response.error) throw new Error(response.error);
  if (
    !Array.isArray(response.orderedIds) ||
    !response.orderedIds.every((id) => typeof id === 'string') ||
    !Array.isArray(response.scripts)
  ) {
    throw new Error('扩展返回了无效的用户脚本变更结果。');
  }
  return {
    orderedIds: response.orderedIds,
    scripts: response.scripts.map(hydrateScript),
  };
}

export class ExtensionScriptRepository implements ScriptRepository {
  private readonly listeners = new Set<ScriptRepositoryListener>();
  private readonly cache = new Map<string, InstalledUserscript>();
  private orderedIds: string[] = [];
  private initialized = false;
  private readonly handleMessage: ExtensionMessageListener = (message) => {
    if (!extensionLibraryEvent(message)) return;
    for (const script of message.scripts.map(hydrateScript)) {
      this.cache.set(script.id, script);
    }
    const activeIds = new Set(message.orderedIds);
    for (const scriptId of this.cache.keys()) {
      if (!activeIds.has(scriptId)) this.cache.delete(scriptId);
    }
    this.orderedIds = [...message.orderedIds];
    if (!this.initialized) return;
    this.publish(message.orderedIds);
  };
  private readonly messageSubscription: ExtensionMessageSubscription;

  constructor(private readonly api: ExtensionApi) {
    this.messageSubscription = new ExtensionMessageSubscription(
      api,
      this.handleMessage,
    );
  }

  async list() {
    const scripts = hydrateResponse(
      await sendExtensionRequest<LibraryResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'library-list',
      }),
    );
    this.replaceCache(scripts);
    return scripts;
  }

  async get(scriptId: string) {
    await this.ensureInitialized();
    const script = this.cache.get(scriptId);
    return script ? structuredClone(script) : null;
  }

  async query(options: ScriptRepositoryQuery) {
    await this.ensureInitialized();
    return queryInstalledUserscripts(this.orderedScripts(), options);
  }

  async upsert(script: InstalledUserscript) {
    await this.ensureInitialized();
    return this.applyMutation(
      hydrateMutationResponse(
        await sendExtensionRequest<LibraryMutationResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'library-upsert',
          script: storedScript(script),
        }),
      ),
    );
  }

  async remove(scriptId: string) {
    await this.ensureInitialized();
    return this.applyMutation(
      hydrateMutationResponse(
        await sendExtensionRequest<LibraryMutationResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'library-remove',
          scriptId,
        }),
      ),
    );
  }

  async reorder(orderedIds: readonly string[]) {
    await this.ensureInitialized();
    return this.applyMutation(
      hydrateMutationResponse(
        await sendExtensionRequest<LibraryMutationResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'library-reorder',
          orderedIds: [...orderedIds],
        }),
      ),
    );
  }

  async replaceAll(scripts: readonly InstalledUserscript[]) {
    await this.ensureInitialized();
    return this.applyMutation(
      hydrateMutationResponse(
        await sendExtensionRequest<LibraryMutationResponse>(this.api, {
          channel: EXTENSION_CHANNEL,
          type: 'library-replace-all',
          scripts: scripts.map(storedScript),
        }),
      ),
    );
  }

  subscribe(listener: ScriptRepositoryListener) {
    if (this.listeners.size === 0) this.messageSubscription.start();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.messageSubscription.stop();
    };
  }

  dispose() {
    this.messageSubscription.stop();
    this.listeners.clear();
    this.cache.clear();
    this.orderedIds = [];
    this.initialized = false;
  }

  private replaceCache(scripts: InstalledUserscript[]) {
    this.cache.clear();
    for (const script of scripts) this.cache.set(script.id, script);
    this.orderedIds = scripts.map((script) => script.id);
    this.initialized = true;
    return scripts;
  }

  private async ensureInitialized() {
    if (!this.initialized) await this.list();
  }

  private applyMutation({
    orderedIds,
    scripts,
  }: {
    orderedIds: readonly string[];
    scripts: readonly InstalledUserscript[];
  }) {
    for (const script of scripts) this.cache.set(script.id, script);
    const activeIds = new Set(orderedIds);
    for (const scriptId of this.cache.keys()) {
      if (!activeIds.has(scriptId)) this.cache.delete(scriptId);
    }
    this.orderedIds = [...orderedIds];
    this.initialized = true;
    return this.orderedScripts();
  }

  private publish(orderedIds: readonly string[]) {
    this.orderedIds = [...orderedIds];
    const scripts = this.orderedScripts();
    for (const listener of this.listeners) {
      listener(structuredClone(scripts));
    }
  }

  private orderedScripts() {
    return this.orderedIds.flatMap((id) => {
      const script = this.cache.get(id);
      return script ? [script] : [];
    });
  }
}
