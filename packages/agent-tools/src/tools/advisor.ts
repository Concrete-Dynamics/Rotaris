import { z } from 'zod';
import { ADVISOR_TOOL_NAME, advisorResultText } from '@rotaris/contracts';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * PD-TOOLS-022 — the `advisor` tool: an agent asks a stronger model a question about the work in front of it. The advisor
 * is given the agent's conversation and the question, makes one request with no tools, and answers in text (clauses 2 and
 * 3). The model call is the engine's, behind this port; agent-tools declares the port and holds the count, and neither
 * package imports the other, as with the artifact and delegation tools.
 */
export type AdvisorAnswer =
  | { readonly ok: true; readonly advice: string; readonly model: string }
  | { readonly ok: false; readonly reason: string };

export interface AdvisorPort {
  /** Clause 6: the consults this agent may make in this run. */
  readonly maxUses: number;
  /** One request to the advisor's model, over this agent's conversation as it stands. Never throws for an ordinary failure. */
  consult(question: string, signal: AbortSignal): Promise<AdvisorAnswer>;
}

/** The count one agent's port keeps: consults answered, and those in flight, which hold a place until they settle. */
export class AdvisorUses {
  private answered = 0;
  private inFlight = 0;
  constructor(readonly max: number) {}
  get used(): number { return this.answered; }
  /** What is left to ask, places held by calls in flight taken off. */
  get left(): number { return Math.max(0, this.max - this.answered - this.inFlight); }
  reserve(): boolean {
    if (this.left === 0) return false;
    this.inFlight += 1;
    return true;
  }
  /** A consult that answered spends its place; one that failed gives it back (clause 6). */
  settle(answered: boolean): number {
    this.inFlight -= 1;
    if (answered) this.answered += 1;
    return this.answered;
  }
}

/** Clause 9: the three moments, in the description the model reads. Fixed text; no configuration key reaches it. */
export const ADVISOR_DESCRIPTION = [
  'Consult the advisor: a stronger model that reads your whole conversation so far, together with your question, and answers with advice. It runs no tools and changes nothing; you stay the one who acts.',
  'Consult it at three moments. (1) Before you commit to an approach on a task that is not trivial, once you have looked around enough to state the approach. (2) When you are stuck: the same error keeps coming back, or your attempts are not converging. (3) Before you declare the task done, once the work is written, to have it checked.',
  'Do not consult it for a short or routine task, and do not ask what a file read or a search would tell you.',
  'Write a specific question: say what you intend or what went wrong, and what you want judged. Weigh the advice against what you have seen yourself; where it contradicts evidence in your conversation, say so in your next question rather than following it blindly.',
  'The number of consults per task is limited, and the result says how many you have used.',
].join(' ');

const schema = z.object({
  question: z.string().min(1).describe('What you want the advisor to judge or answer, in a sentence or a short paragraph.'),
});

export function spentRefusal(max: number): string {
  return `The advisor was not consulted: this agent's consults for this run are spent (${max} of ${max}). Continue on your own judgement.`;
}

export function advisorTool(port: AdvisorPort, uses: AdvisorUses = new AdvisorUses(port.maxUses)): ToolExecutor<z.infer<typeof schema>> {
  return {
    name: ADVISOR_TOOL_NAME,
    description: ADVISOR_DESCRIPTION,
    schema,
    label: (a) => `advisor ${a.question.replace(/\s+/g, ' ').slice(0, 80)}`,
    execute: async (a, ctx) => {
      if (!uses.reserve()) return errorObservation(spentRefusal(uses.max), { failureKind: 'advisor_uses_spent' });
      let answer: AdvisorAnswer;
      try {
        answer = await port.consult(a.question.trim(), ctx.signal);
      } catch (cause) {
        answer = { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
      }
      if (!answer.ok) {
        uses.settle(false);
        return errorObservation(`The advisor did not answer: ${answer.reason}. No consult was spent; continue on your own judgement, or ask again later.`, { failureKind: 'advisor_unanswered' });
      }
      const use = uses.settle(true);
      return observation(advisorResultText({ model: answer.model, use, of: uses.max, advice: answer.advice }));
    },
  };
}
