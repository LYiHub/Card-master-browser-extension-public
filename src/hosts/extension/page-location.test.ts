import { describe, expect, it, vi } from 'vitest';

import {
  ensureHistoryLocationMethodsWritable,
  installHistoryLocationMonitor,
  observePageLocation,
  type PageLocationSource,
} from './page-location';

function pageLocationSource() {
  const windowEvents = new EventTarget();
  const navigation = new EventTarget();
  const source: PageLocationSource = {
    location: { href: 'https://example.com/first' },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    navigation,
  };
  return { navigation, source, windowEvents };
}

describe('observePageLocation', () => {
  it('deduplicates Navigation API events for a soft URL change', async () => {
    const { navigation, source } = pageLocationSource();
    const onChange = vi.fn();
    const dispose = observePageLocation(source, onChange);

    source.location.href = 'https://example.com/second';
    navigation.dispatchEvent(new Event('currententrychange'));
    navigation.dispatchEvent(new Event('navigatesuccess'));
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('https://example.com/second');
    dispose();
  });

  it('falls back to popstate and stops after disposal', async () => {
    const { source, windowEvents } = pageLocationSource();
    const onChange = vi.fn();
    const dispose = observePageLocation(source, onChange);

    source.location.href = 'https://example.com/back';
    windowEvents.dispatchEvent(new Event('popstate'));
    await Promise.resolve();
    dispose();
    source.location.href = 'https://example.com/ignored';
    windowEvents.dispatchEvent(new Event('hashchange'));
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledOnce();
  });
});

describe('installHistoryLocationMonitor', () => {
  it('保持 History 方法可写，并允许页面安装自己的导航代理', () => {
    const nativePushState = vi.fn();
    const nativeReplaceState = vi.fn();
    const prototype = {
      pushState: nativePushState,
      replaceState: nativeReplaceState,
    };
    const history = Object.create(prototype) as History;
    const onChange = vi.fn();
    const dispose = installHistoryLocationMonitor(history, onChange);

    history.pushState({}, '', '/next');
    expect(nativePushState).toHaveBeenCalledWith({}, '', '/next');
    expect(onChange).toHaveBeenCalledOnce();
    expect(Object.getOwnPropertyDescriptor(history, 'pushState')).toMatchObject(
      {
        configurable: true,
        writable: true,
      },
    );

    const pagePushState = vi.fn();
    expect(() => {
      history.pushState = pagePushState;
    }).not.toThrow();
    history.pushState({}, '', '/page-owned');
    expect(pagePushState).toHaveBeenCalledOnce();

    dispose();
    expect(history.pushState).toBe(pagePushState);
  });

  it('清理时恢复原有的继承方法', () => {
    const nativePushState = vi.fn();
    const nativeReplaceState = vi.fn();
    const history = Object.create({
      pushState: nativePushState,
      replaceState: nativeReplaceState,
    }) as History;
    const dispose = installHistoryLocationMonitor(history, vi.fn());

    expect(Object.hasOwn(history, 'pushState')).toBe(true);
    dispose();

    expect(Object.hasOwn(history, 'pushState')).toBe(false);
    expect(history.pushState).toBe(nativePushState);
  });

  it('重复注入时修复旧代理留下的只读描述符', () => {
    const history = {
      pushState: vi.fn(),
      replaceState: vi.fn(),
    } as unknown as History;
    Object.defineProperty(history, 'pushState', {
      configurable: true,
      writable: false,
      value: history.pushState,
    });

    ensureHistoryLocationMethodsWritable(history);

    const pagePushState = vi.fn();
    expect(() => {
      history.pushState = pagePushState;
    }).not.toThrow();
    expect(history.pushState).toBe(pagePushState);
  });
});
