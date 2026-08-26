import type { AiPageContext } from '../../ai/domain/types';
import {
  type ExtensionBackgroundApi,
  extensionUserscriptApi,
  USER_SCRIPTS_API_UNAVAILABLE,
} from './api';
import {
  assistantPageExecutionSource,
  boundedAssistantPageExecutionOutput,
  validateAssistantPageExpression,
} from './assistant-page-execution';

export const ASSISTANT_PAGE_TOOL_NAMES = [
  'execute_page',
  'reload_page',
  'inspect_page',
  'query_dom',
  'search_page_text',
  'read_dom_fragment',
  'inspect_element',
] as const;

export type AssistantPageToolName = (typeof ASSISTANT_PAGE_TOOL_NAMES)[number];

export type AssistantPageTarget = {
  tabId: number;
  frameId: number;
  documentId: string;
};

export type AssistantPageToolResult = {
  output: string;
};

export interface AssistantPageToolExecutor {
  execute(
    name: AssistantPageToolName,
    args: Record<string, unknown>,
  ): Promise<AssistantPageToolResult>;
}

export type AssistantPageAttachment = {
  context: AiPageContext;
  target: AssistantPageTarget;
};

function assistantPageContextProbe(): AiPageContext {
  const normalizedText = (value: string | null | undefined, maximum: number) =>
    (value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
  return {
    url: window.location.href,
    title: document.title.slice(0, 1_024),
    language: document.documentElement.lang.slice(0, 64),
    selectedText: normalizedText(window.getSelection()?.toString(), 2_000),
    visibleText: normalizedText(document.body?.innerText, 6_000),
  };
}

export async function resolveAssistantPageAttachment(
  api: ExtensionBackgroundApi,
  tabId: number,
): Promise<AssistantPageAttachment> {
  const tab = await api.tabs.get(tabId);
  if (!tab.url || !/^https?:|^file:|^ftp:/i.test(tab.url)) {
    throw new Error('当前标签页不是可观察的网页。');
  }
  const [injection] = await api.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: assistantPageContextProbe,
  });
  if (!injection?.documentId || !injection.result) {
    throw new Error('无法绑定当前标签页的顶层文档。');
  }
  return {
    context: injection.result,
    target: {
      tabId,
      frameId: injection.frameId,
      documentId: injection.documentId,
    },
  };
}

type PageProbeRequest = {
  name: Exclude<AssistantPageToolName, 'execute_page' | 'reload_page'>;
  args: Record<string, unknown>;
};

const RELOAD_TIMEOUT_MS = 15_000;
const RELOAD_POLL_INTERVAL_MS = 250;
const RELOAD_SETTLEMENT_WINDOW_MS = 750;

function wait(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration));
}

async function waitForReloadedPage(
  api: ExtensionBackgroundApi,
  tabId: number,
  previousDocumentId: string,
) {
  const startedAt = Date.now();
  const deadline = startedAt + RELOAD_TIMEOUT_MS;
  let candidateDocumentId = '';
  let candidateUrl = '';
  let candidateSignature = '';
  let settledSince = 0;
  while (Date.now() < deadline) {
    await wait(RELOAD_POLL_INTERVAL_MS);
    const tab = await api.tabs.get(tabId);
    if (tab.status !== 'complete') continue;
    try {
      const attachment = await resolveAssistantPageAttachment(api, tabId);
      if (attachment.target.documentId === previousDocumentId) continue;
      const signature = JSON.stringify({
        title: attachment.context.title,
        visibleText: attachment.context.visibleText,
      });
      if (
        attachment.target.documentId !== candidateDocumentId ||
        attachment.context.url !== candidateUrl ||
        signature !== candidateSignature
      ) {
        candidateDocumentId = attachment.target.documentId;
        candidateUrl = attachment.context.url;
        candidateSignature = signature;
        settledSince = Date.now();
        continue;
      }
      if (Date.now() - settledSince >= RELOAD_SETTLEMENT_WINDOW_MS) {
        return {
          attachment,
          waitedMs: Date.now() - startedAt,
          settlementWindowMs: Date.now() - settledSince,
        };
      }
    } catch {
      // The replacement document is not ready for inspection yet.
    }
  }
  throw new Error('刷新后等待页面稳定超过 15 秒。');
}

