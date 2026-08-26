import { describe, expect, it, vi } from 'vitest';
import {
  gamepadScopeUsesSemanticIntents,
  INPUT_SCOPE_PRIORITY,
  type InputScope,
  routeInputIntent,
  selectInputScope,
} from './coordinator';
import type { IntentEnvelope } from './intents';

function gamepadIntent(
  type: 'browserTabPrevious' | 'browserTabNext' | 'confirm',
): IntentEnvelope {
  return {
    intent: { type },
    source: 'gamepad',
    deviceId: 'controller',
    phase: 'pressed',
    timestamp: 1,
  };
}

describe('input coordinator routing', () => {
  it('places expanded workspace views above their workspace but below dialogs', () => {
    expect(INPUT_SCOPE_PRIORITY.expandedView).toBeGreaterThan(
      INPUT_SCOPE_PRIORITY.workspace,
    );
    expect(INPUT_SCOPE_PRIORITY.expandedView).toBeLessThan(
      INPUT_SCOPE_PRIORITY.dialog,
    );

    const workspace: InputScope = {
      id: 'workspace',
      priority: INPUT_SCOPE_PRIORITY.workspace,
      handle: () => true,
    };
    const expandedView: InputScope = {
      id: 'expanded-view',
      priority: INPUT_SCOPE_PRIORITY.expandedView,
      handle: () => true,
    };
    const dialog: InputScope = {
      id: 'dialog',
      priority: INPUT_SCOPE_PRIORITY.dialog,
      handle: () => true,
    };

    expect(selectInputScope([workspace, expandedView], 'keyboard')).toBe(
      expandedView,
    );
    expect(
      selectInputScope([workspace, expandedView, dialog], 'keyboard'),
    ).toBe(dialog);
  });

  it('selects the highest scope that accepts the current input modality', () => {
    const deck: InputScope = {
      id: 'deck',
      priority: 500,
      handle: () => true,
    };
    const gamepadInspection: InputScope = {
      id: 'gamepad-inspection',
      priority: 2_000,
      modalities: ['gamepad'],
      handle: () => true,
    };
    const scopes = [deck, gamepadInspection];

    expect(selectInputScope(scopes, 'gamepad')).toBe(gamepadInspection);
    expect(selectInputScope(scopes, 'keyboard')).toBe(deck);
    expect(selectInputScope(scopes, 'pointer')).toBe(deck);
  });

  it('falls through a closing scope to the next active owner', () => {
    const deck: InputScope = {
      id: 'deck',
      priority: INPUT_SCOPE_PRIORITY.deck,
      handle: () => true,
    };
    const dialog: InputScope = {
      id: 'dialog',
      priority: INPUT_SCOPE_PRIORITY.dialog,
      active: () => false,
      handle: () => true,
    };

    expect(selectInputScope([deck, dialog], 'keyboard')).toBe(deck);
  });

  it('does not translate snapshots owned by an exclusive scope', () => {
    expect(gamepadScopeUsesSemanticIntents({ exclusive: true })).toBe(false);
    expect(gamepadScopeUsesSemanticIntents({ exclusive: false })).toBe(true);
    expect(gamepadScopeUsesSemanticIntents({})).toBe(true);
  });

  it('lets an exclusive scope consume L2 and R2 before browser tab fallback', () => {
    const handle = vi.fn(() => false);
    const switchBrowserTab = vi.fn();

    expect(
      routeInputIntent(
        gamepadIntent('browserTabPrevious'),
        { exclusive: true, handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(
      routeInputIntent(
        gamepadIntent('browserTabNext'),
        { exclusive: true, handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(handle).toHaveBeenCalledTimes(2);
    expect(switchBrowserTab).not.toHaveBeenCalled();
  });

  it('preserves browser tab fallback when the active scope declines the intent', () => {
    const handle = vi.fn(() => false);
    const switchBrowserTab = vi.fn();

    expect(
      routeInputIntent(
        gamepadIntent('browserTabPrevious'),
        { handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(
      routeInputIntent(
        gamepadIntent('browserTabNext'),
        { handle },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(switchBrowserTab.mock.calls).toEqual([['previous'], ['next']]);
  });

  it('returns the active scope result for ordinary intents', () => {
    const switchBrowserTab = vi.fn();

    expect(
      routeInputIntent(
        gamepadIntent('confirm'),
        { handle: () => true },
        switchBrowserTab,
      ),
    ).toBe(true);
    expect(
      routeInputIntent(
        gamepadIntent('confirm'),
        { handle: () => false },
        switchBrowserTab,
      ),
    ).toBe(false);
    expect(switchBrowserTab).not.toHaveBeenCalled();
  });
});
