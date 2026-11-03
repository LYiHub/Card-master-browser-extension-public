import { CheckCircle2 } from 'lucide-react';
import { useRef } from 'react';
import { UiButton, UiLayeredCompactDialog } from '../../components/ui/Ui';
import { t } from '../../localization/messages';
import { useLocale } from '../../localization/react';

export function InstallCompletionDialog({
  open,
  title,
  onStay,
  onClosePage,
}: {
  open: boolean;
  title: string;
  onStay: () => void;
  onClosePage: () => void;
}) {
  useLocale();

  const closePageButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <UiLayeredCompactDialog
      open={open}
      title={t('cm_install_completion_dialog_title_1')}
      ariaLabel={t('cm_install_completion_dialog_aria_label_2')}
      initialFocusRef={closePageButtonRef}
      onClose={onStay}
      onEnter={onClosePage}
      footer={
        <>
          <UiButton onClick={onStay}>
            {t('cm_install_completion_dialog_text_3')}
          </UiButton>
          <UiButton
            buttonRef={closePageButtonRef}
            variant="primary"
            onClick={onClosePage}
          >
            {t('cm_install_completion_dialog_text_4')}
            <kbd>Enter</kbd>
          </UiButton>
        </>
      }
    >
      <div className="install-completion">
        <CheckCircle2 size={34} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <p>{t('cm_install_completion_dialog_text_5')}</p>
        </div>
      </div>
    </UiLayeredCompactDialog>
  );
}
