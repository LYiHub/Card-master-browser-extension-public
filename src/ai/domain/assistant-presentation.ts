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
  if (/已关[闭閉]|已關閉/.test(target?.message ?? '')) {
    return t('cm_assistant_presentation_text_4');
  }
  return t('cm_assistant_presentation_text_5');
}

export function assistantUserFacingError(error: unknown) {
  const message = errorText(error);
  if (/402|balance|quota|额度|額度|余额|餘額/i.test(message)) {
    return t('cm_assistant_presentation_text_6');
  }
  if (
    /401|403|unauthorized|forbidden|authentication|api.?key|密钥|金鑰|鉴权|驗證/i.test(
      message,
    )
  ) {
    return t('cm_assistant_presentation_text_7');
  }
  if (/permission|权限|權限/i.test(message)) {
    return t('cm_assistant_presentation_text_8');
  }
  if (/语音|語音|麦克风|麥克風|speech|microphone/i.test(message)) {
    return t('cm_assistant_presentation_text_9');
  }
  if (/标签页|分頁|[页頁]面.*(?:关闭|關閉|失效|访问|存取)|tab/i.test(message)) {
    return t('cm_assistant_presentation_text_10');
  }
  if (
    /network|fetch|连接|連線|后台|背景|控制器|port|http|sse|事件流|事件串流|诊断|診斷|request.?id|timeout/i.test(
      message,
    )
  ) {
    return t('cm_assistant_presentation_text_11');
  }
  return t('cm_assistant_presentation_text_12');
}
