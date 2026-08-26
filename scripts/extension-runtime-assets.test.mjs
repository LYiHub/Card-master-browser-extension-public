import { describe, expect, it } from 'vitest';

import { extensionRuntimeAssetsFor } from './extension-runtime-assets.mjs';

describe('content blocking vfx packaging', () => {
  it('gives Safari only HEVC movies and other browsers only WebM', () => {
    const chromium = extensionRuntimeAssetsFor('chromium').filter((asset) =>
      asset.includes('/content-blocking-vfx/'),
    );
    const firefox = extensionRuntimeAssetsFor('firefox').filter((asset) =>
      asset.includes('/content-blocking-vfx/'),
    );
    const safari = extensionRuntimeAssetsFor('safari').filter((asset) =>
      asset.includes('/content-blocking-vfx/'),
    );

    expect(chromium.length).toBeGreaterThan(0);
    expect(firefox).toEqual(chromium);
    expect(safari).toEqual(
      chromium.map((asset) => asset.replace(/\.webm$/, '.mov')),
    );
    expect(chromium.every((asset) => asset.endsWith('.webm'))).toBe(true);
    expect(safari.every((asset) => asset.endsWith('.mov'))).toBe(true);
    expect(chromium.some((asset) => asset.endsWith('.mov'))).toBe(false);
    expect(safari.some((asset) => asset.endsWith('.webm'))).toBe(false);
  });
});
