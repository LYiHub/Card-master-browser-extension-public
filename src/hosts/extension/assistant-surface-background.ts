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

export type DockingPlacement =
  | 'external-right'
  | 'internal-right'
  | 'internal-fullscreen'
  | 'fallback';

export type ScreenMetrics = {
  availLeft?: number;
  availTop?: number;
  availWidth?: number;
  availHeight?: number;
  width?: number;
  height?: number;
};

export type SidebarWindowBounds = {
  left?: number;
  top?: number;
  width: number;
  height: number;
  dockingPlacement?: DockingPlacement;
};

export const DEFAULT_SIDEBAR_WIDTH = 480;

declare global {
  var __cardMasterPopupLogs: string[] | undefined;
  var dumpCardMasterLogs: (() => string) | undefined;
}

export function formatLogPayload(payload: unknown): string {
  if (payload === undefined) return '';
  if (typeof payload === 'string') return payload;
  if (payload instanceof Error) {
    return JSON.stringify({
      name: payload.name,
      message: payload.message,
      stack: payload.stack,
    });
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function logPopupDiagnostic(tag: string, payload?: unknown) {
  const line =
    payload === undefined ? tag : `${tag} ${formatLogPayload(payload)}`;
  console.log(line);
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__cardMasterPopupLogs) {
      globalThis.__cardMasterPopupLogs = [];
      globalThis.dumpCardMasterLogs = () =>
        globalThis.__cardMasterPopupLogs?.join('\n') ?? 'No logs recorded.';
    }
    globalThis.__cardMasterPopupLogs.push(line);
  }
}

export function warnPopupDiagnostic(tag: string, errorOrPayload?: unknown) {
  const details =
    errorOrPayload instanceof Error
      ? { message: errorOrPayload.message, stack: errorOrPayload.stack }
      : errorOrPayload;
  const line = `${tag} ${formatLogPayload(details)}`;
  console.warn(line);
  if (typeof globalThis !== 'undefined') {
    if (!globalThis.__cardMasterPopupLogs) {
      globalThis.__cardMasterPopupLogs = [];
      globalThis.dumpCardMasterLogs = () =>
        globalThis.__cardMasterPopupLogs?.join('\n') ?? 'No logs recorded.';
    }
    globalThis.__cardMasterPopupLogs.push(`[WARN] ${line}`);
  }
}

