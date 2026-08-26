import type {
  UserscriptAudioState,
  UserscriptCapability,
  UserscriptCapabilityEvent,
} from '../../userscript/runtime/capabilities';
import {
  isUserscriptWebRequestRuleId,
  USERSCRIPT_WEB_REQUEST_RULE_ID_END,
  USERSCRIPT_WEB_REQUEST_RULE_ID_START,
} from '../../userscript/runtime/capabilities';
import type { ExtensionBackgroundApi } from './api';
import { CARD_MASTER_DEFAULT_ICON_PATH } from './extension-branding';

type CapabilityContext = {
  runtimeId: string;
  scriptId: string;
  tabId: number;
  frameId: number;
  sourceUrl: string;
  post: (event: UserscriptCapabilityEvent) => void;
};

type Subscription = {
  context: CapabilityContext;
  eventId: string;
};

type WebRequestRule = {
  selector?:
    | string
    | {
        include?: string | string[];
        match?: string | string[];
        exclude?: string | string[];
        type?: string | string[];
      };
  action?:
    | string
    | {
        cancel?: boolean;
        redirect?: string | { url?: string; from?: string; to?: string };
      };
};

type WebRequestPattern = { source: string; regex: boolean };

type RegisteredWebRequest = Subscription & {
  rules: WebRequestRule[];
  dnrRuleIds: number[];
};

