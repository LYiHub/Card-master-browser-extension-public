import type { RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';

import { inputCoordinatorFor } from './coordinator';
import { handleSurfaceIntent } from './dom-surface-navigation';
import { registerEscapeLayer } from './escape-layer';

export function useSurfaceInputInteraction({
  surfaceRef,
  enabled = true,
  priority,
  id,
  onClose,
  onEnter,
}: {
  surfaceRef: RefObject<HTMLElement>;
  enabled?: boolean;
  priority: number;
  id: string;
  onClose: () => void;
  onEnter?: () => void;
}) {
  const onCloseRef = useRef(onClose);
  const onEnterRef = useRef(onEnter);
  const enabledRef = useRef(enabled);
  onCloseRef.current = onClose;
  onEnterRef.current = onEnter;
  enabledRef.current = enabled;

  useLayoutEffect(() => {
    if (!enabled) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const rootNode = surface.getRootNode();
    const root =
      rootNode instanceof ShadowRoot ? rootNode : surface.ownerDocument;
    const unregisterInputScope = inputCoordinatorFor(root).register(root, {
      id,
      priority,
      active: () => enabledRef.current,
      handle: (event) =>
        handleSurfaceIntent({
          surface,
          event,
          onClose: () => onCloseRef.current(),
          onEnter: onEnterRef.current,
        }),
    });
    const unregisterEscapeLayer = registerEscapeLayer(surface.ownerDocument, {
      id,
      priority,
      active: () => enabledRef.current,
      onEscape: () => onCloseRef.current(),
    });
    return () => {
      unregisterEscapeLayer();
      unregisterInputScope();
    };
  }, [enabled, id, priority, surfaceRef]);
}
