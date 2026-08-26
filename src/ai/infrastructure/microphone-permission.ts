import type { MicrophonePermissionState } from '../domain/assistant-readiness';

export async function readMicrophonePermissionState(
  permissions: Pick<Permissions, 'query'> | undefined = typeof navigator ===
  'undefined'
    ? undefined
    : navigator.permissions,
): Promise<MicrophonePermissionState> {
  if (!permissions?.query) return 'unavailable';
  try {
    const status = await permissions.query({
      name: 'microphone',
    } as PermissionDescriptor);
    return status.state;
  } catch {
    return 'unavailable';
  }
}

export function microphonePermissionErrorMessage(error: unknown) {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return '麦克风权限未获允许。请先打开设备权限页面完成授权。';
      case 'NotFoundError':
        return '没有找到可用的麦克风。';
      case 'NotReadableError':
        return '麦克风暂时无法使用，可能正被其他应用占用。';
      case 'AbortError':
        return '麦克风连接被中断，请重新尝试。';
      case 'SecurityError':
        return '浏览器阻止了当前扩展访问麦克风。';
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /permission dismissed|permission denied/i.test(message)
    ? '麦克风权限未获允许。请先打开设备权限页面完成授权。'
    : message;
}
