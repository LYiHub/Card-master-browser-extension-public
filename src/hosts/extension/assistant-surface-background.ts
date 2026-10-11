import type {
  AssistantSurfaceContext,
  AssistantSurfaceNavigationMessage,
  AssistantWorkbenchTab,
} from '../../ai/domain/types';
import {
  DEFAULT_USERSCRIPT_SETTINGS,
  USERSCRIPT_SETTINGS_STORAGE_KEY,
} from '../../userscript/application/settings';
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

export type AssistantPanelMode = 'sidePanel' | 'popup';

export const defaultAssistantPanelMode = (): AssistantPanelMode => 'sidePanel';

export function normalizeAssistantPanelMode(
  value: unknown,
): AssistantPanelMode {
  if (value === 'popup') return 'popup';
  return 'sidePanel';
}

/**
 * Read the assistant panel mode from the userscript settings store.
 *
 * Requires that ensureDefaultAssistantPanelMode() has already been called
 * at startup — if the storage key has never been written, this throws.
 */
export async function readAssistantPanelMode(
  api: ExtensionBackgroundApi,
): Promise<AssistantPanelMode> {
  const stored = (await api.storage.local.get(USERSCRIPT_SETTINGS_STORAGE_KEY))[
    USERSCRIPT_SETTINGS_STORAGE_KEY
  ] as { assistantPanelMode?: string } | undefined;
  if (stored?.assistantPanelMode === undefined) {
    throw new Error(
      `AssistantPanelMode not found in storage. ` +
        `ensureDefaultAssistantPanelMode() must be called at startup first.`,
    );
  }
  return normalizeAssistantPanelMode(stored?.assistantPanelMode);
}

function createAssistantSurface(
  api: ExtensionBackgroundApi,
  preference: AssistantPanelMode,
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

/**
 * Ensure the userscript settings storage has a default assistantPanelMode.
 *
 * Must be called at extension startup (Service Worker init / install / startup)
 * before any factory or UI is created. After this returns, storage is guaranteed
 * to contain a valid assistantPanelMode value.
 */
export async function ensureDefaultAssistantPanelMode(
  api: ExtensionBackgroundApi,
): Promise<void> {
  const stored = (await api.storage.local.get(USERSCRIPT_SETTINGS_STORAGE_KEY))[
    USERSCRIPT_SETTINGS_STORAGE_KEY
  ] as { assistantPanelMode?: string } | undefined;
  if (stored?.assistantPanelMode !== undefined) return; // already initialised
  await api.storage.local.set({
    [USERSCRIPT_SETTINGS_STORAGE_KEY]: {
      ...DEFAULT_USERSCRIPT_SETTINGS,
      assistantPanelMode: 'sidePanel',
    },
  });
}

export class AssistantSurfaceCoordinator {
  private readonly activePanels = new Map<number, ExtensionPort>();
  private readonly openingTabs = new Set<number>();
  private readonly requestedTabs = new Map<number, AssistantWorkbenchTab>();
  private surface: AssistantSurface;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly mode: AssistantPanelMode,
    private readonly reportFailure: SurfaceFailureReporter = () => undefined,
  ) {
    this.surface = createAssistantSurface(this.api, this.mode);
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

  /**
   * Open the assistant surface for the given tab.
   *
   * @param tabId  - Target tab id
   * @param tab    - Optional workbench tab to navigate to
   * @param panelMode - Optional panel mode override. When provided, the surface
   *                    is created with the given preference instead of the default.
   *                    Caller should read storage while still in user gesture.
   */
  async open(
    tabId: number,
    tab?: AssistantWorkbenchTab,
    panelMode?: AssistantPanelMode,
  ) {
    // If caller provides panelMode, create a surface on the fly (override).
    // This is non-default: the normal path uses the constructor surface.
    const surface =
      panelMode !== undefined
        ? createAssistantSurface(this.api, panelMode)
        : this.surface;

    const activePanel = this.activePanels.get(tabId);
    if (tab) this.requestedTabs.set(tabId, tab);
    if (activePanel && tab) {
      const message: AssistantSurfaceNavigationMessage = {
        type: 'assistant-surface-navigate',
        tab,
      };
      activePanel.postMessage(message);
    }
    const configuration = this.configureWithSurface(surface, tabId).catch(
      (error) => {
        this.reportFailure('tab-configuration-failed', error, { tabId });
      },
    );
    if (activePanel || this.openingTabs.has(tabId)) {
      await configuration;
      return;
    }
    this.openingTabs.add(tabId);
    try {
      // surface.open() must be the first awaited operation after any
      // user-gesture-dependent step. Do not introduce an await between
      // the gesture context and this call.
      await surface.open(tabId, assistantSurfacePath(tabId));
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

  /**
   * Rebuild the factory surface when the panel mode preference changes.
   *
   * @param preference - The new panel mode ('sidePanel' or 'popup')
   */
  setSurfacePreference(preference: AssistantPanelMode): void {
    // 1. Disconnect all old content-script connections
    for (const [_tabId, port] of this.activePanels) {
      try {
        port.disconnect();
      } catch {
        // ignore
      }
    }

    // 2. Clear state tracking
    this.activePanels.clear();
    this.openingTabs.clear();
    this.requestedTabs.clear();

    // 3. Replace the factory
    this.surface = createAssistantSurface(this.api, preference);
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

  private configureWithSurface(surface: AssistantSurface, tabId: number) {
    return (
      surface.configure?.(tabId, assistantSurfacePath(tabId)) ??
      Promise.resolve()
    );
  }

  private configure(tabId: number) {
    return readAssistantPanelMode(this.api).then((panelMode) => {
      const surface = createAssistantSurface(this.api, panelMode);
      return this.configureWithSurface(surface, tabId);
    });
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
