import { describe, expect, it, vi } from 'vitest';

import {
  consumeAiServiceSse,
  requestAiService,
  requestStreamingAiService,
} from './ai-service-http';

describe('AI 服务事件流', () => {
  it('在调用 fetch 前拒绝不能写入请求头的模型密钥', async () => {
    const fetcher = vi.fn(async () => new Response());

    await expect(
      requestAiService(
        fetcher,
        {
          apiKey: '密钥：secret',
        },
        'https://router.example/v1/responses',
        {},
      ),
    ).rejects.toThrow(
      'AI 服务 API 密钥包含请求头不支持的字符。请只输入密钥本身，不要附带中文说明、全角标点、空格或换行。',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('事件流可以长时间等待，只有显式取消才会终止', async () => {
    vi.useFakeTimers();
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const controller = new AbortController();
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // 保持连接打开，模拟持续数小时的模型任务。
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
      const pending = consumeAiServiceSse(response, controller.signal, vi.fn());
      let settled = false;
      const observed = pending.finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
      expect(settled).toBe(false);

      controller.abort(new DOMException('用户取消', 'AbortError'));
      await expect(observed).rejects.toThrow('用户取消');
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
      vi.useRealTimers();
    }
  });

  it('等待首个响应时不会被内部计时器自动终止', async () => {
    vi.useFakeTimers();
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const controller = new AbortController();
      const pending = requestStreamingAiService(
        vi.fn(
          async (_input, init) =>
            await new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(init.signal?.reason),
                { once: true },
              );
            }),
        ),
        { apiKey: 'secret' },
        'https://router.example/v1/responses',
        { model: 'provider-model', stream: true },
        controller.signal,
      );
      let settled = false;
      const observed = pending.finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(6 * 60 * 60_000);
      expect(settled).toBe(false);

      controller.abort(new DOMException('用户取消', 'AbortError'));
      await expect(observed).rejects.toThrow('用户取消');
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
      vi.useRealTimers();
    }
  });
});
