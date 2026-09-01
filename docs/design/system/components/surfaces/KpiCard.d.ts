import * as React from 'react';

export interface KpiCardProps {
  title: string;
  value: string;
  unit?: string;
  /** Usually a <Sparkline/> element. */
  sparkline?: React.ReactNode;
  footer?: React.ReactNode;
}
export function KpiCard(props: KpiCardProps): JSX.Element;
