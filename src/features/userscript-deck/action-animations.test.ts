import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('card action animations', () => {
  it('uses one continuous exposure curve from underexposure to recovery', () => {
    const source = readFileSync(
      new URL('./action-animations.ts', import.meta.url),
      'utf8',
    );
    const charge = source.slice(
      source.indexOf('export function chargeCommand'),
      source.indexOf('export function chargeShadowCommand'),
    );
    const underexposed = charge.indexOf('brightness(0.82)');
    const overexposed = charge.indexOf('brightness(2.45)');
    const recovered = charge.indexOf('brightness(1) saturate(1) contrast(1)');

    expect(underexposed).toBeGreaterThan(-1);
    expect(overexposed).toBeGreaterThan(underexposed);
    expect(recovered).toBeGreaterThan(overexposed);
    expect(charge).not.toContain('brightness(1.48)');
    expect(
      charge.match(/COMMAND_BLOOM_DURATION/g)?.length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      charge.match(/COMMAND_RECOVERY_DURATION/g)?.length,
    ).toBeGreaterThanOrEqual(5);
    expect(charge).toContain('rotation: 20');
    expect(charge).toContain('rotation: 38');
    expect(charge).toContain('scale: 1.32');
    expect(charge).toContain('scale: 1.52');
    expect(charge).not.toContain('brightness(0.64)');
    expect(charge).not.toContain('loadMedia');
    expect(charge).not.toContain('currentTime');
    expect(charge).not.toContain('duration: 0.68');
  });
});
