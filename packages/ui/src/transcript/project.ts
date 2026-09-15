import { stepsPhrase, type ApprovalPayload, type QuestionPrompt, type TranscriptRow } from '@rotaris/contracts';
import { DIFF_LINE_CAP, GROUP_BLOB_CAP, THINKING_STALE_SECONDS } from './constants.js';
import type { ActivitySegment, DisplayRow, OutcomeCounts, TrailerRow } from './types.js';

/**
 * ADR-0046 **step 4 — the projection**: what is DISPLAYED, from what the session record holds. Pure and
 * synchronous, reading no clock, no random source and no locale-sensitive comparison, because ADR-0046
 * consequence 3 extends ADR-0006's no-bare-clocks rule into the renderer for exactly this stage and
 * REQ-UIBENCH-083 requires the counters downstream of it to be byte-identical across two fresh processes.
 *
 * Two bounds on this step are NORMATIVE and not optimisations to reach for later:
 *
 *  - **its input is the resident window, never the session** (REQ-SESSION-192 caps residency at 5000 rows), and
 *  - **its work is bounded by what changed** — `projectDisplay` re-projects from the earliest-changed index only,
 *    walking back no further than the nearest group boundary at or before it, and recomputes the trailer rows
 *    whole because they are bounded by what is pending rather than by the transcript.
 *
 * REQ-MONITOR-223 is why: it compares an update to a 10,000-row session against the same update to an EMPTY one
 * and allows a factor of two, and a full 5000-row re-projection per update is not within a factor of two of no
 * rows at all.
 */

/** REQ-CHAT-064's four families and the rule that a tool name outside them forms a family of its own. */
const FAMILIES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['reading', ['read', 'read_file', 'list_dir', 'list_files', 'glob', 'view']],
  ['editing', ['edit', 'edit_file', 'write', 'write_file', 'create_file', 'str_replace', 'str_replace_editor', 'apply_patch']],
  ['searching', ['grep', 'grep_search', 'search', 'codebase_search', 'web_search']],
  ['running', ['bash', 'execute', 'execute_bash', 'terminal', 'run_command']],
];

export function familyOf(toolName: string): string {
  for (const [family, names] of FAMILIES) if (names.includes(toolName)) return family;
  return toolName;
}

/**
 * REQ-CHAT-062: reasoning rows. Both spellings are accepted; `thinking` is REQ-CHAT-047's display kind.
 *
 * It lives HERE rather than in `Row.tsx` because PD-CHAT-004's run boundary is decided in step 4 and
 * `Row.tsx` already imports this module — declaring it there and importing it back would close a cycle.
 * `Row.tsx` re-exports it, so every existing caller still reaches it by its old name.
 */
const REASONING_KINDS = new Set(['thinking', 'reasoning']);
export function isReasoningRow(row: Pick<TranscriptRow, 'kind'>): boolean { return REASONING_KINDS.has(row.kind); }

/** PD-CHAT-004: the activity word a run's reasoning segments are labelled with. */
export const REASONING_SEGMENT = 'reasoning';

/** REQ-CHAT-065: highest first — one failed member colours the whole group as failed however many succeeded. */
export const SEVERITY_ORDER = ['failed', 'blocked', 'running', 'ok'] as const;
export type Severity = (typeof SEVERITY_ORDER)[number];

/** REQ-CHAT-065's summary order — the requirement's example — as against `SEVERITY_ORDER`, its colour ranking. */
const SUMMARY_ORDER = ['ok', 'failed', 'blocked', 'running'] as const;

export function groupSeverity(counts: Readonly<Record<Severity, number>>): Severity {
  for (const s of SEVERITY_ORDER) if (counts[s] > 0) return s;
  return 'ok';
}

/**
 * REQ-CHAT-065: the readable summary a group copies as, and its accessible description — "reading x4 - 3 ok -
 * 1 failed". REQ-CHAT-168 binds it: the count is written for the count it carries, at zero and one as much as at
 * many, and an outcome with no members is not named at all. It NEVER emits raw tool input or output.
 */
