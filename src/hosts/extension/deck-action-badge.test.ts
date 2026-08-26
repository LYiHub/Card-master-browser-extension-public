import { describe, expect, it, vi } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import {
  DeckActionBadgeController,
  deckActionBadgeText,
} from './deck-action-badge';

function controller() {
  const setBadgeBackgroundColor = vi.fn(async () => undefined);
  const setBadgeTextColor = vi.fn(async () => undefined);
  const setBadgeText = vi.fn(async () => undefined);
  const api = {
    action: {
      setBadgeBackgroundColor,
      setBadgeTextColor,
      setBadgeText,
    },
  } as unknown as ExtensionBackgroundApi;
  return {
    badge: new DeckActionBadgeController(api),
    setBadgeBackgroundColor,
    setBadgeTextColor,
    setBadgeText,
  };
}

describe('deck action badge', () => {
  it('formats active card counts without changing the toolbar icon', () => {
    expect(deckActionBadgeText(4)).toBe('4');
    expect(deckActionBadgeText(120)).toBe('99+');
  });

  it('shows and clears a tab badge independently', async () => {
    const setup = controller();

    await setup.badge.initialize();
    await setup.badge.setTabCount(7, 12, true);
    await setup.badge.setTabCount(7, 12, false);

    expect(setup.setBadgeBackgroundColor).toHaveBeenCalledOnce();
    expect(setup.setBadgeTextColor).toHaveBeenCalledWith({
      color: '#241a08',
    });
    expect(setup.setBadgeText).toHaveBeenNthCalledWith(1, {
      tabId: 7,
      text: '12',
    });
    expect(setup.setBadgeText).toHaveBeenNthCalledWith(2, {
      tabId: 7,
      text: '',
    });
  });
});
