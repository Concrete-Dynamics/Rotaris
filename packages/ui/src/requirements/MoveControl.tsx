import { forwardRef } from 'react';
import type { DeliveryColumn } from '@rotaris/contracts';
import { CLOSED_DROPDOWN_WIDTH, MOVE_CONTROL_NAME, type DropTargetOption, type MoveControlState } from './model.js';
import { Button as DesignButton, Select as DesignSelect } from '../design-system/index.js';

/**
 * Part AK2 — the keyboard move control (REQ-TRACE-390..392). The chord (Ctrl+M, registered through the command
 * registry and re-bindable there) does nothing but place focus on this control; the control aims at the FIRST
 * delivery state the engine reports as reachable for the selected requirement and states ONE column: reachable —
 * the sentence names the requirement, its source column and the target with the consequence in the sentence itself
 * and the accessible description equal to the visible text; refused — the sentence names the pair as unreachable
 * followed by the engine's own words unchanged, the tooltip a substring of it and identical to the accessible
 * description; nothing selected — the prompt naming the chord. Beside it the picker lists every delivery column
 * prefixed with the engine's glyph, a refused entry carrying the engine's reason as its tooltip (392), bounded at the
 * closed-vocabulary width (490). A refused control is not `disabled` — it stays focusable so the chord can reach it
 * and the reason is read from it — but activating it does nothing.
 */
export interface MoveControlProps {
  readonly state: MoveControlState;
  readonly options: readonly DropTargetOption[];
  readonly onMove: (to: DeliveryColumn) => void;
}

export const MoveControl = forwardRef<HTMLButtonElement, MoveControlProps>(function MoveControl({ state, options, onMove }, ref) {
  const reachable = state.kind === 'reachable';
  const tooltip = state.kind === 'reachable' ? (state.consequence ?? state.sentence) : state.kind === 'refused' ? state.reason : state.sentence;
  const name = state.kind === 'reachable' ? `${MOVE_CONTROL_NAME}: move ${state.id} to ${state.to}` : MOVE_CONTROL_NAME;
  return (
    <div className="req-move" data-testid="req-move" data-state={state.kind}>
      <DesignButton
        ref={ref}
        type="button"
        className={`btn btn-secondary btn-compact req-move__control${reachable ? '' : ' is-refused'}`}
        data-req-move="true"
        data-testid="req-move-control"
        aria-label={name}
        aria-description={state.kind === 'reachable' ? state.sentence : state.kind === 'refused' ? state.reason : state.sentence}
        aria-disabled={!reachable}
        title={tooltip}
        onClick={() => { if (state.kind === 'reachable') onMove(state.to); }}
      >
        {state.kind !== 'none' && <span className="req-move__glyph" aria-hidden="true">{state.glyph}</span>}
        <span className="req-move__sentence">{state.sentence}</span>
      </DesignButton>
      {state.kind !== 'none' && (
        <DesignSelect
          className="input select req-move__picker"
          data-testid="req-move-picker"
          aria-label={`Move ${state.id} to a delivery state`}
          style={{ width: CLOSED_DROPDOWN_WIDTH }}
          value=""
          onChange={(event) => { const to = event.currentTarget.value as DeliveryColumn | ''; if (to !== '') onMove(to); }}
        >
          <option value="">Move to…</option>
          {options.filter((o) => o.target !== state.from).map((o) => (
            <option key={o.target} value={o.target} disabled={!o.reachable} title={o.reachable ? o.consequence : o.reason} aria-description={o.reachable ? o.consequence : o.reason}>{o.glyph} {o.label}{o.reachable ? '' : ` — ${o.reason ?? ''}`}</option>
          ))}
        </DesignSelect>
      )}
    </div>
  );
});
