import { describe, expect, it } from 'vitest';

import { toolContinuationMessages } from './model-client';

describe('toolContinuationMessages', () => {
  it('keeps one result for every tool call in provider order', () => {
    expect(
      toolContinuationMessages(
        {
          text: '',
          reasoning: 'Need both summaries.',
          toolCalls: [
            { id: 'call-1', name: 'list_userscripts', arguments: '{}' },
            {
              id: 'call-2',
              name: 'read_userscript',
              arguments: '{"script_id":"script-1"}',
            },
          ],
        },
        [
          { role: 'tool', toolCallId: 'call-2', content: '{"source":"..."}' },
          { role: 'tool', toolCallId: 'call-1', content: '[]' },
        ],
      ),
    ).toEqual([
      {
        role: 'assistant',
        content: '',
        reasoning: 'Need both summaries.',
        toolCalls: [
          { id: 'call-1', name: 'list_userscripts', arguments: '{}' },
          {
            id: 'call-2',
            name: 'read_userscript',
            arguments: '{"script_id":"script-1"}',
          },
        ],
      },
      { role: 'tool', toolCallId: 'call-1', content: '[]' },
      { role: 'tool', toolCallId: 'call-2', content: '{"source":"..."}' },
    ]);
  });

  it('rejects incomplete or duplicate tool continuations', () => {
    const completion = {
      text: '',
      toolCalls: [
        { id: 'call-1', name: 'list_userscripts', arguments: '{}' },
        { id: 'call-2', name: 'list_userscripts', arguments: '{}' },
      ],
    };

    expect(() =>
      toolContinuationMessages(completion, [
        { role: 'tool', toolCallId: 'call-1', content: '[]' },
      ]),
    ).toThrow('缺少以下工具调用的结果：call-2');
    expect(() =>
      toolContinuationMessages(completion, [
        { role: 'tool', toolCallId: 'call-1', content: '[]' },
        { role: 'tool', toolCallId: 'call-1', content: '[]' },
        { role: 'tool', toolCallId: 'call-2', content: '[]' },
      ]),
    ).toThrow('工具结果重复：call-1');
  });
});
