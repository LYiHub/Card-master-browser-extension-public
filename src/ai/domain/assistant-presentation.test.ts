import { describe, expect, it } from 'vitest';

import {
  assistantTargetStatus,
  assistantUserFacingError,
} from './assistant-presentation';

describe('智能体用户展示信息', () => {
  it('页面状态只展示页面名称，不展示内部编号或完整地址', () => {
    expect(
      assistantTargetStatus({
        tabId: 42,
        windowId: 7,
        title: '示例页面',
        url: 'https://example.com/private/path',
        active: true,
        available: true,
      }),
    ).toBe('示例页面');
  });

  it('服务错误转换为用户可操作的说明', () => {
    expect(
      assistantUserFacingError(
        'AI 服务请求失败（HTTP 402）：Insufficient Balance requestId=secret',
      ),
    ).toBe('模型服务额度不足，请检查服务账户后重试。');
    expect(
      assistantUserFacingError(
        'AI 服务事件流中断：network failure 会话诊断 ID：secret',
      ),
    ).toBe('智能体暂时无法连接，请稍后重试。');
  });
});
