import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { classNames } from '../../lib/class-names';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';
import { MotionIconSwap } from './MotionIconSwap';

export async function copyDiagnosticText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // The DOM fallback also works when Clipboard API permission is denied.
    }
  }
  if (typeof document === 'undefined') {
    throw new Error('Clipboard access is unavailable.');
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  (document.body || document.documentElement).append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied =
      typeof document.execCommand === 'function' &&
      document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error('The browser rejected the copy command.');
}

export function DiagnosticCopyButton({
  text,
  label = t('cm_diagnostic_copy_button_text_1'),
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  useLocale();

  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timeout = window.setTimeout(() => setState('idle'), 1_600);
    return () => window.clearTimeout(timeout);
  }, [state]);

  if (!text.trim()) return null;
  const title =
    state === 'copied'
      ? t('cm_diagnostic_copy_button_text_2')
      : state === 'failed'
        ? t('cm_diagnostic_copy_button_text_3')
        : label;

  return (
    <button
      type="button"
      className={classNames('diagnostic-copy-button', className)}
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        void copyDiagnosticText(text).then(
          () => setState('copied'),
          () => setState('failed'),
        );
      }}
    >
      <MotionIconSwap
        state={state === 'copied' ? 'copied' : 'copy'}
        items={[
          { state: 'copy', icon: <Copy size={15} /> },
          { state: 'copied', icon: <Check size={15} /> },
        ]}
      />
    </button>
  );
}
