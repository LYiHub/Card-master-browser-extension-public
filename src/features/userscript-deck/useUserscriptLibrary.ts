import { useCallback, useEffect, useState } from 'react';

import { isExtensionPageLifecycleInterrupted } from '../../lib/extension-errors';
import { userscriptExportFilename } from '../../userscript/application/source-export';
import {
  type AvailableUserscriptUpdate,
  applyUserscriptUpdate,
} from '../../userscript/application/update-service';
import { userscriptDisplayName } from '../../userscript/domain/metadata';
import type { InstalledUserscript } from '../../userscript/domain/types';
import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import type { UserscriptDeckHost } from './host';
import { useSystemCardSnapshots } from './useSystemCardSnapshots';

export function useUserscriptLibrary(
  host: UserscriptDeckHost,
  onInteractionError: (message: string) => void,
) {
  const {
    repository,
    runtime,
    runtimeContext,
    sourceExporter,
    updater,
    readExecutionCapability,
  } = host;
  const [items, setItems] = useState<InstalledUserscript[]>(() =>
    structuredClone([...host.initialScripts]),
  );
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryReady, setLibraryReady] = useState(false);
  const [executionCapability, setExecutionCapability] =
    useState<UserscriptExecutionCapability | null>(null);
  const systemCards = useSystemCardSnapshots(host, onInteractionError);

  useEffect(() => {
    let active = true;
    let reading = false;
    const read = () => {
      if (reading) return;
      reading = true;
      void readExecutionCapability()
        .then(
          (capability) => {
            if (active) setExecutionCapability(capability);
          },
          (error) => {
            if (!active) return;
            if (isExtensionPageLifecycleInterrupted(error)) return;
            setExecutionCapability({
              status: 'unavailable',
              message: error instanceof Error ? error.message : String(error),
            });
          },
        )
        .finally(() => {
          reading = false;
        });
    };
    const handleFocus = () => read();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') read();
    };
    read();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [readExecutionCapability]);

  useEffect(() => {
    let active = true;
    const unsubscribe = runtime.subscribe((scriptId, state) => {
      if (!active) return;
      setItems((current) =>
        current.map((item) =>
          item.id === scriptId ? { ...item, runtime: state } : item,
        ),
      );
    });
    return () => {
      active = false;
      unsubscribe();
      runtime.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    let active = true;
    const applyScripts = (scripts: readonly InstalledUserscript[]) => {
      if (!active) return;
      setItems(
        scripts.map((item) => ({
          ...item,
          runtime: runtime.synchronizeState(item, runtimeContext),
        })),
      );
      setLibraryError(null);
      setLibraryReady(true);
    };
    const unsubscribe = repository.subscribe(applyScripts);
    void repository
      .list()
      .then(applyScripts)
      .catch((error) => {
        if (!active) return;
        setLibraryError(error instanceof Error ? error.message : String(error));
        setItems((current) =>
          current.map((item) => ({
            ...item,
            runtime: runtime.synchronizeState(item, runtimeContext),
          })),
        );
        setLibraryReady(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [repository, runtime, runtimeContext]);

  const restoreAuthoritativeLibrary = useCallback(
    (error: unknown) => {
      onInteractionError(
        error instanceof Error ? error.message : String(error),
      );
      void repository
        .list()
        .then((scripts) => {
          setItems(
            scripts.map((item) => ({
              ...item,
              runtime: runtime.synchronizeState(item, runtimeContext),
            })),
          );
        })
        .catch((restoreError) => {
          setLibraryError(
            restoreError instanceof Error
              ? restoreError.message
              : String(restoreError),
          );
        });
    },
    [onInteractionError, repository, runtime, runtimeContext],
  );

  const persistScript = useCallback(
    (script: InstalledUserscript) => {
      void repository.upsert(script).catch(restoreAuthoritativeLibrary);
    },
    [repository, restoreAuthoritativeLibrary],
  );

  const commitScript = useCallback(
    (next: InstalledUserscript) => {
      setItems((current) =>
        current.map((item) => (item.id === next.id ? next : item)),
      );
      persistScript(next);
    },
    [persistScript],
  );

  const removeScript = useCallback(
    (scriptId: string) => {
      runtime.stop(scriptId);
      setItems((current) =>
        current.filter((candidate) => candidate.id !== scriptId),
      );
      void repository.remove(scriptId).catch(restoreAuthoritativeLibrary);
    },
    [repository, restoreAuthoritativeLibrary, runtime],
  );

  const persistOrder = useCallback(
    (orderedIds: readonly string[]) => {
      void repository.reorder(orderedIds).catch(restoreAuthoritativeLibrary);
    },
    [repository, restoreAuthoritativeLibrary],
  );

  const checkScriptUpdate = useCallback(
    (script: InstalledUserscript) => updater.check(script, 'manual'),
    [updater],
  );

  const installScriptUpdate = useCallback(
    async (script: InstalledUserscript, update: AvailableUserscriptUpdate) => {
      const downloaded = await updater.download(update);
      const updated = applyUserscriptUpdate(script, downloaded, {
        now: Date.now,
      });
      commitScript({
        ...updated,
        runtime: runtime.synchronizeState(updated, runtimeContext),
      });
    },
    [commitScript, runtime, runtimeContext, updater],
  );

  const exportScriptSource = useCallback(
    (script: InstalledUserscript, source: string) => {
      void sourceExporter.exportSource({
        source,
        suggestedFilename: userscriptExportFilename(
          userscriptDisplayName(script.metadata),
        ),
      });
    },
    [sourceExporter],
  );

  return {
    items,
    setItems,
    libraryError,
    libraryReady,
    executionCapability,
    ...systemCards,
    commitScript,
    removeScript,
    persistOrder,
    checkScriptUpdate,
    installScriptUpdate,
    exportScriptSource,
  };
}
