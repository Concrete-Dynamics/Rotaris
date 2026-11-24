import { createContext, useContext, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { WORKFLOW_STARTED } from './constants.js';
import { configureChangeOf, parseSkillListing, parseSkillLoadMarker, type ConfigureChangeRecord, type ImageAttachment, type ParsedSkillListing, type ParsedSkillLoadMarker, type SkillListingSpan, type TranscriptRow, type WorkflowStatus } from '@rotaris/contracts';
import { Markdown } from '../markdown/Markdown.js';
import { linkifyBare, type Span } from '../markdown/parse.js';
import { markMotionStart } from '../motion.js';
import { TerminalPreviewBlock } from '../terminal/TerminalPreviewBlock.js';
import type { TerminalPreview } from '../terminal/streams.js';
import { FACT_SEPARATOR, activitySpanMs, activitySummary, drawnFacts, groupSeverity, groupSummary, isLive, isReasoningRow, reasoningChars, rowKey, type Severity } from './project.js';
import { describeToolCall } from './tool-description.js';

/**
 * Part AA — **the ONE row renderer** (ADR-0051's second execution). What one row looks like once a slot is
 * bound to it; ADR-0045's recycled pool and ADR-0046's steps 3–5 are Part Z's and are upstream of everything
 * here.
 *
 * **`Row` is a pure function of its props and holds no state of its own.** Part Z's pool empties and REBINDS
 * slots, so state inside a row would survive the rebind and display one row's state on another — precisely
 * the failure ADR-0045 names. `ToolRow`'s `useState(open)` (the deleted `TranscriptRows.tsx:36`) was the
 * existing instance of that bug; expansion now lives in Z's map and arrives as the `expanded` prop.
 *
 * The one thing `Row` reads that is not a prop is the **surface** context below, and the reason it is safe is
 * that its value is per-SURFACE and identical for every row in it: rebinding a slot cannot carry one row's
 * value to another, because there is only one value. It carries the services a sandboxed row may not perform
 * itself (opening a link, copying, opening a menu) and the two display preferences this part registers.
 *
 * Structure from `docs/spec/03-conversation-composer-transcript.md` §§9, 10 and 12; craft from
 * `docs/design/` by token name. `REQ-CHAT-057`'s px figures are specification values and are written as such —
 * a colour or a spacing *choice* is a token, a stated geometry is the number the requirement states.
 */

// Part Z owns `./types.js` and declares `TrailerRow`, `DisplayRow` and `RowRenderProps` there. This file
// carried a byte-identical stand-in so the two branches could compile apart; the merge replaced it with this
// import. `TrailerRow` was the one type the plan NAMED in the seam without DEFINING, so each side invented a
// shape for it and the two disagreed. Z's survives: it carries the trailer's wording pre-rendered, computed
// once in `project.ts` where REQ-CHAT-168's grammar is already applied, and the whole `ApprovalPayload` the
// approval dialog needs. Re-exported so a consumer of this module still sees the vocabulary it draws.
export type { TrailerRow, DisplayRow, RowRenderProps } from './types.js';
import type { TrailerRow, DisplayRow, RowRenderProps } from './types.js';
import { Button as DesignButton, layoutContractAttributes, type UiLayoutContract } from '../design-system/index.js';
import { QuestionSummaryCard } from '../QuestionStepper.js';

/**
 * What a row cannot know about itself, computed once per displayed array by `placements()` below.
 *
 * **This is the seam's one gap, and it is stated rather than worked around.** `RowRenderProps` as the plan
 * fixes it cannot express `REQ-CHAT-057`'s attribution rule ("a block begins at every row whose role differs
 * from the row above it") or `REQ-CHAT-067`'s "all but the most recent tool-call/result pair", because both
 * are facts about a row's NEIGHBOURS and the props carry only the row. So `Row` takes one further optional
 * prop, and `placements()` is the single function that computes it for a whole displayed array. Part Z's pool
 * calls it once per projection and passes `place[i]`; a surface that passes nothing gets attribution on every
 * row, which is what the transcript did before this part and hides nothing.
 */
export interface RowPlace {
  /** REQ-CHAT-057: the first row of a block draws attribution; a continuation row draws the persona bar. */
  readonly blockStart: boolean;
  /** REQ-CHAT-067: within the most recent tool-call/result pair — the last two tool rows — so auto-collapse spares it. */
  readonly recentTool: boolean;
  /**
   * PD-CHAT-004: this row is a MEMBER revealed beneath an expanded activity line. The line's continuous
   * rule is the attribution for the whole run, so a member draws no bar of its own — but it does draw its
   * own timestamp, because the per-step instants are precisely what expanding the line is for.
   */
  readonly member?: boolean | undefined;
}
const FIRST_OF_BLOCK: RowPlace = { blockStart: true, recentTool: true };
const MEMBER_OF_RUN: RowPlace = { blockStart: false, recentTool: true, member: true };

export interface RowProps extends RowRenderProps {
  readonly place?: RowPlace | undefined;
}

/** REQ-CHAT-075: the entries of one row's context menu. The SURFACE owns the menu and the clipboard; a row holds no state. */
export interface RowMenuEntry {
  readonly key: 'message' | 'input' | 'output';
  readonly label: string;
  /** The untruncated value (REQ-CHAT-075); a group yields its summary and never raw tool input or output (REQ-CHAT-065). */
  readonly text: string;
  /** REQ-CHAT-075: greyed out where its value is empty, rather than absent. */
  readonly disabled: boolean;
}
export interface RowMenuRequest {
  readonly x: number;
  readonly y: number;
  readonly rowKey: string;
  readonly entries: readonly RowMenuEntry[];
}

/**
 * The services and preferences a transcript surface supplies to every row it draws. One value per surface;
 * never per row (see the note at the head of this file).
 */
export interface TranscriptSurface {
  /** REQ-CHAT-076: `http(s)` opens in the system browser through `shell.openExternal`; absent renders a link inert (ADR-0051's owe). */
  readonly openLink?: ((href: string) => void) | undefined;
  /** REQ-CHAT-075: the surface raises the one context menu, so no row holds an open/closed flag. */
  readonly openMenu?: ((request: RowMenuRequest) => void) | undefined;
  /** REQ-CHAT-076: clicking a live terminal preview requests the pop-out for that stream (Part AM draws the preview; AL publishes the frames). */
  readonly openTerminal?: ((streamId: string) => void) | undefined;
  /**
   * Part AM — REQ-SHELL-079 / REQ-CHAT-063/066: the live preview's screen for a stream, read from this renderer's
   * `TerminalStreamSet` at render time (REQ-CHAT-063's ≤ 250 ms live-row refresh re-renders it). `null` or absent means
   * no retained screen exists for the stream and the row keeps its one-line `⤷` preview. The surface owns the
   * registry; a row holds no emulator, so a rebound slot cannot carry one stream's screen to another row.
   */
  readonly terminalPreview?: ((streamId: string) => TerminalPreview | null) | undefined;
  /** PD-CONFIG-014 revision 3 (clause 7): the Undo on a `configure` set's row; absent where no window can write (a persona window). */
  readonly undoConfigChange?: ((change: ConfigureChangeRecord) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>) | undefined;
  /** REQ-CHAT-076: a question row opens the stepper, an approval row the approval dialog. */
  readonly openTrailer?: ((trailer: TrailerRow) => void) | undefined;
  /** REQ-CHAT-173: pane-owned verified thumbnail cache; rows remain pure. */
  readonly attachmentUrl?: ((attachment: ImageAttachment) => string | null) | undefined;
  /** REQ-CHAT-167, the registered key `display/showReasoning`, default OFF. */
  readonly showReasoning: boolean;
  /** REQ-CHAT-067, the registered key `display/autoCollapseTools`, default OFF. */
  readonly autoCollapseTools: boolean;
  /** REQ-CHAT-049: with no run in progress a row still marked running shows no status and no live timer. */
  readonly runActive: boolean;
  /**
   * REQ-CHAT-059 / REQ-CHAT-061: a member of an expanded group expands on its own, and `RowRenderProps` carries
   * one `expanded` for the whole `DisplayRow`. The member map is the SURFACE's (Part Z's expansion map), never a
   * row's, so a rebound slot still cannot carry one member's state to another.
   */
  readonly memberExpanded?: ((key: string) => boolean) | undefined;
  readonly toggleMember?: ((key: string) => void) | undefined;
  /** The surface's clock for the live figures — never a global; REQ-CHAT-063's refresh moves it. */
  readonly nowMs: number;
  /**
   * PD-CHAT-015: a thread line's live state and elapsed time ("running · 0:42"), by the agent's name — the one figure
   * of the line that moves with the clock, so it is read at render time as the clock is. Absent, or null for an agent
   * the surface does not know, the line draws the state its row carries.
   */
  readonly threadState?: ((name: string) => string | null) | undefined;
  /** PD-CHAT-015: the words a named task is shown by (the agent's given name), so a heading and its thread line name one task one way. Absent, or null, keeps the row's own name. */
  readonly taskLabel?: ((name: string) => string | null) | undefined;
  /** PD-CHAT-015: pressing a thread line shows that agent's own transcript. Absent draws the line inert. */
  readonly openThread?: ((name: string) => void) | undefined;
  /**
   * PD-ORCH-018 clause 9: a workflow as it stands now, by the agent that started it and its id; null where the live run
   * holds none of that id (a stored record never does). And the row's Stop. The view above holds the session; the row asks.
   */
  readonly workflowStatus?: ((agent: string, id: string) => WorkflowStatus | null) | undefined;
  readonly stopWorkflow?: ((agent: string, id: string) => Promise<{ ok: true } | { ok: false; message: string }>) | undefined;
  /**
   * REQ-CHAT-164's drawing half: the whole seconds a live call's provider has been silent, or null. **Detecting
   * the ten seconds is stream-side and is Part Z's** (Z3b); drawing what it found is this file's.
   */
  readonly stalledSecondsFor?: ((row: TranscriptRow) => number | null) | undefined;
}

const INERT: TranscriptSurface = { showReasoning: false, autoCollapseTools: false, runActive: false, nowMs: 0 };
const SurfaceContext = createContext<TranscriptSurface>(INERT);
export function TranscriptSurfaceProvider({ value, children }: { value: TranscriptSurface; children: ReactNode }) {
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}
export function useTranscriptSurface(): TranscriptSurface { return useContext(SurfaceContext); }

// ── The pure text of a row: everything a test can assert without a browser ───────────────────────────────

/** REQ-CHAT-011: an unreadable instant draws nothing rather than `Invalid Date`. */
export function rowTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** REQ-CHAT-047: displayed role `you`; an agent row shows its persona; a system row is the product's; a tool row its agent. */
export function rowRole(row: Pick<TranscriptRow, 'kind' | 'persona' | 'name'>): string {
  if (row.kind === 'user') return 'you';
  if (row.kind === 'system') return 'rotaris';
  if (row.kind === 'diff') return 'edit';
  return row.persona ?? row.name ?? row.kind;
}

/**
 * REQ-CHAT-057: the task line beside the role, drawn on the first row of a block only. A row belongs to a
 * named task when it carries an agent name that is not simply its persona — which is what
 * `delegate:<persona>:<name>` records. A row with no such name has no task line rather than a placeholder.
 */
export function rowTask(row: Pick<TranscriptRow, 'kind' | 'persona' | 'name'>): string | null {
  if (row.kind === 'user' || row.kind === 'system' || row.kind === 'diff') return null;
  const name = row.name;
  if (name === undefined || name === '' || name === row.persona) return null;
  return name;
}

/**
 * REQ-CHAT-062: reasoning rows. Both spellings are accepted; `thinking` is REQ-CHAT-047's display kind.
 * The definition moved into `project.ts` when PD-CHAT-004 made it part of step 4's run boundary — this
 * file already imports that module, and declaring it here and importing it back would close a cycle. It
 * is re-exported so every caller (`pool.ts`, `TranscriptPane.tsx`, the tests) still reaches it by name.
 */
export { isReasoningRow, reasoningChars };

/**
 * REQ-CHAT-060: a row persisted with a ✓, ✗ or ! glyph already written into its text renders WITHOUT it, so
 * the outcome is stated exactly once. Only a leading marker is removed — a glyph inside a command stays.
 */
export function stripOutcomeGlyph(text: string): string {
  return text.replace(/^[\s]*[✓✗!]\s*/u, '');
}

/**
 * REQ-CHAT-060: `ok · 3.2s`, `failed`, `blocked · 0.0s`, a pulsing `◉ running…`. The vocabulary is closed to
 * the four values and a value outside them is treated as `failed` rather than drawn as its own literal text.
 * A row carrying no status renders no outcome.
 *
 * **REQ-CHAT-049 is the half the previous helper only half had.** Its condition is that the SESSION is not
 * running, not that the row settled: a tool row still marked running in a session with no run in progress must
 * show no status and no live timer. `runActive` is that condition, and it defaults to `true` so a caller that
 * does not know keeps the older reading rather than silently blanking a live row.
 */
export function toolOutcome(
  row: Pick<TranscriptRow, 'toolStatus' | 'durationMs' | 'settled'>,
  runActive = true,
): { text: string; state: 'running' | 'ok' | 'failed' | 'blocked' | 'none' } {
  const s = row.toolStatus;
  if (s === undefined || s === '') return { text: '', state: 'none' };
  const secs = `${((row.durationMs ?? 0) / 1000).toFixed(1)}s`;
  if (s === 'running') return row.settled || !runActive ? { text: '', state: 'none' } : { text: '◉ running…', state: 'running' };
  if (s === 'ok') return { text: `ok · ${secs}`, state: 'ok' };
  if (s === 'blocked') return { text: `blocked · ${secs}`, state: 'blocked' };
  return { text: 'failed', state: 'failed' };
}

/** REQ-CHAT-065: the header's colour is the most severe member outcome — failed, then blocked, then running, then ok. */
// REQ-CHAT-065's severity ranking and its summary string are ONE definition, upstream in `project.ts` where the
// group is built. This file declared a second while the halves were apart, and the two disagreed on the order of
// the per-outcome counts; the requirement's own example decided it (see the note there).
export type GroupSeverity = Severity;
export { groupSeverity, groupSummary };

/**
 * REQ-CHAT-065's summed duration, counting upward while any member is still running.
 *
 * **PD-CHAT-004 narrowed this and the activity line no longer draws it** — `activitySpanMs` in
 * `project.ts` is what the header shows. It is kept, exported and tested because it is still the honest
 * answer to "how much time did the work itself take", which the expanded members' own durations state
 * and which a later surface may want to state in one figure.
 */
export function groupDurationMs(members: readonly TranscriptRow[], settledSum: number, nowMs: number): number {
  let live = 0;
  for (const m of members) {
    if (m.toolStatus !== 'running' || m.settled) continue;
    const started = m.startedAt === undefined ? Number.NaN : Date.parse(m.startedAt);
    if (!Number.isNaN(started)) live += Math.max(0, nowMs - started);
  }
  return settledSum + live;
}

/** REQ-CHAT-062: a live thinking row stops presenting as live after this long without completion. */
export const THINKING_LIVE_CUTOFF_MS = 3_600_000;

/**
 * REQ-CHAT-062: `▸ reasoning · <N>s · ~<T> tok` settled, `◉ reasoning… <N>s · ~<T> tok` while streaming, both
 * numbers counting upward, the token figure the streamed character count divided by 4.
 *
 * `chars` is the field Part Z adds to `TranscriptRowSchema`; until it lands the body's own length is the
 * streamed character count for a reasoning row, which is what the field will carry, so the figure is right
 * either way and becomes exact rather than equivalent at the merge.
 */
export function reasoningSummary(row: TranscriptRow, nowMs: number, runActive = true): { text: string; marker: string; label: string; live: boolean; seconds: number; tokens: number } {
  const started = row.startedAt === undefined ? Number.NaN : Date.parse(row.startedAt);
  /**
   * REQ-CHAT-062's settled form is FINAL figures, so a settled row never reads the tick: a stamp settles it,
   * and a row the engine settled without one (older records — a defect whose note was removed once repaired)
   * freezes at the span its own record closes — `at` minus `startedAt` — rather than counting against `nowMs`
   * for the rest of the session.
   */
  const settledMs = row.durationMs ?? (Number.isNaN(started) || row.at === undefined ? undefined : Math.max(0, Date.parse(row.at) - started));
  const elapsedMs = row.settled
    ? settledMs ?? 0
    : Number.isNaN(started) ? (row.durationMs ?? 0) : Math.max(0, nowMs - started);
  // REQ-CHAT-049 and REQ-CHAT-062's cutoff: an unstamped row in a dead session, or one live past an hour, is not live.
  const live = !row.settled && runActive && elapsedMs < THINKING_LIVE_CUTOFF_MS;
  const seconds = Math.floor(elapsedMs / 1000);
  const tokens = Math.floor(reasoningChars(row) / 4);
  // The two forms are written exactly as the requirement writes them, separator included: the settled one carries a
  // `·` after `reasoning` and the streaming one does not.
  const marker = live ? '◉' : '▸';
  const label = live ? `reasoning… ${seconds}s · ~${tokens} tok` : `reasoning · ${seconds}s · ~${tokens} tok`;
  // `marker` is the row's CHEVRON, not part of the label: the collapsed summary reads `▸ reasoning …` because the
  // chevron is that `▸`. Drawing both a chevron and a marker inside the label reads `▾▸ reasoning …` once expanded,
  // which is one state stated twice — the defect this record's second execution found (ADR-0051's note).
  return { text: `${marker} ${label}`, marker, label, live, seconds, tokens };
}

/**
 * REQ-CHAT-164's drawing half: the stalled indicator states that the model is producing no output and shows
 * the elapsed seconds. REQ-CHAT-168: it is grammatical at one second as at many. It appends no row, cancels
 * nothing and changes nothing recorded — it is a label and only a label.
 */
export function stalledLabel(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds));
  return `⏱ no output for ${n} ${n === 1 ? 'second' : 'seconds'}`;
}

