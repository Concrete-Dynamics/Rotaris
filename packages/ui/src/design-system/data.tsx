import { forwardRef, useId, type HTMLAttributes, type ReactNode, type SVGAttributes, type TableHTMLAttributes } from 'react';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes, componentClass } from './shared.js';

export interface SparklineProps extends Omit<SVGAttributes<SVGSVGElement>, 'values'> {
  readonly values: readonly number[];
  readonly label: string;
}
export function Sparkline({ values, label, className, ...rest }: SparklineProps) {
  if (values.length === 0) return null;
  const width = 96;
  const height = 28;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(1, high - low);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * width},${height - ((value - low) / span) * height}`).join(' ');
  return <svg className={classes('sparkline', className)} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} data-ui-component="Sparkline" {...rest}><polyline points={points} /></svg>;
}

export interface MeterBarProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: number;
  readonly max?: number;
  readonly label: string;
  readonly tone?: 'accent' | 'running' | 'waiting' | 'danger';
}
export const MeterBar = forwardRef<HTMLDivElement, MeterBarProps>(function MeterBar({ value, max = 100, label, tone = 'accent', className, ...rest }, ref) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return <div ref={ref} className={classes('meter', `meter-${tone}`, className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} data-ui-component="MeterBar" {...rest}><span className="meter-fill" style={{ width: `${percent}%` }} /></div>;
});

export interface ContextRingProps extends HTMLAttributes<HTMLDivElement> {
  readonly value: number;
  readonly max?: number;
  readonly label: string;
  readonly size?: number;
  readonly children?: ReactNode;
}
export const ContextRing = forwardRef<HTMLDivElement, ContextRingProps>(function ContextRing({ value, max = 100, label, size = 64, children, className, ...rest }, ref) {
  const id = useId();
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const fill = (percent / 100) * circumference;
  return <div ref={ref} className={classes('ctx-ring', className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} style={{ width: size, height: size }} data-ui-component="ContextRing" {...rest}><svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true"><title id={id}>{label}</title><circle className="ctx-ring__track" cx="32" cy="32" r={radius} /><circle className="ctx-ring__fill" cx="32" cy="32" r={radius} strokeDasharray={`${fill} ${circumference - fill}`} transform="rotate(-90 32 32)" /></svg><span className="ctx-ring__value mono">{children ?? `${percent}%`}</span></div>;
});

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> { readonly ui?: UiLayoutContract }
export const Table = forwardRef<HTMLTableElement, TableProps>(function Table({ className, ui, ...rest }, ref) {
  return <table ref={ref} className={componentClass(className, 'table')} data-ui-component="Table" {...layoutContractAttributes(ui)} {...rest} />;
});
