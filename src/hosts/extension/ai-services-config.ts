import {
  normalizeAiServicesConfig,
  normalizeHttpHeaderCredential,
  normalizeImageServiceInput,
  normalizeModelServiceInput,
  normalizeSpeechServiceInput,
} from '../../ai/domain/ai-services-schema';
import { AI_IMAGE_GENERATION_MODEL } from '../../ai/domain/image-generation';
import type {
  AiServicesConfig,
  AiServicesConfigView,
  ImageServiceConfigInput,
  ModelServiceConfigInput,
  SpeechServiceConfigInput,
} from '../../ai/domain/types';
import { DEFAULT_MODEL_SERVICE_MODEL } from '../../ai/domain/types';
import { DEFAULT_RESPONSES_API_BASE_URL } from '../../ai/infrastructure/responses-api-client';
import { t } from '../../localization/messages';
import type { ExtensionStorageArea } from './api';

export const AI_SERVICES_STORAGE_KEY = 'card-master.ai-services.v1';

export const DEFAULT_AI_SERVICES_CONFIG: AiServicesConfig = {
  modelService: {
    baseUrl: DEFAULT_RESPONSES_API_BASE_URL,
    model: DEFAULT_MODEL_SERVICE_MODEL,
    protocol: 'responses',
    reasoningEffort: 'high',
    apiKey: '',
  },
  imageService: {
    credentialSource: 'model-service',
    protocol: 'openai-images',
    baseUrl: DEFAULT_RESPONSES_API_BASE_URL,
    model: AI_IMAGE_GENERATION_MODEL,
    apiKey: '',
  },
  speechService: {
    apiKey: '',
  },
};

export function resolveAiServicesRuntimeConfig(
  config: AiServicesConfig | null,
): AiServicesConfig {
  return structuredClone(config ?? DEFAULT_AI_SERVICES_CONFIG);
}

export function resolveImageServiceRuntimeConfig(config: AiServicesConfig) {
  const { imageService, modelService } = config;
  return imageService.credentialSource === 'model-service'
    ? {
        protocol: imageService.protocol,
        baseUrl:
          imageService.protocol === 'openai-images'
            ? modelService.baseUrl
            : imageService.baseUrl,
        model: imageService.model,
        apiKey: modelService.apiKey,
      }
    : {
        protocol: imageService.protocol,
        baseUrl: imageService.baseUrl,
        model: imageService.model,
        apiKey: imageService.apiKey,
      };
}

export async function readAiServicesConfig(storage: ExtensionStorageArea) {
  const stored = (await storage.get(AI_SERVICES_STORAGE_KEY))[
    AI_SERVICES_STORAGE_KEY
  ];
  return normalizeAiServicesConfig(stored);
}

export function aiServicesView(
  config: AiServicesConfig | null,
): AiServicesConfigView {
  const resolved = resolveAiServicesRuntimeConfig(config);
  const imageCredential =
    resolved.imageService.credentialSource === 'model-service'
      ? resolved.modelService.apiKey
      : resolved.imageService.apiKey;
  return {
    modelService: {
      baseUrl: resolved.modelService.baseUrl,
      model: resolved.modelService.model,
      protocol: resolved.modelService.protocol,
      reasoningEffort: resolved.modelService.reasoningEffort,
      hasCredential: Boolean(resolved.modelService.apiKey),
    },
    imageService: {
      credentialSource: resolved.imageService.credentialSource,
      protocol: resolved.imageService.protocol,
      baseUrl: resolved.imageService.baseUrl,
      model: resolved.imageService.model,
      hasCredential: Boolean(imageCredential),
    },
    speechService: {
      hasCredential: Boolean(resolved.speechService.apiKey),
    },
  };
}

async function writeAiServicesConfig(
  storage: ExtensionStorageArea,
  config: AiServicesConfig,
) {
  await storage.set({ [AI_SERVICES_STORAGE_KEY]: config });
  return config;
}

