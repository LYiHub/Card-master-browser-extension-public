import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { parse } from 'acorn';

const SPONSOR_INLINE_INJECTOR =
  't.injectScript=function(e){const t=document.createElement("script");t.id="sponsorblock-document-script",t.innerHTML=e;const n=document.head||document.documentElement,o=document.getElementById("sponsorblock-document-script");n&&!o&&n.appendChild(t)}';
const SPONSOR_DISABLED_INLINE_INJECTOR = 't.injectScript=function(){}';
const SPONSOR_SHADOW_STYLE_INJECTION =
  'n.appendChild(Object.assign(document.createElement("link"),{rel:"stylesheet",href:chrome.runtime.getURL("content.css")})),(0,u.insertSBIconDefinition)(n)';
const SPONSOR_GUARDED_SHADOW_STYLE_INJECTION =
  'n&&(n.appendChild(Object.assign(document.createElement("link"),{rel:"stylesheet",href:chrome.runtime.getURL("content.css")})),(0,u.insertSBIconDefinition)(n))';
const SPONSOR_DYNAMIC_MUTATION_LOOKUP =
  'const e=o.addedNodes[0].querySelector(".bili-dyn-item"),t=e.__vue__;';
const SPONSOR_GUARDED_DYNAMIC_MUTATION_LOOKUP =
  'const e=o.addedNodes[0]instanceof Element?(o.addedNodes[0].matches(".bili-dyn-item")?o.addedNodes[0]:o.addedNodes[0].querySelector(".bili-dyn-item")):null,t=null==e?void 0:e.__vue__;';
const SPONSOR_DYNAMIC_PAGE_MATCH =
  '(window.location.href.includes("t.bilibili.com")||window.location.href.includes("space.bilibili.com"))&&';
const SPONSOR_SCOPED_DYNAMIC_PAGE_MATCH =
  '("t.bilibili.com"===window.location.hostname||"space.bilibili.com"===window.location.hostname&&/^\\/\\d+\\/dynamic(?:\\/|$)/.test(window.location.pathname))&&';
const SPONSOR_COMMENT_LISTENER_START =
  't.CommentListener=function(){return o(this,void 0,void 0,function*(){let e;';
const SPONSOR_SCOPED_COMMENT_LISTENER_START =
  't.CommentListener=function(){return o(this,void 0,void 0,function*(){if(c.PageType.Channel===(0,l.getPageType)()&&!/^\\/\\d+\\/dynamic(?:\\/|$)/.test(window.location.pathname))return;let e;';
const SPONSOR_CATEGORY_TOOLTIP_TIMEOUT =
  '.catch(()=>{console.warn("等待查找category tooltip 挂载点时超时")})';
const SPONSOR_OPTIONAL_TOOLTIP_TIMEOUT = '.catch(()=>{})';
const SPONSOR_DELAYED_PAGE_READY_FALLBACK =
  'setTimeout(()=>{n||("complete"===document.readyState?o("fallback: readyState already complete after 30000ms"):window.addEventListener("load",()=>{setTimeout(()=>o("fallback: window.load + 2s delay"),2e3)},{once:!0}))},3e4)';
const SPONSOR_RELOAD_SAFE_PAGE_READY_FALLBACK =
  '"complete"===document.readyState?queueMicrotask(()=>o("fallback: readyState already complete")):window.addEventListener("load",()=>{setTimeout(()=>o("fallback: window.load + 2s delay"),2e3)},{once:!0})';
const YOUTUBE_CATEGORY_PILL_TITLE_WAIT =
  'let e=yield(0,u.waitFor)(()=>(0,c.getYouTubeTitleNode)());';
const YOUTUBE_OPTIONAL_CATEGORY_PILL_TITLE_WAIT =
  'let e;try{e=yield(0,u.waitFor)(()=>(0,c.getYouTubeTitleNode)())}catch{return}';
