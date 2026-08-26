(function() {
  const currentScript = document.currentScript;
  if (!currentScript || !currentScript.src) {
    return;
  }

  const reactEntryPath = currentScript.dataset.reactEntry;
  const readyScriptPath = currentScript.dataset.reactReadyScript;
  const pageEntryPath = currentScript.dataset.pageEntry;
  const stateKey = currentScript.dataset.reactState;
  if (!reactEntryPath || !pageEntryPath || !stateKey) {
    return;
  }

  const runtime = globalThis;
  const root = document.documentElement;
  const reactEntryUrl = new URL(reactEntryPath, currentScript.src).href;
  const readyScriptUrl = readyScriptPath
    ? new URL(readyScriptPath, currentScript.src).href
    : '';
  const pageEntryUrl = new URL(pageEntryPath, currentScript.src).href;
  const bootstrapState = {
    reactReady: false
  };
  let pageStarted = false;

  runtime[stateKey] = bootstrapState;
  root.dataset.lumnoReactRuntime = 'loading';

  function startPage() {
    if (pageStarted) {
      return;
    }
    pageStarted = true;
    root.dataset.lumnoReactRuntime = 'react';

    const pageScript = document.createElement('script');
    pageScript.src = pageEntryUrl;
    pageScript.dataset.lumnoPageRuntime = currentScript.dataset.pageRuntime || 'page';
    document.body.appendChild(pageScript);
  }

  function loadReactReadyScript() {
    if (!readyScriptUrl) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const readyScript = document.createElement('script');
      readyScript.src = readyScriptUrl;
      readyScript.onload = () => resolve();
      readyScript.onerror = () => reject(
        new Error(`React-ready script failed to load: ${readyScriptUrl}`)
      );
      document.body.appendChild(readyScript);
    });
  }

  import(reactEntryUrl).then(() => {
    if (!bootstrapState.reactReady) {
      throw new Error('React entry loaded without marking the page ready.');
    }
    return loadReactReadyScript();
  }).then(() => {
    startPage();
  }).catch((error) => {
    root.dataset.lumnoReactRuntime = 'error';
    console.error('[Lumno] React page failed to start.', error);
  });
})();
