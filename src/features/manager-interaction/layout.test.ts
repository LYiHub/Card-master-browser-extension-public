import { describe, expect, it } from 'vitest';
import {
  actionArcHeight,
  actionFanLayout,
  actionModeForOffset,
  actionRegionContains,
  CARD_COLLECT_DURATION,
  CARD_COLLECT_STAGGER,
  CARD_COLLECTION_CARD_DIAMETER,
  CARD_COLLECTION_LOGO_DIAMETER,
  CARD_DEAL_DURATION,
  CARD_DEAL_MAX_SEQUENCE_DURATION,
  CARD_DEAL_STAGGER,
  cardAvoidanceRegionContains,
  cardHoverIndexAtPoint,
  cardLayout,
  cardScaleInsideCircle,
  cardSequenceDuration,
  cardTransformBounds,
  cardTransformContainsPoint,
  centerOutSlotIndex,
  centralActionRegionContains,
  constrainCardTransformToViewport,
  formationCardLayout,
  magicAimPath,
  managerCardDimensions,
  managerCornerActionRadius,
  oppositeHalfViewportCenter,
} from './layout';
import {
  deckCardLaunchLayout,
  deckCardSpaceMidY,
  deckCircularArc,
  deckCollectDelay,
  deckCollectFlight,
  deckCollectFlightPath,
  deckCollectTiming,
  deckDealDelay,
  deckDealFlight,
  deckDealFlightPath,
  deckFlightArcY,
  deckFlightFlip,
  deckMotionPath,
} from './useManagerCardLifecycleMotion';