const YOUTUBE_RUNTIME_START = '(()=>{"use strict";';
const YOUTUBE_SCOPED_RUNTIME_START =
  '(()=>{"use strict";if(window.top!==window&&!/^\\/embed\\//.test(window.location.pathname))return;';
const YOUTUBE_UNBOUNDED_INITIAL_DATA_WAIT =
  'const e=setInterval(()=>{"undefined"!=typeof ytInitialData&&(k(ytInitialData),clearInterval(e))},1);M.waitingInterval=e';
const YOUTUBE_BOUNDED_INITIAL_DATA_WAIT =
  'let e=0;const t=setInterval(()=>{"undefined"!=typeof ytInitialData?(k(ytInitialData),clearInterval(t)):(e+=1)>=100&&clearInterval(t)},50);M.waitingInterval=t';
const YOUTUBE_HOTKEY_CLEANUP_TARGET =
  'document.body.removeEventListener("keydown",Ot,!0),document.body.removeEventListener("keyup",_t,!0)';
const YOUTUBE_SCOPED_HOTKEY_CLEANUP_TARGET =
  'document.removeEventListener("keydown",Ot,!0),document.removeEventListener("keyup",_t,!0)';
const YOUTUBE_EMPTY_EVENT_CLEANUP = 'e.removeEventListener("empty",d)';
const YOUTUBE_EMPTIED_EVENT_CLEANUP = 'e.removeEventListener("emptied",d)';
const YOUTUBE_FIRST_VIDEO_CLEANUP = '$e&&(0,O.addCleanupListener)(';
const YOUTUBE_EVERY_VIDEO_CLEANUP = '(0,O.addCleanupListener)(';
const YOUTUBE_UNTRACKED_THUMBNAIL_OBSERVER =
  '"YT-LOCKUP-VIEW-MODEL"===e.tagName&&new MutationObserver(t=>{for(const n of t)if("childList"===n.type&&n.addedNodes.length>0){null==c||c([e]);break}}).observe(e,{childList:!0}),l.set(e,[t,i])';
const YOUTUBE_TRACKED_THUMBNAIL_OBSERVER =
  'l.set(e,[t,i,...("YT-LOCKUP-VIEW-MODEL"===e.tagName?[(()=>{const t=new MutationObserver(t=>{for(const n of t)if("childList"===n.type&&n.addedNodes.length>0){null==c||c([e]);break}});return t.observe(e,{childList:!0}),t})()]:[])])';
const YOUTUBE_MOBILE_OBSERVER_STATE = 'const fe=[];(0,T.setupVideoModule)';
const YOUTUBE_OWNED_MOBILE_OBSERVER_STATE =
  'const fe=[];let cardMasterMobileObserver=null;(0,O.addCleanupListener)(()=>{null==cardMasterMobileObserver||cardMasterMobileObserver.disconnect(),cardMasterMobileObserver=null}),(0,T.setupVideoModule)';
const YOUTUBE_MOBILE_OBSERVER_CREATION =
  'const e=new MutationObserver(Le);let t=null;';
const YOUTUBE_OWNED_MOBILE_OBSERVER_CREATION =
  'null==cardMasterMobileObserver||cardMasterMobileObserver.disconnect(),cardMasterMobileObserver=new MutationObserver(Le);const e=cardMasterMobileObserver;let t=null;';
const SPONSOR_AUTOMATIC_HELP_OPEN =
  'chrome.tabs.create({url:chrome.runtime.getURL("/help/index.html")})';
