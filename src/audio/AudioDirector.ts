import {
  AUDIO_CUES,
  type AudioChannel,
  type AudioCue,
  type AudioCueDefinition,
  PRELOAD_CUES,
} from './cues';

export type AudioPlayOptions = {
  gain?: number;
  playbackRate?: number;
  positionX?: number;
  pan?: number;
  sourceIndex?: number;
};

export type AudioPlayResult =
  | 'scheduled'
  | 'scheduled-suspended'
  | 'locked'
  | 'muted'
  | 'destroyed'
  | 'cooldown';

export type AudioPlaybackOutcome =
  | {
      result: 'playing' | 'muted' | 'cooldown' | 'destroyed';
    }
  | {
      result: 'rejected';
      error: string;
    };

export type AudioRuntimeState = {
  unlocked: boolean;
  destroyed: boolean;
  muted: boolean;
  contextState: AudioContextState | 'none';
};

type Voice = {
  source: AudioBufferSourceNode;
  startedAt: number;
};

export type AudioSettings = {
  muted: boolean;
  volume: number;
};

export interface AudioPlaybackTransport {
  prepare(cues: readonly AudioCue[], settings: AudioSettings): Promise<void>;
  play(cue: AudioCue, options: AudioPlayOptions, settings: AudioSettings): void;
  synchronize(settings: AudioSettings): void;
  destroy(): void;
}

export interface AudioSettingsRepository {
  read(): Promise<AudioSettings | null>;
  write(settings: AudioSettings): Promise<void>;
  subscribe?(listener: (settings: AudioSettings) => void): () => void;
}

const SETTINGS_KEY = 'card-master.audio.v1';
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  volume: 0.78,
};
const MAX_DECODED_AUDIO_BYTES = 24 * 1024 * 1024;
export const AUDIO_CHANNEL_LEVELS: Readonly<Record<AudioChannel, number>> = {
  interface: 0.58,
  card: 0.76,
  magic: 0.7,
  destructive: 0.76,
};

export function passesCooldown(
  requestedAt: number,
  lastPlayedAt: number | undefined,
  cooldownMs: number,
) {
  return requestedAt - (lastPlayedAt ?? -Infinity) >= cooldownMs;
}

export function oldestVoice<T extends { startedAt: number }>(
  voices: ReadonlySet<T>,
) {
  let oldest: T | undefined;
  for (const voice of voices) {
    if (!oldest || voice.startedAt < oldest.startedAt) oldest = voice;
  }
  return oldest;
}

