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
import { isExtensionPageLifecycleInterrupted } from './diagnostics';

function isRestrictedBrowserTabUrl(url?: string): boolean {
  if (!url) return false;
  return /^(?:chrome|arc|edge|about|devtools|view-source|chrome-extension):/i.test(
    url,
  );
}

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

export type SidebarWindowBounds = {
  left?: number;
  top?: number;
  width: number;
  height: number;
};

export const DEFAULT_SIDEBAR_WIDTH = 480;

export async function calculateSidebarBounds(
  api: ExtensionBackgroundApi,
  targetWidth = DEFAULT_SIDEBAR_WIDTH,
): Promise<SidebarWindowBounds> {
  try {
    const currentWin = await api.windows?.getCurrent?.({ populate: false });
    if (
      currentWin &&
      typeof currentWin.width === 'number' &&
      typeof currentWin.height === 'number'
    ) {
      const winLeft = currentWin.left ?? 0;
      const winTop = currentWin.top ?? 0;
      const winWidth = currentWin.width;
      const winHeight = currentWin.height;

      // Position docked on the right edge of the current browser window, matching its height
      const targetLeft = Math.max(0, winLeft + winWidth - targetWidth);
      const targetTop = Math.max(0, winTop);
      const targetHeight = Math.max(600, winHeight);

      return {
        left: Math.round(targetLeft),
        top: Math.round(targetTop),
        width: targetWidth,
        height: Math.round(targetHeight),
      };
    }
  } catch (err) {
    console.warn(
      '[CardMaster:Assistant] Failed to calculate current window bounds for sidebar:',
      err,
    );
  }

  return {
    width: targetWidth,
    height: 900,
  };
}

let activePopupWindowId: number | null = null;
let popupCloseListenerInstalled = false;

function ensurePopupCloseListener(api: ExtensionBackgroundApi) {
  if (popupCloseListenerInstalled || !api.windows?.onRemoved) return;
  popupCloseListenerInstalled = true;
  api.windows.onRemoved.addListener((windowId) => {
    if (windowId === activePopupWindowId) {
      activePopupWindowId = null;
    }
  });
}

async function openPopupSurface(api: ExtensionBackgroundApi, path: string) {
  const url = api.runtime.getURL(path);
  ensurePopupCloseListener(api);

  if (activePopupWindowId !== null && api.windows?.get && api.windows?.update) {
    try {
      const existing = await api.windows.get(activePopupWindowId);
      if (existing) {
        console.log(
          '[CardMaster:Assistant] Focusing existing popup window:',
          activePopupWindowId,
        );
        await api.windows.update(activePopupWindowId, { focused: true });
        return;
      }
    } catch {
      activePopupWindowId = null;
    }
  }

  console.log('[CardMaster:Assistant] openPopupSurface url:', url);
  if (api.windows?.create) {
    try {
      const bounds = await calculateSidebarBounds(api);
      console.log('[CardMaster:Assistant] Target sidebar bounds:', bounds);

      const win = await api.windows.create({
        url,
        type: 'popup',
        width: bounds.width,
        height: bounds.height,
        ...(typeof bounds.left === 'number' ? { left: bounds.left } : {}),
        ...(typeof bounds.top === 'number' ? { top: bounds.top } : {}),
        focused: true,
      });
      activePopupWindowId = win?.id ?? null;
      console.log(
        '[CardMaster:Assistant] Popup window created successfully:',
        win,
      );

      // Arc and macOS window managers often default to window state or ignore create bounds.
      // Explicitly enforce target sidebar bounds via api.windows.update:
      if (win?.id && api.windows.update) {
        try {
          await api.windows.update(win.id, {
            width: bounds.width,
            height: bounds.height,
            ...(typeof bounds.left === 'number' ? { left: bounds.left } : {}),
            ...(typeof bounds.top === 'number' ? { top: bounds.top } : {}),
            focused: true,
          });
          console.log(
            '[CardMaster:Assistant] Sidebar bounds enforced via update:',
            win.id,
          );
        } catch (updateErr) {
          console.warn(
            '[CardMaster:Assistant] windows.update bounds failed:',
            updateErr,
          );
        }
      }
      return;
    } catch (error) {
      console.error('[CardMaster:Assistant] api.windows.create failed:', error);
      throw error;
    }
  }
  console.log(
    '[CardMaster:Assistant] api.windows.create unavailable, using api.tabs.create',
  );
  await api.tabs.create({ url });
}

