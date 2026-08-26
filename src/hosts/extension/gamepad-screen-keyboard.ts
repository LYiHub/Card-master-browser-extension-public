import type { Point } from '../../gamepad-control/domain/input';
import { gamepadKeyboardLayout } from '../../gamepad-control/keyboard-layout';
import {
  findKeyboardNavigationTarget,
  horizontalNavigationGeometry,
  horizontalRevealPosition,
} from '../../gamepad-control/keyboard-navigation';
import {
  DEFAULT_GAMEPAD_KEYBOARD_INPUT_MODE,
  type GamepadKeyboardInputMode,
  type GamepadPinyinCandidate,
  gamepadPinyinCandidates,
  type PinyinDictionary,
} from '../../gamepad-control/pinyin';
import type { NavigationDirection } from '../../input/intents';
import {
  type EditableTextTarget,
  editableTextTarget,
  insertEditableText,
  removeEditableText,
} from './editable-text';

const KEYBOARD_ROW_UNITS = 15;
const PINYIN_INITIAL_CANDIDATE_LIMIT = 36;
const PINYIN_CANDIDATE_EXPANSION = 36;
const PINYIN_MAX_CANDIDATE_LIMIT = 180;

export type GamepadKeyboardShortcuts = Readonly<{
  backspace: string;
  candidateNext: string;
  candidatePrevious: string;
  enter: string;
  selectAll: string;
  space: string;
  speech: string;
}>;

export const DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS: GamepadKeyboardShortcuts =
  Object.freeze({
    backspace: 'L2',
    candidateNext: 'R1',
    candidatePrevious: 'L1',
    enter: 'R2',
    selectAll: 'L3',
    space: 'X / □',
    speech: '触摸板',
  });

export type GamepadKeyboardSpeechStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'stopping'
  | 'complete'
  | 'error';

export function gamepadKeyboardSpeechActive(
  status: GamepadKeyboardSpeechStatus,
) {
  return (
    status === 'connecting' || status === 'listening' || status === 'stopping'
  );
}

type GamepadKeyboardSpeechControl = {
  start(): boolean;
  finish(): boolean;
};

export type GamepadKeyboardKey = {
  label: string;
  name?: string;
  value?: string;
  shifted?: string;
  action?:
    | 'backspace'
    | 'caps-lock'
    | 'candidate'
    | 'candidate-expand'
    | 'candidate-next'
    | 'candidate-previous'
    | 'enter'
    | 'select-all'
    | 'shift'
    | 'space'
    | 'tab'
    | 'toggle-language';
  candidate?: GamepadPinyinCandidate;
  interactive?: boolean;
  shortcut?: string;
  special?: boolean;
  units?: number;
};

const letterKeys = (letters: string) =>
  letters.split('').map((value) => ({ label: value, value }));

const characterKey = (value: string, shifted?: string) => ({
  label: value,
  value,
  ...(shifted ? { shifted } : {}),
});

function numberRow(shortcuts: GamepadKeyboardShortcuts) {
  return [
    characterKey('`', '~'),
    characterKey('1', '!'),
    characterKey('2', '@'),
    characterKey('3', '#'),
    characterKey('4', '$'),
    characterKey('5', '%'),
    characterKey('6', '^'),
    characterKey('7', '&'),
    characterKey('8', '*'),
    characterKey('9', '('),
    characterKey('0', ')'),
    characterKey('-', '_'),
    characterKey('=', '+'),
    {
      label: 'delete',
      name: '退格',
      action: 'backspace' as const,
      shortcut: shortcuts.backspace,
      special: true,
      units: 2,
    },
  ];
}

function bottomRow(
  inputMode: GamepadKeyboardInputMode,
  shortcuts: GamepadKeyboardShortcuts,
): readonly GamepadKeyboardKey[] {
  return [
    {
      label: inputMode === 'chinese' ? '中' : 'EN',
      name: inputMode === 'chinese' ? '切换到英文输入' : '切换到中文拼音输入',
      action: 'toggle-language',
      special: true,
    },
    {
      label: 'ctrl',
      name: '全选文本',
      action: 'select-all',
      shortcut: shortcuts.selectAll,
      special: true,
    },
    {
      label: '⌥',
      interactive: false,
      special: true,
    },
    {
      label: '⌘',
      name: '上一个候选词',
      action: 'candidate-previous',
      shortcut: shortcuts.candidatePrevious,
      special: true,
    },
    {
      label: '',
      name: '空格',
      action: 'space',
      shortcut: shortcuts.space,
      special: true,
      units: 5,
    },
    {
      label: '⌘',
      name: '下一个候选词',
      action: 'candidate-next',
      shortcut: shortcuts.candidateNext,
      special: true,
    },
    {
      label: '⌥',
      interactive: false,
      special: true,
    },
    ...'◀▼▲▶'.split('').map((label) => ({
      label,
      interactive: false,
      special: true,
    })),
  ];
}

