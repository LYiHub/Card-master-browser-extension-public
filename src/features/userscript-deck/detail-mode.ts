import {
  type DeckCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isInstalledUserscript,
  isMediaSpeedCard,
  isPageThemeCard,
} from './cards';

export type UserscriptDetailMode =
  | 'manage'
  | 'global-settings'
  | 'content-blocking-settings'
  | 'page-theme-site'
  | 'page-theme-settings'
  | 'media-speed-settings'
  | 'gamepad-settings'
  | 'bilibili-capability-settings';

export function settingsDetailModeForCard(
  card: DeckCard,
): UserscriptDetailMode | null {
  if (isInstalledUserscript(card)) return 'manage';
  if (card.kind === 'steward') return 'global-settings';
  if (isGamepadControlCard(card)) return 'gamepad-settings';
  if (isContentBlockingCard(card)) return 'content-blocking-settings';
  if (isPageThemeCard(card)) return 'page-theme-settings';
  if (isMediaSpeedCard(card)) return 'media-speed-settings';
  if (isBilibiliCapabilityCard(card)) {
    return 'bilibili-capability-settings';
  }
  return null;
}
