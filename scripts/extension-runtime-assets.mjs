import { readdirSync } from 'node:fs';

const cardAudio = [
  'coin-flip-03.mp3',
  'deal-03.mp3',
  'deal-04.mp3',
  'deal-05.mp3',
  'discard-04.mp3',
  'discard-06.mp3',
  'draw-01.mp3',
  'draw-05.mp3',
  'flip-01.mp3',
  'flip-02.mp3',
  'place-05.mp3',
  'place-07.mp3',
  'place-08.mp3',
  'reveal-09.mp3',
  'reveal-10.mp3',
  'reveal-11.mp3',
  'shuffle-01.mp3',
  'shuffle-02.mp3',
  'slide-01.mp3',
  'slide-02.mp3',
  'slide-03.mp3',
  'turn-pass-02.mp3',
  'turn-pass-04.mp3',
].map((file) => `userscript-deck/audio/card/${file}`);

const effectsAudio = [
  'action-attach.mp3',
  'burn.mp3',
  'cast-charge.mp3',
  'cast.mp3',
  'content-blocking-energy.mp3',
  'content-blocking-sword.mp3',
  'forge.mp3',
  'toggle.mp3',
  'update.mp3',
].map((file) => `userscript-deck/audio/effects/${file}`);

const userscriptCardAssets = readdirSync(
  new URL(
    '../assets/userscript-deck/card-art/userscript-cards/',
    import.meta.url,
  ),
  { withFileTypes: true },
)
  .filter((entry) => entry.isFile() && entry.name.endsWith('.webp'))
  .flatMap((entry) => {
    const name = entry.name.slice(0, -'.webp'.length);
    return [
      `userscript-deck/video/userscript-cards/${name}.mp4`,
      `userscript-deck/card-art/userscript-cards/${entry.name}`,
    ];
  })
  .sort();

const presetCardAssets = readdirSync(
  new URL('../assets/userscript-deck/card-art/preset-cards/', import.meta.url),
  { withFileTypes: true },
)
  .filter((entry) => entry.isFile() && entry.name.endsWith('.webp'))
  .flatMap((entry) => {
    const name = entry.name.slice(0, -'.webp'.length);
    const poster = `userscript-deck/card-art/preset-cards/${entry.name}`;
    if (name === '08-gamepad-control') return [poster];
    return [`userscript-deck/video/preset-cards/${name}.mp4`, poster];
  })
  .sort();

const preinstalledCardAssets = readdirSync(
  new URL(
    '../assets/userscript-deck/card-art/preinstalled-cards/',
    import.meta.url,
  ),
  { withFileTypes: true },
)
  .filter((entry) => entry.isFile() && entry.name.endsWith('.webp'))
  .flatMap((entry) => {
    const name = entry.name.slice(0, -'.webp'.length);
    const poster = `userscript-deck/card-art/preinstalled-cards/${entry.name}`;
    if (name === '04-copying-lifted') return [poster];
    return [`userscript-deck/video/preinstalled-cards/${name}.mp4`, poster];
  })
  .sort();

const defaultExtensionIcon =
  'userscript-deck/visual/action-icons/card-master-logo.png';

const contentBlockingVfxPattern =
  /^(?:combo-kill-glyph|(?:energy|sword)-slash-\d{2})\.webm$/;

function contentBlockingVfx(extension) {
  return readdirSync(
    new URL(
      '../assets/userscript-deck/visual/content-blocking-vfx/',
      import.meta.url,
    ),
    { withFileTypes: true },
  )
    .filter(
      (entry) => entry.isFile() && contentBlockingVfxPattern.test(entry.name),
    )
    .map(
      (entry) =>
        `userscript-deck/visual/content-blocking-vfx/${entry.name.replace(
          /\.webm$/,
          `.${extension}`,
        )}`,
    )
    .sort();
}

const mediaSpeedProjectileVfx = readdirSync(
  new URL(
    '../assets/userscript-deck/visual/media-speed-vfx/arrow-trail/',
    import.meta.url,
  ),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name))
  .flatMap((sequence) =>
    readdirSync(
      new URL(
        `../assets/userscript-deck/visual/media-speed-vfx/arrow-trail/${sequence.name}/`,
        import.meta.url,
      ),
      { withFileTypes: true },
    )
      .filter((entry) => entry.isFile() && /^\d{2}\.webp$/.test(entry.name))
      .map(
        (entry) =>
          `userscript-deck/visual/media-speed-vfx/arrow-trail/${sequence.name}/${entry.name}`,
      ),
  )
  .sort();

