import { describe, expect, it, vi } from 'vitest';
import type {
  AiServicesConfigView,
  ModelServiceConfigInput,
} from '../../ai/domain/types';
import { ExtensionAiServicesController } from './ai-services-controller';
import type { ExtensionApi } from './api';

const config: AiServicesConfigView = {
  modelService: {
    baseUrl: 'https://router.example/v1',
    model: 'gpt-5.6-sol',
    protocol: 'responses',
    reasoningEffort: 'high',
    hasCredential: true,
  },
  imageService: {
    credentialSource: 'independent',
    protocol: 'openai-images',
    baseUrl: 'https://images.example/v1',
    model: 'image-model',
    hasCredential: true,
  },
  speechService: {
    hasCredential: true,
  },
};

function api(messages: unknown[]): ExtensionApi {
  return {
    runtime: {
      id: 'extension-id',
      getURL: vi.fn(),
      connect: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn(async (message) => {
        messages.push(message);
        const type = (message as { type?: string }).type;
        if (type === 'ai-model-service-test') {
          return {
            probe: { ok: true, model: 'gpt-5.6-sol', durationMs: 12 },
          };
        }
        if (type === 'ai-speech-service-test') {
          return { probe: { ok: true, durationMs: 18 } };
        }
        return { config };
      }),
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        setAccessLevel: vi.fn(),
      },
    },
  } as unknown as ExtensionApi;
}

describe('ExtensionAiServicesController', () => {
  it('uses dedicated messages for each service operation', async () => {
    const messages: unknown[] = [];
    const controller = new ExtensionAiServicesController(api(messages));
    const model: ModelServiceConfigInput = {
      baseUrl: 'https://router.example/v1',
      model: 'gpt-5.6-sol',
      protocol: 'responses',
      reasoningEffort: 'high',
    };
    const image = {
      credentialSource: 'independent' as const,
      protocol: 'openai-images' as const,
      baseUrl: 'https://images.example/v1',
      model: 'image-model',
    };

    await controller.readServices();
    await controller.saveModelService(model);
    await controller.testModelService(model);
    await controller.clearModelServiceCredential();
    await controller.saveImageService(image);
    await controller.clearImageServiceCredential();
    await controller.saveSpeechService({ apiKey: 'speech-secret' });
    await controller.testSpeechService({ apiKey: 'speech-secret' });
    await controller.clearSpeechServiceCredential();

    expect(
      messages.map((message) => (message as { type: string }).type),
    ).toEqual([
      'ai-services-read',
      'ai-model-service-save',
      'ai-model-service-test',
      'ai-model-service-credential-clear',
      'ai-image-service-save',
      'ai-image-service-credential-clear',
      'ai-speech-service-save',
      'ai-speech-service-test',
      'ai-speech-service-credential-clear',
    ]);
    expect(messages[1]).toMatchObject({ config: model });
    expect(messages[4]).toMatchObject({ config: image });
    expect(messages[7]).toMatchObject({
      config: { apiKey: 'speech-secret' },
    });
  });
});