/** REQ-CHAT-068: the compaction bound for the collapsed delegation summary's task text. */
export const DELEGATION_TASK_CAP = 110;
export function compactTask(task: string, cap = DELEGATION_TASK_CAP): string {
  const flat = task.replace(/\s+/gu, ' ').trim();
  return flat.length <= cap ? flat : `${flat.slice(0, cap - 1)}…`;
}

/**
 * REQ-CHAT-068: the collapsed line conveys exactly three facts — the child agent's name, its persona and its
 * task. A payload whose fields are missing or unreadable names those it CAN rather than showing a placeholder
 * for the rest, and never raises an error.
 */
export function delegationSummary(agent: { name?: string; persona?: string; delegationTask?: string; activity?: string }): string {
  const facts: string[] = [];
  if (agent.name !== undefined && agent.name !== '') facts.push(agent.name);
  if (agent.persona !== undefined && agent.persona !== '') facts.push(agent.persona);
  const task = agent.delegationTask !== undefined && agent.delegationTask !== '' ? agent.delegationTask : agent.activity ?? '';
  if (task !== '') facts.push(compactTask(task));
  return facts.join(' · ');
}

/**
 * REQ-CHAT-075: what each context-menu entry copies. "Copy message" is the row's own text — for a group the
 * summary of REQ-CHAT-065 and never raw tool input or output. The two tool entries appear on tool rows ONLY
 * and are greyed out where their value is empty; every value is the untruncated one the record retains.
 */
