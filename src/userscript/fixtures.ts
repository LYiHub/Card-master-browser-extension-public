import { parseUserscriptMetadata } from './domain/metadata';
import type { InstalledUserscript } from './domain/types';

const LOCAL_MATCH = 'http://127.0.0.1/*';
const now = Date.now();

type Fixture = {
  id: string;
  enabled?: boolean;
  source: string;
};

function fixture(input: Fixture): InstalledUserscript {
  const parsed = parseUserscriptMetadata(input.source);
  if (!parsed.metadata) {
    throw new Error(
      `Invalid fixture ${input.id}: ${parsed.diagnostics.map((item) => item.message).join('; ')}`,
    );
  }
  return {
    kind: 'userscript',
    id: input.id,
    source: {
      code: input.source,
      installedAt: now,
      updatedAt: now,
    },
    metadata: parsed.metadata,
    manager: {
      enabled: input.enabled !== false,
      checkForUpdates: true,
      userMatches: [],
      userIncludes: [],
      userExcludeMatches: [],
      userExcludes: [],
    },
    runtime: {
      tabId: 1,
      frameId: 0,
      instanceId: null,
      status: input.enabled === false ? 'sleeping' : 'idle',
      commands: [],
      pendingRefresh: false,
    },
  };
}

export const INITIAL_USERSCRIPTS: InstalledUserscript[] = [
  fixture({
    id: 'script-cleanse',
    source: `// ==UserScript==
// @name        净域守望
// @namespace   card-master
// @version     2.4.1
// @description 扫描当前页面并记录结构概况
// @author      民间工坊
// @match       ${LOCAL_MATCH}
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// @run-at      document-idle
// @noframes
// ==/UserScript==

GM_registerMenuCommand('扫描此页', () => {
  const summary = {
    headings: document.querySelectorAll('h1, h2, h3').length,
    links: document.links.length,
    images: document.images.length,
  };
  GM_setValue('last-scan', summary);
}, { id: 'scan-page', title: '统计当前页面的标题、链接和图片' });

GM_registerMenuCommand('铭记此站', () => {
  GM_setValue('remembered-origin', location.origin);
}, { id: 'remember-site', title: '保存当前网站来源' });`,
  }),
  fixture({
    id: 'script-night',
    source: `// ==UserScript==
// @name        夜幕工坊
// @namespace   card-master
// @version     5.2.0
// @description 为当前页面切换克制的夜间阅读效果
// @author      暮色议会
// @match       ${LOCAL_MATCH}
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @run-at      document-end
// @noframes
// ==/UserScript==

GM_addStyle(\`
  html.userscript-night-mode {
    filter: brightness(.82) contrast(.96) saturate(.86);
    background: #101416;
  }
\`);

GM_registerMenuCommand('切换夜幕', () => {
  document.documentElement.classList.toggle('userscript-night-mode');
}, { id: 'toggle-night', title: '切换当前页面夜间效果', autoClose: false });`,
  }),
  fixture({
    id: 'script-link-compass',
    source: `// ==UserScript==
// @name        链接罗盘
// @namespace   card-master
// @version     3.7.6
// @description 标记页面中的站外链接并生成可见清单
// @author      旅团档案室
// @match       ${LOCAL_MATCH}
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @run-at      document-end
// @noframes
// ==/UserScript==

GM_addStyle('a[data-userscript-external] { outline: 1px dashed #c17fb9; outline-offset: 2px; }');

GM_registerMenuCommand('标记站外链接', () => {
  for (const link of document.links) {
    if (link.origin !== location.origin) link.dataset.userscriptExternal = 'true';
  }
}, { id: 'mark-external', title: '标记所有离开当前网站的链接', autoClose: false });`,
  }),
  fixture({
    id: 'script-form',
    enabled: false,
    source: `// ==UserScript==
// @name        存档篝火
// @namespace   card-master
// @version     1.3.0
// @description 保存当前页面表单中的可恢复文本
// @author      无名记录者
// @match       ${LOCAL_MATCH}
// @grant       GM_setValue
// @grant       GM_registerMenuCommand
// @run-at      document-idle
// @noframes
// ==/UserScript==

GM_registerMenuCommand('立即存档', () => {
  const values = [...document.querySelectorAll('input, textarea')]
    .map((field) => ({ name: field.name || field.id, value: field.value }))
    .filter((entry) => entry.name);
  GM_setValue('form-snapshot', values);
}, { id: 'save-now', title: '保存当前页面可识别的表单字段' });`,
  }),
  fixture({
    id: 'script-bilingual',
    source: `// ==UserScript==
// @name        双语译典
// @namespace   card-master
// @version     4.9.2
// @description 切换页面语言标记和双语阅读状态
// @author      抄写员公会
// @match       ${LOCAL_MATCH}
// @grant       GM_registerMenuCommand
// @run-at      document-end
// @noframes
// ==/UserScript==

GM_registerMenuCommand('切换双语标记', () => {
  const active = document.documentElement.dataset.userscriptBilingual !== 'true';
  document.documentElement.dataset.userscriptBilingual = String(active);
  document.documentElement.lang = active ? 'zh-CN' : '';
}, { id: 'toggle-bilingual', title: '切换当前页面的双语阅读标记', autoClose: false });`,
  }),
  fixture({
    id: 'script-element-banish',
    source: `// ==UserScript==
// @name        元素放逐
// @namespace   card-master
// @version     1.0.0
// @description 选择并隐藏当前页面中的一个元素
// @author      界面净化局
// @match       ${LOCAL_MATCH}
// @grant       GM_registerMenuCommand
// @run-at      document-idle
// @noframes
// ==/UserScript==

GM_registerMenuCommand('选择并隐藏元素', () => {
  let current = null;
  const previousOutline = new WeakMap();
  const restore = (element) => {
    if (!element) return;
    element.style.outline = previousOutline.get(element) || '';
  };
  const cleanup = () => {
    restore(current);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerdown', choose, true);
    document.removeEventListener('keydown', cancel, true);
  };
  const move = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;
    restore(current);
    current = target;
    previousOutline.set(target, target.style.outline);
    target.style.outline = '2px solid #ff765d';
  };
  const choose = (event) => {
    if (!current) return;
    event.preventDefault();
    event.stopPropagation();
    const target = current;
    cleanup();
    target.hidden = true;
  };
  const cancel = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cleanup();
  };
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerdown', choose, true);
  document.addEventListener('keydown', cancel, true);
}, {
  id: 'banish-element',
  title: '脚本自行进入页面元素选择状态，Esc 取消',
  autoClose: false,
});`,
  }),
  fixture({
    id: 'script-focus',
    enabled: false,
    source: `// ==UserScript==
// @name        支线封印师
// @namespace   card-master
// @version     2.1.4
// @description 隐藏页面侧栏、推荐区和次要导航
// @author      清修院
// @match       ${LOCAL_MATCH}
// @grant       GM_registerMenuCommand
// @run-at      document-idle
// @noframes
// ==/UserScript==

GM_registerMenuCommand('封印页面支线', () => {
  for (const element of document.querySelectorAll('aside, [role="complementary"]')) {
    element.hidden = true;
  }
}, { id: 'focus-page', title: '隐藏页面中的侧栏和补充区域' });`,
  }),
];
