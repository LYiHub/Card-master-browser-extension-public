import { describe, expect, it, vi } from 'vitest';

import {
  type StoredScript,
  storedScript,
} from '../../userscript/application/script-repository';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import type { ExtensionApi, ExtensionMessageListener } from './api';
import { EXTENSION_CHANNEL } from './protocol';
import { ExtensionScriptRepository } from './repository';

function harness() {
  const listeners = new Set<ExtensionMessageListener>();
  const sendMessage = vi.fn(
    async (message: {
      type: string;
      scripts?: StoredScript[];
    }): Promise<unknown> => {
      if (message.type === 'library-list') {
        return {
          scripts: INITIAL_USERSCRIPTS.slice(0, 2).map(storedScript),
        };
      }
      if (message.type === 'library-replace-all') {
        return {
          orderedIds: message.scripts?.map((script) => script.id) ?? [],
          scripts: message.scripts ?? [],
        };
      }
      return {
        orderedIds: INITIAL_USERSCRIPTS.slice(0, 2).map((script) => script.id),
        scripts: [],
      };
    },
  );
  const api = {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: (listener: ExtensionMessageListener) =>
          listeners.add(listener),
        removeListener: (listener: ExtensionMessageListener) =>
          listeners.delete(listener),
      },
    },
  } as unknown as ExtensionApi;
  return {
    api,
    sendMessage,
    emit(message: unknown) {
      for (const listener of listeners) {
        listener(message, {} as chrome.runtime.MessageSender, () => undefined);
      }
    },
  };
}

describe('ExtensionScriptRepository', () => {
  it('merges changed scripts into the cached library without rebroadcasting all sources', async () => {
    const { api, emit } = harness();
    const repository = new ExtensionScriptRepository(api);
    const snapshots: string[][] = [];
    repository.subscribe((scripts) =>
      snapshots.push(scripts.map((script) => script.metadata.version)),
    );
    await repository.list();
    const updated = {
      ...INITIAL_USERSCRIPTS[1],
      source: {
        ...INITIAL_USERSCRIPTS[1].source,
        code: INITIAL_USERSCRIPTS[1].source.code.replace(
          '// @version     5.2.0',
          '// @version     5.3.0',
        ),
      },
    };

    emit({
      channel: EXTENSION_CHANNEL,
      type: 'library-changed',
      orderedIds: [updated.id, INITIAL_USERSCRIPTS[0].id],
      scripts: [storedScript(updated)],
    });

    expect(snapshots.at(-1)).toEqual(['5.3.0', '2.4.1']);
  });

  it('applies removals and reorder events without script payloads', async () => {
    const { api, emit } = harness();
    const repository = new ExtensionScriptRepository(api);
    const snapshots: string[][] = [];
    repository.subscribe((scripts) =>
      snapshots.push(scripts.map((script) => script.id)),
    );
    await repository.list();

    emit({
      channel: EXTENSION_CHANNEL,
      type: 'library-changed',
      orderedIds: [INITIAL_USERSCRIPTS[1].id],
      scripts: [],
    });

    expect(snapshots.at(-1)).toEqual([INITIAL_USERSCRIPTS[1].id]);
  });

  it('merges mutation deltas and returns a complete ordered library', async () => {
    const { api, sendMessage } = harness();
    const repository = new ExtensionScriptRepository(api);
    await repository.list();
    const updated = {
      ...INITIAL_USERSCRIPTS[0],
      manager: {
        ...INITIAL_USERSCRIPTS[0].manager,
        enabled: false,
      },
    };
    sendMessage.mockResolvedValueOnce({
      orderedIds: [updated.id, INITIAL_USERSCRIPTS[1].id],
      scripts: [storedScript(updated)],
    });

    const scripts = await repository.upsert(updated);

    expect(scripts.map((script) => script.id)).toEqual([
      updated.id,
      INITIAL_USERSCRIPTS[1].id,
    ]);
    expect(scripts[0]?.manager.enabled).toBe(false);
  });

  it('replaces the complete library with one atomic extension request', async () => {
    const { api, sendMessage } = harness();
    const repository = new ExtensionScriptRepository(api);
    await repository.list();
    sendMessage.mockClear();
    const scripts = INITIAL_USERSCRIPTS.slice(1);

    const replaced = await repository.replaceAll(scripts);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      channel: EXTENSION_CHANNEL,
      type: 'library-replace-all',
      scripts: scripts.map(storedScript),
    });
    expect(replaced.map((script) => script.id)).toEqual(
      scripts.map((script) => script.id),
    );
  });
});
