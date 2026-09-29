import { millis, type Millis, type Timers } from '@rotaris/kernel';
import { normaliseReportStatus, type ReportStatus } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import type { CutOff } from './cut-off.js';

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
}

export interface SummariserDeps {
  readonly backend: AgentBackend;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly timers: Timers;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  readonly timeoutMs?: Millis;
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
 * The transcript as text, each event cut to 2,000 and the whole to 12,000 from its head. The compressor's reader
 * (`run/compression.ts`); the report's pass reads `reportTranscript` below.
 */
export function transcriptText(messages: readonly ChatMessage[]): string {
  return cut(eventTexts(messages).join('\n'), TRANSCRIPT_CAP);
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
 * is put ahead of the events as given. Either way the start is ONE event and is cut to REQ-ORCH-110's 2,000 from its
 * head: a task longer than that keeps its head, and OQ-118 asks whether it may be kept whole.
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
    const start = cut(`user: ${ahead > 0 ? `${marker(ahead)} ` : ''}${task}`, EVENT_CAP);
    parts = [start, ...(payload === null ? parts : parts.slice(1))];
  }
  const whole = parts.join('\n');
  if (whole.length <= TRANSCRIPT_CAP || parts.length < 2) return cut(whole, TRANSCRIPT_CAP);
  const head = parts[0]!;
  const rest = parts.slice(1).join('\n');
  // The marker's length depends on the count it states, which is never more than `rest`'s own length: reserve that
  // widest marker, so the whole never passes the cap whatever the count turns out to be.
  const omitted = rest.length - (TRANSCRIPT_CAP - head.length - marker(rest.length).length - 2);
  return `${head}\n${marker(omitted)}\n${rest.slice(omitted)}`;
}

/** OQ-111's omission marker: how many characters were left out at the place it stands. */
function marker(n: number): string {
  return `… [${n} characters omitted] …`;
}

/**
 * OQ-111: the report's deterministic facts — the files the child edited and the commands it ran with their outcomes —
 * given to the pass beside the transcript, so a summary written over a transcript whose middle is omitted cannot deny
 * work the record shows. They are REQ-ORCH-109's runner-owned kind, derived from the WHOLE transcript by the same
 * functions that fill the report's fields; the pass condenses them and never writes them. Each command is cut to 2,000
 * characters and the block to 12,000, REQ-ORCH-110's two figures, so the pass stays bounded — the build's reading, asked as OQ-119.
 */
export function reportFacts(messages: readonly ChatMessage[]): string {
  const edited = editedFilesFrom(messages);
  const ran = commandsFrom(messages);
  const lines = [
    `Edited files: ${edited.length > 0 ? edited.join(', ') : '(none)'}`,
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
 * Whether a call of `toolName` writes a file at the path its arguments name — the one list the report and PD-ORCH-004's
 * path list share. Compared in lower case, as REQ-TOOLS-024 compares a tool's name, so both readers agree on a call
 * dispatched under another casing.
 */
export function isFileWritingTool(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName.toLowerCase());
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
 * REQ-ORCH-108/109: the files the child edited — the path of every write-tool call, under either argument
 * name the file tools accept (`path`, `file_path`), in call order and never repeated. The summariser's own
 * list is UNIONED after them rather than replacing or replaced, so a genuine mention it made (a document
 * written through a route with no tool call of its own) is not lost, while an invented one can no longer be
 * the only thing the field holds.
 */
export function editedFilesFrom(messages: readonly ChatMessage[], reported: readonly string[] = []): readonly string[] {
  const out: string[] = [];
  const add = (v: string): void => { if (v !== '' && !out.includes(v)) out.push(v); };
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const p of m.content) {
      if (p.kind !== 'tool-call' || !isFileWritingTool(p.name)) continue;
      const a = jsonObject(p.args);
      add(asText(a?.['path']) || asText(a?.['file_path']));
    }
  }
  for (const r of reported) add(r);
  return out;
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
  const edited = editedFilesFrom(input.messages);
  const ran = commandsFrom(input.messages);
  const ended = (input.errors ?? []).map((e) => e.message).join('; ');
  const derived = [
    ended ? `Ended: ${ended}.` : '',
    `${input.toolCallCount} tool call(s); tools used: ${input.toolsUsed.join(', ') || '(none)'}.`,
    edited.length > 0 ? `Files touched: ${edited.join(', ')}.` : '',
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
    last_response: input.lastText, final_response: input.lastText, edited_files: editedFilesFrom(input.messages), commands: commandsFrom(input.messages),
    errors: [...(input.errors ?? [])], next_actions: [], tags: ['verification'],
  };
}

function shape(raw: unknown, input: ReportInput): ChildReport | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of RUNNER_OWNED) delete o[k];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  if (typeof o['summary'] !== 'string' || o['summary'].trim() === '') return null;
  return {
    agent_name: input.agentName, role: input.role, status: normaliseReportStatus(str(o['status']) || input.status), summary: o['summary'],
    key_findings: list(o['key_findings']), last_response: input.lastText, final_response: input.finalTextIsFinal ? input.lastText : '',
    edited_files: editedFilesFrom(input.messages, list(o['edited_files'])), commands: commandsFrom(input.messages),
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
  const facts = reportFacts(input.messages);
  const timeout = s.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  let complaint = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (signal.aborted || (attempt > 1 && halted())) return null;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = s.timers.after(timeout, () => controller.abort());
    try {
      const ask = `Condense the transcript below into a JSON object with exactly these keys: "summary" (one paragraph), "key_findings" (an array of short strings), "next_actions" (array of strings), "edited_files" (array of paths), "tags" (from: research, planning, implementation, review, verification, errors). Report only what happened; do not continue the task. The facts below are the run's own record of what the agent did, taken from its whole transcript: your summary must agree with them and never deny them. The transcript keeps its start (the task as given) and its most recent part; where its middle is marked omitted, what is not shown there is not evidence that it did not happen.${complaint ? `\n\nYour previous attempt was unusable: ${complaint}` : ''}\n\nFacts:\n${facts}\n\nTranscript:\n${transcript}`;
      const r = await s.backend.runTurn(
        { persona: 'summariser', systemPrompt: 'You summarise a finished agent transcript. Output JSON only.', messages: [{ role: 'user', content: [{ kind: 'text', text: ask }] }], tools: [], model: s.model, thinking: s.thinking, timeoutMs: timeout, retries: 0, resolveCredential: s.credentialFor(s.model) },
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
