function lines(source: string) {
  return source.replace(/\r\n?/g, '\n').split('\n');
}

export function mergeUserRules(
  baseSource: string,
  localSource: string,
  remoteSource: string,
) {
  const baseLines = lines(baseSource);
  const localLines = lines(localSource);
  const remoteLines = lines(remoteSource);
  const base = new Set(baseLines);
  const local = new Set(localLines);
  const merged = remoteLines.filter(
    (line) => !base.has(line) || local.has(line),
  );
  const mergedLines = new Set(merged);

  for (const line of localLines) {
    if (base.has(line) || mergedLines.has(line)) continue;
    merged.push(line);
    mergedLines.add(line);
  }

  return merged.join('\n');
}
