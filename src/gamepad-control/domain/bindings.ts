import { t } from '../../localization/messages';
import { gamepadAxis, STANDARD_GAMEPAD_AXIS } from './input';
import type { GamepadInputSnapshot } from './types';

export const GAMEPAD_BUTTON_OPTIONS = [
  {
    value: 0,
    get label() {
      return t('cm_bindings_label_1');
    },
  },
  {
    value: 1,
    get label() {
      return t('cm_bindings_label_2');
    },
  },
  {
    value: 2,
    get label() {
      return t('cm_bindings_label_3');
    },
  },
  {
    value: 3,
    get label() {
      return t('cm_bindings_label_4');
    },
  },
  { value: 4, label: 'L1 / LB' },
  { value: 5, label: 'R1 / RB' },
  { value: 6, label: 'L2 / LT' },
  { value: 7, label: 'R2 / RT' },
  { value: 8, label: 'Share / View' },
  { value: 9, label: 'Options / Menu' },
  { value: 10, label: 'L3' },
  { value: 11, label: 'R3' },
  {
    value: 12,
    get label() {
      return t('cm_bindings_label_5');
    },
  },
  {
    value: 13,
    get label() {
      return t('cm_bindings_label_6');
    },
  },
  {
    value: 14,
    get label() {
      return t('cm_bindings_label_7');
    },
  },
  {
    value: 15,
    get label() {
      return t('cm_bindings_label_8');
    },
  },
  { value: 16, label: 'PS / Guide' },
  {
    value: 17,
    get label() {
      return t('cm_bindings_label_9');
    },
  },
] as const;

export type GamepadButtonIndex =
  (typeof GAMEPAD_BUTTON_OPTIONS)[number]['value'];

