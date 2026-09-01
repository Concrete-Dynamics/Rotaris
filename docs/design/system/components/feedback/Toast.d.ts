import * as React from 'react';

export interface ToastProps {
  /** info (default) | ok | warn | fail — fail/warn map to danger/amber, outside the axis triad */
  level?: 'info' | 'ok' | 'warn' | 'fail';
  title: string;
  children?: React.ReactNode;
  /** Optional action, e.g. a link-variant Button */
  action?: React.ReactNode;
  onDismiss?: () => void;
}
export function Toast(props: ToastProps): JSX.Element;

export interface ToastStackProps { children?: React.ReactNode; }
/** Fixed bottom-right container; newest toast last */
export function ToastStack(props: ToastStackProps): JSX.Element;