export async function calculateSidebarBounds(
  api: ExtensionBackgroundApi,
  targetWidth = DEFAULT_SIDEBAR_WIDTH,
  tabId?: number,
  screenMetrics?: ScreenMetrics,
): Promise<SidebarWindowBounds> {
  let hostWin: chrome.windows.Window | undefined;
  let detectionSource = 'default';

  if (typeof tabId === 'number' && api.tabs?.get && api.windows?.get) {
    try {
      const tab = await api.tabs.get(tabId);
      if (typeof tab?.windowId === 'number') {
        hostWin = await api.windows.get(tab.windowId);
        detectionSource = `tab-${tabId}-window-${tab.windowId}`;
      }
    } catch (tabErr) {
      warnPopupDiagnostic(
        '[CardMaster:Popup:Background] Tab query for host window failed:',
        tabErr,
      );
    }
  }

  if (!hostWin && api.windows?.getLastFocused) {
    try {
      hostWin = await api.windows.getLastFocused({ populate: false });
      detectionSource = 'getLastFocused';
    } catch (lastFocusedErr) {
      warnPopupDiagnostic(
        '[CardMaster:Popup:Background] getLastFocused for host window failed:',
        lastFocusedErr,
      );
    }
  }

  if (!hostWin && api.windows?.getCurrent) {
    try {
      hostWin = await api.windows.getCurrent({ populate: false });
      detectionSource = 'getCurrent';
    } catch (currentErr) {
      warnPopupDiagnostic(
        '[CardMaster:Popup:Background] getCurrent for host window failed:',
        currentErr,
      );
    }
  }

  logPopupDiagnostic('[CardMaster:Popup:Background] [CP-1:HostDetection]', {
    detectionSource,
    tabId,
    hostWindowId: hostWin?.id,
    type: hostWin?.type,
    state: hostWin?.state,
    left: hostWin?.left,
    top: hostWin?.top,
    width: hostWin?.width,
    height: hostWin?.height,
    focused: hostWin?.focused,
  });

  if (
    hostWin &&
    typeof hostWin.width === 'number' &&
    typeof hostWin.height === 'number'
  ) {
    const winLeft = hostWin.left ?? 0;
    const winTop = hostWin.top ?? 0;
    const winWidth = hostWin.width;
    const winHeight = hostWin.height;

    const screenLeft = screenMetrics?.availLeft ?? 0;
    const screenTop = screenMetrics?.availTop ?? 0;
    const defaultScreenWidth =
      winLeft + winWidth > 1920 ? winLeft + winWidth : 1920;
    const screenWidth =
      screenMetrics?.availWidth ?? screenMetrics?.width ?? defaultScreenWidth;
    const screenHeight =
      screenMetrics?.availHeight ?? screenMetrics?.height ?? 1080;
    const screenRight = screenLeft + screenWidth;
    const screenBottom = screenTop + screenHeight;

    const isHostMaximized =
      hostWin.state === 'maximized' || hostWin.state === 'fullscreen';
    const hostRight = winLeft + winWidth;
    const spaceOnRight = screenRight - hostRight;

    let targetLeft: number;
    let dockingPlacement: DockingPlacement;

    // (a) 如果不是全屏/最大化，且右侧桌面空间充足（>= targetWidth），在浏览器外部的右侧展示
    if (!isHostMaximized && spaceOnRight >= targetWidth) {
      targetLeft = hostRight;
      dockingPlacement = 'external-right';
    } else {
      // (b) 如果是全屏或者右侧空间不足，在浏览器内部的右侧展示
      targetLeft = hostRight - targetWidth;
      targetLeft = Math.max(
        screenLeft,
        Math.min(targetLeft, screenRight - targetWidth),
      );
      dockingPlacement = isHostMaximized
        ? 'internal-fullscreen'
        : 'internal-right';
    }

    let targetTop = Math.max(screenTop, winTop);
    const targetHeight = Math.min(screenHeight, Math.max(600, winHeight));
    if (targetTop + targetHeight > screenBottom) {
      targetTop = Math.max(screenTop, screenBottom - targetHeight);
    }

    const bounds: SidebarWindowBounds = {
      left: Math.round(targetLeft),
      top: Math.round(targetTop),
      width: targetWidth,
      height: Math.round(targetHeight),
      dockingPlacement,
    };
    logPopupDiagnostic('[CardMaster:Popup:Background] [CP-2:TargetBounds]', {
      ...bounds,
      spaceOnRight,
      screenWidth,
      screenHeight,
      isHostMaximized,
    });
    return bounds;
  }

  const defaultBounds: SidebarWindowBounds = {
    width: targetWidth,
    height: 900,
    dockingPlacement: 'fallback',
  };
  logPopupDiagnostic(
    '[CardMaster:Popup:Background] [CP-2:TargetBoundsFallback]',
    defaultBounds,
  );
  return defaultBounds;
}

let activePopupWindowId: number | null = null;
let lastAdjustedWindowId: number | null = null;
let lastAdjustedBounds: SidebarWindowBounds | null = null;
let popupCloseListenerInstalled = false;

function ensurePopupCloseListener(api: ExtensionBackgroundApi) {
  if (popupCloseListenerInstalled || !api.windows?.onRemoved) return;
  popupCloseListenerInstalled = true;
  api.windows.onRemoved.addListener((windowId) => {
    if (windowId === activePopupWindowId) {
      activePopupWindowId = null;
      lastAdjustedWindowId = null;
      lastAdjustedBounds = null;
    }
  });
}

