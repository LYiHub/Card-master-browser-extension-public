import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AudioDirector,
  type AudioSettings,
  type AudioSettingsRepository,
} from './AudioDirector';

const AudioDirectorContext = createContext<AudioDirector | null>(null);
const AudioSettingsContext = createContext<AudioSettings | null>(null);
const interactiveSelector =
  'button, a[href], input, select, textarea, [role="button"], [tabindex="0"]';

function interactiveTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>(interactiveSelector)
    : null;
}

function isManaged(target: HTMLElement) {
  return Boolean(target.closest('[data-audio-managed="true"]'));
}

export function AudioDirectorProvider({
  children,
  interactionRoot = document,
  settingsRepository,
  director: providedDirector,
}: {
  children: ReactNode;
  interactionRoot?: Document | ShadowRoot;
  settingsRepository?: AudioSettingsRepository;
  director?: AudioDirector;
}) {
  const [director] = useState(
    () => providedDirector ?? new AudioDirector(settingsRepository),
  );
  const [settings, setSettings] = useState(() => director.getSettings());
  const [ownsDirector] = useState(() => providedDirector === undefined);
  const destroyTimerRef = useRef(0);

  useEffect(() => {
    setSettings(director.getSettings());
    return director.subscribeSettings(setSettings);
  }, [director]);

  useEffect(() => {
    window.clearTimeout(destroyTimerRef.current);
    const unlock = () => void director.unlock();
    const prepare = () =>
      void director.prepare(['uiHover', 'uiPress', 'uiConfirm']);

    const handlePointerOver = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      const target = interactiveTarget(event.target);
      if (!target || isManaged(target)) return;
      if (
        pointerEvent.relatedTarget instanceof Node &&
        target.contains(pointerEvent.relatedTarget)
      ) {
        return;
      }
      prepare();
      director.play('uiHover', {
        positionX: pointerEvent.clientX,
      });
    };
    const handlePointerDown = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      unlock();
      const target = interactiveTarget(event.target);
      if (!target || isManaged(target)) return;
      director.play('uiPress', { positionX: pointerEvent.clientX });
    };
    const handleFocus = (event: Event) => {
      const target = interactiveTarget(event.target);
      if (!target || isManaged(target)) return;
      const focusEvent = event as FocusEvent;
      if (
        focusEvent.relatedTarget === null ||
        !target.matches(':focus-visible')
      ) {
        return;
      }
      director.play('uiHover', {
        positionX: target.getBoundingClientRect().left,
      });
    };
    const handleChange = (event: Event) => {
      const target = interactiveTarget(event.target);
      if (!target || isManaged(target)) return;
      director.play('uiConfirm', {
        positionX: target.getBoundingClientRect().left,
      });
    };
    const handleKeyDown = () => unlock();
    const handleVisibility = () => {
      if (document.hidden) void director.suspend();
      else void director.resume();
    };

    interactionRoot.addEventListener('pointerover', handlePointerOver, true);
    interactionRoot.addEventListener('pointerdown', handlePointerDown, true);
    interactionRoot.addEventListener('focusin', handleFocus, true);
    interactionRoot.addEventListener('change', handleChange, true);
    interactionRoot.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      interactionRoot.removeEventListener(
        'pointerover',
        handlePointerOver,
        true,
      );
      interactionRoot.removeEventListener(
        'pointerdown',
        handlePointerDown,
        true,
      );
      interactionRoot.removeEventListener('focusin', handleFocus, true);
      interactionRoot.removeEventListener('change', handleChange, true);
      interactionRoot.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (ownsDirector) {
        destroyTimerRef.current = window.setTimeout(() => director.destroy());
      }
    };
  }, [director, interactionRoot, ownsDirector]);

  return (
    <AudioDirectorContext.Provider value={director}>
      <AudioSettingsContext.Provider value={settings}>
        {children}
      </AudioSettingsContext.Provider>
    </AudioDirectorContext.Provider>
  );
}

export function useAudioDirector() {
  const director = useContext(AudioDirectorContext);
  if (!director) {
    throw new Error(
      'useAudioDirector must be used inside AudioDirectorProvider',
    );
  }
  return director;
}

export function useAudioSettings() {
  const settings = useContext(AudioSettingsContext);
  if (!settings) {
    throw new Error(
      'useAudioSettings must be used inside AudioDirectorProvider',
    );
  }
  return settings;
}
