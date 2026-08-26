import { useEffect, useState } from 'react';

import {
  readGamepadSnapshot,
  subscribeGamepadSnapshot,
} from '../hosts/extension/gamepad-bridge';
import type { GamepadInputSnapshot } from './domain/types';

function bridgeHost(pageDocument: Document) {
  return (pageDocument.defaultView ?? globalThis) as typeof globalThis;
}

export function useGamepadSnapshot(pageDocument: Document = document) {
  const [snapshot, setSnapshot] = useState(() =>
    readGamepadSnapshot(bridgeHost(pageDocument)),
  );

  useEffect(() => {
    const host = bridgeHost(pageDocument);
    const refresh = () => setSnapshot(readGamepadSnapshot(host));
    const unsubscribe = subscribeGamepadSnapshot(refresh, host);
    refresh();
    return unsubscribe;
  }, [pageDocument]);

  return snapshot;
}

type GamepadConnection = Pick<GamepadInputSnapshot, 'connected' | 'id'>;

export function useGamepadConnection(pageDocument: Document = document) {
  const [connection, setConnection] = useState<GamepadConnection>(() => {
    const { connected, id } = readGamepadSnapshot(bridgeHost(pageDocument));
    return { connected, id };
  });

  useEffect(() => {
    const host = bridgeHost(pageDocument);
    const refresh = () => {
      const { connected, id } = readGamepadSnapshot(host);
      setConnection((current) =>
        current.connected === connected && current.id === id
          ? current
          : { connected, id },
      );
    };
    const unsubscribe = subscribeGamepadSnapshot(refresh, host);
    refresh();
    return unsubscribe;
  }, [pageDocument]);

  return connection;
}
