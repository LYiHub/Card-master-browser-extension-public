import { describe, expect, it, vi } from 'vitest';

import type { ModelServiceConfig } from '../domain/types';
import { AiServiceHttpError } from './ai-service-http';
import type { AiModelClient } from './model-client';
import { ResponsesCompatibilityClient } from './responses-compatibility-client';

const config: ModelServiceConfig = {
  baseUrl: 'https://router.example/v1',
  model: 'provider-model',
  protocol: 'responses',
  reasoningEffort: 'high',
  apiKey: 'secret',
};

function conversionFailure() {
  return new AiServiceHttpError(
    'AI 服务请求失败（HTTP 500）：not implemented',
    {
      localRequestId: 'local-request',
      protocol: 'responses',
      model: config.model,
      endpoint: 'https://router.example/v1/responses',
      stream: true,
      inputItemCount: 1,
      toolCount: 20,
      reasoningEffort: 'high',
      status: 500,
      errorType: 'new_api_error',
      errorCode: 'convert_request_failed',
    },
  );
}

function client(
  stream: AiModelClient['stream'],
  completeUserscriptRequest: AiModelClient['completeUserscriptRequest'] = vi.fn(),
): AiModelClient {
  return { stream, completeUserscriptRequest };
}

const request = {
  model: config.model,
  reasoningEffort: 'high' as const,
  messages: [{ role: 'user' as const, content: 'hello' }],
};

describe('Responses API compatibility client', () => {
  it('only falls back for the verified conversion failure and keeps the session on chat completions', async () => {
    const responses = client(vi.fn().mockRejectedValue(conversionFailure()));
    const chatStream = vi.fn().mockResolvedValue({
      model: config.model,
      text: 'done',
      toolCalls: [],
    });
    const chatCompletions = client(chatStream);
    const compatible = new ResponsesCompatibilityClient(
      config,
      responses,
      chatCompletions,
    );

    await expect(compatible.stream(request, {})).resolves.toMatchObject({
      text: 'done',
    });
    await expect(compatible.stream(request, {})).resolves.toMatchObject({
      text: 'done',
    });

    expect(responses.stream).toHaveBeenCalledOnce();
    expect(chatStream).toHaveBeenCalledTimes(2);
  });

  it('does not hide unrelated Responses API failures', async () => {
    const failure = new AiServiceHttpError('rate limited', {
      localRequestId: 'local-request',
      protocol: 'responses',
      model: config.model,
      endpoint: 'https://router.example/v1/responses',
      stream: true,
      inputItemCount: 1,
      toolCount: 0,
      reasoningEffort: 'high',
      status: 429,
      errorType: 'rate_limit_error',
      errorCode: 'rate_limit_exceeded',
    });
    const responses = client(vi.fn().mockRejectedValue(failure));
    const chatCompletions = client(vi.fn());
    const compatible = new ResponsesCompatibilityClient(
      config,
      responses,
      chatCompletions,
    );

    await expect(compatible.stream(request, {})).rejects.toBe(failure);
    expect(chatCompletions.stream).not.toHaveBeenCalled();
  });

  it('uses the same verified fallback for non-streaming userscript AI requests', async () => {
    const responses = client(
      vi.fn(),
      vi.fn().mockRejectedValue(conversionFailure()),
    );
    const chatComplete = vi.fn().mockResolvedValue({
      text: 'done',
      model: config.model,
    });
    const chatCompletions = client(vi.fn(), chatComplete);
    const compatible = new ResponsesCompatibilityClient(
      config,
      responses,
      chatCompletions,
    );

    await expect(
      compatible.completeUserscriptRequest({
        input: 'hello',
        instructions: 'reply',
      }),
    ).resolves.toMatchObject({ text: 'done' });
    expect(chatComplete).toHaveBeenCalledOnce();
  });
});
