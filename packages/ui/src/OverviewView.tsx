import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { PROPOSAL_STATUSES, isBusy, presentationChildState, presentationStatus, STATUS_LABELS, type AgentRecord, type ImprovementArtifactRecord, type ImprovementProposal, type PaneLayout, type ProposalStatus, type RepositoryState, type SessionListItemPayload, type SessionRecord } from '@rotaris/contracts';
import { AgentActivityCard, DelegationGraphCard, type DelegationProps } from './DelegationCards.js';
import { categoryLabel, ProposalDecisionDialog, RetrospectiveGesture, statusLabel } from './library/ProposalsTab.js';
import { Button as DesignButton, Card as DesignCard, EmptyState as DesignEmptyState, KpiCard as DesignKpiCard, layoutContractAttributes, PageHeader as DesignPageHeader, Sparkline as DesignSparkline, Spinner as DesignSpinner, Tag as DesignTag, type UiLayoutContract } from './design-system/index.js';

/**
 * REQ-SHELL-026's startup view. Structure from the specification — REQ-MONITOR-164 (the header), 165 (the two
 * resizable columns, the metric grid's reflow, the onboarding empty state), 166 (tokens, the sparkline the RUN
 * sampled, the cost label with its qualifier), 167 (tool calls), 168 (repository), 169 (agents), 170 (the total's
 * fallback), 171/172 (the sessions card as a run switcher, no requirement tag when none exists), 173 (the right
 * column's tiles), 174 (refresh from notifications, nothing while hidden — this component is mounted
 * only while shown) — and REQ-MONITOR-038 (the agent tree is the SAME component the Workspace sidebar uses).
 * PD-MONITOR-009 makes it the one monitoring view: the delegation graph with Pause and Cancel selection leads the right
 * column in place of 173's read-only tree card, and the agent activity table stands under the metric cards.
 * Language from docs/design/system: Card, KPI, Tag, Status dot, Empty state; tokens by name. The Overview audit of
 * 2026-11-02 (`docs/design/briefs/overview.md`) is cited by item where its repair of 2026-11-03 stands.
 */
export const OVERVIEW_RIGHT_DEFAULT = 340;
export const OVERVIEW_RIGHT_MIN = 260;
export const OVERVIEW_RIGHT_MAX = 560;
export const OVERVIEW_LEFT_MIN = 320;
/**
 * The divider track between the two columns: `--rt-space-4`, the left column's own between-group gap, so the seam reads wider
 * than the 12 px inside a group and the right column's first tile no longer reads as a fifth metric card (audit item 9; a literal
 * 8 px until 2026-11-03). The CSS and the inline template cite the token; this is its value, for the clamp.
 */
export const OVERVIEW_DIVIDER_WIDTH = 16;
/** The three session-scoped cards with no session focused (audit P4): a dash in every figure, and this one sentence as the caption. */
export const OVERVIEW_NO_SESSION_CAPTION = 'Describes the focused session; none is active.';
/** The sessions card when its read was refused (audit P1): the sentence, the refusal as copyable detail, one control that reads again. */
export const OVERVIEW_SESSIONS_FAILED = 'The session list could not be read.';
/** REQ-SHELL-137: the spinner that stands in for the body while the first read is pending is named for its wait (audit P3). */
export const OVERVIEW_LOADING_LABEL = 'Reading the session list';
/** The graph card's keyline (audit item 13, kept by PD-MONITOR-009's card): the kicker and the run row's dot share one x, within 1 px. */
export const OVERVIEW_AGENTS_KICKER_UI: UiLayoutContract = { id: 'overview-agents-kicker', relations: [] };
export const OVERVIEW_AGENTS_FIRST_DOT_UI: UiLayoutContract = { id: 'overview-agents-first-dot', relations: [{ kind: 'align-x', target: 'overview-agents-kicker', edge: 'left', tolerance: 1 }] };
/** Card above card takes one gap in both columns, `--rt-space-4` (audit item 16), published for `pnpm ui-audit`. */
const columnUi = (id: string): UiLayoutContract => ({ id, relations: [{ kind: 'spacing-token', property: 'gap', token: '--rt-space-4' }] });
/**
 * PD-LIBRARY-002 revision 2, clause (f) (OQ-236), narrowing REQ-LIBRARY-130: the proposals card's empty hint names both
 * ways a proposal is produced.
 */