export function rowMenuEntries(display: DisplayRow): readonly RowMenuEntry[] {
  if (display.shape === 'group') {
    // PD-CHAT-004: the per-segment summary, which for a run of one family and no reasoning is still
    // REQ-CHAT-065's own string. Raw tool input and output are never emitted, as that requirement says.
    return [{ key: 'message', label: 'Copy message', text: activitySummary(display.segments), disabled: false }];
  }
  if (display.shape === 'trailer') {
    return [{ key: 'message', label: 'Copy message', text: trailerText(display.trailer), disabled: false }];
  }
  const row = display.row;
  const message = { key: 'message' as const, label: 'Copy message', text: rowText(row), disabled: rowText(row) === '' };
  if (row.kind !== 'tool') return [message];
  return [
    message,
    { key: 'input', label: 'Copy tool input', text: row.input ?? '', disabled: (row.input ?? '') === '' },
    { key: 'output', label: 'Copy tool output', text: row.output ?? '', disabled: (row.output ?? '') === '' },
  ];
}

/** The row's own text as the record holds it — the source, never the rendered output (ADR-0051). */
export function rowText(row: TranscriptRow): string {
  return row.kind === 'tool' ? stripOutcomeGlyph(row.body) : row.body;
}

/** REQ-CHAT-051's two trailers, written for the count they carry (REQ-CHAT-168): zero, one and many all read correctly. */
export function trailerText(t: TrailerRow): string {
  // The wording is computed ONCE, in `project.ts`'s `trailerRows`, where REQ-CHAT-168's rule at zero, one
  // and many is applied. Two implementations of one grammar rule is what this accessor exists to prevent.
  return t.text;
}

/**
 * REQ-CHAT-057 and REQ-CHAT-067, computed once for a whole displayed array — the two facts a row cannot know
 * about itself. Part Z's pool calls this once per projection; `RowList` calls it for the plain-list surfaces.
 *
 * `blockStart`: the first row of a block, a block beginning at every row whose role differs from the row above.
 * **An activity line's role is its AGENT's, and a trailer always starts a block.**
 * `recentTool`: within the last two tool rows of the array — REQ-CHAT-067's "most recent tool-call/result
 * pair"; with fewer than two tool rows in the array none is collapsed, so every one of them is recent.
 *
 * **The falsified reason, kept beside its replacement.** This function took a group's role to be its
 * FAMILY and forced a block start on every shape that is not a plain row. Both were inventions:
 * REQ-CHAT-064 gives the family word as the header's *label*, which the header already draws, and
 * REQ-CHAT-057 breaks a block on the *role*. Together they drew one agent thinking and reading in turn as
 * `ORCHESTRATOR / READING / ORCHESTRATOR / READING`, four blocks at PD-CHAT-003's full 12 px separation,
 * with the persona continuation bar never drawn — reported by the owner as two speakers where there was
 * one agent, and recorded in a defect note removed once repaired; its repair is the 2026-09-15 row of
 * `docs/architecture/first-executions.md`.
 */
export function placements(displays: readonly DisplayRow[]): readonly RowPlace[] {
  return placementsFrom(null, displays).places;
}

/** What `placementsFrom` carries from one displayed array to the next. */
export interface Placed {
  readonly display: readonly DisplayRow[];
  readonly places: readonly RowPlace[];
  /** The positions of the tool rows in `display`, ascending: REQ-CHAT-067's "most recent pair" is their last two. */
  readonly tools: readonly number[];
}

/** The role a block is broken on (REQ-CHAT-057): an activity line's is its agent's, and a trailer's is its own. */
function blockRole(d: DisplayRow): string {
  // PD-CHAT-015: consecutive thread lines are one block whoever they name, so they read as one ruled list.
  if (d.shape === 'row' && d.row.kind === 'delegation') return 'thread:';
  return d.shape === 'row' ? rowRole(d.row) : d.shape === 'group' ? d.role : `trailer:${d.trailer.sort}`;
}

const isToolRow = (d: DisplayRow): boolean => d.shape === 'row' && d.row.kind === 'tool';
const isDiffRow = (d: DisplayRow): boolean => d.shape === 'row' && d.row.kind === 'diff';
/** PD-CHAT-016: a skill-load marker, the system row recognised by its text (`parseSkillLoadMarker`). */
const isSkillLoadMarkerRow = (d: DisplayRow): boolean => d.shape === 'row' && d.row.kind === 'system' && parseSkillLoadMarker(d.row.body) !== null;
/**
 * A row that belongs to the turn it stands in: it draws no heading of its own and the agent's next row is not a new
 * block. An edit diff (PD-CHAT-015) and a skill-load marker (PD-CHAT-016 clause 6, as the fold already reads it).
 */
const standsInTurn = (d: DisplayRow): boolean => isDiffRow(d) || isSkillLoadMarkerRow(d);
/** PD-CHAT-015: the lines of an edit diff drawn before the reader asks for the rest — its heading line and five of the change. */
export const DIFF_PREVIEW_LINES = 6;

/**
 * `placements(display)`, built from `previous` — the places of the array the pane showed before — rather than from
 * nothing. A position before the first one whose displayed-row OBJECT changed keeps its place object: its role and the
 * role above it are the same, so its block start is, and its recency changes only where it enters or leaves the last
 * two tool rows, which are the only places rebuilt there. From the first changed position on, the places are computed.
 * Step 4's bounded form hands the pane the previous projection's prefix itself, so an increment rebuilds the places of
 * the rows it changed and of at most two tool rows above them.
 *
 * REQ-CHAT-055 (the work of an update depends on the rows that changed, not the rows held): the first form computed
 * every place once per projection — a role, a tool test and a new object for each of a thousand rows — and V8's CPU
 * profile of the built app (2026-09-29, the defect note's "CPU profile" section) named it among the loaded side's extra
 * script. The places are the ones `placements` computes, value for value (`rows.test.ts`, `projector.test.ts`).
 */
