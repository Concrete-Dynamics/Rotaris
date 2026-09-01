import * as React from 'react';

export interface ConfirmDialogProps {
  title: string;
  /** One sentence naming exactly what is lost or changed */
  children?: React.ReactNode;
  /** Verb-first, names the action: "Delete worktree", never "OK" */
  confirmLabel?: string;
  cancelLabel?: string;
  /** true (default): warning icon + danger confirm button */
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}
export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element;
