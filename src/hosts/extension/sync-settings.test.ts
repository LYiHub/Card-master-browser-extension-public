import { describe, expect, it, vi } from 'vitest';
import {
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  DEFAULT_DECK_ENTRY_SETTINGS,
} from '../../features/userscript-deck/deck-entry';
import { DEFAULT_AI_SERVICES_CONFIG } from './ai-services-config';
import { EXTENSION_CHANNEL, extensionRequest } from './protocol';
import {
  applyPortableAiConfig,
  portableAiConfig,
  syncSettings,
} from './sync-settings';

describe('portable configuration trust boundaries', () => {
  it('persists fullscreen opt-out through sync and restores legacy records with auto-hide enabled', async () => {
    const { autoHideInFullscreen: _default, ...legacy } = {
      ...DEFAULT_DECK_ENTRY_SETTINGS,
      hiddenCardIds: [],
    };
    let stored: Record<string, unknown> = legacy;
    const sendMessage = vi.fn(async () => undefined);
    const services = {
      api: {
        runtime: { sendMessage },
        storage: {
          local: {
            get: async () => ({ [DECK_ENTRY_SETTINGS_STORAGE_KEY]: stored }),
            set: async (items: Record<string, Record<string, unknown>>) => {
              stored = items[DECK_ENTRY_SETTINGS_STORAGE_KEY];
            },
          },
        },
      },
      repository: { list: async () => [] },
    } as unknown as Parameters<typeof syncSettings>[0];
    const adapter = syncSettings(services)[0];
    expect(adapter.key).toBe('deck');
    expect(() => adapter.validate(legacy)).not.toThrow();
    expect(() =>
      adapter.validate({ ...legacy, autoHideInFullscreen: 'false' }),
    ).toThrow();
    expect(() => adapter.validate({ ...legacy, unknown: true })).toThrow();

    await adapter.apply(
      { ...legacy, autoHideInFullscreen: false },
      await adapter.read(),
    );
    expect(stored.autoHideInFullscreen).toBe(false);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ autoHideInFullscreen: false }),
      }),
    );
    const reloaded = syncSettings(services)[0];
    expect(await reloaded.read()).toEqual({
      ...legacy,
      autoHideInFullscreen: false,
    });
    const snapshot = JSON.parse(JSON.stringify(await reloaded.read()));
    await reloaded.apply(legacy, await reloaded.read());
    expect(stored).toEqual({ ...legacy, autoHideInFullscreen: true });
    await reloaded.apply(snapshot, await reloaded.read());
    expect(stored.autoHideInFullscreen).toBe(false);

    const expected = await reloaded.read();
    stored = { ...stored, autoHideInFullscreen: true };
    await expect(reloaded.apply(snapshot, expected)).rejects.toThrow(
      '本机配置刚发生变化',
    );
  });

  const credentials = {
    ...structuredClone(DEFAULT_AI_SERVICES_CONFIG),
    modelService: {
      ...DEFAULT_AI_SERVICES_CONFIG.modelService,
      apiKey: 'model-secret',
    },
    imageService: {
      ...DEFAULT_AI_SERVICES_CONFIG.imageService,
      apiKey: 'image-secret',
    },
    speechService: { apiKey: 'speech-secret' },
  };

  it('exports model options without credentials and preserves matching local credentials', () => {
    const value = portableAiConfig(credentials);
    expect(JSON.stringify(value)).not.toContain('secret');
    expect(JSON.stringify(value)).not.toContain('apiKey');
    const applied = applyPortableAiConfig(
      {
        ...value,
        modelService: { ...value.modelService, model: 'another-model' },
      },
      credentials,
    );
    expect(applied.modelService.apiKey).toBe('model-secret');
    expect(applied.imageService.apiKey).toBe('image-secret');
    expect(applied.speechService.apiKey).toBe('speech-secret');
  });

  it('never sends an existing credential to a newly synchronized service endpoint', () => {
    const value = portableAiConfig(credentials);
    const applied = applyPortableAiConfig(
      {
        ...value,
        modelService: {
          ...value.modelService,
          baseUrl: 'https://other.example/v1',
        },
      },
      credentials,
    );
    expect(applied.modelService.apiKey).toBe('');
    expect(() =>
      applyPortableAiConfig(
        {
          ...value,
          modelService: { ...value.modelService, apiKey: 'remote-secret' },
        },
        credentials,
      ),
    ).toThrow();
  });

  it('rejects malformed sync commands instead of falling through to a sync operation', () => {
    const request = (command: unknown) =>
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'sync-command',
        command,
      });
    expect(request({ type: 'erase-everything' })).toBe(false);
    expect(
      request({ type: 'confirm', previewId: 'a', choices: { a: 'overwrite' } }),
    ).toBe(false);
    expect(request({ type: 'run' })).toBe(true);
  });

  it('validates and applies legacy script-preferences cloud records without assistantPanelMode', async () => {
    const legacyCloudRecord = {
      reloadAfterScriptChange: true,
      updateIntervalDays: 7,
      updateEnabledOnly: false,
    };
    let written: unknown = null;
    const adapters = syncSettings({
      readScripts: async () => ({
        reloadAfterScriptChange: false,
        updateIntervalDays: 1,
        updateEnabledOnly: true,
        lastUpdateCheckAt: 0,
        assistantPanelMode: 'popup',
      }),
      writeScripts: async (input: unknown) => {
        written = input;
      },
    } as unknown as Parameters<typeof syncSettings>[0]);
    const adapter = adapters.find((a) => a.key === 'script-preferences');
    expect(adapter).toBeDefined();

    expect(() => adapter?.validate(legacyCloudRecord)).not.toThrow();

    await adapter?.apply(legacyCloudRecord, {
      reloadAfterScriptChange: false,
      updateIntervalDays: 1,
      updateEnabledOnly: true,
    });
    expect(written).toEqual(legacyCloudRecord);
  });
});
