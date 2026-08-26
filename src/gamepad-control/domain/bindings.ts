import { gamepadAxis, STANDARD_GAMEPAD_AXIS } from './input';
import type { GamepadInputSnapshot } from './types';

export const GAMEPAD_BUTTON_OPTIONS = [
  { value: 0, label: '叉键 / A' },
  { value: 1, label: '圆键 / B' },
  { value: 2, label: '方块 / X' },
  { value: 3, label: '三角 / Y' },
  { value: 4, label: 'L1 / LB' },
  { value: 5, label: 'R1 / RB' },
  { value: 6, label: 'L2 / LT' },
  { value: 7, label: 'R2 / RT' },
  { value: 8, label: 'Share / View' },
  { value: 9, label: 'Options / Menu' },
  { value: 10, label: 'L3' },
  { value: 11, label: 'R3' },
  { value: 12, label: '十字键上' },
  { value: 13, label: '十字键下' },
  { value: 14, label: '十字键左' },
  { value: 15, label: '十字键右' },
  { value: 16, label: 'PS / Guide' },
  { value: 17, label: '触摸板' },
] as const;

export type GamepadButtonIndex =
  (typeof GAMEPAD_BUTTON_OPTIONS)[number]['value'];

export const GAMEPAD_BUTTON_BINDING_DEFINITIONS = [
  {
    action: 'confirm',
    label: '确认与执行',
    description: '点击当前目标，或执行牌阵与模态框中的当前动作',
    pointer: '单击',
    keyboard: 'Enter / Space',
  },
  {
    action: 'back',
    label: '返回上一层',
    description: '取消当前操作，或关闭最上层界面',
    pointer: '关闭 / 返回按钮',
    keyboard: 'Esc',
  },
  {
    action: 'browserTabPrevious',
    label: '上一个浏览器标签页',
    description: '切换到当前窗口左侧相邻的浏览器标签页',
    pointer: '单击左侧标签页',
    keyboard: 'Ctrl + Shift + Tab',
  },
  {
    action: 'browserTabNext',
    label: '下一个浏览器标签页',
    description: '切换到当前窗口右侧相邻的浏览器标签页',
    pointer: '单击右侧标签页',
    keyboard: 'Ctrl + Tab',
  },
  {
    action: 'contextPrevious',
    label: '上一页 / 上一个标签',
    description: '网页中后退一页；扩展界面中切换到上一个标签',
    pointer: '浏览器后退 / 单击标签',
    keyboard: 'Alt + ← / Ctrl + PageUp',
  },
  {
    action: 'contextNext',
    label: '下一页 / 下一个标签',
    description: '网页中前进一页；扩展界面中切换到下一个标签',
    pointer: '浏览器前进 / 单击标签',
    keyboard: 'Alt + → / Ctrl + PageDown',
  },
  {
    action: 'pagePrevious',
    label: '向上翻页',
    description: '按住时根据扳机压力或按钮状态连续向上翻页',
    pointer: '滚轮向上',
    keyboard: 'PageUp',
  },
  {
    action: 'pageNext',
    label: '向下翻页',
    description: '按住时根据扳机压力或按钮状态连续向下翻页',
    pointer: '滚轮向下',
    keyboard: 'PageDown',
  },
  {
    action: 'reload',
    label: '刷新网页',
    description: '刷新当前浏览器标签页',
    pointer: '浏览器刷新按钮',
    keyboard: 'Ctrl / Cmd + R',
  },
  {
    action: 'toggleScreenKeyboard',
    label: '屏幕键盘',
    description: '为当前网页输入框打开或关闭手柄屏幕键盘',
    pointer: '单击输入框',
    keyboard: '无固定快捷键',
  },
  {
    action: 'pushToTalk',
    label: '按住说话',
    description: '长按后开始语音输入，松开时识别并写入当前网页输入框',
    pointer: '输入框中的语音按钮',
    keyboard: '无固定快捷键',
  },
  {
    action: 'newTab',
    label: '新建浏览器标签页',
    description: '打开一个新的浏览器标签页',
    pointer: '浏览器新建标签按钮',
    keyboard: 'Ctrl / Cmd + T',
  },
  {
    action: 'cursorReset',
    label: '重置虚拟光标',
    description: '将手柄虚拟光标移回当前视口中央',
    pointer: '直接移动鼠标',
    keyboard: '无固定快捷键',
  },
  {
    action: 'toggleAudio',
    label: '交互声音',
    description: '在牌阵展开时开启或关闭交互声音',
    pointer: '声音按钮',
    keyboard: 'M',
  },
  {
    action: 'toggleDeck',
    label: '展开或收起牌库',
    description: '长按指定按钮打开牌库；短按仍可执行同键的普通命令',
    pointer: '单击牌库入口',
    keyboard: '聚焦入口后 Enter',
  },
] as const;

