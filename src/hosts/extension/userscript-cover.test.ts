import { describe, expect, it, vi } from 'vitest';

import { UserscriptCoverConfigurationRequiredError } from '../../userscript/application/card-cover';
import type { ExtensionApi } from './api';
import { ExtensionUserscriptCoverController } from './userscript-cover';

function api(response: (request: { type: string }) => unknown): ExtensionApi {
  return {
    runtime: {
      id: 'extension-id',
      getURL: vi.fn(() => 'chrome-extension://extension-id/'),
      sendMessage: vi.fn(async (request) =>
        response(request as { type: string }),
      ),
    },
  } as unknown as ExtensionApi;
}

describe('ExtensionUserscriptCoverController', () => {
  it('reads whether image generation is configured', async () => {
    const controller = new ExtensionUserscriptCoverController(
      api(() => ({
        config: {
          modelService: {
            baseUrl: 'https://router.example/v1',
            model: 'gpt-5.5',
            protocol: 'responses',
            reasoningEffort: 'high',
            hasCredential: true,
          },
          imageService: {
            credentialSource: 'independent',
            protocol: 'openai-images',
            baseUrl: 'https://images.example/v1',
            model: 'image-model',
            hasCredential: false,
          },
          speechService: { hasCredential: false },
        },
      })),
    );

    await expect(controller.isConfigured()).resolves.toBe(false);
  });

  it('preserves the configuration-required result as a typed error', async () => {
    const controller = new ExtensionUserscriptCoverController(
      api(() => ({
        configurationRequired: true,
        error: '请先配置 AI API 密钥。',
      })),
    );

    await expect(controller.generate('a card', true)).rejects.toBeInstanceOf(
      UserscriptCoverConfigurationRequiredError,
    );
  });
});
