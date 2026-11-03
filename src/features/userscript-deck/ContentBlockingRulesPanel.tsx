import { Download, Save, Upload } from 'lucide-react';
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { UiButton } from '../../components/ui/Ui';
import { mergeUserRules } from '../../content-blocking/application/merge-user-rules';
import type {
  ContentBlockingController,
  ContentBlockingSettingsView,
} from '../../content-blocking/domain/types';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { FilterRuleEditor } from './FilterRuleEditor';

const MAX_RULE_FILE_BYTES = 4 * 1024 * 1024;

function exportFilename(now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `my-card-master-static-filters_${now.getFullYear()}-${pad(
    now.getMonth() + 1,
  )}-${pad(now.getDate())}_${pad(now.getHours())}.${pad(
    now.getMinutes(),
  )}.${pad(now.getSeconds())}.txt`;
}

function exportRules(source: string) {
  const url = URL.createObjectURL(
    new Blob([source], { type: 'text/plain;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = exportFilename();
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ContentBlockingRulesPanel({
  controller,
  persistedRules,
  saving,
  onSave,
}: {
  controller: ContentBlockingController;
  persistedRules: string;
  saving: boolean;
  onSave: (rules: string) => Promise<ContentBlockingSettingsView | null>;
}) {
  useLocale();

  const [persistedUserRules, setPersistedUserRules] = useState(persistedRules);
  const [userRules, setUserRules] = useState(persistedRules);
  const [notice, setNotice] = useState('');
  const persistedUserRulesRef = useRef(persistedRules);
  const userRulesRef = useRef(persistedRules);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingEditorState = useRef<{
    selectionStart: number;
    selectionEnd: number;
    selectionDirection: 'forward' | 'backward' | 'none';
    scrollTop: number;
    scrollLeft: number;
  } | null>(null);
  const deferredUserRules = useDeferredValue(userRules);
  const ruleCount = useMemo(
    () =>
      deferredUserRules.split(/\r?\n/).filter((line) => {
        const normalized = line.trim();
        return (
          normalized &&
          !normalized.startsWith('!') &&
          !normalized.startsWith('[')
        );
      }).length,
    [deferredUserRules],
  );

  useLayoutEffect(() => {
    const pending = pendingEditorState.current;
    const editor = editorRef.current;
    if (!pending || !editor) return;
    pendingEditorState.current = null;
    const length = editor.value.length;
    editor.setSelectionRange(
      Math.min(pending.selectionStart, length),
      Math.min(pending.selectionEnd, length),
      pending.selectionDirection,
    );
    editor.scrollTop = pending.scrollTop;
    editor.scrollLeft = pending.scrollLeft;
  });

  useEffect(() => {
    const applyPersistedRules = (next: string) => {
      const previousPersisted = persistedUserRulesRef.current;
      if (next === previousPersisted) return;
      const hasLocalChanges = userRulesRef.current !== previousPersisted;
      persistedUserRulesRef.current = next;
      setPersistedUserRules(next);
      if (!hasLocalChanges) {
        userRulesRef.current = next;
        setUserRules(next);
        return;
      }
      const editor = editorRef.current;
      if (editor) {
        pendingEditorState.current = {
          selectionStart: editor.selectionStart,
          selectionEnd: editor.selectionEnd,
          selectionDirection: editor.selectionDirection,
          scrollTop: editor.scrollTop,
          scrollLeft: editor.scrollLeft,
        };
      }
      const merged = mergeUserRules(
        previousPersisted,
        userRulesRef.current,
        next,
      );
      userRulesRef.current = merged;
      setUserRules(merged);
      setNotice(t('cm_content_blocking_rules_panel_text_1'));
    };
    applyPersistedRules(persistedRules);
    return controller.subscribeUserRules(applyPersistedRules);
  }, [controller, persistedRules]);

  const updateUserRules = (next: string) => {
    userRulesRef.current = next;
    setUserRules(next);
  };

  const importRules = async (file: File) => {
    if (file.size > MAX_RULE_FILE_BYTES) {
      setNotice(t('cm_content_blocking_rules_panel_text_2'));
      return;
    }
    updateUserRules(
      (await file.text()).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'),
    );
    setNotice(t('cm_content_blocking_rules_panel_text_3'));
  };

  const saveRules = async () => {
    const saved = await onSave(userRulesRef.current);
    if (!saved) return;
    persistedUserRulesRef.current = saved.userRules;
    userRulesRef.current = saved.userRules;
    setPersistedUserRules(saved.userRules);
    setUserRules(saved.userRules);
    setNotice('');
  };

  return (
    <div className="manager-blocking-panel manager-blocking-rules-panel">
      <header className="manager-blocking-panel__header">
        <div>
          <strong>{t('cm_content_blocking_rules_panel_text_4')}</strong>
          <span>
            {notice ||
              t('cm_content_blocking_rules_panel_text_5', [String(ruleCount)])}
          </span>
        </div>
        <div className="manager-blocking-panel__actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importRules(file);
              event.currentTarget.value = '';
            }}
          />
          <UiButton
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={14} aria-hidden="true" />
            {t('cm_content_blocking_rules_panel_text_6')}
          </UiButton>
          <UiButton
            disabled={!userRules}
            onClick={() => exportRules(userRules)}
          >
            <Download size={14} aria-hidden="true" />
            {t('cm_content_blocking_rules_panel_text_7')}
          </UiButton>
          <UiButton
            variant="primary"
            disabled={saving || userRules === persistedUserRules}
            onClick={() => void saveRules()}
          >
            <Save size={14} aria-hidden="true" />
            {t('cm_content_blocking_rules_panel_text_8')}
          </UiButton>
        </div>
      </header>
      <section className="manager-custom-rules-editor">
        <header>
          <strong>{t('cm_content_blocking_rules_panel_text_9')}</strong>
          <span>
            {ruleCount} {t('cm_content_blocking_rules_panel_text_10')}
          </span>
        </header>
        <FilterRuleEditor
          ref={editorRef}
          value={userRules}
          aria-label={t('cm_content_blocking_rules_panel_aria_label_11')}
          onChange={updateUserRules}
        />
      </section>
    </div>
  );
}
