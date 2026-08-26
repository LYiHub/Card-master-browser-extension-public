import { useCallback, useEffect, useState } from 'react';

import type {
  PageThemeController,
  PageThemeSettingsView,
  PageThemeSnapshot,
} from '../../page-theme/domain/types';

export type PageThemeBoardStatus = {
  message: string;
  error: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function usePageThemeBoard(
  controller: PageThemeController,
  onSnapshot: (snapshot: PageThemeSnapshot) => void,
) {
  const [view, setView] = useState<PageThemeSettingsView | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [status, setStatus] = useState<PageThemeBoardStatus>({
    message: '',
    error: false,
  });

  const applyView = useCallback(
    (next: PageThemeSettingsView) => {
      setView(next);
      onSnapshot(next.snapshot);
    },
    [onSnapshot],
  );

  useEffect(() => {
    let active = true;
    void controller.readSettings().then(
      (next) => {
        if (!active) return;
        applyView(next);
        setBusy(null);
      },
      (error) => {
        if (!active) return;
        setStatus({ message: errorMessage(error), error: true });
        setBusy(null);
      },
    );
    return () => {
      active = false;
    };
  }, [applyView, controller]);

  const run = useCallback(
    async (
      operation: string,
      task: () => Promise<PageThemeSettingsView>,
      message: string,
    ) => {
      setBusy(operation);
      setStatus({ message: '', error: false });
      try {
        applyView(await task());
        setStatus({ message, error: false });
        return true;
      } catch (error) {
        setStatus({ message: errorMessage(error), error: true });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [applyView],
  );

  return {
    view,
    busy,
    status,
    setStatus,
    run,
  };
}
