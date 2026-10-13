import { countNoun, millis, type Millis, type Timers } from '@rotaris/kernel';
import { normaliseReportStatus, type ReportStatus } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import { CODE_INTELLIGENCE_SERVER_NAME, codeIntelligenceEdit } from '@rotaris/config';
import type { CutOff } from './cut-off.js';
import type { AgentGrant } from './personas.js';
import { ranBeforeItWasCut } from '../run/interruption.js';

/**
 * REQ-ORCH-108..112: every terminal child produces a machine-readable report before its parent resumes.
 * The summarising pass is bounded — the transcript capped at 12,000 characters in total and 2,000 per
 * event, at most two attempts (the second told what was wrong with the first), a 120 s timeout — and it
 * ALWAYS yields a report: on failure, one carrying a `summary_failure` error whose summary is the first
 * 220 characters of the child's final message, else the tools it used. The agent name and role are the
 * run's values whatever the pass produced; runner-owned fields are stripped structurally (REQ-ORCH-109).
 * REQ-ORCH-111: a `tester` that succeeded with ≤ 8 events, ≥ 1 tool call and a final response gets a
 * deterministic report with no model call.
 */
export const TRANSCRIPT_CAP = 12_000;
export const EVENT_CAP = 2_000;
export const SUMMARY_CAP = 220;
export const SUMMARY_TIMEOUT_MS = millis(120_000);

const RUNNER_OWNED = ['verification_results', 'completion_gate_decision', 'repair_record', 'gate_state', 'requirement_coverage', 'scope_drift'] as const;

export interface ChildReport {
  readonly agent_name: string;
  readonly role: string;
  readonly status: ReportStatus;
  readonly summary: string;
  readonly key_findings: readonly string[];
  readonly last_response: string;
  readonly final_response: string;
  readonly edited_files: readonly string[];
  readonly commands: readonly { command: string; exit_code: number | null }[];
  readonly errors: readonly { type: string; message: string }[];
  readonly next_actions: readonly string[];
  readonly tags: readonly string[];
  /**
   * PD-ORCH-004: present only on a child that REQ-ORCH-088's limit cut off while it was making progress — the
   * statement, the paths it changed and, unless it is itself a continuation, the continuation offer. Runner-owned:
   * no summarising pass writes it, and every other report carries no such field.
   */
  readonly cut_off?: CutOff;
}

export interface ReportInput {
  /** OQ-189 (PD-MONITOR-007): the model the agent ran on at its end, the summariser's fallback when its own is out of quota. */
  readonly agentModel?: { readonly model: ModelRef; readonly thinking: ThinkingLevel } | undefined;
  readonly agentName: string;
  readonly role: string;
  readonly status: ReportStatus;
  readonly messages: readonly ChatMessage[];
  readonly toolCallCount: number;
  readonly toolsUsed: readonly string[];
  /** The last assistant text, and whether tool activity followed it (REQ-ORCH-110's final/last distinction). */
  readonly lastText: string;
  readonly finalTextIsFinal: boolean;
  readonly errors?: readonly { type: string; message: string }[];
  /**
   * OQ-111: the child's task as given — the ledger row's `task`, which REQ-TOOLS-154's payload carries LAST, behind the
   * prior-agent context, the workspace root, the write scopes, the sibling index and the inherited reports. The report's
   * pass keeps it as the transcript's start. Absent, the transcript's first event is its start.
   */
  readonly task?: string;
  /**
   * OQ-217 (ruled 2026-10-07 under R-072): PD-ORCH-004's statement for a child REQ-ORCH-088's limit cut off while it was
   * making progress — the statement only, without the paths or the continuation offer. Runner-owned; the summarising pass
   * is told it in the Outcome line and never writes it.
   */
  readonly cutOffStatement?: string | undefined;
  /**
   * REQ-MCP-015 (fin36): the callables the child's grant gives the code-intelligence server (`editTierNamesOf`), so a tool of
   * another server named like the EDIT tier is no edit. Absent where no grant is known, when the name alone decides.
   */
  readonly editTier?: EditTierNames;
}

