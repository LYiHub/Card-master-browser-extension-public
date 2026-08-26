import type { RefCallback } from 'react';

import {
  createPageTargetFrameTracker,
  type PageTargetFrameGeometry,
} from '../../components/page-target-frame';
import { magicAimPath, type Point } from '../manager-interaction/layout';
import type { ManagerMode } from '../manager-interaction/state';
import type { PageElementTarget } from './element-targeting';

type AimNodes = {
  svg: SVGSVGElement | null;
  aura: SVGPathElement | null;
  core: SVGPathElement | null;
  origin: SVGCircleElement | null;
  target: HTMLDivElement | null;
};

export type AimVisualController = {
  refs: {
    svg: RefCallback<SVGSVGElement>;
    aura: RefCallback<SVGPathElement>;
    core: RefCallback<SVGPathElement>;
    origin: RefCallback<SVGCircleElement>;
    target: RefCallback<HTMLDivElement>;
  };
  setOrigin(point: Point | null): void;
  setPoint(point: Point | null): void;
  setTarget(target: PageElementTarget | null): void;
  clear(): void;
};

export function createAimVisualController(): AimVisualController {
  const nodes: AimNodes = {
    svg: null,
    aura: null,
    core: null,
    origin: null,
    target: null,
  };
  let originPoint: Point | null = null;
  let aimPoint: Point | null = null;
  let pageTarget: PageElementTarget | null = null;
  let targetGeometry: PageTargetFrameGeometry | null = null;

  const renderLine = () => {
    const visible = Boolean(originPoint && aimPoint);
    if (nodes.svg) nodes.svg.style.display = visible ? '' : 'none';
    if (!visible || !originPoint || !aimPoint) return;
    const path = magicAimPath(originPoint, aimPoint);
    nodes.aura?.setAttribute('d', path);
    nodes.core?.setAttribute('d', path);
    nodes.origin?.setAttribute('cx', String(originPoint.x));
    nodes.origin?.setAttribute('cy', String(originPoint.y));
  };

  const renderTarget = () => {
    const element = nodes.target;
    if (!element) return;
    element.style.display = pageTarget && targetGeometry ? '' : 'none';
    if (!pageTarget || !targetGeometry) return;
    element.classList.toggle('is-resolving', pageTarget.resolving);
    element.style.top = `${targetGeometry.y}px`;
    element.style.left = `${targetGeometry.x}px`;
    element.style.width = `${targetGeometry.width}px`;
    element.style.height = `${targetGeometry.height}px`;
  };
  const targetTracker = createPageTargetFrameTracker(window, ({ geometry }) => {
    targetGeometry = geometry;
    renderTarget();
  });

  return {
    refs: {
      svg: (node) => {
        nodes.svg = node;
        renderLine();
      },
      aura: (node) => {
        nodes.aura = node;
        renderLine();
      },
      core: (node) => {
        nodes.core = node;
        renderLine();
      },
      origin: (node) => {
        nodes.origin = node;
        renderLine();
      },
      target: (node) => {
        nodes.target = node;
        targetTracker.setTarget(node ? (pageTarget?.element ?? null) : null);
        renderTarget();
      },
    },
    setOrigin(point) {
      originPoint = point;
      renderLine();
    },
    setPoint(point) {
      aimPoint = point;
      renderLine();
    },
    setTarget(target) {
      pageTarget = target;
      targetTracker.setTarget(target?.element ?? null);
      renderTarget();
    },
    clear() {
      originPoint = null;
      aimPoint = null;
      pageTarget = null;
      targetTracker.setTarget(null);
      renderLine();
      renderTarget();
    },
  };
}

export function AimOverlay({
  controller,
  mode,
  pageElementInteraction,
  viewportWidth,
  viewportHeight,
}: {
  controller: AimVisualController;
  mode: ManagerMode;
  pageElementInteraction: boolean;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const active = mode === 'targeting' || pageElementInteraction;
  return (
    <>
      <div
        ref={controller.refs.target}
        className="page-target-frame page-target-frame--destructive manager-page-target"
        style={{ display: 'none' }}
        aria-hidden="true"
      />
      <svg
        ref={controller.refs.svg}
        className={`manager-aim-line${pageElementInteraction ? ' is-page-targeting' : ''}`}
        viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
        preserveAspectRatio="none"
        style={{ display: active ? undefined : 'none' }}
        aria-hidden="true"
      >
        <defs>
          <marker
            id="manager-aim-arrow"
            viewBox="0 0 14 12"
            refX="12"
            refY="6"
            markerWidth="10"
            markerHeight="9"
            orient="auto"
          >
            <path d="M 1 1 L 13 6 L 1 11 L 4.5 6 Z" />
          </marker>
        </defs>
        <path ref={controller.refs.aura} className="manager-aim-line__aura" />
        <path
          ref={controller.refs.core}
          className="manager-aim-line__core"
          markerEnd="url(#manager-aim-arrow)"
        />
        <circle
          ref={controller.refs.origin}
          className="manager-aim-line__origin"
          r="8"
        />
      </svg>
    </>
  );
}
