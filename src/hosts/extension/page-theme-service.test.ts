import { describe, expect, it, vi } from 'vitest';

import {
  defaultPageThemeSettings,
  PAGE_THEME_STORAGE_KEY,
  type PageThemeSnapshot,
} from '../../page-theme/domain/types';
import type { ExtensionBackgroundApi } from './api';
import { ExtensionPageThemeService } from './page-theme-service';

describe('page theme background state', () => {
  it('accepts only current authoritative snapshots for the matching tab page', async () => {
    const settings = defaultPageThemeSettings();
    settings.revision = 3;
    let removeTab = (_tabId: number) => undefined;
    const api = {
      storage: {
        local: {
          get: vi.fn(async () => ({ [PAGE_THEME_STORAGE_KEY]: settings })),
          set: vi.fn(),
        },
      },
      tabs: {
        onRemoved: {
          addListener: (listener: typeof removeTab) => {
            removeTab = listener;
          },
        },
        onUpdated: { addListener: vi.fn() },
      },
    } as unknown as ExtensionBackgroundApi;
    const service = new ExtensionPageThemeService(api);
    const listener = vi.fn();
    service.subscribe(listener);
    const snapshot: PageThemeSnapshot = {
      revision: 3,
      status: 'ready',
      enabled: true,
      activeOnPage: true,
      inactiveReason: null,
      currentHost: 'example.com',
      engine: 'dynamicTheme',
      darkThemeDetected: false,
    };

    await service.reportPage(7, 'https://example.com/article', snapshot);
    expect(service.pageSnapshot(7, 'https://example.com/other')).toEqual(
      snapshot,
    );
    expect(listener).toHaveBeenCalledWith(7);

    await service.reportPage(7, 'https://example.com/', {
      ...snapshot,
      revision: 2,
    });
    await service.reportPage(7, 'https://example.com/', {
      ...snapshot,
      status: 'starting',
    });
    expect(service.pageSnapshot(7, 'https://example.com/')).toEqual(snapshot);

    removeTab(7);
    expect(service.pageSnapshot(7, 'https://example.com/')).toBeNull();
  });
});
