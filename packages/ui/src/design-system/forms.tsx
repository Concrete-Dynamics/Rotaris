import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
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

/**
 * The composer's short send pill (PD-CHAT-001 revision 2, R-040 choice B): the primary button's own
 * fill as a pill — the system's ONE filled control (design §1.7) — carrying the mode's short label
 * visible ("Run" / "Continue" / "Queue") and the spec's own wording as its accessible name, so
 * REQ-CHAT-005 still states the mode and the strip stays one band. A submit by construction: it
 * sends the composer's form, which no press-revealed menu does — which is why it lives with the
 * fields rather than with the menu shells.
 */
export interface SendPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The mode's short label, visible on the pill. */
  readonly shortLabel: string;
  /** The spec's own wording — the accessible name, never the visible copy. */
  readonly sendName: string;
  readonly ui?: UiLayoutContract;
}
export const SendPill = forwardRef<HTMLButtonElement, SendPillProps>(function SendPill({ shortLabel, sendName, className, ui, type, title, ...rest }, ref) {
  return (
    <button ref={ref} type={type ?? 'submit'} className={componentClass(className, 'strip-send')} data-ui-component="SendPill" aria-label={sendName} title={title} {...layoutContractAttributes(ui)} {...rest}>
      {shortLabel}
      <i className="ph ph-arrow-up" aria-hidden="true" />
    </button>
  );
});

/**
 * A slider over a few named steps (PD-ORCH-019 clause 4: the depth slider; PD-ORCH-021 clause 9: the money slider). The
 * native range input is the control: it holds the value, the keyboard and the accessible name, and its `aria-valuetext`
 * says the step and what it permits. Under it each step is drawn as a stop with its figure and label; pointing at a stop
 * shows that step's description, and pressing a stop chooses it. A key clears the pointed stop, so what is shown is what has
 * focus. The stops are not in the tab order: the range input is the one focusable element, so a keyboard meets one control.
 *
 * A step may carry a `tone`: `warn` draws the chosen stop in the warning ink, always beside its name (REQ-SHELL-149).
 * `renderShown` draws what explains the shown step below its description — the money slider's preview — and `onShownChange`
 * tells the caller which step that is.
 */
export interface StepSliderStep {
  readonly label: string;
  /** What choosing this step permits, in one or two sentences. */
  readonly description: string;
  /** A small drawing of the step, beside its label. */
  readonly figure?: ReactNode;
  readonly tone?: 'warn' | undefined;
}
export interface StepSliderProps {
  readonly id: string;
  readonly steps: readonly StepSliderStep[];
  /** The chosen step's index. */
  readonly value: number;
  readonly onChange: (index: number) => void;
  readonly 'aria-label': string;
  /** Further ids that describe the range, after its description (a rule line, a live line). */
  readonly 'aria-describedby'?: string | undefined;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly ui?: UiLayoutContract;
  /** Drawn below the description for the shown step; `pointed` is true while it is a pointed step and not the chosen one. */
  readonly renderShown?: ((shown: number, pointed: boolean) => ReactNode) | undefined;
}

export const StepSlider = forwardRef<HTMLInputElement, StepSliderProps>(function StepSlider({ id, steps, value, onChange, disabled, className, ui, renderShown, ...rest }, ref) {
  const [pointed, setPointed] = useState<number | null>(null);
  const last = steps.length - 1;
  const chosen = Math.min(Math.max(value, 0), last);
  const shownIndex = pointed ?? chosen;
  const shown = steps[shownIndex];
  const describedBy = [`${id}-description`, rest['aria-describedby']].filter((v) => v !== undefined && v !== '').join(' ');
  return (
    <div className={classes('step-slider', className)} data-ui-component="StepSlider" data-step={chosen} data-steps={steps.length} {...layoutContractAttributes(ui)} onMouseLeave={() => setPointed(null)}>
      <div className="step-slider__rail">
        <input ref={ref} id={id} className="step-slider__input" type="range" min={0} max={last} step={1} value={chosen} disabled={disabled}
          aria-label={rest['aria-label']} aria-valuetext={`${steps[chosen]?.label ?? ''}: ${steps[chosen]?.description ?? ''}`} aria-describedby={describedBy}
          onKeyDown={() => setPointed(null)}
          onChange={(e) => onChange(Number(e.currentTarget.value))} />
        <div className="step-slider__stops" aria-hidden="true">
          {steps.map((step, index) => (
            <button key={step.label} type="button" tabIndex={-1} disabled={disabled} data-step-stop={index} data-tone={step.tone}
              className={classes('step-slider__stop', index <= chosen && 'is-reached', index === chosen && 'is-chosen', index === pointed && 'is-pointed')}
              onMouseEnter={() => setPointed(index)} onClick={() => { setPointed(null); onChange(index); }}>
              <span className="step-slider__mark" />
              {step.figure === undefined ? null : <span className="step-slider__figure">{step.figure}</span>}
              <span className="step-slider__label">{step.label}</span>
            </button>
          ))}
        </div>
      </div>
      <p id={`${id}-description`} className="step-slider__description" data-testid={`${id}-description`} data-pointed={pointed === null ? 'false' : 'true'}>{shown?.description ?? ''}</p>
      {renderShown?.(shownIndex, pointed !== null && pointed !== chosen)}
    </div>
  );
});
