import type { AiServicesConfigView } from '../../ai/domain/types';
import { isCardAccent } from '../../userscript/application/card-accent';
import type {
  GeneratedUserscriptCover,
  UserscriptCoverController,
} from '../../userscript/application/card-cover';
import { UserscriptCoverConfigurationRequiredError } from '../../userscript/application/card-cover';
import { isUserscriptCoverImageDataUrl } from '../../userscript/domain/types';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

type UserscriptCoverResponse = {
  cover?: GeneratedUserscriptCover;
  configurationRequired?: boolean;
  error?: string;
};

function coverResponse(response: UserscriptCoverResponse) {
  if (response.configurationRequired) {
    throw new UserscriptCoverConfigurationRequiredError(response.error);
  }
  if (response.error) throw new Error(response.error);
  const cover = response.cover;
  if (
    cover?.width !== 480 ||
    cover.height !== 640 ||
    cover.mimeType !== 'image/webp' ||
    !isCardAccent(cover.accent) ||
    !isUserscriptCoverImageDataUrl(cover.dataUrl)
  ) {
    throw new Error('扩展没有返回有效的脚本卡牌封面。');
  }
  return cover;
}

export class ExtensionUserscriptCoverController
  implements UserscriptCoverController
{
  constructor(private readonly api: ExtensionApi) {}

  async isConfigured() {
    const response = await sendExtensionRequest<{
      config?: AiServicesConfigView;
      error?: string;
    }>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'ai-services-read',
    });
    if (response.error) throw new Error(response.error);
    if (!response.config) throw new Error('扩展没有返回图像服务配置状态。');
    return response.config.imageService.hasCredential;
  }

  async generate(prompt: string, injectDefaultStyle: boolean) {
    return coverResponse(
      await sendExtensionRequest<UserscriptCoverResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-cover-generate',
        prompt,
        injectDefaultStyle,
      }),
    );
  }
}
