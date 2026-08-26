import {
  AUDIO_CHANNEL_LEVELS,
  type AudioPlaybackOutcome,
  type AudioPlayOptions,
  type AudioSettings,
  DEFAULT_AUDIO_SETTINGS,
  normalizeAudioSettings,
  oldestVoice,
  passesCooldown,
  resolveAudioSourceIndex,
} from './AudioDirector';
import { AUDIO_CUES, type AudioCue, type AudioCueDefinition } from './cues';

type Voice = {
  cue: AudioCue;
  element: HTMLAudioElement;
  startedAt: number;
  baseGain: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
};

type MediaElementFactory = (source: string) => HTMLAudioElement;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function defaultMediaElement(source: string) {
  const element = document.createElement('audio');
  element.src = source;
  return element;
}

function playbackError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function mediaElementVoiceVolume(
  definition: AudioCueDefinition,
  settings: AudioSettings,
  baseGain: number,
  duckingDepth: number,
) {
  const ducking =
    definition.channel === 'interface' || definition.channel === 'card'
      ? duckingDepth
      : 1;
  return clamp(
    (settings.muted ? 0 : settings.volume) *
      AUDIO_CHANNEL_LEVELS[definition.channel] *
      baseGain *
      ducking,
    0,
    1,
  );
}

export class MediaElementAudioPlayer {
  private settings = { ...DEFAULT_AUDIO_SETTINGS };
  private preloads = new Map<string, HTMLAudioElement>();
  private voices = new Map<AudioCue, Set<Voice>>();
  private lastPlayed = new Map<AudioCue, number>();
  private variantIndices = new Map<AudioCue, number>();
  private destroyed = false;

  constructor(
    private readonly createElement: MediaElementFactory = defaultMediaElement,
  ) {}

  prepare(cues: readonly AudioCue[]) {
    if (this.destroyed) return;
    const sources = new Set(
      cues.flatMap((cue) => [...AUDIO_CUES[cue].sources]),
    );
    for (const source of sources) {
      if (this.preloads.has(source)) continue;
      const element = this.createElement(source);
      element.preload = 'auto';
      element.load();
      this.preloads.set(source, element);
    }
  }

  applySettings(input: AudioSettings) {
    const settings = normalizeAudioSettings(input);
    if (!settings) return;
    this.settings = settings;
    this.updateVoiceVolumes();
  }

  async play(
    cue: AudioCue,
    options: AudioPlayOptions = {},
  ): Promise<AudioPlaybackOutcome> {
    if (this.destroyed) return { result: 'destroyed' };
    if (this.settings.muted) return { result: 'muted' };
    const definition: AudioCueDefinition = AUDIO_CUES[cue];
    const requestedAt = performance.now();
    if (
      !passesCooldown(
        requestedAt,
        this.lastPlayed.get(cue),
        definition.cooldownMs,
      )
    ) {
      return { result: 'cooldown' };
    }
    this.lastPlayed.set(cue, requestedAt);

    const rollingIndex = this.variantIndices.get(cue) ?? 0;
    if (options.sourceIndex === undefined) {
      this.variantIndices.set(cue, rollingIndex + 1);
    }
    const source =
      definition.sources[
        resolveAudioSourceIndex(
          definition.sources.length,
          rollingIndex,
          options.sourceIndex,
        )
      ];
    const element = this.createElement(source);
    element.preload = 'auto';
    element.hidden = true;
    element.muted = false;
    element.playbackRate =
      options.playbackRate ??
      definition.playbackRate[0] +
        Math.random() *
          (definition.playbackRate[1] - definition.playbackRate[0]);
    element.preservesPitch = false;
    document.body.append(element);

    const voices = this.voices.get(cue) ?? new Set<Voice>();
    while (voices.size >= definition.maxVoices) {
      const oldest = oldestVoice(voices);
      if (!oldest) break;
      this.stopVoice(oldest);
    }
    const voice: Voice = {
      cue,
      element,
      startedAt: requestedAt,
      baseGain: definition.gain * (options.gain ?? 1),
      stopTimer: null,
      stopped: false,
    };
    voices.add(voice);
    this.voices.set(cue, voices);
    this.updateVoiceVolumes();

    element.addEventListener('ended', () => this.stopVoice(voice), {
      once: true,
    });
    element.addEventListener('error', () => this.stopVoice(voice), {
      once: true,
    });
    try {
      await element.play();
      if (voice.stopped) {
        return { result: 'rejected', error: '音效资源无法播放。' };
      }
      voice.stopTimer = setTimeout(
        () => this.stopVoice(voice),
        (definition.maxDuration ?? 1) * 1_000,
      );
      return { result: 'playing' };
    } catch (error) {
      this.stopVoice(voice);
      return { result: 'rejected', error: playbackError(error) };
    }
  }

  destroy() {
    this.destroyed = true;
    for (const voices of this.voices.values()) {
      for (const voice of [...voices]) this.stopVoice(voice);
    }
    this.voices.clear();
    for (const element of this.preloads.values()) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    this.preloads.clear();
  }

  private stopVoice(voice: Voice) {
    if (voice.stopped) return;
    voice.stopped = true;
    if (voice.stopTimer !== null) clearTimeout(voice.stopTimer);
    voice.element.pause();
    voice.element.removeAttribute('src');
    voice.element.load();
    voice.element.remove();
    this.voices.get(voice.cue)?.delete(voice);
    this.updateVoiceVolumes();
  }

  private duckingDepth() {
    let depth = 1;
    for (const [cue, voices] of this.voices) {
      if (voices.size === 0) continue;
      const definition: AudioCueDefinition = AUDIO_CUES[cue];
      depth = Math.min(depth, definition.ducking ?? 1);
    }
    return depth;
  }

  private updateVoiceVolumes() {
    const duckingDepth = this.duckingDepth();
    for (const voices of this.voices.values()) {
      for (const voice of voices) {
        voice.element.volume = mediaElementVoiceVolume(
          AUDIO_CUES[voice.cue],
          this.settings,
          voice.baseGain,
          duckingDepth,
        );
      }
    }
  }
}
