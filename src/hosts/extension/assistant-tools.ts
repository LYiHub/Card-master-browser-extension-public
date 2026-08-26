import type { AiToolCall } from '../../ai/domain/types';
import type { AiModelToolDefinition } from '../../ai/infrastructure/model-client';
import type { DeckVisibility } from '../../features/userscript-deck/deck-entry';
import { resolveSiteScope } from '../../lib/site-scope';
import { DAILY_REVIEW_PLANNING_RULES } from '../../new-tab/application/daily-review-wallpaper';
import {
  CARD_ART_ASSISTANT_GUIDANCE,
  CARD_ART_STYLE_NAME,
} from '../../userscript/application/card-art-direction';
import { UserscriptInstallError } from '../../userscript/application/install-service';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import { userscriptSourceRevision } from '../../userscript/application/script-revision';
import {
  SUPPORTED_USERSCRIPT_METADATA_KEYS,
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../../userscript/domain/metadata';
import type {
  InstalledUserscript,
  RuntimeMenuCommand,
  UserscriptRuntimeState,
} from '../../userscript/domain/types';
import {
  IGNORED_USERSCRIPT_EXECUTION_METADATA,
  SUPPORTED_USERSCRIPT_GRANTS,
} from '../../userscript/runtime/compatibility';
import {
  ASSISTANT_PAGE_TOOL_NAMES,
  type AssistantPageToolExecutor,
  type AssistantPageToolName,
} from './assistant-page-observer';
import type {
  AssistantScriptChange,
  AssistantSourceEdit,
} from './assistant-script-changes';
import {
  GREASY_FORK_SORTS,
  type GreasyForkSearchInput,
  validateGreasyForkSearchInput,
} from './greasyfork-client';
import { isCardCoverVisualConceptText } from './image-card-cover';

const MAX_ASSISTANT_SCRIPT_QUERY_LENGTH = 512;
const MAX_ASSISTANT_SCRIPT_QUERY_RESULTS = 100;

export type DeckStewardCardSummary = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

export function assistantCardSummaries(
  scripts: readonly InstalledUserscript[],
) {
  return {
    cards: scripts.map((script) => ({
      id: script.id.trim(),
      name: userscriptDisplayName(script.metadata).trim(),
      description: userscriptDisplayDescription(script.metadata).trim(),
      enabled: script.manager.enabled,
    })),
    omittedCount: 0,
  };
}

export function buildAssistantInstructions(
  scripts: readonly InstalledUserscript[] = [],
  options: { cardCoverAvailable?: boolean } = {},
) {
  const summaries = assistantCardSummaries(scripts);
  const cardCoverInstructions = options.cardCoverAvailable
    ? `卡牌封面生成：
- generate_userscript_cover 会为一张已安装脚本生成并立即应用静态卡牌封面，不修改用户脚本源码。
- 新建脚本只调用一次 create_userscript，并只传入完整源码。创建成功后必须在下一轮立即调用 generate_userscript_cover，直接使用创建结果返回的 script.id 和 script.revision，不需要再次读取脚本。
- 生成封面是标准创建流程，不等待用户额外提出要求。在 generate_userscript_cover 成功前，不得宣告整套卡牌创建流程已经完成。
- 为已有脚本生成或更换封面时，必须先使用 read_userscript 获取脚本功能和最新 revision。
- generate_userscript_cover 成功即代表新封面已经写入卡牌展示数据，不得再调用 edit_userscript 修改源码来引用图片。
- visual_concept 必须使用纯英文，并忠实描述脚本功能与用户希望生成的画面内容。用户没有指定的部分可以自由创作，不要自行添加固定构图模板。
- ${CARD_ART_ASSISTANT_GUIDANCE}
- 用户提出其他画风时，只提取其中与画面内容和设计有关的部分，不改变项目固定画风。
- 工具只会补充项目统一画风和原创性要求，不会补充任何构图、位置、占比、安全区、角色数量或画面内容限制。`
    : `卡牌封面生成：
- create_userscript 与图像服务完全独立。新卡会直接使用项目已有的预设封面，图像服务未配置也必须正常创建和注入脚本。
- 生成自定义封面仍是标准创建流程，但当前图像服务未配置。创建完成后必须明确说明卡牌暂时保留预设封面，不得假装已经生成自定义封面。`;
  return `你是 Card Master 智能体。必须始终使用简体中文回复用户，DOM、API 等专有术语可以保留原文。

每日回顾壁纸：
- 用户要求写摘要、画面描述或深度生图提示词时，直接给出可粘贴的摘要和画面描述，不要只给抽象气氛。
- ${DAILY_REVIEW_PLANNING_RULES.join(' ')}

你可以解释和总结当前选定目标页、直接完成一次性页面操作、检查已安装卡牌，创建、修改、删除或启停标准用户脚本，调用当前目标页已经注册的卡牌指令，并明确展开或收起牌阵。一次性页面操作使用 execute_page，不会持久化。所有用户脚本创建和修改工具都会立即提交到仓库并同步运行时，不存在提案、确认或等待安装步骤；没有旧实例占用当前文档时会尝试立即注入，正在运行或等待刷新的旧实例不会被新代码叠加覆盖。

已安装卡牌采用渐进式读取。下面提供名称和描述清单；只有相关卡牌才读取完整源码：
<installed_userscript_summaries>
${JSON.stringify(summaries)}
</installed_userscript_summaries>

用户脚本能力范围如下：
<userscript_capabilities>
${JSON.stringify({
  metadata: [...SUPPORTED_USERSCRIPT_METADATA_KEYS],
  grants: [...SUPPORTED_USERSCRIPT_GRANTS],
  ignoredExecutionMetadata: [...IGNORED_USERSCRIPT_EXECUTION_METADATA],
})}
</userscript_capabilities>

执行方式：
- 助手界面所在标签页与当前操作目标相互独立。初始目标只是打开助手时的标签页，不得假设它永远有效。
- 需要了解浏览器当前有哪些页面时调用 list_tabs。它每次返回实时标签页清单和当前选择标记，不依赖旧快照。
- 操作其他标签页前，先从 list_tabs 取得真实 tab_id，再调用 select_tab。select_tab 只改变后续页面、运行时、牌阵和脚本即时生效的目标，不切换用户可见页面。
- activate_tab 只切换用户可见页面和所属窗口焦点，不暗中改变操作目标。需要继续操作该页时仍应调用 select_tab。
- 只有用户明确要求关闭某个标签页时才调用 close_tab。关闭当前目标后，必须重新调用 list_tabs 和 select_tab，不得猜测替代目标。
- 初始页面上下文只是当前选定目标的轻量快照。需要精确选择器、交互或布局判断时，按需使用 inspect_page、query_dom、search_page_text、read_dom_fragment 和 inspect_element 查看实时页面。
- 每次页面工具都会重新绑定当前目标的最新顶层文档，不能复用导航前的 documentId。
- execute_page 用于用户明确要求的当前目标页即时操作，可设置值、派发事件、点击、提交、滚动并返回结果。多条语句使用能返回简洁验证结果的 IIFE。
- reload_page 用于刷新当前选定目标页。工具会等待替换后的新文档完成加载并进入稳定状态，返回后必须重新使用 inspect_page 或其他观察工具确认结果。
- 页面导航、刷新或发生较大变化后，继续操作前重新检查页面。
- 操作原生或框架控制的表单时，使用对应的原生属性 setter，并派发可冒泡的 input/change 事件。

用户脚本规则：
- 使用 query_userscripts 搜索或分页查看脚本清单；修改、删除或启停现有脚本前使用 read_userscript 读取目标。
- 使用 search_greasyfork_scripts 按网站搜索 Greasy Fork 上的公开脚本。搜索固定包含全部语言并固定每页返回 20 条；需要更多结果时递增 page，不得虚构 limit、language 或 locale 参数。
- Greasy Fork 搜索只用于发现和比较。只有用户明确要求安装某个搜索结果时，才使用 install_greasyfork_script，并直接传入搜索结果中的数字 id；不得把推荐、比较或查看详情理解为安装授权。
- install_greasyfork_script 会从 Greasy Fork 官方 API 重新读取详情、从官方更新源下载源码并走本项目的标准安装、预检、持久化和运行时同步链路。不得使用 execute_page 模拟安装，也不得自行传递 code_url。
- read_userscript 返回完整持久化信息、源码和 revision。创建脚本使用 create_userscript 并传入完整源码；修改脚本必须使用 edit_userscript，传入目标脚本 id、刚读取到的 revision，以及一个或多个局部 edits。
- create_userscript 只提交源码，并以项目预设封面作为生成期间的临时展示。图像服务可用时，创建结果返回后必须立即使用其中的 script.id 和 script.revision 调用 generate_userscript_cover；封面工具会自行应用生成结果，不得再修改脚本源码。
- edit_userscript 的每项 old_text 必须原样复制自刚读取的源码，并且在当前源码中只出现一次；new_text 只包含替换后的局部内容。选择能唯一定位修改点的最小文本范围，不得把完整脚本放进 old_text 或 new_text。多项修改按照数组顺序依次应用。
- 创建不会覆盖同身份脚本。修改完成后系统会重新解析完整结果并检查 metadata 与脚本合法性。
- 删除使用 delete_userscript，启停使用 set_userscript_enabled。工具成功返回即代表操作已经完成。
- 需要了解当前目标标签页全部脚本实例、指令和错误时优先使用 inspect_page_userscript_runtimes；已经明确目标脚本时可使用 inspect_userscript_runtime。不要根据仓库启停状态猜测运行状态。
- 调用卡牌指令前必须先使用 inspect_page_userscript_runtimes 或 inspect_userscript_runtime 读取当前目标页真实注册的 command_id，再调用 invoke_userscript_command。不得根据名称猜测指令 ID。
- 当前站点的独立启停使用 set_userscript_site_enabled。它只修改当前主机的匹配排除规则，不会替代全局启停；全局已停用的脚本仍需使用 set_userscript_enabled 启用。
- 需要控制牌阵时使用 set_deck_visibility，并明确传入 open 或 closed。不要用页面 DOM 操作模拟插件入口，也不要假设当前可见状态后执行盲目切换。
- 创建、修改或启停后必须先读取工具返回的 runtime.effect、injection、execution、refreshRequired 和 reloadRequested。注入已经成功且页面出现预期效果时立即停止，不得再次修改、注入或触发。
- 只有用户明确要求执行某个功能，或者脚本源码明确说明功能必须通过菜单指令启动时，才调用 invoke_userscript_command。脚本自动生效后不得为了“确认”而额外调用指令。
- 用户反馈“没有效果”“没有变化”时，先使用 inspect_page_userscript_runtimes 或 inspect_userscript_runtime 检查真实实例、错误和 pendingRefresh，再检查页面证据。只有 runtime.effect 为 refresh-required/reload-requested、pendingRefresh 为 true、已启用且匹配当前目标页的脚本没有运行实例，或源码明确依赖 document-start、首次加载事件、早期网络请求和页面初始化顺序时才调用 reload_page。
- reload_page 返回后必须重新检查运行时和页面；仍无效果时再检查匹配规则、选择器和脚本实现，不得盲目重复创建、修改或触发。
- GM 值和管理器匹配覆盖目前不可写，不要虚构设置能力。
- 源码是唯一持久化的功能事实。不要虚构 DSL、隐藏扩展 API、额外页面能力、设置结构或不支持的 GM API。
- 根据页面证据选择稳定选择器，优先语义属性和结构锚点。观察器和事件处理必须有界、幂等，并能安全重复运行。
- 只使用支持的元数据和 grants。@match 尽量精确，不需要 frame 时优先 @noframes，并只声明实际使用的最小授权集合。
- 涉及首屏隐藏、重排、改色、布局修正或其他需要避免原页面闪现的视觉脚本，必须声明 @run-at document-start，并在脚本顶层同步插入关键 CSS。不得等待 DOMContentLoaded、load、异步请求或 MutationObserver 回调后才应用首屏样式；观察器只负责后续动态内容。
- 其他脚本选择最早且合理的 @run-at。未声明时平台按 document-end 执行；只有确实需要等待页面空闲的任务才使用 document-idle。
- 私有全局 AI grants 为 CM_ai 和 CM.ai，仅在卡牌确实需要全局 AI 能力时使用。

${cardCoverInstructions}

指令法环：
- 本项目会把用户脚本通过 GM_registerMenuCommand 或 GM.registerMenuCommand 注册的菜单指令直接呈现为卡牌周围的“指令法环”。这是脚本向用户提供手动操作入口的首选方式，不是普通浏览器菜单。
- 当用户提出“快捷入口”“快捷方式”“手动触发”“按需执行”“提供一个选项”“提供切换功能”“不要自动执行”或语义相近的需求时，优先把能力设计为一个或多个指令法环。除非用户明确要求页面内控件，否则不要向原网页额外插入悬浮按钮；除非用户明确要求自动执行，否则不要在脚本加载时直接执行一次性动作。
- 推荐使用 GM_registerMenuCommand，并在元数据中声明 @grant GM_registerMenuCommand。调用格式为 GM_registerMenuCommand(显示名称, 回调函数, 配置)。
- 配置中的 id 必须是脚本内稳定且唯一的语义化标识，避免脚本更新后指令身份变化；title 用于说明该法环的具体作用；autoClose 默认为 true。存在多个指令时，按照对用户的重要性依次注册，最重要的指令最先注册。
- 指令法环只会在脚本匹配当前页面、处于启用状态且注册语句已经执行后出现。需要始终提供的指令应在脚本启动阶段直接注册，不要把注册语句藏在可能永远不会触发的页面事件中。
- 回调函数中实现真正的功能，并让同一个回调可以被安全地重复触发。不要注册空指令，也不要用指令法环代替用户明确要求的持续自动化。
- 指令需要向智能体报告执行结果时，回调应 return 可 JSON 序列化的简洁数据；Promise 的最终值同样会被返回。不要返回 DOM 节点、函数、循环引用或大对象；没有业务结果时可以不返回值。
<command_ring_example>
// @grant       GM_registerMenuCommand
GM_registerMenuCommand('切换阅读模式', () => {
  document.documentElement.classList.toggle('reader-mode');
}, {
  id: 'toggle-reader-mode',
  title: '切换当前页面的阅读模式',
  autoClose: true,
});
</command_ring_example>

完成要求：
- 简洁说明使用的页面证据和已经完成的操作。
- 工具成功后直接说明脚本已经创建或修改、同步和执行结果，不得再要求用户确认。
- 证据不足时继续检查或明确说明限制，不要猜测。
- 面向用户的回复只描述页面、卡牌和操作结果，不展示标签页或窗口 ID、脚本 ID、revision、command_id、请求 ID、文件名、模型 ID、协议名称、工具名称、原始 JSON、底层错误或诊断信息。除非用户明确要求技术排查，否则不要让用户处理内部标识。
- 推理只保留决策、证据和工具使用，不得包含凭据或无关的私密页面、脚本内容。`;
}

export const ASSISTANT_TOOLS = [
  {
    name: 'list_tabs',
    description:
      '实时列出浏览器当前打开的标签页，返回精简的 ID、窗口、顺序、标题、地址、活动状态、加载状态和当前智能体选择标记。需要操作其他页面或当前目标失效时先调用。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'select_tab',
    description:
      '选择后续页面观察、页面执行、脚本运行时、牌阵控制和脚本即时生效所使用的目标标签页。此操作不会切换用户当前可见页面。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tab_id: { type: 'integer', minimum: 0 },
      },
      required: ['tab_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'activate_tab',
    description:
      '切换并聚焦用户可见的浏览器标签页。此操作不会改变智能体当前选择的操作目标；需要操作该页时仍要调用 select_tab。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tab_id: { type: 'integer', minimum: 0 },
      },
      required: ['tab_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'close_tab',
    description:
      '关闭指定浏览器标签页。只在用户明确要求关闭该标签页时调用；关闭当前操作目标后必须重新列出并选择目标。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tab_id: { type: 'integer', minimum: 0 },
      },
      required: ['tab_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'execute_page',
    description:
      '在当前目标页立即执行一个 JavaScript 表达式，用于一次性检查或交互。多条语句使用 IIFE。可以查询 DOM、设置值、派发事件、点击、提交、滚动，并返回序列化结果和控制台输出。此工具不会安装或持久化用户脚本。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          minLength: 1,
          maxLength: 65_536,
        },
      },
      required: ['expression'],
      additionalProperties: false,
    },
  },
  {
    name: 'reload_page',
    description:
      '刷新当前目标标签页，等待替换后的新文档完成加载并稳定，然后自动重新绑定后续页面工具。用于排查脚本已经注入但尚未呈现效果的情况。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_page',
    description:
      '读取当前目标页的精简结构摘要，包括视口、元素数量、标题和地标；不包含扩展界面。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_dom',
    description:
      '使用 CSS 选择器查询当前目标页，返回元素快照、候选稳定选择器、文字、属性、可见性和边界。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['selector', 'limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_page_text',
    description: '在指定 CSS 选择器范围内查找文字包含目标内容的页面元素。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        selector: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['text', 'selector', 'limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_dom_fragment',
    description: '使用 CSS 选择器读取一段当前目标页 DOM。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        max_characters: {
          type: 'integer',
          minimum: 1_000,
          maximum: 32_000,
        },
      },
      required: ['selector', 'max_characters'],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_element',
    description:
      '检查一个当前目标页元素，包括选择器、边界、祖先、属性以及与布局和交互相关的计算样式。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_userscripts',
    description:
      '按名称、命名空间、描述、匹配规则或仓库 ID 搜索已安装用户脚本，也可以传入 null 分页列出脚本。只返回摘要，不返回源码。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          anyOf: [
            {
              type: 'string',
              maxLength: MAX_ASSISTANT_SCRIPT_QUERY_LENGTH,
            },
            { type: 'null' },
          ],
        },
        offset: { type: 'integer', minimum: 0 },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_ASSISTANT_SCRIPT_QUERY_RESULTS,
        },
      },
      required: ['query', 'offset', 'limit'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_greasyfork_scripts',
    description:
      '通过 Greasy Fork 官方只读 API，按网站域名搜索可安装的公开用户脚本。搜索固定包含全部语言并固定每页返回 20 条；翻页只需递增 page。返回用于判断的精简摘要，不返回作者、版本、协议或源码地址。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        site: {
          type: 'string',
          minLength: 1,
          maxLength: 2_048,
          description: '网站域名或完整 HTTP/HTTPS 网址。',
        },
        query: {
          anyOf: [
            {
              type: 'string',
              maxLength: MAX_ASSISTANT_SCRIPT_QUERY_LENGTH,
            },
            { type: 'null' },
          ],
        },
        sort: {
          type: 'string',
          enum: [...GREASY_FORK_SORTS],
        },
        page: {
          type: 'integer',
          minimum: 1,
          maximum: 10_000,
        },
      },
      required: ['site', 'query', 'sort', 'page'],
      additionalProperties: false,
    },
  },
  {
    name: 'install_greasyfork_script',
    description:
      '按 Greasy Fork 搜索结果中的数字 ID 安装脚本。工具会重新读取官方详情、校验官方更新源、下载源码并立即完成标准预检、持久化、运行时同步和卡牌创建。只在用户明确要求安装该脚本时调用。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        script_id: {
          type: 'integer',
          minimum: 1,
        },
      },
      required: ['script_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_userscript',
    description:
      '按仓库 ID 读取一个已安装用户脚本的完整持久化信息、源码和用于并发修改校验的 revision。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        script_id: { type: 'string' },
      },
      required: ['script_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_page_userscript_runtimes',
    description:
      '一次读取当前目标标签页顶层文档中全部已安装脚本的启停状态、真实运行时实例、指令、错误和刷新要求。排查页面能力或不确定目标脚本时优先使用。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'inspect_userscript_runtime',
    description:
      '读取一个脚本在当前目标标签页顶层文档中的真实运行时状态、实例、指令和错误。没有运行实例时明确返回 null。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        script_id: { type: 'string' },
      },
      required: ['script_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_userscript',
    description:
      '原子创建一张完整脚本卡牌。只需提供标准 .user.js 源码；系统会同步运行时并尝试在当前目标页执行。创建结果会返回必须继续执行的封面生成步骤，下一轮应使用 script.id 和 script.revision 调用 generate_userscript_cover。用户需要快捷入口、手动触发或按需执行时，应使用 GM_registerMenuCommand 注册指令法环。此操作不需要用户确认。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_userscript',
    description:
      '立即局部修改一个已安装的用户脚本。每项编辑使用当前源码中唯一的 old_text 替换为 new_text，只传递需要变化的片段，不重新输出完整脚本。全部编辑会在同一事务中应用、重新检查并同步运行时。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target_script_id: { type: 'string' },
        expected_revision: { type: 'string' },
        edits: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              old_text: {
                type: 'string',
                minLength: 1,
              },
              new_text: {
                type: 'string',
              },
            },
            required: ['old_text', 'new_text'],
            additionalProperties: false,
          },
        },
      },
      required: ['target_script_id', 'expected_revision', 'edits'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_userscript',
    description:
      '立即删除一个已安装的用户脚本，并同步运行时。此操作不需要用户确认。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target_script_id: { type: 'string' },
      },
      required: ['target_script_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_userscript_enabled',
    description:
      '立即启用或停用一个已安装的用户脚本，并同步运行时、尝试在当前目标页执行。此操作不需要用户确认。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target_script_id: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['target_script_id', 'enabled'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_userscript_site_enabled',
    description:
      '立即设置一个用户脚本是否在当前站点生效。只修改当前主机的匹配排除规则，不改变脚本的全局启停状态。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        target_script_id: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['target_script_id', 'enabled'],
      additionalProperties: false,
    },
  },
  {
    name: 'invoke_userscript_command',
    description:
      '调用一个用户脚本在当前目标标签页真实注册的卡牌指令，并返回该回调提供的结构化结果。script_id 和 command_id 必须来自 inspect_page_userscript_runtimes 或 inspect_userscript_runtime。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        script_id: { type: 'string' },
        command_id: { type: 'string' },
      },
      required: ['script_id', 'command_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_deck_visibility',
    description:
      '明确展开或收起当前目标标签页的牌阵。此工具是幂等操作，不会盲目反转当前状态。',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        visibility: {
          type: 'string',
          enum: ['open', 'closed'],
        },
      },
      required: ['visibility'],
      additionalProperties: false,
    },
  },
] as const satisfies readonly AiModelToolDefinition[];

