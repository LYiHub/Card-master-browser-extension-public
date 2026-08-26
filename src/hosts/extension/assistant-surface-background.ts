import type {
  AssistantSurfaceContext,
  AssistantSurfaceNavigationMessage,
  AssistantWorkbenchTab,
} from '../../ai/domain/types';
import type { ExtensionBackgroundApi, ExtensionPort } from './api';
import {
  assistantSurfaceLifecyclePortTabId,
  assistantSurfacePath,
} from './assistant-surface-path';

type SurfaceFailureReporter = (
  event: string,
  error: unknown,
  details?: Readonly<Record<string, unknown>>,
) => void;

type AssistantSurface = {
  configure?(tabId: number, path: string): Promise<void>;
  open(tabId: number, path: string): Promise<void>;
};

function sidebarUserInputRequired(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(
    'sidebarAction.open may only be called from a user input handler',
  );
}

class FirefoxSidebarUserActionRequiredError extends Error {
  constructor(cause: unknown) {
    super(
      'Firefox 只允许从浏览器扩展界面打开原生侧边栏。请点击工具栏中的 卡牌大师图标，或从 Firefox 侧边栏列表打开“卡牌大师智能体”。',
      { cause },
    );
    this.name = 'FirefoxSidebarUserActionRequiredError';
  }
}

async function openPopupSurface(api: ExtensionBackgroundApi, path: string) {
  const url = api.runtime.getURL(path);
  if (api.windows?.create) {
    await api.windows.create({
      url,
      type: 'popup',
      width: 480,
      height: 780,
    });
    return;
  }
  await api.tabs.create({ url });
}

function createAssistantSurface(api: ExtensionBackgroundApi): AssistantSurface {
  const sidePanel = api.sidePanel;
  if (sidePanel?.open && sidePanel.setOptions) {
    return {
      configure: (tabId, path) =>
        sidePanel.setOptions({ tabId, path, enabled: true }),
      open: (tabId) => sidePanel.open({ tabId }),
    };
  }
  const sidebarAction = api.sidebarAction;
  if (sidebarAction?.open && sidebarAction.setPanel) {
    return {
      configure: (tabId, path) =>
        sidebarAction.setPanel({ tabId, panel: path }),
      open: async (_tabId, _path) => {
        try {
          await sidebarAction.open();
        } catch (error) {
          if (!sidebarUserInputRequired(error)) throw error;
          throw new FirefoxSidebarUserActionRequiredError(error);
        }
      },
    };
  }
  return {
    open: (_tabId, path) => openPopupSurface(api, path),
  };
}

export class AssistantSurfaceCoordinator {
  private readonly activePanels = new Map<number, ExtensionPort>();
  private readonly openingTabs = new Set<number>();
  private readonly requestedTabs = new Map<number, AssistantWorkbenchTab>();
  private readonly surface: AssistantSurface;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly reportFailure: SurfaceFailureReporter = () => undefined,
  ) {
    this.surface = createAssistantSurface(api);
  }

  install() {
    this.api.runtime.onConnect.addListener((port) => {
      const tabId = assistantSurfaceLifecyclePortTabId(port.name);
      if (tabId === null) return;
      this.activePanels.set(tabId, port);
      port.onDisconnect.addListener(() => {
        if (this.activePanels.get(tabId) === port) {
          this.activePanels.delete(tabId);
        }
        this.requestedTabs.delete(tabId);
      });
    });
    if (!this.surface.configure) return;
    this.api.tabs.onCreated.addListener((tab) => {
      if (typeof tab.id === 'number') this.configureInBackground(tab.id);
    });
    this.api.runtime.onInstalled.addListener(() => {
      this.configureExistingTabsInBackground();
    });
    this.api.runtime.onStartup.addListener(() => {
      this.configureExistingTabsInBackground();
    });
    this.configureExistingTabsInBackground();
  }

  async open(tabId: number, tab?: AssistantWorkbenchTab) {
    const activePanel = this.activePanels.get(tabId);
    if (tab) this.requestedTabs.set(tabId, tab);
    if (activePanel && tab) {
      const message: AssistantSurfaceNavigationMessage = {
        type: 'assistant-surface-navigate',
        tab,
      };
      activePanel.postMessage(message);
    }
    const configuration = this.configure(tabId).catch((error) => {
      this.reportFailure('tab-configuration-failed', error, { tabId });
    });
    if (activePanel || this.openingTabs.has(tabId)) {
      await configuration;
      return;
    }
    this.openingTabs.add(tabId);
    try {
      await this.surface.open(tabId, assistantSurfacePath(tabId));
    } catch (error) {
      if (
        !(error instanceof FirefoxSidebarUserActionRequiredError) &&
        tab &&
        this.requestedTabs.get(tabId) === tab
      ) {
        this.requestedTabs.delete(tabId);
      }
      throw error;
    } finally {
      this.openingTabs.delete(tabId);
    }
    await configuration;
  }

  async context(tabId: number): Promise<AssistantSurfaceContext> {
    const initialTab = this.requestedTabs.get(tabId);
    this.requestedTabs.delete(tabId);
    let title = '';
    let url = '';
    try {
      const tab = await this.api.tabs.get(tabId);
      title = tab.title ?? '';
      url = tab.url ?? '';
    } catch {
      // The surface remains usable and can select another target tab.
    }
    return {
      tabId,
      title,
      url,
      ...(initialTab ? { initialTab } : {}),
    };
  }

  private configure(tabId: number) {
    return (
      this.surface.configure?.(tabId, assistantSurfacePath(tabId)) ??
      Promise.resolve()
    );
  }

  private configureInBackground(tabId: number) {
    void this.configure(tabId).catch((error) => {
      this.reportFailure('tab-configuration-failed', error, { tabId });
    });
  }

  private configureExistingTabsInBackground() {
    void this.configureExistingTabs().catch((error) => {
      this.reportFailure('existing-tab-configuration-failed', error);
    });
  }

  private async configureExistingTabs() {
    const tabs = await this.api.tabs.query({});
    await Promise.all(
      tabs.flatMap((tab) =>
        typeof tab.id === 'number'
          ? [
              this.configure(tab.id).catch((error) => {
                this.reportFailure('tab-configuration-failed', error, {
                  tabId: tab.id,
                });
              }),
            ]
          : [],
      ),
    );
  }
}
