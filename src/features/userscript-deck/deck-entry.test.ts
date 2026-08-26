import { describe, expect, it } from 'vitest';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import { MEDIA_RESOURCES_CARD_ID } from '../../media-resources/domain/types';
import {
  DECK_STEWARD_CARD_ID,
  NEW_TAB_CARD_ID,
} from '../../system-cards/domain/catalog';
import {
  applyDeckEntrySettingsMutation,
  DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
  DECK_CREATION_PREVIEW_MESSAGE_TYPE,
  DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
  DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
  DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
  DEFAULT_DECK_ENTRY_SETTINGS,
  deckCardHidden,
  deckTriggerHidden,
  isDeckCreationPreviewMessage,
  isDeckEntrySettingsChangedMessage,
  isDeckEntrySettingsMessage,
  isDeckVisibilityRequestMessage,
  normalizeDeckEntrySettings,
  persistableDeckEntrySettings,
  setDeckCardHidden,
  withStewardSessionHidden,
} from './deck-entry';
import { DECK_ENTRY_LAYOUT } from './deck-entry-layout';
import {
  createDeckEntryDragSession,
  normalizedDeckEntryPosition,
  updateDeckEntryDragSession,
} from './deck-entry-position';

describe('deck entry settings', () => {
  it('defaults to a visible bottom-right trigger', () => {
    expect(normalizeDeckEntrySettings(null)).toEqual(
      DEFAULT_DECK_ENTRY_SETTINGS,
    );
    expect(DEFAULT_DECK_ENTRY_SETTINGS.hiddenCardIds).toEqual([
      NEW_TAB_CARD_ID,
      GAMEPAD_CONTROL_CARD_ID,
      MEDIA_RESOURCES_CARD_ID,
      'preinstalled-copying-lifted',
    ]);
  });

  it('preserves an explicit hidden trigger setting', () => {
    expect(normalizeDeckEntrySettings({ showDeckTrigger: false })).toEqual({
      showDeckTrigger: false,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: null,
      hiddenCardIds: [
        NEW_TAB_CARD_ID,
        GAMEPAD_CONTROL_CARD_ID,
        MEDIA_RESOURCES_CARD_ID,
        'preinstalled-copying-lifted',
      ],
    });
  });

  it('does not replace the visible trigger with the bottom launch anchor while settings load', () => {
    expect(deckTriggerHidden(null)).toBe(false);
    expect(
      deckTriggerHidden({
        ...DEFAULT_DECK_ENTRY_SETTINGS,
        showDeckTrigger: true,
      }),
    ).toBe(false);
    expect(
      deckTriggerHidden({
        ...DEFAULT_DECK_ENTRY_SETTINGS,
        showDeckTrigger: false,
      }),
    ).toBe(true);
  });

  it('preserves only finite normalized trigger positions', () => {
    expect(
      normalizeDeckEntrySettings({
        showDeckTrigger: true,
        position: { x: 0.32, y: 0.68 },
      }),
    ).toEqual({
      showDeckTrigger: true,
      showToolbarBadge: true,
      showDeckTriggerBadge: true,
      position: { x: 0.32, y: 0.68 },
      hiddenCardIds: [
        NEW_TAB_CARD_ID,
        GAMEPAD_CONTROL_CARD_ID,
        MEDIA_RESOURCES_CARD_ID,
        'preinstalled-copying-lifted',
      ],
    });
    expect(
      normalizeDeckEntrySettings({
        showDeckTrigger: true,
        position: { x: 1.2, y: 0.5 },
      }),
    ).toEqual(DEFAULT_DECK_ENTRY_SETTINGS);
  });

  it('normalizes and updates hidden card identities without changing enablement', () => {
    const settings = normalizeDeckEntrySettings({
      showDeckTrigger: true,
      position: null,
      hiddenCardIds: [
        'script-a',
        'script-a',
        '',
        42,
        DECK_STEWARD_CARD_ID,
        'system-theme-weaver',
      ],
    });

    expect(settings.hiddenCardIds).toEqual([
      'script-a',
      DECK_STEWARD_CARD_ID,
      'system-theme-weaver',
    ]);
    expect(deckCardHidden(settings, 'script-a')).toBe(true);

    const restored = setDeckCardHidden(settings, 'script-a', false);
    expect(restored.hiddenCardIds).toEqual([
      DECK_STEWARD_CARD_ID,
      'system-theme-weaver',
    ]);
    expect(setDeckCardHidden(restored, 'script-b', true).hiddenCardIds).toEqual(
      [DECK_STEWARD_CARD_ID, 'system-theme-weaver', 'script-b'],
    );
    expect(
      setDeckCardHidden(restored, DECK_STEWARD_CARD_ID, false).hiddenCardIds,
    ).toEqual(['system-theme-weaver']);
    expect(persistableDeckEntrySettings(settings).hiddenCardIds).toEqual([
      'script-a',
      'system-theme-weaver',
    ]);
    expect(withStewardSessionHidden(settings, true).hiddenCardIds).toEqual([
      'script-a',
      'system-theme-weaver',
      DECK_STEWARD_CARD_ID,
    ]);
    expect(withStewardSessionHidden(settings, false).hiddenCardIds).toEqual([
      'script-a',
      'system-theme-weaver',
    ]);
  });

  it('applies field-level mutations without replacing unrelated settings', () => {
    const settings = {
      ...DEFAULT_DECK_ENTRY_SETTINGS,
      position: { x: 0.3, y: 0.7 },
      hiddenCardIds: ['script-a'],
    };

    expect(
      applyDeckEntrySettingsMutation(settings, {
        kind: 'set-card-hidden',
        cardId: 'script-b',
        hidden: true,
      }),
    ).toEqual({
      ...settings,
      hiddenCardIds: ['script-a', 'script-b'],
    });
    expect(
      applyDeckEntrySettingsMutation(settings, {
        kind: 'set-trigger-visible',
        visible: false,
      }),
    ).toEqual({
      ...settings,
      showDeckTrigger: false,
    });
    expect(
      applyDeckEntrySettingsMutation(settings, {
        kind: 'set-toolbar-badge-visible',
        visible: false,
      }),
    ).toEqual({
      ...settings,
      showToolbarBadge: false,
    });
    expect(
      applyDeckEntrySettingsMutation(settings, {
        kind: 'set-trigger-badge-visible',
        visible: false,
      }),
    ).toEqual({
      ...settings,
      showDeckTriggerBadge: false,
    });
  });

  it('accepts only complete settings mutations', () => {
    expect(
      isDeckEntrySettingsMessage({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
        mutation: {
          kind: 'set-card-hidden',
          cardId: 'script-a',
          hidden: true,
        },
      }),
    ).toBe(true);
    expect(
      isDeckEntrySettingsMessage({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_ENTRY_SETTINGS_UPDATE_MESSAGE_TYPE,
        mutation: {
          kind: 'set-position',
          position: { x: 1.2, y: 0.4 },
        },
      }),
    ).toBe(false);
  });

  it('requires an explicit extension-page tab identity during bootstrap', () => {
    expect(
      isDeckEntrySettingsMessage({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
        url: 'chrome-extension://extension-id/new-tab.html',
        tabId: 42,
      }),
    ).toBe(true);
    expect(
      isDeckEntrySettingsMessage({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
        url: 'https://example.com/',
        tabId: null,
      }),
    ).toBe(true);
    expect(
      isDeckEntrySettingsMessage({
        channel: DECK_ENTRY_SETTINGS_MESSAGE_CHANNEL,
        type: DECK_BOOTSTRAP_READ_MESSAGE_TYPE,
        url: 'chrome-extension://extension-id/new-tab.html',
      }),
    ).toBe(false);
  });

  it('keeps dragged trigger bounds inside the viewport', () => {
    expect(
      normalizedDeckEntryPosition({
        centerX: -100,
        centerY: 2_000,
        insets: {
          left: 47,
          right: 47,
          top: 70,
          bottom: 56,
        },
        viewportWidth: 1_000,
        viewportHeight: 800,
      }),
    ).toEqual({
      x: 47 / 1_000,
      y: 744 / 800,
    });
    expect(
      normalizedDeckEntryPosition({
        centerX: 500,
        centerY: -100,
        insets: {
          left: 47,
          right: 47,
          top: 147,
          bottom: 56,
        },
        viewportWidth: 1_000,
        viewportHeight: 800,
      }).y,
    ).toBe(147 / 800);
  });

  it('shares one drag threshold and position update across deck entry hosts', () => {
    const session = createDeckEntryDragSession({
      pointerId: 1,
      pointerX: 900,
      pointerY: 700,
      centerX: 902,
      centerY: 700,
      viewportWidth: 1_000,
      viewportHeight: 800,
      position: null,
      insets: DECK_ENTRY_LAYOUT.drag.insets,
    });

    expect(session).toMatchObject({
      insets: DECK_ENTRY_LAYOUT.drag.insets,
    });

    expect(
      updateDeckEntryDragSession(session, {
        pointerX: 903,
        pointerY: 704,
        viewportWidth: 1_000,
        viewportHeight: 800,
      }),
    ).toBeNull();

    expect(
      updateDeckEntryDragSession(session, {
        pointerX: 910,
        pointerY: 700,
        viewportWidth: 1_000,
        viewportHeight: 800,
      }),
    ).toMatchObject({
      started: true,
    });
    expect(session.moved).toBe(true);
  });

  it('recognizes explicit visibility requests without accepting invalid states', () => {
    expect(
      isDeckVisibilityRequestMessage({
        type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
        visibility: 'open',
      }),
    ).toBe(true);
    expect(
      isDeckVisibilityRequestMessage({
        type: DECK_VISIBILITY_REQUEST_MESSAGE_TYPE,
        visibility: 'hidden',
      }),
    ).toBe(false);
  });

  it('recognizes only identified card creation preview requests', () => {
    expect(
      isDeckCreationPreviewMessage({
        type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
        requestId: 'preview-1',
        scriptId: 'script-1',
      }),
    ).toBe(true);
    expect(
      isDeckCreationPreviewMessage({
        type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
        requestId: '',
      }),
    ).toBe(false);
    expect(
      isDeckCreationPreviewMessage({
        type: DECK_CREATION_PREVIEW_MESSAGE_TYPE,
        requestId: 'preview-1',
        scriptId: '',
      }),
    ).toBe(false);
  });

  it('recognizes only complete synchronized settings messages', () => {
    expect(
      isDeckEntrySettingsChangedMessage({
        type: 'deck-entry-settings-changed',
        settings: {
          showDeckTrigger: true,
          showToolbarBadge: true,
          showDeckTriggerBadge: true,
          position: { x: 0.4, y: 0.6 },
          hiddenCardIds: ['script-a'],
        },
      }),
    ).toBe(true);
    expect(
      isDeckEntrySettingsChangedMessage({
        type: 'deck-entry-settings-changed',
        settings: { showDeckTrigger: true, hiddenCardIds: [] },
      }),
    ).toBe(false);
  });
});
