import { Download, MoreVertical, Pencil, Pin, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MotionIconSwap } from '../../components/ui/MotionIconSwap';
import { useDialogInteraction } from '../../components/useDialogInteraction';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { useTransitionPresence } from '../../motion/presence';

type AwaitableAction = void | Promise<void>;

export function RenameDialog({
  open,
  title,
  onClose,
  onExitComplete,
  onSave,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onExitComplete: () => void;
  onSave: (title: string) => AwaitableAction;
}) {
  useLocale();

  const [draft, setDraft] = useState(title);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const presence = useTransitionPresence(open, backdropRef, onExitComplete);

  useDialogInteraction({
    dialogRef,
    initialFocusRef: inputRef,
    enabled: open && presence.present,
    priority: 1,
    onClose,
  });

  useLayoutEffect(() => {
    if (!open) return;
    setDraft(title);
    inputRef.current?.select();
  }, [open, title]);

  const save = () => {
    const next = draft.trim();
    if (!next || !open) return;
    void onSave(next);
    onClose();
  };

  if (!presence.present) return null;

  return (
    <div
      ref={backdropRef}
      className={`cm-assistant-dialog-backdrop app-motion-backdrop is-${presence.phase}`}
    >
      <button
        type="button"
        className="cm-assistant-dialog-backdrop__dismiss"
        aria-label={t('cm_assistant_conversation_menus_aria_label_1')}
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className={`cm-assistant-dialog app-motion-modal is-${presence.phase}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('cm_assistant_conversation_menus_aria_label_2')}
      >
        <button
          type="button"
          className="cm-assistant-dialog__close"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <strong className="cm-assistant-dialog__title">
          {t('cm_assistant_conversation_menus_text_3')}
        </strong>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <footer>
          <button
            type="button"
            className="cm-assistant-secondary-button"
            onClick={onClose}
          >
            {t('cm_assistant_conversation_menus_text_4')}
          </button>
          <button
            type="button"
            className="cm-assistant-primary-button"
            onClick={save}
          >
            {t('cm_assistant_conversation_menus_text_5')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function MoreMenu({
  pinned,
  onTogglePin,
  onRename,
  onExport,
  onDelete,
}: {
  pinned: boolean;
  onTogglePin: () => void;
  onRename: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  useLocale();

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const menuPresence = useTransitionPresence(open, popoverRef);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  const action = (callback: () => void) => {
    callback();
    setOpen(false);
  };
  return (
    <div className="cm-assistant-more-menu" ref={menuRef}>
      <button
        type="button"
        ref={triggerRef}
        className="cm-assistant-icon-button"
        title={
          open
            ? t('cm_assistant_conversation_menus_text_6')
            : t('cm_assistant_conversation_menus_text_7')
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MotionIconSwap
          state={menuPresence.present ? 'close' : 'more'}
          items={[
            { state: 'more', icon: <MoreVertical size={16} /> },
            { state: 'close', icon: <X size={16} /> },
          ]}
        />
      </button>
      {menuPresence.present && (
        <div
          ref={popoverRef}
          className={`cm-assistant-more-menu__popover app-motion-dropdown is-${menuPresence.phase}`}
          role="menu"
          aria-hidden={!open}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => action(onTogglePin)}
          >
            <Pin size={14} />
            {pinned
              ? t('cm_assistant_conversation_menus_text_8')
              : t('cm_assistant_conversation_menus_text_9')}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => action(onRename)}
          >
            <Pencil size={14} />
            {t('cm_assistant_conversation_menus_text_10')}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => action(onExport)}
          >
            <Download size={14} />
            {t('cm_assistant_conversation_menus_text_11')}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => action(onDelete)}
          >
            <Trash2 size={14} />
            {t('cm_assistant_conversation_menus_text_12')}
          </button>
        </div>
      )}
    </div>
  );
}