export const GENERATE_USERSCRIPT_COVER_TOOL = {
  name: 'generate_userscript_cover',
  description: `为一张已安装用户脚本生成并立即应用静态卡牌封面，不修改脚本源码。所有封面强制使用项目统一的“${CARD_ART_STYLE_NAME}”风格。刚创建的脚本直接使用 create_userscript 返回的 id 和 revision；已有脚本必须先读取最新 revision。`,
  strict: true,
  parameters: {
    type: 'object',
    properties: {
      target_script_id: { type: 'string' },
      expected_revision: { type: 'string' },
      visual_concept: {
        type: 'string',
        minLength: 1,
        description:
          '纯英文画面概念。忠实描述用户希望生成的画面内容，不包含画风。',
      },
    },
    required: ['target_script_id', 'expected_revision', 'visual_concept'],
    additionalProperties: false,
  },
} as const satisfies AiModelToolDefinition;

export function assistantTools() {
  return [...ASSISTANT_TOOLS, GENERATE_USERSCRIPT_COVER_TOOL];
}

export type AssistantToolExecution = { output: string };

export type AssistantUserscriptRuntimeSnapshot = {
  scriptId: string;
  name: string;
  enabled: boolean;
  runtime: UserscriptRuntimeState | null;
};

export type AssistantTabToolExecutor = {
  listTabs(): Promise<unknown>;
  selectTab(tabId: number): Promise<unknown>;
  activateTab(tabId: number): Promise<unknown>;
  closeTab(tabId: number): Promise<unknown>;
};

