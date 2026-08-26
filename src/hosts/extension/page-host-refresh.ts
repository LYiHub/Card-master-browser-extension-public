import type { ExtensionBackgroundApi } from './api';
import { bilibiliSponsorPage } from './bilibili-sponsor-page';
import {
  extensionContentHostUrl,
  extensionHostPermissionPattern,
} from './content-host-url';
import {
  extensionDiagnostics,
  extensionErrorMessage,
  isExtensionPageLifecycleInterrupted,
} from './diagnostics';
import { extensionTarget } from './platform';

type PageHostInjection = {
  file: string;
  allFrames: boolean;
  world?: 'MAIN';
};

const STANDARD_PAGE_HOST_INJECTIONS: readonly PageHostInjection[] = [
  {
    file: 'adguard-content.js',
    allFrames: true,
  },
  {
    file: 'theme-proxy.js',
    allFrames: true,
    world: 'MAIN',
  },
  {
    file: 'theme-content.js',
    allFrames: true,
  },
  {
    file: 'media-speed-proxy.js',
    allFrames: true,
    world: 'MAIN',
  },
  {
    file: 'gamepad-content.js',
    allFrames: false,
  },
  {
    file: 'media-speed-content.js',
    allFrames: true,
  },
  {
    file: 'js/card-master-adapter.js',
    allFrames: true,
  },
  {
    file: 'js/content-script.js',
    allFrames: true,
  },
  {
    file: 'content.js',
    allFrames: false,
  },
] as const;
const SAFARI_MAIN_WORLD_BOOTSTRAP: PageHostInjection = {
  file: 'safari-main-world-bootstrap.js',
  allFrames: true,
};

const PAGE_ACCESS_DENIED =
  /(?:^Blocked$|cannot access contents of the page|extension manifest must request permission|missing host permission|cannot access a chrome:\/\/ url|failed to load the script unexpectedly)/i;
const SAFARI_PAGE_UNAVAILABLE = /could not execute script on this tab/i;

function pageHostInjections(): readonly PageHostInjection[] {
  if (extensionTarget() !== 'safari') return STANDARD_PAGE_HOST_INJECTIONS;
  return [
    ...STANDARD_PAGE_HOST_INJECTIONS.flatMap(({ file, allFrames }) =>
      file === 'theme-proxy.js' ||
      file === 'js/card-master-adapter.js' ||
      file === 'js/content-script.js'
        ? []
        : [{ file, allFrames }],
    ),
    SAFARI_MAIN_WORLD_BOOTSTRAP,
  ];
}

function vendorPageHostInjections(url: string): readonly PageHostInjection[] {
  const page = new URL(url);
  const hostname = page.hostname.toLowerCase();
  if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')) {
    const injections: PageHostInjection[] = [
      {
        file: 'bilibili-capability-content.js',
        allFrames: false,
      },
      {
        file: 'vendor/bilibili/pakku/generated/content_script.js',
        allFrames: false,
      },
    ];
    if (bilibiliSponsorPage(url)) {
      injections.push(
        {
          file: 'vendor/bilibili/sponsor/runtime-adapter.js',
          allFrames: true,
        },
        {
          file: 'vendor/bilibili/sponsor/js/content.js',
          allFrames: true,
        },
      );
    }
    return injections;
  }
  if (
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtube-nocookie.com' ||
    hostname.endsWith('.youtube-nocookie.com')
  ) {
    if (
      hostname === 'accounts.youtube.com' &&
      page.pathname.startsWith('/RotateCookiesPage')
    ) {
      return [];
    }
    return [
      {
        file: 'vendor/youtube/sponsor/runtime-adapter.js',
        allFrames: true,
      },
      {
        file: 'vendor/youtube/sponsor/js/content.js',
        allFrames: true,
      },
    ];
  }
  return [];
}

function allPageHostInjections(url: string): readonly PageHostInjection[] {
  return [...pageHostInjections(), ...vendorPageHostInjections(url)];
}

export function injectableExtensionPage(tab: chrome.tabs.Tab) {
  return (
    typeof tab.id === 'number' &&
    typeof tab.url === 'string' &&
    tab.discarded !== true &&
    extensionContentHostUrl(tab.url)
  );
}

export async function refreshExtensionPageHosts(api: ExtensionBackgroundApi) {
  const tabs = (await api.tabs.query({})).filter(injectableExtensionPage);
  await Promise.all(
    tabs.map(async (tab) => {
      const tabId = tab.id;
      const url = tab.url;
      if (typeof tabId !== 'number' || typeof url !== 'string') return;
      const permissionPattern = extensionHostPermissionPattern(url);
      if (!permissionPattern) return;
      if (api.permissions?.contains) {
        try {
          const hostAccess = await api.permissions.contains({
            origins: [permissionPattern],
          });
          if (!hostAccess) return;
        } catch {
          return;
        }
      }
      for (const injection of allPageHostInjections(url)) {
        const details = {
          tabId,
          url,
          file: injection.file,
          allFrames: injection.allFrames,
          world: 'world' in injection ? injection.world : 'ISOLATED',
        };
        try {
          await api.scripting.executeScript({
            target: {
              tabId,
              allFrames: injection.allFrames,
            },
            files: [injection.file],
            ...('world' in injection ? { world: injection.world } : {}),
          });
        } catch (error) {
          if (
            isExtensionPageLifecycleInterrupted(error) ||
            PAGE_ACCESS_DENIED.test(extensionErrorMessage(error)) ||
            (extensionTarget() === 'safari' &&
              SAFARI_PAGE_UNAVAILABLE.test(extensionErrorMessage(error)))
          ) {
            return;
          }
          extensionDiagnostics.error(
            'page-host-refresh',
            'script-injection-failed',
            error,
            details,
          );
        }
      }
    }),
  );
}

export async function refreshContentBlockingPageHosts(
  api: ExtensionBackgroundApi,
) {
  const tabs = await api.tabs.query({});
  await Promise.allSettled(
    tabs.flatMap((tab) =>
      injectableExtensionPage(tab) && typeof tab.id === 'number'
        ? [
            api.tabs.sendMessage(tab.id, {
              type: 'content-blocking-page-refresh',
            }),
          ]
        : [],
    ),
  );
}