export type GamepadBindingAction =
  (typeof GAMEPAD_BUTTON_BINDING_DEFINITIONS)[number]['action'];
export type GamepadStick = 'left' | 'right';

export type GamepadBindings = {
  buttons: Record<GamepadBindingAction, GamepadButtonIndex | null>;
  primaryStick: GamepadStick;
  secondaryStick: GamepadStick;
};

export const GAMEPAD_CONTINUOUS_BUTTON_ACTIONS = [
  'pagePrevious',
  'pageNext',
] as const satisfies readonly GamepadBindingAction[];

const NORMAL_BUTTON_ACTIONS = GAMEPAD_BUTTON_BINDING_DEFINITIONS.flatMap(
  ({ action }) => (action === 'toggleDeck' ? [] : [action]),
);

const BUTTON_OPTION_VALUES = new Set<number>(
  GAMEPAD_BUTTON_OPTIONS.map(({ value }) => value),
);

export function defaultGamepadBindings(): GamepadBindings {
  return {
    buttons: {
      confirm: 0,
      back: 1,
      browserTabPrevious: 6,
      browserTabNext: 7,
      contextPrevious: 4,
      contextNext: 5,
      pagePrevious: null,
      pageNext: null,
      reload: 2,
      toggleScreenKeyboard: 3,
      pushToTalk: 17,
      newTab: 8,
      cursorReset: 10,
      toggleAudio: null,
      toggleDeck: 9,
    },
    primaryStick: 'left',
    secondaryStick: 'right',
  };
}

function buttonIndex(value: unknown): value is GamepadButtonIndex | null {
  return (
    value === null ||
    (typeof value === 'number' && BUTTON_OPTION_VALUES.has(value))
  );
}

export function isGamepadBindings(value: unknown): value is GamepadBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bindings = value as Record<string, unknown>;
  if (
    (bindings.primaryStick !== 'left' && bindings.primaryStick !== 'right') ||
    (bindings.secondaryStick !== 'left' &&
      bindings.secondaryStick !== 'right') ||
    bindings.primaryStick === bindings.secondaryStick ||
    !bindings.buttons ||
    typeof bindings.buttons !== 'object' ||
    Array.isArray(bindings.buttons)
  ) {
    return false;
  }
  const buttons = bindings.buttons as Record<string, unknown>;
  if (
    !GAMEPAD_BUTTON_BINDING_DEFINITIONS.every(({ action }) =>
      buttonIndex(buttons[action]),
    )
  ) {
    return false;
  }
  const assigned = NORMAL_BUTTON_ACTIONS.flatMap((action) => {
    const value = buttons[action];
    return typeof value === 'number' ? [value] : [];
  });
  if (new Set(assigned).size !== assigned.length) return false;
  const deckButton = buttons.toggleDeck;
  return !(
    typeof deckButton === 'number' &&
    (buttons.pushToTalk === deckButton ||
      GAMEPAD_CONTINUOUS_BUTTON_ACTIONS.some(
        (action) => buttons[action] === deckButton,
      ))
  );
}

export function normalizeGamepadBindings(
  bindings: GamepadBindings,
): GamepadBindings {
  return {
    buttons: { ...bindings.buttons },
    primaryStick: bindings.primaryStick,
    secondaryStick: bindings.secondaryStick,
  };
}

export function isGamepadContinuousButtonAction(action: GamepadBindingAction) {
  return (GAMEPAD_CONTINUOUS_BUTTON_ACTIONS as readonly string[]).includes(
    action,
  );
}

