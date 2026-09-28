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
  return [`${family} ×${total}`, ...outcomeFacts(counts).map((f) => f.text)].join(FACT_SEPARATOR);
}

/**
 * REQ-CHAT-065's per-outcome counts, each still carrying the outcome it counts.
 *
 * The ORDER is the requirement's own example, `reading × 4 · 3 ok · 1 failed` — ok first, then failed, blocked,
 * running. It is NOT `SEVERITY_ORDER`, which is the severity ranking REQ-CHAT-065 gives for the header's COLOUR
 * and is deliberately the opposite way round. The first form here reused the colour ranking and produced
 * `reading × 4 · 1 failed · 3 ok`; the two halves of that batch disagreed on the string and the requirement's
 * example settled it. Kept beside its replacement rather than repaired quietly.
 *
 * **PD-CHAT-004 revision 3 is why the outcome rides along.** The fail colour belongs to `1 failed` and to nothing else on
 * the line, so the renderer needs the parts rather than the joined string — and it needs them from the same walk
 * that produces the string, or the text a reader copies and the text a reader sees could drift.
 */
function outcomeFacts(counts: OutcomeCounts): SegmentFact[] {
  const facts: SegmentFact[] = [];
  for (const s of SUMMARY_ORDER) if (counts[s] > 0) facts.push({ text: `${counts[s]} ${s}`, outcome: s });
  return facts;
}