const SPONSOR_DISABLED_AUTOMATIC_HELP_OPEN = 'void 0';
const SPONSOR_STORAGE_LOCAL = 'chrome.storage.local';
const SPONSOR_STORAGE_SYNC = 'chrome.storage.sync';
const SPONSOR_STORAGE_CHANGED = 'chrome.storage.onChanged';
const SPONSOR_RUNTIME_GET_URLS = [
  'chrome.runtime.getURL(',
  'browser.runtime.getURL(',
  'chrome.extension.getURL(',
  'browser.extension.getURL(',
];
const SPONSOR_ASSET_RESOLVERS = new Set([
  'chrome.runtime.getURL',
  'browser.runtime.getURL',
  'chrome.extension.getURL',
  'browser.extension.getURL',
]);
const SPONSOR_RUNTIME_SCOPED_MEMBERS = [
  'getManifest',
  'onMessageExternal',
  'onMessage',
  'sendMessage',
  'onConnect',
  'connect',
];
const SPONSOR_RUNTIME_SCOPED_PROPERTIES = ['id', 'lastError'];
const SPONSOR_TABS_SCOPED_MEMBERS = ['sendMessage'];
const SPONSOR_I18N_GET_MESSAGE = 'chrome.i18n.getMessage';
const CARD_MASTER_LOCALE = 'zh_CN';
const SPONSOR_POPUP_TOGGLE_STYLE =
  '<style id="card-master-sponsor-owner">.toggleSwitchContainer{display:none!important}</style>';
const PAKKU_STARTUP_CONFIG_REQUEST =
  'get_local_config(),chrome.runtime.onMessage.addListener';
const PAKKU_GUARDED_STARTUP_CONFIG_REQUEST =
  'get_local_config().catch(e=>{if(!/Extension context invalidated/.test(String((null==e?void 0:e.message)||e)))throw e}),chrome.runtime.onMessage.addListener';
const PAKKU_STATE_STORAGE =
  'let j;try{j=!!chrome?.storage?.session?.setAccessLevel}catch(_){j=!1}async function save_state(_){let k=j?chrome.storage.session:chrome.storage.local;await k.set(_)}async function remove_state(_){let k=j?chrome.storage.session:chrome.storage.local;await k.remove(_)}';
const PAKKU_GUARDED_STATE_STORAGE =
  'let j;try{j=!!globalThis.chrome?.storage?.session?.setAccessLevel}catch(_){j=!1}function pakku_storage(){try{return j&&globalThis.chrome?.storage?.session?globalThis.chrome.storage.session:globalThis.chrome?.storage?.local||null}catch(_){return null}}function pakku_context_lost(_){return /(?:Extension context invalidated|Cannot read properties of undefined|undefined is not an object)/i.test(String((null==_?void 0:_.message)||_))}async function save_state(_){const k=pakku_storage();if(!k)return;try{await k.set(_)}catch(x){if(!pakku_context_lost(x))throw x}}async function remove_state(_){const k=pakku_storage();if(!k)return;try{await k.remove(_)}catch(x){if(!pakku_context_lost(x))throw x}}';

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) return filesRecursively(absolutePath);
      return entry.isFile() ? [absolutePath] : [];
    }),
  );
  return files.flat();
}

export function replaceRequired(source, current, next, description) {
  if (!source.includes(current)) {
    throw new Error(`Missing ${description}: ${current}`);
  }
  return source.replaceAll(current, next);
}

