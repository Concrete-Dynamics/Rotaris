import * as React from 'react';

export interface TableCardProps {
  /** Uppercase kicker in the card header */
  title?: string;
  /** Right-aligned header actions (e.g. a link/compact button) */
  actions?: React.ReactNode;
  columns: React.ReactNode[];
  /** Cells may be any node — mono spans, Tags, StatusDots */
  rows: React.ReactNode[][];
  /** Footer meta line, e.g. "128 commits on main" */
  footer?: React.ReactNode;
  /** 2px accent left rule */
  accented?: boolean;
}
export function TableCard(props: TableCardProps): JSX.Element;
