import { describe, expect, it, vi } from 'vitest';

import type { AiToolCall } from '../../ai/domain/types';
import { DEFAULT_USERSCRIPT_PRESENTATION } from '../../userscript/application/presentation';
import {
  queryInstalledUserscripts,
  type ScriptRepository,
} from '../../userscript/application/script-repository';
import { userscriptSourceRevision } from '../../userscript/application/script-revision';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  ASSISTANT_TOOLS,
  assistantCardSummaries,
  assistantTools,
  buildAssistantInstructions,
  executeAssistantTool,
} from './assistant-tools';

const repository: Pick<ScriptRepository, 'get' | 'query'> = {
  get: async (scriptId) =>
    structuredClone(
      INITIAL_USERSCRIPTS.find((script) => script.id === scriptId) ?? null,
    ),
  query: async (options) =>
    queryInstalledUserscripts(INITIAL_USERSCRIPTS, options),
};

function toolCall(
  name: string,
  args: Record<string, unknown> = {},
): AiToolCall {
  return {
    id: `call:${name}`,
    name,
    arguments: JSON.stringify(args),
    status: 'pending',
  };
}

function tabTools() {
  return {
    listTabs: async () => ({ selectedTabId: 7, tabs: [] }),
    selectTab: async (tabId: number) => ({ selected: true, tabId }),
    activateTab: async (tabId: number) => ({ activated: true, tabId }),
    closeTab: async (tabId: number) => ({ closed: true, tabId }),
  };
}

function context(
  applyScriptChange: (change: unknown) => Promise<unknown> = async (change) =>
    change,
) {
  return {
    repository,
    page: null,
    tabs: tabTools(),
    readRuntimeStates: async () => [],
    readRuntimeState: async () => undefined,
    invokeRuntimeCommand: async () => undefined,
    readPageUrl: async () => 'https://example.com/path',
    setDeckVisibility: async () => undefined,
    applyScriptChange,
    createUserscript: async () => {
      throw new Error('卡牌封面生成尚未配置。');
    },
    searchGreasyForkScripts: async (input: unknown) => input,
    installGreasyForkScript: async (scriptId: number) => ({ scriptId }),
    generateUserscriptCover: async () => {
      throw new Error('卡牌封面生成尚未配置。');
    },
  };
}

