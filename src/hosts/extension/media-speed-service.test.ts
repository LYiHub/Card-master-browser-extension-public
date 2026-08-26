import { describe, expect, it, vi } from 'vitest';

import {
  defaultMediaSpeedSettings,
  MEDIA_SPEED_STORAGE_KEY,
  type MediaSpeedSettings,
} from '../../media-speed/domain/types';
import { ExtensionMediaSpeedService } from './media-speed-service';

function serviceApi(settings: MediaSpeedSettings) {
  return {
    storage: {
      local: {
        get: vi.fn(async () => ({ [MEDIA_SPEED_STORAGE_KEY]: settings })),
        remove: vi.fn(async () => undefined),
        set: vi.fn(async () => undefined),
      },
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      query: vi.fn(async (): Promise<chrome.tabs.Tab[]> => []),
      sendMessage: vi.fn(async (): Promise<unknown> => undefined),
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ExtensionMediaSpeedService', () => {
  it('aggregates video and audio across the top page and child frames', async () => {
    const settings: MediaSpeedSettings = {
      ...defaultMediaSpeedSettings(),
      revision: 7,
      siteOverrides: {
        'youtube.com': {
          lockSpeed: true,
          selection: { mode: 'standard', speed: 1.25 },
        },
      },
    };
    const api = serviceApi(settings);
    const service = new ExtensionMediaSpeedService(api as never);

    await service.read({
      tabId: 42,
      frameId: 0,
      url: 'https://www.youtube.com/watch?v=example',
      tabUrl: 'https://www.youtube.com/watch?v=example',
    });
    const iframeRead = await service.read({
      tabId: 42,
      frameId: 3,
      url: 'https://googleads.g.doubleclick.net/pagead/iframe',
      tabUrl: 'https://www.youtube.com/watch?v=example',
    });
    expect(iframeRead.snapshot.currentHost).toBe('youtube.com');
    expect(iframeRead.snapshot.selection).toEqual({
      mode: 'standard',
      speed: 1.25,
    });
    expect(iframeRead.snapshot.lockSpeed).toBe(true);
    const topFrameReport = await service.reportFrame({
      tabId: 42,
      frameId: 0,
      url: 'https://www.youtube.com/watch?v=example',
      tabUrl: 'https://www.youtube.com/watch?v=example',
      videoCount: 1,
      audioCount: 1,
    });
    expect(topFrameReport).toMatchObject({
      mediaCount: 2,
      videoCount: 1,
      audioCount: 1,
    });

    const iframeReport = await service.reportFrame({
      tabId: 42,
      frameId: 3,
      url: 'https://googleads.g.doubleclick.net/pagead/iframe',
      tabUrl: 'https://www.youtube.com/watch?v=example',
      videoCount: 1,
      audioCount: 0,
    });
    expect(iframeReport.currentHost).toBe('youtube.com');
    expect(iframeReport).toMatchObject({
      mediaCount: 3,
      videoCount: 2,
      audioCount: 1,
      selection: { mode: 'standard', speed: 1.25 },
    });

    const removedIframeReport = await service.reportFrame({
      tabId: 42,
      frameId: 3,
      url: 'https://googleads.g.doubleclick.net/pagead/iframe',
      tabUrl: 'https://www.youtube.com/watch?v=example',
      videoCount: 0,
      audioCount: 0,
    });
    expect(removedIframeReport).toMatchObject({
      mediaCount: 2,
      videoCount: 1,
      audioCount: 1,
    });

    const navigatedReport = await service.reportFrame({
      tabId: 42,
      frameId: 0,
      url: 'https://www.youtube.com/feed/subscriptions',
      tabUrl: 'https://www.youtube.com/feed/subscriptions',
      videoCount: 0,
      audioCount: 0,
    });
    expect(navigatedReport).toMatchObject({
      mediaCount: 0,
      videoCount: 0,
      audioCount: 0,
    });
  });

  it('serializes persistence without waiting for tab broadcasts', async () => {
    const settings = defaultMediaSpeedSettings();
    const pendingBroadcast = deferred();
    const api = serviceApi(settings);
    api.tabs.query.mockResolvedValue([{ id: 42 } as chrome.tabs.Tab]);
    api.tabs.sendMessage.mockImplementation(() => pendingBroadcast.promise);
    const service = new ExtensionMediaSpeedService(api as never);

    const first = await service.setSelection(
      42,
      'https://www.youtube.com/watch?v=example',
      { mode: 'standard', speed: 1.25 },
    );
    const second = await service.setSelection(
      42,
      'https://www.youtube.com/watch?v=example',
      { mode: 'standard', speed: 2 },
    );

    expect(first.snapshot).toMatchObject({
      revision: 1,
      selection: { mode: 'standard', speed: 1.25 },
    });
    expect(second.snapshot).toMatchObject({
      revision: 2,
      selection: { mode: 'standard', speed: 2 },
    });
    expect(api.storage.local.set).toHaveBeenCalledTimes(2);
    pendingBroadcast.resolve();
  });
});
