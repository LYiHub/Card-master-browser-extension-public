import { expect, it, vi } from 'vitest';
import { listenForBilibiliPopupParent } from './bilibili-popup-messages';

it('delivers the player handshake across language startup and preserves subsequent messages', () => {
  const parent = {};
  const frame = Object.assign(new EventTarget(), { parent });
  const subscribe = listenForBilibiliPopupParent(frame as unknown as Window);
  const listener = vi.fn();
  function send(source: object, origin: string, data: unknown) {
    const event = Object.assign(new Event('message'), { source, origin, data });
    frame.dispatchEvent(event);
    return event;
  }
  const bilibili = 'https://www.bilibili.com';
  send(parent, bilibili, '');
  const styled = send(parent, bilibili, { type: 'style', css: 'test' });
  send(parent, bilibili, '');
  send(parent, 'https://bilibili.com.example.org', { type: 'style' });
  send({}, bilibili, { type: 'style' });
  subscribe(listener);
  const afterStartup = send(parent, bilibili, '');
  expect(listener.mock.calls).toEqual([[styled], [afterStartup]]);
});

it('accepts a lone early ping but never substitutes an unrelated frame for the parent', () => {
  for (const validParent of [false, true]) {
    const parent = {};
    const frame = Object.assign(new EventTarget(), { parent });
    const subscribe = listenForBilibiliPopupParent(frame as unknown as Window);
    const listener = vi.fn();
    const ping = Object.assign(new Event('message'), {
      source: validParent ? parent : {},
      origin: 'https://www.bilibili.com',
      data: '',
    });
    frame.dispatchEvent(ping);
    subscribe(listener);
    expect(listener.mock.calls).toEqual(validParent ? [[ping]] : []);
  }
});
