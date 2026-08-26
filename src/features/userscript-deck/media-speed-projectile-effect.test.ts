import { describe, expect, it } from 'vitest';

import {
  mediaSpeedHueRotation,
  mediaSpeedImpactBorderGeometry,
  mediaSpeedImpactBorderOpacity,
  mediaSpeedImpactBorderScale,
  mediaSpeedLeadImpactReached,
  mediaSpeedProjectileEntryPoint,
  mediaSpeedProjectileGeometry,
  mediaSpeedProjectileImpactPoints,
  mediaSpeedProjectileLaunchDelays,
  mediaSpeedProjectilePoint,
  mediaSpeedProjectilePreImpactOpacity,
  mediaSpeedProjectileTravelProgress,
  mediaSpeedVfxSequenceIndex,
} from './media-speed-projectile-effect';
import {
  MEDIA_SPEED_BORDER_SEQUENCES,
  MEDIA_SPEED_PROJECTILE_SEQUENCES,
} from './media-speed-vfx-catalog.generated';

describe('media speed projectile geometry', () => {
  it('cycles five projectile sequences against one color-adaptive border', () => {
    expect(MEDIA_SPEED_PROJECTILE_SEQUENCES.map(({ id }) => id)).toEqual([
      '01',
      '03',
      '04',
      '08',
      '09',
    ]);
    expect(MEDIA_SPEED_BORDER_SEQUENCES.map(({ id }) => id)).toEqual(['01']);
    expect(mediaSpeedVfxSequenceIndex(0, 5)).toBe(0);
    expect(mediaSpeedVfxSequenceIndex(4, 5)).toBe(4);
    expect(mediaSpeedVfxSequenceIndex(5, 5)).toBe(0);
    expect(mediaSpeedVfxSequenceIndex(12, 5)).toBe(2);
    expect(mediaSpeedVfxSequenceIndex(8, 1)).toBe(0);
  });

  it('builds three visibly different ballistic paths', () => {
    const start = { x: 1_100, y: 720 };
    const end = { x: 600, y: 320 };
    const direct = mediaSpeedProjectileGeometry(start, end, 'direct');
    const highArc = mediaSpeedProjectileGeometry(start, end, 'highArc');
    const flank = mediaSpeedProjectileGeometry(start, end, 'flank');

    expect(highArc.control.y).toBeLessThan(direct.control.y);
    expect(flank.control.x).toBeLessThan(direct.control.x);
    expect(
      new Set(
        [direct, highArc, flank].map(
          ({ control }) => `${control.x}:${control.y}`,
        ),
      ).size,
    ).toBe(3);
    for (const geometry of [direct, highArc, flank]) {
      expect(geometry.duration).toBeGreaterThanOrEqual(380);
      expect(geometry.duration).toBeLessThanOrEqual(620);
      expect(geometry.width).toBeGreaterThanOrEqual(480);
      expect(geometry.width).toBeLessThanOrEqual(760);
    }
  });

  it('fades slowly then rapidly during the final 80 milliseconds', () => {
    expect(mediaSpeedProjectilePreImpactOpacity(80)).toBe(1);
    expect(mediaSpeedProjectilePreImpactOpacity(40)).toBeCloseTo(0.875);
    expect(mediaSpeedProjectilePreImpactOpacity(20)).toBeCloseTo(0.578_125);
    expect(mediaSpeedProjectilePreImpactOpacity(0)).toBe(0);
    expect(
      mediaSpeedProjectilePreImpactOpacity(80) -
        mediaSpeedProjectilePreImpactOpacity(40),
    ).toBeLessThan(
      mediaSpeedProjectilePreImpactOpacity(40) -
        mediaSpeedProjectilePreImpactOpacity(0),
    );
  });

  it('staggers the volley by one quarter and one half of lead flight time', () => {
    expect(mediaSpeedProjectileLaunchDelays(400)).toEqual([0, 100, 200]);
  });

  it('enters at speed with mild aerodynamic drag and no impact stop', () => {
    expect(mediaSpeedProjectileTravelProgress(0)).toBe(0);
    expect(mediaSpeedProjectileTravelProgress(1)).toBe(1);
    expect(mediaSpeedProjectileTravelProgress(0.06)).toBeGreaterThan(0.06);
    expect(
      mediaSpeedProjectileTravelProgress(0.95) -
        mediaSpeedProjectileTravelProgress(0.85),
    ).toBeGreaterThan(0.09);
  });

  it('starts fully outside the viewport at the wheel nearest edge', () => {
    expect(
      mediaSpeedProjectileEntryPoint(
        { x: 1_160, y: 720 },
        { x: 600, y: 320 },
        { width: 1_280, height: 800 },
      ),
    ).toMatchObject({ edge: 'bottom', boundaryPoint: { x: 1_272, y: 800 } });
    const leftEntry = mediaSpeedProjectileEntryPoint(
      { x: 48, y: 360 },
      { x: 600, y: 320 },
      { width: 1_280, height: 800 },
    );
    expect(leftEntry.edge).toBe('left');
    expect(leftEntry.boundaryPoint.x).toBe(0);
    expect(leftEntry.point.x).toBeLessThan(-275);
  });

  it('uses the video-to-wheel line at the wheel-side viewport intersection', () => {
    const wheel = { x: 1_160, y: 720 };
    const target = { x: 600, y: 320 };
    const entry = mediaSpeedProjectileEntryPoint(wheel, target, {
      width: 1_280,
      height: 800,
    });
    const targetToBoundary = {
      x: entry.boundaryPoint.x - target.x,
      y: entry.boundaryPoint.y - target.y,
    };
    const targetToWheel = {
      x: wheel.x - target.x,
      y: wheel.y - target.y,
    };
    expect(
      targetToBoundary.x * targetToWheel.y -
        targetToBoundary.y * targetToWheel.x,
    ).toBeCloseTo(0);
    expect(entry.point.y).toBeGreaterThan(800);
  });

  it('aims the lead projectile at the video center', () => {
    const impacts = mediaSpeedProjectileImpactPoints(
      { x: 600, y: 320 },
      800,
      450,
    );

    expect(impacts).toHaveLength(3);
    expect(impacts[0]).toEqual({ x: 600, y: 320 });
    expect(impacts[1]?.x).toBeLessThanOrEqual(520);
    expect(impacts[2]?.x).toBeGreaterThanOrEqual(680);
    expect(new Set(impacts.map(({ y }) => y)).size).toBeGreaterThan(1);
  });

  it('keeps both endpoints exact', () => {
    const start = { x: 100, y: 600 };
    const control = { x: 400, y: 180 };
    const end = { x: 700, y: 300 };

    expect(mediaSpeedProjectilePoint(start, control, end, 0)).toEqual(start);
    expect(mediaSpeedProjectilePoint(start, control, end, 1)).toEqual(end);
  });

  it('maps projectile and border hues to the selected wheel color', () => {
    expect(mediaSpeedHueRotation(0, '#00ff00')).toBe(120);
    expect(mediaSpeedHueRotation(240, '#ff0000')).toBe(120);
  });

  it('expands the border from the video center while preserving its ratio', () => {
    const geometry = mediaSpeedImpactBorderGeometry({
      left: 100,
      top: 100,
      width: 800,
      height: 450,
    });
    expect(geometry.width / geometry.height).toBeCloseTo(512 / 400);
    expect(geometry.left + geometry.width / 2).toBeCloseTo(500);
    expect(geometry.top + geometry.height / 2).toBeCloseTo(325);
    expect(geometry.fontSize).toBe(52);
    expect(mediaSpeedImpactBorderScale(0)).toBeCloseTo(0.14);
    expect(mediaSpeedImpactBorderScale(0.72)).toBeCloseTo(0.932_576);
    expect(mediaSpeedImpactBorderScale(1)).toBe(1);
    expect(mediaSpeedImpactBorderOpacity(0)).toBe(0);
    expect(mediaSpeedImpactBorderOpacity(0.1)).toBe(0.72);
    expect(mediaSpeedImpactBorderOpacity(0.5)).toBe(0.72);
    expect(mediaSpeedImpactBorderOpacity(0.84)).toBeCloseTo(0.63);
    expect(mediaSpeedImpactBorderOpacity(1)).toBe(0);
  });

  it('keeps the impact border readable around very small videos', () => {
    const geometry = mediaSpeedImpactBorderGeometry({
      left: 100,
      top: 80,
      width: 96,
      height: 54,
    });

    expect(geometry.width).toBe(320);
    expect(geometry.height).toBe(250);
    expect(geometry.fontSize).toBe(32);
    expect(geometry.left + geometry.width / 2).toBeCloseTo(148);
    expect(geometry.top + geometry.height / 2).toBeCloseTo(107);
  });

  it('scales the label and its frame for large video containers', () => {
    const geometry = mediaSpeedImpactBorderGeometry({
      left: 0,
      top: 0,
      width: 1_920,
      height: 1_080,
    });

    expect(geometry.fontSize).toBeCloseTo(124.8);
    expect(geometry.width).toBeCloseTo(811.2);
    expect(geometry.width).toBeLessThan(1_920);
  });

  it('triggers the border exactly when the lead projectile first lands', () => {
    expect(mediaSpeedLeadImpactReached(1, 1, false)).toBe(false);
    expect(mediaSpeedLeadImpactReached(0, 0.99, false)).toBe(false);
    expect(mediaSpeedLeadImpactReached(0, 1, false)).toBe(true);
    expect(mediaSpeedLeadImpactReached(0, 1, true)).toBe(false);
  });
});
