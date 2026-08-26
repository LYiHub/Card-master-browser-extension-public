export const DEFAULT_CARD_ACCENT = '#aeb8b6';

const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 64;
const MIN_ALPHA = 24;
const MIN_CHROMATICITY = 0.025;

type Oklab = {
  lightness: number;
  a: number;
  b: number;
};

type AccentCluster = Oklab & {
  weight: number;
  edgeWeight: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function linearChannel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function gammaChannel(value: number) {
  const normalized =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(clamp(normalized, 0, 1) * 255);
}

function rgbToOklab(red: number, green: number, blue: number): Oklab {
  const linearRed = linearChannel(red);
  const linearGreen = linearChannel(green);
  const linearBlue = linearChannel(blue);
  const l =
    0.4122214708 * linearRed +
    0.5363325363 * linearGreen +
    0.0514459929 * linearBlue;
  const m =
    0.2119034982 * linearRed +
    0.6806995451 * linearGreen +
    0.1073969566 * linearBlue;
  const s =
    0.0883024619 * linearRed +
    0.2817188376 * linearGreen +
    0.6299787005 * linearBlue;
  const cubeRootL = Math.cbrt(l);
  const cubeRootM = Math.cbrt(m);
  const cubeRootS = Math.cbrt(s);
  return {
    lightness:
      0.2104542553 * cubeRootL +
      0.793617785 * cubeRootM -
      0.0040720468 * cubeRootS,
    a:
      1.9779984951 * cubeRootL -
      2.428592205 * cubeRootM +
      0.4505937099 * cubeRootS,
    b:
      0.0259040371 * cubeRootL +
      0.7827717662 * cubeRootM -
      0.808675766 * cubeRootS,
  };
}

function oklabToRgb({ lightness, a, b }: Oklab) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const;
}

function inSrgbGamut(channels: readonly number[]) {
  return channels.every((channel) => channel >= 0 && channel <= 1);
}

function accentHex(lightness: number, chroma: number, hue: number) {
  let fittedChroma = chroma;
  let channels: readonly number[] = [0, 0, 0];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    channels = oklabToRgb({
      lightness,
      a: Math.cos(hue) * fittedChroma,
      b: Math.sin(hue) * fittedChroma,
    });
    if (inSrgbGamut(channels)) break;
    fittedChroma *= 0.9;
  }
  return `#${channels
    .map(gammaChannel)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function pixelEdgeWeight(x: number, y: number, width: number, height: number) {
  const edgeDistance = Math.min(x, width - 1 - x, y, height - 1 - y);
  const edgeRange = Math.max(1, Math.min(width, height) * 0.3);
  const edgeProgress = clamp(edgeDistance / edgeRange, 0, 1);
  return 1.45 - edgeProgress * 1.1;
}

function clusterKey(lightness: number, chroma: number, hue: number) {
  const hueBin = Math.floor((((hue + Math.PI) / (2 * Math.PI)) * 24) % 24);
  const lightnessBin = Math.floor(clamp(lightness, 0, 0.999) * 5);
  const chromaBin = Math.floor(clamp(chroma / 0.08, 0, 3.999));
  return `${hueBin}:${lightnessBin}:${chromaBin}`;
}

export function isCardAccent(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

export function deriveCardAccent(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) {
    throw new Error('卡牌封面取色需要有效的 RGBA 像素。');
  }

  const clusters = new Map<string, AccentCluster>();
  let neutralLightness = 0;
  let neutralWeight = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = pixels[offset + 3] ?? 0;
      if (alpha < MIN_ALPHA) continue;
      const color = rgbToOklab(
        pixels[offset] ?? 0,
        pixels[offset + 1] ?? 0,
        pixels[offset + 2] ?? 0,
      );
      const chroma = Math.hypot(color.a, color.b);
      const alphaWeight = alpha / 255;
      const lightnessWeight =
        smoothstep(0.06, 0.3, color.lightness) *
        (1 - smoothstep(0.82, 0.98, color.lightness));
      if (lightnessWeight <= 0) continue;
      const edgeWeight = pixelEdgeWeight(x, y, width, height);

      if (chroma < MIN_CHROMATICITY) {
        const weight = alphaWeight * lightnessWeight * edgeWeight;
        neutralLightness += color.lightness * weight;
        neutralWeight += weight;
        continue;
      }

      const chromaWeight = 0.3 + smoothstep(0.02, 0.2, chroma) * 0.7;
      const weight = alphaWeight * lightnessWeight * chromaWeight * edgeWeight;
      const hue = Math.atan2(color.b, color.a);
      const key = clusterKey(color.lightness, chroma, hue);
      const cluster = clusters.get(key) ?? {
        lightness: 0,
        a: 0,
        b: 0,
        weight: 0,
        edgeWeight: 0,
      };
      cluster.lightness += color.lightness * weight;
      cluster.a += color.a * weight;
      cluster.b += color.b * weight;
      cluster.weight += weight;
      cluster.edgeWeight += edgeWeight * weight;
      clusters.set(key, cluster);
    }
  }

  const candidates = [...clusters.values()]
    .filter((cluster) => cluster.weight > 0)
    .map((cluster) => {
      const lightness = cluster.lightness / cluster.weight;
      const a = cluster.a / cluster.weight;
      const b = cluster.b / cluster.weight;
      const chroma = Math.hypot(a, b);
      const averageEdgeWeight = cluster.edgeWeight / cluster.weight;
      return {
        lightness,
        a,
        b,
        chroma,
        score:
          cluster.weight *
          (0.72 + smoothstep(0.03, 0.18, chroma) * 0.28) *
          averageEdgeWeight,
      };
    })
    .sort((left, right) => right.score - left.score);

  const selected = candidates[0];
  if (!selected) {
    if (neutralWeight <= 0) return DEFAULT_CARD_ACCENT;
    const lightness = clamp(neutralLightness / neutralWeight, 0.68, 0.76);
    const channel = gammaChannel(lightness ** 3);
    const hex = channel.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  const hue = Math.atan2(selected.b, selected.a);
  const normalizedLightness = clamp(
    0.71 + (selected.lightness - 0.5) * 0.12,
    0.67,
    0.77,
  );
  const normalizedChroma = clamp(selected.chroma * 1.12, 0.085, 0.18);
  return accentHex(normalizedLightness, normalizedChroma, hue);
}

export async function deriveCardAccentFromImageSource(
  source: CanvasImageSource,
) {
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(SAMPLE_WIDTH, SAMPLE_HEIGHT)
      : Object.assign(document.createElement('canvas'), {
          width: SAMPLE_WIDTH,
          height: SAMPLE_HEIGHT,
        });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法创建卡牌封面取色画布。');
  context.drawImage(source, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  return deriveCardAccent(
    context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data,
    SAMPLE_WIDTH,
    SAMPLE_HEIGHT,
  );
}

export async function deriveCardAccentFromDataUrl(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('卡牌封面无法读取，不能计算边框颜色。');
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') {
    const image = await createImageBitmap(blob);
    try {
      return await deriveCardAccentFromImageSource(image);
    } finally {
      image.close();
    }
  }
  if (typeof document === 'undefined') {
    throw new Error('当前浏览器无法解码卡牌封面颜色。');
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('卡牌封面解码失败。'));
      image.src = objectUrl;
    });
    return await deriveCardAccentFromImageSource(image);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
