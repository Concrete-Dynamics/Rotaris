import { forwardRef, useId, type HTMLAttributes, type ReactNode, type SVGAttributes, type TableHTMLAttributes } from 'react';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes, componentClass } from './shared.js';

export interface SparklineProps extends Omit<SVGAttributes<SVGSVGElement>, 'values'> {
  readonly values: readonly number[];
  /** The accessible name of the drawn trend. */
  readonly label: string;
  /** The accessible name of the empty form below two values (OQ-540); it states that there is no history yet. */
  readonly emptyLabel?: string;
}
/** The specimen's box (`docs/design/system/components/data/Sparkline.jsx`): 160 by 22, stretched to its container. */
export const SPARKLINE_VIEW = { width: 160, height: 22 } as const;
/**
 * A single-series trend. The stroke is the component's own, `--rt-viz-1` on `.sparkline__series` in `shell.css`, and no call site
 * passes a colour (OQ-539: §1.3's ramp is "used in order", so one series takes its first stop).
 *
 * Below two values it renders its EMPTY form (OQ-540, the §4.1 amendment of 2026-11-03; REQ-MONITOR-166's "explicit empty
 * sparkline rather than a flat line"): the same box, so a card does not reflow when the second sample arrives; `role="img"` under
 * `emptyLabel`; no series. Its one mark is an empty pair of axes in `--rt-viz-grid` (§1.3's token for chart rules), told from a
 * series by shape and by name, never by colour alone (REQ-SHELL-149). Until 2026-11-05 it returned null at zero values and drew a
 * one-point polyline at one.
 */
export function Sparkline({ values, label, emptyLabel = 'No history yet', className, ...rest }: SparklineProps) {
  const { width, height } = SPARKLINE_VIEW;
  const box = { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', role: 'img', 'data-ui-component': 'Sparkline' } as const;
  if (values.length < 2) {
    return <svg className={classes('sparkline', 'sparkline--empty', className)} {...box} aria-label={emptyLabel} data-empty="true" {...rest}><path className="sparkline__axes" d={`M0.5,0 V${height - 0.5} H${width}`} /></svg>;
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(1, high - low);
  // The specimen's one-unit inset top and bottom, so the stroke is never cut at the box's edge.
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 1 - ((value - low) / span) * (height - 2)}`).join(' ');
  return <svg className={classes('sparkline', className)} {...box} aria-label={label} {...rest}><polyline className="sparkline__series" points={points} /></svg>;
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
