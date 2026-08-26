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
      title: '服务配置不可用',
      detail: speechSupported
        ? '当前页面无法读取或保存模型、图像生成与语音识别配置。'
        : '当前页面无法读取或保存模型与图像生成配置。',
    });
  } else if (servicesError) {
    issues.push({
      id: 'services-read-failed',
      title: '配置读取失败',
      detail: servicesError,
    });
  } else if (servicesConfig) {
    if (!servicesConfig.modelService.hasCredential) {
      issues.push({
        id: 'model-api-key',
        title: '模型服务 API 密钥尚未配置',
        detail:
          servicesConfig.imageService.credentialSource === 'model-service'
            ? '无法发送对话请求、执行智能体任务或生成卡牌封面。'
            : '无法发送对话请求或执行智能体任务。',
      });
    }
    if (
      servicesConfig.imageService.credentialSource === 'independent' &&
      !servicesConfig.imageService.hasCredential
    ) {
      issues.push({
        id: 'image-api-key',
        title: 'OpenAI 兼容图像服务 API 密钥尚未配置',
        detail: '无法生成或更新脚本卡牌封面。',
      });
    }
    if (speechSupported && !servicesConfig.speechService.hasCredential) {
      issues.push({
        id: 'speech-api-key',
        title: '语音识别 API 密钥尚未配置',
        detail: '无法连接火山引擎流式语音识别服务。',
      });
    }
  }

  if (speechSupported && !speechControllerAvailable) {
    issues.push({
      id: 'speech-controller',
      title: '语音识别控制器不可用',
      detail: '当前宿主无法建立语音识别会话。',
    });
  }
  if (speechSupported && speechRuntimeError) {
    issues.push({
      id: 'speech-runtime',
      title: '最近一次语音输入失败',
      detail: speechRuntimeError,
    });
  }

  if (!speechSupported) {
    return issues;
  }

  if (!microphoneAvailable) {
    issues.push({
      id: 'microphone-unavailable',
      title: '浏览器不支持麦克风采集',
      detail: '当前环境没有可用的 getUserMedia 接口。',
    });
  } else if (microphonePermission === 'denied') {
    issues.push({
      id: 'microphone-denied',
      title: '麦克风权限已被阻止',
      detail: '需要在设备权限页面或浏览器设置中重新允许。',
    });
  } else if (microphonePermission === 'prompt') {
    issues.push({
      id: 'microphone-prompt',
      title: '麦克风权限尚未授予',
      detail: '需要先在设备权限页面完成一次浏览器授权。',
    });
  } else if (microphonePermission === 'unavailable') {
    issues.push({
      id: 'microphone-unknown',
      title: '暂时无法读取麦克风权限状态',
      detail: '可以打开设备权限页面进行检测和授权。',
    });
  }

  return issues;
}

export function speechReadinessIssues(issues: AssistantReadinessIssue[]) {
  return issues.filter((issue) => SPEECH_ISSUES.has(issue.id));
}
