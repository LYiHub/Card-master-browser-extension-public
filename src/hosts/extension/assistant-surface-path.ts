export const ASSISTANT_SURFACE_PATH = 'assistant.html';
const ASSISTANT_SURFACE_LIFECYCLE_PORT_PREFIX =
  'card-master:assistant-surface:';

function validTabId(tabId: number) {
  return Number.isSafeInteger(tabId) && tabId >= 0;
}

export function assistantSurfacePath(tabId: number) {
  if (!validTabId(tabId)) {
    throw new Error('卡牌大师智能体缺少有效的标签页身份。');
  }
  return `${ASSISTANT_SURFACE_PATH}?tabId=${tabId}`;
}

export function assistantSurfaceTabId(search: string) {
  const supplied = new URLSearchParams(search).get('tabId');
  if (supplied === null) return null;
  const tabId = Number(supplied);
  return validTabId(tabId) ? tabId : null;
}

export function assistantSurfaceLifecyclePortName(tabId: number) {
  if (!validTabId(tabId)) {
    throw new Error('卡牌大师智能体缺少有效的标签页身份。');
  }
  return `${ASSISTANT_SURFACE_LIFECYCLE_PORT_PREFIX}${tabId}`;
}

export function assistantSurfaceLifecyclePortTabId(name: string) {
  if (!name.startsWith(ASSISTANT_SURFACE_LIFECYCLE_PORT_PREFIX)) return null;
  const tabId = Number(
    name.slice(ASSISTANT_SURFACE_LIFECYCLE_PORT_PREFIX.length),
  );
  return validTabId(tabId) ? tabId : null;
}
