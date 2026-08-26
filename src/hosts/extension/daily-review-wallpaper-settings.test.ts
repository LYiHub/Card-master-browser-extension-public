import { describe, expect, it, vi } from 'vitest';
import { AI_SERVICES_STORAGE_KEY } from './ai-services-config';
import type { ExtensionApi } from './api';
import { ExtensionDailyReviewWallpaperSettingsController } from './daily-review-wallpaper-settings';

describe('extension daily review wallpaper settings controller', () => {
  it('reads model and image service readiness before rendering AI controls', async () => {
    const sendMessage = vi.fn(async () => ({
      config: {
        modelService: { hasCredential: true },
        imageService: { hasCredential: false },
      },
    }));
    const controller = new ExtensionDailyReviewWallpaperSettingsController({
      runtime: { sendMessage },
    } as unknown as ExtensionApi);

    await expect(controller.readReadiness()).resolves.toEqual({
      modelServiceConfigured: true,
      imageServiceConfigured: false,
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ai-services-read' }),
    );
  });

  it('opens the existing assistant Side Panel directly on its settings tab', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true }));
    const controller = new ExtensionDailyReviewWallpaperSettingsController({
      runtime: { sendMessage },
    } as unknown as ExtensionApi);

    await expect(controller.openAiSettings()).resolves.toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ai-assistant-surface-open',
        tab: 'settings',
      }),
    );
  });

  it('forwards one-time custom content to the existing generation command', async () => {
    const sendMessage = vi.fn(async () => ({ started: true }));
    const controller = new ExtensionDailyReviewWallpaperSettingsController({
      runtime: { sendMessage },
    } as unknown as ExtensionApi);
    const plan = {
      summary: '今天完成了一个可以立即执行的计划。',
      image_prompt: '晨光中的工坊展开一张通往远方的巨大地图。',
    };

    await expect(controller.generate(plan)).resolves.toEqual({ started: true });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'new-tab-daily-review-wallpaper-generate',
        plan,
      }),
    );
  });

  it('notifies the settings page when AI service configuration changes', () => {
    type StorageChangeListener = Parameters<
      typeof chrome.storage.onChanged.addListener
    >[0];
    const listeners = new Set<StorageChangeListener>();
    const controller = new ExtensionDailyReviewWallpaperSettingsController({
      storage: {
        onChanged: {
          addListener: (listener: StorageChangeListener) =>
            listeners.add(listener),
          removeListener: (listener: StorageChangeListener) =>
            listeners.delete(listener),
        },
      },
    } as unknown as ExtensionApi);
    const listener = vi.fn();
    const unsubscribe = controller.subscribeReadiness(listener);
    const emit = (
      changes: Parameters<StorageChangeListener>[0],
      areaName: Parameters<StorageChangeListener>[1],
    ) =>
      listeners.forEach((callback) => {
        callback(changes, areaName);
      });

    emit({ unrelated: { newValue: true } }, 'local');
    emit({ [AI_SERVICES_STORAGE_KEY]: { newValue: {} } }, 'sync');
    expect(listener).not.toHaveBeenCalled();

    emit({ [AI_SERVICES_STORAGE_KEY]: { newValue: {} } }, 'local');
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    emit({ [AI_SERVICES_STORAGE_KEY]: { newValue: {} } }, 'local');
    expect(listener).toHaveBeenCalledOnce();
  });
});
