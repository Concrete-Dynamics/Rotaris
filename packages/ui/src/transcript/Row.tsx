import { createContext, useContext, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { TranscriptRow } from '@rotaris/contracts';
import { Markdown } from '../markdown/Markdown.js';
import { linkifyBare, type Span } from '../markdown/parse.js';
import { markMotionStart } from '../motion.js';
import { groupSeverity, groupSummary, type Severity } from './project.js';

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
}
const FIRST_OF_BLOCK: RowPlace = { blockStart: true, recentTool: true };

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
  /** REQ-CHAT-076: clicking a live terminal preview requests the pop-out for that stream. No producer publishes a frame yet (ADR-0021). */
  readonly openTerminal?: ((streamId: string) => void) | undefined;
  /** REQ-CHAT-076: a question row opens the stepper, an approval row the approval dialog. */
  readonly openTrailer?: ((trailer: TrailerRow) => void) | undefined;
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

/** REQ-CHAT-062: reasoning rows. Both spellings are accepted; `thinking` is REQ-CHAT-047's display kind. */
const REASONING_KINDS = new Set(['thinking', 'reasoning']);
export function isReasoningRow(row: Pick<TranscriptRow, 'kind'>): boolean { return REASONING_KINDS.has(row.kind); }

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

/** REQ-CHAT-065: the summed duration, counting upward while any member is still running. */
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
export function reasoningChars(row: TranscriptRow): number {
  const declared = (row as { chars?: number }).chars;
  return typeof declared === 'number' && declared >= 0 ? declared : row.body.length;
}
export function reasoningSummary(row: TranscriptRow, nowMs: number, runActive = true): { text: string; marker: string; label: string; live: boolean; seconds: number; tokens: number } {
  const started = row.startedAt === undefined ? Number.NaN : Date.parse(row.startedAt);
  const elapsedMs = row.durationMs !== undefined && row.settled
    ? row.durationMs
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
    return [{ key: 'message', label: 'Copy message', text: groupSummary(display.family, display.counts, display.members.length), disabled: false }];
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
 * A group and a trailer are always block starts; a group's role is its family.
 * `recentTool`: within the last two tool rows of the array — REQ-CHAT-067's "most recent tool-call/result
 * pair"; with fewer than two tool rows in the array none is collapsed, so every one of them is recent.
 */
export function placements(displays: readonly DisplayRow[]): readonly RowPlace[] {
  const roles = displays.map((d) => (d.shape === 'row' ? rowRole(d.row) : d.shape === 'group' ? d.family : `trailer:${d.trailer.sort}`));
  const toolIndexes: number[] = [];
  displays.forEach((d, i) => { if (d.shape === 'row' && d.row.kind === 'tool') toolIndexes.push(i); });
  const recent = new Set(toolIndexes.length < 2 ? toolIndexes : toolIndexes.slice(-2));
  return displays.map((d, i) => ({
    blockStart: i === 0 || roles[i] !== roles[i - 1] || d.shape !== 'row',
    recentTool: recent.has(i),
  }));
}

/**
 * REQ-CHAT-059's identity, made unambiguous. The requirement keys tool rows by their **tool-call key** and groups by
 * **the key of the group's first member** — which is the same string for two different things, so one map keyed by it
 * alone opens a group's first member whenever the group is opened. (Seen in the product the first time a group was
 * expanded, not by reading.) The shape is therefore part of the key, and this is the single definition of it, so
 * Part Z's map and this file's list cannot disagree.
 */
export function expansionKey(shape: DisplayRow['shape'], key: string): string { return `${shape}:${key}`; }

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

/** REQ-CHAT-066 / REQ-CHAT-076: an unsettled row carrying a live terminal stream id. No producer publishes one yet (ADR-0021). */
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
    ? <button key={i} type="button" className="md__link" title={span.href} data-href={span.href} onClick={() => onOpenLink?.(span.href)} disabled={onOpenLink === undefined}>{span.href}</button>
    : <span key={i}>{span.kind === 'text' ? span.text : ''}</span>));
}

