import { describe, expect, it } from 'vitest';

import {
  GAMEPAD_POINTER_TIMELINE_IDS,
  GAMEPAD_POINTER_TIMELINES,
  gamepadPointerTimelineDurationMs,
  gamepadPointerTimelineTrack,
} from './pointer-timeline';

describe('gamepad pointer timelines', () => {
  it('keeps every editable track ordered from an explicit zero point', () => {
    for (const id of GAMEPAD_POINTER_TIMELINE_IDS) {
      for (const track of GAMEPAD_POINTER_TIMELINES[id].tracks) {
        expect(track.points[0]?.timeMs).toBe(0);
        expect(
          track.points.every(
            (point, index) =>
              index === 0 ||
              point.timeMs > (track.points[index - 1]?.timeMs ?? -1),
          ),
        ).toBe(true);
      }
    }
  });

  it('preserves the production duration of each pointer animation', () => {
    expect(
      Object.fromEntries(
        GAMEPAD_POINTER_TIMELINE_IDS.map((id) => [
          id,
          gamepadPointerTimelineDurationMs(GAMEPAD_POINTER_TIMELINES[id]),
        ]),
      ),
    ).toEqual({
      cursorEntrance: 510,
      cursorLocator: 740,
      cursorPress: 320,
      cursorExit: 160,
      targetEntrance: 470,
      targetChange: 360,
      targetTrack: 120,
      targetExit: 140,
    });
  });

  it('keeps geometry progress separate from visual properties', () => {
    const change = GAMEPAD_POINTER_TIMELINES.targetChange;
    const progress = gamepadPointerTimelineTrack(change, 'progress');

    expect(progress?.chartOnly).toBe(true);
    expect(progress?.points.at(-1)).toMatchObject({
      timeMs: 200,
      value: 1,
      ease: 'power3.out',
    });
  });

  it('starts cursor discovery within the requested three-to-eight-times range', () => {
    expect(
      gamepadPointerTimelineTrack(
        GAMEPAD_POINTER_TIMELINES.cursorEntrance,
        'scale',
      )?.points[0]?.value,
    ).toBe(5.2);
    expect(
      gamepadPointerTimelineTrack(
        GAMEPAD_POINTER_TIMELINES.cursorLocator,
        'scale',
      )?.points[0]?.value,
    ).toBe(5.6);
  });
});
