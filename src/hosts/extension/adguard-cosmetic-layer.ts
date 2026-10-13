import { ExtendedCss } from '@adguard/extended-css';

const LAYER_KEY = '__cardMasterAdguardCosmeticLayer__';

export type CosmeticData = {
  isAppStarted: boolean;
  revision?: number;
  extCssRules: string[] | null;
  nativeCssSelectors: string[] | null;
};

type CosmeticLayer = {
  extendedCss: ExtendedCss | null;
  nativeStyle: HTMLStyleElement | null;
};

type CosmeticLayerScope = typeof globalThis & {
  [LAYER_KEY]?: CosmeticLayer;
};

function layerScope() {
  return globalThis as CosmeticLayerScope;
}

function disposeLayer() {
  const scope = layerScope();
  scope[LAYER_KEY]?.extendedCss?.dispose();
  scope[LAYER_KEY]?.nativeStyle?.remove();
  delete scope[LAYER_KEY];
}

function createNativeStyle(selectors: readonly string[]) {
  if (selectors.length === 0) return null;
  const style = document.createElement('style');
  style.setAttribute('data-card-master-adguard-refresh', 'true');
  if (style.dataset) {
    style.dataset.cardMasterAdguardRefresh = 'true';
  }
  const target = document.head || document.documentElement;
  if (!target) return null;
  target.append(style);
  for (const selector of selectors) {
    try {
      style.sheet?.insertRule(
        `${selector} { display: none !important; visibility: hidden !important; }`,
      );
    } catch {
      // One invalid selector must not invalidate the remaining rules.
    }
  }
  return style;
}

export function disposeAdguardCosmeticLayer() {
  disposeLayer();
}

export function applyAdguardCosmeticData(data: CosmeticData | null) {
  disposeLayer();
  if (!data?.isAppStarted) return;

  let extendedCss: ExtendedCss | null = null;
  try {
    if (data.extCssRules?.length) {
      extendedCss = new ExtendedCss({ cssRules: data.extCssRules });
      extendedCss.apply();
    }
  } catch {
    // Extended CSS failure must not block native cosmetic rules.
  }

  let nativeStyle: HTMLStyleElement | null = null;
  try {
    nativeStyle = createNativeStyle(data.nativeCssSelectors ?? []);
  } catch {
    // Native style failure must not throw fatal unhandled errors.
  }

  layerScope()[LAYER_KEY] = {
    extendedCss,
    nativeStyle,
  };
}
