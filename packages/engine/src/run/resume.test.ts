import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@rotaris/model';
import type { AgentTerminalRow } from '@rotaris/store';
import { firstTurn, lastAssistantText, resumedStart, terminalNotice } from './resume.js';

/** PD-ORCH-005 clauses 4 and 10 — how a resumed agent begins, and what it is told of its background sessions. */
const text = (role: 'user' | 'assistant', t: string): ChatMessage => ({ role, content: [{ kind: 'text', text: t }] });
const calls: ChatMessage = { role: 'assistant', content: [{ kind: 'text', text: 'Probing.' }, { kind: 'tool-call', callId: 'c1', name: 'grep', args: '{}' }] };
const results: ChatMessage = { role: 'tool', content: [{ kind: 'tool-result', callId: 'c1', name: 'grep', isError: true, result: 'interrupted' }] };

describe('PD-ORCH-005 clause 4: where a resumed agent carries on from', () => {
  it('its own answer: it had finished and was waiting, so it waits; anything else is answered by a model step', () => {
    expect(resumedStart([text('user', 'go'), text('assistant', 'Delegated; waiting.')])).toMatchObject({ kind: 'resumed', waiting: true });
    expect(resumedStart([text('user', 'go'), calls, results])).toMatchObject({ waiting: false });
    expect(resumedStart([text('user', 'go'), text('assistant', 'done'), text('user', 'and now this')])).toMatchObject({ waiting: false });
    // An assistant message that opened a call is not an answer: a crash left it unanswered, and the record answers it.
    expect(resumedStart([text('user', 'go'), calls])).toMatchObject({ waiting: false });
    expect(resumedStart([])).toMatchObject({ waiting: false });
  });

  it('a waiting agent takes no step: its outcome is its recorded answer; a fresh one starts from its payload', async () => {
    const seen: (string | null)[] = [];
    const turn = async (task: string | null, history: readonly ChatMessage[]) => { seen.push(task); return { report: { status: 'succeeded' as const, text: 'stepped', usage: { input: 0, output: 0 } }, messages: history, toolCallCount: 1 }; };
    const history = [text('user', 'go'), calls, results, text('assistant', 'Delegated; waiting.')];
    expect(await firstTurn(turn, resumedStart(history))).toEqual({ report: { status: 'succeeded', text: 'Delegated; waiting.', usage: { input: 0, output: 0 } }, messages: history, toolCallCount: 0 });
    expect(seen).toEqual([]);
    await firstTurn(turn, resumedStart([...history, text('user', 'more')]));
    await firstTurn(turn, { kind: 'fresh', task: 'TASK' });
    expect(seen).toEqual([null, 'TASK']);
  });

  it('the last assistant text is the last one that said something', () => {
    expect(lastAssistantText([text('assistant', 'first'), calls, results])).toBe('Probing.');
    expect(lastAssistantText([text('assistant', 'first'), { role: 'assistant', content: [{ kind: 'tool-call', callId: 'c', name: 'x', args: '{}' }] }])).toBe('first');
    expect(lastAssistantText([text('user', 'only')])).toBe('');
  });
});

describe('PD-ORCH-005 clause 10: the notice of an agent\'s background sessions', () => {
  const row = (id: string, state: AgentTerminalRow['state'], exit: number | null, tail: string): AgentTerminalRow => ({ session_id: 's', terminal_id: id, task_id: 't', command: `run ${id}`, started_at: 't', state, exit_code: exit, output_tail: tail, updated_at: 't' });

  it('none started, nothing said', () => {
    expect(terminalNotice([])).toBeNull();
  });

  it('each is still running with its id, or ended and by what, with its exit code and its last recorded output', () => {
    const notice = terminalNotice([
      { row: row('ts_a', 'running', null, 'old'), live: { status: 'running', exitCode: null, tail: 'serving on 3000' } },
      { row: row('ts_b', 'stop', -1, 'half'), live: null },
      { row: row('ts_c', 'crash', null, ''), live: null },
      // Left running by a pause, and ended by itself since: the process's state wins over the record's.
      { row: row('ts_d', 'running', null, 'x'), live: { status: 'completed', exitCode: 0, tail: 'built ```ok```' } },
    ])!;
    expect(notice.role).toBe('user');
    const t = notice.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(t.split('\n')[0]).toBe('You were paused and have now resumed. The background terminal sessions you had started:');
    expect(t).toContain('- ts_a (`run ts_a`) is still running; query or kill it by that id. Its last recorded output:\n```\nserving on 3000\n```');
    expect(t).toContain('- ts_b (`run ts_b`) has ended: ended by the stop, exit code -1. Its last recorded output:\n```\nhalf\n```');
    expect(t).toContain('- ts_c (`run ts_c`) has ended: ended by a crash. It recorded no output.');
    expect(t).toContain('- ts_d (`run ts_d`) has ended: it completed, exit code 0. Its last recorded output:\n~~~~\nbuilt ```ok```\n~~~~');
  });
});
