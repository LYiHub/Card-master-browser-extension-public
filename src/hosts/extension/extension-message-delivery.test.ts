import { describe, expect, it, vi } from 'vitest';

import {
  monitorExtensionMessageDeliveries,
  settleExtensionMessageDeliveries,
} from './extension-message-delivery';

describe('扩展消息尽力投递', () => {
  it('接收端长期不结束响应时不阻塞调用方并在超时后报告', async () => {
    vi.useFakeTimers();
    try {
      const onComplete = vi.fn();
      const pending = new Promise<never>(() => undefined);

      expect(
        monitorExtensionMessageDeliveries(
          [Promise.resolve(), pending],
          2_000,
          onComplete,
        ),
      ).toBeUndefined();
      expect(onComplete).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2_000);

      expect(onComplete).toHaveBeenCalledWith({
        attempted: 2,
        failed: 1,
        interrupted: 0,
        timedOut: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('允许写入事务等待消息投递完成', async () => {
    vi.useFakeTimers();
    try {
      const pending = new Promise<never>(() => undefined);
      const result = settleExtensionMessageDeliveries(
        [Promise.resolve(), Promise.reject(new Error('unreachable')), pending],
        2_000,
      );

      await vi.advanceTimersByTimeAsync(2_000);

      await expect(result).resolves.toEqual({
        attempted: 3,
        failed: 2,
        interrupted: 0,
        timedOut: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('separates reload and missing receiver interruptions from real failures', async () => {
    await expect(
      settleExtensionMessageDeliveries(
        [
          Promise.resolve(),
          Promise.reject(
            new Error(
              'Could not establish connection. Receiving end does not exist.',
            ),
          ),
          Promise.reject(new Error('No tab with id: 17.')),
          Promise.reject(new Error('Unexpected serialization failure.')),
        ],
        2_000,
      ),
    ).resolves.toEqual({
      attempted: 4,
      failed: 1,
      interrupted: 2,
      timedOut: 0,
    });
  });
});
