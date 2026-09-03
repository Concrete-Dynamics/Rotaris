import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import type { ApprovalOption, PermissionPreset } from '@rotaris/contracts';
import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel, ToolSpec, TurnReport } from '@rotaris/model';
import type { ProjectionOwner } from '../projection-owner.js';
import type { SessionWriter } from '../session-writer.js';

/**
 * The tool loop inside one iteration (REQ-TOOLS-180, REQ-ORCH-146's non-native case): step the model;
 * for every tool call it requested, append a `tool` row `running`, dispatch through the injected
 * `ToolPort`, settle the row with the outcome, append the result to the conversation; step again.
 * The turn ends when a step requests no tool call — the message addressed to the user is then the
 * turn's text. The engine owns the interface; `agent-tools` implements it; the run-host root wires
 * the two, so no engine → agent-tools import exists (ADR-0002's boundaries stay structural).
 *
 * REQ-ORCH-141: a replayed tool-call id is dispatched once; a repeat returns the recorded result.
 * A cancel aborts the in-flight step or tool and the row settles `failed`.
 */
export interface PortToolCall {
  readonly callId: string;
  readonly name: string;
  readonly rawArgs: string;
  readonly persona: string;
  readonly agentId: string;
  readonly agentName: string;
}
export interface PortToolResult {
  readonly text: string;
  readonly isError: boolean;
  readonly status: 'ok' | 'failed' | 'blocked';
  readonly durationMs: number;
  readonly label: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly diff?: string;
  readonly blockedReason?: string;
  /** REQ-HOOKS-074: post_tool feedback for a call that produced no observation — delivered as a following user message. */
  readonly followUp?: string;
}
export interface ModeChange {
  readonly requested: PermissionPreset;
  readonly effective: PermissionPreset;
  readonly downgraded: boolean;
  readonly reason: string;
  readonly previous: PermissionPreset;
}
export interface ToolPort {
  /** The ONE resolution's listing (REQ-TOOLS-010). */
  specs(): readonly ToolSpec[];
  dispatch(call: PortToolCall, signal: AbortSignal): Promise<PortToolResult>;
  /** REQ-MONITOR-012 / REQ-TOOLS-177: every waiting approval released, before the run stops. */
  cancelPending(): number;
  /** REQ-TOOLS-025/073: the next call is decided under the replacement. */
  setMode(mode: string, source: string): ModeChange;
  currentMode(): PermissionPreset;
  /** REQ-MONITOR-254: false when no wait carries this id here. */
  answerApproval(requestId: string, option: ApprovalOption): boolean;
}

export interface TurnDeps {
  readonly writer: SessionWriter;
  readonly owner: ProjectionOwner;
  readonly backend: AgentBackend;
  readonly tools: ToolPort | null;
  readonly clocks: Clocks;
  readonly persona: string;
  readonly agentName: string;
  readonly systemPrompt: string;
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly modelTimeoutMs: number;
  readonly modelRetries: number;
  readonly resolveCredential: () => Promise<string>;
  /** A stand-in bound until the loop supervisor (REQ-ORCH-099..107) is built; recorded in codebase.md. */
  readonly maxStepsPerTurn: number;
  readonly warn: (message: string) => void;
  /** REQ-ORCH-141: the call ids already dispatched in this run. */
  readonly dispatched: Map<string, string>;
}

export interface TurnOutcome {
  readonly report: TurnReport;
  readonly messages: ChatMessage[];
  readonly toolCallCount: number;
}

