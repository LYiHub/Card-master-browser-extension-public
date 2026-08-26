import { describe, expect, it } from 'vitest';

import { EXTENSION_CHANNEL } from './extension-channel';
import { newTabRequest } from './new-tab-protocol';
import { extensionRequest } from './protocol';

describe('new-tab protocol', () => {
  it('accepts bounded search requests through the shared extension protocol', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-search',
      query: 'card master',
      limit: 12,
      sources: ['history', 'bookmark'],
      blacklist: [{ mode: 'domain', value: 'blocked.example' }],
    };

    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
  });

  it('rejects unknown sources and unbounded inputs', () => {
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-search',
        query: 'query',
        limit: 101,
        sources: ['unknown'],
        blacklist: [],
      }),
    ).toBe(false);
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-favicon-read',
        url: 'https://example.com/',
        size: 512,
      }),
    ).toBe(false);
  });

  it('requires an actual bookmark mutation', () => {
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-bookmark-update',
        id: 'bookmark-1',
      }),
    ).toBe(false);
    expect(
      newTabRequest({
        channel: EXTENSION_CHANNEL,
        type: 'new-tab-bookmark-move',
        id: 'bookmark-1',
      }),
    ).toBe(false);
  });

  it('accepts the dedicated new-tab settings command', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-settings-open',
    };
    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
  });

  it('accepts the dedicated browser new-tab command', () => {
    const request = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-open',
    };
    expect(newTabRequest(request)).toBe(true);
    expect(extensionRequest(request)).toBe(true);
  });

  it('accepts daily wallpaper status and manual generation commands', () => {
    for (const type of [
      'new-tab-daily-review-wallpaper-read',
      'new-tab-daily-review-wallpaper-generate',
    ]) {
      const request = {
        channel: EXTENSION_CHANNEL,
        type,
      };
      expect(newTabRequest(request)).toBe(true);
      expect(extensionRequest(request)).toBe(true);
    }
    const custom = {
      channel: EXTENSION_CHANNEL,
      type: 'new-tab-daily-review-wallpaper-generate',
      plan: {
        summary: '今天把一个想法整理成了可以开始执行的计划。',
        image_prompt: '云海中的明亮工坊正在组装一座通往远方的桥梁。',
      },
    };
    expect(newTabRequest(custom)).toBe(true);
    expect(extensionRequest(custom)).toBe(true);
    expect(
      newTabRequest({
        ...custom,
        plan: { summary: '', image_prompt: '一幅中文画面。' },
      }),
    ).toBe(false);
  });
});
