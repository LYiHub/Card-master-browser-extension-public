import { describe, expect, it } from 'vitest';
import {
  normalizeAiServicesConfig,
  normalizeImageServiceInput,
  normalizeModelServiceInput,
} from '../../ai/domain/ai-services-schema';
import {
  AI_SERVICES_STORAGE_KEY,
  aiServicesView,
  clearAiServicesConfig,
  clearImageServiceCredential,
  clearModelServiceCredential,
  clearSpeechServiceCredential,
  DEFAULT_AI_SERVICES_CONFIG,
  readAiServicesConfig,
  resolveImageServiceRuntimeConfig,
  saveImageServiceConfig,
  saveModelServiceConfig,
  saveSpeechServiceConfig,
} from './ai-services-config';
import type { ExtensionStorageArea } from './api';

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const storage: ExtensionStorageArea = {
    get: async (key) => ({
      [String(key)]: values[String(key)],
    }),
    set: async (entries) => {
      Object.assign(values, entries);
    },
    remove: async (key) => {
      for (const entry of Array.isArray(key) ? key : [key]) {
        delete values[String(entry)];
      }
    },
    setAccessLevel: async () => undefined,
  } as ExtensionStorageArea;
  return { storage, values };
}

describe('extension AI services config', () => {
  it('accepts arbitrary model ids independently of the API format', () => {
    expect(
      normalizeModelServiceInput({
        baseUrl: 'https://router.example/',
        model: 'private-provider-model-id',
        protocol: 'responses',
        reasoningEffort: 'medium',
        apiKey: ' secret ',
      }),
    ).toEqual({
      baseUrl: 'https://router.example/v1',
      model: 'private-provider-model-id',
      protocol: 'responses',
      reasoningEffort: 'medium',
      apiKey: 'secret',
    });
    expect(
      normalizeModelServiceInput({
        baseUrl: 'https://chat.example/v1/',
        model: 'provider-chat-model',
        protocol: 'chat-completions',
        reasoningEffort: 'off',
      }),
    ).toMatchObject({
      baseUrl: 'https://chat.example/v1',
      model: 'provider-chat-model',
      protocol: 'chat-completions',
      reasoningEffort: 'off',
    });
  });

  it('rejects empty models, unknown formats, and invalid endpoints', () => {
    expect(
      normalizeModelServiceInput({
        baseUrl: 'https://router.example/v1',
        model: '   ',
        protocol: 'responses',
        reasoningEffort: 'high',
      }),
    ).toBeNull();
    expect(
      normalizeModelServiceInput({
        baseUrl: 'http://router.example/v1',
        model: 'gpt-5.5',
        protocol: 'responses',
        reasoningEffort: 'high',
      }),
    ).toBeNull();
    expect(
      normalizeModelServiceInput({
        baseUrl: 'https://user:secret@router.example/v1',
        model: 'gpt-5.5',
        protocol: 'responses',
        reasoningEffort: 'high',
      }),
    ).toBeNull();
    expect(
      normalizeModelServiceInput({
        baseUrl: 'https://router.example/v1',
        model: 'gpt-5.5',
        protocol: 'legacy-chat',
        reasoningEffort: 'high',
      }),
    ).toBeNull();
    expect(
      normalizeModelServiceInput({
        baseUrl: 'http://127.0.0.1:8080/v1',
        model: 'gpt-5.5',
        protocol: 'responses',
        reasoningEffort: 'high',
      }),
    ).toMatchObject({ baseUrl: 'http://127.0.0.1:8080/v1' });
  });

  it('makes the fixed OpenAI Images compatibility explicit', () => {
    expect(
      normalizeImageServiceInput({
        credentialSource: 'independent',
        protocol: 'openai-images',
        baseUrl: 'https://images.example',
        model: 'image-model',
      }),
    ).toEqual({
      credentialSource: 'independent',
      protocol: 'openai-images',
      baseUrl: 'https://images.example/v1',
      model: 'image-model',
    });
    expect(
      normalizeImageServiceInput({
        credentialSource: 'independent',
        protocol: 'arbitrary-images',
        baseUrl: 'https://images.example',
        model: 'image-model',
      }),
    ).toBeNull();
  });

  it('validates each service credential with a precise label', async () => {
    const { storage } = memoryStorage();
    await expect(
      saveModelServiceConfig(storage, {
        baseUrl: 'https://router.example/v1',
        model: 'gpt-5.5',
        protocol: 'responses',
        reasoningEffort: 'high',
        apiKey: '密钥：secret',
      }),
    ).rejects.toThrow('模型服务 API 密钥包含请求头不支持的字符');
    await expect(
      saveImageServiceConfig(storage, {
        credentialSource: 'independent',
        protocol: 'openai-images',
        baseUrl: 'https://images.example/v1',
        model: 'image-model',
        apiKey: '图像密钥：secret',
      }),
    ).rejects.toThrow('图像服务 API 密钥包含请求头不支持的字符');
    await expect(
      saveSpeechServiceConfig(storage, {
        apiKey: '语音密钥：secret',
      }),
    ).rejects.toThrow('语音识别 API 密钥包含请求头不支持的字符');
  });

  it('saves each service independently without replacing sibling settings', async () => {
    const { storage } = memoryStorage();
    await saveModelServiceConfig(storage, {
      baseUrl: 'https://chat.example/v1',
      model: 'gpt-5.6-sol',
      protocol: 'responses',
      reasoningEffort: 'max',
      apiKey: 'chat-secret',
    });
    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'openai-images',
      baseUrl: 'https://images.example/v1',
      model: 'custom-image-model',
      apiKey: 'image-secret',
    });
    await saveSpeechServiceConfig(storage, {
      apiKey: 'speech-secret',
    });
    await saveImageServiceConfig(storage, {
      credentialSource: 'model-service',
      protocol: 'openai-images',
      baseUrl: 'https://images.example/v1',
      model: 'second-image-model',
    });

    await expect(readAiServicesConfig(storage)).resolves.toEqual({
      modelService: {
        baseUrl: 'https://chat.example/v1',
        model: 'gpt-5.6-sol',
        protocol: 'responses',
        reasoningEffort: 'max',
        apiKey: 'chat-secret',
      },
      imageService: {
        credentialSource: 'model-service',
        protocol: 'openai-images',
        baseUrl: 'https://images.example/v1',
        model: 'second-image-model',
        apiKey: 'image-secret',
      },
      speechService: {
        apiKey: 'speech-secret',
      },
    });
  });

  it('derives image readiness from the selected credential source', async () => {
    const { storage } = memoryStorage();
    await saveModelServiceConfig(storage, {
      baseUrl: 'https://chat.example/v1',
      model: 'gpt-5.5',
      protocol: 'responses',
      reasoningEffort: 'high',
      apiKey: 'chat-secret',
    });
    expect(aiServicesView(await readAiServicesConfig(storage))).toMatchObject({
      modelService: { hasCredential: true },
      imageService: {
        credentialSource: 'model-service',
        hasCredential: true,
      },
      speechService: { hasCredential: false },
    });

    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'openai-images',
      baseUrl: 'https://images.example/v1',
      model: 'image-model',
    });
    expect(
      aiServicesView(await readAiServicesConfig(storage)).imageService
        .hasCredential,
    ).toBe(false);
  });

  it('clears credentials independently and removes the complete config', async () => {
    const { storage } = memoryStorage();
    await saveModelServiceConfig(storage, {
      baseUrl: 'https://chat.example/v1',
      model: 'gpt-5.5',
      protocol: 'responses',
      reasoningEffort: 'high',
      apiKey: 'chat-secret',
    });
    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'openai-images',
      baseUrl: 'https://images.example/v1',
      model: 'image-model',
      apiKey: 'image-secret',
    });
    await saveSpeechServiceConfig(storage, { apiKey: 'speech-secret' });

    await clearModelServiceCredential(storage);
    await clearImageServiceCredential(storage);
    await clearSpeechServiceCredential(storage);
    await expect(readAiServicesConfig(storage)).resolves.toMatchObject({
      modelService: { apiKey: '' },
      imageService: { apiKey: '' },
      speechService: { apiKey: '' },
    });

    await clearAiServicesConfig(storage);
    await expect(readAiServicesConfig(storage)).resolves.toBeNull();
    expect(aiServicesView(null)).toEqual({
      modelService: {
        baseUrl: DEFAULT_AI_SERVICES_CONFIG.modelService.baseUrl,
        model: DEFAULT_AI_SERVICES_CONFIG.modelService.model,
        protocol: DEFAULT_AI_SERVICES_CONFIG.modelService.protocol,
        reasoningEffort:
          DEFAULT_AI_SERVICES_CONFIG.modelService.reasoningEffort,
        hasCredential: false,
      },
      imageService: {
        credentialSource: 'model-service',
        protocol: 'openai-images',
        baseUrl: DEFAULT_AI_SERVICES_CONFIG.imageService.baseUrl,
        model: DEFAULT_AI_SERVICES_CONFIG.imageService.model,
        hasCredential: false,
      },
      speechService: { hasCredential: false },
    });
  });

  it('rejects stored configs with unknown fields instead of migrating them', () => {
    expect(
      normalizeAiServicesConfig({
        ...DEFAULT_AI_SERVICES_CONFIG,
        obsoleteCredentials: true,
      }),
    ).toBeNull();
  });

  it('uses the first public storage key', async () => {
    const { storage, values } = memoryStorage();
    await saveModelServiceConfig(storage, {
      baseUrl: 'https://router.example/v1',
      model: 'gpt-5.5',
      protocol: 'responses',
      reasoningEffort: 'high',
    });
    expect(Object.keys(values)).toEqual([AI_SERVICES_STORAGE_KEY]);
  });

  it('accepts dashscope protocol and does not force /v1 root path', () => {
    expect(
      normalizeImageServiceInput({
        credentialSource: 'independent',
        protocol: 'dashscope',
        baseUrl: 'https://dashscope.aliyuncs.com',
        model: 'z-image-turbo',
      }),
    ).toEqual({
      credentialSource: 'independent',
      protocol: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'z-image-turbo',
    });
  });

  it('saves and reads dashscope image service config', async () => {
    const { storage } = memoryStorage();
    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'z-image-turbo',
      apiKey: 'ds-key',
    });
    const config = await readAiServicesConfig(storage);
    expect(config?.imageService).toEqual({
      credentialSource: 'independent',
      protocol: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'z-image-turbo',
      apiKey: 'ds-key',
    });
  });

  it('resolveImageServiceRuntimeConfig returns protocol', () => {
    const result = resolveImageServiceRuntimeConfig(DEFAULT_AI_SERVICES_CONFIG);
    expect(result).toHaveProperty('protocol', 'openai-images');
  });

  it('resolveImageServiceRuntimeConfig returns dashscope protocol when configured', () => {
    const dashscopeConfig = structuredClone(DEFAULT_AI_SERVICES_CONFIG);
    dashscopeConfig.imageService.credentialSource = 'independent';
    dashscopeConfig.imageService.protocol = 'dashscope';
    dashscopeConfig.imageService.baseUrl = 'https://dashscope.aliyuncs.com';
    dashscopeConfig.imageService.model = 'z-image-turbo';
    const result = resolveImageServiceRuntimeConfig(dashscopeConfig);
    expect(result.protocol).toBe('dashscope');
    expect(result.baseUrl).toBe('https://dashscope.aliyuncs.com');
  });

  it('reuses a model credential without reusing its endpoint for dashscope', () => {
    const dashscopeConfig = structuredClone(DEFAULT_AI_SERVICES_CONFIG);
    dashscopeConfig.modelService.baseUrl = 'https://chat.example/v1';
    dashscopeConfig.modelService.apiKey = 'shared-key';
    dashscopeConfig.imageService.protocol = 'dashscope';
    dashscopeConfig.imageService.baseUrl = 'https://dashscope.aliyuncs.com';
    const result = resolveImageServiceRuntimeConfig(dashscopeConfig);
    expect(result).toMatchObject({
      protocol: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com',
      apiKey: 'shared-key',
    });
  });

  it('does not carry an independent API key across image protocols', async () => {
    const { storage } = memoryStorage();
    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'openai-images',
      baseUrl: 'https://images.example/v1',
      model: 'gpt-image-2',
      apiKey: 'openai-key',
    });
    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'z-image-turbo',
    });
    expect((await readAiServicesConfig(storage))?.imageService.apiKey).toBe('');
  });

  it('aiServicesView exposes image service protocol', async () => {
    const { storage } = memoryStorage();
    await saveImageServiceConfig(storage, {
      credentialSource: 'independent',
      protocol: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com',
      model: 'z-image-turbo',
    });
    const view = aiServicesView(await readAiServicesConfig(storage));
    expect(view.imageService.protocol).toBe('dashscope');
  });
});
