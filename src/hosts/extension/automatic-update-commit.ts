import type { UserscriptSettings } from '../../userscript/application/settings';
import type { InstalledUserscript } from '../../userscript/domain/types';

export type AutomaticUserscriptUpdateCandidate = Readonly<{
  previousSource: string;
  script: InstalledUserscript;
}>;

export function mergeAutomaticUserscriptUpdates(
  current: readonly InstalledUserscript[],
  candidates: ReadonlyMap<string, AutomaticUserscriptUpdateCandidate>,
  settings: Pick<
    UserscriptSettings,
    'updateIntervalDays' | 'updateEnabledOnly'
  >,
) {
  if (settings.updateIntervalDays === 0) {
    return { scripts: current, changedIds: [] as string[] };
  }

  const changedIds: string[] = [];
  const scripts = current.map((script) => {
    const candidate = candidates.get(script.id);
    if (
      !candidate ||
      script.source.code !== candidate.previousSource ||
      !script.manager.checkForUpdates ||
      (settings.updateEnabledOnly && !script.manager.enabled)
    ) {
      return script;
    }

    changedIds.push(script.id);
    return {
      ...candidate.script,
      presentation: script.presentation,
      manager: script.manager,
      runtime: script.runtime,
    };
  });

  return {
    scripts: changedIds.length > 0 ? scripts : current,
    changedIds,
  };
}
