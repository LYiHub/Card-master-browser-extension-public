import {
  GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
  GLOBAL_LIBRARY_DISPOSE_EVENT,
  GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
  GLOBAL_LIBRARY_HOST_ID,
  GLOBAL_LIBRARY_OPEN_EVENT,
} from '../../features/global-library/lifecycle';
import { gsap } from '../../motion/gsap';
import {
  buildDailyReviewWallpaperGallery,
  DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY,
  DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY,
  DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY,
  type DailyReviewWallpaperGalleryItem,
  type DailyReviewWallpaperGallerySelection,
  normalizeDailyReviewWallpaperGallerySelection,
  resolveDailyReviewWallpaperGallerySelection,
} from '../../new-tab/application/daily-review-wallpaper';
import {
  createPhotoFrameIdleController,
  NEW_TAB_DAILY_REVIEW_SURFACE_CLASS,
  NEW_TAB_PHOTO_FRAME_ATTRIBUTE,
  NEW_TAB_PHOTO_FRAME_CONTROLS_HIDE_MS,
  NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE,
  NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE_ID,
  NEW_TAB_PHOTO_FRAME_OUTER_STYLE,
  NEW_TAB_PHOTO_FRAME_OUTER_STYLE_ID,
  NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS,
  NEW_TAB_PHOTO_FRAME_STAGE_CLASS,
  type PhotoFrameIdleTrigger,
  photoFrameFullscreenButtonPresentation,
  photoFrameIdleBlockReason,
  resolvePhotoFrameWallpaperVisual,
} from '../../new-tab/application/photo-frame-runtime';
import {
  LUMNO_LOCAL_WALLPAPER_STORAGE_KEY,
  LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY,
  LUMNO_WALLPAPER_EFFECT_STORAGE_KEY,
  LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY,
  LUMNO_WALLPAPER_STORAGE_KEY,
  NEW_TAB_PREFERENCES_STORAGE_KEY,
  NEW_TAB_SYNC_STORAGE_KEY,
  type NewTabPreferences,
  NewTabPreferencesRepository,
  type NewTabWallpaperSource,
} from '../../new-tab/application/preferences';
import {
  type ExtensionApi,
  type ExtensionMessageListener,
  requireExtensionApi,
} from './api';
import { ExtensionDailyReviewWallpaperSettingsController } from './daily-review-wallpaper-settings';
import {
  DailyReviewWallpaperHistoryRepository,
  DailyReviewWallpaperImageRepository,
  DailyReviewWallpaperStateRepository,
} from './daily-review-wallpaper-storage';
import { reportExtensionFailure } from './diagnostics';
import {
  isExtensionPageGlobalLibraryDeliveryMessage,
  markGlobalLibraryInjection,
  signalInjectedGlobalLibraryHost,
} from './global-library-host';

const NEW_TAB_TITLE = '新标签页';
const CARD_MASTER_BRAND_NAME = '卡牌大师';
const CARD_MASTER_LOGO_PATH =
  'project-assets/userscript-deck/visual/action-icons/card-master-logo.png';
const DOCUMENT_ICON_ATTRIBUTE = 'data-card-master-new-tab-icon';
const EMBEDDED_BRANDING_STYLE_ID = 'card-master-new-tab-branding';
const EMBEDDED_WORDMARK_ID = '_x_extension_newtab_wordmark_2026_unique_';
const DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE =
  'data-card-master-daily-review-wallpaper';
const LUMNO_WALLPAPER_TRANSITION_CLASS = 'x-nt-wallpaper-transition-layer';
const LUMNO_WALLPAPER_TRANSITION_MS = 220;
const UPSTREAM_VISIBLE_SELECTORS = [
  '.x-nt-feedback-control',
  '.x-lumno-feature-hint--update-notice-newtab',
  '.x-lumno-feature-hint--engagement-notice',
].join(',');
const UPSTREAM_HOSTS = new Set([
  'lumno.kubai.design',
  'github.com',
  'x.com',
  'chromewebstore.google.com',
]);

function cardMasterLogoUrl(api: ExtensionApi) {
  return api.runtime.getURL(CARD_MASTER_LOGO_PATH);
}

function applyDocumentBranding(document: Document, logoUrl: string) {
  if (document.title !== NEW_TAB_TITLE) document.title = NEW_TAB_TITLE;
  const relations = ['icon', 'shortcut icon'] as const;
  document.head
    .querySelectorAll<HTMLLinkElement>(
      `link[rel~="icon"]:not([${DOCUMENT_ICON_ATTRIBUTE}])`,
    )
    .forEach((icon) => {
      icon.remove();
    });
  for (const relation of relations) {
    let icon = document.head.querySelector<HTMLLinkElement>(
      `link[${DOCUMENT_ICON_ATTRIBUTE}="${relation}"]`,
    );
    if (!icon) {
      icon = document.createElement('link');
      icon.setAttribute(DOCUMENT_ICON_ATTRIBUTE, relation);
      document.head.append(icon);
    }
    if (icon.rel !== relation) icon.rel = relation;
    if (icon.type !== 'image/png') icon.type = 'image/png';
    if (icon.hasAttribute('sizes')) icon.removeAttribute('sizes');
    if (icon.href !== logoUrl) icon.href = logoUrl;
  }
}

function applyEmbeddedWordmark(document: Document, logoUrl: string) {
  let style = document.getElementById(EMBEDDED_BRANDING_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = EMBEDDED_BRANDING_STYLE_ID;
    style.textContent = `
      #${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand {
        width: 92px !important;
        height: 92px !important;
        gap: 0 !important;
        color: transparent !important;
        cursor: default !important;
        font-size: 0 !important;
        font-weight: 400 !important;
        letter-spacing: 0 !important;
        line-height: 1 !important;
        pointer-events: none !important;
      }
      #${EMBEDDED_WORDMARK_ID}[data-visible="true"]:has(> .x-nt-wordmark-brand) {
        height: 92px !important;
        max-height: 92px !important;
        overflow: visible !important;
      }
      #${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand::before {
        width: 92px;
        height: 92px;
        flex: 0 0 92px;
        background: url("${logoUrl}") center / contain no-repeat;
        content: "";
      }
      #${EMBEDDED_WORDMARK_ID} .x-nt-wordmark-image,
      #${EMBEDDED_WORDMARK_ID} .x-nt-wordmark-solid {
        display: none !important;
      }
      ${UPSTREAM_VISIBLE_SELECTORS},
      a[href*="lumno.kubai.design"],
      a[href*="github.com/kubai087/lumno-extension"],
      a[href*="x.com/kubai087"],
      a[href*="chromewebstore.google.com/detail/lumno-"] {
        display: none !important;
      }
    `;
    document.head.append(style);
  }
  const wordmark = document.querySelector<HTMLElement>(
    `#${EMBEDDED_WORDMARK_ID} > .x-nt-wordmark-brand`,
  );
  if (wordmark?.getAttribute('aria-label') !== CARD_MASTER_BRAND_NAME) {
    wordmark?.setAttribute('aria-label', CARD_MASTER_BRAND_NAME);
  }
  if (wordmark && wordmark.tabIndex !== -1) wordmark.tabIndex = -1;
}

function upstreamUrl(value: string) {
  try {
    const url = new URL(value);
    if (!UPSTREAM_HOSTS.has(url.hostname)) return false;
    if (url.hostname === 'github.com') {
      return url.pathname.startsWith('/kubai087/lumno-extension');
    }
    if (url.hostname === 'x.com') return url.pathname.startsWith('/kubai087');
    if (url.hostname === 'chromewebstore.google.com') {
      return url.pathname.includes('/lumno-');
    }
    return true;
  } catch {
    return false;
  }
}

function replaceVisibleUpstreamBranding(document: Document) {
  for (const element of document.querySelectorAll<HTMLElement>(
    '[aria-label],[title],[data-tooltip],[alt]',
  )) {
    for (const attribute of ['aria-label', 'title', 'data-tooltip', 'alt']) {
      const value = element.getAttribute(attribute);
      if (!value || !/lumno/iu.test(value)) continue;
      element.setAttribute(
        attribute,
        value.replace(/lumno/giu, CARD_MASTER_BRAND_NAME),
      );
    }
  }
  if (!document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (
      parent &&
      parent.tagName !== 'SCRIPT' &&
      parent.tagName !== 'STYLE' &&
      /lumno/iu.test(node.textContent ?? '')
    ) {
      node.textContent = (node.textContent ?? '').replace(
        /lumno/giu,
        CARD_MASTER_BRAND_NAME,
      );
    }
    node = walker.nextNode();
  }
}

function removeVisibleUpstreamTraces(document: Document) {
  document.querySelectorAll(UPSTREAM_VISIBLE_SELECTORS).forEach((element) => {
    element.remove();
  });
  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    if (upstreamUrl(anchor.href)) anchor.remove();
  });
  replaceVisibleUpstreamBranding(document);
}

function installEmbeddedNewTabBranding(
  frame: HTMLIFrameElement,
  logoUrl: string,
) {
  let observer: MutationObserver | null = null;
  frame.addEventListener('load', () => {
    observer?.disconnect();
    const document = frame.contentDocument;
    if (!document?.head || !document.documentElement) return;
    const apply = () => {
      applyDocumentBranding(document, logoUrl);
      applyEmbeddedWordmark(document, logoUrl);
      removeVisibleUpstreamTraces(document);
    };
    apply();
    observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['aria-label', 'href'],
      childList: true,
      subtree: true,
    });
  });
}

function ensureStyle(document: Document, id: string, stylesheet: string) {
  let style = document.getElementById(id);
  if (style?.tagName === 'STYLE') return style;
  style?.remove();
  style = document.createElement('style');
  style.id = id;
  style.textContent = stylesheet;
  document.head.append(style);
  return style;
}

type WallpaperSourceControl = {
  dispose(): void;
  update(
    source: NewTabWallpaperSource,
    status: string,
    imageDataUrl?: string,
  ): void;
};

