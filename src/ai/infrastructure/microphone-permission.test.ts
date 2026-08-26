import { describe, expect, it, vi } from 'vitest';

import {
  microphonePermissionErrorMessage,
  readMicrophonePermissionState,
} from './microphone-permission';

describe('microphone permission', () => {
  it('reads the browser permission state when supported', async () => {
    const query = vi.fn(async () => ({ state: 'granted' as const }));

    await expect(
      readMicrophonePermissionState({
        query,
      } as unknown as Pick<Permissions, 'query'>),
    ).resolves.toBe('granted');
    expect(query).toHaveBeenCalledWith({ name: 'microphone' });
  });

  it('falls back cleanly when the permission query is unavailable', async () => {
    await expect(readMicrophonePermissionState(undefined)).resolves.toBe(
      'unavailable',
    );
  });

  it('translates a dismissed permission prompt into an actionable message', () => {
    expect(
      microphonePermissionErrorMessage(new Error('Permission dismissed')),
    ).toBe('麦克风权限未获允许。请先打开设备权限页面完成授权。');
  });
});
