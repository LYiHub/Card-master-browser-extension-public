import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  composeSponsorBackground,
  injectSponsorStorageAdapter,
  patchPakkuContentRuntime,
  patchSponsorBackgroundRuntime,
  patchSponsorContentRuntime,
  patchSponsorDocumentRuntime,
  patchYouTubeSponsorContentRuntime,
  patchYouTubeSponsorDocumentRuntime,
  prepareSponsorLocales,
  rewriteSponsorAssetAccess,
  rewriteSponsorDirectIconAccess,
  rewriteSponsorRuntimeAccess,
  rewriteSponsorRuntimePaths,
  rewriteSponsorStorageAccess,
} from './bilibili-vendor.mjs';

const sponsorRoot = resolve('vendor/bilibili/sponsor/js');
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Bilibili vendor integration', () => {
  it('disables the CSP-sensitive inline injector and guards missing shadow roots', async () => {
    const source = await readFile(resolve(sponsorRoot, 'content.js'), 'utf8');
    const patched = patchSponsorContentRuntime(source);

    expect(patched).toContain('t.injectScript=function(){}');
    expect(patched).not.toContain(
      't.id="sponsorblock-document-script",t.innerHTML=e',
    );
    expect(patched).toContain(
      'n&&(n.appendChild(Object.assign(document.createElement("link")',
    );
    expect(patched).toContain(
      'c.PageType.Channel===(0,l.getPageType)()&&!/^\\/\\d+\\/dynamic',
    );
    expect(patched).toContain('o.addedNodes[0]instanceof Element');
    expect(patched).not.toContain(
      'const e=o.addedNodes[0].querySelector(".bili-dyn-item"),t=e.__vue__;',
    );
    expect(patched).toContain(
      '"space.bilibili.com"===window.location.hostname&&/^\\/\\d+\\/dynamic',
    );
    expect(patched).not.toContain('等待查找category tooltip 挂载点时超时');
    expect(patched).toContain(
      'queueMicrotask(()=>o("fallback: readyState already complete"))',
    );
    expect(patched).not.toContain(
      'fallback: readyState already complete after 30000ms',
    );
  });

  it('scopes YouTube content and cleans every attached listener', async () => {
    const source = await readFile(
      resolve('vendor/youtube/sponsor/js/content.js'),
      'utf8',
    );
    const patched = patchYouTubeSponsorContentRuntime(source);

    expect(patched).toContain(
      'try{e=yield(0,u.waitFor)(()=>(0,c.getYouTubeTitleNode)())}catch{return}',
    );
    expect(patched).not.toContain(
      'let e=yield(0,u.waitFor)(()=>(0,c.getYouTubeTitleNode)());',
    );
    expect(patched).toContain(
      'if(window.top!==window&&!/^\\/embed\\//.test(window.location.pathname))return',
    );
    expect(patched).toContain('document.removeEventListener("keydown",Ot,!0)');
    expect(patched).toContain('e.removeEventListener("emptied",d)');
    expect(patched).not.toContain('$e&&(0,O.addCleanupListener)(');
    expect(patched).toContain(
      'l.set(e,[t,i,...("YT-LOCKUP-VIEW-MODEL"===e.tagName',
    );
    expect(patched).toContain('let cardMasterMobileObserver=null');
  });

  it('bounds YouTube initial-data polling and skips internal frames', async () => {
    const source = await readFile(
      resolve('vendor/youtube/sponsor/js/document.js'),
      'utf8',
    );
    const patched = patchYouTubeSponsorDocumentRuntime(source);

    expect(patched).toContain('if(window.top!==window&&!/^\\/embed\\//');
    expect(patched).toContain('>=100&&clearInterval(t)},50)');
    expect(patched).not.toContain('clearInterval(e))},1)');
  });

  it('ignores non-element dynamic mutations instead of dereferencing them', async () => {
    const source = await readFile(resolve(sponsorRoot, 'document.js'), 'utf8');
    const patched = patchSponsorDocumentRuntime(source);

    expect(patched).toContain('o.addedNodes[0]instanceof Element');
    expect(patched).not.toContain(
      'const e=o.addedNodes[0].querySelector(".bili-dyn-item"),t=e.__vue__;',
    );
    expect(patched).toContain(
      '"space.bilibili.com"===window.location.hostname&&/^\\/\\d+\\/dynamic',
    );
    expect(patched).not.toContain(
      'window.location.href.includes("space.bilibili.com")',
    );
  });

  it('stops the stale pakku startup request after extension reload', async () => {
    const source = await readFile(
      resolve('vendor/bilibili/pakku/generated/content_script.js'),
      'utf8',
    );
    const patched = patchPakkuContentRuntime(source);

    expect(patched).toContain(
      'get_local_config().catch(e=>{if(!/Extension context invalidated/',
    );
    expect(patched).not.toContain(
      'get_local_config(),chrome.runtime.onMessage.addListener',
    );
    expect(patched).toContain('function pakku_storage()');
    expect(patched).not.toContain(
      'let k=j?chrome.storage.session:chrome.storage.local',
    );
    expect(patched.startsWith('(()=>{\n')).toBe(true);
    expect(patched.endsWith('\n})();\n')).toBe(true);
  });

  it('keeps install identity setup without opening the upstream help page', async () => {
    const source = await readFile(
      resolve(sponsorRoot, 'background.js'),
      'utf8',
    );
    const patched = patchSponsorBackgroundRuntime(source);

    expect(patched).not.toContain('chrome.runtime.getURL("/help/index.html")');
    expect(patched).toContain('generateUserID');
    expect(patched).toContain('alreadyInstalled');
    expect(patched).toContain('chrome.runtime.getURL("help/index.html")');
  });

  it('rebases both relative and root-relative SponsorBlock assets', () => {
    const rewritten = rewriteSponsorRuntimePaths(
      'chrome.runtime.getURL("icons/a.svg");chrome.runtime.getURL("/icons/b.svg")',
    );

    expect(rewritten.source).toContain(
      'chrome.runtime.getURL("vendor/bilibili/sponsor/icons/a.svg")',
    );
    expect(rewritten.source).toContain(
      'chrome.runtime.getURL("vendor/bilibili/sponsor/icons/b.svg")',
    );
  });

  it('routes static and dynamic SponsorBlock resources through one resolver', () => {
    const rewritten = rewriteSponsorAssetAccess(
      'chrome.runtime.getURL("icons/close.png");browser.runtime.getURL(value)',
    );

    expect(rewritten).toBe(
      'globalThis.__cardMasterSponsorRuntimes.bilibili.runtime.getURL("icons/close.png");globalThis.__cardMasterSponsorRuntimes.bilibili.runtime.getURL(value)',
    );
  });

  it('routes popup image literals without nesting existing runtime resolvers', () => {
    const source = [
      'render({src:"/icons/import.svg"});',
      'render({src:"icons/close.png"});',
      'chrome.runtime.getURL("icons/thumbs_up.svg");',
    ].join('');
    const directAssets = rewriteSponsorDirectIconAccess(source);
    const rebased = rewriteSponsorRuntimePaths(directAssets.source);
    const rewritten = rewriteSponsorAssetAccess(rebased.source);

    expect(directAssets.replacementCount).toBe(2);
    expect(rewritten).toContain(
      'globalThis.__cardMasterSponsorRuntimes.bilibili.runtime.getURL("vendor/bilibili/sponsor/icons/import.svg")',
    );
    expect(rewritten).toContain(
      'globalThis.__cardMasterSponsorRuntimes.bilibili.runtime.getURL("vendor/bilibili/sponsor/icons/close.png")',
    );
    expect(rewritten).toContain(
      'globalThis.__cardMasterSponsorRuntimes.bilibili.runtime.getURL("vendor/bilibili/sponsor/icons/thumbs_up.svg")',
    );
    expect(rewritten).not.toContain(
      'getURL(globalThis.__cardMasterSponsorRuntimes.bilibili.runtime.getURL',
    );
  });

  it('routes every SponsorBlock local-storage call through the project bridge', () => {
    const rewritten = rewriteSponsorStorageAccess(
      'chrome.storage.local.get(null);chrome.storage.onChanged.addListener(fn)',
    );

    expect(rewritten).toBe(
      'globalThis.__cardMasterSponsorRuntimes.bilibili.storage.local.get(null);globalThis.__cardMasterSponsorRuntimes.bilibili.storage.onChanged.addListener(fn)',
    );
  });

  it('scopes background and popup messages sent directly to tabs', () => {
    expect(
      rewriteSponsorRuntimeAccess(
        'chrome.runtime.sendMessage(message);chrome.tabs.sendMessage(tabId,message)',
        'youtube',
      ),
    ).toBe(
      'globalThis.__cardMasterSponsorRuntimes.youtube.runtime.sendMessage(message);globalThis.__cardMasterSponsorRuntimes.youtube.runtime.sendTabMessage(tabId,message)',
    );
  });

  it('scopes runtime identity and manifest reads used by cleanup logic', () => {
    expect(
      rewriteSponsorRuntimeAccess(
        'chrome.runtime.id;chrome.runtime.getManifest();chrome.runtime.lastError',
        'youtube',
      ),
    ).toBe(
      'globalThis.__cardMasterSponsorRuntimes.youtube.runtime.id;globalThis.__cardMasterSponsorRuntimes.youtube.runtime.getManifest();globalThis.__cardMasterSponsorRuntimes.youtube.runtime.lastError',
    );
  });

  it('installs the storage bridge before the bundled background runtime', () => {
    const composed = composeSponsorBackground(
      'platform-background',
      'storage-adapter',
      'sponsor-background',
    );

    expect(composed.indexOf('platform-background')).toBeLessThan(
      composed.indexOf('storage-adapter'),
    );
    expect(composed.indexOf('storage-adapter')).toBeLessThan(
      composed.indexOf('sponsor-background'),
    );
  });

  it('loads the storage bridge before popup code and removes its duplicate global toggle', () => {
    const rewritten = injectSponsorStorageAdapter(
      '<html><head></head><body></body></html>',
      'runtime-adapter.js',
      true,
    );

    expect(rewritten).toContain('<script src="runtime-adapter.js"></script>');
    expect(rewritten).toContain(
      '.toggleSwitchContainer{display:none!important}',
    );
    expect(rewritten.indexOf('runtime-adapter.js')).toBeLessThan(
      rewritten.indexOf('</head>'),
    );
  });

  it('loads the storage bridge before existing head scripts', () => {
    const rewritten = injectSponsorStorageAdapter(
      '<html><head><script src="../js/options.js"></script></head><body></body></html>',
      '../runtime-adapter.js',
    );

    expect(rewritten.indexOf('../runtime-adapter.js')).toBeLessThan(
      rewritten.indexOf('../js/options.js'),
    );
  });

  it('merges the two zh_CN vendor locales under independent prefixes', async () => {
    const root = await mkdtemp(
      resolve(tmpdir(), 'card-master-sponsor-locales-'),
    );
    temporaryDirectories.push(root);
    const bilibili = resolve(root, 'bilibili');
    const youtube = resolve(root, 'youtube');
    const output = resolve(root, 'output');
    await Promise.all([
      mkdir(resolve(bilibili, '_locales', 'zh_CN'), { recursive: true }),
      mkdir(resolve(youtube, '_locales', 'zh_CN'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        resolve(bilibili, '_locales', 'zh_CN', 'messages.json'),
        JSON.stringify({ Loading: { message: '哔哩哔哩加载中' } }),
      ),
      writeFile(
        resolve(youtube, '_locales', 'zh_CN', 'messages.json'),
        JSON.stringify({ Loading: { message: 'YouTube 加载中' } }),
      ),
    ]);

    await prepareSponsorLocales(output, [
      { root: bilibili, prefix: 'sponsor_bilibili_' },
      { root: youtube, prefix: 'sponsor_youtube_' },
    ]);

    expect(
      JSON.parse(
        await readFile(resolve(output, 'zh_CN', 'messages.json'), 'utf8'),
      ),
    ).toEqual({
      sponsor_bilibili_Loading: { message: '哔哩哔哩加载中' },
      sponsor_youtube_Loading: { message: 'YouTube 加载中' },
    });
  });
});