export type AssistantPanelMode = 'sidePanel' | 'popup';

export function normalizeAssistantPanelMode(
  value: unknown,
): AssistantPanelMode {
  return value === 'popup' ? 'popup' : 'sidePanel';
}

function createAssistantSurface(
  api: ExtensionBackgroundApi,
  preference: AssistantPanelMode = 'sidePanel',
): AssistantSurface {
  if (preference === 'popup') {
    return {
      open: (_tabId, path) => openPopupSurface(api, path),
    };
  }
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

type ActiveAssistantPanel = {
  port: ExtensionPort;
  mode: AssistantPanelMode;
};

export class AssistantSurfaceCoordinator {
  private readonly activePanels = new Map<number, ActiveAssistantPanel>();
  private readonly openingTabs = new Set<number>();
  private readonly requestedTabs = new Map<number, AssistantWorkbenchTab>();
  private surface: AssistantSurface;
  private preference: AssistantPanelMode;
  private preferenceReady: Promise<unknown> | null = null;
  private coldStartPendingOpen: {
    tabId: number;
    tab?: AssistantWorkbenchTab;
  } | null = null;
  private readonly reportFailure: SurfaceFailureReporter;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    preferenceOrReporter?: AssistantPanelMode | SurfaceFailureReporter,
    reportFailure?: SurfaceFailureReporter,
  ) {
    if (typeof preferenceOrReporter === 'function') {
      this.preference = 'sidePanel';
      this.reportFailure = preferenceOrReporter;
    } else {
      this.preference = preferenceOrReporter ?? 'sidePanel';
      this.reportFailure = reportFailure ?? (() => undefined);
    }
    this.surface = createAssistantSurface(api, this.preference);
  }

  setPreferenceReady(ready: Promise<unknown> | null) {
    this.preferenceReady = ready;
    if (ready) {
      ready.finally(() => {
        if (this.preferenceReady === ready) {
          this.preferenceReady = null;
          this.triggerColdStartCatchUp();
        }
      });
    }
  }

  setSurfacePreference(preference: AssistantPanelMode) {
    if (this.preference === preference) return;
    const previous = this.preference;
    this.preference = preference;
    this.surface = createAssistantSurface(this.api, preference);
    console.log(
      `[CardMaster:Assistant] Coordinator mode changed: ${previous} -> ${preference}`,
    );
    if (this.surface.configure) {
      this.configureExistingTabsInBackground();
    }
  }

  getPreference(): AssistantPanelMode {
    return this.preference;
  }

  private triggerColdStartCatchUp() {
    if (!this.coldStartPendingOpen) return;
    const { tabId, tab } = this.coldStartPendingOpen;
    if (this.openingTabs.has(tabId)) {
      console.log(
        `[CardMaster:Assistant] Deferring cold-start catchup for tab ${tabId} because it is currently opening`,
      );
      return;
    }
    this.coldStartPendingOpen = null;
    if (this.preference === 'popup') {
      console.log(
        `[CardMaster:Assistant] Cold-start catchup triggered for tab ${tabId} in popup mode`,
      );
      // 主动清理因冷启动抢跑误打开的原生侧栏连接，确保补开调用不再被早退守卫拦截
      const premature = this.activePanels.get(tabId);
      if (premature) {
        try {
          premature.port.disconnect();
        } catch {}
        this.activePanels.delete(tabId);
      }
      void this.open(tabId, tab).catch((error) => {
        console.error(
          `[CardMaster:Assistant] Cold-start popup failed for tab ${tabId}:`,
          error,
        );
        this.reportFailure('cold-start-popup-failed', error, { tabId });
      });
    }
  }

  install() {
    this.api.runtime.onConnect.addListener((port) => {
      const tabId = assistantSurfaceLifecyclePortTabId(port.name);
      if (tabId === null) return;
      this.activePanels.set(tabId, {
        port,
        mode: this.preference,
      });
      port.onDisconnect.addListener(() => {
        if (this.activePanels.get(tabId)?.port === port) {
          this.activePanels.delete(tabId);
        }
        this.requestedTabs.delete(tabId);
      });
    });
    const supportsTabConfiguration = Boolean(
      (this.api.sidePanel?.open && this.api.sidePanel?.setOptions) ||
        (this.api.sidebarAction?.open && this.api.sidebarAction?.setPanel),
    );
    if (!supportsTabConfiguration) return;
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

  async open(
    tabId: number,
    tab?: AssistantWorkbenchTab,
    detectedBrowser?: string,
  ) {
    if (detectedBrowser === 'arc' && this.preference !== 'popup') {
      console.log(
        `[CardMaster:Assistant] open() received detectedBrowser: arc. Forcing popup mode for tab ${tabId}.`,
      );
      this.setSurfacePreference('popup');
    }
    console.log(
      `[CardMaster:Assistant] open() called for tab ${tabId}, preference: ${this.preference}, preferenceReady: ${Boolean(this.preferenceReady)}`,
    );
    if (this.preferenceReady) {
      // 必须保护手势的仅限于 Firefox 的 sidebarAction.open()；
      // 在非 Firefox 环境（Chromium / Arc / Edge）或当前已确认为 popup 模式下，直接等待 1ms 的 preferenceReady，从源头避免盲开错。
      if (!this.api.sidebarAction || this.preference === 'popup') {
        console.log(
          `[CardMaster:Assistant] Awaiting preferenceReady for tab ${tabId}...`,
        );
        await this.preferenceReady;
      }
    }
    const activePanel = this.activePanels.get(tabId);
    if (tab) this.requestedTabs.set(tabId, tab);
    if (activePanel && tab) {
      console.log(
        `[CardMaster:Assistant] Active panel exists for tab ${tabId}, sending navigate message`,
      );
      const message: AssistantSurfaceNavigationMessage = {
        type: 'assistant-surface-navigate',
        tab,
      };
      activePanel.port.postMessage(message);
    }
    const configuration = this.configure(tabId).catch((error) => {
      this.reportFailure('tab-configuration-failed', error, { tabId });
    });

    const isSameModeAlreadyActive =
      activePanel && activePanel.mode === this.preference;
    if (isSameModeAlreadyActive || this.openingTabs.has(tabId)) {
      console.log(
        `[CardMaster:Assistant] Early return: sameModeActive=${Boolean(isSameModeAlreadyActive)}, openingTabs=${this.openingTabs.has(tabId)}`,
      );
      await configuration;
      return;
    }

    // 若当前存在活跃面板但模式不同（例如从原生侧栏切到独立窗口），清理旧面板连接并切换打开
    if (activePanel && activePanel.mode !== this.preference) {
      console.log(
        `[CardMaster:Assistant] Active panel mode mismatch (${activePanel.mode} vs ${this.preference}), switching surface for tab ${tabId}`,
      );
      try {
        activePanel.port.disconnect();
      } catch {}
      this.activePanels.delete(tabId);
    }

    if (this.preferenceReady) {
      this.coldStartPendingOpen = { tabId, tab };
    }
    this.openingTabs.add(tabId);
    try {
      console.log(
        `[CardMaster:Assistant] Calling this.surface.open(mode: ${this.preference}) for tab ${tabId}...`,
      );
      await this.surface.open(tabId, assistantSurfacePath(tabId));
      console.log(
        `[CardMaster:Assistant] surface.open successfully completed for tab ${tabId}`,
      );
    } catch (error) {
      console.error(
        `[CardMaster:Assistant] surface.open failed for tab ${tabId}:`,
        error,
      );
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
      if (!this.preferenceReady) {
        this.triggerColdStartCatchUp();
      }
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
      if (!isExtensionPageLifecycleInterrupted(error)) {
        this.reportFailure('tab-configuration-failed', error, { tabId });
      }
    });
  }

  private configureExistingTabsInBackground() {
    void this.configureExistingTabs().catch((error) => {
      if (!isExtensionPageLifecycleInterrupted(error)) {
        this.reportFailure('existing-tab-configuration-failed', error);
      }
    });
  }

  private async configureExistingTabs() {
    const tabs = await this.api.tabs.query({});
    await Promise.all(
      tabs.flatMap((tab) => {
        if (typeof tab.id !== 'number') return [];
        if (tab.url && isRestrictedBrowserTabUrl(tab.url)) return [];
        return [
          this.configure(tab.id).catch((error) => {
            if (!isExtensionPageLifecycleInterrupted(error)) {
              this.reportFailure('tab-configuration-failed', error, {
                tabId: tab.id,
              });
            }
          }),
        ];
      }),
    );
  }
}
