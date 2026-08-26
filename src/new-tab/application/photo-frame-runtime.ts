export const NEW_TAB_PHOTO_FRAME_IDLE_MS = 5_000;
export const NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS = 60_000;
export const NEW_TAB_PHOTO_FRAME_ATTRIBUTE = 'data-card-master-photo-frame';
export const NEW_TAB_PHOTO_FRAME_OUTER_STYLE_ID =
  'card-master-new-tab-photo-frame';
export const NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE_ID =
  'card-master-new-tab-photo-frame-embedded';
export const NEW_TAB_PHOTO_FRAME_STAGE_CLASS = 'cm-new-tab-photo-frame-stage';
export const NEW_TAB_DAILY_REVIEW_SURFACE_CLASS =
  'cm-new-tab-daily-review-surface';
export const NEW_TAB_PHOTO_FRAME_CONTROLS_HIDE_MS = 1_400;
export const NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS = {
  banner: 0,
  topIcons: 90,
  wordmark: 190,
  search: 310,
  shortcuts: 450,
  bookmarks: 590,
  recentSites: 770,
  bottomControls: 980,
  deck: 1_080,
} as const;

export function photoFrameFullscreenButtonPresentation(active: boolean) {
  return active
    ? {
        icon: 'ri-fullscreen-exit-line',
        label: '退出电子相框',
      }
    : {
        icon: 'ri-fullscreen-line',
        label: '进入电子相框',
      };
}

export const NEW_TAB_PHOTO_FRAME_OUTER_STYLE = `
  #card-master-host {
    transition-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.deck}ms;
    transition-duration: 300ms;
    transition-property: opacity;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }

  html[${NEW_TAB_PHOTO_FRAME_ATTRIBUTE}="true"] #card-master-host {
    opacity: 0 !important;
    pointer-events: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    #card-master-host {
      transition-delay: 0ms !important;
      transition-duration: 120ms !important;
    }
  }
`;

