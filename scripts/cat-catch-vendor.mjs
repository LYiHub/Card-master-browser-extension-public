import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const CAT_CATCH_DIRECTORIES = ['catch-script', 'css', 'img', 'js', 'lib'];
const CAT_CATCH_PAGES = [
  'downloader.html',
  'json.html',
  'm3u8.html',
  'mpd.html',
  'options.html',
  'popup.html',
  'preview.html',
];
const CAT_CATCH_BACKGROUND_SCRIPTS = [
  'js/polyfill.js',
  'js/function.js',
  'js/templates.js',
  'js/init.js',
  'js/background.js',
];
const CAT_CATCH_DNR_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];
const CAT_CATCH_PAGE_SCRIPTS = [
  'js/content-script.js',
  'js/downloader.js',
  'js/function.js',
  'js/init.js',
  'js/m3u8.js',
  'js/media-control.js',
  'js/mpd.js',
  'js/options.js',
  'js/polyfill.js',
  'js/popup.js',
  'js/preview.js',
];

function injectBeforeFirstScript(html, source) {
  const scriptIndex = html.indexOf('<script');
  if (scriptIndex < 0) {
    throw new Error('CatCatch page is missing its script entry.');
  }
  return `${html.slice(0, scriptIndex)}${source}\n  ${html.slice(scriptIndex)}`;
}

export async function prepareCatCatchRuntime(sourceRoot, outputRoot) {
  for (const directory of CAT_CATCH_DIRECTORIES) {
    await cp(resolve(sourceRoot, directory), resolve(outputRoot, directory), {
      recursive: true,
    });
  }
  await Promise.all(
    ['js/background.js', 'js/install.js'].map((file) =>
      rm(resolve(outputRoot, file), { force: true }),
    ),
  );
  for (const script of CAT_CATCH_PAGE_SCRIPTS) {
    const destination = resolve(outputRoot, script);
    const source = await readFile(destination, 'utf8');
    await writeFile(
      destination,
      source.replaceAll('chrome.', 'globalThis.__cardMasterCatCatchChrome.'),
    );
  }
  for (const page of CAT_CATCH_PAGES) {
    const destination = resolve(outputRoot, page);
    await mkdir(dirname(destination), { recursive: true });
    let html = await readFile(resolve(sourceRoot, page), 'utf8');
    html = injectBeforeFirstScript(
      html,
      '<script src="js/card-master-adapter.js"></script>',
    );
    if (page === 'popup.html') {
      html = html
        .replace('<title>catCatch</title>', '<title>顺手牵羊</title>')
        .replace(
          '</body>',
          '  <script src="js/card-master-popup-frame.js"></script>\n</body>',
        );
    }
    await writeFile(destination, html);
  }
}

export async function mergeCatCatchLocale(sourceRoot, outputRoot) {
  const localePath = resolve(outputRoot, '_locales/zh_CN/messages.json');
  const current = JSON.parse(await readFile(localePath, 'utf8'));
  const catCatch = JSON.parse(
    await readFile(resolve(sourceRoot, '_locales/zh_CN/messages.json'), 'utf8'),
  );
  catCatch.catCatch = { message: '顺手牵羊' };
  await writeFile(
    localePath,
    `${JSON.stringify({ ...current, ...catCatch })}\n`,
  );
}

export async function composeCatCatchBackground(
  platformBackground,
  sourceRoot,
) {
  const adapter = await readFile(
    resolve(sourceRoot, 'js/card-master-adapter.js'),
    'utf8',
  );
  const scripts = await Promise.all(
    CAT_CATCH_BACKGROUND_SCRIPTS.map(async (file) => {
      const source = await readFile(resolve(sourceRoot, file), 'utf8');
      if (file !== 'js/background.js') return source;
      const enumReference =
        'Object.values(chrome.declarativeNetRequest.ResourceType)';
      if (!source.includes(enumReference)) {
        throw new Error(
          'CatCatch background no longer contains the expected DNR resource type enum.',
        );
      }
      return source.replace(
        enumReference,
        JSON.stringify(CAT_CATCH_DNR_RESOURCE_TYPES),
      );
    }),
  );
  return `${platformBackground}
/* CatCatch 2.7.2 GPL-3.0 runtime */
;(() => {
${adapter}
const chrome = globalThis.__cardMasterCatCatchChrome;
${scripts.join('\n')}
globalThis.__cardMasterCatCatchBridge = {
  readAll() {
    return structuredClone(cacheData);
  },
  state(tabId) {
    return {
      enabled: G.enable,
      captureEnabled: Boolean(G.scriptList.get('catch.js')?.tabId.has(tabId)),
      badgeNumber: G.badgeNumber
    };
  },
  setEnabled(enabled) {
    G.enable = Boolean(enabled);
    chrome.storage.sync.set({ enable: G.enable });
    return this.state(G.tabId);
  },
  setCaptureEnabled(tabId, enabled, reload = true) {
    const script = G.scriptList.get('catch.js');
    if (!script || script.tabId.has(tabId) === Boolean(enabled)) {
      return this.state(tabId);
    }
    if (enabled) script.tabId.add(tabId);
    else script.tabId.delete(tabId);
    if (reload) chrome.tabs.reload(tabId, { bypassCache: true });
    return this.state(tabId);
  },
  clear(tabId) {
    delete cacheData[tabId];
    G.urlMap.delete(tabId);
    (chrome.storage.session ?? chrome.storage.local).set({
      MediaData: cacheData
    });
    SetIcon({ tabId });
  },
  reset() {
    cacheData = {};
    G.urlMap.clear();
    for (const script of G.scriptList.values()) script.tabId.clear();
    (chrome.storage.session ?? chrome.storage.local).set({
      MediaData: cacheData
    });
    SetIcon();
  }
};
globalThis.__cardMasterCatCatchReady?.();
})();
`;
}
