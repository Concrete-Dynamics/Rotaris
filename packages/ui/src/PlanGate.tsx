import { useEffect, useRef, useState } from 'react';
import type { PlanDecision, PlanGatePayload } from '@rotaris/contracts';
import { Button as DesignButton, TextArea as DesignTextArea } from './design-system/index.js';
import { Markdown } from './markdown/Markdown.js';

/**
 * REQ-ORCH-153 / REQ-ORCH-154 / REQ-SHELL-168, PD-ORCH-002: the plan gate, hosted INSIDE the primary view that carries the run.
 *
 * It is deliberately not a dialog. REQ-SHELL-168 makes this the one surface no dismissal answers — window-level
 * Escape (REQ-SHELL-055), switching view, closing the view and closing the window all leave the decision pending —
 * so there is no Escape handler here and no `aria-modal`. `PauseDialog.tsx` is the right precedent for SHAPE (three
 * labelled buttons from REQ-SHELL-048's vocabulary, every one keyboard-reachable at the minimum window size) and
 * the wrong one for PLACEMENT.
 *
 * PD-ORCH-002 narrows REQ-ORCH-153: the plan is rendered as formatted Markdown by default, with an inline toggle
 * to view or edit the verbatim source text. Editing the text approves nothing: the user's text is written through
 * `onEdit` and the three answers stay exactly where they were (REQ-ORCH-154).
 */
export interface PlanGateProps {
  readonly gate: PlanGatePayload;
  /** REQ-ORCH-154: records the user's text. Never a decision. */
  readonly onEdit: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** REQ-ORCH-153: the three answers, exactly. */
  readonly onDecide: (decision: PlanDecision, changes: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onOpenLink?: ((href: string) => void) | undefined;
}

/** REQ-ORCH-153, PD-ORCH-002: implied todo state deduplicated and stripped of redundant duplicate lines. */
export function planTodoLines(todo: string): readonly string[] {
  if (todo.trim() === '') return [];
  try {
    const parsed = JSON.parse(todo) as { planner?: { phases?: { tasks?: { state?: string; text?: string }[] }[] }; phases?: { tasks?: { state?: string; text?: string }[] }[] };
    const phases = parsed.planner?.phases ?? parsed.phases ?? [];
    const all = phases.flatMap((p) => (p.tasks ?? []).map((t) => `[${t.state ?? 'pending'}] ${t.text ?? ''}`)).filter((l) => l.trim() !== '');
    // PD-ORCH-002: deduplicate identical items in order
    const seen = new Set<string>();
    const deduplicated: string[] = [];
    for (const item of all) {
      if (!seen.has(item)) {
        seen.add(item);
        deduplicated.push(item);
      }
    }
    return deduplicated;
  } catch {
    return [];
  }
}

export function PlanGate({ gate, onEdit, onDecide, onOpenLink }: PlanGateProps) {
  // The edit is local while it is being typed and written through on blur; `edited` is what the store already holds.
  const [text, setText] = useState(gate.edited ?? gate.plan);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [changes, setChanges] = useState('');
  const [showChanges, setShowChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenCycle, setSeenCycle] = useState(gate.cycle);
  const first = useRef<HTMLButtonElement>(null);
  const changesRef = useRef<HTMLTextAreaElement>(null);

  // A further cycle is a different plan: the field takes the new text rather than keeping the previous one's edit.
  if (seenCycle !== gate.cycle) {
    setSeenCycle(gate.cycle);
    setText(gate.edited ?? gate.plan);
    setChanges('');
    setShowChanges(false);
    setError(null);
  }
  useEffect(() => { first.current?.focus(); }, [gate.cycle]);

  const flush = async () => {
    if (text === (gate.edited ?? gate.plan)) return;
    const r = await onEdit(text);
    if (!r.ok) setError(r.reason);
  };

  const decide = async (decision: PlanDecision) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // REQ-ORCH-154: the edited text is the plan the run carries out, so it is written before the answer is taken.
    if (decision !== 'cancel') await flush();
    const r = await onDecide(decision, changes);
    if (!r.ok) { setError(r.reason); setBusy(false); }
  };

  const todo = planTodoLines(gate.todo);

