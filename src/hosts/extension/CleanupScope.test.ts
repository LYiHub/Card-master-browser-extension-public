import { describe, expect, it, vi } from 'vitest';

import { CleanupScope } from './CleanupScope';

describe('CleanupScope', () => {
  it('releases acquired resources in reverse order exactly once', () => {
    const order: number[] = [];
    const scope = new CleanupScope(() => undefined);
    scope.add(() => order.push(1));
    scope.add(() => order.push(2));

    scope.dispose();
    scope.dispose();

    expect(order).toEqual([2, 1]);
  });

  it('continues cleanup after one disposer fails', () => {
    const cleanup = vi.fn();
    const onError = vi.fn();
    const scope = new CleanupScope(onError);
    scope.add(cleanup);
    scope.add(() => {
      throw new Error('cleanup failed');
    });

    scope.dispose();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'cleanup failed',
      }),
    );
  });

  it('immediately releases resources added after disposal', () => {
    const cleanup = vi.fn();
    const scope = new CleanupScope(() => undefined);
    scope.dispose();

    scope.add(cleanup);

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
