import { describe, expect, it, vi } from 'vitest';

import {
  GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
  GLOBAL_LIBRARY_DISPOSE_EVENT,
  GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
  GLOBAL_LIBRARY_HOST_ID,
  GLOBAL_LIBRARY_OPEN_EVENT,
} from '../../features/global-library/lifecycle';
import {
  EXTENSION_PAGE_GLOBAL_LIBRARY_DELIVERY_MESSAGE_TYPE,
  GlobalLibraryHostCoordinator,
  markGlobalLibraryInjection,
  signalInjectedGlobalLibraryHost,
} from './global-library-host';

describe('global library host lifecycle', () => {
  it('reuses one session generation and one open host per tab', async () => {
    let hostAlive = false;
    const executeScript = vi.fn(
      async (details: {
        func?: unknown;
        files?: string[];
      }): Promise<Array<{ result?: boolean }>> => {
        if (details.func === signalInjectedGlobalLibraryHost) {
          return [{ result: hostAlive }];
        }
        if (details.func === markGlobalLibraryInjection) return [];
        if (details.files?.includes('library.js')) hostAlive = true;
        return [];
      },
    );
    const session = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
    };
    const coordinator = new GlobalLibraryHostCoordinator({
      scripting: { executeScript },
      storage: { session },
    } as never);

    await coordinator.prepare(7);
    await coordinator.prepare(7);

    expect(session.get).toHaveBeenCalledOnce();
    expect(session.set).toHaveBeenCalledOnce();
    expect(
      executeScript.mock.calls.filter(
        ([details]) => details.files?.[0] === 'library.js',
      ),
    ).toHaveLength(1);
  });

  it('uses the extension-page relay when script injection is unavailable', async () => {
    const executeScript = vi.fn(async () => {
      throw new Error('Cannot access an extension page.');
    });
    const sendMessage = vi.fn(async () => ({ handled: true }));
    const coordinator = new GlobalLibraryHostCoordinator({
      runtime: { sendMessage },
      scripting: { executeScript },
      storage: {
        session: {
          get: vi.fn(async () => ({
            'card-master.global-library-generation.v1': 'generation-1',
          })),
          set: vi.fn(async () => undefined),
        },
      },
    } as never);

    await coordinator.prepare(9);

    expect(sendMessage).toHaveBeenCalledWith({
      type: EXTENSION_PAGE_GLOBAL_LIBRARY_DELIVERY_MESSAGE_TYPE,
      tabId: 9,
      generation: 'generation-1',
    });
  });

  it('disposes a host from a different extension generation', () => {
    const attributes = new Map([
      [GLOBAL_LIBRARY_GENERATION_ATTRIBUTE, 'old-generation'],
    ]);
    const dispose = vi.fn();
    const remove = vi.fn();
    const host = {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      removeAttribute: (name: string) => attributes.delete(name),
      hasAttribute: (name: string) => attributes.has(name),
      dispatchEvent: (event: Event) => {
        if (event.type === GLOBAL_LIBRARY_DISPOSE_EVENT) dispose();
        return true;
      },
      remove,
    };
    vi.stubGlobal('document', {
      getElementById: (id: string) =>
        id === GLOBAL_LIBRARY_HOST_ID ? host : null,
    });

    expect(
      signalInjectedGlobalLibraryHost(
        GLOBAL_LIBRARY_HOST_ID,
        GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
        'current-generation',
        GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
        GLOBAL_LIBRARY_DISPOSE_EVENT,
        GLOBAL_LIBRARY_OPEN_EVENT,
      ),
    ).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
