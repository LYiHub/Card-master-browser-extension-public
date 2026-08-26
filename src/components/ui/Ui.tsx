import { X } from 'lucide-react';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  RefObject,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { createContext, useContext, useId, useRef, useState } from 'react';
import { INPUT_SCOPE_PRIORITY } from '../../input/coordinator';
import { useSurfaceInputInteraction } from '../../input/useSurfaceInputInteraction';
import { classNames } from '../../lib/class-names';
import { projectAssetUrl } from '../../lib/project-assets';
import { useTransitionPresence } from '../../motion/presence';
import { useDialogInteraction } from '../useDialogInteraction';
import { DiagnosticCopyButton } from './DiagnosticCopyButton';
import { LoadingFlame } from './FlameSequence';

export { DiagnosticCopyButton } from './DiagnosticCopyButton';

const CLOSE_CONTROL_URL = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/close-control.webp',
);

export const UI_BUTTON_VARIANTS = ['secondary', 'primary', 'danger'] as const;
export type UiButtonVariant = (typeof UI_BUTTON_VARIANTS)[number];

export const UI_NOTICE_TONES = ['info', 'warning', 'error'] as const;
export type UiNoticeTone = (typeof UI_NOTICE_TONES)[number];

export const CARD_STATUS_TONES = [
  'active',
  'disabled',
  'warning',
  'error',
] as const;
export type CardStatusTone = (typeof CARD_STATUS_TONES)[number];

export const UI_ACTION_ROW_TONES = ['neutral', 'danger'] as const;
export type UiActionRowTone = (typeof UI_ACTION_ROW_TONES)[number];

export const UI_DIALOG_STATUS_TONES = [
  'neutral',
  'active',
  'inactive',
  'error',
] as const;
export type UiDialogStatusTone = (typeof UI_DIALOG_STATUS_TONES)[number];

