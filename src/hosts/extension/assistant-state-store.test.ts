import { describe, expect, it, vi } from 'vitest';

import type { ExtensionStorageArea } from './api';
import { AI_CONVERSATION_STORAGE_KEY } from './assistant-state';
import { ExtensionAssistantStateStore } from './assistant-state-store';

describe('ExtensionAssistantStateStore', () => {
  it('shares one initial read across concurrent callers', async () => {
    const get = vi.fn(async () => ({}));
    const store = new ExtensionAssistantStateStore({
      get,
      set: vi.fn(async () => undefined),
    } as unknown as ExtensionStorageArea);

    const [first, second] = await Promise.all([store.read(), store.read()]);

    expect(get).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it('serializes persisted snapshots in mutation order', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const store = new ExtensionAssistantStateStore({
      get: vi.fn(async () => ({})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        await Promise.resolve();
        writes.push(items);
      }),
    } as unknown as ExtensionStorageArea);
    const state = await store.read();
    state.activeConversationId = 'first';
    const first = store.persist();
    state.activeConversationId = 'second';
    const second = store.persist();

    await Promise.all([first, second]);

    expect(writes[0]?.[AI_CONVERSATION_STORAGE_KEY]).toMatchObject({
      activeConversationId: 'first',
    });
    expect(writes[1]?.[AI_CONVERSATION_STORAGE_KEY]).toMatchObject({
      activeConversationId: 'second',
    });
  });
});