function createWallpaperSourceControl(
  document: Document,
  onSelect: (source: NewTabWallpaperSource) => Promise<void>,
  settingsUrl: string,
): WallpaperSourceControl {
  let source: NewTabWallpaperSource = 'default';
  let status = '预设或本地图片';
  let section: HTMLElement | null = null;
  let root: HTMLElement | null = null;
  let tabs: HTMLElement | null = null;
  let defaultPanel: HTMLElement | null = null;
  let dailyReviewPanel: HTMLElement | null = null;
  let statusElement: HTMLElement | null = null;
  let dailyReviewDescription: HTMLElement | null = null;
  let dailyReviewPreview: HTMLImageElement | null = null;
  let imageDataUrl = '';
  let buttons: HTMLButtonElement[] = [];
  let disposed = false;

  const render = () => {
    if (!section || !root || !tabs || !defaultPanel || !dailyReviewPanel) {
      return;
    }
    section.dataset.cardMasterWallpaperSource = source;
    defaultPanel.dataset.visible = source === 'default' ? 'true' : 'false';
    defaultPanel.setAttribute(
      'aria-hidden',
      source === 'default' ? 'false' : 'true',
    );
    tabs.dataset.source = source;
    dailyReviewPanel.dataset.visible =
      source === 'daily-review' ? 'true' : 'false';
    dailyReviewPanel.setAttribute(
      'aria-hidden',
      source === 'daily-review' ? 'false' : 'true',
    );
    if (statusElement) statusElement.textContent = status;
    if (dailyReviewDescription) dailyReviewDescription.textContent = status;
    if (dailyReviewPreview) {
      if (imageDataUrl && dailyReviewPreview.src !== imageDataUrl) {
        dailyReviewPreview.src = imageDataUrl;
      } else if (!imageDataUrl) {
        dailyReviewPreview.removeAttribute('src');
      }
      dailyReviewPreview.dataset.visible = imageDataUrl ? 'true' : 'false';
    }
    for (const button of buttons) {
      const selected = button.dataset.source === source;
      button.dataset.active = selected ? 'true' : 'false';
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    }
  };

  const sourceButton = (
    label: string,
    value: NewTabWallpaperSource,
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.className = 'x-nt-wallpaper-tab cm-new-tab-wallpaper-source__button';
    button.dataset.source = value;
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.textContent = label;
    button.addEventListener('click', () => {
      if (source === value || buttons.some((entry) => entry.disabled)) return;
      for (const entry of buttons) entry.disabled = true;
      void onSelect(value)
        .catch(() => undefined)
        .finally(() => {
          for (const entry of buttons) entry.disabled = false;
        });
    });
    return button;
  };

  const mount = () => {
    if (disposed || root?.isConnected) return true;
    const enabledToggle = document.querySelector<HTMLInputElement>(
      'input[data-wallpaper-ref="enabledToggle"]',
    );
    const header = enabledToggle?.closest<HTMLElement>(
      '.x-nt-wallpaper-panel-header',
    );
    const nextSection = header?.closest<HTMLElement>('.x-nt-wallpaper-section');
    const body = nextSection?.querySelector<HTMLElement>(
      ':scope > .x-nt-wallpaper-body',
    );
    const effectControl = body?.querySelector<HTMLElement>(
      ':scope > .x-nt-effect-control',
    );
    if (!header || !nextSection || !body || !effectControl) return false;

    section = nextSection;
    root = document.createElement('div');
    root.className = 'cm-new-tab-wallpaper-source';

    const sourceHeader = document.createElement('div');
    sourceHeader.className = 'cm-new-tab-wallpaper-source__header';
    const label = document.createElement('span');
    label.className = 'cm-new-tab-wallpaper-source__label';
    label.textContent = '壁纸来源';
    statusElement = document.createElement('span');
    statusElement.className = 'cm-new-tab-wallpaper-source__status';
    sourceHeader.append(label, statusElement);

    tabs = document.createElement('div');
    tabs.className = 'x-nt-wallpaper-tabs cm-new-tab-wallpaper-source__tabs';
    tabs.setAttribute('aria-label', '壁纸来源');
    tabs.setAttribute('role', 'tablist');
    const tabsIndicator = document.createElement('span');
    tabsIndicator.className =
      'x-nt-wallpaper-tabs-indicator cm-new-tab-wallpaper-source__indicator';
    tabsIndicator.setAttribute('aria-hidden', 'true');
    buttons = [
      sourceButton('默认壁纸', 'default'),
      sourceButton('AI 壁纸', 'daily-review'),
    ];
    tabs.append(tabsIndicator, ...buttons);
    root.append(sourceHeader, tabs);
    header.after(root);

    defaultPanel = document.createElement('div');
    defaultPanel.className =
      'cm-new-tab-wallpaper-source-panel cm-new-tab-wallpaper-source-panel--default';
    const defaultInner = document.createElement('div');
    defaultInner.className = 'cm-new-tab-wallpaper-source-panel__inner';
    for (const child of [...body.children]) {
      if (child !== effectControl) defaultInner.append(child);
    }
    defaultPanel.append(defaultInner);

    dailyReviewPanel = document.createElement('div');
    dailyReviewPanel.className =
      'cm-new-tab-wallpaper-source-panel cm-new-tab-wallpaper-source-panel--daily-review';
    const dailyReviewInner = document.createElement('div');
    dailyReviewInner.className = 'cm-new-tab-wallpaper-source-panel__inner';
    const dailyReviewTitle = document.createElement('strong');
    dailyReviewTitle.textContent = 'AI 每日回顾壁纸';
    dailyReviewDescription = document.createElement('span');
    dailyReviewDescription.className =
      'cm-new-tab-wallpaper-source-panel__description';
    dailyReviewPreview = document.createElement('img');
    dailyReviewPreview.alt = '';
    dailyReviewPreview.className = 'cm-new-tab-wallpaper-source-panel__preview';
    dailyReviewPreview.decoding = 'async';
    dailyReviewPreview.dataset.visible = 'false';
    const settingsLink = document.createElement('a');
    settingsLink.className =
      'x-nt-appearance-more-settings cm-new-tab-wallpaper-source-panel__settings-link';
    settingsLink.href = settingsUrl;
    settingsLink.rel = 'noreferrer';
    settingsLink.target = '_blank';
    settingsLink.setAttribute('aria-label', '前往完整壁纸设置');
    const settingsLinkText = document.createElement('span');
    settingsLinkText.textContent = '前往完整壁纸设置';
    const settingsLinkIcon = document.createElement('span');
    settingsLinkIcon.className = 'x-nt-appearance-more-settings-icon';
    settingsLinkIcon.append(remixIcon(document, 'ri-arrow-right-line'));
    settingsLink.append(settingsLinkText, settingsLinkIcon);
    dailyReviewInner.append(
      dailyReviewPreview,
      dailyReviewTitle,
      dailyReviewDescription,
      settingsLink,
    );
    dailyReviewPanel.append(dailyReviewInner);

    body.insertBefore(defaultPanel, effectControl);
    body.insertBefore(dailyReviewPanel, effectControl);
    render();
    return true;
  };

  const observer = new MutationObserver(() => void mount());
  mount();
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return {
    dispose() {
      disposed = true;
      observer.disconnect();
      section?.removeAttribute('data-card-master-wallpaper-source');
      const body = defaultPanel?.parentElement;
      const effectControl = body?.querySelector(
        ':scope > .x-nt-effect-control',
      );
      const defaultInner = defaultPanel?.firstElementChild;
      if (body && effectControl && defaultInner) {
        for (const child of [...defaultInner.children]) {
          body.insertBefore(child, effectControl);
        }
      }
      defaultPanel?.remove();
      dailyReviewPanel?.remove();
      root?.remove();
    },
    update(nextSource, nextStatus, nextImageDataUrl = '') {
      source = nextSource;
      status = nextStatus;
      imageDataUrl = nextImageDataUrl;
      if (mount()) render();
    },
  };
}

type PhotoFrameMode = 'off' | 'automatic' | 'manual';

type DailyReviewContent = {
  finalPrompt: string;
  generationId: string;
  imageDataUrl: string;
  showPrompt: boolean;
  sourceDate: string;
  status: 'ready' | 'generating';
  summary: string;
};

type DailyReviewSurface = {
  details: HTMLDetailsElement;
  element: HTMLElement;
  fullscreenButton: HTMLButtonElement;
  collapseDetails(): void;
  setPhotoFrameActive(active: boolean): void;
  update(content: DailyReviewContent | null): void;
};

type PhotoFrameStage = {
  element: HTMLElement;
  latestButton: HTMLButtonElement;
  navigation: HTMLElement;
  nextButton: HTMLButtonElement;
  previousButton: HTMLButtonElement;
  setControlsVisible(visible: boolean): void;
  updateNavigation(options: {
    hasNext: boolean;
    hasPrevious: boolean;
    isLatest: boolean;
  }): void;
};

function reviewDateLabel(sourceDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(sourceDate);
  if (!match) return `${sourceDate} 回顾`;
  return `${Number(match[2])}月${Number(match[3])}日回顾`;
}

function reviewContentTitle(content: DailyReviewContent) {
  if (content.status === 'generating') {
    return content.sourceDate
      ? `正在生成新回顾 · 当前展示${reviewDateLabel(content.sourceDate)}`
      : '正在生成每日回顾';
  }
  return reviewDateLabel(content.sourceDate);
}

