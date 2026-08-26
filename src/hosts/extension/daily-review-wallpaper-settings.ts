import type {
  DailyReviewWallpaperPlan,
  DailyReviewWallpaperReadiness,
  DailyReviewWallpaperSettingsController,
  DailyReviewWallpaperSnapshot,
} from '../../new-tab/application/daily-review-wallpaper';
import { AI_SERVICES_STORAGE_KEY } from './ai-services-config';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { openAssistantSurface } from './assistant-surface-client';
import { DailyReviewWallpaperImageRepository } from './daily-review-wallpaper-storage';
import { EXTENSION_CHANNEL } from './extension-channel';

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function snapshotResponse(value: unknown) {
  if (record(value) && typeof value.error === 'string' && value.error) {
    throw new Error(value.error);
  }
  if (!record(value) || !record(value.snapshot)) {
    throw new Error('扩展没有返回有效的每日回顾状态。');
  }
  const snapshot = value.snapshot as Partial<DailyReviewWallpaperSnapshot>;
  if (!Array.isArray(snapshot.history)) {
    throw new Error('扩展没有返回有效的每日回顾历史。');
  }
  return snapshot as DailyReviewWallpaperSnapshot;
}

function generateResponse(value: unknown) {
  if (record(value) && typeof value.error === 'string' && value.error) {
    throw new Error(value.error);
  }
  if (!record(value) || typeof value.started !== 'boolean') {
    throw new Error('扩展没有确认每日回顾生成请求。');
  }
  return { started: value.started };
}

function readinessResponse(value: unknown): DailyReviewWallpaperReadiness {
  if (record(value) && typeof value.error === 'string' && value.error) {
    throw new Error(value.error);
  }
  if (!record(value) || !record(value.config)) {
    throw new Error('扩展没有返回有效的 AI 服务配置状态。');
  }
  const modelService = value.config.modelService;
  const imageService = value.config.imageService;
  if (!record(modelService) || !record(imageService)) {
    throw new Error('扩展返回的 AI 服务配置状态不完整。');
  }
  return {
    modelServiceConfigured: modelService.hasCredential === true,
    imageServiceConfigured: imageService.hasCredential === true,
  };
}

export class ExtensionDailyReviewWallpaperSettingsController
  implements DailyReviewWallpaperSettingsController
{
  constructor(
    private readonly api: ExtensionApi,
    private readonly images = new DailyReviewWallpaperImageRepository(),
  ) {}

  async readSnapshot() {
    return snapshotResponse(
      await sendExtensionRequest<unknown>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-daily-review-wallpaper-read',
      }),
    );
  }

  async readReadiness() {
    return readinessResponse(
      await sendExtensionRequest<unknown>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'ai-services-read',
      }),
    );
  }

  subscribeReadiness(listener: () => void) {
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && AI_SERVICES_STORAGE_KEY in changes) {
        listener();
      }
    };
    this.api.storage.onChanged.addListener(onChanged);
    return () => this.api.storage.onChanged.removeListener(onChanged);
  }

  async openAiSettings() {
    await openAssistantSurface(this.api, 'settings');
  }

  async generate(plan?: DailyReviewWallpaperPlan) {
    return generateResponse(
      await sendExtensionRequest<unknown>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-daily-review-wallpaper-generate',
        ...(plan ? { plan } : {}),
      }),
    );
  }

  readImage(imageId: string) {
    return this.images.read(imageId);
  }
}
