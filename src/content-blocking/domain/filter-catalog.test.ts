import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  CONTENT_BLOCKER_BUILTIN_FILTERS,
  CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS,
} from './types';

const dnrPackageDist = resolve(
  dirname(fileURLToPath(import.meta.resolve('@adguard/dnr-rulesets'))),
  '..',
);

describe('content blocking built-in filter catalog', () => {
  it('uses unique identities and keeps defaults inside the packaged catalog', () => {
    expect(
      new Set(CONTENT_BLOCKER_BUILTIN_FILTERS.map((filter) => filter.id)).size,
    ).toBe(CONTENT_BLOCKER_BUILTIN_FILTERS.length);
    expect(
      new Set(CONTENT_BLOCKER_BUILTIN_FILTERS.map((filter) => filter.filterId))
        .size,
    ).toBe(CONTENT_BLOCKER_BUILTIN_FILTERS.length);
    expect(CONTENT_BLOCKER_DEFAULT_STATIC_FILTER_IDS.length).toBeGreaterThan(0);
  });

  it('matches every displayed rule count to the pinned official ruleset', () => {
    for (const filter of CONTENT_BLOCKER_BUILTIN_FILTERS) {
      const ruleset = JSON.parse(
        readFileSync(
          resolve(
            dnrPackageDist,
            'filters/chromium-mv3/declarative',
            `ruleset_${filter.filterId}`,
            `ruleset_${filter.filterId}.json`,
          ),
          'utf8',
        ),
      ) as unknown[];
      expect(ruleset.length, filter.name).toBe(filter.ruleCount);
    }
  });
});