export function patchSponsorContentRuntime(source) {
  let patched = replaceRequired(
    source,
    SPONSOR_DYNAMIC_MUTATION_LOOKUP,
    SPONSOR_GUARDED_DYNAMIC_MUTATION_LOOKUP,
    'SponsorBlock embedded dynamic-page mutation lookup',
  );
  patched = replaceRequired(
    patched,
    SPONSOR_DYNAMIC_PAGE_MATCH,
    SPONSOR_SCOPED_DYNAMIC_PAGE_MATCH,
    'SponsorBlock embedded dynamic page scope',
  );
  patched = replaceRequired(
    patched,
    SPONSOR_INLINE_INJECTOR,
    SPONSOR_DISABLED_INLINE_INJECTOR,
    'SponsorBlock inline page-script injector',
  );
  patched = replaceRequired(
    patched,
    SPONSOR_CATEGORY_TOOLTIP_TIMEOUT,
    SPONSOR_OPTIONAL_TOOLTIP_TIMEOUT,
    'SponsorBlock optional category tooltip timeout',
  );
  patched = replaceRequired(
    patched,
    SPONSOR_COMMENT_LISTENER_START,
    SPONSOR_SCOPED_COMMENT_LISTENER_START,
    'SponsorBlock comment listener page scope',
  );
  patched = replaceRequired(
    patched,
    SPONSOR_SHADOW_STYLE_INJECTION,
    SPONSOR_GUARDED_SHADOW_STYLE_INJECTION,
    'SponsorBlock shadow-root stylesheet injection',
  );
  return replaceRequired(
    patched,
    SPONSOR_DELAYED_PAGE_READY_FALLBACK,
    SPONSOR_RELOAD_SAFE_PAGE_READY_FALLBACK,
    'SponsorBlock reload page-ready fallback',
  );
}

export function patchYouTubeSponsorContentRuntime(source) {
  let patched = replaceRequired(
    source,
    YOUTUBE_CATEGORY_PILL_TITLE_WAIT,
    YOUTUBE_OPTIONAL_CATEGORY_PILL_TITLE_WAIT,
    'YouTube SponsorBlock optional category title',
  );
  patched = replaceRequired(
    patched,
    YOUTUBE_RUNTIME_START,
    YOUTUBE_SCOPED_RUNTIME_START,
    'YouTube SponsorBlock frame scope',
  );
  patched = replaceRequired(
    patched,
    YOUTUBE_HOTKEY_CLEANUP_TARGET,
    YOUTUBE_SCOPED_HOTKEY_CLEANUP_TARGET,
    'YouTube SponsorBlock hotkey cleanup target',
  );
  patched = replaceRequired(
    patched,
    YOUTUBE_EMPTY_EVENT_CLEANUP,
    YOUTUBE_EMPTIED_EVENT_CLEANUP,
    'YouTube SponsorBlock emptied cleanup event',
  );
  patched = replaceRequired(
    patched,
    YOUTUBE_FIRST_VIDEO_CLEANUP,
    YOUTUBE_EVERY_VIDEO_CLEANUP,
    'YouTube SponsorBlock video listener cleanup',
  );
  patched = replaceRequired(
    patched,
    YOUTUBE_UNTRACKED_THUMBNAIL_OBSERVER,
    YOUTUBE_TRACKED_THUMBNAIL_OBSERVER,
    'YouTube SponsorBlock thumbnail observer ownership',
  );
  patched = replaceRequired(
    patched,
    YOUTUBE_MOBILE_OBSERVER_STATE,
    YOUTUBE_OWNED_MOBILE_OBSERVER_STATE,
    'YouTube SponsorBlock mobile observer state',
  );
  return replaceRequired(
    patched,
    YOUTUBE_MOBILE_OBSERVER_CREATION,
    YOUTUBE_OWNED_MOBILE_OBSERVER_CREATION,
    'YouTube SponsorBlock mobile observer replacement',
  );
}

export function patchYouTubeSponsorDocumentRuntime(source) {
  return replaceRequired(
    replaceRequired(
      source,
      YOUTUBE_RUNTIME_START,
      YOUTUBE_SCOPED_RUNTIME_START,
      'YouTube SponsorBlock document frame scope',
    ),
    YOUTUBE_UNBOUNDED_INITIAL_DATA_WAIT,
    YOUTUBE_BOUNDED_INITIAL_DATA_WAIT,
    'YouTube SponsorBlock bounded initial data wait',
  );
}

export function patchSponsorDocumentRuntime(source) {
  return replaceRequired(
    replaceRequired(
      source,
      SPONSOR_DYNAMIC_MUTATION_LOOKUP,
      SPONSOR_GUARDED_DYNAMIC_MUTATION_LOOKUP,
      'SponsorBlock dynamic-page mutation lookup',
    ),
    SPONSOR_DYNAMIC_PAGE_MATCH,
    SPONSOR_SCOPED_DYNAMIC_PAGE_MATCH,
    'SponsorBlock dynamic page scope',
  );
}

