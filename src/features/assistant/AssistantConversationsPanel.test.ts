import { describe, expect, it } from 'vitest';

import type { AiConversationSnapshot } from '../../ai/domain/types';
import { assistantHistoryConversations } from './AssistantConversationsPanel';

describe('assistant conversation history', () => {
  it('excludes empty drafts', () => {
    const snapshot: AiConversationSnapshot = {
      activeConversationId: 'draft',
      conversations: [
        {
          id: 'draft',
          title: '新会话',
          createdAt: 2,
          updatedAt: 2,
          messageCount: 0,
        },
        {
          id: 'saved',
          title: '已有会话',
          createdAt: 1,
          updatedAt: 1,
          messageCount: 2,
        },
      ],
      messages: [],
      running: false,
    };

    expect(
      assistantHistoryConversations(snapshot.conversations).map(
        (conversation) => conversation.id,
      ),
    ).toEqual(['saved']);
  });
});
