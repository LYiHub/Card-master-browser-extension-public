import type { ContentBlockingService } from '../../content-blocking/application/service';
import type { ExtensionBackgroundApi } from './api';
import {
  type BilibiliCapabilityService,
  resolveCapabilityPageContext,
} from './bilibili-capability-service';
import type { ExtensionMediaResourcesService } from './media-resources-service';
import type { ExtensionMediaSpeedService } from './media-speed-service';
import type { ExtensionPageThemeService } from './page-theme-service';
import type { ExtensionRequest } from './protocol';

export const PAGE_CAPABILITY_MESSAGE_UNHANDLED = Symbol(
  'page-capability-message-unhandled',
);

type PageCapabilityRouterDependencies = {
  api: ExtensionBackgroundApi;
  contentBlocking: ContentBlockingService;
  pageTheme: ExtensionPageThemeService;
  mediaSpeed: ExtensionMediaSpeedService;
  mediaResources: ExtensionMediaResourcesService;
  platformCapabilities: BilibiliCapabilityService;
  refreshContentBlockingPages: () => void;
};

export async function routePageCapabilityBackgroundMessage(
  message: ExtensionRequest,
  sender: chrome.runtime.MessageSender,
  dependencies: PageCapabilityRouterDependencies,
): Promise<unknown | typeof PAGE_CAPABILITY_MESSAGE_UNHANDLED> {
  const {
    api,
    contentBlocking,
    pageTheme,
    mediaSpeed,
    mediaResources,
    platformCapabilities,
    refreshContentBlockingPages,
  } = dependencies;
  switch (message.type) {
    case 'content-blocking-read': {
      const settings = await contentBlocking.readSettings();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-general-save': {
      const settings = await contentBlocking.saveGeneralSettings(
        message.settings,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-set-rules-enabled': {
      const snapshot = await contentBlocking.setRulesEnabled(
        message.rulesEnabled,
      );
      refreshContentBlockingPages();
      return { snapshot };
    }
    case 'content-blocking-user-rules-add': {
      const snapshot = await contentBlocking.addUserRules(
        message.rules,
        message.session,
      );
      refreshContentBlockingPages();
      return { snapshot };
    }
    case 'content-blocking-element-batch-undo': {
      const snapshot = await contentBlocking.undoLastElementBlockingBatch();
      refreshContentBlockingPages();
      return { snapshot };
    }
    case 'content-blocking-user-rules-replace': {
      const settings = await contentBlocking.replaceUserRules(
        message.userRules,
      );
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-static-filter-toggle': {
      const settings = await contentBlocking.setBuiltInFilterEnabled(
        message.filterId,
        message.enabled,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-current-site-set': {
      const settings = await contentBlocking.setCurrentSiteFiltering(
        message.pageUrl,
        message.enabled,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-configuration-export':
      return { source: await contentBlocking.exportConfiguration() };
    case 'content-blocking-configuration-import': {
      const settings = await contentBlocking.importConfiguration(
        message.source,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-subscriptions-add': {
      const settings = await contentBlocking.addSubscriptions(message.urls);
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-subscription-remove': {
      const settings = await contentBlocking.removeSubscription(
        message.subscriptionId,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-subscription-toggle': {
      const settings = await contentBlocking.setSubscriptionEnabled(
        message.subscriptionId,
        message.enabled,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-subscriptions-auto-update': {
      const settings = await contentBlocking.setSubscriptionAutoUpdate(
        message.enabled,
      );
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-subscription-refresh': {
      const settings = await contentBlocking.refreshSubscription(
        message.subscriptionId,
      );
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'content-blocking-subscriptions-refresh': {
      const settings = await contentBlocking.refreshSubscriptions();
      refreshContentBlockingPages();
      return { settings, snapshot: settings.snapshot };
    }
    case 'page-theme-read':
      return { settings: await pageTheme.read() };
    case 'page-theme-set-enabled':
      return { settings: await pageTheme.setEnabled(message.enabled) };
    case 'page-theme-toggle-current-site': {
      const pageUrl = sender.url ?? sender.tab?.url;
      if (!pageUrl) throw new Error('暗夜降临无法确定当前站点。');
      return { settings: await pageTheme.toggleCurrentSite(pageUrl) };
    }
    case 'page-theme-settings-save':
      return { settings: await pageTheme.save(message.settings) };
    case 'page-theme-settings-reset':
      return { settings: await pageTheme.reset() };
    case 'page-theme-page-report': {
      const tabId = sender.tab?.id;
      const pageUrl = sender.url ?? sender.tab?.url;
      if (
        typeof tabId !== 'number' ||
        !pageUrl ||
        (sender.frameId ?? 0) !== 0
      ) {
        throw new Error('暗夜降临页面状态报告缺少顶层页面身份。');
      }
      await pageTheme.reportPage(tabId, pageUrl, message.snapshot);
      return { ok: true };
    }
    case 'page-theme-fetch': {
      const senderUrl = sender.url ?? sender.tab?.url;
      if (!senderUrl) throw new Error('暗夜降临资源请求缺少页面来源。');
      return pageTheme.fetch({
        ...message.request,
        origin: new URL(senderUrl).origin,
      });
    }
    case 'media-speed-read': {
      const tabId = sender.tab?.id;
      const frameUrl = sender.url ?? sender.tab?.url;
      if (typeof tabId !== 'number' || !frameUrl) {
        throw new Error('媒体倍速无法确定当前页面。');
      }
      return mediaSpeed.read({
        tabId,
        frameId: sender.frameId ?? 0,
        url: frameUrl,
        ...(sender.tab?.url ? { tabUrl: sender.tab.url } : {}),
      });
    }
    case 'media-speed-set-enabled':
    case 'media-speed-selection-set':
    case 'media-speed-settings-save': {
      const tabId = sender.tab?.id;
      const pageUrl = sender.tab?.url ?? sender.url;
      if (typeof tabId !== 'number' || !pageUrl) {
        throw new Error('媒体倍速无法确定当前页面。');
      }
      if (message.type === 'media-speed-set-enabled') {
        return mediaSpeed.setEnabled(tabId, pageUrl, message.enabled);
      }
      if (message.type === 'media-speed-selection-set') {
        return mediaSpeed.setSelection(tabId, pageUrl, message.selection);
      }
      return mediaSpeed.save(tabId, pageUrl, message.settings);
    }
    case 'media-speed-frame-report': {
      const tabId = sender.tab?.id;
      const frameUrl = sender.url ?? sender.tab?.url;
      if (typeof tabId !== 'number' || !frameUrl) {
        throw new Error('媒体倍速无法确定媒体所在页面。');
      }
      return {
        snapshot: await mediaSpeed.reportFrame({
          tabId,
          frameId: sender.frameId ?? 0,
          url: frameUrl,
          ...(sender.tab?.url ? { tabUrl: sender.tab.url } : {}),
          videoCount: message.videoCount,
          audioCount: message.audioCount,
        }),
      };
    }
    case 'media-resources-read':
    case 'media-resources-set-enabled':
    case 'media-resources-settings-update': {
      const tabId = sender.tab?.id;
      const pageUrl = sender.tab?.url ?? sender.url;
      if (typeof tabId !== 'number' || !pageUrl) {
        throw new Error('媒体资源发现无法确定当前页面。');
      }
      const snapshot =
        message.type === 'media-resources-read'
          ? await mediaResources.read(tabId, pageUrl)
          : message.type === 'media-resources-set-enabled'
            ? await mediaResources.setEnabled(tabId, pageUrl, message.enabled)
            : await mediaResources.setPresentationSettings(
                tabId,
                pageUrl,
                message.presentation,
              );
      return { snapshot };
    }
    case 'media-resources-settings-open':
      await api.tabs.create({ url: api.runtime.getURL('options.html') });
      return { ok: true };
    case 'media-resources-clear': {
      const tabId = message.targetTabId ?? sender.tab?.id;
      if (typeof tabId !== 'number') {
        throw new Error('媒体资源发现无法确定当前页面。');
      }
      const targetTab =
        message.targetTabId === undefined
          ? sender.tab
          : await api.tabs.get(message.targetTabId);
      const pageUrl = targetTab?.url ?? sender.url;
      if (!pageUrl) throw new Error('媒体资源发现无法读取目标页面地址。');
      return { snapshot: await mediaResources.clear(tabId, pageUrl) };
    }
    case 'media-resources-download':
      if (typeof message.targetTabId !== 'number') {
        throw new Error('媒体资源下载请求缺少当前标签页身份。');
      }
      await mediaResources.download(message.targetTabId, message.resourceId);
      return { ok: true };
    case 'media-resources-download-finish':
      await mediaResources.finishDownload(message.requestId);
      return { ok: true };
    case 'media-resources-inspect':
      if (typeof message.targetTabId !== 'number') {
        throw new Error('播放清单分析请求缺少当前标签页身份。');
      }
      return {
        inspection: await mediaResources.inspect(
          message.targetTabId,
          message.resourceId,
        ),
      };
    case 'media-resources-send-aria2':
      await mediaResources.sendToAria2(message.targetTabId, message.resourceId);
      return { ok: true };
    case 'media-resources-capture-set':
    case 'media-resources-capture-close': {
      const tabId = sender.tab?.id;
      const pageUrl = sender.tab?.url ?? sender.url;
      if (typeof tabId !== 'number' || !pageUrl) {
        throw new Error('缓存捕捉无法确定当前标签页。');
      }
      return {
        snapshot: await mediaResources.setCaptureEnabled(
          tabId,
          pageUrl,
          message.type === 'media-resources-capture-set'
            ? message.enabled
            : false,
          message.type === 'media-resources-capture-set',
        ),
      };
    }
    case 'bilibili-capabilities-read':
    case 'bilibili-capability-settings-read':
    case 'bilibili-capability-set-enabled':
    case 'bilibili-capability-settings-save':
    case 'bilibili-capability-command': {
      const context = await resolveCapabilityPageContext(
        api,
        sender,
        message.type === 'bilibili-capabilities-read'
          ? message.pageUrl
          : undefined,
      );
      if (!context) throw new Error('扩展能力请求缺少当前页面身份。');
      if (message.type === 'bilibili-capabilities-read') {
        return platformCapabilities.read(context);
      }
      if (message.type === 'bilibili-capability-settings-read') {
        const result = await platformCapabilities.read(context);
        const capability = result.state.capabilities[message.capabilityId];
        return {
          ...result,
          capability: {
            id: capability.id,
            settings: capability.settings,
          },
        };
      }
      if (message.type === 'bilibili-capability-set-enabled') {
        return platformCapabilities.setEnabled(
          message.capabilityId,
          message.enabled,
          context,
        );
      }
      if (message.type === 'bilibili-capability-settings-save') {
        return platformCapabilities.saveSettings(message.capability, context);
      }
      return platformCapabilities.execute(
        message.capabilityId,
        message.command,
        context,
      );
    }
    default:
      return PAGE_CAPABILITY_MESSAGE_UNHANDLED;
  }
}
