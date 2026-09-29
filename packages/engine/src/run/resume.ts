import { interruptionPhrase } from '@rotaris/contracts';
import type { ChatMessage } from '@rotaris/model';
import type { SessionId } from '@rotaris/kernel';
import type { AgentTerminalRow, StoreDal } from '@rotaris/store';
import type { TurnOutcome } from './turn.js';

/**
 * PD-ORCH-005 clause 4 — how an agent's execution begins: a fresh agent from its payload, or a resumed one from its
 * recorded conversation, carrying on from its last message.
 *
 * A resumed agent whose last message is its own answer — no call left open, nothing new said to it — had finished its
 * turn and was waiting on children of its own (the spike's fourth finding): it resumes into waiting, not into a model
 * step, since a step after its own final answer would ask the model to go on from nothing. Anything else — a tool
 * result, a user message, a notice or a new message delivered at the resume — is answered by a model step.
 */
export type TurnStart =
  | { readonly kind: 'fresh'; readonly task: string }
  | { readonly kind: 'resumed'; readonly history: readonly ChatMessage[]; readonly waiting: boolean };

export function resumedStart(history: readonly ChatMessage[]): TurnStart {
  const last = history[history.length - 1];
  const answered = last !== undefined && last.role === 'assistant' && !last.content.some((p) => p.kind === 'tool-call');
  return { kind: 'resumed', history, waiting: answered };
}

/** The text of the last assistant message that said something; '' when none did. */
export function lastAssistantText(messages: readonly ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== 'assistant') continue;
    const text = m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    if (text.trim() !== '') return text;
  }
  return '';
}

/**
 * The first turn of an execution. A resumed agent that was waiting takes no model step: its outcome is its recorded
 * answer, and the caller goes on waiting for its children.
 */
export function firstTurn(turn: (task: string | null, history: readonly ChatMessage[]) => Promise<TurnOutcome>, start: TurnStart): Promise<TurnOutcome> {
  if (start.kind === 'fresh') return turn(start.task, []);
  if (start.waiting) return Promise.resolve({ report: { status: 'succeeded', text: lastAssistantText(start.history), usage: { input: 0, output: 0 } }, messages: start.history, toolCallCount: 0 });
  return turn(null, start.history);
}

/** What `resumeNoticeOf` reads of the sessions this process still holds. */
export interface HeldTerminals {
  list(): readonly { readonly id: string; readonly status: string; readonly exitCode: number | null; readonly tail: string }[];
}

/**
 * PD-ORCH-005 clause 10: the notice the agent `taskId` is given when it resumes, of the background sessions it had
 * started — each as the store recorded it, or as this process still holding it reports it now. Null when it had started none.
 */
export function resumeNoticeOf(dal: StoreDal, sessionId: SessionId, taskId: string, held: HeldTerminals | undefined): ChatMessage | null {
  const rows = dal.agentTerminalsOf(sessionId).filter((t) => t.task_id === taskId);
  const live = new Map((held?.list() ?? []).map((t) => [t.id, t]));
  return terminalNotice(rows.map((row) => { const l = live.get(row.terminal_id); return { row, live: l ? { status: l.status, exitCode: l.exitCode, tail: l.tail } : null }; }));
}

/** One background session as a resumed agent is told of it: the record, with the state its process now reports. */
export interface NoticeTerminal {
  readonly row: AgentTerminalRow;
  /** The live state where this process still holds the session, which may have ended since the rest was recorded. */
  readonly live: { readonly status: string; readonly exitCode: number | null; readonly tail: string } | null;
}

/**
 * PD-ORCH-005 clause 10: "When an agent resumes, it is told, for each background session it had started, whether it is
 * still running (with its id) or ended and by what, with its last recorded output." One user message, delivered as the
 * resumed agent's next message; null when it had started none.
 */
export function terminalNotice(terminals: readonly NoticeTerminal[]): ChatMessage | null {
  if (terminals.length === 0) return null;
  const lines = terminals.map(({ row, live }) => {
    const state = live?.status ?? row.state;
    const exit = live ? live.exitCode : row.exit_code;
    const tail = (live?.tail ?? row.output_tail).trim();
    const head = state === 'running'
      ? `- ${row.terminal_id} (\`${row.command}\`) is still running; query or kill it by that id.`
      : `- ${row.terminal_id} (\`${row.command}\`) has ended: ${endedBy(state)}${exit === null ? '' : `, exit code ${exit}`}.`;
    return tail === '' ? `${head} It recorded no output.` : `${head} Its last recorded output:\n${fenced(tail)}`;
  });
  return { role: 'user', content: [{ kind: 'text', text: `You were paused and have now resumed. The background terminal sessions you had started:\n${lines.join('\n')}` }] };
}

function endedBy(state: string): string {
  switch (state) {
    case 'stop': case 'quit': case 'crash': return `ended by ${interruptionPhrase(state)}`;
    case 'completed': return 'it completed';
    case 'failed': return 'it failed';
    case 'killed': return 'it was killed';
    case 'timeout': return 'it reached its timeout';
    default: return state;
  }
}

function fenced(text: string): string {
  const fence = text.includes('```') ? '~~~~' : '```';
  return `${fence}\n${text}\n${fence}`;
}
