import { extensionTarget } from '../../hosts/extension/platform';
import { projectAssetUrl } from '../../lib/project-assets';
import { gsap } from '../../motion/gsap';
import { prefersReducedMotion } from '../../motion/preference';

const EFFECT_BASE_URL = projectAssetUrl(
  'userscript-deck/visual/content-blocking-vfx',
);

export function contentBlockingVfxExtension() {
  return extensionTarget() === 'safari' ? 'mov' : 'webm';
}

function contentBlockingVfxUrl(name: string) {
  return `${EFFECT_BASE_URL}/${name}.${contentBlockingVfxExtension()}`;
}

const COMBO_GLYPH_URL = contentBlockingVfxUrl('combo-kill-glyph');
const COMBO_NUMBER_FONT_URL = projectAssetUrl('fonts/qiantu/qiantu-digits.ttf');
const COMBO_TOP_ORNAMENT_URL = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/plaque-top.webp',
);
const COMBO_BOTTOM_ORNAMENT_URL = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/plaque-bottom.webp',
);
const COMBO_PANEL_TEXTURE_URL = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/panel-texture.webp',
);
const EFFECT_KINDS = ['energy', 'sword'] as const;
export type ElementBlockingImpactKind = (typeof EFFECT_KINDS)[number];
type EffectProfile = {
  sources: readonly string[];
  minimumWidth: number;
  maximumWidth: number;
  scale: number;
};

type ElementBlockingImpactBounds = Pick<
  DOMRect,
  'left' | 'top' | 'width' | 'height'
>;