export async function runTurn(deps: TurnDeps, task: string, history: readonly ChatMessage[], signal: AbortSignal): Promise<TurnOutcome> {
  const { writer, owner, tools, clocks } = deps;
  const messages: ChatMessage[] = [...history, { role: 'user', content: [{ kind: 'text', text: task }] }];
  const specs = tools?.specs() ?? [];
  let toolCallCount = 0;
  let steps = 0;
  let lastReport: TurnReport = { status: 'succeeded', text: '', usage: { input: 0, output: 0 } };
  let usage = { input: 0, output: 0 };
  for (;;) {
    steps += 1;
    if (steps > deps.maxStepsPerTurn) {
      deps.warn(`the turn exceeded ${deps.maxStepsPerTurn} model steps and was ended as partial (the loop supervisor is not built)`);
      return { report: { status: 'partial', text: lastReport.text, usage }, messages, toolCallCount };
    }
    const report = await step(deps, messages, specs, signal);
    lastReport = report;
    usage = { input: usage.input + report.usage.input, output: usage.output + report.usage.output };
    if (report.status === 'failed') return { report: { ...report, usage }, messages, toolCallCount };
    const calls = report.toolCalls ?? [];
    messages.push({ role: 'assistant', content: [...(report.text ? [{ kind: 'text' as const, text: report.text }] : []), ...calls.map((c) => ({ kind: 'tool-call' as const, callId: c.callId, name: c.name, args: c.args }))] });
    if (calls.length === 0 || !tools) {
      if (calls.length > 0) deps.warn(`the model requested ${calls.length} tool call(s) but this run has no tool port; the turn ends`);
      return { report: { ...report, usage }, messages, toolCallCount };
    }
    const results: ChatMessage['content'] = [];
    const followUps: string[] = [];
    for (const c of calls) {
      if (signal.aborted) break;
      toolCallCount += 1;
      const prior = deps.dispatched.get(c.callId);
      if (prior !== undefined) {
        // REQ-ORCH-141: a replayed id is not dispatched again.
        (results as { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean }[]).push({ kind: 'tool-result', callId: c.callId, name: c.name, result: prior, isError: false });
        continue;
      }
      const startedAt = toIsoUtc(clocks.wall.instant());
      const rowResult = writer.appendRow('tool', `${c.name}`, false, { persona: deps.persona, name: deps.agentName, toolName: c.name, toolStatus: 'running', callKey: c.callId, startedAt, input: c.args });
      const rowIndex = rowResult.ok ? rowResult.value.index : null;
      const r = await tools.dispatch({ callId: c.callId, name: c.name, rawArgs: c.args, persona: deps.persona, agentId: deps.agentName, agentName: deps.agentName }, signal);
      deps.dispatched.set(c.callId, r.text);
      if (rowIndex !== null) {
        writer.settleRow(rowIndex, r.label, { toolStatus: r.status, durationMs: r.durationMs, output: r.text, ...(r.blockedReason === undefined ? {} : { blockedReason: r.blockedReason }) });
        // REQ-CHAT-050: the user-only edit-diff row directly beneath the tool row that produced it.
        if (r.diff !== undefined && r.status === 'ok') writer.appendRow('diff', r.diff, true, { persona: deps.persona, name: deps.agentName, callKey: c.callId, diff: r.diff });
      }
      (results as { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean }[]).push({ kind: 'tool-result', callId: c.callId, name: c.name, result: r.text, isError: r.isError });
      if (r.followUp !== undefined && r.followUp !== '') followUps.push(r.followUp);
    }
    if (signal.aborted) return { report: { status: 'succeeded', text: report.text, usage }, messages, toolCallCount };
    messages.push({ role: 'tool', content: results as { kind: 'tool-result'; callId: string; name: string; result: string; isError: boolean }[] });
    // REQ-HOOKS-074: nothing is placed between the assistant's calls and their results; feedback for an errored call follows as a user message.
    if (followUps.length > 0) messages.push({ role: 'user', content: [{ kind: 'text', text: followUps.join('\n') }] });
    owner.flushPending();
  }
}

/** One model step streamed into one `agent` row: first delta appends it unsettled, growth ticks, the end settles it. */
async function step(deps: TurnDeps, messages: readonly ChatMessage[], specs: readonly ToolSpec[], signal: AbortSignal): Promise<TurnReport> {
  const { writer, owner, backend } = deps;
  let index: number | null = null;
  let text = '';
  const sink = {
    delta: (d: string) => {
      text += d;
      if (index === null) {
        const r = writer.appendRow('agent', text, false, { persona: deps.persona, name: deps.agentName });
        if (r.ok) index = r.value.index;
      } else {
        owner.grow(index, text);
      }
    },
    reasoning: () => undefined,
    usage: () => undefined,
  };
  const report = await backend.runTurn({
    persona: deps.persona, systemPrompt: deps.systemPrompt, messages, tools: specs, model: deps.model, thinking: deps.thinking,
    timeoutMs: deps.modelTimeoutMs, retries: deps.modelRetries, resolveCredential: deps.resolveCredential,
  }, sink, signal);
  if (index !== null) writer.settleRow(index, report.text || text);
  return report;
}
