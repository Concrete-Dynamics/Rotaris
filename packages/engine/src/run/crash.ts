import { ApprovalPayloadSchema, interruptionPhrase, isTerminalChildState, resumeStateFor, type ApprovalPayload, type ChildState, type Interruption } from '@rotaris/contracts';
import type { SessionId } from '@rotaris/kernel';
import type { ChildRow, IterationRow, StoreDal } from '@rotaris/store';
import type { SessionWriter } from '../session-writer.js';
import { treeOf } from '../children/ledger.js';
import { conversationOf } from './record.js';
import { answerUnanswered, callsRun, interruptedResult } from './interruption.js';

/** The children of a stored iteration: every child descending from its root, as the live ledger would hold them. */
export function iterationAgents(dal: StoreDal, sessionId: SessionId, open: IterationRow): ChildRow[] {
  return treeOf(dal.childrenOfIteration(sessionId, open.iteration), (id) => id === open.root_task_id);
}

/** The agent whose open calls `answerOpenCalls` answers: its task id, and the name its transcript rows carry. */
export interface OpenCallsAgent {
  readonly taskId: string;
  readonly name: string;
}

/**
 * PD-ORCH-005 clauses 3 and 4: an agent left `paused` whose record ends on tool calls with no results — its step raised,
 * the stop's grace gave up on a call its execution never returned from, or the process died — gains their results in
 * one `tool` message. The results of the calls that completed in that step lived only in the step, so they are read back
 * from the agent's settled rows (found by phase 3's fourth review: answering every call as interrupted presented a
 * finished write as undone); each call cut off before its result arrived gains the statement that it was interrupted
 * and not re-run, with whatever output its row had recorded, and that row, still `running`, settles with the same
 * statement (REQ-SESSION-129: no row is left `running`). A resume then sends a conversation
 * whose every call has its result.
 *
 * A call's row is the latest resident `tool` row this agent has for its id: REQ-ORCH-141 dispatches an id once and
 * replays it after, so a row with that id is the call's. Rows carry the agent's name and not its task id, so this
 * assumes two agents that share a name — the root's persona across iterations, same-named children — never share a
 * call id as well; the provider mints the ids. A row released past the resident window is not read, and its call is
 * answered as never started.
 *
 * `cause` is null for a call no rest cut — a root the stop's grace gave up on under the explicit cancel — whose
 * statement names no rest (OQ-96, "A call cut by no rest").
 */
export function answerOpenCalls(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, agent: OpenCallsAgent, iteration: number, cause: Interruption | null): void {
  const rowOf = new Map(dal.residentRows(sessionId).flatMap((r) => (r.kind === 'tool' && r.name === agent.name && r.call_key !== null ? [[r.call_key, r] as const] : [])));
  const answer = answerUnanswered(conversationOf(dal.agentConversation(sessionId, agent.taskId)), cause, (callId) => {
    const row = rowOf.get(callId);
    if (row === undefined) return undefined;
    // Clause 3 and REQ-SESSION-129: a call cut off is recorded as interrupted with whatever output its row had recorded.
    return row.tool_status === 'running' ? { result: interruptedResult(cause, true, row.output ?? ''), isError: true } : { result: row.output ?? '', isError: row.tool_status !== 'ok' };
  });
  if (!answer) return;
  writer.recordAgentMessage(agent.taskId, iteration, 'message', answer);
  for (const part of answer.content) {
    if (part.kind !== 'tool-result') continue;
    const row = rowOf.get(part.callId);
    if (row?.tool_status === 'running') writer.settleRow(row.row_index, row.body, { toolStatus: 'failed', output: part.result });
  }
}

/** What `recordCrash` found and recorded. */
export interface CrashRecord {
  /** The open iteration a dead run left, or null when it left none (or left it at rest, its interruption recorded). */
  readonly iteration: number | null;
  /** The agents it left `paused` with interruption `crash`. */
  readonly paused: number;
  /** The approvals it withdrew. */
  readonly withdrawn: number;
  /** The background terminal sessions it recorded as ended by the crash. */
  readonly terminals: number;
}

/**
 * PD-ORCH-005 clause 3 — "a crash is recorded when the session is next repaired or continued". A run host that died
 * wrote none of what a rest writes, so this writes it, from the store alone, with no run and no process of the dead
 * run to ask:
 *
 * - the iteration it left open (its interruption still NULL, since every rest records one) gains interruption `crash`;
 * - every agent of that iteration not in a terminal state, and not already paused, is left `paused` by the crash, in the
 *   state it resumes into (clause 3);
 * - an agent whose record ends on tool calls with no results — nothing ran to answer them — gains their results
 *   (`answerOpenCalls`): a call whose row settled keeps what it returned, and every other gains the result that it was
 *   interrupted before it completed and was not re-run, its row left `running` settling with the same (clauses 3 and 4);
 * - every approval still listed as pending is withdrawn by the crash, never denied (clause 9);
 * - every background terminal session still recorded as running, and not held by this process, is recorded as ended by
 *   the crash (clause 10: a crash ends them).
 *
 * Idempotent: a second call finds the interruption recorded, nothing pending and nothing running. It must be called
 * before the stale-child settle (REQ-ORCH-053), which would otherwise cancel what the crash leaves unfinished. Loading a
 * session to view it never calls it (clause 8).
 */
