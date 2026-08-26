import {
  Check,
  ChevronDown,
  CircleAlert,
  FileImage,
  Loader2,
  Wrench,
} from 'lucide-react';
import { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { assistantUserFacingError } from '../../ai/domain/assistant-presentation';
import type {
  AiConversationMessage,
  AiConversationSegment,
  AiToolCall,
} from '../../ai/domain/types';
import {
  FLAME_SEQUENCE_IDS,
  FlameSequence,
  type FlameSequenceId,
} from '../../components/ui/FlameSequence';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';

const CREATE_USERSCRIPT_FLAME_SEQUENCES = FLAME_SEQUENCE_IDS;

function toolTitle(name: string) {
  switch (name) {
    case 'execute_page':
      return '操作页面';
    case 'list_tabs':
      return '查找页面';
    case 'select_tab':
      return '选择页面';
    case 'activate_tab':
      return '切换页面';
    case 'close_tab':
      return '关闭页面';
    case 'inspect_page':
      return '分析页面';
    case 'query_dom':
      return '查找页面内容';
    case 'search_page_text':
      return '搜索页面文字';
    case 'read_dom_fragment':
      return '读取页面内容';
    case 'inspect_element':
      return '检查页面内容';
    case 'query_userscripts':
      return '查找卡牌';
    case 'search_greasyfork_scripts':
      return '查找公开脚本';
    case 'install_greasyfork_script':
      return '安装脚本';
    case 'read_userscript':
      return '读取卡牌';
    case 'create_userscript':
      return '创建卡牌';
    case 'edit_userscript':
      return '修改卡牌';
    case 'delete_userscript':
      return '删除卡牌';
    case 'set_userscript_enabled':
      return '调整卡牌状态';
    case 'set_userscript_site_enabled':
      return '设置本站状态';
    case 'inspect_page_userscript_runtimes':
    case 'inspect_userscript_runtime':
      return '检查卡牌状态';
    case 'invoke_userscript_command':
      return '执行卡牌能力';
    case 'generate_userscript_cover':
      return '生成卡牌封面';
    case 'reload_page':
      return '刷新页面';
    case 'set_deck_visibility':
      return '切换牌阵';
    default:
      return '处理任务';
  }
}

function toolStatus(status: AiToolCall['status']) {
  switch (status) {
    case 'pending':
      return '准备中';
    case 'running':
      return '处理中';
    case 'completed':
      return '已完成';
    case 'error':
      return '未完成';
  }
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

const MARKDOWN_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), 'u'])],
};

