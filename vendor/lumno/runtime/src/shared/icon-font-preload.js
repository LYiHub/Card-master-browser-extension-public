(function() {
  const PRELOAD_ID = '_x_extension_remixicon_font_preload_2026_unique_';
  const FONT_PATH = 'assets/remixicon/fonts/remixicon.woff2';

  if (!document || document.getElementById(PRELOAD_ID)) {
    return;
  }
  const host = document.head || document.documentElement;
  if (!host || !globalThis.chrome || !chrome.runtime ||
      typeof chrome.runtime.getURL !== 'function') {
    return;
  }

  const link = document.createElement('link');
  link.id = PRELOAD_ID;
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = 'anonymous';
  link.fetchPriority = 'high';
  link.href = chrome.runtime.getURL(FONT_PATH);
  host.appendChild(link);
})();
