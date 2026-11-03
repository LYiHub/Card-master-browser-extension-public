import { Download, RefreshCw, Settings, Sparkles, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { UserscriptSourcePanel } from '../../components/UserscriptSourcePanel';
import {
  CardStatusNotice,
  DiagnosticCopyButton,
  UiButton,
  UiDialog,
  UiLoader,
  UiTextArea,
  UiTextField,
  UiToggle,
} from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import {
  MAX_USERSCRIPT_COVER_PROMPT_LENGTH,
  prepareUserscriptCoverMedia,
  UserscriptCoverConfigurationRequiredError,
  type UserscriptCoverController,
} from '../../userscript/application/card-cover';
import {
  MAX_EDITABLE_USERSCRIPT_DESCRIPTION_LENGTH,
  MAX_EDITABLE_USERSCRIPT_NAME_LENGTH,
} from '../../userscript/application/metadata-editor';
import { userscriptPublicationPageUrl } from '../../userscript/application/publication-page';
import type {
  AvailableUserscriptUpdate,
  UpdateCheckResult,
} from '../../userscript/application/update-service';
import {
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../../userscript/domain/metadata';
import {
  type InstalledUserscript,
  isUserscriptCoverVideoDataUrl,
  type UserscriptPresentation,
} from '../../userscript/domain/types';
import {
  type UserscriptExecutionCapability,
  userscriptExecutionAvailable,
} from '../../userscript/runtime/capabilities';
import { cardMedia } from './presentation';

export type ManageScriptDraft = {
  name: string;
  description: string;
  coverPresentation: UserscriptPresentation | null;
  source: string;
  checkForUpdates: boolean;
  userMatches: string[];
  userIncludes: string[];
  userExcludeMatches: string[];
  userExcludes: string[];
};

function ruleLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function metadataEntries(values: readonly string[]) {
  const occurrences = new Map<string, number>();
  return (values.length > 0 ? values : [t('cm_manage_board_text_1')]).map(
    (value) => {
      const occurrence = (occurrences.get(value) ?? 0) + 1;
      occurrences.set(value, occurrence);
      return { key: `${value}:${occurrence}`, value };
    },
  );
}

function MetadataGroup({
  title,
  values,
}: {
  title: string;
  values: readonly string[];
}) {
  useLocale();

  return (
    <div className="manager-metadata-group">
      <span>{title}</span>
      <div className="manager-metadata-group__values">
        {metadataEntries(values).map((entry) => (
          <code key={entry.key}>{entry.value}</code>
        ))}
      </div>
    </div>
  );
}

export function ManageBoard({
  item,
  onSave,
  onCheckUpdate,
  onInstallUpdate,
  onExport,
  coverController,
  onOpenAiSettings,
  executionCapability,
  onClose,
}: {
  item: InstalledUserscript;
  onSave: (draft: ManageScriptDraft) => string | null;
  onCheckUpdate: (script: InstalledUserscript) => Promise<UpdateCheckResult>;
  onInstallUpdate: (
    script: InstalledUserscript,
    update: AvailableUserscriptUpdate,
  ) => Promise<void>;
  onExport: (script: InstalledUserscript, source: string) => void;
  coverController: UserscriptCoverController;
  onOpenAiSettings: () => Promise<void>;
  executionCapability: UserscriptExecutionCapability | null;
  onClose: () => void;
}) {
  useLocale();

  type UpdatePanelState =
    | UpdateCheckResult
    | { status: 'idle' | 'checking' | 'installing' }
    | { status: 'installed'; version: string }
    | { status: 'error'; reason: string };

  const [name, setName] = useState(userscriptDisplayName(item.metadata));
  const [description, setDescription] = useState(
    userscriptDisplayDescription(item.metadata),
  );
  const [coverPresentation, setCoverPresentation] =
    useState<UserscriptPresentation | null>(() => item.presentation ?? null);
  const [coverPrompt, setCoverPrompt] = useState('');
  const [injectDefaultStyle, setInjectDefaultStyle] = useState(true);
  const [coverBusy, setCoverBusy] = useState<'upload' | 'generate' | null>(
    null,
  );
  const [coverError, setCoverError] = useState<string | null>(null);
  const [coverServiceState, setCoverServiceState] = useState<
    'checking' | 'configured' | 'missing' | 'unknown'
  >('checking');
  const [coverNeedsConfiguration, setCoverNeedsConfiguration] = useState(false);
  const [source, setSource] = useState(item.source.code);
  const [userMatches, setUserMatches] = useState(
    item.manager.userMatches.join('\n'),
  );
  const [userIncludes, setUserIncludes] = useState(
    item.manager.userIncludes.join('\n'),
  );
  const [userExcludeMatches, setUserExcludeMatches] = useState(
    item.manager.userExcludeMatches.join('\n'),
  );
  const [userExcludes, setUserExcludes] = useState(
    item.manager.userExcludes.join('\n'),
  );
  const [checkForUpdates, setCheckForUpdates] = useState(
    item.manager.checkForUpdates,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdatePanelState>({
    status: 'idle',
  });
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const currentItemRef = useRef(item);
  currentItemRef.current = item;
  const automaticCheckId = item.manager.checkForUpdates ? item.id : null;
  const resolvedCardMedia = cardMedia(item);

  useEffect(() => {
    setSource(item.source.code);
  }, [item.source.code]);

  useEffect(() => {
    setName(userscriptDisplayName(item.metadata));
    setDescription(userscriptDisplayDescription(item.metadata));
  }, [item.metadata]);

  useEffect(() => {
    setCoverPresentation(item.presentation ?? null);
    setCoverPrompt('');
    setCoverError(null);
    setCoverNeedsConfiguration(false);
  }, [item.presentation]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      setCoverServiceState('checking');
      void coverController.isConfigured().then(
        (configured) => {
          if (!active) return;
          setCoverServiceState(configured ? 'configured' : 'missing');
          if (configured) {
            setCoverNeedsConfiguration(false);
            setCoverError((current) =>
              /^OpenAI (?:兼容图像服务尚未配置|相容(?:圖像|影象)服務尚未(?:設定|配置))/.test(
                current ?? '',
              )
                ? null
                : current,
            );
          }
        },
        () => {
          if (active) setCoverServiceState('unknown');
        },
      );
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
    };
  }, [coverController]);

  useEffect(() => {
    setUserMatches(item.manager.userMatches.join('\n'));
    setUserIncludes(item.manager.userIncludes.join('\n'));
    setUserExcludeMatches(item.manager.userExcludeMatches.join('\n'));
    setUserExcludes(item.manager.userExcludes.join('\n'));
  }, [
    item.manager.userExcludeMatches,
    item.manager.userExcludes,
    item.manager.userIncludes,
    item.manager.userMatches,
  ]);

  useEffect(() => {
    setCheckForUpdates(item.manager.checkForUpdates);
  }, [item.manager.checkForUpdates]);

  useEffect(() => {
    if (!automaticCheckId) return;
    const script = currentItemRef.current;
    if (script.id !== automaticCheckId) return;
    let active = true;
    setUpdateState({ status: 'checking' });
    void onCheckUpdate(script)
      .then((result) => {
        if (active) setUpdateState(result);
      })
      .catch((error) => {
        if (!active) return;
        setUpdateState({
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      active = false;
    };
  }, [automaticCheckId, onCheckUpdate]);

  const checkUpdate = async () => {
    setUpdateState({ status: 'checking' });
    try {
      setUpdateState(await onCheckUpdate(item));
    } catch (error) {
      setUpdateState({
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const installUpdate = async (update: AvailableUserscriptUpdate) => {
    if (source !== item.source.code) {
      setUpdateState({
        status: 'error',
        reason: t('cm_manage_board_reason_2'),
      });
      return;
    }
    setUpdateState({ status: 'installing' });
    try {
      await onInstallUpdate(item, update);
      setUpdateState({ status: 'installed', version: update.version });
    } catch (error) {
      setUpdateState({
        status: 'error',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const uploadCover = async (file: File) => {
    setCoverBusy('upload');
    setCoverError(null);
    try {
      setCoverPresentation(await prepareUserscriptCoverMedia(file));
    } catch (error) {
      setCoverError(error instanceof Error ? error.message : String(error));
    } finally {
      setCoverBusy(null);
    }
  };

  const openAiSettings = async () => {
    try {
      await onOpenAiSettings();
    } catch (error) {
      setCoverError(
        t('cm_manage_board_text_3', [
          String(error instanceof Error ? error.message : String(error)),
        ]),
      );
    }
  };

  const generateCover = async () => {
    const prompt = coverPrompt.trim();
    if (!prompt) {
      setCoverError(t('cm_manage_board_text_4'));
      return;
    }
    if (coverServiceState === 'missing') {
      setCoverNeedsConfiguration(true);
      setCoverError(t('cm_manage_board_text_5'));
      await openAiSettings();
      return;
    }
    setCoverBusy('generate');
    setCoverError(null);
    try {
      const cover = await coverController.generate(prompt, injectDefaultStyle);
      setCoverPresentation({
        accent: cover.accent,
        media: { kind: 'image', image: cover.dataUrl },
      });
      setCoverNeedsConfiguration(false);
    } catch (error) {
      if (error instanceof UserscriptCoverConfigurationRequiredError) {
        setCoverServiceState('missing');
        setCoverNeedsConfiguration(true);
        setCoverError(t('cm_manage_board_text_6'));
        void openAiSettings();
      } else {
        setCoverError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setCoverBusy(null);
    }
  };

  const updateMessage = (() => {
    switch (updateState.status) {
      case 'idle':
        return item.metadata.updateUrl || item.metadata.downloadUrl
          ? t('cm_manage_board_text_7')
          : t('cm_manage_board_text_8');
      case 'checking':
        return t('cm_manage_board_text_9');
      case 'disabled':
        return t('cm_manage_board_text_10');
      case 'unavailable':
      case 'error':
        return updateState.reason;
      case 'current':
        return t('cm_manage_board_text_11', [String(updateState.version)]);
      case 'available':
        return updateState.sourceUrl
          ? t('cm_manage_board_text_12', [String(updateState.version)])
          : t('cm_manage_board_text_13', [String(updateState.version)]);
      case 'installing':
        return t('cm_manage_board_text_14');
      case 'installed':
        return t('cm_manage_board_text_15', [String(updateState.version)]);
    }
  })();
  const runtimeError =
    item.runtime.status === 'error'
      ? (item.runtime.error ?? t('cm_manage_board_text_16'))
      : null;
  const runtimeErrorSummary = runtimeError?.split('\n')[0] ?? '';
  const updateError =
    updateState.status === 'error' || updateState.status === 'unavailable'
      ? updateMessage
      : null;
  const executionError =
    executionCapability && !userscriptExecutionAvailable(executionCapability)
      ? executionCapability.message
      : null;
  const previewMedia =
    coverPresentation?.media.kind === 'image'
      ? ({
          kind: 'image',
          imageUrl: coverPresentation.media.image,
        } as const)
      : coverPresentation?.media.kind === 'video' &&
          isUserscriptCoverVideoDataUrl(coverPresentation.media.video)
        ? ({
            kind: 'video',
            videoUrl: coverPresentation.media.video,
            posterImageUrl: coverPresentation.media.poster,
          } as const)
        : resolvedCardMedia;
  const dialogStatus = executionError
    ? { label: t('cm_manage_board_label_17'), tone: 'error' as const }
    : runtimeError
      ? { label: t('cm_manage_board_label_18'), tone: 'error' as const }
      : item.manager.enabled
        ? { label: t('cm_manage_board_label_19'), tone: 'active' as const }
        : { label: t('cm_manage_board_label_20'), tone: 'inactive' as const };

  return (
    <UiDialog
      ariaLabel={t('cm_manage_board_text_21', [
        String(userscriptDisplayName(item.metadata)),
      ])}
      title={t('cm_manage_board_title_22')}
      status={dialogStatus}
      onClose={onClose}
      footer={
        <>
          <UiButton onClick={onClose}>{t('cm_manage_board_text_23')}</UiButton>
          <UiButton
            variant="primary"
            disabled={coverBusy !== null}
            onClick={() => {
              const error = onSave({
                name,
                description,
                coverPresentation,
                source,
                checkForUpdates,
                userMatches: ruleLines(userMatches),
                userIncludes: ruleLines(userIncludes),
                userExcludeMatches: ruleLines(userExcludeMatches),
                userExcludes: ruleLines(userExcludes),
              });
              setSaveError(error);
              if (!error) {
                setUpdateState({ status: 'idle' });
                onClose();
              }
            }}
          >
            {t('cm_manage_board_text_24')}
          </UiButton>
        </>
      }
    >
      <div className="manager-management-workspace">
        {executionError ? (
          <CardStatusNotice
            tone="error"
            status={t('cm_manage_board_status_25')}
            title={t('cm_manage_board_title_26')}
            description={executionError}
            copyText={executionError}
          />
        ) : runtimeError ? (
          <>
            <CardStatusNotice
              tone="error"
              status={t('cm_manage_board_status_27')}
              title={t('cm_manage_board_title_28')}
              description={runtimeErrorSummary}
              copyText={runtimeError}
            />
            <details className="manager-runtime-diagnostic" open>
              <summary>{t('cm_manage_board_text_29')}</summary>
              <pre>{runtimeError}</pre>
            </details>
          </>
        ) : null}

        <section
          className="manager-management-section manager-card-identity-section"
          aria-labelledby={`manager-identity-title-${item.id}`}
        >
          <header className="manager-section-heading">
            <strong id={`manager-identity-title-${item.id}`}>
              {t('cm_manage_board_text_30')}
            </strong>
            <p>{t('cm_manage_board_text_31')}</p>
          </header>
          <div className="manager-card-identity-editor">
            <div className="manager-card-copy-fields">
              <UiTextField
                label={t('cm_manage_board_label_32')}
                value={name}
                maxLength={MAX_EDITABLE_USERSCRIPT_NAME_LENGTH}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <UiTextArea
                className="manager-script-description-field"
                label={t('cm_manage_board_label_33')}
                value={description}
                rows={2}
                maxLength={MAX_EDITABLE_USERSCRIPT_DESCRIPTION_LENGTH}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </div>
            <div className="manager-cover-workspace">
              <div className="manager-cover-editor">
                <span className="manager-cover-editor__label">
                  {t('cm_manage_board_text_34')}
                </span>
                <div
                  className="manager-cover-preview"
                  role="img"
                  aria-label={t('cm_manage_board_aria_label_35')}
                >
                  {previewMedia.kind === 'image' ? (
                    <img src={previewMedia.imageUrl} alt="" />
                  ) : (
                    <video
                      src={previewMedia.videoUrl}
                      poster={previewMedia.posterImageUrl}
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                  )}
                  <UiLoader
                    visible={coverBusy === 'generate'}
                    className="manager-cover-generation-loader"
                    label={t('cm_manage_board_label_36')}
                  />
                </div>
                <input
                  ref={coverInputRef}
                  className="manager-cover-file-input"
                  type="file"
                  accept="image/*,video/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) void uploadCover(file);
                  }}
                />
                <div className="manager-cover-upload-row">
                  <UiButton
                    disabled={coverBusy !== null}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <Upload size={14} aria-hidden="true" />
                    {coverBusy === 'upload'
                      ? t('cm_manage_board_text_37')
                      : t('cm_manage_board_text_38')}
                  </UiButton>
                  <small>{t('cm_manage_board_text_39')}</small>
                </div>
              </div>
              <div className="manager-card-copy-editor">
                <UiTextArea
                  label={t('cm_manage_board_label_40')}
                  hint={t('cm_manage_board_hint_41')}
                  value={coverPrompt}
                  rows={5}
                  maxLength={MAX_USERSCRIPT_COVER_PROMPT_LENGTH}
                  placeholder={t('cm_manage_board_placeholder_42')}
                  onChange={(event) =>
                    setCoverPrompt(event.currentTarget.value)
                  }
                />
                <UiToggle
                  label={t('cm_manage_board_label_43')}
                  description={t('cm_manage_board_description_44')}
                  checked={injectDefaultStyle}
                  disabled={coverBusy !== null}
                  onChange={setInjectDefaultStyle}
                />
                <div className="manager-cover-actions">
                  <UiButton
                    variant="primary"
                    disabled={
                      coverBusy !== null ||
                      coverServiceState === 'checking' ||
                      !coverPrompt.trim()
                    }
                    onClick={() => void generateCover()}
                  >
                    <Sparkles size={14} aria-hidden="true" />
                    {coverBusy === 'generate'
                      ? t('cm_manage_board_text_45')
                      : t('cm_manage_board_text_46')}
                  </UiButton>
                </div>
              </div>
            </div>
          </div>
          {coverError && (
            <div className="manager-runtime-error">
              <p>{coverError}</p>
              {coverNeedsConfiguration && (
                <UiButton onClick={() => void openAiSettings()}>
                  <Settings size={14} aria-hidden="true" />
                  {t('cm_manage_board_text_47')}
                </UiButton>
              )}
              <DiagnosticCopyButton text={coverError} />
            </div>
          )}
        </section>

        <section
          className="manager-management-section manager-update-section"
          aria-labelledby={`manager-update-title-${item.id}`}
        >
          <header className="manager-section-heading">
            <strong id={`manager-update-title-${item.id}`}>
              {t('cm_manage_board_text_48')}
            </strong>
            <p>{t('cm_manage_board_text_49')}</p>
          </header>
          <UiToggle
            label={t('cm_manage_board_label_50')}
            description={t('cm_manage_board_description_51')}
            checked={checkForUpdates}
            onChange={setCheckForUpdates}
          />
          <div className="manager-update-panel" aria-live="polite">
            <div className="manager-update-status">
              <span>{t('cm_manage_board_text_52')}</span>
              <p>{updateMessage}</p>
              {updateError && <DiagnosticCopyButton text={updateError} />}
            </div>
            <div className="manager-update-actions">
              <UiButton
                disabled={
                  updateState.status === 'checking' ||
                  updateState.status === 'installing'
                }
                onClick={() => void checkUpdate()}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {t('cm_manage_board_text_53')}
              </UiButton>
              {updateState.status === 'available' && (
                <UiButton
                  variant="primary"
                  disabled={!updateState.sourceUrl}
                  onClick={() => void installUpdate(updateState)}
                >
                  <Download size={14} aria-hidden="true" />
                  {t('cm_manage_board_text_54')}
                  {updateState.version}
                </UiButton>
              )}
            </div>
          </div>
        </section>

        <section
          className="manager-management-section"
          aria-labelledby={`manager-rules-title-${item.id}`}
        >
          <header className="manager-section-heading">
            <strong id={`manager-rules-title-${item.id}`}>
              {t('cm_manage_board_text_55')}
            </strong>
            <p>{t('cm_manage_board_text_56')}</p>
          </header>
          <div className="manager-rule-overrides">
            <label htmlFor={`manager-user-match-${item.id}`}>
              <span>{t('cm_manage_board_text_57')}</span>
              <textarea
                id={`manager-user-match-${item.id}`}
                value={userMatches}
                spellCheck={false}
                onChange={(event) => setUserMatches(event.target.value)}
              />
            </label>
            <label htmlFor={`manager-user-include-${item.id}`}>
              <span>{t('cm_manage_board_text_58')}</span>
              <textarea
                id={`manager-user-include-${item.id}`}
                value={userIncludes}
                spellCheck={false}
                onChange={(event) => setUserIncludes(event.target.value)}
              />
            </label>
            <label htmlFor={`manager-user-exclude-match-${item.id}`}>
              <span>{t('cm_manage_board_text_59')}</span>
              <textarea
                id={`manager-user-exclude-match-${item.id}`}
                value={userExcludeMatches}
                spellCheck={false}
                onChange={(event) => setUserExcludeMatches(event.target.value)}
              />
            </label>
            <label htmlFor={`manager-user-exclude-${item.id}`}>
              <span>{t('cm_manage_board_text_60')}</span>
              <textarea
                id={`manager-user-exclude-${item.id}`}
                value={userExcludes}
                spellCheck={false}
                onChange={(event) => setUserExcludes(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section
          className="manager-management-section"
          aria-labelledby={`manager-info-title-${item.id}`}
        >
          <header className="manager-section-heading">
            <strong id={`manager-info-title-${item.id}`}>
              {t('cm_manage_board_text_61')}
            </strong>
            <p>{t('cm_manage_board_text_62')}</p>
          </header>
          <div className="manager-manifest">
            <dl>
              <div>
                <dt>{t('cm_manage_board_text_63')}</dt>
                <dd>{item.metadata.version}</dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_64')}</dt>
                <dd>{item.metadata.author || t('cm_manage_board_text_65')}</dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_66')}</dt>
                <dd>{item.metadata.runAt}</dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_67')}</dt>
                <dd>
                  {item.runtime.status}
                  {item.runtime.pendingRefresh
                    ? t('cm_manage_board_text_68')
                    : ''}
                </dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_69')}</dt>
                <dd>
                  {item.metadata.namespace || '(empty)'} / {item.metadata.name}
                </dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_70')}</dt>
                <dd>{item.source.origin || t('cm_manage_board_text_71')}</dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_72')}</dt>
                <dd>
                  {item.metadata.updateUrl ??
                    item.metadata.downloadUrl ??
                    t('cm_manage_board_text_73')}
                </dd>
              </div>
              <div>
                <dt>{t('cm_manage_board_text_74')}</dt>
                <dd className="manager-manifest-links">
                  {item.metadata.homepageUrl && (
                    <a
                      href={item.metadata.homepageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('cm_manage_board_text_75')}
                    </a>
                  )}
                  {item.metadata.supportUrl && (
                    <a
                      href={item.metadata.supportUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('cm_manage_board_text_76')}
                    </a>
                  )}
                  {!item.metadata.homepageUrl && !item.metadata.supportUrl
                    ? t('cm_manage_board_text_77')
                    : null}
                </dd>
              </div>
            </dl>
            <div className="manager-metadata-groups">
              <MetadataGroup
                title={t('cm_manage_board_title_78')}
                values={[
                  ...item.metadata.matches.map((rule) => `@match ${rule}`),
                  ...item.metadata.includes.map((rule) => `@include ${rule}`),
                ]}
              />
              <MetadataGroup
                title={t('cm_manage_board_title_79')}
                values={[
                  ...item.metadata.excludeMatches.map(
                    (rule) => `@exclude-match ${rule}`,
                  ),
                  ...item.metadata.excludes.map((rule) => `@exclude ${rule}`),
                ]}
              />
              <MetadataGroup
                title={t('cm_manage_board_title_80')}
                values={
                  item.metadata.grants.length > 0
                    ? item.metadata.grants
                    : ['none']
                }
              />
              <MetadataGroup
                title={t('cm_manage_board_title_81')}
                values={item.metadata.requires}
              />
              <MetadataGroup
                title={t('cm_manage_board_title_82')}
                values={Object.entries(item.metadata.resources).map(
                  ([name, url]) => `${name} ${url}`,
                )}
              />
              <MetadataGroup
                title={t('cm_manage_board_title_83')}
                values={item.metadata.connects}
              />
              <MetadataGroup
                title={t('cm_manage_board_title_84')}
                values={Object.entries(item.metadata.localized).flatMap(
                  ([locale, values]) => [
                    ...(values.name ? [`@name:${locale} ${values.name}`] : []),
                    ...(values.description
                      ? [`@description:${locale} ${values.description}`]
                      : []),
                  ],
                )}
              />
            </div>
          </div>
        </section>

        <UserscriptSourcePanel
          source={source}
          editable
          editorId={`manager-source-${item.id}`}
          onChange={setSource}
          onDownload={() => onExport(item, source)}
          publicationUrl={userscriptPublicationPageUrl(item)}
        />
        {saveError && (
          <div className="manager-runtime-error">
            <p>{saveError}</p>
            <DiagnosticCopyButton text={saveError} />
          </div>
        )}
      </div>
    </UiDialog>
  );
}
