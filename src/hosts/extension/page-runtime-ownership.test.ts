import { describe, expect, it, vi } from 'vitest';
import { claimPageRuntime } from './page-runtime-ownership';

describe('claimPageRuntime', () => {
  it('replaces the previous runtime and leaves the latest runtime active', () => {
    const disposePrevious = vi.fn();
    const disposeCurrent = vi.fn();
    const target = new EventTarget();

    const previous = claimPageRuntime('test-runtime', disposePrevious, target);
    const current = claimPageRuntime('test-runtime', disposeCurrent, target);

    expect(disposePrevious).toHaveBeenCalledOnce();
    expect(disposeCurrent).not.toHaveBeenCalled();
    expect(previous.replacedExisting).toBe(false);
    expect(current.replacedExisting).toBe(true);

    previous.release();
    target.dispatchEvent(new Event('card-master:replace-runtime:test-runtime'));
    expect(disposeCurrent).toHaveBeenCalledOnce();

    current.release();
  });
});