export function groupSummary(family: string, counts: OutcomeCounts, members?: number): string {
  const total = members ?? SEVERITY_ORDER.reduce((n, s) => n + counts[s], 0);
  // The ORDER is the requirement's own example, `reading × 4 · 3 ok · 1 failed` — ok first, then failed, blocked,
  // running. It is NOT `SEVERITY_ORDER`, which is the severity ranking REQ-CHAT-065 gives for the header's COLOUR
  // and is deliberately the opposite way round. The first form here reused the colour ranking and produced
  // `reading × 4 · 1 failed · 3 ok`; the two halves of this batch disagreed on the string and the requirement's
  // example settled it. Kept beside its replacement rather than repaired quietly.
  const parts = SUMMARY_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  return [`${family} ×${total}`, ...parts].join(FACT_SEPARATOR);
}

/** PD-CHAT-004: facts inside one segment, and segments from one another. Two separators, never one. */
export const FACT_SEPARATOR = ' · ';
export const SEGMENT_SEPARATOR = ', ';

/** REQ-CHAT-062: the streamed character count a reasoning row's token figure is derived from. */
export function reasoningChars(row: TranscriptRow): number {
  const declared = row.chars;
  return typeof declared === 'number' && declared >= 0 ? declared : row.body.length;
}

/**
 * PD-CHAT-004: one segment's own text. A tool segment is REQ-CHAT-065's string **unchanged**, which is why
 * `groupSummary` above is still the single definition of it; a reasoning segment states REQ-CHAT-062's two
 * figures instead of outcomes, because reasoning has no tool outcome to count.
 */
export function segmentSummary(s: ActivitySegment): string {
  if (!s.reasoning) return groupSummary(s.label, s.counts, s.members);
  return [`${s.label} ×${s.members}`, `${Math.floor(s.durationMs / 1000)}s`, `~${s.tokens} tok`].join(FACT_SEPARATOR);
}

/**
 * PD-CHAT-004: the whole activity line, and what it copies as. A run of exactly one tool family and no
 * reasoning therefore still reads `reading ×4 · 3 ok · 1 failed` — REQ-CHAT-065's own example, unchanged,
 * which is the property its back-pointer promises and `transcript.test.ts` asserts directly.
 */
export function activitySummary(segments: readonly ActivitySegment[]): string {
  return segments.map(segmentSummary).join(SEGMENT_SEPARATOR);
}

/** A short, stable, order-independent content hash — the fallback identity of REQ-CHAT-059, and the cache's content key. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * REQ-CHAT-059: expansion state is keyed by STABLE IDENTITY, never by position — tool and verifier rows by their
 * tool-call key with a content-hash fallback, thinking rows by start time with a text-hash fallback, delegation
 * headers by agent, and groups by the key of the group's FIRST member (below, in `foldRuns`). A row's index is its
 * stable identity in this record rather than its position in the displayed array: REQ-CHAT-165 preserves a row's
 * index across release and page-in, which is what lets a paged-in span be placed in its original position.
 */
export function rowKey(row: TranscriptRow): string {
  if (row.kind === 'tool' || row.kind === 'verifier') return `tool:${row.callKey ?? hash(`${row.body} ${row.input ?? ''} ${row.output ?? ''}`)}`;
  if (row.kind === 'thinking') return `think:${row.startedAt ?? hash(row.body)}`;
  if (row.kind === 'delegation') return `deleg:${row.name ?? row.persona ?? hash(row.body)}`;
  return `row:${row.index}`;
}

export interface DisplayCaps {
  readonly show_tool_results: boolean;
  readonly show_tool_inputs: boolean;
  readonly tool_result_lines: number | null;
  readonly tool_input_lines: number | null;
}

export const CAP_DEFAULTS: DisplayCaps = { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 };

