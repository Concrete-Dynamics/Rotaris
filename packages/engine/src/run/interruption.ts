import { interruptionPhrase, type Interruption } from '@rotaris/contracts';
import type { ChatMessage } from '@rotaris/model';

/**
 * PD-ORCH-005 clauses 3, 4 and 9 — what an interrupted tool call leaves in its agent's conversation.
 *
 * A call the run's rest cut short is recorded as interrupted, "with whatever output it had produced" (clause 3), and a
 * resumed agent is "given ... a result stating that it was interrupted before it completed and was not re-run, so the
 * agent decides whether to issue it again" (clause 4). The result IS that statement, written into the record when the
 * call is cut, so the resumed agent reads exactly what was recorded and nothing is synthesised at resume — except after a
 * crash, when nothing ran to write it and the continue that records the crash writes it instead (`answerUnanswered`).
 *
 * `ran` separates a call that was under way (its executor started and was cut off, or finished past the deadline) from
 * one that never started: a call the pausing step asked for but had not dispatched, or one whose approval or question
 * was withdrawn (clause 9).
 */
export function interruptedResult(cause: Interruption | null, ran: boolean, output: string): string {
  const by = interruptionPhrase(cause ?? '');
  const head = ran
    ? `This call was interrupted by ${by} before it completed, and it was not re-run.`
    : `This call was not run: it was interrupted by ${by} before it started, and it was not re-run.`;
  const tail = 'Issue it again if it is still needed.';
  const produced = output.trim() === '' ? '' : `\n${ran ? 'What it had produced before it was cut off' : 'Detail'}:\n${output}`;
  return `${head} ${tail}${produced}`;
}

/**
 * PD-ORCH-005 clause 3, for a crash: a record whose last message is an assistant message with tool calls and no results
 * — the shape a process death leaves, since nothing ran to answer them — gains one `tool` message answering every such
 * call as interrupted and never run. Anything else is returned as it stands. Pure; the caller records what it returns.
 */
export function answerUnanswered(messages: readonly ChatMessage[], cause: Interruption): ChatMessage | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  const calls = last.content.flatMap((p) => (p.kind === 'tool-call' ? [p] : []));
  if (calls.length === 0) return null;
  // Whether each call had started is not known after a crash; "before it completed" is true either way.
  return { role: 'tool', content: calls.map((c) => ({ kind: 'tool-result' as const, callId: c.callId, name: c.name, isError: true, result: interruptedResult(cause, true, '') })) };
}
