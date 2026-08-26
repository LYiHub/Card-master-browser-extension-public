import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ContentBlockingController,
  ContentBlockingSettingsView,
  ContentBlockingSnapshot,
} from '../../content-blocking/domain/types';

export type ContentBlockingBoardStatus = {
  message: string;
  error: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useContentBlockingBoard(
  controller: ContentBlockingController,
  onSnapshot: (snapshot: ContentBlockingSnapshot) => void,
) {
  const [view, setView] = useState<ContentBlockingSettingsView | null>(() =>
    controller.getCachedSettings(),
  );
  const [activeOperations, setActiveOperations] = useState(
    () => new Set<string>(view ? [] : ['load']),
  );
  const [status, setStatus] = useState<ContentBlockingBoardStatus>({
    message: '',
    error: false,
  });
  const waitingForConfiguration = useRef(false);
  const latestOperation = useRef(0);

  const setOperationActive = useCallback(
    (operation: string, active: boolean) => {
      setActiveOperations((current) => {
        const next = new Set(current);
        if (active) next.add(operation);
        else next.delete(operation);
        return next;
      });
    },
    [],
  );

  const applyView = useCallback(
    (next: ContentBlockingSettingsView) => {
      setView(next);
      onSnapshot(next.snapshot);
    },
    [onSnapshot],
  );

  const applySnapshot = useCallback(
    (snapshot: ContentBlockingSnapshot) => {
      setView((current) => (current ? { ...current, snapshot } : current));
      onSnapshot(snapshot);
      if (!waitingForConfiguration.current || snapshot.configurationPending) {
        return;
      }
      waitingForConfiguration.current = false;
      if (snapshot.status === 'error') {
        setStatus({
          message: snapshot.errors.join(' ') || '内容拦截引擎更新失败。',
          error: true,
        });
        return;
      }
      setStatus({ message: '内容拦截引擎已更新。', error: false });
    },
    [onSnapshot],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = controller.subscribe((snapshot) => {
      if (active) applySnapshot(snapshot);
    });
    void controller.readSettings().then(
      (next) => {
        if (!active) return;
        applyView(next);
        setOperationActive('load', false);
      },
      (error) => {
        if (!active) return;
        setStatus({ message: errorMessage(error), error: true });
        setOperationActive('load', false);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applySnapshot, applyView, controller, setOperationActive]);

  const run = useCallback(
    async (
      operation: string,
      task: () => Promise<ContentBlockingSettingsView>,
      message: string,
    ) => {
      const operationSequence = ++latestOperation.current;
      setOperationActive(operation, true);
      setStatus({ message: '', error: false });
      try {
        const next = await task();
        applyView(next);
        waitingForConfiguration.current = next.snapshot.configurationPending;
        if (latestOperation.current === operationSequence) {
          setStatus({
            message: next.snapshot.configurationPending
              ? `${message} 引擎正在后台更新。`
              : message,
            error: false,
          });
        }
        if (next.snapshot.configurationPending) {
          void controller.read().then(applySnapshot, () => undefined);
        }
        return true;
      } catch (error) {
        if (latestOperation.current === operationSequence) {
          setStatus({ message: errorMessage(error), error: true });
        }
        return false;
      } finally {
        setOperationActive(operation, false);
      }
    },
    [applySnapshot, applyView, controller, setOperationActive],
  );

  return {
    view,
    activeOperations,
    isBusy: (operation: string) => activeOperations.has(operation),
    status,
    setStatus,
    run,
  };
}
