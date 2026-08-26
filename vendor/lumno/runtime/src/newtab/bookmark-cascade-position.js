(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBookmarkCascadePosition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRect(rect) {
    const source = rect || {};
    const left = toFiniteNumber(source.left, 0);
    const top = toFiniteNumber(source.top, 0);
    const width = Math.max(0, toFiniteNumber(source.width, toFiniteNumber(source.right, left) - left));
    const height = Math.max(0, toFiniteNumber(source.height, toFiniteNumber(source.bottom, top) - top));
    const right = toFiniteNumber(source.right, left + width);
    const bottom = toFiniteNumber(source.bottom, top + height);
    return { left, right, top, bottom, width, height };
  }

  function normalizeViewport(viewport) {
    const source = viewport || {};
    return {
      width: Math.max(0, toFiniteNumber(source.width, 0)),
      height: Math.max(0, toFiniteNumber(source.height, 0))
    };
  }

  function normalizePoint(point) {
    const source = point || {};
    const x = Object.prototype.hasOwnProperty.call(source, 'x') ? source.x : source.clientX;
    const y = Object.prototype.hasOwnProperty.call(source, 'y') ? source.y : source.clientY;
    const normalizedX = Number(x);
    const normalizedY = Number(y);
    if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
      return null;
    }
    return { x: normalizedX, y: normalizedY };
  }

  function clamp(value, min, max) {
    if (max < min) {
      return min;
    }
    return Math.max(min, Math.min(value, max));
  }

  function roundPlacement(placement) {
    return {
      ...placement,
      left: Math.round(placement.left),
      top: Math.round(placement.top)
    };
  }

  function parseCssTransformTranslate(transform) {
    const text = typeof transform === 'string' ? transform.trim() : '';
    if (!text || text === 'none') {
      return { x: 0, y: 0 };
    }
    const matrixMatch = text.match(/^matrix\(([^)]+)\)$/);
    if (matrixMatch) {
      const values = matrixMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
      return {
        x: Number.isFinite(values[4]) ? values[4] : 0,
        y: Number.isFinite(values[5]) ? values[5] : 0
      };
    }
    const matrix3dMatch = text.match(/^matrix3d\(([^)]+)\)$/);
    if (matrix3dMatch) {
      const values = matrix3dMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
      return {
        x: Number.isFinite(values[12]) ? values[12] : 0,
        y: Number.isFinite(values[13]) ? values[13] : 0
      };
    }
    return { x: 0, y: 0 };
  }

  function getTranslateNeutralRect(rect, transform) {
    const source = normalizeRect(rect);
    const translate = parseCssTransformTranslate(transform);
    return {
      left: source.left - translate.x,
      right: source.right - translate.x,
      top: source.top - translate.y,
      bottom: source.bottom - translate.y,
      width: source.width,
      height: source.height
    };
  }

  function getPlacementOptions(options) {
    const source = options || {};
    const padding = Math.max(0, toFiniteNumber(source.viewportPadding, 8));
    return {
      spacing: toFiniteNumber(source.spacing, 8),
      padding,
      topPadding: Math.max(
        padding,
        toFiniteNumber(source.viewportTopPadding, padding)
      )
    };
  }

  function placeRootCascadeMenu(options) {
    const source = options || {};
    const anchor = normalizeRect(source.anchorRect);
    const menu = normalizeRect(source.menuRect);
    const viewport = normalizeViewport(source.viewport);
    const { spacing, padding, topPadding } = getPlacementOptions(source);
    const maxLeft = viewport.width - menu.width - padding;
    const maxTop = viewport.height - menu.height - padding;

    let left = anchor.left;
    let horizontal = 'left';
    if (left + menu.width > viewport.width - padding) {
      const rightAlignedLeft = anchor.right - menu.width;
      horizontal = 'right';
      left = rightAlignedLeft;
    }
    left = clamp(left, padding, maxLeft);

    const availableBelow = viewport.height - padding - anchor.bottom - spacing;
    const availableAbove = anchor.top - topPadding - spacing;
    const belowTop = anchor.bottom + spacing;
    const aboveTop = anchor.top - spacing - menu.height;
    const shouldOpenBelow = availableBelow >= menu.height || availableBelow >= availableAbove;
    const vertical = shouldOpenBelow ? 'below' : 'above';
    const top = clamp(shouldOpenBelow ? belowTop : aboveTop, topPadding, maxTop);

    return roundPlacement({ left, top, horizontal, vertical });
  }

  function placeCascadeSubmenu(options) {
    const source = options || {};
    const parentLevel = normalizeRect(source.parentLevelRect);
    const trigger = normalizeRect(source.triggerRect);
    const menu = normalizeRect(source.menuRect);
    const viewport = normalizeViewport(source.viewport);
    const { spacing, padding, topPadding } = getPlacementOptions(source);
    const maxLeft = viewport.width - menu.width - padding;
    const maxTop = viewport.height - menu.height - padding;

    const rightLeft = parentLevel.right + spacing;
    const leftLeft = parentLevel.left - spacing - menu.width;
    const fitsRight = rightLeft + menu.width <= viewport.width - padding;
    const fitsLeft = leftLeft >= padding;
    const roomRight = Math.max(0, viewport.width - padding - rightLeft);
    const roomLeft = Math.max(0, parentLevel.left - spacing - padding);

    let side = 'right';
    let left = rightLeft;
    if (!fitsRight && (fitsLeft || roomLeft > roomRight)) {
      side = 'left';
      left = leftLeft;
    }

    return roundPlacement({
      left: clamp(left, padding, maxLeft),
      top: clamp(trigger.top, topPadding, maxTop),
      side
    });
  }

  function buildCascadeSafeTriangle(options) {
    const source = options || {};
    const pointer = normalizePoint(source.pointer);
    const submenu = normalizeRect(source.submenuRect);
    if (!pointer || submenu.width <= 0 || submenu.height <= 0) {
      return null;
    }
    const side = source.side === 'left' ? 'left' : 'right';
    const baseX = side === 'left' ? submenu.right : submenu.left;
    return [
      { x: pointer.x, y: pointer.y },
      { x: baseX, y: submenu.top },
      { x: baseX, y: submenu.bottom }
    ];
  }

  function getTriangleArea(a, b, c) {
    return Math.abs(
      ((b.x - a.x) * (c.y - a.y)) -
      ((c.x - a.x) * (b.y - a.y))
    );
  }

  function getPointSign(point, a, b) {
    return ((point.x - b.x) * (a.y - b.y)) - ((a.x - b.x) * (point.y - b.y));
  }

  function isPointInsideCascadeSafeTriangle(point, triangle) {
    const normalizedPoint = normalizePoint(point);
    if (!normalizedPoint || !Array.isArray(triangle) || triangle.length < 3) {
      return false;
    }
    const a = normalizePoint(triangle[0]);
    const b = normalizePoint(triangle[1]);
    const c = normalizePoint(triangle[2]);
    if (!a || !b || !c || getTriangleArea(a, b, c) < 0.01) {
      return false;
    }
    const d1 = getPointSign(normalizedPoint, a, b);
    const d2 = getPointSign(normalizedPoint, b, c);
    const d3 = getPointSign(normalizedPoint, c, a);
    const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNegative && hasPositive);
  }

  return Object.freeze({
    buildCascadeSafeTriangle,
    getTranslateNeutralRect,
    isPointInsideCascadeSafeTriangle,
    placeRootCascadeMenu,
    placeCascadeSubmenu
  });
});