export type AssistantToolContext = {
  repository: Pick<ScriptRepository, 'get' | 'query'>;
  page: AssistantPageToolExecutor | null;
  tabs: AssistantTabToolExecutor;
  readRuntimeStates: () => Promise<AssistantUserscriptRuntimeSnapshot[]>;
  readRuntimeState: (
    scriptId: string,
  ) => Promise<UserscriptRuntimeState | undefined>;
  invokeRuntimeCommand: (
    scriptId: string,
    commandId: string,
  ) => Promise<unknown>;
  readPageUrl: () => Promise<string>;
  setDeckVisibility: (visibility: DeckVisibility) => Promise<void>;
  applyScriptChange: (change: AssistantScriptChange) => Promise<unknown>;
  createUserscript: (source: string) => Promise<unknown>;
  searchGreasyForkScripts: (input: GreasyForkSearchInput) => Promise<unknown>;
  installGreasyForkScript: (scriptId: number) => Promise<unknown>;
  generateUserscriptCover: (
    targetScriptId: string,
    expectedRevision: string,
    visualConcept: string,
  ) => Promise<unknown>;
};

function requiredIdentifier(
  args: Record<string, unknown>,
  name: string,
  toolName: string,
) {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${toolName} 需要 ${name}。`);
  }
  return value.trim();
}

function requiredTabId(args: Record<string, unknown>, toolName: string) {
  const tabId = args.tab_id;
  if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || tabId < 0) {
    throw new Error(`${toolName} 需要有效的 tab_id。`);
  }
  return tabId;
}

function currentSitePattern(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('当前目标标签页地址无效，无法设置本站启停。');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !url.hostname ||
    url.hostname.includes(':')
  ) {
    throw new Error('本站启停只支持使用普通主机名的 HTTP 或 HTTPS 页面。');
  }
  const scope = resolveSiteScope(url.href);
  if (!scope) throw new Error('当前目标标签页地址无法转换为本站规则。');
  return scope.matchPattern;
}

function registeredCommand(
  runtime: UserscriptRuntimeState,
  commandId: string,
): RuntimeMenuCommand | undefined {
  return runtime.commands.find((command) => command.id === commandId);
}

function scriptSummary(script: InstalledUserscript) {
  return {
    id: script.id,
    name: userscriptDisplayName(script.metadata),
    namespace: script.metadata.namespace,
    version: script.metadata.version,
    description: userscriptDisplayDescription(script.metadata),
    enabled: script.manager.enabled,
    matches: script.metadata.matches,
    includes: script.metadata.includes,
    grants: script.metadata.grants,
    hasCoverImage: script.presentation?.media.kind === 'image',
  };
}

function scriptPresentation(script: InstalledUserscript) {
  const presentation = script.presentation;
  if (!presentation) return null;
  return {
    accent: presentation.accent,
    media:
      presentation.media.kind === 'image'
        ? {
            kind: 'image',
            coverImage: {
              configured: true,
              mimeType: 'image/webp',
            },
          }
        : {
            kind: 'video',
            video: presentation.media.video,
          },
  };
}

function parseArguments(value: string) {
  const parsed = JSON.parse(value || '{}') as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('工具参数必须是 JSON 对象。');
  }
  return parsed as Record<string, unknown>;
}

function createUserscriptResult(created: unknown) {
  const result: Record<string, unknown> =
    created && typeof created === 'object' && !Array.isArray(created)
      ? { ...(created as Record<string, unknown>) }
      : { created };
  const script =
    result.script &&
    typeof result.script === 'object' &&
    !Array.isArray(result.script)
      ? (result.script as Record<string, unknown>)
      : null;
  return {
    ...result,
    nextAction: {
      required: true,
      tool: 'generate_userscript_cover',
      ...(typeof script?.id === 'string'
        ? { target_script_id: script.id }
        : {}),
      ...(typeof script?.revision === 'string'
        ? { expected_revision: script.revision }
        : {}),
      visual_concept_instruction:
        '根据刚创建脚本的实际功能撰写纯英文画面概念，不包含画风。',
      instruction:
        '接下来必须调用 generate_userscript_cover。该工具会生成并立即应用封面，不要再调用 edit_userscript 修改源码。',
    },
  };
}

export async function executeAssistantTool(
  toolCall: AiToolCall,
  context: AssistantToolContext,
): Promise<AssistantToolExecution> {
  const args = parseArguments(toolCall.arguments);
  if (ASSISTANT_PAGE_TOOL_NAMES.some((name) => name === toolCall.name)) {
    if (!context.page) {
      throw new Error('当前会话没有绑定浏览器标签页，无法操作实时页面。');
    }
    return context.page.execute(toolCall.name as AssistantPageToolName, args);
  }
  let result: unknown;
  switch (toolCall.name) {
    case 'list_tabs': {
      result = await context.tabs.listTabs();
      break;
    }
    case 'select_tab': {
      result = await context.tabs.selectTab(requiredTabId(args, toolCall.name));
      break;
    }
    case 'activate_tab': {
      result = await context.tabs.activateTab(
        requiredTabId(args, toolCall.name),
      );
      break;
    }
    case 'close_tab': {
      result = await context.tabs.closeTab(requiredTabId(args, toolCall.name));
      break;
    }
    case 'query_userscripts': {
      const query = args.query;
      const offset = args.offset;
      const limit = args.limit;
      if (
        (query !== null &&
          (typeof query !== 'string' ||
            query.length > MAX_ASSISTANT_SCRIPT_QUERY_LENGTH)) ||
        typeof offset !== 'number' ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        typeof limit !== 'number' ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_ASSISTANT_SCRIPT_QUERY_RESULTS
      ) {
        throw new Error(
          `query_userscripts 需要有效的 query、offset 和 1 到 ${MAX_ASSISTANT_SCRIPT_QUERY_RESULTS} 之间的 limit。`,
        );
      }
      const page = await context.repository.query({
        query: query?.trim() || null,
        offset,
        limit,
      });
      result = {
        ...page,
        scripts: page.scripts.map(scriptSummary),
      };
      break;
    }
    case 'search_greasyfork_scripts': {
      const input = validateGreasyForkSearchInput({
        site: args.site,
        query: args.query,
        sort: args.sort,
        page: args.page,
      });
      result = await context.searchGreasyForkScripts(input);
      break;
    }
    case 'install_greasyfork_script': {
      const scriptId = args.script_id;
      if (
        typeof scriptId !== 'number' ||
        !Number.isSafeInteger(scriptId) ||
        scriptId < 1
      ) {
        throw new Error('install_greasyfork_script 需要有效的 script_id。');
      }
      result = await context.installGreasyForkScript(scriptId);
      break;
    }
    case 'read_userscript': {
      const scriptId = args.script_id;
      if (typeof scriptId !== 'string' || !scriptId.trim()) {
        throw new Error('read_userscript 需要 script_id。');
      }
      const script = await context.repository.get(scriptId);
      if (!script) throw new Error(`找不到用户脚本：${scriptId}`);
      result = {
        id: script.id,
        kind: script.kind,
        revision: await userscriptSourceRevision(script),
        source: script.source,
        presentation: scriptPresentation(script),
        metadata: script.metadata,
        manager: script.manager,
      };
      break;
    }
    case 'inspect_page_userscript_runtimes': {
      const scripts = await context.readRuntimeStates();
      result = {
        scripts,
        runningCount: scripts.filter(({ runtime }) =>
          Boolean(runtime?.instanceId),
        ).length,
        commandCount: scripts.reduce(
          (total, { runtime }) => total + (runtime?.commands.length ?? 0),
          0,
        ),
        refreshRequiredCount: scripts.filter(
          ({ runtime }) => runtime?.pendingRefresh,
        ).length,
      };
      break;
    }
    case 'inspect_userscript_runtime': {
      const scriptId = args.script_id;
      if (typeof scriptId !== 'string' || !scriptId.trim()) {
        throw new Error('inspect_userscript_runtime 需要 script_id。');
      }
      const runtime = await context.readRuntimeState(scriptId);
      result = {
        scriptId,
        runtime: runtime ?? null,
      };
      break;
    }
    case 'create_userscript': {
      const source = args.source;
      if (typeof source !== 'string' || !source.trim()) {
        throw new Error('create_userscript 需要完整源码。');
      }
      result = createUserscriptResult(await context.createUserscript(source));
      break;
    }
    case 'edit_userscript': {
      const targetScriptId = requiredIdentifier(
        args,
        'target_script_id',
        'edit_userscript',
      );
      const expectedRevision = requiredIdentifier(
        args,
        'expected_revision',
        'edit_userscript',
      );
      if (!Array.isArray(args.edits) || args.edits.length === 0) {
        throw new Error('edit_userscript 至少需要一项 edit。');
      }
      const edits: AssistantSourceEdit[] = args.edits.map(
        (candidate, index) => {
          if (
            !candidate ||
            typeof candidate !== 'object' ||
            Array.isArray(candidate)
          ) {
            throw new Error(`edit_userscript 的第 ${index + 1} 项 edit 无效。`);
          }
          const edit = candidate as Record<string, unknown>;
          const oldText = edit.old_text;
          const newText = edit.new_text;
          if (
            typeof oldText !== 'string' ||
            !oldText ||
            typeof newText !== 'string'
          ) {
            throw new Error(
              `edit_userscript 的第 ${index + 1} 项 edit 文本无效。`,
            );
          }
          return { oldText, newText };
        },
      );
      result = await context.applyScriptChange({
        operation: 'edit',
        targetScriptId,
        expectedRevision,
        edits,
      });
      break;
    }
    case 'delete_userscript':
    case 'set_userscript_enabled': {
      const targetScriptId = args.target_script_id;
      if (
        typeof targetScriptId !== 'string' ||
        !targetScriptId.trim() ||
        (toolCall.name === 'set_userscript_enabled' &&
          typeof args.enabled !== 'boolean')
      ) {
        throw new Error(
          toolCall.name === 'delete_userscript'
            ? 'delete_userscript 需要 target_script_id。'
            : 'set_userscript_enabled 需要 target_script_id 和 enabled。',
        );
      }
      result = await context.applyScriptChange(
        toolCall.name === 'delete_userscript'
          ? { operation: 'delete', targetScriptId }
          : {
              operation: 'set-enabled',
              targetScriptId,
              enabled: args.enabled === true,
            },
      );
      break;
    }
    case 'set_userscript_site_enabled': {
      const targetScriptId = requiredIdentifier(
        args,
        'target_script_id',
        'set_userscript_site_enabled',
      );
      if (typeof args.enabled !== 'boolean') {
        throw new Error(
          'set_userscript_site_enabled 需要 target_script_id 和 enabled。',
        );
      }
      const script = await context.repository.get(targetScriptId);
      if (!script) throw new Error(`找不到用户脚本：${targetScriptId}`);
      const sitePattern = currentSitePattern(await context.readPageUrl());
      result = await context.applyScriptChange({
        operation: 'set-site-enabled',
        targetScriptId,
        sitePattern,
        enabled: args.enabled,
      });
      break;
    }
    case 'generate_userscript_cover': {
      const targetScriptId = requiredIdentifier(
        args,
        'target_script_id',
        'generate_userscript_cover',
      );
      const expectedRevision = requiredIdentifier(
        args,
        'expected_revision',
        'generate_userscript_cover',
      );
      const visualConcept = requiredIdentifier(
        args,
        'visual_concept',
        'generate_userscript_cover',
      );
      if (!isCardCoverVisualConceptText(visualConcept)) {
        throw new Error(
          'generate_userscript_cover 需要有效的纯英文 visual_concept。',
        );
      }
      result = await context.generateUserscriptCover(
        targetScriptId,
        expectedRevision,
        visualConcept,
      );
      break;
    }
    case 'invoke_userscript_command': {
      const scriptId = requiredIdentifier(
        args,
        'script_id',
        'invoke_userscript_command',
      );
      const commandId = requiredIdentifier(
        args,
        'command_id',
        'invoke_userscript_command',
      );
      const script = await context.repository.get(scriptId);
      if (!script) throw new Error(`找不到用户脚本：${scriptId}`);
      const runtime = await context.readRuntimeState(scriptId);
      if (!runtime?.instanceId) {
        throw new Error('当前目标页没有正在运行的脚本实例。');
      }
      const command = registeredCommand(runtime, commandId);
      if (!command) {
        throw new Error('当前脚本实例没有注册该指令，请重新读取运行时状态。');
      }
      const value = await context.invokeRuntimeCommand(scriptId, commandId);
      result = {
        invoked: true,
        scriptId,
        command: {
          id: command.id,
          title: command.title,
        },
        ...(value === undefined ? {} : { value }),
      };
      break;
    }
    case 'set_deck_visibility': {
      const visibility = args.visibility;
      if (visibility !== 'open' && visibility !== 'closed') {
        throw new Error(
          'set_deck_visibility 需要 visibility 为 open 或 closed。',
        );
      }
      await context.setDeckVisibility(visibility);
      result = { visibility, requested: true };
      break;
    }
    default:
      throw new Error(`不支持的助手工具：${toolCall.name}`);
  }
  return {
    output: JSON.stringify(result),
  };
}

export function assistantToolError(error: unknown) {
  const message =
    error instanceof UserscriptInstallError
      ? error.diagnostics.map((diagnostic) => diagnostic.message).join(' ')
      : error instanceof Error
        ? error.message
        : String(error);
  return JSON.stringify({ error: message });
}
