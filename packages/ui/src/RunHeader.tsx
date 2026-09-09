import { useEffect, useState } from 'react';
import type { SessionRecord } from '@rotaris/contracts';
import { REASONING_LEVELS, RUN_STATE_TAGS, runHeaderControlReason, runStateLabel, runTimingLabel, runTimingSeconds, type RunState } from './composer.js';
import { markMotionStart } from './motion.js';

/**
 * Part AN — the run header, extracted from `WorkspaceView.tsx` as a pure move of Part AB's markup so that Part AO can
 * add REQ-CHAT-078's "Compress context" control here without editing the view. Nothing here changed in the move: the
 * run-state Tag with its status dot (REQ-CHAT-008, the design's Tag per README §7), REQ-CHAT-158's timing indicator,
 * and REQ-CHAT-078's live-run selectors, which follow the OPPOSITE enablement rule to the composer's chips
 * (REQ-CHAT-006's closing sentence) and state one of the four reason texts whenever they are disabled.
 */
export interface RunHeaderProps {
  readonly runState: RunState;
  readonly session: SessionRecord | null;
  /** A run this instance actually owns — what the timing indicator counts against. */
  readonly runActive: boolean;
  /** REQ-CHAT-158: the step the run is inside now, from the newest row it produced (see `composer.ts`). */
  readonly stepStartedAt: string | null;
  readonly models: readonly string[];
  /** REQ-MONITOR-142/144: the run header's model and reasoning switch, next-iteration changes. */
  readonly onSetModel?: ((model: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onSetReasoning?: ((level: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** A refusal from either selector is raised on the composer's error line, as before the move. */
  readonly onError: (reason: string) => void;
}

/**
 * REQ-CHAT-158's run-timing indicator, and REQ-CHAT-008's run-state label, in the run header.
 *
 * The tick is the surface's own once-a-second interval and **writes nothing**: it sets no session state, sends
 * no command and causes no transcript publication (REQ-MONITOR-108). The value it renders is a pure function of
 * the record the surface already holds, so a tick that renders the same string changes nothing at all.
 */
function RunTiming({ session, busy, stepStartedAt }: { session: SessionRecord | null; busy: boolean; stepStartedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const seconds = session === null ? null : runTimingSeconds({ runStartedAt: session.runStartedAt, updatedAt: session.updatedAt, busy, stepStartedAt }, now);
  const label = runTimingLabel(seconds);
  return (
    <span className="run-header__timing mono" data-testid="run-timing" data-seconds={seconds === null ? '' : String(Math.floor(seconds))} data-frozen={busy ? '0' : '1'}>
      {label ?? ''}
    </span>
  );
}

export function RunHeader({ runState, session, runActive, stepStartedAt, models, onSetModel, onSetReasoning, onError }: RunHeaderProps) {
  /**
   * REQ-CHAT-078 / REQ-CHAT-006's closing sentence: the run header's own model and reasoning selectors change the
   * LIVE run, and follow the opposite rule to the composer's chips — enabled only while a run is running and
   * locally owned, and stating one of the four reason texts whenever they are not.
   */
  const headerReason = runHeaderControlReason(runState);
  return (
    <div className="run-header" role="group" aria-label="Run" data-state={runState} data-testid="run-header">
      {/* The design's Tag with a status dot, which is how the material draws a run's state (README §7). */}
      <span className={`tag ${RUN_STATE_TAGS[runState].tone} run-header__state`} data-testid="run-state">
        <span ref={(element) => { if (element && RUN_STATE_TAGS[runState].live) markMotionStart(element); }}
          className={`status-dot${RUN_STATE_TAGS[runState].live ? ' is-pulsing' : ''}`} aria-hidden="true" />
        {runStateLabel(runState)}
      </span>
      <RunTiming session={session} busy={runActive} stepStartedAt={stepStartedAt} />
      {(onSetModel || onSetReasoning) && (
        <div className="run-controls" aria-label="Active run model and reasoning">
          <span className="visually-hidden" id="run-controls-reason">{headerReason ?? ''}</span>
          {onSetModel && models.length > 0 && (
            <select className="input select" aria-label="Active run model" data-testid="run-model" defaultValue="" disabled={headerReason !== null} aria-disabled={headerReason !== null}
              title={headerReason ?? 'Switch the live run to another model from its next iteration.'} aria-describedby="run-controls-reason"
              onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetModel(v).then((r) => { if (!r.ok) onError(r.reason); }); }}>
              <option value="">Switch model…</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {onSetReasoning && (
            <select className="input select" aria-label="Active run reasoning" data-testid="run-reasoning" defaultValue="" disabled={headerReason !== null} aria-disabled={headerReason !== null}
              title={headerReason ?? 'Switch the live run to another reasoning effort from its next iteration.'} aria-describedby="run-controls-reason"
              onChange={(e) => { const v = e.currentTarget.value; if (v !== '') void onSetReasoning(v).then((r) => { if (!r.ok) onError(r.reason); }); }}>
              <option value="">Switch reasoning…</option>
              {REASONING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
