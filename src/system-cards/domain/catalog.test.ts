import { describe, expect, it } from 'vitest';

import {
  DECK_STEWARD_CARD_ID,
  isSystemCardId,
  NEW_TAB_CARD_ID,
  SYSTEM_CARD_CATALOG,
  systemCardDefinition,
  systemCardOfferedOnTarget,
} from './catalog';

describe('system card catalog', () => {
  it('contains every fixed system card exactly once', () => {
    const ids = SYSTEM_CARD_CATALOG.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DECK_STEWARD_CARD_ID);
    expect(ids).toContain(NEW_TAB_CARD_ID);
    expect(ids).toContain('system-content-blocker');
    expect(ids).toContain('system-theme-weaver');
    expect(ids).toContain('system-media-speed');
    expect(ids).toContain('system-media-resources');
    expect(ids).toContain('system-gamepad-control');
    expect(ids).toContain('system-bilibili-recommendation-control');
    expect(ids).toContain('system-bilibili-danmaku-compression');
    expect(ids).toContain('system-bilibili-segment-skipping');
  });

  it('allows every system card to be hidden from the spread', () => {
    expect(
      SYSTEM_CARD_CATALOG.filter((definition) => !definition.hideable),
    ).toEqual([]);
  });

  it('does not offer CatCatch or the new-tab card on Safari', () => {
    expect(systemCardOfferedOnTarget('system-media-resources', 'safari')).toBe(
      false,
    );
    expect(systemCardOfferedOnTarget(NEW_TAB_CARD_ID, 'safari')).toBe(false);
    expect(
      systemCardOfferedOnTarget('system-media-resources', 'chromium'),
    ).toBe(true);
    expect(systemCardOfferedOnTarget(NEW_TAB_CARD_ID, 'chromium')).toBe(true);
  });

  it('provides a single lookup for card identity and copy', () => {
    expect(isSystemCardId(NEW_TAB_CARD_ID)).toBe(true);
    expect(systemCardDefinition(NEW_TAB_CARD_ID)).toMatchObject({
      title: '新标签页',
      kind: 'new-tab',
      description: '用AI每日回顾壁纸、电子相框和搜索重做新标签页。',
    });
  });
});
