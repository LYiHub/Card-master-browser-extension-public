(() => {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(
    'vendor/bilibili/pakku/generated/xhr_hook.js',
  );
  document.documentElement.append(script);
})();
