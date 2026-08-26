import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let installed = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!installed && typeof document !== 'undefined') {
    installed = true;
    document.addEventListener('visibilitychange', publish);
  }
  return () => {
    listeners.delete(listener);
    if (installed && listeners.size === 0) {
      document.removeEventListener('visibilitychange', publish);
      installed = false;
    }
  };
}

function publish() {
  for (const listener of listeners) listener();
}

function snapshot() {
  return (
    typeof document === 'undefined' || document.visibilityState === 'visible'
  );
}

export function usePageVisible() {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