export function gamepadKeyboardRows(
  inputMode: GamepadKeyboardInputMode,
  shortcuts: GamepadKeyboardShortcuts = DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS,
): readonly (readonly GamepadKeyboardKey[])[] {
  return [
    numberRow(shortcuts),
    [
      {
        label: 'tab',
        name: 'Tab',
        action: 'tab',
        special: true,
        units: 1.5,
      },
      ...letterKeys('qwertyuiop'),
      characterKey('[', '{'),
      characterKey(']', '}'),
      { ...characterKey('\\', '|'), units: 1.5 },
    ],
    [
      {
        label: 'caps lock',
        name: '大写锁定',
        action: 'caps-lock',
        special: true,
        units: 2,
      },
      ...letterKeys('asdfghjkl'),
      characterKey(';', ':'),
      characterKey("'", '"'),
      {
        label: 'return',
        name: '确认',
        action: 'enter',
        shortcut: shortcuts.enter,
        special: true,
        units: 2,
      },
    ],
    [
      {
        label: 'shift',
        name: 'Shift 锁定',
        action: 'shift',
        special: true,
        units: 2.5,
      },
      ...letterKeys('zxcvbnm'),
      characterKey(',', '<'),
      characterKey('.', '>'),
      characterKey('/', '?'),
      {
        label: 'shift',
        name: 'Shift 锁定',
        action: 'shift',
        special: true,
        units: 2.5,
      },
    ],
    bottomRow(inputMode, shortcuts),
  ];
}

export function gamepadKeyboardKeyLegend(
  key: GamepadKeyboardKey,
  shifted: boolean,
) {
  if (shifted && key.shifted) return key.shifted;
  if (key.value?.length === 1 && /[a-z]/i.test(key.value)) {
    return shifted ? key.value.toUpperCase() : key.value;
  }
  return key.label;
}

export function gamepadKeyboardComposesPinyin({
  capsLocked,
  inputMode,
  shifted,
  value,
}: {
  capsLocked: boolean;
  inputMode: GamepadKeyboardInputMode;
  shifted: boolean;
  value: string;
}) {
  return (
    inputMode === 'chinese' && !shifted && !capsLocked && /^[a-z]$/i.test(value)
  );
}

export type GamepadKeyboardActivationMode = 'cursor' | 'selection';

export function gamepadKeyboardActivationTarget<T>({
  cursorTarget,
  mode,
  selectedTarget,
}: {
  cursorTarget: T | null;
  mode: GamepadKeyboardActivationMode;
  selectedTarget: T | null;
}) {
  return mode === 'cursor' ? cursorTarget : selectedTarget;
}

export class GamepadScreenKeyboard {
  private readonly element: HTMLElement;
  private readonly candidateBar: HTMLElement;
  private readonly candidateList: HTMLElement;
  private readonly speechButton: HTMLButtonElement;
  private readonly speechLabel: HTMLElement;
  private readonly speechShortcut: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly keyDefinitions = new Map<string, GamepadKeyboardKey>();
  private target: EditableTextTarget | null = null;
  private lastEditable: EditableTextTarget | null = null;
  private inputMode: GamepadKeyboardInputMode =
    DEFAULT_GAMEPAD_KEYBOARD_INPUT_MODE;
  private capsLocked = false;
  private shifted = false;
  private selection = { row: 0, column: 0 };
  private lastKeyboardSelection = { row: 0, column: 0 };
  private activationMode: GamepadKeyboardActivationMode = 'selection';
  private activeCandidateIndex = 0;
  private pinyinInput = '';
  private pinyinCandidates: readonly GamepadPinyinCandidate[] = [];
  private pinyinDictionary: PinyinDictionary | null = null;
  private pinyinDictionaryPromise: Promise<PinyinDictionary> | null = null;
  private pinyinStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  private speechStatus: GamepadKeyboardSpeechStatus = 'idle';
  private shortcuts = DEFAULT_GAMEPAD_KEYBOARD_SHORTCUTS;
  private candidateLimit = PINYIN_INITIAL_CANDIDATE_LIMIT;
  private noticeTimer = 0;
  private positionFrame = 0;
  private disposed = false;