export interface ProjectOptions {
  /** The resident window, in index order (ADR-0046: step 4's input is the resident window, never the session). */
  readonly rows: readonly TranscriptRow[];
  /** REQ-CHAT-049: a session with no run in progress must never appear to be in the middle of a tool call. */
  readonly running: boolean;
  /** REQ-CHAT-067's grouping switch, default on. PD-CHAT-004: with it off, no run is formed. */
  readonly groupTools: boolean;
  /**
   * REQ-CHAT-167's `display/showReasoning`, default off. PD-CHAT-004 reads it as a RUN boundary, not only
   * as an expansion default: with it on, a reasoning row is drawn as a row rather than folded away.
   */
  readonly showReasoning: boolean;
  /** REQ-CHAT-166's four values. */
  readonly caps: DisplayCaps;
  /** REQ-CHAT-059: the keys the reader has opened. An open row is drawn untruncated whatever the caps say. */
  readonly expanded: ReadonlySet<string>;
  /** REQ-CHAT-051: the pending state, from which the trailer rows are computed. Widened by Part AC to carry the steps. */
  readonly pendingQuestions: readonly QuestionPrompt[];
  readonly pendingApprovals: readonly ApprovalPayload[];
  /** REQ-CHAT-051: the question trailer is attributed to the agent that asked. */
  readonly questionAgent?: string | undefined;
  /** REQ-CHAT-069's scope filter: null is "All activity". Verifier rows are never filtered out. */
  readonly scopeAgent?: string | null | undefined;
}

/** REQ-CHAT-166: a capped value with the truncation marked in the drawn text, stating how many further lines exist. */
export function capLines(text: string, cap: number | null): string {
  if (cap === null || text === '') return text;
  const lines = text.split('\n');
  if (lines.length <= cap) return text;
  const hidden = lines.length - cap;
  return [...lines.slice(0, cap), `… cut short — ${hidden} more ${hidden === 1 ? 'line' : 'lines'}`].join('\n');
}

/**
 * REQ-CHAT-050: at most 50 added-or-removed lines before the truncation line, and the truncation line names how
 * many further lines exist. REQ-CHAT-168: the count is written for the count it carries.
 */
export function capDiff(text: string): string {
  const lines = text.split('\n');
  if (lines.length === 0) return text;
  const [header, ...body] = lines;
  if (body.length <= DIFF_LINE_CAP) return text;
  const hidden = body.length - DIFF_LINE_CAP;
  return [header ?? '', ...body.slice(0, DIFF_LINE_CAP), `… +${hidden} more ${hidden === 1 ? 'line' : 'lines'}, diff truncated`].join('\n');
}

/** REQ-CHAT-066: the two rows that never fold. */
function neverFolds(row: TranscriptRow): boolean {
  return row.toolName === 'ask_questions' || (row.streamId !== undefined && !row.settled);
}

/**
 * PD-CHAT-004: what may ENTER a run — one agent's tool and streamed-reasoning rows.
 *
 * **With `display/showReasoning` on, a reasoning row stays a row.** REQ-CHAT-167's preference exists so
 * that reasoning is revealed without being asked for, and burying it one expansion deeper inside an
 * activity line would defeat the thing it was turned on for. The rule is also what keeps
 * `TranscriptPane`'s expansion shortcut sound: that file computes the effective expansion from `rows`
 * rather than from the projection, which is only valid while `defaultExpanded` never answers true for a
 * shape step 4 creates — and `defaultExpanded` answers true for a reasoning row only, which under this
 * rule is never folded. The note there names this as the condition; this is the code that meets it.
 */
function runnable(row: TranscriptRow, showReasoning: boolean): boolean {
  if (neverFolds(row)) return false;
  if (row.kind === 'tool') return true;
  return isReasoningRow(row) && !showReasoning;
}

/**
 * PD-CHAT-004: a run is bounded by the **agent**, not by the family. A change of family and an
 * intervening reasoning row no longer end it; a different agent, a row of any other category and
 * REQ-CHAT-066's exempt rows still do, which is what `runnable` and this pair together decide.
 */
function canFoldTogether(a: TranscriptRow, b: TranscriptRow, showReasoning: boolean): boolean {
  if (!runnable(a, showReasoning) || !runnable(b, showReasoning)) return false;
  return (a.name ?? '') === (b.name ?? '') && (a.persona ?? '') === (b.persona ?? '');
}

/** PD-CHAT-004: the activity word a member contributes — `reasoning`, or REQ-CHAT-064's family word. */
function segmentLabel(row: TranscriptRow): string {
  return isReasoningRow(row) ? REASONING_SEGMENT : familyOf(row.toolName ?? row.body);
}