function isPageToolName(value: string): value is AssistantPageToolName {
  return ASSISTANT_PAGE_TOOL_NAMES.some((name) => name === value);
}

function requiredString(
  args: Record<string, unknown>,
  name: string,
  maxLength: number,
) {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${name} 必须是长度有效的非空字符串。`);
  }
  return value.trim();
}

function requiredLimit(args: Record<string, unknown>, maximum: number) {
  const value = args.limit;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new Error(`limit 必须是 1 到 ${maximum} 之间的整数。`);
  }
  return value;
}

function assistantPageProbe(request: PageProbeRequest) {
  const HOST_ID = 'card-master-host';
  const MAX_ATTRIBUTE_COUNT = 32;
  const MAX_ATTRIBUTE_LENGTH = 512;
  const MAX_TEXT_LENGTH = 800;
  const MAX_SCANNED_ELEMENTS = 6_000;
  const MAX_SCAN_DURATION_MS = 40;
  const MAX_FRAGMENT_ELEMENTS = 2_000;
  const SENSITIVE_ATTRIBUTE =
    /(?:auth|bearer|cookie|csrf|key|nonce|password|secret|session|token)/i;

  const clip = (value: string, maximum: number) =>
    value.length > maximum ? `${value.slice(0, maximum)}…` : value;
  const normalizedText = (value: string | null | undefined) =>
    clip((value ?? '').replace(/\s+/g, ' ').trim(), MAX_TEXT_LENGTH);
  const searchableText = (element: Element) =>
    normalizedText(
      [
        ...[...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent),
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
        element.getAttribute('alt'),
        element.getAttribute('placeholder'),
      ]
        .filter(Boolean)
        .join(' '),
    );
  const rounded = (value: number) => Math.round(value * 10) / 10;
  const pageElement = (element: Element) =>
    element.id !== HOST_ID && !element.closest(`#${HOST_ID}`);
  const visible = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      bounds.width >= 1 &&
      bounds.height >= 1 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number.parseFloat(style.opacity || '1') > 0
    );
  };
  const safeUrl = (value: string) => {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? `${url.origin}${url.pathname}`
        : clip(value, MAX_ATTRIBUTE_LENGTH);
    } catch {
      return clip(value, MAX_ATTRIBUTE_LENGTH);
    }
  };
  const attributes = (element: Element) => {
    const result: Record<string, string> = {};
    for (const attribute of [...element.attributes].slice(
      0,
      MAX_ATTRIBUTE_COUNT,
    )) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith('on') ||
        name === 'value' ||
        SENSITIVE_ATTRIBUTE.test(name)
      ) {
        result[attribute.name] = '[redacted]';
        continue;
      }
      result[attribute.name] =
        name === 'href' || name === 'src'
          ? safeUrl(attribute.value)
          : clip(attribute.value, MAX_ATTRIBUTE_LENGTH);
    }
    return result;
  };
  const attributeSelector = (element: Element) => {
    for (const name of [
      'data-testid',
      'data-test',
      'data-qa',
      'aria-label',
      'name',
    ]) {
      const value = element.getAttribute(name);
      if (!value || value.length > 160 || SENSITIVE_ATTRIBUTE.test(value)) {
        continue;
      }
      const selector = `${element.localName}[${name}=${JSON.stringify(value)}]`;
      try {
        if (document.querySelector(selector) === element) return selector;
      } catch {
        // Continue with the structural selector.
      }
    }
    return null;
  };
  const selectorFor = (element: Element) => {
    if (element.id) {
      const selector = `#${CSS.escape(element.id)}`;
      if (document.querySelector(selector) === element) return selector;
    }
    const stableAttribute = attributeSelector(element);
    if (stableAttribute) return stableAttribute;
    const parts: string[] = [];
    let current: Element | null = element;
    while (
      current &&
      current !== document.documentElement &&
      parts.length < 7
    ) {
      let part = current.localName;
      const usefulClasses = [...current.classList]
        .filter(
          (name) =>
            name.length <= 64 &&
            !/^(?:active|current|focus|hover|selected|css-|jsx-)/i.test(name),
        )
        .slice(0, 2);
      if (usefulClasses.length > 0) {
        part += usefulClasses.map((name) => `.${CSS.escape(name)}`).join('');
      }
      const parent: HTMLElement | null = current.parentElement;
      if (parent) {
        const peers = [...parent.children].filter(
          (candidate) => candidate.localName === current?.localName,
        );
        if (peers.length > 1) {
          part += `:nth-of-type(${peers.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      const selector = parts.join(' > ');
      try {
        if (document.querySelector(selector) === element) return selector;
      } catch {
        // Keep walking toward the document root.
      }
      current = parent;
    }
    return parts.join(' > ') || element.localName;
  };
  const snapshot = (element: Element) => {
    const bounds = element.getBoundingClientRect();
    return {
      selector: selectorFor(element),
      tag: element.localName,
      id: element.id || undefined,
      classes: [...element.classList].slice(0, 12),
      role: element.getAttribute('role') || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      text: normalizedText(element.textContent),
      attributes: attributes(element),
      visible: visible(element),
      rect: {
        x: rounded(bounds.x),
        y: rounded(bounds.y),
        width: rounded(bounds.width),
        height: rounded(bounds.height),
      },
      childElementCount: element.childElementCount,
    };
  };
  const validateSelector = (selector: string) => {
    try {
      document.documentElement.matches(selector);
    } catch (error) {
      throw new Error(
        `Invalid CSS selector: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const scan = (
    selector: string,
    limit: number,
    predicate: (element: Element) => boolean = () => true,
  ) => {
    validateSelector(selector);
    const startedAt = performance.now();
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT,
    );
    const matches: Element[] = [];
    let visited = 0;
    let current: Node | null = document.documentElement;
    while (
      current &&
      visited < MAX_SCANNED_ELEMENTS &&
      performance.now() - startedAt < MAX_SCAN_DURATION_MS
    ) {
      const element = current as Element;
      visited += 1;
      if (
        pageElement(element) &&
        element.matches(selector) &&
        predicate(element)
      ) {
        matches.push(element);
        if (matches.length >= limit) {
          current = walker.nextNode();
          break;
        }
      }
      current = walker.nextNode();
    }
    return {
      matches,
      visited,
      truncated: current !== null,
    };
  };
  const fragmentSize = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
    let count = 1;
    while (walker.nextNode()) {
      count += 1;
      if (count > MAX_FRAGMENT_ELEMENTS) break;
    }
    return count;
  };
  const sanitizeClone = (root: Element) => {
    root
      .querySelectorAll('script, style, noscript, iframe, object, embed')
      .forEach((element) => {
        element.remove();
      });
    for (const element of [root, ...root.querySelectorAll('*')]) {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        if (
          name.startsWith('on') ||
          name === 'value' ||
          name === 'srcdoc' ||
          SENSITIVE_ATTRIBUTE.test(name)
        ) {
          element.setAttribute(attribute.name, '[redacted]');
        } else if (name === 'href' || name === 'src') {
          element.setAttribute(attribute.name, safeUrl(attribute.value));
        } else if (attribute.value.length > MAX_ATTRIBUTE_LENGTH) {
          element.setAttribute(
            attribute.name,
            clip(attribute.value, MAX_ATTRIBUTE_LENGTH),
          );
        }
      }
    }
    return root;
  };

  switch (request.name) {
    case 'inspect_page': {
      const body = document.body;
      const page = scan('*', MAX_SCANNED_ELEMENTS);
      const pageElements = page.matches;
      const headings = pageElements
        .filter((element) => element.matches('h1, h2, h3'))
        .filter(visible)
        .slice(0, 24)
        .map((element) => ({
          selector: selectorFor(element),
          level: element.localName,
          text: normalizedText(element.textContent),
        }));
      const landmarks = pageElements
        .filter((element) =>
          element.matches(
            'header, nav, main, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]',
          ),
        )
        .filter(visible)
        .slice(0, 24)
        .map((element) => ({
          selector: selectorFor(element),
          tag: element.localName,
          role: element.getAttribute('role') || undefined,
          text: normalizedText(element.textContent),
        }));
      return {
        url: window.location.href,
        title: document.title,
        language: document.documentElement.lang,
        readyState: document.readyState,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          scrollX: rounded(window.scrollX),
          scrollY: rounded(window.scrollY),
          documentWidth: Math.max(
            document.documentElement.scrollWidth,
            body?.scrollWidth ?? 0,
          ),
          documentHeight: Math.max(
            document.documentElement.scrollHeight,
            body?.scrollHeight ?? 0,
          ),
        },
        counts: {
          elements: pageElements.length,
          links: pageElements.filter((element) => element.matches('a[href]'))
            .length,
          buttons: pageElements.filter((element) =>
            element.matches(
              'button, [role="button"], input[type="button"], input[type="submit"]',
            ),
          ).length,
          forms: pageElements.filter((element) => element.matches('form'))
            .length,
          inputs: pageElements.filter((element) =>
            element.matches(
              'input, textarea, select, [contenteditable="true"]',
            ),
          ).length,
          images: pageElements.filter((element) =>
            element.matches('img, picture, svg, canvas, video'),
          ).length,
          dialogs: pageElements.filter((element) =>
            element.matches('dialog, [role="dialog"], [aria-modal="true"]'),
          ).length,
        },
        scan: {
          visited: page.visited,
          truncated: page.truncated,
        },
        headings,
        landmarks,
      };
    }
    case 'query_dom': {
      const selector = String(request.args.selector ?? '');
      const limit = Number(request.args.limit);
      const result = scan(selector, limit);
      return {
        selector,
        matches: result.matches.map(snapshot),
        scan: {
          visited: result.visited,
          truncated: result.truncated,
        },
      };
    }
    case 'search_page_text': {
      const text = String(request.args.text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
      const selector = String(request.args.selector ?? '');
      const limit = Number(request.args.limit);
      const result = scan(selector, limit, (element) =>
        searchableText(element).toLocaleLowerCase().includes(text),
      );
      return {
        text,
        selector,
        matches: result.matches.map(snapshot),
        scan: {
          visited: result.visited,
          truncated: result.truncated,
        },
      };
    }
    case 'read_dom_fragment': {
      const selector = String(request.args.selector ?? '');
      const maxCharacters = Number(request.args.max_characters);
      const result = scan(selector, 1);
      const element = result.matches[0];
      if (!element) throw new Error(`没有元素匹配选择器：${selector}`);
      if (element.matches('script, style, noscript, iframe, object, embed')) {
        throw new Error('不能将可执行元素或嵌入式文档作为 DOM 片段返回。');
      }
      if (fragmentSize(element) > MAX_FRAGMENT_ELEMENTS) {
        throw new Error(
          `所选 DOM 片段超过 ${MAX_FRAGMENT_ELEMENTS} 个元素，请使用更精确的选择器。`,
        );
      }
      const html = sanitizeClone(element.cloneNode(true) as Element).outerHTML;
      return {
        selector: selectorFor(element),
        html: clip(html, maxCharacters),
        truncated: html.length > maxCharacters,
        totalCharacters: html.length,
        scan: {
          visited: result.visited,
          truncated: result.truncated,
        },
      };
    }
    case 'inspect_element': {
      const selector = String(request.args.selector ?? '');
      const result = scan(selector, 1);
      const element = result.matches[0];
      if (!element) throw new Error(`没有元素匹配选择器：${selector}`);
      const style = getComputedStyle(element);
      const styleNames = [
        'display',
        'position',
        'z-index',
        'overflow',
        'overflow-x',
        'overflow-y',
        'width',
        'height',
        'min-width',
        'min-height',
        'max-width',
        'max-height',
        'margin',
        'padding',
        'border',
        'border-radius',
        'box-sizing',
        'color',
        'background',
        'font-family',
        'font-size',
        'font-weight',
        'line-height',
        'text-align',
        'white-space',
        'opacity',
        'visibility',
        'transform',
        'pointer-events',
        'cursor',
        'grid-template-columns',
        'grid-template-rows',
        'flex-direction',
        'align-items',
        'justify-content',
        'gap',
      ];
      const computedStyles = Object.fromEntries(
        styleNames.map((name) => [name, style.getPropertyValue(name)]),
      );
      const ancestors: Array<{
        selector: string;
        tag: string;
        id?: string;
        classes: string[];
      }> = [];
      let ancestor = element.parentElement;
      while (
        ancestor &&
        ancestor !== document.documentElement &&
        ancestors.length < 8
      ) {
        if (pageElement(ancestor)) {
          ancestors.push({
            selector: selectorFor(ancestor),
            tag: ancestor.localName,
            id: ancestor.id || undefined,
            classes: [...ancestor.classList].slice(0, 8),
          });
        }
        ancestor = ancestor.parentElement;
      }
      return {
        element: snapshot(element),
        ancestors,
        computedStyles,
        scan: {
          visited: result.visited,
          truncated: result.truncated,
        },
      };
    }
  }
}

