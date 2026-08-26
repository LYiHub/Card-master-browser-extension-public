import { Gamepad2, Keyboard, MousePointer2 } from 'lucide-react';

import { UiSelect } from '../../components/ui/Ui';
import {
  GAMEPAD_BUTTON_BINDING_DEFINITIONS,
  GAMEPAD_BUTTON_OPTIONS,
  type GamepadBindingAction,
  type GamepadBindings,
  type GamepadButtonIndex,
  gamepadButtonLabel,
  gamepadClaimedButtons,
  gamepadStickAxes,
  isGamepadContinuousButtonAction,
  setGamepadButtonBinding,
  setGamepadStickBinding,
} from '../../gamepad-control/domain/bindings';
import { gamepadAxis } from '../../gamepad-control/domain/input';
import type { GamepadInputSnapshot } from '../../gamepad-control/domain/types';

function selectedButton(value: string): GamepadButtonIndex | null {
  if (value === '') return null;
  const button = Number(value);
  return GAMEPAD_BUTTON_OPTIONS.some((option) => option.value === button)
    ? (button as GamepadButtonIndex)
    : null;
}

export function GamepadMappingEditor({
  bindings,
  snapshot,
  deadZone,
  speechInputAvailable = true,
  onChange,
  onFeedback,
}: {
  bindings: GamepadBindings;
  snapshot: GamepadInputSnapshot;
  deadZone: number;
  speechInputAvailable?: boolean;
  onChange: (bindings: GamepadBindings) => void;
  onFeedback: (message: string) => void;
}) {
  const primaryActive = gamepadStickAxes(bindings.primaryStick).some(
    (index) => gamepadAxis(snapshot, index, deadZone) !== 0,
  );
  const secondaryActive = gamepadStickAxes(bindings.secondaryStick).some(
    (index) => gamepadAxis(snapshot, index, deadZone) !== 0,
  );
  const claimedButtons = gamepadClaimedButtons(bindings);
  const dpadActive = [12, 13, 14, 15].some(
    (button) =>
      !claimedButtons.has(button as GamepadButtonIndex) &&
      (snapshot.buttons[button] ?? 0) >= 0.5,
  );

  const updateButton = (
    action: GamepadBindingAction,
    button: GamepadButtonIndex | null,
  ) => {
    const conflict = GAMEPAD_BUTTON_BINDING_DEFINITIONS.find(
      (definition) =>
        definition.action !== action &&
        button !== null &&
        bindings.buttons[definition.action] === button,
    );
    onChange(setGamepadButtonBinding(bindings, action, button));
    const definition = GAMEPAD_BUTTON_BINDING_DEFINITIONS.find(
      (candidate) => candidate.action === action,
    );
    const conflictMessage =
      conflict &&
      action === 'toggleDeck' &&
      conflict.action !== 'pushToTalk' &&
      !isGamepadContinuousButtonAction(conflict.action)
        ? `；短按继续执行“${conflict.label}”，长按打开牌库`
        : conflict
          ? `；冲突的“${conflict.label}”已自动交换`
          : '';
    onFeedback(
      `“${definition?.label}”已改为${gamepadButtonLabel(button)}${conflictMessage}。`,
    );
  };

  return (
    <div className="gamepad-mapping-editor">
      <div className="gamepad-mapping-editor__guide">
        <Gamepad2 size={20} aria-hidden="true" />
        <p>
          按下手柄时，对应映射会即时高亮。手柄列可以直接修改；普通命令发生冲突时会自动交换，不会让一个按键同时执行多个命令。
        </p>
      </div>

      <div className="gamepad-mapping-editor__header" aria-hidden="true">
        <strong>功能</strong>
        <span>
          <MousePointer2 size={14} />
          鼠标
        </span>
        <span>
          <Keyboard size={14} />
          键盘
        </span>
        <span>
          <Gamepad2 size={14} />
          手柄
        </span>
      </div>

      <div className="gamepad-mapping-editor__rows">
        <label
          htmlFor="gamepad-primary-stick"
          className={`gamepad-mapping-row${primaryActive ? ' is-active' : ''}`}
        >
          <span className="gamepad-mapping-row__function">
            <strong>主要移动</strong>
            <small>网页移动虚拟光标；扩展界面进行方向导航</small>
          </span>
          <span className="gamepad-mapping-row__reference">移动指针</span>
          <span className="gamepad-mapping-row__reference">方向键</span>
          <UiSelect
            id="gamepad-primary-stick"
            aria-label="主要移动摇杆"
            value={bindings.primaryStick}
            onChange={(event) => {
              const stick = event.currentTarget.value as 'left' | 'right';
              onChange(setGamepadStickBinding(bindings, 'primaryStick', stick));
              onFeedback(
                `主要移动已改为${stick === 'left' ? '左摇杆' : '右摇杆'}，滚动摇杆已自动交换。`,
              );
            }}
          >
            <option value="left">左摇杆</option>
            <option value="right">右摇杆</option>
          </UiSelect>
        </label>

        <label
          htmlFor="gamepad-secondary-stick"
          className={`gamepad-mapping-row${secondaryActive ? ' is-active' : ''}`}
        >
          <span className="gamepad-mapping-row__function">
            <strong>连续滚动</strong>
            <small>滚动网页、工作区或当前模态框正文</small>
          </span>
          <span className="gamepad-mapping-row__reference">滚轮 / 触控板</span>
          <span className="gamepad-mapping-row__reference">
            PageUp / PageDown
          </span>
          <UiSelect
            id="gamepad-secondary-stick"
            aria-label="连续滚动摇杆"
            value={bindings.secondaryStick}
            onChange={(event) => {
              const stick = event.currentTarget.value as 'left' | 'right';
              onChange(
                setGamepadStickBinding(bindings, 'secondaryStick', stick),
              );
              onFeedback(
                `连续滚动已改为${stick === 'left' ? '左摇杆' : '右摇杆'}，主要移动摇杆已自动交换。`,
              );
            }}
          >
            <option value="left">左摇杆</option>
            <option value="right">右摇杆</option>
          </UiSelect>
        </label>

        <div className={`gamepad-mapping-row${dpadActive ? ' is-active' : ''}`}>
          <span className="gamepad-mapping-row__function">
            <strong>方向导航</strong>
            <small>在网页、牌阵、指令法环和控件之间按空间位置移动</small>
          </span>
          <span className="gamepad-mapping-row__reference">悬浮 / 单击</span>
          <span className="gamepad-mapping-row__reference">方向键</span>
          <span className="gamepad-mapping-row__fixed-control">
            未被其他命令占用的十字键
          </span>
        </div>

        {GAMEPAD_BUTTON_BINDING_DEFINITIONS.filter(
          (definition) =>
            speechInputAvailable || definition.action !== 'pushToTalk',
        ).map((definition) => {
          const button = bindings.buttons[definition.action];
          const active =
            button !== null &&
            (snapshot.buttons[button] ?? 0) >=
              (isGamepadContinuousButtonAction(definition.action) ? 0.15 : 0.5);
          return (
            <label
              key={definition.action}
              htmlFor={`gamepad-binding-${definition.action}`}
              className={`gamepad-mapping-row${active ? ' is-active' : ''}`}
            >
              <span className="gamepad-mapping-row__function">
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </span>
              <span className="gamepad-mapping-row__reference">
                {definition.pointer}
              </span>
              <span className="gamepad-mapping-row__reference">
                {definition.keyboard}
              </span>
              <UiSelect
                id={`gamepad-binding-${definition.action}`}
                aria-label={`${definition.label}的手柄按键`}
                value={button ?? ''}
                onChange={(event) =>
                  updateButton(
                    definition.action,
                    selectedButton(event.currentTarget.value),
                  )
                }
              >
                <option value="">未设置</option>
                {GAMEPAD_BUTTON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </UiSelect>
            </label>
          );
        })}
      </div>
    </div>
  );
}