function remixIcon(document: Document, name: string) {
  const icon = document.createElement('i');
  icon.className = `ri-icon ri-size-16 ${name}`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function dailyReviewPromptLines(value: string) {
  const lines = value
    .trim()
    .split(/\n+/u)
    .flatMap(
      (paragraph) =>
        paragraph.match(/[^。！？；!?]+[。！？；!?]?/gu) ?? [paragraph],
    )
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : value.trim() ? [value.trim()] : [];
}

async function copyText(document: Document, value: string) {
  const clipboard = document.defaultView?.navigator.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器未完成提示词复制。');
}

function createDailyReviewSurface(document: Document): DailyReviewSurface {
  const element = document.createElement('aside');
  element.className = NEW_TAB_DAILY_REVIEW_SURFACE_CLASS;
  element.dataset.emphasis = 'false';
  element.dataset.promptVisible = 'true';
  element.dataset.visible = 'false';
  element.inert = true;
  element.setAttribute('aria-label', '每日浏览回顾');
  element.setAttribute('aria-hidden', 'true');

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  const title = document.createElement('strong');
  const excerpt = document.createElement('span');
  const detailsChevron = remixIcon(document, 'ri-arrow-down-s-line');
  const syncDetailsState = () => {
    summary.title = details.open ? '收起每日回顾' : '展开每日回顾';
  };
  summary.append(title, excerpt, detailsChevron);
  details.append(summary);
  details.addEventListener('toggle', syncDetailsState);
  syncDetailsState();

  const detailsContent = document.createElement('div');
  detailsContent.className = `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__details`;
  const promptHeader = document.createElement('div');
  promptHeader.className = `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-header`;
  const promptLabel = document.createElement('strong');
  promptLabel.className = `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-label`;
  promptLabel.textContent = '生成提示词';
  const copyPromptButton = document.createElement('button');
  copyPromptButton.className = `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__copy-prompt`;
  copyPromptButton.type = 'button';
  copyPromptButton.disabled = true;
  copyPromptButton.title = '复制完整生成提示词';
  copyPromptButton.setAttribute('aria-label', '复制完整生成提示词');
  const copyPromptIcon = remixIcon(document, 'ri-file-copy-line');
  copyPromptButton.append(copyPromptIcon);
  promptHeader.append(promptLabel, copyPromptButton);
  const prompt = document.createElement('div');
  prompt.className = `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt`;
  prompt.setAttribute('aria-label', '完整生成提示词');
  let promptValue = '';
  let copyFeedbackTimer = 0;
  const renderPrompt = (value: string) => {
    promptValue = value;
    prompt.replaceChildren(
      ...dailyReviewPromptLines(value).map((line, index) => {
        const lineElement = document.createElement('span');
        lineElement.className = `${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}__prompt-line`;
        lineElement.style.setProperty(
          '--card-master-prompt-line-index',
          String(index),
        );
        lineElement.textContent = line;
        return lineElement;
      }),
    );
    copyPromptButton.disabled = !promptValue;
  };
  const restoreCopyButton = () => {
    copyPromptButton.title = '复制完整生成提示词';
    copyPromptButton.setAttribute('aria-label', '复制完整生成提示词');
    copyPromptIcon.className = 'ri-icon ri-size-16 ri-file-copy-line';
  };
  copyPromptButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!promptValue) return;
    void copyText(document, promptValue).then(
      () => {
        if (copyFeedbackTimer) {
          document.defaultView?.clearTimeout(copyFeedbackTimer);
        }
        copyPromptButton.title = '已复制';
        copyPromptButton.setAttribute('aria-label', '提示词已复制');
        copyPromptIcon.className = 'ri-icon ri-size-16 ri-check-line';
        copyFeedbackTimer =
          document.defaultView?.setTimeout(() => {
            copyFeedbackTimer = 0;
            restoreCopyButton();
          }, 1_400) ?? 0;
      },
      (error) => {
        copyPromptButton.title = '复制失败';
        reportExtensionFailure(
          'new-tab-entry',
          'daily-review-prompt-copy-failed',
          error,
        );
      },
    );
  });
  detailsContent.append(promptHeader, prompt);
  details.append(detailsContent);

  const fullscreenButton = document.createElement('button');
  fullscreenButton.type = 'button';
  const fullscreenIcon = remixIcon(document, 'ri-fullscreen-line');
  const setPhotoFrameActive = (active: boolean) => {
    const presentation = photoFrameFullscreenButtonPresentation(active);
    fullscreenButton.title = presentation.label;
    fullscreenButton.setAttribute('aria-label', presentation.label);
    fullscreenButton.setAttribute('aria-pressed', String(active));
    fullscreenIcon.className = `ri-icon ri-size-16 ${presentation.icon}`;
  };
  setPhotoFrameActive(false);
  fullscreenButton.append(fullscreenIcon);
  element.append(details, fullscreenButton);
  document.body.append(element);

  return {
    details,
    element,
    fullscreenButton,
    collapseDetails() {
      details.open = false;
    },
    setPhotoFrameActive,
    update(content) {
      if (!content) {
        details.open = false;
        details.hidden = false;
        element.dataset.visible = 'false';
        element.dataset.promptVisible = 'true';
        element.inert = true;
        element.setAttribute('aria-hidden', 'true');
        fullscreenButton.disabled = true;
        setPhotoFrameActive(false);
        title.textContent = '';
        excerpt.textContent = '';
        renderPrompt('');
        restoreCopyButton();
        return;
      }
      if (!content.showPrompt) details.open = false;
      details.hidden = !content.showPrompt;
      element.dataset.promptVisible = String(content.showPrompt);
      title.textContent = reviewContentTitle(content);
      excerpt.textContent =
        content.summary ||
        (content.status === 'generating'
          ? '正在整理新的每日回顾'
          : '每日回顾已生成');
      renderPrompt(content.finalPrompt);
      fullscreenButton.disabled = !content.imageDataUrl;
      element.dataset.visible = 'true';
      element.inert = false;
      element.setAttribute('aria-hidden', 'false');
    },
  };
}

function createPhotoFrameStage(document: Document): PhotoFrameStage {
  const element = document.createElement('section');
  element.className = NEW_TAB_PHOTO_FRAME_STAGE_CLASS;
  element.dataset.active = 'false';
  element.dataset.mode = 'off';
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('aria-label', '电子相框');

  const hint = document.createElement('p');
  hint.className = `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__hint`;
  hint.textContent = '移动鼠标或按键即可返回';

  const navigation = document.createElement('nav');
  navigation.className = `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation`;
  navigation.dataset.visible = 'false';
  navigation.setAttribute('aria-label', '切换每日回顾壁纸');

  const navigationButton = (className: string, label: string, icon: string) => {
    const button = document.createElement('button');
    button.className = `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button ${className}`;
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(remixIcon(document, icon));
    return button;
  };
  const previousButton = navigationButton(
    `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--previous`,
    '查看前一天',
    'ri-arrow-left-s-line',
  );
  const nextButton = navigationButton(
    `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--next`,
    '查看后一天',
    'ri-arrow-right-s-line',
  );
  const latestButton = navigationButton(
    `${NEW_TAB_PHOTO_FRAME_STAGE_CLASS}__navigation-button--latest`,
    '回到最新回顾',
    'ri-calendar-check-line',
  );
  const latestLabel = document.createElement('span');
  latestLabel.textContent = '回到最新';
  latestButton.append(latestLabel);
  navigation.append(previousButton, latestButton, nextButton);

  element.append(hint);
  document.body.append(element, navigation);
  return {
    element,
    latestButton,
    navigation,
    nextButton,
    previousButton,
    setControlsVisible(visible) {
      navigation.dataset.visible = visible ? 'true' : 'false';
    },
    updateNavigation({ hasNext, hasPrevious, isLatest }) {
      previousButton.disabled = !hasPrevious;
      nextButton.disabled = !hasNext;
      latestButton.disabled = isLatest;
    },
  };
}

function visibleNewTabOverlay(document: Document, window: Window) {
  if (
    document.body?.dataset.ntSuggestionsOpen === 'true' ||
    document.body?.dataset.wallpaperPanelOpen === 'true'
  ) {
    return true;
  }
  const selectors = [
    '.x-nt-wallpaper-panel',
    '.x-nt-shortcut-dialog-backdrop',
    '.x-nt-shortcut-context-menu-portal',
    '.x-nt-bookmark-context-menu-portal',
    '.x-nt-section-mode-portal',
    '.x-nt-bookmark-cascade-menu',
    '[role="dialog"]',
    '[role="menu"]',
    '[role="listbox"]',
  ].join(',');
  return [...document.querySelectorAll<HTMLElement>(selectors)].some(
    (element) => elementIsVisible(element, window),
  );
}

const EMBEDDED_BUSINESS_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[tabindex]:not([tabindex="-1"])',
  '#_x_extension_newtab_bookmarks_topbar_2026_unique_',
  '#_x_extension_newtab_root_2024_unique_',
  '#_x_extension_newtab_bookmarks_2024_unique_',
  '#_x_extension_newtab_recent_sites_2024_unique_',
  '.x-nt-shortcuts-section',
  '.x-nt-wallpaper-control',
  `.${NEW_TAB_DAILY_REVIEW_SURFACE_CLASS}`,
].join(',');

