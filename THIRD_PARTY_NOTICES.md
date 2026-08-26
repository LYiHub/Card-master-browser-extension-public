# Third-Party Notices

Card Master is distributed under GPL-3.0-only. This repository includes,
adapts, reimplements, preinstalls, or references behavior from the projects
listed below. An integration label describes that relationship; a behavioral
reference does not mean that source code from the referenced project is
embedded.

Retained license and attribution files are stored with corresponding sources
under `vendor/` and `assets/`. Exact integration paths and update channels are
recorded in `upstreams.json`.

## Content Filtering and Page Capabilities

### AdGuard

- `@adguard/tswebextension` 5.0.0, direct dependency, GPL-3.0-only
- `@adguard/dnr-rulesets` 5.0.1, direct dependency, GPL-3.0-only
- `@adguard/extended-css` 2.2.0, direct dependency, GPL-3.0
- Bundled AdGuard components include `@adguard/scriptlets` (GPL-3.0),
  `@adguard/tsurlfilter` (GPL-3.0-only), `@adguard/re2-wasm` (Apache-2.0),
  and `webextension-polyfill` (MPL-2.0).

Source:

- https://github.com/AdguardTeam/tsurlfilter
- https://github.com/AdguardTeam/DnrRulesets

### Dark Reader

- Dark Reader 4.9.129, vendored source adapted for page themes, MIT
- Source revision `a94819bde521f13f0ed5fb15024fc8f9425c23b1`
- Source: https://github.com/darkreader/darkreader
- Retained license: `vendor/darkreader/LICENSE`

### Media Speed References

- Video Speed Controller, behavioral reference, MIT
  - Source revision `6861be8c90d2b2181a6ae57249ce1e747773888d`
  - Source: https://github.com/igrigorik/videospeed
- Speeder, behavioral reference, GPL-3.0
  - Source revision `de6598dfdef5d7c6064769ceb4b40760fbefdee9`
  - Source: https://github.com/SoPat712/Speeder
- Hayame, behavioral reference, MIT
  - Source revision `e6c83c50ec79f1c9adbd2fe0f2f39a927254b80a`
  - Source: https://github.com/atani/hayame

### Media Resource Discovery

- Cat Catch 2.7.2, embedded runtime presented as “顺手牵羊”, GPL-3.0
- Source revision `ef630f8ff88ca9a3ebbfaa1ea01e1512b9e6778a`
- Source: https://github.com/xifangczy/cat-catch
- Retained source and license: `vendor/cat-catch/`
- The original popup, options, downloader, parsers, media controls, capture
  scripts, resource detection and external integrations are packaged directly.
- A thin adapter isolates Cat Catch storage and toolbar state so the embedded
  runtime cannot replace Card Master's toolbar icon, Side Panel or storage.
- Modified by Card Master on 2026-08-21: Cat Catch's cat-logo image assets were
  replaced with Card Master's sheep artwork; media detection and download
  behavior remain provided by the attributed Cat Catch runtime.

## Userscript Platform References

- Violentmonkey 2.41.0, behavioral reference, MIT
  - Source: https://github.com/violentmonkey/violentmonkey
- Tampermonkey historical source, behavioral reference only
  - Source revision `cdfc253c07267104de29d8cebb88fcd621ae5167`
  - License of the referenced historical source: GPL-3.0
  - No claim is made that current Tampermonkey releases use that license.
  - Source: https://github.com/Tampermonkey/tampermonkey
- ScriptCat, behavioral reference, GPL-3.0
  - Source revision `62759840`
  - Source: https://github.com/scriptscat/scriptcat

## Bilibili and YouTube Components

### TabulaBili

- TabulaBili-Plus, capability reimplementation, MIT
- Source revision `e580595627e60210ba1dc39c743c16e54383de35`
- Source: https://github.com/tjsky/TabulaBili
- Retained license: `vendor/bilibili/tabulabili/LICENSE`

### pakku.js

- pakku.js, embedded runtime, GPL-3.0
- Source revision `2cb6f52aba70d6b685aaff9a1c03aabec7f299b2`
- Source: https://github.com/xmcp/pakku.js
- Retained license: `vendor/bilibili/pakku/LICENSE.txt`

### SponsorBlock Integrations

- BilibiliSponsorBlock, embedded runtime, GPL-3.0
  - Source revision `07ddf7c46ba805eec9eefd8213ebb4fb682c1786`
  - Source: https://github.com/hanydd/BilibiliSponsorBlock
  - Retained license: `vendor/bilibili/sponsor/LICENSE`
- SponsorBlock 6.1.7, embedded runtime, GPL-3.0
  - Vendored release revision `0a51a4981045b66007f88ab5e8909777c725ba43`
  - Comparison source revision `6a306a09622170d0f7f733faa3172a58346650bd`
  - Source: https://github.com/ajayyy/SponsorBlock
  - Retained license: `vendor/youtube/sponsor/LICENSE`
- Both vendored SponsorBlock integrations consolidate identical generated
  bundle-license files by retaining one complete copy and leaving
  bundle-specific pointer files beside each bundle.

### Preinstalled Userscripts

- BiliKit Core and BiliKit Feed, preinstalled Userscripts, MIT
  - Core version `0.5.33`
  - Source revision `45f38e325fe9aaadeb9f6a7aadab1f54d5c8876c`
  - Source: https://github.com/shiinayane/BiliKit
  - Retained license: `vendor/bilibili/userscripts/LICENSE-BiliKit`
