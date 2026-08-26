export function mediaSpeedWheelPointerMoved(
  movementX: number,
  movementY: number,
) {
  return movementX !== 0 || movementY !== 0;
}

export function mediaSpeedWheelFocusIsIntentional(
  relatedTarget: EventTarget | null,
  focusVisible: boolean,
) {
  return relatedTarget !== null && focusVisible;
}
