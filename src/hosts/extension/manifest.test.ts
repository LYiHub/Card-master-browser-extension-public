import { describe, expect, it } from 'vitest';
import chromiumTarget from '../../../extension/manifest.chromium.json';
import commonManifest from '../../../extension/manifest.common.json';
import firefoxTarget from '../../../extension/manifest.firefox.json';
import safariTarget from '../../../extension/manifest.safari.json';
import filterCatalog from '../../content-blocking/domain/filter-catalog.json';

const chromiumManifest = { ...commonManifest, ...chromiumTarget };
const firefoxManifest = { ...commonManifest, ...firefoxTarget };
const safariManifest = { ...commonManifest, ...safariTarget };

describe('跨浏览器扩展清单', () => {
  it('保持统一的产品身份与能力描述', () => {
    expect(commonManifest.name).toBe('卡牌大师');
    expect(commonManifest.short_name).toBe('卡牌大师');
    expect(commonManifest.version).toBe('0.1.0');
    expect(commonManifest.description).toBe(
      '以游戏化卡牌统一管理用户脚本与网页能力：AI 创建脚本、原生内容过滤、页面光影、媒体控制、视频增强与游戏手柄交互。',
    );
    expect(commonManifest.default_locale).toBe('zh_CN');
    expect(commonManifest.chrome_url_overrides).toEqual({
      newtab: 'new-tab.html',
    });
    expect(commonManifest.options_ui).toEqual({
      page: 'new-tab-settings.html',
      open_in_tab: true,
    });
  });

  it('使用卡牌大师 Logo 作为扩展身份和默认工具栏图标', () => {
    const defaultIcon =
      'project-assets/userscript-deck/visual/action-icons/card-master-logo.png';
    expect(Object.values(commonManifest.icons)).toEqual([
      defaultIcon,
      defaultIcon,
      defaultIcon,
      defaultIcon,
    ]);
    expect(commonManifest.action.default_icon).toBe(defaultIcon);
    expect(firefoxManifest.action.default_icon).toBe(defaultIcon);
    expect(firefoxManifest.sidebar_action.default_icon).toBe(defaultIcon);
  });

  it('为 Chromium 声明侧边栏和用户脚本能力', () => {
    expect(chromiumManifest.manifest_version).toBe(3);
    expect(chromiumManifest.minimum_chrome_version).toBe('135');
    expect(chromiumManifest.permissions).toEqual(
      expect.arrayContaining([
        'bookmarks',
        'declarativeNetRequestWithHostAccess',
        'favicon',
        'history',
        'offscreen',
        'search',
        'scripting',
        'sidePanel',
        'storage',
        'tabs',
        'topSites',
        'userScripts',
        'webNavigation',
      ]),
    );
    expect(chromiumManifest.background).toEqual({
      service_worker: 'background.js',
      type: 'module',
    });
    expect(chromiumManifest.side_panel).toEqual({
      default_path: 'assistant.html',
    });
    expect(chromiumManifest.options_ui).toEqual({
      page: 'new-tab-settings.html',
      open_in_tab: true,
    });
  });

  it('为 Firefox 声明原生侧栏、事件后台与可选 Userscripts 权限', () => {
    expect(firefoxManifest.permissions).not.toContain('userScripts');
    expect(firefoxManifest.optional_permissions).toEqual(['userScripts']);
    expect(firefoxManifest.permissions).toContain('webRequestBlocking');
    expect(firefoxManifest.permissions).not.toContain('sidePanel');
    expect(firefoxManifest.permissions).not.toContain('offscreen');
    expect(firefoxManifest.permissions).toEqual(
      expect.arrayContaining(['bookmarks', 'history', 'search', 'topSites']),
    );
    expect(firefoxManifest.options_ui).toEqual({
      page: 'new-tab-settings.html',
      open_in_tab: true,
    });
    expect(firefoxManifest.background).toEqual({
      scripts: ['background.js'],
    });
    expect(firefoxManifest.action.default_title).toBe('打开卡牌大师智能体');
    expect(firefoxManifest.sidebar_action).toEqual({
      default_title: '卡牌大师智能体',
      default_panel: 'assistant.html',
      default_icon:
        'project-assets/userscript-deck/visual/action-icons/card-master-logo.png',
      open_at_install: false,
    });
    expect(firefoxManifest.browser_specific_settings.gecko).toEqual({
      id: 'card-master@linyi.video',
      strict_min_version: '153.0',
    });
  });

  it('为 Safari 移除浏览器尚未提供的 Userscripts 与 Side Panel 权限', () => {
    expect(safariManifest.permissions).not.toContain('userScripts');
    expect(safariManifest.permissions).not.toContain('sidePanel');
    expect(safariManifest.permissions).not.toContain('offscreen');
    expect(safariManifest.permissions).not.toContain('downloads');
    expect(safariManifest.permissions).not.toContain('notifications');
    expect(safariManifest.permissions).not.toContain('bookmarks');
    expect(safariManifest.permissions).not.toContain('history');
    expect(safariManifest.permissions).not.toContain('search');
    expect(safariManifest.permissions).not.toContain('topSites');
    expect(safariManifest.permissions).not.toContain('favicon');
    expect(safariManifest.background).toEqual({
      service_worker: 'background.js',
      scripts: ['background.js'],
    });
    expect(safariManifest.options_ui).toEqual({
      page: 'new-tab-settings.html',
      open_in_tab: true,
    });
    expect(safariManifest.chrome_url_overrides).toEqual({
      newtab: 'new-tab.html',
    });
    expect(safariManifest).not.toHaveProperty('incognito');
    expect(safariManifest).not.toHaveProperty('side_panel');
    expect(safariManifest).not.toHaveProperty('sidebar_action');
    expect(safariManifest.content_scripts).toEqual(
      expect.arrayContaining([
        {
          matches: ['<all_urls>'],
          js: ['media-speed-proxy.js', 'safari-main-world-bootstrap.js'],
          run_at: 'document_start',
          all_frames: true,
          match_about_blank: true,
        },
        {
          matches: ['<all_urls>'],
          js: ['safari-userscript-runtime.js'],
          run_at: 'document_start',
          all_frames: true,
        },
      ]),
    );
    expect(
      safariManifest.content_scripts.every((entry) => !('world' in entry)),
    ).toBe(true);
    expect(
      safariManifest.content_scripts.flatMap((entry) => entry.js),
    ).not.toContain('js/card-master-adapter.js');
    expect(
      safariManifest.content_scripts.flatMap((entry) => entry.js),
    ).not.toContain('js/content-script.js');
    expect(safariManifest.content_scripts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          js: ['vendor/bilibili/sponsor/js/document.js'],
        }),
        expect.objectContaining({
          js: ['vendor/youtube/sponsor/js/document.js'],
        }),
      ]),
    );
  });

  it('让 Chromium 与 Firefox 共享页面宿主，并为 Safari 增加脚本调度器', () => {
    expect(commonManifest.content_scripts.map((entry) => entry.js)).toEqual(
      expect.arrayContaining([
        ['bilibili-recommendation-proxy.js'],
        ['bilibili-capability-content.js'],
        ['vendor/bilibili/pakku/generated/xhr_hook.js'],
        ['vendor/bilibili/pakku/generated/content_script.js'],
        [
          'vendor/bilibili/sponsor/runtime-adapter.js',
          'vendor/bilibili/sponsor/js/content.js',
        ],
        ['vendor/bilibili/sponsor/js/document.js'],
        [
          'vendor/youtube/sponsor/runtime-adapter.js',
          'vendor/youtube/sponsor/js/content.js',
        ],
        ['vendor/youtube/sponsor/js/document.js'],
        ['theme-proxy.js'],
        ['theme-content.js'],
        ['media-speed-proxy.js'],
        ['gamepad-content.js'],
        ['media-speed-content.js'],
        ['js/card-master-adapter.js', 'js/content-script.js'],
        ['adguard-content.js'],
        ['content.js'],
      ]),
    );
    for (const resource of [
      'content-host.js',
      'content-detail.js',
      'content-audio.js',
    ]) {
      expect(
        commonManifest.web_accessible_resources[0]?.resources,
      ).not.toContain(resource);
      expect(
        safariManifest.web_accessible_resources[0]?.resources,
      ).not.toContain(resource);
    }
    expect(
      [
        ...commonManifest.content_scripts,
        ...safariManifest.content_scripts,
      ].flatMap((entry) => entry.js),
    ).not.toContain('theme-fallback.js');
    expect(commonManifest.web_accessible_resources[0]?.resources).not.toContain(
      'assistant-speech-worklet.js',
    );
    for (const manifest of [commonManifest, safariManifest]) {
      for (const script of manifest.content_scripts.filter((entry) =>
        entry.js.some((file) => file.startsWith('media-speed-')),
      )) {
        expect(script).toMatchObject({
          all_frames: true,
          match_about_blank: true,
        });
      }
    }
    expect(safariManifest.web_accessible_resources[0]?.resources).not.toContain(
      'assistant-speech-worklet.js',
    );
    expect(
      commonManifest.content_scripts
        .filter((entry) =>
          entry.js.includes('vendor/bilibili/sponsor/js/content.js'),
        )
        .flatMap((entry) => entry.matches),
    ).not.toContain('https://*.bilibili.com/*');
    expect(
      commonManifest.content_scripts.some(
        (entry) => 'exclude_matches' in entry,
      ),
    ).toBe(true);
    expect(
      commonManifest.content_scripts.find((entry) =>
        entry.js.includes('gamepad-content.js'),
      ),
    ).not.toHaveProperty('world');
    expect(commonManifest.web_accessible_resources[0]?.resources).toContain(
      'gamepad-control-content.js',
    );
  });

  it('让 pakku 按浏览器复用上游主世界注入路径', () => {
    expect(commonManifest.content_scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          js: ['vendor/bilibili/pakku/generated/xhr_hook.js'],
          exclude_matches: [
            'https://www.bilibili.com/robots.txt?pakku_sandbox',
            'https://message.bilibili.com/*',
          ],
          all_frames: true,
          world: 'MAIN',
        }),
      ]),
    );
    expect(safariManifest.content_scripts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          js: ['vendor/bilibili/pakku/assets/xhr_hook_injector.js'],
          exclude_matches: [
            'https://www.bilibili.com/robots.txt?pakku_sandbox',
            'https://message.bilibili.com/*',
          ],
          all_frames: true,
        }),
      ]),
    );
  });

  it('让静态拦截规则与过滤器目录保持一致', () => {
    expect(commonManifest.declarative_net_request.rule_resources).toEqual(
      filterCatalog.map((filter) => ({
        id: `ruleset_${filter.filterId}`,
        enabled: filter.defaultEnabled,
        path: `filters/declarative/ruleset_${filter.filterId}/ruleset_${filter.filterId}.json`,
      })),
    );
  });
});
