import { describe, expect, it, vi } from 'vitest';

import { configureExtensionStorageAccess } from './storage-access';

describe('扩展存储访问级别', () => {
  it('保护持久化存储，同时允许上游内容脚本写入会话状态', async () => {
    const local = { setAccessLevel: vi.fn(async () => undefined) };
    const session = { setAccessLevel: vi.fn(async () => undefined) };

    await configureExtensionStorageAccess({ local, session } as never);

    expect(local.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
    expect(session.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
    });
  });
});
