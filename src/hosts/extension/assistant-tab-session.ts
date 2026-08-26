import type {
  AiPageContext,
  AssistantTabTargetState,
} from '../../ai/domain/types';
import type { ExtensionBackgroundApi } from './api';
import {
  type AssistantPageAttachment,
  type AssistantPageToolExecutor,
  type AssistantPageToolName,
  type AssistantPageToolResult,
  ExtensionAssistantPageObserver,
} from './assistant-page-observer';

const MAX_ASSISTANT_TAB_RESULTS = 200;

export type AssistantBrowserTabSummary = {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  status: NonNullable<chrome.tabs.Tab['status']> | 'unknown';
  selected: boolean;
};

export type AssistantInitialTabContext = {
  target: AssistantTabTargetState;
  page?: AiPageContext;
  error?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function validTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function bounded(value: string | undefined, maximum: number) {
  return (value ?? '').slice(0, maximum);
}

function tabSummary(
  tab: chrome.tabs.Tab,
  selectedTabId: number | null,
): AssistantBrowserTabSummary | null {
  if (!validTabId(tab.id)) return null;
  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: bounded(tab.title, 256),
    url: bounded(tab.url, 2_048),
    active: tab.active,
    pinned: tab.pinned,
    audible: tab.audible ?? false,
    status: tab.status ?? 'unknown',
    selected: tab.id === selectedTabId,
  };
}

export function unavailableAssistantTabTarget(
  message = '当前没有选定可操作的页面。请先选择目标页面。',
): AssistantTabTargetState {
  return {
    tabId: null,
    title: '',
    url: '',
    active: false,
    available: false,
    message,
  };
}

export async function readAssistantTabTargetState(
  api: ExtensionBackgroundApi,
  tabId: number | null,
): Promise<AssistantTabTargetState> {
  if (tabId === null) return unavailableAssistantTabTarget();
  if (typeof api.tabs?.get !== 'function') {
    return {
      tabId,
      title: '',
      url: '',
      active: false,
      available: true,
    };
  }
  try {
    const tab = await api.tabs.get(tabId);
    return {
      tabId,
      windowId: tab.windowId,
      title: bounded(tab.title, 256),
      url: bounded(tab.url, 2_048),
      active: tab.active,
      available: true,
    };
  } catch {
    return unavailableAssistantTabTarget(
      '所选页面已关闭或不可访问。请重新选择目标页面。',
    );
  }
}

export class ExtensionAssistantTabSession implements AssistantPageToolExecutor {
  constructor(
    private readonly api: ExtensionBackgroundApi,
    private selectedTabId: number | null,
    private readonly resolvePageAttachment: (
      tabId: number,
    ) => Promise<AssistantPageAttachment>,
    private readonly onSelectedTabChange: (tabId: number | null) => void = () =>
      undefined,
  ) {}

  selectedId() {
    return this.selectedTabId;
  }

  invalidateTab(tabId: number) {
    if (this.selectedTabId === tabId) this.updateSelectedTab(null);
  }

  requireSelectedTabId() {
    if (this.selectedTabId === null) {
      throw new Error('当前没有选定可操作的页面。请先选择目标页面。');
    }
    return this.selectedTabId;
  }

  async initialContext(): Promise<AssistantInitialTabContext> {
    const target = await readAssistantTabTargetState(
      this.api,
      this.selectedTabId,
    );
    if (!target.available || target.tabId === null) {
      this.updateSelectedTab(null);
      return { target, error: target.message };
    }
    try {
      const attachment = await this.resolvePageAttachment(target.tabId);
      return { target, page: attachment.context };
    } catch (error) {
      return {
        target,
        error: errorMessage(error),
      };
    }
  }

  async listTabs() {
    const tabs = (await this.api.tabs.query({}))
      .map((tab) => tabSummary(tab, this.selectedTabId))
      .filter((tab): tab is AssistantBrowserTabSummary => tab !== null)
      .sort(
        (left, right) =>
          left.windowId - right.windowId || left.index - right.index,
      );
    if (
      this.selectedTabId !== null &&
      !tabs.some((tab) => tab.id === this.selectedTabId)
    ) {
      this.updateSelectedTab(null);
    }
    return {
      selectedTabId: this.selectedTabId,
      tabs: tabs.slice(0, MAX_ASSISTANT_TAB_RESULTS).map((tab) => ({
        ...tab,
        selected: tab.id === this.selectedTabId,
      })),
      omittedCount: Math.max(0, tabs.length - MAX_ASSISTANT_TAB_RESULTS),
    };
  }

  async selectTab(tabId: number) {
    const tab = await this.api.tabs.get(tabId);
    const summary = tabSummary(tab, tabId);
    if (!summary) throw new Error('所选页面无法识别。');
    this.updateSelectedTab(tabId);
    return {
      selected: true,
      tab: summary,
    };
  }

  async activateTab(tabId: number) {
    const tab = await this.api.tabs.get(tabId);
    await this.api.tabs.update(tabId, { active: true });
    let windowFocused = false;
    let windowFocusWarning: string | undefined;
    if (this.api.windows?.update) {
      try {
        await this.api.windows.update(tab.windowId, { focused: true });
        windowFocused = true;
      } catch (error) {
        windowFocusWarning = errorMessage(error);
      }
    }
    const updated = await this.api.tabs.get(tabId);
    const summary = tabSummary(updated, this.selectedTabId);
    if (!summary) throw new Error('所选页面无法识别。');
    return {
      activated: true,
      windowFocused,
      ...(windowFocusWarning ? { windowFocusWarning } : {}),
      tab: summary,
      selectedTabId: this.selectedTabId,
    };
  }

  async closeTab(tabId: number) {
    const tab = await this.api.tabs.get(tabId);
    const summary = tabSummary(tab, this.selectedTabId);
    if (!summary) throw new Error('所选页面无法识别。');
    await this.api.tabs.remove(tabId);
    const selectedClosed = tabId === this.selectedTabId;
    if (selectedClosed) this.updateSelectedTab(null);
    return {
      closed: true,
      selectedTargetClosed: selectedClosed,
      tab: summary,
      selectedTabId: this.selectedTabId,
    };
  }

  async execute(
    name: AssistantPageToolName,
    args: Record<string, unknown>,
  ): Promise<AssistantPageToolResult> {
    const tabId = this.requireSelectedTabId();
    if (typeof this.api.tabs?.get === 'function') {
      try {
        await this.api.tabs.get(tabId);
      } catch {
        this.updateSelectedTab(null);
        throw new Error('所选页面已关闭或不可访问。请重新选择目标页面。');
      }
    }
    const attachment = await this.resolvePageAttachment(tabId);
    const observer = new ExtensionAssistantPageObserver(
      this.api,
      attachment.target,
    );
    return observer.execute(name, args);
  }

  private updateSelectedTab(tabId: number | null) {
    if (this.selectedTabId === tabId) return;
    this.selectedTabId = tabId;
    this.onSelectedTabChange(tabId);
  }
}
