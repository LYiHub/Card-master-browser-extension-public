import { normalizeAiServicesConfig } from '../../ai/domain/ai-services-schema';
import type { AiServicesConfig } from '../../ai/domain/types';
import {
  type AudioSettings,
  normalizeAudioSettings,
} from '../../audio/AudioDirector';
import { normalizeBilibiliCapabilitiesState } from '../../bilibili-capabilities/domain/types';
import {
  parsePortableContentBlocking,
  portableContentBlocking,
} from '../../content-blocking/application/portable';
import type { ContentBlockingService } from '../../content-blocking/application/service';
import {
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  normalizeDeckEntrySettings,
} from '../../features/userscript-deck/deck-entry';
import {
  isGamepadControlSettings,
  normalizeGamepadControlSettings,
} from '../../gamepad-control/domain/settings';
import { isMediaResourcesSettings } from '../../media-resources/domain/types';
import {
  isMediaSpeedSettings,
  normalizeMediaSpeedSettings,
} from '../../media-speed/domain/types';
import {
  type NewTabPreferencesRepository,
  normalizeNewTabPreferences,
} from '../../new-tab/application/preferences';
import {
  isPageThemeSettings,
  normalizePageThemeSettings,
} from '../../page-theme/domain/types';
import {
  equal,
  type Json,
  jsonValue,
  record,
  withoutRevision,
} from '../../sync/model';
import {
  assertUnchanged,
  type SyncPortableAdapter,
  syncScriptKey,
} from '../../sync/projection';
import type { TransactionalScriptRepository } from '../../userscript/application/script-repository';
import {
  normalizeUserscriptSettingsInput,
  type UserscriptSettingsInput,
} from '../../userscript/application/settings';
import {
  AI_SERVICES_STORAGE_KEY,
  readAiServicesConfig,
  resolveAiServicesRuntimeConfig,
} from './ai-services-config';
import type { ExtensionBackgroundApi } from './api';
import type { BilibiliCapabilityService } from './bilibili-capability-service';
import { updateExtensionDeckEntrySettings } from './deck-entry-background';
import type { ExtensionGamepadControlService } from './gamepad-control-service';
import type { ExtensionMediaResourcesService } from './media-resources-service';
import type { ExtensionMediaSpeedService } from './media-speed-service';
import type { ExtensionPageThemeService } from './page-theme-service';

export function portableAiConfig(config: AiServicesConfig) {
  const { apiKey: _modelKey, ...modelService } = config.modelService;
  const { apiKey: _imageKey, ...imageService } = config.imageService;
  return { modelService, imageService };
}

export function applyPortableAiConfig(
  value: unknown,
  current: AiServicesConfig,
): AiServicesConfig {
  if (
    !record(value) ||
    Object.keys(value).sort().join(',') !== 'imageService,modelService' ||
    !record(value.modelService) ||
    !record(value.imageService) ||
    'apiKey' in value.modelService ||
    'apiKey' in value.imageService
  )
    throw new Error('AI 同步配置包含无效或敏感字段。');
  const normalized = normalizeAiServicesConfig({
    modelService: { ...value.modelService, apiKey: '' },
    imageService: { ...value.imageService, apiKey: '' },
    speechService: { apiKey: '' },
  });
  if (!normalized) throw new Error('AI 同步配置无效。');
  return {
    modelService: {
      ...normalized.modelService,
      apiKey:
        normalized.modelService.baseUrl === current.modelService.baseUrl
          ? current.modelService.apiKey
          : '',
    },
    imageService: {
      ...normalized.imageService,
      apiKey:
        normalized.imageService.baseUrl === current.imageService.baseUrl
          ? current.imageService.apiKey
          : '',
    },
    speechService: current.speechService,
  };
}

function configuration<T>(
  key: string,
  name: string,
  read: () => Promise<T>,
  parse: (value: unknown) => T,
  apply: (value: T, expected: Json) => Promise<unknown>,
): SyncPortableAdapter {
  const validate = (value: Json) => {
    if (!equal(value, parse(value)))
      throw new Error(`${name}包含未知字段或无效值。`);
  };
  return {
    key,
    name,
    read: async () => jsonValue(await read()),
    validate,
    apply: async (value, expected) => {
      validate(value);
      await apply(parse(value), expected);
      return true;
    },
  };
}

type Services = {
  api: ExtensionBackgroundApi;
  repository: TransactionalScriptRepository;
  newTab: NewTabPreferencesRepository;
  theme: ExtensionPageThemeService;
  speed: ExtensionMediaSpeedService;
  resources: ExtensionMediaResourcesService;
  gamepad: ExtensionGamepadControlService;
  bilibili: BilibiliCapabilityService;
  blocking: ContentBlockingService;
  readAudio(): Promise<AudioSettings>;
  writeAudio(value: AudioSettings): Promise<unknown>;
  readScripts(): Promise<UserscriptSettingsInput>;
  writeScripts(value: UserscriptSettingsInput): Promise<unknown>;
};

