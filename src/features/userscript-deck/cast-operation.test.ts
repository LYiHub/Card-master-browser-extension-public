import { describe, expect, it, vi } from 'vitest';

import { runCastOperation } from './cast-operation';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('runCastOperation', () => {
  it('starts a concurrent operation during charge and waits for both', async () => {
    const charge = deferred();
    const operation = deferred();
    const order: string[] = [];
    const invoke = vi.fn(() => {
      order.push('invoke');
      return operation.promise;
    });
    let complete = false;

    const running = runCastOperation(
      () => {
        order.push('charge');
        return charge.promise;
      },
      invoke,
      'during-charge',
    ).then(() => {
      complete = true;
    });

    expect(invoke).toHaveBeenCalledOnce();
    expect(order).toEqual(['charge', 'invoke']);
    operation.resolve();
    await Promise.resolve();
    expect(complete).toBe(false);
    charge.resolve();
    await running;
    expect(complete).toBe(true);
  });

  it('keeps ordinary commands deferred until charge completes', async () => {
    const charge = deferred();
    const invoke = vi.fn(async () => undefined);
    const running = runCastOperation(
      () => charge.promise,
      invoke,
      'after-charge',
    );

    expect(invoke).not.toHaveBeenCalled();
    charge.resolve();
    await running;
    expect(invoke).toHaveBeenCalledOnce();
  });
});
