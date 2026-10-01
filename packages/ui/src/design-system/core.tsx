import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes } from './shared.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'link';
export type ButtonSize = 'default' | 'compact';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: string;
  readonly iconRight?: string;
  readonly ui?: UiLayoutContract;
}

/** The one button primitive. Existing specialised classes retain their exact visual contract. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size = 'default', icon, iconRight, type = 'button', className, children, ui, ...rest }, ref,
) {
  const specialised = className !== undefined && !/(?:^|\s)btn(?:\s|$)/.test(className) && variant === undefined && icon === undefined && iconRight === undefined;
  const visual = specialised
    ? className
    : classes('btn', variant === undefined ? (className === undefined ? 'btn-secondary' : '') : `btn-${variant}`, size === 'compact' && 'btn-compact', className);
  return (
    <button ref={ref} type={type} className={visual} data-ui-component="Button" {...layoutContractAttributes(ui)} {...rest}>
      {icon === undefined ? null : <i className={classes('ph', icon)} aria-hidden="true" />}
      {children}
      {iconRight === undefined ? null : <i className={classes('ph', iconRight)} aria-hidden="true" />}
    </button>
  );
});

/**
 * The design StatusDot's states (`docs/design/system/components/core/StatusDot.d.ts`): the lifecycle family — `run`,
 * `wait`, `done`, `fail` — and the health family — `ok`, `warn`, `fail` — never mixed on one surface, and `idle`.
 * `shell.css` paints each from the token the design component gives it, `idle` from `--rt-info-500` as
 * `docs/design/README.md` §4.1 resolves it (`.status-dot:where([data-state=…])`), at the
 * specificity of `.status-dot` alone, so a surface that paints its dot otherwise still does. Until 2026-10-01 the
 * product's kinds were written to `data-kind`, which no stylesheet read, so a bare dot drew nothing
 * (`docs/defects/fixed/the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md`).
 */
export const STATUS_DOT_STATES = ['run', 'wait', 'done', 'fail', 'ok', 'warn', 'idle'] as const;
export type StatusDotState = (typeof STATUS_DOT_STATES)[number];
export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  readonly state?: StatusDotState;
  readonly pulse?: boolean;
  readonly label?: string;
  readonly ui?: UiLayoutContract;
}
export const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(function StatusDot(
  { state = 'idle', pulse = false, label, className, style, ui, ...rest }, ref,
) {
  return <span ref={ref} className={classes('status-dot', pulse && 'is-pulsing', className)} data-state={state} aria-label={label} aria-hidden={label === undefined ? 'true' : undefined} style={style} data-ui-component="StatusDot" {...layoutContractAttributes(ui)} {...rest} />;
});

/**
 * The design Tag's kinds (`docs/design/system/components/core/Tag.d.ts`), each a tone the adopted `components.css`
 * defines: `run` / `wait` / `done` / `fail` from the state colours, `accent`, `neutral`, `outline` otherwise. The language
 * has no info tone. A `className` joins the foundation and the tone, as the design Tag composes them; the tone is named
 * by `kind` alone (`tools/check-ui-language.mjs` refuses a Tag whose class spells `tag` or a `tag-` tone). Until
 * 2026-10-01 four of the kinds (`running`, `waiting`, `danger`, `info`) named classes no stylesheet defines, and a
 * `className` replaced the foundation (`componentClass`), so every caller spelled `tag tag-…` by hand
 * (`docs/defects/fixed/the-design-tags-kinds-name-classes-the-adopted-stylesheet-does-not-define.md`).
 */
export const TAG_KINDS = ['accent', 'neutral', 'outline', 'run', 'wait', 'done', 'fail'] as const;
export type TagKind = (typeof TAG_KINDS)[number];
export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  readonly kind?: TagKind;
  readonly ui?: UiLayoutContract;
}
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag({ kind = 'neutral', className, ui, ...rest }, ref) {
  return <span ref={ref} className={classes('tag', `tag-${kind}`, className)} data-ui-component="Tag" {...layoutContractAttributes(ui)} {...rest} />;
});

export interface ToggleSwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly ui?: UiLayoutContract;
}
export const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(function ToggleSwitch(
  { checked, onChange, label, className, ui, ...rest }, ref,
) {
  // One accessible name, never two: a caller pointing at visible text keeps that text as the name.
  const named = rest['aria-labelledby'] === undefined ? label : undefined;
  return <button ref={ref} type="button" role="switch" aria-checked={checked} aria-label={named} className={classes('toggle', checked && 'is-on', className)} onClick={() => onChange(!checked)} data-ui-component="ToggleSwitch" {...layoutContractAttributes(ui)} {...rest} />;
});

export interface SegmentOption { readonly value: string; readonly label: ReactNode; readonly disabled?: boolean }
export interface SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  readonly options: readonly SegmentOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly ui?: UiLayoutContract;
}
export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(function SegmentedControl(
  { options, value, onChange, label, className, ui, ...rest }, ref,
) {
  return (
    <div ref={ref} className={classes('segmented', className)} role="group" aria-label={label} data-ui-component="SegmentedControl" {...layoutContractAttributes(ui)} {...rest}>
      {options.map((option) => <Button key={option.value} type="button" className={classes('seg-opt', option.value === value && 'is-active')} aria-pressed={option.value === value} disabled={option.disabled} onClick={() => onChange(option.value)}>{option.label}</Button>)}
    </div>
  );
});

export interface KbdProps extends HTMLAttributes<HTMLElement> { readonly keys?: readonly string[] }
export function Kbd({ keys, children, className, ...rest }: KbdProps) {
  if (keys !== undefined) return <span className={classes('kbd-seq', className)} data-ui-component="Kbd" {...rest}>{keys.map((key) => <kbd key={key} className="kbd">{key}</kbd>)}</span>;
  return <kbd className={classes('kbd', className)} data-ui-component="Kbd" {...rest}>{children}</kbd>;
}
