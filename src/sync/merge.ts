import {
  equal,
  type SyncChange,
  type SyncChoices,
  type SyncEntries,
} from './model';

export function mergeEntries(
  base: SyncEntries,
  local: SyncEntries,
  remote: SyncEntries,
  choices: SyncChoices = {},
) {
  const entries: SyncEntries = {};
  const changes: SyncChange[] = [];
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const before = base[key] ?? null;
    const here = local[key] ?? null;
    const there = remote[key] ?? null;
    const conflict =
      !equal(here, there) && !equal(here, before) && !equal(there, before);
    const choice = choices[key];
    const selected = conflict
      ? choice === 'local'
        ? here
        : there
      : equal(there, before)
        ? here
        : there;
    entries[key] = selected;
    if (conflict || !equal(here, there))
      changes.push({
        key,
        name: here?.name ?? there?.name ?? before?.name ?? key,
        kind: conflict
          ? 'conflict'
          : selected === null
            ? 'delete'
            : here === null || there === null
              ? 'add'
              : 'update',
        local: here,
        remote: there,
      });
  }
  return {
    entries,
    changes,
    unresolved: changes.filter(
      (change) => change.kind === 'conflict' && !choices[change.key],
    ),
  };
}

export function restoreEntries(
  current: SyncEntries,
  history: SyncEntries,
): SyncEntries {
  return Object.fromEntries(
    [...new Set([...Object.keys(current), ...Object.keys(history)])].map(
      (key) => [key, history[key] ?? null],
    ),
  );
}