describe('manager card layout', () => {
  it('leaves breathing room around a collected card inside the logo', () => {
    const scale = cardScaleInsideCircle(
      150,
      200,
      CARD_COLLECTION_CARD_DIAMETER,
    );

    expect(CARD_COLLECTION_CARD_DIAMETER).toBeLessThan(
      CARD_COLLECTION_LOGO_DIAMETER,
    );
    expect(scale).toBeCloseTo(0.176);
    expect(150 * scale).toBeCloseTo(26.4);
    expect(200 * scale).toBeCloseTo(35.2);
    expect(Math.hypot(150 * scale, 200 * scale)).toBeCloseTo(44);
  });

  it('keeps the center card centered and fans both sides symmetrically', () => {
    const layouts = Array.from({ length: 5 }, (_, index) =>
      cardLayout(index, 5, 1440, 900),
    );
    expect(layouts[2]).toMatchObject({ x: 0, y: 0, rotation: 0 });
    expect(layouts[0].x).toBe(-layouts[4].x);
    expect(layouts[0].rotation).toBe(-layouts[4].rotation);
  });

  it('uses the five-step focus scale profile', () => {
    const layout = cardLayout(4, 9, 1440, 900);
    const focused = formationCardLayout(layout, 4, 4);
    expect(focused.scale).toBe(1.25);
    expect(focused.y).toBe(layout.y - 12);
    expect(formationCardLayout(layout, 5, 4).scale).toBe(1.1);
    expect(formationCardLayout(layout, 6, 4).scale).toBe(1);
    expect(formationCardLayout(layout, 7, 4).scale).toBe(0.95);
    expect(formationCardLayout(layout, 8, 4).scale).toBe(0.9);
  });

  it('assigns overlapping card areas to the visually upper card', () => {
    const viewportWidth = 1440;
    const viewportHeight = 900;
    const total = 5;
    const dimensions = managerCardDimensions(viewportWidth);
    const layouts = Array.from({ length: total }, (_, index) =>
      cardLayout(index, total, viewportWidth, viewportHeight),
    );
    const pointerY = viewportHeight - dimensions.bottom - dimensions.height / 2;
    const overlap = { x: 780, y: pointerY };
    const origin = {
      left: viewportWidth / 2 - dimensions.width / 2,
      top: viewportHeight - dimensions.bottom - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
    };

    expect(
      cardTransformContainsPoint(overlap, { ...origin, ...layouts[2] }),
    ).toBe(true);
    expect(
      cardTransformContainsPoint(overlap, { ...origin, ...layouts[3] }),
    ).toBe(true);
    expect(
      cardHoverIndexAtPoint({
        point: overlap,
        total,
        viewportWidth,
        viewportHeight,
        currentIndex: 2,
      }),
    ).toBe(3);
  });

  it('retains a focused upper card over lower cards without crossing a higher layer', () => {
    const viewportWidth = 1440;
    const viewportHeight = 900;
    const total = 5;
    const pointerY =
      viewportHeight -
      managerCardDimensions(viewportWidth).bottom -
      managerCardDimensions(viewportWidth).height / 2;

    expect(
      cardHoverIndexAtPoint({
        point: { x: 670, y: pointerY },
        total,
        viewportWidth,
        viewportHeight,
        currentIndex: 2,
      }),
    ).toBe(2);
    expect(
      cardHoverIndexAtPoint({
        point: { x: 780, y: pointerY },
        total,
        viewportWidth,
        viewportHeight,
        currentIndex: 2,
      }),
    ).toBe(3);
  });

  it('retains the raised card vertically without expanding neighboring slots', () => {
    const viewportWidth = 1440;
    const viewportHeight = 900;
    const total = 5;
    const index = 2;
    const dimensions = managerCardDimensions(viewportWidth);
    const layout = cardLayout(index, total, viewportWidth, viewportHeight);
    const centerX = viewportWidth / 2 + layout.x;
    const top =
      viewportHeight - dimensions.bottom + layout.y - dimensions.height;
    const raisedPointer = { x: centerX, y: top - 36 };

    expect(
      cardHoverIndexAtPoint({
        point: raisedPointer,
        total,
        viewportWidth,
        viewportHeight,
      }),
    ).toBeNull();
    expect(
      cardHoverIndexAtPoint({
        point: raisedPointer,
        total,
        viewportWidth,
        viewportHeight,
        currentIndex: index,
      }),
    ).toBe(index);
  });

  it('keeps every rotated card edge inside the viewport while dragging', () => {
    const epsilon = 0.001;
    for (const transform of [
      { x: -620, y: -760, rotation: -14 },
      { x: 620, y: 180, rotation: 14 },
    ]) {
      const geometry = {
        ...transform,
        scale: 1.25,
        left: 645,
        top: 644,
        width: 150,
        height: 218,
      };
      const constrained = constrainCardTransformToViewport({
        ...geometry,
        viewportWidth: 1440,
        viewportHeight: 900,
        margin: 12,
      });
      const bounds = cardTransformBounds({
        ...geometry,
        x: constrained.x,
        y: constrained.y,
      });

      expect(bounds.left).toBeGreaterThanOrEqual(12 - epsilon);
      expect(bounds.top).toBeGreaterThanOrEqual(12 - epsilon);
      expect(bounds.right).toBeLessThanOrEqual(1428 + epsilon);
      expect(bounds.bottom).toBeLessThanOrEqual(888 + epsilon);
      expect(constrained.cardCenter.x).toBeGreaterThan(bounds.left);
      expect(constrained.cardCenter.x).toBeLessThan(bounds.right);
    }
  });

  it('compresses horizontal spacing before the base fan enters either lower corner arc', () => {
    for (const { viewportWidth, viewportHeight, total } of [
      { viewportWidth: 1440, viewportHeight: 900, total: 30 },
      { viewportWidth: 1024, viewportHeight: 768, total: 30 },
      { viewportWidth: 800, viewportHeight: 600, total: 20 },
      { viewportWidth: 390, viewportHeight: 844, total: 30 },
    ]) {
      const dimensions = managerCardDimensions(viewportWidth);
      const safeRadius =
        managerCornerActionRadius(viewportWidth, viewportHeight) - 0.001;
      for (let index = 0; index < total; index += 1) {
        const layout = cardLayout(index, total, viewportWidth, viewportHeight);
        const bounds = cardTransformBounds({
          ...layout,
          left: viewportWidth / 2 - dimensions.width / 2,
          top: viewportHeight - dimensions.bottom - dimensions.height,
          width: dimensions.width,
          height: dimensions.height,
        });
        const verticalClearance = Math.max(0, viewportHeight - bounds.bottom);
        const leftDistance = Math.hypot(
          Math.max(0, bounds.left),
          verticalClearance,
        );
        const rightDistance = Math.hypot(
          Math.max(0, viewportWidth - bounds.right),
          verticalClearance,
        );
        expect(Math.min(leftDistance, rightDistance)).toBeGreaterThanOrEqual(
          safeRadius,
        );
      }
    }
  });

  it('shrinks corner actions with narrow viewport width while preserving card balance', () => {
    const compactHeight = managerCardDimensions(390).height;
    const narrowRadius = managerCornerActionRadius(390, 844);

    expect(narrowRadius).toBeCloseTo(105.3);
    expect(narrowRadius / compactHeight).toBeGreaterThanOrEqual(0.5);
    expect(narrowRadius / compactHeight).toBeLessThanOrEqual(2 / 3);
    expect(managerCornerActionRadius(600, 800)).toBeLessThan(
      managerCornerActionRadius(800, 600),
    );
    expect(managerCornerActionRadius(800, 600)).toBeLessThan(
      managerCornerActionRadius(1_024, 768),
    );
  });

  it('uses the available narrow width without configured corner clearance', () => {
    for (const { viewportWidth, viewportHeight } of [
      { viewportWidth: 1_024, viewportHeight: 768 },
      { viewportWidth: 800, viewportHeight: 600 },
      { viewportWidth: 600, viewportHeight: 800 },
      { viewportWidth: 390, viewportHeight: 844 },
    ]) {
      const total = 5;
      const dimensions = managerCardDimensions(viewportWidth);
      const radius = managerCornerActionRadius(viewportWidth, viewportHeight);
      let minimumDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < total; index += 1) {
        const layout = cardLayout(index, total, viewportWidth, viewportHeight);
        const bounds = cardTransformBounds({
          ...layout,
          left: viewportWidth / 2 - dimensions.width / 2,
          top: viewportHeight - dimensions.bottom - dimensions.height,
          width: dimensions.width,
          height: dimensions.height,
        });
        const verticalClearance = Math.max(0, viewportHeight - bounds.bottom);
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(Math.max(0, bounds.left), verticalClearance),
          Math.hypot(
            Math.max(0, viewportWidth - bounds.right),
            verticalClearance,
          ),
        );
      }

      expect(minimumDistance).toBeGreaterThanOrEqual(radius);
      expect(minimumDistance - radius).toBeLessThan(1);
    }
  });

  it('keeps the fan baseline invariant while horizontal exposure contracts', () => {
    const wideGap =
      cardLayout(1, 30, 1440, 900).x - cardLayout(0, 30, 1440, 900).x;
    const constrainedGap =
      cardLayout(1, 30, 1024, 768).x - cardLayout(0, 30, 1024, 768).x;
    const ordinaryGap =
      cardLayout(1, 5, 1440, 900).x - cardLayout(0, 5, 1440, 900).x;

    expect(wideGap).toBeGreaterThan(constrainedGap);
    expect(constrainedGap).toBeGreaterThan(0);
    expect(wideGap).toBeLessThan(ordinaryGap);
    for (let index = 0; index < 30; index += 1) {
      expect(cardLayout(index, 30, 390, 844).y).toBeCloseTo(
        cardLayout(index, 30, 1440, 900).y,
      );
    }
  });

  it('uses the same compact card dimensions as the responsive presentation', () => {
    expect(managerCardDimensions(900)).toMatchObject({
      compact: true,
      width: 126,
      bottom: 30,
    });
    expect(managerCardDimensions(901)).toMatchObject({
      compact: false,
      width: 150,
      bottom: 38,
    });
  });
});

