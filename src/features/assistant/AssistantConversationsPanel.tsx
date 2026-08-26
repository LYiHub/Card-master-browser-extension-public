import { Pin, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  AiConversationMessage,
  AiConversationSnapshot,
  AiConversationSummary,
} from '../../ai/domain/types';
import { aiConversationText } from '../../ai/domain/types';
import { MoreMenu } from './AssistantConversationMenus';

type AwaitableAction = void | Promise<void>;

function relativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

function conversationPreview(message: AiConversationMessage | undefined) {
  return message ? aiConversationText(message) : '';
}

export function assistantHistoryConversations(
  conversations: readonly AiConversationSummary[],
) {
  return conversations.filter((conversation) => conversation.messageCount > 0);
}

export function AssistantConversationsPanel({
  visible,
  snapshot,
  pinnedIds,
  onCreateConversation,
  onSelectConversation,
  onTogglePin,
  onRenameConversation,
  onExportConversation,
  onDeleteConversation,
}: {
  visible: boolean;
  snapshot: AiConversationSnapshot;
  pinnedIds: Set<string>;
  onCreateConversation: () => AwaitableAction;
  onSelectConversation: (conversationId: string) => AwaitableAction;
  onTogglePin: (conversationId: string) => void;
  onRenameConversation: (conversationId: string) => void;
  onExportConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => AwaitableAction;
}) {
  const [search, setSearch] = useState('');
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [onlyCurrentConversation, setOnlyCurrentConversation] = useState(false);
  const historyConversations = useMemo(
    () => assistantHistoryConversations(snapshot.conversations),
    [snapshot.conversations],
  );
  const conversations = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return [...historyConversations]
      .filter((conversation) => {
        if (
          normalized &&
          !conversation.title.toLowerCase().includes(normalized)
        ) {
          return false;
        }
        return (
          !onlyCurrentConversation ||
          conversation.id === snapshot.activeConversationId
        );
      })
      .sort((left, right) => {
        const leftPinned = pinnedIds.has(left.id);
        const rightPinned = pinnedIds.has(right.id);
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
        return right.updatedAt - left.updatedAt;
      });
  }, [
    onlyCurrentConversation,
    pinnedIds,
    search,
    snapshot.activeConversationId,
    historyConversations,
  ]);

  return (
    <div
      className="cm-assistant-panel cm-assistant-list-panel"
      id="conversationsPanel"
      hidden={!visible}
    >
      <div className="cm-assistant-list-header">
        <h2>全部会话</h2>
        <button
          type="button"
          className="cm-assistant-add-button"
          disabled={snapshot.running}
          onMouseDown={() => void onCreateConversation()}
        >
          + 会话
        </button>
      </div>
      <div
        className={`cm-assistant-search-panel${
          advancedSearch ? ' is-advanced' : ''
        }`}
      >
        <div className="cm-assistant-search-field">
          <Search className="cm-assistant-search-field__icon" size={16} />
          <input
            value={search}
            placeholder="搜索会话"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              title="清除搜索"
              onClick={() => setSearch('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={advancedSearch ? 'is-active' : ''}
          title="高级筛选"
          onClick={() => {
            setAdvancedSearch((current) => !current);
            if (advancedSearch) setOnlyCurrentConversation(false);
          }}
        >
          <SlidersHorizontal size={16} />
          {!advancedSearch && <span>高级</span>}
        </button>
        {advancedSearch && (
          <label className="cm-assistant-page-filter">
            <input
              type="checkbox"
              checked={onlyCurrentConversation}
              onChange={(event) =>
                setOnlyCurrentConversation(event.target.checked)
              }
            />
            仅显示当前会话
          </label>
        )}
      </div>
      {(search || onlyCurrentConversation) && (
        <p className="cm-assistant-filter-count">
          共 {historyConversations.length} 个会话，当前显示{' '}
          {conversations.length} 个
        </p>
      )}
      <div className="conversations-list">
        {conversations.length === 0 ? (
          <p className="cm-assistant-empty-list">还没有会话</p>
        ) : (
          conversations.map((conversation) => (
            <article
              key={conversation.id}
              className={`conversation-item${
                conversation.id === snapshot.activeConversationId
                  ? ' is-selected'
                  : ''
              }`}
            >
              <button
                type="button"
                className="conversation-item__select"
                onClick={() => void onSelectConversation(conversation.id)}
              >
                <div className="conversation-item__title">
                  {pinnedIds.has(conversation.id) && <Pin size={12} />}
                  <strong className="conversation-item__name">
                    {conversation.title}
                  </strong>
                </div>
                <p>
                  {conversation.id === snapshot.activeConversationId
                    ? conversationPreview(snapshot.messages.at(-1)) ||
                      '还没有消息'
                    : conversation.messageCount > 0
                      ? `${conversation.messageCount} 条消息`
                      : '还没有消息'}
                </p>
                <small>{relativeTime(conversation.updatedAt)}</small>
              </button>
              <div>
                <MoreMenu
                  pinned={pinnedIds.has(conversation.id)}
                  onTogglePin={() => onTogglePin(conversation.id)}
                  onRename={() => onRenameConversation(conversation.id)}
                  onExport={() => onExportConversation(conversation.id)}
                  onDelete={() => void onDeleteConversation(conversation.id)}
                />
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
