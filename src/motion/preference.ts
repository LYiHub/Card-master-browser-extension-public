export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function reducedMotionMediaQuery() {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return null;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

export function prefersReducedMotion() {
  return reducedMotionMediaQuery()?.matches ?? false;
}

export function observeReducedMotion(listener: (reduced: boolean) => void) {
  const media = reducedMotionMediaQuery();
  if (!media) {
    listener(false);
    return () => undefined;
  }

  const update = () => listener(media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