export function placementsFrom(previous: Placed | null, display: readonly DisplayRow[]): Placed {
  let first = 0;
  let tools: number[] = [];
  let places: RowPlace[] = [];
  if (previous !== null) {
    const before = previous.display;
    const shared = Math.min(before.length, display.length);
    while (first < shared && before[first] === display[first]) first += 1;
    // The tool rows above `first` are where they were; the list is ascending, so the part above is a prefix of it.
    let kept = 0;
    let hi = previous.tools.length;
    while (kept < hi) { const mid = (kept + hi) >> 1; if (previous.tools[mid]! < first) kept = mid + 1; else hi = mid; }
    tools = previous.tools.slice(0, kept);
    places = previous.places.slice(0, first);
  }
  for (let i = first; i < display.length; i += 1) if (isToolRow(display[i]!)) tools.push(i);
  const recent = new Set(tools.slice(-2));
  // Above `first`, only a row entering or leaving the most recent pair changes place.
  if (previous !== null) {
    for (const at of [...previous.tools.slice(-2), ...recent]) {
      if (at >= first || places[at]!.recentTool === recent.has(at)) continue;
      places[at] = { blockStart: places[at]!.blockStart, recentTool: recent.has(at) };
    }
  }
  // PD-CHAT-015: an edit diff belongs to the turn it stands in — it draws no heading of its own and the agent's next
  // row is not a new block — so the role "above" is read past any diff rows. PD-CHAT-016: and past a skill-load marker.
  let before = first - 1;
  while (before >= 0 && standsInTurn(display[before]!)) before -= 1;
  let above = before >= 0 ? blockRole(display[before]!) : '';
  for (let i = first; i < display.length; i += 1) {
    const d = display[i]!;
    if (standsInTurn(d) && above !== '') { places.push({ blockStart: false, recentTool: recent.has(i) }); continue; }
    const role = blockRole(d);
    places.push({ blockStart: i === 0 || role !== above || d.shape === 'trailer', recentTool: recent.has(i) });
    above = role;
  }
  return { display, places, tools };
}

/**
 * REQ-CHAT-059's identity, made unambiguous. The requirement keys tool rows by their **tool-call key** and groups by
 * **the key of the group's first member** — which is the same string for two different things, so one map keyed by it
 * alone opens a group's first member whenever the group is opened. (Seen in the product the first time a group was
 * expanded, not by reading.) The shape is therefore part of the key, and this is the single definition of it, so
 * Part Z's map and this file's list cannot disagree.
 *
 * `rowKey` is REQ-CHAT-059's identity for a ROW and lives in `project.ts`; it is re-exported here so every
 * surface reaches the member's card key by its old name (`Row.tsx` is where the member's card is drawn).
 * `memberKey` is R0-4's single definition of a GROUP MEMBER's card key: the member's own `rowKey`, which is
 * what step 4 holds REQ-CHAT-166's caps against (`o.expanded.has(rowKey(m))` in `hygiene`) and therefore what
 * opens the card AND lifts the caps in one gesture. Every caller that opens, reads or seeds a member's card —
 * `Row`'s group branch below, both surfaces' `memberExpanded`/`toggleMember`, the proof's seeded-open variant —
 * reads this and nothing else, so the four spellings cannot strand again.
 */
export function expansionKey(shape: DisplayRow['shape'], key: string): string { return `${shape}:${key}`; }
export { rowKey };
/** R0-4: a group member's card key — the member's own `rowKey`, the identity step 4 holds the caps against. */
export function memberKey(m: TranscriptRow): string { return rowKey(m); }

/**
 * REQ-CHAT-167 and REQ-CHAT-067: the expansion a row has when the reader has NOT set one by hand. Part Z's map
 * owns the manual state (REQ-CHAT-059) and applies this where it holds none, so "a row the user has expanded or
 * collapsed by hand keeps the state the user gave it, overriding the preference for that row" falls out of
 * which value the map has rather than out of a rule written twice.
 *
 * Reasoning rows follow `display/showReasoning`. Tool rows are collapsed by `display/autoCollapseTools`, which
 * spares the most recent tool-call/result pair; question rows and live terminal rows are exempt. Everything
 * else defaults collapsed, as it always has.
 */
export function defaultExpanded(display: DisplayRow, prefs: Pick<TranscriptSurface, 'showReasoning'>): boolean {
  if (display.shape !== 'row') return false;
  return isReasoningRow(display.row) && prefs.showReasoning;
}
/**
 * REQ-CHAT-067's auto-collapse is a DRAWING rule rather than an expansion default: it takes a collapsed tool
 * row down to name-plus-chevron — no preview line — rather than closing one the reader opened. The exemptions
 * are the question tool row and a live terminal row.
 */
export function autoCollapsed(display: DisplayRow, prefs: Pick<TranscriptSurface, 'autoCollapseTools'>, place: RowPlace = FIRST_OF_BLOCK): boolean {
  if (!prefs.autoCollapseTools || display.shape !== 'row') return false;
  const row = display.row;
  if (row.kind !== 'tool' || place.recentTool) return false;
  if (row.toolName === 'ask_questions') return false;
  if (isLiveTerminalRow(row)) return false;
  return true;
}

/** REQ-CHAT-066 / REQ-CHAT-076: an unsettled row carrying a live terminal stream id (published by the run host from Part AL on). */
export function isLiveTerminalRow(row: TranscriptRow): boolean {
  const streamId = (row as { streamId?: string }).streamId;
  return typeof streamId === 'string' && streamId !== '' && !row.settled;
}
function streamIdOf(row: TranscriptRow): string | null {
  const streamId = (row as { streamId?: string }).streamId;
  return typeof streamId === 'string' && streamId !== '' ? streamId : null;
}

// ── The drawing ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * REQ-CHAT-074: the active match painted inside the row's text. Z decides the offsets; AA paints them, and a
 * pair that does not fall inside the text is drawn as no match rather than as an exception.
 */
function Highlighted({ text, match }: { text: string; match: { readonly start: number; readonly end: number } | null }): ReactNode {
  if (!match || match.start < 0 || match.end > text.length || match.start >= match.end) return text;
  return (<>{text.slice(0, match.start)}<mark className="row__match">{text.slice(match.start, match.end)}</mark>{text.slice(match.end)}</>);
}

/**
 * REQ-CHAT-076: "a bare `http(s)` URL appearing in ANY row's text — not only one written as a Markdown link".
 * A row whose body is NOT rendered Markdown still linkifies its bare URLs, through the same post-parse text
 * transform the Markdown path uses (`linkifyBare`), so there is exactly one definition of what a bare URL is
 * and of where its trailing punctuation ends. No Markdown is interpreted here: the input is one text span.
 */
function PlainText({ text, match, onOpenLink }: { text: string; match: RowRenderProps['match']; onOpenLink: ((href: string) => void) | undefined }): ReactNode {
  const spans: readonly Span[] = linkifyBare([{ kind: 'text', text }]);
  // A row whose text holds no bare URL is one span, and the search match is painted into it. A row that HAS one is
  // several spans, and the match's offsets are into the whole text: painting it across a span boundary is Part Z's
  // search to define, not this file's to guess at, so the link wins and the match is not drawn there.
  if (spans.length === 1 && spans[0]!.kind === 'text') return <Highlighted text={text} match={match} />;
  return spans.map((span, i) => (span.kind === 'link'
    ? <DesignButton key={i} type="button" className="md__link" title={span.href} data-href={span.href} onClick={() => onOpenLink?.(span.href)} disabled={onOpenLink === undefined}>{span.href}</DesignButton>
    : <span key={i}>{span.kind === 'text' ? span.text : ''}</span>));
}

/**
 * PD-CHAT-015: a turn's heading — the agent's name in its persona colour behind a dot of the same colour, the task
 * beside it, and the time at the line's end — drawn on the first row of a block (REQ-CHAT-057's attribution rule,
 * untouched) and on no other. A continuation row draws nothing here: it belongs to the heading above it, and the
 * 2 px bar that used to say so is gone with the gutter it stood in. A row naming no persona — the reader's own, a
 * system notice — keeps the stylesheet's accent and takes no inline colour at all.
 *
 * A member of an expanded activity line keeps its own timestamp (PD-CHAT-004), at the end of its own line.
 */
function Attribution({ row, place }: { row: TranscriptRow; place: RowPlace }) {
  const surface = useTranscriptSurface();
  // The task is named as the thread line and the Run panel name it, where the surface knows the agent; else by the row's own name.
  const named = rowTask(row);
  const task = named === null ? null : (surface.taskLabel?.(named) ?? named);
  if (place.member === true) return <time className="row__time mono" dateTime={row.at}>{row.ts || rowTime(row.at)}</time>;
  if (!place.blockStart) return null;
  return (
    <>
      <time className="row__time mono" dateTime={row.at}>{row.ts || rowTime(row.at)}</time>
      <span className="row__attribution" style={personaVar(row)}>
        <span className="row__role" style={personaInk(row)}>{rowRole(row)}</span>
        {task !== null && <span className="row__task" data-testid="row-task">{task}</span>}
      </span>
    </>
  );
}

