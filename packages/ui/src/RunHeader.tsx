import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SessionRecord } from '@rotaris/contracts';
import { liveReasoningOptions, RUN_STATE_TAGS, runHeaderControlReason, runStateLabel, runTimingLabel, runTimingSeconds, type RunState } from './composer.js';
import { markMotionStart } from './motion.js';
import { COMPRESS_DESCRIPTION, COMPRESS_LABEL, COMPRESSING_LABEL, compressNow, useChatControls } from './slash/host.js';
import { Button as DesignButton, SearchableSelect as DesignSearchableSelect, layoutContractAttributes, type UiLayoutContract } from './design-system/index.js'; // Part AO

/**
 * R-097 (docs/design/briefs/transcript-rows.md, §8): the header never scrolls sideways, and its end group — the compress
 * control and the two selectors — stays inside it whole, on the header's first line or on a second of its own.
 */
const RUN_HEADER_LAYOUT = {
  root: { id: 'run-header', relations: [{ kind: 'viewport-scroll', axis: 'x', expected: false }] },
  // PD-SHELL-017: the end group stands at the head of the Run panel, and is held inside that panel instead.
  end: { id: 'run-header-end', relations: [{ kind: 'containment', target: 'run-panel' }, { kind: 'text-fit', axis: 'x' }] },
} satisfies Record<string, UiLayoutContract>;
import { ImprovementActivity } from './ImprovementActivity.js';
import { annotatedModelOptions } from './model-options.js';
import { useShellState } from './shell-state.js';

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
  /** PD-SHELL-017: the band's own row of controls — the intent line and the transcript's toolbar — drawn after the timing. */
  readonly children?: ReactNode;
  /** PD-SHELL-017 revision 2: what leads the band, before the run-state label — the Run panel's toggle. */
  readonly lead?: ReactNode;
}

/** PD-SHELL-017: the live-run controls REQ-CHAT-078 names, drawn at the head of the Run panel since the directive. */
export interface RunSwitchesProps {
  readonly runState: RunState;
  readonly session: SessionRecord | null;
  readonly runActive: boolean;
  readonly models: readonly string[];
  /** PD-CHAT-017: the levels the run's model offers (`ConfigSnapshot.modelReasoning`); empty offers the provider default alone. */
  readonly reasoningLevels?: readonly string[] | undefined;
  /** REQ-MONITOR-142/144: the live run's model and reasoning switch, next-iteration changes. */
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

/**
 * Part AO — REQ-CHAT-078..081 / REQ-MONITOR-090..094: "Compress context". Enabled only while a run is running and
 * locally owned, disabled with the same four reason texts as the selectors beside it (`runHeaderControlReason`);
 * on activation it relabels "Compressing…" and disables until the run host settles the concurrent pass
 * (REQ-CHAT-079/080), then restores the label. The start toast, the nothing-to-compress toast and the idle refusal
 * are `compressNow`'s; the count and the per-agent failures are the run host's. It reaches the run host through the
 * host `slash/host.ts` describes, because this header's prop list is not this part's to widen.
 *
 * Craft: the mockup's transcript column header carries "Compress context" as a quiet control in the row after the run
 * tag, beside pause and stop (`docs/design/README.md` §7, WORKSPACE → transcript column), drawn there as an icon with a
 * tooltip. The product draws this row's controls as compact ghost TEXT buttons — Part X's stash opener set that reading
 * of the same row, and a label the specification fixes is not hidden behind a tooltip (the icon font exists, `ph ph-*`,
 * and is not the reason) — so it is that button, in the header's `run-controls` region with the two selectors; no
 * container of its own.
 */
function CompressControl({ runState, runActive }: { runState: RunState; runActive: boolean }) {
  const host = useChatControls();
  const [pending, setPending] = useState(false);
  const reason = runHeaderControlReason(runState) ?? (runActive ? null : runHeaderControlReason('idle'));
  const disabled = reason !== null || host === null || pending;
  const activate = () => {
    if (host === null || pending) return;
    setPending(true);
    void compressNow(host).finally(() => setPending(false));
  };
  return (
    <>
      <DesignButton type="button" className="btn btn-ghost btn-compact run-header__compress" data-testid="run-compress" data-pending={pending ? '1' : '0'}
        disabled={disabled} aria-disabled={disabled} aria-describedby="run-compress-reason"
        title={reason ?? COMPRESS_DESCRIPTION} onClick={activate}>{pending ? COMPRESSING_LABEL : COMPRESS_LABEL}</DesignButton>
      <span className="visually-hidden" id="run-compress-reason">{reason ?? COMPRESS_DESCRIPTION}</span>
    </>
  );
}

/** PD-SHELL-017 clause 2: below this band width the toolbar's text buttons are their icons, and the intent status and the scope's detail are said and not drawn. */
export const RUN_BAND_COMPACT_BELOW = 1040;

export function RunHeader({ runState, session, runActive, stepStartedAt, children, lead }: RunHeaderProps) {
  // The band's own width, and not the window's: the Run panel beside it and the sidebar take theirs first.
  const band = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = band.current;
    if (!element || typeof ResizeObserver !== 'function') return;
    // The reading is applied on the next frame: a state change made inside the observer's own delivery relays the band out
    // again in the same frame, which the browser reports as an undelivered-notifications loop (update-depth-proof, 2026-11-18).
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCompact(element.clientWidth < RUN_BAND_COMPACT_BELOW));
    });
    observer.observe(element);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  /*
   * REQ-LIBRARY-125's second indicator. It is read from the shell store rather than taken as a prop: the
   * activity belongs to the application (one FIFO over every session, REQ-LIBRARY-123/126) and not to this
   * run, and this header's prop list is not the improvement domain's to widen. It changes no control here —
   * REQ-LIBRARY-125 forbids disabling anything while an analysis runs, the send button included.
   */
  const improvementAnalysis = useShellState((s) => s.improvementAnalysis);
  return (
    <div ref={band} className="run-header" role="group" aria-label="Run" data-state={runState} data-compact={compact ? '1' : '0'} data-testid="run-header" {...layoutContractAttributes(RUN_HEADER_LAYOUT.root)}>
      {lead}
      {/* The design's Tag with a status dot, which is how the material draws a run's state (README §7). */}
      <span className={`tag ${RUN_STATE_TAGS[runState].tone} run-header__state`} data-testid="run-state">
        <span ref={(element) => { if (element && RUN_STATE_TAGS[runState].live) markMotionStart(element); }}
          className={`status-dot${RUN_STATE_TAGS[runState].live ? ' is-pulsing' : ''}`} aria-hidden="true" />
        {runStateLabel(runState)}
      </span>
      <RunTiming session={session} busy={runActive} stepStartedAt={stepStartedAt} />
      <ImprovementActivity active={improvementAnalysis.active} pass={improvementAnalysis.pass} placement="run-header" />
      {children}
    </div>
  );
}

