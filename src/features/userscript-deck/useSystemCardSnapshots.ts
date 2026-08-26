import { useEffect, useState } from 'react';

import type { BilibiliCapabilitySnapshot } from '../../bilibili-capabilities/domain/types';
import {
  type ContentBlockingSnapshot,
  startingContentBlockingSnapshot,
} from '../../content-blocking/domain/types';
import {
  type MediaResourcesSnapshot,
  startingMediaResourcesSnapshot,
} from '../../media-resources/domain/types';
import {
  type MediaSpeedSnapshot,
  startingMediaSpeedSnapshot,
} from '../../media-speed/domain/types';
import {
  type PageThemeSnapshot,
  startingPageThemeSnapshot,
} from '../../page-theme/domain/types';
import type { UserscriptDeckHost } from './host';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useSystemCardSnapshots(
  host: Pick<
    UserscriptDeckHost,
    | 'runtimeContext'
    | 'contentBlocking'
    | 'pageTheme'
    | 'mediaSpeed'
    | 'mediaResources'
    | 'bilibiliCapabilities'
  >,
  onInteractionError: (message: string) => void,
) {
  const {
    runtimeContext,
    contentBlocking,
    pageTheme,
    mediaSpeed,
    mediaResources,
    bilibiliCapabilities,
  } = host;
  const [contentBlockingSnapshot, setContentBlockingSnapshot] =
    useState<ContentBlockingSnapshot | null>(() =>
      contentBlocking ? startingContentBlockingSnapshot() : null,
    );
  const [pageThemeSnapshot, setPageThemeSnapshot] =
    useState<PageThemeSnapshot | null>(() =>
      pageTheme ? startingPageThemeSnapshot(runtimeContext.url) : null,
    );
  const [mediaSpeedSnapshot, setMediaSpeedSnapshot] =
    useState<MediaSpeedSnapshot | null>(() =>
      mediaSpeed ? startingMediaSpeedSnapshot(runtimeContext.url) : null,
    );
  const [mediaResourcesSnapshot, setMediaResourcesSnapshot] =
    useState<MediaResourcesSnapshot | null>(() =>
      mediaResources
        ? startingMediaResourcesSnapshot(runtimeContext.url)
        : null,
    );
  const [bilibiliCapabilitySnapshots, setBilibiliCapabilitySnapshots] =
    useState<readonly BilibiliCapabilitySnapshot[]>([]);

  useEffect(() => {
    if (!contentBlocking) return;
    let active = true;
    const unsubscribe = contentBlocking.subscribe((snapshot) => {
      if (active) setContentBlockingSnapshot(snapshot);
    });
    void contentBlocking.read().then(
      (snapshot) => {
        if (active) setContentBlockingSnapshot(snapshot);
      },
      (error) => {
        if (!active) return;
        setContentBlockingSnapshot({
          ...startingContentBlockingSnapshot(),
          status: 'error',
          errors: [errorMessage(error)],
        });
      },
    );
    return () => {
      active = false;
      unsubscribe();
      contentBlocking.dispose();
    };
  }, [contentBlocking]);

  useEffect(() => {
    if (!pageTheme) return;
    let active = true;
    const unsubscribe = pageTheme.subscribe((snapshot) => {
      if (active) setPageThemeSnapshot(snapshot);
    });
    void pageTheme.read().then(
      (snapshot) => {
        if (active) setPageThemeSnapshot(snapshot);
      },
      (error) => {
        if (!active) return;
        setPageThemeSnapshot({
          ...startingPageThemeSnapshot(window.location.href),
          status: 'error',
          error: errorMessage(error),
        });
      },
    );
    return () => {
      active = false;
      unsubscribe();
      pageTheme.dispose();
    };
  }, [pageTheme]);

  useEffect(() => {
    if (!mediaSpeed) return;
    let active = true;
    const unsubscribe = mediaSpeed.subscribe((snapshot) => {
      if (active) setMediaSpeedSnapshot(snapshot);
    });
    void mediaSpeed.read().catch((error) => {
      if (!active) return;
      setMediaSpeedSnapshot({
        ...startingMediaSpeedSnapshot(window.location.href),
        status: 'error',
        error: errorMessage(error),
      });
    });
    return () => {
      active = false;
      unsubscribe();
      mediaSpeed.dispose();
    };
  }, [mediaSpeed]);

  useEffect(() => {
    if (!mediaResources) return;
    let active = true;
    const unsubscribe = mediaResources.subscribe((snapshot) => {
      if (active) setMediaResourcesSnapshot(snapshot);
    });
    void mediaResources.read().catch((error) => {
      if (!active) return;
      setMediaResourcesSnapshot({
        ...startingMediaResourcesSnapshot(window.location.href),
        status: 'error',
        activeOnPage: false,
        error: errorMessage(error),
      });
    });
    return () => {
      active = false;
      unsubscribe();
      mediaResources.dispose();
    };
  }, [mediaResources]);

  useEffect(() => {
    if (!bilibiliCapabilities) return;
    let active = true;
    const unsubscribe = bilibiliCapabilities.subscribe((snapshots) => {
      if (active) setBilibiliCapabilitySnapshots(snapshots);
    });
    return () => {
      active = false;
      unsubscribe();
      bilibiliCapabilities.dispose();
    };
  }, [bilibiliCapabilities]);

  useEffect(() => {
    if (!bilibiliCapabilities) return;
    let active = true;
    void bilibiliCapabilities.read(runtimeContext.url).then(
      (snapshots) => {
        if (active) setBilibiliCapabilitySnapshots(snapshots);
      },
      (error) => {
        if (active) onInteractionError(errorMessage(error));
      },
    );
    return () => {
      active = false;
    };
  }, [bilibiliCapabilities, onInteractionError, runtimeContext.url]);

  return {
    contentBlockingSnapshot,
    setContentBlockingSnapshot,
    pageThemeSnapshot,
    setPageThemeSnapshot,
    mediaSpeedSnapshot,
    setMediaSpeedSnapshot,
    mediaResourcesSnapshot,
    setMediaResourcesSnapshot,
    bilibiliCapabilitySnapshots,
    setBilibiliCapabilitySnapshots,
  };
}