const mediaSpeedBorderVfx = readdirSync(
  new URL(
    '../assets/userscript-deck/visual/media-speed-vfx/video-border/',
    import.meta.url,
  ),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory() && /^\d{2}$/.test(entry.name))
  .flatMap((sequence) =>
    readdirSync(
      new URL(
        `../assets/userscript-deck/visual/media-speed-vfx/video-border/${sequence.name}/`,
        import.meta.url,
      ),
      { withFileTypes: true },
    )
      .filter((entry) => entry.isFile() && /^\d{2}\.webp$/.test(entry.name))
      .map(
        (entry) =>
          `userscript-deck/visual/media-speed-vfx/video-border/${sequence.name}/${entry.name}`,
      ),
  )
  .sort();

const assistantFlameSequences = ['01', '02', '03', '04', '06', '07', '10']
  .flatMap((sequence) =>
    Array.from(
      { length: 12 },
      (_, frame) =>
        `userscript-deck/visual/ui/flame-sequences/${sequence}/${String(
          frame + 1,
        ).padStart(2, '0')}.webp`,
    ),
  )
  .sort();

const interfaceFonts = [
  'fonts.css',
  'cinzel.css',
  'cinzel-latin-ext-wght-normal.woff2',
  'cinzel-latin-wght-normal.woff2',
  'OFL.txt',
].map((file) => `fonts/cinzel/${file}`);

const comboNumberFont = ['qiantu-digits.ttf', 'LICENSE.pdf'].map(
  (file) => `fonts/qiantu/${file}`,
);

export function extensionRuntimeAssetsFor(target) {
  return [
    'userscript-deck/visual/ui/card-frame/bottom-frame-square-gold.webp',
    'userscript-deck/visual/ui/interface/icons/sound-off.webp',
    'userscript-deck/visual/ui/interface/icons/sound-on.webp',
    'userscript-deck/visual/ui/interface/surfaces/plaque-bottom.webp',
    'userscript-deck/visual/ui/interface/surfaces/plaque-top.webp',
    'userscript-deck/visual/ui/interface/surfaces/badge-frame.webp',
    'userscript-deck/visual/ui/interface/surfaces/badge-texture.webp',
    'userscript-deck/visual/ui/interface/surfaces/card-tooltip-bottom.webp',
    'userscript-deck/visual/ui/interface/surfaces/card-tooltip-center.webp',
    'userscript-deck/visual/ui/interface/surfaces/card-tooltip-title.webp',
    'userscript-deck/visual/ui/interface/surfaces/icon-frame.webp',
    'userscript-deck/visual/ui/interface/surfaces/close-control.webp',
    'userscript-deck/visual/ui/interface/surfaces/dialog-compact-frame.webp',
    'userscript-deck/visual/ui/interface/surfaces/dialog-frame.webp',
    'userscript-deck/visual/ui/interface/surfaces/workspace-hinge.webp',
    'userscript-deck/visual/ui/interface/surfaces/button-frame.webp',
    'userscript-deck/visual/ui/interface/surfaces/library-texture.webp',
    'userscript-deck/visual/ui/interface/surfaces/panel-frame.webp',
    'userscript-deck/visual/ui/interface/surfaces/panel-texture.webp',
    ...interfaceFonts,
    ...comboNumberFont,
    'userscript-deck/visual/cards/action-frame.webp',
    'userscript-deck/visual/cards/action-frame-square.webp',
    'userscript-deck/visual/cards/card-master-back.webp',
    'userscript-deck/visual/cards/card-lock-chain.webp',
    'userscript-deck/visual/cards/bottom-frame.webp',
    'userscript-deck/visual/cards/edge.webp',
    'userscript-deck/visual/cards/dragon-egg-edge.webp',
    'userscript-deck/visual/cards/wrap-frame.webp',
    'userscript-deck/visual/cards/sparkles.gif',
    'userscript-deck/visual/gamepad/dual-shock-4.svg',
    'userscript-deck/visual/gamepad/joy-con.svg',
    'userscript-deck/visual/gamepad/lin-ge-has-strength.webp',
    'userscript-deck/visual/integrations/media-resources-sheep.png',
    'userscript-deck/visual/integrations/media-resources-sheep-hover.png',
    'userscript-deck/visual/cursors/default.png',
    'userscript-deck/visual/cursors/pointer.png',
    ...userscriptCardAssets,
    ...presetCardAssets,
    ...preinstalledCardAssets,
    'userscript-deck/card-art/system-cards/new-tab.webp',
    defaultExtensionIcon,
    ...contentBlockingVfx(target === 'safari' ? 'mov' : 'webm'),
    ...mediaSpeedProjectileVfx,
    ...mediaSpeedBorderVfx,
    ...assistantFlameSequences,
    ...cardAudio,
    ...effectsAudio,
  ];
}

export const extensionRuntimeAssets = extensionRuntimeAssetsFor(
  process.env.EXTENSION_TARGET === 'safari' ? 'safari' : 'chromium',
);
