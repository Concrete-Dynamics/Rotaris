import { ApprovalPayloadSchema, interruptionPhrase, isTerminalChildState, resumeStateFor, type ApprovalPayload, type ChildState } from '@rotaris/contracts';
import type { SessionId } from '@rotaris/kernel';
import type { ChildRow, IterationRow, StoreDal } from '@rotaris/store';
import type { SessionWriter } from '../session-writer.js';
import { treeOf } from '../children/ledger.js';
import { conversationOf } from './record.js';
import { answerUnanswered } from './interruption.js';

/** The children of a stored iteration: every child descending from its root, as the live ledger would hold them. */
export function iterationAgents(dal: StoreDal, sessionId: SessionId, open: IterationRow): ChildRow[] {
  return treeOf(dal.childrenOfIteration(sessionId, open.iteration), (id) => id === open.root_task_id);
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
 * - an agent whose record ends on tool calls with no results — nothing ran to answer them — gains the result that each
 *   was interrupted before it completed and was not re-run (clauses 3 and 4);
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
    for (const taskId of [open.root_task_id, ...agents.filter((c) => !isTerminalChildState(c.state)).map((c) => c.task_id)]) {
      const answer = answerUnanswered(conversationOf(dal.agentConversation(sessionId, taskId)), 'crash');
      if (answer) writer.recordAgentMessage(taskId, open.iteration, 'message', answer);
    }
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