export function patchPakkuContentRuntime(source) {
  const patched = replaceRequired(
    replaceRequired(
      source,
      PAKKU_STARTUP_CONFIG_REQUEST,
      PAKKU_GUARDED_STARTUP_CONFIG_REQUEST,
      'pakku startup configuration request',
    ),
    PAKKU_STATE_STORAGE,
    PAKKU_GUARDED_STATE_STORAGE,
    'pakku reload-safe state storage',
  );
  return `(()=>{\n${patched}\n})();\n`;
}

export function patchSponsorBackgroundRuntime(source) {
  return replaceRequired(
    source,
    SPONSOR_AUTOMATIC_HELP_OPEN,
    SPONSOR_DISABLED_AUTOMATIC_HELP_OPEN,
    'SponsorBlock automatic install help page',
  );
}

export function rewriteSponsorRuntimePaths(
  source,
  sponsorPrefix = 'vendor/bilibili/sponsor',
) {
  const pathPrefixes = [
    ['./js/', `${sponsorPrefix}/js/`],
    ['/help/', `${sponsorPrefix}/help/`],
    ['help/', `${sponsorPrefix}/help/`],
    ['/icons/', `${sponsorPrefix}/icons/`],
    ['icons/', `${sponsorPrefix}/icons/`],
    ['options/', `${sponsorPrefix}/options/`],
    ['permissions/', `${sponsorPrefix}/permissions/`],
    ['res/', `${sponsorPrefix}/res/`],
    ['libs/', `${sponsorPrefix}/libs/`],
  ];
  const exactPaths = [
    ['content.css', `${sponsorPrefix}/content.css`],
    ['popup.css', `${sponsorPrefix}/popup.css`],
    ['popup.html', `${sponsorPrefix}/popup.html`],
    ['shared.css', `${sponsorPrefix}/shared.css`],
  ];
  let replacementCount = 0;
  let rewritten = source;

  for (const quote of ['"', "'"]) {
    for (const [current, next] of pathPrefixes) {
      const search = `${quote}${current}`;
      const replacement = `${quote}${next}`;
      replacementCount += rewritten.split(search).length - 1;
      rewritten = rewritten.replaceAll(search, replacement);
    }
    for (const [current, next] of exactPaths) {
      const search = `${quote}${current}${quote}`;
      const replacement = `${quote}${next}${quote}`;
      replacementCount += rewritten.split(search).length - 1;
      rewritten = rewritten.replaceAll(search, replacement);
    }
  }

  return { source: rewritten, replacementCount };
}

function sponsorRuntimeRoot(runtimeId) {
  return `globalThis.__cardMasterSponsorRuntimes.${runtimeId}`;
}

export function rewriteSponsorStorageAccess(source, runtimeId = 'bilibili') {
  const runtimeRoot = sponsorRuntimeRoot(runtimeId);
  return source
    .replaceAll(SPONSOR_STORAGE_LOCAL, `${runtimeRoot}.storage.local`)
    .replaceAll(SPONSOR_STORAGE_SYNC, `${runtimeRoot}.storage.sync`)
    .replaceAll(SPONSOR_STORAGE_CHANGED, `${runtimeRoot}.storage.onChanged`);
}

export function rewriteSponsorAssetAccess(source, runtimeId = 'bilibili') {
  const assetAdapterGetUrl = `${sponsorRuntimeRoot(runtimeId)}.runtime.getURL(`;
  return SPONSOR_RUNTIME_GET_URLS.reduce(
    (rewritten, getUrl) => rewritten.replaceAll(getUrl, assetAdapterGetUrl),
    source,
  );
}

