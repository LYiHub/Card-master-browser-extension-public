import { describe, expect, it } from 'vitest';

import { GamepadActionFeed } from './action-feed';

describe('GamepadActionFeed', () => {
  it('records activation edges without repeating held controls', () => {
    const feed = new GamepadActionFeed();
    const click = { label: '点击', persistentWhileHeld: false };

    const first = feed.update([click], 0);
    expect(first).toMatchObject([{ label: '点击', count: 1 }]);
    expect(feed.update([click], 200)).toMatchObject([
      { label: '点击', count: 1 },
    ]);
    feed.update([], 300);
    const repeated = feed.update([click], 400);
    expect(repeated).toMatchObject([{ label: '点击', count: 2 }]);
    expect(repeated[0]?.id).toBe(first[0]?.id);
    expect(repeated[0]?.expiresAt).toBeGreaterThan(first[0]?.expiresAt ?? 0);
  });

  it('keeps held controls stable without a multiplier', () => {
    const feed = new GamepadActionFeed();
    const scroll = { label: '滚动', persistentWhileHeld: true };

    const first = feed.update([scroll], 0);
    expect(first).toMatchObject([
      {
        label: '滚动',
        count: null,
        expiresAt: Number.POSITIVE_INFINITY,
      },
    ]);
    expect(feed.update([scroll], 200)).toEqual(first);
    feed.update([], 300);
    const resumed = feed.update([scroll], 400);
    expect(resumed).toEqual(first);
  });

  it('keeps only the most recent entries and expires them', () => {
    const feed = new GamepadActionFeed(1_000, 3);
    const action = (label: string) => ({
      label,
      persistentWhileHeld: false,
    });
    feed.update([action('点击')], 0);
    feed.update([], 10);
    feed.update([action('返回')], 20);
    feed.update([], 30);
    feed.update([action('滚动')], 40);
    feed.update([], 50);

    expect(feed.update([action('刷新')], 60).map(({ label }) => label)).toEqual(
      ['刷新', '滚动', '返回'],
    );
    expect(feed.visible(1_100)).toEqual([]);
  });
});
