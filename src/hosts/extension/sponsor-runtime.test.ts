import { describe, expect, it } from 'vitest';

import {
  isSponsorRuntimeMessage,
  isSponsorStorageChangedMessage,
  isSponsorStorageRequest,
  parseSponsorRuntimePortName,
  SPONSOR_RUNTIME_MESSAGE,
  SPONSOR_STORAGE_CHANGED,
  SPONSOR_STORAGE_REQUEST,
  sponsorRuntimePortName,
} from './sponsor-runtime';

describe('Sponsor runtime protocol', () => {
  it('accepts only complete scoped storage requests', () => {
    expect(
      isSponsorStorageRequest({
        type: SPONSOR_STORAGE_REQUEST,
        runtimeId: 'youtube',
        areaName: 'sync',
        operation: 'set',
        payload: { disableSkipping: false },
      }),
    ).toBe(true);
    expect(
      isSponsorStorageRequest({
        type: SPONSOR_STORAGE_REQUEST,
        runtimeId: 'youtube',
        areaName: 'sync',
        operation: 'set',
        payload: 'invalid',
      }),
    ).toBe(false);
    expect(
      isSponsorStorageRequest({
        type: SPONSOR_STORAGE_REQUEST,
        runtimeId: 'unknown',
        areaName: 'sync',
        operation: 'clear',
      }),
    ).toBe(false);
  });

  it('keeps runtime messages and storage events inside known runtimes', () => {
    expect(
      isSponsorRuntimeMessage({
        type: SPONSOR_RUNTIME_MESSAGE,
        runtimeId: 'bilibili',
        payload: { message: 'refreshSegments' },
      }),
    ).toBe(true);
    expect(
      isSponsorStorageChangedMessage({
        type: SPONSOR_STORAGE_CHANGED,
        runtimeId: 'youtube',
        areaName: 'local',
        changes: {},
      }),
    ).toBe(true);
    expect(
      isSponsorStorageChangedMessage({
        type: SPONSOR_STORAGE_CHANGED,
        runtimeId: 'bilibili',
        areaName: 'session',
        changes: {},
      }),
    ).toBe(false);
  });

  it('round-trips scoped port names without accepting malformed names', () => {
    const name = sponsorRuntimePortName('youtube', 'popup');
    expect(parseSponsorRuntimePortName(name)).toEqual({
      runtimeId: 'youtube',
      name: 'popup',
    });
    expect(parseSponsorRuntimePortName('popup')).toBeNull();
    expect(
      parseSponsorRuntimePortName(
        'card-master:sponsor-runtime-port:unknown:popup',
      ),
    ).toBeNull();
  });
});
