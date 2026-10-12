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
      displayName: 'Arc 浏览器',
      sidePanelSupported: false,
      recommendedPanelMode: 'popup',
      statusNotice:
        '已检测到当前运行于 Arc 浏览器。由于 Arc 采用自身专属侧栏架构，不提供 Chromium 扩展原生侧边栏显示容器，卡牌大师已自动为你启用「独立弹出窗口模式」，无需手动配置。',
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
      statusNotice:
        '已检测到当前运行于 Microsoft Edge。原生侧边栏功能完备，推荐使用原生侧边栏；你也可按需切换为独立弹出窗口。',
    };
  }

  if (
    typeof navigator !== 'undefined' &&
    (navigator as unknown as { brave?: unknown }).brave
  ) {
    return {
      brand: 'brave',
      displayName: 'Brave 浏览器',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice:
        '已检测到当前运行于 Brave 浏览器。原生侧边栏功能完备，你可在原生侧边栏与独立弹出窗口间自由切换。',
    };
  }

  if (/OPR\/|Opera\//i.test(ua)) {
    return {
      brand: 'opera',
      displayName: 'Opera 浏览器',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice:
        '已检测到当前运行于 Opera 浏览器。支持侧栏展示与独立窗口模式。',
    };
  }

  if (/Vivaldi\//i.test(ua)) {
    return {
      brand: 'vivaldi',
      displayName: 'Vivaldi 浏览器',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice:
        '已检测到当前运行于 Vivaldi 浏览器。支持侧栏面板与独立窗口模式。',
    };
  }

  if (/Firefox\//i.test(ua)) {
    return {
      brand: 'firefox',
      displayName: 'Firefox 浏览器',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice:
        '已检测到当前运行于 Firefox。默认使用 Firefox 原生侧边栏，也可随时切换为独立窗口模式。',
    };
  }

  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    return {
      brand: 'safari',
      displayName: 'Safari 浏览器',
      sidePanelSupported: false,
      recommendedPanelMode: 'popup',
      statusNotice: '已检测到当前运行于 Safari。已默认启用独立弹出窗口模式。',
    };
  }

  if (/Chrome\//i.test(ua)) {
    return {
      brand: 'chrome',
      displayName: 'Google Chrome',
      sidePanelSupported: true,
      recommendedPanelMode: 'sidePanel',
      statusNotice:
        '已检测到当前运行于 Google Chrome。原生侧边栏功能完备，推荐使用原生侧边栏获得无缝嵌入体验；你也可自由切换为独立窗口。',
    };
  }

  return {
    brand: 'unknown',
    displayName: 'Chromium 内核浏览器',
    sidePanelSupported: true,
    recommendedPanelMode: 'sidePanel',
    statusNotice:
      '当前运行于 Chromium 内核浏览器。默认使用原生侧栏，可随时切换为独立窗口模式。',
  };
}