describe('action layout', () => {
  it('places action priority from the center toward alternating sides', () => {
    expect(
      Array.from({ length: 5 }, (_, index) => centerOutSlotIndex(index, 5)),
    ).toEqual([2, 1, 3, 0, 4]);
    expect(
      Array.from({ length: 4 }, (_, index) => centerOutSlotIndex(index, 4)),
    ).toEqual([1, 2, 0, 3]);
  });

  it('derives the central action arc from the current viewport height', () => {
    expect(actionArcHeight(900)).toBeCloseTo(486);
    expect(actionArcHeight(1_200)).toBe(520);
  });

  it('allocates continuous equal-width action zones', () => {
    const slots = Array.from({ length: 5 }, (_, index) =>
      actionFanLayout(index, 5, 1440),
    );
    expect(new Set(slots.map((slot) => slot.zoneWidth)).size).toBe(1);
    expect(slots[0].x).toBeLessThan(slots[1].x);
    expect(slots[3].x).toBeLessThan(slots[4].x);
    expect(slots[0].span).toBeCloseTo(1_336.32);
    expect(slots[1].x - slots[0].x).toBeCloseTo(267.264);
    expect(slots[0].x + slots[4].x).toBeCloseTo(0);
    expect(slots[0].x + slots[0].zoneWidth / 2).toBeCloseTo(
      slots[1].x - slots[1].zoneWidth / 2,
    );
    expect(slots[0].left + slots[0].zoneWidth).toBeCloseTo(slots[1].left);
  });

  it('keeps action markers on a shallow arc as action count grows', () => {
    const slots = Array.from({ length: 9 }, (_, index) =>
      actionFanLayout(index, 9, 1440),
    );
    const verticalRange =
      Math.max(...slots.map((slot) => slot.y)) -
      Math.min(...slots.map((slot) => slot.y));
    expect(verticalRange).toBeLessThanOrEqual(64);
    expect(slots[0].badgeWidth).toBeLessThanOrEqual(slots[0].zoneWidth * 0.98);
  });

  it('keeps a five-action fan slightly above the stage baseline', () => {
    const slots = Array.from({ length: 5 }, (_, index) =>
      actionFanLayout(index, 5, 1440),
    );
    expect(Math.max(...slots.map((slot) => slot.y))).toBe(18);
  });

  it('builds an upward cubic aim curve', () => {
    const path = magicAimPath({ x: 100, y: 500 }, { x: 400, y: 220 });
    expect(path).toMatch(/^M 100 500 C /);
    expect(path).toContain('400 220');
  });
});

