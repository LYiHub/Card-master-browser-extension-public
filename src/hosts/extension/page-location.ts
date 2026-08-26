export type PageLocationSource = {
  location: { href: string };
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  navigation?: {
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  };
};

type HistoryMethodName = 'pushState' | 'replaceState';
type HistoryLocationSource = Pick<History, HistoryMethodName>;

function propertyDescriptor(target: object, name: HistoryMethodName) {
  let current: object | null = target;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current) as object | null;
  }
  return undefined;
}

export function ensureHistoryLocationMethodsWritable(
  target: HistoryLocationSource,
) {
  for (const name of ['pushState', 'replaceState'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (!descriptor?.configurable) continue;
    if (!('writable' in descriptor) || descriptor.writable) continue;
    Object.defineProperty(target, name, {
      ...descriptor,
      writable: true,
    });
  }
}

export function installHistoryLocationMonitor(
  target: HistoryLocationSource,
  onChange: () => void,
) {
  const restore: Array<() => void> = [];
  for (const name of ['pushState', 'replaceState'] as const) {
    const ownDescriptor = Object.getOwnPropertyDescriptor(target, name);
    if (ownDescriptor && !ownDescriptor.configurable) continue;
    const inheritedDescriptor = propertyDescriptor(target, name);
    const original = target[name];
    const wrapped = new Proxy(original, {
      apply(method, receiver, args) {
        const result = Reflect.apply(method, receiver, args);
        onChange();
        return result;
      },
    });
    Object.defineProperty(target, name, {
      configurable: true,
      enumerable: inheritedDescriptor?.enumerable ?? true,
      writable: true,
      value: wrapped,
    });
    restore.push(() => {
      if (target[name] !== wrapped) return;
      if (ownDescriptor) {
        Object.defineProperty(target, name, ownDescriptor);
      } else {
        delete (target as Partial<HistoryLocationSource>)[name];
      }
    });
  }
  return () => {
    for (const release of restore.reverse()) release();
  };
}

export function observePageLocation(
  source: PageLocationSource,
  onChange: (url: string) => void,
) {
  let currentUrl = source.location.href;
  let queued = false;
  const check = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const nextUrl = source.location.href;
      if (nextUrl === currentUrl) return;
      currentUrl = nextUrl;
      onChange(nextUrl);
    });
  };

  source.addEventListener('popstate', check);
  source.addEventListener('hashchange', check);
  source.navigation?.addEventListener('currententrychange', check);
  source.navigation?.addEventListener('navigatesuccess', check);

  return () => {
    source.removeEventListener('popstate', check);
    source.removeEventListener('hashchange', check);
    source.navigation?.removeEventListener('currententrychange', check);
    source.navigation?.removeEventListener('navigatesuccess', check);
  };
}
