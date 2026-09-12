import { forwardRef, useEffect, useId, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from './core.js';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes } from './shared.js';

export interface DialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly open?: boolean;
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  readonly onClose?: () => void;
  readonly closeOnBackdrop?: boolean;
  readonly ui?: UiLayoutContract;
}
export function Dialog({ open = true, title, actions, onClose, closeOnBackdrop = true, children, className, ui, ...rest }: DialogProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open || onClose === undefined) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose?.(); }}><div className={classes('dialog', className)} role="dialog" aria-modal="true" aria-labelledby={titleId} data-ui-component="Dialog" {...layoutContractAttributes(ui)} {...rest}><div id={titleId} className="dialog-title">{title}</div><div className="dialog-body">{children}</div>{actions === undefined ? null : <div className="dialog-actions">{actions}</div>}</div></div>;
}

export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  readonly content: ReactNode;
  readonly placement?: 'top' | 'bottom';
  readonly shortcut?: ReactNode;
}
export const Tooltip = forwardRef<HTMLSpanElement, TooltipProps>(function Tooltip({ content, placement = 'top', shortcut, children, className, ...rest }, ref) {
  return <span ref={ref} className={classes('tooltip', className)} data-ui-component="Tooltip" {...rest}>{children}<span className={classes('tooltip-bubble', placement === 'bottom' && 'is-bottom')} role="tooltip">{content}{shortcut === undefined ? null : <kbd className="kbd">{shortcut}</kbd>}</span></span>;
});

/** Adapter for the approved feedback surface using the Shell context's acknowledgement vocabulary. */
export interface AcknowledgementProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title: ReactNode;
  readonly kind?: 'info' | 'ok' | 'warn' | 'fail';
  readonly onClose?: () => void;
}
export const Acknowledgement = forwardRef<HTMLDivElement, AcknowledgementProps>(function Acknowledgement({ title, kind = 'info', onClose, children, className, ...rest }, ref) {
  return <div ref={ref} className={classes('toast', `toast-${kind}`, className)} role="status" data-ui-component="Acknowledgement" {...rest}><div><div className="toast-title">{title}</div>{children === undefined ? null : <div className="toast-body">{children}</div>}</div>{onClose === undefined ? null : <Button className="toast-close" aria-label="Close acknowledgement" onClick={onClose}><i className="ph ph-x" aria-hidden="true" /></Button>}</div>;
});

export type AcknowledgementStackProps = HTMLAttributes<HTMLDivElement>;
export const AcknowledgementStack = forwardRef<HTMLDivElement, AcknowledgementStackProps>(function AcknowledgementStack({ className, ...rest }, ref) {
  return <div ref={ref} className={classes('toast-stack', className)} data-ui-component="AcknowledgementStack" {...rest} />;
});

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> { readonly label?: string }
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner({ label = 'Loading', className, ...rest }, ref) {
  return <span ref={ref} className={classes('spinner', className)} role="status" aria-label={label} data-ui-component="Spinner" {...rest} />;
});