const TAB_DATA_PREFIX = 'card-master.tab-data.v1:';
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value: unknown) {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function currentUrl(context: CapabilityContext, value: unknown) {
  const candidate = text(value, context.sourceUrl);
  return new URL(candidate, context.sourceUrl).href;
}

function tabDataKey(scriptId: string) {
  return `${TAB_DATA_PREFIX}${encodeURIComponent(scriptId)}`;
}

function tabAudioState(tab: chrome.tabs.Tab): UserscriptAudioState {
  return {
    tabId: tab.id ?? -1,
    muted: tab.mutedInfo?.muted ?? false,
  };
}

function webRequestPatterns(rule: WebRequestRule): WebRequestPattern[] {
  if (typeof rule.selector === 'string') {
    return [{ source: rule.selector, regex: false }];
  }
  const matches = stringList(rule.selector?.match).map((source) => ({
    source,
    regex: true,
  }));
  const includes = stringList(rule.selector?.include).map((source) => ({
    source,
    regex: false,
  }));
  return [...matches, ...includes].length > 0
    ? [...matches, ...includes]
    : [{ source: '*', regex: false }];
}

function wildcardExpression(pattern: string) {
  if (pattern === '*' || pattern === '<all_urls>') return '.*';
  return pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
}

function matchesPattern(pattern: WebRequestPattern, value: string) {
  try {
    return new RegExp(
      pattern.regex ? pattern.source : wildcardExpression(pattern.source),
    ).test(value);
  } catch {
    return false;
  }
}

function matchesWebRequestRule(
  rule: WebRequestRule,
  details: chrome.webRequest.OnBeforeRequestDetails,
) {
  const includes = webRequestPatterns(rule);
  if (!includes.some((pattern) => matchesPattern(pattern, details.url))) {
    return false;
  }
  const selector =
    typeof rule.selector === 'object' && rule.selector
      ? rule.selector
      : undefined;
  const excludes = stringList(selector?.exclude).map((source) => ({
    source,
    regex: false,
  }));
  if (excludes.some((pattern) => matchesPattern(pattern, details.url))) {
    return false;
  }
  const types = stringList(selector?.type);
  return types.length === 0 || types.includes(details.type);
}

function webRequestAction(rule: WebRequestRule) {
  if (typeof rule.action === 'string') {
    return { cancel: rule.action === 'cancel', redirect: undefined };
  }
  const redirect = rule.action?.redirect;
  return {
    cancel: rule.action?.cancel === true,
    redirect:
      typeof redirect === 'string'
        ? redirect
        : (redirect?.url ?? redirect?.to ?? undefined),
  };
}

function notificationDetails(value: unknown) {
  if (!record(value)) throw new TypeError('Invalid notification details.');
  const message = text(value.text);
  if (!message) throw new TypeError('GM_notification requires text.');
  return {
    title: text(value.title, '卡牌大师'),
    message,
    iconUrl: text(value.image),
    silent: value.silent === true,
    timeout:
      typeof value.timeout === 'number' && Number.isFinite(value.timeout)
        ? Math.max(0, value.timeout)
        : 0,
    url: text(value.url),
  };
}

function downloadDetails(value: unknown) {
  if (!record(value)) throw new TypeError('Invalid download details.');
  const url = text(value.url);
  if (!url) throw new TypeError('GM_download requires a URL.');
  const conflictAction =
    value.conflictAction === 'uniquify' ||
    value.conflictAction === 'overwrite' ||
    value.conflictAction === 'prompt'
      ? value.conflictAction
      : undefined;
  return {
    url,
    filename: text(value.name) || undefined,
    saveAs: value.saveAs === true,
    conflictAction,
  };
}

function webRequestRules(value: unknown) {
  if (!Array.isArray(value)) throw new TypeError('GM_webRequest needs rules.');
  return value.map((entry) => {
    if (!record(entry)) throw new TypeError('Invalid GM_webRequest rule.');
    const selector =
      typeof entry.selector === 'string' || record(entry.selector)
        ? entry.selector
        : {};
    const action =
      typeof entry.action === 'string' || record(entry.action)
        ? entry.action
        : {};
    return {
      selector: selector as WebRequestRule['selector'],
      action: action as WebRequestRule['action'],
    } satisfies WebRequestRule;
  });
}

export class UserscriptCapabilityService {
  private readonly openTabs = new Map<number, Subscription>();
  private readonly notifications = new Map<
    string,
    Subscription & { url?: string }
  >();
  private readonly downloads = new Map<number, Subscription>();
  private readonly audioSubscriptions = new Map<string, Subscription>();
  private readonly webRequests = new Map<string, RegisteredWebRequest>();
  private readonly ready: Promise<void>;
  private nextDnrRuleId = USERSCRIPT_WEB_REQUEST_RULE_ID_START;

  constructor(private readonly api: ExtensionBackgroundApi) {
    this.ready = this.removeStaleWebRequestRules().catch(() => undefined);
    api.tabs?.onRemoved?.addListener((tabId) => this.handleTabRemoved(tabId));
    api.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
      if (!changeInfo.mutedInfo) return;
      const state = tabAudioState(tab);
      for (const subscription of this.audioSubscriptions.values()) {
        if (subscription.context.tabId !== tabId) continue;
        subscription.context.post({
          capability: 'audio',
          eventId: subscription.eventId,
          event: 'changed',
          data: state,
        });
      }
    });
    api.notifications?.onClicked?.addListener((notificationId) => {
      const subscription = this.notifications.get(notificationId);
      if (!subscription) return;
      subscription.context.post({
        capability: 'notification',
        eventId: subscription.eventId,
        event: 'clicked',
        data: {},
      });
      if (subscription.url) {
        void api.tabs.create({ url: subscription.url });
      }
    });
    api.notifications?.onClosed?.addListener((notificationId, byUser) => {
      const subscription = this.notifications.get(notificationId);
      if (!subscription) return;
      this.notifications.delete(notificationId);
      subscription.context.post({
        capability: 'notification',
        eventId: subscription.eventId,
        event: 'closed',
        data: { byUser },
      });
    });
    api.downloads?.onChanged?.addListener((delta) => {
      void this.publishDownloadChange(delta);
    });
    api.webRequest?.onBeforeRequest?.addListener(
      (details) => {
        this.publishWebRequest(details);
        return undefined;
      },
      { urls: ['<all_urls>'] },
    );
  }

  async request(
    context: CapabilityContext,
    capability: UserscriptCapability,
    payload: unknown,
  ): Promise<unknown> {
    switch (capability) {
      case 'open-tab':
        return this.openTab(context, payload);
      case 'close-tab':
        return this.closeTab(payload);
      case 'notification-create':
        return this.createNotification(context, payload);
      case 'notification-close':
        return this.closeNotification(payload);
      case 'download-start':
        return this.startDownload(context, payload);
      case 'download-cancel':
        return this.cancelDownload(payload);
      case 'tab-data-get':
        return this.getTabData(context);
      case 'tab-data-save':
        return this.saveTabData(context, payload);
      case 'tab-data-list':
        return this.listTabData(context);
      case 'cookie-list':
        return this.listCookies(context, payload);
      case 'cookie-set':
        return this.setCookie(context, payload);
      case 'cookie-delete':
        return this.deleteCookie(context, payload);
      case 'audio-set-muted':
        return this.setAudioMuted(context, payload);
      case 'audio-get-state':
        return this.getAudioState(context);
      case 'audio-subscribe':
        return this.subscribeAudio(context, payload);
      case 'audio-unsubscribe':
        return this.unsubscribeAudio(context, payload);
      case 'web-request-register':
        return this.registerWebRequest(context, payload);
      case 'web-request-unregister':
        return this.unregisterWebRequest(context, payload);
    }
  }

  async disconnect(runtimeId: string) {
    const notificationIds = [...this.notifications]
      .filter(([, value]) => value.context.runtimeId === runtimeId)
      .map(([id]) => id);
    for (const id of notificationIds) this.notifications.delete(id);
    const notifications = this.api.notifications;
    if (notifications) {
      await Promise.allSettled(
        notificationIds.map((id) => notifications.clear(id)),
      );
    }
    for (const [tabId, value] of this.openTabs) {
      if (value.context.runtimeId === runtimeId) this.openTabs.delete(tabId);
    }
    for (const [downloadId, value] of this.downloads) {
      if (value.context.runtimeId === runtimeId) {
        this.downloads.delete(downloadId);
      }
    }
    for (const [id, value] of this.audioSubscriptions) {
      if (value.context.runtimeId === runtimeId) {
        this.audioSubscriptions.delete(id);
      }
    }
    const webRequestIds = [...this.webRequests]
      .filter(([, value]) => value.context.runtimeId === runtimeId)
      .map(([id]) => id);
    await Promise.allSettled(
      webRequestIds.map((id) => this.removeWebRequest(id)),
    );
  }

  private async openTab(context: CapabilityContext, payload: unknown) {
    if (!record(payload)) throw new TypeError('Invalid open-tab request.');
    const options = record(payload.options) ? payload.options : {};
    const current = await this.api.tabs.get(context.tabId);
    const active =
      typeof options.active === 'boolean'
        ? options.active
        : options.loadInBackground !== true;
    if (options.incognito === true && !current.incognito) {
      const windows = this.api.windows;
      if (!windows) throw new Error('当前浏览器不支持创建隐私窗口。');
      const created = await windows.create({
        url: currentUrl(context, payload.url),
        incognito: true,
        focused: active,
      });
      const tabId = created?.tabs?.[0]?.id;
      return { tabId: typeof tabId === 'number' ? tabId : null };
    }
    const insert = options.insert;
    const index =
      insert === true
        ? current.index + 1
        : typeof insert === 'number'
          ? Math.max(0, current.index + insert)
          : undefined;
    const tab = await this.api.tabs.create({
      url: currentUrl(context, payload.url),
      active,
      pinned: options.pinned === true,
      ...(typeof index === 'number' ? { index } : {}),
      ...(options.setParent === false
        ? {}
        : { openerTabId: context.tabId, windowId: current.windowId }),
    });
    if (typeof tab.id !== 'number') return { tabId: null };
    const eventId = text(payload.eventId);
    if (eventId) {
      this.openTabs.set(tab.id, { context, eventId });
    }
    return { tabId: tab.id };
  }

  private async closeTab(payload: unknown) {
    if (!record(payload) || typeof payload.tabId !== 'number') {
      throw new TypeError('Invalid close-tab request.');
    }
    await this.api.tabs.remove(payload.tabId);
    return { closed: true };
  }

  private async createNotification(
    context: CapabilityContext,
    payload: unknown,
  ) {
    if (!record(payload)) throw new TypeError('Invalid notification request.');
    const details = notificationDetails(payload.details);
    const eventId = text(payload.eventId);
    const options: chrome.notifications.NotificationCreateOptions = {
      type: 'basic',
      title: details.title,
      message: details.message,
      iconUrl:
        details.iconUrl ||
        this.api.runtime.getURL(CARD_MASTER_DEFAULT_ICON_PATH),
      silent: details.silent,
    };
    const notifications = this.api.notifications;
    if (!notifications) throw new Error('当前浏览器不支持脚本通知。');
    let notificationId: string;
    try {
      notificationId = await notifications.create(options);
    } catch (error) {
      if (!details.iconUrl) throw error;
      notificationId = await notifications.create({
        ...options,
        iconUrl: this.api.runtime.getURL(CARD_MASTER_DEFAULT_ICON_PATH),
      });
    }
    if (eventId) {
      this.notifications.set(notificationId, {
        context,
        eventId,
        ...(details.url ? { url: currentUrl(context, details.url) } : {}),
      });
    }
    if (details.timeout > 0) {
      setTimeout(() => {
        void notifications.clear(notificationId);
      }, details.timeout);
    }
    return { notificationId };
  }

  private async closeNotification(payload: unknown) {
    if (!record(payload)) throw new TypeError('Invalid notification close.');
    const notificationId = text(payload.notificationId);
    if (!notificationId) throw new TypeError('Missing notification ID.');
    this.notifications.delete(notificationId);
    const notifications = this.api.notifications;
    if (!notifications) throw new Error('当前浏览器不支持脚本通知。');
    return { cleared: await notifications.clear(notificationId) };
  }

  private async startDownload(context: CapabilityContext, payload: unknown) {
    if (!record(payload)) throw new TypeError('Invalid download request.');
    const eventId = text(payload.eventId);
    const details = downloadDetails(payload.details);
    const downloads = this.api.downloads;
    if (!downloads) throw new Error('当前浏览器不支持脚本下载。');
    const downloadId = await downloads.download({
      ...details,
      conflictAction:
        details.conflictAction as chrome.downloads.DownloadOptions['conflictAction'],
    });
    if (eventId) this.downloads.set(downloadId, { context, eventId });
    return { downloadId };
  }

  private async cancelDownload(payload: unknown) {
    if (!record(payload) || typeof payload.downloadId !== 'number') {
      throw new TypeError('Invalid download cancellation.');
    }
    const downloads = this.api.downloads;
    if (!downloads) throw new Error('当前浏览器不支持脚本下载。');
    await downloads.cancel(payload.downloadId);
    return { cancelled: true };
  }

  private async getTabData(context: CapabilityContext) {
    const key = tabDataKey(context.scriptId);
    const stored = (await this.api.storage.session.get(key))[key];
    const all = record(stored) ? stored : {};
    return structuredClone(all[String(context.tabId)] ?? {});
  }

  private async saveTabData(context: CapabilityContext, payload: unknown) {
    const key = tabDataKey(context.scriptId);
    const stored = (await this.api.storage.session.get(key))[key];
    const all = record(stored) ? stored : {};
    all[String(context.tabId)] = structuredClone(payload);
    await this.api.storage.session.set({ [key]: all });
    return { saved: true };
  }

  private async listTabData(context: CapabilityContext) {
    const key = tabDataKey(context.scriptId);
    const stored = (await this.api.storage.session.get(key))[key];
    return record(stored) ? structuredClone(stored) : {};
  }

  private async listCookies(context: CapabilityContext, payload: unknown) {
    const cookies = this.api.cookies;
    if (!cookies) throw new Error('当前浏览器不支持脚本 Cookie 操作。');
    const details = record(payload) ? payload : {};
    const explicitScope = text(details.url) || text(details.domain);
    const storeId = await this.cookieStoreId(context, details.storeId);
    return await cookies.getAll({
      ...(!explicitScope || text(details.url)
        ? { url: currentUrl(context, details.url) }
        : {}),
      ...(text(details.domain) ? { domain: text(details.domain) } : {}),
      ...(text(details.name) ? { name: text(details.name) } : {}),
      ...(text(details.path) ? { path: text(details.path) } : {}),
      ...(storeId ? { storeId } : {}),
      ...(typeof details.secure === 'boolean'
        ? { secure: details.secure }
        : {}),
      ...(typeof details.session === 'boolean'
        ? { session: details.session }
        : {}),
      ...(record(details.partitionKey)
        ? { partitionKey: details.partitionKey }
        : {}),
    });
  }

  private async setCookie(context: CapabilityContext, payload: unknown) {
    const cookies = this.api.cookies;
    if (!cookies) throw new Error('当前浏览器不支持脚本 Cookie 操作。');
    if (!record(payload)) throw new TypeError('Invalid cookie details.');
    const storeId = await this.cookieStoreId(context, payload.storeId);
    const details: chrome.cookies.SetDetails = {
      url: currentUrl(context, payload.url),
      name: text(payload.name),
      value: text(payload.value),
      ...(text(payload.domain) ? { domain: text(payload.domain) } : {}),
      ...(text(payload.path) ? { path: text(payload.path) } : {}),
      ...(typeof payload.secure === 'boolean'
        ? { secure: payload.secure }
        : {}),
      ...(typeof payload.httpOnly === 'boolean'
        ? { httpOnly: payload.httpOnly }
        : {}),
      ...(typeof payload.expirationDate === 'number'
        ? { expirationDate: payload.expirationDate }
        : {}),
      ...(text(payload.sameSite)
        ? { sameSite: payload.sameSite as chrome.cookies.SameSiteStatus }
        : {}),
      ...(storeId ? { storeId } : {}),
      ...(record(payload.partitionKey)
        ? { partitionKey: payload.partitionKey }
        : {}),
    };
    return await cookies.set(details);
  }

  private async deleteCookie(context: CapabilityContext, payload: unknown) {
    const cookies = this.api.cookies;
    if (!cookies) throw new Error('当前浏览器不支持脚本 Cookie 操作。');
    if (!record(payload)) throw new TypeError('Invalid cookie details.');
    const storeId = await this.cookieStoreId(context, payload.storeId);
    return await cookies.remove({
      url: currentUrl(context, payload.url),
      name: text(payload.name),
      ...(storeId ? { storeId } : {}),
      ...(record(payload.partitionKey)
        ? { partitionKey: payload.partitionKey }
        : {}),
    });
  }

  private async cookieStoreId(
    context: CapabilityContext,
    value: unknown,
  ): Promise<string | undefined> {
    const explicit = text(value);
    if (explicit) return explicit;
    const stores = await this.api.cookies
      ?.getAllCookieStores?.()
      .catch(() => []);
    return stores?.find((store) => store.tabIds.includes(context.tabId))?.id;
  }

  private async setAudioMuted(context: CapabilityContext, payload: unknown) {
    if (!record(payload) || typeof payload.muted !== 'boolean') {
      throw new TypeError('GM_audio.setMute requires a muted boolean.');
    }
    const tabId =
      typeof payload.tabId === 'number' ? payload.tabId : context.tabId;
    const tab = await this.api.tabs.update(tabId, { muted: payload.muted });
    if (!tab) throw new Error('The target tab no longer exists.');
    return tabAudioState(tab);
  }

  private async getAudioState(context: CapabilityContext) {
    return tabAudioState(await this.api.tabs.get(context.tabId));
  }

  private subscribeAudio(context: CapabilityContext, payload: unknown) {
    if (!record(payload)) throw new TypeError('Invalid audio subscription.');
    const eventId = text(payload.eventId);
    if (!eventId) throw new TypeError('Missing audio listener ID.');
    this.audioSubscriptions.set(`${context.runtimeId}:${eventId}`, {
      context,
      eventId,
    });
    return { listenerId: eventId };
  }

  private unsubscribeAudio(context: CapabilityContext, payload: unknown) {
    if (!record(payload)) throw new TypeError('Invalid audio subscription.');
    const eventId = text(payload.eventId);
    this.audioSubscriptions.delete(`${context.runtimeId}:${eventId}`);
    return { removed: true };
  }

  private async registerWebRequest(
    context: CapabilityContext,
    payload: unknown,
  ) {
    await this.ready;
    if (!this.api.webRequest?.onBeforeRequest) {
      throw new Error('当前浏览器不支持脚本网络请求监听。');
    }
    if (!record(payload)) throw new TypeError('Invalid web request rules.');
    const eventId = text(payload.eventId);
    if (!eventId) throw new TypeError('Missing web request listener ID.');
    const rules = webRequestRules(payload.rules);
    if (rules.length > 128) {
      throw new RangeError(
        'GM_webRequest supports at most 128 rules per call.',
      );
    }
    await this.removeWebRequest(`${context.runtimeId}:${eventId}`);
    const dnrRules: chrome.declarativeNetRequest.Rule[] = [];
    for (const rule of rules) {
      for (const pattern of webRequestPatterns(rule)) {
        const action = webRequestAction(rule);
        if (!action.cancel && !action.redirect) continue;
        const id = this.nextDnrRuleId++;
        if (id > USERSCRIPT_WEB_REQUEST_RULE_ID_END) {
          throw new RangeError('GM_webRequest rule ID space is exhausted.');
        }
        dnrRules.push({
          id,
          priority: 1,
          action: action.cancel
            ? { type: 'block' }
            : {
                type: 'redirect',
                redirect: { url: currentUrl(context, action.redirect) },
              },
          condition: {
            regexFilter: pattern.regex
              ? pattern.source
              : wildcardExpression(pattern.source),
            ...(stringList(
              typeof rule.selector === 'object'
                ? rule.selector?.type
                : undefined,
            ).length > 0
              ? {
                  resourceTypes: stringList(
                    typeof rule.selector === 'object'
                      ? rule.selector?.type
                      : undefined,
                  ) as chrome.declarativeNetRequest.ResourceType[],
                }
              : {}),
          },
        });
      }
    }
    if (dnrRules.length > 0) {
      await this.api.declarativeNetRequest.updateSessionRules({
        addRules: dnrRules,
      });
    }
    const registration: RegisteredWebRequest = {
      context,
      eventId,
      rules,
      dnrRuleIds: dnrRules.map((rule) => rule.id),
    };
    this.webRequests.set(`${context.runtimeId}:${eventId}`, registration);
    return {
      listenerId: eventId,
      appliedRuleCount: dnrRules.length,
      observationEnabled: true,
    };
  }

  private async unregisterWebRequest(
    context: CapabilityContext,
    payload: unknown,
  ) {
    if (!record(payload)) throw new TypeError('Invalid web request listener.');
    const eventId = text(payload.eventId);
    await this.removeWebRequest(`${context.runtimeId}:${eventId}`);
    return { removed: true };
  }

  private async removeWebRequest(key: string) {
    const registration = this.webRequests.get(key);
    if (!registration) return;
    this.webRequests.delete(key);
    if (registration.dnrRuleIds.length > 0) {
      await this.api.declarativeNetRequest.updateSessionRules({
        removeRuleIds: registration.dnrRuleIds,
      });
    }
  }

  private async removeStaleWebRequestRules() {
    const staleRuleIds = (
      await this.api.declarativeNetRequest.getSessionRules()
    )
      .filter((rule) => isUserscriptWebRequestRuleId(rule.id))
      .map((rule) => rule.id);
    if (staleRuleIds.length > 0) {
      await this.api.declarativeNetRequest.updateSessionRules({
        removeRuleIds: staleRuleIds,
      });
    }
  }

  private async publishDownloadChange(delta: chrome.downloads.DownloadDelta) {
    const subscription = this.downloads.get(delta.id);
    if (!subscription) return;
    const downloads = this.api.downloads;
    if (!downloads) return;
    const [item] = await downloads.search({ id: delta.id }).catch(() => []);
    const deltaState =
      delta.state?.current === 'in_progress' ||
      delta.state?.current === 'complete' ||
      delta.state?.current === 'interrupted'
        ? delta.state.current
        : undefined;
    const state =
      item?.state === 'in_progress' ||
      item?.state === 'complete' ||
      item?.state === 'interrupted'
        ? item.state
        : deltaState;
    subscription.context.post({
      capability: 'download',
      eventId: subscription.eventId,
      event: 'changed',
      data: {
        downloadId: delta.id,
        ...(state ? { state } : {}),
        ...(item?.error || delta.error?.current
          ? { error: item?.error ?? delta.error?.current }
          : {}),
        ...(typeof item?.bytesReceived === 'number'
          ? { bytesReceived: item.bytesReceived }
          : {}),
        ...(typeof item?.totalBytes === 'number'
          ? { totalBytes: item.totalBytes }
          : {}),
      },
    });
    if (state === 'complete' || state === 'interrupted') {
      this.downloads.delete(delta.id);
    }
  }

  private handleTabRemoved(tabId: number) {
    const subscription = this.openTabs.get(tabId);
    if (subscription) {
      this.openTabs.delete(tabId);
      subscription.context.post({
        capability: 'open-tab',
        eventId: subscription.eventId,
        event: 'closed',
        data: { tabId },
      });
    }
    for (const [key, value] of this.audioSubscriptions) {
      if (value.context.tabId === tabId) this.audioSubscriptions.delete(key);
    }
    void this.removeTabData(tabId);
  }

  private async removeTabData(tabId: number) {
    const stored = await this.api.storage.session.get(null);
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (!key.startsWith(TAB_DATA_PREFIX) || !record(value)) continue;
      if (!Object.hasOwn(value, String(tabId))) continue;
      delete value[String(tabId)];
      updates[key] = value;
    }
    if (Object.keys(updates).length > 0) {
      await this.api.storage.session.set(updates);
    }
  }

  private publishWebRequest(details: chrome.webRequest.OnBeforeRequestDetails) {
    for (const registration of this.webRequests.values()) {
      registration.rules.forEach((rule, ruleIndex) => {
        if (!matchesWebRequestRule(rule, details)) return;
        registration.context.post({
          capability: 'web-request',
          eventId: registration.eventId,
          event: 'matched',
          data: {
            ruleIndex,
            request: {
              requestId: details.requestId,
              url: details.url,
              method: details.method,
              type: details.type,
              tabId: details.tabId,
              frameId: details.frameId,
              parentFrameId: details.parentFrameId,
              ...(details.initiator ? { initiator: details.initiator } : {}),
              timeStamp: details.timeStamp,
            },
          },
        });
      });
    }
  }
}
