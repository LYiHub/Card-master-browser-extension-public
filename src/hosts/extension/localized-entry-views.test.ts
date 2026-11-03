import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { transformSync } from 'esbuild';
import { afterEach, expect, it, vi } from 'vitest';
import {
  getLocale,
  setLanguagePreference,
  subscribeLanguage,
} from '../../localization/locale';
import { t } from '../../localization/messages';
import {
  NEW_TAB_DAILY_REVIEW_SURFACE_CLASS,
  NEW_TAB_PHOTO_FRAME_STAGE_CLASS,
  photoFrameFullscreenButtonPresentation,
} from '../../new-tab/application/photo-frame-runtime';

class ElementStub {
  textContent = '';
  innerHTML = '';
  className = '';
  title = '';
  lang = '';
  disabled = false;
  hidden = false;
  inert = false;
  open = false;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  children: ElementStub[] = [];
  selectors = new Map<string, ElementStub>();
  events = new Map<
    string,
    (event: { preventDefault(): void; stopPropagation(): void }) => unknown
  >();
  style = { setProperty: vi.fn() };
  classList = { add: vi.fn(), toggle: vi.fn() };
  append(...children: ElementStub[]) {
    this.children.push(...children);
  }
  replaceChildren(...children: ElementStub[]) {
    this.children = children;
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  addEventListener(
    type: string,
    callback: (event: {
      preventDefault(): void;
      stopPropagation(): void;
    }) => unknown,
  ) {
    this.events.set(type, callback);
  }
  querySelector(selector: string) {
    return this.selectors.get(selector) ?? null;
  }
}

function functions(file: string, names: string[]) {
  const source = transformSync(
    readFileSync(new URL(file, import.meta.url), 'utf8'),
    { loader: 'ts', target: 'es2022' },
  ).code;
  return parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
    .body.flatMap((node) =>
      node.type === 'FunctionDeclaration' &&
      node.id &&
      names.includes(node.id.name)
        ? [source.slice(node.start, node.end)]
        : [],
    )
    .join('\n');
}

const dependencies = {
  t,
  getLocale,
  NEW_TAB_DAILY_REVIEW_SURFACE_CLASS,
  NEW_TAB_PHOTO_FRAME_STAGE_CLASS,
  photoFrameFullscreenButtonPresentation,
  copyText: vi.fn(async () => {}),
  reportExtensionFailure: vi.fn(),
};
const newTabFunctions = functions('./new-tab-entry.ts', [
  'createDailyReviewSurface',
  'createPhotoFrameStage',
  'remixIcon',
  'reviewContentTitle',
  'reviewDateLabel',
  'dailyReviewPromptLines',
]);
const createViews = new Function(
  'dependencies',
  `const { ${Object.keys(dependencies).join(', ')} } = dependencies;\n${newTabFunctions}\nreturn { createDailyReviewSurface, createPhotoFrameStage };`,
) as (deps: typeof dependencies) => {
  createDailyReviewSurface(document: unknown): {
    element: ElementStub;
    details: ElementStub;
    fullscreenButton: ElementStub;
    setPhotoFrameActive(active: boolean): void;
    update(content: Record<string, unknown>): void;
    refreshLanguage(): void;
  };
  createPhotoFrameStage(document: unknown): {
    element: ElementStub;
    navigation: ElementStub;
    previousButton: ElementStub;
    nextButton: ElementStub;
    latestButton: ElementStub;
    refreshLanguage(): void;
    updateNavigation(state: {
      hasNext: boolean;
      hasPrevious: boolean;
      isLatest: boolean;
    }): void;
  };
};

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  setLanguagePreference('auto');
});