interface MutableSegment { label: string; reasoning: boolean; members: number; counts: Record<Severity, number>; durationMs: number; chars: number }

/**
 * PD-CHAT-004: the run's segments, in the order they first appear. The **same family reached again after
 * another segment forms a second segment of that family** rather than rejoining the first, so the line
 * reads as a sequence of things done — `reading ×2 · 2 ok, running ×1 · 1 ok, reading ×3 · 3 ok` — which
 * is what a reader follows. Merging them would state a total nobody watched happen.
 */
function buildSegments(members: readonly TranscriptRow[]): ActivitySegment[] {
  const out: MutableSegment[] = [];
  for (const m of members) {
    const label = segmentLabel(m);
    const reasoning = isReasoningRow(m);
    let seg = out[out.length - 1];
    if (seg === undefined || seg.label !== label || seg.reasoning !== reasoning) {
      seg = { label, reasoning, members: 0, counts: { ok: 0, failed: 0, blocked: 0, running: 0 }, durationMs: 0, chars: 0 };
      out.push(seg);
    }
    seg.members += 1;
    seg.durationMs += m.durationMs ?? 0;
    if (reasoning) seg.chars += reasoningChars(m);
    else {
      const status = (m.toolStatus ?? 'ok') as Severity;
      seg.counts[SEVERITY_ORDER.includes(status) ? status : 'failed'] += 1;
    }
  }
  // REQ-CHAT-062's arithmetic, applied to the SEGMENT: the summed characters divided by 4, once, rather
  // than each member's own figure rounded and then added — the two differ by up to one token per member.
  return out.map((s) => ({ label: s.label, reasoning: s.reasoning, members: s.members, counts: s.counts, durationMs: s.durationMs, tokens: Math.floor(s.chars / 4) }));
}

/** The earliest instant a member is known to have started, and the latest one a member is known to have reached. */
function spanOf(members: readonly TranscriptRow[]): { startedAt: string; endedAt: string; durationMs: number } {
  let startedAt = '';
  let endedAt = '';
  let summed = 0;
  for (const m of members) {
    const at = m.startedAt ?? m.at;
    if (startedAt === '' || at < startedAt) startedAt = at;
    if (endedAt === '' || m.at > endedAt) endedAt = m.at;
    summed += m.durationMs ?? 0;
  }
  const from = Date.parse(startedAt);
  const to = Date.parse(endedAt);
  // PD-CHAT-004 asks for the span. A record whose instants cannot be read falls back to REQ-CHAT-065's
  // summed durations rather than drawing a negative or a NaN: an unreadable instant draws nothing rather
  // than nonsense is this domain's standing rule (REQ-CHAT-011).
  const span = Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : summed;
  return { startedAt, endedAt, durationMs: span };
}

/**
 * Hygiene, per row (REQ-CHAT-048, REQ-CHAT-049) plus the caps (REQ-CHAT-166). Returns null where the row projects
 * to zero rows. `previousThinking` is the immediately previous thinking row of the same agent, which is the only
 * context REQ-CHAT-048 needs and therefore the only lookback the incremental bound has to preserve.
 */
function hygiene(row: TranscriptRow, previousThinking: TranscriptRow | null, o: ProjectOptions, expanded: boolean): TranscriptRow | null {
  // REQ-CHAT-048: per agent, an unstamped thinking row equal to the immediately previous one projects to zero rows.
  if (row.kind === 'thinking' && row.durationMs === undefined && previousThinking !== null
    && (previousThinking.name ?? '') === (row.name ?? '') && previousThinking.body === row.body) return null;

  let out: TranscriptRow = row;
  if (!o.running) {
    // REQ-CHAT-049: an unstamped thinking row does not present as live, and a row still marked running shows no
    // status and no live timer, so a session with no run never appears to be in the middle of a tool call.
    if (out.kind === 'thinking' && out.durationMs === undefined) {
      const { startedAt: _s, ...rest } = out;
      out = { ...rest, settled: true };
    }
    if (out.toolStatus === 'running') {
      const { toolStatus: _t, durationMs: _d, ...rest } = out;
      out = { ...rest, settled: true };
    }
  } else if (out.kind === 'thinking' && !out.settled && out.startedAt !== undefined) {
    // REQ-CHAT-062: a live thinking row stops presenting as live after 3600 s without completion. The cutoff is
    // decided against the row's own recorded instants, never against a clock this stage may not read.
    const started = Date.parse(out.startedAt);
    const last = Date.parse(out.at);
    if (Number.isFinite(started) && Number.isFinite(last) && (last - started) / 1000 > THINKING_STALE_SECONDS) out = { ...out, settled: true };
  }

  if (out.kind === 'diff') out = { ...out, body: capDiff(out.body) };

  // REQ-CHAT-166: the caps affect only what is DRAWN, and expansion shows the untruncated value whatever they say.
  if (!expanded && (out.input !== undefined || out.output !== undefined)) {
    const input = out.input === undefined ? undefined : o.caps.show_tool_inputs ? capLines(out.input, o.caps.tool_input_lines) : '';
    const output = out.output === undefined ? undefined : o.caps.show_tool_results ? capLines(out.output, o.caps.tool_result_lines) : '';
    out = { ...out, ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) };
  }
  return out;
}