export const GAMEPAD_BUTTON_BINDING_DEFINITIONS = [
  {
    action: 'confirm',
    get label() {
      return t('cm_bindings_label_10');
    },
    get description() {
      return t('cm_bindings_description_11');
    },
    get pointer() {
      return t('cm_bindings_pointer_12');
    },
    keyboard: 'Enter / Space',
  },
  {
    action: 'back',
    get label() {
      return t('cm_bindings_label_13');
    },
    get description() {
      return t('cm_bindings_description_14');
    },
    get pointer() {
      return t('cm_bindings_pointer_15');
    },
    keyboard: 'Esc',
  },
  {
    action: 'browserTabPrevious',
    get label() {
      return t('cm_bindings_label_16');
    },
    get description() {
      return t('cm_bindings_description_17');
    },
    get pointer() {
      return t('cm_bindings_pointer_18');
    },
    keyboard: 'Ctrl + Shift + Tab',
  },
  {
    action: 'browserTabNext',
    get label() {
      return t('cm_bindings_label_19');
    },
    get description() {
      return t('cm_bindings_description_20');
    },
    get pointer() {
      return t('cm_bindings_pointer_21');
    },
    keyboard: 'Ctrl + Tab',
  },
  {
    action: 'contextPrevious',
    get label() {
      return t('cm_bindings_label_22');
    },
    get description() {
      return t('cm_bindings_description_23');
    },
    get pointer() {
      return t('cm_bindings_pointer_24');
    },
    keyboard: 'Alt + ← / Ctrl + PageUp',
  },
  {
    action: 'contextNext',
    get label() {
      return t('cm_bindings_label_25');
    },
    get description() {
      return t('cm_bindings_description_26');
    },
    get pointer() {
      return t('cm_bindings_pointer_27');
    },
    keyboard: 'Alt + → / Ctrl + PageDown',
  },
  {
    action: 'pagePrevious',
    get label() {
      return t('cm_bindings_label_28');
    },
    get description() {
      return t('cm_bindings_description_29');
    },
    get pointer() {
      return t('cm_bindings_pointer_30');
    },
    keyboard: 'PageUp',
  },
  {
    action: 'pageNext',
    get label() {
      return t('cm_bindings_label_31');
    },
    get description() {
      return t('cm_bindings_description_32');
    },
    get pointer() {
      return t('cm_bindings_pointer_33');
    },
    keyboard: 'PageDown',
  },
  {
    action: 'reload',
    get label() {
      return t('cm_bindings_label_34');
    },
    get description() {
      return t('cm_bindings_description_35');
    },
    get pointer() {
      return t('cm_bindings_pointer_36');
    },
    keyboard: 'Ctrl / Cmd + R',
  },
  {
    action: 'toggleScreenKeyboard',
    get label() {
      return t('cm_bindings_label_37');
    },
    get description() {
      return t('cm_bindings_description_38');
    },
    get pointer() {
      return t('cm_bindings_pointer_39');
    },
    get keyboard() {
      return t('cm_bindings_keyboard_40');
    },
  },
  {
    action: 'pushToTalk',
    get label() {
      return t('cm_bindings_label_41');
    },
    get description() {
      return t('cm_bindings_description_42');
    },
    get pointer() {
      return t('cm_bindings_pointer_43');
    },
    get keyboard() {
      return t('cm_bindings_keyboard_44');
    },
  },
  {
    action: 'newTab',
    get label() {
      return t('cm_bindings_label_45');
    },
    get description() {
      return t('cm_bindings_description_46');
    },
    get pointer() {
      return t('cm_bindings_pointer_47');
    },
    keyboard: 'Ctrl / Cmd + T',
  },
  {
    action: 'cursorReset',
    get label() {
      return t('cm_bindings_label_48');
    },
    get description() {
      return t('cm_bindings_description_49');
    },
    get pointer() {
      return t('cm_bindings_pointer_50');
    },
    get keyboard() {
      return t('cm_bindings_keyboard_51');
    },
  },
  {
    action: 'toggleAudio',
    get label() {
      return t('cm_bindings_label_52');
    },
    get description() {
      return t('cm_bindings_description_53');
    },
    get pointer() {
      return t('cm_bindings_pointer_54');
    },
    keyboard: 'M',
  },
  {
    action: 'toggleDeck',
    get label() {
      return t('cm_bindings_label_55');
    },
    get description() {
      return t('cm_bindings_description_56');
    },
    get pointer() {
      return t('cm_bindings_pointer_57');
    },
    get keyboard() {
      return t('cm_bindings_keyboard_58');
    },
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
  t('cm_bindings_text_59'),
  t('cm_bindings_text_60'),
  t('cm_bindings_text_61'),
  t('cm_bindings_text_62'),
  'L1',
  'R1',
  'L2',
  'R2',
  'Share',
  'Options',
  'L3',
  'R3',
  t('cm_bindings_text_63'),
  t('cm_bindings_text_64'),
  t('cm_bindings_text_65'),
  t('cm_bindings_text_66'),
  'PS',
  t('cm_bindings_text_67'),
] as const;

const XBOX_BUTTON_LABELS = [
  t('cm_bindings_text_68'),
  t('cm_bindings_text_69'),
  t('cm_bindings_text_70'),
  t('cm_bindings_text_71'),
  'LB',
  'RB',
  'LT',
  'RT',
  'View',
  'Menu',
  t('cm_bindings_text_72'),
  t('cm_bindings_text_73'),
  t('cm_bindings_text_74'),
  t('cm_bindings_text_75'),
  t('cm_bindings_text_76'),
  t('cm_bindings_text_77'),
  'Xbox',
] as const;

const NINTENDO_BUTTON_LABELS = [
  t('cm_bindings_text_78'),
  t('cm_bindings_text_79'),
  t('cm_bindings_text_80'),
  t('cm_bindings_text_81'),
  'L',
  'R',
  'ZL',
  'ZR',
  t('cm_bindings_text_82'),
  t('cm_bindings_text_83'),
  t('cm_bindings_text_84'),
  t('cm_bindings_text_85'),
  t('cm_bindings_text_86'),
  t('cm_bindings_text_87'),
  t('cm_bindings_text_88'),
  t('cm_bindings_text_89'),
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
  if (button === null) return t('cm_bindings_text_90');
  return (
    controllerButtonLabels(deviceId)?.[button] ??
    GAMEPAD_BUTTON_OPTIONS.find((option) => option.value === button)?.label ??
    t('cm_bindings_text_91', [String(button)])
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
  if (action === 'toggleDeck') return t('cm_bindings_text_92');
  if (context === 'paused') return null;
  if (action === 'pushToTalk') return t('cm_bindings_text_93');
  if (context === 'keyboard' || context === 'keyboard-candidates') {
    const labels: Partial<Record<GamepadBindingAction, string>> = {
      confirm:
        context === 'keyboard-candidates'
          ? t('cm_bindings_text_94')
          : t('cm_bindings_text_95'),
      back: t('cm_bindings_back_96'),
      browserTabPrevious: t('cm_bindings_browser_tab_previous_97'),
      browserTabNext: t('cm_bindings_browser_tab_next_98'),
      toggleScreenKeyboard: t('cm_bindings_toggle_screen_keyboard_99'),
      ...(context === 'keyboard-candidates'
        ? {
            contextPrevious: t('cm_bindings_context_previous_100'),
            contextNext: t('cm_bindings_context_next_101'),
          }
        : {}),
    };
    return labels[action] ?? null;
  }
  if (context === 'extension') {
    const labels: Partial<Record<GamepadBindingAction, string>> = {
      confirm: t('cm_bindings_confirm_102'),
      back: t('cm_bindings_back_103'),
      browserTabPrevious: t('cm_bindings_browser_tab_previous_104'),
      browserTabNext: t('cm_bindings_browser_tab_next_105'),
      contextPrevious: t('cm_bindings_context_previous_106'),
      contextNext: t('cm_bindings_context_next_107'),
      pagePrevious: t('cm_bindings_page_previous_108'),
      pageNext: t('cm_bindings_page_next_109'),
      toggleAudio: t('cm_bindings_toggle_audio_110'),
      pushToTalk: t('cm_bindings_push_to_talk_111'),
    };
    return labels[action] ?? null;
  }
  const labels: Partial<Record<GamepadBindingAction, string>> = {
    confirm: t('cm_bindings_confirm_112'),
    back: t('cm_bindings_back_113'),
    browserTabPrevious: t('cm_bindings_browser_tab_previous_114'),
    browserTabNext: t('cm_bindings_browser_tab_next_115'),
    contextPrevious: t('cm_bindings_context_previous_116'),
    contextNext: t('cm_bindings_context_next_117'),
    pagePrevious: t('cm_bindings_page_previous_118'),
    pageNext: t('cm_bindings_page_next_119'),
    reload: t('cm_bindings_reload_120'),
    toggleScreenKeyboard: t('cm_bindings_toggle_screen_keyboard_121'),
    pushToTalk: t('cm_bindings_push_to_talk_122'),
    newTab: t('cm_bindings_new_tab_123'),
    cursorReset: t('cm_bindings_cursor_reset_124'),
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
    add(
      context === 'page'
        ? t('cm_bindings_text_125')
        : t('cm_bindings_text_126'),
      true,
    );
  }
  if (context !== 'paused' && secondaryActive)
    add(t('cm_bindings_text_127'), true);

  const claimedButtons = gamepadClaimedButtons(bindings);
  if (
    context !== 'paused' &&
    [12, 13, 14, 15].some(
      (button) =>
        !claimedButtons.has(button as GamepadButtonIndex) &&
        (snapshot.buttons[button] ?? 0) >= 0.5,
    )
  ) {
    add(t('cm_bindings_text_128'), true);
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
