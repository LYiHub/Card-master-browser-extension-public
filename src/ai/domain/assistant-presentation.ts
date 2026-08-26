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
      return new URL(rawUrl).hostname || '当前页面';
    } catch {
      return '当前页面';
    }
  }
  return '当前页面';
}

export function assistantTargetStatus(
  target: AssistantTabTargetState | null | undefined,
) {
  if (target?.available) return assistantTargetLabel(target);
  if (target?.message?.includes('已关闭')) {
    return '所选页面已关闭，请重新选择页面。';
  }
  return '当前没有可操作的页面。';
}

export function assistantUserFacingError(error: unknown) {
  const message = errorText(error);
  if (/402|balance|quota|额度|余额/i.test(message)) {
    return '模型服务额度不足，请检查服务账户后重试。';
  }
  if (
    /401|403|unauthorized|forbidden|authentication|api.?key|密钥|鉴权/i.test(
      message,
    )
  ) {
    return '模型服务配置无效，请在设置中检查后重试。';
  }
  if (/permission|权限/i.test(message)) {
    return '当前操作缺少必要权限，请在设置中处理后重试。';
  }
  if (/语音|麦克风|speech|microphone/i.test(message)) {
    return '语音输入暂时不可用，请检查设置后重试。';
  }
  if (/标签页|页面.*(?:关闭|失效|访问)|tab/i.test(message)) {
    return '当前页面无法继续操作，请重新选择页面后重试。';
  }
  if (
    /network|fetch|连接|后台|控制器|port|http|sse|事件流|诊断|request.?id|timeout/i.test(
      message,
    )
  ) {
    return '智能体暂时无法连接，请稍后重试。';
  }
  return '本次操作未能完成，请稍后重试。';
}
