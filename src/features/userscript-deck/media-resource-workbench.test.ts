import { describe, expect, it } from 'vitest';

import type { MediaResource } from '../../media-resources/domain/types';
import {
  groupMediaResources,
  recommendedMediaResource,
  reconcileSelectedResourceIds,
} from './media-resource-workbench';

function resource(
  id: string,
  kind: MediaResource['kind'],
  size: number | null,
  discoveredAt = 1,
): MediaResource {
  return {
    id,
    tabId: 7,
    url: `https://example.com/${id}`,
    kind,
    fileName: id,
    mimeType: '',
    size,
    initiator: 'https://example.com/',
    frameId: 0,
    discoveredAt,
    requestHeaders: [],
    responseHeaders: [],
  };
}

describe('media resource workbench', () => {
  it('recommends a complete manifest before direct media candidates', () => {
    expect(
      recommendedMediaResource([
        resource('large-video.mp4', 'video', 500_000_000),
        resource('stream.m3u8', 'hls', 2_000),
        resource('audio.m4s', 'audio', 20_000_000),
      ])?.id,
    ).toBe('stream.m3u8');
  });

  it('prefers the largest candidate within the same resource kind', () => {
    expect(
      recommendedMediaResource([
        resource('small.mp4', 'video', 10),
        resource('large.mp4', 'video', 20),
      ])?.id,
    ).toBe('large.mp4');
  });

  it('groups candidates by user-facing media purpose', () => {
    expect(
      groupMediaResources([
        resource('video.mp4', 'video', 20),
        resource('audio.m4a', 'audio', 10),
        resource('stream.mpd', 'dash', 1),
        resource('subtitle.vtt', 'subtitle', 1),
      ]).map((group) => ({
        id: group.id,
        resources: group.resources.map((entry) => entry.id),
      })),
    ).toEqual([
      { id: 'manifest', resources: ['stream.mpd'] },
      { id: 'video', resources: ['video.mp4'] },
      { id: 'audio', resources: ['audio.m4a'] },
      { id: 'subtitle', resources: ['subtitle.vtt'] },
    ]);
  });

  it('retains valid selections and falls back to the recommended target', () => {
    const resources = [
      resource('video.mp4', 'video', 20),
      resource('audio.m4a', 'audio', 10),
    ];
    expect(
      reconcileSelectedResourceIds(['missing', 'audio.m4a'], resources),
    ).toEqual(['audio.m4a']);
    expect(reconcileSelectedResourceIds(['missing'], resources)).toEqual([
      'video.mp4',
    ]);
  });
});
