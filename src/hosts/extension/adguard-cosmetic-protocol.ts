export const ADGUARD_COSMETIC_APPLIED_EVENT =
  'card-master:adguard-cosmetic-applied';
export const ADGUARD_COSMETIC_REVISION_DATASET =
  'cardMasterAdguardCosmeticRevision';

export function publishAdguardCosmeticRevision(
  pageDocument: Document,
  revision: number | undefined,
) {
  if (typeof revision !== 'number' || !Number.isFinite(revision)) return;
  pageDocument.documentElement.dataset[ADGUARD_COSMETIC_REVISION_DATASET] =
    String(revision);
  pageDocument.dispatchEvent(
    new CustomEvent(ADGUARD_COSMETIC_APPLIED_EVENT, {
      detail: { revision },
    }),
  );
}
