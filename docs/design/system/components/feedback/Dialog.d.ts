import * as React from 'react';

export interface DialogProps {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
}
export function Dialog(props: DialogProps): JSX.Element;
