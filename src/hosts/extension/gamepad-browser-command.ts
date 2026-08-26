import type { ExtensionBackgroundApi } from './api';
import type { ExtensionGamepadControlService } from './gamepad-control-service';

export type GamepadBrowserCommand =
  | 'back'
  | 'forward'
  | 'reload'
  | 'new-tab'
  | 'previous-tab'
  | 'next-tab';

export type GamepadBrowserCommandResult = {
  ok: true;
  outcome: 'handled' | 'unsupported' | 'denied';
};

const COMMAND_COOLDOWN_MS = 180;

export class GamepadBrowserCommandService {
  private readonly lastCommandAt = new Map<number, number>();

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly control: Pick<
      ExtensionGamepadControlService,
      'readSettings'
    >,
    private readonly now: () => number = Date.now,
  ) {
    api.tabs.onRemoved?.addListener((tabId) =>
      this.lastCommandAt.delete(tabId),
    );
  }

  async execute(
    command: GamepadBrowserCommand,
    sender: chrome.runtime.MessageSender,
  ): Promise<GamepadBrowserCommandResult> {
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') {
      throw new Error('手柄浏览器命令缺少当前标签页身份。');
    }
    if (!(await this.control.readSettings()).enabled) {
      return { ok: true, outcome: 'denied' };
    }
    const now = this.now();
    const previous = this.lastCommandAt.get(tabId) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < COMMAND_COOLDOWN_MS) {
      return { ok: true, outcome: 'handled' };
    }
    this.lastCommandAt.set(tabId, now);

    if (command === 'reload') {
      await this.api.tabs.reload(tabId);
      return { ok: true, outcome: 'handled' };
    }
    if (command === 'new-tab') {
      await this.api.tabs.create({ active: true });
      return { ok: true, outcome: 'handled' };
    }
    if (command === 'previous-tab' || command === 'next-tab') {
      try {
        const current =
          typeof sender.tab?.windowId === 'number' &&
          typeof sender.tab?.index === 'number'
            ? sender.tab
            : await this.api.tabs.get(tabId);
        if (
          typeof current.windowId !== 'number' ||
          typeof current.index !== 'number'
        ) {
          return { ok: true, outcome: 'unsupported' };
        }
        const tabs = (await this.api.tabs.query({ windowId: current.windowId }))
          .filter(
            (tab): tab is chrome.tabs.Tab & { id: number } =>
              typeof tab.id === 'number',
          )
          .sort((left, right) => left.index - right.index);
        const currentPosition = tabs.findIndex((tab) => tab.id === tabId);
        if (currentPosition < 0 || tabs.length < 2) {
          return { ok: true, outcome: 'handled' };
        }
        const offset = command === 'previous-tab' ? -1 : 1;
        const target =
          tabs[(currentPosition + offset + tabs.length) % tabs.length];
        await this.api.tabs.update(target.id, { active: true });
        return { ok: true, outcome: 'handled' };
      } catch {
        return { ok: true, outcome: 'unsupported' };
      }
    }
    const navigation =
      command === 'back' ? this.api.tabs.goBack : this.api.tabs.goForward;
    if (typeof navigation !== 'function') {
      return { ok: true, outcome: 'unsupported' };
    }
    try {
      const navigate = navigation.bind(this.api.tabs) as unknown as (
        targetTabId: number,
      ) => void | Promise<void>;
      await navigate(tabId);
      return { ok: true, outcome: 'handled' };
    } catch {
      return { ok: true, outcome: 'unsupported' };
    }
  }
}
