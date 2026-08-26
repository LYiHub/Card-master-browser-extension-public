import { describe, expect, it } from 'vitest';

import { resolveNewTabNavigationTarget } from './navigation';

describe('new-tab navigation target', () => {
  it('keeps explicit HTTP(S) URLs as navigation targets', () => {
    expect(
      resolveNewTabNavigationTarget('https://example.com/path?q=1'),
    ).toEqual({
      kind: 'url',
      value: 'https://example.com/path?q=1',
    });
  });

  it('recognizes hosts, local development names, and numeric addresses', () => {
    expect(resolveNewTabNavigationTarget('example.com/docs')).toEqual({
      kind: 'url',
      value: 'https://example.com/docs',
    });
    expect(resolveNewTabNavigationTarget('localhost:5173')).toEqual({
      kind: 'url',
      value: 'https://localhost:5173/',
    });
    expect(resolveNewTabNavigationTarget('127 0 0 1:8080')).toEqual({
      kind: 'url',
      value: 'https://127.0.0.1:8080/',
    });
  });

  it('keeps ordinary text in the browser search path', () => {
    expect(
      resolveNewTabNavigationTarget('card master browser extension'),
    ).toEqual({
      kind: 'search',
      value: 'card master browser extension',
    });
    expect(resolveNewTabNavigationTarget('')).toBeNull();
  });
});