  constructor(
    private readonly pageDocument: Document,
    private readonly root: ShadowRoot,
    private readonly cursorPosition: () => Point,
    private readonly loadPinyinDictionary: () => Promise<PinyinDictionary>,
    private readonly speechControl: GamepadKeyboardSpeechControl | null,
  ) {
    this.notice = pageDocument.createElement('div');
    this.notice.className = 'gamepad-control-notice';
    this.element = pageDocument.createElement('section');
    this.element.className = 'gamepad-keyboard';
    this.element.setAttribute('aria-label', '手柄屏幕键盘');

    this.candidateBar = pageDocument.createElement('div');
    this.candidateBar.className = 'gamepad-keyboard__candidate-bar';
    this.candidateBar.setAttribute('aria-label', '候选词与语音输入');
    this.candidateList = pageDocument.createElement('div');
    this.candidateList.className = 'gamepad-keyboard__candidate-list';
    this.speechButton = pageDocument.createElement('button');
    this.speechButton.type = 'button';
    this.speechButton.className = 'gamepad-keyboard__speech';
    const speechDot = pageDocument.createElement('span');
    speechDot.className = 'gamepad-keyboard__speech-dot';
    speechDot.setAttribute('aria-hidden', 'true');
    this.speechLabel = pageDocument.createElement('span');
    this.speechLabel.className = 'gamepad-keyboard__speech-label';
    this.speechShortcut = pageDocument.createElement('kbd');
    this.speechShortcut.className = 'gamepad-keyboard__speech-shortcut';
    this.speechButton.append(speechDot, this.speechLabel, this.speechShortcut);
    this.speechButton.addEventListener('pointerenter', () => {
      this.activationMode = 'cursor';
      this.renderSelection();
    });
    this.speechButton.addEventListener('click', () => {
      this.toggleSpeechInput();
    });
    this.candidateBar.append(this.candidateList);
    if (this.speechControl) {
      this.candidateBar.append(this.speechButton);
    } else {
      this.candidateBar.setAttribute('aria-label', '候选词');
      this.speechButton.disabled = true;
    }
    this.renderSpeechButton();

    this.grid = pageDocument.createElement('div');
    this.grid.className = 'gamepad-keyboard__grid';
    this.element.append(this.candidateBar, this.grid);
    this.root.append(this.notice, this.element);
    pageDocument.defaultView?.addEventListener(
      'resize',
      this.handleViewportChange,
    );
    pageDocument.addEventListener('scroll', this.handleViewportChange, true);
    this.renderKeyboard();
  }

  get visible() {
    return this.element.classList.contains('is-visible');
  }

  get hasCandidates() {
    return this.pinyinCandidates.length > 0;
  }

  get candidateFocused() {
    return (
      this.selection.row === -1 &&
      this.selection.column >= 0 &&
      this.selection.column < this.pinyinCandidates.length
    );
  }

  get speechFocused() {
    return this.selectedButton(this.buttons()) === this.speechButton;
  }

  setShortcuts(shortcuts: GamepadKeyboardShortcuts) {
    if (
      Object.entries(shortcuts).every(
        ([key, value]) =>
          this.shortcuts[key as keyof GamepadKeyboardShortcuts] === value,
      )
    ) {
      return;
    }
    this.shortcuts = { ...shortcuts };
    this.renderKeyboard();
    this.renderSpeechButton();
    this.schedulePosition();
  }

  setSpeechStatus(status: GamepadKeyboardSpeechStatus) {
    if (this.speechStatus === status) return;
    this.speechStatus = status;
    this.renderSpeechButton();
  }

  startSpeechInput() {
    return this.speechControl?.start() ?? false;
  }

  finishSpeechInput() {
    return this.speechControl?.finish() ?? false;
  }

  rememberEditable(value: Element | null) {
    const target = editableTextTarget(value);
    if (target) this.lastEditable = target;
  }

  openFor(value: Element | null) {
    const target = editableTextTarget(value);
    if (!target) return false;
    this.show(target);
    return true;
  }

  resolveEditableTarget() {
    if (this.target?.isConnected) return this.target;
    const cursor = this.cursorPosition();
    return (
      editableTextTarget(this.pageDocument.activeElement) ??
      editableTextTarget(
        this.pageDocument.elementFromPoint(cursor.x, cursor.y),
      ) ??
      (this.lastEditable?.isConnected ? this.lastEditable : null)
    );
  }

  ownsEvent(event: Event) {
    const path = event.composedPath();
    return path.includes(this.element) || path.includes(this.root.host);
  }

  reconcileFocus(value: Element | null) {
    if (!this.visible) return;
    const target = editableTextTarget(value);
    if (target) {
      this.show(target);
      return;
    }
    const keyboardFocus = this.root.activeElement;
    if (!keyboardFocus || !this.element.contains(keyboardFocus)) {
      this.close({ restoreFocus: false });
    }
  }

  toggle() {
    if (this.visible) this.close();
    else this.open();
  }

