import type {
  ImageServiceConfigInput,
  ModelServiceConfig,
  ModelServiceConfigInput,
  ModelServiceProbe,
  SpeechServiceConfigInput,
  UserscriptAiRequest,
} from '../../ai/domain/types';
import { ChatCompletionsClient } from '../../ai/infrastructure/chat-completions-client';
import type { AiModelClient } from '../../ai/infrastructure/model-client';
import { ResponsesCompatibilityClient } from '../../ai/infrastructure/responses-compatibility-client';
import type { GeneratedUserscriptCover } from '../../userscript/application/card-cover';
import {
  aiServicesView,
  clearAiServicesConfig,
  clearImageServiceCredential,
  clearModelServiceCredential,
  clearSpeechServiceCredential,
  readAiServicesConfig,
  resolveAiServicesRuntimeConfig,
  resolveModelServiceConfig,
  saveImageServiceConfig,
  saveModelServiceConfig,
  saveSpeechServiceConfig,
} from './ai-services-config';
import type { ExtensionStorageArea } from './api';
import {
  DailyReviewImageGenerator,
  type GeneratedDailyReviewWallpaper,
} from './daily-review-image';
import { ImageCardCoverGenerator } from './image-card-cover';

export class ExtensionAiServices {
  private readonly cardCoverGenerator = new ImageCardCoverGenerator();
  private readonly dailyReviewGenerator = new DailyReviewImageGenerator();

  constructor(private readonly storage: ExtensionStorageArea) {}

  async readView() {
    return aiServicesView(await readAiServicesConfig(this.storage));
  }

  async saveModelService(input: ModelServiceConfigInput) {
    return aiServicesView(await saveModelServiceConfig(this.storage, input));
  }

  async clearModelServiceCredential() {
    return aiServicesView(await clearModelServiceCredential(this.storage));
  }

  async saveImageService(input: ImageServiceConfigInput) {
    return aiServicesView(await saveImageServiceConfig(this.storage, input));
  }

  async clearImageServiceCredential() {
    return aiServicesView(await clearImageServiceCredential(this.storage));
  }

  async saveSpeechService(input: SpeechServiceConfigInput) {
    return aiServicesView(await saveSpeechServiceConfig(this.storage, input));
  }

  async clearSpeechServiceCredential() {
    return aiServicesView(await clearSpeechServiceCredential(this.storage));
  }

  async clearConfig() {
    await clearAiServicesConfig(this.storage);
    return aiServicesView(null);
  }

  async testModelService(
    input: ModelServiceConfigInput,
  ): Promise<ModelServiceProbe> {
    const startedAt = Date.now();
    try {
      const services = await resolveModelServiceConfig(this.storage, input);
      const config = services.modelService;
      if (!config.apiKey) {
        throw new Error('请填写模型服务的 API 密钥。');
      }
      const payload = await this.createClient(config).stream(
        {
          model: config.model,
          instructions: 'Return a concise connection confirmation.',
          reasoningEffort: config.reasoningEffort,
          messages: [{ role: 'user', content: 'Reply with connected.' }],
        },
        {},
      );
      return {
        ok: Boolean(payload.text),
        model: payload.model || config.model,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        ok: false,
        model: input.model,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async client() {
    return (await this.openModelSession()).client;
  }

  async openModelSession() {
    const config = await readAiServicesConfig(this.storage);
    if (!config?.modelService.apiKey) {
      throw new Error('模型服务尚未配置，请在卡牌大师智能体的设置中保存密钥。');
    }
    return {
      view: aiServicesView(config),
      client: this.createClient(config.modelService),
    };
  }

  async readSpeechService() {
    const config = resolveAiServicesRuntimeConfig(
      await readAiServicesConfig(this.storage),
    );
    if (!config.speechService.apiKey) {
      throw new Error(
        '语音识别尚未配置，请在卡牌大师智能体的设置中填写语音识别 API 密钥。',
      );
    }
    return structuredClone(config.speechService);
  }

  async generateCardCover(
    visualConcept: string,
    signal?: AbortSignal,
  ): Promise<GeneratedUserscriptCover> {
    const config = resolveAiServicesRuntimeConfig(
      await readAiServicesConfig(this.storage),
    );
    return this.cardCoverGenerator.generate(config, visualConcept, signal);
  }

  async generateCardCoverFromPrompt(
    prompt: string,
    injectDefaultStyle: boolean,
    signal?: AbortSignal,
  ): Promise<GeneratedUserscriptCover> {
    const config = resolveAiServicesRuntimeConfig(
      await readAiServicesConfig(this.storage),
    );
    return this.cardCoverGenerator.generate(config, prompt, signal, {
      injectDefaultStyle,
      requireEnglish: false,
    });
  }

  async generateDailyReviewWallpaper(
    prompt: string,
    signal?: AbortSignal,
    size?: '1280x720' | '1920x1080' | '2560x1440' | '3840x2160',
  ): Promise<GeneratedDailyReviewWallpaper> {
    const config = resolveAiServicesRuntimeConfig(
      await readAiServicesConfig(this.storage),
    );
    return this.dailyReviewGenerator.generate(config, prompt, signal, size);
  }

  async complete(request: UserscriptAiRequest, signal?: AbortSignal) {
    return (await this.client()).completeUserscriptRequest(request, signal);
  }

  private createClient(config: ModelServiceConfig): AiModelClient {
    return config.protocol === 'chat-completions'
      ? new ChatCompletionsClient(config)
      : new ResponsesCompatibilityClient(config);
  }
}
