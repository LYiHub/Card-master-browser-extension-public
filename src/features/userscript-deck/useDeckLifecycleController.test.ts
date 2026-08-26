import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deck lifecycle interruption contract', () => {
  it('hands an in-progress deal directly to collection', async () => {
    const source = await readFile(
      new URL('./useDeckLifecycleController.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('collectAfterDeal');
    expect(source).toContain("currentMode !== 'dealing'");
    expect(source).toMatch(
      /const collectCardSpread[\s\S]*const currentMode = modeRef\.current;[\s\S]*beginCollection\(\);/,
    );
  });
});