export async function resolveModelServiceConfig(
  storage: ExtensionStorageArea,
  input: ModelServiceConfigInput,
) {
  if (typeof input.apiKey === 'string') {
    normalizeHttpHeaderCredential(
      input.apiKey,
      t('cm_ai_services_config_text_1'),
    );
  }
  const normalized = normalizeModelServiceInput(input);
  if (!normalized) {
    throw new Error(t('cm_ai_services_config_error_2'));
  }
  const current = resolveAiServicesRuntimeConfig(
    await readAiServicesConfig(storage),
  );
  const apiKey = normalizeHttpHeaderCredential(
    normalized.apiKey || current.modelService.apiKey,
    t('cm_ai_services_config_text_3'),
  );
  return {
    ...current,
    modelService: {
      ...normalized,
      apiKey,
    },
  };
}

export async function saveModelServiceConfig(
  storage: ExtensionStorageArea,
  input: ModelServiceConfigInput,
) {
  return writeAiServicesConfig(
    storage,
    await resolveModelServiceConfig(storage, input),
  );
}

export async function clearModelServiceCredential(
  storage: ExtensionStorageArea,
) {
  const current = resolveAiServicesRuntimeConfig(
    await readAiServicesConfig(storage),
  );
  return writeAiServicesConfig(storage, {
    ...current,
    modelService: { ...current.modelService, apiKey: '' },
  });
}

export async function saveImageServiceConfig(
  storage: ExtensionStorageArea,
  input: ImageServiceConfigInput,
) {
  if (typeof input.apiKey === 'string') {
    normalizeHttpHeaderCredential(
      input.apiKey,
      t('cm_ai_services_config_text_4'),
    );
  }
  const normalized = normalizeImageServiceInput(input);
  if (!normalized) {
    throw new Error(t('cm_ai_services_config_error_5'));
  }
  const current = resolveAiServicesRuntimeConfig(
    await readAiServicesConfig(storage),
  );
  const previousApiKey =
    normalized.protocol === current.imageService.protocol
      ? current.imageService.apiKey
      : '';
  const apiKey = normalizeHttpHeaderCredential(
    normalized.apiKey || previousApiKey,
    t('cm_ai_services_config_text_6'),
  );
  return writeAiServicesConfig(storage, {
    ...current,
    imageService: {
      ...normalized,
      apiKey,
    },
  });
}

export async function clearImageServiceCredential(
  storage: ExtensionStorageArea,
) {
  const current = resolveAiServicesRuntimeConfig(
    await readAiServicesConfig(storage),
  );
  return writeAiServicesConfig(storage, {
    ...current,
    imageService: { ...current.imageService, apiKey: '' },
  });
}

export async function saveSpeechServiceConfig(
  storage: ExtensionStorageArea,
  input: SpeechServiceConfigInput,
) {
  if (typeof input.apiKey === 'string') {
    normalizeHttpHeaderCredential(
      input.apiKey,
      t('cm_ai_services_config_text_7'),
    );
  }
  const normalized = normalizeSpeechServiceInput(input);
  if (!normalized) throw new Error(t('cm_ai_services_config_error_8'));
  const current = resolveAiServicesRuntimeConfig(
    await readAiServicesConfig(storage),
  );
  const apiKey = normalizeHttpHeaderCredential(
    normalized.apiKey || current.speechService.apiKey,
    t('cm_ai_services_config_text_9'),
  );
  return writeAiServicesConfig(storage, {
    ...current,
    speechService: { apiKey },
  });
}

export async function clearSpeechServiceCredential(
  storage: ExtensionStorageArea,
) {
  const current = resolveAiServicesRuntimeConfig(
    await readAiServicesConfig(storage),
  );
  return writeAiServicesConfig(storage, {
    ...current,
    speechService: { apiKey: '' },
  });
}

export async function clearAiServicesConfig(storage: ExtensionStorageArea) {
  await storage.remove(AI_SERVICES_STORAGE_KEY);
}