export function rewriteSponsorRuntimeAccess(source, runtimeId = 'bilibili') {
  const runtimeRoot = sponsorRuntimeRoot(runtimeId);
  let rewritten = source;
  for (const member of SPONSOR_RUNTIME_SCOPED_MEMBERS) {
    rewritten = rewritten.replaceAll(
      `chrome.runtime.${member}`,
      `${runtimeRoot}.runtime.${member}`,
    );
    rewritten = rewritten.replaceAll(
      `browser.runtime.${member}`,
      `${runtimeRoot}.runtime.${member}`,
    );
  }
  for (const property of SPONSOR_RUNTIME_SCOPED_PROPERTIES) {
    rewritten = rewritten.replaceAll(
      `chrome.runtime.${property}`,
      `${runtimeRoot}.runtime.${property}`,
    );
    rewritten = rewritten.replaceAll(
      `browser.runtime.${property}`,
      `${runtimeRoot}.runtime.${property}`,
    );
  }
  for (const member of SPONSOR_TABS_SCOPED_MEMBERS) {
    rewritten = rewritten.replaceAll(
      `chrome.tabs.${member}`,
      `${runtimeRoot}.runtime.sendTabMessage`,
    );
    rewritten = rewritten.replaceAll(
      `browser.tabs.${member}`,
      `${runtimeRoot}.runtime.sendTabMessage`,
    );
  }
  return rewritten.replaceAll(
    SPONSOR_I18N_GET_MESSAGE,
    `${runtimeRoot}.i18n.getMessage`,
  );
}

function isSponsorAssetResolver(node, source, runtimeId) {
  const runtimeResolver = `${sponsorRuntimeRoot(runtimeId)}.runtime.getURL`;
  return (
    node?.type === 'CallExpression' &&
    (SPONSOR_ASSET_RESOLVERS.has(
      source.slice(node.callee.start, node.callee.end),
    ) ||
      source.slice(node.callee.start, node.callee.end) === runtimeResolver)
  );
}

function isDirectSponsorIconPath(value) {
  return /^(?:\.{0,2}\/)*icons\//.test(value);
}

export function rewriteSponsorDirectIconAccess(source, runtimeId = 'bilibili') {
  const assetAdapterGetUrl = `${sponsorRuntimeRoot(runtimeId)}.runtime.getURL(`;
  const syntax = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
  });
  const replacements = [];

  function visit(node, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'Literal' &&
      typeof node.value === 'string' &&
      isDirectSponsorIconPath(node.value) &&
      !ancestors.some((ancestor) =>
        isSponsorAssetResolver(ancestor, source, runtimeId),
      )
    ) {
      const literal = source.slice(node.start, node.end);
      replacements.push({
        start: node.start,
        end: node.end,
        value: `${assetAdapterGetUrl}${literal})`,
      });
    }

    const nextAncestors = [...ancestors, node];
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) {
        for (const child of value) visit(child, nextAncestors);
      } else if (
        value &&
        typeof value === 'object' &&
        typeof value.type === 'string'
      ) {
        visit(value, nextAncestors);
      }
    }
  }

  visit(syntax);
  let rewritten = source;
  for (const replacement of replacements.sort(
    (left, right) => right.start - left.start,
  )) {
    rewritten =
      rewritten.slice(0, replacement.start) +
      replacement.value +
      rewritten.slice(replacement.end);
  }
  return {
    source: rewritten,
    replacementCount: replacements.length,
  };
}

export function composeSponsorBackground(
  platformBackground,
  runtimeAdapter,
  sponsorBackground,
  runtimeId = 'bilibili',
) {
  return `${platformBackground}
/* ${runtimeId} SponsorBlock runtime bridge */
${runtimeAdapter}
/* ${runtimeId} SponsorBlock GPL-3.0 integration */
${sponsorBackground}
`;
}