/**
 * REQ-SHELL-075 (a) / PD-CHAT-005: a persona's assigned colour — a named token of the adopted language by a
 * stable hash of the name, never a literal colour. Declared here because REQ-CHAT-057's continuation bar and
 * PD-CHAT-005's role label are the two places that need it; `PersonaWindow` re-exports it.
 *
 * **The ramp is the design language's own answer to this question.** `docs/design/system/tokens/colors.css`
 * declares `--rt-viz-1` … `--rt-viz-6` as the categorical set — "built from the three axes and their hue
 * midpoints. Use in order; never invent chart colors outside this set" — which is exactly what telling one
 * agent from another is. Nothing here is invented and no literal is written.
 *
 * **The falsified list, kept beside its replacement.** It was
 * `['--rt-accent-300', '--rt-axis-y-300', '--rt-axis-x-300', '--rt-ok', '--rt-warn', '--rt-run']`. Two faults,
 * both measured on 2026-09-16: `--rt-ok` and `--rt-run` are the SAME colour (both `var(--rt-axis-y-500)`), so
 * six slots yielded five hues and one sixth of personas collided outright; and three of the six were STATUS
 * tokens, so a persona bar could read as an outcome beside a row whose outcome it was not. Contrast on this
 * theme's three transcript grounds — page, surface and hover — is 5.28:1 at worst (`--rt-viz-1` on `--rt-hover`),
 * against 4.54:1 for the `--rt-warn` it replaces.
 *
 * Beyond six personas the hues repeat, which is the ramp's own declared behaviour and PD-CHAT-005's stated cost.
 */
const PERSONA_TOKENS = ['--rt-viz-1', '--rt-viz-2', '--rt-viz-3', '--rt-viz-4', '--rt-viz-5', '--rt-viz-6'] as const;
export function personaColourToken(persona: string): string {
  let h = 0;
  for (const ch of persona) h = (h * 31 + ch.codePointAt(0)!) % PERSONA_TOKENS.length;
  return PERSONA_TOKENS[h]!;
}

/** PD-CHAT-005: the persona's colour as the label's ink, and nothing at all where the row names no persona. */
function personaInk(row: Pick<TranscriptRow, 'name' | 'persona'>): { color: string } | undefined {
  const persona = row.persona ?? row.name ?? '';
  return persona === '' ? undefined : { color: `var(${personaColourToken(persona)}, var(--rt-accent-300))` };
}

/**
 * PD-CHAT-015: the persona's colour as a custom property on the heading, which the heading's dot is filled with.
 * The falsified mechanism, kept named: a depth style set `--rt-row-depth` here and the stylesheet indented the row
 * one step per level of the delegation tree (PD-CHAT-005's second clause). Measured on 2026-11-20 in a 719 px
 * column, a depth-1 agent's text had 469 px and the same agent's expanded run 246 px; the tree is now said by the
 * thread line and the tabs, and no row is indented by who delegated to whom.
 */
function personaVar(row: Pick<TranscriptRow, 'name' | 'persona'>): CSSProperties | undefined {
  const persona = row.persona ?? row.name ?? '';
  return persona === '' ? undefined : ({ '--rt-row-persona': `var(${personaColourToken(persona)}, var(--rt-accent-300))` } as CSSProperties);
}

/**
 * `REQ-CHAT-056`: **only the agent-message category renders Markdown**, through `packages/ui/src/markdown/` and
 * nothing else — no second Markdown path exists in the product (ADR-0051). Raw HTML arrives inside a text node
 * and is shown as the text it is; an image reference renders as its alternative text carrying an activatable
 * reference and **no image is ever loaded**, local or remote. Rendering is synchronous and issues no request.
 *
 * The set below is the categories that are NOT messages, because `REQ-CHAT-047`'s role vocabulary is **open**:
 * a role outside the five named ones is legitimate and projects to a message row carrying that role as its
 * display name, so a message row cannot be recognised by an allow-list without refusing roles the requirement
 * says must be accepted. Verifier output is a category of its own in `REQ-CHAT-046`'s twelve and `REQ-CHAT-056`
 * names only the agent-message one, so a verifier row renders as text.
 */
const NON_MESSAGE_KINDS = new Set(['user', 'system', 'tool', 'thinking', 'reasoning', 'verifier', 'diff', 'intent', 'question', 'approval', 'delegation']);
export function isMessageRow(row: Pick<TranscriptRow, 'kind'>): boolean { return !NON_MESSAGE_KINDS.has(row.kind); }

/**
 * REQ-CHAT-162 — the `/skills` listing: a **system notice** (REQ-CHAT-046's category, REQ-CHAT-047's `system` role)
 * whose text is the listing, drawn as one. `contracts/skills.ts` fixes that text and reads it back; a system row it
 * does not accept is drawn as the plain notice it also is, so nothing here decides what a listing is.
 *
 * Craft from the mockup's transcript column, read for craft and never for structure: a revealed block on the
 * surface with a hairline border and the medium radius (the artifact and tool cards), one entry per skill whose
 * name is the title — text colour, medium weight, the mono face, since it is also a name the composer types —
 * with its facts after it in the tertiary ink joined by the row vocabulary's `·`, the description beneath in the
 * secondary prose size, and the path last, smallest and quietest, wrapping anywhere so a long one never widens the
 * block. The count is the row's own text line, as every system notice's is. No in-context indicator is drawn:
 * ESC-37, ruled, and REQ-CHAT-162 as amended forbid one on this and every other surface.
 *
 * Search paints onto the fields: a match's offsets are into the row text, and each field knows where it sits there.
 * The text's own punctuation between fields (`- `, the brackets round the scope, ` triggers: `) is not drawn, so a
 * match that falls only there selects the row (REQ-CHAT-074 searches the row's text) and paints nothing in it.
 *
 * REQ-CHAT-076: every field is drawn through `PlainText`, so a bare `http(s)` URL in a skill's description — or in
 * any other field — is the same clickable link, trailing punctuation left out, that it was while every system row
 * went through `PlainText` whole; and on PlainText's own terms, so a field holding a link draws the link rather than
 * a match painted across it.
 */
const SKILL_LISTING_LAYOUT = { id: 'skill-listing', relations: [{ kind: 'text-fit', axis: 'x' }] } satisfies UiLayoutContract;

function spanMatch(match: RowRenderProps['match'], span: SkillListingSpan): { start: number; end: number } | null {
  if (!match) return null;
  const end = span.start + span.text.length;
  const from = Math.max(match.start, span.start);
  const to = Math.min(match.end, end);
  return from < to ? { start: from - span.start, end: to - span.start } : null;
}

