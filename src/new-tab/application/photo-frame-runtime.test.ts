import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPhotoFrameIdleController,
  NEW_TAB_DAILY_REVIEW_SURFACE_CLASS,
  NEW_TAB_PHOTO_FRAME_CONTROLS_HIDE_MS,
  NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE,
  NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS,
  NEW_TAB_PHOTO_FRAME_IDLE_MS,
  NEW_TAB_PHOTO_FRAME_OUTER_STYLE,
  NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS,
  NEW_TAB_PHOTO_FRAME_STAGE_CLASS,
  photoFrameFullscreenButtonPresentation,
  photoFrameIdleBlockReason,
  resolvePhotoFrameWallpaperVisual,
  wallpaperUrlFromCssImage,
} from './photo-frame-runtime';

afterEach(() => {
  vi.useRealTimers();
});

describe('new tab photo frame idle controller', () => {
  const entrySource = readFileSync(
    new URL('../../hosts/extension/new-tab-entry.ts', import.meta.url),
    'utf8',
  );
  const wallpaperRuntimeSource = readFileSync(
    new URL(
      '../../../vendor/lumno/runtime/src/newtab/wallpaper.js',
      import.meta.url,
    ),
    'utf8',
  );

  it('collapses the prompt surface to the fullscreen control when disabled', () => {
    expect(entrySource).toContain('details.hidden = !content.showPrompt');
    expect(entrySource).toContain(
      'element.dataset.promptVisible = String(content.showPrompt)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '[data-prompt-visible="false"]',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain('width: 34px;');
  });

  it('enters photo frame mode only after five complete idle seconds', () => {
    vi.useFakeTimers();
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS - 1);
    expect(states).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(states).toEqual([true]);
    expect(controller.isIdle()).toBe(true);
  });

  it('wakes immediately and consumes the short idle period for this page', () => {
    vi.useFakeTimers();
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS);
    controller.activity();

    expect(states).toEqual([true, false]);
    expect(controller.isIdle()).toBe(false);

    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS * 2);
    expect(states).toEqual([true, false]);
  });

  it('keeps postponing the transition while activity continues', () => {
    vi.useFakeTimers();
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(2_000);
    controller.activity();
    vi.advanceTimersByTime(2_000);
    controller.activity();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS - 1);
    expect(states).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(states).toEqual([true]);
  });

  it('restarts the longest waiting period after real activity', () => {
    vi.useFakeTimers();
    const states: Array<{
      idle: boolean;
      trigger: 'idle' | 'forced';
    }> = [];
    const canEnterIdle = vi.fn(
      (trigger: 'idle' | 'forced') => trigger === 'forced',
    );
    const controller = createPhotoFrameIdleController({
      canEnterIdle,
      onIdleChange: (idle, trigger) => states.push({ idle, trigger }),
    });

    controller.start();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS - 1_000);
    controller.activity();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS - 1);
    expect(states).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(states).toEqual([{ idle: true, trigger: 'forced' }]);
    expect(NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS).toBe(60_000);
    expect(canEnterIdle).toHaveBeenLastCalledWith('forced');
  });

  it('repeats the longest wait without re-enabling the short wait', () => {
    vi.useFakeTimers();
    const states: Array<{
      idle: boolean;
      trigger: 'idle' | 'forced';
    }> = [];
    const controller = createPhotoFrameIdleController({
      canEnterIdle: (trigger) => trigger === 'forced',
      onIdleChange: (idle, trigger) => states.push({ idle, trigger }),
    });

    controller.start();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS);
    controller.activity();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS);

    expect(states).toEqual([
      { idle: true, trigger: 'forced' },
      { idle: false, trigger: 'idle' },
    ]);

    vi.advanceTimersByTime(
      NEW_TAB_PHOTO_FRAME_FORCE_IDLE_MS - NEW_TAB_PHOTO_FRAME_IDLE_MS,
    );
    expect(states).toEqual([
      { idle: true, trigger: 'forced' },
      { idle: false, trigger: 'idle' },
      { idle: true, trigger: 'forced' },
    ]);
  });

  it('applies a changed idle duration to the current waiting period', () => {
    vi.useFakeTimers();
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(1_000);
    controller.setIdleMs(6_000);
    vi.advanceTimersByTime(5_999);
    expect(states).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(states).toEqual([true]);
  });

  it('applies a changed forced duration to the active-page period', () => {
    vi.useFakeTimers();
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      forceIdleMs: 60_000,
      idleMs: 60_000,
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(1_000);
    controller.setForceIdleMs(10_000);
    vi.advanceTimersByTime(9_999);
    expect(states).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(states).toEqual([true]);
  });

  it('does not enter photo frame mode without an active wallpaper', () => {
    vi.useFakeTimers();
    let wallpaperActive = false;
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      canEnterIdle: () => wallpaperActive,
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS);
    expect(states).toEqual([]);

    wallpaperActive = true;
    controller.activity();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS);
    expect(states).toEqual([true]);
  });

  it('clears pending work and active state when its page is replaced', () => {
    vi.useFakeTimers();
    const states: boolean[] = [];
    const controller = createPhotoFrameIdleController({
      onIdleChange: (idle) => states.push(idle),
    });

    controller.start();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS);
    controller.stop();
    vi.advanceTimersByTime(NEW_TAB_PHOTO_FRAME_IDLE_MS);

    expect(states).toEqual([true, false]);
    expect(controller.isIdle()).toBe(false);
  });

  it('blocks automatic entry until the page has no active user intent', () => {
    const ready = {
      businessInteractionActive: false,
      directInteractionActive: false,
      focused: true,
      manualPhotoFrameRequested: false,
      modeAvailable: true,
      overlayVisible: false,
      visible: true,
      wallpaperActive: true,
    };

    expect(photoFrameIdleBlockReason(ready)).toBeNull();
    expect(
      photoFrameIdleBlockReason({
        ...ready,
        businessInteractionActive: true,
      }),
    ).toBe('business-interaction');
    expect(
      photoFrameIdleBlockReason(
        { ...ready, businessInteractionActive: true, overlayVisible: true },
        'forced',
      ),
    ).toBeNull();
    expect(
      photoFrameIdleBlockReason(
        { ...ready, directInteractionActive: true },
        'forced',
      ),
    ).toBe('direct-interaction');
    expect(photoFrameIdleBlockReason({ ...ready, focused: false })).toBe(
      'window-unfocused',
    );
  });

  it('starts both waiting periods when the tab returns to the foreground', () => {
    expect(entrySource).toContain('const resumeAfterPageActivation = () => {');
    expect(entrySource).toContain('controller.start();');
    expect(entrySource).toContain('controller.activity();');
    expect(entrySource).not.toContain('awaitingUserIntentAfterActivation');
    expect(entrySource).toContain('if (!eventShowsUserIntent(event)) return;');
  });

  it('covers the embedded timeline and the outer deck host', () => {
    expect(NEW_TAB_PHOTO_FRAME_OUTER_STYLE).toContain('#card-master-host');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '#_x_extension_newtab_wordmark_2026_unique_',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      'body[data-card-master-daily-wallpaper="true"]',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      '#_x_extension_newtab_bottom_dock_2024_unique_',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '.x-nt-shortcuts-section',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `.${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}`,
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `.${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}`,
    );
    expect(entrySource).toContain(
      "const LUMNO_WALLPAPER_TRANSITION_CLASS = 'x-nt-wallpaper-transition-layer'",
    );
    expect(entrySource).toContain('layer.dataset.exit =');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      'cm-new-tab-photo-frame-wallpaper-transition',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      'body > :not(script)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '#_x_extension_newtab_root_2024_unique_',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'transition-property: opacity, translate !important',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `--card-master-photo-frame-delay: ${NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.search}ms`,
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      '--card-master-photo-frame-enter-delay',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      '--card-master-photo-frame-exit-delay',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'translate: 0 var(--card-master-photo-frame-offset, 6px)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--previous`,
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--next`,
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--latest`,
    );
    const disabledNavigationStyle =
      NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE.match(
        new RegExp(
          `\\\\.${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button:disabled \\\\{([^}]*)\\\\}`,
        ),
      )?.[1] ?? '';
    expect(disabledNavigationStyle).not.toContain('pointer-events: none');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '__navigation[data-visible="true"]',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '[data-emphasis="true"]',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__copy-prompt`,
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--x-nt-bookmark-heading-color',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      ':is(.x-nt-bookmarks-heading, .x-nt-recent-heading)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '.cm-new-tab-wallpaper-source__tabs',
    );
    expect(entrySource).toContain(
      "'x-nt-wallpaper-tabs cm-new-tab-wallpaper-source__tabs'",
    );
    expect(entrySource).toContain(
      "'x-nt-wallpaper-tab cm-new-tab-wallpaper-source__button'",
    );
    expect(entrySource).toContain('#new-tab-settings-wallpaper');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--x-nt-bookmark-pager-hover-bg',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--x-nt-bookmarks-topbar-ink',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--card-master-new-tab-surface: rgb(248 250 252 / 75%)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--card-master-new-tab-surface-hover: rgb(248 250 252 / 95%)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--card-master-new-tab-surface-inner: rgb(255 255 255 / 34%)',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'background: var(--card-master-new-tab-surface-inner) !important',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--card-master-new-tab-surface-duration: 360ms',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '#_x_extension_newtab_search_layer_2024_unique_',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'var(--card-master-new-tab-surface-easing) 0ms',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain('scale: 1.02');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '[data-bookmark-dragging="true"]',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '.x-nt-bookmark-card-drag-preview',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'backdrop-filter: none !important',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      '--card-master-new-tab-surface-blur',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain('filter: blur');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'grid-template-columns: minmax(0, 1fr) 34px',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'height: 30px !important',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'background: transparent !important',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      'cm-new-tab-prompt-line-enter',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain('translate: 0 -8px');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain(
      '--card-master-photo-frame-offset: -14px',
    );
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain('left: 50vw');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).toContain('text-align: center');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain('scale(1.008)');
    expect(NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE).not.toContain(
      'transform 1200ms',
    );
  });

  it('uses short object URLs for local wallpaper rendering', () => {
    expect(wallpaperRuntimeSource).toContain(
      'image.onload = () => resolve(true)',
    );
    expect(wallpaperRuntimeSource).not.toContain('image.decode().then');
    expect(wallpaperRuntimeSource).toContain('prepareCustomWallpaperObjectUrl');
    expect(wallpaperRuntimeSource).toContain('URL.createObjectURL(blob)');
    expect(wallpaperRuntimeSource).toContain('return cached.url');
    expect(wallpaperRuntimeSource).toContain(
      'revokeCustomWallpaperObjectUrl(targetWallpaper.id)',
    );
    expect(wallpaperRuntimeSource).not.toContain('local-tile-activate');
    expect(entrySource).not.toContain('[Card Master][new-tab-wallpaper-host]');
  });

  it('keeps the current wallpaper when a review refresh fails', () => {
    const updateReviewStart = entrySource.indexOf(
      'const updateReview = async () => {',
    );
    const updateReviewEnd = entrySource.indexOf(
      'const waitForWallpaper =',
      updateReviewStart,
    );
    const updateReviewSource = entrySource.slice(
      updateReviewStart,
      updateReviewEnd,
    );

    expect(updateReviewSource).toContain(
      'const previousReview = currentReview;',
    );
    expect(updateReviewSource).toContain('currentReview = previousReview;');
    const failureStart = updateReviewSource.indexOf('} catch (error) {');
    expect(updateReviewSource.slice(failureStart)).not.toContain(
      'clearDailyReviewWallpaper(embeddedDocument);',
    );
  });

  it('uses distinct controls for entering and leaving the photo frame', () => {
    expect(photoFrameFullscreenButtonPresentation(false)).toEqual({
      icon: 'ri-fullscreen-line',
      label: '进入电子相框',
    });
    expect(photoFrameFullscreenButtonPresentation(true)).toEqual({
      icon: 'ri-fullscreen-exit-line',
      label: '退出电子相框',
    });
  });

  it('follows the page from top to bottom before hiding bottom controls', () => {
    expect(Object.values(NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS)).toEqual([
      0, 90, 190, 310, 450, 590, 770, 980, 1080,
    ]);
    expect(NEW_TAB_PHOTO_FRAME_CONTROLS_HIDE_MS).toBeGreaterThanOrEqual(1_000);
    expect(entrySource).toContain(
      "if (nextMode === 'manual') showPhotoFrameControls();",
    );
    expect(entrySource).toContain('}, NEW_TAB_PHOTO_FRAME_CONTROLS_HIDE_MS);');
  });

  it('collapses the review before a blank stage click exits the photo frame', () => {
    const stageClickStart = entrySource.indexOf('const onStageClick');
    const stageClickEnd = entrySource.indexOf(
      "stage.element.addEventListener('click'",
      stageClickStart,
    );
    const outsidePointerStart = entrySource.indexOf(
      'const onOutsideReviewPointerDown',
    );
    const outsidePointerEnd = entrySource.indexOf(
      "embeddedDocument.addEventListener(\n      'pointerdown'",
      outsidePointerStart,
    );
    const stageClickSource = entrySource.slice(stageClickStart, stageClickEnd);
    const outsidePointerSource = entrySource.slice(
      outsidePointerStart,
      outsidePointerEnd,
    );

    expect(stageClickSource).toContain('if (reviewSurface.details.open)');
    expect(stageClickSource).toContain('reviewSurface.collapseDetails();');
    expect(
      stageClickSource.indexOf('reviewSurface.collapseDetails();'),
    ).toBeLessThan(stageClickSource.indexOf('exitPhotoFrame();'));
    expect(outsidePointerSource).toContain('event.target === stage.element');
  });

  it('copies the actual wallpaper URL instead of relying on the body background', () => {
    const variables = new Map([
      ['--x-nt-wallpaper-image', 'url("data:image/webp;base64,d2FsbHBhcGVy")'],
      ['--x-nt-wallpaper-position', 'center center'],
      ['--x-nt-wallpaper-size', 'cover'],
    ]);
    const rootStyle = {
      getPropertyValue: (name: string) => variables.get(name) ?? '',
    } as CSSStyleDeclaration;
    const bodyStyle = {
      backgroundColor: 'rgb(17, 17, 17)',
      backgroundImage: 'none',
      backgroundPosition: 'center center',
      backgroundSize: 'cover',
    } as CSSStyleDeclaration;

    expect(resolvePhotoFrameWallpaperVisual(rootStyle, bodyStyle)).toEqual({
      backgroundColor: 'rgb(17, 17, 17)',
      imageCss: 'url("data:image/webp;base64,d2FsbHBhcGVy")',
      imageUrl: 'data:image/webp;base64,d2FsbHBhcGVy',
      position: 'center center',
      size: 'cover',
    });
    expect(
      wallpaperUrlFromCssImage(
        'linear-gradient(#0008, #0008), url("chrome-extension://id/wallpaper.webp")',
      ),
    ).toBe('chrome-extension://id/wallpaper.webp');
  });

  it('prefers a stored daily wallpaper when the page CSS has no image', () => {
    const rootStyle = {
      getPropertyValue: () => '',
    } as unknown as CSSStyleDeclaration;
    const bodyStyle = {
      backgroundColor: 'rgb(17, 17, 17)',
      backgroundImage: 'none',
      backgroundPosition: 'center center',
      backgroundSize: 'cover',
    } as CSSStyleDeclaration;
    const imageUrl = 'data:image/webp;base64,ZGFpbHktcmV2aWV3';

    expect(
      resolvePhotoFrameWallpaperVisual(rootStyle, bodyStyle, imageUrl),
    ).toEqual({
      backgroundColor: 'rgb(17, 17, 17)',
      imageCss: `url("${imageUrl}")`,
      imageUrl,
      position: 'center center',
      size: 'cover',
    });
  });
});