export class ExtensionAssistantPageObserver
  implements AssistantPageToolExecutor
{
  constructor(
    private readonly api: ExtensionBackgroundApi,
    private target: AssistantPageTarget,
  ) {}

  async execute(
    name: AssistantPageToolName,
    args: Record<string, unknown>,
  ): Promise<AssistantPageToolResult> {
    if (!isPageToolName(name)) {
      throw new Error(`不支持的页面工具：${name}`);
    }
    if (name === 'execute_page') {
      const expression = validateAssistantPageExpression(args.expression);
      const userscriptApi = extensionUserscriptApi(this.api);
      if (!userscriptApi) throw new Error(USER_SCRIPTS_API_UNAVAILABLE);
      const [injection] = await userscriptApi.userScripts.execute({
        target: {
          tabId: this.target.tabId,
          documentIds: [this.target.documentId],
        },
        js: [{ code: assistantPageExecutionSource(expression) }],
        injectImmediately: true,
      });
      if (!injection || injection.result === undefined) {
        throw new Error('当前页面没有返回执行结果，页面可能已经跳转或失效。');
      }
      return {
        output: boundedAssistantPageExecutionOutput(injection.result),
      };
    }
    if (name === 'reload_page') {
      const previousDocumentId = this.target.documentId;
      await this.api.tabs.reload(this.target.tabId);
      const { attachment, waitedMs, settlementWindowMs } =
        await waitForReloadedPage(
          this.api,
          this.target.tabId,
          previousDocumentId,
        );
      this.target = attachment.target;
      return {
        output: JSON.stringify({
          reloaded: true,
          replacementBound: true,
          settled: true,
          waitedMs,
          settlementWindowMs,
          url: attachment.context.url,
          title: attachment.context.title,
        }),
      };
    }
    switch (name) {
      case 'inspect_page':
        break;
      case 'query_dom':
        requiredString(args, 'selector', 1_024);
        requiredLimit(args, 50);
        break;
      case 'search_page_text':
        requiredString(args, 'text', 512);
        requiredString(args, 'selector', 1_024);
        requiredLimit(args, 50);
        break;
      case 'read_dom_fragment': {
        requiredString(args, 'selector', 1_024);
        const maximum = args.max_characters;
        if (
          typeof maximum !== 'number' ||
          !Number.isInteger(maximum) ||
          maximum < 1_000 ||
          maximum > 32_000
        ) {
          throw new Error('max_characters 必须是 1000 到 32000 之间的整数。');
        }
        break;
      }
      case 'inspect_element':
        requiredString(args, 'selector', 1_024);
        break;
    }

    const [injection] = await this.api.scripting.executeScript({
      target: {
        tabId: this.target.tabId,
        documentIds: [this.target.documentId],
      },
      world: 'ISOLATED',
      func: assistantPageProbe,
      args: [{ name, args }],
    });
    if (!injection || injection.result === undefined) {
      throw new Error('当前页面没有返回观察结果，页面可能已经跳转或失效。');
    }
    const output = JSON.stringify(injection.result);
    return { output };
  }
}
