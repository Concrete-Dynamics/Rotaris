import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes, componentClass } from './shared.js';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: ReactNode;
  readonly accented?: boolean;
  readonly footer?: ReactNode;
  readonly ui?: UiLayoutContract;
}
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ title, accented = false, footer, className, children, ui, ...rest }, ref) {
  return <div ref={ref} className={componentClass(className, classes('card', accented && 'card-accented'))} data-ui-component="Card" {...layoutContractAttributes(ui)} {...rest}>{title === undefined ? null : <div className="card-kicker">{title}</div>}{children}{footer === undefined ? null : <div className="card-meta">{footer}</div>}</div>;
});

export interface KpiCardProps extends Omit<CardProps, 'title'> {
  readonly title: ReactNode;
  readonly value: ReactNode;
  readonly unit?: ReactNode;
}
export function KpiCard({ title, value, unit, footer, className, ...rest }: KpiCardProps) {
  return <Card title={title} accented className={classes('card', 'card-accented', className)} footer={footer} data-ui-component="KpiCard" {...rest}><div><span className="kpi-value">{value}</span>{unit === undefined ? null : <span className="kpi-unit">{unit}</span>}</div></Card>;
}

export interface SectionLabelProps extends HTMLAttributes<HTMLDivElement> { readonly children?: ReactNode }
export const SectionLabel = forwardRef<HTMLDivElement, SectionLabelProps>(function SectionLabel({ className, ...rest }, ref) {
  return <div ref={ref} className={classes('card-kicker', className)} data-ui-component="SectionLabel" {...rest} />;
});
