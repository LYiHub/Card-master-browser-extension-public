import { describe, expect, it } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  type AutomaticUserscriptUpdateCandidate,
  mergeAutomaticUserscriptUpdates,
} from './automatic-update-commit';

function updateCandidate(
  script: (typeof INITIAL_USERSCRIPTS)[number],
): AutomaticUserscriptUpdateCandidate {
  return {
    previousSource: script.source.code,
    script: {
      ...script,
      source: {
        ...script.source,
        code: `${script.source.code}\n// updated`,
      },
    },
  };
}

describe('mergeAutomaticUserscriptUpdates', () => {
  it('commits an eligible update while preserving current local state', () => {
    const original = structuredClone(INITIAL_USERSCRIPTS[0]);
    const current = {
      ...original,
      manager: { ...original.manager, enabled: false },
      runtime: { ...original.runtime, pendingRefresh: true },
    };
    const result = mergeAutomaticUserscriptUpdates(
      [current],
      new Map([[current.id, updateCandidate(original)]]),
      { updateIntervalDays: 1, updateEnabledOnly: false },
    );

    expect(result.changedIds).toEqual([current.id]);
    expect(result.scripts[0]?.source.code).toContain('// updated');
    expect(result.scripts[0]?.manager).toEqual(current.manager);
    expect(result.scripts[0]?.runtime).toEqual(current.runtime);
  });

  it('rejects stale candidates and scripts that stopped checking for updates', () => {
    const original = structuredClone(INITIAL_USERSCRIPTS[0]);
    const candidate = updateCandidate(original);
    const sourceChanged = {
      ...original,
      source: {
        ...original.source,
        code: `${original.source.code}\n// edited`,
      },
    };
    const checkingDisabled = {
      ...original,
      manager: { ...original.manager, checkForUpdates: false },
    };

    for (const current of [sourceChanged, checkingDisabled]) {
      const result = mergeAutomaticUserscriptUpdates(
        [current],
        new Map([[current.id, candidate]]),
        { updateIntervalDays: 1, updateEnabledOnly: false },
      );
      expect(result.scripts).toEqual([current]);
      expect(result.changedIds).toEqual([]);
    }
  });

  it('uses the latest global policy and enabled state at commit time', () => {
    const original = structuredClone(INITIAL_USERSCRIPTS[0]);
    const disabled = {
      ...original,
      manager: { ...original.manager, enabled: false },
    };
    const candidates = new Map([[disabled.id, updateCandidate(original)]]);

    expect(
      mergeAutomaticUserscriptUpdates([disabled], candidates, {
        updateIntervalDays: 1,
        updateEnabledOnly: true,
      }).changedIds,
    ).toEqual([]);
    expect(
      mergeAutomaticUserscriptUpdates([original], candidates, {
        updateIntervalDays: 0,
        updateEnabledOnly: false,
      }).changedIds,
    ).toEqual([]);
  });
});
