import {
  isMediaSpeedSnapshot,
  type MediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import {
  MEDIA_SPEED_SNAPSHOT_DATASET,
  MEDIA_SPEED_SNAPSHOT_EVENT,
} from './media-speed-bridge';

export { MEDIA_SPEED_SNAPSHOT_DATASET, MEDIA_SPEED_SNAPSHOT_EVENT };

export function readMediaSpeedSnapshot(
  pageDocument: Document = document,
): MediaSpeedSnapshot | null {
  const serialized =
    pageDocument.documentElement?.dataset[MEDIA_SPEED_SNAPSHOT_DATASET];
  if (!serialized) return null;
  try {
    const snapshot: unknown = JSON.parse(serialized);
    return isMediaSpeedSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export function publishMediaSpeedSnapshot(
  snapshot: MediaSpeedSnapshot,
  pageDocument: Document = document,
) {
  const root = pageDocument.documentElement;
  if (!root) return;
  root.dataset[MEDIA_SPEED_SNAPSHOT_DATASET] = JSON.stringify(snapshot);
  pageDocument.dispatchEvent(
    new CustomEvent(MEDIA_SPEED_SNAPSHOT_EVENT, { detail: snapshot }),
  );
}
