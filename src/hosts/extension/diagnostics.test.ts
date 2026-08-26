import { describe, expect, it, vi } from 'vitest';

import {
  EXTENSION_DIAGNOSTIC_RELAY_TYPE,
  extensionDiagnostics,
  extensionErrorMessage,
  isExtensionContextInvalidated,
  isExtensionDiagnosticRelayMessage,
  isExtensionPageLifecycleInterrupted,
  isOrphanedExtensionRuntimeFailure,
  notifyExtensionContextInvalidated,
  onExtensionContextInvalidated,
  reportExtensionFailure,
} from './diagnostics';

describe('extension runtime diagnostics', () => {
  it('reads messages from plain Chrome rejection objects', () => {
    const error = {
      message:
        'The page keeping the extension port is moved into back/forward cache, so the message channel is closed.',
    };

    expect(extensionErrorMessage(error)).toBe(error.message);
    expect(isExtensionPageLifecycleInterrupted(error)).toBe(true);
  });

  it('把异步响应前关闭的消息通道识别为页面生命周期中断', () => {
    expect(
      isExtensionPageLifecycleInterrupted({
        message:
          'A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received',
      }),
    ).toBe(true);
  });

  it.each([
    'No tab with id: 1696117750.',
    'Frame with ID 0 was removed.',
    'Frame with ID 0 is showing error page',
  ])('把标签页与 Frame 消失识别为页面生命周期中断：%s', (message) => {
    expect(isExtensionPageLifecycleInterrupted(new Error(message))).toBe(true);
  });

  it('只在扩展上下文已经失效时识别第三方运行时的衍生错误', () => {
    vi.stubGlobal('chrome', { runtime: {} });

    for (const error of [
      new TypeError(
        "Cannot read properties of undefined (reading 'onMessage')",
      ),
      new TypeError("Cannot read properties of undefined (reading 'session')"),
      new TypeError(
        "Cannot read properties of undefined (reading 'getMessage')",
      ),
      new TypeError("Cannot read properties of null (reading 'skipKeybind')"),
      new Error('TIMEOUT waiting for ()=>runtime.isReady()'),
      new Error('This script should only be loaded in a browser extension.'),
    ]) {
      expect(isOrphanedExtensionRuntimeFailure(error)).toBe(true);
    }

    vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } });
    expect(
      isOrphanedExtensionRuntimeFailure(
        new TypeError(
          "Cannot read properties of undefined (reading 'onMessage')",
        ),
      ),
    ).toBe(false);
    expect(
      isOrphanedExtensionRuntimeFailure(
        new Error('This script should only be loaded in a browser extension.'),
      ),
    ).toBe(false);
    expect(
      isExtensionContextInvalidated(
        new Error('This script should only be loaded in a browser extension.'),
      ),
    ).toBe(false);
    vi.unstubAllGlobals();
  });

  it('reads nested lastError messages', () => {
    expect(
      extensionErrorMessage({
        lastError: { message: 'Could not establish connection.' },
      }),
    ).toBe('Could not establish connection.');
  });

  it('preserves the underlying cause of wrapped runtime failures', () => {
    expect(
      extensionErrorMessage(
        new Error('Cannot be started:', {
          cause: new Error(
            'Invalid enumeration value "extraHeaders" for webRequest.',
          ),
        }),
      ),
    ).toBe(
      'Cannot be started: Invalid enumeration value "extraHeaders" for webRequest.',
    );
  });

  it('does not repeat a nested cause already included in the parent message', () => {
    const cause = new DOMException('The operation was aborted.', 'AbortError');
    const error = new Error(
      'Firefox AdGuard 启动阶段“完整过滤引擎构建”失败：The operation was aborted.',
      { cause },
    );

    expect(extensionErrorMessage(error)).toBe(
      'Firefox AdGuard 启动阶段“完整过滤引擎构建”失败：The operation was aborted.',
    );
  });

  it('在控制台首行直接写出真实错误消息', () => {
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    extensionDiagnostics.error('adguard-runtime', 'mount-failed', {
      message: '后台连接已经中断。',
    });

    expect(write).toHaveBeenCalledWith(
      '[Card Master][adguard-runtime] mount-failed：后台连接已经中断。',
      expect.objectContaining({
        error: expect.objectContaining({
          message: '后台连接已经中断。',
        }),
      }),
    );
    write.mockRestore();
  });

  it('静默忽略页面生命周期断连', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    reportExtensionFailure(
      'content-bootstrap',
      'state-read-failed',
      new Error(
        'Could not establish connection. Receiving end does not exist.',
      ),
      { requestType: 'deck-bootstrap-read' },
    );

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });

  it('在时间窗口内合并相同错误', () => {
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new Error('重复失败');

    extensionDiagnostics.error(
      'deduplication-test',
      'operation-failed',
      failure,
    );
    extensionDiagnostics.error(
      'deduplication-test',
      'operation-failed',
      failure,
    );

    expect(write).toHaveBeenCalledOnce();
    write.mockRestore();
  });

  it('向后台转发可序列化的结构化错误', () => {
    const sendMessage = vi.fn((_message: unknown, callback?: () => void) =>
      callback?.(),
    );
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', {
      origin: 'https://example.com',
      pathname: '/page',
    });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'extension-id',
        lastError: undefined,
        sendMessage,
      },
    });
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    extensionDiagnostics.error(
      'content-bootstrap',
      'host-load-failed',
      new Error('加载失败'),
    );

    const relay = sendMessage.mock.calls[0]?.[0];
    expect(relay).toEqual(
      expect.objectContaining({
        type: EXTENSION_DIAGNOSTIC_RELAY_TYPE,
      }),
    );
    expect(isExtensionDiagnosticRelayMessage(relay)).toBe(true);
    expect(JSON.stringify(relay)).not.toContain('"raw"');

    write.mockRestore();
    vi.unstubAllGlobals();
  });

  it('扩展失效后的清理错误不再制造第二条控制台错误', () => {
    const write = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    onExtensionContextInvalidated(() => {
      throw new Error('Extension context invalidated.');
    });

    expect(
      notifyExtensionContextInvalidated(
        new Error('Extension context invalidated.'),
      ),
    ).toBe(true);
    expect(write).not.toHaveBeenCalled();

    write.mockRestore();
  });
});