/**
 * PD-SHELL-017: the live-run controls — "Compress context" and the two selectors — as the head of the Run panel. They
 * were the run header's end group until the directive; nothing about them changed but where they stand. REQ-CHAT-078 /
 * REQ-CHAT-006's closing sentence: they change the LIVE run and follow the opposite rule to the composer's chips —
 * enabled only while a run is running and locally owned, and stating one of the four reason texts whenever they are not.
 */
export function RunSwitches({ runState, session, models, reasoningLevels = [], onSetModel, onSetReasoning, onError }: RunSwitchesProps) {
  const headerReason = runHeaderControlReason(runState);
  return (
      <div className="run-header__end" {...layoutContractAttributes(RUN_HEADER_LAYOUT.end)}>
        {(onSetModel || onSetReasoning) && (
          <div className="run-controls" aria-label="Active run model and reasoning">
            <span className="visually-hidden" id="run-controls-reason">{headerReason ?? ''}</span>
            {onSetModel && models.length > 0 && (
              <>
                {/* PD-CHAT-001's icon clause: the wording rides as the accessible name; the icon leads. */}
                <i className="ph ph-cpu run-controls__icon" aria-hidden="true" />
                <DesignSearchableSelect className="input select chip-control__select" ariaLabel="Active run model" data-testid="run-model" value="" disabled={headerReason !== null}
                  title={headerReason ?? 'Switch the live run to another model from its next iteration, for the rest of this run.'} aria-describedby="run-controls-reason"
                  filterPlaceholder="Filter models…"
                  /* REQ-MONITOR-194: a key the session holds out of quota is annotated, still choosable — the switch clears it. */
                  options={[{ value: '', label: 'Switch model…' }, ...annotatedModelOptions(models, session?.excludedModels ?? [])]}
                  onChange={(v) => { if (v !== '') void onSetModel(v).then((r) => { if (!r.ok) onError(r.reason); }); }} />
              </>
            )}
            {onSetReasoning && (
              <>
                <i className="ph ph-brain run-controls__icon" aria-hidden="true" />
                {/* PD-SHELL-017: the same control as the model beside it, so the two read as a pair; PD-CHAT-017: the levels are the run's model's own, after the provider default. */}
                <DesignSearchableSelect className="input select chip-control__select" ariaLabel="Active run reasoning" data-testid="run-reasoning" value="" disabled={headerReason !== null}
                  title={headerReason ?? 'Switch the live run to another reasoning effort from its next iteration, for the rest of this run.'} aria-describedby="run-controls-reason"
                  filterPlaceholder="Filter levels…" emptyText="No matching level."
                  options={[{ value: '', label: 'Switch reasoning…' }, ...liveReasoningOptions(reasoningLevels)]}
                  onChange={(v) => { if (v !== '') void onSetReasoning(v).then((r) => { if (!r.ok) onError(r.reason); }); }} />
              </>
            )}
          </div>
        )}
      </div>
  );
}

/** PD-SHELL-017: REQ-CHAT-078's "Compress context", on the Run panel's title line. */
export function RunCompress({ runState, runActive }: { runState: RunState; runActive: boolean }) {
  return (
    <div className="run-controls" aria-label="Active run controls">
      <CompressControl runState={runState} runActive={runActive} />
    </div>
  );
}
