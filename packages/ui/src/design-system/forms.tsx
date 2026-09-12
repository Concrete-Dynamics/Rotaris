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
  const field = <textarea ref={ref} className={componentClass(className, 'input')} data-ui-component="Input" {...layoutContractAttributes(ui)} {...rest} />;
  if (label === undefined) return field;
  return <label className="field"><span className="field-label">{label}</span>{field}</label>;
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