const OUTER_BUSINESS_SELECTOR = [
  '#card-master-host',
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function elementIsVisible(element: Element, window: Window) {
  const interactiveElement = element as HTMLElement;
  if (interactiveElement.hidden || interactiveElement.inert) {
    return false;
  }
  if (element.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function pendingNewTabSearchText(document: Document, window: Window) {
  const input = document.getElementById(
    '_x_extension_newtab_search_input_2024_unique_',
  );
  return (
    input?.tagName === 'INPUT' &&
    elementIsVisible(input, window) &&
    Boolean((input as HTMLInputElement).value.trim())
  );
}

function documentHasBusinessFocus(
  document: Document,
  window: Window,
  selector: string,
) {
  const activeElement = document.activeElement;
  if (
    !activeElement ||
    activeElement === document.body ||
    activeElement === document.documentElement ||
    !elementIsVisible(activeElement, window)
  ) {
    return false;
  }
  if (
    activeElement.id === 'card-master-host' &&
    activeElement.shadowRoot?.activeElement
  ) {
    return true;
  }
  const editable =
    activeElement.matches('input, textarea, select') ||
    activeElement.getAttribute('contenteditable') === 'true';
  if (editable) return true;
  try {
    return (
      activeElement.matches(':focus-visible') &&
      Boolean(activeElement.closest(selector))
    );
  } catch {
    return Boolean(activeElement.closest(selector));
  }
}

function eventTargetElement(target: EventTarget | null) {
  if (!target || typeof target !== 'object' || !('nodeType' in target)) {
    return null;
  }
  const node = target as Node;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function eventTargetsBusinessSurface(event: Event, selector: string) {
  const element = eventTargetElement(event.target);
  return Boolean(element?.closest(selector));
}

function eventShowsUserIntent(event: Event) {
  if (!event.isTrusted) return false;
  if (event.type === 'pointermove') {
    const pointer = event as PointerEvent;
    return Math.abs(pointer.movementX) + Math.abs(pointer.movementY) > 0;
  }
  return [
    'change',
    'compositionend',
    'compositionstart',
    'dragend',
    'dragstart',
    'input',
    'keydown',
    'pointercancel',
    'pointerdown',
    'pointerup',
    'touchend',
    'touchmove',
    'touchstart',
    'wheel',
  ].includes(event.type);
}

type PhotoFrameSectionTimelineEntry = {
  delay: number;
  duration: number;
  element: HTMLElement;
  offset: number;
};

function photoFrameSectionTimeline(document: Document) {
  const entries: PhotoFrameSectionTimelineEntry[] = [];
  const add = (
    selector: string,
    delay: number,
    duration: number,
    offset: number,
  ) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      entries.push({ delay, duration, element, offset });
    }
  };
  const addIndexed = (
    selector: string,
    delay: number,
    duration: number,
    offset: number,
  ) => {
    document
      .querySelectorAll<HTMLElement>(selector)
      .forEach((element, index) => {
        entries.push({
          delay: delay + index * 36,
          duration,
          element,
          offset,
        });
      });
  };

  add(
    '#_x_extension_newtab_bookmarks_2024_unique_ .x-nt-bookmarks-header',
    NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.bookmarks,
    560,
    10,
  );
  addIndexed(
    '#_x_extension_newtab_bookmarks_2024_unique_ :is(.x-nt-bookmark-card, .x-nt-bookmark-empty)',
    NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.bookmarks + 60,
    520,
    12,
  );
  add(
    '#_x_extension_newtab_recent_sites_2024_unique_ .x-nt-recent-header-bar',
    NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.recentSites,
    560,
    10,
  );
  addIndexed(
    '#_x_extension_newtab_recent_sites_2024_unique_ :is(.x-nt-recent-card, .x-nt-recent-empty)',
    NEW_TAB_PHOTO_FRAME_SPATIAL_DELAYS.recentSites + 60,
    520,
    12,
  );
  return entries;
}

type DailyReviewGallerySnapshot = {
  content: DailyReviewContent | null;
  index: number;
  items: DailyReviewWallpaperGalleryItem[];
  latestIndex: number;
  selection: DailyReviewWallpaperGallerySelection | null;
};

function sameGallerySelection(
  left: DailyReviewWallpaperGallerySelection | null,
  right: DailyReviewWallpaperGallerySelection | null,
) {
  return (
    left?.selectedGenerationId === right?.selectedGenerationId &&
    left?.latestGenerationId === right?.latestGenerationId
  );
}

async function readDailyReviewGallery(
  preferencesRepository: NewTabPreferencesRepository,
  stateRepository: DailyReviewWallpaperStateRepository,
  historyRepository: DailyReviewWallpaperHistoryRepository,
  imageRepository: DailyReviewWallpaperImageRepository,
  selectionStorage: ExtensionApi['storage']['local'],
): Promise<DailyReviewGallerySnapshot> {
  const [preferences, state, history, storedSelectionValue] = await Promise.all(
    [
      preferencesRepository.read(),
      stateRepository.read(),
      historyRepository.read(),
      selectionStorage
        .get(DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY)
        .then((stored) => stored[DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY]),
    ],
  );
  if (preferences.wallpaperSource !== 'daily-review') {
    return {
      content: null,
      index: -1,
      items: [],
      latestIndex: -1,
      selection: null,
    };
  }

  const items = buildDailyReviewWallpaperGallery(history);
  const storedSelection =
    normalizeDailyReviewWallpaperGallerySelection(storedSelectionValue);
  const resolved = resolveDailyReviewWallpaperGallerySelection(
    items,
    storedSelection,
  );
  if (!resolved) {
    return {
      content:
        state?.status === 'generating'
          ? {
              finalPrompt: '',
              generationId: state.generationId,
              imageDataUrl: '',
              showPrompt: preferences.dailyReviewShowPrompt,
              sourceDate: state.sourceDate ?? '',
              status: 'generating',
              summary: '',
            }
          : null,
      index: -1,
      items,
      latestIndex: -1,
      selection: null,
    };
  }

  if (!sameGallerySelection(storedSelection, resolved.state)) {
    await selectionStorage.set({
      [DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY]: resolved.state,
    });
  }
  const item = items[resolved.index];
  if (!item) {
    throw new Error('每日回顾选择结果超出了可用壁纸范围。');
  }
  const image = await imageRepository.read(item.imageId);
  if (!image) {
    throw new Error('每日回顾已完成，但对应的壁纸图片记录不存在。');
  }
  if (image.sourceDate !== item.sourceDate) {
    throw new Error('每日回顾图片与浏览历史日期不一致。');
  }
  return {
    content: {
      finalPrompt: item.finalPrompt,
      generationId: item.generationId,
      imageDataUrl: image.dataUrl,
      showPrompt: preferences.dailyReviewShowPrompt,
      sourceDate: item.sourceDate,
      status: state?.status === 'generating' ? 'generating' : 'ready',
      summary: item.summary,
    },
    index: resolved.index,
    items,
    latestIndex: resolved.latestIndex,
    selection: resolved.state,
  };
}

function visibleDailyReviewContent(content: DailyReviewContent | null) {
  return content?.finalPrompt || content?.status === 'generating'
    ? content
    : null;
}

type WallpaperLayout = Pick<
  NewTabPreferences,
  'wallpaperFit' | 'wallpaperPosition'
>;

function wallpaperPositionValue(
  position: WallpaperLayout['wallpaperPosition'],
) {
  switch (position) {
    case 'top':
      return 'center top';
    case 'bottom':
      return 'center bottom';
    case 'left':
      return 'left center';
    case 'right':
      return 'right center';
    default:
      return 'center center';
  }
}

function applyWallpaperLayout(
  embeddedDocument: Document,
  layout: WallpaperLayout,
) {
  const root = embeddedDocument.documentElement;
  const size = layout.wallpaperFit;
  const position = wallpaperPositionValue(layout.wallpaperPosition);
  let changed = false;
  if (root.style.getPropertyValue('--x-nt-wallpaper-size') !== size) {
    root.style.setProperty('--x-nt-wallpaper-size', size);
    changed = true;
  }
  if (root.style.getPropertyValue('--x-nt-wallpaper-position') !== position) {
    root.style.setProperty('--x-nt-wallpaper-position', position);
    changed = true;
  }
  return changed;
}

function applyDailyReviewWallpaper(
  embeddedDocument: Document,
  embeddedWindow: Window,
  content: DailyReviewContent,
) {
  const root = embeddedDocument.documentElement;
  const body = embeddedDocument.body;
  const visual = resolvePhotoFrameWallpaperVisual(
    embeddedWindow.getComputedStyle(root),
    embeddedWindow.getComputedStyle(body),
    content.imageDataUrl,
  );
  if (!visual) {
    throw new Error('每日回顾图片无法转换为新标签页壁纸。');
  }
  let changed = false;
  const setImportantStyle = (
    element: HTMLElement,
    name: string,
    value: string,
  ) => {
    if (
      element.style.getPropertyValue(name) === value &&
      element.style.getPropertyPriority(name) === 'important'
    ) {
      return;
    }
    element.style.setProperty(name, value, 'important');
    changed = true;
  };
  setImportantStyle(root, 'background-image', visual.imageCss);
  setImportantStyle(root, 'background-size', visual.size);
  setImportantStyle(root, 'background-position', visual.position);
  setImportantStyle(root, 'background-repeat', 'no-repeat');
  setImportantStyle(root, 'background-attachment', 'fixed');
  setImportantStyle(body, 'background-color', 'transparent');
  setImportantStyle(
    body,
    'background-image',
    'var(--x-nt-wallpaper-overlay, none)',
  );
  setImportantStyle(body, 'background-size', 'cover');
  setImportantStyle(body, 'background-position', 'center center');
  setImportantStyle(body, 'background-repeat', 'no-repeat');
  setImportantStyle(body, 'background-attachment', 'fixed');
  if (!body.hasAttribute(DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE)) {
    body.setAttribute(DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE, 'true');
    changed = true;
  }
  if (root.dataset.wallpaperActive !== 'true') {
    root.dataset.wallpaperActive = 'true';
    changed = true;
  }
  if (body.dataset.wallpaperActive !== 'true') {
    body.dataset.wallpaperActive = 'true';
    changed = true;
  }
  return changed;
}

function clearDailyReviewWallpaper(embeddedDocument: Document) {
  const root = embeddedDocument.documentElement;
  const body = embeddedDocument.body;
  if (!body.hasAttribute(DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE)) return false;
  for (const name of [
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'background-attachment',
  ]) {
    root.style.removeProperty(name);
  }
  for (const name of [
    'background-color',
    'background-image',
    'background-size',
    'background-position',
    'background-repeat',
    'background-attachment',
  ]) {
    body.style.removeProperty(name);
  }
  body.removeAttribute(DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE);
  return true;
}

type WallpaperTransition = {
  clear(): void;
  dispose(): void;
  swap<T>(applyNext: () => T): T;
};

function createWallpaperTransition(
  embeddedDocument: Document,
  embeddedWindow: Window,
): WallpaperTransition {
  let element: HTMLElement | null = null;
  let removalTimer = 0;

  const clear = () => {
    if (removalTimer) embeddedWindow.clearTimeout(removalTimer);
    removalTimer = 0;
    element?.remove();
    element = null;
  };

  const capture = () => {
    clear();
    if (embeddedWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return null;
    }
    const body = embeddedDocument.body;
    const bodyStyle = embeddedWindow.getComputedStyle(body);
    const layer = embeddedDocument.createElement('div');
    layer.className = LUMNO_WALLPAPER_TRANSITION_CLASS;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.backgroundColor = bodyStyle.backgroundColor;
    if (body.hasAttribute(DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE)) {
      const rootStyle = embeddedWindow.getComputedStyle(
        embeddedDocument.documentElement,
      );
      layer.style.backgroundImage = `${bodyStyle.backgroundImage}, ${rootStyle.backgroundImage}`;
      layer.style.backgroundSize = `${bodyStyle.backgroundSize}, ${rootStyle.backgroundSize}`;
      layer.style.backgroundPosition = `${bodyStyle.backgroundPosition}, ${rootStyle.backgroundPosition}`;
      layer.style.backgroundRepeat = `${bodyStyle.backgroundRepeat}, ${rootStyle.backgroundRepeat}`;
    } else {
      layer.style.backgroundImage = bodyStyle.backgroundImage;
      layer.style.backgroundSize = bodyStyle.backgroundSize;
      layer.style.backgroundPosition = bodyStyle.backgroundPosition;
      layer.style.backgroundRepeat = bodyStyle.backgroundRepeat;
    }
    layer.style.backgroundAttachment = 'fixed';
    body.insertBefore(layer, body.firstChild);
    element = layer;
    return layer;
  };

  return {
    clear,
    dispose() {
      clear();
    },
    swap(applyNext) {
      const layer = capture();
      let result: ReturnType<typeof applyNext>;
      try {
        result = applyNext();
      } catch (error) {
        clear();
        throw error;
      }
      if (!layer) return result;
      embeddedWindow.requestAnimationFrame(() => {
        if (element !== layer) return;
        layer.dataset.exit = 'true';
        removalTimer = embeddedWindow.setTimeout(() => {
          if (element === layer) clear();
        }, LUMNO_WALLPAPER_TRANSITION_MS + 80);
      });
      return result;
    },
  };
}

function commitPhotoFrameState(embeddedDocument: Document, active: boolean) {
  const value = active ? 'true' : 'false';
  document.documentElement.setAttribute(NEW_TAB_PHOTO_FRAME_ATTRIBUTE, value);
  embeddedDocument.documentElement.setAttribute(
    NEW_TAB_PHOTO_FRAME_ATTRIBUTE,
    value,
  );
  const deckHost = document.getElementById('card-master-host');
  if (deckHost) deckHost.inert = active;
}

function installPhotoFrameIdleMode(
  frame: HTMLIFrameElement,
  api: ExtensionApi,
  preferencesRepository: NewTabPreferencesRepository,
) {
  ensureStyle(
    document,
    NEW_TAB_PHOTO_FRAME_OUTER_STYLE_ID,
    NEW_TAB_PHOTO_FRAME_OUTER_STYLE,
  );
  document.documentElement.setAttribute(NEW_TAB_PHOTO_FRAME_ATTRIBUTE, 'false');

  let disposeEmbeddedRuntime: (() => void) | null = null;
  const installEmbeddedRuntime = () => {
    disposeEmbeddedRuntime?.();
    disposeEmbeddedRuntime = null;

    const embeddedDocument = frame.contentDocument;
    const embeddedWindow = frame.contentWindow;
    if (
      !embeddedDocument?.head ||
      !embeddedDocument.body ||
      !embeddedDocument.documentElement ||
      !embeddedWindow
    ) {
      return;
    }

    const embeddedRuntime = (
      embeddedWindow as Window & {
        chrome?: { runtime?: { openOptionsPage?: () => Promise<void> } };
      }
    ).chrome?.runtime;
    if (embeddedRuntime) {
      embeddedRuntime.openOptionsPage = () => {
        window.open(api.runtime.getURL('new-tab-settings.html'), '_blank');
        return Promise.resolve();
      };
    }

    ensureStyle(
      embeddedDocument,
      NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE_ID,
      NEW_TAB_PHOTO_FRAME_EMBEDDED_STYLE,
    );
    commitPhotoFrameState(embeddedDocument, false);

    const stage = createPhotoFrameStage(embeddedDocument);
    const reviewSurface = createDailyReviewSurface(embeddedDocument);
    const wallpaperTransition = createWallpaperTransition(
      embeddedDocument,
      embeddedWindow,
    );
    const stateRepository = new DailyReviewWallpaperStateRepository(
      api.storage.local,
    );
    const historyRepository = new DailyReviewWallpaperHistoryRepository(
      api.storage.local,
    );
    const imageRepository = new DailyReviewWallpaperImageRepository();
    const dailyReviewController =
      new ExtensionDailyReviewWallpaperSettingsController(api, imageRepository);
    let wallpaperReadiness: {
      promise: Promise<boolean>;
      url: string;
    } | null = null;
    let currentGallery: DailyReviewWallpaperGalleryItem[] = [];
    let currentGalleryIndex = -1;
    let currentLatestGalleryIndex = -1;
    let currentReview: DailyReviewContent | null = null;
    let dailyReviewSelected = false;
    let automaticControllerEligible = false;
    let wallpaperSourceControl: WallpaperSourceControl | null = null;
    let syncAutomaticPhotoFrameAvailability = () => undefined;
    let updateWallpaperSourceControl = () => undefined;
    let mode: PhotoFrameMode = 'off';
    let reviewSequence = 0;
    let transitionSequence = 0;
    let lastReportedWallpaperFailure = '';
    let manualPhotoFrameRequested = false;
    let controlsHideTimer = 0;
    let wallpaperLayout: WallpaperLayout = {
      wallpaperFit: 'cover',
      wallpaperPosition: 'center',
    };
    const inertStates = new Map<HTMLElement, boolean>();
    const sectionTimelineElements = new Set<HTMLElement>();

    const hidePhotoFrameControls = () => {
      if (controlsHideTimer) {
        embeddedWindow.clearTimeout(controlsHideTimer);
        controlsHideTimer = 0;
      }
      stage.setControlsVisible(false);
      reviewSurface.element.dataset.emphasis = 'false';
      reviewSurface.collapseDetails();
    };

    const showPhotoFrameControls = () => {
      if (mode === 'off') return;
      stage.setControlsVisible(true);
      reviewSurface.element.dataset.emphasis = 'true';
      if (controlsHideTimer) embeddedWindow.clearTimeout(controlsHideTimer);
      controlsHideTimer = embeddedWindow.setTimeout(() => {
        controlsHideTimer = 0;
        hidePhotoFrameControls();
      }, NEW_TAB_PHOTO_FRAME_CONTROLS_HIDE_MS);
    };

    const updateStageNavigation = () => {
      stage.updateNavigation({
        hasNext:
          currentGalleryIndex >= 0 &&
          currentGalleryIndex < currentGallery.length - 1,
        hasPrevious: currentGalleryIndex > 0,
        isLatest:
          currentGalleryIndex < 0 ||
          currentGalleryIndex === currentLatestGalleryIndex,
      });
    };

    const animateSectionTimeline = (active: boolean) => {
      const entries = photoFrameSectionTimeline(embeddedDocument);
      const activeElements = new Set(entries.map((entry) => entry.element));
      for (const element of sectionTimelineElements) {
        if (activeElements.has(element)) continue;
        gsap.killTweensOf(element);
        element.style.removeProperty('opacity');
        element.style.removeProperty('--card-master-photo-frame-item-offset');
        sectionTimelineElements.delete(element);
      }
      const reduceMotion = embeddedWindow.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      for (const entry of entries) {
        sectionTimelineElements.add(entry.element);
        gsap.to(entry.element, {
          '--card-master-photo-frame-item-offset': active
            ? `${entry.offset}px`
            : '0px',
          delay: reduceMotion ? 0 : entry.delay / 1_000,
          duration: (reduceMotion ? 120 : entry.duration) / 1_000,
          ease: 'power3.out',
          opacity: active ? 0 : 1,
          overwrite: 'auto',
          onComplete: active
            ? undefined
            : () => {
                if (mode !== 'off') return;
                entry.element.style.removeProperty('opacity');
                entry.element.style.removeProperty(
                  '--card-master-photo-frame-item-offset',
                );
                sectionTimelineElements.delete(entry.element);
              },
        });
      }
    };

    const setEmbeddedContentInert = (active: boolean) => {
      if (!active) {
        for (const [element, inert] of inertStates) {
          if (element.isConnected) element.inert = inert;
        }
        inertStates.clear();
        return;
      }
      for (const child of embeddedDocument.body.children) {
        if (
          !('inert' in child) ||
          child === stage.element ||
          child === stage.navigation ||
          child === reviewSurface.element ||
          child.classList.contains(LUMNO_WALLPAPER_TRANSITION_CLASS) ||
          child.matches('script, style, link')
        ) {
          continue;
        }
        const element = child as HTMLElement;
        if (!inertStates.has(element)) inertStates.set(element, element.inert);
        element.inert = true;
      }
    };

    const updateReview = async () => {
      const sequence = ++reviewSequence;
      const previousGallery = currentGallery;
      const previousGalleryIndex = currentGalleryIndex;
      const previousLatestGalleryIndex = currentLatestGalleryIndex;
      const previousReview = currentReview;
      try {
        const gallery = await readDailyReviewGallery(
          preferencesRepository,
          stateRepository,
          historyRepository,
          imageRepository,
          api.storage.local,
        );
        if (sequence !== reviewSequence) return;
        const nextReview = gallery.content;
        if (
          nextReview?.imageDataUrl &&
          nextReview.imageDataUrl !== previousReview?.imageDataUrl &&
          !(await waitForWallpaper(nextReview.imageDataUrl))
        ) {
          throw new Error('切换后的每日回顾壁纸没有完成加载。');
        }
        if (sequence !== reviewSequence) return;
        currentGallery = gallery.items;
        currentGalleryIndex = gallery.index;
        currentLatestGalleryIndex = gallery.latestIndex;
        currentReview = nextReview;
        updateStageNavigation();
        if (currentReview?.imageDataUrl) {
          const reviewToApply = currentReview;
          if (
            previousReview?.imageDataUrl !== reviewToApply.imageDataUrl ||
            !embeddedDocument.body.hasAttribute(
              DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE,
            )
          ) {
            wallpaperTransition.swap(() =>
              applyDailyReviewWallpaper(
                embeddedDocument,
                embeddedWindow,
                reviewToApply,
              ),
            );
          }
        } else if (
          embeddedDocument.body.hasAttribute(
            DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE,
          )
        ) {
          wallpaperTransition.swap(() =>
            clearDailyReviewWallpaper(embeddedDocument),
          );
        }
        const visibleReview = visibleDailyReviewContent(currentReview);
        reviewSurface.update(visibleReview);
        updateWallpaperSourceControl();
        syncAutomaticPhotoFrameAvailability();
        if (mode !== 'off') setEmbeddedContentInert(true);
      } catch (error) {
        if (sequence !== reviewSequence) return;
        currentGallery = previousGallery;
        currentGalleryIndex = previousGalleryIndex;
        currentLatestGalleryIndex = previousLatestGalleryIndex;
        currentReview = previousReview;
        updateStageNavigation();
        wallpaperTransition.clear();
        reviewSurface.update(visibleDailyReviewContent(currentReview));
        updateWallpaperSourceControl();
        syncAutomaticPhotoFrameAvailability();
        if (mode !== 'off') setEmbeddedContentInert(true);
        reportExtensionFailure(
          'new-tab-entry',
          'daily-review-read-failed',
          error,
        );
      }
    };

    const waitForWallpaper = (url: string) => {
      if (wallpaperReadiness?.url === url) {
        return wallpaperReadiness.promise;
      }
      const promise = new Promise<boolean>((resolve) => {
        const image = embeddedDocument.createElement('img');
        image.decoding = 'async';
        image.onload = () => {
          if (typeof image.decode !== 'function') {
            resolve(true);
            return;
          }
          void image.decode().then(
            () => resolve(true),
            () => resolve(false),
          );
        };
        image.onerror = () => resolve(false);
        image.src = url;
      });
      wallpaperReadiness = { promise, url };
      void promise.then((ready) => {
        if (!ready && wallpaperReadiness?.promise === promise) {
          wallpaperReadiness = null;
        }
      });
      return promise;
    };

    const prepareStageWallpaper = async () => {
      const imageDataUrl = currentReview?.imageDataUrl;
      if (!dailyReviewSelected || !imageDataUrl) {
        throw new Error('AI 壁纸尚未准备好，不能进入电子相框。');
      }
      const visual = resolvePhotoFrameWallpaperVisual(
        embeddedWindow.getComputedStyle(embeddedDocument.documentElement),
        embeddedWindow.getComputedStyle(embeddedDocument.body),
        imageDataUrl,
      );
      if (!visual) {
        throw new Error('壁纸已标记为启用，但页面没有可供电子相框使用的图片。');
      }
      if (!(await waitForWallpaper(visual.imageUrl))) {
        throw new Error('电子相框无法读取当前壁纸图片。');
      }
    };

    const leavePhotoFrame = () => {
      const previousMode = mode;
      transitionSequence += 1;
      reviewSurface.setPhotoFrameActive(false);
      hidePhotoFrameControls();
      reviewSurface.collapseDetails();
      if (previousMode !== 'off') animateSectionTimeline(false);
      commitPhotoFrameState(embeddedDocument, false);
      setEmbeddedContentInert(false);
      reviewSurface.element.inert = !visibleDailyReviewContent(currentReview);
      if (previousMode === 'manual' && document.visibilityState === 'visible') {
        reviewSurface.fullscreenButton.focus({ preventScroll: true });
      }
      mode = 'off';
      stage.element.dataset.active = 'false';
      stage.element.dataset.mode = 'off';
      stage.element.setAttribute('aria-hidden', 'true');
    };

    const enterPhotoFrame = async (
      nextMode: Exclude<PhotoFrameMode, 'off'>,
    ) => {
      if (nextMode === 'automatic' && manualPhotoFrameRequested) return false;
      reviewSurface.collapseDetails();
      const sequence = ++transitionSequence;
      reviewSurface.setPhotoFrameActive(true);
      try {
        await prepareStageWallpaper();
        if (sequence !== transitionSequence) return false;
        lastReportedWallpaperFailure = '';
        mode = nextMode;
        stage.element.dataset.mode = nextMode;
        stage.element.dataset.active = 'true';
        stage.element.setAttribute('aria-hidden', 'false');
        if (nextMode === 'manual') showPhotoFrameControls();
        else hidePhotoFrameControls();
        embeddedWindow.requestAnimationFrame(() => {
          if (sequence === transitionSequence) {
            animateSectionTimeline(true);
            setEmbeddedContentInert(true);
            commitPhotoFrameState(embeddedDocument, true);
          }
        });
        return true;
      } catch (error) {
        if (sequence !== transitionSequence) return false;
        leavePhotoFrame();
        const failureKey =
          error instanceof Error ? error.message : 'unknown-wallpaper-error';
        if (failureKey !== lastReportedWallpaperFailure) {
          lastReportedWallpaperFailure = failureKey;
          reportExtensionFailure(
            'new-tab-entry',
            'photo-frame-wallpaper-prepare-failed',
            error,
            {
              wallpaperActive:
                embeddedDocument.body.dataset.wallpaperActive === 'true',
            },
          );
        }
        return false;
      }
    };

    let compositionActive = false;
    let dragging = false;
    const activePointerIds = new Set<number>();
    let embeddedBusinessPointer = false;
    let outerBusinessPointer = false;

    const directInteractionActive = () =>
      compositionActive || dragging || activePointerIds.size > 0;

    const businessInteractionActive = () =>
      directInteractionActive() ||
      embeddedBusinessPointer ||
      outerBusinessPointer ||
      reviewSurface.details.open ||
      pendingNewTabSearchText(embeddedDocument, embeddedWindow) ||
      documentHasBusinessFocus(
        embeddedDocument,
        embeddedWindow,
        EMBEDDED_BUSINESS_SELECTOR,
      ) ||
      documentHasBusinessFocus(document, window, OUTER_BUSINESS_SELECTOR);

    const automaticPhotoFrameBlockReason = (
      trigger: PhotoFrameIdleTrigger = 'idle',
    ) =>
      photoFrameIdleBlockReason(
        {
          businessInteractionActive: businessInteractionActive(),
          directInteractionActive: directInteractionActive(),
          focused: document.hasFocus(),
          manualPhotoFrameRequested,
          modeAvailable: mode === 'off',
          overlayVisible: visibleNewTabOverlay(
            embeddedDocument,
            embeddedWindow,
          ),
          visible: document.visibilityState === 'visible',
          wallpaperActive:
            dailyReviewSelected &&
            Boolean(currentReview?.imageDataUrl) &&
            embeddedDocument.body.hasAttribute(
              DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE,
            ),
        },
        trigger,
      );

    const controller = createPhotoFrameIdleController({
      canEnterIdle: (trigger) =>
        automaticPhotoFrameBlockReason(trigger) === null,
      onIdleChange: (idle) => {
        if (!idle) {
          leavePhotoFrame();
          return;
        }
        void enterPhotoFrame('automatic').then((entered) => {
          if (!entered && !manualPhotoFrameRequested) {
            controller.setIdle(false);
            controller.activity();
          }
        });
      },
    });
    syncAutomaticPhotoFrameAvailability = () => {
      const eligible =
        dailyReviewSelected &&
        Boolean(currentReview?.imageDataUrl) &&
        embeddedDocument.body.hasAttribute(
          DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE,
        );
      if (automaticControllerEligible === eligible) return;
      automaticControllerEligible = eligible;
      if (eligible) {
        controller.start();
        controller.activity();
        return;
      }
      controller.stop();
    };
    updateWallpaperSourceControl = () => {
      if (!wallpaperSourceControl) return;
      const source = dailyReviewSelected ? 'daily-review' : 'default';
      const status = !dailyReviewSelected
        ? '预设或本地图片'
        : currentReview?.imageDataUrl
          ? '每日回顾已就绪'
          : currentReview?.status === 'generating'
            ? '正在生成，暂用默认壁纸'
            : '等待生成，暂用默认壁纸';
      wallpaperSourceControl.update(
        source,
        status,
        currentReview?.imageDataUrl,
      );
    };
    wallpaperSourceControl = createWallpaperSourceControl(
      embeddedDocument,
      async (source) => {
        try {
          const next = await preferencesRepository.mutate((current) => ({
            ...current,
            wallpaperSource: source,
          }));
          dailyReviewSelected = next.wallpaperSource === 'daily-review';
          updateWallpaperSourceControl();
          syncAutomaticPhotoFrameAvailability();
          if (source === 'daily-review') {
            const readiness = await dailyReviewController
              .readReadiness()
              .catch(() => null);
            if (
              !readiness?.modelServiceConfigured ||
              !readiness.imageServiceConfigured
            ) {
              await dailyReviewController.openAiSettings();
            }
          }
          await updateReview();
        } catch (error) {
          reportExtensionFailure(
            'new-tab-entry',
            'wallpaper-source-change-failed',
            error,
          );
          throw error;
        }
      },
      `${api.runtime.getURL('new-tab-settings.html')}#new-tab-settings-wallpaper`,
    );
    updateWallpaperSourceControl();
    const cleanups: Array<() => void> = [];
    const activityEvents = [
      'pointermove',
      'pointerdown',
      'pointerup',
      'pointercancel',
      'wheel',
      'touchstart',
      'touchmove',
      'touchend',
      'input',
      'change',
      'compositionstart',
      'compositionend',
      'focusin',
      'focusout',
      'dragstart',
      'dragend',
    ] as const;

    const updateInteractionState = (event: Event) => {
      if (event.type === 'compositionstart') compositionActive = true;
      if (event.type === 'compositionend') compositionActive = false;
      if (event.type === 'dragstart') dragging = true;
      if (event.type === 'dragend') dragging = false;
      if ('pointerId' in event) {
        const pointerId = Number((event as PointerEvent).pointerId);
        if (event.type === 'pointerdown') activePointerIds.add(pointerId);
        if (event.type === 'pointerup' || event.type === 'pointercancel') {
          activePointerIds.delete(pointerId);
        }
      }
      if (event.type !== 'pointermove' && event.type !== 'pointerdown') return;
      const targetDocument = eventTargetElement(event.target)?.ownerDocument;
      if (targetDocument === embeddedDocument) {
        outerBusinessPointer = false;
        embeddedBusinessPointer = eventTargetsBusinessSurface(
          event,
          EMBEDDED_BUSINESS_SELECTOR,
        );
      } else if (targetDocument === document) {
        embeddedBusinessPointer = false;
        outerBusinessPointer = eventTargetsBusinessSurface(
          event,
          OUTER_BUSINESS_SELECTOR,
        );
      }
    };

    const onActivity = (event: Event) => {
      updateInteractionState(event);
      if (mode === 'automatic') {
        if (eventShowsUserIntent(event)) exitPhotoFrame();
        return;
      }
      if (mode === 'manual' || manualPhotoFrameRequested) {
        if (event.type === 'pointerdown' || event.type === 'touchstart') {
          const path = event.composedPath();
          if (
            path.includes(stage.navigation) ||
            path.includes(reviewSurface.element)
          ) {
            showPhotoFrameControls();
          }
          return;
        }
        showPhotoFrameControls();
        return;
      }
      if (!eventShowsUserIntent(event)) return;
      controller.activity();
    };

    const listenForActivity = (target: EventTarget) => {
      for (const eventName of activityEvents) {
        const options: AddEventListenerOptions = {
          capture: true,
          passive: true,
        };
        target.addEventListener(eventName, onActivity, options);
        cleanups.push(() =>
          target.removeEventListener(eventName, onActivity, options),
        );
      }
    };

    listenForActivity(window);
    listenForActivity(embeddedWindow);

    const selectGalleryIndex = async (index: number) => {
      const item = currentGallery[index];
      const latest = currentGallery[currentLatestGalleryIndex];
      if (!item || !latest || index === currentGalleryIndex) {
        showPhotoFrameControls();
        return;
      }
      await api.storage.local.set({
        [DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY]: {
          selectedGenerationId: item.generationId,
          latestGenerationId: latest.generationId,
        } satisfies DailyReviewWallpaperGallerySelection,
      });
      await updateReview();
      showPhotoFrameControls();
    };

    const selectPrevious = () =>
      void selectGalleryIndex(currentGalleryIndex - 1);
    const selectNext = () => void selectGalleryIndex(currentGalleryIndex + 1);
    const selectLatest = () =>
      void selectGalleryIndex(currentLatestGalleryIndex);
    stage.previousButton.addEventListener('click', selectPrevious);
    stage.nextButton.addEventListener('click', selectNext);
    stage.latestButton.addEventListener('click', selectLatest);

    const exitPhotoFrame = () => {
      if (mode === 'off' && !manualPhotoFrameRequested) return;
      manualPhotoFrameRequested = false;
      leavePhotoFrame();
      controller.activity();
    };
    const onStageClick = (event: MouseEvent) => {
      if (event.target !== stage.element) return;
      if (event.composedPath().includes(stage.navigation)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (reviewSurface.details.open) {
        reviewSurface.collapseDetails();
        return;
      }
      exitPhotoFrame();
    };
    stage.element.addEventListener('click', onStageClick);
    cleanups.push(() => {
      stage.previousButton.removeEventListener('click', selectPrevious);
      stage.nextButton.removeEventListener('click', selectNext);
      stage.latestButton.removeEventListener('click', selectLatest);
      stage.element.removeEventListener('click', onStageClick);
    });
    const onOutsideReviewPointerDown = (event: Event) => {
      if (
        !reviewSurface.details.open ||
        event.composedPath().includes(reviewSurface.element) ||
        event.target === stage.element
      ) {
        return;
      }
      reviewSurface.collapseDetails();
    };
    embeddedDocument.addEventListener(
      'pointerdown',
      onOutsideReviewPointerDown,
      true,
    );
    window.addEventListener('pointerdown', onOutsideReviewPointerDown, true);
    cleanups.push(() => {
      embeddedDocument.removeEventListener(
        'pointerdown',
        onOutsideReviewPointerDown,
        true,
      );
      window.removeEventListener(
        'pointerdown',
        onOutsideReviewPointerDown,
        true,
      );
    });
    const onKeydown = (event: KeyboardEvent) => {
      updateInteractionState(event);
      const userIntent = eventShowsUserIntent(event);
      if (mode === 'automatic') {
        if (!userIntent) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        exitPhotoFrame();
        return;
      }
      if (mode === 'manual' || manualPhotoFrameRequested) {
        const path = event.composedPath();
        const controlInteraction =
          path.includes(stage.navigation) ||
          path.includes(reviewSurface.element);
        const controlActivation =
          controlInteraction && (event.key === 'Enter' || event.key === ' ');
        if (controlActivation) {
          showPhotoFrameControls();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        showPhotoFrameControls();
        return;
      }
      if (!userIntent) return;
      controller.activity();
      if (event.key === 'Escape' && reviewSurface.details.open) {
        event.preventDefault();
        event.stopImmediatePropagation();
        reviewSurface.collapseDetails();
        return;
      }
    };
    embeddedWindow.addEventListener('keydown', onKeydown, true);
    window.addEventListener('keydown', onKeydown, true);
    cleanups.push(() => {
      embeddedWindow.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('keydown', onKeydown, true);
    });
    const enterManualPhotoFrame = () => {
      if (!currentReview?.imageDataUrl) return;
      reviewSurface.details.open = false;
      manualPhotoFrameRequested = true;
      transitionSequence += 1;
      controller.stop();
      void enterPhotoFrame('manual').then((entered) => {
        if (!entered) {
          manualPhotoFrameRequested = false;
          controller.start();
          controller.activity();
        }
      });
    };
    const toggleManualPhotoFrame = () => {
      if (mode !== 'off' || manualPhotoFrameRequested) {
        exitPhotoFrame();
        return;
      }
      enterManualPhotoFrame();
    };
    reviewSurface.fullscreenButton.addEventListener(
      'click',
      toggleManualPhotoFrame,
    );
    cleanups.push(() =>
      reviewSurface.fullscreenButton.removeEventListener(
        'click',
        toggleManualPhotoFrame,
      ),
    );
    const onReviewToggle = () => {
      if (mode !== 'off') {
        if (reviewSurface.details.open) showPhotoFrameControls();
      }
    };
    reviewSurface.details.addEventListener('toggle', onReviewToggle);
    cleanups.push(() =>
      reviewSurface.details.removeEventListener('toggle', onReviewToggle),
    );

    const resetInteractionState = () => {
      activePointerIds.clear();
      dragging = false;
      compositionActive = false;
      embeddedBusinessPointer = false;
      outerBusinessPointer = false;
    };
    const suspendForPageDeactivation = (exitManualMode: boolean) => {
      resetInteractionState();
      if (
        mode === 'automatic' ||
        (exitManualMode && (mode === 'manual' || manualPhotoFrameRequested))
      ) {
        manualPhotoFrameRequested = false;
        leavePhotoFrame();
      }
      controller.stop();
    };
    const resumeAfterPageActivation = () => {
      resetInteractionState();
      if (automaticControllerEligible) {
        controller.start();
        controller.activity();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (mode !== 'manual') resumeAfterPageActivation();
        return;
      }
      suspendForPageDeactivation(true);
    };
    const onWindowBlur = () => suspendForPageDeactivation(false);
    const onWindowFocus = () => {
      if (document.visibilityState !== 'visible' || mode === 'manual') return;
      resumeAfterPageActivation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    cleanups.push(() => {
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
        true,
      );
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
    });

    const wallpaperObserver = new MutationObserver(() => {
      if (applyWallpaperLayout(embeddedDocument, wallpaperLayout)) return;
      if (
        dailyReviewSelected &&
        currentReview &&
        applyDailyReviewWallpaper(
          embeddedDocument,
          embeddedWindow,
          currentReview,
        )
      ) {
        syncAutomaticPhotoFrameAvailability();
        return;
      }
      syncAutomaticPhotoFrameAvailability();
    });
    wallpaperObserver.observe(embeddedDocument.documentElement, {
      attributeFilter: ['data-wallpaper-active', 'style'],
      attributes: true,
    });
    wallpaperObserver.observe(embeddedDocument.body, {
      attributeFilter: ['data-theme', 'data-wallpaper-active', 'style'],
      attributes: true,
    });
    cleanups.push(() => wallpaperObserver.disconnect());

    const reviewStorageKeys = new Set([
      DAILY_REVIEW_WALLPAPER_HISTORY_STORAGE_KEY,
      DAILY_REVIEW_WALLPAPER_SELECTION_STORAGE_KEY,
      DAILY_REVIEW_WALLPAPER_STATE_STORAGE_KEY,
    ]);
    const preferenceStorageKeys = new Set([
      NEW_TAB_PREFERENCES_STORAGE_KEY,
      NEW_TAB_SYNC_STORAGE_KEY,
    ]);
    const updateRuntimePreferences = async () => {
      const preferences = await preferencesRepository.read();
      const review = currentReview;
      const previousDailyReviewSelected = dailyReviewSelected;
      dailyReviewSelected = preferences.wallpaperSource === 'daily-review';
      wallpaperLayout = {
        wallpaperFit: preferences.wallpaperFit,
        wallpaperPosition: preferences.wallpaperPosition,
      };
      applyWallpaperLayout(embeddedDocument, wallpaperLayout);
      controller.setIdleMs(preferences.dailyReviewIdleSeconds * 1_000);
      controller.setForceIdleMs(preferences.dailyReviewForceSeconds * 1_000);
      if (
        dailyReviewSelected &&
        review?.imageDataUrl &&
        !embeddedDocument.body.hasAttribute(
          DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE,
        )
      ) {
        wallpaperTransition.swap(() =>
          applyDailyReviewWallpaper(embeddedDocument, embeddedWindow, review),
        );
      } else if (
        previousDailyReviewSelected &&
        !dailyReviewSelected &&
        embeddedDocument.body.hasAttribute(
          DAILY_REVIEW_WALLPAPER_BODY_ATTRIBUTE,
        )
      ) {
        wallpaperTransition.swap(() =>
          clearDailyReviewWallpaper(embeddedDocument),
        );
      }
      updateWallpaperSourceControl();
      syncAutomaticPhotoFrameAvailability();
    };
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      const keys = Object.keys(changes);
      if (
        (areaName === 'local' || areaName === 'sync') &&
        keys.some((key) => preferenceStorageKeys.has(key))
      ) {
        void updateRuntimePreferences()
          .then(updateReview)
          .catch((error) =>
            reportExtensionFailure(
              'new-tab-entry',
              'wallpaper-setting-read-failed',
              error,
            ),
          );
      }
      if (
        areaName === 'local' &&
        keys.some((key) => reviewStorageKeys.has(key))
      ) {
        void updateReview();
      }
    };
    chrome.storage.onChanged.addListener(onStorageChanged);
    cleanups.push(() =>
      chrome.storage.onChanged.removeListener(onStorageChanged),
    );

    void updateRuntimePreferences()
      .then(updateReview)
      .catch((error) => {
        reportExtensionFailure(
          'new-tab-entry',
          'wallpaper-setting-read-failed',
          error,
        );
      });
    disposeEmbeddedRuntime = () => {
      manualPhotoFrameRequested = false;
      hidePhotoFrameControls();
      controller.stop();
      leavePhotoFrame();
      wallpaperSourceControl?.dispose();
      wallpaperTransition.dispose();
      clearDailyReviewWallpaper(embeddedDocument);
      for (const cleanup of cleanups) cleanup();
      stage.element.remove();
      stage.navigation.remove();
      reviewSurface.element.remove();
      wallpaperReadiness = null;
      for (const element of sectionTimelineElements) {
        gsap.killTweensOf(element);
        element.style.removeProperty('opacity');
        element.style.removeProperty('--card-master-photo-frame-item-offset');
      }
      sectionTimelineElements.clear();
      embeddedDocument.documentElement.removeAttribute(
        NEW_TAB_PHOTO_FRAME_ATTRIBUTE,
      );
      document.documentElement.setAttribute(
        NEW_TAB_PHOTO_FRAME_ATTRIBUTE,
        'false',
      );
    };
  };

  frame.addEventListener('load', installEmbeddedRuntime);
  window.addEventListener(
    'pagehide',
    () => {
      frame.removeEventListener('load', installEmbeddedRuntime);
      disposeEmbeddedRuntime?.();
      disposeEmbeddedRuntime = null;
      document.documentElement.removeAttribute(NEW_TAB_PHOTO_FRAME_ATTRIBUTE);
    },
    { once: true },
  );
}

async function openConfiguredNewTab(api: ExtensionApi) {
  const frame = document.getElementById('card-master-new-tab-frame');
  if (!(frame instanceof HTMLIFrameElement)) {
    throw new Error('新标签页缺少内置页面挂载节点。');
  }
  installEmbeddedNewTabBranding(frame, cardMasterLogoUrl(api));
  installPhotoFrameIdleMode(frame, api, preferencesRepository);
  const preferences = await preferencesRepository.read();
  if (preferences.destinationUrl) {
    location.replace(preferences.destinationUrl);
    return;
  }
  try {
    await preferencesRepository.synchronize(preferences);
  } catch (error) {
    reportExtensionFailure(
      'new-tab-entry',
      'runtime-preferences-sync-failed',
      error,
    );
  }
  const embeddedUrl = new URL(api.runtime.getURL('src/newtab/newtab.html'));
  if (new URL(location.href).searchParams.get('focus') === '1') {
    embeddedUrl.searchParams.set('focus', '1');
  }
  frame.src = embeddedUrl.toString();
}

function installRuntimeWallpaperPreferenceSync(
  repository: NewTabPreferencesRepository,
) {
  let wallpaperSyncTimer = 0;
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== 'local' && areaName !== 'sync') return;
    const wallpaper = changes[LUMNO_WALLPAPER_STORAGE_KEY];
    const localWallpaper = changes[LUMNO_LOCAL_WALLPAPER_STORAGE_KEY];
    const overlay = changes[LUMNO_WALLPAPER_OVERLAY_STORAGE_KEY];
    const effect = changes[LUMNO_WALLPAPER_EFFECT_STORAGE_KEY];
    const searchWidth = changes[LUMNO_NEW_TAB_SEARCH_WIDTH_STORAGE_KEY];
    const operations = [
      ...(overlay?.newValue === undefined
        ? []
        : [repository.adoptRuntimeWallpaperOverlay(overlay.newValue)]),
      ...(effect?.newValue === undefined
        ? []
        : [repository.adoptRuntimeWallpaperEffect(effect.newValue)]),
      ...(searchWidth?.newValue === undefined
        ? []
        : [repository.adoptRuntimeSearchWidth(searchWidth.newValue)]),
    ];
    if (wallpaper || localWallpaper) {
      if (wallpaperSyncTimer) window.clearTimeout(wallpaperSyncTimer);
      wallpaperSyncTimer = window.setTimeout(() => {
        wallpaperSyncTimer = 0;
        void repository
          .adoptRuntimeWallpaperState()
          .catch((error) =>
            reportExtensionFailure(
              'new-tab-entry',
              'wallpaper-preference-sync-failed',
              error,
            ),
          );
      });
    }
    if (operations.length === 0) return;
    void Promise.all(operations).catch((error) =>
      reportExtensionFailure(
        'new-tab-entry',
        'wallpaper-preference-sync-failed',
        error,
      ),
    );
  };
  chrome.storage.onChanged.addListener(listener);
  window.addEventListener(
    'pagehide',
    () => {
      chrome.storage.onChanged.removeListener(listener);
      if (wallpaperSyncTimer) window.clearTimeout(wallpaperSyncTimer);
    },
    { once: true },
  );
}

function loadExtensionScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.addEventListener(
      'load',
      () => {
        script.remove();
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error('全局牌库资源加载失败。'));
      },
      { once: true },
    );
    document.documentElement.append(script);
  });
}

