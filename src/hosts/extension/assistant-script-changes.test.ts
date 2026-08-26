import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_USERSCRIPT_PRESENTATION } from '../../userscript/application/presentation';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import { applyAssistantScriptChange } from './assistant-script-changes';
import { executeAssistantTool } from './assistant-tools';

describe('AI 脚本即时操作', () => {
  it('创建工具立即提交并返回强制封面步骤', async () => {
    const createUserscript = vi.fn(async () => ({
      committed: true,
      runtimeSynchronized: true,
      execution: { status: 'ready' },
      script: {
        id: 'created-script',
        revision: 'sha256:created',
      },
    }));

    const result = await executeAssistantTool(
      {
        id: 'tool',
        name: 'create_userscript',
        arguments: JSON.stringify({
          source:
            '// ==UserScript==\n// @name 示例\n// @namespace demo\n// @version 1.0.0\n// @match https://example.com/*\n// ==/UserScript==\n',
        }),
        status: 'running',
      },
      {
        repository: {
          get: async () => null,
          query: async ({ offset, limit }) => ({
            scripts: [],
            total: 0,
            offset,
            limit,
            hasMore: false,
          }),
        },
        page: null,
        tabs: {
          listTabs: async () => ({ tabs: [] }),
          selectTab: async (tabId) => ({ tabId }),
          activateTab: async (tabId) => ({ tabId }),
          closeTab: async (tabId) => ({ tabId }),
        },
        readRuntimeStates: async () => [],
        readRuntimeState: async () => undefined,
        invokeRuntimeCommand: async () => undefined,
        readPageUrl: async () => 'https://example.com/',
        setDeckVisibility: async () => undefined,
        applyScriptChange: async (change) => change,
        createUserscript,
        searchGreasyForkScripts: async (input) => input,
        installGreasyForkScript: async (scriptId) => ({ scriptId }),
        generateUserscriptCover: async () => {
          throw new Error('卡牌封面生成尚未配置。');
        },
      },
    );

    expect(createUserscript).toHaveBeenCalledWith(
      expect.stringContaining('@name 示例'),
    );
    expect(JSON.parse(result.output)).toMatchObject({
      committed: true,
      runtimeSynchronized: true,
      execution: { status: 'ready' },
      nextAction: {
        required: true,
        tool: 'generate_userscript_cover',
        target_script_id: 'created-script',
        expected_revision: 'sha256:created',
      },
    });
    expect(result.output).not.toContain('proposal');
    expect(result.output).not.toContain('confirmation');
  });

  it('创建结果使用现有预设封面而不要求自定义图片', () => {
    const source =
      '// ==UserScript==\n// @name 原子创建\n// @namespace demo\n// @version 1.0.0\n// @match https://example.com/*\n// ==/UserScript==\n';
    const result = applyAssistantScriptChange([], {
      operation: 'create',
      source,
    });
    if (result.mode === 'removed') {
      throw new Error('创建脚本不应返回删除结果。');
    }

    expect(result.script.presentation?.media).toMatchObject({
      kind: 'video',
      video: expect.stringContaining('/userscript-cards/'),
    });
    expect(result.script.source.code).toBe(source);
  });

  it('从市场安装时保留官方来源地址', () => {
    const source =
      '// ==UserScript==\n// @name 市场脚本\n// @namespace demo\n// @version 1.0.0\n// @match https://example.com/*\n// ==/UserScript==\n';
    const origin = 'https://update.greasyfork.org/scripts/123/example.user.js';
    const result = applyAssistantScriptChange([], {
      operation: 'create',
      source,
      origin,
    });
    if (result.mode === 'removed') {
      throw new Error('创建脚本不应返回删除结果。');
    }

    expect(result.script.source.origin).toBe(origin);
  });

  it('局部修改只替换唯一文本并保留其他源码与管理配置', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    script.presentation = {
      ...DEFAULT_USERSCRIPT_PRESENTATION,
    };
    const oldText = '// @version     2.4.1';
    const newText = '// @version     2.4.2';
    const result = applyAssistantScriptChange([script], {
      operation: 'edit',
      targetScriptId: script.id,
      expectedRevision: 'revision',
      edits: [{ oldText, newText }],
    });
    if (result.mode === 'removed') {
      throw new Error('局部修改不应删除脚本。');
    }

    expect(result.script.source.code).toBe(
      script.source.code.replace(oldText, newText),
    );
    expect(result.script.manager).toEqual(script.manager);
    expect(result.script.presentation).toEqual(script.presentation);
  });

  it('拒绝缺失或匹配到多处的旧文本', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);

    expect(() =>
      applyAssistantScriptChange([script], {
        operation: 'edit',
        targetScriptId: script.id,
        expectedRevision: 'revision',
        edits: [{ oldText: '不存在的代码', newText: '替换内容' }],
      }),
    ).toThrow('找不到指定的旧文本');
    expect(() =>
      applyAssistantScriptChange([script], {
        operation: 'edit',
        targetScriptId: script.id,
        expectedRevision: 'revision',
        edits: [{ oldText: '\n', newText: '\n\n' }],
      }),
    ).toThrow('匹配到多处');
    expect(() =>
      applyAssistantScriptChange([script], {
        operation: 'edit',
        targetScriptId: script.id,
        expectedRevision: 'revision',
        edits: [
          {
            oldText: script.source.code,
            newText: script.source.code.replace('2.4.1', '2.4.2'),
          },
        ],
      }),
    ).toThrow('不能替换完整源码');
  });

  it('本站停用追加根域名规则，重新启用时精确移除', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const disabled = applyAssistantScriptChange([script], {
      operation: 'set-site-enabled',
      targetScriptId: script.id,
      sitePattern: '*://*.example.com/*',
      enabled: false,
    });
    if (disabled.mode === 'removed') {
      throw new Error('本站启停不应删除脚本。');
    }
    expect(disabled.script.manager).toMatchObject({
      enabled: script.manager.enabled,
      userExcludeMatches: ['*://*.example.com/*'],
    });

    const enabled = applyAssistantScriptChange(disabled.scripts, {
      operation: 'set-site-enabled',
      targetScriptId: script.id,
      sitePattern: '*://*.example.com/*',
      enabled: true,
    });
    if (enabled.mode === 'removed') {
      throw new Error('本站启停不应删除脚本。');
    }
    expect(enabled.script.manager.userExcludeMatches).toEqual([]);
  });

  it('只更新卡牌封面，不改写用户脚本源码或运行配置', () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    const coverImage = 'data:image/webp;base64,Y292ZXI=';
    const coverAccent = '#72aabb';
    const result = applyAssistantScriptChange([script], {
      operation: 'set-cover-image',
      targetScriptId: script.id,
      expectedRevision: 'revision',
      coverImage,
      coverAccent,
    });
    if (result.mode === 'removed') {
      throw new Error('设置封面不应删除脚本。');
    }

    expect(result.script.presentation?.media).toEqual({
      kind: 'image',
      image: coverImage,
    });
    expect(result.script.presentation?.accent).toBe(coverAccent);
    expect(result.script.source).toEqual(script.source);
    expect(result.script.manager).toEqual(script.manager);
  });
});
