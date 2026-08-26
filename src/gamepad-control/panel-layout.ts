import { DECK_ENTRY_LAYOUT } from '../features/userscript-deck/deck-entry-layout';

export type GamepadPanelPlacement = 'left' | 'right';

export type GamepadPanelLayout = {
  x: number;
  y: number;
  placement: GamepadPanelPlacement;
};

export function gamepadPanelPresentationReady({
  connected,
  pageReady,
  deckSettingsReady,
  positionReady,
  artworkReady,
}: {
  connected: boolean;
  pageReady: boolean;
  deckSettingsReady: boolean;
  positionReady: boolean;
  artworkReady: boolean;
}) {
  return (
    connected && pageReady && deckSettingsReady && positionReady && artworkReady
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function gamepadPanelLayout({
  anchor,
  viewport,
  speedWheelVisible,
  panel = { width: 154, height: 112 },
  margin = 10,
  gap = 14,
}: {
  anchor: { x: number; y: number };
  viewport: { width: number; height: number };
  speedWheelVisible: boolean;
  panel?: { width: number; height: number };
  margin?: number;
  gap?: number;
}): GamepadPanelLayout {
  const anchorWidth = speedWheelVisible
    ? DECK_ENTRY_LAYOUT.dock.width
    : DECK_ENTRY_LAYOUT.core.buttonWidth;
  const minX = margin + panel.width / 2;
  const maxX = viewport.width - margin - panel.width / 2;
  const minY = margin + panel.height / 2;
  const maxY = viewport.height - margin - panel.height / 2;

  const leftSpace = anchor.x - anchorWidth / 2 - margin;
  const rightSpace = viewport.width - anchor.x - anchorWidth / 2 - margin;
  const placement: GamepadPanelPlacement =
    rightSpace >= panel.width + gap || rightSpace >= leftSpace
      ? 'right'
      : 'left';
  const direction = placement === 'right' ? 1 : -1;
  return {
    x: clamp(
      anchor.x + direction * (anchorWidth / 2 + gap + panel.width / 2),
      minX,
      maxX,
    ),
    y: clamp(anchor.y, minY, maxY),
    placement,
  };
}