describe('action hit regions', () => {
  const bounds = {
    top: 0,
    right: 200,
    bottom: 200,
    left: 0,
    width: 200,
    height: 200,
  };

  it('uses the two viewport edges and inward arc as a corner region', () => {
    expect(actionRegionContains({ x: 0, y: 0 }, bounds, 'top-left')).toBe(true);
    expect(actionRegionContains({ x: 60, y: 60 }, bounds, 'top-right')).toBe(
      true,
    );
    expect(actionRegionContains({ x: 0, y: 200 }, bounds, 'top-right')).toBe(
      false,
    );
    expect(actionRegionContains({ x: 140, y: 140 }, bounds, 'top-left')).toBe(
      true,
    );
    expect(actionRegionContains({ x: 150, y: 150 }, bounds, 'top-left')).toBe(
      false,
    );
    expect(actionRegionContains({ x: 140, y: 60 }, bounds, 'bottom-left')).toBe(
      true,
    );
    expect(actionRegionContains({ x: 60, y: 60 }, bounds, 'bottom-right')).toBe(
      true,
    );
    expect(actionRegionContains({ x: -1, y: -1 }, bounds, 'top-left')).toBe(
      true,
    );
    expect(
      actionRegionContains({ x: 201, y: 201 }, bounds, 'bottom-right'),
    ).toBe(true);
    expect(actionRegionContains({ x: -180, y: -180 }, bounds, 'top-left')).toBe(
      false,
    );
    expect(
      actionRegionContains({ x: 380, y: 380 }, bounds, 'bottom-right'),
    ).toBe(false);
  });

  it('keeps action mode available while travelling toward either lower corner', () => {
    expect(actionModeForOffset(false, { x: -149, y: 0 }, true, 148, 96)).toBe(
      true,
    );
    expect(actionModeForOffset(false, { x: 149, y: 0 }, true, 148, 96)).toBe(
      true,
    );
    expect(actionModeForOffset(false, { x: 149, y: 0 }, false, 148, 96)).toBe(
      false,
    );
    expect(actionModeForOffset(false, { x: 0, y: -149 }, false, 148, 96)).toBe(
      true,
    );
    expect(actionModeForOffset(true, { x: 0, y: -95 }, false, 148, 96)).toBe(
      false,
    );
  });

  it('limits central actions to the band enclosed by the arc and baseline', () => {
    const region = {
      centerX: 500,
      baselineY: 600,
      radiusX: 400,
      radiusY: 360,
    };

    expect(centralActionRegionContains({ x: 500, y: 260 }, region)).toBe(true);
    expect(centralActionRegionContains({ x: 100, y: 600 }, region)).toBe(true);
    expect(centralActionRegionContains({ x: 100, y: 420 }, region)).toBe(false);
    expect(centralActionRegionContains({ x: 500, y: 601 }, region)).toBe(false);
  });

  it('uses expanded card-shaped entry and return boundaries', () => {
    const cardBounds = {
      top: 500,
      left: 400,
      width: 150,
      height: 218,
    };
    expect(
      cardAvoidanceRegionContains({ x: 475, y: 609 }, cardBounds, false),
    ).toBe(true);
    expect(
      cardAvoidanceRegionContains({ x: 690, y: 609 }, cardBounds, false),
    ).toBe(true);
    expect(
      cardAvoidanceRegionContains({ x: 760, y: 609 }, cardBounds, false),
    ).toBe(false);
    expect(
      cardAvoidanceRegionContains({ x: 760, y: 609 }, cardBounds, true),
    ).toBe(true);
    expect(
      cardAvoidanceRegionContains({ x: 820, y: 609 }, cardBounds, true),
    ).toBe(false);
    expect(
      cardAvoidanceRegionContains({ x: 690, y: 790 }, cardBounds, false),
    ).toBe(true);
    expect(
      cardAvoidanceRegionContains({ x: 760, y: 900 }, cardBounds, true),
    ).toBe(true);
  });

  it('moves an avoiding card to the center of the opposite half-screen', () => {
    const viewport = { width: 1440, height: 900 };
    expect(oppositeHalfViewportCenter({ x: 500, y: 700 }, viewport)).toEqual({
      x: 1080,
      y: 450,
    });
    expect(oppositeHalfViewportCenter({ x: 940, y: 700 }, viewport)).toEqual({
      x: 360,
      y: 450,
    });
  });
});