function SkillListingBlock({ listing, match, onOpenLink }: { listing: ParsedSkillListing; match: RowRenderProps['match']; onOpenLink: ((href: string) => void) | undefined }) {
  const field = (span: SkillListingSpan) => <PlainText text={span.text} match={spanMatch(match, span)} onOpenLink={onOpenLink} />;
  return (
    <div className="row__body skill-listing" data-testid="skill-listing" data-count={listing.count} data-names={listing.skills.map((s) => s.name.text).join(',')} {...layoutContractAttributes(SKILL_LISTING_LAYOUT)}>
      <div className="skill-listing__count">{field(listing.header)}</div>
      {listing.skills.length > 0 && (
        <ol className="skill-listing__skills" aria-label="Listed skills">
          {listing.skills.map((s) => (
            <li key={s.name.start} className="skill-listing__skill" data-testid="skill-listing-entry"
              data-name={s.name.text} data-scope={s.scope.text} data-triggers={s.triggers?.text ?? ''} data-description={s.description.text} data-path={s.path.text}>
              <div className="skill-listing__line mono">
                <span className="skill-listing__name">{field(s.name)}</span>
                <span className="skill-listing__facts">
                  {FACT_SEPARATOR}{field(s.scope)}
                  {s.triggers !== null && <>{FACT_SEPARATOR}<span className="skill-listing__label">triggers </span>{field(s.triggers)}</>}
                </span>
              </div>
              {s.description.text !== '' && <div className="skill-listing__description">{field(s.description)}</div>}
              <div className="skill-listing__path mono" title={s.path.text}>{field(s.path)}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * PD-CONFIG-014 revision 3 (clause 7; `docs/design/briefs/transcript-rows.md`, "Brief 2026-11-22"): a settled `configure`
 * set's preview line — `<setting>: <before> → <after> · <scope>` — and its Undo. The Undo writes the value before back
 * through main and the workspace service only while the setting still holds what this change wrote, so a row from an
 * earlier session, or one a later change has overtaken, is refused and says so. The undone state is this window's.
 */
const CONFIG_CHANGE_LAYOUT = { id: 'config-change', relations: [{ kind: 'text-fit', axis: 'x' }] } satisfies UiLayoutContract;
const CONFIG_VALUE_CLIP = 80;

function configValue(value: unknown): string {
  const text = JSON.stringify(value) ?? 'null';
  return text.length > CONFIG_VALUE_CLIP ? `${text.slice(0, CONFIG_VALUE_CLIP)}…` : text;
}

type UndoState = { readonly kind: 'idle' } | { readonly kind: 'busy' } | { readonly kind: 'done' } | { readonly kind: 'refused'; readonly message: string };

/** PD-ORCH-018 clause 9: the id a `workflow` start call's result names, or null for any other call. */
export function workflowIdOf(row: Pick<TranscriptRow, 'toolName' | 'output'>): string | null {
  if (row.toolName !== 'workflow') return null;
  return WORKFLOW_STARTED.exec(row.output ?? '')?.[1] ?? null;
}

/** PD-ORCH-018 clause 9: what the workflow's line says: its phase, how many of its agents have ended, and its state. */
export function workflowLineText(status: WorkflowStatus | null, id: string): string {
  if (status === null) return `${id} · its progress is shown while its run is live`;
  const agents = status.agentsStarted === 0 ? 'no agent started yet' : `${status.agentsEnded} of ${status.agentsStarted} ${status.agentsStarted === 1 ? 'agent' : 'agents'} ended`;
  return [status.name, status.phase === '' ? null : status.phase, agents, status.state].filter((part) => part !== null).join(' · ');
}

/**
 * PD-ORCH-018 clause 9: the workflow's line, on the row of the call that started it — one row per workflow. It stands in
 * the preview's place whatever the workflow's state, so the row's height does not change as the workflow moves; opening
 * the row shows its script (the call's input). Stop is offered while it runs.
 */
function WorkflowLine({ agent, id, status, stop }: { agent: string; id: string; status: WorkflowStatus | null; stop: TranscriptSurface['stopWorkflow'] }) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = status?.state === 'running';
  const press = async () => {
    if (stop === undefined || busy) return;
    setBusy(true);
    const r = await stop(agent, id);
    setBusy(false);
    setRefusal(r.ok ? null : r.message);
  };
  return (
    <div className="config-change workflow-line" data-testid="workflow-line" data-workflow={id} data-state={status?.state ?? 'unknown'}>
      <div className="config-change__line">
        <span className={`config-change__text text-secondary mono${running ? ' workflow-line__text--live' : ''}`} data-testid="workflow-line-text">⤷ {refusal ?? workflowLineText(status, id)}</span>
        {running && stop !== undefined && (
          <DesignButton type="button" variant="link" size="compact" className="config-change__undo" onClick={() => { void press(); }} disabled={busy} data-testid="workflow-stop" aria-label={`Stop the workflow ${status.name}`}>Stop</DesignButton>
        )}
      </div>
    </div>
  );
}

function ConfigChangeLine({ change, undo }: { change: ConfigureChangeRecord; undo: TranscriptSurface['undoConfigChange'] }) {
  const [state, setState] = useState<UndoState>({ kind: 'idle' });
  const before = change.stated ? configValue(change.before) : 'not set';
  const after = configValue(change.after);
  const press = async () => {
    if (undo === undefined || state.kind === 'busy' || state.kind === 'done') return;
    setState({ kind: 'busy' });
    const r = await undo(change);
    setState(r.ok ? { kind: 'done' } : { kind: 'refused', message: r.message });
  };
  const done = change.stated ? `Undone — ${change.setting} is ${before} again.` : `Undone — ${change.setting} is no longer set in the ${change.scope} file.`;
  return (
    <div className="config-change" data-testid="config-change" data-setting={change.setting} {...layoutContractAttributes(CONFIG_CHANGE_LAYOUT)}>
      <div className="config-change__line">
        <span className="config-change__text text-secondary mono" aria-description={`${change.setting} changed from ${before} to ${after}, in the ${change.scope} file.`}>
          ⤷ {change.setting}: {before} → {after} · {change.scope}
        </span>
        {undo !== undefined && state.kind !== 'done' && (
          <DesignButton type="button" className="row__trailer config-change__undo" data-action="config-undo" aria-label={`Undo the change to ${change.setting}`} disabled={state.kind === 'busy'} onClick={() => { void press(); }}>
            {state.kind === 'busy' ? 'Undoing…' : 'Undo'}
          </DesignButton>
        )}
      </div>
      {(state.kind === 'done' || state.kind === 'refused') && (
        <p className="config-change__status text-secondary" role="status" data-testid="config-undo-status">{state.kind === 'done' ? done : state.message}</p>
      )}
    </div>
  );
}

/**
 * PD-CHAT-016 — the skill-load marker: one quiet line in the system notice's rule — `Skill loaded`, the skill's name, who
 * loaded it — never wrapping; the name and the agent elide before the line would, and the row's whole sentence is its
 * title. Every part is drawn through `PlainText` at its offset in the body, so a search match lands in the part it is in.
 */
const SKILL_LOAD_LAYOUT = { id: 'skill-load-marker', relations: [{ kind: 'text-fit', axis: 'x' }] } satisfies UiLayoutContract;

function SkillLoadMarkerLine({ marker, body, match, onOpenLink }: { marker: ParsedSkillLoadMarker; body: string; match: RowRenderProps['match']; onOpenLink: ((href: string) => void) | undefined }) {
  const field = (span: SkillListingSpan) => <PlainText text={span.text} match={spanMatch(match, span)} onOpenLink={onOpenLink} />;
  return (
    <div className="row__body skill-load" data-testid="skill-load-marker" data-skill={marker.skill.text} data-by={marker.byUser ? 'you' : marker.by.text} title={body} {...layoutContractAttributes(SKILL_LOAD_LAYOUT)}>
      <span className="skill-load__lead">{field(marker.lead)}</span>
      <span className="skill-load__name mono">{field(marker.skill)}</span>
      {/* A flex item drops its leading space, so the separator's gap is the span's padding, not its text. */}
      <span className="skill-load__by">{FACT_SEPARATOR.trim()} by {field(marker.by)}</span>
    </div>
  );
}

/**
 * PD-CHAT-015: an edit diff (REQ-CHAT-050) draws its heading line and the first lines of the change, and the rest when
 * the reader asks — a forty-line file no longer stands between two things an agent said. A row holding a search match
 * is drawn whole, so the match is on screen. The expansion is the pane's, keyed by the row (REQ-CHAT-059).
 */
function DiffBody({ body, expanded, onToggle, match, onOpenLink }: { body: string; expanded: boolean; onToggle: () => void; match: RowRenderProps['match']; onOpenLink: ((href: string) => void) | undefined }) {
  const lines = body.split('\n');
  const hidden = lines.length - DIFF_PREVIEW_LINES;
  const shown = expanded || hidden <= 1 ? body : lines.slice(0, DIFF_PREVIEW_LINES).join('\n');
  return (
    <>
      <div className="row__body mono row__body--diff"><PlainText text={shown} match={shown === body ? match : null} onOpenLink={onOpenLink} /></div>
      {hidden > 1 && (
        <DesignButton type="button" className="row__more" aria-expanded={expanded} onClick={onToggle} data-testid="diff-more">
          {expanded ? 'Show fewer lines' : `Show ${hidden} more lines`}
        </DesignButton>
      )}
    </>
  );
}

export function Row(p: RowProps) {
  const surface = useTranscriptSurface();
  const place = p.place ?? FIRST_OF_BLOCK;
  const { display, expanded, match } = p;
  const menu = (event: ReactMouseEvent) => {
    if (!surface.openMenu) return;
    event.preventDefault();
    surface.openMenu({ x: event.clientX, y: event.clientY, rowKey: display.key, entries: rowMenuEntries(display) });
  };
  const common = { onContextMenu: menu, tabIndex: -1, 'data-key': display.key, 'data-shape': display.shape } as const;
  /** PD-CHAT-003: blocks separate by 12 px; the class rides the reuse key's `b` flag so a moved row is redrawn. */
  const blockStartClass = place.blockStart ? ' row--block-start' : '';

  // PD-CHAT-004: the ACTIVITY LINE — one agent's run of tool and reasoning work, stated on one line that
  // changes rather than grows, with its members beneath it when open. REQ-CHAT-065 still fixes the counts,
  // the severity ordering, the in-flight text and "expanding keeps the header on screen".
  if (display.shape === 'group') {
    const severity = groupSeverity(display.counts);
    const summary = activitySummary(display.segments);
    const live = isLive(display) && surface.runActive;
    const durationMs = activitySpanMs(display, surface.nowMs, surface.runActive);
    return (
      // REQ-CHAT-065: the header carries the number of members, so it is observable rather than only readable
      // out of the summary string. Part Z's placeholder published it and the proof reads it; the real row did
      // not, which is what the merge found. `data-segments` is PD-CHAT-004's equivalent for the run's shape.
      <article {...common} className={`row row--group tool tool--${severity}${live ? ' row--streaming' : ''}${blockStartClass}`}
        data-family={display.family} data-severity={severity} data-members={display.members.length}
        data-segments={display.segments.length} data-agent={display.role} data-testid="row-group">
        <div className="row__grid">
          {/* PD-CHAT-004 / REQ-CHAT-057: the heading names the AGENT. The family words are in the line. */}
          {place.blockStart && (
            <>
              <time className="row__time mono" dateTime={display.startedAt}>{rowTime(display.startedAt)}</time>
              <span className="row__attribution" style={personaVar({ persona: display.persona, name: display.role })}>
                <span className="row__role" style={personaInk({ persona: display.persona, name: display.role })}>{display.role}</span>
              </span>
            </>
          )}
          <div className="row__main">
            <DesignButton type="button" className="tool__header mono" onClick={p.onToggle} aria-expanded={expanded} aria-description={summary} data-testid="group-header">
              <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : live ? '◉' : '▸'}</span>
              {/* Each segment is its own element so the line wraps between segments and never inside one. */}
              <span className="activity__segments">
                {display.segments.map((segment, index) => (
                  <span key={`${segment.label}-${index}`} className={`activity__segment${segment.reasoning ? ' activity__segment--reasoning' : ''}`} data-segment={segment.label}>
                    {/* PD-CHAT-004 rev 3: the fail colour belongs to `1 failed` and to nothing else on the line, so
                        the facts are drawn one element each rather than as one string. The separator is its own
                        element rather than part of the fact behind it, so the dot between `3 ok` and `1 failed`
                        stays the colour every other separator on the line is. The segment keeps `nowrap`, so
                        splitting it changes where it may break not at all: it still may not break anywhere. */}
                    {drawnFacts(segment).flatMap((fact, at) => {
                      const drawn = (
                        <span
                          key={fact.text}
                          className={fact.outcome === null ? undefined : `activity__fact activity__fact--${fact.outcome}`}
                          data-outcome={fact.outcome ?? undefined}
                        >{fact.text}</span>
                      );
                      if (at === 0) return [drawn];
                      return [<span key={`${fact.text}-sep`} className="activity__sep">{FACT_SEPARATOR}</span>, drawn];
                    })}
                  </span>
                ))}
                {/* PD-CHAT-004: the activity word of the segment in flight, marked as continuing, so "what is
                    it doing" stays answerable at a glance on a line that now names several things. */}
                {display.inFlightLabel !== null && (
                  <span
                    ref={(element) => { if (element && live) markMotionStart(element); }}
                    className={`activity__now${live ? ' row__pulse' : ''}`}
                    data-testid="activity-now"
                  >{display.inFlightLabel}…</span>
                )}
              </span>
              {/* PD-CHAT-004 rev 3: the run's elapsed span is a fact about the run, not about the failure — it keeps its
                  ordinary colour. `data-severity` on the article above is still where the line PUBLISHES the
                  ordering REQ-CHAT-065 fixes, which the directive leaves untouched. */}
              <span className="tool__outcome" data-severity={severity}>{(durationMs / 1000).toFixed(1)}s</span>
            </DesignButton>
            {/* REQ-CHAT-065: while a member is in flight the header carries that call's text. */}
            {/* PD-CHAT-015: a preview that only repeats the word in flight (a call with no text but its tool's name) is not drawn. */}
            {!expanded && display.inFlight !== null && display.inFlight.trim() !== (display.inFlightLabel ?? '') && <div className="tool__preview text-secondary mono">⤷ {display.inFlight}</div>}
            {expanded && (
              // PD-CHAT-015: the revealed members stand one step in from the line that holds them, and no further
              // however deep their agent sits. PD-CHAT-004's persona-coloured rule is gone: the heading names the agent.
              <div className="row__members" data-testid="group-members">
                {display.members.map((m) => {
                  // R0-4: `memberKey` — the member's own `rowKey`, the identity step 4 holds the caps against.
                  // `data-member-key` on the drawn member row publishes the card's key (below), so the proof's
                  // click lands on the member it means.
                  const key = memberKey(m);
                  return (
                    <Row
                      key={key}
                      display={{ shape: 'row', key, row: m }}
                      expanded={surface.memberExpanded?.(key) ?? false}
                      onToggle={() => surface.toggleMember?.(key)}
                      match={null}
                      place={MEMBER_OF_RUN}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  // REQ-CHAT-051 / REQ-CHAT-076: the two trailer rows; clicking one opens the stepper or the approval dialog.
  if (display.shape === 'trailer') {
    const t = display.trailer;
    return (
      <article {...common} className={`row row--${t.sort}${blockStartClass}`} data-request-id={t.requestId} data-testid={`row-${t.sort}`}>
        <div className="row__grid">
          <time className="row__time mono" />
          <span className="row__attribution"><span className="row__role">{t.role}</span></span>
          <div className="row__main">
            <DesignButton type="button" className="row__trailer" onClick={() => surface.openTrailer?.(t)} disabled={surface.openTrailer === undefined}>
              <Highlighted text={trailerText(t)} match={match} />
            </DesignButton>
          </div>
        </div>
      </article>
    );
  }

  const row = display.row;
  const stalled = surface.stalledSecondsFor?.(row) ?? null;
  const live = !row.settled && surface.runActive;

  // REQ-CHAT-060/061: the tool row — the monospace header, the outcome, the ⤷ preview and the INPUT/OUTPUT card.
  if (row.kind === 'tool') {
    const outcome = toolOutcome(row, surface.runActive);
    const expandable = (row.input !== undefined && row.input !== '') || (row.output !== undefined && row.output !== '');
    const collapsedToName = autoCollapsed(display, surface, place);
    const blockedReason = row.blockedReason ?? row.output ?? 'the call was not executed';
    const description = outcome.state === 'blocked' ? `Blocked: ${blockedReason}` : undefined;
    const stream = streamIdOf(row);
    // REQ-CHAT-175..178: the header is the call's derived description — what the agent is doing, in words — and the
    // tool's own name is the fallback for a call this build derives none for. It is drawn at every stop of
    // `display/toolVerbosity`; the stop decides what ELSE the row draws, never whether this line is drawn.
    const derived = describeToolCall(row.toolName ?? '', row.input);
    const header = derived !== '' ? derived : stripOutcomeGlyph(row.body);
    // Part AM — REQ-SHELL-079 / REQ-CHAT-066: the live preview block, drawn whenever this renderer retains a screen
    // for the row's stream, expanded or not, so it stays visible; the card's INPUT/OUTPUT sit beneath it when open.
    const preview = stream !== null && !row.settled ? (surface.terminalPreview?.(stream) ?? null) : null;
    const configChange = row.toolName === 'configure' && row.settled && outcome.state === 'ok' ? configureChangeOf(row.output) : null;
    // PD-ORCH-018 clause 9: the call that started a workflow carries the workflow's line.
    const workflowId = row.settled && outcome.state === 'ok' ? workflowIdOf(row) : null;
    return (
      <article {...common} className={`row row--tool tool tool--${outcome.state}${live ? ' row--streaming' : ''}${blockStartClass}`} data-index={row.index} data-settled={row.settled} data-call-key={row.callKey} data-member-key={display.key} data-agent={row.name} data-collapsed={collapsedToName ? 'name' : undefined}>
        <div className="row__grid">
          <Attribution row={row} place={place} />
          <div className="row__main">
            <DesignButton
              type="button"
              className={`tool__header mono${expandable ? '' : ' tool__header--static'}`}
              onClick={() => { if (expandable) p.onToggle(); }}
              aria-expanded={expandable ? expanded : undefined}
              aria-description={description}
              disabled={!expandable}
              data-testid="tool-header"
            >
              <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              <span className="tool__name tool__description"><Highlighted text={header} match={match} /></span>
              {outcome.text !== '' && (
                <span ref={(element) => { if (element && outcome.state === 'running') markMotionStart(element); }} className={`tool__outcome tool__outcome--${outcome.state}`}>{outcome.text}</span>
              )}
            </DesignButton>
            {/* Part AM — the live terminal preview: the emulator's screen text, the same cells the pop-out shows (REQ-SHELL-102). */}
            {preview !== null && <TerminalPreviewBlock preview={preview} onOpen={surface.openTerminal} />}
            {/* REQ-CHAT-076: clicking a live terminal preview requests the pop-out for that stream (the one-line form, until a screen is retained). */}
            {/* PD-CONFIG-014 revision 3 (clause 7): a settled `configure` set draws its change, and offers its Undo. */}
            {configChange !== null && !collapsedToName && <ConfigChangeLine change={configChange} undo={surface.undoConfigChange} />}
            {workflowId !== null && !collapsedToName && <WorkflowLine agent={row.name ?? ''} id={workflowId} status={surface.workflowStatus?.(row.name ?? '', workflowId) ?? null} stop={surface.stopWorkflow} />}
            {configChange === null && workflowId === null && preview === null && !expanded && !collapsedToName && expandable && (
              stream !== null && !row.settled
                ? <DesignButton type="button" className="tool__preview tool__preview--terminal text-secondary mono" data-stream-id={stream} onClick={() => surface.openTerminal?.(stream)} disabled={surface.openTerminal === undefined}>⤷ {(row.output ?? row.input ?? '').split('\n')[0]}</DesignButton>
                : <div className="tool__preview text-secondary mono">⤷ {(row.output ?? row.input ?? '').split('\n')[0]}</div>
            )}
            {expanded && (
              row.toolName === 'ask_questions' ? (
                <QuestionSummaryCard input={row.input} output={row.output} blockedReason={outcome.state === 'blocked' ? blockedReason : undefined} />
              ) : (
                <div className="tool__card">
                  {row.input !== undefined && row.input !== '' && (<><div className="tool__caption">INPUT</div><pre className="tool__pre mono" data-testid="tool-input">{row.input}</pre></>)}
                  {row.output !== undefined && row.output !== '' && (<><div className="tool__caption">OUTPUT</div><pre className="tool__pre mono" data-testid="tool-output">{row.output}</pre></>)}
                  {outcome.state === 'blocked' && <div className="tool__blocked">{blockedReason}</div>}
                </div>
              )
            )}
          </div>
        </div>
      </article>
    );
  }

  // REQ-CHAT-062 / REQ-CHAT-167: the reasoning row — a summary that reveals nothing until asked.
  if (isReasoningRow(row)) {
    const summary = reasoningSummary(row, surface.nowMs, surface.runActive);
    return (
      <article {...common} className={`row row--thinking tool${summary.live ? ' row--streaming' : ''}${blockStartClass}`} data-index={row.index} data-settled={row.settled} data-agent={row.name} data-testid="row-thinking">
        <div className="row__grid">
          <Attribution row={row} place={place} />
          <div className="row__main">
            <DesignButton type="button" className="tool__header mono" onClick={p.onToggle} aria-expanded={expanded} aria-description={summary.text} data-testid="thinking-header">
              {/* The collapsed summary's own leading marker IS this chevron; the label never repeats it. */}
              <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : stalled === null ? summary.marker : '▸'}</span>
              <span
                ref={(element) => { if (element && summary.live && stalled === null) markMotionStart(element); }}
                className={`tool__name${summary.live && stalled === null ? ' row__pulse' : ''}`}
              >{stalled === null ? summary.label : `reasoning · ${summary.seconds}s · ~${summary.tokens} tok`}</span>
              {stalled !== null && <span className="row__stalled" data-testid="row-stalled" aria-description={stalledLabel(stalled)}>{stalledLabel(stalled)}</span>}
            </DesignButton>
            {expanded && <div className="row__body row__body--thinking" data-testid="thinking-body">{row.body}</div>}
          </div>
        </div>
      </article>
    );
  }

  // PD-CHAT-015: the thread line — REQ-CHAT-046's delegation category drawn IN the transcript, at the place the
  // agent's own rows would begin: who was handed what, its state, and the latest thing it did or what it reported.
  if (row.kind === 'delegation') {
    const name = row.name ?? row.persona ?? '';
    const state = surface.threadState?.(name) ?? row.output ?? '';
    const running = row.toolStatus === 'running' && surface.runActive;
    return (
      <article {...common} className={`row row--thread${running ? ' row--streaming' : ''}${blockStartClass}`} data-settled={row.settled} data-agent={row.name} data-state={row.toolStatus} data-testid="row-thread">
        <DesignButton type="button" className="thread" style={personaVar(row)} onClick={() => surface.openThread?.(name)} disabled={surface.openThread === undefined}
          aria-label={`Open ${rowRole(row)}${row.input ? `, ${row.input}` : ''}`} aria-description={[state, row.body].filter((t) => t !== '').join('. ')} data-testid="thread-open">
          <span className="thread__name" style={personaInk(row)}>{rowRole(row)}</span>
          <span className="thread__task">{row.input ?? ''}</span>
          <span className="thread__state mono" data-running={running ? '1' : undefined} data-state={row.toolStatus}>{state}</span>
          <span className={`thread__latest${running ? ' thread__latest--live' : ''}`}><Highlighted text={row.body} match={match} /></span>
          <i className="ph ph-caret-right thread__open" aria-hidden="true" />
        </DesignButton>
      </article>
    );
  }

  // Every other category. REQ-CHAT-056's Markdown on the agent-message category only.
  const markdown = isMessageRow(row);
  // REQ-CHAT-162: a system notice whose text is the `/skills` listing is drawn as the listing.
  const listing = row.kind === 'system' ? parseSkillListing(row.body) : null;
  // PD-CHAT-016: a system notice whose text is a skill-load marker is drawn as the marker.
  const marker = row.kind === 'system' && listing === null ? parseSkillLoadMarker(row.body) : null;
  return (
    <article {...common} className={`row row--${row.kind}${marker !== null ? ' row--skill-load' : ''}${live ? ' row--streaming' : ''}${blockStartClass}`} data-index={row.index} data-settled={row.settled} data-agent={row.name} data-testid={`row-${row.kind}`}>
      <div className="row__grid">
        <Attribution row={row} place={place} />
        <div className="row__main">
          {markdown
            ? <Markdown source={row.body} onOpenLink={surface.openLink} className="row__body row__body--md" testId="row-markdown" />
            : listing !== null
              ? <SkillListingBlock listing={listing} match={match} onOpenLink={surface.openLink} />
              : marker !== null
                ? <SkillLoadMarkerLine marker={marker} body={row.body} match={match} onOpenLink={surface.openLink} />
              : row.kind === 'diff'
                ? <DiffBody body={row.body} expanded={expanded || match !== null} onToggle={p.onToggle} match={match} onOpenLink={surface.openLink} />
                : <div className="row__body"><PlainText text={row.body} match={match} onOpenLink={surface.openLink} /></div>}
          {row.attachments && row.attachments.length > 0 && (
            <ol className="row__attachments" aria-label="Image attachments">
              {row.attachments.map((attachment, index) => (
                <li key={`${attachment.digest}-${index}`} className="row__attachment" data-available={attachment.available ? '1' : '0'}>
                  <details>
                    <summary><span className="row__attachment-thumb" aria-hidden="true">▧</span> {attachment.name}</summary>
                    {attachment.available
                      ? <>{surface.attachmentUrl?.(attachment) && <img className="row__attachment-image" src={surface.attachmentUrl(attachment)!} alt={attachment.name} />}<div className="row__attachment-meta mono">{attachment.mediaType} · {Math.ceil(attachment.size / 1024)} KiB · {attachment.digest.slice(0, 12)}</div></>
                      : <div className="row__attachment-unavailable" role="status">{attachment.unavailableReason ?? 'Image is no longer available.'}</div>}
                  </details>
                </li>
              ))}
            </ol>
          )}
          {/* PD-CHAT-006: a row still being written draws NO animated indicator of its own — the pulsing `…` that
              stood here is gone and nothing replaces it. The falsified line, kept beside its replacement:
                {live && stalled === null && <span className="row__streaming" aria-label="still being written">…</span>}
              REQ-CHAT-164's stalled indicator is untouched and now appears where nothing was drawn; reverting
              when output arrives means drawing nothing again, which is what `stalled === null` now renders. */}
          {live && stalled !== null && <span className="row__stalled" data-testid="row-stalled" aria-description={stalledLabel(stalled)}>{stalledLabel(stalled)}</span>}
        </div>
      </div>
    </article>
  );
}
