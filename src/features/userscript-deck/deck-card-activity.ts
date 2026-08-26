import type { BilibiliCapabilitySnapshot } from '../../bilibili-capabilities/domain/types';
import { bilibiliCapabilityCardId } from '../../bilibili-capabilities/registry';
import {
  CONTENT_BLOCKER_CARD_ID,
  type ContentBlockingSnapshot,
  contentBlockingSiteState,
} from '../../content-blocking/domain/types';
import { GAMEPAD_CONTROL_CARD_ID } from '../../gamepad-control/domain/types';
import {
  MEDIA_RESOURCES_CARD_ID,
  type MediaResourcesSnapshot,
} from '../../media-resources/domain/types';
import {
  MEDIA_SPEED_CARD_ID,
  type MediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import {
  PAGE_THEME_CARD_ID,
  type PageThemeSnapshot,
} from '../../page-theme/domain/types';
import {
  DECK_STEWARD_CARD_ID,
  NEW_TAB_CARD_ID,
} from '../../system-cards/domain/catalog';
import {
  createSystemCardState,
  summarizeSystemCardStates,
} from '../../system-cards/domain/state';
import { matchInstalledUserscript } from '../../userscript/domain/matcher';
import type {
  InstalledUserscript,
  ScriptMatchContext,
} from '../../userscript/domain/types';

export const DECK_STEWARD_CARD_COUNT = 1;

export function contentBlockingCardActive(
  snapshot: ContentBlockingSnapshot | null,
  url?: string,
) {
  return (
    snapshot?.rulesEnabled === true &&
    snapshot.status !== 'error' &&
    (!url || contentBlockingSiteState(snapshot.allowlist, url).filteringEnabled)
  );
}

export function pageThemeCardActive(snapshot: PageThemeSnapshot | null) {
  return snapshot?.activeOnPage === true && snapshot.status === 'ready';
}

export function mediaSpeedCardActive(snapshot: MediaSpeedSnapshot | null) {
  return (
    snapshot?.activeOnPage === true &&
    snapshot.status !== 'error' &&
    snapshot.mediaCount > 0
  );
}

export function mediaResourcesCardActive(
  snapshot: Pick<
    MediaResourcesSnapshot,
    'available' | 'enabled' | 'activeOnPage'
  > | null,
) {
  return (
    snapshot?.available === true && snapshot.enabled && snapshot.activeOnPage
  );
}

export function activeBilibiliCapabilityCount(
  snapshots: readonly BilibiliCapabilitySnapshot[],
  hiddenCardIds: readonly string[] = [],
) {
  const hidden = new Set(hiddenCardIds);
  return snapshots.filter(
    (snapshot) =>
      !hidden.has(bilibiliCapabilityCardId(snapshot.id)) &&
      snapshot.available &&
      snapshot.enabled &&
      snapshot.activeOnPage &&
      snapshot.status !== 'error',
  ).length;
}

export function userscriptsForPage(
  scripts: readonly InstalledUserscript[],
  runtimeContext: ScriptMatchContext,
) {
  return scripts.filter(
    (script) => matchInstalledUserscript(script, runtimeContext).eligible,
  );
}

export function activeUserscriptsForPage(
  scripts: readonly InstalledUserscript[],
  runtimeContext: ScriptMatchContext,
) {
  return scripts.filter(
    (script) =>
      script.manager.enabled &&
      matchInstalledUserscript(script, runtimeContext).eligible,
  );
}

export function activeDeckCardSummary({
  scripts,
  runtimeContext,
  contentBlockingActive,
  pageThemeActive,
  gamepadControlActive,
  mediaSpeedActive = false,
  mediaResourcesActive = false,
  bilibiliCapabilityCount = 0,
  hiddenCardIds = [],
}: {
  scripts: readonly InstalledUserscript[];
  runtimeContext: ScriptMatchContext;
  contentBlockingActive: boolean;
  pageThemeActive: boolean;
  gamepadControlActive: boolean;
  mediaSpeedActive?: boolean;
  mediaResourcesActive?: boolean;
  bilibiliCapabilityCount?: number;
  hiddenCardIds?: readonly string[];
}) {
  const hidden = new Set(hiddenCardIds);
  const activeScripts = activeUserscriptsForPage(
    scripts,
    runtimeContext,
  ).filter((script) => !hidden.has(script.id));
  const states = [
    createSystemCardState({
      id: DECK_STEWARD_CARD_ID,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({ id: NEW_TAB_CARD_ID, hiddenCardIds: hidden }),
    createSystemCardState({
      id: GAMEPAD_CONTROL_CARD_ID,
      enabled: gamepadControlActive,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: CONTENT_BLOCKER_CARD_ID,
      enabled: contentBlockingActive,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: PAGE_THEME_CARD_ID,
      enabled: pageThemeActive,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: MEDIA_SPEED_CARD_ID,
      enabled: mediaSpeedActive,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: MEDIA_RESOURCES_CARD_ID,
      available: mediaResourcesActive,
      hiddenCardIds: hidden,
    }),
  ];
  return {
    count:
      summarizeSystemCardStates(states).activeCount +
      activeScripts.length +
      bilibiliCapabilityCount,
    activeScriptIds: activeScripts.map((script) => script.id),
  };
}

export function activeDeckCardCount(
  options: Parameters<typeof activeDeckCardSummary>[0],
) {
  return activeDeckCardSummary(options).count;
}

export function visibleDeckCardCount({
  scripts,
  runtimeContext,
  contentBlockingAvailable = true,
  pageThemeAvailable = true,
  gamepadControlAvailable = true,
  mediaSpeedAvailable = true,
  mediaResourcesAvailable = false,
  bilibiliCapabilityCount = 0,
  hiddenCardIds = [],
}: {
  scripts: readonly InstalledUserscript[];
  runtimeContext: ScriptMatchContext;
  contentBlockingAvailable?: boolean;
  pageThemeAvailable?: boolean;
  gamepadControlAvailable?: boolean;
  mediaSpeedAvailable?: boolean;
  mediaResourcesAvailable?: boolean;
  bilibiliCapabilityCount?: number;
  hiddenCardIds?: readonly string[];
}) {
  const hidden = new Set(hiddenCardIds);
  const visibleScripts = userscriptsForPage(scripts, runtimeContext).filter(
    (script) => !hidden.has(script.id),
  );
  const states = [
    createSystemCardState({
      id: DECK_STEWARD_CARD_ID,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({ id: NEW_TAB_CARD_ID, hiddenCardIds: hidden }),
    createSystemCardState({
      id: GAMEPAD_CONTROL_CARD_ID,
      available: gamepadControlAvailable,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: CONTENT_BLOCKER_CARD_ID,
      available: contentBlockingAvailable,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: PAGE_THEME_CARD_ID,
      available: pageThemeAvailable,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: MEDIA_SPEED_CARD_ID,
      available: mediaSpeedAvailable,
      hiddenCardIds: hidden,
    }),
    createSystemCardState({
      id: MEDIA_RESOURCES_CARD_ID,
      available: mediaResourcesAvailable,
      hiddenCardIds: hidden,
    }),
  ];
  return (
    summarizeSystemCardStates(states).visibleCount +
    visibleScripts.length +
    bilibiliCapabilityCount
  );
}
