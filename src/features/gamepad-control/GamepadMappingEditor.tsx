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
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';

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
  useLocale();

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
        ? t('cm_gamepad_mapping_editor_text_1', [String(conflict.label)])
        : conflict
          ? t('cm_gamepad_mapping_editor_text_2', [String(conflict.label)])
          : '';
    onFeedback(
      t('cm_gamepad_mapping_editor_text_3', [
        String(definition?.label),
        String(gamepadButtonLabel(button)),
        String(conflictMessage),
      ]),
    );
  };

  return (
    <div className="gamepad-mapping-editor">
      <div className="gamepad-mapping-editor__guide">
        <Gamepad2 size={20} aria-hidden="true" />
        <p>{t('cm_gamepad_mapping_editor_text_4')}</p>
      </div>

      <div className="gamepad-mapping-editor__header" aria-hidden="true">
        <strong>{t('cm_gamepad_mapping_editor_text_5')}</strong>
        <span>
          <MousePointer2 size={14} />
          {t('cm_gamepad_mapping_editor_text_6')}
        </span>
        <span>
          <Keyboard size={14} />
          {t('cm_gamepad_mapping_editor_text_7')}
        </span>
        <span>
          <Gamepad2 size={14} />
          {t('cm_gamepad_mapping_editor_text_8')}
        </span>
      </div>

      <div className="gamepad-mapping-editor__rows">
        <label
          htmlFor="gamepad-primary-stick"
          className={`gamepad-mapping-row${primaryActive ? ' is-active' : ''}`}
        >
          <span className="gamepad-mapping-row__function">
            <strong>{t('cm_gamepad_mapping_editor_text_9')}</strong>
            <small>{t('cm_gamepad_mapping_editor_text_10')}</small>
          </span>
          <span className="gamepad-mapping-row__reference">
            {t('cm_gamepad_mapping_editor_text_11')}
          </span>
          <span className="gamepad-mapping-row__reference">
            {t('cm_gamepad_mapping_editor_text_12')}
          </span>
          <UiSelect
            id="gamepad-primary-stick"
            aria-label={t('cm_gamepad_mapping_editor_aria_label_13')}
            value={bindings.primaryStick}
            onChange={(event) => {
              const stick = event.currentTarget.value as 'left' | 'right';
              onChange(setGamepadStickBinding(bindings, 'primaryStick', stick));
              onFeedback(
                t('cm_gamepad_mapping_editor_text_14', [
                  String(
                    stick === 'left'
                      ? t('cm_gamepad_mapping_editor_text_13')
                      : t('cm_gamepad_mapping_editor_text_20'),
                  ),
                ]),
              );
            }}
          >
            <option value="left">
              {t('cm_gamepad_mapping_editor_text_15')}
            </option>
            <option value="right">
              {t('cm_gamepad_mapping_editor_text_16')}
            </option>
          </UiSelect>
        </label>

        <label
          htmlFor="gamepad-secondary-stick"
          className={`gamepad-mapping-row${secondaryActive ? ' is-active' : ''}`}
        >
          <span className="gamepad-mapping-row__function">
            <strong>{t('cm_gamepad_mapping_editor_text_17')}</strong>
            <small>{t('cm_gamepad_mapping_editor_text_18')}</small>
          </span>
          <span className="gamepad-mapping-row__reference">
            {t('cm_gamepad_mapping_editor_text_19')}
          </span>
          <span className="gamepad-mapping-row__reference">
            PageUp / PageDown
          </span>
          <UiSelect
            id="gamepad-secondary-stick"
            aria-label={t('cm_gamepad_mapping_editor_aria_label_20')}
            value={bindings.secondaryStick}
            onChange={(event) => {
              const stick = event.currentTarget.value as 'left' | 'right';
              onChange(
                setGamepadStickBinding(bindings, 'secondaryStick', stick),
              );
              onFeedback(
                t('cm_gamepad_mapping_editor_text_21', [
                  String(
                    stick === 'left'
                      ? t('cm_gamepad_mapping_editor_text_31')
                      : t('cm_gamepad_mapping_editor_text_32'),
                  ),
                ]),
              );
            }}
          >
            <option value="left">
              {t('cm_gamepad_mapping_editor_text_22')}
            </option>
            <option value="right">
              {t('cm_gamepad_mapping_editor_text_23')}
            </option>
          </UiSelect>
        </label>

        <div className={`gamepad-mapping-row${dpadActive ? ' is-active' : ''}`}>
          <span className="gamepad-mapping-row__function">
            <strong>{t('cm_gamepad_mapping_editor_text_24')}</strong>
            <small>{t('cm_gamepad_mapping_editor_text_25')}</small>
          </span>
          <span className="gamepad-mapping-row__reference">
            {t('cm_gamepad_mapping_editor_text_26')}
          </span>
          <span className="gamepad-mapping-row__reference">
            {t('cm_gamepad_mapping_editor_text_27')}
          </span>
          <span className="gamepad-mapping-row__fixed-control">
            {t('cm_gamepad_mapping_editor_text_28')}
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
                aria-label={t('cm_gamepad_mapping_editor_text_29', [
                  String(definition.label),
                ])}
                value={button ?? ''}
                onChange={(event) =>
                  updateButton(
                    definition.action,
                    selectedButton(event.currentTarget.value),
                  )
                }
              >
                <option value="">
                  {t('cm_gamepad_mapping_editor_text_30')}
                </option>
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