/** REQ-CHAT-069: keep user, system, question, approval and verifier rows plus the selected agent's; verifier rows are never filtered out. */
function inScope(row: TranscriptRow, agent: string | null | undefined): boolean {
  if (agent === null || agent === undefined) return true;
  if (row.kind === 'user' || row.kind === 'system' || row.kind === 'verifier') return true;
  return (row.name ?? '') === agent;
}

/** REQ-CHAT-050: the edit-diff row is displayed at most ONCE however often the transcript is re-projected. */
function dropRepeatedDiffs(rows: readonly TranscriptRow[]): TranscriptRow[] {
  const seen = new Set<string>();
  const out: TranscriptRow[] = [];
  for (const row of rows) {
    if (row.kind === 'diff') {
      const key = row.callKey ?? hash(row.body);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(row);
  }
  return out;
}

/**
 * REQ-CHAT-065: "Expanding a group MUST keep the header on screen and reveal its members beneath it" — so an
 * EXPANDED group is the header followed by its members as ordinary rows, and a collapsed one is the header alone.
 * The header is emitted either way, which is what keeps it on screen across the toggle, and the members keep their
 * own identities so a member opened inside an expanded group stays open (REQ-CHAT-059).
 */
function foldRuns(rows: readonly TranscriptRow[], groupTools: boolean, showReasoning: boolean, expanded: ReadonlySet<string>): DisplayRow[] {
  const out: DisplayRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    let j = i;
    if (groupTools) while (j + 1 < rows.length && canFoldTogether(rows[j]!, rows[j + 1]!, showReasoning)) j += 1;
    // REQ-CHAT-064's two-row floor is UNTOUCHED by PD-CHAT-004: a run of at least TWO rows collapses, and
    // one row is one row — drawn as its own category states, which is what keeps a lone reasoning row a
    // REQ-CHAT-062 summary and a lone tool call a REQ-CHAT-060 header.
    if (j > i) {
      const members = rows.slice(i, j + 1);
      const first = members[0]!;
      const counts: Record<Severity, number> = { ok: 0, failed: 0, blocked: 0, running: 0 };
      let inFlight: string | null = null;
      let inFlightLabel: string | null = null;
      const pieces: string[] = [];
      for (const m of members) {
        // REQ-CHAT-065's severity is over the run's TOOL members: a reasoning row carries no tool outcome,
        // and counting it as `ok` would let a reasoning-only run claim an outcome it never had.
        if (!isReasoningRow(m)) {
          const status = (m.toolStatus ?? 'ok') as Severity;
          counts[SEVERITY_ORDER.includes(status) ? status : 'failed'] += 1;
        }
        if (inFlight === null && (m.toolStatus === 'running' || (isReasoningRow(m) && !m.settled))) {
          inFlight = m.body;
          inFlightLabel = segmentLabel(m);
        }
        pieces.push(`${m.body} ${m.toolName ?? ''} ${m.output ?? ''}`.trim());
      }
      const segments = buildSegments(members);
      const span = spanOf(members);
      out.push({
        shape: 'group', key: `group:${rowKey(first)}`, members, segments,
        // REQ-CHAT-074 indexes a group on its family word; PD-CHAT-004 leaves that the FIRST segment's.
        family: segments[0]?.label ?? segmentLabel(first),
        // PD-CHAT-004 / REQ-CHAT-057: the agent, never an activity word. Every member carries the same one,
        // because `canFoldTogether` is what put them in one run.
        role: first.persona ?? first.name ?? first.kind, persona: first.persona ?? first.name ?? '',
        counts, durationMs: span.durationMs, startedAt: span.startedAt, endedAt: span.endedAt, inFlight, inFlightLabel,
        // REQ-CHAT-065: the members' searchable text, capped at 2000 characters, so search matches inside a fold.
        blob: pieces.join('\n').slice(0, GROUP_BLOB_CAP),
      });
      const header = out[out.length - 1]!;
      if (expanded.has(header.key)) for (const m of members) out.push({ shape: 'row', key: rowKey(m), row: m });
      i = j + 1;
      continue;
    }
    out.push({ shape: 'row', key: rowKey(row), row });
    i += 1;
  }
  return out;
}

