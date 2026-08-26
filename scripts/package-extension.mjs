import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { copyWar } from '@adguard/tswebextension/cli';
import react from '@vitejs/plugin-react';
import { parse } from 'acorn';
import { transform as transformJavaScript } from 'esbuild';
import { build } from 'vite';

import {
  composeSponsorBackground,
  patchPakkuContentRuntime,
  prepareSponsorLocales,
  prepareSponsorVendorAssets,
  replaceRequired,
} from './bilibili-vendor.mjs';
import {
  composeCatCatchBackground,
  mergeCatCatchLocale,
  prepareCatCatchRuntime,
} from './cat-catch-vendor.mjs';
import {
  extensionRuntimeAssets,
  extensionRuntimeAssetsFor,
} from './extension-runtime-assets.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const projectMetadata = JSON.parse(
  await readFile(resolve(root, 'package.json'), 'utf8'),
);
const extensionTarget = process.env.EXTENSION_TARGET;
if (!['chromium', 'firefox', 'safari'].includes(extensionTarget)) {
  throw new Error(
    'EXTENSION_TARGET must be one of: chromium, firefox, safari.',
  );
}
const output = resolve(
  root,
  process.env.EXTENSION_OUTPUT_ROOT?.trim() || 'extension-dist',
  extensionTarget,
);
const assets = resolve(root, 'assets');
const catCatchRoot = resolve(root, 'vendor/cat-catch');
const buildConstants = {
  chromium: {
    __CHROMIUM_MV2__: 'false',
    __CHROMIUM_MV3__: 'true',
    __FIREFOX_MV2__: 'false',
  },
  firefox: {
    __CHROMIUM_MV2__: 'false',
    __CHROMIUM_MV3__: 'false',
    __FIREFOX_MV2__: 'false',
  },
  safari: {
    __CHROMIUM_MV2__: 'false',
    __CHROMIUM_MV3__: 'false',
    __FIREFOX_MV2__: 'false',
  },
}[extensionTarget];
const dnrPackageEntry = fileURLToPath(
  import.meta.resolve('@adguard/dnr-rulesets'),
);
const dnrPackageDist = resolve(dirname(dnrPackageEntry), '..');
const dnrFiltersDist = resolve(dnrPackageDist, 'filters', 'chromium-mv3');
const contentBlockingFilterCatalog = JSON.parse(
  await readFile(
    resolve(root, 'src/content-blocking/domain/filter-catalog.json'),
    'utf8',
  ),
);
const contentBlockingRuleSetIds = [
  0,
  ...contentBlockingFilterCatalog.map((filter) => filter.filterId),
];
const adguardLocalScriptRulesId = 'virtual:adguard-local-script-rules';
const adguardLocalScriptRules = resolve(
  dnrFiltersDist,
  'local_script_rules.js',
);
const adguardLocalScriptRulesJson = resolve(
  dnrFiltersDist,
  'local_script_rules.json',
);
const adguardFirefoxEngine = resolve(
  root,
  'src/content-blocking/infrastructure/adguard-firefox-engine.ts',
);
const safariXcodeProject = resolve(
  root,
  'safari/Card Master/Card Master.xcodeproj/project.pbxproj',
);
const adguardMv2ContentScript = fileURLToPath(
  import.meta.resolve('@adguard/tswebextension/content-script'),
);
const chromiumSpeechBundleNames = [
  'assistant-speech-worklet.js',
  'microphone-permission.js',
  'offscreen-audio.js',
];
const browserBundleNames = [
  'content.js',
  'adguard-content.js',
  'adguard-runtime.js',
  'adguard-cosmetic-runtime.js',
  'adguard-gpc.js',
  'adguard-hide-document-referrer.js',
  'safari-main-world-bootstrap.js',
  'safari-userscript-runtime.js',
  'theme-proxy.js',
  'theme-content.js',
  'theme-runtime.js',
  'bilibili-recommendation-proxy.js',
  'bilibili-capability-content.js',
  'gamepad-content.js',
  'gamepad-control-content.js',
  'media-speed-proxy.js',
  'media-speed-content.js',
  'install.js',
  'library.js',
  'assistant-surface.js',
  ...(extensionTarget === 'safari'
    ? []
    : ['new-tab-entry.js', 'new-tab-settings.js']),
  ...(extensionTarget === 'chromium' ? chromiumSpeechBundleNames : []),
  'background.js',
];
const packageBudgetBytes = {
  chromium: 100_000_000,
  firefox: 93_000_000,
  safari: 100_000_000,
}[extensionTarget];
const formatMegabytes = (bytes) => `${(bytes / 1_000_000).toFixed(2)} MB`;
const browserNoBuffer = resolve(
  root,
  'src/hosts/extension/browser-no-buffer.ts',
);