describe('stage timing', () => {
  it('matches atmosphere duration to the final card arrival', () => {
    expect(
      cardSequenceDuration(
        6,
        CARD_DEAL_DURATION,
        CARD_DEAL_STAGGER,
        CARD_DEAL_MAX_SEQUENCE_DURATION,
      ),
    ).toBeCloseTo(1.12);
    expect(
      cardSequenceDuration(
        20,
        CARD_DEAL_DURATION,
        CARD_DEAL_STAGGER,
        CARD_DEAL_MAX_SEQUENCE_DURATION,
      ),
    ).toBeCloseTo(CARD_DEAL_MAX_SEQUENCE_DURATION);
    expect(
      cardSequenceDuration(6, CARD_COLLECT_DURATION, CARD_COLLECT_STAGGER),
    ).toBeCloseTo(1.06);
  });
});

describe('logo launch layout', () => {
  it('recomputes card transforms from the current viewport', () => {
    const logo = {
      getBoundingClientRect: () => ({
        left: 907,
        right: 963,
        top: 723,
        bottom: 779,
        width: 56,
        height: 56,
        x: 907,
        y: 723,
        toJSON: () => undefined,
      }),
    } as unknown as HTMLElement;
    const deck = {
      querySelector: () => logo,
      getBoundingClientRect: logo.getBoundingClientRect,
    } as unknown as HTMLElement;

    const wide = deckCardLaunchLayout(deck, 20, {
      width: 1_440,
      height: 900,
    });
    const narrow = deckCardLaunchLayout(deck, 20, {
      width: 1_000,
      height: 760,
    });

    expect(narrow.x).not.toBe(wide.x);
    expect(narrow.y).not.toBe(wide.y);
  });

  it('uses one logo launch point while preserving the spread z-index', () => {
    const logo = {
      getBoundingClientRect: () => ({
        left: 907,
        right: 963,
        top: 723,
        bottom: 779,
        width: 56,
        height: 56,
        x: 907,
        y: 723,
        toJSON: () => undefined,
      }),
    } as unknown as HTMLElement;
    let queriedSelector = '';
    const deck = {
      querySelector: (selector: string) => {
        queriedSelector = selector;
        return logo;
      },
      getBoundingClientRect: logo.getBoundingClientRect,
    } as unknown as HTMLElement;
    const viewport = { width: 1_440, height: 900 };
    const launch = Array.from({ length: 5 }, (_, index) =>
      deckCardLaunchLayout(deck, index + 20, viewport),
    );

    launch.forEach(({ x, y, rotation, scale }) => {
      expect(x).toBe(215);
      expect(y).toBeCloseTo(-93.4);
      expect(rotation).toBe(0);
      expect(scale).toBeCloseTo(0.176);
    });
    expect(queriedSelector).toBe('.manager-deck-trigger__logo');
    expect(launch.map(({ zIndex }) => zIndex)).toEqual([20, 21, 22, 23, 24]);
  });

  it('keeps the collection target fixed while the visible logo is transitioning', () => {
    const stableEntry = {
      getBoundingClientRect: () => ({
        left: 823,
        right: 1_047,
        top: 631,
        bottom: 871,
        width: 224,
        height: 240,
        x: 823,
        y: 631,
        toJSON: () => undefined,
      }),
    } as unknown as HTMLElement;
    const transitioningLogo = {
      getBoundingClientRect: () => ({
        left: 907,
        right: 963,
        top: 741,
        bottom: 797,
        width: 56,
        height: 56,
        x: 907,
        y: 741,
        toJSON: () => undefined,
      }),
    } as unknown as HTMLElement;
    const deck = {
      closest: () => stableEntry,
      querySelector: () => transitioningLogo,
      getBoundingClientRect: transitioningLogo.getBoundingClientRect,
    } as unknown as HTMLElement;

    const launch = deckCardLaunchLayout(deck, 20, {
      width: 1_440,
      height: 900,
    });

    expect(launch.x).toBe(215);
    expect(launch.y).toBeCloseTo(-93.4);
  });

  it('deals and collects using spread order instead of closed-stack order', () => {
    const logo = {
      getBoundingClientRect: () => ({
        left: 907,
        right: 963,
        top: 723,
        bottom: 779,
        width: 56,
        height: 56,
        x: 907,
        y: 723,
        toJSON: () => undefined,
      }),
    } as unknown as HTMLElement;
    const deck = {
      querySelector: () => logo,
      getBoundingClientRect: logo.getBoundingClientRect,
    } as unknown as HTMLElement;
    const viewport = { width: 1_440, height: 900 };
    const launch = Array.from({ length: 5 }, (_, index) =>
      deckCardLaunchLayout(deck, index + 20, viewport),
    );
    const dealDelays = Array.from({ length: 5 }, (_, index) =>
      deckDealDelay(index, 5, false),
    );
    const collectDelays = Array.from({ length: 5 }, (_, index) =>
      deckCollectDelay(index, 5, false, false, true),
    );

    expect(launch[0].zIndex).toBeLessThan(launch[4].zIndex);
    expect(dealDelays).toEqual(
      [...dealDelays].sort((left, right) => left - right),
    );
    expect(collectDelays).toEqual(
      [...collectDelays].sort((left, right) => right - left),
    );
    expect(dealDelays[0]).toBe(0);
    expect(collectDelays[4]).toBe(0);
  });

  it('removes collection stagger from cards interrupted during dealing', () => {
    expect(deckCollectDelay(0, 20, false, false, false)).toBe(0);
    expect(deckCollectDelay(0, 20, false, false, true)).toBeGreaterThan(0);
  });

  it('keeps July collect stagger and compresses deal stagger to the sequence cap', () => {
    expect(deckDealDelay(1, 5, false)).toBeCloseTo(CARD_DEAL_STAGGER);
    expect(deckCollectDelay(0, 5, false, false, true)).toBeCloseTo(
      4 * CARD_COLLECT_STAGGER,
    );
    expect(deckDealDelay(19, 20, false)).toBeLessThan(19 * CARD_DEAL_STAGGER);
  });

  it('sends a deal along one circular arc through the midpoint', () => {
    const launch = { x: 215, y: -20 };
    const current = { x: -240, y: 12 };
    const midY = deckCardSpaceMidY(900, 200, 38);
    const deal = deckDealFlight(launch, current, {
      midY,
    });
    const arc = deckCircularArc(launch, deal.apex, current);

    expect(midY).toBeLessThan(-200);
    expect(deal.apex.y).toBeLessThanOrEqual(midY);
    expect(deal.apex.x).toBeCloseTo((launch.x + current.x) / 2);
    expect(deal.path[0]).toEqual(launch);
    expect(deal.path.at(-1)).toEqual(current);
    expect(deal.path).toEqual(arc);
    expect(
      deal.path.some(
        (point) =>
          Math.hypot(point.x - deal.apex.x, point.y - deal.apex.y) < 12,
      ),
    ).toBe(true);
    expect(deckDealFlightPath(launch, current, { midY })).toEqual(deal.path);
  });

  it('collects along a direct path without reusing the deal apex', () => {
    const launch = { x: 215, y: -20 };
    const current = { x: -240, y: 12 };
    const collect = deckCollectFlight(launch, current);

    expect(collect.path[0]).toEqual(current);
    expect(collect.path.at(-1)).toEqual(launch);
    expect(collect.path).not.toContainEqual(
      deckDealFlight(launch, current, {
        midY: -300,
      }).apex,
    );
    expect(deckCollectFlightPath(launch, current)).toEqual(collect.path);
  });

  it('derives collect flip from scale-up and finishes before arrival', () => {
    const collect = deckCollectTiming(1);
    const long = deckCollectTiming(10);

    expect(collect.scaleUp).toBeCloseTo(0.2);
    expect(collect.flipDuration).toBeCloseTo(0.8);
    expect(collect.flipDuration).toBeLessThan(1);
    expect(deckCollectTiming(0.7, 0.12).flipDuration).toBeCloseTo(0.48);
    expect(deckCollectTiming(0.7, 0.12).flipDuration).toBeLessThan(0.7);
    expect(collect.scaleUp / collect.flipDuration).toBeCloseTo(0.25);
    expect(long.flipDuration).toBeCloseTo(collect.flipDuration * 10);
    expect(long.flipDuration).toBeLessThan(10);
  });

  it('does not send an undealt card away from the logo before collecting it', () => {
    const launch = { x: 215, y: -88.6 };

    expect(deckCollectFlightPath(launch, launch)).toEqual([launch, launch]);
  });

  it('keeps deal flip slower than the travel and sanitizes short motion paths', () => {
    const flip = deckFlightFlip(0.7);

    expect(flip.duration).toBeGreaterThan(0.5);
    expect(flip.delay + flip.duration).toBeGreaterThan(0.7);
    expect(flip.ease).toBe('power2.inOut');
    expect(
      deckMotionPath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBeNull();
    expect(
      deckMotionPath([
        { x: 0, y: 0 },
        { x: 10, y: -24 },
      ]),
    ).toHaveLength(3);
  });

  it('bends flights inward when the deck entry is near the top edge', () => {
    const upperDeck = {
      getBoundingClientRect: () => ({
        top: 20,
        height: 112,
      }),
    } as unknown as HTMLElement;
    const lowerDeck = {
      getBoundingClientRect: () => ({
        top: 700,
        height: 112,
      }),
    } as unknown as HTMLElement;

    expect(deckFlightArcY(upperDeck, -700, -80, 900, 72)).toBe(-318);
    expect(deckFlightArcY(lowerDeck, -80, 0, 900, 72)).toBe(-152);
  });
});