export function UiIconButton({
  label,
  close = false,
  className,
  buttonRef,
  children,
  ...buttonProps
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & {
  label: string;
  close?: boolean;
  buttonRef?: RefObject<HTMLButtonElement>;
  children?: ReactNode;
}) {
  return (
    <button
      {...buttonProps}
      ref={buttonRef}
      type="button"
      className={classNames(
        'app-ui-icon-button',
        close && 'is-close',
        className,
      )}
      title={label}
      aria-label={label}
    >
      {close ? (
        <img
          src={CLOSE_CONTROL_URL}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ) : (
        children
      )}
    </button>
  );
}

export function UiButton({
  variant = 'secondary',
  className,
  buttonRef,
  children,
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiButtonVariant;
  buttonRef?: RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      {...buttonProps}
      ref={buttonRef}
      type="button"
      data-dialog-primary={variant === 'primary' ? 'true' : undefined}
      className={classNames('app-ui-button', `is-${variant}`, className)}
    >
      {children}
    </button>
  );
}

export function UiNotice({
  tone = 'info',
  icon,
  title,
  children,
  className,
  copyText,
}: {
  tone?: UiNoticeTone;
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  copyText?: string;
}) {
  return (
    <div
      className={classNames('app-ui-notice', `is-${tone}`, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {icon && <span className="app-ui-notice__icon">{icon}</span>}
      <div>
        <div className="app-ui-notice__heading">
          <strong className="app-ui-notice__title">{title}</strong>
          {copyText && <DiagnosticCopyButton text={copyText} />}
        </div>
        <div className="app-ui-notice__content">{children}</div>
      </div>
    </div>
  );
}

export function CardStatusNotice({
  status,
  title,
  description,
  tone = 'active',
  copyText,
}: {
  status: string;
  title: string;
  description: string;
  tone?: CardStatusTone;
  copyText?: string;
}) {
  return (
    <section
      className={classNames('card-status-notice', `is-${tone}`)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className="card-status-notice__state">
        <i aria-hidden="true" />
        {status}
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {copyText && (
        <DiagnosticCopyButton
          text={copyText}
          className="card-status-notice__copy"
        />
      )}
    </section>
  );
}

export function UiField({
  label,
  hint,
  className,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: string;
  className?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames('app-ui-field', className)}>
      <label className="app-ui-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <small className="app-ui-field__hint">{hint}</small>}
    </div>
  );
}

export function UiTextField({
  label,
  hint,
  className,
  actions,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: ReactNode;
  hint?: string;
  className?: string;
  actions?: ReactNode;
}) {
  const generatedId = useId();
  const id = inputProps.id ?? generatedId;
  return (
    <UiField label={label} hint={hint} className={className} htmlFor={id}>
      {actions ? (
        <div className="app-ui-field__control">
          <input {...inputProps} id={id} />
          <div className="app-ui-field__actions">{actions}</div>
        </div>
      ) : (
        <input {...inputProps} id={id} />
      )}
    </UiField>
  );
}

export function UiTextArea({
  label,
  hint,
  className,
  ...textareaProps
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  label: ReactNode;
  hint?: string;
  className?: string;
}) {
  const generatedId = useId();
  const id = textareaProps.id ?? generatedId;
  return (
    <UiField label={label} hint={hint} className={className} htmlFor={id}>
      <textarea {...textareaProps} id={id} />
    </UiField>
  );
}

export function UiSelect({
  className,
  ...selectProps
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...selectProps}
      className={classNames('app-ui-select', className)}
    />
  );
}

export function UiSelectField({
  label,
  hint,
  className,
  ...selectProps
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  label: ReactNode;
  hint?: string;
  className?: string;
}) {
  const generatedId = useId();
  const id = selectProps.id ?? generatedId;
  return (
    <UiField label={label} hint={hint} className={className} htmlFor={id}>
      <UiSelect {...selectProps} id={id} />
    </UiField>
  );
}

export function UiRange({
  label,
  hint,
  className,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'> & {
  label: ReactNode;
  hint?: string;
  className?: string;
}) {
  const generatedId = useId();
  const id = inputProps.id ?? generatedId;
  return (
    <UiField label={label} hint={hint} className={className} htmlFor={id}>
      <input {...inputProps} id={id} type="range" />
    </UiField>
  );
}

export function UiActionRow({
  icon,
  title,
  description,
  actions,
  tone = 'neutral',
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: UiActionRowTone;
  className?: string;
}) {
  return (
    <div className={classNames('app-ui-action-row', `is-${tone}`, className)}>
      {icon && <span className="app-ui-action-row__icon">{icon}</span>}
      <div className="app-ui-action-row__copy">
        <strong>{title}</strong>
        {description && <div>{description}</div>}
      </div>
      {actions && <div className="app-ui-action-row__actions">{actions}</div>}
    </div>
  );
}

export function UiToggle({
  label,
  description,
  checked,
  disabled = false,
  compact = false,
  className,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  onChange: (checked: boolean) => void;
}) {
  const [interacted, setInteracted] = useState(false);
  return (
    <label
      className={classNames(
        'app-ui-toggle',
        compact && 'is-compact',
        checked && 'is-checked',
        disabled && 'is-disabled',
        interacted && 'is-interacted',
        className,
      )}
    >
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          setInteracted(true);
          onChange(event.currentTarget.checked);
        }}
      />
      <span className="app-ui-toggle__control" aria-hidden="true">
        <i />
        <b>{checked ? '开' : '关'}</b>
      </span>
    </label>
  );
}

export function UiLoader({
  label,
  compact = false,
  large = false,
  className,
  visible = true,
}: {
  label?: string;
  compact?: boolean;
  large?: boolean;
  className?: string;
  visible?: boolean;
}) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const presence = useTransitionPresence(visible, loaderRef);
  if (!presence.present) return null;

  return (
    <div
      ref={loaderRef}
      className={classNames(
        'app-ui-loader',
        `is-${presence.phase}`,
        compact && 'is-compact',
        large && 'is-large',
        className,
      )}
      role="status"
      aria-live={visible ? 'polite' : 'off'}
      aria-hidden={!visible}
      aria-label={label ?? '加载中'}
    >
      <LoadingFlame
        className="app-ui-loader__flame"
        size={compact ? 28 : large ? 260 : 112}
      />
      {label && <span className="app-ui-loader__label">{label}</span>}
    </div>
  );
}

