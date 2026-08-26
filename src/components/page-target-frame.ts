export type PageTargetFrameBounds = Readonly<{
  top: number;
  left: number;
  width: number;
  height: number;
}>;

export type PageTargetFrameViewport = Readonly<{
  width: number;
  height: number;
}>;

export type PageTargetFrameGeometry = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type PageTargetFrameUpdate = Readonly<{
  target: Element | null;
  geometry: PageTargetFrameGeometry | null;
  targetChanged: boolean;
}>;

type PageTargetFrameView = Pick<
  Window,
  | 'innerWidth'
  | 'innerHeight'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pageTargetFrameGeometry(
  bounds: PageTargetFrameBounds,
  viewport: PageTargetFrameViewport,
): PageTargetFrameGeometry | null {
  const viewportWidth = Math.max(0, viewport.width);
  const viewportHeight = Math.max(0, viewport.height);
  if (
    viewportWidth === 0 ||
    viewportHeight === 0 ||
    bounds.width < 2 ||
    bounds.height < 2
  ) {
    return null;
  }

  const x = clamp(bounds.left, 0, viewportWidth);
  const y = clamp(bounds.top, 0, viewportHeight);
  const right = clamp(bounds.left + bounds.width, 0, viewportWidth);
  const bottom = clamp(bounds.top + bounds.height, 0, viewportHeight);
  const width = right - x;
  const height = bottom - y;
  return width >= 2 && height >= 2 ? { x, y, width, height } : null;
}

function sameGeometry(
  left: PageTargetFrameGeometry | null,
  right: PageTargetFrameGeometry | null,
) {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.x === right.x &&
      left.y === right.y &&
      left.width === right.width &&
      left.height === right.height)
  );
}

export function createPageTargetFrameTracker(
  view: PageTargetFrameView,
  publish: (update: PageTargetFrameUpdate) => void,
) {
  let selectedTarget: Element | null = null;
  let publishedTarget: Element | null = null;
  let publishedGeometry: PageTargetFrameGeometry | null = null;
  let frame = 0;
  let disposed = false;

  const measure = () => {
    if (selectedTarget && !selectedTarget.isConnected) {
      selectedTarget = null;
    }
    const geometry = selectedTarget
      ? pageTargetFrameGeometry(selectedTarget.getBoundingClientRect(), {
          width: view.innerWidth,
          height: view.innerHeight,
        })
      : null;
    const targetChanged = selectedTarget !== publishedTarget;
    if (!targetChanged && sameGeometry(geometry, publishedGeometry)) return;
    publishedTarget = selectedTarget;
    publishedGeometry = geometry;
    publish({
      target: publishedTarget,
      geometry: publishedGeometry,
      targetChanged,
    });
  };

  const schedule = () => {
    if (disposed || !selectedTarget || frame) return;
    frame = view.requestAnimationFrame(() => {
      frame = 0;
      measure();
      schedule();
    });
  };

  return {
    setTarget(target: Element | null) {
      if (disposed) return;
      selectedTarget = target;
      if (!target && frame) {
        view.cancelAnimationFrame(frame);
        frame = 0;
      }
      measure();
      schedule();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      selectedTarget = null;
      publishedTarget = null;
      publishedGeometry = null;
    },
  };
}
