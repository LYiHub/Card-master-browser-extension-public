import type { AssistantWorkbenchTab } from '../../ai/domain/types';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

export async function openAssistantSurface(
  api: ExtensionApi,
  tab?: AssistantWorkbenchTab,
) {
  const response = await sendExtensionRequest<{
    ok?: boolean;
    error?: string;
  }>(api, {
    channel: EXTENSION_CHANNEL,
    type: 'ai-assistant-surface-open',
    ...(tab ? { tab } : {}),
  });
  if (response.error) throw new Error(response.error);
  if (!response.ok) throw new Error('扩展未能打开卡牌大师智能体。');
}
