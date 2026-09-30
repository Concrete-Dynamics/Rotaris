import { describe, expect, it } from 'vitest';
import {
  AgentRecordSchema, CHILD_STATES, CHILD_TRANSITIONS, INTERRUPTIONS, isInterruption, isLegalChildMove, isResumeState, isTerminalChildState, PRESENTATION_CHILD_STATES, presentationChildState,
  RESUME_STATES, resumeStateFor, TERMINAL_CHILD_STATES, type ChildState,
} from './children.js';

/**
 * PD-ORCH-005 (narrowing REQ-MONITOR-300): the child machine gains `paused`, the state every unfinished agent is left in
 * when a run comes to rest by a pause, a stop, a quit or a crash, and which it leaves again for the state it resumes into.
 */
describe('PD-ORCH-005: the paused state in the child machine (REQ-MONITOR-300 narrowed)', () => {
  const nonTerminal = CHILD_STATES.filter((s) => !TERMINAL_CHILD_STATES.has(s) && s !== 'paused');

  it('every non-terminal state may come to rest in paused; no terminal state may', () => {
    for (const from of nonTerminal) expect(isLegalChildMove(from, 'paused'), from).toBe(true);
    for (const from of TERMINAL_CHILD_STATES) expect(isLegalChildMove(from, 'paused'), from).toBe(false);
  });

  it('paused is not terminal: it is left for exactly the states an agent resumes into, and settled by either path', () => {
    expect(isTerminalChildState('paused')).toBe(false);
    for (const to of CHILD_STATES) expect(isLegalChildMove('paused', to), to).toBe((RESUME_STATES as readonly ChildState[]).includes(to));
    // "continue without them" ends a paused agent `cancelled`; a reconciliation reaches any terminal state from it.
    expect(isLegalChildMove('paused', 'cancelled', 'cancellation')).toBe(true);
    for (const to of TERMINAL_CHILD_STATES) expect(isLegalChildMove('paused', to, 'reconciliation')).toBe(true);
  });

  it('nothing that was legal before is taken away: every row of REQ-MONITOR-300\'s table only gained paused', () => {
    const before: Readonly<Record<string, readonly ChildState[]>> = {
      waiting_on_dependencies: ['queued', 'blocked'], queued: ['starting', 'waiting_on_model_slot', 'blocked'], waiting_on_model_slot: ['queued', 'blocked'],
      starting: ['running', 'failed'], running: ['summarizing', 'succeeded', 'failed'], summarizing: ['succeeded', 'failed'],
      succeeded: [], failed: [], cancelled: [], blocked: [],
    };
    for (const [from, tos] of Object.entries(before)) {
      const expected = TERMINAL_CHILD_STATES.has(from as ChildState) ? tos : [...tos, 'paused'];
      expect(CHILD_TRANSITIONS[from as ChildState], from).toEqual(expected);
    }
  });

  it('the state an agent resumes into: where it waited, running, summarising — and a claimed-but-not-started agent is queued again', () => {
    expect(resumeStateFor('queued')).toBe('queued');
    expect(resumeStateFor('waiting_on_dependencies')).toBe('waiting_on_dependencies');
    expect(resumeStateFor('waiting_on_model_slot')).toBe('waiting_on_model_slot');
    expect(resumeStateFor('starting')).toBe('queued');
    expect(resumeStateFor('running')).toBe('running');
    expect(resumeStateFor('summarizing')).toBe('summarizing');
    for (const s of TERMINAL_CHILD_STATES) expect(resumeStateFor(s)).toBeNull();
    expect(resumeStateFor('paused')).toBeNull();
    for (const s of nonTerminal) expect(isResumeState(resumeStateFor(s))).toBe(true);
  });

  it('the interruption is one of four — a cancel is not an interruption', () => {
    expect(INTERRUPTIONS).toEqual(['pause', 'stop', 'quit', 'crash']);
    expect(isInterruption('pause')).toBe(true);
    expect(isInterruption('cancel')).toBe(false);
    expect(isInterruption(null)).toBe(false);
  });

  it('PD-ORCH-005 clause 13 (revision 4): a paused agent presents as `paused`, a presentation state of its own; every other unnamed state still takes REQ-MONITOR-046\'s catch-all; the agent record carries its interruption', () => {
    expect(presentationChildState('paused')).toBe('paused');
    expect(PRESENTATION_CHILD_STATES).toEqual(['running', 'waiting', 'queued', 'done', 'failed', 'cancelled', 'paused']);
    expect(presentationChildState('queued')).toBe('queued');
    expect(presentationChildState('starting')).toBe('queued');
    expect(presentationChildState('anything-else')).toBe('queued');
    const base = {
      id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'paused', presentationState: 'paused', parentId: 'bg_00000000', dependencies: [],
      activity: '', model: 'm', depth: 1, background: true, category: '', spawnedAt: 't', completedAt: null, toolCalls: 3, delegationTask: '', reasoning: 'medium',
      contextUsed: 0, contextLimit: 1, compressions: 0, grantedTools: [], calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: false,
      grantedMcp: {}, mcpServers: [], stalledSeconds: null,
    };
    expect(AgentRecordSchema.parse({ ...base, interruption: 'stop' }).interruption).toBe('stop');
    expect(AgentRecordSchema.parse({ ...base, state: 'running', interruption: null }).interruption).toBeNull();
    expect(AgentRecordSchema.safeParse({ ...base, interruption: 'cancel' }).success).toBe(false);
  });
});
