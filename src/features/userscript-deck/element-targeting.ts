import { gsap } from '../../motion/gsap';
import type { Point } from '../manager-interaction/layout';

export type PageElementTarget = {
  element: HTMLElement;
  resolving: boolean;
};

export type PageTargetCardHome = {
  bounds: { top: number; left: number; width: number; height: number };
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

export type PageElementHideLease = {
  release: () => void;
  releaseIfCovered: () => boolean;
};

export type PageElementPressDisposition<Context> =
  | { kind: 'ignore' }
  | { kind: 'cancel' }
  | { kind: 'resolve'; element: HTMLElement; context: Context };

const PROTECTED_PAGE_TARGETS = new Set([
  'BODY',
  'HEAD',
  'HTML',
  'LINK',
  'META',
  'SCRIPT',
  'STYLE',
]);

export function pageElementTargetAt(point: Point, interactionRoot: ParentNode) {
  const interactionHost =
    interactionRoot instanceof ShadowRoot ? interactionRoot.host : null;
  return (
    document
      .elementsFromPoint(point.x, point.y)
      .find((element): element is HTMLElement => {
        if (!(element instanceof HTMLElement) || element.hidden) return false;
        if (
          PROTECTED_PAGE_TARGETS.has(element.tagName) ||
          element === interactionHost ||
          interactionHost?.contains(element)
        ) {
          return false;
        }
        const bounds = element.getBoundingClientRect();
        return bounds.width >= 2 && bounds.height >= 2;
      }) ?? null
  );
}

export function pageElementTarget(element: HTMLElement): PageElementTarget {
  return {
    element,
    resolving: false,
  };
}

export function pageElementPressDisposition<Context>(
  element: HTMLElement | null,
  context: Context | null,
): PageElementPressDisposition<Context> {
  if (!element || element.hidden) return { kind: 'ignore' };
  return context ? { kind: 'resolve', element, context } : { kind: 'cancel' };
}

function immediateElementHidingSelector(
  target: PageElementTarget,
  rule: string,
  pageUrl: string,
) {
  const separator = rule.indexOf('##');
  if (separator <= 0) {
    throw new Error('即时元素过滤规则缺少标准选择器分隔符。');
  }
  const domain = rule.slice(0, separator);
  const selector = rule.slice(separator + 2).trim();
  if (!selector || new URL(pageUrl).hostname !== domain) {
    throw new Error('即时元素过滤规则与当前页面不匹配。');
  }
  try {
    if (!target.element.matches(selector)) {
      throw new Error('生成的元素过滤选择器未命中当前元素。');
    }
  } catch (error) {
    throw new Error('无法在当前页面应用元素过滤选择器。', {
      cause: error,
    });
  }
  return selector;
}

export function removePageElement(
  target: PageElementTarget,
  rule: string,
  pageUrl: string,
  quick = false,
) {
  return new Promise<PageElementHideLease>((resolve) => {
    const element = target.element;
    const selector = immediateElementHidingSelector(target, rule, pageUrl);
    const original = {
      hidden: element.hidden,
      opacity: element.style.opacity,
      filter: element.style.filter,
      clipPath: element.style.clipPath,
      willChange: element.style.willChange,
    };
    const restoreAnimatedPresentation = () => {
      element.style.opacity = original.opacity;
      element.style.filter = original.filter;
      element.style.clipPath = original.clipPath;
      element.style.willChange = original.willChange;
    };
    element.style.willChange = 'opacity, filter, clip-path';
    gsap
      .timeline({
        onComplete: () => {
          element.hidden = true;
          const style = element.ownerDocument.createElement('style');
          style.dataset.cardMasterImmediateRule = rule;
          style.textContent = `${selector} { display: none !important; }`;
          const styleHost =
            element.ownerDocument.head ?? element.ownerDocument.documentElement;
          styleHost.append(style);
          restoreAnimatedPresentation();
          let active = true;
          const release = () => {
            if (!active) return;
            active = false;
            style.remove();
            element.hidden = original.hidden;
          };
          const releaseIfCovered = () => {
            if (!active) return true;
            style.remove();
            element.hidden = original.hidden;
            if (!element.isConnected) {
              active = false;
              return true;
            }
            const computed =
              element.ownerDocument.defaultView?.getComputedStyle(element);
            const covered =
              element.hidden ||
              computed?.display === 'none' ||
              computed?.visibility === 'hidden' ||
              computed?.contentVisibility === 'hidden';
            if (covered) {
              active = false;
              return true;
            }
            element.hidden = true;
            styleHost.append(style);
            return false;
          };
          resolve({ release, releaseIfCovered });
        },
      })
      .to(element, {
        filter: 'brightness(1.85) saturate(0.48)',
        duration: quick ? 0.08 : 0.16,
        ease: 'power2.out',
      })
      .to(element, {
        opacity: 0,
        filter: 'brightness(2.4) saturate(0)',
        clipPath: 'inset(49% 0 49% 0)',
        duration: quick ? 0.18 : 0.42,
        ease: 'power3.in',
      });
  });
}
