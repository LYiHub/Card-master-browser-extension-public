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
  return (values.length > 0 ? values : ['未声明']).map((value) => {
    const occurrence = (occurrences.get(value) ?? 0) + 1;
    occurrences.set(value, occurrence);
    return { key: `${value}:${occurrence}`, value };
  });
}

function MetadataGroup({
  title,
  values,
}: {
  title: string;
  values: readonly string[];
}) {
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
              current?.startsWith('OpenAI 兼容图像服务尚未配置')
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
        reason: '源码存在未保存修改，请先保存或重新打开管理页。',
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
        `AI API 密钥尚未配置，且无法自动打开设置：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  const generateCover = async () => {
    const prompt = coverPrompt.trim();
    if (!prompt) {
      setCoverError('请输入封面生图提示词。');
      return;
    }
    if (coverServiceState === 'missing') {
      setCoverNeedsConfiguration(true);
      setCoverError(
        'AI API 密钥尚未配置。已打开卡牌大师智能体，请在“设置”中完成配置后重试。',
      );
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
        setCoverError(
          'AI API 密钥尚未配置。请打开卡牌大师智能体，在“设置”中完成配置后重试。',
        );
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
          ? '尚未检查远端版本。'
          : '未配置更新地址。';
      case 'checking':
        return '正在检查远端版本信息...';
      case 'disabled':
        return '自动检查已关闭，仍可手动检查。';
      case 'unavailable':
      case 'error':
        return updateState.reason;
      case 'current':
        return `当前已是最新版本 v${updateState.version}。`;
      case 'available':
        return updateState.sourceUrl
          ? `发现新版本 v${updateState.version}，身份校验已通过。`
          : `发现新版本 v${updateState.version}，但未配置可下载的脚本源码地址。`;
      case 'installing':
        return '正在下载并校验更新...';
      case 'installed':
        return `已安装 v${updateState.version} 并完成应用。`;
    }
  })();
  const runtimeError =
    item.runtime.status === 'error'
      ? (item.runtime.error ?? '脚本运行失败，但运行时没有返回错误详情。')
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
    ? { label: '执行权限未开启', tone: 'error' as const }
    : runtimeError
      ? { label: '运行异常', tone: 'error' as const }
      : item.manager.enabled
        ? { label: '脚本已启用', tone: 'active' as const }
        : { label: '脚本已停用', tone: 'inactive' as const };

  return (
    <UiDialog
      ariaLabel={`${userscriptDisplayName(item.metadata)} 设置`}
      title="脚本设置"
      status={dialogStatus}
      onClose={onClose}
      footer={
        <>
          <UiButton onClick={onClose}>返回牌阵</UiButton>
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
            保存并返回
          </UiButton>
        </>
      }
    >
      <div className="manager-management-workspace">
        {executionError ? (
          <CardStatusNotice
            tone="error"
            status="执行权限未开启"
            title="这张卡牌暂时无法运行"
            description={executionError}
            copyText={executionError}
          />
        ) : runtimeError ? (
          <>
            <CardStatusNotice
              tone="error"
              status="执行异常"
              title="脚本在当前页面运行失败"
              description={runtimeErrorSummary}
              copyText={runtimeError}
            />
            <details className="manager-runtime-diagnostic" open>
              <summary>完整错误与堆栈</summary>
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
              基本信息与封面
            </strong>
            <p>
              图片和视频都会以画面中心自动适配为严格 3:4
              卡面；名称与描述会写回脚本元数据。
            </p>
          </header>
          <div className="manager-card-identity-editor">
            <div className="manager-card-copy-fields">
              <UiTextField
                label="脚本名称"
                value={name}
                maxLength={MAX_EDITABLE_USERSCRIPT_NAME_LENGTH}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <UiTextArea
                className="manager-script-description-field"
                label="脚本描述"
                value={description}
                rows={2}
                maxLength={MAX_EDITABLE_USERSCRIPT_DESCRIPTION_LENGTH}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </div>
            <div className="manager-cover-workspace">
              <div className="manager-cover-editor">
                <span className="manager-cover-editor__label">卡牌封面</span>
                <div
                  className="manager-cover-preview"
                  role="img"
                  aria-label="脚本封面预览"
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
                    label="正在生成卡牌封面"
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
                    {coverBusy === 'upload' ? '正在处理' : '上传图片或视频'}
                  </UiButton>
                  <small>
                    图片会居中裁剪并转为 480×640
                    WebP；视频保留动态画面并生成首帧预览，单个文件不超过 20 MB。
                  </small>
                </div>
              </div>
              <div className="manager-card-copy-editor">
                <UiTextArea
                  label="封面生图提示词"
                  hint="可以使用中文或英文。生成完成后先预览，再保存应用。"
                  value={coverPrompt}
                  rows={5}
                  maxLength={MAX_USERSCRIPT_COVER_PROMPT_LENGTH}
                  placeholder="描述角色、场景、动作和你希望得到的画面……"
                  onChange={(event) =>
                    setCoverPrompt(event.currentTarget.value)
                  }
                />
                <UiToggle
                  label="注入默认卡牌风格"
                  description="勾选后只追加项目统一的明亮手绘奇幻卡牌画风，不限制用户设计的构图和内容。"
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
                    {coverBusy === 'generate' ? '正在生成' : '生成封面'}
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
                  打开 AI 设置
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
            <strong id={`manager-update-title-${item.id}`}>脚本更新</strong>
            <p>自动更新与手动检查使用同一份脚本更新地址。</p>
          </header>
          <UiToggle
            label="自动检查更新"
            description="保存后按全局检查周期读取该脚本的新版本。"
            checked={checkForUpdates}
            onChange={setCheckForUpdates}
          />
          <div className="manager-update-panel" aria-live="polite">
            <div className="manager-update-status">
              <span>版本状态</span>
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
                检查更新
              </UiButton>
              {updateState.status === 'available' && (
                <UiButton
                  variant="primary"
                  disabled={!updateState.sourceUrl}
                  onClick={() => void installUpdate(updateState)}
                >
                  <Download size={14} aria-hidden="true" />
                  安装 v{updateState.version}
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
            <strong id={`manager-rules-title-${item.id}`}>匹配范围覆盖</strong>
            <p>每行填写一条规则；留空时完全使用脚本原有声明。</p>
          </header>
          <div className="manager-rule-overrides">
            <label htmlFor={`manager-user-match-${item.id}`}>
              <span>用户 @match</span>
              <textarea
                id={`manager-user-match-${item.id}`}
                value={userMatches}
                spellCheck={false}
                onChange={(event) => setUserMatches(event.target.value)}
              />
            </label>
            <label htmlFor={`manager-user-include-${item.id}`}>
              <span>用户 @include</span>
              <textarea
                id={`manager-user-include-${item.id}`}
                value={userIncludes}
                spellCheck={false}
                onChange={(event) => setUserIncludes(event.target.value)}
              />
            </label>
            <label htmlFor={`manager-user-exclude-match-${item.id}`}>
              <span>用户 @exclude-match</span>
              <textarea
                id={`manager-user-exclude-match-${item.id}`}
                value={userExcludeMatches}
                spellCheck={false}
                onChange={(event) => setUserExcludeMatches(event.target.value)}
              />
            </label>
            <label htmlFor={`manager-user-exclude-${item.id}`}>
              <span>用户 @exclude</span>
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
            <strong id={`manager-info-title-${item.id}`}>脚本信息</strong>
            <p>当前安装版本、运行声明与外部资源。</p>
          </header>
          <div className="manager-manifest">
            <dl>
              <div>
                <dt>版本</dt>
                <dd>{item.metadata.version}</dd>
              </div>
              <div>
                <dt>作者</dt>
                <dd>{item.metadata.author || '未声明'}</dd>
              </div>
              <div>
                <dt>运行时机</dt>
                <dd>{item.metadata.runAt}</dd>
              </div>
              <div>
                <dt>当前状态</dt>
                <dd>
                  {item.runtime.status}
                  {item.runtime.pendingRefresh ? ' · 需要刷新' : ''}
                </dd>
              </div>
              <div>
                <dt>脚本身份</dt>
                <dd>
                  {item.metadata.namespace || '(empty)'} / {item.metadata.name}
                </dd>
              </div>
              <div>
                <dt>安装来源</dt>
                <dd>{item.source.origin || '本地创建或导入'}</dd>
              </div>
              <div>
                <dt>更新地址</dt>
                <dd>
                  {item.metadata.updateUrl ??
                    item.metadata.downloadUrl ??
                    '未配置更新地址'}
                </dd>
              </div>
              <div>
                <dt>项目链接</dt>
                <dd className="manager-manifest-links">
                  {item.metadata.homepageUrl && (
                    <a
                      href={item.metadata.homepageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      主页
                    </a>
                  )}
                  {item.metadata.supportUrl && (
                    <a
                      href={item.metadata.supportUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      支持
                    </a>
                  )}
                  {!item.metadata.homepageUrl && !item.metadata.supportUrl
                    ? '未声明'
                    : null}
                </dd>
              </div>
            </dl>
            <div className="manager-metadata-groups">
              <MetadataGroup
                title="脚本匹配"
                values={[
                  ...item.metadata.matches.map((rule) => `@match ${rule}`),
                  ...item.metadata.includes.map((rule) => `@include ${rule}`),
                ]}
              />
              <MetadataGroup
                title="脚本排除"
                values={[
                  ...item.metadata.excludeMatches.map(
                    (rule) => `@exclude-match ${rule}`,
                  ),
                  ...item.metadata.excludes.map((rule) => `@exclude ${rule}`),
                ]}
              />
              <MetadataGroup
                title="权限"
                values={
                  item.metadata.grants.length > 0
                    ? item.metadata.grants
                    : ['none']
                }
              />
              <MetadataGroup title="依赖" values={item.metadata.requires} />
              <MetadataGroup
                title="资源"
                values={Object.entries(item.metadata.resources).map(
                  ([name, url]) => `${name} ${url}`,
                )}
              />
              <MetadataGroup title="跨域范围" values={item.metadata.connects} />
              <MetadataGroup
                title="本地化文案"
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
