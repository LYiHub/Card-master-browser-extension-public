import type { AudioDirector } from './AudioDirector';

const PAGE_AUDIO_DIRECTOR_KEY = '__cardMasterAudioDirector__';

type AudioDirectorScope = typeof globalThis & {
  [PAGE_AUDIO_DIRECTOR_KEY]?: AudioDirector;
};

function scope() {
  return globalThis as AudioDirectorScope;
}

export function pageAudioDirector() {
  return scope()[PAGE_AUDIO_DIRECTOR_KEY] ?? null;
}

export function registerPageAudioDirector(director: AudioDirector) {
  scope()[PAGE_AUDIO_DIRECTOR_KEY] = director;
  return () => {
    if (scope()[PAGE_AUDIO_DIRECTOR_KEY] === director) {
      delete scope()[PAGE_AUDIO_DIRECTOR_KEY];
    }
  };
}
