import { describe, expect, it } from 'vitest';

import {
  AudioDirector,
  type AudioPlaybackTransport,
  type AudioSettingsRepository,
  oldestVoice,
  passesCooldown,
  resolveAudioSourceIndex,
} from './AudioDirector';

describe('audio playback policy', () => {
  it('reports a locked cue before browser user activation', () => {
    const director = new AudioDirector();

    expect(director.play('deckHover')).toBe('locked');
    expect(director.runtimeState()).toMatchObject({
      unlocked: false,
      contextState: 'none',
    });
    director.destroy();
  });

  it('admits the first cue and enforces its cooldown thereafter', () => {
    expect(passesCooldown(100, undefined, 80)).toBe(true);
    expect(passesCooldown(179, 100, 80)).toBe(false);
    expect(passesCooldown(180, 100, 80)).toBe(true);
  });

  it('selects the oldest active voice for deterministic replacement', () => {
    const newest = { id: 'newest', startedAt: 30 };
    const oldest = { id: 'oldest', startedAt: 10 };
    const middle = { id: 'middle', startedAt: 20 };

    expect(oldestVoice(new Set([newest, oldest, middle]))).toBe(oldest);
    expect(oldestVoice(new Set<{ startedAt: number }>())).toBeUndefined();
  });

  it('uses a requested source without advancing the rolling variant', () => {
    expect(resolveAudioSourceIndex(10, 4)).toBe(4);
    expect(resolveAudioSourceIndex(10, 4, 2)).toBe(2);
    expect(resolveAudioSourceIndex(10, 4, 99)).toBe(9);
  });

  it('delegates playback without page user activation when a transport exists', async () => {
    const calls: string[] = [];
    const transport: AudioPlaybackTransport = {
      prepare: async (cues) => {
        calls.push(`prepare:${cues.join(',')}`);
      },
      play: (cue) => {
        calls.push(`play:${cue}`);
      },
      synchronize: (settings) => {
        calls.push(`settings:${settings.muted}`);
      },
      destroy: () => {
        calls.push('destroy');
      },
    };
    const repository: AudioSettingsRepository = {
      read: async () => null,
      write: async () => undefined,
    };
    const director = new AudioDirector(repository, transport);

    expect(director.play('deckHover')).toBe('scheduled');
    await director.prepare(['deckHover']);
    director.setMuted(true);
    director.destroy();

    expect(calls).toEqual([
      'play:deckHover',
      'prepare:deckHover',
      'settings:true',
      'destroy',
    ]);
  });
});

describe('audio settings', () => {
  it('publishes mute changes and stops after unsubscribe', () => {
    const director = new AudioDirector();
    const states: boolean[] = [];
    const unsubscribe = director.subscribeSettings((settings) =>
      states.push(settings.muted),
    );

    director.setMuted(true);
    unsubscribe();
    director.setMuted(false);

    expect(states).toEqual([true]);
    expect(director.getSettings().muted).toBe(false);
    director.destroy();
  });

  it('hydrates and persists through an injected settings repository', async () => {
    const writes: unknown[] = [];
    const repository: AudioSettingsRepository = {
      read: async () => ({ muted: true, volume: 0.4 }),
      write: async (settings) => {
        writes.push(settings);
      },
    };
    const director = new AudioDirector(repository);
    await Promise.resolve();

    expect(director.getSettings()).toEqual({ muted: true, volume: 0.4 });
    director.setMuted(false);
    await Promise.resolve();
    expect(writes).toEqual([{ muted: false, volume: 0.4 }]);
    director.destroy();
  });

  it('applies external settings without writing them back', async () => {
    const writes: unknown[] = [];
    const externalListeners = new Set<
      (settings: { muted: boolean; volume: number }) => void
    >();
    let unsubscribed = false;
    const repository: AudioSettingsRepository = {
      read: async () => ({ muted: false, volume: 0.78 }),
      write: async (settings) => {
        writes.push(settings);
      },
      subscribe: (listener) => {
        externalListeners.add(listener);
        return () => {
          externalListeners.delete(listener);
          unsubscribed = true;
        };
      },
    };
    const director = new AudioDirector(repository);
    const states: Array<{ muted: boolean; volume: number }> = [];
    director.subscribeSettings((settings) => states.push(settings));

    for (const listener of externalListeners) {
      listener({ muted: true, volume: 0.25 });
    }

    expect(director.getSettings()).toEqual({ muted: true, volume: 0.25 });
    expect(states).toEqual([{ muted: true, volume: 0.25 }]);
    expect(writes).toEqual([]);
    director.destroy();
    expect(unsubscribed).toBe(true);
  });
});
