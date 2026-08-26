export const ACTION_RING_PALETTE = [
  { id: 'gold', label: '金', color: '#f0c66e' },
  { id: 'cyan', label: '青', color: '#79cee0' },
  { id: 'blue', label: '蓝', color: '#8aaaf5' },
  { id: 'green', label: '绿', color: '#7bdaa0' },
  { id: 'amber', label: '橙', color: '#f1b96f' },
  { id: 'red', label: '赤', color: '#ff8068' },
] as const;

const ACTION_RING_BASE_COLORS = ACTION_RING_PALETTE.map(({ color }) => color);

const ACTION_RING_TONES = [
  { weight: 100, target: null },
  { weight: 84, target: '#d9b76a' },
  { weight: 82, target: '#bdd1d2' },
  { weight: 88, target: '#6b4331' },
] as const;

const ACTION_RING_EXTENDED_TARGETS = [
  '#071114',
  '#d9b76a',
  '#bdd1d2',
  '#6b4331',
] as const;

function colorChannels(color: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
}

function mixHexColors(base: string, target: string, baseWeight: number) {
  const normalizedWeight = Math.min(1, Math.max(0, baseWeight / 100));
  const baseChannels = colorChannels(base);
  const targetChannels = colorChannels(target);
  return `#${baseChannels
    .map((channel, index) =>
      Math.round(
        channel * normalizedWeight +
          (targetChannels[index] ?? 0) * (1 - normalizedWeight),
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

export function sequencedActionColor(index: number) {
  const normalizedIndex = Math.max(0, Math.trunc(index));
  const base =
    ACTION_RING_BASE_COLORS[normalizedIndex % ACTION_RING_BASE_COLORS.length];
  const band = Math.floor(normalizedIndex / ACTION_RING_BASE_COLORS.length);
  const tone = ACTION_RING_TONES[band];
  if (tone) {
    return tone.target
      ? `color-mix(in srgb, ${base} ${tone.weight}%, ${tone.target})`
      : base;
  }
  const extendedBand = band - ACTION_RING_TONES.length;
  const target =
    ACTION_RING_EXTENDED_TARGETS[
      extendedBand % ACTION_RING_EXTENDED_TARGETS.length
    ];
  const weight = 86 - ((extendedBand * 0.317) % 28);
  return `color-mix(in srgb, ${base} ${weight.toFixed(3)}%, ${target})`;
}

export function sequencedActionHexColor(index: number) {
  const normalizedIndex = Math.max(0, Math.trunc(index));
  const base =
    ACTION_RING_BASE_COLORS[normalizedIndex % ACTION_RING_BASE_COLORS.length];
  const band = Math.floor(normalizedIndex / ACTION_RING_BASE_COLORS.length);
  const tone = ACTION_RING_TONES[band];
  if (tone) {
    return tone.target ? mixHexColors(base, tone.target, tone.weight) : base;
  }
  const extendedBand = band - ACTION_RING_TONES.length;
  const target =
    ACTION_RING_EXTENDED_TARGETS[
      extendedBand % ACTION_RING_EXTENDED_TARGETS.length
    ];
  const weight = 86 - ((extendedBand * 0.317) % 28);
  return mixHexColors(base, target, weight);
}

export function sequencedActionColors(count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    sequencedActionColor(index),
  );
}

export function sequencedActionHexColors(count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    sequencedActionHexColor(index),
  );
}
