import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_SERVICES_CONFIG } from './ai-services-config';
import { EXTENSION_CHANNEL, extensionRequest } from './protocol';
import { applyPortableAiConfig, portableAiConfig } from './sync-settings';

describe('portable configuration trust boundaries', () => {
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
});
