export type GamepadPageInteractionMode = 'cursor' | 'spatial';

export function activateGamepadPageTarget({
  mode,
  activateSpatial,
  activateVirtualPointer,
  activateCursor,
}: {
  mode: GamepadPageInteractionMode;
  activateSpatial(): boolean;
  activateVirtualPointer(): boolean;
  activateCursor(): boolean;
}) {
  if (mode === 'spatial') return activateSpatial();
  return activateVirtualPointer() || activateCursor();
}

export function reconcileGamepadPageLifecycle({
  active,
  requireNeutral,
  resetMotion,
  hideVisuals,
  showVisuals,
}: {
  active: boolean;
  requireNeutral(): void;
  resetMotion(): void;
  hideVisuals(): void;
  showVisuals(): void;
}) {
  requireNeutral();
  resetMotion();
  if (active) showVisuals();
  else hideVisuals();
}