export const OVERVIEW_PROPOSALS_HINT = "Run improvement analysis, or a retrospective over this workspace's history, to produce reviewable suggestions.";
/**
 * OQ-537 (ruled 2026-11-03, a reading of REQ-NOTIFY-006 and REQ-NOTIFY-010, no directive): while the provider rows list no
 * authenticated provider, the onboarding empty state keeps its title, its hint conveys REQ-WORKSPACE-152 (3)'s two facts in that
 * requirement's terms, and its one control is REQ-WORKSPACE-137's "Open Settings" at the `models` category (REQ-CONFIG-269) —
 * never the guided setup itself, whose places REQ-WORKSPACE-152 names exhaustively. Once any provider is authenticated the
 * first-use copy and "Open Workspace" return unchanged.
 */
export const OVERVIEW_EMPTY_TITLE = 'Nothing to show yet';
export const OVERVIEW_EMPTY_HINT = 'Start a run from the Workspace view. Finished and suspended runs, their tokens, tool calls and agents will be summarised here.';
export const OVERVIEW_NO_PROVIDER_HINT = 'No model provider is authenticated yet. Runs cannot start until one is.';
export const OVERVIEW_OPEN_SETTINGS = 'Open Settings';

export interface OverviewProps {
  readonly session: SessionRecord | null;
  /** The label the sessions list gives the followed session (its first prompt); the id stands in until it is known. */
  readonly sessions: readonly SessionListItemPayload[];
  readonly sessionsState: 'idle' | 'loading' | 'error';
  readonly sessionsError?: string | null | undefined;
  /** null: not read yet. */
  readonly repository: RepositoryState | null;
  /** REQ-MONITOR-169: the configured delegation caps, from the configuration snapshot. */
  readonly caps: { readonly depth: number; readonly fanOut: number } | null;
  readonly layout: PaneLayout | undefined;
  readonly onLayout: (layout: PaneLayout) => void;
  readonly nowIso?: string | null | undefined;
  readonly onListSessions: () => void;
  /** REQ-SHELL-125 (multi-session host): opens the launch dialog even while a run is active; a refusal reason is shown under the header. */
  readonly onNewSession: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Audit P1: the sessions card's failed read offers the Overview's own read again. */
  readonly onRefresh: () => void;
  readonly onOpenSession: (sessionId: string) => void;
  readonly onContinueSession: (sessionId: string) => void;
  readonly onGoTo: (view: 'workspace' | 'library') => void;
  /**
   * PD-MONITOR-009: the delegation graph with its run controls and the agent activity table, which stood on the Mission view
   * until PD-SHELL-015. The graph card leads the right column (clause 2) and the table card follows the metric cards (clause 3).
   */
  readonly delegation: DelegationProps;
  /**
   * OQ-537: whether the provider rows list an authenticated provider — main's own predicate for REQ-WORKSPACE-152 (3)'s notice
   * (`providers.list().some((row) => row.authenticated)`), so the hint and the notice cannot disagree. `null` until read; the
   * body waits on it as it waits on the session list, so the empty state never draws one copy and then the other.
   */
  readonly providerAuthenticated: boolean | null;
  /** OQ-537: REQ-WORKSPACE-137's "Open Settings", which navigates to the Settings primary view at `models` (REQ-CONFIG-269). */
  readonly onOpenSettings: (category: 'models') => void;
  readonly improvements: readonly ImprovementArtifactRecord[];
  readonly onOpenProposal: (proposalId?: string) => void;
  readonly onReviewProposal: (artifactId: string, proposalId: string, status: ProposalStatus, expectedVersionsDue: number) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly reducedMotion?: boolean | undefined;
}

/** REQ-MONITOR-166: thousands-separated with the `tok` suffix; REQ-MONITOR-170: the aggregate total, else input + output. */
export function tokenTotal(session: Pick<SessionRecord, 'tokenUsage' | 'usageHistory'>): number {
  const last = session.usageHistory.at(-1);
  return last ? Math.max(last[1], session.tokenUsage.input + session.tokenUsage.output) : session.tokenUsage.input + session.tokenUsage.output;
}
export const formatTokens = (n: number): string => `${n.toLocaleString('en-US')} tok`;

