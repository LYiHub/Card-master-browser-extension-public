import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_MEDIA_SPEED_WHEEL_ITEMS } from '../../media-speed/domain/types';
import { DeckTrigger } from './DeckTrigger';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTrigger({
  hidden,
  speedWheelVisible,
  visibleCount = 4,
  activeCount = visibleCount,
  showDeckTriggerBadge = true,
  receiving = false,
  mediaResourcesCount = 0,
  showMediaResourcesTrigger = true,
  showMediaResourcesBadge = true,
  popupOpen = false,
  position = null,
  ready = true,
}: {
  hidden: boolean;
  speedWheelVisible: boolean;
  visibleCount?: number;
  activeCount?: number;
  showDeckTriggerBadge?: boolean;
  receiving?: boolean;
  mediaResourcesCount?: number;
  showMediaResourcesTrigger?: boolean;
  showMediaResourcesBadge?: boolean;
  popupOpen?: boolean;
  position?: { x: number; y: number } | null;
  ready?: boolean;
}) {
  vi.stubGlobal('document', {
    hidden: false,
    hasFocus: () => true,
  });

  return renderToStaticMarkup(
    <DeckTrigger
      mode="closed"
      visibleCount={visibleCount}
      activeCount={activeCount}
      showDeckTriggerBadge={showDeckTriggerBadge}
      ready={ready}
      hidden={hidden}
      receiving={receiving}
      position={position}
      speedWheelVisible={speedWheelVisible}
      speedSelection={{ mode: 'standard', speed: 1.5 }}
      speedWheelItems={DEFAULT_MEDIA_SPEED_WHEEL_ITEMS}
      mediaResourcesCount={mediaResourcesCount}
      showMediaResourcesTrigger={showMediaResourcesTrigger}
      showMediaResourcesBadge={showMediaResourcesBadge}
      triggerRef={() => undefined}
      onHover={() => undefined}
      onLeave={() => undefined}
      onPositionChange={() => undefined}
      onPositionCommit={() => undefined}
      onSpeedSelection={() => undefined}
      onOpenMediaResources={() => undefined}
      mediaResourcesPopup={
        popupOpen ? (
          <div className="cat-catch-popup-frame">popup</div>
        ) : undefined
      }
      onActivate={() => undefined}
    />,
  );
}