/** One drawable part of a segment: its text, and the outcome it states — `null` where it states none. */
export interface SegmentFact {
  readonly text: string;
  readonly outcome: Severity | null;
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
 * PD-CHAT-004: one segment's own parts. A tool segment is REQ-CHAT-065's string **unchanged** — `outcomeFacts`
 * above is the single definition of the counts, so this and `groupSummary` cannot disagree; a reasoning segment
 * states REQ-CHAT-062's two figures instead of outcomes, because reasoning has no tool outcome to count, and
 * every one of its facts therefore carries `null`. PD-CHAT-004 revision 3 draws from this.
 */
export function segmentFacts(s: ActivitySegment): readonly SegmentFact[] {
  if (s.reasoning) {
    return [
      { text: `${s.label} ×${s.members}`, outcome: null },
      { text: `${Math.floor(s.durationMs / 1000)}s`, outcome: null },
      { text: `~${s.tokens} tok`, outcome: null },
    ];
  }
  return [{ text: `${s.label} ×${s.members}`, outcome: null }, ...outcomeFacts(s.counts)];
}

/** PD-CHAT-004: one segment's own text — the facts above, joined. Copy and the accessible description read this. */
export function segmentSummary(s: ActivitySegment): string {
  return segmentFacts(s).map((f) => f.text).join(FACT_SEPARATOR);
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
 * PD-CHAT-004: a run is bounded by the **agent**. This is the run's identity — a row that names neither a
 * name nor a persona belongs to the run itself rather than to one participant, and answers the empty key.
 */
function agentKey(row: TranscriptRow): string {
  const name = row.name ?? '';
  const persona = row.persona ?? '';
  return name === '' && persona === '' ? '' : `${name}|${persona}`;
}

/**
 * PD-CHAT-004 **revision 2**: what ENDS a run, now that a different agent's row no longer does.
 *
 * A row that names no agent belongs to the run rather than to a participant — a system notice, an intent
 * marker — so it ends EVERY open run. A **user prompt** ends every open run whatever it names: it is the
 * turn boundary the reader drew themselves, and no agent's work continues across it. Everything else ends
 * the run of the agent it names and no other, which is `runnable` plus `agentKey` and nothing further.
 */
function closesEveryRun(row: TranscriptRow): boolean { return row.kind === 'user' || agentKey(row) === ''; }

/** PD-CHAT-004: the activity word a member contributes — `reasoning`, or REQ-CHAT-064's family word. */
function segmentLabel(row: TranscriptRow): string {
  return isReasoningRow(row) ? REASONING_SEGMENT : familyOf(row.toolName ?? row.body);
}

interface MutableSegment { label: string; reasoning: boolean; members: number; counts: Record<Severity, number>; durationMs: number; chars: number }

/**
 * PD-CHAT-004 **revision 2**: the run's segments — **one per activity word, carrying that word's totals**,
 * in the order the words first appear: `reasoning ×24 · 41s · ~6.1k tok, reading ×22 · 22 ok, searching ×5 · 5 ok`.
 *
 * **The falsified reason, kept beside its replacement.** Revision 1 formed a SECOND segment of a family
 * whenever that family was reached again after another one, so that the line "reads as a sequence of things
 * done"; merging them, it said, "would state a total nobody watched happen". What the owner measured on
 * 2026-09-16 is that an agent alternating reasoning and reading produces one segment per STEP — thirty
 * segments for thirty steps — so the line grew with the work exactly as the appended rows it replaced did,
 * and the sequence it preserved was unreadable by the time there was enough of it to matter. The sequence
 * is not lost and is not summarised away: it is the expansion, in recorded order, one row per step.
 *
 * The map is keyed by the word AND by which kind of word it is, so a tool literally named `reasoning`
 * counts as its own family rather than joining the reasoning segment.
 */
function buildSegments(members: readonly TranscriptRow[]): ActivitySegment[] {
  // Insertion order IS first-appearance order, which is the order the line states its words in.
  const out = new Map<string, MutableSegment>();
  for (const m of members) {
    const label = segmentLabel(m);
    const reasoning = isReasoningRow(m);
    const key = `${reasoning ? 'r' : 't'}:${label}`;
    let seg = out.get(key);
    if (seg === undefined) {
      seg = { label, reasoning, members: 0, counts: { ok: 0, failed: 0, blocked: 0, running: 0 }, durationMs: 0, chars: 0 };
      out.set(key, seg);
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
  return [...out.values()].map((s) => ({ label: s.label, reasoning: s.reasoning, members: s.members, counts: s.counts, durationMs: s.durationMs, tokens: Math.floor(s.chars / 4) }));
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
 * to zero rows. `previousThinking` is the immediately previous thinking row OF THE ROW'S OWN AGENT
 * (`previousThinkingByAgent`): REQ-CHAT-048's "per agent" is read as scoping the whole rule, so another agent's reasoning
 * between two equal bursts does not keep the second (OQ-90 names the other reading; the repair is recorded in
 * docs/defects/fixed/duplicate-reasoning-hygiene-compares-with-the-previous-thinking-row-of-any-agent.md). It is the
 * only lookback the incremental bound has to preserve.
 */
function hygiene(row: TranscriptRow, previousThinking: TranscriptRow | null, o: ProjectOptions, expanded: boolean): TranscriptRow | null {
  if (repeatsReasoning(row, previousThinking)) return null;
  let out = settle(row, o.running);
  if (out.kind === 'diff') out = { ...out, body: capDiff(out.body) };

  // REQ-CHAT-166: the caps affect only what is DRAWN, and expansion shows the untruncated value whatever they say.
  if (!expanded && (out.input !== undefined || out.output !== undefined)) {
    const input = out.input === undefined ? undefined : o.caps.show_tool_inputs ? capLines(out.input, o.caps.tool_input_lines) : '';
    const output = out.output === undefined ? undefined : o.caps.show_tool_results ? capLines(out.output, o.caps.tool_result_lines) : '';
    out = { ...out, ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) };
  }
  return out;
}

/**
 * REQ-CHAT-048: per agent, an unstamped thinking row equal to that agent's immediately previous thinking row projects
 * to zero rows. The caller hands the previous thinking row of the row's own agent; the name is compared again so a
 * caller that hands another agent's row can only keep a row, never drop one.
 */
function repeatsReasoning(row: TranscriptRow, previousThinking: TranscriptRow | null): boolean {
  return isUnstampedThinking(row) && previousThinking !== null
    && thinkingAgent(previousThinking) === thinkingAgent(row) && previousThinking.body === row.body;
}

/** The only rows REQ-CHAT-048 can drop — and so the only rows whose agent's previous thinking row is ever looked up. */
function isUnstampedThinking(row: TranscriptRow): boolean {
  return row.kind === 'thinking' && row.durationMs === undefined;
}

/** Whose reasoning a thinking row is, for REQ-CHAT-048's "per agent": the agent the row names, as the rule always compared. */
function thinkingAgent(row: TranscriptRow): string {
  return row.name ?? '';
}

/**
 * Per agent, the immediately previous thinking row, as a walk forward from `from` meets the rows. What lies below
 * `from` is read lazily and once per agent — only for an agent whose unstamped thinking row the walk asks about —
 * so a suffix with no reasoning in it looks nothing up, and a lookup reads at most back to that agent's own
 * previous thinking row (to the window's start when it has none, as the single any-agent lookback did before it).
 */
function previousThinkingByAgent(rows: readonly TranscriptRow[], from: number): { of(row: TranscriptRow): TranscriptRow | null; saw(row: TranscriptRow): void } {
  const byAgent = new Map<string, TranscriptRow | null>();
  return {
    of(row) {
      if (!isUnstampedThinking(row)) return null;
      const agent = thinkingAgent(row);
      if (!byAgent.has(agent)) byAgent.set(agent, lastThinkingOf(rows, from, agent));
      return byAgent.get(agent) ?? null;
    },
    saw(row) {
      if (row.kind === 'thinking') byAgent.set(thinkingAgent(row), row);
    },
  };
}

/**
 * REQ-CHAT-049 and REQ-CHAT-062's settling — the part of hygiene that decides whether a streamed row is still live,
 * and therefore (REQ-CHAT-066) whether it may fold. Split from the caps so `cleanCut` can read runs exactly as
 * `foldRuns` will form them without paying for the caps, which no run reads.
 */
function settle(row: TranscriptRow, running: boolean): TranscriptRow {
  let out: TranscriptRow = row;
  if (!running) {
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
  return out;
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
 * REQ-CHAT-065: "Expanding a group MUST keep the header on screen and reveal its members beneath it" — which
 * `Row.tsx` draws, hanging the revealed members from PD-CHAT-004's one continuous rule in the agent's persona
 * colour. **This step emits the header alone.** It once emitted the members a second time as top-level rows,
 * which drew every member twice the moment a line was opened in the product — once nested under the rule and
 * once beneath it with a gutter of its own. Recorded as
 * `docs/defects/fixed/an-expanded-activity-line-draws-its-members-twice.md` and repaired here; the members are
 * still carried on the header, which is what `Row.tsx` reveals and what REQ-CHAT-065's blob is built from.
 *
 * **PD-CHAT-004 revision 2 — runs INTERLEAVE.** One pass: a runnable row joins its agent's open run, or opens
 * one and takes that run's place in the output; every other row is emitted where it stands and closes the runs
 * it ends. A run therefore sits at the position of its EARLIEST member, which is R-017's "display them
 * according to sent first", and two agents working at once own two lines that never contend for the tail.
 *
 * The two-row floor is REQ-CHAT-064's and is untouched: a run of one row is one row, drawn as its own category
 * states, which is what keeps a lone reasoning row a REQ-CHAT-062 summary and a lone tool call a REQ-CHAT-060
 * header. With REQ-CHAT-067's grouping switch off no run is formed at all.
 */
function foldRuns(rows: readonly TranscriptRow[], groupTools: boolean, showReasoning: boolean): DisplayRow[] {
  interface Run { readonly members: TranscriptRow[] }
  const slots: Array<Run | { readonly row: TranscriptRow }> = [];
  const open = new Map<string, Run>();
  for (const row of rows) {
    if (groupTools && runnable(row, showReasoning)) {
      const key = agentKey(row);
      let run = open.get(key);
      if (run === undefined) { run = { members: [] }; open.set(key, run); slots.push(run); }
      run.members.push(row);
      continue;
    }
    if (closesEveryRun(row)) open.clear(); else open.delete(agentKey(row));
    slots.push({ row });
  }

  const out: DisplayRow[] = [];
  for (const slot of slots) {
    if (!('members' in slot)) { out.push({ shape: 'row', key: rowKey(slot.row), row: slot.row }); continue; }
    const members = slot.members;
    if (members.length < 2) {
      const only = members[0]!;
      out.push({ shape: 'row', key: rowKey(only), row: only });
      continue;
    }
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
      // because `agentKey` is what put them in one run.
      role: first.persona ?? first.name ?? first.kind, persona: first.persona ?? first.name ?? '',
      counts, durationMs: span.durationMs, startedAt: span.startedAt, endedAt: span.endedAt, inFlight, inFlightLabel,
      // REQ-CHAT-065: the members' searchable text, capped at 2000 characters, so search matches inside a fold.
      blob: pieces.join('\n').slice(0, GROUP_BLOB_CAP),
    });
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
 * ADR-0046's incremental bound, under PD-CHAT-004 revision 2: **the latest position at or before `b` that no
 * run crosses**. Re-projecting from a clean cut reproduces every displayed row from it onward, and no
 * displayed row before it, which is exactly what makes the caller's previous prefix reusable.
 *
 * Revision 1 could walk back one predicate at a time — a run was a consecutive stretch, so the nearest
 * boundary was the first pair that could not fold. Runs now INTERLEAVE, so a run that began long before `b`
 * can still be open at it while other agents' runs opened and closed inside it, and a cut taken in the middle
 * of one would lose the members below it: they would be neither reused (their header reaches past the cut)
 * nor re-projected (they sit before it).
 *
 * Two passes, both bounded by the work they find rather than by the window. The suffix says which agents
 * have a run open at `b` — an agent whose first event at or after `b` is runnable. Then the walk back keeps,
 * per agent, the highest index at which that agent is known to have a runnable row above the current cut:
 * a row whose run reaches the cut drags the cut down to itself, a row whose run ended above it does not, and
 * a row that closes an agent's run starts that agent again from the row before. A row naming no agent closes
 * every run, so nothing before it can cross and the walk stops there.
 *
 * **Both passes read the rows as `foldRuns` will see them**: a row REQ-CHAT-048 projects to zero rows is skipped, and
 * each row is settled by REQ-CHAT-049 / REQ-CHAT-062 before `runnable` asks whether it is still live. The first form
 * read the raw rows, and a live reasoning row that repeats its agent's previous one — never foldable raw, absent once
 * cleaned — closed that agent's run here while the fold joined the rows on either side of it: an append after it drew
 * `[group 1,2 · row 4]` where the whole projection draws `[group 1,2,4]` (R-062's fix round 2, `projector.test.ts`).
 */
function cleanCut(rows: readonly TranscriptRow[], b: number, o: Pick<ProjectOptions, 'running' | 'showReasoning'>): number {
  const reach = new Map<string, number>();
  const closedAbove = new Set<string>();
  const thinking = previousThinkingByAgent(rows, b);
  for (let i = b; i < rows.length; i += 1) {
    const raw = rows[i]!;
    const repeat = repeatsReasoning(raw, thinking.of(raw));
    thinking.saw(raw);
    if (repeat) continue;
    const row = settle(raw, o.running);
    if (closesEveryRun(row)) break;
    const key = agentKey(row);
    if (!runnable(row, o.showReasoning)) { closedAbove.add(key); continue; }
    // An agent whose first event in the suffix is runnable has a run that may reach back past `b`.
    if (!closedAbove.has(key) && !reach.has(key)) reach.set(key, b);
  }

  let cut = b;
  for (let i = b - 1; i >= 0; i -= 1) {
    const raw = rows[i]!;
    // The lookback is taken only for an unstamped thinking row, and each one ends at the same agent's next thinking
    // row down, so one agent's lookbacks cover disjoint stretches: bounded, per agent, by the walk plus one stretch
    // below it.
    if (isUnstampedThinking(raw) && repeatsReasoning(raw, lastThinkingOf(rows, i, thinkingAgent(raw)))) continue;
    const row = settle(raw, o.running);
    if (closesEveryRun(row)) break;
    const key = agentKey(row);
    if (!runnable(row, o.showReasoning)) { reach.delete(key); continue; }
    // The highest index this agent's current run is known to reach. Unset means this row is its highest.
    const highest = reach.get(key) ?? i;
    reach.set(key, highest);
    // It crosses the cut when it has a member at or above the cut and this member below it.
    if (highest >= cut) cut = i;
  }
  return cut;
}

/**
 * The whole of step 4 over the resident window. `from` is the earliest-changed ROW INDEX; the projection walks
 * back from it to the nearest group boundary and re-projects only the suffix, reusing the caller's previous
 * displayed prefix. Passing `from` as `null` (or omitting `previous`) re-projects the window, which is what a
 * display-cap change does exactly once (REQ-CHAT-166) and what a reset does.
 */
export function projectDisplay(o: ProjectOptions, incremental?: { readonly previous: readonly DisplayRow[]; readonly from: number }): DisplayRow[] {
  // REQ-CHAT-069's scope filter is NOT applied here: it is `scopedRows` in `TranscriptSurface.tsx`, applied by
  // the surface that owns the toggle. One requirement, one implementation — a second copy here was unreachable
  // and disagreed about the kinds (docs/defects/fixed/the-in-projection-scope-filter-is-never-reached.md).
  const deduped = dropRepeatedDiffs(o.rows);

  let startRow = 0;
  let prefix: DisplayRow[] = [];
  if (incremental) {
    let b = deduped.findIndex((r) => r.index >= incremental.from);
    if (b === -1) b = deduped.length;
    startRow = cleanCut(deduped, b, o);
    // The ROW INDEX of the clean cut, which is where re-projection begins — not `b`'s, which a run open at
    // `b` may reach back past. REQ-CHAT-048 needs each agent's immediately previous thinking row, looked up below.
    //
    // Never above `from`. Where every row at and after `from` is gone from `deduped` — REQ-CHAT-050's repeated diff
    // re-sent at its own index with the rows behind it removed — the cut lands past the end, and the first form read
    // that as +Infinity and reused the whole previous display, removed rows included (R-062's fix round 2). The rows
    // from `from` on are the changed ones by definition, so nothing displayed for them before is reusable.
    const boundaryIndex = Math.min(deduped[startRow]?.index ?? Number.POSITIVE_INFINITY, incremental.from);
    prefix = incremental.previous.filter((d) => d.shape !== 'trailer' && lastIndexOf(d) < boundaryIndex);
    // A reusable prefix must be a prefix: stop at the first displayed row that is not below the boundary.
    const cut = incremental.previous.findIndex((d) => d.shape === 'trailer' || lastIndexOf(d) >= boundaryIndex);
    if (cut !== -1) prefix = incremental.previous.slice(0, cut) as DisplayRow[];
    // `cleanCut` reads the runs of the NEW rows. A previous run could still reach across the boundary when a row it
    // held was replaced in place by one that does not join it (a tool row become prose): its members below the
    // boundary would be neither reused (the header reaches past it) nor re-projected (they sit before it). The
    // bounded form cannot take that change, so it projects the window instead. Found when the pane began taking the
    // bounded form (R-062's fix round 1, `projector.test.ts`); unreachable by an append or a settle, whose previous
    // runs the new rows still hold.
    if (cut !== -1 && incremental.previous.slice(cut).some((d) => d.shape === 'group' && d.members[0]!.index < boundaryIndex)) {
      startRow = 0;
      prefix = [];
    }
  }

  const suffix = deduped.slice(startRow);
  const cleaned: TranscriptRow[] = [];
  const thinking = previousThinkingByAgent(deduped, startRow);
  for (const row of suffix) {
    const out = hygiene(row, thinking.of(row), o, o.expanded.has(rowKey(row)));
    thinking.saw(row);
    if (out !== null) cleaned.push(out);
  }
  return [...prefix, ...foldRuns(cleaned, o.groupTools, o.showReasoning), ...trailerRows(o)];
}

/** REQ-CHAT-048's lookback: the nearest thinking row below `before` that `agent` wrote, or null. */
function lastThinkingOf(rows: readonly TranscriptRow[], before: number, agent: string): TranscriptRow | null {
  for (let i = before - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (row.kind === 'thinking' && thinkingAgent(row) === agent) return row;
  }
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
