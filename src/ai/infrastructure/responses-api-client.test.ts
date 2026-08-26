import { describe, expect, it, vi } from 'vitest';

import type { ModelServiceConfig } from '../domain/types';
import { toolContinuationMessages } from './model-client';
import {
  normalizeResponsesApiBaseUrl,
  ResponsesApiClient,
  responseReasoningSummary,
} from './responses-api-client';

const config: ModelServiceConfig = {
  baseUrl: 'https://router.example',
  model: 'gpt-5.6-terra',
  protocol: 'responses',
  reasoningEffort: 'high',
  apiKey: 'secret',
};

describe('ResponsesApiClient', () => {
  it('用 Markdown 段落分隔完整响应中的多段推理摘要', () => {
    expect(
      responseReasoningSummary({
        output: [
          {
            type: 'reasoning',
            summary: [
              { type: 'summary_text', text: '**检查页面**' },
              { type: 'summary_text', text: '**规划修改**' },
            ],
          },
        ],
      }),
    ).toBe('**检查页面**\n\n**规划修改**');
  });

  it('normalizes a bare provider origin to the Responses API root', () => {
    expect(normalizeResponsesApiBaseUrl('https://router.example')).toBe(
      'https://router.example/v1',
    );
    expect(
      normalizeResponsesApiBaseUrl('https://router.example/openai/v1/'),
    ).toBe('https://router.example/openai/v1');
  });

  it('calls an injected native-style fetch without binding the client instance', async () => {
    let receiver: unknown;
    let requestedInput = '';
    const fetcher = vi.fn(function (this: unknown, input: string) {
      receiver = this;
      requestedInput = input;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            model: 'model-one',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'done' }],
              },
            ],
            usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
          }),
        ),
      );
    });
    const client = new ResponsesApiClient(config, fetcher);

    await expect(client.create({ input: 'hello' })).resolves.toMatchObject({
      model: 'model-one',
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
    });
    expect(receiver).toBe(globalThis);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(requestedInput).toBe('https://router.example/v1/responses');
  });

  it('reports an HTML provider root as a configuration error', async () => {
    const client = new ResponsesApiClient(
      config,
      vi.fn().mockResolvedValue(
        new Response('<html>router</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    await expect(client.create({ input: 'hello' })).rejects.toThrow(
      '基础地址指向 /v1 等 API 根路径',
    );
  });

  it('normalizes streamed text, reasoning summaries, and function calls', async () => {
    const events = [
      {
        type: 'response.reasoning_summary_part.added',
      },
      {
        type: 'response.reasoning_summary_text.delta',
        delta: '**Checked scripts.**',
      },
      {
        type: 'response.reasoning_summary_text.done',
      },
      {
        type: 'response.reasoning_summary_part.added',
      },
      {
        type: 'response.reasoning_summary_text.delta',
        delta: '**Planned changes.**',
      },
      { type: 'response.output_text.delta', delta: 'Ready.' },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: {
          type: 'function_call',
          call_id: 'call-1',
          name: 'inspect',
          arguments: '',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 1,
        delta: '{',
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 1,
        delta: '}',
      },
      {
        type: 'response.function_call_arguments.done',
        output_index: 1,
        arguments: '{}',
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          type: 'function_call',
          call_id: 'call-1',
          name: 'inspect',
          arguments: '{}',
        },
      },
      {
        type: 'response.completed',
        response: {
          model: 'model-one',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Ready.' }],
            },
            {
              type: 'function_call',
              call_id: 'call-1',
              name: 'inspect',
              arguments: '{}',
            },
          ],
        },
      },
    ];
    const stream = events
      .map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`)
      .join('');
    const client = new ResponsesApiClient(
      config,
      vi.fn().mockResolvedValue(
        new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );
    const text = vi.fn();
    const reasoning = vi.fn();
    const reasoningBoundary = vi.fn();
    const tool = vi.fn();

    await expect(
      client.stream(
        {
          model: 'model-one',
          reasoningEffort: 'high',
          messages: [{ role: 'user', content: 'hello' }],
        },
        {
          onTextDelta: text,
          onReasoningDelta: reasoning,
          onReasoningBoundary: reasoningBoundary,
          onToolCall: tool,
        },
      ),
    ).resolves.toMatchObject({
      model: 'model-one',
      toolCalls: [{ id: 'call-1', name: 'inspect', arguments: '{}' }],
    });
    expect(text).toHaveBeenCalledWith('Ready.');
    expect(reasoning.mock.calls.map(([delta]) => delta)).toEqual([
      '**Checked scripts.**',
      '**Planned changes.**',
    ]);
    expect(reasoningBoundary).toHaveBeenCalledOnce();
    expect(tool).toHaveBeenLastCalledWith({
      id: 'call-1',
      name: 'inspect',
      arguments: '{}',
    });
    expect(tool.mock.calls.map(([call]) => call.arguments)).toContain('{');
  });

  it('normalizes plain reasoning events used by compatible Responses services', async () => {
    const events = [
      {
        type: 'response.reasoning_text.delta',
        delta: '检查页面状态。',
      },
      {
        type: 'response.reasoning_text.done',
      },
      {
        type: 'response.output_text.delta',
        delta: '可以继续。',
      },
      {
        type: 'response.completed',
        response: {
          model: 'compatible-model',
          output: [
            {
              type: 'reasoning',
              summary: [],
              content: [{ type: 'reasoning_text', text: '检查页面状态。' }],
            },
            {
              type: 'message',
              content: [{ type: 'output_text', text: '可以继续。' }],
            },
          ],
        },
      },
    ];
    const client = new ResponsesApiClient(
      config,
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            events
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(''),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        ),
    );
    const reasoning = vi.fn();

    await expect(
      client.stream(
        {
          model: 'compatible-model',
          reasoningEffort: 'high',
          messages: [{ role: 'user', content: '继续' }],
        },
        { onReasoningDelta: reasoning },
      ),
    ).resolves.toMatchObject({
      model: 'compatible-model',
      text: '可以继续。',
      reasoning: '检查页面状态。',
    });
    expect(reasoning).toHaveBeenCalledWith('检查页面状态。');
  });

  it('sends an explicit none effort while preserving tool calling', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ResponsesApiClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              model: config.model,
              output: [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: '完成。' }],
                },
              ],
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );

    await client.stream(
      {
        model: config.model,
        reasoningEffort: 'off',
        messages: [{ role: 'user', content: '执行任务' }],
        tools: [
          {
            name: 'inspect_page',
            description: '检查页面',
            strict: true,
            parameters: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ],
        toolChoice: 'required',
      },
      {},
    );

    expect(requestBody).toMatchObject({
      reasoning: { effort: 'none' },
      tool_choice: 'required',
      tools: [{ type: 'function', name: 'inspect_page' }],
    });
  });

  it('requests native JSON output without requiring a tool call', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ResponsesApiClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              model: config.model,
              output: [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: '{"ok":true}' }],
                },
              ],
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );

    await client.stream(
      {
        model: config.model,
        reasoningEffort: 'high',
        messages: [{ role: 'user', content: '返回 JSON' }],
        responseFormat: 'json-object',
      },
      {},
    );

    expect(requestBody).toMatchObject({
      text: { format: { type: 'json_object' } },
    });
    expect(requestBody).not.toHaveProperty('tools');
    expect(requestBody).not.toHaveProperty('tool_choice');
  });

  it('replays original Responses output items when continuing tool calls', async () => {
    const requestBodies: Record<string, unknown>[] = [];
    const firstOutput = [
      {
        type: 'reasoning',
        id: 'reasoning-1',
        summary: [],
        content: [{ type: 'reasoning_text', text: '需要检查页面。' }],
      },
      {
        type: 'function_call',
        id: 'function-1',
        call_id: 'call-1',
        name: 'inspect_page',
        arguments: '{}',
      },
    ];
    const client = new ResponsesApiClient(
      config,
      vi.fn(async (_input, init) => {
        requestBodies.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>,
        );
        const output =
          requestBodies.length === 1
            ? firstOutput
            : [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: '检查完成。' }],
                },
              ];
        return new Response(
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: { model: config.model, output },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );
    const first = await client.stream(
      {
        model: config.model,
        reasoningEffort: 'high',
        messages: [{ role: 'user', content: '检查页面' }],
      },
      {},
    );

    await client.stream(
      {
        model: config.model,
        reasoningEffort: 'high',
        messages: [
          { role: 'user', content: '检查页面' },
          ...toolContinuationMessages(first, [
            {
              role: 'tool',
              toolCallId: 'call-1',
              content: '{"title":"页面"}',
            },
          ]),
        ],
      },
      {},
    );

    expect(requestBodies[1]?.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: '检查页面' }],
      },
      ...firstOutput,
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: '{"title":"页面"}',
      },
    ]);
  });

  it('maps image attachments to Responses input_image blocks', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ResponsesApiClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              model: config.model,
              output: [
                {
                  type: 'message',
                  content: [{ type: 'output_text', text: '已查看图片。' }],
                },
              ],
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );

    await client.stream(
      {
        model: config.model,
        reasoningEffort: 'off',
        messages: [
          {
            role: 'user',
            content: '检查截图',
            images: [
              {
                mimeType: 'image/png',
                dataUrl: 'data:image/png;base64,aGVsbG8=',
              },
            ],
          },
        ],
      },
      {},
    );

    expect(requestBody).toMatchObject({
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: '检查截图' },
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,aGVsbG8=',
            },
          ],
        },
      ],
    });
  });

  it('immediately reports response.failed error codes', async () => {
    const client = new ResponsesApiClient(
      config,
      vi.fn().mockResolvedValue(
        new Response(
          `data: ${JSON.stringify({
            type: 'response.failed',
            response: {
              error: {
                code: 'rate_limit_exceeded',
                message: '请求过于频繁',
              },
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      ),
    );

    await expect(
      client.stream(
        {
          model: config.model,
          reasoningEffort: 'off',
          messages: [{ role: 'user', content: '测试' }],
        },
        {},
      ),
    ).rejects.toThrow('rate_limit_exceeded');
  });

  it('reports response.incomplete reasons', async () => {
    const client = new ResponsesApiClient(
      config,
      vi.fn().mockResolvedValue(
        new Response(
          `data: ${JSON.stringify({
            type: 'response.incomplete',
            response: {
              incomplete_details: { reason: 'max_output_tokens' },
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      ),
    );

    await expect(
      client.stream(
        {
          model: config.model,
          reasoningEffort: 'high',
          messages: [{ role: 'user', content: '测试' }],
        },
        {},
      ),
    ).rejects.toThrow('max_output_tokens');
  });

  it('rejects incomplete completed function calls', async () => {
    const client = new ResponsesApiClient(
      config,
      vi.fn().mockResolvedValue(
        new Response(
          `data: ${JSON.stringify({
            type: 'response.completed',
            response: {
              model: 'model-one',
              output: [
                {
                  type: 'function_call',
                  name: 'inspect',
                  arguments: '{}',
                },
              ],
            },
          })}\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      ),
    );

    await expect(
      client.stream(
        {
          model: 'model-one',
          reasoningEffort: 'high',
          messages: [{ role: 'user', content: 'hello' }],
        },
        {},
      ),
    ).rejects.toThrow('不完整的工具调用');
  });
});
