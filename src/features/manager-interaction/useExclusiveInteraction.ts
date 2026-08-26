import { useCallback, useRef, useState } from 'react';

export function useExclusiveInteraction() {
  const ownerRef = useRef<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const claim = useCallback((id: string, cancelInteraction?: () => void) => {
    if (ownerRef.current) return false;
    ownerRef.current = id;
    cancelRef.current = cancelInteraction ?? null;
    setOwnerId(id);
    return true;
  }, []);

  const release = useCallback((id: string) => {
    if (ownerRef.current !== id) return;
    ownerRef.current = null;
    cancelRef.current = null;
    setOwnerId(null);
  }, []);

  const hasOwner = useCallback(() => ownerRef.current !== null, []);
  const cancelActive = useCallback(() => {
    if (!ownerRef.current || !cancelRef.current) return false;
    cancelRef.current();
    return true;
  }, []);

  return {
    ownerId,
    claim,
    release,
    hasOwner,
    cancelActive,
  };
}
