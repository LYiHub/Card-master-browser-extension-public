import { useEffect, useRef, useState } from 'react';

const POPUP_MIN_HEIGHT = 96;
const POPUP_MAX_WIDTH = 640;
const POPUP_PAD = 12;
const POPUP_GAP = 12;

export function catCatchPopupSource(tabId?: number) {
  const getURL = globalThis.chrome?.runtime?.getURL;
  if (!getURL) return null;
  const url = new URL(getURL('popup.html'));
  url.searchParams.set('embedded', '1');
  if (typeof tabId === 'number' && Number.isSafeInteger(tabId) && tabId > 0) {
    url.searchParams.set('tabId', String(tabId));
  }
  return url.toString();
}

export function catCatchPopupPageTabId(resources: { tabId?: number }[]) {
  const tabId = resources.find(
    (item) =>
      typeof item.tabId === 'number' &&
      Number.isSafeInteger(item.tabId) &&
      item.tabId > 0,
  )?.tabId;
  return tabId;
}

export function catCatchPopupBox(
  trigger: {
    left: number;
    right: number;
    top: number;
    width: number;
    height: number;
  },
  viewport: { width: number; height: number },
  contentHeight: number,
) {
  const width = Math.min(
    POPUP_MAX_WIDTH,
    Math.max(160, viewport.width - POPUP_PAD * 2),
  );
  const height = Math.min(
    Math.max(contentHeight, POPUP_MIN_HEIGHT),
    Math.max(POPUP_MIN_HEIGHT, viewport.height - POPUP_PAD * 2),
  );
  const midX = trigger.left + trigger.width / 2;
  const midY = trigger.top + trigger.height / 2;
  const left = Math.min(
    Math.max(
      POPUP_PAD,
      midX > viewport.width / 2
        ? trigger.left - POPUP_GAP - width
        : trigger.right + POPUP_GAP,
    ),
    viewport.width - POPUP_PAD - width,
  );
  const top = Math.min(
    Math.max(POPUP_PAD, midY > viewport.height / 2 ? midY - height : midY),
    viewport.height - POPUP_PAD - height,
  );
  return { left, top, width, height };
}

export function catCatchPopupOwnsPointerTarget(
  root: Pick<HTMLElement, 'contains'>,
  target: EventTarget | null,
) {
  if (!(target instanceof Node)) return false;
  return (
    root.contains(target) ||
    (target instanceof Element &&
      target.closest('.manager-media-resources-trigger') !== null)
  );
}

function placePopup(root: HTMLElement, contentHeight: number) {
  const view = root.ownerDocument.defaultView;
  const cluster = root.closest('.manager-deck-entry-cluster');
  const trigger =
    cluster?.querySelector('.manager-media-resources-trigger') ?? cluster;
  if (!view || !trigger) return;
  const box = catCatchPopupBox(
    trigger.getBoundingClientRect(),
    { width: view.innerWidth, height: view.innerHeight },
    contentHeight,
  );
  root.style.position = 'fixed';
  root.style.left = `${box.left}px`;
  root.style.top = `${box.top}px`;
  root.style.width = `${box.width}px`;
  root.style.height = `${box.height}px`;
  root.style.right = 'auto';
  root.style.bottom = 'auto';
}

export function CatCatchPopup({
  onClose,
  tabId,
}: {
  onClose: () => void;
  tabId?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [contentHeight, setContentHeight] = useState(POPUP_MIN_HEIGHT);
  const source = catCatchPopupSource(tabId);

  useEffect(() => {
    const root = rootRef.current;
    const pageWindow = root?.ownerDocument.defaultView;
    if (!root || !pageWindow) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (catCatchPopupOwnsPointerTarget(root, event.target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    const sync = () => placePopup(root, contentHeight);
    sync();
    pageWindow.addEventListener('pointerdown', handlePointerDown);
    pageWindow.addEventListener('keydown', handleKeyDown, true);
    pageWindow.addEventListener('resize', sync);
    return () => {
      pageWindow.removeEventListener('pointerdown', handlePointerDown);
      pageWindow.removeEventListener('keydown', handleKeyDown, true);
      pageWindow.removeEventListener('resize', sync);
    };
  }, [contentHeight, onClose]);

  useEffect(() => {
    const pageWindow = rootRef.current?.ownerDocument.defaultView;
    if (!pageWindow) return;
    const handleMessage = (event: MessageEvent) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        event.data?.source !== 'card-master-cat-catch' ||
        event.data?.type !== 'resize' ||
        typeof event.data?.height !== 'number'
      ) {
        return;
      }
      setContentHeight(
        Math.max(POPUP_MIN_HEIGHT, Math.ceil(event.data.height)),
      );
    };
    pageWindow.addEventListener('message', handleMessage);
    return () => pageWindow.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    rootRef.current?.style.setProperty(
      '--cat-catch-popup-content-height',
      `${contentHeight}px`,
    );
  }, [contentHeight]);

  if (!source) return null;

  return (
    <div
      ref={rootRef}
      className="cat-catch-popup-frame"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <iframe
        ref={frameRef}
        src={source}
        title="顺手牵羊"
        allow="clipboard-write; fullscreen"
        onLoad={() => {
          if (typeof tabId !== 'number' || tabId <= 0) return;
          frameRef.current?.contentWindow?.postMessage(
            {
              source: 'card-master-cat-catch',
              type: 'page-tab',
              tabId,
            },
            '*',
          );
        }}
      />
    </div>
  );
}