- Bilibili Favorites Fix 1.4.5, preinstalled Userscript, GPL-3.0
  - Source: https://github.com/crnkv/bilibili-favorites-fix-cerenkov-mod
  - Retained license:
    `vendor/bilibili/userscripts/LICENSE-bilibili-favorites-fix`
- Copying Lifted, performance-safe adapted preinstalled Userscript, Apache-2.0
  - Upstream version `0.3`; Card Master adaptation `1.0`
  - Integration revision `0.3-card-master-1`
  - Source: https://github.com/canguser/hooker-js
  - Retained license: `vendor/userscripts/LICENSE-copying-lifted`

## Controller, Navigation, and Input

### Remapad

- Remapad, behavioral reference for browser gamepad control, GPL-3.0-only
- Source revision `fe8da0fd9abc9041012f96fd0e74d461f365d008`
- Source: https://github.com/Shin-Aska/remapad

### Gaming Controller Tester

- Gaming Controller Tester, adapted gamepad inspection visual, MIT
- Source revision `686b3b67705c01813e95b53394cba0947bcd4f9b`
- Copyright (c) 2024 Pandelis Manikas
- Source: https://github.com/pmanikas/gaming-controller-tester
- Retained license: `vendor/gamepad-controller-tester/LICENSE`

### Spatial Nav CSS

- Spatial Nav CSS, direct vendored dependency, MIT
- Source revision `e15d2f3f943a43e1a27db27816160dad6837fb85`
- Source: https://github.com/SauceTaster/spatial-nav-css
- Retained license: `vendor/spatial-nav-css/LICENSE`

### Pinyin IME

- Pinyin IME 1.0.2, vendored input data and behavior, MIT
- The packaged extension includes its Google-style Pinyin dictionary.
- Source: https://github.com/catcherinsky/pinyin-ime
- Retained license: `vendor/pinyin-ime/LICENSE`

### Lumno

- Lumno 0.9.31, controlled new-tab adaptation and fixed wallpaper assets,
  GPL-3.0
- Source revision `3f02ab958ffd6eb61f0d217448d2712577bfa3ef`
- Source: https://github.com/kubai087/lumno-extension
- Retained license: `vendor/lumno/LICENSE`
- Only the audited new-tab behavior and 12 fixed-hash wallpaper files are
  retained. Lumno branding, locales, fonts, global commands, content scripts,
  AI, clipping, picture-in-picture, feedback, updates and secondary background
  runtime are excluded.

## Runtime Libraries

The application directly depends on the following packages:

- `@adguard/extended-css` 2.2.0, GPL-3.0
- `@adguard/tswebextension` 5.0.0, GPL-3.0-only
- `acorn` 8.17.0, MIT, https://github.com/acornjs/acorn
- `gsap` 3.15.0, GreenSock Standard no-charge license,
  https://github.com/greensock/GSAP
- `lucide-react` 0.468.0, ISC, https://github.com/lucide-icons/lucide
- `react` and `react-dom` 18.3.1, MIT, https://github.com/facebook/react
- `react-markdown` 10.1.0, MIT,
  https://github.com/remarkjs/react-markdown
- `rehype-raw` and `rehype-sanitize`, MIT, https://github.com/rehypejs
- `remark-breaks` and `remark-gfm`, MIT, https://github.com/remarkjs
- `spatial-nav-css`, MIT, https://github.com/SauceTaster/spatial-nav-css
- `tldts` 7.4.9, MIT, https://github.com/remusao/tldts

Exact resolved versions, including transitive dependencies, are recorded in
`pnpm-lock.yaml`.

## Build and Development Tooling

Build-time and repository tooling includes:

- `@adguard/dnr-rulesets` 5.0.1, GPL-3.0-only
- `@biomejs/biome`, MIT OR Apache-2.0
- `@types/chrome`, `@types/node`, `@types/react`, and `@types/react-dom`, MIT
- `@vitejs/plugin-react`, MIT
- `esbuild`, MIT
- `sharp`, Apache-2.0
- `typescript`, Apache-2.0
- `vite`, MIT
- `vitest`, MIT

These tools are not all shipped as extension runtime code. Their exact
resolved versions are recorded in `pnpm-lock.yaml`.

## Fonts

- Cinzel, SIL Open Font License 1.1
- Copyright 2020 The Cinzel Project Authors
- Source: https://github.com/NDISCOVER/Cinzel
- Retained license: `assets/fonts/cinzel/OFL.txt`

## Media and Trademarks

Card Master-specific card art, motion previews, sound effects, interface
surfaces, and VFX are stored under `assets/userscript-deck/`. The Card Master
team has confirmed the rights required to publish and redistribute all media
included in this repository and its release artifacts. First-party media is
licensed under GPL-3.0-only with the rest of Card Master unless a file is
covered by a more specific adjacent license.

The card-based information hierarchy, deck layout, and motion language were
informed by broad collectible-card-game interface research, including GWENT.
GWENT and its related names, trademarks, and official assets belong to
CD PROJEKT RED. Card Master is not affiliated with, authorized by, or endorsed
by CD PROJEKT RED. This acknowledgment of design research does not grant a
license to redistribute official game assets.

Bilibili, YouTube, SponsorBlock, AdGuard, Dark Reader, Tampermonkey,
Violentmonkey, ScriptCat, and all other third-party names and trademarks belong
to their respective owners. Attribution describes technical provenance only
and does not imply endorsement.
