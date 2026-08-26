import { describe, expect, it, vi } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import { CurrentDocumentUserscriptRunner } from './current-document-userscript-runner';
import type { RegisteredUserscriptSynchronizer } from './registration-sync';
import type { ExtensionRuntimeBridge } from './runtime-bridge';

const attachment = {
  context: {
    url: 'https://example.com/page',
    title: 'Example',
    language: 'en',
    selectedText: '',
    visibleText: 'Example page',
  },
  target: {
    tabId: 7,
    frameId: 0,
    documentId: 'document-current',
  },
};

function script() {
  return {
    ...structuredClone(INITIAL_USERSCRIPTS[0]),
    metadata: {
      ...structuredClone(INITIAL_USERSCRIPTS[0].metadata),
      matches: ['https://example.com/*'],
    },
    manager: {
      ...structuredClone(INITIAL_USERSCRIPTS[0].manager),
      enabled: true,
    },
  };
}

describe('CurrentDocumentUserscriptRunner', () => {
  it('executes the synchronizer output in the exact attached document', async () => {
    const execute = vi.fn(async () => []);
    const synchronizer = {
      executionRegistrations: vi.fn(async () => ({
        script: script(),
        registrations: [
          {
            id: 'registered-script',
            js: [{ code: 'globalThis.__executed = true;' }],
            matches: ['https://example.com/*'],
            world: 'USER_SCRIPT',
            worldId: 'card-master-world-test',
          },
        ],
      })),
    } as unknown as RegisteredUserscriptSynchronizer;
    const state = vi
      .fn()
      .mockResolvedValueOnce({
        instanceId: 'previous',
        status: 'ready',
      })
      .mockResolvedValueOnce({
        instanceId: 'current',
        status: 'ready',
      });
    const runner = new CurrentDocumentUserscriptRunner(
      {
        userScripts: { execute },
        scripting: { executeScript: vi.fn() },
      },
      synchronizer,
      { state } as unknown as ExtensionRuntimeBridge,
    );

    await expect(
      runner.execute(attachment, INITIAL_USERSCRIPTS[0].id),
    ).resolves.toMatchObject({
      status: 'ready',
      url: attachment.context.url,
    });
    expect(execute).toHaveBeenCalledWith({
      target: {
        tabId: 7,
        documentIds: ['document-current'],
      },
      js: [{ code: 'globalThis.__executed = true;' }],
      world: 'USER_SCRIPT',
      worldId: 'card-master-world-test',
      injectImmediately: true,
    });
  });

  it('does not inject a committed script that does not match the page', async () => {
    const execute = vi.fn();
    const runner = new CurrentDocumentUserscriptRunner(
      {
        userScripts: { execute },
        scripting: { executeScript: vi.fn() },
      },
      {
        executionRegistrations: vi.fn(async () => ({
          script: {
            ...script(),
            metadata: {
              ...script().metadata,
              matches: ['https://other.test/*'],
            },
          },
          registrations: [],
        })),
      } as unknown as RegisteredUserscriptSynchronizer,
      {} as ExtensionRuntimeBridge,
    );

    await expect(
      runner.execute(attachment, INITIAL_USERSCRIPTS[0].id),
    ).resolves.toMatchObject({
      status: 'not-matched',
      url: attachment.context.url,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('immediately injects frame-enabled registrations into every frame', async () => {
    const execute = vi.fn(async () => []);
    const executeScript = vi.fn(async () => [
      {
        documentId: 'document-current',
        frameId: 0,
        result: 'https://example.com/page',
      },
      {
        documentId: 'document-child',
        frameId: 1,
        result: 'https://example.com/frame',
      },
    ]);
    const synchronizer = {
      executionRegistrations: vi.fn(async () => ({
        script: script(),
        registrations: [
          {
            id: 'registered-all-frames',
            js: [{ code: 'globalThis.__frameExecuted = true;' }],
            matches: ['https://example.com/*'],
            allFrames: true,
            world: 'USER_SCRIPT',
          },
        ],
      })),
    } as unknown as RegisteredUserscriptSynchronizer;
    const state = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        instanceId: 'current',
        status: 'ready',
      });
    const runner = new CurrentDocumentUserscriptRunner(
      {
        userScripts: { execute },
        scripting: { executeScript },
      },
      synchronizer,
      { state } as unknown as ExtensionRuntimeBridge,
    );

    await expect(
      runner.execute(attachment, INITIAL_USERSCRIPTS[0].id),
    ).resolves.toMatchObject({ status: 'ready' });
    expect(executeScript).toHaveBeenCalledWith({
      target: {
        tabId: 7,
        allFrames: true,
      },
      func: expect.any(Function),
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          tabId: 7,
          documentIds: ['document-current', 'document-child'],
        },
        injectImmediately: true,
      }),
    );
  });
});
