import { millis, type Millis, type Timers } from '@rotaris/kernel';
import { normaliseReportStatus, type ReportStatus } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';

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
}

export interface SummariserDeps {
  readonly backend: AgentBackend;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly timers: Timers;
  readonly resolveCredential: () => Promise<string>;
  readonly timeoutMs?: Millis;
}

function cut(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}… [${s.length - n} characters omitted]` : s;
}

/** The transcript as text, each event cut to 2,000 and the whole to 12,000. */
export function transcriptText(messages: readonly ChatMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    for (const p of m.content) {
      const text = p.kind === 'text' ? `${m.role}: ${p.text}` : p.kind === 'tool-call' ? `tool-call ${p.name}: ${p.args}` : p.kind === 'tool-result' ? `tool-result ${p.name}: ${p.result}` : '';
      if (text) parts.push(cut(text, EVENT_CAP));
    }
  }
  return cut(parts.join('\n'), TRANSCRIPT_CAP);
}

export function fallbackReport(input: ReportInput, why: string): ChildReport {
  const summary = input.lastText ? cut(input.lastText, SUMMARY_CAP) : `Tools used: ${input.toolsUsed.join(', ') || '(none)'}`;
  return {
    agent_name: input.agentName, role: input.role, status: input.status, summary, key_findings: [],
    last_response: input.lastText, final_response: input.finalTextIsFinal ? input.lastText : '',
    edited_files: [], commands: [], errors: [...(input.errors ?? []), { type: 'summary_failure', message: why }], next_actions: [], tags: [],
  };
}

/** REQ-ORCH-111: the deterministic tester path. */
export function deterministicTesterReport(input: ReportInput): ChildReport | null {
  if (input.role !== 'tester' || input.status !== 'succeeded' || input.messages.length > 8 || input.toolCallCount < 1 || !input.finalTextIsFinal || !input.lastText) return null;
  return {
    agent_name: input.agentName, role: input.role, status: 'succeeded', summary: cut(input.lastText, SUMMARY_CAP), key_findings: [],
    last_response: input.lastText, final_response: input.lastText, edited_files: [], commands: [], errors: [...(input.errors ?? [])], next_actions: [], tags: ['verification'],
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
    edited_files: list(o['edited_files']), commands: [], errors: [...(input.errors ?? [])], next_actions: list(o['next_actions']),
    tags: list(o['tags']).filter((t) => ['research', 'planning', 'implementation', 'review', 'verification', 'errors'].includes(t)),
  };
}

/** The bounded pass: two attempts, a timeout, a report whatever happens. */
export async function produceReport(input: ReportInput, s: SummariserDeps | null, signal: AbortSignal): Promise<ChildReport> {
  const tester = deterministicTesterReport(input);
  if (tester) return tester;
  if (!s) return fallbackReport(input, 'no summariser is configured');
  const transcript = transcriptText(input.messages);
  const timeout = s.timeoutMs ?? SUMMARY_TIMEOUT_MS;
  let complaint = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = s.timers.after(timeout, () => controller.abort());
    try {
      const ask = `Condense the transcript below into a JSON object with exactly these keys: "summary" (one paragraph), "key_findings" (an array of short strings), "next_actions" (array of strings), "edited_files" (array of paths), "tags" (from: research, planning, implementation, review, verification, errors). Report only what happened; do not continue the task.${complaint ? `\n\nYour previous attempt was unusable: ${complaint}` : ''}\n\nTranscript:\n${transcript}`;
      const r = await s.backend.runTurn(
        { persona: 'summariser', systemPrompt: 'You summarise a finished agent transcript. Output JSON only.', messages: [{ role: 'user', content: [{ kind: 'text', text: ask }] }], tools: [], model: s.model, thinking: s.thinking, timeoutMs: timeout, retries: 0, resolveCredential: s.resolveCredential },
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
    if (signal.aborted) return fallbackReport(input, 'the run was cancelled during the summarising pass');
  }
  return fallbackReport(input, `two attempts produced no usable report (${complaint})`);
}
