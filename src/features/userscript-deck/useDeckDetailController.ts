import { useCallback, useState } from 'react';

import type { AudioDirector } from '../../audio/AudioDirector';
import type { ManagerMode } from '../manager-interaction/state';
import type { DeckCard } from './cards';
import type { UserscriptDetailMode } from './detail-mode';

export type DeckDetailPresentation = {
  selected: DeckCard;
  detailMode: UserscriptDetailMode;
  returnMode: 'closed' | 'spread';
};

export function useDeckDetailController({
  audio,
  mode,
  selected,
  detailMode,
  returnMode,
  returnCardToSpread,
  closeDetailState,
}: {
  audio: Pick<AudioDirector, 'play'>;
  mode: ManagerMode;
  selected: DeckCard | null;
  detailMode: UserscriptDetailMode | null;
  returnMode: 'closed' | 'spread' | null;
  returnCardToSpread: (cardId: string) => void;
  closeDetailState: () => void;
}) {
  const [closingDetail, setClosingDetail] =
    useState<DeckDetailPresentation | null>(null);

  const closeDetail = useCallback(() => {
    if (
      mode !== 'detail' ||
      !selected ||
      !detailMode ||
      !returnMode ||
      closingDetail
    ) {
      return;
    }
    audio.play('panelClose', { positionX: window.innerWidth / 2 });
    setClosingDetail({ selected, detailMode, returnMode });
    if (returnMode === 'spread') returnCardToSpread(selected.id);
  }, [
    audio,
    closingDetail,
    detailMode,
    mode,
    returnMode,
    returnCardToSpread,
    selected,
  ]);

  const completeDetailClose = useCallback(() => {
    if (closingDetail?.returnMode === 'closed') closeDetailState();
    setClosingDetail(null);
  }, [closeDetailState, closingDetail]);
  const activeDetail =
    closingDetail ??
    (mode === 'detail' && selected && detailMode && returnMode
      ? { selected, detailMode, returnMode }
      : null);

  return {
    activeDetail,
    closing: closingDetail !== null,
    closeDetail,
    completeDetailClose,
  };
}
