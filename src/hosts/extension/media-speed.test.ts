import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MediaSpeedSnapshot } from '../../media-speed/domain/types';
import type { ExtensionMessageListener } from './api';
import { ExtensionMediaSpeedController } from './media-speed';
import { EXTENSION_CHANNEL } from './protocol';

function messageEvent() {
  let listener: ExtensionMessageListener | null = null;
  return {
    addListener: vi.fn((next: ExtensionMessageListener) => {
      listener = next;
    }),
    removeListener: vi.fn(),
    emit(message: unknown) {
      listener?.(message, {} as chrome.runtime.MessageSender, vi.fn());
    },
  };
}

function pageDocument(url: string) {
  return {
    location: { href: url },
    documentElement: { dataset: {} },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Document;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function snapshot(
  revision: number,
  host: string,
  speed: number,
): MediaSpeedSnapshot {
  return {
    revision,
    status: 'ready',
    enabled: true,
    activeOnPage: true,
    currentHost: host,
    lockSpeed: false,
    mediaCount: 1,
    videoCount: 1,
    audioCount: 0,
    selection: { mode: 'standard', speed },
    showWheel: true,
    wheelItems: [
      { kind: 'speed', speed: 1 },
      { kind: 'speed', speed: 1.25 },
    ],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExtensionMediaSpeedController', () => {
  it('ignores stale and foreign-host snapshots after accepting page state', () => {
    const runtimeMessages = messageEvent();
    const api = {
      runtime: {
        onMessage: runtimeMessages,
        sendMessage: vi.fn(),
      },
    };
    const controller = new ExtensionMediaSpeedController(
      api as never,
      pageDocument('https://www.youtube.com/watch?v=example'),
    );
    const listener = vi.fn();
    controller.subscribe(listener);

    runtimeMessages.emit({
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-page-snapshot',
      snapshot: snapshot(7, 'youtube.com', 1.25),
    });
    runtimeMessages.emit({
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-page-snapshot',
      snapshot: snapshot(7, 'doubleclick.net', 1),
    });
    runtimeMessages.emit({
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-page-snapshot',
      snapshot: snapshot(6, 'youtube.com', 1),
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.lastCall?.[0].selection).toEqual({
      mode: 'standard',
      speed: 1.25,
    });
  });

  it('keeps a pending selection while live media snapshots still carry the old speed', async () => {
    const runtimeMessages = messageEvent();
    const request = deferred<{ snapshot: MediaSpeedSnapshot }>();
    const api = {
      runtime: {
        onMessage: runtimeMessages,
        sendMessage: vi.fn(() => request.promise),
      },
    };
    const controller = new ExtensionMediaSpeedController(
      api as never,
      pageDocument('https://search.bilibili.com/all?keyword=example'),
    );
    const listener = vi.fn();
    controller.subscribe(listener);
    runtimeMessages.emit({
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-page-snapshot',
      snapshot: snapshot(7, 'bilibili.com', 1),
    });

    const pending = controller.setSelection({
      mode: 'standard',
      speed: 1.25,
    });
    expect(listener.mock.lastCall?.[0].selection).toEqual({
      mode: 'standard',
      speed: 1.25,
    });

    runtimeMessages.emit({
      channel: EXTENSION_CHANNEL,
      type: 'media-speed-page-snapshot',
      snapshot: {
        ...snapshot(7, 'bilibili.com', 1),
        mediaCount: 0,
        videoCount: 0,
      },
    });
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      mediaCount: 0,
      videoCount: 0,
      selection: { mode: 'standard', speed: 1.25 },
    });

    request.resolve({
      snapshot: snapshot(8, 'bilibili.com', 1.25),
    });
    await pending;
    expect(listener.mock.lastCall?.[0]).toMatchObject({
      selection: { mode: 'standard', speed: 1.25 },
      revision: 8,
    });
  });

  it('keeps the latest selection when consecutive requests resolve out of order', async () => {
    const runtimeMessages = messageEvent();
    const firstRequest = deferred<{ snapshot: MediaSpeedSnapshot }>();
    const secondRequest = deferred<{ snapshot: MediaSpeedSnapshot }>();
    const api = {
      runtime: {
        onMessage: runtimeMessages,
        sendMessage: vi
          .fn()
          .mockReturnValueOnce(firstRequest.promise)
          .mockReturnValueOnce(secondRequest.promise),
      },
    };
    const controller = new ExtensionMediaSpeedController(
      api as never,
      pageDocument('https://www.youtube.com/watch?v=example'),
    );
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = controller.setSelection({
      mode: 'standard',
      speed: 1.25,
    });
    const second = controller.setSelection({
      mode: 'standard',
      speed: 2,
    });

    secondRequest.resolve({
      snapshot: snapshot(9, 'youtube.com', 2),
    });
    await second;
    firstRequest.resolve({
      snapshot: snapshot(8, 'youtube.com', 1.25),
    });
    await first;

    expect(listener.mock.lastCall?.[0]).toMatchObject({
      revision: 9,
      selection: { mode: 'standard', speed: 2 },
    });
  });
});
