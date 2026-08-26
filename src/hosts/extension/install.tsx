import { AlertTriangle, ArrowLeft, Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  ContextPlaque,
  type ContextPlaqueContent,
} from '../../components/ui/ContextPlaque';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { UiIconButton } from '../../components/ui/Ui';
import { bundledCardMediaForVideo } from '../../lib/userscript-deck-media';
import { DEFAULT_USERSCRIPT_MEDIA } from '../../userscript/application/presentation';
import { hydrateScript } from '../../userscript/application/script-repository';
import {
  parseUserscriptMetadata,
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../../userscript/domain/metadata';
import type { MetadataDiagnostic } from '../../userscript/domain/types';
import {
  type UserscriptExecutionCapability,
  userscriptExecutionAvailable,
} from '../../userscript/runtime/capabilities';
import { requireExtensionApi } from './api';
import { ExtensionAudioSettingsRepository } from './audio-settings';
import { ExtensionDeckEntryController } from './deck-entry';
import { InstallCompletionDialog } from './InstallCompletionDialog';
import { InstallDecision } from './InstallDecision';
import { InstallDeckLanding } from './InstallDeckLanding';
import { InstallInspectionDialog } from './InstallInspectionDialog';
import { type InstallCardAssets, InstallScriptCard } from './InstallScriptCard';
import installStyles from './install.css?inline';
import { isInstallAndCloseShortcut } from './install-shortcut';
import {
  ExtensionUserscriptInstallerClient,
  readUserscriptInstallerSource,
  UserscriptInstallerError,
} from './installer';
import type {
  UserscriptInstallPreview,
  UserscriptInstallResult,
} from './protocol';
import {
  type InstallPhase,
  useInstallCardAnimation,
} from './useInstallCardAnimation';

const api = requireExtensionApi();
const installer = new ExtensionUserscriptInstallerClient(api);
const audioSettings = new ExtensionAudioSettingsRepository(api);
const deckEntry = new ExtensionDeckEntryController(api);
const assets = {
  back: api.runtime.getURL(
    'project-assets/userscript-deck/visual/cards/card-master-back.webp',
  ),
  bottomFrame: api.runtime.getURL(
    'project-assets/userscript-deck/visual/cards/bottom-frame.webp',
  ),
  edge: api.runtime.getURL(
    'project-assets/userscript-deck/visual/cards/edge.webp',
  ),
  forge: api.runtime.getURL(
    'project-assets/userscript-deck/audio/effects/update.mp3',
  ),
  sparkles: api.runtime.getURL(
    'project-assets/userscript-deck/visual/cards/sparkles.gif',
  ),
} satisfies Omit<InstallCardAssets, 'media'> & {
  forge: string;
};

type Failure = {
  message: string;
  diagnostics: readonly MetadataDiagnostic[];
  source?: string;
};

function failure(error: unknown): Failure {
  return {
    message: error instanceof Error ? error.message : String(error),
    diagnostics:
      error instanceof UserscriptInstallerError ? error.diagnostics : [],
    source:
      error instanceof UserscriptInstallerError ? error.source : undefined,
  };
}

function returnToMarket() {
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.close();
}

function InstallerPage() {
  const [preview, setPreview] = useState<UserscriptInstallPreview | null>(null);
  const [result, setResult] = useState<UserscriptInstallResult | null>(null);
  const [executionCapability, setExecutionCapability] =
    useState<UserscriptExecutionCapability | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [phase, setPhase] = useState<InstallPhase>('preview');
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const loading = !preview && !loadFailure;
  const closeAfterInstallRef = useRef(false);
  const completeStow = useCallback(() => {
    setPhase('complete');
    if (closeAfterInstallRef.current) {
      window.close();
      return;
    }
    setCompletionOpen(true);
  }, []);
  const { cardMotionRef, decisionRef, deckLandingRef, reducedMotion } =
    useInstallCardAnimation(phase, completeStow, !loading);

  useEffect(() => {
    if (phase !== 'stowing') return;
    let audio: HTMLAudioElement | null = null;
    let cancelled = false;
    void audioSettings.read().then((settings) => {
      if (cancelled || settings?.muted) return;
      audio = new Audio(assets.forge);
      audio.volume = settings?.volume ?? 0.78;
      void audio.play().catch(() => undefined);
    });
    return () => {
      cancelled = true;
      audio?.pause();
    };
  }, [phase]);

  useEffect(() => {
    let active = true;
    try {
      const sourceUrl = readUserscriptInstallerSource(window.location.search);
      void installer.capability().then(
        (capability) => {
          if (active) setExecutionCapability(capability);
        },
        (error) => {
          if (!active) return;
          setExecutionCapability({
            status: 'unavailable',
            message: error instanceof Error ? error.message : String(error),
          });
        },
      );
      void installer.preview(sourceUrl).then(
        (next) => {
          if (!active) return;
          setPreview(next);
        },
        (error) => {
          if (!active) return;
          setLoadFailure(failure(error));
        },
      );
    } catch (error) {
      setLoadFailure(failure(error));
    }
    return () => {
      active = false;
    };
  }, []);

  const installed = useMemo(
    () => (result ? hydrateScript(result.script) : null),
    [result],
  );
  const script = useMemo(
    () => installed ?? (preview ? hydrateScript(preview.script) : null),
    [installed, preview],
  );
  const cardAssets = useMemo<InstallCardAssets>(() => {
    const presentation = script?.presentation;
    if (presentation?.media.kind === 'image') {
      return {
        ...assets,
        media: {
          kind: 'image',
          image: presentation.media.image,
        },
      };
    }
    const media =
      bundledCardMediaForVideo(
        presentation?.media.kind === 'video'
          ? presentation.media.video
          : undefined,
      ) ?? DEFAULT_USERSCRIPT_MEDIA;
    return {
      ...assets,
      media: {
        kind: 'video',
        video: api.runtime.getURL(`project-assets/${media.video}`),
        poster: api.runtime.getURL(`project-assets/${media.poster}`),
      },
    };
  }, [script?.presentation]);
  const rejectedMetadata = useMemo(
    () =>
      loadFailure?.source
        ? parseUserscriptMetadata(loadFailure.source).metadata
        : null,
    [loadFailure],
  );
  const metadata = script?.metadata ?? rejectedMetadata;
  const diagnostics = useMemo<readonly MetadataDiagnostic[]>(() => {
    const reported = loadFailure?.diagnostics ?? preview?.diagnostics ?? [];
    if (!loadFailure || reported.length > 0) return reported;
    return [
      {
        severity: 'error',
        code: 'installer-failure',
        message: loadFailure.message,
      },
    ];
  }, [loadFailure, preview?.diagnostics]);
  const sourceCode =
    preview?.script.source.code ?? loadFailure?.source ?? script?.source.code;
  const matchScope = metadata
    ? [...new Set([...metadata.matches, ...metadata.includes])]
    : [];
  const grants = metadata?.grants.length
    ? [...new Set(metadata.grants)]
    : ['none'];
  const blockingCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  ).length;
  const warningCount = diagnostics.length - blockingCount;
  const success = phase === 'complete' && Boolean(result && installed);
  const busy = phase === 'installing' || phase === 'stowing';
  const capabilityReady = userscriptExecutionAvailable(executionCapability);
  const capabilityUnavailable =
    executionCapability !== null && !capabilityReady;
  const title = metadata ? userscriptDisplayName(metadata) : '安装已中止';
  const description =
    (metadata && userscriptDisplayDescription(metadata)) ||
    '该脚本没有提供说明。';
  const version = metadata?.version ?? '';
  const focusInfo = useMemo<ContextPlaqueContent>(
    () => ({
      key: success
        ? `installed:${title}:${version}`
        : loadFailure
          ? `blocked:${title}:${diagnostics.length}`
          : `ready:${title}:${version}`,
      title: success ? '卡牌已收录' : title,
      description,
      stats: metadata
        ? [
            `版本 ${metadata.version || '未声明'}`,
            `作者 ${metadata.author || '未声明'}`,
          ]
        : [],
    }),
    [
      description,
      diagnostics.length,
      loadFailure,
      metadata,
      success,
      title,
      version,
    ],
  );
  const install = useCallback(
    async (closeAfterInstall = false) => {
      if (!preview || busy || !capabilityReady) return;
      if (!preview.script.presentation) {
        setLoadFailure({
          message: '安装预览缺少卡牌封面分配，请重新打开安装页面。',
          diagnostics: [],
        });
        return;
      }
      closeAfterInstallRef.current = closeAfterInstall;
      setPhase('installing');
      setLoadFailure(null);
      try {
        const next = await installer.install(
          preview.sourceUrl,
          preview.script.source.code,
          preview.script.presentation,
        );
        setResult(next);
        setPhase('stowing');
      } catch (error) {
        setLoadFailure(failure(error));
        closeAfterInstallRef.current = false;
        setPhase('preview');
      }
    },
    [busy, capabilityReady, preview],
  );

  useEffect(() => {
    const handleInstallShortcut = (event: KeyboardEvent) => {
      if (
        !isInstallAndCloseShortcut(event) ||
        event.repeat ||
        inspectionOpen ||
        completionOpen
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      void install(true);
    };
    window.addEventListener('keydown', handleInstallShortcut, true);
    return () =>
      window.removeEventListener('keydown', handleInstallShortcut, true);
  }, [completionOpen, install, inspectionOpen]);

  const canInspect =
    diagnostics.length > 0 || matchScope.length > 0 || Boolean(sourceCode);
  const permissionSummary =
    grants.length === 1 && grants[0] === 'none'
      ? '无需额外权限'
      : `${grants.length} 项脚本权限`;

  if (loading) {
    return (
      <main
        className="app-ui-theme userscript-installer is-loading-preview"
        aria-busy="true"
      >
        <style>{installStyles}</style>
        <InstallDeckLanding
          landingRef={deckLandingRef}
          controller={deckEntry}
        />
      </main>
    );
  }

  return (
    <main className="app-ui-theme userscript-installer">
      <style>{installStyles}</style>
      <div className="install-atmosphere" />

      <UiIconButton
        className="install-corner-back"
        label="返回脚本市场"
        onClick={returnToMarket}
      >
        <ArrowLeft size={19} />
      </UiIconButton>
      <div
        className={`install-integrity${loadFailure ? ' is-error' : ''}`}
        aria-live="polite"
      >
        <MotionIconSwap
          state={loadFailure ? 'error' : 'ready'}
          items={[
            { state: 'ready', icon: <Check size={15} /> },
            { state: 'error', icon: <AlertTriangle size={15} /> },
          ]}
        />
        {loadFailure
          ? '需要查看预检详情'
          : capabilityUnavailable
            ? '脚本执行权限未开启'
            : '完整源码已验证'}
      </div>

      <ContextPlaque
        content={focusInfo}
        className="install-focus-header"
        headingLevel="h1"
      />

      <div className={`install-layout is-${phase}`} data-install-phase={phase}>
        {phase === 'complete' ? (
          <div className="install-card-stage" aria-hidden="true" />
        ) : (
          <InstallScriptCard
            ref={cardMotionRef}
            assets={cardAssets}
            name={title}
            description={description}
            playing={!reducedMotion && phase !== 'stowing'}
            waiting={phase === 'installing'}
            status={loadFailure ? 'error' : 'ready'}
            {...(script?.presentation?.accent
              ? { accent: script.presentation.accent }
              : {})}
          />
        )}

        <InstallDecision
          decisionRef={decisionRef}
          phase={phase}
          result={result}
          preview={preview}
          executionCapability={executionCapability}
          loadFailed={Boolean(loadFailure)}
          blockingCount={blockingCount}
          warningCount={warningCount}
          success={success}
          matchScopeCount={metadata ? matchScope.length : null}
          permissionSummary={permissionSummary}
          canInspect={canInspect}
          busy={busy}
          onInspect={() => setInspectionOpen(true)}
          onRequestExecutionPermission={() => {
            void installer.requestExecutionPermission().catch((error) => {
              setLoadFailure(failure(error));
            });
          }}
          onInstall={() => void install(false)}
          onInstallAndClose={() => void install(true)}
        />
      </div>

      <InstallDeckLanding landingRef={deckLandingRef} controller={deckEntry} />

      <InstallInspectionDialog
        open={inspectionOpen}
        diagnostics={diagnostics}
        matchScope={matchScope}
        grants={grants}
        sourceCode={sourceCode}
        onClose={() => setInspectionOpen(false)}
      />
      <InstallCompletionDialog
        open={completionOpen}
        title={title}
        onStay={() => setCompletionOpen(false)}
        onClosePage={() => window.close()}
      />
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing Userscript installer mount point.');
createRoot(root).render(<InstallerPage />);
