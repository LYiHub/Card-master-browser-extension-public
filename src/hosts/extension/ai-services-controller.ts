import type {
  AiServicesConfigView,
  AiServicesController,
  ImageServiceConfigInput,
  ModelServiceConfigInput,
  ModelServiceProbe,
  SpeechServiceConfigInput,
  SpeechServiceProbe,
} from '../../ai/domain/types';
import { t } from '../../localization/messages';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL, type ExtensionRequest } from './protocol';

export class ExtensionAiServicesController implements AiServicesController {
  constructor(private readonly api: ExtensionApi) {}

  readServices() {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-services-read',
    });
  }

  saveModelService(config: ModelServiceConfigInput) {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-model-service-save',
      config,
    });
  }

  async testModelService(
    config: ModelServiceConfigInput,
  ): Promise<ModelServiceProbe> {
    const response = await sendExtensionRequest<{
      probe?: ModelServiceProbe;
      error?: string;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'ai-model-service-test',
      config,
    });
    if (response.error) throw new Error(response.error);
    if (!response.probe)
      throw new Error(t('cm_ai_services_controller_error_1'));
    return response.probe;
  }

  clearModelServiceCredential() {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-model-service-credential-clear',
    });
  }

  saveImageService(config: ImageServiceConfigInput) {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-image-service-save',
      config,
    });
  }

  clearImageServiceCredential() {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-image-service-credential-clear',
    });
  }

  saveSpeechService(config: SpeechServiceConfigInput) {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-speech-service-save',
      config,
    });
  }

  async testSpeechService(
    config: SpeechServiceConfigInput = {},
  ): Promise<SpeechServiceProbe> {
    const response = await sendExtensionRequest<{
      probe?: SpeechServiceProbe;
      error?: string;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'ai-speech-service-test',
      config,
    });
    if (response.error) throw new Error(response.error);
    if (!response.probe)
      throw new Error(t('cm_ai_services_controller_error_2'));
    return response.probe;
  }

  clearSpeechServiceCredential() {
    return this.requestConfig({
      channel: EXTENSION_CHANNEL,
      type: 'ai-speech-service-credential-clear',
    });
  }

  private async requestConfig(request: ExtensionRequest) {
    const response = await sendExtensionRequest<{
      config?: AiServicesConfigView;
      error?: string;
    }>(this.api, request);
    if (response.error) throw new Error(response.error);
    if (!response.config)
      throw new Error(t('cm_ai_services_controller_error_3'));
    return response.config;
  }
}