export type ElementBlockingImpactGeometry = {
  kind: ElementBlockingImpactKind;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type ElementBlockingImpactViewport = {
  width: number;
  height: number;
};

export type ElementBlockingComboLayout = {
  bannerOffsetY: number;
  countOffsetX: number;
  countOffsetY: number;
  glyphOffsetX: number;
  glyphOffsetY: number;
  columnGap: number;
};

export const ELEMENT_BLOCKING_COMBO_DEFAULT_LAYOUT: ElementBlockingComboLayout =
  {
    bannerOffsetY: 0,
    countOffsetX: 0,
    countOffsetY: 8,
    glyphOffsetX: 0,
    glyphOffsetY: -16,
    columnGap: 24,
  };

const LARGE_ELEMENT_VISUAL_SPAN = 320;
const MINIMUM_VISIBLE_FRACTION = 2 / 3;
const EFFECT_PROFILES: Record<ElementBlockingImpactKind, EffectProfile> = {
  energy: {
    sources: [3, 4].map((index) =>
      contentBlockingVfxUrl(`energy-slash-${String(index).padStart(2, '0')}`),
    ),
    minimumWidth: 320,
    maximumWidth: 620,
    scale: 2,
  },
  sword: {
    sources: [2, 5].map((index) =>
      contentBlockingVfxUrl(`sword-slash-${String(index).padStart(2, '0')}`),
    ),
    minimumWidth: 520,
    maximumWidth: 960,
    scale: 1.75,
  },
};
const MAX_EFFECT_DURATION_MS = 4_000;
const COMBO_WINDOW_MS = 2_200;
const COMBO_GLYPH_REVEAL_SECONDS = 434 / 1_000;
const COMBO_SHAKE_AMPLITUDES = [
  0, 1.5, 3, 4.5, 6, 7, 8, 9, 10, 11, 12,
] as const;

const preparedVideos: Record<
  ElementBlockingImpactKind,
  HTMLVideoElement | null
> = {
  energy: null,
  sword: null,
};
let comboCount = 0;
let lastComboHitAt = Number.NEGATIVE_INFINITY;
let comboBannerHost: HTMLDivElement | null = null;
let comboBannerTimeline: gsap.core.Timeline | null = null;
let comboGlyphPreload: HTMLVideoElement | null = null;
let comboNumberFont: FontFace | null = null;
let comboShakeTimeline: gsap.core.Timeline | null = null;
let comboShakeTarget: HTMLElement | null = null;
let comboShakeInlineTranslate = '';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function visualSpanForBounds(bounds: ElementBlockingImpactBounds) {
  return Math.sqrt(Math.max(1, bounds.width) * Math.max(1, bounds.height));
}

function effectKindForVisualSpan(
  visualSpan: number,
): ElementBlockingImpactKind {
  return visualSpan >= LARGE_ELEMENT_VISUAL_SPAN ? 'sword' : 'energy';
}

function fitEffectToViewport(
  width: number,
  height: number,
  viewport: ElementBlockingImpactViewport,
) {
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const scale = Math.min(
    1,
    viewportWidth / (width * MINIMUM_VISIBLE_FRACTION),
    viewportHeight / (height * MINIMUM_VISIBLE_FRACTION),
  );
  return {
    width: width * scale,
    height: height * scale,
  };
}

function visibleCenter(
  center: number,
  effectSize: number,
  viewportSize: number,
) {
  const overflow = effectSize * (1 - MINIMUM_VISIBLE_FRACTION);
  const minimum = effectSize / 2 - overflow;
  const maximum = Math.max(minimum, viewportSize - minimum);
  return clamp(center, minimum, maximum);
}

export function elementBlockingImpactGeometry(
  bounds: ElementBlockingImpactBounds,
  viewport: ElementBlockingImpactViewport,
): ElementBlockingImpactGeometry {
  const visualSpan = visualSpanForBounds(bounds);
  const kind = effectKindForVisualSpan(visualSpan);
  const profile = EFFECT_PROFILES[kind];
  const naturalWidth = clamp(
    visualSpan * profile.scale,
    profile.minimumWidth,
    profile.maximumWidth,
  );
  const size = fitEffectToViewport(
    naturalWidth,
    naturalWidth * (9 / 16),
    viewport,
  );
  return {
    kind,
    centerX: visibleCenter(
      bounds.left + bounds.width / 2,
      size.width,
      viewport.width,
    ),
    centerY: visibleCenter(
      bounds.top + bounds.height / 2,
      size.height,
      viewport.height,
    ),
    width: size.width,
    height: size.height,
  };
}

export function elementBlockingRandomVariant(random = Math.random) {
  const step = Math.floor(random() * 4);
  return {
    sourceIndex: step % 2,
    mirrored: step >= 2,
  };
}

function nextEffectVariant(kind: ElementBlockingImpactKind) {
  const sources = EFFECT_PROFILES[kind].sources;
  const variant = elementBlockingRandomVariant();
  return {
    source: sources[variant.sourceIndex],
    mirrored: variant.mirrored,
  };
}

export function nextElementBlockingComboCount(
  previousCount: number,
  previousHitAt: number,
  hitAt: number,
) {
  return previousCount > 0 && hitAt - previousHitAt <= COMBO_WINDOW_MS
    ? previousCount + 1
    : 1;
}

export function elementBlockingComboIntensity(comboCount: number) {
  return comboCount < 2 ? 0 : Math.min(5, comboCount);
}

export function elementBlockingComboShakeTier(comboCount: number) {
  return comboCount < 2 ? 0 : Math.min(10, comboCount - 1);
}

export function elementBlockingComboContainsPoint(
  bounds: readonly ElementBlockingImpactBounds[],
  x: number,
  y: number,
) {
  return bounds.some(
    (area) =>
      x >= area.left &&
      x <= area.left + area.width &&
      y >= area.top &&
      y <= area.top + area.height,
  );
}

function applyElementBlockingComboLayout(
  target: HTMLElement,
  layout: ElementBlockingComboLayout,
) {
  target.style.setProperty(
    '--combo-banner-offset-y',
    `${layout.bannerOffsetY}px`,
  );
  target.style.setProperty(
    '--combo-count-offset-x',
    `${layout.countOffsetX}px`,
  );
  target.style.setProperty(
    '--combo-count-offset-y',
    `${layout.countOffsetY}px`,
  );
  target.style.setProperty(
    '--combo-glyph-offset-x',
    `${layout.glyphOffsetX}px`,
  );
  target.style.setProperty(
    '--combo-glyph-offset-y',
    `${layout.glyphOffsetY}px`,
  );
  target.style.setProperty('--combo-column-gap', `${layout.columnGap}px`);
}

export function updateElementBlockingComboLayout(
  layout: ElementBlockingComboLayout,
) {
  if (!comboBannerHost) return false;
  applyElementBlockingComboLayout(comboBannerHost, layout);
  return true;
}

function stopElementBlockingScreenShake() {
  comboShakeTimeline?.kill();
  comboShakeTimeline = null;
  if (comboShakeTarget) {
    if (comboShakeInlineTranslate) {
      comboShakeTarget.style.translate = comboShakeInlineTranslate;
    } else {
      comboShakeTarget.style.removeProperty('translate');
    }
  }
  comboShakeTarget = null;
  comboShakeInlineTranslate = '';
}

function playElementBlockingScreenShake(tier: number) {
  stopElementBlockingScreenShake();
  if (tier < 1 || prefersReducedMotion()) return;
  const target = document.body;
  const amplitude = COMBO_SHAKE_AMPLITUDES[tier];
  if (
    !target ||
    amplitude === undefined ||
    getComputedStyle(target).translate !== 'none'
  ) {
    return;
  }

  const points = [
    [-1, 0.38],
    [0.82, -0.5],
    [-0.62, -0.28],
    [0.46, 0.34],
    [-0.25, 0.14],
    [0.12, -0.08],
    [0, 0],
  ] as const;
  const offset = { x: 0, y: 0 };
  const applyOffset = () => {
    target.style.translate = `${offset.x}px ${offset.y}px`;
  };
  comboShakeTarget = target;
  comboShakeInlineTranslate = target.style.translate;
  comboShakeTimeline = gsap.timeline({
    onComplete: stopElementBlockingScreenShake,
    onUpdate: applyOffset,
  });
  for (const [x, y] of points) {
    comboShakeTimeline.to(offset, {
      x: amplitude * x,
      y: amplitude * y,
      duration: Math.min(270, 150 + tier * 30) / points.length / 1_000,
      ease: 'none',
    });
  }
}

export function prepareElementBlockingComboEffect() {
  if (!comboGlyphPreload) {
    comboGlyphPreload = document.createElement('video');
    comboGlyphPreload.preload = 'auto';
    comboGlyphPreload.src = COMBO_GLYPH_URL;
    comboGlyphPreload.load();
  }
  if (!comboNumberFont && typeof FontFace !== 'undefined') {
    comboNumberFont = new FontFace(
      'Card Master Combo Number',
      `url("${COMBO_NUMBER_FONT_URL}")`,
      {
        style: 'normal',
        weight: '400',
        unicodeRange: 'U+0030-0039',
      },
    );
    document.fonts.add(comboNumberFont);
    void comboNumberFont.load().catch(() => undefined);
  }
}

export function playElementBlockingComboEffect({
  preview = false,
  hold = false,
  layout = ELEMENT_BLOCKING_COMBO_DEFAULT_LAYOUT,
}: {
  preview?: boolean;
  hold?: boolean;
  layout?: ElementBlockingComboLayout;
} = {}) {
  const now = performance.now();
  comboCount = nextElementBlockingComboCount(comboCount, lastComboHitAt, now);
  if (preview) comboCount = Math.max(2, comboCount);
  lastComboHitAt = now;
  const intensity = elementBlockingComboIntensity(comboCount);

  comboBannerTimeline?.kill();
  comboBannerTimeline = null;
  comboBannerHost?.remove();
  comboBannerHost = null;
  if (intensity < 2) return comboCount;
  playElementBlockingScreenShake(elementBlockingComboShakeTier(comboCount));

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.contain = 'strict';
  applyElementBlockingComboLayout(host, layout);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: "Card Master Combo Number";
      font-style: normal;
      font-display: block;
      font-weight: 400;
      src: url("${COMBO_NUMBER_FONT_URL}") format("truetype");
      unicode-range: U+0030-0039;
    }
    :host {
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: block;
      pointer-events: none;
      contain: strict;
    }
    .combo {
      --combo-entry: #ba6f24;
      --combo-hot: #fff8d0;
      --combo-peak: #ffd36d;
      --combo-settle: #f0a43b;
      --combo-glow: rgb(239 153 45 / 0.62);
      position: absolute;
      top: calc(clamp(64px, 9vh, 104px) + var(--combo-banner-offset-y));
      left: 50%;
      display: grid;
      grid-template-rows: auto 92px auto;
      width: min(330px, 88vw);
      overflow: visible;
      isolation: isolate;
      transform-origin: 50% 50%;
    }
    .combo[data-intensity="2"] {
      --combo-entry: #b46c22;
      --combo-hot: #fffbe1;
      --combo-peak: #ffd05a;
      --combo-settle: #e9912d;
      --combo-glow: rgb(255 184 67 / 0.74);
    }
    .combo[data-intensity="3"] {
      --combo-entry: #b24d1f;
      --combo-hot: #fff7cb;
      --combo-peak: #ff9c3f;
      --combo-settle: #ef642a;
      --combo-glow: rgb(255 104 34 / 0.82);
    }
    .combo[data-intensity="4"] {
      --combo-entry: #8f211c;
      --combo-hot: #fff;
      --combo-peak: #ff5235;
      --combo-settle: #d92d27;
      --combo-glow: rgb(255 42 25 / 0.9);
    }
    .combo[data-intensity="5"] {
      --combo-entry: #681414;
      --combo-hot: #fff;
      --combo-peak: #ff281c;
      --combo-settle: #b81717;
      --combo-glow: rgb(255 24 16 / 0.98);
    }
    .combo > * {
      opacity: 1;
      transition: opacity 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .combo.is-pointer-obscuring > * {
      opacity: 0.24;
    }
    .combo__ornament {
      position: relative;
      z-index: 1;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      filter: sepia(0.14) saturate(1.04) brightness(1.16)
        drop-shadow(0 0 8px var(--combo-glow));
    }
    .combo__ornament.is-top {
      aspect-ratio: 16 / 1;
      object-position: center bottom;
    }
    .combo__ornament.is-bottom {
      aspect-ratio: 8 / 1;
      object-position: center top;
    }
    .combo__surface {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 92px;
      overflow: visible;
      background:
        radial-gradient(
          ellipse at center,
          rgb(7 12 13 / 0.98) 0 40%,
          rgb(7 12 13 / 0.82) 68%,
          transparent 100%
        ),
        url("${COMBO_PANEL_TEXTURE_URL}") center / 100% 100% no-repeat;
      filter:
        drop-shadow(0 8px 18px rgb(0 0 0 / 0.46))
        drop-shadow(0 0 22px var(--combo-glow));
      isolation: isolate;
    }
    .combo__content {
      position: absolute;
      z-index: 3;
      inset: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: var(--combo-column-gap);
      align-items: center;
      width: 100%;
      overflow: visible;
    }
    .combo__count-slot,
    .combo__glyph-slot {
      position: relative;
      z-index: 4;
      transition:
        top 120ms cubic-bezier(0.16, 1, 0.3, 1),
        left 120ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .combo__count-slot {
      top: var(--combo-count-offset-y);
      left: var(--combo-count-offset-x);
      display: grid;
      justify-self: end;
      place-items: center;
    }
    .combo__glyph-slot {
      top: var(--combo-glyph-offset-y);
      left: var(--combo-glyph-offset-x);
      display: block;
      justify-self: start;
    }
    .combo__count {
      position: relative;
      z-index: 4;
      display: grid;
      margin-inline-end: -0.25em;
      color: var(--combo-settle);
      font: 400 clamp(96px, 8vw, 124px) / 0.68 "Card Master Combo Number",
        fantasy;
      font-variant-numeric: proportional-nums;
      letter-spacing: 0;
      text-align: center;
      text-shadow:
        0 3px 0 #4c160b,
        0 0 12px var(--combo-glow),
        0 0 30px var(--combo-glow);
      transform-origin: 50% 50%;
      place-items: center;
    }
    .combo__glyph {
      position: relative;
      z-index: 4;
      display: block;
      width: 185px;
      aspect-ratio: 380 / 222;
      overflow: visible;
      object-fit: contain;
      object-position: center;
      background: transparent;
      filter:
        drop-shadow(0 0 5px rgb(255 244 202 / 0.86))
        drop-shadow(0 0 15px var(--combo-glow));
      transform-origin: 0 50%;
    }
  `;
  const banner = document.createElement('div');
  banner.className = 'combo';
  banner.dataset.intensity = String(intensity);
  const topOrnament = document.createElement('img');
  topOrnament.className = 'combo__ornament is-top';
  topOrnament.src = COMBO_TOP_ORNAMENT_URL;
  topOrnament.alt = '';
  const surface = document.createElement('div');
  surface.className = 'combo__surface';
  const content = document.createElement('span');
  content.className = 'combo__content';
  const glyph = document.createElement('video');
  glyph.className = 'combo__glyph';
  glyph.src = COMBO_GLYPH_URL;
  glyph.preload = 'auto';
  glyph.muted = true;
  glyph.playsInline = true;
  glyph.disablePictureInPicture = true;
  glyph.setAttribute('aria-hidden', 'true');
  const count = document.createElement('strong');
  count.className = 'combo__count';
  count.textContent = String(comboCount);
  const countSlot = document.createElement('span');
  countSlot.className = 'combo__count-slot';
  countSlot.append(count);
  const glyphSlot = document.createElement('span');
  glyphSlot.className = 'combo__glyph-slot';
  glyphSlot.append(glyph);
  const bottomOrnament = document.createElement('img');
  bottomOrnament.className = 'combo__ornament is-bottom';
  bottomOrnament.src = COMBO_BOTTOM_ORNAMENT_URL;
  bottomOrnament.alt = '';
  content.append(countSlot, glyphSlot);
  surface.append(content);
  banner.append(topOrnament, surface, bottomOrnament);
  shadow.append(style, banner);
  document.documentElement.append(host);
  comboBannerHost = host;
  const clearPointerObscuring = () => {
    banner.classList.remove('is-pointer-obscuring');
  };
  const handlePointerMove = (event: PointerEvent) => {
    banner.classList.toggle(
      'is-pointer-obscuring',
      elementBlockingComboContainsPoint(
        [
          banner.getBoundingClientRect(),
          count.getBoundingClientRect(),
          glyph.getBoundingClientRect(),
        ],
        event.clientX,
        event.clientY,
      ),
    );
  };
  document.addEventListener('pointermove', handlePointerMove, {
    capture: true,
    passive: true,
  });
  window.addEventListener('blur', clearPointerObscuring);
  const computed = getComputedStyle(banner);
  const color = (name: string) => computed.getPropertyValue(name).trim();
  const entry = color('--combo-entry');
  const hot = color('--combo-hot');
  const peak = color('--combo-peak');
  const settleColor = color('--combo-settle');
  const glow = color('--combo-glow');
  let timeline: gsap.core.Timeline | null = null;
  const removeBanner = () => {
    if (comboBannerTimeline === timeline) comboBannerTimeline = null;
    if (comboBannerHost === host) comboBannerHost = null;
    glyph.pause();
    glyph.removeAttribute('src');
    glyph.load();
    document.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('blur', clearPointerObscuring);
    host.remove();
  };
  gsap.set(banner, {
    xPercent: -50,
    y: -14,
    scaleX: 0.86,
    scaleY: 0.76,
    opacity: 0,
  });
  gsap.set(count, {
    x: -24,
    y: 20,
    scale: 2.1,
    rotation: -9,
    opacity: 0,
    color: entry,
    textShadow: '0 0 0 rgba(0, 0, 0, 0)',
  });
  gsap.set(glyph, { x: 12, scale: 0.82, opacity: 0 });
  timeline = gsap.timeline({
    paused: true,
    onComplete: removeBanner,
    onInterrupt: removeBanner,
  });
  timeline
    .to(
      banner,
      {
        y: 0,
        scaleX: 1.02,
        scaleY: 1.04,
        opacity: 1,
        duration: 0.22,
        ease: 'power3.out',
      },
      0,
    )
    .to(
      banner,
      {
        scaleX: 1,
        scaleY: 1,
        duration: 0.24,
        ease: 'power2.out',
      },
      0.22,
    )
    .to(
      count,
      {
        x: -5,
        y: -4,
        scale: 1.62,
        rotation: 2,
        opacity: 1,
        color: hot,
        textShadow: `0 3px 0 #4c160b, 0 0 22px ${hot}, 0 0 54px ${glow}`,
        duration: 0.396,
        ease: 'power3.out',
      },
      0,
    )
    .to(
      count,
      {
        x: 0,
        y: 1,
        scale: 0.94,
        rotation: -1,
        color: peak,
        duration: 0.484,
        ease: 'power2.inOut',
      },
      0.396,
    )
    .to(
      count,
      {
        y: -2,
        scale: 1.18,
        rotation: 0,
        color: hot,
        duration: 0.396,
        ease: 'back.out(1.7)',
      },
      0.88,
    )
    .to(
      count,
      {
        y: 0,
        scale: 1,
        color: settleColor,
        duration: 0.396,
        ease: 'power3.out',
      },
      1.276,
    )
    .to(
      glyph,
      {
        x: 0,
        scale: 1.08,
        opacity: 1,
        duration: COMBO_GLYPH_REVEAL_SECONDS,
        ease: 'power3.out',
      },
      0,
    )
    .to(
      glyph,
      { scale: 1, duration: 0.186, ease: 'power2.out' },
      COMBO_GLYPH_REVEAL_SECONDS,
    )
    .to(
      banner,
      {
        y: -8,
        scaleX: 0.96,
        scaleY: 0.9,
        opacity: 0,
        duration: 0.308,
        ease: 'power2.in',
      },
      1.892,
    )
    .to(
      count,
      {
        x: 5,
        y: -8,
        scale: 0.9,
        opacity: 0,
        duration: 0.308,
        ease: 'power2.in',
      },
      1.892,
    );
  if (hold) timeline.addPause(1.672);
  comboBannerTimeline = timeline;
  void glyph.play().catch(() => undefined);
  timeline.play(0);
  return comboCount;
}

