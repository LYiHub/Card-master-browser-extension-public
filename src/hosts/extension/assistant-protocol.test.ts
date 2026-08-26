import { describe, expect, it } from 'vitest';

import { aiAssistantPortRequest } from './assistant-protocol';

describe('AI assistant port protocol', () => {
  it('requires a bounded request id on every operation', () => {
    expect(
      aiAssistantPortRequest({
        type: 'create',
        requestId: 'create-1',
      }),
    ).toBe(true);
    expect(aiAssistantPortRequest({ type: 'create' })).toBe(false);
    expect(
      aiAssistantPortRequest({
        type: 'create',
        requestId: 'x'.repeat(257),
      }),
    ).toBe(false);
  });

  it('accepts image attachments without a local size limit', () => {
    const request = {
      type: 'send',
      requestId: 'send-image',
      message: '检查截图',
      images: [
        {
          id: 'image-1',
          name: '页面截图.png',
          mimeType: 'image/png',
          size: 128,
          available: true,
          dataUrl: 'data:image/png;base64,aGVsbG8=',
        },
      ],
    };

    expect(aiAssistantPortRequest(request)).toBe(true);
    expect(
      aiAssistantPortRequest({
        ...request,
        images: [{ ...request.images[0], size: 5 * 1024 * 1024 }],
      }),
    ).toBe(true);
  });

  it('accepts a bounded heartbeat used only while a model run is active', () => {
    expect(
      aiAssistantPortRequest({
        type: 'heartbeat',
        requestId: 'heartbeat-1',
      }),
    ).toBe(true);
  });
});
