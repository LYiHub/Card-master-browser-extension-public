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

    // Position docked on the right edge of the host browser window, matching its height
    const targetLeft = Math.max(0, winLeft + winWidth - targetWidth);
    const targetTop = Math.max(0, winTop);
    const targetHeight = Math.max(600, winHeight);

    const bounds: SidebarWindowBounds = {
      left: Math.round(targetLeft),
      top: Math.round(targetTop),
      width: targetWidth,
      height: Math.round(targetHeight),
    };
    logPopupDiagnostic(
      '[CardMaster:Popup:Background] [CP-2:TargetBounds]',
      bounds,
    );
    return bounds;
  }

  const defaultBounds: SidebarWindowBounds = {
    width: targetWidth,
    height: 900,
  };
  logPopupDiagnostic(
    '[CardMaster:Popup:Background] [CP-2:TargetBoundsFallback]',
    defaultBounds,
  );
  return defaultBounds;
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
      const bounds = await calculateSidebarBounds(
        api,
        DEFAULT_SIDEBAR_WIDTH,
        tabId,
      );

      const createData: chrome.windows.CreateData = {
        url,
        type: 'popup',
        state: 'normal',
        width: bounds.width,
        height: bounds.height,
        ...(typeof bounds.left === 'number' ? { left: bounds.left } : {}),
        ...(typeof bounds.top === 'number' ? { top: bounds.top } : {}),
        focused: true,
      };
      logPopupDiagnostic(
        '[CardMaster:Popup:Background] [CP-3:CallingWindowsCreate]',
        createData,
      );

      const win = await api.windows.create(createData);
      activePopupWindowId = win?.id ?? null;
      logPopupDiagnostic('[CardMaster:Popup:Background] [CP-3:WindowCreated]', {
        id: win?.id,
        type: win?.type,
        state: win?.state,
        left: win?.left,
        top: win?.top,
        width: win?.width,
        height: win?.height,
        focused: win?.focused,
      });

      // Arc and macOS window managers often default to window state or ignore create bounds.
      // Explicitly enforce target sidebar bounds via api.windows.update with state: 'normal':
      if (win?.id && api.windows.update) {
        try {
          const updateResult = await api.windows.update(win.id, {
            state: 'normal',
            width: bounds.width,
            height: bounds.height,
            ...(typeof bounds.left === 'number' ? { left: bounds.left } : {}),
            ...(typeof bounds.top === 'number' ? { top: bounds.top } : {}),
            focused: true,
          });
          logPopupDiagnostic(
            '[CardMaster:Popup:Background] [CP-4:WindowsUpdateSuccess]',
            {
              id: updateResult?.id,
              type: updateResult?.type,
              state: updateResult?.state,
              left: updateResult?.left,
              top: updateResult?.top,
              width: updateResult?.width,
              height: updateResult?.height,
            },
          );
        } catch (updateErr) {
          warnPopupDiagnostic(
            '[CardMaster:Popup:Background] [CP-4:WindowsUpdateError]',
            updateErr,
          );
        }

        // Delayed check and post-animation re-enforce:
        setTimeout(async () => {
          if (win.id && api.windows?.get) {
            try {
              const delayed = await api.windows.get(win.id);
              logPopupDiagnostic(
                '[CardMaster:Popup:Background] [CP-5:DelayedCheck@350ms]',
                {
                  id: delayed?.id,
                  type: delayed?.type,
                  state: delayed?.state,
                  left: delayed?.left,
                  top: delayed?.top,
                  width: delayed?.width,
                  height: delayed?.height,
                },
              );

              // If Arc or macOS window manager expanded the window (e.g. Little Arc default 1185x832),
              // re-enforce target bounds after Arc's AppKit opening transition finishes:
              if (
                typeof delayed?.width === 'number' &&
                delayed.width > bounds.width + 40 &&
                api.windows?.update
              ) {
                logPopupDiagnostic(
                  '[CardMaster:Popup:Background] [CP-5:PostAnimationReEnforceAttempt]',
                  {
                    detectedWidth: delayed.width,
                    targetWidth: bounds.width,
                    targetHeight: bounds.height,
                    targetLeft: bounds.left,
                    targetTop: bounds.top,
                  },
                );
                const reEnforced = await api.windows.update(win.id, {
                  state: 'normal',
                  width: bounds.width,
                  height: bounds.height,
                  ...(typeof bounds.left === 'number'
                    ? { left: bounds.left }
                    : {}),
                  ...(typeof bounds.top === 'number'
                    ? { top: bounds.top }
                    : {}),
                });
                logPopupDiagnostic(
                  '[CardMaster:Popup:Background] [CP-5:PostAnimationReEnforceSuccess]',
                  {
                    id: reEnforced?.id,
                    state: reEnforced?.state,
                    left: reEnforced?.left,
                    top: reEnforced?.top,
                    width: reEnforced?.width,
                    height: reEnforced?.height,
                  },
                );
              }
            } catch (delayedErr) {
              warnPopupDiagnostic(
                '[CardMaster:Popup:Background] [CP-5:DelayedCheckError]',
                delayedErr,
              );
            }
          }
        }, 400);
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
