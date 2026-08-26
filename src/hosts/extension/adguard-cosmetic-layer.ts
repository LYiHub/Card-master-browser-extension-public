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
  style.dataset.cardMasterAdguardRefresh = 'true';
  (document.head || document.documentElement).append(style);
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

  const extendedCss = data.extCssRules?.length
    ? new ExtendedCss({ cssRules: data.extCssRules })
    : null;
  extendedCss?.apply();
  layerScope()[LAYER_KEY] = {
    extendedCss,
    nativeStyle: createNativeStyle(data.nativeCssSelectors ?? []),
  };
}
