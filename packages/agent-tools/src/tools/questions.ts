import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Millis, TimerHandle, Timers } from '@rotaris/kernel';
import {
  QUESTION_OPTIONS_MAX, QUESTION_STEPS_MAX, stepsPhrase,
  type QuestionAnswer, type QuestionAnswers, type QuestionPrompt, type QuestionStep,
} from '@rotaris/contracts';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * REQ-TOOLS-157/158 and REQ-CHAT-092..096 — `ask_questions`, the one tool that blocks on a **person** rather than on
 * a file, a process or the network. ADR-0016's fifth execution: the name has been in the registry's frozen table
 * since 2026-09-03 with a `userPromptChannel` prerequisite and **no executor**, so every resolution removed it as
 * `executor_absent` before the prerequisite could ever decide anything. This file is that executor, and the
 * prerequisite is now the thing that decides.
 *
 * The wait registry is `PendingApprovals`' sibling and deliberately reads like it (ADR-0019's shape, though ADR-0019
 * itself covers approvals only and says nothing about questions — the approval path is the precedent here, not the
 * record). Two differences are the requirements' own:
 *
 *   - **One pending prompt per CONVERSATION** (REQ-CHAT-094), not one per request id. A second concurrent request for
 *     the same conversation is rejected and its call observes `cancelled`.
 *   - **A prompt that cannot be shown is discarded** and the call observes `cancelled` with REQ-CHAT-094's fixed
 *     sentence, rather than waiting on a surface that will never paint it.
 */
export type QuestionOutcome =
  | { readonly kind: 'resolved'; readonly answers: QuestionAnswers }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'timed_out'; readonly afterSeconds: number };

interface Waiter {
  readonly prompt: QuestionPrompt;
  readonly promise: Promise<QuestionOutcome>;
  settle: (o: QuestionOutcome) => void;
  timer: TimerHandle | null;
}

export class PendingQuestions {
  private readonly waiters = new Map<string, Waiter>();
  /** REQ-CHAT-094's reentrancy guard: conversation id → the request id pending for it. */
  private readonly byConversation = new Map<string, string>();
  constructor(private readonly timers: Timers) {}

  /**
   * REQ-CHAT-093 / REQ-TOOLS-178: `timeoutMs` null or 0 waits without limit. Answers null when the conversation
   * already holds a pending prompt (REQ-CHAT-094) — the caller then observes `cancelled` without disturbing the
   * prompt already in front of the user.
   */
  create(prompt: QuestionPrompt, timeoutMs: number | null): Promise<QuestionOutcome> | null {
    if (prompt.request_id === '') throw new Error('A question request id must not be empty.');
    if (this.waiters.has(prompt.request_id)) return null;
    if (this.byConversation.has(prompt.conversation_id)) return null;
    let settle: (o: QuestionOutcome) => void = () => undefined;
    const promise = new Promise<QuestionOutcome>((resolve) => { settle = resolve; });
    const w: Waiter = { prompt, promise, settle, timer: null };
    if (timeoutMs !== null && timeoutMs > 0) {
      w.timer = this.timers.after(timeoutMs as Millis, () => this.finish(prompt.request_id, { kind: 'timed_out', afterSeconds: timeoutMs / 1000 }));
    }
    this.waiters.set(prompt.request_id, w);
    this.byConversation.set(prompt.conversation_id, prompt.request_id);
    return promise;
  }

  /** REQ-CHAT-096: a stale prompt id resolves nothing. */
  resolve(requestId: string, answers: QuestionAnswers): boolean {
    return this.finish(requestId, { kind: 'resolved', answers });
  }
  cancel(requestId: string): boolean {
    return this.finish(requestId, { kind: 'cancelled' });
  }
  /** REQ-CHAT-096: conversation teardown cancels that conversation's pending prompt. */
  cancelConversation(conversationId: string): boolean {
    const id = this.byConversation.get(conversationId);
    return id === undefined ? false : this.finish(id, { kind: 'cancelled' });
  }
  /** REQ-CHAT-096 / REQ-TOOLS-054: run shutdown, cancellation or host teardown cancels every pending prompt. */
  cancelAll(): number {
    const ids = [...this.waiters.keys()];
    for (const id of ids) this.finish(id, { kind: 'cancelled' });
    return ids.length;
  }
  has(requestId: string): boolean {
    return this.waiters.has(requestId);
  }
  /** What the whole-session update publishes (REQ-CHAT-097), in creation order. */
  pending(): QuestionPrompt[] {
    return [...this.waiters.values()].map((w) => w.prompt);
  }
  get size(): number {
    return this.waiters.size;
  }
  private finish(requestId: string, outcome: QuestionOutcome): boolean {
    const w = this.waiters.get(requestId);
    if (!w) return false;
    this.waiters.delete(requestId);
    if (this.byConversation.get(w.prompt.conversation_id) === requestId) this.byConversation.delete(w.prompt.conversation_id);
    w.timer?.cancel();
    w.settle(outcome);
    return true;
  }
}