/** REQ-CHAT-057: the timestamp column, then the role column — attribution on a block's first row, a persona bar on a continuation. */
function Attribution({ row, place, personaBar }: { row: TranscriptRow; place: RowPlace; personaBar: string }) {
  const task = rowTask(row);
  return (
    <>
      <time className="row__time mono" dateTime={row.at}>{place.blockStart ? (row.ts || rowTime(row.at)) : ''}</time>
      {place.blockStart ? (
        <span className="row__attribution">
          <span className="row__role">{rowRole(row)}</span>
          {task !== null && <span className="row__task mono" data-testid="row-task">{task}</span>}
        </span>
      ) : (
        <span className="row__bar" data-testid="row-bar" style={{ background: `var(${personaBar}, var(--rt-border))` }} aria-hidden="true" />
      )}
    </>
  );
}

/**
 * REQ-SHELL-075 (a): a persona's assigned colour — one of six named tokens of the adopted language, by a stable
 * hash of the name, never a literal colour. Declared here because REQ-CHAT-057's continuation bar is the second
 * place that needs it; `PersonaWindow` re-exports it so nothing that named it there breaks.
 */
const PERSONA_TOKENS = ['--rt-accent-300', '--rt-axis-y-300', '--rt-axis-x-300', '--rt-ok', '--rt-warn', '--rt-run'] as const;
export function personaColourToken(persona: string): string {
  let h = 0;
  for (const ch of persona) h = (h * 31 + ch.codePointAt(0)!) % PERSONA_TOKENS.length;
  return PERSONA_TOKENS[h]!;
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

  // REQ-CHAT-065: the folded tool group — one header row drawn from the DisplayRow, its members beneath it when open.
  if (display.shape === 'group') {
    const severity = groupSeverity(display.counts);
    const summary = groupSummary(display.family, display.counts, display.members.length);
    const durationMs = groupDurationMs(display.members, display.durationMs, surface.nowMs);
    const running = (display.counts.running ?? 0) > 0;
    return (
      // REQ-CHAT-065: the header carries the number of members, so it is observable rather than only readable
      // out of the summary string. Part Z's placeholder published it and the proof reads it; the real row did
      // not, which is what the merge found.
      <article {...common} className={`row row--group tool tool--${severity}`} data-family={display.family} data-severity={severity} data-members={display.members.length} data-testid="row-group">
        <div className="row__grid">
          <time className="row__time mono" dateTime={display.startedAt}>{rowTime(display.startedAt)}</time>
          <span className="row__attribution"><span className="row__role">{display.family}</span></span>
          <div className="row__main">
            <button type="button" className="tool__header mono" onClick={p.onToggle} aria-expanded={expanded} aria-description={summary} data-testid="group-header">
              <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              <span className="tool__name">{summary}</span>
              <span
                ref={(element) => { if (element && running) markMotionStart(element); }}
                className={`tool__outcome tool__outcome--${severity}${running ? ' row__pulse' : ''}`}
              >{(durationMs / 1000).toFixed(1)}s</span>
            </button>
            {/* REQ-CHAT-065: while a member is in flight the header carries that call's text. */}
            {!expanded && display.inFlight !== null && <div className="tool__preview text-secondary mono">⤷ {display.inFlight}</div>}
            {expanded && (
              <div className="row__members" data-testid="group-members">
                {display.members.map((m) => {
                  const key = m.callKey ?? `${m.index}`;
                  return (
                    <Row
                      key={key}
                      display={{ shape: 'row', key, row: m }}
                      expanded={surface.memberExpanded?.(key) ?? false}
                      onToggle={() => surface.toggleMember?.(key)}
                      match={null}
                      place={{ blockStart: false, recentTool: true }}
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
      <article {...common} className={`row row--${t.sort}`} data-request-id={t.requestId} data-testid={`row-${t.sort}`}>
        <div className="row__grid">
          <time className="row__time mono" />
          <span className="row__attribution"><span className="row__role">{t.role}</span></span>
          <div className="row__main">
            <button type="button" className="row__trailer" onClick={() => surface.openTrailer?.(t)} disabled={surface.openTrailer === undefined}>
              <Highlighted text={trailerText(t)} match={match} />
            </button>
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
    const header = stripOutcomeGlyph(row.body);
    return (
      <article {...common} className={`row row--tool tool tool--${outcome.state}${live ? ' row--streaming' : ''}`} data-index={row.index} data-settled={row.settled} data-call-key={row.callKey} data-agent={row.name} data-collapsed={collapsedToName ? 'name' : undefined}>
        <div className="row__grid">
          <Attribution row={row} place={place} personaBar={personaColourToken(row.persona ?? row.name ?? '')} />
          <div className="row__main">
            <button
              type="button"
              className={`tool__header mono${expandable ? '' : ' tool__header--static'}`}
              onClick={() => { if (expandable) p.onToggle(); }}
              aria-expanded={expandable ? expanded : undefined}
              aria-description={description}
              disabled={!expandable}
              data-testid="tool-header"
            >
              <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
              <span className="tool__name"><Highlighted text={header} match={match} /></span>
              {outcome.text !== '' && (
                <span ref={(element) => { if (element && outcome.state === 'running') markMotionStart(element); }} className={`tool__outcome tool__outcome--${outcome.state}`}>{outcome.text}</span>
              )}
            </button>
            {/* REQ-CHAT-076: clicking a live terminal preview requests the pop-out for that stream (unexercised — ADR-0021 owes the producer). */}
            {!expanded && !collapsedToName && expandable && (
              stream !== null && !row.settled
                ? <button type="button" className="tool__preview tool__preview--terminal text-secondary mono" data-stream-id={stream} onClick={() => surface.openTerminal?.(stream)} disabled={surface.openTerminal === undefined}>⤷ {(row.output ?? row.input ?? '').split('\n')[0]}</button>
                : <div className="tool__preview text-secondary mono">⤷ {(row.output ?? row.input ?? '').split('\n')[0]}</div>
            )}
            {expanded && (
              <div className="tool__card">
                {row.input !== undefined && row.input !== '' && (<><div className="tool__caption">INPUT</div><pre className="tool__pre mono" data-testid="tool-input">{row.input}</pre></>)}
                {row.output !== undefined && row.output !== '' && (<><div className="tool__caption">OUTPUT</div><pre className="tool__pre mono" data-testid="tool-output">{row.output}</pre></>)}
                {outcome.state === 'blocked' && <div className="tool__blocked">{blockedReason}</div>}
              </div>
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
      <article {...common} className={`row row--thinking tool${summary.live ? ' row--streaming' : ''}`} data-index={row.index} data-settled={row.settled} data-agent={row.name} data-testid="row-thinking">
        <div className="row__grid">
          <Attribution row={row} place={place} personaBar={personaColourToken(row.persona ?? row.name ?? '')} />
          <div className="row__main">
            <button type="button" className="tool__header mono" onClick={p.onToggle} aria-expanded={expanded} aria-description={summary.text} data-testid="thinking-header">
              {/* The collapsed summary's own leading marker IS this chevron; the label never repeats it. */}
              <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : stalled === null ? summary.marker : '▸'}</span>
              <span
                ref={(element) => { if (element && summary.live && stalled === null) markMotionStart(element); }}
                className={`tool__name${summary.live && stalled === null ? ' row__pulse' : ''}`}
              >{stalled === null ? summary.label : `reasoning · ${summary.seconds}s · ~${summary.tokens} tok`}</span>
              {stalled !== null && <span className="row__stalled" data-testid="row-stalled" aria-description={stalledLabel(stalled)}>{stalledLabel(stalled)}</span>}
            </button>
            {expanded && <div className="row__body row__body--thinking" data-testid="thinking-body">{row.body}</div>}
          </div>
        </div>
      </article>
    );
  }

  // Every other category. REQ-CHAT-056's Markdown on the agent-message category only.
  const markdown = isMessageRow(row);
  return (
    <article {...common} className={`row row--${row.kind}${live ? ' row--streaming' : ''}`} data-index={row.index} data-settled={row.settled} data-agent={row.name} data-testid={`row-${row.kind}`}>
      <div className="row__grid">
        <Attribution row={row} place={place} personaBar={personaColourToken(row.persona ?? row.name ?? '')} />
        <div className="row__main">
          {markdown
            ? <Markdown source={row.body} onOpenLink={surface.openLink} className="row__body row__body--md" testId="row-markdown" />
            : <div className={`row__body${row.kind === 'diff' ? ' mono row__body--diff' : ''}`}><PlainText text={row.body} match={match} onOpenLink={surface.openLink} /></div>}
          {/* REQ-CHAT-164: the animated indicator is REPLACED by the stalled one, and reverts as soon as any output arrives. */}
          {live && stalled === null && <span ref={(element) => { if (element) markMotionStart(element); }} className="row__streaming" aria-label="still being written">…</span>}
          {live && stalled !== null && <span className="row__stalled" data-testid="row-stalled" aria-description={stalledLabel(stalled)}>{stalledLabel(stalled)}</span>}
        </div>
      </div>
    </article>
  );
}
