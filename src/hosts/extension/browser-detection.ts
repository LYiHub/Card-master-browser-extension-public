import { t } from '../../localization/messages';
export type BrowserBrand =
  | 'arc'
  | 'chrome'
  | 'edge'
  | 'brave'
  | 'opera'
  | 'vivaldi'
  | 'firefox'
  | 'safari'
  | 'unknown';

export type BrowserEnvironmentInfo = {
  brand: BrowserBrand;
  displayName: string;
  sidePanelSupported: boolean;
  recommendedPanelMode: 'sidePanel' | 'popup';
  statusNotice: string;
};

export function isArcBrowser(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    // 1. Arc global namespace
    if (
      'arc' in window ||
      (window as unknown as { arc?: unknown }).arc !== undefined
    ) {
      return true;
    }
    // 2. Arc CSS variables on :root
    const style = getComputedStyle(document.documentElement);
    if (
      style.getPropertyValue('--arc-palette-title') ||
      style.getPropertyValue('--arc-palette-background') ||
      style.getPropertyValue('--arc-palette-focus') ||
      style.getPropertyValue('--arc-palette-hover') ||
      style.getPropertyValue('--arc-background-simple-color') ||
      style.getPropertyValue('--arc-palette-foregroundPrimary') ||
      style.getPropertyValue('--arc-palette-subtitle')
    ) {
      return true;
    }
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (name?.startsWith('--arc-')) {
        return true;
      }
    }
  } catch {
    // Ignore DOM access issues
  }
  return false;
}

export function detectBrowserEnvironment(
  userAgentOverride?: string,
): BrowserEnvironmentInfo {
  // Arc masks its User-Agent as standard Chrome, so check Arc-specific signatures first
  if (isArcBrowser()) {
    return {
      brand: 'arc',
      displayName: t('cm_browser_detection_display_name_1'),
      sidePanelSupported: false,
      recommendedPanelMode: 'popup',
      statusNotice: t('cm_browser_detection_status_notice_2'),
    };
  }

  const ua =
    userAgentOverride ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  if (/Edg\//i.test(ua)) {
    return {
      brand: 'edge',
      displayName: 'Microsoft Edge',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice: t('cm_browser_detection_status_notice_3'),
    };
  }

  if (
    typeof navigator !== 'undefined' &&
    (navigator as unknown as { brave?: unknown }).brave
  ) {
    return {
      brand: 'brave',
      displayName: t('cm_browser_detection_display_name_4'),
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice: t('cm_browser_detection_status_notice_5'),
    };
  }

  if (/OPR\/|Opera\//i.test(ua)) {
    return {
      brand: 'opera',
      displayName: t('cm_browser_detection_display_name_6'),
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice: t('cm_browser_detection_status_notice_7'),
    };
  }

  if (/Vivaldi\//i.test(ua)) {
    return {
      brand: 'vivaldi',
      displayName: t('cm_browser_detection_display_name_8'),
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice: t('cm_browser_detection_status_notice_9'),
    };
  }

  if (/Firefox\//i.test(ua)) {
    return {
      brand: 'firefox',
      displayName: t('cm_browser_detection_display_name_10'),
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice: t('cm_browser_detection_status_notice_11'),
    };
  }

  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    return {
      brand: 'safari',
      displayName: t('cm_browser_detection_display_name_12'),
      sidePanelSupported: false,
      recommendedPanelMode: 'popup',
      statusNotice: t('cm_browser_detection_status_notice_13'),
    };
  }

  if (/Chrome\//i.test(ua)) {
    return {
      brand: 'chrome',
      displayName: 'Google Chrome',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice: t('cm_browser_detection_status_notice_14'),
    };
  }

  return {
    brand: 'unknown',
    displayName: t('cm_browser_detection_display_name_15'),
    sidePanelSupported: true,
    recommendedPanelMode: 'sidePanel',
    statusNotice: t('cm_browser_detection_status_notice_16'),
  };
}
