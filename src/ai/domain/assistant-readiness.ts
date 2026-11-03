import { t } from '../../localization/messages';
import type { AiServicesConfigView } from './types';

export type MicrophonePermissionState = PermissionState | 'unavailable';

export type AssistantReadinessIssueId =
  | 'services-unavailable'
  | 'services-read-failed'
  | 'model-api-key'
  | 'image-api-key'
  | 'speech-api-key'
  | 'speech-controller'
  | 'speech-runtime'
  | 'microphone-unavailable'
  | 'microphone-denied'
  | 'microphone-prompt'
  | 'microphone-unknown';

export type AssistantReadinessIssue = {
  id: AssistantReadinessIssueId;
  title: string;
  detail: string;
};

export type AssistantReadinessInput = {
  servicesAvailable: boolean;
  servicesConfig: AiServicesConfigView | null;
  servicesError?: string | null;
  speechSupported: boolean;
  speechControllerAvailable: boolean;
  speechRuntimeError?: string | null;
  microphoneAvailable: boolean;
  microphonePermission: MicrophonePermissionState;
};

const SPEECH_ISSUES = new Set<AssistantReadinessIssueId>([
  'services-unavailable',
  'services-read-failed',
  'speech-api-key',
  'speech-controller',
  'speech-runtime',
  'microphone-unavailable',
  'microphone-denied',
  'microphone-prompt',
  'microphone-unknown',
]);

export function assistantReadinessIssues({
  servicesAvailable,
  servicesConfig,
  servicesError,
  speechSupported,
  speechControllerAvailable,
  speechRuntimeError,
  microphoneAvailable,
  microphonePermission,
}: AssistantReadinessInput): AssistantReadinessIssue[] {
  const issues: AssistantReadinessIssue[] = [];

  if (!servicesAvailable) {
    issues.push({
      id: 'services-unavailable',
      title: t('cm_assistant_readiness_title_1'),
      detail: speechSupported
        ? t('cm_assistant_readiness_text_2')
        : t('cm_assistant_readiness_text_3'),
    });
  } else if (servicesError) {
    issues.push({
      id: 'services-read-failed',
      title: t('cm_assistant_readiness_title_4'),
      detail: servicesError,
    });
  } else if (servicesConfig) {
    if (!servicesConfig.modelService.hasCredential) {
      issues.push({
        id: 'model-api-key',
        title: t('cm_assistant_readiness_title_5'),
        detail:
          servicesConfig.imageService.credentialSource === 'model-service'
            ? t('cm_assistant_readiness_text_6')
            : t('cm_assistant_readiness_text_7'),
      });
    }
    if (
      servicesConfig.imageService.credentialSource === 'independent' &&
      !servicesConfig.imageService.hasCredential
    ) {
      issues.push({
        id: 'image-api-key',
        title: t('cm_assistant_readiness_title_8'),
        detail: t('cm_assistant_readiness_detail_9'),
      });
    }
    if (speechSupported && !servicesConfig.speechService.hasCredential) {
      issues.push({
        id: 'speech-api-key',
        title: t('cm_assistant_readiness_title_10'),
        detail: t('cm_assistant_readiness_detail_11'),
      });
    }
  }

  if (speechSupported && !speechControllerAvailable) {
    issues.push({
      id: 'speech-controller',
      title: t('cm_assistant_readiness_title_12'),
      detail: t('cm_assistant_readiness_detail_13'),
    });
  }
  if (speechSupported && speechRuntimeError) {
    issues.push({
      id: 'speech-runtime',
      title: t('cm_assistant_readiness_title_14'),
      detail: speechRuntimeError,
    });
  }

  if (!speechSupported) {
    return issues;
  }

  if (!microphoneAvailable) {
    issues.push({
      id: 'microphone-unavailable',
      title: t('cm_assistant_readiness_title_15'),
      detail: t('cm_assistant_readiness_detail_16'),
    });
  } else if (microphonePermission === 'denied') {
    issues.push({
      id: 'microphone-denied',
      title: t('cm_assistant_readiness_title_17'),
      detail: t('cm_assistant_readiness_detail_18'),
    });
  } else if (microphonePermission === 'prompt') {
    issues.push({
      id: 'microphone-prompt',
      title: t('cm_assistant_readiness_title_19'),
      detail: t('cm_assistant_readiness_detail_20'),
    });
  } else if (microphonePermission === 'unavailable') {
    issues.push({
      id: 'microphone-unknown',
      title: t('cm_assistant_readiness_title_21'),
      detail: t('cm_assistant_readiness_detail_22'),
    });
  }

  return issues;
}

export function speechReadinessIssues(issues: AssistantReadinessIssue[]) {
  return issues.filter((issue) => SPEECH_ISSUES.has(issue.id));
}
