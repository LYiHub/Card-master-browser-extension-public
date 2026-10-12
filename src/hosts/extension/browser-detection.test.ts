import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { detectBrowserEnvironment, isArcBrowser } from './browser-detection';

describe('browser-detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isArcBrowser', () => {
    it('returns true when window.arc is present', () => {
      vi.stubGlobal('window', { arc: {} });
      vi.stubGlobal('document', {
        documentElement: {},
      });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      expect(isArcBrowser()).toBe(true);
    });

    it('returns true when Arc CSS variable --arc-palette-background exists on documentElement', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', {
        documentElement: {},
      });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: (name: string) =>
          name === '--arc-palette-background' ? '#123456' : '',
        length: 1,
        0: '--arc-palette-background',
      }));

      expect(isArcBrowser()).toBe(true);
    });

    it('returns false when neither window.arc nor --arc CSS variables exist', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', {
        documentElement: {},
      });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      expect(isArcBrowser()).toBe(false);
    });
  });

  describe('detectBrowserEnvironment', () => {
    it('detects Arc browser and recommends popup mode', () => {
      vi.stubGlobal('window', { arc: {} });
      vi.stubGlobal('document', { documentElement: {} });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      const info = detectBrowserEnvironment();
      expect(info.brand).toBe('arc');
      expect(info.displayName).toBe('Arc 浏览器');
      expect(info.sidePanelSupported).toBe(false);
      expect(info.recommendedPanelMode).toBe('popup');
      expect(info.statusNotice).toContain('Arc');
    });

    it('detects Microsoft Edge via userAgent', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', { documentElement: {} });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      const info = detectBrowserEnvironment(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      );
      expect(info.brand).toBe('edge');
      expect(info.displayName).toBe('Microsoft Edge');
      expect(info.sidePanelSupported).toBe(true);
      expect(info.recommendedPanelMode).toBe('sidePanel');
    });

    it('detects Google Chrome via userAgent', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', { documentElement: {} });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      const info = detectBrowserEnvironment(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );
      expect(info.brand).toBe('chrome');
      expect(info.displayName).toBe('Google Chrome');
      expect(info.sidePanelSupported).toBe(true);
      expect(info.recommendedPanelMode).toBe('sidePanel');
    });

    it('detects Firefox via userAgent', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', { documentElement: {} });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      const info = detectBrowserEnvironment(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      );
      expect(info.brand).toBe('firefox');
      expect(info.displayName).toBe('Firefox 浏览器');
      expect(info.sidePanelSupported).toBe(true);
      expect(info.recommendedPanelMode).toBe('sidePanel');
    });

    it('detects Safari via userAgent', () => {
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', { documentElement: {} });
      vi.stubGlobal('getComputedStyle', () => ({
        getPropertyValue: () => '',
        length: 0,
      }));

      const info = detectBrowserEnvironment(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      );
      expect(info.brand).toBe('safari');
      expect(info.displayName).toBe('Safari 浏览器');
      expect(info.sidePanelSupported).toBe(false);
      expect(info.recommendedPanelMode).toBe('popup');
    });
  });
});