  close({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    if (!this.visible) return;
    const target = this.target;
    target?.dispatchEvent(new Event('change', { bubbles: true }));
    if (restoreFocus && target?.isConnected) {
      target.focus({ preventScroll: true });
    }
    this.target = null;
    this.clearComposition();
    this.element.classList.remove('is-visible');
    this.cancelPosition();
  }

  navigate(direction: NavigationDirection) {
    const buttons = this.buttons();
    if (!this.selectedButton(buttons)) return;
    const candidateViewport = this.candidateList.getBoundingClientRect();
    const candidateBarViewport = this.candidateBar.getBoundingClientRect();
    const targets = buttons.map((button) => {
      const row = Number(button.dataset.row);
      const column = Number(button.dataset.column);
      if (row === -1) {
        const clippingViewport =
          button === this.speechButton
            ? candidateBarViewport
            : candidateViewport;
        const geometry = horizontalNavigationGeometry(
          button.getBoundingClientRect(),
          clippingViewport,
        );
        const coordinateWidth =
          candidateBarViewport.right - candidateBarViewport.left;
        const clippingWidth = clippingViewport.right - clippingViewport.left;
        const project = (value: number) =>
          coordinateWidth > 0
            ? (clippingViewport.left +
                value * clippingWidth -
                candidateBarViewport.left) /
              coordinateWidth
            : value;
        return {
          row,
          column,
          ...(geometry
            ? {
                x: project(geometry.x),
                startX: project(geometry.startX),
                endX: project(geometry.endX),
                verticalNavigationEligible: geometry.visible,
              }
            : { verticalNavigationEligible: false }),
        };
      }
      const navigationX = Number(button.dataset.navigationX);
      return {
        row,
        column,
        ...(Number.isFinite(navigationX) ? { x: navigationX } : {}),
      };
    });
    const current =
      targets.find(
        (target) =>
          target.row === this.selection.row &&
          target.column === this.selection.column,
      ) ?? this.selection;
    const next = findKeyboardNavigationTarget(targets, current, direction);
    if (!next) return;
    this.setSelection(next, 'selection');
  }

  activate(point: Point) {
    const buttons = this.buttons();
    const button = gamepadKeyboardActivationTarget({
      cursorTarget: this.buttonAt(point),
      mode: this.activationMode,
      selectedTarget: this.selectedButton(buttons),
    });
    if (!button) return false;
    button.click();
    return true;
  }

  trackPointer(point: Point) {
    this.activationMode = 'cursor';
    const button = this.buttonAt(point);
    if (!button) {
      this.renderSelection();
      return;
    }
    if (!button.classList.contains('gamepad-keyboard__key')) {
      this.renderSelection();
      return;
    }
    const row = Number(button.dataset.row);
    const column = Number(button.dataset.column);
    if (row === this.selection.row && column === this.selection.column) {
      this.renderSelection();
      return;
    }
    this.setSelection({ row, column }, 'cursor');
  }

  pointerTarget(point: Point) {
    if (!this.visible) return null;
    const target = this.root.elementFromPoint(point.x, point.y);
    return target instanceof Element && this.element.contains(target)
      ? target
      : null;
  }

  backspace() {
    const key = this.currentRows()
      .flat()
      .find((candidate) => candidate.action === 'backspace');
    if (key) this.perform(key);
  }

  enter() {
    const key = this.currentRows()
      .flat()
      .find((candidate) => candidate.action === 'enter');
    if (key) this.perform(key);
  }

  space() {
    const key = this.currentRows()
      .flat()
      .find((candidate) => candidate.action === 'space');
    if (key) this.perform(key);
  }

  selectAll() {
    const target = this.target;
    if (!target) return;
    this.commitComposition();
    target.focus({ preventScroll: true });
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      target.select();
      return;
    }
    const selection = this.pageDocument.defaultView?.getSelection();
    if (!selection) return;
    const range = this.pageDocument.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  selectPreviousCandidate() {
    this.moveCandidate(-1);
  }

  selectNextCandidate() {
    this.moveCandidate(1);
  }

  dispose() {
    this.disposed = true;
    this.pageDocument.defaultView?.clearTimeout(this.noticeTimer);
    this.pageDocument.defaultView?.removeEventListener(
      'resize',
      this.handleViewportChange,
    );
    this.pageDocument.removeEventListener(
      'scroll',
      this.handleViewportChange,
      true,
    );
    this.cancelPosition();
    this.notice.remove();
    this.element.remove();
  }

  private currentRows() {
    return gamepadKeyboardRows(this.inputMode, this.shortcuts);
  }

  private moveCandidate(offset: number) {
    if (!this.pinyinCandidates.length) return;
    if (
      offset > 0 &&
      this.activeCandidateIndex === this.pinyinCandidates.length - 1 &&
      this.canExpandCandidates()
    ) {
      this.expandCandidates();
      return;
    }
    const candidateIndex =
      (this.activeCandidateIndex + offset + this.pinyinCandidates.length) %
      this.pinyinCandidates.length;
    this.setSelection({ row: -1, column: candidateIndex }, 'selection');
  }

  private open() {
    const target = this.resolveEditableTarget();
    if (!target) {
      this.pageDocument.defaultView?.clearTimeout(this.noticeTimer);
      this.notice.textContent = '先选择网页中的输入框';
      this.notice.classList.add('is-visible');
      this.noticeTimer =
        this.pageDocument.defaultView?.setTimeout(
          () => this.notice.classList.remove('is-visible'),
          1_800,
        ) ?? 0;
      return;
    }
    this.show(target);
  }

  private show(target: EditableTextTarget) {
    const changedTarget = this.target !== target || !this.visible;
    this.target = target;
    this.lastEditable = target;
    if (changedTarget) {
      this.capsLocked = false;
      this.shifted = false;
      this.selection = { row: 0, column: 0 };
      this.lastKeyboardSelection = { row: 0, column: 0 };
      this.activationMode = 'selection';
      this.clearComposition();
    }
    if (this.inputMode === 'chinese') this.ensurePinyinDictionary();
    this.renderKeyboard();
    this.element.classList.add('is-visible');
    this.position();
    this.schedulePosition();
  }

  private readonly handleViewportChange = () => {
    this.schedulePosition();
  };

  private cancelPosition() {
    this.pageDocument.defaultView?.cancelAnimationFrame(this.positionFrame);
    this.positionFrame = 0;
  }

  private schedulePosition() {
    const view = this.pageDocument.defaultView;
    if (!view || !this.visible || this.positionFrame) return;
    this.positionFrame = view.requestAnimationFrame(() => {
      this.positionFrame = 0;
      this.position();
    });
  }

  private position() {
    const view = this.pageDocument.defaultView;
    const target = this.target;
    if (!view || !target?.isConnected || !this.visible) return;
    const layout = gamepadKeyboardLayout({
      anchor: target.getBoundingClientRect(),
      keyboard: this.element.getBoundingClientRect(),
      viewport: {
        width: view.innerWidth,
        height: view.innerHeight,
      },
    });
    this.element.dataset.placement = layout.placement;
    this.element.style.left = `${layout.left}px`;
    this.element.style.top = `${layout.top}px`;
  }

  private renderKeyboard() {
    this.keyDefinitions.clear();
    this.grid.replaceChildren();
    this.currentRows().forEach((row, rowIndex) => {
      const rowElement = this.pageDocument.createElement('div');
      rowElement.className = 'gamepad-keyboard__row';
      const totalUnits = row.reduce(
        (total, key) => total + (key.units ?? 1),
        0,
      );
      rowElement.style.setProperty(
        '--row-start',
        String(Math.floor(KEYBOARD_ROW_UNITS - totalUnits) + 1),
      );
      let usedUnits = (KEYBOARD_ROW_UNITS - totalUnits) / 2;
      row.forEach((key, columnIndex) => {
        const units = key.units ?? 1;
        const navigationX = (usedUnits + units / 2) / KEYBOARD_ROW_UNITS;
        rowElement.append(
          this.createKeyButton(key, rowIndex, columnIndex, navigationX),
        );
        usedUnits += units;
      });
      this.grid.append(rowElement);
    });
    this.renderCandidates();
    this.normalizeSelection();
    this.renderSelection();
  }

  private createKeyButton(
    key: GamepadKeyboardKey,
    row: number,
    column: number,
    navigationX: number | undefined,
    extraClass = '',
  ) {
    const button = this.pageDocument.createElement('button');
    button.type = 'button';
    button.className = [
      'gamepad-keyboard__key',
      key.special ? 'is-special' : '',
      (key.units ?? 1) > 1 ? 'is-wide' : '',
      key.interactive === false ? 'is-display-only' : '',
      key.action ? `is-action-${key.action}` : '',
      extraClass,
    ]
      .filter(Boolean)
      .join(' ');
    button.style.setProperty('--key-span', String((key.units ?? 1) * 2));
    button.dataset.row = String(row);
    button.dataset.column = String(column);
    if (typeof navigationX === 'number') {
      button.dataset.navigationX = String(navigationX);
    }
    button.disabled = key.interactive === false;
    button.setAttribute(
      'aria-label',
      `${key.name ?? key.label}${key.shortcut ? `，${key.shortcut}` : ''}`,
    );
    const legend = this.pageDocument.createElement('span');
    legend.className = 'gamepad-keyboard__legend';
    if (key.shifted) {
      legend.classList.add('has-shifted-symbol');
      const shiftedLegend = this.pageDocument.createElement('span');
      shiftedLegend.className =
        'gamepad-keyboard__symbol gamepad-keyboard__symbol--shifted';
      shiftedLegend.textContent = key.shifted;
      const baseLegend = this.pageDocument.createElement('span');
      baseLegend.className =
        'gamepad-keyboard__symbol gamepad-keyboard__symbol--base';
      baseLegend.textContent = key.label;
      legend.append(shiftedLegend, baseLegend);
    } else {
      legend.textContent = gamepadKeyboardKeyLegend(key, this.shifted);
    }
    button.append(legend);
    if (key.shortcut) {
      const shortcut = this.pageDocument.createElement('kbd');
      shortcut.className = 'gamepad-keyboard__shortcut';
      shortcut.textContent = key.shortcut;
      button.append(shortcut);
    }
    if (key.interactive !== false) {
      button.addEventListener('pointerenter', () => {
        this.setSelection({ row, column }, 'cursor');
      });
      button.addEventListener('click', () => this.perform(key));
    }
    this.keyDefinitions.set(`${row}:${column}`, key);
    return button;
  }

  private renderCandidates() {
    const speechWasSelected = this.speechFocused;
    for (const key of [...this.keyDefinitions.keys()]) {
      if (key.startsWith('-1:')) this.keyDefinitions.delete(key);
    }
    this.candidateList.replaceChildren();
    const hasComposition =
      this.inputMode === 'chinese' && Boolean(this.pinyinInput);
    const hasCandidates = hasComposition && this.pinyinCandidates.length > 0;
    this.candidateBar.classList.toggle('has-candidates', hasCandidates);
    this.candidateBar.classList.toggle(
      'is-hidden',
      !this.speechControl && !hasComposition,
    );

    if (hasCandidates) {
      this.pinyinCandidates.forEach((candidate, index) => {
        const button = this.createKeyButton(
          {
            label: `${index < 9 ? `${index + 1} ` : ''}${candidate.word}`,
            name: `候选词 ${candidate.word}`,
            action: 'candidate',
            candidate,
          },
          -1,
          index,
          undefined,
          'gamepad-keyboard__candidate',
        );
        button.dataset.candidateIndex = String(index);
        this.candidateList.append(button);
      });
      if (this.canExpandCandidates()) {
        this.candidateList.append(
          this.createKeyButton(
            {
              label: '更多',
              name: '展开更多候选词',
              action: 'candidate-expand',
              special: true,
            },
            -1,
            this.pinyinCandidates.length,
            undefined,
            'gamepad-keyboard__candidate gamepad-keyboard__candidate-more',
          ),
        );
      }
      this.renderSelection();
    } else if (hasComposition) {
      const message = this.pageDocument.createElement('span');
      message.className = 'gamepad-keyboard__candidate-message';
      message.textContent =
        this.pinyinStatus === 'loading'
          ? '正在载入候选词'
          : this.pinyinStatus === 'error'
            ? '候选词库载入失败'
            : `暂无候选词，按空格输入 ${this.pinyinInput}`;
      this.candidateList.append(message);
    }
    const speechColumn =
      this.pinyinCandidates.length + (this.canExpandCandidates() ? 1 : 0);
    this.speechButton.dataset.row = '-1';
    this.speechButton.dataset.column = String(speechColumn);
    if (speechWasSelected) {
      this.selection = { row: -1, column: speechColumn };
    }
    this.normalizeSelection();
    this.renderSelection();
  }

  private buttons() {
    return [
      ...this.element.querySelectorAll<HTMLButtonElement>(
        '.gamepad-keyboard__key:not(:disabled), .gamepad-keyboard__speech:not(:disabled)',
      ),
    ];
  }

  private selectedButton(buttons: readonly HTMLButtonElement[]) {
    return (
      buttons.find(
        (button) =>
          Number(button.dataset.row) === this.selection.row &&
          Number(button.dataset.column) === this.selection.column,
      ) ?? null
    );
  }

  private normalizeSelection() {
    const buttons = this.buttons();
    const selected = this.selectedButton(buttons);
    if (selected) {
      if (this.selection.row >= 0) {
        this.lastKeyboardSelection = { ...this.selection };
      }
      return;
    }
    const restored =
      buttons.find(
        (button) =>
          Number(button.dataset.row) === this.lastKeyboardSelection.row &&
          Number(button.dataset.column) === this.lastKeyboardSelection.column,
      ) ?? buttons.find((button) => Number(button.dataset.row) >= 0);
    if (!restored) return;
    this.selection = {
      row: Number(restored.dataset.row),
      column: Number(restored.dataset.column),
    };
    this.lastKeyboardSelection = { ...this.selection };
  }

  private renderSelection() {
    const uppercaseLetters = this.shifted !== this.capsLocked;
    for (const button of this.buttons()) {
      const row = Number(button.dataset.row);
      const column = Number(button.dataset.column);
      button.classList.toggle(
        'is-selected',
        this.activationMode === 'selection' &&
          row === this.selection.row &&
          column === this.selection.column,
      );
      const definition = this.keyDefinitions.get(`${row}:${column}`);
      const legend = button.querySelector<HTMLElement>(
        '.gamepad-keyboard__legend',
      );
      if (definition && legend && !definition.shifted) {
        legend.textContent = gamepadKeyboardKeyLegend(
          definition,
          uppercaseLetters,
        );
      }
      const latched =
        (definition?.action === 'shift' && this.shifted) ||
        (definition?.action === 'caps-lock' && this.capsLocked);
      button.classList.toggle('is-latched', latched);
      button.classList.toggle(
        'is-shift-active',
        Boolean(definition?.shifted && this.shifted),
      );
      const activeCandidate =
        definition?.action === 'candidate' &&
        Number(button.dataset.candidateIndex) === this.activeCandidateIndex;
      button.classList.toggle('is-active-candidate', activeCandidate);
      if (activeCandidate) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
      if (
        definition?.action === 'shift' ||
        definition?.action === 'caps-lock'
      ) {
        button.setAttribute('aria-pressed', String(latched));
      } else {
        button.removeAttribute('aria-pressed');
      }
    }
  }

  private setSelection(
    selection: { row: number; column: number },
    activationMode: GamepadKeyboardActivationMode,
  ) {
    this.selection = selection;
    this.activationMode = activationMode;
    if (selection.row >= 0) {
      this.lastKeyboardSelection = { ...selection };
    } else if (
      selection.row === -1 &&
      selection.column >= 0 &&
      selection.column < this.pinyinCandidates.length
    ) {
      this.activeCandidateIndex = selection.column;
    }
    this.renderSelection();
    if (selection.row === -1) this.revealCandidateSelection();
  }

  private buttonAt(point: Point) {
    return (
      this.pointerTarget(point)?.closest<HTMLButtonElement>(
        '.gamepad-keyboard__key, .gamepad-keyboard__speech',
      ) ?? null
    );
  }

  private renderSpeechButton() {
    if (!this.speechControl) return;
    const active = gamepadKeyboardSpeechActive(this.speechStatus);
    const label =
      this.speechStatus === 'connecting'
        ? '连接中'
        : this.speechStatus === 'listening'
          ? '松开完成'
          : this.speechStatus === 'stopping'
            ? '识别中'
            : this.speechStatus === 'error'
              ? '重试语音'
              : '语音';
    this.speechButton.dataset.status = this.speechStatus;
    this.speechButton.classList.toggle('is-active', active);
    this.speechButton.setAttribute('aria-pressed', String(active));
    this.speechLabel.textContent = label;
    this.speechShortcut.textContent = `长按 ${this.shortcuts.speech}`;
    this.speechButton.setAttribute(
      'aria-label',
      `${active ? '结束' : '开始'}语音输入，长按 ${this.shortcuts.speech}`,
    );
    this.speechButton.title = active ? '结束语音输入' : '开始语音输入';
  }

  private toggleSpeechInput() {
    if (gamepadKeyboardSpeechActive(this.speechStatus)) {
      return this.finishSpeechInput();
    }
    return this.startSpeechInput();
  }

  private clearComposition() {
    this.pinyinInput = '';
    this.pinyinCandidates = [];
    this.candidateLimit = PINYIN_INITIAL_CANDIDATE_LIMIT;
    this.activeCandidateIndex = 0;
    this.renderCandidates();
  }

  private ensurePinyinDictionary() {
    if (this.pinyinDictionary || this.pinyinDictionaryPromise) return;
    this.pinyinStatus = 'loading';
    this.renderCandidates();
    this.pinyinDictionaryPromise = this.loadPinyinDictionary()
      .then((dictionary) => {
        if (this.disposed) return dictionary;
        this.pinyinDictionary = dictionary;
        this.pinyinStatus = 'ready';
        this.refreshPinyinCandidates();
        return dictionary;
      })
      .catch((failure) => {
        this.pinyinStatus = 'error';
        this.renderCandidates();
        throw failure;
      })
      .finally(() => {
        this.pinyinDictionaryPromise = null;
      });
    void this.pinyinDictionaryPromise.catch(() => undefined);
  }

  private refreshPinyinCandidates() {
    this.pinyinCandidates = this.pinyinDictionary
      ? gamepadPinyinCandidates(
          this.pinyinDictionary,
          this.pinyinInput,
          this.candidateLimit,
        )
      : [];
    this.activeCandidateIndex = Math.min(
      this.activeCandidateIndex,
      Math.max(0, this.pinyinCandidates.length - 1),
    );
    this.renderCandidates();
    this.normalizeSelection();
    this.renderSelection();
    this.schedulePosition();
  }

  private setPinyinInput(value: string) {
    this.pinyinInput = value.toLowerCase().replace(/[^a-z']/g, '');
    this.candidateLimit = PINYIN_INITIAL_CANDIDATE_LIMIT;
    this.activeCandidateIndex = 0;
    if (this.pinyinInput) this.ensurePinyinDictionary();
    this.refreshPinyinCandidates();
    this.candidateList.scrollLeft = 0;
  }

  private commitCandidate(candidate: GamepadPinyinCandidate) {
    const target = this.target;
    if (!target) return;
    insertEditableText(target, candidate.word);
    this.setPinyinInput(
      this.pinyinInput.slice(Math.max(1, candidate.matchedLength)),
    );
  }

  private commitComposition() {
    const target = this.target;
    if (!target || !this.pinyinInput) return false;
    const candidate = this.pinyinCandidates[this.activeCandidateIndex];
    if (candidate) this.commitCandidate(candidate);
    else {
      const value = this.pinyinInput;
      this.setPinyinInput('');
      insertEditableText(target, value);
    }
    return true;
  }

  private perform(key: GamepadKeyboardKey) {
    const target = this.target;
    if (!target) return;
    if (key.action === 'candidate-expand') {
      this.expandCandidates();
      return;
    }
    if (key.action === 'candidate-previous') {
      this.selectPreviousCandidate();
      return;
    }
    if (key.action === 'candidate-next') {
      this.selectNextCandidate();
      return;
    }
    if (key.action === 'select-all') {
      this.selectAll();
      return;
    }
    if (key.action === 'toggle-language') {
      if (this.inputMode === 'chinese') this.commitComposition();
      this.inputMode = this.inputMode === 'chinese' ? 'english' : 'chinese';
      if (this.inputMode === 'chinese') this.ensurePinyinDictionary();
      this.renderKeyboard();
      return;
    }
    if (key.action === 'candidate' && key.candidate) {
      this.commitCandidate(key.candidate);
      return;
    }
    if (key.action === 'shift') {
      this.shifted = !this.shifted;
      this.renderSelection();
      return;
    }
    if (key.action === 'caps-lock') {
      this.capsLocked = !this.capsLocked;
      this.renderSelection();
      return;
    }
    if (key.action === 'backspace') {
      if (this.pinyinInput) {
        this.setPinyinInput(this.pinyinInput.slice(0, -1));
        return;
      }
      removeEditableText(target);
      return;
    }
    if (key.action === 'space') {
      if (!this.commitComposition()) insertEditableText(target, ' ');
      return;
    }
    if (key.action === 'tab') {
      this.commitComposition();
      insertEditableText(target, '\t');
      return;
    }
    if (key.action === 'enter') {
      if (this.commitComposition()) return;
      const event = {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      const accepted = target.dispatchEvent(
        new KeyboardEvent('keydown', event),
      );
      if (accepted) {
        if (
          target instanceof HTMLTextAreaElement ||
          (!(target instanceof HTMLInputElement) && target.isContentEditable)
        ) {
          insertEditableText(target, '\n');
        } else if (target instanceof HTMLInputElement) {
          target.form?.requestSubmit();
        }
      }
      target.dispatchEvent(new KeyboardEvent('keyup', event));
      this.close();
      return;
    }

    const uppercaseLetters = this.shifted !== this.capsLocked;
    const value =
      this.shifted && key.shifted
        ? key.shifted
        : uppercaseLetters && key.value?.length === 1
          ? key.value.toUpperCase()
          : key.value;
    if (!value) return;
    if (
      gamepadKeyboardComposesPinyin({
        capsLocked: this.capsLocked,
        inputMode: this.inputMode,
        shifted: this.shifted,
        value,
      })
    ) {
      this.setPinyinInput(this.pinyinInput + value.toLowerCase());
      return;
    }
    const candidateNumber = Number(value);
    const candidateIndex = candidateNumber - 1;
    if (
      this.pinyinInput &&
      candidateNumber >= 1 &&
      candidateNumber <= 9 &&
      Number.isInteger(candidateIndex) &&
      candidateIndex >= 0 &&
      this.pinyinCandidates[candidateIndex]
    ) {
      this.commitCandidate(this.pinyinCandidates[candidateIndex]);
      return;
    }
    this.commitComposition();
    insertEditableText(target, value);
  }

  private canExpandCandidates() {
    return (
      this.pinyinCandidates.length >= this.candidateLimit &&
      this.candidateLimit < PINYIN_MAX_CANDIDATE_LIMIT
    );
  }

  private expandCandidates() {
    if (!this.canExpandCandidates()) return;
    const previousLength = this.pinyinCandidates.length;
    this.candidateLimit = Math.min(
      PINYIN_MAX_CANDIDATE_LIMIT,
      this.candidateLimit + PINYIN_CANDIDATE_EXPANSION,
    );
    this.refreshPinyinCandidates();
    this.activeCandidateIndex = Math.min(
      previousLength,
      Math.max(0, this.pinyinCandidates.length - 1),
    );
    this.setSelection(
      { row: -1, column: this.activeCandidateIndex },
      'selection',
    );
  }

  private revealCandidateSelection() {
    const button = this.candidateList.querySelector<HTMLElement>(
      `[data-row="-1"][data-column="${this.selection.column}"]`,
    );
    if (!button) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    const visibleLeft = this.candidateList.scrollLeft;
    const visibleRight = visibleLeft + this.candidateList.clientWidth;
    const revealLeft = horizontalRevealPosition(
      { left, right },
      { left: visibleLeft, right: visibleRight },
    );
    if (revealLeft === null) return;
    this.candidateList.scrollTo({
      left: Math.min(
        Math.max(0, revealLeft),
        Math.max(
          0,
          this.candidateList.scrollWidth - this.candidateList.clientWidth,
        ),
      ),
      behavior: 'smooth',
    });
  }
}