export function setGamepadButtonBinding(
  bindings: GamepadBindings,
  action: GamepadBindingAction,
  button: GamepadButtonIndex | null,
) {
  const next = normalizeGamepadBindings(bindings);
  const previous = next.buttons[action];
  if (previous === button) return next;

  if (action === 'toggleDeck') {
    if (button !== null) {
      if (next.buttons.pushToTalk === button) {
        const previousAvailable =
          previous !== null &&
          !NORMAL_BUTTON_ACTIONS.some(
            (candidate) =>
              candidate !== 'pushToTalk' &&
              next.buttons[candidate] === previous,
          );
        next.buttons.pushToTalk = previousAvailable ? previous : null;
      }
      const continuousConflict = GAMEPAD_CONTINUOUS_BUTTON_ACTIONS.find(
        (candidate) => next.buttons[candidate] === button,
      );
      if (continuousConflict) {
        const shortActionAtPrevious =
          previous === null
            ? undefined
            : NORMAL_BUTTON_ACTIONS.find(
                (candidate) =>
                  candidate !== continuousConflict &&
                  next.buttons[candidate] === previous,
              );
        next.buttons[continuousConflict] = previous;
        if (shortActionAtPrevious) next.buttons[shortActionAtPrevious] = button;
      }
    }
    next.buttons.toggleDeck = button;
    return next;
  }

  const conflict = NORMAL_BUTTON_ACTIONS.find(
    (candidate) => candidate !== action && next.buttons[candidate] === button,
  );
  next.buttons[action] = button;
  if (conflict) next.buttons[conflict] = previous;

  if (
    (isGamepadContinuousButtonAction(action) || action === 'pushToTalk') &&
    button === next.buttons.toggleDeck
  ) {
    next.buttons.toggleDeck = previous;
  } else if (
    conflict &&
    (isGamepadContinuousButtonAction(conflict) || conflict === 'pushToTalk') &&
    previous === next.buttons.toggleDeck
  ) {
    next.buttons.toggleDeck = button;
  }
  return next;
}

export function setGamepadStickBinding(
  bindings: GamepadBindings,
  role: 'primaryStick' | 'secondaryStick',
  stick: GamepadStick,
) {
  if (bindings[role] === stick) return normalizeGamepadBindings(bindings);
  return {
    ...normalizeGamepadBindings(bindings),
    primaryStick: role === 'primaryStick' ? stick : bindings.secondaryStick,
    secondaryStick: role === 'secondaryStick' ? stick : bindings.primaryStick,
  };
}

export function gamepadStickAxes(stick: GamepadStick) {
  return stick === 'left'
    ? ([STANDARD_GAMEPAD_AXIS.leftX, STANDARD_GAMEPAD_AXIS.leftY] as const)
    : ([STANDARD_GAMEPAD_AXIS.rightX, STANDARD_GAMEPAD_AXIS.rightY] as const);
}

const PLAYSTATION_BUTTON_LABELS = [
  '叉键',
  '圆键',
  '方块',
  '三角',
  'L1',
  'R1',
  'L2',
  'R2',
  'Share',
  'Options',
  'L3',
  'R3',
  '十字键上',
  '十字键下',
  '十字键左',
  '十字键右',
  'PS',
  '触摸板',
] as const;

const XBOX_BUTTON_LABELS = [
  'A 键',
  'B 键',
  'X 键',
  'Y 键',
  'LB',
  'RB',
  'LT',
  'RT',
  'View',
  'Menu',
  '左摇杆',
  '右摇杆',
  '十字键上',
  '十字键下',
  '十字键左',
  '十字键右',
  'Xbox',
] as const;

const NINTENDO_BUTTON_LABELS = [
  'B 键',
  'A 键',
  'Y 键',
  'X 键',
  'L',
  'R',
  'ZL',
  'ZR',
  '减号键',
  '加号键',
  '左摇杆',
  '右摇杆',
  '十字键上',
  '十字键下',
  '十字键左',
  '十字键右',
  'Home',
  'Capture',
] as const;

function controllerButtonLabels(deviceId: string) {
  if (/playstation|dualsense|dualshock|054c/i.test(deviceId)) {
    return PLAYSTATION_BUTTON_LABELS;
  }
  if (/xbox|xinput|045e/i.test(deviceId)) return XBOX_BUTTON_LABELS;
  if (/nintendo|joy-con|switch|057e/i.test(deviceId)) {
    return NINTENDO_BUTTON_LABELS;
  }
  return null;
}

export function gamepadButtonLabel(
  button: GamepadButtonIndex | null,
  deviceId = '',
) {
  if (button === null) return '未设置';
  return (
    controllerButtonLabels(deviceId)?.[button] ??
    GAMEPAD_BUTTON_OPTIONS.find((option) => option.value === button)?.label ??
    `按钮 ${button}`
  );
}

export function gamepadClaimedButtons(bindings: GamepadBindings) {
  return new Set(
    GAMEPAD_BUTTON_BINDING_DEFINITIONS.flatMap(({ action }) => {
      const button = bindings.buttons[action];
      return button === null ? [] : [button];
    }),
  );
}