export const NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE = `
  :root {
    --card-master-new-tab-surface: rgb(248 250 252 / 75%);
    --card-master-new-tab-surface-hover: rgb(248 250 252 / 95%);
    --card-master-new-tab-surface-inner: rgb(255 255 255 / 34%);
    --card-master-new-tab-surface-inner-hover: rgb(255 255 255 / 50%);
    --card-master-new-tab-surface-border: rgb(15 23 42 / 12%);
    --card-master-new-tab-surface-border-hover: rgb(15 23 42 / 20%);
    --card-master-new-tab-surface-inner-border: rgb(15 23 42 / 10%);
    --card-master-new-tab-surface-inner-border-hover: rgb(15 23 42 / 18%);
    --card-master-new-tab-surface-ink: rgb(15 23 42 / 88%);
    --card-master-new-tab-surface-shadow: 0 12px 30px rgb(15 23 42 / 12%);
    --card-master-new-tab-surface-shadow-hover:
      0 16px 36px rgb(15 23 42 / 18%);
    --card-master-new-tab-surface-inner-shadow:
      0 8px 20px rgb(15 23 42 / 8%);
    --card-master-new-tab-surface-inner-shadow-hover:
      0 10px 24px rgb(15 23 42 / 12%);
    --card-master-new-tab-surface-duration: 360ms;
    --card-master-new-tab-surface-easing: cubic-bezier(0.22, 1, 0.36, 1);
  }

  body[data-theme="dark"] {
    --card-master-new-tab-surface: rgb(12 18 28 / 75%);
    --card-master-new-tab-surface-hover: rgb(12 18 28 / 95%);
    --card-master-new-tab-surface-inner: rgb(255 255 255 / 8%);
    --card-master-new-tab-surface-inner-hover: rgb(255 255 255 / 14%);
    --card-master-new-tab-surface-border: rgb(248 250 252 / 16%);
    --card-master-new-tab-surface-border-hover: rgb(248 250 252 / 28%);
    --card-master-new-tab-surface-inner-border: rgb(248 250 252 / 12%);
    --card-master-new-tab-surface-inner-border-hover: rgb(248 250 252 / 22%);
    --card-master-new-tab-surface-ink: rgb(248 250 252 / 94%);
    --card-master-new-tab-surface-shadow: 0 12px 30px rgb(0 0 0 / 22%);
    --card-master-new-tab-surface-shadow-hover:
      0 16px 36px rgb(0 0 0 / 30%);
    --card-master-new-tab-surface-inner-shadow:
      0 8px 20px rgb(0 0 0 / 16%);
    --card-master-new-tab-surface-inner-shadow-hover:
      0 10px 24px rgb(0 0 0 / 22%);
  }

  body[data-wallpaper-active="true"] {
    --x-nt-bookmark-heading-color: var(--card-master-new-tab-surface-ink);
    --x-nt-bookmark-title: var(--card-master-new-tab-surface-ink);
    --x-nt-recent-heading-color: var(--card-master-new-tab-surface-ink);
    --x-nt-recent-title: var(--card-master-new-tab-surface-ink);
    --x-nt-recent-url: color-mix(
      in srgb,
      var(--card-master-new-tab-surface-ink) 72%,
      transparent
    );
  }

  body[data-wallpaper-active="true"]
    :is(.x-nt-bookmarks-title-wrap, .x-nt-recent-header-bar) {
    filter: none !important;
    text-shadow: none !important;
  }

  body[data-wallpaper-active="true"]
    :is(.x-nt-bookmarks-heading, .x-nt-recent-heading) {
    color: var(--card-master-new-tab-surface-ink) !important;
    filter: none !important;
    font-weight: 600;
    opacity: 1;
    text-shadow: none !important;
    transition:
      color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) !important;
  }

  .cm-new-tab-wallpaper-source {
    display: grid;
    gap: 9px;
    padding: 0 2px;
  }

  .cm-new-tab-wallpaper-source__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .cm-new-tab-wallpaper-source__label {
    color: var(--x-nt-text, #111827);
    font-family:
      system-ui, "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI",
      "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.25;
  }

  .cm-new-tab-wallpaper-source__status {
    overflow: hidden;
    color: var(--x-nt-subtext, #6b7280);
    font-family:
      system-ui, "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI",
      "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    line-height: 1.25;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cm-new-tab-wallpaper-source__tabs {
    width: 100%;
  }

  .cm-new-tab-wallpaper-source__indicator {
    width: calc(
      (100% - 4px - var(--x-nt-panel-tab-gap, 4px)) / 2
    );
  }

  .cm-new-tab-wallpaper-source__tabs[data-source="daily-review"]
    .cm-new-tab-wallpaper-source__indicator {
    transform: translateX(
      calc(100% + var(--x-nt-panel-tab-gap, 4px))
    );
  }

  .cm-new-tab-wallpaper-source__button:disabled {
    cursor: wait;
    opacity: 0.56;
  }

  .cm-new-tab-wallpaper-source-panel {
    display: grid;
    max-height: 1200px;
    overflow: hidden;
    opacity: 1;
    translate: 0 0;
    transition:
      max-height 360ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
      translate 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .cm-new-tab-wallpaper-source-panel[data-visible="false"] {
    max-height: 0;
    opacity: 0;
    pointer-events: none;
    translate: 0 -6px;
  }

  .cm-new-tab-wallpaper-source-panel__inner {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--x-nt-panel-content-gap, 22px);
  }

  .cm-new-tab-wallpaper-source-panel--daily-review
    .cm-new-tab-wallpaper-source-panel__inner {
    gap: 6px;
    padding: 12px;
    border: 1px solid var(--x-nt-panel-border, rgb(0 0 0 / 8%));
    border-radius: 10px;
    background: rgb(17 24 39 / 4%);
  }

  .cm-new-tab-wallpaper-source-panel--daily-review strong,
  .cm-new-tab-wallpaper-source-panel__description {
    font-family:
      system-ui, "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI",
      "Helvetica Neue", Arial, sans-serif;
  }

  .cm-new-tab-wallpaper-source-panel--daily-review strong {
    color: var(--x-nt-text, #111827);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
  }

  .cm-new-tab-wallpaper-source-panel__description {
    color: var(--x-nt-subtext, #6b7280);
    font-size: 11px;
    line-height: 1.45;
  }

  .cm-new-tab-wallpaper-source-panel--daily-review
    .cm-new-tab-wallpaper-source-panel__settings-link {
    margin-bottom: 0;
  }

  .cm-new-tab-wallpaper-source-panel__preview {
    width: 100%;
    max-height: 180px;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 8px;
    object-fit: cover;
    opacity: 1;
    translate: 0 0;
    transition:
      max-height 320ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
      translate 280ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .cm-new-tab-wallpaper-source-panel__preview[data-visible="false"] {
    max-height: 0;
    opacity: 0;
    translate: 0 -5px;
  }

  .x-nt-wallpaper-section[data-card-master-wallpaper-source]
    .x-nt-wallpaper-body {
    gap: 0 !important;
  }

  .x-nt-wallpaper-section[data-card-master-wallpaper-source]
    .x-nt-effect-control {
    margin-top: var(--x-nt-panel-content-gap, 22px);
  }

  .x-nt-wallpaper-section[data-card-master-wallpaper-source="daily-review"]
    .x-nt-wallpaper-body[data-visible="false"] {
    display: flex;
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .x-nt-wallpaper-section[data-card-master-wallpaper-source="daily-review"]
    .x-nt-wallpaper-panel-header
    .x-nt-wallpaper-switch {
    width: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    scale: 0.86;
    transition:
      width 260ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
      scale 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .x-nt-wallpaper-section[data-card-master-wallpaper-source="default"]
    .x-nt-wallpaper-panel-header
    .x-nt-wallpaper-switch {
    transition:
      width 260ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
      scale 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .cm-new-tab-wallpaper-source__button,
    .cm-new-tab-wallpaper-source-panel,
    .cm-new-tab-wallpaper-source-panel__preview,
    .x-nt-wallpaper-section[data-card-master-wallpaper-source]
      .x-nt-wallpaper-switch {
      transition-duration: 120ms !important;
    }
  }

  body[data-wallpaper-active="true"]
    #_x_extension_newtab_bookmarks_2024_unique_
    :is(
      .x-nt-bookmarks-title-wrap
        .x-nt-section-mode-select
        ._x_extension_select_trigger_2024_unique_,
      .x-nt-bookmarks-pager .x-nt-bookmarks-pager-btn
    ) {
    color: var(--x-nt-bookmark-heading-color, #000000) !important;
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    filter: none !important;
    text-shadow: none !important;
    transition:
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) !important;
  }

  body[data-wallpaper-active="true"]
    #_x_extension_newtab_bookmarks_2024_unique_
    :is(
      .x-nt-bookmarks-title-wrap
        .x-nt-section-mode-select:hover
        ._x_extension_select_trigger_2024_unique_,
      .x-nt-bookmarks-title-wrap
        .x-nt-section-mode-select[data-open="true"]
        ._x_extension_select_trigger_2024_unique_,
      .x-nt-bookmarks-pager
        .x-nt-bookmarks-pager-btn:hover:not([aria-disabled="true"])
    ) {
    background: var(
      --x-nt-bookmark-pager-hover-bg,
      rgba(17, 24, 39, 0.08)
    ) !important;
  }

  body[data-wallpaper-active="true"]
    .x-nt-bookmarks-topbar
    .x-nt-bookmarks-topbar-actions
    :is(
      .x-nt-section-mode-select
        ._x_extension_select_trigger_2024_unique_,
      .x-nt-bookmarks-pager-btn
    ) {
    color: var(--x-nt-bookmarks-topbar-ink, #111827) !important;
    background: var(
      --x-nt-bookmarks-topbar-action-bg,
      transparent
    ) !important;
    border-color: transparent !important;
    box-shadow: none !important;
    filter: none !important;
    text-shadow: none !important;
    transition:
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) !important;
  }

  body[data-wallpaper-active="true"]
    .x-nt-bookmarks-topbar
    .x-nt-bookmarks-topbar-actions
    :is(
      .x-nt-section-mode-select:hover
        ._x_extension_select_trigger_2024_unique_,
      .x-nt-section-mode-select[data-open="true"]
        ._x_extension_select_trigger_2024_unique_,
      .x-nt-bookmarks-pager-btn:hover:not([aria-disabled="true"])
    ) {
    background: var(
      --x-nt-bookmarks-topbar-action-hover,
      rgba(15, 23, 42, 0.065)
    ) !important;
  }

  body[data-wallpaper-active="true"]
    :where(
      #_x_extension_newtab_root_2024_unique_,
      .x-nt-shortcut-icon,
      .x-nt-bookmark-card,
      .x-nt-recent-card-visual,
      .x-nt-bookmarks-topbar
    ) {
    border-color: var(--card-master-new-tab-surface-border) !important;
    background: var(--card-master-new-tab-surface) !important;
    box-shadow: var(--card-master-new-tab-surface-shadow) !important;
    color: var(--card-master-new-tab-surface-ink);
    backdrop-filter: none !important;
    transition:
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      box-shadow var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      transform var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      scale var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing);
    -webkit-backdrop-filter: none !important;
  }

  body[data-wallpaper-active="true"]
    #_x_extension_newtab_search_layer_2024_unique_ {
    backdrop-filter: none !important;
    transition:
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-radius var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      box-shadow var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) !important;
    -webkit-backdrop-filter: none !important;
  }

  body[data-wallpaper-active="true"]:not([data-nt-suggestions-open="true"])
    #_x_extension_newtab_root_2024_unique_:is(:hover, :focus-within),
  body[data-wallpaper-active="true"]
    .x-nt-shortcut-tile:is(:hover, :focus-visible)
    .x-nt-shortcut-icon,
  body[data-wallpaper-active="true"]
    .x-nt-bookmark-card:is(
      :hover,
      :focus-visible,
      .x-nt-bookmark-card--hover,
      [data-bookmark-context-menu-open="true"]
    ),
  body[data-wallpaper-active="true"]
    .x-nt-recent-card:is(:hover, :focus-visible)
    .x-nt-recent-card-visual,
  body[data-wallpaper-active="true"] .x-nt-bookmarks-topbar:hover {
    border-color: var(--card-master-new-tab-surface-border-hover) !important;
    background: var(--card-master-new-tab-surface-hover) !important;
    box-shadow: var(--card-master-new-tab-surface-shadow-hover) !important;
  }

  body[data-wallpaper-active="true"]
    .x-nt-bookmark-card:is(
      :hover,
      :focus-visible,
      .x-nt-bookmark-card--hover
    ):not([data-bookmark-dragging="true"]):not(
      [data-bookmark-dropping="true"]
    ):not(.x-nt-bookmark-card-drag-preview) {
    scale: 1.02;
  }

  body[data-wallpaper-active="true"]
    #_x_extension_newtab_bookmarks_grid_2024_unique_[data-bookmark-dragging="true"]
    .x-nt-bookmark-card,
  body[data-wallpaper-active="true"]
    .x-nt-bookmark-card:is(
      [data-bookmark-dragging="true"],
      [data-bookmark-dropping="true"],
      .x-nt-bookmark-card-drag-preview
    ) {
    scale: 1 !important;
  }

  body[data-wallpaper-active="true"] .x-nt-bookmark-card::before {
    display: none;
  }

  body[data-wallpaper-active="true"] .x-nt-recent-inner {
    border-color: var(
      --card-master-new-tab-surface-inner-border
    ) !important;
    background: var(--card-master-new-tab-surface-inner) !important;
    box-shadow: var(--card-master-new-tab-surface-inner-shadow) !important;
    backdrop-filter: none !important;
    transition:
      height 220ms ease,
      transform 220ms ease,
      margin-bottom 220ms ease,
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      box-shadow var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing);
    -webkit-backdrop-filter: none !important;
  }

  body[data-wallpaper-active="true"]
    .x-nt-recent-card:is(:hover, :focus-visible)
    .x-nt-recent-inner {
    border-color: var(
      --card-master-new-tab-surface-inner-border-hover
    ) !important;
    background: var(--card-master-new-tab-surface-inner-hover) !important;
    box-shadow: var(
      --card-master-new-tab-surface-inner-shadow-hover
    ) !important;
  }

  #_x_extension_newtab_wordmark_2026_unique_ > .x-nt-wordmark-content,
  .x-nt-wallpaper-panel {
    filter: none !important;
  }

  img[data-favicon-load-state="priming"],
  img[data-favicon-load-state="loaded"] {
    filter: none !important;
    transition: opacity var(--card-master-new-tab-surface-duration)
      var(--card-master-new-tab-surface-easing) !important;
  }

  img[data-favicon-load-state="priming"] {
    opacity: 0;
  }

  img[data-favicon-load-state="loaded"] {
    opacity: 1;
  }

  body[data-nt-top-occupied="true"] {
    --x-nt-top-occupied-inset: calc(
      30px + var(--x-nt-top-safe-inset)
    ) !important;
  }

  .x-nt-bookmarks-topbar {
    height: 30px !important;
    padding: 3px !important;
  }

  .x-nt-bookmarks-topbar-viewport,
  .x-nt-bookmarks-topbar-items,
  .x-nt-bookmarks-topbar
    #_x_extension_newtab_bookmarks_grid_2024_unique_ {
    height: 24px !important;
  }

  .x-nt-bookmarks-topbar-edge-fade,
  .x-nt-bookmarks-topbar-actions {
    height: 30px !important;
  }

  .x-nt-bookmarks-topbar-actions {
    margin-right: -3px !important;
    padding: 3px !important;
    gap: 3px !important;
  }

  .x-nt-bookmarks-topbar .x-nt-bookmark-card {
    height: 24px !important;
    padding: 3px 7px !important;
    gap: 6px !important;
    border-radius: 6px !important;
  }

  .x-nt-bookmarks-topbar .x-nt-bookmark-icon {
    width: 15px !important;
    height: 15px !important;
  }

  .x-nt-bookmarks-topbar .x-nt-bookmark-icon--figma {
    width: 17px !important;
    height: 17px !important;
  }

  .x-nt-bookmarks-topbar .x-nt-bookmark-title {
    font-size: 11px !important;
    line-height: 16px !important;
  }

  .x-nt-bookmarks-topbar .x-nt-section-mode-select,
  .x-nt-bookmarks-topbar
    .x-nt-section-mode-select
    ._x_extension_select_trigger_2024_unique_,
  .x-nt-bookmarks-topbar .x-nt-bookmarks-pager-btn {
    width: 24px !important;
    min-width: 24px !important;
    height: 24px !important;
    flex-basis: 24px !important;
    border-radius: 6px !important;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS} {
    position: fixed;
    z-index: 2147483000;
    inset: 0;
    display: grid;
    overflow: hidden;
    background: transparent;
    pointer-events: none;
    visibility: hidden;
    transition: visibility 0s linear 900ms;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}[data-active="true"] {
    pointer-events: auto;
    visibility: visible;
    transition: visibility 0s linear 0s;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation {
    position: fixed;
    z-index: 2147483002;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    translate: 0 8px;
    visibility: hidden;
    transition:
      opacity 360ms cubic-bezier(0.22, 1, 0.36, 1),
      translate 420ms cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s linear 360ms;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation[data-visible="true"] {
    opacity: 1;
    translate: 0 0;
    visibility: visible;
    transition:
      opacity 360ms cubic-bezier(0.22, 1, 0.36, 1),
      translate 420ms cubic-bezier(0.22, 1, 0.36, 1),
      visibility 0s linear 0s;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button {
    position: absolute;
    display: inline-grid;
    place-items: center;
    width: 46px;
    height: 46px;
    padding: 0;
    border: 1px solid var(--card-master-new-tab-surface-border);
    border-radius: 50%;
    background: var(--card-master-new-tab-surface);
    box-shadow: var(--card-master-new-tab-surface-shadow);
    color: var(--card-master-new-tab-surface-ink);
    cursor: pointer;
    opacity: 1;
    pointer-events: auto;
    scale: 1;
    transition:
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      box-shadow var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      scale var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button:hover,
  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button:focus-visible {
    border-color: var(--card-master-new-tab-surface-border-hover);
    background: var(--card-master-new-tab-surface-hover);
    box-shadow: var(--card-master-new-tab-surface-shadow-hover);
    opacity: 1;
    scale: 1.045;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button:active {
    scale: 0.97;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button:disabled {
    cursor: default;
    opacity: 0.28;
    scale: 1;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--previous,
  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--next {
    top: 50%;
    translate: 0 -50%;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--previous {
    left: max(18px, env(safe-area-inset-left));
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--next {
    right: max(18px, env(safe-area-inset-right));
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--latest {
    bottom: max(22px, env(safe-area-inset-bottom));
    left: 50%;
    grid-auto-flow: column;
    width: auto;
    min-width: 46px;
    gap: 7px;
    padding: 0 15px;
    border-radius: 23px;
    translate: -50% 0;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--latest span {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} button:focus-visible,
  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary:focus-visible {
    outline: 2px solid var(--x-nt-text, #111827);
    outline-offset: -3px;
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__hint {
    position: absolute;
    bottom: max(80px, calc(env(safe-area-inset-bottom) + 62px));
    left: 50%;
    padding: 7px 11px;
    border: 1px solid rgb(255 255 255 / 16%);
    border-radius: 999px;
    background: rgb(11 15 23 / 66%);
    color: rgb(248 250 252 / 88%);
    font-size: 11px;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 8px);
  }

  .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}[data-active="true"][data-mode="automatic"]
    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__hint {
    animation: cm-new-tab-photo-frame-hint 2800ms ease both;
  }

  @keyframes cm-new-tab-photo-frame-hint {
    0% {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    14%,
    72% {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, 0);
    }
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} {
    position: fixed;
    z-index: 2147483001;
    top: 0;
    right: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    align-items: stretch;
    width: 100%;
    min-height: calc(34px + env(safe-area-inset-top));
    padding-top: env(safe-area-inset-top);
    border-bottom: 1px solid var(--card-master-new-tab-surface-border);
    background: var(--card-master-new-tab-surface);
    box-shadow: var(--card-master-new-tab-surface-shadow);
    color: var(--card-master-new-tab-surface-ink);
    opacity: 0;
    pointer-events: none;
    translate: 0 0;
    backdrop-filter: none;
    transition:
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      width var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      translate 420ms cubic-bezier(0.22, 1, 0.36, 1),
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      box-shadow var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing);
    -webkit-backdrop-filter: none;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}[data-visible="true"] {
    opacity: 1;
    pointer-events: auto;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}[data-prompt-visible="false"] {
    grid-template-columns: 34px;
    width: 34px;
    border-left: 1px solid var(--card-master-new-tab-surface-border);
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}[data-prompt-visible="false"]
    > button {
    border-left: 0;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}[data-visible="true"]:is(
    :hover,
    :focus-within
  ) {
    border-bottom-color: var(--card-master-new-tab-surface-border-hover);
    background: var(--card-master-new-tab-surface-hover);
    box-shadow: var(--card-master-new-tab-surface-shadow-hover);
  }

  html[${NEW_TAB_PHOTO_FRAME_ATTRIBUTE}="true"]
    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}[data-visible="true"] {
    border-bottom-color: color-mix(
      in srgb,
      var(--x-nt-panel-border, rgb(0 0 0 / 8%)) 56%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--x-nt-panel-bg, rgb(255 255 255 / 90%)) 58%,
      transparent
    );
    box-shadow: none;
    opacity: 0;
    pointer-events: none;
    translate: 0 -8px;
  }

  html[${NEW_TAB_PHOTO_FRAME_ATTRIBUTE}="true"]
    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}[data-visible="true"][data-emphasis="true"] {
    border-bottom-color: var(--card-master-new-tab-surface-border-hover);
    background: var(--card-master-new-tab-surface-hover);
    box-shadow: var(--card-master-new-tab-surface-shadow-hover);
    opacity: 1;
    pointer-events: auto;
    translate: 0 0;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} details {
    min-width: 0;
    color: inherit;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px;
    align-items: center;
    min-width: 0;
    height: 34px;
    gap: 10px;
    padding: 0 12px;
    cursor: pointer;
    list-style: none;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary::-webkit-details-marker {
    display: none;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary strong {
    overflow: hidden;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    text-overflow: ellipsis;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary span {
    position: absolute;
    left: 50vw;
    width: min(52vw, 680px);
    overflow: hidden;
    color: color-mix(in srgb, var(--x-nt-text, #111827) 68%, transparent);
    font-size: 11px;
    line-height: 1.45;
    pointer-events: none;
    text-align: center;
    text-overflow: ellipsis;
    translate: -50% 0;
    white-space: nowrap;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary .ri-icon {
    grid-column: 2;
    justify-self: end;
    transition: transform var(--card-master-new-tab-surface-duration)
      var(--card-master-new-tab-surface-easing);
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} details[open] summary .ri-icon {
    transform: rotate(180deg);
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__details {
    position: absolute;
    top: 100%;
    right: 0;
    left: 0;
    display: grid;
    max-height: min(360px, 46vh);
    gap: 9px;
    padding: 14px max(16px, calc((100vw - 920px) / 2));
    border-bottom: 1px solid var(--x-nt-panel-border, rgb(0 0 0 / 8%));
    overflow: auto;
    background: var(--x-nt-panel-bg, rgb(255 255 255 / 96%));
    box-shadow: var(
      --x-nt-panel-shadow-focus,
      0 18px 44px rgb(0 0 0 / 10%)
    );
    color: var(--x-nt-text, #111827);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 28px;
    gap: 12px;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt {
    display: grid;
    gap: 7px;
    color: color-mix(in srgb, var(--x-nt-text, #111827) 86%, transparent);
    font-size: 11px;
    line-height: 1.65;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-line {
    display: block;
    white-space: pre-wrap;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} details[open]
    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-line {
    animation: cm-new-tab-prompt-line-enter 520ms
      cubic-bezier(0.22, 1, 0.36, 1)
      calc(var(--card-master-prompt-line-index, 0) * 90ms) both;
  }

  @keyframes cm-new-tab-prompt-line-enter {
    from {
      opacity: 0;
      translate: 0 7px;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-label {
    color: color-mix(in srgb, var(--x-nt-text, #111827) 72%, transparent);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__copy-prompt {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: color-mix(in srgb, var(--x-nt-text, #111827) 72%, transparent);
    cursor: pointer;
    transition:
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing),
      opacity var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing);
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__copy-prompt:hover:not(:disabled) {
    border-color: var(--x-nt-panel-border, rgb(0 0 0 / 8%));
    background: color-mix(in srgb, var(--x-nt-text, #111827) 8%, transparent);
    color: var(--x-nt-text, #111827);
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__copy-prompt:disabled {
    cursor: default;
    opacity: 0.34;
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} > button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--card-master-new-tab-surface-border);
    border-radius: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background-color var(--card-master-new-tab-surface-duration)
      var(--card-master-new-tab-surface-easing);
  }

  .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} > button:hover {
    background: color-mix(in srgb, var(--x-nt-text, #111827) 8%, transparent);
  }

  :where(
    #_x_extension_newtab_bookmarks_2024_unique_ .x-nt-bookmarks-header,
    #_x_extension_newtab_bookmarks_2024_unique_ .x-nt-bookmark-card,
    #_x_extension_newtab_bookmarks_2024_unique_ .x-nt-bookmark-empty,
    #_x_extension_newtab_recent_sites_2024_unique_ .x-nt-recent-header-bar,
    #_x_extension_newtab_recent_sites_2024_unique_ .x-nt-recent-card,
    #_x_extension_newtab_recent_sites_2024_unique_ .x-nt-recent-empty
  ) {
    translate: 0 var(--card-master-photo-frame-item-offset, 0px);
  }

  :where(
    #_x_extension_toast_2024_unique_,
    .x-nt-initial-background-veil,
    #_x_extension_newtab_suggestions_surface_2026_unique_,
    #_x_extension_newtab_suggestions_outline_2026_unique_,
    #_x_extension_newtab_suggestions_container_2024_unique_,
    .x-nt-shortcut-dialog-backdrop,
    .x-nt-shortcut-context-menu-portal,
    .x-nt-bookmark-context-menu-portal,
    .x-nt-section-mode-portal,
    .x-nt-bookmark-cascade-menu,
    .x-nt-bookmark-cascade-level,
    .x-nt-wallpaper-panel,
    [role="dialog"],
    [role="menu"],
    [role="listbox"],
    [role="tooltip"],
    [id*="_tooltip_"]
  ) {
    --card-master-photo-frame-delay: 0ms;
    --card-master-photo-frame-duration: 360ms;
    --card-master-photo-frame-offset: 8px;
  }

  #_x_extension_newtab_bookmarks_topbar_2026_unique_ {
    --card-master-photo-frame-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.topIcons}ms;
    --card-master-photo-frame-duration: 560ms;
    --card-master-photo-frame-offset: -10px;
  }

  #_x_extension_newtab_wordmark_2026_unique_ {
    --card-master-photo-frame-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.wordmark}ms;
    --card-master-photo-frame-duration: 640ms;
    --card-master-photo-frame-offset: -14px;
  }

  #_x_extension_newtab_root_2024_unique_ {
    --card-master-photo-frame-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.search}ms;
    --card-master-photo-frame-duration: 620ms;
    --card-master-photo-frame-offset: -12px;
  }

  .x-nt-shortcuts-section {
    --card-master-photo-frame-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.shortcuts}ms;
    --card-master-photo-frame-duration: 580ms;
    --card-master-photo-frame-offset: -10px;
  }

  :where(
    .x-nt-wallpaper-control,
    .x-nt-feedback-control,
    .x-nt-bookmark-cascade-debug-control
  ) {
    --card-master-photo-frame-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.bottomControls}ms;
    --card-master-photo-frame-duration: 460ms;
    --card-master-photo-frame-offset: 9px;
  }

  :where(
    #_x_extension_toast_2024_unique_,
    .x-nt-initial-background-veil,
    #_x_extension_newtab_suggestions_surface_2026_unique_,
    #_x_extension_newtab_suggestions_outline_2026_unique_,
    #_x_extension_newtab_suggestions_container_2024_unique_,
    .x-nt-shortcut-dialog-backdrop,
    .x-nt-shortcut-context-menu-portal,
    .x-nt-bookmark-context-menu-portal,
    .x-nt-section-mode-portal,
    .x-nt-bookmark-cascade-menu,
    .x-nt-bookmark-cascade-level,
    .x-nt-wallpaper-panel,
    .x-nt-wallpaper-control,
    .x-nt-feedback-control,
    .x-nt-bookmark-cascade-debug-control,
    #_x_extension_newtab_bookmarks_topbar_2026_unique_,
    .x-nt-shortcuts-section,
    #_x_extension_newtab_root_2024_unique_,
    #_x_extension_newtab_wordmark_2026_unique_,
    [role="dialog"],
    [role="menu"],
    [role="listbox"],
    [role="tooltip"],
    [id*="_tooltip_"]
  ) {
    transition-duration: var(
      --card-master-photo-frame-duration,
      480ms
    ) !important;
    transition-property: opacity, translate !important;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1) !important;
    translate: 0 0;
  }

  html:not([${NEW_TAB_PHOTO_FRAME_ATTRIBUTE}="true"])
    :where(
      #_x_extension_toast_2024_unique_,
      .x-nt-initial-background-veil,
      #_x_extension_newtab_suggestions_surface_2026_unique_,
      #_x_extension_newtab_suggestions_outline_2026_unique_,
      #_x_extension_newtab_suggestions_container_2024_unique_,
      .x-nt-shortcut-dialog-backdrop,
      .x-nt-shortcut-context-menu-portal,
      .x-nt-bookmark-context-menu-portal,
      .x-nt-section-mode-portal,
      .x-nt-bookmark-cascade-menu,
      .x-nt-bookmark-cascade-level,
      .x-nt-wallpaper-panel,
      .x-nt-wallpaper-control,
      .x-nt-feedback-control,
      .x-nt-bookmark-cascade-debug-control,
      #_x_extension_newtab_bookmarks_topbar_2026_unique_,
      .x-nt-shortcuts-section,
      #_x_extension_newtab_root_2024_unique_,
      #_x_extension_newtab_wordmark_2026_unique_,
      [role="dialog"],
      [role="menu"],
      [role="listbox"],
      [role="tooltip"],
      [id*="_tooltip_"]
  ) {
    transition-delay: var(
      --card-master-photo-frame-delay,
      0ms
    ) !important;
  }

  html[${NEW_TAB_PHOTO_FRAME_ATTRIBUTE}="true"]
    :where(
      #_x_extension_toast_2024_unique_,
      .x-nt-initial-background-veil,
      #_x_extension_newtab_suggestions_surface_2026_unique_,
      #_x_extension_newtab_suggestions_outline_2026_unique_,
      #_x_extension_newtab_suggestions_container_2024_unique_,
      .x-nt-shortcut-dialog-backdrop,
      .x-nt-shortcut-context-menu-portal,
      .x-nt-bookmark-context-menu-portal,
      .x-nt-section-mode-portal,
      .x-nt-bookmark-cascade-menu,
      .x-nt-bookmark-cascade-level,
      .x-nt-wallpaper-panel,
      .x-nt-wallpaper-control,
      .x-nt-feedback-control,
      .x-nt-bookmark-cascade-debug-control,
      #_x_extension_newtab_bookmarks_topbar_2026_unique_,
      .x-nt-shortcuts-section,
      #_x_extension_newtab_root_2024_unique_,
      #_x_extension_newtab_wordmark_2026_unique_,
      [role="dialog"],
      [role="menu"],
      [role="listbox"],
      [role="tooltip"],
      [id*="_tooltip_"]
  ) {
    opacity: 0 !important;
    pointer-events: none !important;
    transition-delay: var(
      --card-master-photo-frame-delay,
      0ms
    ) !important;
    translate: 0 var(--card-master-photo-frame-offset, 6px);
  }

  #_x_extension_newtab_root_2024_unique_ {
    transition:
      opacity var(--card-master-photo-frame-duration, 620ms)
        cubic-bezier(0.22, 1, 0.36, 1)
        var(--card-master-photo-frame-delay, 0ms),
      translate var(--card-master-photo-frame-duration, 620ms)
        cubic-bezier(0.22, 1, 0.36, 1)
        var(--card-master-photo-frame-delay, 0ms),
      background-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) 0ms,
      border-color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) 0ms,
      box-shadow var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) 0ms,
      color var(--card-master-new-tab-surface-duration)
        var(--card-master-new-tab-surface-easing) 0ms !important;
  }

  @media (prefers-reduced-motion: reduce) {
    :where(
      #_x_extension_toast_2024_unique_,
      .x-nt-initial-background-veil,
      #_x_extension_newtab_suggestions_surface_2026_unique_,
      #_x_extension_newtab_suggestions_outline_2026_unique_,
      #_x_extension_newtab_suggestions_container_2024_unique_,
      .x-nt-shortcut-dialog-backdrop,
      .x-nt-shortcut-context-menu-portal,
      .x-nt-bookmark-context-menu-portal,
      .x-nt-section-mode-portal,
      .x-nt-bookmark-cascade-menu,
      .x-nt-bookmark-cascade-level,
      .x-nt-wallpaper-panel,
      .x-nt-wallpaper-control,
      .x-nt-feedback-control,
      .x-nt-bookmark-cascade-debug-control,
      #_x_extension_newtab_bookmarks_topbar_2026_unique_,
      .x-nt-shortcuts-section,
      #_x_extension_newtab_root_2024_unique_,
      #_x_extension_newtab_wordmark_2026_unique_,
      [role="dialog"],
      [role="menu"],
      [role="listbox"],
      [role="tooltip"],
      [id*="_tooltip_"]
    ) {
      transition-delay: 0ms !important;
      transition-duration: 120ms !important;
      translate: 0 0 !important;
    }

    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation,
    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button,
    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} {
      transition-duration: 120ms !important;
    }

    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-line {
      animation: none !important;
      opacity: 1 !important;
      translate: 0 0 !important;
    }

    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__hint {
      animation-duration: 1800ms !important;
    }
  }

  @media (max-width: 640px) {
    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary strong {
      display: none;
    }

    .${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS} summary span {
      width: calc(100vw - 96px);
    }

    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button {
      width: 42px;
      height: 42px;
    }

    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--previous {
      left: max(10px, env(safe-area-inset-left));
    }

    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--next {
      right: max(10px, env(safe-area-inset-right));
    }

    .${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--latest {
      min-width: 42px;
      padding-inline: 13px;
    }
  }
`;

