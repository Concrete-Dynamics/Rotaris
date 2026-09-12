import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
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
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState({ title, hint, icon, action, children, className, ...rest }, ref) {
  return <div ref={ref} className={classes('empty-state', 'rt-dot-grid-bg', className)} data-ui-component="EmptyState" {...rest}>{icon === undefined ? null : <i className={classes('ph', icon)} aria-hidden="true" />}{title === undefined ? children : <><div className="empty-state-title">{title}</div>{hint === undefined ? null : <div className="empty-state-hint">{hint}</div>}{action}</>}</div>;
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