/**
 * REQ-CHAT-051 / REQ-MONITOR-230: the trailer rows, computed from what is pending at that moment, always following
 * every recorded row, appended identically by the whole-state and the incremental paths.
 *
 * **The question trailer now reads the widened field (Part AC, 2026-09-07).** The falsified reason, kept beside its
 * replacement: Part Z built this arm against `SessionRecord.pendingQuestions` as `{requestId, prompt}[]`, which
 * carried neither steps nor titles, and took the LIST to be one prompt's steps — N the list's length and the title
 * the first entry's prompt — because REQ-CHAT-094 allows one pending prompt per conversation and that was the only
 * reading the shape supported. It was the wrong reading of a field that could not express the requirement: the list
 * is one entry PER CONVERSATION, and each entry now carries its own ordered steps. N is that prompt's step count and
 * the title is its first step's title, which is what REQ-CHAT-051 asks for. REQ-CHAT-168 binds the wording at zero,
 * one and many, and the phrase is `stepsPhrase` from the contracts so the trailer and REQ-CHAT-095's
 * "Received answers for N step(s)." can never disagree about the grammar.
 *
 * The prompt trailer is the FIRST pending prompt: REQ-CHAT-051 defines one question trailer row, and a run whose
 * children each ask at once would otherwise draw one per conversation with no requirement licensing the stack.
 */
export function trailerRows(o: Pick<ProjectOptions, 'pendingQuestions' | 'pendingApprovals' | 'questionAgent'>): DisplayRow[] {
  const out: DisplayRow[] = [];
  const first = o.pendingQuestions[0];
  if (first) {
    const n = first.steps.length;
    const title = (first.steps[0]?.title ?? '').trim();
    const trailer: TrailerRow = {
      sort: 'question', requestId: first.request_id, role: first.agent_id || o.questionAgent || first.persona || 'rotaris',
      // REQ-CHAT-168 at zero, one and many; and a first step with no title yields the count alone rather than a
      // dangling separator — Part AA's guard, kept through the widening.
      text: title === '' ? stepsPhrase(n) : `${stepsPhrase(n)} — ${title}`,
      steps: n,
    };
    out.push({ shape: 'trailer', key: `trailer:question:${first.request_id}`, trailer });
  }
  for (const a of o.pendingApprovals) {
    const trailer: TrailerRow = {
      sort: 'approval', requestId: a.request_id, role: a.agent_id || a.persona,
      text: `Approval needed — ${a.command !== '' ? a.command : a.tool_name}`, approval: a,
    };
    out.push({ shape: 'trailer', key: `trailer:approval:${a.request_id}`, trailer });
  }
  return out;
}

/**
 * The whole of step 4 over the resident window. `from` is the earliest-changed ROW INDEX; the projection walks
 * back from it to the nearest group boundary and re-projects only the suffix, reusing the caller's previous
 * displayed prefix. Passing `from` as `null` (or omitting `previous`) re-projects the window, which is what a
 * display-cap change does exactly once (REQ-CHAT-166) and what a reset does.
 */
