export type GamepadScrollAxis = 'x' | 'y';

export type GamepadScrollMetrics = {
  position: number;
  clientSize: number;
  scrollSize: number;
};

type GamepadScrollTarget = Element | Window;

export function gamepadScrollAxisHasCapacity(
  metrics: GamepadScrollMetrics,
  delta: number,
) {
  if (delta === 0 || metrics.scrollSize <= metrics.clientSize + 1) return false;
  const maximum = metrics.scrollSize - metrics.clientSize;
  return delta < 0 ? metrics.position > 1 : metrics.position < maximum - 1;
}

function scrollMetrics(element: Element, axis: GamepadScrollAxis) {
  return axis === 'x'
    ? {
        position: element.scrollLeft,
        clientSize: element.clientWidth,
        scrollSize: element.scrollWidth,
      }
    : {
        position: element.scrollTop,
        clientSize: element.clientHeight,
        scrollSize: element.scrollHeight,
      };
}

function composedParent(element: Element) {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  const host =
    root && typeof root === 'object' && 'host' in root
      ? (root as { host?: unknown }).host
      : null;
  return host && typeof host === 'object' && 'nodeType' in host
    ? (host as Element)
    : null;
}

function overflowAllowsScroll(element: Element, axis: GamepadScrollAxis) {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;
  return /(auto|scroll|overlay)/.test(
    axis === 'x' ? style.overflowX : style.overflowY,
  );
}

function documentScrollMetrics(
  pageDocument: Document,
  axis: GamepadScrollAxis,
) {
  const view = pageDocument.defaultView;
  const root = pageDocument.scrollingElement ?? pageDocument.documentElement;
  const body = pageDocument.body;
  return axis === 'x'
    ? {
        position: view?.scrollX ?? root?.scrollLeft ?? 0,
        clientSize:
          view?.innerWidth ?? root?.clientWidth ?? body?.clientWidth ?? 0,
        scrollSize: Math.max(
          root?.scrollWidth ?? 0,
          pageDocument.documentElement?.scrollWidth ?? 0,
          body?.scrollWidth ?? 0,
        ),
      }
    : {
        position: view?.scrollY ?? root?.scrollTop ?? 0,
        clientSize:
          view?.innerHeight ?? root?.clientHeight ?? body?.clientHeight ?? 0,
        scrollSize: Math.max(
          root?.scrollHeight ?? 0,
          pageDocument.documentElement?.scrollHeight ?? 0,
          body?.scrollHeight ?? 0,
        ),
      };
}

export function gamepadScrollableTargetForDelta(
  pageDocument: Document,
  target: Element | null,
  axis: GamepadScrollAxis,
  delta: number,
): GamepadScrollTarget | null {
  const root = pageDocument.scrollingElement ?? pageDocument.documentElement;
  let current = target;
  while (current) {
    if (
      current !== root &&
      current !== pageDocument.documentElement &&
      current !== pageDocument.body &&
      overflowAllowsScroll(current, axis) &&
      gamepadScrollAxisHasCapacity(scrollMetrics(current, axis), delta)
    ) {
      return current;
    }
    current = composedParent(current);
  }
  if (
    !gamepadScrollAxisHasCapacity(
      documentScrollMetrics(pageDocument, axis),
      delta,
    )
  ) {
    return null;
  }
  return pageDocument.defaultView ?? root;
}

function scrollTargetBy(
  target: GamepadScrollTarget,
  left: number,
  top: number,
) {
  target.scrollBy({ left, top, behavior: 'instant' as ScrollBehavior });
}

export function scrollPageByGamepadDelta(
  pageDocument: Document,
  target: Element | null,
  deltaX: number,
  deltaY: number,
) {
  const horizontal = gamepadScrollableTargetForDelta(
    pageDocument,
    target,
    'x',
    deltaX,
  );
  const vertical = gamepadScrollableTargetForDelta(
    pageDocument,
    target,
    'y',
    deltaY,
  );
  if (horizontal && horizontal === vertical) {
    scrollTargetBy(horizontal, deltaX, deltaY);
    return true;
  }
  if (horizontal) scrollTargetBy(horizontal, deltaX, 0);
  if (vertical) scrollTargetBy(vertical, 0, deltaY);
  return Boolean(horizontal || vertical);
}
