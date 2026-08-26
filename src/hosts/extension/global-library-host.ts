import {
  GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
  GLOBAL_LIBRARY_DISPOSE_EVENT,
  GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
  GLOBAL_LIBRARY_HOST_ID,
  GLOBAL_LIBRARY_OPEN_EVENT,
} from '../../features/global-library/lifecycle';
import type { ExtensionBackgroundApi } from './api';

const GLOBAL_LIBRARY_GENERATION_STORAGE_KEY =
  'card-master.global-library-generation.v1';
export const EXTENSION_PAGE_GLOBAL_LIBRARY_DELIVERY_MESSAGE_TYPE =
  'card-master:extension-page-global-library-delivery';

type GlobalLibraryHostApi = Pick<
  ExtensionBackgroundApi,
  'runtime' | 'scripting' | 'storage'
>;

export type ExtensionPageGlobalLibraryDeliveryMessage = {
  type: typeof EXTENSION_PAGE_GLOBAL_LIBRARY_DELIVERY_MESSAGE_TYPE;
  tabId: number;
  generation: string;
};

export function isExtensionPageGlobalLibraryDeliveryMessage(
  value: unknown,
): value is ExtensionPageGlobalLibraryDeliveryMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === EXTENSION_PAGE_GLOBAL_LIBRARY_DELIVERY_MESSAGE_TYPE &&
    typeof message.tabId === 'number' &&
    typeof message.generation === 'string' &&
    message.generation.length > 0
  );
}

export function signalInjectedGlobalLibraryHost(
  hostId: string,
  generationAttribute: string,
  generation: string,
  aliveAttribute: string,
  disposeEvent: string,
  openEvent: string,
) {
  const host = document.getElementById(hostId);
  if (!host) return false;
  if (host.getAttribute(generationAttribute) !== generation) {
    host.dispatchEvent(new Event(disposeEvent));
    host.remove();
    return false;
  }
  host.removeAttribute(aliveAttribute);
  host.dispatchEvent(new Event(openEvent));
  const alive = host.hasAttribute(aliveAttribute);
  if (!alive) {
    host.dispatchEvent(new Event(disposeEvent));
    host.remove();
  }
  return alive;
}

export function markGlobalLibraryInjection(
  generationAttribute: string,
  generation: string,
) {
  document.documentElement.setAttribute(generationAttribute, generation);
}

export class GlobalLibraryHostCoordinator {
  private readonly queues = new Map<number, Promise<void>>();
  private generationPromise: Promise<string> | null = null;

  constructor(private readonly api: GlobalLibraryHostApi) {}

  private generation() {
    if (!this.generationPromise) {
      this.generationPromise = this.loadGeneration().catch((error) => {
        this.generationPromise = null;
        throw error;
      });
    }
    return this.generationPromise;
  }

  private async loadGeneration() {
    const stored = await this.api.storage.session.get(
      GLOBAL_LIBRARY_GENERATION_STORAGE_KEY,
    );
    const existing = stored[GLOBAL_LIBRARY_GENERATION_STORAGE_KEY];
    if (typeof existing === 'string' && existing.length > 0) return existing;
    const generation = globalThis.crypto.randomUUID();
    await this.api.storage.session.set({
      [GLOBAL_LIBRARY_GENERATION_STORAGE_KEY]: generation,
    });
    return generation;
  }

  private async signal(tabId: number, generation: string) {
    const results = await this.api.scripting.executeScript({
      target: { tabId },
      func: signalInjectedGlobalLibraryHost,
      args: [
        GLOBAL_LIBRARY_HOST_ID,
        GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
        generation,
        GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
        GLOBAL_LIBRARY_DISPOSE_EVENT,
        GLOBAL_LIBRARY_OPEN_EVENT,
      ],
    });
    return results.some((result) => result.result === true);
  }

  private async ensure(tabId: number) {
    const generation = await this.generation();
    try {
      if (await this.signal(tabId, generation)) return;
      await this.api.scripting.executeScript({
        target: { tabId },
        func: markGlobalLibraryInjection,
        args: [GLOBAL_LIBRARY_GENERATION_ATTRIBUTE, generation],
      });
      await this.api.scripting.executeScript({
        target: { tabId },
        files: ['library.js'],
      });
    } catch (error) {
      try {
        const response = await this.api.runtime.sendMessage({
          type: EXTENSION_PAGE_GLOBAL_LIBRARY_DELIVERY_MESSAGE_TYPE,
          tabId,
          generation,
        } satisfies ExtensionPageGlobalLibraryDeliveryMessage);
        if (
          response &&
          typeof response === 'object' &&
          (response as { handled?: unknown }).handled === true
        ) {
          return;
        }
      } catch {
        // Ordinary webpages do not host the extension-page relay.
      }
      throw error;
    }
  }

  prepare(tabId: number) {
    const previous = this.queues.get(tabId) ?? Promise.resolve();
    let task: Promise<void>;
    task = previous
      .catch(() => undefined)
      .then(() => this.ensure(tabId))
      .finally(() => {
        if (this.queues.get(tabId) === task) this.queues.delete(tabId);
      });
    this.queues.set(tabId, task);
    return task;
  }
}
