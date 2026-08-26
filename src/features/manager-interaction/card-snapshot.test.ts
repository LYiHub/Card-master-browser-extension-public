import { describe, expect, it } from 'vitest';

import { readManagerCardSnapshotMedia } from './card-snapshot';

function mediaElement({
  cover,
  video,
}: {
  cover?: Partial<HTMLImageElement>;
  video?: Partial<HTMLVideoElement>;
}) {
  return {
    querySelector: (selector: string) =>
      selector === '.manager-card__cover' ? (cover ?? null) : (video ?? null),
  } as unknown as HTMLElement;
}

describe('manager card snapshot media', () => {
  it('prefers a ready cover image over the fallback video frame', () => {
    const cover = {
      complete: true,
      naturalWidth: 768,
      naturalHeight: 1024,
    } as HTMLImageElement;
    const video = {
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
    } as HTMLVideoElement;

    expect(
      readManagerCardSnapshotMedia(mediaElement({ cover, video })),
    ).toEqual({
      source: cover,
      width: 768,
      height: 1024,
    });
  });

  it('uses a decoded video frame when no cover image is available', () => {
    const video = {
      readyState: 4,
      videoWidth: 1280,
      videoHeight: 720,
    } as HTMLVideoElement;

    expect(readManagerCardSnapshotMedia(mediaElement({ video }))).toEqual({
      source: video,
      width: 1280,
      height: 720,
    });
  });
});
