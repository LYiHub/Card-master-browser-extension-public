import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

type MotionPhase = 'closed' | 'entering' | 'open' | 'closing';

function cssTimeMs(value: string) {
  const normalized = value.trim();
  if (normalized.endsWith('ms')) return Number.parseFloat(normalized) || 0;
  if (normalized.endsWith('s')) {
    return (Number.parseFloat(normalized) || 0) * 1_000;
  }
  return 0;
}

export function transitionDurationMs(durations: string, delays: string) {
  const durationValues = durations.split(',').map(cssTimeMs);
  const delayValues = delays.split(',').map(cssTimeMs);
  const count = Math.max(durationValues.length, delayValues.length);
  let longest = 0;
  for (let index = 0; index < count; index += 1) {
    const duration = durationValues[index % durationValues.length] ?? 0;
    const delay = delayValues[index % delayValues.length] ?? 0;
    longest = Math.max(longest, duration + delay);
  }
  return longest;
}

function elementTransitionDurationMs(element: HTMLElement | null) {
  if (!element) return 0;
  const view = element.ownerDocument.defaultView;
  if (!view) return 0;
  const style = view.getComputedStyle(element);
  return transitionDurationMs(style.transitionDuration, style.transitionDelay);
}

export function useTransitionPresence(
  open: boolean,
  elementRef: RefObject<HTMLElement>,
  onExitComplete?: () => void,
) {
  const [present, setPresent] = useState(open);
  const [phase, setPhase] = useState<MotionPhase>(open ? 'entering' : 'closed');
  const presentRef = useRef(open);
  const onExitCompleteRef = useRef(onExitComplete);
  onExitCompleteRef.current = onExitComplete;

  useLayoutEffect(() => {
    let frame: number | null = null;
    let timer: number | null = null;
    if (open) {
      if (!presentRef.current) {
        presentRef.current = true;
        setPresent(true);
      }
      setPhase('entering');
      frame = window.requestAnimationFrame(() => setPhase('open'));
    } else if (presentRef.current) {
      setPhase('closing');
      frame = window.requestAnimationFrame(() => {
        const duration = elementTransitionDurationMs(elementRef.current);
        timer = window.setTimeout(() => {
          presentRef.current = false;
          setPresent(false);
          setPhase('closed');
          onExitCompleteRef.current?.();
        }, duration);
      });
    }
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [elementRef, open]);

  return { present, phase };
}