export type GamepadBindingContext =
  | 'page'
  | 'extension'
  | 'keyboard'
  | 'keyboard-candidates'
  | 'paused';

export type ActiveGamepadBindingAction = {
  label: string;
  persistentWhileHeld: boolean;
};

function activeActionLabel(
  action: GamepadBindingAction,
  context: GamepadBindingContext,
) {
  if (action === 'toggleDeck') return '长按牌库';
  if (context === 'paused') return null;
  if (action === 'pushToTalk') return '按住说话';
  if (context === 'keyboard' || context === 'keyboard-candidates') {
    const labels: Partial<Record<GamepadBindingAction, string>> = {
      confirm:
        context === 'keyboard-candidates' ? '选择候选词' : '输入当前键帽',
      back: '关闭键盘',
      browserTabPrevious: '退格',
      browserTabNext: '回车',
      toggleScreenKeyboard: '关闭键盘',
      ...(context === 'keyboard-candidates'
        ? {
            contextPrevious: '上一个候选词',
            contextNext: '下一个候选词',
          }
        : {}),
    };
    return labels[action] ?? null;
  }
  if (context === 'extension') {
    const labels: Partial<Record<GamepadBindingAction, string>> = {
      confirm: '确认',
      back: '返回',
      browserTabPrevious: '上一个浏览器标签页',
      browserTabNext: '下一个浏览器标签页',
      contextPrevious: '上一个标签',
      contextNext: '下一个标签',
      pagePrevious: '向上翻页',
      pageNext: '向下翻页',
      toggleAudio: '声音开关',
      pushToTalk: '按住说话',
    };
    return labels[action] ?? null;
  }
  const labels: Partial<Record<GamepadBindingAction, string>> = {
    confirm: '点击',
    back: '取消',
    browserTabPrevious: '上一个标签页',
    browserTabNext: '下一个标签页',
    contextPrevious: '浏览器后退',
    contextNext: '浏览器前进',
    pagePrevious: '向上翻页',
    pageNext: '向下翻页',
    reload: '刷新网页',
    toggleScreenKeyboard: '屏幕键盘',
    pushToTalk: '按住说话',
    newTab: '新建标签页',
    cursorReset: '重置光标',
  };
  return labels[action] ?? null;
}

export function activeGamepadBindingActions({
  snapshot,
  bindings,
  deadZone,
  context,
}: {
  snapshot: GamepadInputSnapshot;
  bindings: GamepadBindings;
  deadZone: number;
  context: GamepadBindingContext;
}): ActiveGamepadBindingAction[] {
  const actions = new Map<string, boolean>();
  const add = (label: string, persistentWhileHeld: boolean) => {
    actions.set(label, persistentWhileHeld || actions.get(label) === true);
  };
  const primaryAxes = gamepadStickAxes(bindings.primaryStick);
  const secondaryAxes = gamepadStickAxes(bindings.secondaryStick);
  const primaryActive = primaryAxes.some(
    (index) => gamepadAxis(snapshot, index, deadZone) !== 0,
  );
  const secondaryActive = secondaryAxes.some(
    (index) => gamepadAxis(snapshot, index, deadZone) !== 0,
  );
  if (context !== 'paused' && primaryActive) {
    add(context === 'page' ? '移动光标' : '方向导航', true);
  }
  if (context !== 'paused' && secondaryActive) add('滚动', true);

  const claimedButtons = gamepadClaimedButtons(bindings);
  if (
    context !== 'paused' &&
    [12, 13, 14, 15].some(
      (button) =>
        !claimedButtons.has(button as GamepadButtonIndex) &&
        (snapshot.buttons[button] ?? 0) >= 0.5,
    )
  ) {
    add('方向导航', true);
  }

  for (const { action } of GAMEPAD_BUTTON_BINDING_DEFINITIONS) {
    const button = bindings.buttons[action];
    if (button === null) continue;
    const threshold = isGamepadContinuousButtonAction(action) ? 0.15 : 0.5;
    if ((snapshot.buttons[button] ?? 0) < threshold) continue;
    const label = activeActionLabel(action, context);
    if (label) {
      add(
        label,
        isGamepadContinuousButtonAction(action) ||
          action === 'pushToTalk' ||
          action === 'toggleDeck' ||
          button === 6 ||
          button === 7 ||
          button === 17,
      );
    }
  }
  return [...actions].map(([label, persistentWhileHeld]) => ({
    label,
    persistentWhileHeld,
  }));
}
