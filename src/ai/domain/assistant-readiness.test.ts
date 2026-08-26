import { describe, expect, it } from 'vitest';

import {
  assistantReadinessIssues,
  speechReadinessIssues,
} from './assistant-readiness';

describe('assistant readiness', () => {
  it('reports every missing prerequisite together', () => {
    const issues = assistantReadinessIssues({
      servicesAvailable: true,
      servicesConfig: {
        modelService: {
          baseUrl: 'https://router.example/v1',
          model: 'gpt-5.6-terra',
          protocol: 'responses',
          reasoningEffort: 'high',
          hasCredential: false,
        },
        imageService: {
          credentialSource: 'model-service',
          protocol: 'openai-images',
          baseUrl: 'https://router.example/v1',
          model: 'gpt-image-2',
          hasCredential: false,
        },
        speechService: { hasCredential: false },
      },
      speechSupported: true,
      speechControllerAvailable: true,
      microphoneAvailable: true,
      microphonePermission: 'prompt',
    });

    expect(issues.map((issue) => issue.id)).toEqual([
      'model-api-key',
      'speech-api-key',
      'microphone-prompt',
    ]);
    expect(speechReadinessIssues(issues).map((issue) => issue.id)).toEqual([
      'speech-api-key',
      'microphone-prompt',
    ]);
    expect(
      issues.find((issue) => issue.id === 'model-api-key')?.detail,
    ).toContain('生成卡牌封面');
  });

  it('reports no issue when all services are ready', () => {
    expect(
      assistantReadinessIssues({
        servicesAvailable: true,
        servicesConfig: {
          modelService: {
            baseUrl: 'https://router.example/v1',
            model: 'gpt-5.6-terra',
            protocol: 'responses',
            reasoningEffort: 'high',
            hasCredential: true,
          },
          imageService: {
            credentialSource: 'model-service',
            protocol: 'openai-images',
            baseUrl: 'https://router.example/v1',
            model: 'gpt-image-2',
            hasCredential: true,
          },
          speechService: { hasCredential: true },
        },
        speechSupported: true,
        speechControllerAvailable: true,
        microphoneAvailable: true,
        microphonePermission: 'granted',
      }),
    ).toEqual([]);
  });

  it('reports an independently configured image service separately', () => {
    const issues = assistantReadinessIssues({
      servicesAvailable: true,
      servicesConfig: {
        modelService: {
          baseUrl: 'https://chat.example/v1',
          model: 'deepseek-v4-flash',
          protocol: 'chat-completions',
          reasoningEffort: 'high',
          hasCredential: true,
        },
        imageService: {
          credentialSource: 'independent',
          protocol: 'openai-images',
          baseUrl: 'https://image.example/v1',
          model: 'image-model',
          hasCredential: false,
        },
        speechService: { hasCredential: true },
      },
      speechSupported: true,
      speechControllerAvailable: true,
      microphoneAvailable: true,
      microphonePermission: 'granted',
    });

    expect(issues.map((issue) => issue.id)).toEqual(['image-api-key']);
  });

  it('blocks speech startup when microphone permission cannot be read', () => {
    const issues = assistantReadinessIssues({
      servicesAvailable: true,
      servicesConfig: {
        modelService: {
          baseUrl: 'https://router.example/v1',
          model: 'gpt-5.5',
          protocol: 'responses',
          reasoningEffort: 'high',
          hasCredential: true,
        },
        imageService: {
          credentialSource: 'model-service',
          protocol: 'openai-images',
          baseUrl: 'https://router.example/v1',
          model: 'image-model',
          hasCredential: true,
        },
        speechService: { hasCredential: true },
      },
      speechSupported: true,
      speechControllerAvailable: true,
      microphoneAvailable: true,
      microphonePermission: 'unavailable',
    });

    expect(speechReadinessIssues(issues).map((issue) => issue.id)).toEqual([
      'microphone-unknown',
    ]);
  });

  it('does not request speech credentials or microphone access on unsupported platforms', () => {
    const issues = assistantReadinessIssues({
      servicesAvailable: true,
      servicesConfig: {
        modelService: {
          baseUrl: 'https://router.example/v1',
          model: 'gpt-5.5',
          protocol: 'responses',
          reasoningEffort: 'high',
          hasCredential: true,
        },
        imageService: {
          credentialSource: 'model-service',
          protocol: 'openai-images',
          baseUrl: 'https://router.example/v1',
          model: 'image-model',
          hasCredential: true,
        },
        speechService: { hasCredential: false },
      },
      speechSupported: false,
      speechControllerAvailable: false,
      microphoneAvailable: false,
      microphonePermission: 'unavailable',
    });

    expect(issues).toEqual([]);
  });
});