describe('卡牌大师智能体工具', () => {
  it('使用简体中文说明即时执行语义', () => {
    const instructions = buildAssistantInstructions(INITIAL_USERSCRIPTS);

    expect(instructions).toContain('必须始终使用简体中文');
    expect(instructions).toContain('每日回顾壁纸');
    expect(instructions).toContain('点名当天所有主要浏览主题');
    expect(instructions).toContain('能一眼认出的具体道具');
    expect(instructions).toContain('不存在提案、确认或等待安装步骤');
    expect(instructions).toContain('创建不会覆盖同身份脚本');
    expect(instructions).toContain('刚读取到的 revision');
    expect(instructions).toContain('先使用 inspect_page_userscript_runtimes');
    expect(instructions).toContain('pendingRefresh');
    expect(instructions).toContain('不得盲目重复创建、修改或触发');
    expect(instructions).toContain('指令法环');
    expect(instructions).toContain('GM_registerMenuCommand');
    expect(instructions).toContain('快捷入口');
    expect(instructions).toContain('id 必须是脚本内稳定且唯一');
    expect(instructions).toContain('return 可 JSON 序列化的简洁数据');
    expect(instructions).toContain(INITIAL_USERSCRIPTS[0].metadata.name);
    expect(instructions).toContain('新卡会直接使用项目已有的预设封面');
    expect(instructions).not.toContain(INITIAL_USERSCRIPTS[0].source.code);
    expect(instructions).not.toContain('awaitingUserConfirmation');
    expect(instructions).not.toContain('propose_userscript');
    expect(instructions).toContain('不得把完整脚本放进 old_text 或 new_text');
    expect(
      ASSISTANT_TOOLS.find((tool) => tool.name === 'create_userscript')
        ?.description,
    ).toContain('注册指令法环');
    expect(
      ASSISTANT_TOOLS.find((tool) => tool.name === 'create_userscript')
        ?.parameters.required,
    ).toEqual(['source']);
    expect(
      ASSISTANT_TOOLS.find((tool) => tool.name === 'edit_userscript')
        ?.parameters.properties,
    ).not.toHaveProperty('source');
  });

  it('始终提供封面工具并根据配置说明处理方式', () => {
    const tools = assistantTools().map((tool) => tool.name);
    const unavailableInstructions =
      buildAssistantInstructions(INITIAL_USERSCRIPTS);
    const instructions = buildAssistantInstructions(INITIAL_USERSCRIPTS, {
      cardCoverAvailable: true,
    });

    expect(tools).toContain('generate_userscript_cover');
    expect(tools).toHaveLength(25);
    expect(unavailableInstructions).toContain(
      'create_userscript 与图像服务完全独立',
    );
    expect(unavailableInstructions).toContain('生成自定义封面仍是标准创建流程');
    expect(unavailableInstructions).toContain('图像服务未配置也必须正常创建');
    expect(instructions).toContain(
      'Bright Whimsical Hand-Painted Fantasy Trading-Card Key Art / 明亮夸张手绘奇幻卡牌',
    );
    expect(instructions).toContain('只规定画风');
    expect(instructions).toContain('不会补充任何构图');
    expect(instructions).not.toContain('唯一标志性道具');
    expect(instructions).not.toContain('右侧叠牌安全区');
    expect(instructions).toContain('新建脚本只调用一次 create_userscript');
    expect(instructions).toContain('创建成功后必须在下一轮立即调用');
    expect(instructions).toContain('不得宣告整套卡牌创建流程已经完成');
    expect(instructions).toContain('不得再调用 edit_userscript 修改源码');
    expect(
      ASSISTANT_TOOLS.find((tool) => tool.name === 'create_userscript')
        ?.description,
    ).toContain('必须继续执行的封面生成步骤');
  });

  it('把封面主题、脚本身份和 revision 交给专用生成器', async () => {
    const generateUserscriptCover = vi.fn(async () => ({
      persisted: true,
      mutation: 'cover-updated',
    }));
    const revision = await userscriptSourceRevision(INITIAL_USERSCRIPTS[0]);
    const execution = await executeAssistantTool(
      toolCall('generate_userscript_cover', {
        target_script_id: INITIAL_USERSCRIPTS[0].id,
        expected_revision: revision,
        visual_concept:
          'A cursed archive warden purifying intrusive banners with a silver censer',
      }),
      {
        ...context(),
        generateUserscriptCover,
      },
    );

    expect(generateUserscriptCover).toHaveBeenCalledWith(
      INITIAL_USERSCRIPTS[0].id,
      revision,
      'A cursed archive warden purifying intrusive banners with a silver censer',
    );
    expect(JSON.parse(execution.output)).toMatchObject({
      persisted: true,
      mutation: 'cover-updated',
    });
  });

  it('只向模型提供有界卡牌摘要，不暴露源码', () => {
    const summaries = assistantCardSummaries(INITIAL_USERSCRIPTS);

    expect(summaries.cards[0]).toEqual({
      id: INITIAL_USERSCRIPTS[0].id,
      name: INITIAL_USERSCRIPTS[0].metadata.name,
      description: INITIAL_USERSCRIPTS[0].metadata.description,
      enabled: INITIAL_USERSCRIPTS[0].manager.enabled,
    });
    expect(JSON.stringify(summaries)).not.toContain(
      INITIAL_USERSCRIPTS[0].source.code,
    );
  });

  it('分页查询脚本摘要且不返回源码或伪运行状态', async () => {
    const scripts = Array.from({ length: 520 }, (_, index) => ({
      ...structuredClone(INITIAL_USERSCRIPTS[0]),
      id: `script-${index}`,
    }));
    const execution = await executeAssistantTool(
      toolCall('query_userscripts', {
        query: null,
        offset: 100,
        limit: 50,
      }),
      {
        repository: {
          get: async (scriptId) =>
            scripts.find((script) => script.id === scriptId) ?? null,
          query: async (options) => queryInstalledUserscripts(scripts, options),
        },
        page: null,
        tabs: tabTools(),
        readRuntimeStates: async () => [],
        readRuntimeState: async () => undefined,
        invokeRuntimeCommand: async () => undefined,
        readPageUrl: async () => 'https://example.com/path',
        setDeckVisibility: async () => undefined,
        applyScriptChange: async (change) => change,
        createUserscript: async () => {
          throw new Error('卡牌封面生成尚未配置。');
        },
        searchGreasyForkScripts: async (input) => input,
        installGreasyForkScript: async (scriptId) => ({ scriptId }),
        generateUserscriptCover: async () => {
          throw new Error('卡牌封面生成尚未配置。');
        },
      },
    );
    const result = JSON.parse(execution.output) as {
      scripts: Record<string, unknown>[];
      total: number;
      hasMore: boolean;
    };

    expect(result.scripts).toHaveLength(50);
    expect(result.total).toBe(520);
    expect(result.hasMore).toBe(true);
    expect(result.scripts[0]).not.toHaveProperty('source');
    expect(result.scripts[0]).not.toHaveProperty('runtimeStatus');
  });

  it('使用固定参数搜索 Greasy Fork，并只按数字 ID 安装', async () => {
    const searchGreasyForkScripts = vi.fn(async (input) => ({
      ...input,
      pageSize: 20,
      scripts: [],
    }));
    const installGreasyForkScript = vi.fn(async (scriptId: number) => ({
      persisted: true,
      marketplace: { provider: 'greasyfork', scriptId },
    }));
    const toolContext = {
      ...context(),
      searchGreasyForkScripts,
      installGreasyForkScript,
    };
    const searched = await executeAssistantTool(
      toolCall('search_greasyfork_scripts', {
        site: 'https://www.youtube.com/watch?v=1',
        query: 'enhancer',
        sort: 'ratings',
        page: 2,
      }),
      toolContext,
    );
    const installed = await executeAssistantTool(
      toolCall('install_greasyfork_script', { script_id: 30545 }),
      toolContext,
    );
    const searchTool = ASSISTANT_TOOLS.find(
      (tool) => tool.name === 'search_greasyfork_scripts',
    );

    expect(searchTool?.parameters.properties).not.toHaveProperty('limit');
    expect(searchTool?.parameters.properties).not.toHaveProperty('language');
    expect(searchTool?.parameters.properties).not.toHaveProperty('locale');
    expect(searchGreasyForkScripts).toHaveBeenCalledWith({
      site: 'www.youtube.com',
      query: 'enhancer',
      sort: 'ratings',
      page: 2,
    });
    expect(JSON.parse(searched.output)).toMatchObject({
      pageSize: 20,
      scripts: [],
    });
    expect(installGreasyForkScript).toHaveBeenCalledWith(30545);
    expect(JSON.parse(installed.output)).toMatchObject({
      persisted: true,
      marketplace: { provider: 'greasyfork', scriptId: 30545 },
    });
  });

  it('只在明确读取一张卡牌时返回完整持久化信息和 revision', async () => {
    const script = INITIAL_USERSCRIPTS[0];
    const execution = await executeAssistantTool(
      toolCall('read_userscript', { script_id: script.id }),
      context(),
    );
    const result = JSON.parse(execution.output) as Record<string, unknown>;

    expect(result.id).toBe(script.id);
    expect(result.source).toEqual(script.source);
    expect(result.manager).toEqual(script.manager);
    expect(result.metadata).toMatchObject({
      name: script.metadata.name,
      namespace: script.metadata.namespace,
      version: script.metadata.version,
      matches: script.metadata.matches,
      grants: script.metadata.grants,
    });
    expect(result.revision).toBe(await userscriptSourceRevision(script));
  });

  it('读取已有封面时只返回状态，不把图片数据发送给模型', async () => {
    const script = structuredClone(INITIAL_USERSCRIPTS[0]);
    script.presentation = {
      accent: DEFAULT_USERSCRIPT_PRESENTATION.accent,
      media: {
        kind: 'image',
        image: 'data:image/webp;base64,Y292ZXI=',
      },
    };
    const execution = await executeAssistantTool(
      toolCall('read_userscript', { script_id: script.id }),
      {
        ...context(),
        repository: {
          get: async () => script,
          query: repository.query,
        },
      },
    );

    expect(execution.output).not.toContain('data:image/webp;base64');
    expect(JSON.parse(execution.output)).toMatchObject({
      presentation: {
        media: {
          kind: 'image',
          coverImage: {
            configured: true,
            mimeType: 'image/webp',
          },
        },
      },
    });
  });

  it('按中文名称查询脚本并读取当前页真实运行时', async () => {
    const runtime = {
      ...INITIAL_USERSCRIPTS[0].runtime,
      tabId: 17,
      instanceId: 'instance-current',
      status: 'ready' as const,
    };
    const queried = await executeAssistantTool(
      toolCall('query_userscripts', {
        query: '净域',
        offset: 0,
        limit: 10,
      }),
      context(),
    );
    const inspected = await executeAssistantTool(
      toolCall('inspect_userscript_runtime', {
        script_id: INITIAL_USERSCRIPTS[0].id,
      }),
      {
        ...context(),
        readRuntimeState: async () => runtime,
      },
    );
    const inspectedPage = await executeAssistantTool(
      toolCall('inspect_page_userscript_runtimes'),
      {
        ...context(),
        readRuntimeStates: async () => [
          {
            scriptId: INITIAL_USERSCRIPTS[0].id,
            name: INITIAL_USERSCRIPTS[0].metadata.name,
            enabled: true,
            runtime,
          },
        ],
      },
    );

    expect(JSON.parse(queried.output)).toMatchObject({
      total: 1,
      scripts: [{ id: INITIAL_USERSCRIPTS[0].id }],
    });
    expect(JSON.parse(inspected.output)).toEqual({
      scriptId: INITIAL_USERSCRIPTS[0].id,
      runtime,
    });
    expect(JSON.parse(inspectedPage.output)).toMatchObject({
      runningCount: 1,
      commandCount: runtime.commands.length,
      refreshRequiredCount: 0,
      scripts: [{ scriptId: INITIAL_USERSCRIPTS[0].id, runtime }],
    });
  });

  it('页面工具同时支持即时操作和按需观察', async () => {
    const names = ASSISTANT_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([
      'list_tabs',
      'select_tab',
      'activate_tab',
      'close_tab',
      'execute_page',
      'reload_page',
      'inspect_page',
      'query_dom',
      'search_page_text',
      'read_dom_fragment',
      'inspect_element',
      'query_userscripts',
      'search_greasyfork_scripts',
      'install_greasyfork_script',
      'read_userscript',
      'inspect_page_userscript_runtimes',
      'inspect_userscript_runtime',
      'create_userscript',
      'edit_userscript',
      'delete_userscript',
      'set_userscript_enabled',
      'set_userscript_site_enabled',
      'invoke_userscript_command',
      'set_deck_visibility',
    ]);

    const executePage = vi.fn(async () => ({
      output: '{"counts":{"elements":12}}',
    }));
    const page = { execute: executePage };
    const execution = await executeAssistantTool(toolCall('inspect_page'), {
      repository,
      page,
      tabs: tabTools(),
      readRuntimeStates: async () => [],
      readRuntimeState: async () => undefined,
      invokeRuntimeCommand: async () => undefined,
      readPageUrl: async () => 'https://example.com/path',
      setDeckVisibility: async () => undefined,
      applyScriptChange: async (change) => change,
      createUserscript: async () => {
        throw new Error('卡牌封面生成尚未配置。');
      },
      searchGreasyForkScripts: async (input) => input,
      installGreasyForkScript: async (scriptId) => ({ scriptId }),
      generateUserscriptCover: async () => {
        throw new Error('卡牌封面生成尚未配置。');
      },
    });

    expect(execution.output).toContain('"elements":12');
    await executeAssistantTool(
      toolCall('execute_page', {
        expression:
          '(() => { document.querySelector("button")?.click(); return true; })()',
      }),
      {
        repository,
        page,
        tabs: tabTools(),
        readRuntimeStates: async () => [],
        readRuntimeState: async () => undefined,
        invokeRuntimeCommand: async () => undefined,
        readPageUrl: async () => 'https://example.com/path',
        setDeckVisibility: async () => undefined,
        applyScriptChange: async (change) => change,
        createUserscript: async () => {
          throw new Error('卡牌封面生成尚未配置。');
        },
        searchGreasyForkScripts: async (input) => input,
        installGreasyForkScript: async (scriptId) => ({ scriptId }),
        generateUserscriptCover: async () => {
          throw new Error('卡牌封面生成尚未配置。');
        },
      },
    );
    expect(executePage).toHaveBeenLastCalledWith('execute_page', {
      expression:
        '(() => { document.querySelector("button")?.click(); return true; })()',
    });
  });

  it('实时列出、选择、激活和关闭浏览器标签页', async () => {
    const tabs = {
      listTabs: vi.fn(async () => ({
        selectedTabId: 7,
        tabs: [{ id: 7, title: 'Example', selected: true }],
      })),
      selectTab: vi.fn(async (tabId: number) => ({
        selected: true,
        tab: { id: tabId },
      })),
      activateTab: vi.fn(async (tabId: number) => ({
        activated: true,
        tab: { id: tabId },
      })),
      closeTab: vi.fn(async (tabId: number) => ({
        closed: true,
        tab: { id: tabId },
      })),
    };
    const toolContext = { ...context(), tabs };

    await executeAssistantTool(toolCall('list_tabs'), toolContext);
    await executeAssistantTool(
      toolCall('select_tab', { tab_id: 11 }),
      toolContext,
    );
    await executeAssistantTool(
      toolCall('activate_tab', { tab_id: 12 }),
      toolContext,
    );
    await executeAssistantTool(
      toolCall('close_tab', { tab_id: 13 }),
      toolContext,
    );

    expect(tabs.listTabs).toHaveBeenCalledOnce();
    expect(tabs.selectTab).toHaveBeenCalledWith(11);
    expect(tabs.activateTab).toHaveBeenCalledWith(12);
    expect(tabs.closeTab).toHaveBeenCalledWith(13);
  });

  it('创建脚本后返回强制封面步骤，并立即提交其他局部操作', async () => {
    const applyScriptChange = vi.fn(async (change: unknown) => ({
      change,
      committed: true,
      runtimeSynchronized: true,
    }));
    const createUserscript = vi.fn(async (source: string) => ({
      source,
      committed: true,
      runtimeSynchronized: true,
      script: {
        id: 'created-script',
        revision: 'sha256:created',
      },
    }));
    const toolContext = {
      ...context(applyScriptChange),
      createUserscript,
      generateUserscriptCover: vi.fn(async () => ({})),
    };
    const source = INITIAL_USERSCRIPTS[0].source.code;
    const revision = await userscriptSourceRevision(INITIAL_USERSCRIPTS[0]);
    const oldText = '// @version     2.4.1';
    const newText = '// @version     2.4.2';
    const editCall = toolCall('edit_userscript', {
      target_script_id: INITIAL_USERSCRIPTS[0].id,
      expected_revision: revision,
      edits: [{ old_text: oldText, new_text: newText }],
    });

    const created = await executeAssistantTool(
      toolCall('create_userscript', {
        source,
      }),
      toolContext,
    );
    const edited = await executeAssistantTool(editCall, toolContext);
    const editArguments = JSON.parse(editCall.arguments) as Record<
      string,
      unknown
    >;
    expect(editArguments).not.toHaveProperty('source');
    await executeAssistantTool(
      toolCall('delete_userscript', {
        target_script_id: INITIAL_USERSCRIPTS[0].id,
      }),
      toolContext,
    );
    await executeAssistantTool(
      toolCall('set_userscript_enabled', {
        target_script_id: INITIAL_USERSCRIPTS[0].id,
        enabled: false,
      }),
      toolContext,
    );

    expect(createUserscript).toHaveBeenCalledWith(source);
    expect(JSON.parse(created.output)).toMatchObject({
      script: {
        id: 'created-script',
        revision: 'sha256:created',
      },
      nextAction: {
        required: true,
        tool: 'generate_userscript_cover',
        target_script_id: 'created-script',
        expected_revision: 'sha256:created',
      },
    });
    expect(applyScriptChange.mock.calls.map(([change]) => change)).toEqual([
      {
        operation: 'edit',
        targetScriptId: INITIAL_USERSCRIPTS[0].id,
        expectedRevision: revision,
        edits: [{ oldText, newText }],
      },
      {
        operation: 'delete',
        targetScriptId: INITIAL_USERSCRIPTS[0].id,
      },
      {
        operation: 'set-enabled',
        targetScriptId: INITIAL_USERSCRIPTS[0].id,
        enabled: false,
      },
    ]);
    expect(JSON.parse(created.output)).toMatchObject({
      committed: true,
      runtimeSynchronized: true,
    });
    expect(JSON.parse(edited.output)).not.toHaveProperty('nextAction');
  });

  it('调用当前页真实指令、设置本站启停并显式控制牌阵', async () => {
    const command = {
      id: 'command-1',
      title: '净化页面',
      autoClose: true,
      order: 0,
    };
    const invokeRuntimeCommand = vi.fn(async () => ({
      removed: 12,
      mode: 'strict',
    }));
    const applyScriptChange = vi.fn(async (change) => ({
      change,
      persisted: true,
    }));
    const setDeckVisibility = vi.fn(async () => undefined);
    const toolContext = {
      ...context(applyScriptChange),
      readRuntimeState: async () => ({
        ...INITIAL_USERSCRIPTS[0].runtime,
        instanceId: 'runtime-current',
        status: 'ready' as const,
        commands: [command],
      }),
      invokeRuntimeCommand,
      readPageUrl: async () => 'https://www.example.com/path?q=1',
      setDeckVisibility,
    };

    const invoked = await executeAssistantTool(
      toolCall('invoke_userscript_command', {
        script_id: INITIAL_USERSCRIPTS[0].id,
        command_id: command.id,
      }),
      toolContext,
    );
    await executeAssistantTool(
      toolCall('set_userscript_site_enabled', {
        target_script_id: INITIAL_USERSCRIPTS[0].id,
        enabled: false,
      }),
      toolContext,
    );
    await executeAssistantTool(
      toolCall('set_deck_visibility', { visibility: 'open' }),
      toolContext,
    );

    expect(invokeRuntimeCommand).toHaveBeenCalledWith(
      INITIAL_USERSCRIPTS[0].id,
      command.id,
    );
    expect(JSON.parse(invoked.output)).toMatchObject({
      invoked: true,
      command: { id: command.id, title: command.title },
      value: { removed: 12, mode: 'strict' },
    });
    expect(applyScriptChange).toHaveBeenCalledWith({
      operation: 'set-site-enabled',
      targetScriptId: INITIAL_USERSCRIPTS[0].id,
      sitePattern: '*://*.example.com/*',
      enabled: false,
    });
    expect(setDeckVisibility).toHaveBeenCalledWith('open');
  });

  it('拒绝调用当前页没有注册的脚本指令', async () => {
    await expect(
      executeAssistantTool(
        toolCall('invoke_userscript_command', {
          script_id: INITIAL_USERSCRIPTS[0].id,
          command_id: 'missing-command',
        }),
        {
          ...context(),
          readRuntimeState: async () => ({
            ...INITIAL_USERSCRIPTS[0].runtime,
            instanceId: 'runtime-current',
            status: 'ready' as const,
            commands: [],
          }),
        },
      ),
    ).rejects.toThrow('当前脚本实例没有注册该指令');
  });
});
