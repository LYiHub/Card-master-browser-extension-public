import { describe, expect, it } from 'vitest';

import {
  defaultMediaResourcesSettings,
  isMediaManifestInspection,
  isMediaResource,
  isMediaResourcesSettings,
  isMediaResourcesSnapshot,
  startingMediaResourcesSnapshot,
} from './types';

describe('media resource domain', () => {
  it('starts disabled with an empty page-scoped snapshot', () => {
    expect(defaultMediaResourcesSettings()).toEqual({
      version: 1,
      revision: 0,
      enabled: false,
      showPageTrigger: true,
      showResourceCountBadge: true,
    });
    expect(
      startingMediaResourcesSnapshot('https://video.example/watch/1'),
    ).toMatchObject({
      status: 'starting',
      enabled: false,
      showPageTrigger: true,
      showResourceCountBadge: true,
      available: true,
      captureEnabled: false,
      activeOnPage: false,
      currentHost: 'video.example',
      resources: [],
    });
  });

  it('validates bounded resource and manifest records', () => {
    const resource = {
      id: 'media-1',
      tabId: 7,
      url: 'https://cdn.example/video.mp4',
      kind: 'video' as const,
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      size: 1024,
      initiator: 'https://video.example',
      frameId: 0,
      discoveredAt: 1,
      requestHeaders: [],
      responseHeaders: [],
    };
    const snapshot = {
      ...startingMediaResourcesSnapshot('https://video.example'),
      status: 'ready' as const,
      revision: 2,
      activeOnPage: true,
      resources: [resource],
    };
    const inspection = {
      resourceId: resource.id,
      format: 'hls' as const,
      live: false,
      encrypted: false,
      drmSystems: [],
      segmentCount: 2,
      duration: 10,
      variants: [],
      audioTracks: [],
      preview: '#EXTM3U',
    };

    expect(isMediaResourcesSettings(defaultMediaResourcesSettings())).toBe(
      true,
    );
    expect(isMediaResource(resource)).toBe(true);
    expect(isMediaResourcesSnapshot(snapshot)).toBe(true);
    expect(isMediaManifestInspection(inspection)).toBe(true);
    expect(isMediaResource({ ...resource, url: 'x'.repeat(8_193) })).toBe(
      false,
    );
    expect(
      isMediaManifestInspection({
        ...inspection,
        preview: 'x'.repeat(8_193),
      }),
    ).toBe(false);
  });
});