  return (
    <section className="plan-gate" role="region" aria-labelledby="plan-gate-title" data-testid="plan-gate" data-cycle={gate.cycle}>
      <header className="plan-gate__header">
        <div className="plan-gate__header-left">
          <h2 id="plan-gate-title" className="plan-gate__title">Plan ready for your decision</h2>
          <dl className="plan-gate__facts mono" aria-label="Plan facts">
            <div><dt>Cycle</dt><dd data-figure="cycle">{gate.cycle}</dd></div>
            <div><dt>Intent</dt><dd data-figure="intent">{gate.intent}</dd></div>
          </dl>
        </div>
        <div className="plan-gate__view-toggle" role="group" aria-label="Plan presentation">
          <DesignButton
            type="button"
            className={`btn btn-compact ${mode === 'preview' ? 'btn-secondary is-active' : 'btn-ghost'}`}
            data-testid="plan-gate-toggle-preview"
            onClick={() => setMode('preview')}>
            Preview
          </DesignButton>
          <DesignButton
            type="button"
            className={`btn btn-compact ${mode === 'edit' ? 'btn-secondary is-active' : 'btn-ghost'}`}
            data-testid="plan-gate-toggle-edit"
            onClick={() => setMode('edit')}>
            Edit source
          </DesignButton>
        </div>
      </header>

      <p className="plan-gate__body">
        Nothing writes files or runs commands until you answer. Review or edit the plan below before approving.
      </p>

      {gate.changes.trim() !== '' && (
        <p className="plan-gate__prior text-secondary" data-testid="plan-gate-prior">You asked for: {gate.changes}</p>
      )}

      {/* PD-ORCH-002: Markdown preview by default; raw monospace textarea in edit mode or when editing */}
      <div className={mode === 'preview' ? 'plan-gate__preview-wrap' : 'visually-hidden'} data-testid="plan-gate-preview">
        <Markdown source={text} onOpenLink={onOpenLink} className="plan-gate__markdown" />
      </div>

      <DesignTextArea
        className={mode === 'edit' ? 'input plan-gate__plan mono' : 'visually-hidden'}
        aria-label="The plan"
        data-testid="plan-gate-plan"
        value={text}
        spellCheck={false}
        rows={7}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { void flush(); }}
      />

      {todo.length > 0 && (
        <div className="plan-gate__todo" data-testid="plan-gate-todo">
          <span className="plan-gate__todo-label">Todo state this plan implies</span>
          <ul className="plan-gate__todo-list mono">
            {todo.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}
          </ul>
        </div>
      )}

      {/* PD-ORCH-002: Progressive disclosure for changes to ask for */}
      <details className="plan-gate__changes-details" open={showChanges || changes.trim() !== ''}>
        <summary
          className="plan-gate__changes-summary text-secondary"
          onClick={(e) => {
            e.preventDefault();
            setShowChanges(!showChanges);
            if (!showChanges) setTimeout(() => changesRef.current?.focus(), 50);
          }}>
          {showChanges || changes.trim() !== '' ? 'Changes to ask for (used by Revise)' : '+ Add changes to ask for (optional, used by Revise)'}
        </summary>
        <div className="plan-gate__changes-group">
          <DesignTextArea
            ref={changesRef}
            id="plan-gate-changes"
            className="input plan-gate__changes"
            aria-label="Changes to ask for"
            placeholder="What should the next plan do differently?"
            value={changes}
            rows={2}
            disabled={busy}
            onChange={(e) => setChanges(e.target.value)}
          />
        </div>
      </details>

      {error && <p className="composer__error" role="alert">{error}</p>}

      <div className="dialog-actions plan-gate__actions" aria-label="Plan decision">
        <DesignButton ref={first} type="button" className="btn btn-primary" disabled={busy} data-testid="plan-approve" onClick={() => { void decide('approve'); }}>Approve</DesignButton>
        <DesignButton type="button" className="btn btn-secondary" disabled={busy} data-testid="plan-revise" onClick={() => { void decide('revise'); }}>Revise</DesignButton>
        <DesignButton type="button" className="btn btn-danger" disabled={busy} data-testid="plan-cancel" onClick={() => { void decide('cancel'); }}>Cancel the run</DesignButton>
      </div>
    </section>
  );
}