export function projectDisplay(o: ProjectOptions, incremental?: { readonly previous: readonly DisplayRow[]; readonly from: number }): DisplayRow[] {
  const kept = o.rows.filter((r) => inScope(r, o.scopeAgent));
  const deduped = dropRepeatedDiffs(kept);

  let startRow = 0;
  let prefix: DisplayRow[] = [];
  if (incremental) {
    // The nearest group boundary at or before the earliest-changed index: walk back while the row before could
    // have folded with this one, so one fold can be recomputed and no other.
    let b = deduped.findIndex((r) => r.index >= incremental.from);
    if (b === -1) b = deduped.length;
    while (b > 0 && canFoldTogether(deduped[b - 1]!, deduped[b] ?? deduped[b - 1]!, o.showReasoning)) b -= 1;
    // REQ-CHAT-048 needs the immediately previous thinking row, so one more row of lookback is kept for context.
    startRow = b;
    const boundaryIndex = deduped[b]?.index ?? Number.POSITIVE_INFINITY;
    prefix = incremental.previous.filter((d) => d.shape !== 'trailer' && lastIndexOf(d) < boundaryIndex);
    // A reusable prefix must be a prefix: stop at the first displayed row that is not below the boundary.
    const cut = incremental.previous.findIndex((d) => d.shape === 'trailer' || lastIndexOf(d) >= boundaryIndex);
    if (cut !== -1) prefix = incremental.previous.slice(0, cut) as DisplayRow[];
  }

  const suffix = deduped.slice(startRow);
  const cleaned: TranscriptRow[] = [];
  let previousThinking: TranscriptRow | null = startRow > 0 ? lastThinkingBefore(deduped, startRow) : null;
  for (const row of suffix) {
    const out = hygiene(row, previousThinking, o, o.expanded.has(rowKey(row)));
    if (row.kind === 'thinking') previousThinking = row;
    if (out !== null) cleaned.push(out);
  }
  return [...prefix, ...foldRuns(cleaned, o.groupTools, o.showReasoning, o.expanded), ...trailerRows(o)];
}

function lastThinkingBefore(rows: readonly TranscriptRow[], before: number): TranscriptRow | null {
  for (let i = before - 1; i >= 0; i -= 1) if (rows[i]!.kind === 'thinking') return rows[i]!;
  return null;
}

/** The highest recorded row index a displayed row covers; a trailer covers none. */
export function lastIndexOf(d: DisplayRow): number {
  if (d.shape === 'row') return d.row.index;
  if (d.shape === 'group') return d.members[d.members.length - 1]!.index;
  return Number.POSITIVE_INFINITY;
}

/** REQ-CHAT-058: a live row is redrawn on every repaint rather than reused, so its elapsed time keeps advancing. */
export function isLive(d: DisplayRow): boolean {
  if (d.shape === 'trailer') return false;
  // PD-CHAT-004: a run is live while a tool member runs OR a reasoning member is still streaming — the
  // second arm is new, because a run whose last member is unsettled reasoning has no running tool in it
  // and would otherwise stop advancing while the agent was plainly still thinking.
  if (d.shape === 'group') return d.counts.running > 0 || d.members.some((m) => isReasoningRow(m) && !m.settled);
  const row = d.row;
  if (row.toolStatus === 'running') return true;
  return row.kind === 'thinking' && !row.settled;
}

/**
 * PD-CHAT-004: the figure the activity line draws — the run's elapsed span, counting upward from the
 * earliest start while the run is live and frozen at `endedAt − startedAt` once it is not.
 *
 * It replaces `groupDurationMs`, which summed the members' durations and added the live time of each
 * running member. The falsified reason is kept beside its replacement: summing was right for
 * REQ-CHAT-065's same-family group, where every member was a tool call and the sum was the work done; it
 * understates a run that crosses reasoning and families, where the reader's question is how long the
 * agent has been at it and the gaps between calls are part of the answer.
 */
export function activitySpanMs(d: Extract<DisplayRow, { shape: 'group' }>, nowMs: number, runActive = true): number {
  if (!isLive(d) || !runActive) return d.durationMs;
  const from = Date.parse(d.startedAt);
  if (!Number.isFinite(from)) return d.durationMs;
  return Math.max(d.durationMs, Math.max(0, nowMs - from));
}