export type PhotoFrameWallpaperVisual = {
  backgroundColor: string;
  imageCss: string;
  imageUrl: string;
  position: string;
  size: string;
};

function cssUrlValue(url: string) {
  const safe = url
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/\n|\r/gu, '');
  return `url("${safe}")`;
}

export function wallpaperUrlFromCssImage(value: string) {
  const pattern = /url\((?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^)]*))\)/gu;
  let result = '';
  let match = pattern.exec(value);
  while (match) {
    result = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    match = pattern.exec(value);
  }
  return result.replace(/\\(["\\])/gu, '$1');
}

export function resolvePhotoFrameWallpaperVisual(
  rootStyle: CSSStyleDeclaration,
  bodyStyle: CSSStyleDeclaration,
  preferredImageUrl = '',
): PhotoFrameWallpaperVisual | null {
  const imageVariable = rootStyle
    .getPropertyValue('--x-nt-wallpaper-image')
    .trim();
  const imageUrl =
    preferredImageUrl.trim() ||
    wallpaperUrlFromCssImage(
      imageVariable && imageVariable !== 'none'
        ? imageVariable
        : bodyStyle.backgroundImage,
    );
  if (!imageUrl) return null;
  return {
    backgroundColor: bodyStyle.backgroundColor || '#111111',
    imageCss: cssUrlValue(imageUrl),
    imageUrl,
    position:
      rootStyle.getPropertyValue('--x-nt-wallpaper-position').trim() ||
      bodyStyle.backgroundPosition.split(',').at(-1)?.trim() ||
      'center center',
    size:
      rootStyle.getPropertyValue('--x-nt-wallpaper-size').trim() ||
      bodyStyle.backgroundSize.split(',').at(-1)?.trim() ||
      'cover',
  };
}

type PhotoFrameIdleScheduler = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};

export type PhotoFrameIdleTrigger = 'idle' | 'forced';

export type PhotoFrameIdleGuardState = {
  businessInteractionActive: boolean;
  directInteractionActive: boolean;
  focused: boolean;
  manualPhotoFrameRequested: boolean;
  modeAvailable: boolean;
  overlayVisible: boolean;
  visible: boolean;
  wallpaperActive: boolean;
};

export type PhotoFrameIdleBlockReason =
  | 'business-interaction'
  | 'direct-interaction'
  | 'manual-photo-frame'
  | 'mode-unavailable'
  | 'overlay-visible'
  | 'page-hidden'
  | 'window-unfocused'
  | 'wallpaper-unavailable';

export function photoFrameIdleBlockReason(
  state: PhotoFrameIdleGuardState,
  trigger: PhotoFrameIdleTrigger = 'idle',
): PhotoFrameIdleBlockReason | null {
  if (state.manualPhotoFrameRequested) return 'manual-photo-frame';
  if (!state.modeAvailable) return 'mode-unavailable';
  if (!state.visible) return 'page-hidden';
  if (!state.focused) return 'window-unfocused';
  if (!state.wallpaperActive) return 'wallpaper-unavailable';
  if (state.directInteractionActive) return 'direct-interaction';
  if (trigger === 'forced') return null;
  if (state.overlayVisible) return 'overlay-visible';
  if (state.businessInteractionActive) return 'business-interaction';
  return null;
}

export type PhotoFrameIdleController = {
  activity(): void;
  isIdle(): boolean;
  setForceIdleMs(forceIdleMs: number): void;
  setIdleMs(idleMs: number): void;
  setIdle(idle: boolean): boolean;
  start(): void;
  stop(): void;
};

export type PhotoFrameIdleControllerOptions = {
  canEnterIdle?: (trigger: PhotoFrameIdleTrigger) => boolean;
  forceIdleMs?: number;
  idleMs?: number;
  onIdleChange(idle: boolean, trigger: PhotoFrameIdleTrigger): void;
  scheduler?: PhotoFrameIdleScheduler;
};

const defaultScheduler: PhotoFrameIdleScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createPhotoFrameIdleController({
  canEnterIdle = () => true,
  forceIdleMs = NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS,
  idleMs = NEW_TAB_PHOTO_FRAME_IDLE_MS,
  onIdleChange,
  scheduler = defaultScheduler,
}: PhotoFrameIdleControllerOptions): PhotoFrameIdleController {
  let idle = false;
  let running = false;
  let timer: unknown = null;
  let forceTimer: unknown = null;
  let delayMs = Math.max(0, idleMs);
  let forceDelayMs = Math.max(0, forceIdleMs);
  let shortIdleEligible = true;

  const clearTimer = () => {
    if (timer === null) return;
    scheduler.clearTimeout(timer);
    timer = null;
  };

  const clearForceTimer = () => {
    if (forceTimer === null) return;
    scheduler.clearTimeout(forceTimer);
    forceTimer = null;
  };

  const updateIdle = (
    nextIdle: boolean,
    trigger: PhotoFrameIdleTrigger = 'idle',
  ) => {
    if (nextIdle && !canEnterIdle(trigger)) return false;
    if (idle === nextIdle) return false;
    idle = nextIdle;
    onIdleChange(idle, trigger);
    return true;
  };

  const schedule = () => {
    clearTimer();
    if (!running || !shortIdleEligible) return;
    timer = scheduler.setTimeout(() => {
      timer = null;
      if (running) updateIdle(true);
    }, delayMs);
  };

  const scheduleForce = () => {
    clearForceTimer();
    if (!running) return;
    forceTimer = scheduler.setTimeout(() => {
      forceTimer = null;
      if (!running || idle) return;
      if (!updateIdle(true, 'forced')) scheduleForce();
    }, forceDelayMs);
  };

  return {
    activity() {
      if (!running) return;
      if (idle) shortIdleEligible = false;
      updateIdle(false);
      schedule();
      scheduleForce();
    },
    isIdle() {
      return idle;
    },
    setIdleMs(nextIdleMs) {
      const nextDelayMs = Math.max(0, nextIdleMs);
      if (delayMs === nextDelayMs) return;
      delayMs = nextDelayMs;
      if (!running) return;
      updateIdle(false);
      schedule();
    },
    setForceIdleMs(nextForceIdleMs) {
      const nextDelayMs = Math.max(0, nextForceIdleMs);
      if (forceDelayMs === nextDelayMs) return;
      forceDelayMs = nextDelayMs;
      if (!running) return;
      clearForceTimer();
      scheduleForce();
    },
    setIdle: (nextIdle) => updateIdle(nextIdle),
    start() {
      if (running) return;
      running = true;
      updateIdle(false);
      schedule();
      scheduleForce();
    },
    stop() {
      running = false;
      clearTimer();
      clearForceTimer();
      updateIdle(false);
    },
  };
}