export function UiWorkspace({
  ariaLabel,
  title,
  description,
  actions,
  className,
  bodyClassName,
  onClose,
  children,
}: {
  ariaLabel: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const workspaceRef = useRef<HTMLElement>(null);
  useSurfaceInputInteraction({
    surfaceRef: workspaceRef,
    id: `workspace:${ariaLabel}`,
    priority: INPUT_SCOPE_PRIORITY.workspace,
    onClose,
  });

  return (
    <section
      ref={workspaceRef}
      className={classNames('app-ui-theme', 'app-ui-workspace', className)}
      aria-label={ariaLabel}
    >
      <header className="app-ui-workspace__header">
        <div className="app-ui-workspace__heading">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        <div className="app-ui-workspace__actions">
          {actions}
          <button
            type="button"
            className="app-ui-workspace__close"
            onClick={onClose}
            aria-label={`关闭${title}`}
            title={`关闭${title}`}
          >
            <X size={20} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={classNames('app-ui-workspace__body', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function UiBadge({
  compact = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { compact?: boolean }) {
  return (
    <span
      {...props}
      className={classNames(
        'app-ui-framed-surface',
        'app-ui-badge',
        compact && 'is-compact',
        className,
      )}
    >
      {children}
    </span>
  );
}

type UiChoiceGroupProps<Value extends string> = {
  label: string;
  value: Value;
  options: readonly {
    value: Value;
    label: string;
    icon?: ReactNode;
    controls?: string;
  }[];
  className?: string;
  contextNavigation?: boolean;
  onChange: (value: Value) => void;
};

export function UiSegmentedControl<Value extends string>({
  label,
  value,
  options,
  className,
  contextNavigation = false,
  onChange,
}: UiChoiceGroupProps<Value>) {
  const groupName = useId();

  return (
    <fieldset
      className={classNames('app-ui-segmented-control', className)}
      aria-label={label}
      data-app-ui-choice-group="true"
      data-app-ui-context-navigation={contextNavigation ? 'true' : undefined}
    >
      <legend className="app-ui-choice-label">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={value === option.value ? 'is-active' : undefined}
        >
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={value === option.value}
            aria-controls={option.controls}
            onChange={() => onChange(option.value)}
          />
          {option.icon && (
            <span className="app-ui-segmented-control__icon">
              {option.icon}
            </span>
          )}
          <span className="app-ui-segmented-control__label">
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

type UiDialogProps = {
  ariaLabel: string;
  title: string;
  status?: {
    label: string;
    tone?: UiDialogStatusTone;
  };
  headerActions?: ReactNode;
  navigation?: ReactNode;
  footer?: ReactNode;
  preview?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
  onClose: () => void;
  onEnter?: () => void;
  children: ReactNode;
  className?: string;
};

const UiDialogInteractionContext = createContext(true);

export function UiDialogInteractionBoundary({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <UiDialogInteractionContext.Provider value={enabled}>
      {children}
    </UiDialogInteractionContext.Provider>
  );
}

type UiDialogFrameProps = Omit<UiDialogProps, 'initialFocusRef' | 'onEnter'> & {
  dialogRef: RefObject<HTMLElement>;
  closeButtonRef: RefObject<HTMLButtonElement>;
  frame: 'square' | 'compact';
  phase?: 'entering' | 'open' | 'closing';
};

function UiDialogFrame({
  dialogRef,
  closeButtonRef,
  ariaLabel,
  title,
  status,
  headerActions,
  navigation,
  footer,
  preview = false,
  onClose,
  children,
  className,
  frame,
  phase,
}: UiDialogFrameProps) {
  return (
    <section
      ref={dialogRef}
      className={classNames(
        'app-ui-theme',
        'app-ui-dialog',
        Boolean(navigation) && 'has-navigation',
        frame === 'compact' && 'app-ui-dialog--compact',
        phase && 'app-motion-modal',
        phase && `is-${phase}`,
        className,
      )}
      role="dialog"
      aria-modal={preview ? undefined : true}
      aria-label={ariaLabel}
      data-dialog-frame={frame}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="app-ui-dialog__surface">
        <header className="app-ui-dialog__header">
          <div className="app-ui-dialog__heading">
            <strong className="app-ui-dialog__title">{title}</strong>
          </div>
          <div className="app-ui-dialog__header-actions">
            {status && (
              <span
                className={classNames(
                  'app-ui-dialog__status',
                  `is-${status.tone ?? 'neutral'}`,
                )}
              >
                {status.label}
              </span>
            )}
            {headerActions}
            <UiIconButton
              buttonRef={closeButtonRef}
              label={`关闭${title}`}
              close
              data-dialog-close="true"
              onClick={onClose}
            />
          </div>
        </header>
        {navigation && (
          <nav
            className="app-ui-dialog__navigation"
            aria-label={`${title}分类导航`}
          >
            {navigation}
          </nav>
        )}
        <div className="app-ui-dialog__body">{children}</div>
        {footer && <footer className="app-ui-dialog__footer">{footer}</footer>}
      </div>
    </section>
  );
}

export function UiDialog({
  ariaLabel,
  title,
  status,
  headerActions,
  navigation,
  footer,
  preview = false,
  initialFocusRef,
  onClose,
  onEnter,
  children,
  className,
}: UiDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const interactionEnabled = useContext(UiDialogInteractionContext);

  useDialogInteraction({
    dialogRef,
    initialFocusRef,
    enabled: !preview && interactionEnabled,
    onClose,
    onEnter,
  });

  return (
    <UiDialogFrame
      dialogRef={dialogRef}
      closeButtonRef={closeButtonRef}
      ariaLabel={ariaLabel}
      title={title}
      status={status}
      headerActions={headerActions}
      navigation={navigation}
      footer={footer}
      preview={preview}
      onClose={onClose}
      className={className}
      frame="square"
    >
      {children}
    </UiDialogFrame>
  );
}

type UiLayeredDialogProps = UiDialogProps & {
  open: boolean;
  onExitComplete?: () => void;
  closeOnBackdrop?: boolean;
};

function UiLayeredDialogBase({
  frame,
  open,
  onExitComplete,
  closeOnBackdrop = false,
  ariaLabel,
  title,
  status,
  headerActions,
  navigation,
  footer,
  preview = false,
  initialFocusRef,
  onClose,
  onEnter,
  children,
  className,
}: UiLayeredDialogProps & { frame: 'square' | 'compact' }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const presence = useTransitionPresence(open, layerRef, onExitComplete);
  const interactionEnabled = useContext(UiDialogInteractionContext);

  useDialogInteraction({
    dialogRef,
    initialFocusRef,
    enabled: !preview && interactionEnabled && open && presence.present,
    priority: 1,
    onClose,
    onEnter,
  });

  if (!presence.present) return null;

  return (
    <div
      ref={layerRef}
      className={classNames(
        'app-ui-dialog-layer',
        'app-motion-backdrop',
        `is-${presence.phase}`,
      )}
      onPointerDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <UiDialogFrame
        dialogRef={dialogRef}
        closeButtonRef={closeButtonRef}
        ariaLabel={ariaLabel}
        title={title}
        status={status}
        headerActions={headerActions}
        navigation={navigation}
        footer={footer}
        preview={preview}
        onClose={onClose}
        className={className}
        frame={frame}
        phase={presence.phase === 'closed' ? 'closing' : presence.phase}
      >
        {children}
      </UiDialogFrame>
    </div>
  );
}

export function UiLayeredDialog(props: UiLayeredDialogProps) {
  return <UiLayeredDialogBase {...props} frame="square" />;
}

export function UiLayeredCompactDialog(props: UiLayeredDialogProps) {
  return <UiLayeredDialogBase {...props} frame="compact" />;
}
