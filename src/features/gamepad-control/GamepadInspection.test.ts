import { describe, expect, it } from 'vitest';

import type { IntentEnvelope, InteractionIntent } from '../../input/intents';
import {
  captureGamepadInspectionInput,
  GAMEPAD_INSPECTION_INPUT_SCOPE,
} from './GamepadInspection';

function gamepadIntent(intent: InteractionIntent): IntentEnvelope {
  return {
    intent,
    source: 'gamepad',
    deviceId: 'controller',
    phase: 'pressed',
    timestamp: 1,
  };
}

describe('gamepad inspection input capture', () => {
  it('is an exclusive gamepad-only scope above every ordinary surface', () => {
    expect(GAMEPAD_INSPECTION_INPUT_SCOPE).toMatchObject({
      id: 'gamepad-test-capture',
      modalities: ['gamepad'],
      exclusive: true,
    });
  });

  it('consumes every gamepad intent without using it as an exit command', () => {
    const intentByType: {
      [Type in InteractionIntent['type']]: Extract<
        InteractionIntent,
        { type: Type }
      >;
    } = {
      navigate: { type: 'navigate', direction: 'up', control: 'dpad' },
      confirm: { type: 'confirm' },
      back: { type: 'back' },
      browserTabPrevious: { type: 'browserTabPrevious' },
      browserTabNext: { type: 'browserTabNext' },
      contextPrevious: { type: 'contextPrevious' },
      contextNext: { type: 'contextNext' },
      scroll: { type: 'scroll', deltaX: 10, deltaY: 20 },
      pagePrevious: { type: 'pagePrevious', strength: 1 },
      pageNext: { type: 'pageNext', strength: 1 },
      cursorReset: { type: 'cursorReset' },
      toggleScreenKeyboard: { type: 'toggleScreenKeyboard' },
      toggleAudio: { type: 'toggleAudio' },
      newTab: { type: 'newTab' },
      reload: { type: 'reload' },
      pushToTalk: { type: 'pushToTalk' },
      toggleSpeechOrDeck: { type: 'toggleSpeechOrDeck' },
      toggleDeck: { type: 'toggleDeck' },
    };

    expect(
      Object.values(intentByType).every((intent) =>
        captureGamepadInspectionInput(gamepadIntent(intent)),
      ),
    ).toBe(true);
  });
});
