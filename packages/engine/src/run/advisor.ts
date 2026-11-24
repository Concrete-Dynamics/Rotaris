import type { AgentBackend, ChatMessage, ModelRef, ThinkingLevel } from '@rotaris/model';
import { compressorTranscript } from './compression.js';
import type { HelperModel } from './resilience.js';

/**
 * PD-TOOLS-022 — the consult behind the `advisor` tool: one request to the advisor's model, with no tools, over the
 * asking agent's conversation as it stands and the question it wrote (clauses 2 and 3). The same shape as the other model
 * calls that are no agent's turn (compression, the summariser, the two classifiers): `backend.runTurn` with an empty tool
 * list, handed a metered backend by the session so the request is counted on the run at the advisor's rates
 * (REQ-EVENTS-053). Nothing here reads a clock or touches the store.
 */
export interface AdvisorSetup {
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  /** How the transcript and the tool's result name the advisor's model: its `models:` key. */
  readonly label: string;
  /** Clause 6: the consults one agent may make in a run. */
  readonly maxUses: number;
  readonly timeoutMs: number;
}

export interface AdvisorDeps {
  readonly backend: AgentBackend;
  readonly setup: AdvisorSetup;
  readonly credentialFor: (model: ModelRef) => () => Promise<string>;
  /** PD-MONITOR-007: a model held out of quota for the session is not called; absent means as configured. */
  readonly helperModel?: HelperModel | undefined;
  /** The most of the conversation the advisor's model is given, in characters; absent, it is given whole. */
  readonly capChars?: ((model: ModelRef) => number | undefined) | undefined;
}

export interface AdvisorRequest {
  readonly messages: readonly ChatMessage[];
  readonly question: string;
  readonly agent: string;
  readonly persona: string;
}

export type AdvisorOutcome =
  | { readonly ok: true; readonly advice: string; readonly model: string }
  | { readonly ok: false; readonly reason: string };

/** What a session hands every agent's tool port: the advisor as configured, and the one operation. */
export interface AdvisorOps {
  readonly model: ModelRef;
  readonly maxUses: number;
  /** The run's entry model, which an agent whose persona names no model of its own runs on. */
  readonly entryModel: ModelRef;
  consult(request: AdvisorRequest, signal: AbortSignal): Promise<AdvisorOutcome>;
}

export const ADVISOR_SYSTEM_PROMPT = [
  'You are the advisor to an AI agent that is working on a task. You are given the agent\'s conversation so far (the request it was given, its own messages, its tool calls and their results) and a question it asks you.',
  'You run no tools and you will not see what happens next: the agent acts on what you write. Answer the question it asked. Then say what you would do next, concretely: the step, the file or the command, and the check that would settle it.',
  'If the approach is wrong, or the agent is repeating itself, say so plainly and name a different approach. If the agent says the work is done, say what is still unverified.',
  'Base every claim on what the conversation shows. Where it does not show enough to judge, say what the agent should look at, and do not guess.',
  'Be brief: no preamble, no restating of the conversation, at most about 300 words.',
].join(' ');

export function advisorPrompt(request: AdvisorRequest, capChars?: number): string {
  const transcript = compressorTranscript(request.messages, capChars);
  return `The agent ${request.agent} (role: ${request.persona}) asks for advice.\n\n<conversation>\n${transcript === '' ? '(the conversation holds nothing yet)' : transcript}\n</conversation>\n\n<question>\n${request.question}\n</question>`;
}

export async function consultAdvisor(deps: AdvisorDeps, request: AdvisorRequest, signal: AbortSignal): Promise<AdvisorOutcome> {
  const { setup } = deps;
  const helper = deps.helperModel?.({ model: setup.model, thinking: setup.thinking }) ?? { ok: true as const, model: setup.model, thinking: setup.thinking };
  if (!helper.ok) return { ok: false, reason: `the advisor's model ${helper.reason}` };
  const model = helper.model;
  try {
    const report = await deps.backend.runTurn(
      {
        persona: 'advisor', systemPrompt: ADVISOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ kind: 'text', text: advisorPrompt(request, deps.capChars?.(model)) }] }],
        tools: [], model, thinking: helper.thinking, timeoutMs: setup.timeoutMs, retries: 0, resolveCredential: deps.credentialFor(model),
      },
      { delta: () => undefined, reasoning: () => undefined, usage: () => undefined },
      signal,
    );
    if (report.status === 'failed') return { ok: false, reason: report.error.headline };
    const advice = report.text.trim();
    if (advice === '') return { ok: false, reason: 'the advisor\'s model returned no text' };
    return { ok: true, advice, model: helper.key ?? setup.label };
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

export function createAdvisor(deps: AdvisorDeps, entryModel: ModelRef): AdvisorOps {
  return { model: deps.setup.model, maxUses: deps.setup.maxUses, entryModel, consult: (request, signal) => consultAdvisor(deps, request, signal) };
}