export function recordCrash(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, liveTerminals: ReadonlySet<string>, warn: (m: string) => void): CrashRecord {
  let iteration: number | null = null;
  let paused = 0;
  const open = dal.openIterationOf(sessionId);
  if (open && open.interruption === null) {
    iteration = open.iteration;
    writer.recordIterationInterruption(open.iteration, 'crash');
    const agents = iterationAgents(dal, sessionId, open);
    for (const c of agents) {
      if (isTerminalChildState(c.state) || c.state === 'paused') continue;
      const into = resumeStateFor(c.state as ChildState);
      if (into === null) continue;
      const r = writer.restChild(c.task_id, 'crash', into);
      if (r.ok) paused += 1;
      else warn(r.error.code === 'illegal-move' ? r.error.reason : `recording ${c.task_id} paused by a crash failed: ${r.error.code}`);
    }
    // The root's rows carry the persona its iteration was opened with (`Run.turn`'s agent name, which a root resumed as
    // the entry role keeps), a child's its canonical name.
    const unfinished = agents.filter((c) => !isTerminalChildState(c.state)).map((c) => ({ taskId: c.task_id, name: c.canonical_name }));
    for (const agent of [{ taskId: open.root_task_id, name: open.root_persona }, ...unfinished]) answerOpenCalls(dal, writer, sessionId, agent, open.iteration, 'crash');
    countCrashedCalls(dal, writer, sessionId, open, unfinished.map((c) => c.taskId), warn);
    writer.appendTimeline('iteration_paused', 'rotaris', `Iteration ${open.iteration} was left open by ${interruptionPhrase('crash')}; its unfinished agents are paused and resume when the session is continued.`, { iteration: open.iteration, interruption: 'crash', paused_agents: paused });
  }
  const withdrawn = withdrawStoredApprovals(dal, writer, sessionId);
  let terminals = 0;
  for (const t of dal.agentTerminalsOf(sessionId)) {
    if (t.state !== 'running' || liveTerminals.has(t.terminal_id)) continue;
    const r = writer.recordAgentTerminal({ terminal_id: t.terminal_id, task_id: t.task_id, command: t.command, started_at: t.started_at, state: 'crash', exit_code: t.exit_code, output_tail: t.output_tail });
    if (r.ok && r.value) terminals += 1;
  }
  return { iteration, paused, withdrawn, terminals };
}

/**
 * REQ-MONITOR-102 (the repair of `a-roots-calls-before-a-crash-never-reach-the-session-total.md`): the calls a dead run's
 * agents made that no count held — the root's are counted when its turn returns and a child's when its execution rests or
 * settles, and a crash ends both without either — join the session's total, read from each agent's record once its open
 * calls are answered (so a call the crash cut before it started is not one): the root's beyond its iteration's
 * `root_tool_calls`, and each unfinished child's beyond its `tool_calls`. Both counts move with the total in one
 * transaction, so a second recording, and a resumed child's own credit from its record (`IterationChildren.execute`), find
 * nothing more to add. A root whose count is not known — an iteration opened before store v26 — adds nothing, as before.
 * A record a compression replaced holds fewer calls than were made, so what it adds may fall short; it never exceeds.
 */
function countCrashedCalls(dal: StoreDal, writer: SessionWriter, sessionId: SessionId, open: IterationRow, unfinished: readonly string[], warn: (m: string) => void): void {
  const recorded = (taskId: string): number => callsRun(conversationOf(dal.agentConversation(sessionId, taskId)));
  const root = open.root_tool_calls === null ? 0 : Math.max(0, recorded(open.root_task_id) - open.root_tool_calls);
  const r = writer.countToolCalls({ root: { iteration: open.iteration, add: root }, children: unfinished.map((taskId) => ({ taskId, calls: recorded(taskId) })) });
  if (!r.ok) warn(`the calls a crash left uncounted in ${sessionId} were not counted: ${r.error.code}`);
}

/** Clause 9 after a crash: every approval the dead run left listed as pending leaves the list, recorded as withdrawn. */
function withdrawStoredApprovals(dal: StoreDal, writer: SessionWriter, sessionId: SessionId): number {
  const row = dal.getSession(sessionId);
  let pending: ApprovalPayload[] = [];
  try { const v = JSON.parse(row?.pending_approvals ?? '[]') as unknown; pending = Array.isArray(v) ? v.flatMap((x) => { const r = ApprovalPayloadSchema.safeParse(x); return r.success ? [r.data] : []; }) : []; } catch { pending = []; }
  if (pending.length === 0) return 0;
  for (const p of pending) {
    const summary = p.command !== '' ? p.command : p.argument_summary;
    writer.appendTimeline('approval_withdrawn', p.agent_id || p.persona, `The approval for ${p.tool_name}${summary === '' ? '' : ` (${summary})`} was withdrawn by ${interruptionPhrase('crash')}; the call was not run.`, { request_id: p.request_id, tool: p.tool_name, persona: p.persona, interruption: 'crash' });
  }
  writer.save(writer.currentStatus, { pending_approvals: '[]' });
  return pending.length;
}