/** REQ-MONITOR-171: the sessions card's runtime and the header's, `m:ss` or `h:mm:ss`. */
export function runElapsedLabel(startedAt: string | null, nowIso: string): string {
  if (!startedAt) return '';
  const ms = Math.max(0, new Date(nowIso).getTime() - new Date(startedAt).getTime());
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * REQ-MONITOR-166's sparkline is the design `Sparkline` since 2026-11-05 (the Overview audit of 2026-11-02, item 11): its stroke
 * is the component's own `--rt-viz-1` (OQ-539) and fewer than two samples draw its explicit empty form (OQ-540), so the local
 * `sparklinePath` and the hand-drawn `svg.ov-spark` it fed are gone. The accessible name of that empty form:
 */
export const OVERVIEW_NO_TOKEN_HISTORY = 'No token history yet';

/**
 * REQ-MONITOR-169: waiting = waiting + queued; failed = failed + cancelled (+ blocked, which presents as failed).
 * PD-ORCH-005 clause 13 (revision 4): a `paused` agent is counted as `paused` — never waiting, and never failed (OQ-100).
 */
export function agentCounts(agents: readonly AgentRecord[]): { running: number; waiting: number; paused: number; done: number; failed: number; depth: number } {
  const c = { running: 0, waiting: 0, paused: 0, done: 0, failed: 0, depth: 0 };
  for (const a of agents) {
    const p = presentationChildState(a.state);
    if (p === 'running') c.running += 1;
    else if (p === 'waiting' || p === 'queued') c.waiting += 1;
    else if (p === 'paused') c.paused += 1;
    else if (p === 'done') c.done += 1;
    else c.failed += 1;
    c.depth = Math.max(c.depth, a.depth);
  }
  return c;
}

/**
 * REQ-MONITOR-169's detail line. PD-ORCH-005 clause 13 puts the paused count on it between waiting and done, and only
 * while an agent is paused, so every session with none reads exactly as the requirement words it (OQ-100).
 */
export function agentStatesLine(c: Pick<ReturnType<typeof agentCounts>, 'running' | 'waiting' | 'paused' | 'done' | 'failed'>): string {
  return `running ${c.running} · waiting ${c.waiting}${c.paused > 0 ? ` · paused ${c.paused}` : ''} · done ${c.done} · failed ${c.failed}`;
}

/**
 * The cost label's leading amount (PD-MONITOR-001's label text is fixed; this only chooses what the mono face sets): the figure,
 * `< 0.0001` included, and the rest of the label; a label with no leading figure ("price not established") is all rest.
 */
export function costLabelParts(text: string): { figure: string; rest: string } {
  const m = /^(<\s?)?\d[\d.,]*/.exec(text);
  return m ? { figure: m[0], rest: text.slice(m[0].length) } : { figure: '', rest: text };
}

/** REQ-MONITOR-171's dot: attached → run; background → informational; other busy → pulsing run; failed → failure; else idle. */
export function sessionDot(row: SessionListItemPayload, attached: boolean): { tone: 'run' | 'info' | 'fail' | 'idle'; pulse: boolean; text: string } {
  const p = presentationStatus(row.status);
  if (attached && isBusy(row.status)) return { tone: 'run', pulse: false, text: 'attached' };
  if (p === 'running') return { tone: 'info', pulse: false, text: 'background' };
  if (isBusy(row.status)) return { tone: 'run', pulse: true, text: STATUS_LABELS[p].toLowerCase() };
  if (p === 'failed') return { tone: 'fail', pulse: false, text: 'failed' };
  return { tone: 'idle', pulse: false, text: STATUS_LABELS[p].toLowerCase() };
}

/** REQ-MONITOR-165: the right column clamped to its bounds and the left column to its minimum. */
export function clampRight(right: number, containerWidth: number, dividerWidth = OVERVIEW_DIVIDER_WIDTH): number {
  const maxByLeft = containerWidth - OVERVIEW_LEFT_MIN - dividerWidth;
  return Math.round(Math.max(OVERVIEW_RIGHT_MIN, Math.min(OVERVIEW_RIGHT_MAX, right, Math.max(OVERVIEW_RIGHT_MIN, maxByLeft))));
}

/**
 * The Overview's card with a head band: the design `Card` (so every card carries `data-ui-component`, the Overview audit's item 11
 * counted the local `section.card` that did not), a named region, and the kicker beside the card's own controls. The four metric
 * cards are the design `KpiCard` instead; the three lists move to `TableCard` under item 7.
 */
function Card({ kicker, children, className = '', actions, kickerUi }: { kicker: string; children: React.ReactNode; className?: string; actions?: React.ReactNode; kickerUi?: UiLayoutContract | undefined }) {
  return (
    <DesignCard className={`card ov-card ${className}`} role="region" aria-label={kicker}>
      <div className="ov-card__head">
        <span className="card-kicker" {...layoutContractAttributes(kickerUi)}>{kicker}</span>
        {actions}
      </div>
      {children}
    </DesignCard>
  );
}

export function OverviewView(props: OverviewProps) {
  const { session, sessions, sessionsState, sessionsError = null, repository, caps, layout, onLayout, nowIso = null, reducedMotion = false, providerAuthenticated } = props;
  const now = nowIso ?? new Date().toISOString();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [right, setRight] = useState<number>(() => layout?.sizes[1] ?? OVERVIEW_RIGHT_DEFAULT);
  // A layout arriving from the preference store (REQ-SHELL-069) replaces the split: derived during render, not in an effect.
  const [seenLayout, setSeenLayout] = useState(layout);
  if (seenLayout !== layout) { setSeenLayout(layout); if (layout) setRight(layout.sizes[1] ?? OVERVIEW_RIGHT_DEFAULT); }
  const commit = useCallback((value: number) => {
    const width = bodyRef.current?.clientWidth ?? 1280;
    const next = clampRight(value, width);
    setRight(next);
    onLayout({ version: 1, panes: 2, sizes: [Math.max(OVERVIEW_LEFT_MIN, width - next - OVERVIEW_DIVIDER_WIDTH), next] });
  }, [onLayout]);
  // The divider: pointer drag, and Left/Right/Home/End on the keyboard (REQ-SHELL-032's tab-stop rule applies to it too).
  const drag = useRef<{ startX: number; startRight: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startRight: right };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setRight(clampRight(drag.current.startRight - (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const value = clampRight(drag.current.startRight - (e.clientX - drag.current.startX), bodyRef.current?.clientWidth ?? 1280);
    drag.current = null;
    commit(value);
  };
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowLeft') { e.preventDefault(); commit(right + step); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); commit(right - step); }
    else if (e.key === 'Home') { e.preventDefault(); commit(OVERVIEW_RIGHT_MAX); }
    else if (e.key === 'End') { e.preventDefault(); commit(OVERVIEW_RIGHT_MIN); }
  };

  const attachedRow = session ? sessions.find((s) => s.sessionId === session.id) ?? null : null;
  // REQ-MONITOR-164's `{status}` is the lower-case REQ-NOTIFY-048 member, the word the title-bar chip displays (REQ-SHELL-036) and
  // the sessions card announces; until 2026-11-03 it was REQ-CHAT-008's run-header label, so the header read "· Completed ·" over
  // a card saying "completed" (audit item 15). `STATUS_LABELS` stays the run header's, and the card's dot text.
  const headerLabel = session
    ? `session ${attachedRow?.label ?? session.id.slice(0, 8)} · ${presentationStatus(session.executionStatus)} · ${runElapsedLabel(session.runStartedAt, isBusy(session.executionStatus) ? now : session.updatedAt) || '—'}`
    : 'No session is active';
  // The body's three states with nothing listed and no session (REQ-MONITOR-165; audit P1 and P3): the spinner while the first
  // read is pending, the onboarding empty state once a read settled on zero sessions, and otherwise the grid — a refused read
  // included, which until 2026-11-03 drew as an empty store because only `loading` was excluded here.
  const nothingListed = session === null && sessions.length === 0;
  // The provider rows are read beside the list (OQ-537), so the empty state is drawn once, in the copy it keeps.
  const loading = nothingListed && (sessionsState === 'loading' || (sessionsState === 'idle' && providerAuthenticated === null));
  const empty = nothingListed && sessionsState === 'idle' && providerAuthenticated !== null;
  const counts = useMemo(() => agentCounts(session?.agents ?? []), [session]);
  const total = session ? tokenTotal(session) : 0;
  const samples = useMemo(() => (session?.usageHistory ?? []).map((sample) => sample[1]), [session]);
  const [newSessionError, setNewSessionError] = useState<string | null>(null);
  const [proposalDecision, setProposalDecision] = useState<{ artifactId: string; versionsDue: number; proposal: ImprovementProposal; status: ProposalStatus } | null>(null);
  const proposalRows = useMemo(() => props.improvements.flatMap((record) => record.artifact.proposals.map((proposal) => ({ artifactId: record.artifact.artifact_id, versionsDue: record.versions_due, proposal }))), [props.improvements]);
  const pendingProposals = proposalRows.filter((row) => row.proposal.status === 'pending_review').length;
  const newSession = async () => { const r = await props.onNewSession(); setNewSessionError(r.ok ? null : r.reason); };

  return (
    <div className="overview" data-testid="overview">
      <DesignPageHeader className="overview__header page-header">
        {/* The title and the session label are one baseline group — the adopted PageHeader aligns on the baseline, where the
            product's centres its items and inked the label about 1.3 px above the title (audit item 14); the row itself stays
            centred for its two controls. */}
        <div className="overview__heading">
          <h1 className="display overview__title">Overview</h1>
          <span className="page-header-sub overview__session mono" data-testid="overview-session">{headerLabel}</span>
        </div>
        <span className="overview__spacer" />
        <DesignButton type="button" className="btn btn-secondary" onClick={props.onListSessions}>List sessions</DesignButton>
        <DesignButton type="button" className="btn btn-primary" onClick={() => { void newSession(); }}>New session</DesignButton>
      </DesignPageHeader>
      {newSessionError && <p className="overview__error" role="alert" data-testid="overview-new-session-error">{newSessionError}</p>}
      {loading ? (
        /* Audit P3: while the first read is pending with no session, one Spinner named for its wait stands where the body will —
           never the onboarding empty state before the list is known, and never the nine-card grid with zero figures. */
        <div className="overview__loading" data-testid="overview-loading"><DesignSpinner label={OVERVIEW_LOADING_LABEL} /></div>
      ) : empty ? (
        /* REQ-MONITOR-165's onboarding empty state through the adopted shorthand: its one control is the secondary variant, so
           "New session" is the view's one filled control in every state (§1.7; audit item 3), and it stands in the `action` slot,
           `--rt-space-2` below the hint (audit item 12). OQ-537 (audit item 2): while no provider is authenticated the hint states
           REQ-WORKSPACE-152 (3)'s two facts and the control is REQ-WORKSPACE-137's "Open Settings" at `models`, since "Open
           Workspace" led to the step REQ-WORKSPACE-137 refuses; the title stays. */
        providerAuthenticated === false
          ? <DesignEmptyState className="empty-state overview__empty" data-testid="overview-empty" data-precondition="provider" title={OVERVIEW_EMPTY_TITLE} hint={OVERVIEW_NO_PROVIDER_HINT} action={<DesignButton type="button" className="btn btn-secondary" data-testid="overview-open-settings" onClick={() => props.onOpenSettings('models')}>{OVERVIEW_OPEN_SETTINGS}</DesignButton>} />
          : <DesignEmptyState className="empty-state overview__empty" data-testid="overview-empty" title={OVERVIEW_EMPTY_TITLE} hint={OVERVIEW_EMPTY_HINT} action={<DesignButton type="button" className="btn btn-secondary" onClick={() => props.onGoTo('workspace')}>Open Workspace</DesignButton>} />
      ) : (
        <div className="overview__body" ref={bodyRef} style={{ gridTemplateColumns: `minmax(${OVERVIEW_LEFT_MIN}px, 1fr) var(--rt-space-4) ${right}px` }}>
          <div className="overview__left" {...layoutContractAttributes(columnUi('overview-left'))}>
            <div className="overview__metrics">
              {/* Audit P4: with no session focused the three session-scoped cards draw a dash in every figure and one sentence as
                  their caption, as the Cloud credit tile and the header do, instead of ten zeros read as a session that measured
                  nothing; the Repository card reads the workspace, so its figures stay. Audit item 5: every figure a caption
                  carries is set in `--rt-font-mono` — a span per figure, the prose in the body face, as HOME sets "14/18" beside
                  "Billing core" — not the whole line: set whole in mono, "1 file touched · 0 uncommitted" and the cost label outgrew
                  the four-column card's 171 px at 1400 and broke "uncommitted" and "rates" from their figures (iteration 2's UIR-201).
                  The adopted `.card-meta` is a flex row, so each caption's content is one child span and wraps as inline text.
                  Audit item 11 (after OQ-539 and OQ-540, 2026-11-05): the three session-scoped metric cards are the design `KpiCard`
                  — unaccented, as the expanded overview strip draws its figure cards — and the trend is the design `Sparkline`, so the
                  local `section.card`, `.ov-kpi` row and hand-drawn `svg.ov-spark` are gone; the caller passes no colour, and below
                  two samples the component draws its explicit empty form. `ov-spark` and `data-samples` stay on the svg for
                  `pnpm overview-proof`'s probes. The caption no longer prefixes "no history yet · " below two samples: the empty form
                  states it, and the clause leaving at the second sample shrank the card by 17.81 px at 1000 wide, against OQ-540's "a
                  card does not reflow when the second sample arrives" (drive, 2026-11-05). */}
              <DesignKpiCard accented={false} className="ov-card ov-card--tokens" role="region" aria-label="Tokens" title="Tokens"
                value={<span data-testid="overview-tokens">{session ? total.toLocaleString('en-US') : '—'}</span>} unit="tok"
                sparkline={<DesignSparkline className="ov-spark" values={samples} label={`token history, ${samples.length} samples`} emptyLabel={OVERVIEW_NO_TOKEN_HISTORY} data-samples={samples.length} />}>
                <div className="card-meta"><span data-testid="overview-cost" data-qualifier={session?.costLabel.qualifier ?? 'unknown'}>{session ? <><span className="ov-caption__unit">{costLabelParts(session.costLabel.text).figure !== '' && <span className="mono">{costLabelParts(session.costLabel.text).figure}</span>}{costLabelParts(session.costLabel.text).rest}</span></> : OVERVIEW_NO_SESSION_CAPTION}</span></div>
              </DesignKpiCard>
              <DesignKpiCard accented={false} className="ov-card" role="region" aria-label="Tool calls" title="Tool calls"
                value={<span data-testid="overview-tool-calls">{session ? session.toolCalls.total : '—'}</span>}>
                <div className="card-meta" data-testid="overview-tool-agents"><span>{session ? <>across <span className="mono">{session.toolCalls.agents}</span> agent{session.toolCalls.agents === 1 ? '' : 's'}</> : OVERVIEW_NO_SESSION_CAPTION}</span></div>
                <div className="ov-chips" data-testid="overview-tool-chips">
                  {(session?.toolCalls.byTool ?? []).slice(0, 5).map((t) => <DesignTag key={t.tool} kind="neutral" className="mono">{t.tool} {t.count}</DesignTag>)}
                </div>
              </DesignKpiCard>
              <Card kicker="Repository">
                {repository === null ? <div className="card-body">Reading the repository…</div>
                  : !repository.gitAvailable ? <div className="card-body" data-testid="overview-repo-state">Git is not available on this machine.</div>
                    : !repository.isRepository ? <div className="card-body" data-testid="overview-repo-state">Not a Git repository.</div>
                      : (<>
                        {/* REQ-MONITOR-168's directional markers are Phosphor arrows at `--rt-icon-size` in `--rt-text-tertiary`, hidden from
                            the accessible tree beside the words "ahead" and "behind" that carry the direction (§1.9; audit item 6: two
                            unicode glyphs typed into the figure spans, about 20 px tall at the numeral's size, until 2026-11-03). Each
                            marker, numeral and word is one unit, so where the four-column card is too narrow for both (171 px of content
                            at 1400 px) a count wraps whole and its word never leaves its figure. */}
                        <div className="kpi-row mono" data-testid="overview-repo-counts"><span className="ov-kpi__count"><i className="ph ph-arrow-up ov-kpi__marker" aria-hidden="true" /><span className="kpi-value">{repository.ahead}</span><span className="kpi-unit">ahead</span></span><span className="ov-kpi__count"><i className="ph ph-arrow-down ov-kpi__marker" aria-hidden="true" /><span className="kpi-value">{repository.behind}</span><span className="kpi-unit">behind</span></span></div>
                        <div className="card-meta mono" data-testid="overview-repo-branch">{repository.base ?? 'no base'} → {repository.branch ?? '—'}</div>
                        <div className="card-meta" data-testid="overview-repo-touched"><span><span className="ov-caption__unit"><span className="mono">{repository.touched}</span> file{repository.touched === 1 ? '' : 's'} touched</span> · <span className="ov-caption__unit"><span className="mono">{repository.uncommitted}</span> uncommitted</span>{repository.failed.length > 0 ? ` · not read: ${repository.failed.join(', ')}` : ''}</span></div>
                      </>)}
              </Card>
              <DesignKpiCard accented={false} className="ov-card" role="region" aria-label="Agents" title="Agents"
                value={<span data-testid="overview-agent-count">{session ? session.agents.length : '—'}</span>}>
                {/* REQ-MONITOR-169's caption form, its two clauses each one unit so a wrap falls at the " · " and never orphans a limit (UIR-202). */}
                <div className="card-meta mono" data-testid="overview-agent-caps"><span><span className="ov-caption__unit">depth {session ? counts.depth : '—'} / {caps?.depth ?? '—'}</span> · <span className="ov-caption__unit">fan-out {session ? counts.running : '—'} / {caps?.fanOut ?? '—'}</span></span></div>
                <div className={`card-meta${session ? ' mono' : ''}`} data-testid="overview-agent-states">{session ? agentStatesLine(counts) : OVERVIEW_NO_SESSION_CAPTION}</div>
              </DesignKpiCard>
            </div>
            {/* PD-MONITOR-009 clause 3 (REQ-MONITOR-116's place for the agents of the run): the activity table, under the figures it explains. */}
            <AgentActivityCard session={session} selectedAgentId={props.delegation.selectedAgentId} onSelect={props.delegation.onSelect} nowIso={props.delegation.nowIso} onOpen={props.delegation.onOpen} onPopOut={props.delegation.onPopOut} refresh={props.delegation.refresh} />
            <Card kicker="Sessions" className="ov-card--sessions" actions={<span className="card-meta"><span><span className="mono">{sessions.length}</span> listed</span></span>}>
              {sessionsState === 'loading' && sessions.length === 0 ? <div className="card-body">Loading sessions…</div>
                : sessionsState === 'error' ? (
                  /* Audit P1: a refused read is its own cell (REQ-NOTIFY-006's shape for a failed region, as REQ-NOTIFY-267 draws one):
                     one sentence, the refusal as selectable detail, one secondary control that runs the Overview's own read again. */
                  <div className="ov-card__failed" role="alert" data-testid="overview-sessions-failed">
                    <p className="card-body">{OVERVIEW_SESSIONS_FAILED}</p>
                    {sessionsError && <pre className="ov-card__failed-detail mono" data-testid="overview-sessions-failed-detail">{sessionsError}</pre>}
                    <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={props.onRefresh}>Read again</DesignButton>
                  </div>)
                  : sessions.length === 0 ? <div className="card-body" data-testid="overview-sessions-empty">Finished and suspended runs will be listed here once they exist.</div>
                    : (
                      <ul className="ov-sessions" data-testid="overview-sessions">
                        {sessions.map((row) => {
                          const attached = session?.id === row.sessionId;
                          const dot = sessionDot(row, attached);
                          return (
                            <li key={row.sessionId} className="ov-session" data-session={row.sessionId} data-busy={row.busy ? '1' : '0'}>
                              <span className={`status-dot ov-dot ov-dot--${dot.tone}${dot.pulse && !reducedMotion ? ' is-pulsing' : ''}`} aria-hidden="true" />
                              <span className="visually-hidden">{dot.text}</span>
                              <DesignButton type="button" className="btn btn-link ov-session__name" title={`${row.sessionId}${row.requirementId ? ` · ${row.requirementId}` : ''}`} onClick={() => props.onOpenSession(row.sessionId)}>{row.label}</DesignButton>
                              {row.requirementId && <DesignTag kind="outline">{row.requirementId}</DesignTag>}
                              {attached && <DesignTag kind="accent" data-testid="overview-focused">focused</DesignTag>}
                              {row.status === 'waiting' && <DesignTag kind="wait" data-testid="overview-waiting">waiting on a provider limit</DesignTag>}
                              <span className="ov-session__detail text-secondary">{row.detail}</span>
                              {!row.busy && <DesignButton type="button" className="btn btn-link" onClick={() => props.onContinueSession(row.sessionId)}>Continue run</DesignButton>}
                              <span className="ov-session__meta mono">{row.branch} · {formatTokens(row.tokens)} · {row.durationLabel || '—'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
            </Card>
          </div>
          <div className="overview__divider" role="separator" aria-orientation="vertical" aria-label="Resize the right column" aria-valuemin={OVERVIEW_RIGHT_MIN} aria-valuemax={OVERVIEW_RIGHT_MAX} aria-valuenow={right} tabIndex={0}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onDividerKey} data-testid="overview-divider" />
          <aside className="overview__right" style={{ width: right }} {...layoutContractAttributes(columnUi('overview-right'))}>
            {/* PD-MONITOR-009 clause 2: the graph card leads the column, above REQ-MONITOR-173's credit tile — it carries the run's Pause and
                Cancel, which must stand on screen at REQ-SHELL-022's minimum height. */}
            <DelegationGraphCard {...props.delegation} kickerUi={OVERVIEW_AGENTS_KICKER_UI} runDotUi={OVERVIEW_AGENTS_FIRST_DOT_UI} />
            <Card kicker="Cloud credit" className="ov-card--credit">
              <div className="kpi-row"><span className="kpi-value">—</span><span className="kpi-unit">credit</span></div>
              <div className="card-meta">No hosted account is connected in this build; a balance appears here once one is.</div>
            </Card>
            <Card kicker="Subscription limits">
              <div className="card-body">No usage figures for the signed-in providers yet.</div>
            </Card>
            <Card kicker="Improvement proposals" className="ov-card--proposals" actions={<><DesignTag kind="accent">{pendingProposals} new</DesignTag>
              {/* PD-LIBRARY-002's gesture, on the second of its three surfaces — the same opener the Library tab and the palette raise. */}
              {/* PD-LIBRARY-002 revision 2 (e): unavailable only while a retrospective is queued or running here. */}
              <RetrospectiveGesture className="btn btn-link" testId="overview-retrospective" />
              <DesignButton type="button" className="btn btn-link" onClick={() => props.onOpenProposal()}>Open in Library →</DesignButton></>}>
              {/* Audit item 10: the empty case is the card's own body — the title in the empty-state tier, PD-LIBRARY-002 (f)'s hint
                  within `--rt-prose-measure` — as the Sessions and Subscription limits cards draw theirs; a nested `EmptyState` put a
                  second frame and the grid motif round one sentence (§7.1, §1.10). The view-level `EmptyState` keeps its motif. */}
              {proposalRows.length === 0 ? <div className="ov-card__empty" data-testid="overview-proposals-empty"><span className="empty-state-title">No proposals</span><p className="card-body ov-card__empty-hint" data-testid="overview-proposals-hint">{OVERVIEW_PROPOSALS_HINT}</p></div>
                : <ul className="ov-proposals">{proposalRows.slice(0, 4).map((row) => <li key={`${row.artifactId}:${row.proposal.id}`} className="ov-proposal">
                  <DesignButton type="button" className="btn btn-link ov-proposal__summary" title="Open in Library → Improvement proposals" onClick={() => props.onOpenProposal(row.proposal.id)}>{row.proposal.summary}</DesignButton>
                  <DesignTag kind={row.proposal.status === 'approved' ? 'accent' : row.proposal.status === 'pending_review' ? 'outline' : 'neutral'}>{statusLabel(row.proposal.status)}</DesignTag>
                  <span className="card-meta ov-proposal__category">{categoryLabel(row.proposal.category)}</span>
                  <span className="ov-proposal__actions">{PROPOSAL_STATUSES.filter((status) => status !== row.proposal.status).map((status) => <DesignButton key={status} type="button" className="btn btn-link btn-compact" onClick={() => setProposalDecision({ ...row, status })}>{status === 'approved' ? 'Approve' : status === 'rejected' ? 'Reject' : status === 'deferred' ? 'Defer' : 'Reset to pending'}</DesignButton>)}</span>
                </li>)}</ul>}
            </Card>
          </aside>
        </div>
      )}
      {proposalDecision && <ProposalDecisionDialog proposal={proposalDecision.proposal} status={proposalDecision.status} onCancel={() => setProposalDecision(null)} onConfirm={() => { const decision = proposalDecision; setProposalDecision(null); void props.onReviewProposal(decision.artifactId, decision.proposal.id, decision.status, decision.versionsDue); }} />}
    </div>
  );
}
