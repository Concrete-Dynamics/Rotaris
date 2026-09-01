import * as React from 'react';

export interface CardProps {
  title?: string;
  /** Paints the 2px accent left rule used on every dashboard KPI/summary card. */
  accented?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}
export function Card(props: CardProps): JSX.Element;
