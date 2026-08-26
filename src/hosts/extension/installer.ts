import type {
  MetadataDiagnostic,
  UserscriptPresentation,
} from '../../userscript/domain/types';
import {
  type ExtensionApi,
  type ExtensionBackgroundApi,
  sendExtensionRequest,
} from './api';
import { extensionDiagnostics } from './diagnostics';
import { extensionTarget } from './platform';
import {
  EXTENSION_CHANNEL,
  type UserscriptInstallPreview,
  type UserscriptInstallResult,
} from './protocol';
import { normalizeExtensionSourceUrl } from './source-fetch';
import {
  readUserscriptExecutionCapability,
  requestUserscriptExecutionPermission,
} from './userscript-permission';

const INSTALLER_QUERY_PREFIX = '?source=';
export const INSTALL_REDIRECT_RULE_ID = 1_600_000_001;
export const LEGACY_INSTALL_REDIRECT_RULE_ID = 2_000_000_001;
const USERSCRIPT_NAVIGATION_PATTERN =
  '^((?:https?)://[^#]+?\\.user\\.js(?:\\?[^#]*)?)$';

type InstallerResponse = {
  preview?: UserscriptInstallPreview;
  result?: UserscriptInstallResult;
  error?: string;
  diagnostics?: readonly MetadataDiagnostic[];
  source?: string;
  sourceUrl?: string;
};

export class UserscriptInstallerError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly MetadataDiagnostic[] = [],
    readonly source?: string,
    readonly sourceUrl?: string,
  ) {
    super(message);
    this.name = 'UserscriptInstallerError';
  }
}

export function normalizeUserscriptSourceUrl(value: string) {
  const normalized = normalizeExtensionSourceUrl(value);
  if (!new URL(normalized).pathname.toLowerCase().endsWith('.user.js')) {
    throw new Error('安装入口只接受标准 .user.js 地址。');
  }
  return normalized;
}

export function userscriptInstallerPageUrl(
  runtime: Pick<typeof chrome.runtime, 'getURL'>,
  sourceUrl: string,
) {
  return `${runtime.getURL('install.html')}${INSTALLER_QUERY_PREFIX}${normalizeUserscriptSourceUrl(sourceUrl)}`;
}

export function readUserscriptInstallerSource(search: string) {
  if (!search.startsWith(INSTALLER_QUERY_PREFIX)) {
    throw new Error('安装页面缺少 .user.js 来源地址。');
  }
  return normalizeUserscriptSourceUrl(
    search.slice(INSTALLER_QUERY_PREFIX.length),
  );
}

function installerResponse(response: InstallerResponse) {
  if (response.error) {
    throw new UserscriptInstallerError(
      response.error,
      response.diagnostics ?? [],
      response.source,
      response.sourceUrl,
    );
  }
  return response;
}

export class ExtensionUserscriptInstallerClient {
  constructor(private readonly api: ExtensionApi) {}

  async preview(url: string) {
    const response = installerResponse(
      await sendExtensionRequest<InstallerResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-install-preview',
        url: normalizeUserscriptSourceUrl(url),
      }),
    );
    if (!response.preview) {
      throw new Error('扩展没有返回有效的脚本安装预览。');
    }
    return response.preview;
  }

  capability() {
    return readUserscriptExecutionCapability(this.api);
  }

  requestExecutionPermission() {
    return requestUserscriptExecutionPermission(this.api);
  }

  async install(
    sourceUrl: string,
    source: string,
    presentation: UserscriptPresentation,
  ) {
    const response = installerResponse(
      await sendExtensionRequest<InstallerResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-install-confirm',
        sourceUrl: normalizeExtensionSourceUrl(sourceUrl),
        source,
        presentation,
      }),
    );
    if (!response.result) {
      throw new Error('扩展没有返回有效的脚本安装结果。');
    }
    return response.result;
  }

  async open(url: string) {
    const response = installerResponse(
      await sendExtensionRequest<InstallerResponse>(this.api, {
        channel: EXTENSION_CHANNEL,
        type: 'userscript-installer-open',
        url: normalizeUserscriptSourceUrl(url),
      }),
    );
    return response;
  }
}

export function interceptUserscriptInstallLinks(
  api: ExtensionApi,
  documentRoot: Document = document,
) {
  const client = new ExtensionUserscriptInstallerClient(api);
  const handleClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || (anchor.target && anchor.target !== '_self')) return;
    let sourceUrl: string;
    try {
      sourceUrl = normalizeUserscriptSourceUrl(anchor.href);
    } catch {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    void client.open(sourceUrl).catch(() => {
      documentRoot.defaultView?.location.assign(sourceUrl);
    });
  };
  documentRoot.addEventListener('click', handleClick, true);
  return () => documentRoot.removeEventListener('click', handleClick, true);
}

export class UserscriptInstallInterceptor {
  private listening = false;

  constructor(private readonly api: ExtensionBackgroundApi) {}

  private readonly handleNavigation = (
    details: chrome.webNavigation.WebNavigationBaseCallbackDetails,
  ) => {
    if (details.frameId !== 0 || details.tabId < 0) return;
    let sourceUrl: string;
    try {
      sourceUrl = normalizeUserscriptSourceUrl(details.url);
    } catch {
      return;
    }
    void this.open(details.tabId, sourceUrl).catch((error) => {
      extensionDiagnostics.error(
        'userscript-installer',
        'navigation-redirect-failed',
        error,
      );
    });
  };

  start() {
    if (!this.listening) {
      this.api.webNavigation.onBeforeNavigate.addListener(
        this.handleNavigation,
      );
      this.listening = true;
    }
    return this.ensureRedirectRule();
  }

  ensureRedirectRule() {
    const removeRuleIds = [
      INSTALL_REDIRECT_RULE_ID,
      LEGACY_INSTALL_REDIRECT_RULE_ID,
    ];
    if (extensionTarget() === 'safari') {
      return Promise.resolve();
    }
    if (extensionTarget() === 'firefox') {
      return this.api.declarativeNetRequest.updateDynamicRules({
        removeRuleIds,
      });
    }
    return this.api.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: [
        {
          id: INSTALL_REDIRECT_RULE_ID,
          priority: 100,
          action: {
            type: 'redirect' as chrome.declarativeNetRequest.RuleActionType,
            redirect: {
              regexSubstitution: `${this.api.runtime.getURL('install.html')}${INSTALLER_QUERY_PREFIX}\\1`,
            },
          },
          condition: {
            regexFilter: USERSCRIPT_NAVIGATION_PATTERN,
            resourceTypes: [
              'main_frame' as chrome.declarativeNetRequest.ResourceType,
            ],
            requestMethods: [
              'get' as chrome.declarativeNetRequest.RequestMethod,
            ],
            isUrlFilterCaseSensitive: false,
            responseHeaders: [
              {
                header: 'content-type',
                values: [
                  'text/javascript*',
                  'application/javascript*',
                  'text/plain*',
                  'application/octet-stream*',
                  'application/force-download*',
                ],
              },
            ],
          },
        },
      ],
    });
  }

  async open(tabId: number, sourceUrl: string) {
    await this.api.tabs.update(tabId, {
      url: userscriptInstallerPageUrl(this.api.runtime, sourceUrl),
    });
  }
}
