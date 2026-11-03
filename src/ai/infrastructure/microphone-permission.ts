import { t } from '../../localization/messages';
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
        return t('cm_microphone_permission_text_1');
      case 'NotFoundError':
        return t('cm_microphone_permission_text_2');
      case 'NotReadableError':
        return t('cm_microphone_permission_text_3');
      case 'AbortError':
        return t('cm_microphone_permission_text_4');
      case 'SecurityError':
        return t('cm_microphone_permission_text_5');
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /permission dismissed|permission denied/i.test(message)
    ? t('cm_microphone_permission_text_6')
    : message;
}