async function prepareGlobalLibraryHost(api: ExtensionApi, generation: string) {
  if (
    signalInjectedGlobalLibraryHost(
      GLOBAL_LIBRARY_HOST_ID,
      GLOBAL_LIBRARY_GENERATION_ATTRIBUTE,
      generation,
      GLOBAL_LIBRARY_ALIVE_ATTRIBUTE,
      GLOBAL_LIBRARY_DISPOSE_EVENT,
      GLOBAL_LIBRARY_OPEN_EVENT,
    )
  ) {
    return;
  }
  markGlobalLibraryInjection(GLOBAL_LIBRARY_GENERATION_ATTRIBUTE, generation);
  const libraryUrl = new URL(api.runtime.getURL('library.js'));
  libraryUrl.searchParams.set('generation', generation);
  await loadExtensionScript(libraryUrl.toString());
}

async function installExtensionPageHost(api: ExtensionApi) {
  const tab = await api.tabs?.getCurrent?.();
  if (typeof tab?.id !== 'number') return;
  const tabId = tab.id;
  const listener: ExtensionMessageListener = (
    message,
    _sender,
    sendResponse,
  ) => {
    if (
      !isExtensionPageGlobalLibraryDeliveryMessage(message) ||
      message.tabId !== tabId
    ) {
      return undefined;
    }
    void prepareGlobalLibraryHost(api, message.generation).then(
      () => sendResponse({ handled: true }),
      (error) => {
        reportExtensionFailure(
          'new-tab-entry',
          'global-library-host-failed',
          error,
        );
        sendResponse({ handled: false });
      },
    );
    return true;
  };
  api.runtime.onMessage.addListener(listener);
}