export function resolveAudioSourceIndex(
  sourceCount: number,
  rollingIndex: number,
  requestedIndex?: number,
) {
  if (requestedIndex === undefined) return rollingIndex % sourceCount;
  return Math.min(sourceCount - 1, Math.max(0, Math.trunc(requestedIndex)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAudioSettings(value: unknown): AudioSettings | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.muted !== 'boolean' ||
    typeof record.volume !== 'number' ||
    !Number.isFinite(record.volume)
  ) {
    return null;
  }
  return {
    muted: record.muted,
    volume: clamp(record.volume, 0, 1),
  };
}

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

class BrowserAudioSettingsRepository implements AudioSettingsRepository {
  async read() {
    const storage = browserStorage();
    if (!storage) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '');
    } catch {
      return null;
    }
    return normalizeAudioSettings(parsed);
  }
  async write(settings: AudioSettings) {
    browserStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

function readInitialSettings(): AudioSettings {
  const storage = browserStorage();
  if (!storage) return DEFAULT_AUDIO_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '');
    return normalizeAudioSettings(parsed) ?? DEFAULT_AUDIO_SETTINGS;
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<AudioChannel, GainNode>();
  private buffers = new Map<string, AudioBuffer>();
  private loads = new Map<string, Promise<AudioBuffer>>();
  private voices = new Map<AudioCue, Set<Voice>>();
  private lastPlayed = new Map<AudioCue, number>();
  private variantIndices = new Map<AudioCue, number>();
  private settings: AudioSettings;
  private unlocked = false;
  private destroyed = false;
  private duckers = 0;
  private settingsListeners = new Set<(settings: AudioSettings) => void>();
  private settingsRevision = 0;
  private releaseSettingsRepository: (() => void) | null = null;

  constructor(
    private readonly settingsRepository: AudioSettingsRepository = new BrowserAudioSettingsRepository(),
    private readonly playbackTransport?: AudioPlaybackTransport,
  ) {
    this.settings =
      settingsRepository instanceof BrowserAudioSettingsRepository
        ? readInitialSettings()
        : { ...DEFAULT_AUDIO_SETTINGS };
    this.unlocked = playbackTransport !== undefined;
    this.releaseSettingsRepository =
      settingsRepository.subscribe?.((settings) => {
        this.settingsRevision += 1;
        this.applyExternalSettings(settings);
      }) ?? null;
    const readRevision = this.settingsRevision;
    void settingsRepository
      .read()
      .then((settings) => {
        if (
          !settings ||
          this.destroyed ||
          readRevision !== this.settingsRevision
        ) {
          return;
        }
        this.applyExternalSettings(settings);
      })
      .catch(() => undefined);
  }

  async unlock() {
    if (this.destroyed) return false;
    if (this.playbackTransport) {
      this.unlocked = true;
      try {
        await this.playbackTransport.prepare(PRELOAD_CUES, this.getSettings());
        return true;
      } catch {
        return false;
      }
    }
    if (this.unlocked && this.context?.state === 'running') return true;
    this.unlocked = true;
    try {
      const context = this.ensureContext();
      if (context.state === 'suspended') await context.resume();
      void this.prepare(PRELOAD_CUES);
      return true;
    } catch {
      this.unlocked = false;
      return false;
    }
  }

  async prepare(cues: readonly AudioCue[]) {
    if (this.destroyed) return;
    try {
      if (this.playbackTransport) {
        await this.playbackTransport.prepare(cues, this.getSettings());
        return;
      }
      this.ensureContext();
      const sources = new Set(
        cues.flatMap((cue) => [...AUDIO_CUES[cue].sources]),
      );
      await Promise.allSettled([...sources].map((source) => this.load(source)));
    } catch {
      // The visual interaction remains available when Web Audio is unavailable.
    }
  }

  play(cue: AudioCue, options: AudioPlayOptions = {}) {
    if (this.destroyed) return 'destroyed' as const;
    if (!this.playbackTransport && !this.unlocked) return 'locked' as const;
    if (this.settings.muted) return 'muted' as const;
    const definition: AudioCueDefinition = AUDIO_CUES[cue];
    const requestedAt = performance.now();
    const lastPlayed = this.lastPlayed.get(cue) ?? -Infinity;
    if (!passesCooldown(requestedAt, lastPlayed, definition.cooldownMs)) {
      return 'cooldown' as const;
    }
    this.lastPlayed.set(cue, requestedAt);

    if (this.playbackTransport) {
      this.playbackTransport.play(cue, options, this.getSettings());
      return 'scheduled' as const;
    }

    const rollingIndex = this.variantIndices.get(cue) ?? 0;
    if (options.sourceIndex === undefined) {
      this.variantIndices.set(cue, rollingIndex + 1);
    }
    const sourceUrl =
      definition.sources[
        resolveAudioSourceIndex(
          definition.sources.length,
          rollingIndex,
          options.sourceIndex,
        )
      ];

    void this.load(sourceUrl)
      .then((buffer) => {
        if (
          this.destroyed ||
          performance.now() - requestedAt > definition.latencyBudgetMs
        ) {
          return;
        }
        this.startVoice(cue, buffer, options);
      })
      .catch(() => undefined);
    return this.context?.state === 'running'
      ? ('scheduled' as const)
      : ('scheduled-suspended' as const);
  }

  setMuted(muted: boolean) {
    if (this.settings.muted === muted) return;
    this.settings.muted = muted;
    this.applyMasterLevel();
    this.synchronizePlaybackSettings();
    this.persistSettings();
    this.publishSettings();
  }

  setVolume(volume: number) {
    const nextVolume = clamp(volume, 0, 1);
    if (this.settings.volume === nextVolume) return;
    this.settings.volume = nextVolume;
    this.applyMasterLevel();
    this.synchronizePlaybackSettings();
    this.persistSettings();
    this.publishSettings();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  runtimeState(): AudioRuntimeState {
    return {
      unlocked: this.unlocked,
      destroyed: this.destroyed,
      muted: this.settings.muted,
      contextState: this.context?.state ?? 'none',
    };
  }

  subscribeSettings(listener: (settings: AudioSettings) => void) {
    this.settingsListeners.add(listener);
    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  async suspend() {
    if (this.playbackTransport) return;
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume() {
    if (this.playbackTransport) return;
    if (this.unlocked && this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  destroy() {
    this.destroyed = true;
    this.releaseSettingsRepository?.();
    this.releaseSettingsRepository = null;
    this.playbackTransport?.destroy();
    for (const voices of this.voices.values()) {
      for (const voice of voices) voice.source.stop();
    }
    this.voices.clear();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.buses.clear();
    this.buffers.clear();
    this.loads.clear();
    this.settingsListeners.clear();
  }

  applySettings(settings: AudioSettings) {
    this.settingsRevision += 1;
    this.applyExternalSettings(settings);
  }

  private applyExternalSettings(value: AudioSettings) {
    const settings = normalizeAudioSettings(value);
    if (
      !settings ||
      (settings.muted === this.settings.muted &&
        settings.volume === this.settings.volume)
    ) {
      return;
    }
    this.settings = settings;
    this.applyMasterLevel();
    this.synchronizePlaybackSettings();
    this.publishSettings();
  }

  private ensureContext() {
    if (this.context) return this.context;
    const AudioContextConstructor =
      window.AudioContext ??
      (
        window as Window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error('Web Audio is unavailable');

    const context = new AudioContextConstructor({ latencyHint: 'interactive' });
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    master.connect(compressor).connect(context.destination);

    for (const channel of Object.keys(AUDIO_CHANNEL_LEVELS) as AudioChannel[]) {
      const bus = context.createGain();
      bus.gain.value = AUDIO_CHANNEL_LEVELS[channel];
      bus.connect(master);
      this.buses.set(channel, bus);
    }

    this.context = context;
    this.master = master;
    this.applyMasterLevel();
    return context;
  }

  private async load(source: string) {
    const cached = this.buffers.get(source);
    if (cached) {
      this.buffers.delete(source);
      this.buffers.set(source, cached);
      return cached;
    }
    const pending = this.loads.get(source);
    if (pending) return pending;

    const context = this.ensureContext();
    const load = fetch(source)
      .then((response) => {
        if (!response.ok) throw new Error(`Audio request failed: ${source}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        if (!this.destroyed) this.cacheBuffer(source, buffer);
        this.loads.delete(source);
        return buffer;
      })
      .catch((error) => {
        this.loads.delete(source);
        throw error;
      });
    this.loads.set(source, load);
    return load;
  }

  private cacheBuffer(source: string, buffer: AudioBuffer) {
    this.buffers.set(source, buffer);
    const decodedBytes = () =>
      [...this.buffers.values()].reduce(
        (total, candidate) =>
          total + candidate.length * candidate.numberOfChannels * 4,
        0,
      );
    while (this.buffers.size > 1 && decodedBytes() > MAX_DECODED_AUDIO_BYTES) {
      const oldest = this.buffers.keys().next().value as string | undefined;
      if (!oldest || oldest === source) break;
      this.buffers.delete(oldest);
    }
  }

  private startVoice(
    cue: AudioCue,
    buffer: AudioBuffer,
    options: AudioPlayOptions,
  ) {
    const context = this.ensureContext();
    const definition: AudioCueDefinition = AUDIO_CUES[cue];
    const bus = this.buses.get(definition.channel);
    if (!bus) return;
    const voices = this.voices.get(cue) ?? new Set<Voice>();
    while (voices.size >= definition.maxVoices) {
      const oldest = oldestVoice(voices);
      if (!oldest) break;
      oldest.source.stop();
      voices.delete(oldest);
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const randomRate =
      definition.playbackRate[0] +
      Math.random() * (definition.playbackRate[1] - definition.playbackRate[0]);
    const playbackRate = options.playbackRate ?? randomRate;
    const level = definition.gain * (options.gain ?? 1);
    const duration = Math.min(
      definition.maxDuration ?? buffer.duration,
      buffer.duration / playbackRate,
    );
    const now = context.currentTime;

    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    panner.pan.value =
      options.pan !== undefined
        ? clamp(options.pan, -1, 1)
        : options.positionX === undefined
          ? 0
          : clamp((options.positionX / window.innerWidth) * 2 - 1, -1, 1) *
            0.46;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, level),
      now + 0.012,
    );
    if (duration > 0.08) {
      gain.gain.setValueAtTime(level, now + duration - 0.055);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    }

    source.connect(gain).connect(panner).connect(bus);
    const voice = { source, startedAt: performance.now() };
    voices.add(voice);
    this.voices.set(cue, voices);
    if (definition.ducking) this.beginDucking(definition.ducking);

    source.onended = () => {
      voices.delete(voice);
      if (definition.ducking) this.endDucking();
    };
    source.start(now);
    source.stop(now + duration + 0.01);
  }

  private beginDucking(depth: number) {
    const context = this.context;
    if (!context) return;
    this.duckers += 1;
    if (this.duckers > 1) return;
    for (const channel of ['interface', 'card'] as const) {
      this.buses
        .get(channel)
        ?.gain.setTargetAtTime(
          AUDIO_CHANNEL_LEVELS[channel] * depth,
          context.currentTime,
          0.03,
        );
    }
  }

  private endDucking() {
    const context = this.context;
    if (!context) return;
    this.duckers = Math.max(0, this.duckers - 1);
    if (this.duckers > 0) return;
    for (const channel of ['interface', 'card'] as const) {
      this.buses
        .get(channel)
        ?.gain.setTargetAtTime(
          AUDIO_CHANNEL_LEVELS[channel],
          context.currentTime,
          0.08,
        );
    }
  }

  private applyMasterLevel() {
    if (!this.master || !this.context) return;
    const level = this.settings.muted ? 0 : this.settings.volume;
    this.master.gain.setTargetAtTime(level, this.context.currentTime, 0.02);
  }

  private persistSettings() {
    void this.settingsRepository
      .write(this.getSettings())
      .catch(() => undefined);
  }

  private synchronizePlaybackSettings() {
    this.playbackTransport?.synchronize(this.getSettings());
  }

  private publishSettings() {
    const settings = this.getSettings();
    for (const listener of this.settingsListeners) listener(settings);
  }
}