export async function enforcePopupSidebarLayout(
  api: ExtensionBackgroundApi,
  tabId?: number,
  screenMetrics?: ScreenMetrics,
): Promise<SidebarWindowBounds | null> {
  if (activePopupWindowId === null || !api.windows?.update) return null;
  const targetWinId = activePopupWindowId;

  const bounds = await calculateSidebarBounds(
    api,
    DEFAULT_SIDEBAR_WIDTH,
    tabId,
    screenMetrics,
  );

  if (
    lastAdjustedWindowId === targetWinId &&
    lastAdjustedBounds &&
    lastAdjustedBounds.left === bounds.left &&
    lastAdjustedBounds.top === bounds.top &&
    lastAdjustedBounds.width === bounds.width &&
    lastAdjustedBounds.height === bounds.height
  ) {
    return bounds;
  }

  try {
    const updateResult = await api.windows.update(targetWinId, {
      state: 'normal',
      width: bounds.width,
      height: bounds.height,
      ...(typeof bounds.left === 'number' ? { left: bounds.left } : {}),
      ...(typeof bounds.top === 'number' ? { top: bounds.top } : {}),
      focused: true,
    });
    lastAdjustedWindowId = targetWinId;
    lastAdjustedBounds = bounds;
    logPopupDiagnostic(
      '[CardMaster:Popup:Background] [CP-4:SingleLayoutAdjustmentSuccess]',
      {
        id: updateResult?.id,
        type: updateResult?.type,
        state: updateResult?.state,
        left: updateResult?.left,
        top: updateResult?.top,
        width: updateResult?.width,
        height: updateResult?.height,
        dockingPlacement: bounds.dockingPlacement,
      },
    );
    return bounds;
  } catch (updateErr) {
    warnPopupDiagnostic(
      '[CardMaster:Popup:Background] [CP-4:SingleLayoutAdjustmentError]',
      updateErr,
    );
    return null;
  }
}

