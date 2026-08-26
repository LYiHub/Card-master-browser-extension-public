export type PinyinDictionaryEntry = Readonly<{
  w: string;
  f: number;
}>;

export type PinyinDictionary = Readonly<
  Record<string, readonly PinyinDictionaryEntry[]>
>;

export type GamepadPinyinCandidate = Readonly<{
  word: string;
  matchedLength: number;
}>;

export type GamepadKeyboardInputMode = 'chinese' | 'english';

export const DEFAULT_GAMEPAD_KEYBOARD_INPUT_MODE: GamepadKeyboardInputMode =
  'chinese';

const dictionaryKeyCache = new WeakMap<object, readonly string[]>();

function normalizedPinyin(value: string) {
  return value.toLowerCase().replace(/[^a-z']/g, '');
}

function dictionaryKeys(dictionary: PinyinDictionary) {
  const cached = dictionaryKeyCache.get(dictionary);
  if (cached) return cached;
  const keys = Object.keys(dictionary).sort();
  dictionaryKeyCache.set(dictionary, keys);
  return keys;
}

function lowerBound(values: readonly string[], target: string) {
  let start = 0;
  let end = values.length;
  while (start < end) {
    const middle = start + Math.floor((end - start) / 2);
    if ((values[middle] ?? '') < target) start = middle + 1;
    else end = middle;
  }
  return start;
}

function rankedCandidates(
  entries: readonly PinyinDictionaryEntry[],
  matchedLength: number,
  limit: number,
) {
  const seen = new Set<string>();
  return [...entries]
    .sort((left, right) => right.f - left.f)
    .flatMap((entry) => {
      if (!entry.w || seen.has(entry.w)) return [];
      seen.add(entry.w);
      return [{ word: entry.w, matchedLength }];
    })
    .slice(0, Math.max(1, limit));
}

function forwardPinyinCandidates(
  dictionary: PinyinDictionary,
  key: string,
  matchedLength: number,
  limit: number,
) {
  const keys = dictionaryKeys(dictionary);
  const entries: PinyinDictionaryEntry[] = [];
  for (
    let index = lowerBound(keys, key);
    index < keys.length && keys[index]?.startsWith(key);
    index += 1
  ) {
    entries.push(...(dictionary[keys[index] ?? ''] ?? []));
  }
  return rankedCandidates(entries, matchedLength, limit);
}

function mergeCandidates(
  groups: readonly (readonly GamepadPinyinCandidate[])[],
  limit: number,
) {
  const seen = new Set<string>();
  return groups
    .flat()
    .filter((candidate) => {
      if (seen.has(candidate.word)) return false;
      seen.add(candidate.word);
      return true;
    })
    .slice(0, Math.max(1, limit));
}

export function gamepadPinyinCandidates(
  dictionary: PinyinDictionary,
  input: string,
  limit = 5,
): readonly GamepadPinyinCandidate[] {
  const pinyin = normalizedPinyin(input);
  if (!pinyin) return [];

  const fullKey = pinyin.replaceAll("'", '');
  if (!fullKey) return [];
  const exact = dictionary[fullKey];
  const exactCandidates = exact?.length
    ? rankedCandidates(exact, pinyin.length, limit)
    : [];
  const forwardCandidates = forwardPinyinCandidates(
    dictionary,
    fullKey,
    pinyin.length,
    limit,
  );
  const candidates = mergeCandidates(
    [exactCandidates, forwardCandidates],
    limit,
  );
  if (candidates.length) return candidates;

  for (let length = pinyin.length - 1; length > 0; length -= 1) {
    const key = pinyin.slice(0, length).replaceAll("'", '');
    const entries = dictionary[key];
    if (!entries?.length) continue;
    return rankedCandidates(entries, length, limit);
  }
  return [];
}
