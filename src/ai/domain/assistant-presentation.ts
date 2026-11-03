import { t } from '../../localization/messages';
import type { AssistantTabTargetState } from './types';

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function assistantTargetLabel(
  target: AssistantTabTargetState | null | undefined,
) {
  const title = target?.title.trim();
  if (title) return title;
  const rawUrl = target?.url.trim();
  if (rawUrl) {
    try {
      return new URL(rawUrl).hostname || t('cm_assistant_presentation_text_1');
    } catch {
      return t('cm_assistant_presentation_text_2');
    }
  }
  return t('cm_assistant_presentation_text_3');
}

export function assistantTargetStatus(
  target: AssistantTabTargetState | null | undefined,
) {
  if (target?.available) return assistantTargetLabel(target);
  if (target?.message?.includes('已关闭')) {
    return t('cm_assistant_presentation_text_4');
  }
  return t('cm_assistant_presentation_text_5');
}

export function assistantUserFacingError(error: unknown) {
  const message = errorText(error);
  if (/402|balance|quota|额度|余额/i.test(message)) {
    return t('cm_assistant_presentation_text_6');
  }
  if (
    /401|403|unauthorized|forbidden|authentication|api.?key|密钥|鉴权/i.test(
      message,
    )
  ) {
    return t('cm_assistant_presentation_text_7');
  }
  if (/permission|权限/i.test(message)) {
    return t('cm_assistant_presentation_text_8');
  }
  if (/语音|麦克风|speech|microphone/i.test(message)) {
    return t('cm_assistant_presentation_text_9');
  }
  if (/标签页|页面.*(?:关闭|失效|访问)|tab/i.test(message)) {
    return t('cm_assistant_presentation_text_10');
  }
  if (
    /network|fetch|连接|后台|控制器|port|http|sse|事件流|诊断|request.?id|timeout/i.test(
      message,
    )
  ) {
    return t('cm_assistant_presentation_text_11');
  }
  return t('cm_assistant_presentation_text_12');
}
