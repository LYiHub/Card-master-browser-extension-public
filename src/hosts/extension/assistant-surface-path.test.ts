import { describe, expect, it } from 'vitest';

import {
  assistantSurfacePath,
  assistantSurfaceTabId,
} from './assistant-surface-path';

describe('assistant surface path', () => {
  it('keeps a missing tab identity distinct from tab zero', () => {
    expect(assistantSurfaceTabId('')).toBeNull();
    expect(assistantSurfaceTabId('?tabId=0')).toBe(0);
    expect(assistantSurfaceTabId('?tabId=42')).toBe(42);
    expect(assistantSurfaceTabId('?tabId=invalid')).toBeNull();
  });

  it('creates only validated tab-specific paths', () => {
    expect(assistantSurfacePath(42)).toBe('assistant.html?tabId=42');
    expect(() => assistantSurfacePath(-1)).toThrow('标签页身份');
  });
});
