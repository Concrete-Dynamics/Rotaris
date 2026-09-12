import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes, componentClass } from './shared.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label?: ReactNode;
  readonly ui?: UiLayoutContract;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, className, ui, ...rest }, ref) {
  const field = <input ref={ref} className={componentClass(className, 'input')} data-ui-component="Input" {...layoutContractAttributes(ui)} {...rest} />;
  if (label === undefined) return field;
  return <label className="field"><span className="field-label">{label}</span>{field}</label>;
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: ReactNode;
  readonly ui?: UiLayoutContract;
}
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, className, ui, ...rest }, ref) {
  const field = <textarea ref={ref} className={componentClass(className, 'input')} data-ui-component="TextArea" {...layoutContractAttributes(ui)} {...rest} />;
  if (label === undefined) return field;
  return <label className="field"><span className="field-label">{label}</span>{field}</label>;
});

/**
 * The checkbox the adopted material does not draw — OQ-57, answered by the owner on 2026-09-13.
 *
 * Built from parts the language DOES declare rather than invented: the hairline border and
 * `--rt-border-strong` of `.input`, the small radius, the accent for the checked ground, and the
 * one focus ring every control shares. The native input stays underneath for its semantics and its
 * keyboard behaviour; the box IS the input, drawn with `appearance: none`, so a
 * screen reader, a pointer and a focus ring all meet one element. The label always sits beside the box, on one line.
 */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Visible text beside the box. Omit it only where the row already names the control, and pass `aria-label`. */
  readonly label?: ReactNode;
  readonly hint?: ReactNode;
  readonly ui?: UiLayoutContract;
}
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, hint, className, ui, ...rest }, ref) {
  return (
    <label className={classes('check', label === undefined && 'check--bare', className)} data-ui-component="Checkbox" {...layoutContractAttributes(ui)}>
      <input ref={ref} type="checkbox" className="check__input" {...rest} />
      {label === undefined ? null : <span className="check__label">{label}{hint === undefined ? null : <span className="check__hint text-secondary">{hint}</span>}</span>}
    </label>
  );
});

export interface SelectOption { readonly value: string; readonly label: ReactNode; readonly disabled?: boolean }
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: ReactNode;
  readonly options?: readonly SelectOption[];
  readonly ui?: UiLayoutContract;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, options, children, className, ui, ...rest }, ref) {
  const visual = componentClass(className, classes('input', 'select'));
  const field = (
    <select ref={ref} className={visual} data-ui-component="Select" {...layoutContractAttributes(ui)} {...rest}>
      {children ?? options?.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  );
  if (label === undefined) return field;
  return <label className="field"><span className="field-label">{label}</span>{field}</label>;
});
