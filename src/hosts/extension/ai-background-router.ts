import type { ExtensionAiServices } from './ai-services';
import type { AssistantSurfaceCoordinator } from './assistant-surface-background';
import type { DailyReviewWallpaperService } from './daily-review-wallpaper-service';
import type { OffscreenAudioCoordinator } from './offscreen-audio-coordinator';
import type { ExtensionRequest } from './protocol';
import type { VolcengineSpeechAuthorizationCoordinator } from './volcengine-speech-session';

export const AI_MESSAGE_UNHANDLED = Symbol('ai-message-unhandled');

type AiBackgroundRouterDependencies = {
  services: ExtensionAiServices;
  assistantSurface: AssistantSurfaceCoordinator;
  dailyReview: DailyReviewWallpaperService;
  offscreenAudio: OffscreenAudioCoordinator;
  speechAuthorization: VolcengineSpeechAuthorizationCoordinator;
  reportFailure: (context: string, error: unknown) => void;
};

export async function routeAiBackgroundMessage(
  message: ExtensionRequest,
  dependencies: AiBackgroundRouterDependencies,
): Promise<unknown | typeof AI_MESSAGE_UNHANDLED> {
  const {
    services,
    assistantSurface,
    dailyReview,
    offscreenAudio,
    speechAuthorization,
    reportFailure,
  } = dependencies;
  const regenerateDailyReviewWallpaper = () => {
    void dailyReview
      .run('configuration')
      .catch((error) => reportFailure('每日回顾生成失败', error));
  };

  switch (message.type) {
    case 'ai-assistant-surface-context-read':
      return { context: await assistantSurface.context(message.tabId) };
    case 'ai-speech-authorization-open': {
      const config = await services.readSpeechService();
      return { authorization: await speechAuthorization.open(config.apiKey) };
    }
    case 'ai-speech-authorization-close':
      await speechAuthorization.close(message.sessionId);
      return { ok: true };
    case 'userscript-cover-generate': {
      const servicesView = await services.readView();
      if (!servicesView.imageService.hasCredential) {
        return {
          configurationRequired: true,
          error:
            'OpenAI 兼容图像服务尚未配置，请在卡牌大师智能体的设置中配置图像生成。',
        };
      }
      return {
        cover: await services.generateCardCoverFromPrompt(
          message.prompt,
          message.injectDefaultStyle,
        ),
      };
    }
    case 'ai-services-read':
      return { config: await services.readView() };
    case 'ai-model-service-credential-clear':
      return { config: await services.clearModelServiceCredential() };
    case 'ai-model-service-save': {
      const config = await services.saveModelService(message.config);
      regenerateDailyReviewWallpaper();
      return { config };
    }
    case 'ai-model-service-test':
      return { probe: await services.testModelService(message.config) };
    case 'ai-image-service-save': {
      const config = await services.saveImageService(message.config);
      regenerateDailyReviewWallpaper();
      return { config };
    }
    case 'ai-image-service-credential-clear':
      return { config: await services.clearImageServiceCredential() };
    case 'ai-speech-service-save':
      return { config: await services.saveSpeechService(message.config) };
    case 'ai-speech-service-test': {
      const apiKey =
        message.config?.apiKey || (await services.readSpeechService()).apiKey;
      return {
        probe: await offscreenAudio.testSpeechRecognition(
          apiKey,
          speechAuthorization,
        ),
      };
    }
    case 'ai-speech-service-credential-clear':
      return { config: await services.clearSpeechServiceCredential() };
    default:
      return AI_MESSAGE_UNHANDLED;
  }
}