const api = requireExtensionApi();
const preferencesRepository = new NewTabPreferencesRepository(
  api.storage.local,
  api.storage.sync,
);
installRuntimeWallpaperPreferenceSync(preferencesRepository);
const logoUrl = cardMasterLogoUrl(api);
applyDocumentBranding(document, logoUrl);
const brandingObserver = new MutationObserver(() =>
  applyDocumentBranding(document, logoUrl),
);
brandingObserver.observe(document.head, {
  attributes: true,
  attributeFilter: ['href'],
  childList: true,
  subtree: true,
});
void installExtensionPageHost(api).catch((error) => {
  reportExtensionFailure('new-tab-entry', 'page-host-install-failed', error);
});
void openConfiguredNewTab(api).catch((error) => {
  reportExtensionFailure('new-tab-entry', 'destination-read-failed', error);
  const frame = document.getElementById('card-master-new-tab-frame');
  if (frame instanceof HTMLIFrameElement) {
    frame.src = api.runtime.getURL('src/newtab/newtab.html');
  }
});

window.setTimeout(() => {
  const host = document.getElementById('card-master-host');
  if (host) return;
  reportExtensionFailure(
    'new-tab-entry',
    'deck-host-missing',
    new Error('新标签页未能挂载牌库入口。'),
  );
}, 1_500);