async function openPopupSurface(
  api: ExtensionBackgroundApi,
  path: string,
  tabId?: number,
) {
  const url = api.runtime.getURL(path);
  ensurePopupCloseListener(api);

  logPopupDiagnostic('[CardMaster:Popup:Background] [CP-0:OpenRequest]', {
    path,
    url,
    tabId,
    activePopupWindowId,
  });

  if (activePopupWindowId !== null && api.windows?.get && api.windows?.update) {
    try {
      const existing = await api.windows.get(activePopupWindowId);
      if (existing) {
        logPopupDiagnostic(
          '[CardMaster:Popup:Background] [CP-0:FocusExisting]',
          {
            activePopupWindowId,
            existing,
          },
        );
        await api.windows.update(activePopupWindowId, { focused: true });
        return;
      }
    } catch {
      activePopupWindowId = null;
    }
  }

  if (api.windows?.create) {
    try {
      // 1. 允许浏览器自然创建弹出窗口，不抢跑设置尺寸/位置，避免与 Arc/AppKit 默认展开动画冲突产生反复闪烁
      const createData: chrome.windows.CreateData = {
        url,
        type: 'popup',
        focused: true,
      };
      logPopupDiagnostic(
        '[CardMaster:Popup:Background] [CP-3:CallingWindowsCreateNatural]',
        createData,
      );

      const win = await api.windows.create(createData);
      activePopupWindowId = win?.id ?? null;
      lastAdjustedWindowId = null;
      lastAdjustedBounds = null;
      logPopupDiagnostic(
        '[CardMaster:Popup:Background] [CP-3:WindowCreatedNaturally]',
        {
          id: win?.id,
          type: win?.type,
          state: win?.state,
          left: win?.left,
          top: win?.top,
          width: win?.width,
          height: win?.height,
          focused: win?.focused,
        },
      );

      // 2. 安排单次平滑布局调整：待浏览器窗口展开动画稳定后（~350ms），单次调整至计算出的侧栏目标尺寸与位置
      //    （若客户端页面更早加载并上报了屏幕规格，则会先行完成调整，此定时器作为保底）
      if (win?.id && api.windows.update) {
        setTimeout(async () => {
          if (activePopupWindowId === win.id) {
            await enforcePopupSidebarLayout(api, tabId);
          }
        }, 350);
      }
      return;
    } catch (error) {
      warnPopupDiagnostic(
        '[CardMaster:Popup:Background] [CP-3:CreateFailed]',
        error,
      );
      throw error;
    }
  }
  logPopupDiagnostic(
    '[CardMaster:Popup:Background] api.windows.create unavailable, using api.tabs.create',
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
      open: (tabId, path) => openPopupSurface(api, path, tabId),
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
    open: (tabId, path) => openPopupSurface(api, path, tabId),
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
    logPopupDiagnostic(
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
      logPopupDiagnostic(
        `[CardMaster:Assistant] Deferring cold-start catchup for tab ${tabId} because it is currently opening`,
      );
      return;
    }
    this.coldStartPendingOpen = null;
    if (this.preference === 'popup') {
      logPopupDiagnostic(
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
        warnPopupDiagnostic(
          `[CardMaster:Assistant] Cold-start popup failed for tab ${tabId}:`,
          error,
        );
        this.reportFailure('cold-start-popup-failed', error, { tabId });
      });
    }
  }

  async syncPopupLayout(tabId?: number, screenMetrics?: ScreenMetrics) {
    return enforcePopupSidebarLayout(this.api, tabId, screenMetrics);
  }

  install() {
    this.api.runtime.onConnect.addListener((port) => {
      const tabId = assistantSurfaceLifecyclePortTabId(port.name);
      if (tabId === null) return;
      this.activePanels.set(tabId, {
        port,
        mode: this.preference,
      });
      port.onMessage.addListener((message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          (message as { type?: string }).type ===
            'assistant-surface-screen-metrics'
        ) {
          const metrics = (message as { screen?: ScreenMetrics }).screen;
          logPopupDiagnostic(
            `[CardMaster:Assistant] Received screen metrics from tab ${tabId}:`,
            metrics,
          );
          void enforcePopupSidebarLayout(this.api, tabId, metrics);
        }
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
      logPopupDiagnostic(
        `[CardMaster:Assistant] open() received detectedBrowser: arc. Forcing popup mode for tab ${tabId}.`,
      );
      this.setSurfacePreference('popup');
    }
    logPopupDiagnostic(
      `[CardMaster:Assistant] open() called for tab ${tabId}, preference: ${this.preference}, preferenceReady: ${Boolean(this.preferenceReady)}`,
    );
    if (this.preferenceReady) {
      // 必须保护手势的仅限于 Firefox 的 sidebarAction.open()；
      // 在非 Firefox 环境（Chromium / Arc / Edge）或当前已确认为 popup 模式下，直接等待 1ms 的 preferenceReady，从源头避免盲开错。
      if (!this.api.sidebarAction || this.preference === 'popup') {
        logPopupDiagnostic(
          `[CardMaster:Assistant] Awaiting preferenceReady for tab ${tabId}...`,
        );
        await this.preferenceReady;
      }
    }
    const activePanel = this.activePanels.get(tabId);
    if (tab) this.requestedTabs.set(tabId, tab);
    if (activePanel && tab) {
      logPopupDiagnostic(
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
      logPopupDiagnostic(
        `[CardMaster:Assistant] Early return: sameModeActive=${Boolean(isSameModeAlreadyActive)}, openingTabs=${this.openingTabs.has(tabId)}`,
      );
      await configuration;
      return;
    }

    // 若当前存在活跃面板但模式不同（例如从原生侧栏切到独立窗口），清理旧面板连接并切换打开
    if (activePanel && activePanel.mode !== this.preference) {
      logPopupDiagnostic(
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
      logPopupDiagnostic(
        `[CardMaster:Assistant] Calling this.surface.open(mode: ${this.preference}) for tab ${tabId}...`,
      );
      await this.surface.open(tabId, assistantSurfacePath(tabId));
      logPopupDiagnostic(
        `[CardMaster:Assistant] surface.open successfully completed for tab ${tabId}`,
      );
    } catch (error) {
      warnPopupDiagnostic(
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
