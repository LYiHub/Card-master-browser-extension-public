import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import { preinstalledCardMedia } from '../../lib/userscript-deck-media';
import {
  COPYING_LIFTED_ID,
  mergePendingPreinstalledUserscripts,
  normalizePreinstalledUserscriptState,
  PREINSTALLED_USERSCRIPTS,
  preinstalledUserscriptContentRevision,
} from './preinstalled';

const emptyState = normalizePreinstalledUserscriptState(null);

describe('preinstalled userscripts', () => {
  it('defines the requested catalog and default states', () => {
    expect(
      PREINSTALLED_USERSCRIPTS.map(({ metadata, enabled, presentation }) => ({
        name: metadata.name,
        enabled,
        accent: presentation.accent,
        video:
          presentation.media.kind === 'video' ? presentation.media.video : null,
      })),
    ).toEqual([
      {
        name: 'BiliKit Core',
        enabled: true,
        accent: preinstalledCardMedia('01-bilikit-core').accent,
        video: expect.stringContaining(
          '/preinstalled-cards/01-bilikit-core.mp4',
        ),
      },
      {
        name: 'BiliKit Feed',
        enabled: false,
        accent: preinstalledCardMedia('02-bilikit-feed').accent,
        video: expect.stringContaining(
          '/preinstalled-cards/02-bilikit-feed.mp4',
        ),
      },
      {
        name: '哔哩哔哩(B站|Bilibili)收藏夹Fix (cerenkov修改版)',
        enabled: true,
        accent: preinstalledCardMedia('03-bilibili-favorites-fix').accent,
        video: expect.stringContaining(
          '/preinstalled-cards/03-bilibili-favorites-fix.mp4',
        ),
      },
      {
        name: 'Copying Lifted 解除复制限制',
        enabled: true,
        accent: preinstalledCardMedia('04-copying-lifted').accent,
        video: null,
      },
    ]);
    expect(
      PREINSTALLED_USERSCRIPTS.some(({ metadata }) =>
        metadata.name.includes('关注管理器'),
      ),
    ).toBe(false);
  });

  it('keeps copying support local, top-frame-only and free of DOM scans', () => {
    const copying = PREINSTALLED_USERSCRIPTS.find(
      (script) => script.id === COPYING_LIFTED_ID,
    );

    expect(copying?.metadata.noframes).toBe(true);
    expect(copying?.metadata.requires).toEqual([]);
    expect(copying?.source).not.toContain("querySelectorAll('*')");
    expect(copying?.source).not.toContain('EventTarget.prototype');
    expect(copying?.source).toContain('stopImmediatePropagation');
  });

  it('leaves right-click handling to the site while keeping copying support', () => {
    const document = Object.assign(new EventTarget(), {
      documentElement: {
        append: vi.fn(),
        classList: { toggle: vi.fn(), remove: vi.fn() },
      },
      createElement: () => ({ textContent: '', remove: vi.fn() }),
    });
    runInNewContext(PREINSTALLED_USERSCRIPTS[3].source, {
      document,
      window: new EventTarget(),
    });

    expect(
      document.dispatchEvent(new Event('contextmenu', { cancelable: true })),
    ).toBe(true);

    const siteMenu = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener('contextmenu', siteMenu);
    const contextmenu = new Event('contextmenu', { cancelable: true });
    expect(document.dispatchEvent(contextmenu)).toBe(false);
    expect(siteMenu).toHaveBeenCalledOnce();
    expect(contextmenu.defaultPrevented).toBe(true);

    for (const type of ['copy', 'cut', 'selectstart']) {
      const restriction = vi.fn((event: Event) => event.preventDefault());
      document.addEventListener(type, restriction);
      expect(
        document.dispatchEvent(new Event(type, { cancelable: true })),
      ).toBe(true);
      expect(restriction).not.toHaveBeenCalled();
    }
  });

  it('does not hijack native Bilibili watch-later controls', () => {
    const bilikit = PREINSTALLED_USERSCRIPTS.find(
      (script) => script.id === 'preinstalled-bilikit-core',
    );

    expect(bilikit?.source).toContain(
      '.bili-watch-later, .bili-watch-later--wrap',
    );
  });

  it('adds each catalog entry once with its owned update policy', () => {
    const merged = mergePendingPreinstalledUserscripts([], emptyState, {
      now: () => 42,
      random: () => 0,
    });

    expect(merged.addedIds).toEqual(
      PREINSTALLED_USERSCRIPTS.map(({ id }) => id),
    );
    expect(
      merged.scripts.map(({ id, manager, source }) => ({
        id,
        enabled: manager.enabled,
        checkForUpdates: manager.checkForUpdates,
        installedAt: source.installedAt,
      })),
    ).toEqual([
      {
        id: 'preinstalled-bilikit-core',
        enabled: true,
        checkForUpdates: true,
        installedAt: 42,
      },
      {
        id: 'preinstalled-bilikit-feed',
        enabled: false,
        checkForUpdates: true,
        installedAt: 42,
      },
      {
        id: 'preinstalled-bilibili-favorites-fix',
        enabled: true,
        checkForUpdates: true,
        installedAt: 42,
      },
      {
        id: COPYING_LIFTED_ID,
        enabled: true,
        checkForUpdates: false,
        installedAt: 42,
      },
    ]);
    expect(merged.hideCardIds).toEqual([COPYING_LIFTED_ID]);
  });

  it('preserves an existing script with the same upstream identity', () => {
    const first = mergePendingPreinstalledUserscripts([], emptyState, {
      now: () => 42,
      random: () => 0,
    });
    const existingCore = {
      ...first.scripts[0],
      id: 'manually-installed-core',
      manager: {
        ...first.scripts[0].manager,
        enabled: false,
      },
    };
    const merged = mergePendingPreinstalledUserscripts(
      [existingCore],
      emptyState,
      {
        now: () => 84,
        random: () => 0,
      },
    );

    expect(merged.scripts[0]).toEqual(existingCore);
    expect(
      merged.scripts.filter(({ metadata }) => metadata.name === 'BiliKit Core'),
    ).toHaveLength(1);
    expect(merged.addedIds).not.toContain('preinstalled-bilikit-core');
  });

  it('does not reinstall a processed script after the user removes it', () => {
    const first = mergePendingPreinstalledUserscripts([], emptyState, {
      now: () => 42,
      random: () => 0,
    });
    const withoutFavoritesFix = first.scripts.filter(
      ({ id }) => id !== 'preinstalled-bilibili-favorites-fix',
    );
    const second = mergePendingPreinstalledUserscripts(
      withoutFavoritesFix,
      first.state,
      {
        now: () => 84,
        random: () => 0,
      },
    );

    expect(second.addedIds).toEqual([]);
    expect(
      second.scripts.some(
        ({ id }) => id === 'preinstalled-bilibili-favorites-fix',
      ),
    ).toBe(false);
  });

  it.each([
    true,
    false,
  ])('migrates a managed same-version source while preserving enabled=%s and settings', (enabled) => {
    const first = mergePendingPreinstalledUserscripts([], emptyState, {
      now: () => 42,
      random: () => 0,
    });
    const current = first.scripts[3];
    const previousSource = current.source.code.replace(
      "['copy', 'cut', 'selectstart']",
      "['copy', 'cut', 'contextmenu', 'selectstart']",
    );
    expect(previousSource).not.toBe(current.source.code);
    const previous = {
      ...current,
      source: {
        ...current.source,
        code: previousSource,
        updatedAt: 84,
      },
      manager: {
        ...current.manager,
        enabled,
        userMatches: ['https://example.com/*'],
      },
    };
    const migrated = mergePendingPreinstalledUserscripts(
      [previous],
      {
        ...first.state,
        contentRevisions: {
          ...first.state.contentRevisions,
          [previous.id]: preinstalledUserscriptContentRevision(previousSource),
        },
      },
      { now: () => 126 },
    );

    expect(migrated.changedIds).toEqual([previous.id]);
    expect(migrated.scripts[0].source.code).toBe(
      PREINSTALLED_USERSCRIPTS[3].source,
    );
    expect(migrated.scripts[0].source.installedAt).toBe(42);
    expect(migrated.scripts[0].source.updatedAt).toBe(126);
    expect(migrated.scripts[0].manager).toEqual(previous.manager);
    expect(migrated.scripts[0].presentation).toEqual(previous.presentation);
    expect(migrated.scripts[0].runtime.pendingRefresh).toBe(enabled);
  });

  it('does not overwrite a legacy preinstalled script edited by the user', () => {
    const first = mergePendingPreinstalledUserscripts([], emptyState, {
      now: () => 42,
      random: () => 0,
    });
    const current = first.scripts[0];
    const edited = {
      ...current,
      source: {
        ...current.source,
        code: `${current.source.code}\n// user edit`,
        updatedAt: 84,
      },
    };
    const migrated = mergePendingPreinstalledUserscripts(
      [edited],
      {
        version: 1,
        defaultsRevision: 3,
        processedIds: first.state.processedIds,
        contentRevisions: {},
      },
      { now: () => 126 },
    );

    expect(migrated.changedIds).toEqual([]);
    expect(migrated.scripts[0]).toEqual(edited);
    expect(migrated.state.contentRevisions).toEqual({});
  });

  it('normalizes corrupted state without retaining invalid identifiers', () => {
    expect(
      normalizePreinstalledUserscriptState({
        version: 1,
        processedIds: ['one', 'one', '', 2],
      }),
    ).toEqual({
      version: 1,
      defaultsRevision: 0,
      processedIds: ['one'],
      contentRevisions: {},
    });
    expect(
      normalizePreinstalledUserscriptState({
        version: 2,
        processedIds: ['one'],
      }),
    ).toEqual({
      version: 1,
      defaultsRevision: 0,
      processedIds: [],
      contentRevisions: {},
    });
  });
});
