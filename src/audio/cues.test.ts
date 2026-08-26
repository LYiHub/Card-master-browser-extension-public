import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { AUDIO_CUES, FORGE_AUDIO_DURATION, PRELOAD_CUES } from './cues';

const assetRoot = fileURLToPath(new URL('../../assets/', import.meta.url));

describe('audio cue catalog', () => {
  it('maps every cue to an existing local project asset', () => {
    for (const definition of Object.values(AUDIO_CUES)) {
      expect(definition.sources.length).toBeGreaterThan(0);
      for (const source of definition.sources) {
        expect(source).toMatch(/^\/project-assets\/userscript-deck\/audio\//);
        const relativePath = source.slice('/project-assets/'.length);
        expect(existsSync(resolve(assetRoot, relativePath))).toBe(true);
      }
    }
  });

  it('keeps high-frequency cues short and rate-limited', () => {
    for (const cue of ['uiHover', 'cardHover', 'cardReorder'] as const) {
      expect(AUDIO_CUES[cue].cooldownMs).toBeGreaterThanOrEqual(70);
      expect(AUDIO_CUES[cue].maxDuration).toBeLessThanOrEqual(0.32);
      expect(AUDIO_CUES[cue].maxVoices).toBeLessThanOrEqual(2);
    }
  });

  it('preloads only the lightweight global interface layer', () => {
    expect(PRELOAD_CUES).toEqual(['uiHover', 'uiPress', 'uiConfirm']);
  });

  it('lets forge play through its full file', () => {
    expect(AUDIO_CUES.forgeStart.maxDuration).toBe(FORGE_AUDIO_DURATION);
    expect(FORGE_AUDIO_DURATION).toBe(2.64);
    expect(AUDIO_CUES.forgeStart.sources[0]).toContain('update.mp3');
  });
});