const MarkdownContent = memo(function MarkdownContent({
  content,
}: {
  content: string;
}) {
  return (
    <div className="cm-assistant-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]]}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

export function ToolCallView({ call }: { call: AiToolCall }) {
  const busy = call.status === 'pending' || call.status === 'running';
  if (call.name === 'create_userscript' && call.status !== 'error') {
    return <CreateUserscriptToolCall call={call} />;
  }
  return (
    <div
      className={`cm-assistant-tool-call is-${call.status}${
        busy ? ' is-busy' : ''
      }`}
      role="status"
      aria-label={`${toolTitle(call.name)}：${toolStatus(call.status)}`}
    >
      <div className="cm-assistant-tool-call__summary">
        <MotionIconSwap
          state={busy ? 'busy' : call.status === 'error' ? 'error' : 'complete'}
          items={[
            {
              state: 'busy',
              icon: (
                <Loader2
                  className="cm-assistant-tool-call__spinner"
                  size={14}
                />
              ),
            },
            { state: 'complete', icon: <Wrench size={14} /> },
            { state: 'error', icon: <CircleAlert size={14} /> },
          ]}
        />
        <span>{toolTitle(call.name)}</span>
        <i className="cm-assistant-tool-call__status">
          {toolStatus(call.status)}
        </i>
      </div>
    </div>
  );
}

function CreateUserscriptToolCall({ call }: { call: AiToolCall }) {
  const [flameSequence] = useState<FlameSequenceId>(
    () =>
      CREATE_USERSCRIPT_FLAME_SEQUENCES[
        Math.floor(Math.random() * CREATE_USERSCRIPT_FLAME_SEQUENCES.length)
      ] ?? '01',
  );
  const busy = call.status === 'pending' || call.status === 'running';
  const summary = (
    <span className="cm-assistant-tool-call__create-summary">
      <FlameSequence
        sequence={flameSequence}
        className="cm-assistant-tool-call__create-flame"
        animated={call.status !== 'error'}
      />
      <strong className="cm-assistant-tool-call__create-title">
        {toolTitle(call.name)}
      </strong>
      <i className="cm-assistant-tool-call__status cm-assistant-tool-call__create-status">
        <MotionIconSwap
          state={busy ? 'busy' : 'complete'}
          items={[
            {
              state: 'busy',
              icon: (
                <Loader2
                  className="cm-assistant-tool-call__create-spinner"
                  size={14}
                />
              ),
            },
            {
              state: 'complete',
              icon: (
                <Check
                  className="cm-assistant-tool-call__create-complete"
                  size={14}
                />
              ),
            },
          ]}
        />
        {toolStatus(call.status)}
      </i>
    </span>
  );

  return (
    <div
      className={`cm-assistant-tool-call is-${call.status}${
        busy ? ' is-busy' : ''
      } is-create-userscript`}
      role="status"
      aria-label={`${toolTitle(call.name)}：${toolStatus(call.status)}`}
    >
      {summary}
    </div>
  );
}

export function conversationMessageParts(message: AiConversationMessage) {
  if (message.role === 'user') {
    return {
      thoughtSegments: [] as AiConversationSegment[],
      finalSegments: message.segments,
      finalStarted: true,
    };
  }

  const finalIndex = message.finalSegmentId
    ? message.segments.findIndex(
        (segment) =>
          segment.type === 'text' && segment.id === message.finalSegmentId,
      )
    : -1;

  return finalIndex >= 0
    ? {
        thoughtSegments: message.segments.slice(0, finalIndex),
        finalSegments: message.segments.slice(finalIndex),
        finalStarted: true,
      }
    : {
        thoughtSegments: message.segments,
        finalSegments: [] as AiConversationSegment[],
        finalStarted: false,
      };
}

function TimelineSegment({
  segment,
  streaming,
}: {
  segment: AiConversationSegment;
  streaming?: boolean;
}) {
  if (segment.type === 'tool') {
    return (
      <div className="cm-assistant-tool-list">
        <ToolCallView call={segment.call} />
      </div>
    );
  }
  if (segment.type === 'image') {
    return (
      <figure className="cm-assistant-message-image">
        {segment.attachment.available && segment.attachment.dataUrl ? (
          <img src={segment.attachment.dataUrl} alt="参考图片" />
        ) : (
          <div className="cm-assistant-message-image__missing">
            <FileImage size={18} aria-hidden="true" />
            <span>图片内容已失效，请重新附加后继续</span>
          </div>
        )}
        <figcaption>参考图片</figcaption>
      </figure>
    );
  }
  if (segment.type === 'reasoning') return null;
  return (
    <div className="chat-message-content">
      <MarkdownContent content={segment.content} />
      {streaming && (
        <i className="cm-assistant-stream-cursor" aria-hidden="true" />
      )}
    </div>
  );
}

function ThoughtProcess({
  segments,
  live,
}: {
  segments: AiConversationSegment[];
  live: boolean;
}) {
  const visibleSegments = segments.filter((segment) => segment.type === 'tool');
  const content = (
    <div className="cm-assistant-thought-process__body">
      {visibleSegments.map((segment) => (
        <TimelineSegment key={segment.id} segment={segment} />
      ))}
    </div>
  );

  if (live) {
    return (
      <section
        className="cm-assistant-thought-process is-live"
        aria-label="思考过程"
      >
        <div className="cm-assistant-thought-process__heading" role="status">
          <Loader2 size={14} aria-hidden="true" />
          <span>正在思考</span>
        </div>
        {visibleSegments.length > 0 && content}
      </section>
    );
  }

  if (visibleSegments.length === 0) return null;
  return (
    <details className="cm-assistant-thought-process">
      <summary>
        <span>思考过程</span>
        <ChevronDown size={13} aria-hidden="true" />
      </summary>
      {content}
    </details>
  );
}

export function ConversationMessage({
  message,
}: {
  message: AiConversationMessage;
}) {
  const user = message.role === 'user';
  const { thoughtSegments, finalSegments, finalStarted } =
    conversationMessageParts(message);
  const lastFinalSegmentId = finalSegments.at(-1)?.id;
  const thoughtLive = !user && message.status === 'streaming' && !finalStarted;
  return (
    <article
      className={`cm-assistant-message is-${message.role}${
        message.status === 'error' ? ' is-error' : ''
      }`}
    >
      {!user && (
        <ThoughtProcess segments={thoughtSegments} live={thoughtLive} />
      )}
      {finalSegments.map((segment) => (
        <TimelineSegment
          key={segment.id}
          segment={segment}
          streaming={
            message.status === 'streaming' && segment.id === lastFinalSegmentId
          }
        />
      ))}
      {message.error && (
        <div className="cm-assistant-message__error">
          <CircleAlert
            className="cm-assistant-message__error-icon"
            size={16}
            aria-hidden="true"
          />
          <strong className="cm-assistant-message__error-title">
            请求失败
          </strong>
          <span className="cm-assistant-message__error-text">
            {assistantUserFacingError(message.error)}
          </span>
        </div>
      )}
    </article>
  );
}