function createEffectVideo(kind: ElementBlockingImpactKind) {
  const variant = nextEffectVariant(kind);
  const video = document.createElement('video');
  video.src = variant.source;
  video.dataset.mirrored = String(variant.mirrored);
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  video.setAttribute('aria-hidden', 'true');
  return video;
}

function prepareEffectKind(kind: ElementBlockingImpactKind) {
  if (preparedVideos[kind]) return;
  preparedVideos[kind] = createEffectVideo(kind);
  preparedVideos[kind]?.load();
}

export function prepareElementBlockingImpactEffect() {
  prepareElementBlockingComboEffect();
  for (const kind of EFFECT_KINDS) prepareEffectKind(kind);
}

export function playElementBlockingImpactEffect(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const { kind, centerX, centerY, width, height } =
    elementBlockingImpactGeometry(bounds, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  const video = preparedVideos[kind] ?? createEffectVideo(kind);
  preparedVideos[kind] = null;

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.contain = 'strict';

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: block;
      pointer-events: none;
      contain: strict;
    }
    video {
      position: absolute;
      left: ${centerX}px;
      top: ${centerY}px;
      width: ${width}px;
      height: ${height}px;
      object-fit: contain;
      background: transparent;
      translate: -50% -50%;
      pointer-events: none;
    }
    video[data-mirrored="true"] {
      transform: scaleX(-1);
    }
  `;
  shadow.append(style, video);
  document.documentElement.append(host);
  const comboCount = playElementBlockingComboEffect();

  let removed = false;
  let timeout = 0;
  const remove = () => {
    if (removed) return;
    removed = true;
    window.clearTimeout(timeout);
    video.pause();
    video.removeAttribute('src');
    video.load();
    host.remove();
  };
  video.addEventListener('ended', remove, { once: true });
  video.addEventListener('error', remove, { once: true });
  timeout = window.setTimeout(remove, MAX_EFFECT_DURATION_MS);
  void video.play().catch(remove);
  prepareEffectKind(kind);
  return { kind, comboCount };
}