export interface SummariserDeps {
  readonly backend: AgentBackend;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly timers: Timers;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly timeoutMs?: Millis;
  /**
   * REQ-ORCH-091 (a)/(d) with REQ-MONITOR-194: the model and level each attempt calls — the configured ones carried through
   * the session's overrides, read at the attempt, so a pair a wait's choice replaced is not called again (the repair of
   * a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced). Absent means `model` and `thinking` as given.
   */
  /**
   * OQ-189's ruling (R-071, PD-MONITOR-007): `agent` is the model the summarised agent ran on, which the summariser falls back
   * to where its own pair is held out of quota; `withheld` is no call at all, the report the fallback one with that reason.
   */
  readonly resolve?: (choice: { readonly model: ModelRef; readonly thinking: ThinkingLevel }, agent?: { readonly model: ModelRef; readonly thinking: ThinkingLevel }) => { readonly model: ModelRef; readonly thinking: ThinkingLevel } | { readonly withheld: string };
}

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}… [${s.length - n} characters omitted]` : s;
}

/** Each event as one line of text, cut to 2,000 characters. */
function eventTexts(messages: readonly ChatMessage[]): string[] {
  const parts: string[] = [];
  for (const m of messages) {
    for (const p of m.content) {
      const text = p.kind === 'text' ? `${m.role}: ${p.text}` : p.kind === 'tool-call' ? `tool-call ${p.name}: ${p.args}` : p.kind === 'tool-result' ? `tool-result ${p.name}: ${p.result}` : '';
      if (text) parts.push(cut(text, EVENT_CAP));
    }
  }
  return parts;
}

/**
 * REQ-ORCH-110 as OQ-111 rules it: the transcript the report's pass reads, each event cut to 2,000 characters and the
 * whole held to 12,000 — the marker included — keeping its START (the task as given) and its MOST RECENT part, with the
 * omission marked between them and saying how much was left out.
 *
 * The start is `task`, the ledger row's own, where it is given. The child's first event is its REQ-TOOLS-154 payload,
 * which carries the task LAST: where that event is recognised (a user message ending with the task), what the payload
 * puts ahead of the task is replaced by a marker saying how many characters it held, so the first event reads
 * `user: … [N characters omitted] … <the task>`. Where it is not — a compression replaced the conversation — the task
 * is put ahead of the events as given. Either way the start is ONE event, and since OQ-119's ruling (R-071, `PD-ORCH-007`)
 * the task is exempt from REQ-ORCH-110's 2,000 per event: it is kept whole within the 12,000 total, and only a task that
 * fills the total alone is cut, from its head, with every later event marked omitted. Every other event keeps the 2,000.
 * Until the ruling the start was cut to 2,000 from its head, so a long task lost its closing sections (OQ-119: six of the
 * twelve delegations of the duress run of 2026-09-29 carried tasks longer than 2,000 characters).
 *
 * The reasons it did not, kept beside their replacement: (1) it was cut to 12,000 from its head. For a long child that
 * is the task and its first reads, and the edits come after the cut; in the duress live run of 2026-09-29 the request
 * that summarised child `d` ended `… [63288 characters omitted]` before `d`'s first edit, and five of seven stored
 * reports denied the edits their own `edited_files` listed. (2) Its first repair kept the FIRST EVENT as the start,
 * cut to 2,000 — but the first event is the whole payload, and the task comes last in it. In the next duress run every
 * summarising request's start began `user: Workspace root: …` and ended inside the task, its MUST DO and EXPECTED
 * OUTCOME lost; a payload with a sibling index and inherited reports ahead of the task lost the task entirely (found by
 * the branch's verification).
 */
export function reportTranscript(messages: readonly ChatMessage[], task?: string): string {
  let parts = eventTexts(messages);
  if (task !== undefined) {
    const first = messages[0];
    const opening = first?.role === 'user' ? first.content[0] : undefined;
    const payload = opening?.kind === 'text' && opening.text.endsWith(task) ? opening.text : null;
    const ahead = payload === null ? 0 : payload.length - task.length;
    // OQ-119 as ruled (R-071, PD-ORCH-007): the task is exempt from the per-event cut; the total still bounds it.
    const start = `user: ${ahead > 0 ? `${marker(ahead)} ` : ''}${task}`;
    parts = [start, ...(payload === null ? parts : parts.slice(1))];
  }
  const whole = parts.join('\n');
  if (whole.length <= TRANSCRIPT_CAP || parts.length < 2) return cut(whole, TRANSCRIPT_CAP);
  const head = parts[0]!;
  const rest = parts.slice(1).join('\n');
  // The marker's length depends on the count it states, which is never more than `rest`'s own length: reserve that
  // widest marker, so the whole never passes the cap whatever the count turns out to be.
  const room = TRANSCRIPT_CAP - marker(rest.length).length - 2;
  if (head.length > room) {
    // OQ-119 as ruled: a task longer than the total leaves no room for the most recent part. Its head is kept, cut so that
    // it and its own omission count fit the room (the count is never wider than the head's length), and everything after
    // it is marked omitted.
    return `${cut(head, room - ` [${head.length} characters omitted]`.length - 1)}\n${marker(rest.length)}`;
  }
  const omitted = rest.length - (room - head.length);
  return `${head}\n${marker(omitted)}\n${rest.slice(omitted)}`;
}

/** OQ-111's omission marker: how many characters were left out at the place it stands. */
function marker(n: number): string {
  return `… [${n} characters omitted] …`;
}

/** OQ-217: a bare category message in an end reason, written in the words its issue uses. */
const CATEGORY_WORDS: Readonly<Record<string, string>> = { no_activity: 'ended with no activity after one re-prompt' };

/**
 * The head of the Outcome line: whose outcome it is. The reason it says so, kept beside the repair (fin32, within OQ-217's
 * ruling): the line read "Outcome: failed — Child timed out after 1200s.", and at the duress live run at `a68f121` both
 * timed-out testers' summaries opened "The run failed because the child timed out after 1200s …", which the timeline
 * relayed as "Child wave3-verify-all reported failed: The run failed because …" while the session completed (finding D9).
 */
export const OUTCOME_HEAD = 'Outcome of this agent, not of the session:';

/**
 * OQ-217 (ruled 2026-10-07 under R-072): the Outcome line for a child the runner settled other than `succeeded` — its
 * status, its end reasons as the run recorded them (joined by "; ", a bare category in its issue's words) and, for a child
 * cut off while making progress, PD-ORCH-004's statement; cut to 2,000 characters. Null for a succeeded child: the runner's
 * `succeeded` means only that the turn ended with an answer, and stating it would invite a completion claim over a child
 * whose answer was that it could not do the work.
 */
export function outcomeLine(outcome: Pick<ReportInput, 'status' | 'errors' | 'cutOffStatement'> | undefined): string | null {
  if (!outcome || outcome.status === 'succeeded') return null;
  const reasons = (outcome.errors ?? []).map((e) => CATEGORY_WORDS[e.message] ?? e.message).filter((m) => m.trim() !== '').join('; ');
  let line = `${OUTCOME_HEAD} ${outcome.status}${reasons ? ` — ${reasons}` : ''}`;
  if (outcome.cutOffStatement) line += `${/[.!?]$/.test(line) ? '' : '.'} ${outcome.cutOffStatement}`;
  return cut(line, EVENT_CAP);
}

/**
 * OQ-111: the report's deterministic facts — the files the child edited and the commands it ran with their outcomes —
 * given to the pass beside the transcript, so a summary written over a transcript whose middle is omitted cannot deny
 * work the record shows. They are REQ-ORCH-109's runner-owned kind, derived from the WHOLE transcript by the same
 * functions that fill the report's fields; the pass condenses them and never writes them. Each command is cut to 2,000
 * characters and the block to 12,000, REQ-ORCH-110's two figures, so the pass stays bounded — the build's reading, raised
 * as OQ-120 and confirmed as built by its ruling of 2026-10-06 (R-071), a cut block keeping its head.
 *
 * OQ-217 (ruled 2026-10-07 under R-072): for a child the runner settled other than `succeeded`, the block opens with the
 * Outcome line (`outcomeLine`), at its head so the cut that keeps the head always keeps it; a succeeded child's block is
 * as it was. The reason it was not there, kept beside the repair: until the ruling the pass was given no outcome, and 2 of
 * the 5 timed-out children of the duress runs at c2fdd6a and c2a9444 got summaries that read as success.
 */
export function reportFacts(messages: readonly ChatMessage[], outcome?: Pick<ReportInput, 'status' | 'errors' | 'cutOffStatement' | 'editTier'>): string {
  const { edited, unnamedBy } = writesFrom(messages, [], outcome?.editTier);
  const ran = commandsFrom(messages);
  const head = outcomeLine(outcome);
  // OQ-245: a cross-file call the record holds no observation of is said, so the pass is never told "(none)" over it.
  const unnamed = unnamedChangesSentence(unnamedBy);
  const editedLine = unnamed === ''
    ? `Edited files: ${edited.length > 0 ? edited.join(', ') : '(none)'}`
    : `Edited files: ${edited.length > 0 ? `${edited.join(', ')}; and ` : ''}${unnamed}`;
  const lines = [
    ...(head === null ? [] : [head]),
    editedLine,
    `Commands run: ${ran.length > 0 ? '' : '(none)'}`.trimEnd(),
    ...ran.map((c) => `- ${cut(c.command, EVENT_CAP)} → ${c.exit_code === null ? 'no exit code' : `exit code ${c.exit_code}`}`),
  ];
  return cut(lines.join('\n'), TRANSCRIPT_CAP);
}

/**
 * The two fields the specification's child-report schema names — "edited files (path, ...)" and
 * "commands (command, exit code, ...)" — are FACTS OF THE TRANSCRIPT, and are derived from it here.
 *
 * The reason they were not, kept beside its replacement: `commands` was hardcoded `[]` at all three
 * construction sites and `edited_files` was whatever list the summarising model happened to write. A real
 * run measured the cost — one child wrote five files and ran eight terminal commands and reported both
 * empty, and another filled `edited_files` with a prose sentence it had invented. Asking the model harder
 * was the alternative and is refused: a summariser that FAILS still has to yield a report (REQ-ORCH-110),
 * and it is exactly then that what ran matters most, so the derivation must not depend on it.
 *
 * The bound on it, stated rather than hidden: a context compression REPLACES the conversation
 * (`REQ-MONITOR-084`), so a child whose history was compressed mid-task no longer carries its earliest tool
 * calls here, and the derived lists are of what survives in the transcript the report was built from.
 */

/** `REQ-TOOLS-001`: `haet` resolves to the same tool as `haet_edit`; all three write to a path. */
const WRITE_TOOLS: ReadonlySet<string> = new Set(['write_file', 'haet_edit', 'haet']);

/**
 * Whether `toolName` is one of the product's own file tools that write — `write_file`, `haet_edit`, `haet` — the tools
 * PD-TOOLS-006's write-scope claim fences (`write-scope.ts`), which leaves the terminal and MCP tools outside it.
 * Compared in lower case, as REQ-TOOLS-024 compares a tool's name.
 */
export function isNativeFileWritingTool(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName.toLowerCase());
}

/**
 * The workspace paths a call of `toolName` writes, read from its arguments, or null when the tool writes no file — the
 * one reading the report's edited files, its facts and PD-ORCH-004's changed paths share. A native file tool writes the
 * path its `path` (or `file_path`) argument names; a code-intelligence EDIT-tier tool (REQ-MCP-015) the path its
 * arguments name as the binding manifest defines them (`codeIntelligenceEditPaths`, `@rotaris/config`). Both are
 * matched in lower case, so the readers agree on a call dispatched under another casing. The terminal stays outside, as
 * PD-TOOLS-006 states it.
 *
 * The reason the EDIT tier was not read, kept beside its replacement: until fin32 only the three native tools counted,
 * a reading PD-ORCH-004's first execution stated as open. The duress live run at `a68f121` falsified it: a tester
 * continuation made 11 single-file content replacements of one document that returned `ok`, and its report read "Its
 * file-writing calls changed no workspace paths.", its edited files empty
 * (`docs/defects/fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md`).
 */
export function writtenPathsOf(toolName: string, args: Readonly<Record<string, unknown>> | null, tier?: EditTierNames): readonly string[] | null {
  return writeReadingOf(toolName, args, undefined, tier)?.paths ?? null;
}

/**
 * REQ-MCP-015: the EDIT tier is the code-intelligence server's. A call's runtime name carries that server's prefix only when
 * two servers expose one name, so the name alone cannot tell the product's `replace_content` from a user's own server's tool
 * called the same. The readers are given instead the callables the child's grant gives the code-intelligence server, in
 * lower case (`McpGrantEvidence.granted`, keyed by server); a call whose name is not among them is no EDIT call whatever it
 * is called. `undefined` where no grant is known (a port not yet ready, a test double), when the name alone decides as before.
 *
 * The reason, kept beside it: until fin36 every reader matched the name alone, so with the shipped entry disabled another
 * server's `replace_content` listed whatever its `relative_path` argument held among the child's edited files
 * (docs/defects/fixed/another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md).
 */
export type EditTierNames = ReadonlySet<string> | undefined;
export function editTierNamesOf(grant: AgentGrant | null | undefined): EditTierNames {
  if (grant === null || grant === undefined) return undefined;
  return new Set((grant.mcp.granted[CODE_INTELLIGENCE_SERVER_NAME] ?? []).map((name) => name.toLowerCase()));
}

/**
 * OQ-245 (XE1, ruled 2026-10-13 under R-072): what one call wrote, given what the run host observed it change. A native file
 * tool and an EDIT-tier tool of `argument` scope wrote the path their arguments name. A cross-file EDIT call (a symbol
 * rename, a cross-file replacement) wrote the files observed (`observed`, the result part's `observedPaths`); with no
 * observation — the walk could not be completed, the call was cut off before the after-look, the run crashed, or the
 * conversation predates the ruling — it wrote what its arguments name as a file (a rename's declaring file, never a
 * directory) and possibly more: `unnamed` is set, and the report says the call may have changed files the record cannot name,
 * never that it changed none. Null for a tool that writes no file.
 *
 * The reading it replaces, kept beside it: until the ruling a cross-file call was listed by its argument path alone, so a
 * rename listed one file of thirty and a whole-project replacement none, and a child whose only writes were such calls read
 * "Its file-writing calls changed no workspace paths."
 * (docs/defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md).
 */
export interface WriteReading {
  readonly paths: readonly string[];
  readonly unnamed: boolean;
}
export function writeReadingOf(toolName: string, args: Readonly<Record<string, unknown>> | null, observed: readonly string[] | undefined, tier?: EditTierNames): WriteReading | null {
  if (isNativeFileWritingTool(toolName)) {
    const target = asText(args?.['path']) || asText(args?.['file_path']);
    return { paths: target === '' ? [] : [target], unnamed: false };
  }
  // REQ-MCP-015 (fin36): only the code-intelligence server's tools are of its EDIT tier (`editTierNamesOf`).
  if (tier !== undefined && !tier.has(toolName.toLowerCase())) return null;
  const edit = codeIntelligenceEdit(toolName, args);
  if (edit === null) return null;
  if (edit.reach === null) return { paths: edit.paths, unnamed: false };
  return observed === undefined ? { paths: edit.paths, unnamed: true } : { paths: observed, unnamed: false };
}

/** OQ-245: the statement a report makes for the cross-file calls whose changes the record cannot name, by the names they were called. */
export function unnamedChangesSentence(tools: readonly string[]): string {
  return tools.length === 0 ? '' : `${tools.map((t) => `a ${t} call`).join(' and ')} may have changed files the record cannot name`;
}

/** Whether a call of `toolName` writes a file at a path its arguments name (`writtenPathsOf`). */
export function isFileWritingTool(toolName: string): boolean {
  return writtenPathsOf(toolName, null) !== null;
}
/** `REQ-TOOLS-100`: every terminal observation ends with this block, sorted, with null-valued keys DROPPED. */
const DIAGNOSTIC = '[terminal_diagnostic] ';

function jsonObject(body: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(body);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    // A model writes these arguments, so unparseable is an ordinary outcome here and never an exception.
    return null;
  }
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * The exit code the paired observation reports, or null. `REQ-TOOLS-100` drops a null-valued key, so a call
 * that has no exit code — a background start, a rejected request — simply carries no `exit_code`, which is
 * why the report's field is nullable. The LAST block is the real one: a command whose own output contains the
 * marker (a log, a transcript of another run) must not shadow the one the tool appended.
 */
function exitCodeOf(result: string): number | null {
  const at = result.lastIndexOf(DIAGNOSTIC);
  if (at < 0) return null;
  const code = jsonObject(result.slice(at + DIAGNOSTIC.length))?.['exit_code'];
  return typeof code === 'number' ? code : null;
}

/**
 * REQ-ORCH-108/110: the commands the child ran, in call order — the command from the `terminal` call's own
 * arguments, the exit code from the `[terminal_diagnostic]` block of the result that answered it (matched by
 * `callId`). A terminal action that names no command — `session_action: 'list'`, a bare reset — is not a
 * command and is not reported as one.
 */
export function commandsFrom(messages: readonly ChatMessage[]): readonly { command: string; exit_code: number | null }[] {
  const answered = new Map<string, string>();
  for (const m of messages) if (m.role === 'tool') for (const p of m.content) if (p.kind === 'tool-result') answered.set(p.callId, p.result);
  const out: { command: string; exit_code: number | null }[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const p of m.content) {
      if (p.kind !== 'tool-call' || p.name !== 'terminal') continue;
      const command = asText(jsonObject(p.args)?.['command']);
      if (command.trim() === '') continue;
      const answer = answered.get(p.callId);
      out.push({ command, exit_code: answer === undefined ? null : exitCodeOf(answer) });
    }
  }
  return out;
}

/**
 * REQ-ORCH-108/109: the files the child edited — the path of every file-writing call the record does not answer
 * as refused, as `writtenPathsOf` reads it (either argument name the file tools accept, `path` or `file_path`; for a
 * code-intelligence EDIT-tier call, the argument the binding manifest names — PD-ORCH-004, fin32), in call order and
 * never repeated. The summariser's own list is UNIONED after them rather than replacing or replaced, so a genuine
 * mention it made (a document written through a route with no tool call of its own) is not lost, while an
 * invented one can no longer be the only thing the field holds — and it cannot name a path whose every write
 * the record answered as refused.
 *
 * The reason a write's result is read, kept beside the rule it replaced: the path of every write CALL used to
 * be listed whatever answered it. A write a sibling's claim refused (PD-TOOLS-006), one the permission gate or a
 * pre-tool hook refused, a `haet_edit` whose find text matched nothing — each changed nothing, and each reached
 * `edited_files`, the fallback's "Files touched" and, since OQ-111, the facts the pass is told never to deny
 * (`docs/defects/fixed/a-reports-edited-files-counts-refused-writes.md`). Every such refusal is answered with
 * `isError: true` (the gate's `finish`, the file tools' `errorObservation`).
 *
 * A call cut off is answered with `isError: true` too, and it is NOT one reading. A call a rest cut before it
 * started, or whose approval was withdrawn, never ran and changed nothing: it is not listed. A call that was
 * under way when the pause's tool deadline, the stop's abort or a crash cut it off (`ranBeforeItWasCut`, the
 * `ran` head of `interruptedResult`) may well have written — the turn cuts a dispatch that returned `ok` after
 * the deadline — so it IS listed, with what it had produced kept in the record beside it. *Falsified by the
 * repair's verification and kept beside its correction:* this paragraph first said a call "a rest or a cancel
 * cut off" was not an edit, which dropped a write that had landed.
 *
 * The bounds, stated. A call no result answers — which a conversation the turn built never holds (`run/turn.ts`
 * answers every call of a step) — keeps the call's own reading and is listed. A call cut off while under way
 * whose executor had in fact refused it is listed, since the record cannot tell the two apart, and REQ-ORCH-109
 * forbids concealing a file rather than overstating one. A write executor that raised AFTER its file was
 * written (a failure rendering the diff, say) is answered as an ordinary error and is not listed.
 *
 * Paths are compared by `pathKey` — backslashes as `/`, a doubled slash as one, a `./` segment dropped wherever it
 * stands — so the summariser's list spelled another way than the call (`docs\api.md`, `./docs/api.md`,
 * `docs/./api.md`) neither brings back a refused path nor repeats a listed one; each is listed as its first spelling.
 * Found by the second verification of the repair; the interior `./` by the third. Not compared: an absolute path
 * against a relative one, which would need the workspace root; a `..` segment, which is resolved only against a root
 * too (`docs/../docs/a.md` stays its own spelling); and letter case, which a Windows workspace does not distinguish.
 */
export function editedFilesFrom(messages: readonly ChatMessage[], reported: readonly string[] = [], tier?: EditTierNames): readonly string[] {
  return writesFrom(messages, reported, tier).edited;
}

/**
 * OQ-245: the tools, by the names they were called, whose cross-file calls the record answers as having run but holds no
 * observation of — each may have changed files the record cannot name (`writeReadingOf`). A call answered as refused is not
 * one: it never ran.
 */
export function unnamedChangesFrom(messages: readonly ChatMessage[], tier?: EditTierNames): readonly string[] {
  return writesFrom(messages, [], tier).unnamedBy;
}

/**
 * `editedFilesFrom` and `unnamedChangesFrom` in one pass. OQ-245: a cross-file EDIT call's files are those its result part
 * says the run host observed it change, listed whatever the call returned — a replacement that failed part-way had still
 * written the files before the failure; a call answered as refused and observed to change nothing lists nothing.
 */
function writesFrom(messages: readonly ChatMessage[], reported: readonly string[], tier: EditTierNames): { readonly edited: readonly string[]; readonly unnamedBy: readonly string[] } {
  const erred = new Set<string>();
  const observedOf = new Map<string, readonly string[]>();
  for (const m of messages) {
    if (m.role !== 'tool') continue;
    for (const p of m.content) {
      if (p.kind !== 'tool-result') continue;
      // OQ-245: a call the run host could not observe (`unobserved`) ran, whatever it returned: it is said, never read as refused.
      if (p.isError && !ranBeforeItWasCut(p.result) && p.unobserved !== true) erred.add(p.callId);
      if (p.observedPaths !== undefined) observedOf.set(p.callId, p.observedPaths);
    }
  }
  const out: string[] = [];
  const listed = new Set<string>();
  const refused = new Set<string>();
  const unnamedBy: string[] = [];
  const add = (v: string): void => { const k = pathKey(v); if (k !== '' && !listed.has(k)) { listed.add(k); out.push(v); } };
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const p of m.content) {
      if (p.kind !== 'tool-call') continue;
      const observed = observedOf.get(p.callId);
      const reading = writeReadingOf(p.name, jsonObject(p.args), observed, tier);
      if (reading === null) continue;
      // What was observed is what the call changed, whatever it returned (OQ-245).
      if (observed !== undefined) { for (const path of reading.paths) add(path); continue; }
      if (erred.has(p.callId)) { for (const path of reading.paths) refused.add(pathKey(path)); continue; }
      for (const path of reading.paths) add(path);
      if (reading.unnamed && !unnamedBy.includes(p.name)) unnamedBy.push(p.name);
    }
  }
  for (const r of reported) if (!refused.has(pathKey(r)) || listed.has(pathKey(r))) add(r);
  return { edited: out, unnamedBy };
}

/** `editedFilesFrom`'s comparison key for a path: backslashes as `/`, runs of `/` as one, `./` segments dropped. */
function pathKey(v: string): string {
  return v.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/(?:\.\/)+/g, '/').replace(/^(?:\.\/)+/, '');
}

/**
 * The last line of defence, and it used to give a parent almost nothing: a child that had made ninety-six
 * tool calls and then timed out reported the words `Tools used: …` and an empty findings list, so the
 * parent's only reading was that the work had not happened and its next act was to delegate it again.
 * What the child DID is derivable from the transcript without a model — `editedFilesFrom` and
 * `commandsFrom` below already derive two thirds of it — so the fallback now states why the report is a
 * fallback, what ended the child, and what it touched. Nothing here is fixed by a requirement; the
 * fields it fills are REQ-ORCH-108's, and it fills them from evidence rather than leaving them blank.
 */
export function fallbackReport(input: ReportInput, why: string): ChildReport {
  const { edited, unnamedBy } = writesFrom(input.messages, [], input.editTier);
  const ran = commandsFrom(input.messages);
  const ended = (input.errors ?? []).map((e) => e.message).join('; ');
  const unnamed = unnamedChangesSentence(unnamedBy);
  const derived = [
    ended ? `Ended: ${ended}.` : '',
    `${countNoun(input.toolCallCount, 'tool call')}; tools used: ${input.toolsUsed.join(', ') || '(none)'}.`,
    edited.length > 0 ? `Files touched: ${edited.join(', ')}.` : '',
    // OQ-245: said, never left out, when a cross-file call's changes went unobserved.
    unnamed === '' ? '' : `${unnamed.charAt(0).toUpperCase()}${unnamed.slice(1)}.`,
    ran.length > 0 ? `Commands run: ${ran.length}.` : '',
    `No summary was produced (${why}).`,
  ].filter((s) => s !== '').join(' ');
  const summary = input.lastText ? cut(input.lastText, SUMMARY_CAP) : cut(derived, SUMMARY_CAP);
  const key_findings = input.lastText ? [] : [derived];
  return {
    agent_name: input.agentName, role: input.role, status: input.status, summary, key_findings,
    last_response: input.lastText, final_response: input.finalTextIsFinal ? input.lastText : '',
    edited_files: edited, commands: ran,
    errors: [...(input.errors ?? []), { type: 'summary_failure', message: why }], next_actions: [], tags: [],
  };
}

/** REQ-ORCH-111: the deterministic tester path. */
export function deterministicTesterReport(input: ReportInput): ChildReport | null {
  if (input.role !== 'tester' || input.status !== 'succeeded' || input.messages.length > 8 || input.toolCallCount < 1 || !input.finalTextIsFinal || !input.lastText) return null;
  return {
    agent_name: input.agentName, role: input.role, status: 'succeeded', summary: cut(input.lastText, SUMMARY_CAP), key_findings: [],
    last_response: input.lastText, final_response: input.lastText, edited_files: editedFilesFrom(input.messages, [], input.editTier), commands: commandsFrom(input.messages),
    errors: [...(input.errors ?? [])], next_actions: [], tags: ['verification'],
  };
}

/**
 * The pass's object to a report, the run's fields owned by the run. OQ-217 (ruled 2026-10-07 under R-072): a child the
 * runner settled other than `succeeded` keeps that status whatever `status` key the pass returns — REQ-ORCH-088 records a
 * timed-out child failed and REQ-ORCH-112 maps the status to its terminal state — while a succeeded child's status is still
 * normalised from the pass, so a pass may lower it (`partial`). The reason, kept beside the guard: the status was read from
 * the pass first for every child, so a pass answering `succeeded` over a failed child stored a report its state contradicted.
 */
function shape(raw: unknown, input: ReportInput): ChildReport | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of RUNNER_OWNED) delete o[k];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  if (typeof o['summary'] !== 'string' || o['summary'].trim() === '') return null;
  return {
    agent_name: input.agentName, role: input.role, status: input.status !== 'succeeded' ? input.status : normaliseReportStatus(str(o['status']) || input.status), summary: o['summary'],
    key_findings: list(o['key_findings']), last_response: input.lastText, final_response: input.finalTextIsFinal ? input.lastText : '',
    edited_files: editedFilesFrom(input.messages, list(o['edited_files']), input.editTier), commands: commandsFrom(input.messages),
    errors: [...(input.errors ?? [])], next_actions: list(o['next_actions']),
    tags: list(o['tags']).filter((t) => ['research', 'planning', 'implementation', 'review', 'verification', 'errors'].includes(t)),
  };
}

/**
 * The bounded pass: two attempts, a timeout, a report whatever happens — unless the pass is cut short. `unsummarised`:
 * why no summariser is passed, when one is withheld on purpose (PD-ORCH-005: a run coming to rest). Null is the pass cut
 * short: `signal` aborted it (a cancel, a stop, a quit), or `halted` — PD-ORCH-005 clause 2, the run coming to rest —
 * allowed no second attempt. No model call is made once either holds (found by phase 3's second review).
 */
export async function produceReport(input: ReportInput, s: SummariserDeps | null, signal: AbortSignal, unsummarised = 'no summariser is configured', halted: () => boolean = () => false): Promise<ChildReport | null> {
  const tester = deterministicTesterReport(input);
  if (tester) return tester;
  if (!s) return fallbackReport(input, unsummarised);
  const transcript = reportTranscript(input.messages, input.task);
  const facts = reportFacts(input.messages, input);
  /*
   * OQ-217 (ruled 2026-10-07 under R-072): where the facts open with an Outcome line, the ask says what it is and how the
   * summary states it. A succeeded child's ask is as it was.
   */
  /*
   * fin32 (the a68f121 duress run's D9, a repair inside the ruling): the first sentence is the agent's own outcome, the agent
   * named and the subject, and never the run's or the session's — the summaries had opened "The run failed because the
   * child … timed out", read on the timeline as the session failing while it completed.
   */
  const outcomeAsk = outcomeLine(input) === null ? '' : ` The facts open with an Outcome line: the run's own record of how this agent ended. It is the agent's outcome, not the session's. The first sentence of your summary names the agent (${input.agentName}) and states that outcome and its reason plainly, as what happened to the agent (for a time limit, "This agent was stopped at its time limit while …"); the summary then condenses what the agent did, agreeing with the facts, and what the transcript shows remained, if it shows anything. Never open with "The run failed" or "The session failed", and never word the outcome as the run or the session failing: the session this agent belongs to may continue and succeed. Never describe the task as completed or finished, and never claim work was left undone beyond what the transcript shows.`;
  const timeout = s.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  let complaint = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (signal.aborted || (attempt > 1 && halted())) return null;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = s.timers.after(timeout, () => controller.abort());
    try {
      const ask = `Condense the transcript below into a JSON object with exactly these keys: "summary" (one paragraph), "key_findings" (an array of short strings), "next_actions" (array of strings), "edited_files" (array of paths), "tags" (from: research, planning, implementation, review, verification, errors). Report only what happened; do not continue the task. The facts below are the run's own record of what the agent did, taken from its whole transcript: your summary must agree with them and never deny them.${outcomeAsk} The transcript keeps its start (the task as given) and its most recent part; where its middle is marked omitted, what is not shown there is not evidence that it did not happen.${complaint ? `\n\nYour previous attempt was unusable: ${complaint}` : ''}\n\nFacts:\n${facts}\n\nTranscript:\n${transcript}`;
      const resolved = s.resolve ? s.resolve({ model: s.model, thinking: s.thinking }, input.agentModel) : { model: s.model, thinking: s.thinking };
      if ('withheld' in resolved) return fallbackReport(input, resolved.withheld);
      const choice = resolved;
      const r = await s.backend.runTurn(
        { persona: 'summariser', systemPrompt: 'You summarise a finished agent transcript. Output JSON only.', messages: [{ role: 'user', content: [{ kind: 'text', text: ask }] }], tools: [], model: choice.model, thinking: choice.thinking, timeoutMs: timeout, retries: 0, resolveCredential: s.credentialFor(choice.model) },
        { delta: () => undefined, reasoning: () => undefined, usage: () => undefined },
        controller.signal,
      );
      if (r.status === 'failed') { complaint = r.error.headline; continue; }
      const text = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch (e) { complaint = `not JSON (${String(e instanceof Error ? e.message : e)})`; continue; }
      const shaped = shape(parsed, input);
      if (!shaped) { complaint = 'the object had no usable "summary"'; continue; }
      return shaped;
    } catch (cause) {
      complaint = String(cause instanceof Error ? cause.message : cause);
    } finally {
      timer.cancel();
      signal.removeEventListener('abort', onAbort);
    }
    if (controller.signal.aborted && !signal.aborted) return fallbackReport(input, `the summarising pass exceeded ${timeout / 1000} s`);
  }
  if (signal.aborted) return null;
  return fallbackReport(input, `two attempts produced no usable report (${complaint})`);
}
