import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { ExtensionAssistantPageObserver } from './assistant-page-observer';

describe('extension assistant page observer', () => {
  it('injects only into the document that opened the assistant port', async () => {
    const executeScript = vi.fn(async () => [
      { result: { counts: { elements: 12, buttons: 2, links: 4 } } },
    ]);
    const observer = new ExtensionAssistantPageObserver(
      {
        scripting: { executeScript },
      } as unknown as ExtensionBackgroundApi,
      {
        tabId: 17,
        frameId: 0,
        documentId: 'document-17',
      },
    );

    await expect(observer.execute('inspect_page', {})).resolves.toEqual({
      output: '{"counts":{"elements":12,"buttons":2,"links":4}}',
    });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          tabId: 17,
          documentIds: ['document-17'],
        },
      }),
    );
  });

  it('executes a one-shot page expression in the bound document', async () => {
    const execute = vi.fn(async (_request: unknown) => [
      {
        result: {
          success: true,
          result: { value: 'WWDC 2026', submitted: true },
          logs: [],
        },
      },
    ]);
    const observer = new ExtensionAssistantPageObserver(
      {
        runtime: {
          onUserScriptConnect: {},
        },
        userScripts: { execute },
      } as unknown as ExtensionBackgroundApi,
      {
        tabId: 17,
        frameId: 0,
        documentId: 'document-17',
      },
    );

    await expect(
      observer.execute('execute_page', {
        expression:
          '(() => { const input = document.querySelector("input"); input.value = "WWDC 2026"; input.form?.requestSubmit(); return { value: input.value, submitted: true }; })()',
      }),
    ).resolves.toEqual({
      output:
        '{"success":true,"result":{"value":"WWDC 2026","submitted":true},"logs":[]}',
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          tabId: 17,
          documentIds: ['document-17'],
        },
        injectImmediately: true,
      }),
    );
    const request = execute.mock.calls[0]?.[0] as
      | {
          js: Array<{ code: string }>;
        }
      | undefined;
    expect(request?.js[0]?.code).toContain('input.form?.requestSubmit()');
    expect(request?.js[0]?.code).toContain('console.log = capture("log")');
  });

  it('reloads, waits for stability, and rebinds later tools to the new document', async () => {
    vi.useFakeTimers();
    try {
      const reload = vi.fn(async () => undefined);
      const get = vi.fn(
        async () =>
          ({
            id: 17,
            url: 'https://example.com/reloaded',
            status: 'complete',
          }) as chrome.tabs.Tab,
      );
      const pageContext = {
        url: 'https://example.com/reloaded',
        title: 'Reloaded',
        language: 'zh-CN',
        selectedText: '',
        visibleText: 'ready',
      };
      const executeScript = vi
        .fn()
        .mockResolvedValueOnce([
          { documentId: 'document-new', frameId: 0, result: pageContext },
        ])
        .mockResolvedValueOnce([
          { documentId: 'document-new', frameId: 0, result: pageContext },
        ])
        .mockResolvedValueOnce([
          { documentId: 'document-new', frameId: 0, result: pageContext },
        ])
        .mockResolvedValueOnce([
          { documentId: 'document-new', frameId: 0, result: pageContext },
        ])
        .mockResolvedValueOnce([{ result: { counts: { elements: 9 } } }]);
      const observer = new ExtensionAssistantPageObserver(
        {
          tabs: { get, reload },
          scripting: { executeScript },
        } as unknown as ExtensionBackgroundApi,
        {
          tabId: 17,
          frameId: 0,
          documentId: 'document-old',
        },
      );

      const pending = observer.execute('reload_page', {});
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(pending).resolves.toEqual({
        output: expect.stringMatching(
          /"replacementBound":true.*"settled":true/,
        ),
      });
      await observer.execute('inspect_page', {});
      expect(reload).toHaveBeenCalledWith(17);
      expect(executeScript).toHaveBeenLastCalledWith(
        expect.objectContaining({
          target: {
            tabId: 17,
            documentIds: ['document-new'],
          },
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