// ── The action, and its validation ──────────────────────────────────────────────────────────────────────────

const optionSchema = z.object({ label: z.string(), description: z.string().optional() });
const stepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  options: z.array(optionSchema).optional(),
  allow_freeform: z.boolean().optional(),
});
const askSchema = z.object({ steps: z.array(stepSchema) });
export type AskQuestionsArgs = z.infer<typeof askSchema>;

/**
 * REQ-TOOLS-157 / REQ-CHAT-092: **every** violation is reported, before anything reaches the user. The zod schema
 * above deliberately holds none of these bounds: a schema refusal names the first failure and stops, and the
 * requirement asks for the list.
 */
export function validateQuestionSteps(steps: readonly z.infer<typeof stepSchema>[]): { ok: true; steps: QuestionStep[] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (steps.length < 1) errors.push('An ask_questions action must carry at least 1 step; this one carries none.');
  if (steps.length > QUESTION_STEPS_MAX) errors.push(`An ask_questions action must carry at most ${QUESTION_STEPS_MAX} steps; this one carries ${steps.length}.`);
  const seen = new Set<string>();
  const built: QuestionStep[] = [];
  steps.forEach((s, i) => {
    const where = `Step ${i + 1}`;
    const id = (s.id ?? '').trim();
    if (id === '') errors.push(`${where} has an empty id; every step needs an id unique within the action.`);
    else if (seen.has(id)) errors.push(`${where} repeats the step id '${id}'; step ids must be unique within the action.`);
    else seen.add(id);
    const title = (s.title ?? '').trim();
    if (title === '') errors.push(`${where}${id === '' ? '' : ` ('${id}')`} has an empty title; a step title must not be empty.`);
    const options = s.options ?? [];
    if (options.length > QUESTION_OPTIONS_MAX) errors.push(`${where}${id === '' ? '' : ` ('${id}')`} offers ${options.length} options; at most ${QUESTION_OPTIONS_MAX} are allowed.`);
    options.forEach((o, j) => {
      if ((o.label ?? '').trim() === '') errors.push(`${where}${id === '' ? '' : ` ('${id}')`} option ${j + 1} has an empty label; an option label must not be empty.`);
    });
    const freeform = s.allow_freeform ?? true;
    if (options.length === 0 && !freeform) errors.push(`${where}${id === '' ? '' : ` ('${id}')`} offers no options and disallows freeform; a step must offer options or freeform (or both).`);
    built.push({
      id, title, description: (s.description ?? '').trim(),
      options: options.map((o) => ({ label: o.label ?? '', description: (o.description ?? '').trim() })),
      allow_freeform: freeform,
    });
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, steps: built };
}

/** REQ-CHAT-095: the model-visible `## User Answers` section — one line per step, "(no answer)" where both are empty. */
export function userAnswersText(steps: readonly QuestionStep[], answers: QuestionAnswers): string {
  const lines = steps.map((s) => {
    const a: QuestionAnswer | undefined = answers[s.id];
    const value = a?.selected_option ?? (a?.freeform_text !== null && a?.freeform_text !== undefined && a.freeform_text.trim() !== '' ? a.freeform_text : null);
    return `- **${s.id}**: ${value ?? '(no answer)'}`;
  });
  // REQ-CHAT-168: the count is the count this payload carries — grammatical at zero, one and many.
  return [`Received answers for ${stepsPhrase(Object.keys(answers).length)}.`, '', '## User Answers', ...lines].join('\n');
}

/** REQ-CHAT-095's cancellation text, one sentence, shared by every route into `cancelled`. */
export const QUESTIONS_CANCELLED = 'Questions were cancelled.';
/** REQ-CHAT-094: the prompt could not be published, so it is discarded and the call sees this. */
export const QUESTIONS_NOT_SHOWN = 'Questions could not be shown to the user.';

export interface AskQuestionsDeps {
  readonly pending: PendingQuestions;
  /** REQ-CHAT-096: the conversation this port belongs to; one pending prompt per conversation. */
  readonly conversationId: string;
  readonly agentId: string;
  /**
   * REQ-CHAT-097: the pending state is PUBLISHED to the surface, never discovered by re-reading persisted state on
   * a timer. This is the publication, called once when the prompt becomes pending and once when it clears. It
   * answers false when the prompt could not be put in front of anyone, which is REQ-CHAT-094's discard.
   */
  readonly publish: () => boolean;
  /** REQ-TOOLS-178 / REQ-CONFIG-126: the shared approval budget in milliseconds; 0 or null waits without limit. */
  readonly timeoutMs: number | null;
  readonly newRequestId?: () => string;
}

const DESCRIPTION = [
  'Ask the user a short ordered set of questions and wait for the answers. Use it when a choice is genuinely the',
  "user's to make and guessing would waste work. Carry 1 to 10 steps; each step needs a unique id and a non-empty",
  'title, may carry a description and up to 8 options, and may allow a freeform answer (allow_freeform, default',
  'true). A step must offer options or freeform, or both. The conversation waits up to 300 seconds for a reply.',
].join(' ');

export function askQuestionsTool(deps: AskQuestionsDeps): ToolExecutor<AskQuestionsArgs> {
  const newId = deps.newRequestId ?? (() => randomUUID());
  return {
    name: 'ask_questions',
    description: DESCRIPTION,
    schema: askSchema,
    /**
     * REQ-TOOLS-032's recoverable refusal, with the expected shape named: the run's first use sent
     * `{questions: [...]}` for `{steps: [...]}`, and the gate's generic "do not match its schema" left
     * the model to guess the key. Anything else keeps the gate's detail and gains the bounds, which is
     * the only place a caller that sent the wrong shape will read them.
     */
    validationError: (args, detail) => {
      if (args['questions'] !== undefined && args['steps'] === undefined) {
        return errorObservation(`ask_questions takes \`steps\`, not \`questions\`: [{id, title, ...}]. Example: {"steps": [{"id": "scope", "title": "Which scope?", "options": [{"label": "One file"}]}]}. (${detail})`);
      }
      return errorObservation(`The arguments for 'ask_questions' do not match its schema (${detail}). It takes {steps: [{id, title, description?, options?: [{label, description?}] (at most 8), allow_freeform? (default true)}]} — 1 to 10 steps, each with a unique non-empty id and title; a step must offer options or freeform, or both. Example: {"steps": [{"id": "scope", "title": "Which scope?"}]}.`);
    },
    label: (args) => `ask_questions ${stepsPhrase(args.steps?.length ?? 0)}`,
    async execute(args, ctx) {
      // REQ-CHAT-092 / REQ-TOOLS-157: validated BEFORE anything is shown, every violation named.
      const checked = validateQuestionSteps(args.steps ?? []);
      if (!checked.ok) {
        return errorObservation(['The ask_questions action was rejected before anything was shown to the user:', ...checked.errors.map((e) => `- ${e}`)].join('\n'), { outcomeKind: 'invalid_request', failureKind: 'invalid_request' });
      }
      const prompt: QuestionPrompt = {
        request_id: newId(), session_id: ctx.sessionId, conversation_id: deps.conversationId,
        agent_id: deps.agentId, persona: ctx.persona, steps: checked.steps,
      };
      // REQ-CHAT-094: a second concurrent prompt for this conversation is rejected and observes cancelled.
      const wait = deps.pending.create(prompt, deps.timeoutMs);
      if (!wait) return observation(QUESTIONS_CANCELLED, { outcomeKind: 'cancelled' });
      // REQ-CHAT-096: a run that is torn down while the call waits releases it; the registry's bulk cancel does that,
      // and the abort signal is the same release seen from this side.
      const onAbort = () => { deps.pending.cancel(prompt.request_id); };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      try {
        // REQ-CHAT-094: if the steps cannot be published to the frontend the pending prompt is DISCARDED.
        if (!deps.publish()) {
          deps.pending.cancel(prompt.request_id);
          await wait;
          return observation(QUESTIONS_NOT_SHOWN, { outcomeKind: 'cancelled' });
        }
        const outcome = await wait;
        if (outcome.kind === 'cancelled') return observation(QUESTIONS_CANCELLED, { outcomeKind: 'cancelled' });
        if (outcome.kind === 'timed_out') {
          // REQ-CHAT-095: the OUTCOME reads "User did not respond within <N> seconds."; the MODEL sees the other
          // sentence. `Observation.text` is by construction the model-visible content (tools/types.ts), so the
          // outcome sentence is carried on the record's side of the observation rather than to the model.
          const seconds = Number.isInteger(outcome.afterSeconds) ? String(outcome.afterSeconds) : outcome.afterSeconds.toFixed(1);
          return observation('User did not respond to the questions in time.', {
            outcomeKind: 'timed_out', warnings: [`User did not respond within ${seconds} seconds.`],
          });
        }
        return observation(userAnswersText(checked.steps, outcome.answers), { outcomeKind: 'resolved' });
      } finally {
        ctx.signal.removeEventListener('abort', onAbort);
        // The prompt is no longer pending however it ended; the surface is told on the same channel it was told on.
        deps.publish();
      }
    },
  };
}