export function syncSettings(services: Services): SyncPortableAdapter[] {
  const {
    api,
    repository,
    newTab,
    theme,
    speed,
    resources,
    gamepad,
    bilibili,
    blocking,
  } = services;
  const deckView = async () => {
    const scripts = await repository.list();
    const byId = new Map(
      scripts.map((script) => [script.id, syncScriptKey(script)]),
    );
    const project = (value: unknown) => {
      const settings = normalizeDeckEntrySettings(value);
      return {
        ...settings,
        hiddenCardIds: settings.hiddenCardIds
          .map((id) => byId.get(id) ?? id)
          .sort(),
      };
    };
    return project;
  };
  const newTabView = (value: unknown) => {
    const { syncEnabled: _browserSync, ...preferences } = withoutRevision(
      normalizeNewTabPreferences(value),
    );
    return preferences;
  };
  const readAi = async () =>
    resolveAiServicesRuntimeConfig(
      await readAiServicesConfig(api.storage.local),
    );
  return [
    configuration(
      'deck',
      '牌库入口、显示与隐藏设置',
      async () =>
        (await deckView())(
          (await api.storage.local.get(DECK_ENTRY_SETTINGS_STORAGE_KEY))[
            DECK_ENTRY_SETTINGS_STORAGE_KEY
          ],
        ),
      (value) => {
        const settings = normalizeDeckEntrySettings(value);
        return {
          ...settings,
          hiddenCardIds: [...settings.hiddenCardIds].sort(),
        };
      },
      async (value, expected) => {
        const project = await deckView();
        const scripts = await repository.list();
        const ids = new Map(
          scripts.map((script) => [syncScriptKey(script), script.id]),
        );
        await updateExtensionDeckEntrySettings(api, (current) => {
          assertUnchanged(project(current), expected);
          return {
            ...value,
            hiddenCardIds: value.hiddenCardIds.map(
              (key) => ids.get(key) ?? key,
            ),
          };
        });
      },
    ),
    configuration(
      'new-tab',
      '新标签页全部偏好与自定义图标',
      async () => newTabView(await newTab.read()),
      newTabView,
      (value, expected) =>
        newTab.mutate((current) => {
          assertUnchanged(newTabView(current), expected);
          return { ...value, syncEnabled: false };
        }),
    ),
    configuration(
      'theme',
      '暗夜降临',
      async () => withoutRevision(await theme.read()),
      (value) => {
        if (!isPageThemeSettings(value)) throw new Error('主题设置无效。');
        return withoutRevision(normalizePageThemeSettings(value));
      },
      (value, expected) =>
        theme.mutate((current) => {
          assertUnchanged(withoutRevision(current), expected);
          return value;
        }),
    ),
    configuration(
      'speed',
      '媒体倍速与站点档位',
      async () => withoutRevision(await speed.readSettings()),
      (value) => {
        if (!isMediaSpeedSettings(value)) throw new Error('倍速设置无效。');
        return withoutRevision(normalizeMediaSpeedSettings(value));
      },
      (value, expected) =>
        speed.mutate((current) => {
          assertUnchanged(withoutRevision(current), expected);
          return value;
        }),
    ),
    configuration(
      'gamepad',
      '手柄映射与控制参数',
      async () => withoutRevision(await gamepad.readSettings()),
      (value) => {
        if (!isGamepadControlSettings(value)) throw new Error('手柄设置无效。');
        return withoutRevision(normalizeGamepadControlSettings(value));
      },
      (value, expected) =>
        gamepad.mutate((current) => {
          assertUnchanged(withoutRevision(current), expected);
          return value;
        }),
    ),
    configuration(
      'resources',
      '顺手牵羊',
      async () => withoutRevision(await resources.readSettings()),
      (value) => {
        if (!isMediaResourcesSettings(value))
          throw new Error('媒体资源设置无效。');
        return withoutRevision(value);
      },
      (value, expected) =>
        resources.saveSettings((current) => {
          assertUnchanged(withoutRevision(current), expected);
          return value;
        }),
    ),
    configuration(
      'bilibili',
      'B 站与视频增强',
      async () => withoutRevision(await bilibili.readState()),
      (value) => withoutRevision(normalizeBilibiliCapabilitiesState(value)),
      (value, expected) =>
        bilibili.adoptState((current) => {
          assertUnchanged(withoutRevision(current), expected);
          return value;
        }),
    ),
    configuration(
      'blocking',
      '内容拦截、规则、白名单与订阅',
      () => blocking.readPortableConfiguration(),
      (value) => portableContentBlocking(parsePortableContentBlocking(value)),
      (value, expected) =>
        blocking.applyPortableConfiguration((current) => {
          assertUnchanged(current, expected);
          return value;
        }),
    ),
    configuration(
      'audio',
      '声音偏好',
      services.readAudio,
      (value) => {
        const parsed = normalizeAudioSettings(value);
        if (!parsed) throw new Error('声音设置无效。');
        return parsed;
      },
      async (value, expected) => {
        assertUnchanged(await services.readAudio(), expected);
        await services.writeAudio(value);
      },
    ),
    configuration(
      'script-preferences',
      '脚本更新与运行偏好',
      async () => {
        const value = await services.readScripts();
        return {
          reloadAfterScriptChange: value.reloadAfterScriptChange,
          updateIntervalDays: value.updateIntervalDays,
          updateEnabledOnly: value.updateEnabledOnly,
        };
      },
      (value) => {
        const parsed = normalizeUserscriptSettingsInput(value);
        if (!parsed) throw new Error('脚本运行设置无效。');
        return parsed;
      },
      async (value, expected) => {
        assertUnchanged(
          normalizeUserscriptSettingsInput(await services.readScripts()),
          expected,
        );
        await services.writeScripts(value);
      },
    ),
    configuration(
      'ai',
      'AI 服务地址、协议与模型',
      async () => portableAiConfig(await readAi()),
      (value) =>
        portableAiConfig(
          applyPortableAiConfig(value, resolveAiServicesRuntimeConfig(null)),
        ),
      async (value, expected) => {
        const current = await readAi();
        assertUnchanged(portableAiConfig(current), expected);
        await api.storage.local.set({
          [AI_SERVICES_STORAGE_KEY]: applyPortableAiConfig(value, current),
        });
      },
    ),
  ];
}
