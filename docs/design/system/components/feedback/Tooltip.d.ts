import * as React from 'react';

export interface TooltipProps {
  label: string;
  /** Optional shortcut chip shown after the label */
  kbd?: string;
  side?: 'top' | 'bottom';
  children: React.ReactNode;
}
export function Tooltip(props: TooltipProps): JSX.Element;
