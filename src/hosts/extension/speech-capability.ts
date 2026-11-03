import { t } from '../../localization/messages';
import { type ExtensionTarget, extensionTarget } from './platform';

export type ExtensionSpeechCapability = {
  available: boolean;
  title: string;
  message: string;
};

export function extensionSpeechServiceConfigured(response: unknown) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return false;
  }
  const config = (response as { config?: unknown }).config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return false;
  }
  const speechService = (config as { speechService?: unknown }).speechService;
  return (
    Boolean(speechService) &&
    typeof speechService === 'object' &&
    !Array.isArray(speechService) &&
    (speechService as { hasCredential?: unknown }).hasCredential === true
  );
}

export function extensionSpeechCapability(
  target: ExtensionTarget = extensionTarget(),
): ExtensionSpeechCapability {
  if (target === 'chromium') {
    return { available: true, title: '', message: '' };
  }
  const browser = target === 'firefox' ? 'Firefox' : 'Safari';
  return {
    available: false,
    title: t('cm_speech_capability_title_1', [String(browser)]),
    message: t('cm_speech_capability_message_2'),
  };
}
