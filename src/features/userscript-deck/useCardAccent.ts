import { useEffect, useState } from 'react';

import { deriveCardAccentFromDataUrl } from '../../userscript/application/card-accent';
import type { DeckCard } from './cards';
import { cardAccent } from './presentation';

const resolvedAccents = new Map<string, string>();
const pendingAccents = new Map<string, Promise<string>>();

function customPoster(card: DeckCard) {
  if (card.kind !== 'userscript') return null;
  const media = card.presentation?.media;
  if (media?.kind === 'image') return media.image;
  if (media?.kind === 'video' && media.video.startsWith('data:')) {
    return media.poster ?? null;
  }
  return null;
}

function resolveAccent(poster: string) {
  const resolved = resolvedAccents.get(poster);
  if (resolved) return Promise.resolve(resolved);
  const pending = pendingAccents.get(poster);
  if (pending) return pending;
  const created = deriveCardAccentFromDataUrl(poster)
    .then((accent) => {
      resolvedAccents.set(poster, accent);
      return accent;
    })
    .finally(() => {
      pendingAccents.delete(poster);
    });
  pendingAccents.set(poster, created);
  return created;
}

export function useCardAccent(card: DeckCard) {
  const fallback = cardAccent(card);
  const poster = customPoster(card);
  const [accent, setAccent] = useState(
    () => (poster ? resolvedAccents.get(poster) : null) ?? fallback,
  );

  useEffect(() => {
    if (!poster) {
      setAccent(fallback);
      return;
    }
    const resolved = resolvedAccents.get(poster);
    if (resolved) {
      setAccent(resolved);
      return;
    }
    setAccent(fallback);
    let active = true;
    void resolveAccent(poster).then(
      (next) => {
        if (active) setAccent(next);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [fallback, poster]);

  return accent;
}
