import { describe, expect, it, vi } from 'vitest';

import {
  createVolcengineSpeechAuthorizationRule,
  SPEECH_AUTHORIZATION_RULE_ID,
  VolcengineSpeechAuthorizationCoordinator,
} from './volcengine-speech-session';

describe('火山引擎流式语音鉴权规则', () => {
  it('只为目标 WebSocket 写入完整的 API Key 鉴权头', () => {
    const rule = createVolcengineSpeechAuthorizationRule(
      new URL('wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'),
      'speech-key',
      'connect-id',
      'volc.seedasr.sauc.duration',
    );

    expect(rule).toMatchObject({
      id: SPEECH_AUTHORIZATION_RULE_ID,
      priority: 10_000,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'X-Api-Key', operation: 'set', value: 'speech-key' },
          {
            header: 'X-Api-Resource-Id',
            operation: 'set',
            value: 'volc.seedasr.sauc.duration',
          },
          {
            header: 'X-Api-Connect-Id',
            operation: 'set',
            value: 'connect-id',
          },
          {
            header: 'X-Api-Request-Id',
            operation: 'set',
            value: 'connect-id',
          },
          {
            header: 'X-Api-Sequence',
            operation: 'set',
            value: '-1',
          },
        ],
      },
      condition: {
        urlFilter: '||openspeech.bytedance.com/api/v3/sauc/bigmodel|',
        resourceTypes: ['websocket'],
      },
    });
  });

  it('为一个页面会话安装鉴权并在握手后移除', async () => {
    const updateSessionRules = vi.fn(async () => undefined);
    const getSessionRules = vi.fn(async () => [
      { id: SPEECH_AUTHORIZATION_RULE_ID },
    ]);
    const coordinator = new VolcengineSpeechAuthorizationCoordinator({
      updateSessionRules,
      getSessionRules,
    } as unknown as Pick<
      typeof chrome.declarativeNetRequest,
      'getSessionRules' | 'updateSessionRules'
    >);

    const authorization = await coordinator.open('speech-key');

    expect(authorization.endpoint).toBe(
      'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
    );
    expect(updateSessionRules).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        removeRuleIds: [SPEECH_AUTHORIZATION_RULE_ID],
        addRules: [
          expect.objectContaining({ id: SPEECH_AUTHORIZATION_RULE_ID }),
        ],
      }),
    );
    await expect(coordinator.open('speech-key')).rejects.toThrow(
      '已有语音识别鉴权会话正在运行',
    );

    await coordinator.close(authorization.sessionId);

    expect(updateSessionRules).toHaveBeenNthCalledWith(2, {
      removeRuleIds: [SPEECH_AUTHORIZATION_RULE_ID],
    });
  });
});
