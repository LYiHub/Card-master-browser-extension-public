export type KeyboardAnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
};

export type KeyboardViewport = {
  width: number;
  height: number;
};

export type KeyboardSize = {
  width: number;
  height: number;
};

export type KeyboardLayout = {
  left: number;
  top: number;
  placement: 'above' | 'below';
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function gamepadKeyboardLayout({
  anchor,
  keyboard,
  viewport,
  gap = 8,
  margin = 12,
}: {
  anchor: KeyboardAnchorRect;
  keyboard: KeyboardSize;
  viewport: KeyboardViewport;
  gap?: number;
  margin?: number;
}): KeyboardLayout {
  const maximumLeft = Math.max(
    margin,
    viewport.width - margin - keyboard.width,
  );
  const leftEdge = clamp(
    anchor.left + anchor.width / 2 - keyboard.width / 2,
    margin,
    maximumLeft,
  );
  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - gap - keyboard.height;
  const belowSpace = viewport.height - margin - belowTop;
  const aboveSpace = anchor.top - gap - margin;
  const placement =
    belowSpace >= keyboard.height || belowSpace >= aboveSpace
      ? 'below'
      : 'above';
  const maximumTop = Math.max(
    margin,
    viewport.height - margin - keyboard.height,
  );
  const top = clamp(
    placement === 'below' ? belowTop : aboveTop,
    margin,
    maximumTop,
  );

  return {
    left: leftEdge + keyboard.width / 2,
    top,
    placement,
  };
}
