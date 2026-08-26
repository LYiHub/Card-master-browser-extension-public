import { bilibiliCapabilityCardsForPage } from '../../bilibili-capabilities/registry';
import type { ContentBlockingService } from '../../content-blocking/application/service';
import {
  activeBilibiliCapabilityCount,
  activeDeckCardCount,
  contentBlockingCardActive,
  DECK_STEWARD_CARD_COUNT,
  mediaResourcesCardActive,
  mediaSpeedCardActive,
  pageThemeCardActive,
  visibleDeckCardCount,
} from '../../features/userscript-deck/deck-card-activity';
import {
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  type DeckEntrySettings,
  normalizeDeckEntrySettings,
} from '../../features/userscript-deck/deck-entry';
import { isExtensionStorageSpaceFailure } from '../../lib/extension-errors';
import type { TransactionalScriptRepository } from '../../userscript/application/script-repository';
import type { ExtensionBackgroundApi } from './api';
import type { BilibiliCapabilityService } from './bilibili-capability-service';
import type { ExtensionGamepadControlService } from './gamepad-control-service';
import type { ExtensionMediaResourcesService } from './media-resources-service';
import type { ExtensionMediaSpeedService } from './media-speed-service';
import type { ExtensionPageThemeService } from './page-theme-service';

type DeckCardCountServiceDependencies = {
  api: ExtensionBackgroundApi;
  repository: TransactionalScriptRepository;
  mediaResources: ExtensionMediaResourcesService;
  mediaSpeed: ExtensionMediaSpeedService;
  pageTheme: ExtensionPageThemeService;
  gamepadControl: ExtensionGamepadControlService;
  contentBlocking: ContentBlockingService;
  platformCapabilities: BilibiliCapabilityService;
  storageAvailable: () => boolean;
  onStorageFailure: (error: unknown) => void;
};

export type DeckCardCounts = Readonly<{
  visibleCount: number;
  activeCount: number;
}>;

const RECOVERY_COUNTS: DeckCardCounts = {
  visibleCount: DECK_STEWARD_CARD_COUNT,
  activeCount: DECK_STEWARD_CARD_COUNT,
};

export class DeckCardCountService {
  constructor(
    private readonly dependencies: DeckCardCountServiceDependencies,
  ) {}

  async read(
    url: string,
    settings?: DeckEntrySettings,
    tabId = 0,
  ): Promise<DeckCardCounts> {
    const {
      api,
      repository,
      mediaResources,
      mediaSpeed,
      pageTheme,
      gamepadControl,
      contentBlocking,
      platformCapabilities,
      storageAvailable,
      onStorageFailure,
    } = this.dependencies;
    if (!storageAvailable()) return RECOVERY_COUNTS;

    const runtimeContext = {
      url,
      frameId: 0,
      topFrame: true,
      softNavigation: false,
    };
    try {
      const [
        scripts,
        capabilities,
        mediaResourcesSnapshot,
        mediaSpeedState,
        gamepadSettings,
        storedSettings,
      ] = await Promise.all([
        repository.list(),
        platformCapabilities.read({ tabId, url }),
        mediaResources.readCached(tabId, url),
        mediaSpeed.read({ tabId, frameId: 0, url }),
        gamepadControl.readSettings(),
        settings
          ? Promise.resolve(null)
          : api.storage.local.get(DECK_ENTRY_SETTINGS_STORAGE_KEY),
      ] as const);
      const deckEntrySettings =
        settings ??
        normalizeDeckEntrySettings(
          storedSettings?.[DECK_ENTRY_SETTINGS_STORAGE_KEY],
        );
      const visiblePlatformCount = bilibiliCapabilityCardsForPage(
        capabilities.snapshots,
        url,
      ).filter(
        (card) => !deckEntrySettings.hiddenCardIds.includes(card.id),
      ).length;
      return {
        activeCount: activeDeckCardCount({
          scripts,
          runtimeContext,
          contentBlockingActive: contentBlockingCardActive(
            contentBlocking.snapshot(),
            url,
          ),
          pageThemeActive: pageThemeCardActive(
            pageTheme.pageSnapshot(tabId, url),
          ),
          gamepadControlActive: gamepadSettings.enabled,
          mediaSpeedActive: mediaSpeedCardActive(mediaSpeedState.snapshot),
          mediaResourcesActive: mediaResourcesCardActive(
            mediaResourcesSnapshot,
          ),
          bilibiliCapabilityCount: activeBilibiliCapabilityCount(
            capabilities.snapshots,
            deckEntrySettings.hiddenCardIds,
          ),
          hiddenCardIds: deckEntrySettings.hiddenCardIds,
        }),
        visibleCount: visibleDeckCardCount({
          scripts,
          runtimeContext,
          bilibiliCapabilityCount: visiblePlatformCount,
          mediaResourcesAvailable: mediaResourcesSnapshot.available,
          hiddenCardIds: deckEntrySettings.hiddenCardIds,
        }),
      };
    } catch (error) {
      if (!isExtensionStorageSpaceFailure(error)) throw error;
      onStorageFailure(error);
      return RECOVERY_COUNTS;
    }
  }
}
