import { Component, forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from './core.js';
import { Dialog } from './feedback.js';
import { Card } from './surfaces.js';
import { classes } from './shared.js';

export interface TableCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly accented?: boolean;
}
export const TableCard = forwardRef<HTMLDivElement, TableCardProps>(function TableCard({ title, actions, footer, accented, children, className, ...rest }, ref) {
  return <Card ref={ref} {...(accented === undefined ? {} : { accented })} className={classes('card', 'table-card', className)} data-ui-component="TableCard" {...rest}><div className="table-card-head"><div className="card-kicker">{title}</div>{actions}</div>{children}{footer === undefined ? null : <div className="table-card-foot">{footer}</div>}</Card>;
});

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly title?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
}
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader({ title, subtitle, actions, children, className, ...rest }, ref) {
  return <header ref={ref} className={classes('page-header', className)} data-ui-component="PageHeader" {...rest}>{title === undefined ? children : <><h1 className="display">{title}</h1>{subtitle === undefined ? null : <span className="page-header-sub">{subtitle}</span>}{actions}</>}</header>;
});

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: ReactNode;
  readonly hint?: ReactNode;
  readonly icon?: string;
  readonly action?: ReactNode;
}
/**
 * The adopted EmptyState (`docs/design/system/components/patterns/EmptyState.jsx`) wraps its `action` in a box standing
 * `--rt-space-2` above it (`marginTop: 8`), so the control sits further from the hint than the hint from the title; until
 * 2026-11-03 the product's copy dropped that wrapper and the control followed the hint by the list's own 6 px gap (the Overview
 * audit of 2026-11-02, item 12). `.empty-state-action` in `shell.css` carries the margin by its token.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState({ title, hint, icon, action, children, className, ...rest }, ref) {
  return <div ref={ref} className={classes('empty-state', 'rt-dot-grid-bg', className)} data-ui-component="EmptyState" {...rest}>{icon === undefined ? null : <i className={classes('ph', icon)} aria-hidden="true" />}{title === undefined ? children : <><div className="empty-state-title">{title}</div>{hint === undefined ? null : <div className="empty-state-hint">{hint}</div>}{action === undefined ? null : <div className="empty-state-action">{action}</div>}</>}</div>;
});

export interface LogLine { readonly time?: string; readonly level?: 'info' | 'ok' | 'warn' | 'fail'; readonly text: ReactNode }
export interface LogPanelProps extends HTMLAttributes<HTMLDivElement> { readonly lines?: readonly LogLine[] }
export const LogPanel = forwardRef<HTMLDivElement, LogPanelProps>(function LogPanel({ lines, children, className, ...rest }, ref) {
  return <div ref={ref} className={classes('log-panel', className)} data-ui-component="LogPanel" {...rest}>{children ?? lines?.map((line, index) => <div className="log-line" key={`${line.time ?? ''}-${index}`}><span className="log-time">{line.time}</span><span className={classes('log-level', `log-level-${line.level ?? 'info'}`)}>{line.level ?? 'info'}</span><span>{line.text}</span></div>)}</div>;
});

export interface ConfirmDialogProps {
  readonly open?: boolean;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
export function ConfirmDialog({ open = true, title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return <Dialog open={open} title={title} onClose={onCancel} actions={<><Button variant="secondary" autoFocus onClick={onCancel}>{cancelLabel}</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button></>}>{children}</Dialog>;
}

/**
 * R-091 (hardening §3.2 row 4; REQ-NOTIFY-001's "failed with one concrete next step named", REQ-NOTIFY-005): the words of a
 * window whose drawing failed. The headline names what did not work in plain words; the error itself is not here but in the
 * persistent notice its root's error options raise through main (`renderer/render-failure.ts`), whose detail block carries
 * the stack. Exported so the renderer's report and a test read the same sentences.
 */
export const RENDER_FAILURE_WORDS = {
  title: 'This window stopped drawing',
  hint: 'Something in this window failed while it was being drawn. Reloading draws it again; the error is described in the notice.',
  action: 'Reload this window',
} as const;

export interface RenderFailureFallbackProps {
  /** Asks main to load this window's page again (`window.reload`). */
  readonly onReload: () => void;
}
/** What a window shows in place of a tree that threw while drawing: the language's empty state, with the one action. */
export function RenderFailureFallback({ onReload }: RenderFailureFallbackProps) {
  return <div className="render-failure" role="alert" data-ui-component="RenderFailureFallback"><EmptyState icon="ph-warning-octagon" title={RENDER_FAILURE_WORDS.title} hint={RENDER_FAILURE_WORDS.hint} action={<Button variant="primary" onClick={onReload} data-ui="render-failure-reload">{RENDER_FAILURE_WORDS.action}</Button>} /></div>;
}

export interface RenderFailureBoundaryProps {
  readonly children?: ReactNode;
  /** The fallback's one action: asks main to reload this window (`window.reload`). */
  readonly onReload: () => void;
}
interface RenderFailureBoundaryState { readonly failed: boolean }
/**
 * R-091 (hardening §3.2 row 4): the error boundary every window's root is wrapped in. A component that throws while it is
 * drawn no longer unmounts the whole tree to a blank window: React hands the error here and the window draws
 * `RenderFailureFallback` instead. Reporting is not this component's: React calls the root's `onCaughtError` for every error
 * a boundary catches, and the root sends it to main (`renderer/render-failure.ts`), so an error is reported exactly once.
 * The boundary stays in its failed state until the window is reloaded — a tree that threw is not drawn again on its own.
 */
export class RenderFailureBoundary extends Component<RenderFailureBoundaryProps, RenderFailureBoundaryState> {
  override state: RenderFailureBoundaryState = { failed: false };
  static getDerivedStateFromError(): RenderFailureBoundaryState {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? <RenderFailureFallback onReload={this.props.onReload} /> : this.props.children;
  }
}
