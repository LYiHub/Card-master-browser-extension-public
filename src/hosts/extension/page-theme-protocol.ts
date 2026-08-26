import {
  isPageThemeSnapshot,
  type PageThemeSnapshot,
} from '../../page-theme/domain/types';

export const PAGE_THEME_SNAPSHOT_DATASET = 'cardMasterPageTheme';
export const PAGE_THEME_SNAPSHOT_EVENT = 'card-master:page-theme-snapshot';
export const PAGE_THEME_TRANSITION_REQUEST_EVENT =
  'card-master:page-theme-transition-request';
export const PAGE_THEME_TRANSITION_DURATION_MS = 1_000;

export function requestPageThemeTransition(pageDocument: Document = document) {
  pageDocument.dispatchEvent(new Event(PAGE_THEME_TRANSITION_REQUEST_EVENT));
}

export function readPageThemeSnapshot(
  pageDocument: Document = document,
): PageThemeSnapshot | null {
  const serialized =
    pageDocument.documentElement.dataset[PAGE_THEME_SNAPSHOT_DATASET];
  if (!serialized) return null;
  try {
    const snapshot: unknown = JSON.parse(serialized);
    return isPageThemeSnapshot(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export function publishPageThemeSnapshot(
  snapshot: PageThemeSnapshot,
  pageDocument: Document = document,
) {
  pageDocument.documentElement.dataset[PAGE_THEME_SNAPSHOT_DATASET] =
    JSON.stringify(snapshot);
  pageDocument.dispatchEvent(
    new CustomEvent(PAGE_THEME_SNAPSHOT_EVENT, { detail: snapshot }),
  );
}
