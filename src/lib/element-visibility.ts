import { type RefCallback, useCallback, useEffect, useState } from 'react';

type VisibilityListener = (visible: boolean) => void;

const listeners = new Map<Element, Set<VisibilityListener>>();
let observer: IntersectionObserver | null = null;

function sharedObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        for (const listener of listeners.get(entry.target) ?? []) {
          listener(entry.isIntersecting);
        }
      }
    },
    {
      rootMargin: '280px',
      threshold: 0.01,
    },
  );
  return observer;
}

function subscribe(element: Element, listener: VisibilityListener) {
  const current = listeners.get(element);
  if (current) current.add(listener);
  else {
    listeners.set(element, new Set([listener]));
    sharedObserver()?.observe(element);
  }
  if (!observer) listener(true);
  return () => {
    const registered = listeners.get(element);
    registered?.delete(listener);
    if (registered && registered.size === 0) {
      listeners.delete(element);
      observer?.unobserve(element);
    }
  };
}

export function useElementVisibility<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useCallback<RefCallback<T>>((node) => setElement(node), []);

  useEffect(() => {
    if (!element) return;
    return subscribe(element, setVisible);
  }, [element]);

  return { ref, visible };
}