it('updates existing photo-frame and review labels without replacing the prompt, expanded state or navigation state', () => {
  setLanguagePreference('zh-CN');
  const doc = {
    body: new ElementStub(),
    createElement: () => new ElementStub(),
  };
  const views = createViews(dependencies);
  const stage = views.createPhotoFrameStage(doc);
  const review = views.createDailyReviewSurface(doc);
  review.update({
    finalPrompt: '保留用戶手寫的畫面描述。',
    generationId: 'id',
    imageDataUrl: 'data:image/png;base64,abc',
    showPrompt: true,
    sourceDate: '2026-11-03',
    status: 'ready',
    summary: '不轉換既有回顧。',
  });
  review.details.open = true;
  review.setPhotoFrameActive(true);
  stage.updateNavigation({ hasNext: false, hasPrevious: true, isLatest: true });
  const previousTitle = stage.previousButton.title;
  const prompt = review.details.children[1].children[1];
  const lines = [...prompt.children];
  setLanguagePreference('zh-TW');
  stage.refreshLanguage();
  review.refreshLanguage();
  expect(stage.previousButton.title).not.toBe(previousTitle);
  expect(stage.previousButton.title).toBe(t('cm_new_tab_entry_text_22'));
  expect(stage.element.lang).toBe('zh-TW');
  expect(review.element.lang).toBe('zh-TW');
  expect(stage.previousButton.disabled).toBe(false);
  expect(stage.nextButton.disabled).toBe(true);
  expect(stage.latestButton.disabled).toBe(true);
  expect(review.details.open).toBe(true);
  expect(review.fullscreenButton.attributes.get('aria-pressed')).toBe('true');
  expect(prompt.children).toEqual(lines);
  expect(prompt.children[0]).toBe(lines[0]);
  expect(prompt.children[0].textContent).toBe('保留用戶手寫的畫面描述。');
  expect(review.details.children[0].children[1].textContent).toBe(
    '不轉換既有回顧。',
  );
});

it('updates permission text during an outstanding authorization request without replacing buttons or resetting its busy state', async () => {
  setLanguagePreference('zh-CN');
  const root = new ElementStub();
  for (const selector of [
    '.permission-status',
    '.permission-status strong',
    '.permission-message',
    '[data-action="request"]',
    '[data-action="close"]',
    '[data-action="browser-settings"]',
    '.permission-brand p',
    '.permission-brand h1',
    '.permission-copy',
    '.permission-status span',
  ])
    root.selectors.set(selector, new ElementStub());
  const element = (selector: string) =>
    root.selectors.get(selector) as ElementStub;
  const pagehide: (() => void)[] = [];
  let finish: (stream: { getTracks(): unknown[] }) => void = () => {};
  const pending = new Promise<{ getTracks(): unknown[] }>((resolve) => {
    finish = resolve;
  });
  const deps = {
    document: {
      head: new ElementStub(),
      documentElement: new ElementStub(),
      createElement: () => new ElementStub(),
      getElementById: () => root,
    },
    window: {
      addEventListener: (_type: string, callback: () => void) =>
        pagehide.push(callback),
      close: vi.fn(),
    },
    navigator: { mediaDevices: { getUserMedia: () => pending } },
    subscribeLanguage,
    t,
    cursorThemeStyles: '',
    requireExtensionApi: () => ({}),
    initializeExtensionDocument: async () => () => {},
    CARD_MASTER_DEFAULT_ICON_PATH: 'logo.png',
    readMicrophonePermissionState: async () => 'prompt',
    microphoneSettingsUrl: () => '',
    microphonePermissionErrorMessage: String,
  };
  const start = new Function(
    'dependencies',
    `const { ${Object.keys(deps).join(', ')} } = dependencies;\n${functions('./microphone-permission.ts', ['bootstrap'])}\nreturn bootstrap();`,
  ) as (dependencies: typeof deps) => Promise<void>;
  await start(deps);
  disposers.push(() => {
    for (const dispose of pagehide) dispose();
  });
  await vi.waitFor(() =>
    expect(element('.permission-status strong').textContent).toBe(
      t('cm_microphone_permission_text_11'),
    ),
  );
  const request = element('[data-action="request"]');
  request.events.get('click')?.({ preventDefault() {}, stopPropagation() {} });
  expect(request.disabled).toBe(true);
  setLanguagePreference('zh-TW');
  expect(element('.permission-brand h1').textContent).toBe('允許使用麥克風');
  expect(element('.permission-status span').textContent).toBe('目前權限');
  expect(element('.permission-message').textContent).toBe(
    t('cm_microphone_permission_text_15'),
  );
  expect(element('[data-action="request"]')).toBe(request);
  expect(request.disabled).toBe(true);
  finish({ getTracks: () => [] });
  await vi.waitFor(() => expect(request.disabled).toBe(false));
});
