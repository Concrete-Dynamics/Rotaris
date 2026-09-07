import type { ApprovalPayload, TranscriptRow } from '@rotaris/contracts';
import { DIFF_LINE_CAP, GROUP_BLOB_CAP, THINKING_STALE_SECONDS } from './constants.js';
import type { DisplayRow, TrailerRow } from './types.js';

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
export function groupSummary(family: string, counts: Readonly<Record<Severity, number>>, members?: number): string {
  const total = members ?? SEVERITY_ORDER.reduce((n, s) => n + counts[s], 0);
  // The ORDER is the requirement's own example, `reading × 4 · 3 ok · 1 failed` — ok first, then failed, blocked,
  // running. It is NOT `SEVERITY_ORDER`, which is the severity ranking REQ-CHAT-065 gives for the header's COLOUR
  // and is deliberately the opposite way round. The first form here reused the colour ranking and produced
  // `reading × 4 · 1 failed · 3 ok`; the two halves of this batch disagreed on the string and the requirement's
  // example settled it. Kept beside its replacement rather than repaired quietly.
  const parts = SUMMARY_ORDER.filter((s) => counts[s] > 0).map((s) => `${counts[s]} ${s}`);
  return [`${family} ×${total}`, ...parts].join(' · ');
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
  /** REQ-CHAT-067's grouping switch, default on. */
  readonly groupTools: boolean;
  /** REQ-CHAT-166's four values. */
  readonly caps: DisplayCaps;
  /** REQ-CHAT-059: the keys the reader has opened. An open row is drawn untruncated whatever the caps say. */
  readonly expanded: ReadonlySet<string>;
  /** REQ-CHAT-051: the pending state, from which the trailer rows are computed. */
  readonly pendingQuestions: readonly { readonly requestId: string; readonly prompt: string }[];
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

function canFoldTogether(a: TranscriptRow, b: TranscriptRow): boolean {
  if (a.kind !== 'tool' || b.kind !== 'tool') return false;
  if (neverFolds(a) || neverFolds(b)) return false;
  if ((a.name ?? '') !== (b.name ?? '')) return false;
  return familyOf(a.toolName ?? a.body) === familyOf(b.toolName ?? b.body);
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
function foldRuns(rows: readonly TranscriptRow[], groupTools: boolean, expanded: ReadonlySet<string>): DisplayRow[] {
  const out: DisplayRow[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    let j = i;
    if (groupTools) while (j + 1 < rows.length && canFoldTogether(rows[j]!, rows[j + 1]!)) j += 1;
    // REQ-CHAT-064: a run of at least TWO consecutive rows collapses; one row is one row.
    if (j > i) {
      const members = rows.slice(i, j + 1);
      const counts: Record<Severity, number> = { ok: 0, failed: 0, blocked: 0, running: 0 };
      let durationMs = 0;
      let startedAt = '';
      let inFlight: string | null = null;
      const pieces: string[] = [];
      for (const m of members) {
        const status = (m.toolStatus ?? 'ok') as Severity;
        counts[SEVERITY_ORDER.includes(status) ? status : 'failed'] += 1;
        durationMs += m.durationMs ?? 0;
        const at = m.startedAt ?? m.at;
        if (startedAt === '' || at < startedAt) startedAt = at;
        if (m.toolStatus === 'running' && inFlight === null) inFlight = m.body;
        pieces.push(`${m.body} ${m.toolName ?? ''} ${m.output ?? ''}`.trim());
      }
      out.push({
        shape: 'group', key: `group:${rowKey(members[0]!)}`, family: familyOf(members[0]!.toolName ?? members[0]!.body),
        members, counts, durationMs, startedAt, inFlight,
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
 * **The question trailer is met for approvals and PENDING for questions.** REQ-CHAT-051 reads
 * "N step(s) - <title of the first step>", and `SessionRecord.pendingQuestions` carries `{requestId, prompt}` with
 * no steps and no titles. REQ-CHAT-094 allows one pending prompt per conversation, so the only reading the shape
 * supports is that the LIST is that one prompt's steps: N is the list's length and the title is the first entry's
 * prompt. Part AC widens the field to carry the steps, and the trailer then reads the widened shape.
 * REQ-CHAT-168 binds the wording at zero, one and many.
 */
export function trailerRows(o: Pick<ProjectOptions, 'pendingQuestions' | 'pendingApprovals' | 'questionAgent'>): DisplayRow[] {
  const out: DisplayRow[] = [];
  if (o.pendingQuestions.length > 0) {
    const n = o.pendingQuestions.length;
    const first = o.pendingQuestions[0]!;
    const trailer: TrailerRow = {
      sort: 'question', requestId: first.requestId, role: o.questionAgent ?? 'rotaris',
      // REQ-CHAT-168 at one and at many; and a prompt with no text yields the count alone rather than a dangling
      // separator — Part AA's guard, which the half that computed the wording did not have.
      text: first.prompt === '' ? `${n} ${n === 1 ? 'step' : 'steps'}` : `${n} ${n === 1 ? 'step' : 'steps'} — ${first.prompt}`,
      steps: n,
    };
    out.push({ shape: 'trailer', key: `trailer:question:${first.requestId}`, trailer });
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
    while (b > 0 && canFoldTogether(deduped[b - 1]!, deduped[b] ?? deduped[b - 1]!)) b -= 1;
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
  return [...prefix, ...foldRuns(cleaned, o.groupTools, o.expanded), ...trailerRows(o)];
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
  if (d.shape === 'group') return d.counts.running > 0;
  const row = d.row;
  if (row.toolStatus === 'running') return true;
  return row.kind === 'thinking' && !row.settled;
}