function sponsorAdapterPath(sponsorPath) {
  if (sponsorPath === 'popup.html') return 'runtime-adapter.js';
  if (
    sponsorPath === 'options/options.html' ||
    sponsorPath === 'help/index.html' ||
    sponsorPath === 'permissions/index.html'
  ) {
    return '../runtime-adapter.js';
  }
  return null;
}

export function injectSponsorStorageAdapter(html, adapterPath, popup = false) {
  const headStart = html.indexOf('<head');
  const headEnd = html.indexOf('</head>');
  if (headStart < 0 || headEnd < 0 || headStart > headEnd) {
    throw new Error('SponsorBlock HTML is missing a head element.');
  }

  const adapter = `<script src="${adapterPath}"></script>\n`;
  const firstScript = html.indexOf('<script', headStart);
  const adapterPosition =
    firstScript >= 0 && firstScript < headEnd ? firstScript : headEnd;
  let injected = `${html.slice(0, adapterPosition)}${adapter}${html.slice(adapterPosition)}`;

  if (popup) {
    injected = injected.replace(
      '</head>',
      `${SPONSOR_POPUP_TOGGLE_STYLE}\n</head>`,
    );
  }
  return injected;
}

export async function prepareSponsorVendorAssets(
  sponsorRoot,
  {
    runtimeId = 'bilibili',
    sponsorPrefix = `vendor/${runtimeId}/sponsor`,
    patchContent = runtimeId === 'bilibili',
    patchDocument = runtimeId === 'bilibili',
    patchBackground = true,
  } = {},
) {
  const javaScriptFiles = (await filesRecursively(sponsorRoot)).filter((path) =>
    path.endsWith('.js'),
  );
  let replacementCount = 0;

  for (const path of javaScriptFiles) {
    const sponsorPath = relative(sponsorRoot, path);
    if (sponsorPath === 'runtime-adapter.js') continue;
    let source = await readFile(path, 'utf8');
    if (sponsorPath === 'js/content.js' && patchContent) {
      source =
        runtimeId === 'youtube'
          ? patchYouTubeSponsorContentRuntime(source)
          : patchSponsorContentRuntime(source);
    } else if (sponsorPath === 'js/document.js' && patchDocument) {
      source =
        runtimeId === 'youtube'
          ? patchYouTubeSponsorDocumentRuntime(source)
          : patchSponsorDocumentRuntime(source);
    } else if (sponsorPath === 'js/background.js' && patchBackground) {
      source = patchSponsorBackgroundRuntime(source);
    }
    source = source.replaceAll('.config.skipKeybind', '.config?.skipKeybind');
    source = rewriteSponsorStorageAccess(source, runtimeId);
    source = rewriteSponsorRuntimeAccess(source, runtimeId);
    const directAssets = rewriteSponsorDirectIconAccess(source, runtimeId);
    const rewritten = rewriteSponsorRuntimePaths(
      directAssets.source,
      sponsorPrefix,
    );
    replacementCount +=
      directAssets.replacementCount + rewritten.replacementCount;
    source =
      sponsorPath === 'runtime-adapter.js'
        ? rewritten.source
        : rewriteSponsorAssetAccess(rewritten.source, runtimeId);
    await writeFile(path, source);
  }

  for (const path of await filesRecursively(sponsorRoot)) {
    if (!path.endsWith('.html')) continue;
    const sponsorPath = relative(sponsorRoot, path);
    const adapterPath = sponsorAdapterPath(sponsorPath);
    if (!adapterPath) continue;
    const source = await readFile(path, 'utf8');
    await writeFile(
      path,
      injectSponsorStorageAdapter(
        source,
        adapterPath,
        sponsorPath === 'popup.html',
      ),
    );
  }

  if (replacementCount === 0) {
    throw new Error(
      'SponsorBlock vendor assets did not contain runtime paths.',
    );
  }

  const unresolved = [];
  for (const path of javaScriptFiles) {
    const source = await readFile(path, 'utf8');
    for (const candidate of [
      '"./js/',
      '"/help/',
      '"help/',
      '"/icons/',
      '"icons/',
      '"options/',
      '"permissions/',
      '"res/',
      '"libs/',
      '"content.css"',
      '"popup.css"',
      '"popup.html"',
      '"shared.css"',
    ]) {
      if (source.includes(candidate)) {
        unresolved.push(`${relative(sponsorRoot, path)}:${candidate}`);
      }
    }
  }
  if (unresolved.length > 0) {
    throw new Error(
      `SponsorBlock vendor paths were not migrated: ${unresolved.join(', ')}`,
    );
  }
  for (const path of javaScriptFiles) {
    const sponsorPath = relative(sponsorRoot, path);
    if (sponsorPath === 'runtime-adapter.js') continue;
    const source = await readFile(path, 'utf8');
    if (
      source.includes(SPONSOR_STORAGE_LOCAL) ||
      source.includes(SPONSOR_STORAGE_SYNC) ||
      source.includes(SPONSOR_STORAGE_CHANGED)
    ) {
      throw new Error(
        `SponsorBlock storage access was not bridged: ${relative(sponsorRoot, path)}`,
      );
    }
    const unresolvedRuntimeAccess = [
      ...SPONSOR_RUNTIME_SCOPED_MEMBERS.flatMap((member) => [
        `chrome.runtime.${member}`,
        `browser.runtime.${member}`,
      ]),
      ...SPONSOR_RUNTIME_SCOPED_PROPERTIES.flatMap((property) => [
        `chrome.runtime.${property}`,
        `browser.runtime.${property}`,
      ]),
      ...SPONSOR_TABS_SCOPED_MEMBERS.flatMap((member) => [
        `chrome.tabs.${member}`,
        `browser.tabs.${member}`,
      ]),
    ].filter((candidate) => source.includes(candidate));
    if (unresolvedRuntimeAccess.length > 0) {
      throw new Error(
        `SponsorBlock runtime access was not scoped in ${sponsorPath}: ${unresolvedRuntimeAccess.join(', ')}`,
      );
    }
    if (
      sponsorPath !== 'runtime-adapter.js' &&
      SPONSOR_RUNTIME_GET_URLS.some((getUrl) => source.includes(getUrl))
    ) {
      throw new Error(
        `SponsorBlock asset access was not bridged: ${sponsorPath}`,
      );
    }
  }
}

