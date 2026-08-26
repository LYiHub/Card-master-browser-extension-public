import { CheckCircle2 } from 'lucide-react';
import { useRef } from 'react';

import { UiButton, UiLayeredCompactDialog } from '../../components/ui/Ui';

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
  const closePageButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <UiLayeredCompactDialog
      open={open}
      title="卡牌已收录"
      ariaLabel="脚本安装完成"
      initialFocusRef={closePageButtonRef}
      onClose={onStay}
      onEnter={onClosePage}
      footer={
        <>
          <UiButton onClick={onStay}>留在此页</UiButton>
          <UiButton
            buttonRef={closePageButtonRef}
            variant="primary"
            onClick={onClosePage}
          >
            关闭此页
            <kbd>Enter</kbd>
          </UiButton>
        </>
      }
    >
      <div className="install-completion">
        <CheckCircle2 size={34} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <p>
            脚本完整源码已经保存。下次打开牌阵时，这张卡牌会按 metadata
            自动匹配当前页面。
          </p>
        </div>
      </div>
    </UiLayeredCompactDialog>
  );
}
