import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { ExtensionMediaResourcesService } from './media-resources-service';

function testApi() {
  const values: Record<string, unknown> = {};
  return {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (next: Record<string, unknown>) => {
          Object.assign(values, next);
        }),
      },
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      sendMessage: vi.fn(async () => undefined),
    },
    webRequest: {
      onBeforeSendHeaders: { addListener: vi.fn() },
    },
    scripting: {
      executeScript: vi.fn(),
    },
    downloads: {
      download: vi.fn(async () => 1),
    },
  } as unknown as ExtensionBackgroundApi;
}

afterEach(() => {
  globalThis.__cardMasterCatCatchBridge = undefined;
  globalThis.__cardMasterCatCatchChanged = undefined;
  globalThis.__cardMasterCatCatchReady = undefined;
  vi.unstubAllGlobals();
});

describe('ExtensionMediaResourcesService', () => {
  it('projects the upstream CatCatch cache without running another detector', async () => {
    globalThis.__cardMasterCatCatchBridge = {
      readAll: () => ({
        7: [
          {
            requestId: 'request-1',
            url: 'https://cdn.example/video.mp4',
            name: 'video.mp4',
            ext: 'mp4',
            type: 'video/mp4',
            tabId: 7,
            title: 'Example',
            webUrl: 'https://example.com/',
            getTime: 1,
          },
        ],
      }),
      state: () => ({
        enabled: true,
        captureEnabled: false,
        badgeNumber: true,
      }),
      setEnabled: () => ({
        enabled: true,
        captureEnabled: false,
        badgeNumber: true,
      }),
      setCaptureEnabled: () => ({
        enabled: true,
        captureEnabled: false,
        badgeNumber: true,
      }),
      clear: vi.fn(),
      reset: vi.fn(),
    };
    const api = testApi();
    const service = new ExtensionMediaResourcesService(api);

    const snapshot = await service.read(7, 'https://example.com/');

    expect(snapshot.resources).toHaveLength(1);
    expect(snapshot.resources[0]).toMatchObject({
      url: 'https://cdn.example/video.mp4',
      fileName: 'video.mp4',
      kind: 'video',
    });
    expect(snapshot.enabled).toBe(false);
    expect(snapshot.activeOnPage).toBe(false);
    expect(
      api.webRequest?.onBeforeSendHeaders?.addListener,
    ).not.toHaveBeenCalled();
  });

  it('does not offer CatCatch on Safari', async () => {
    vi.stubGlobal('__EXTENSION_TARGET__', 'safari');
    const snapshot = await new ExtensionMediaResourcesService(testApi()).read(
      7,
      'https://example.com/',
    );

    expect(snapshot.available).toBe(false);
  });
});