describe('deck trigger and media speed wheel visibility', () => {
  it('tracks drag globally and blocks native image dragging', () => {
    const triggerSource = readFileSync(
      new URL('./DeckTrigger.tsx', import.meta.url),
      'utf8',
    );
    const lightweightSource = readFileSync(
      new URL('../../hosts/extension/content.ts', import.meta.url),
      'utf8',
    );
    const stageStyles = readFileSync(
      new URL('./styles/stage.css', import.meta.url),
      'utf8',
    );

    for (const source of [triggerSource, lightweightSource]) {
      expect(source).toContain(
        "window.addEventListener('pointermove', updateDragPosition, true)",
      );
      expect(source).toContain(
        "window.addEventListener('pointerup', finishDrag, true)",
      );
    }
    expect(lightweightSource).toContain(
      "entry.addEventListener('dragstart', (event) => {",
    );
    expect(lightweightSource).toContain('logo.draggable = false');
    expect(triggerSource).toContain('onDragStart={(event) => {');
    expect(lightweightSource).toMatch(
      /\.entry\.is-dragging\s*\{[^}]*cursor:\s*var\(--app-ui-cursor-pointer\)/s,
    );
    expect(stageStyles).toMatch(
      /\.manager-deck-trigger\.is-dragging\s*\{[^}]*cursor:\s*var\(--app-ui-cursor-pointer\)/s,
    );
  });

  it('keeps the current media speed visible when the deck entry is hidden', () => {
    const markup = renderTrigger({
      hidden: true,
      speedWheelVisible: true,
    });

    expect(markup).toContain('manager-deck-launch-anchor');
    expect(markup).toContain('manager-deck-entry-cluster');
    expect(markup).toContain('manager-media-speed-radial');
    expect(markup).toContain('manager-media-speed-radial is-visible');
    expect(markup).toContain('1.5×');
    expect(markup).toContain('manager-deck-trigger is-hidden');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('keeps the hidden entry mounted so its exit and return can animate', () => {
    const markup = renderTrigger({
      hidden: true,
      speedWheelVisible: false,
    });

    expect(markup).toContain('manager-deck-launch-anchor');
    expect(markup).toContain('manager-deck-entry-cluster');
    expect(markup).toContain('manager-deck-trigger is-hidden');
    expect(markup).not.toContain('manager-media-speed-radial');
  });

  it('keeps the entry invisible and omits its badge until it is ready', () => {
    const markup = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      ready: false,
    });

    expect(markup).toContain('manager-deck-trigger is-hidden');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('manager-deck-trigger__badge');
    expect(markup).not.toContain('…');
    expect(markup).not.toContain('is-loading');
  });

  it('reveals the lightweight entry only after settings and counts are ready', () => {
    const source = readFileSync(
      new URL('../../hosts/extension/content.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('bootstrapReady && settingsReady');
    expect(source).toContain('revealLightEntryWhenReady();');
    expect(source).not.toContain("count.textContent = '…'");
    expect(source).not.toContain("entry.dataset.coreState = 'loading'");
  });

  it('labels the entry with the visible count and badges it with the active count', () => {
    const markup = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      visibleCount: 5,
      activeCount: 4,
    });

    expect(markup).toContain('展开 5 张匹配卡牌');
    expect(markup).toContain('manager-deck-trigger__logo');
    expect(markup).not.toContain('manager-deck-entry-cluster__layout-guide');
    expect(markup).not.toContain('manager-deck-trigger__launch-point');
    expect(markup).not.toContain('manager-deck-trigger__card-footprint');
    expect(markup).toContain(
      'userscript-deck/visual/action-icons/card-master-logo.png',
    );
    expect(markup).toContain(
      'manager-entry-count-badge manager-deck-trigger__badge',
    );
    expect(markup).toContain('manager-deck-trigger__logo-anchor');
    expect(markup).toContain('>4</span>');
    expect(markup).toContain('--manager-deck-entry-logo-size:56px');
    expect(markup).toContain('--manager-media-speed-radius:68px');
    expect(markup).not.toContain('5 张卡牌');
    expect(markup).not.toContain('app-ui-badge');
  });

  it('hides the page entry badge independently from the entry', () => {
    const markup = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      showDeckTriggerBadge: false,
    });

    expect(markup).toContain('manager-deck-trigger__logo');
    expect(markup).not.toContain('manager-deck-trigger__badge');
  });

  it('expands two-digit badges and caps both entry counts at 99', () => {
    const twoDigits = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      activeCount: 12,
      mediaResourcesCount: 34,
    });
    const capped = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      activeCount: 120,
      mediaResourcesCount: 120,
    });

    expect(twoDigits.match(/data-compact="true"/gu)).toHaveLength(2);
    expect(twoDigits).toContain('>12</span>');
    expect(twoDigits).toContain('>34</span>');
    expect(capped.match(/>99<\/span>/gu)).toHaveLength(2);
    expect(capped).not.toContain('99+');
  });

  it('keeps the logo visible without a miniature card stack during import', () => {
    const markup = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      receiving: true,
    });

    expect(markup).toContain('manager-deck-trigger is-import-receiving');
    expect(markup).toContain('is-import-receiving');
    expect(markup).toContain('manager-deck-trigger__logo');
    expect(markup).toContain('data-core-state="receiving"');
    expect(markup).not.toContain('manager-deck-trigger__receiving-stack');
    expect(markup).not.toContain('data-import-receiving-card');
  });

  it('shows the media resource shortcut only after resources are discovered', () => {
    const waiting = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
    });
    const discovered = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      mediaResourcesCount: 7,
    });

    expect(waiting).not.toContain('manager-media-resources-trigger');
    expect(discovered).toContain('manager-media-resources-trigger');
    expect(discovered).toContain('打开发现的 7 项媒体资源');
    expect(discovered).toContain(
      'userscript-deck/visual/integrations/media-resources-sheep.png',
    );
    expect(discovered).toContain(
      'userscript-deck/visual/integrations/media-resources-sheep-hover.png',
    );
    expect(discovered).toContain(
      'manager-entry-count-badge manager-media-resources-trigger__badge',
    );
    expect(discovered).toContain('data-media-resources-placement="top"');
    expect(discovered).toContain('--manager-deck-entry-top-inset:90px');
  });

  it('controls the resource entry and its badge independently', () => {
    const withoutBadge = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      mediaResourcesCount: 7,
      showMediaResourcesBadge: false,
    });
    const withoutEntry = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      mediaResourcesCount: 7,
      showMediaResourcesTrigger: false,
    });

    expect(withoutBadge).toContain('manager-media-resources-trigger__logo');
    expect(withoutBadge).not.toContain(
      'manager-media-resources-trigger__badge',
    );
    expect(withoutEntry).not.toContain('manager-media-resources-trigger');
  });

  it('keeps the resource shortcut above the logo at every dock position', () => {
    const upperViewport = renderTrigger({
      hidden: false,
      speedWheelVisible: true,
      mediaResourcesCount: 2,
      position: { x: 0.8, y: 0.2 },
    });
    const lowerViewport = renderTrigger({
      hidden: false,
      speedWheelVisible: true,
      mediaResourcesCount: 2,
      position: { x: 0.2, y: 0.8 },
    });

    expect(upperViewport).toContain('data-media-resources-placement="top"');
    expect(lowerViewport).toContain('data-media-resources-placement="top"');
    expect(upperViewport).toContain('--manager-deck-entry-top-inset:147px');
    expect(lowerViewport).toContain('--manager-deck-entry-top-inset:147px');
    expect(upperViewport).not.toContain(
      'data-media-resources-placement="bottom"',
    );
    expect(lowerViewport).not.toContain(
      'data-media-resources-placement="bottom"',
    );
  });

  it('places the page popup inward from the resource shortcut', () => {
    const defaultPlacement = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      mediaResourcesCount: 2,
      popupOpen: true,
    });
    const upperLeftPlacement = renderTrigger({
      hidden: false,
      speedWheelVisible: false,
      mediaResourcesCount: 2,
      popupOpen: true,
      position: { x: 0.2, y: 0.2 },
    });

    expect(defaultPlacement).toContain(
      'data-cat-catch-popup-horizontal="left"',
    );
    expect(defaultPlacement).toContain('data-cat-catch-popup-vertical="above"');
    expect(upperLeftPlacement).toContain(
      'data-cat-catch-popup-horizontal="right"',
    );
    expect(upperLeftPlacement).toContain(
      'data-cat-catch-popup-vertical="below"',
    );
  });

  it('keeps the resource shortcut available when the deck entry is hidden', () => {
    const markup = renderTrigger({
      hidden: true,
      speedWheelVisible: false,
      mediaResourcesCount: 3,
    });

    expect(markup).toContain('manager-deck-launch-anchor');
    expect(markup).toContain('manager-deck-entry-cluster');
    expect(markup).toContain('manager-media-resources-trigger');
    expect(markup).toContain('manager-deck-trigger is-hidden');
  });

  it('keeps the shared upstream popup renderable without the page shortcut', () => {
    const markup = renderTrigger({
      hidden: true,
      speedWheelVisible: false,
      mediaResourcesCount: 0,
      popupOpen: true,
    });

    expect(markup).toContain('manager-deck-entry-cluster');
    expect(markup).toContain('class="cat-catch-popup-frame"');
    expect(markup).not.toContain('manager-media-resources-trigger');
  });
});