function prefixedMessages(messages, prefix) {
  return Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [`${prefix}${key}`, value]),
  );
}

export async function prepareSponsorLocales(output, vendors) {
  const messages = {};
  for (const vendor of vendors) {
    const localeRoot = resolve(vendor.root, '_locales');
    const localeEntries = await readdir(localeRoot, { withFileTypes: true });
    const locales = [];
    for (const entry of localeEntries) {
      if (!entry.isDirectory()) continue;
      const messagesPath = resolve(localeRoot, entry.name, 'messages.json');
      try {
        await readFile(messagesPath, 'utf8');
        locales.push(entry.name);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    locales.sort();
    if (locales.length !== 1 || locales[0] !== CARD_MASTER_LOCALE) {
      throw new Error(
        `SponsorBlock runtime locales must contain only ${CARD_MASTER_LOCALE}: ${vendor.root} contains ${locales.join(', ') || 'none'}.`,
      );
    }
    const messagesPath = resolve(
      localeRoot,
      CARD_MASTER_LOCALE,
      'messages.json',
    );
    Object.assign(
      messages,
      prefixedMessages(
        JSON.parse(await readFile(messagesPath, 'utf8')),
        vendor.prefix,
      ),
    );
  }
  const localeOutput = resolve(output, CARD_MASTER_LOCALE);
  await mkdir(localeOutput, { recursive: true });
  await writeFile(
    resolve(localeOutput, 'messages.json'),
    JSON.stringify(messages),
  );
}
