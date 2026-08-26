import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { MediaSpeedWheelItem } from '../../media-speed/domain/types';
import {
  mediaSpeedCollapsedTranslation,
  mediaSpeedRadialOptions,
} from './MediaSpeedRadialMenu';

const items: readonly MediaSpeedWheelItem[] = [
  { kind: 'speed', speed: 1 },
  { kind: 'speed', speed: 2 },
  { kind: 'random' },
  { kind: 'hell' },
];

describe('media speed radial options', () => {
  it('adds an ephemeral option for a native speed outside the configured wheel', () => {
    const options = mediaSpeedRadialOptions(items, {
      mode: 'standard',
      speed: 1.75,
    });

    expect(options[0]).toMatchObject({
      id: 'native-speed-1.75',
      kind: 'speed',
      speed: 1.75,
      transient: true,
      colorIndex: items.length,
    });
    expect(
      options
        .filter((option) => option.transient === false)
        .map(({ id }) => id),
    ).toEqual(['speed-1', 'speed-2', 'random', 'hell']);
    expect(options.slice(1).map((option) => option.colorIndex)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('uses the configured position when the native speed already exists', () => {
    expect(
      mediaSpeedRadialOptions(items, { mode: 'standard', speed: 2 }),
    ).toHaveLength(items.length);
  });

  it('renders the speed as one system-font text node', () => {
    const componentSource = readFileSync(
      new URL('./MediaSpeedRadialMenu.tsx', import.meta.url),
      'utf8',
    );
    const styleSource = readFileSync(
      new URL('./styles/stage.css', import.meta.url),
      'utf8',
    );

    expect(componentSource).toContain('<b>{option.label}</b>');
    expect(styleSource).toContain('font-family: var(--app-ui-font-body)');
    expect(styleSource).not.toContain('column-gap');
    expect(styleSource).not.toContain('align-items: baseline');
  });

  it('collapses every option back to the wheel center', () => {
    expect(mediaSpeedCollapsedTranslation(42, -68)).toEqual({
      x: -42,
      y: 68,
    });
  });
});
