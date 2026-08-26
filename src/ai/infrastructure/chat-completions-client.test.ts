import { describe, expect, it, vi } from 'vitest';

import type { ModelServiceConfig } from '../domain/types';
import {
  ChatCompletionsClient,
  normalizeChatCompletionsApiBaseUrl,
} from './chat-completions-client';

const config: ModelServiceConfig = {
  baseUrl: 'https://chat.example/v1',
  model: 'custom-chat-model',
  protocol: 'chat-completions',
  reasoningEffort: 'max',
  apiKey: 'secret',
};

describe('ChatCompletionsClient', () => {
  it('streams reasoning, text, and incrementally assembled tool calls', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const events = [
      {
        model: 'custom-chat-model',
        choices: [
          {
            delta: {
              reasoning_content: 'Need a tool.',
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: { name: 'get_', arguments: '{"loc' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              content: 'Checking.',
              tool_calls: [
                {
                  index: 0,
                  function: { name: 'weather', arguments: 'ation":"杭州"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
    ];
    const stream = `${events
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join('')}data: [DONE]\n\n`;
    const client = new ChatCompletionsClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const reasoning = vi.fn();
    const text = vi.fn();
    const tool = vi.fn();

    await expect(
      client.stream(
        {
          model: config.model,
          reasoningEffort: 'max',
          messages: [{ role: 'user', content: '天气' }],
          tools: [
            {
              name: 'get_weather',
              description: 'Get weather.',
              strict: true,
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
                required: ['location'],
                additionalProperties: false,
              },
            },
          ],
        },
        {
          onReasoningDelta: reasoning,
          onTextDelta: text,
          onToolCall: tool,
        },
      ),
    ).resolves.toMatchObject({
      model: 'custom-chat-model',
      reasoning: 'Need a tool.',
      text: 'Checking.',
      toolCalls: [
        {
          id: 'call-1',
          name: 'get_weather',
          arguments: '{"location":"杭州"}',
        },
      ],
    });
    expect(normalizeChatCompletionsApiBaseUrl(config.baseUrl)).toBe(
      'https://chat.example/v1',
    );
    expect(reasoning).toHaveBeenCalledWith('Need a tool.');
    expect(text).toHaveBeenCalledWith('Checking.');
    expect(tool).toHaveBeenLastCalledWith({
      id: 'call-1',
      name: 'get_weather',
      arguments: '{"location":"杭州"}',
    });
    expect(requestBody).toMatchObject({
      model: 'custom-chat-model',
      reasoning_effort: 'max',
      stream: true,
    });
  });

  it('omits reasoning effort when disabled without removing tool definitions', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ChatCompletionsClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: '完成。' },
                finish_reason: 'stop',
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
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

    expect(requestBody).not.toHaveProperty('reasoning_effort');
    expect(requestBody).not.toHaveProperty('thinking');
    expect(requestBody).toMatchObject({
      tool_choice: 'required',
      tools: [{ type: 'function', function: { name: 'inspect_page' } }],
    });
  });

  it('requests native JSON output without requiring a tool call', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ChatCompletionsClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: '{"ok":true}' },
                finish_reason: 'stop',
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
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
      response_format: { type: 'json_object' },
    });
    expect(requestBody).not.toHaveProperty('tools');
    expect(requestBody).not.toHaveProperty('tool_choice');
  });

  it('replays reasoning content with assistant tool calls', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ChatCompletionsClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: 'Done.' },
                finish_reason: 'stop',
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      }),
    );

    await client.stream(
      {
        model: config.model,
        reasoningEffort: 'high',
        messages: [
          {
            role: 'assistant',
            content: 'I will inspect.',
            reasoning: 'Need installed scripts.',
            toolCalls: [
              { id: 'call-1', name: 'list_userscripts', arguments: '{}' },
            ],
          },
          { role: 'tool', toolCallId: 'call-1', content: '[]' },
        ],
      },
      {},
    );

    expect(requestBody).toMatchObject({
      messages: [
        {
          role: 'assistant',
          content: 'I will inspect.',
          reasoning_content: 'Need installed scripts.',
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'list_userscripts', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call-1', content: '[]' },
      ],
    });
  });

  it('maps image attachments to standard multimodal user content', async () => {
    let requestBody: Record<string, unknown> | null = null;
    const client = new ChatCompletionsClient(
      config,
      vi.fn(async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: '已查看图片。' },
                finish_reason: 'stop',
              },
            ],
          })}\n\ndata: [DONE]\n\n`,
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
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '检查截图' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,aGVsbG8=' },
            },
          ],
        },
      ],
    });
  });

  it('keeps multiple streamed tool calls distinct and ordered', async () => {
    const events = [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  function: {
                    name: 'list_userscripts',
                    arguments: '{}',
                  },
                },
                {
                  index: 1,
                  id: 'call-2',
                  function: {
                    name: 'read_userscript',
                    arguments: '{"script_id":',
                  },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 1,
                  function: { arguments: '"script-1"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
    ];
    const client = new ChatCompletionsClient(
      config,
      vi.fn(async () => {
        const stream = `${events
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join('')}data: [DONE]\n\n`;
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );

    await expect(
      client.stream(
        {
          model: config.model,
          reasoningEffort: 'high',
          messages: [{ role: 'user', content: '检查脚本' }],
        },
        {},
      ),
    ).resolves.toMatchObject({
      toolCalls: [
        { id: 'call-1', name: 'list_userscripts', arguments: '{}' },
        {
          id: 'call-2',
          name: 'read_userscript',
          arguments: '{"script_id":"script-1"}',
        },
      ],
    });
  });
});