async function validateLumnoRuntime() {
  const vendorRoot = resolve(output, 'vendor/lumno');
  const runtimeRoot = output;
  const exactRuntimeFiles = new Map([
    [
      'src/newtab/newtab.html',
      'c8599f755abf55f8da41efb771af5cd9eab1eae8ab48e49cf17c6f210b4c8fa0',
    ],
    [
      'src/newtab/newtab.js',
      '823bd4b59d32bbb509494ca8029b6db3b5389f3b598dbfdd20e18509f02e23b9',
    ],
    [
      'src/newtab/wallpaper.js',
      '34cde922588991fe5c7b2b7db88a28c707ace6a0391f342520e96bf4fb355c60',
    ],
    [
      'src/react/newtab-islands.js',
      'c6f9bada864d68bff600a6045cd4b7c8092ba633e032af66c07011fd389fa553',
    ],
    [
      'src/react/react-runtime.js',
      '5d6f86453f4ef3321ba65ea64640fabe723ae50d37ba611bf743033a5c6af034',
    ],
    [
      'src/react/react-shared.js',
      'd7318ef7b02e25e22fb6d0b1e8b550fa51cb84f8c456f16fd9b85f8ca85e151f',
    ],
    [
      'src/shared/favicon-utils.js',
      'c6f7cabf146779d2450cc148ddbff5826694b776d22ab7ad8a1f759f8b445dfa',
    ],
    [
      'src/shared/url-guards.js',
      '3ef02aaa1a6912088698cad417b96aa9390f307da203667efa19e2fe5c1520d0',
    ],
  ]);
  for (const [relativePath, expectedSha256] of exactRuntimeFiles) {
    const contents = await readFile(resolve(runtimeRoot, relativePath));
    const actualSha256 = createHash('sha256').update(contents).digest('hex');
    if (actualSha256 !== expectedSha256) {
      throw new Error(`Lumno runtime integrity failed: ${relativePath}`);
    }
  }
  const inventory = JSON.parse(
    await readFile(resolve(vendorRoot, 'WALLPAPERS.json'), 'utf8'),
  );
  const expectedFiles = inventory.files.map((entry) => entry.file).sort();
  const actualFiles = (
    await readdir(resolve(vendorRoot, 'wallpapers'), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('Lumno wallpaper runtime inventory does not match.');
  }
  if (await stat(resolve(runtimeRoot, 'assets/wallpapers')).catch(() => null)) {
    throw new Error('Legacy Lumno wallpaper copies must not be packaged.');
  }
  let totalBytes = 0;
  for (const entry of inventory.files) {
    const contents = await readFile(
      resolve(vendorRoot, 'wallpapers', entry.file),
    );
    const sha256 = createHash('sha256').update(contents).digest('hex');
    if (contents.length !== entry.bytes || sha256 !== entry.sha256) {
      throw new Error(`Lumno wallpaper integrity failed: ${entry.file}`);
    }
    totalBytes += contents.length;
  }
  if (
    actualFiles.length !== inventory.fileCount ||
    totalBytes !== inventory.totalBytes
  ) {
    throw new Error('Lumno wallpaper aggregate inventory does not match.');
  }
  const license = await stat(resolve(vendorRoot, 'LICENSE')).catch(() => null);
  if (!license?.isFile()) throw new Error('Lumno license was not packaged.');
}

async function mergeLumnoLocale() {
  const localePath = resolve(output, '_locales/zh_CN/messages.json');
  const currentMessages = JSON.parse(await readFile(localePath, 'utf8'));
  const lumnoMessages = JSON.parse(
    await readFile(
      resolve(root, 'vendor/lumno/runtime/_locales/zh_CN/messages.json'),
      'utf8',
    ),
  );
  await writeFile(
    localePath,
    JSON.stringify({
      ...currentMessages,
      ...lumnoMessages,
    }),
  );
}

async function validateSingleLocaleRoot(localeRoot) {
  const locales = [];
  for (const entry of await readdir(localeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const messages = await stat(
      resolve(localeRoot, entry.name, 'messages.json'),
    ).catch(() => null);
    if (messages?.isFile()) locales.push(entry.name);
  }
  if (locales.length !== 1 || locales[0] !== 'zh_CN') {
    throw new Error(
      `Extension runtime locales must contain only zh_CN: ${relative(output, localeRoot)} contains ${locales.join(', ') || 'none'}.`,
    );
  }
}
const darkReaderPlusStub = resolve(
  root,
  'src/hosts/extension/darkreader-plus-stub.ts',
);
const adguardLocalScriptRulesPlugin = {
  name: 'adguard-local-script-rules',
  resolveId(source) {
    if (source !== adguardLocalScriptRulesId) return null;
    if (extensionTarget === 'safari') {
      return `\0${adguardLocalScriptRulesId}`;
    }
    return {
      id: './filters/local_script_rules.js',
      external: true,
    };
  },
  async load(id) {
    if (id !== `\0${adguardLocalScriptRulesId}`) return null;
    return readFile(adguardLocalScriptRules, 'utf8');
  },
};
const adguardBrowserApiAdapterPlugin = {
  name: 'adguard-browser-api-adapter',
  transform(source, id) {
    const isMv3Engine = id.endsWith(
      '/@adguard/tswebextension/dist/index.mv3.js',
    );
    const isFirefoxWebRequestEngine =
      extensionTarget === 'firefox' &&
      id.endsWith('/@adguard/tswebextension/dist/index.js');
    if (!isMv3Engine && !isFirefoxWebRequestEngine) return null;
    const replacements = isMv3Engine
      ? [
          {
            source: 'chrome.scripting.insertCSS(',
            target: 'globalThis.__cardMasterAdguardBrowserApi.insertCSS(',
            count: 1,
          },
          {
            source: 'browser.declarativeNetRequest.getDisabledRuleIds(',
            target:
              'globalThis.__cardMasterAdguardBrowserApi.getDisabledRuleIds(',
            count: 2,
          },
          {
            source: 'chrome.webNavigation.getAllFrames(',
            target: 'globalThis.__cardMasterAdguardBrowserApi.getAllFrames(',
            count: 1,
          },
          {
            source: 'browser.webRequest.handlerBehaviorChanged()',
            target:
              'globalThis.__cardMasterAdguardBrowserApi.handlerBehaviorChanged()',
            count: 1,
          },
          {
            source: 'browser.declarativeNetRequest.updateDynamicRules(',
            target:
              'globalThis.__cardMasterAdguardBrowserApi.updateDynamicRules(',
            count: 2,
          },
          {
            source: 'chrome.declarativeNetRequest.updateSessionRules(',
            target:
              'globalThis.__cardMasterAdguardBrowserApi.updateSessionRules(',
            count: 4,
          },
          {
            source:
              'class RemoveParamInjectionService extends AbstractRemoveParamInjectionService {',
            target:
              "const cardMasterExpectedAdguardScriptInjectionFailure = (error) => {\n    const message = error instanceof Error ? error.message : String(error);\n    return message === 'Blocked'\n        || /(?:Extension context invalidated|No tab with id|Invalid tab ID|No frame with id|Frame with ID .* (?:was removed|is showing error page)|The frame was removed|The tab was closed)/i.test(message);\n};\nclass RemoveParamInjectionService extends AbstractRemoveParamInjectionService {",
            count: 1,
          },
          {
            source:
              "logger.error('[tsweb.RemoveParamInjectionService.executeInjection]: failed to inject removeparam script:', e);",
            target:
              "if (!cardMasterExpectedAdguardScriptInjectionFailure(e)) {\n                logger.error('[tsweb.RemoveParamInjectionService.executeInjection]: failed to inject removeparam script:', e);\n            }",
            count: 1,
          },
          {
            source:
              "logger.error('[tsweb.RemoveParamInjectionService.executeUpdate]: failed to send descriptor update:', e);",
            target:
              "if (!cardMasterExpectedAdguardScriptInjectionFailure(e)) {\n                logger.error('[tsweb.RemoveParamInjectionService.executeUpdate]: failed to send descriptor update:', e);\n            }",
            count: 1,
          },
          {
            source: 'browser.declarativeNetRequest.updateStaticRules(',
            target:
              'globalThis.__cardMasterAdguardBrowserApi.updateStaticRules(',
            count: 2,
          },
        ]
      : [];
    let transformed = source;
    for (const replacement of replacements) {
      const matches = transformed.split(replacement.source).length - 1;
      if (matches !== replacement.count) {
        throw new Error(
          `AdGuard browser API adapter expected ${replacement.count} occurrences of ${replacement.source}, found ${matches}.`,
        );
      }
      transformed = transformed.replaceAll(
        replacement.source,
        replacement.target,
      );
    }
    if (
      (extensionTarget === 'firefox' || extensionTarget === 'safari') &&
      isMv3Engine
    ) {
      const portableReplacements = [
        {
          source:
            'event.addListener(handleBrowserEvent, filter, extraInfoSpec);',
          target:
            "if (typeof extraInfoSpec === 'undefined') {\n            event.addListener(handleBrowserEvent, filter);\n            return;\n        }\n        event.addListener(handleBrowserEvent, filter, extraInfoSpec);",
          count: 1,
        },
        {
          source:
            'try {\n            await browser.declarativeNetRequest.updateEnabledRulesets({\n                enableRulesetIds,\n                disableRulesetIds,\n            });',
          target:
            'try {\n            const enabledRulesetIds = new Set(await browser.declarativeNetRequest.getEnabledRulesets());\n            const pendingEnableRulesetIds = enableRulesetIds.filter((id) => !enabledRulesetIds.has(id));\n            const pendingDisableRulesetIds = disableRulesetIds.filter((id) => enabledRulesetIds.has(id));\n            if (pendingEnableRulesetIds.length === 0 && pendingDisableRulesetIds.length === 0) {\n                return res;\n            }\n            await browser.declarativeNetRequest.updateEnabledRulesets({\n                enableRulesetIds: pendingEnableRulesetIds,\n                disableRulesetIds: pendingDisableRulesetIds,\n            });',
          count: 1,
        },
        {
          source:
            "const onResponseStartedOptions = ['responseHeaders', 'extraHeaders'];",
          target: "const onResponseStartedOptions = ['responseHeaders'];",
          count: 1,
        },
        {
          source:
            "typeof onHeadersReceivedOptionTypes !== 'undefined'\n            && Object.prototype.hasOwnProperty.call(onBeforeSendHeadersOptionTypes, 'EXTRA_HEADERS')",
          target:
            "typeof onHeadersReceivedOptionTypes !== 'undefined'\n            && Object.prototype.hasOwnProperty.call(onHeadersReceivedOptionTypes, 'EXTRA_HEADERS')",
          count: 1,
        },
        {
          source:
            'static async addCspReportBlockingRule() {\n        const rule = {',
          target:
            'static async addCspReportBlockingRule() {\n        return;\n        const rule = {',
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.RuleActionType.BLOCK',
          target: "'block'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS',
          target: "'modifyHeaders'",
          count: 4,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.MAIN_FRAME',
          target: "'main_frame'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.SUB_FRAME',
          target: "'sub_frame'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.STYLESHEET',
          target: "'stylesheet'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.SCRIPT',
          target: "'script'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.IMAGE',
          target: "'image'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.FONT',
          target: "'font'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.OBJECT',
          target: "'object'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST',
          target: "'xmlhttprequest'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.PING',
          target: "'ping'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.CSP_REPORT',
          target: "'csp_report'",
          count: 2,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.MEDIA',
          target: "'media'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.WEBSOCKET',
          target: "'websocket'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.ResourceType.OTHER',
          target: "'other'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.DomainType.THIRD_PARTY',
          target: "'thirdParty'",
          count: 1,
        },
        {
          source: 'chrome.declarativeNetRequest.HeaderOperation.REMOVE',
          target: "'remove'",
          count: 3,
        },
        {
          source: 'chrome.declarativeNetRequest.HeaderOperation.SET',
          target: "'set'",
          count: 2,
        },
        {
          source: 'chrome.declarativeNetRequest.SESSION_RULESET_ID',
          target: "'_session'",
          count: 3,
        },
        {
          source:
            'return chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_SESSION_RULES;',
          target:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_SESSION_RULES ?? 5_000;',
          count: 1,
        },
        {
          source:
            'return chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES;',
          target:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES ?? 5_000;',
          count: 1,
        },
        {
          source:
            'chrome.privacy.IPHandlingPolicy.DEFAULT_PUBLIC_INTERFACE_ONLY',
          target: "'default_public_interface_only'",
          count: 1,
        },
      ];
      for (const replacement of portableReplacements) {
        const matches = transformed.split(replacement.source).length - 1;
        if (matches !== replacement.count) {
          throw new Error(
            `${extensionTarget} AdGuard adapter expected ${replacement.count} occurrences of ${replacement.source}, found ${matches}.`,
          );
        }
        transformed = transformed.replaceAll(
          replacement.source,
          replacement.target,
        );
      }
    }
    if (extensionTarget === 'safari' && isMv3Engine) {
      const safariReplacements = [
        {
          source: 'removeParamInjectionService.start();',
          target: 'void removeParamInjectionService;',
          count: 1,
        },
        {
          source: 'removeParamInjectionService.stop();',
          target: 'void removeParamInjectionService;',
          count: 1,
        },
        {
          source:
            'removeParamInjectionService.injectRemoveParam(tabId, frameId, details.url);',
          target: 'void removeParamInjectionService;',
          count: 1,
        },
        {
          source: 'removeParamInjectionService.invalidateTab(tabId);',
          target: 'void removeParamInjectionService;',
          count: 1,
        },
        {
          source: '        const enabled = stealthModeEnabled;',
          target:
            '        const enabled = stealthModeEnabled;\n        if (!enabled) {\n            return {\n                hideReferrer: false,\n                blockWebRTC: false,\n                blockChromeClientData: false,\n                sendDoNotTrack: false,\n                hideSearchQueries: false,\n            };\n        }',
          count: 1,
        },
        {
          source:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES;',
          target:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES ?? browser.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES ?? 5_000;',
          count: 2,
        },
        {
          source:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_SESSION_RULES;',
          target:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES ?? 5_000;',
          count: 1,
        },
        {
          source:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES;',
          target:
            'return browser.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES ?? 5_000;',
          count: 1,
        },
      ];
      for (const replacement of safariReplacements) {
        const matches = transformed.split(replacement.source).length - 1;
        if (matches !== replacement.count) {
          throw new Error(
            `Safari AdGuard adapter expected ${replacement.count} occurrences of ${replacement.source}, found ${matches}.`,
          );
        }
        transformed = transformed.replaceAll(
          replacement.source,
          replacement.target,
        );
      }
    }
    if (isFirefoxWebRequestEngine) {
      const firefoxWebRequestReplacements = [
        {
          source: 'class TsWebExtension {',
          target:
            "const cardMasterAdguardFirefoxPhase = async (phase, operation) => {\n    const startedAt = Date.now();\n    try {\n        return await operation();\n    }\n    catch (error) {\n        const message = error instanceof Error ? error.message : String(error);\n        console.error('[Card Master][adguard-firefox-startup] ' + phase + ':failed', { elapsedMs: Date.now() - startedAt, error });\n        throw new Error('Firefox AdGuard 启动阶段“' + phase + '”失败：' + message, { cause: error });\n    }\n};\nclass TsWebExtension {",
          count: 1,
        },
        {
          source: 'RequestEvents.init();',
          target:
            "await cardMasterAdguardFirefoxPhase('webRequest 监听器注册', async () => RequestEvents.init());",
          count: 1,
        },
        {
          source: 'await this.redirectsService.start();',
          target:
            "await cardMasterAdguardFirefoxPhase('重定向资源初始化', () => this.redirectsService.start());",
          count: 1,
        },
        {
          source: 'await this.engineApi.startEngine(configuration);',
          target:
            "await cardMasterAdguardFirefoxPhase('完整过滤引擎构建', () => this.engineApi.startEngine(configuration));",
          count: 2,
        },
        {
          source: 'await this.tabCosmeticInjector.processOpenTabs();',
          target:
            "await cardMasterAdguardFirefoxPhase('现有标签页初始化', () => this.tabCosmeticInjector.processOpenTabs());",
          count: 1,
        },
        {
          source: 'await this.tabsApi.start();',
          target:
            "await cardMasterAdguardFirefoxPhase('标签页状态初始化', () => this.tabsApi.start());",
          count: 1,
        },
        {
          source: 'WebRequestApi.start();',
          target:
            "await cardMasterAdguardFirefoxPhase('过滤监听器启用', async () => WebRequestApi.start());",
          count: 1,
        },
        {
          source:
            'return browser.tabs.executeScript(tabId, { file: fileUrl });',
          target:
            'return globalThis.__cardMasterAdguardBrowserApi.executeScript(tabId, { file: fileUrl });',
          count: 1,
        },
        {
          source: 'await browser.tabs.executeScript(tabId, injectDetails);',
          target:
            'await globalThis.__cardMasterAdguardBrowserApi.executeScript(tabId, injectDetails);',
          count: 1,
        },
        {
          source: 'await browser.tabs.insertCSS(tabId, injectDetails);',
          target:
            "await globalThis.__cardMasterAdguardBrowserApi.insertCSS({ css: code, origin: 'USER', target: { tabId, frameIds: [frameId] } });",
          count: 1,
        },
        {
          source:
            "typeof onHeadersReceivedOptionTypes !== 'undefined'\n            && Object.prototype.hasOwnProperty.call(onBeforeSendHeadersOptionTypes, 'EXTRA_HEADERS')",
          target:
            "typeof onHeadersReceivedOptionTypes !== 'undefined'\n            && Object.prototype.hasOwnProperty.call(onHeadersReceivedOptionTypes, 'EXTRA_HEADERS')",
          count: 1,
        },
      ];
      for (const replacement of firefoxWebRequestReplacements) {
        const matches = transformed.split(replacement.source).length - 1;
        if (matches !== replacement.count) {
          throw new Error(
            `Firefox AdGuard webRequest adapter expected ${replacement.count} occurrences of ${replacement.source}, found ${matches}.`,
          );
        }
        transformed = transformed.replaceAll(
          replacement.source,
          replacement.target,
        );
      }
    }
    return { code: transformed, map: null };
  },
};
const adguardCookieRuntimePlugin = {
  name: 'adguard-cookie-runtime',
  transform(source, id) {
    if (
      !id.endsWith('/@adguard/tswebextension/dist/content-script.mv3.js') &&
      !id.endsWith('/@adguard/tswebextension/dist/content-script.js')
    ) {
      return null;
    }
    const cosmeticBootstrap =
      'const cosmeticController = new CosmeticController();\ncosmeticController.init();';
    const matches = source.split(cosmeticBootstrap).length - 1;
    if (matches !== 1) {
      throw new Error(
        `AdGuard cookie runtime expected one cosmetic bootstrap, found ${matches}.`,
      );
    }
    return {
      code: source.replace(cosmeticBootstrap, ''),
      map: null,
    };
  },
};
const inlineExtensionStylesPlugin = {
  name: 'inline-extension-styles',
  generateBundle(_options, outputBundle) {
    const cssFiles = Object.keys(outputBundle).filter((name) =>
      name.endsWith('.css'),
    );
    if (cssFiles.length > 0) {
      throw new Error(
        `Extension entry emitted external CSS (${cssFiles.join(', ')}). Closed Shadow Root styles must be imported with ?inline and injected by their host.`,
      );
    }
  },
};

function encodeJavaScriptAsAscii(source) {
  let encoded = '';
  for (const character of source) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x7f) {
      encoded += character;
      continue;
    }
    if (codePoint <= 0xffff) {
      encoded += `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
      continue;
    }
    const astral = codePoint - 0x10000;
    const highSurrogate = 0xd800 + (astral >> 10);
    const lowSurrogate = 0xdc00 + (astral & 0x3ff);
    encoded += `\\u${highSurrogate.toString(16).toUpperCase()}\\u${lowSurrogate.toString(16).toUpperCase()}`;
  }
  return encoded;
}

async function bundle({
  input,
  entryFileNames,
  format,
  chunkSizeWarningLimit = 650,
  omitNodeBuffer = false,
  define = {},
}) {
  const safariClassicBackground =
    extensionTarget === 'safari' && entryFileNames === 'background.js';
  const outputFormat = safariClassicBackground ? 'iife' : format;
  await build({
    configFile: false,
    publicDir: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      __EXTENSION_TARGET__: JSON.stringify(extensionTarget),
      __EXTENSION_BUILD_TARGET_MARKER__: JSON.stringify(
        `card-master-build-target:${extensionTarget}`,
      ),
      ...buildConstants,
      __THUNDERBIRD__: 'false',
      __TEST__: 'false',
      __DEBUG__: 'false',
      __PLUS__: 'false',
      ...define,
    },
    plugins: [
      adguardBrowserApiAdapterPlugin,
      adguardLocalScriptRulesPlugin,
      ...(input.endsWith('adguard-runtime.ts')
        ? [adguardCookieRuntimePlugin]
        : []),
      inlineExtensionStylesPlugin,
      ...(input.endsWith('.tsx') ? [react()] : []),
    ],
    resolve: {
      alias: {
        '@content-blocking-engine':
          extensionTarget === 'firefox'
            ? adguardFirefoxEngine
            : resolve(
                root,
                'src/content-blocking/infrastructure/adguard-engine.ts',
              ),
        ...(extensionTarget === 'firefox'
          ? {
              '@adguard/tswebextension/mv3/content-script':
                adguardMv2ContentScript,
            }
          : {}),
        '@plus/utils/theme': darkReaderPlusStub,
        ...(omitNodeBuffer
          ? {
              buffer: browserNoBuffer,
            }
          : {}),
      },
    },
    build: {
      chunkSizeWarningLimit,
      emptyOutDir: false,
      minify: true,
      outDir: output,
      sourcemap: false,
      lib: {
        entry: resolve(root, input),
        formats: [outputFormat],
        name: 'CardMasterExtensionBundle',
      },
      rolldownOptions: {
        external: /^\/project-assets\//,
        output: {
          codeSplitting: false,
          entryFileNames,
          format: outputFormat,
        },
      },
    },
  });
}

async function runtimeAssetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) return runtimeAssetFiles(absolutePath);
      if (!entry.isFile()) return [];
      return [relative(assets, absolutePath).split('\\').join('/')];
    }),
  );
  return files.flat();
}

async function preparePakkuVendorAssets() {
  const pakkuRoot = resolve(output, 'vendor/bilibili/pakku');
  const generatedContentPath = resolve(
    pakkuRoot,
    'generated/content_script.js',
  );
  if (extensionTarget === 'firefox') {
    const firefoxContentPath = resolve(pakkuRoot, 'firefox/content_script.js');
    let source = await readFile(firefoxContentPath, 'utf8');
    source = replaceRequired(
      source,
      'chrome.runtime.getURL("/generated/combine_worker.js")',
      'chrome.runtime.getURL("/vendor/bilibili/pakku/generated/combine_worker.js")',
      'pakku Firefox worker path',
    );
    source = replaceRequired(
      source,
      'chrome.runtime.getURL("/assets/similarity-gen.wasm")',
      'chrome.runtime.getURL("/vendor/bilibili/pakku/assets/similarity-gen.wasm")',
      'pakku Firefox WASM path',
    );
    await writeFile(generatedContentPath, source);
  }
  await writeFile(
    generatedContentPath,
    patchPakkuContentRuntime(await readFile(generatedContentPath, 'utf8')),
  );
  await rm(resolve(pakkuRoot, 'firefox'), { force: true, recursive: true });
}

async function validateRuntimeAssetInventory() {
  const declared = new Set(extensionRuntimeAssets);
  const known = new Set([
    ...extensionRuntimeAssetsFor('chromium'),
    ...extensionRuntimeAssetsFor('safari'),
  ]);
  const duplicates = extensionRuntimeAssets.filter(
    (asset, index) => extensionRuntimeAssets.indexOf(asset) !== index,
  );
  const actual = new Set(await runtimeAssetFiles(assets));
  const missing = [...declared].filter((asset) => !actual.has(asset));
  const undeclared = [...actual].filter((asset) => !known.has(asset));
  if (duplicates.length > 0 || missing.length > 0 || undeclared.length > 0) {
    throw new Error(
      [
        duplicates.length > 0
          ? `Duplicate runtime assets: ${[...new Set(duplicates)].join(', ')}`
          : '',
        missing.length > 0
          ? `Missing runtime assets: ${missing.join(', ')}`
          : '',
        undeclared.length > 0
          ? `Undeclared runtime assets: ${undeclared.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

async function copyRuntimeAssets() {
  await validateRuntimeAssetInventory();
  for (const relativePath of extensionRuntimeAssets) {
    const source = resolve(assets, relativePath);
    const metadata = await stat(source).catch(() => null);
    if (!metadata?.isFile()) {
      throw new Error(`Missing extension runtime asset: ${relativePath}`);
    }
    const destination = resolve(output, 'project-assets', relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

async function validatePackagedManifestAssets() {
  const defaultExtensionIcon =
    'project-assets/userscript-deck/visual/action-icons/card-master-logo.png';
  const manifest = JSON.parse(
    await readFile(resolve(output, 'manifest.json'), 'utf8'),
  );
  if (manifest.action?.default_icon !== defaultExtensionIcon) {
    throw new Error(
      'The extension action fallback must be the Card Master logo.',
    );
  }
  if (
    !manifest.icons ||
    Object.values(manifest.icons).some(
      (iconPath) => iconPath !== defaultExtensionIcon,
    )
  ) {
    throw new Error(
      'Every extension identity icon must be the Card Master logo.',
    );
  }
  if (extensionTarget === 'safari') {
    if (manifest.chrome_url_overrides || manifest.options_ui) {
      throw new Error(
        'The Safari package must not declare a new-tab override or options page.',
      );
    }
  } else if (manifest.chrome_url_overrides?.newtab !== 'new-tab.html') {
    throw new Error('The extension new-tab override must use its router page.');
  }
  if (
    manifest.sidebar_action?.default_icon &&
    manifest.sidebar_action.default_icon !== defaultExtensionIcon
  ) {
    throw new Error(
      'The extension sidebar fallback must be the Card Master logo.',
    );
  }
  const iconDeclarations = [
    manifest.icons,
    manifest.action?.default_icon,
    manifest.sidebar_action?.default_icon,
  ].filter(Boolean);
  const iconPaths = iconDeclarations.flatMap((declaration) =>
    typeof declaration === 'string'
      ? [declaration]
      : Object.values(declaration),
  );
  for (const iconPath of new Set(iconPaths)) {
    const metadata = await stat(resolve(output, iconPath)).catch(() => null);
    if (!metadata?.isFile()) {
      throw new Error(`Manifest icon was not packaged: ${iconPath}`);
    }
  }
  const hostResources = (manifest.web_accessible_resources ?? []).flatMap(
    (entry) => entry.resources ?? [],
  );
  const resourceMatches = (pattern, path) => {
    const expression = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*');
    return new RegExp(`^${expression}$`).test(path);
  };
  for (const vendorRoot of [
    'vendor/bilibili/sponsor',
    'vendor/youtube/sponsor',
  ]) {
    const sponsorManifest = JSON.parse(
      await readFile(resolve(output, vendorRoot, 'manifest.json'), 'utf8'),
    );
    const sponsorResources = new Set(
      (sponsorManifest.web_accessible_resources ?? []).flatMap(
        (entry) => entry.resources ?? [],
      ),
    );
    for (const sponsorResource of sponsorResources) {
      const packagedPath = `${vendorRoot}/${sponsorResource}`;
      const metadata = await stat(resolve(output, packagedPath)).catch(
        () => null,
      );
      if (!metadata?.isFile()) {
        throw new Error(
          `SponsorBlock runtime asset was not packaged: ${packagedPath}`,
        );
      }
      if (
        !hostResources.some((pattern) => resourceMatches(pattern, packagedPath))
      ) {
        throw new Error(
          `SponsorBlock runtime asset is not web-accessible: ${packagedPath}`,
        );
      }
    }
  }
  return manifest;
}

function patchSafariStaticRules(rules) {
  let removed = 0;
  let modified = 0;
  const patched = [];
  for (const sourceRule of rules) {
    if (!sourceRule?.action || !sourceRule?.condition) {
      patched.push(sourceRule);
      continue;
    }
    const action = sourceRule.action;
    const condition = sourceRule.condition;
    if (
      action.type === 'modifyHeaders' ||
      Array.isArray(condition.requestHeaders) ||
      Array.isArray(condition.responseHeaders) ||
      Array.isArray(condition.topDomains) ||
      Array.isArray(condition.excludedTopDomains)
    ) {
      removed += 1;
      continue;
    }
    const rule = structuredClone(sourceRule);
    let changed = false;
    for (const key of ['resourceTypes', 'excludedResourceTypes']) {
      const values = rule.condition[key];
      if (!Array.isArray(values) || !values.includes('object')) continue;
      const supported = values.filter((value) => value !== 'object');
      if (key === 'resourceTypes' && supported.length === 0) {
        removed += 1;
        changed = false;
        break;
      }
      if (supported.length === 0) delete rule.condition[key];
      else rule.condition[key] = supported;
      changed = true;
    }
    if (
      Array.isArray(condition.resourceTypes) &&
      condition.resourceTypes.length === 1 &&
      condition.resourceTypes[0] === 'object'
    ) {
      continue;
    }
    if (changed) modified += 1;
    patched.push(rule);
  }
  return { rules: patched, removed, modified };
}

async function copyDeclarativeRuleSets() {
  const filtersOutput = resolve(output, 'filters');
  for (const ruleSetId of contentBlockingRuleSetIds) {
    const ruleSet = `ruleset_${ruleSetId}`;
    const sourcePath = resolve(
      dnrFiltersDist,
      'declarative',
      ruleSet,
      `${ruleSet}.json`,
    );
    const destinationPath = resolve(
      filtersOutput,
      'declarative',
      ruleSet,
      `${ruleSet}.json`,
    );
    await mkdir(resolve(filtersOutput, 'declarative', ruleSet), {
      recursive: true,
    });
    if (extensionTarget === 'safari') {
      const sourceRules = JSON.parse(await readFile(sourcePath, 'utf8'));
      const patched = patchSafariStaticRules(sourceRules);
      await writeFile(destinationPath, JSON.stringify(patched.rules));
      console.log(
        `Safari ${ruleSet}: removed ${patched.removed}, adjusted ${patched.modified} unsupported DNR rules.`,
      );
    } else {
      await cp(sourcePath, destinationPath);
    }
  }
}

async function copyContentBlockingAssets() {
  const filtersOutput = resolve(output, 'filters');
  await copyDeclarativeRuleSets();
  await cp(
    adguardLocalScriptRules,
    resolve(filtersOutput, 'local_script_rules.js'),
  );
  await cp(resolve(dnrPackageDist, 're2.wasm'), resolve(output, 're2.wasm'));
  await copyWar(resolve(output, 'web-accessible-resources'));
}

async function validateSafariDeclarativeRuleSets() {
  const declarativeRoot = resolve(output, 'filters', 'declarative');
  let validatedRules = 0;
  for (const ruleSetId of contentBlockingRuleSetIds) {
    const ruleSet = `ruleset_${ruleSetId}`;
    const rules = JSON.parse(
      await readFile(
        resolve(declarativeRoot, ruleSet, `${ruleSet}.json`),
        'utf8',
      ),
    );
    for (const rule of rules) {
      if (!rule?.action || !rule?.condition) continue;
      validatedRules += 1;
      const condition = rule.condition;
      const unsupported =
        rule.action.type === 'modifyHeaders' ||
        Array.isArray(condition.requestHeaders) ||
        Array.isArray(condition.responseHeaders) ||
        Array.isArray(condition.topDomains) ||
        Array.isArray(condition.excludedTopDomains) ||
        condition.resourceTypes?.includes('object') ||
        condition.excludedResourceTypes?.includes('object');
      if (unsupported) {
        throw new Error(
          `Safari ${ruleSet} still contains unsupported DNR rule ${rule.id}.`,
        );
      }
    }
  }
  if (validatedRules === 0) {
    throw new Error('Safari declarative rulesets are empty after patching.');
  }
}

async function prepareFirefoxWebRequestAssets() {
  const webRequestOutput = resolve(output, 'filters', 'webrequest');
  await rm(resolve(output, 'filters', 'declarative'), {
    force: true,
    recursive: true,
  });
  await rm(resolve(output, 'filters', 'local_script_rules.js'), {
    force: true,
  });
  await mkdir(webRequestOutput, { recursive: true });
  for (const filter of contentBlockingFilterCatalog) {
    const filterId = filter.filterId;
    const ruleSet = `ruleset_${filterId}`;
    const rules = JSON.parse(
      await readFile(
        resolve(dnrFiltersDist, 'declarative', ruleSet, `${ruleSet}.json`),
        'utf8',
      ),
    );
    const metadata = rules[0]?.metadata;
    if (
      typeof metadata?.filterContent !== 'string' ||
      !metadata.filterContent.trim()
    ) {
      throw new Error(
        `AdGuard ruleset ${ruleSet} is missing its original filter source.`,
      );
    }
    await writeFile(
      resolve(webRequestOutput, `filter_${filterId}.json`),
      JSON.stringify({
        filterId,
        content: metadata.filterContent,
      }),
    );
  }
  await cp(
    adguardLocalScriptRulesJson,
    resolve(webRequestOutput, 'local_script_rules.json'),
  );
}

async function measurePackage(directory, prefix = '') {
  let unpackedBytes = 0;
  let estimatedZipBytes = prefix ? 0 : 22;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await measurePackage(absolutePath, relativePath);
      unpackedBytes += nested.unpackedBytes;
      estimatedZipBytes += nested.estimatedZipBytes;
      continue;
    }
    if (!entry.isFile()) continue;
    const source = await readFile(absolutePath);
    const compressed = deflateRawSync(source, { level: 9 });
    const payloadSize = Math.min(source.byteLength, compressed.byteLength);
    const pathSize = Buffer.byteLength(relativePath);
    unpackedBytes += source.byteLength;
    estimatedZipBytes += 30 + pathSize + payloadSize;
    estimatedZipBytes += 46 + pathSize;
  }
  return { unpackedBytes, estimatedZipBytes };
}

const chromiumSpeechBundleEntries = [
  [
    'src/hosts/extension/microphone-permission.ts',
    'microphone-permission.js',
    'iife',
  ],
  ['src/hosts/extension/offscreen-audio.ts', 'offscreen-audio.js', 'iife'],
];
const bundleEntries = [
  ['src/hosts/extension/content.ts', 'content.js', 'iife'],
  ['src/hosts/extension/adguard-content.ts', 'adguard-content.js', 'iife'],
  ['src/hosts/extension/adguard-runtime.ts', 'adguard-runtime.js', 'es'],
  [
    'src/hosts/extension/adguard-cosmetic-layer.ts',
    'adguard-cosmetic-runtime.js',
    'es',
  ],
  ['src/hosts/extension/adguard-gpc.ts', 'adguard-gpc.js', 'iife'],
  [
    'src/hosts/extension/adguard-hide-document-referrer.ts',
    'adguard-hide-document-referrer.js',
    'iife',
  ],
  [
    'src/hosts/extension/safari-main-world-bootstrap.ts',
    'safari-main-world-bootstrap.js',
    'iife',
  ],
  [
    'src/hosts/extension/safari-userscript-runtime.ts',
    'safari-userscript-runtime.js',
    'iife',
  ],
  ['src/hosts/extension/theme-proxy.ts', 'theme-proxy.js', 'iife'],
  ['src/hosts/extension/theme-content.ts', 'theme-content.js', 'iife'],
  [
    'src/hosts/extension/theme-runtime.ts',
    'theme-runtime.js',
    'es',
    { chunkSizeWarningLimit: 1_900 },
  ],
  [
    'src/hosts/extension/bilibili-recommendation-proxy.ts',
    'bilibili-recommendation-proxy.js',
    'iife',
  ],
  [
    'src/hosts/extension/bilibili-capability-content.ts',
    'bilibili-capability-content.js',
    'iife',
  ],
  [
    'src/hosts/extension/bilibili-sponsor-runtime-adapter.ts',
    'vendor/bilibili/sponsor/runtime-adapter.js',
    'iife',
  ],
  [
    'src/hosts/extension/youtube-sponsor-runtime-adapter.ts',
    'vendor/youtube/sponsor/runtime-adapter.js',
    'iife',
  ],
  ['src/hosts/extension/gamepad-content.ts', 'gamepad-content.js', 'iife'],
  [
    'src/hosts/extension/gamepad-control-content.ts',
    'gamepad-control-content.js',
    'es',
  ],
  ['src/hosts/extension/media-speed-proxy.ts', 'media-speed-proxy.js', 'iife'],
  [
    'src/hosts/extension/media-speed-content.ts',
    'media-speed-content.js',
    'iife',
  ],
  ['src/hosts/extension/install.tsx', 'install.js', 'iife'],
  ['src/hosts/extension/library.tsx', 'library.js', 'iife'],
  ['src/hosts/extension/assistant-surface.tsx', 'assistant-surface.js', 'iife'],
  ...(extensionTarget === 'safari'
    ? []
    : [
        ['src/hosts/extension/new-tab-entry.ts', 'new-tab-entry.js', 'iife'],
        [
          'src/hosts/extension/new-tab-settings.tsx',
          'new-tab-settings.js',
          'iife',
        ],
      ]),
  ...(extensionTarget === 'chromium' ? chromiumSpeechBundleEntries : []),
  [
    'src/hosts/extension/background.ts',
    'background.js',
    'es',
    {
      chunkSizeWarningLimit: 1_900,
      omitNodeBuffer: true,
    },
  ],
];

await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });
for (const [input, entryFileNames, format, options = {}] of bundleEntries) {
  await bundle({
    input,
    entryFileNames,
    format,
    ...options,
  });
}
await mkdir(resolve(output, 'vendor'), { recursive: true });
await cp(resolve(root, 'vendor/bilibili'), resolve(output, 'vendor/bilibili'), {
  recursive: true,
});
await cp(resolve(root, 'vendor/youtube'), resolve(output, 'vendor/youtube'), {
  recursive: true,
});
await cp(
  resolve(root, 'vendor/pinyin-ime'),
  resolve(output, 'vendor/pinyin-ime'),
  { recursive: true },
);
if (extensionTarget !== 'safari') {
  await cp(resolve(root, 'vendor/lumno'), resolve(output, 'vendor/lumno'), {
    recursive: true,
  });
}
if (extensionTarget !== 'safari') {
  await prepareCatCatchRuntime(catCatchRoot, output);
}
if (extensionTarget !== 'safari') {
  await rm(resolve(output, 'vendor/lumno/runtime'), {
    force: true,
    recursive: true,
  });
  await cp(resolve(root, 'vendor/lumno/runtime/src'), resolve(output, 'src'), {
    recursive: true,
  });
  await cp(
    resolve(root, 'vendor/lumno/runtime/assets'),
    resolve(output, 'assets'),
    { recursive: true },
  );
}
await preparePakkuVendorAssets();
await prepareSponsorVendorAssets(resolve(output, 'vendor/bilibili/sponsor'), {
  runtimeId: 'bilibili',
  sponsorPrefix: 'vendor/bilibili/sponsor',
});
await prepareSponsorVendorAssets(resolve(output, 'vendor/youtube/sponsor'), {
  runtimeId: 'youtube',
  sponsorPrefix: 'vendor/youtube/sponsor',
  patchContent: true,
  patchDocument: true,
});
await prepareSponsorLocales(resolve(output, '_locales'), [
  {
    root: resolve(output, 'vendor/bilibili/sponsor'),
    prefix: 'sponsor_bilibili_',
  },
  {
    root: resolve(output, 'vendor/youtube/sponsor'),
    prefix: 'sponsor_youtube_',
  },
]);
if (extensionTarget !== 'safari') {
  await mergeLumnoLocale();
}
if (extensionTarget !== 'safari') {
  await mergeCatCatchLocale(catCatchRoot, output);
}
await Promise.all([
  validateSingleLocaleRoot(resolve(output, '_locales')),
  validateSingleLocaleRoot(resolve(output, 'vendor/bilibili/sponsor/_locales')),
  validateSingleLocaleRoot(resolve(output, 'vendor/youtube/sponsor/_locales')),
  ...(extensionTarget === 'safari' ? [] : [validateLumnoRuntime()]),
]);
{
  let backgroundSource = await readFile(
    resolve(output, 'background.js'),
    'utf8',
  );
  for (const runtimeId of ['bilibili', 'youtube']) {
    const vendorRoot = `vendor/${runtimeId}/sponsor`;
    const sponsorBackground = await readFile(
      resolve(output, vendorRoot, 'js/background.js'),
      'utf8',
    );
    const runtimeAdapter = await readFile(
      resolve(output, vendorRoot, 'runtime-adapter.js'),
      'utf8',
    );
    backgroundSource = composeSponsorBackground(
      backgroundSource,
      runtimeAdapter,
      sponsorBackground,
      runtimeId,
    );
  }
  if (extensionTarget !== 'safari') {
    backgroundSource = await composeCatCatchBackground(
      backgroundSource,
      catCatchRoot,
    );
  }
  await writeFile(resolve(output, 'background.js'), backgroundSource);
}
if (extensionTarget === 'safari') {
  const backgroundPath = resolve(output, 'background.js');
  const backgroundSource = await readFile(backgroundPath, 'utf8');
  const encoded = await transformJavaScript(backgroundSource, {
    charset: 'ascii',
    legalComments: 'none',
    loader: 'js',
    minifyWhitespace: true,
    target: 'es2022',
  });
  const asciiSource = encodeJavaScriptAsAscii(encoded.code);
  parse(asciiSource, { ecmaVersion: 'latest', sourceType: 'script' });
  await writeFile(backgroundPath, asciiSource);
}
const manifest = {
  ...JSON.parse(
    await readFile(resolve(root, 'extension/manifest.common.json'), 'utf8'),
  ),
  ...JSON.parse(
    await readFile(
      resolve(root, `extension/manifest.${extensionTarget}.json`),
      'utf8',
    ),
  ),
};
if (extensionTarget === 'chromium') {
  const resources = manifest.web_accessible_resources?.[0]?.resources;
  if (!resources) {
    throw new Error(
      'The Chromium manifest is missing its web-accessible resource inventory.',
    );
  }
  resources.push('assistant-speech-worklet.js');
} else {
  if (extensionTarget === 'safari') {
    delete manifest.chrome_url_overrides;
    delete manifest.options_ui;
  }
  for (const entry of manifest.web_accessible_resources ?? []) {
    entry.resources = entry.resources.filter(
      (resource) => resource !== 'assistant-speech-worklet.js',
    );
  }
}
if (manifest.version !== projectMetadata.version) {
  throw new Error(
    `Extension manifest version ${manifest.version} does not match package version ${projectMetadata.version}.`,
  );
}
if (extensionTarget === 'firefox') {
  delete manifest.declarative_net_request;
  manifest.content_scripts = manifest.content_scripts.map((entry) => {
    if (!entry.js?.includes('vendor/bilibili/pakku/generated/xhr_hook.js')) {
      return entry;
    }
    const { world: _world, ...portableEntry } = entry;
    return {
      ...portableEntry,
      js: ['vendor/bilibili/pakku/assets/xhr_hook_injector.js'],
    };
  });
}
await writeFile(
  resolve(output, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await cp(
  resolve(root, 'extension/install.html'),
  resolve(output, 'install.html'),
);
await cp(
  resolve(root, 'extension/assistant.html'),
  resolve(output, 'assistant.html'),
);
if (extensionTarget !== 'safari') {
  await cp(
    resolve(root, 'extension/new-tab-settings.html'),
    resolve(output, 'new-tab-settings.html'),
  );
  await cp(
    resolve(root, 'extension/new-tab.html'),
    resolve(output, 'new-tab.html'),
  );
}
if (extensionTarget === 'chromium') {
  await cp(
    resolve(root, 'extension/assistant-speech-worklet.js'),
    resolve(output, 'assistant-speech-worklet.js'),
  );
  await cp(
    resolve(root, 'extension/microphone-permission.html'),
    resolve(output, 'microphone-permission.html'),
  );
  await cp(
    resolve(root, 'extension/offscreen-audio.html'),
    resolve(output, 'offscreen-audio.html'),
  );
}
await cp(resolve(root, 'LICENSE'), resolve(output, 'LICENSE'));
await cp(
  resolve(root, 'THIRD_PARTY_NOTICES.md'),
  resolve(output, 'THIRD_PARTY_NOTICES.md'),
);
await mkdir(resolve(output, 'licenses'), { recursive: true });
await cp(
  resolve(root, 'vendor/darkreader/LICENSE'),
  resolve(output, 'licenses/DarkReader-LICENSE.txt'),
);
await cp(
  resolve(root, 'vendor/gamepad-controller-tester/LICENSE'),
  resolve(output, 'licenses/Gaming-Controller-Tester-LICENSE.txt'),
);
await cp(
  resolve(root, 'vendor/spatial-nav-css/LICENSE'),
  resolve(output, 'licenses/Spatial-Nav-CSS-LICENSE.txt'),
);
await cp(
  resolve(root, 'vendor/pinyin-ime/LICENSE'),
  resolve(output, 'licenses/Pinyin-IME-LICENSE.txt'),
);
if (extensionTarget !== 'safari') {
  await cp(
    resolve(root, 'vendor/lumno/LICENSE'),
    resolve(output, 'licenses/Lumno-LICENSE.txt'),
  );
}
if (extensionTarget !== 'safari') {
  await cp(
    resolve(root, 'vendor/cat-catch/LICENSE'),
    resolve(output, 'licenses/CatCatch-LICENSE.txt'),
  );
}
await copyRuntimeAssets();
await copyContentBlockingAssets();
if (extensionTarget === 'firefox') {
  await prepareFirefoxWebRequestAssets();
}
if (extensionTarget === 'safari') {
  await rm(resolve(output, 'filters', 'local_script_rules.js'), {
    force: true,
  });
  await validateSafariDeclarativeRuleSets();
}

const browserBundles = new Map(
  await Promise.all(
    browserBundleNames.map(async (name) => [
      name,
      await readFile(resolve(output, name), 'utf8'),
    ]),
  ),
);
for (const [name, source] of browserBundles) {
  if (source.includes('process.env')) {
    throw new Error(
      `The extension browser bundle ${name} contains an unresolved process.env reference.`,
    );
  }
}
const backgroundSource = browserBundles.get('background.js');
const contentSource = browserBundles.get('content.js');
const adguardContentSource = browserBundles.get('adguard-content.js');
const expectedBuildTargetMarker = `card-master-build-target:${extensionTarget}`;
if (!contentSource?.includes(expectedBuildTargetMarker)) {
  throw new Error(
    `The ${extensionTarget} content.js bundle was built for another browser target.`,
  );
}
const adguardRuntimeSource = browserBundles.get('adguard-runtime.js');
if (
  !backgroundSource ||
  !contentSource ||
  !adguardContentSource ||
  !adguardRuntimeSource
) {
  throw new Error('The extension browser bundle inventory is incomplete.');
}
const externalStyles = (await readdir(output)).filter((name) =>
  name.endsWith('.css'),
);
if (externalStyles.length > 0) {
  throw new Error(
    `The packaged extension contains external CSS that cannot enter closed Shadow Roots: ${externalStyles.join(', ')}`,
  );
}
for (const selector of [
  '.manager-card__state',
  '.manager-card__state:before',
]) {
  if (!contentSource.includes(selector)) {
    throw new Error(
      `The packaged content bootstrap is missing the card state style contract: ${selector}`,
    );
  }
}
if (!contentSource.includes('显示页面牌库入口')) {
  throw new Error(
    'The packaged content bootstrap is missing the settings board.',
  );
}
for (const [name, source] of [
  ['background context', backgroundSource],
  ['AdGuard content host', adguardContentSource],
]) {
  if (
    source.includes('vite:preloadError') ||
    source.includes('modulepreload')
  ) {
    throw new Error(`The extension ${name} contains a preload runtime.`);
  }
}
if (!adguardRuntimeSource.includes('This script should only be loaded')) {
  throw new Error('The extension AdGuard runtime bundle is incomplete.');
}
if (
  !adguardRuntimeSource.includes('getCookieRules') ||
  !adguardRuntimeSource.includes('data-card-master-adguard-runtime')
) {
  throw new Error(
    'The extension AdGuard runtime must contain only the cookie content controller.',
  );
}
if (
  extensionTarget === 'chromium' &&
  !backgroundSource.includes('./filters/local_script_rules.js')
) {
  throw new Error(
    'The extension background context is missing the static AdGuard local-script import.',
  );
}
if (!backgroundSource.includes('__cardMasterAdguardBrowserApi')) {
  throw new Error(
    'The extension background context is missing the isolated AdGuard browser API adapter.',
  );
}
if (extensionTarget !== 'firefox') {
  const requiredAdguardAdapterMethods = [
    'getDisabledRuleIds',
    'getAllFrames',
    'handlerBehaviorChanged',
    'insertCSS',
    'updateDynamicRules',
    'updateSessionRules',
    'updateStaticRules',
  ];
  const missingAdguardAdapterMethods = requiredAdguardAdapterMethods.filter(
    (method) =>
      !backgroundSource.includes(`__cardMasterAdguardBrowserApi.${method}`),
  );
  if (missingAdguardAdapterMethods.length > 0) {
    throw new Error(
      `The extension background context bypasses AdGuard browser API methods: ${missingAdguardAdapterMethods.join(', ')}`,
    );
  }
  const unisolatedAdguardCalls = [
    '.declarativeNetRequest.getDisabledRuleIds(',
    '.declarativeNetRequest.updateStaticRules(',
    '.webNavigation.getAllFrames(',
    '.webRequest.handlerBehaviorChanged(',
  ].filter((call) => backgroundSource.includes(call));
  if (unisolatedAdguardCalls.length > 0) {
    throw new Error(
      `The extension background context contains unisolated AdGuard API calls: ${unisolatedAdguardCalls.join(', ')}`,
    );
  }
}
if (extensionTarget === 'firefox' || extensionTarget === 'safari') {
  const unsupportedCrossBrowserNamespaces = [
    'declarativeNetRequest.RuleActionType',
    'declarativeNetRequest.ResourceType',
    'declarativeNetRequest.DomainType',
    'declarativeNetRequest.HeaderOperation',
    'declarativeNetRequest.SESSION_RULESET_ID',
    'declarativeNetRequest.MAX_NUMBER_OF_UNSAFE',
    'privacy.IPHandlingPolicy',
  ];
  const remaining = unsupportedCrossBrowserNamespaces.filter((namespace) =>
    backgroundSource.includes(namespace),
  );
  if (remaining.length > 0) {
    throw new Error(
      `The ${extensionTarget} background bundle contains unsupported Chrome enum namespaces: ${remaining.join(', ')}`,
    );
  }
}

const packagedManifest = await validatePackagedManifestAssets();
if (extensionTarget !== 'safari') {
  for (const catCatchAsset of [
    'popup.html',
    'options.html',
    'downloader.html',
    'm3u8.html',
    'mpd.html',
    'json.html',
    'preview.html',
    'js/card-master-adapter.js',
    'js/content-script.js',
    'css/popup.css',
  ]) {
    const metadata = await stat(resolve(output, catCatchAsset)).catch(
      () => null,
    );
    if (!metadata?.isFile()) {
      throw new Error(`The CatCatch runtime is missing ${catCatchAsset}.`);
    }
  }
}
const chromiumSpeechAssetNames = [
  ...chromiumSpeechBundleNames,
  'microphone-permission.html',
  'offscreen-audio.html',
];
if (extensionTarget !== 'safari') {
  if (packagedManifest.options_ui?.page !== 'new-tab-settings.html') {
    throw new Error(
      `The ${extensionTarget} package must declare new-tab-settings.html as options_ui.`,
    );
  }
}
if (extensionTarget === 'chromium') {
  if (
    !packagedManifest.web_accessible_resources?.some((entry) =>
      entry.resources?.includes('assistant-speech-worklet.js'),
    )
  ) {
    throw new Error(
      'The Chromium package is missing its speech worklet contract.',
    );
  }
} else {
  const packagedSpeechAssets = (
    await Promise.all(
      chromiumSpeechAssetNames.map(async (name) => {
        const file = await stat(resolve(output, name)).catch(() => null);
        return file?.isFile() ? name : null;
      }),
    )
  ).filter(Boolean);
  if (
    packagedManifest.web_accessible_resources?.some((entry) =>
      entry.resources?.includes('assistant-speech-worklet.js'),
    ) ||
    packagedSpeechAssets.length > 0
  ) {
    throw new Error(
      `The ${extensionTarget} package contains Chromium-only speech resources: ${packagedSpeechAssets.join(', ') || 'manifest entry'}.`,
    );
  }
}
if (extensionTarget === 'firefox') {
  if (
    packagedManifest.background?.service_worker ||
    packagedManifest.background?.type ||
    packagedManifest.background?.scripts?.length !== 1
  ) {
    throw new Error(
      'The Firefox manifest must use one supported classic background script.',
    );
  }
  for (const runtimeId of ['bilibili', 'youtube']) {
    const sponsorBridgeIndex = backgroundSource.indexOf(
      `/* ${runtimeId} SponsorBlock runtime bridge */`,
    );
    const sponsorAdapterIndex = backgroundSource.indexOf(
      `/* ${runtimeId} SponsorBlock GPL-3.0 integration */`,
    );
    const sponsorRuntimeIndex = backgroundSource.indexOf(
      `__cardMasterSponsorRuntimes.${runtimeId}.storage.local`,
    );
    if (
      sponsorBridgeIndex < 0 ||
      sponsorAdapterIndex < 0 ||
      sponsorRuntimeIndex < 0 ||
      sponsorBridgeIndex >= sponsorAdapterIndex ||
      sponsorAdapterIndex >= sponsorRuntimeIndex
    ) {
      throw new Error(
        `The Firefox background must install the ${runtimeId} SponsorBlock bridge before its runtime.`,
      );
    }
  }
  if (
    packagedManifest.sidebar_action?.default_panel !== 'assistant.html' ||
    packagedManifest.sidebar_action?.open_at_install !== false
  ) {
    throw new Error(
      'The Firefox package must expose assistant.html through the native sidebar.',
    );
  }
  const firefoxWebAccessibleResourcesRoot = 'web-accessible-resources';
  const redirectsManifest = await stat(
    resolve(output, firefoxWebAccessibleResourcesRoot, 'redirects.yml'),
  ).catch(() => null);
  if (!redirectsManifest?.isFile()) {
    throw new Error(
      'The Firefox package is missing web-accessible-resources/redirects.yml.',
    );
  }
  if (
    !backgroundSource.includes(`"${firefoxWebAccessibleResourcesRoot}"`) ||
    backgroundSource.includes('/web-accessible-resources/redirects')
  ) {
    throw new Error(
      'The Firefox AdGuard webRequest engine must use the web-accessible-resources root.',
    );
  }
  if (
    !backgroundSource.includes('webRequest.onBeforeRequest') ||
    backgroundSource.includes('Cannot change list of enabled rule sets') ||
    !backgroundSource.includes('adguard-firefox-startup')
  ) {
    throw new Error(
      'The Firefox background context must use the AdGuard webRequest engine without static DNR activation.',
    );
  }
  if (packagedManifest.declarative_net_request) {
    throw new Error(
      'The Firefox manifest must not declare static DNR rule resources.',
    );
  }
  const firefoxScripts = packagedManifest.content_scripts ?? [];
  if (
    !firefoxScripts.some(
      (entry) =>
        entry.js?.includes('vendor/bilibili/sponsor/js/document.js') &&
        entry.world === 'MAIN',
    ) ||
    !firefoxScripts.some(
      (entry) =>
        entry.js?.includes('vendor/youtube/sponsor/js/document.js') &&
        entry.world === 'MAIN',
    ) ||
    !firefoxScripts.some(
      (entry) =>
        entry.js?.includes(
          'vendor/bilibili/pakku/assets/xhr_hook_injector.js',
        ) && !('world' in entry),
    )
  ) {
    throw new Error(
      'The Firefox package must use upstream page-script injection fallbacks.',
    );
  }
  const firefoxPakkuContent = await readFile(
    resolve(output, 'vendor/bilibili/pakku/generated/content_script.js'),
    'utf8',
  );
  if (
    !firefoxPakkuContent.includes('JSON.parse(JSON.stringify') ||
    firefoxPakkuContent.includes(
      'chrome.runtime.getURL("/generated/combine_worker.js")',
    ) ||
    firefoxPakkuContent.includes(
      'chrome.runtime.getURL("/assets/similarity-gen.wasm")',
    )
  ) {
    throw new Error(
      'The Firefox package is not using the portable pakku content runtime.',
    );
  }
}
if (extensionTarget === 'safari') {
  const firstNonAsciiCharacter = [...backgroundSource].find(
    (character) => character.codePointAt(0) > 0x7f,
  );
  if (firstNonAsciiCharacter) {
    throw new Error(
      `The Safari classic background bundle must be ASCII-only; found U+${firstNonAsciiCharacter.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}.`,
    );
  }
  if (
    backgroundSource.includes('./filters/local_script_rules.js') ||
    /^\s*(?:import|export)\s/m.test(backgroundSource)
  ) {
    throw new Error(
      'The Safari background context must be a self-contained classic script.',
    );
  }
  const unsupportedPermissions = ['downloads', 'notifications'].filter(
    (permission) => packagedManifest.permissions?.includes(permission),
  );
  const unsupportedKeys = [
    packagedManifest.background?.preferred_environment
      ? 'background.preferred_environment'
      : null,
    packagedManifest.background?.type ? 'background.type' : null,
    packagedManifest.incognito ? 'incognito' : null,
    packagedManifest.options_ui ? 'options_ui' : null,
    packagedManifest.chrome_url_overrides ? 'chrome_url_overrides' : null,
  ].filter(Boolean);
  if (unsupportedPermissions.length > 0 || unsupportedKeys.length > 0) {
    throw new Error(
      `The Safari manifest contains unsupported capabilities: ${[
        ...unsupportedPermissions,
        ...unsupportedKeys,
      ].join(', ')}`,
    );
  }
  const safariScripts = packagedManifest.content_scripts ?? [];
  const safariProxyBootstrap = safariScripts.find((entry) =>
    entry.js?.includes('safari-main-world-bootstrap.js'),
  );
  if (
    safariScripts.some((entry) => 'world' in entry) ||
    JSON.stringify(safariProxyBootstrap?.js) !==
      JSON.stringify([
        'media-speed-proxy.js',
        'safari-main-world-bootstrap.js',
      ]) ||
    safariScripts.some((entry) =>
      entry.js?.includes('vendor/bilibili/sponsor/js/document.js'),
    ) ||
    safariScripts.some((entry) =>
      entry.js?.includes('vendor/youtube/sponsor/js/document.js'),
    ) ||
    !safariScripts.some(
      (entry) =>
        entry.js?.includes(
          'vendor/bilibili/pakku/assets/xhr_hook_injector.js',
        ) && !('world' in entry),
    )
  ) {
    throw new Error(
      'The Safari package must use bootstrap and upstream injection fallbacks without world declarations.',
    );
  }
  const safariProjectSource = await readFile(safariXcodeProject, 'utf8');
  const safariProjectContracts = [
    'com.lyihub.cardmaster;',
    'com.lyihub.cardmaster.Extension;',
    'DEVELOPMENT_TEAM = "";',
    `MARKETING_VERSION = ${projectMetadata.version};`,
    'MACOSX_DEPLOYMENT_TARGET = 13.3;',
    'vendor in Resources',
    '_locales in Resources',
    ...browserBundleNames.map((name) => `${name} in Resources`),
  ];
  for (const contract of safariProjectContracts) {
    if (!safariProjectSource.includes(contract)) {
      throw new Error(`The Safari Xcode project is missing: ${contract}`);
    }
  }
}
const packageSize = await measurePackage(output);
if (packageSize.estimatedZipBytes > packageBudgetBytes) {
  throw new Error(
    `${extensionTarget} package estimate ${formatMegabytes(packageSize.estimatedZipBytes)} exceeds the ${formatMegabytes(packageBudgetBytes)} release budget.`,
  );
}
console.log(
  `${extensionTarget} package size: ${formatMegabytes(packageSize.unpackedBytes)} unpacked; ${formatMegabytes(packageSize.estimatedZipBytes)} estimated zip.`,
);
console.log(
  `Extension ${packagedManifest.version} (${extensionTarget}) packaged at ${output} with ${extensionRuntimeAssets.length} runtime assets.`,
);
