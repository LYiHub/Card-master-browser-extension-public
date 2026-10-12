import type { AssistantWorkbenchTab } from '../../ai/domain/types';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { detectBrowserEnvironment } from './browser-detection';
import { EXTENSION_CHANNEL } from './protocol';

export async function openAssistantSurface(
  api: ExtensionApi,
  tab?: AssistantWorkbenchTab,
) {
  const browserInfo = detectBrowserEnvironment();
  console.log(
    '[CardMaster:Client] Requesting ai-assistant-surface-open, tab:',
    tab,
    'detectedBrowser:',
    browserInfo.brand,
  );
  const response = await sendExtensionRequest<{
    ok?: boolean;
    error?: string;
  }>(api, {
    channel: EXTENSION_CHANNEL,
    type: 'ai-assistant-surface-open',
    ...(tab ? { tab } : {}),
    ...(browserInfo.brand !== 'unknown'
      ? { detectedBrowser: browserInfo.brand }
      : {}),
  });
  console.log(
    '[CardMaster:Client] ai-assistant-surface-open response:',
    response,
  );
  if (response.error) throw new Error(response.error);
  if (!response.ok) throw new Error('扩展未能打开卡牌大师智能体。');
}
