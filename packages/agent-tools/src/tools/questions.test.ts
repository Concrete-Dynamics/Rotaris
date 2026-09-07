import { describe, expect, it } from 'vitest';
import { millis, type Millis, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { QuestionPrompt } from '@rotaris/contracts';
import {
  askQuestionsTool, PendingQuestions, QUESTIONS_CANCELLED, QUESTIONS_NOT_SHOWN, userAnswersText, validateQuestionSteps,
} from './questions.js';
import type { ToolContext } from './types.js';

/**
 * Part AC — `ask_questions` and its wait registry (REQ-TOOLS-157/158, REQ-CHAT-092..096). What blocks on a person
 * is measured with a controllable clock: a real timer would make the timeout arm either slow or flaky, and
 * REQ-CHAT-093's zero-means-no-limit is a statement about which timer is armed at all.
 */
class TestTimers implements Timers {
  private readonly fires = new Map<number, { at: number; fire: () => void }>();
  private next = 1;
  now = 0;
  after(delay: Millis, fire: () => void): TimerHandle {
    const id = this.next++;
    this.fires.set(id, { at: this.now + delay, fire });
    return { cancel: () => { this.fires.delete(id); } };
  }
  every(interval: Millis, fire: () => void): TimerHandle {
    return this.after(interval, fire);
  }
  get armed(): number {
    return this.fires.size;
  }
  advance(by: number): void {
    this.now += by;
    for (const [id, f] of [...this.fires]) if (f.at <= this.now) { this.fires.delete(id); f.fire(); }
  }
}

const prompt = (over: Partial<QuestionPrompt> = {}): QuestionPrompt => ({
  request_id: 'q1', session_id: 's', conversation_id: 'root', agent_id: 'orchestrator', persona: 'orchestrator',
  steps: [{ id: 'scope', title: 'Which scope?', description: '', options: [{ label: 'One file', description: '' }], allow_freeform: true }],
  ...over,
});

const context = (signal: AbortSignal = new AbortController().signal): ToolContext => ({
  workspaceRoot: 'C:/ws', sessionId: 's', agentName: 'orchestrator', persona: 'orchestrator',
  monotonic: { now: () => millis(0) }, wall: { instant: () => new Date(0) } as never, signal, warn: () => undefined,
});

describe('REQ-CHAT-092 / REQ-TOOLS-157 — validation happens before anything is shown, and names every violation', () => {
  it('accepts a well-formed action and defaults allow_freeform to true', () => {
    const r = validateQuestionSteps([{ id: 'a', title: 'A' }, { id: 'b', title: 'B', options: [{ label: 'x' }], allow_freeform: false }]);
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.steps[0]!.allow_freeform).toBe(true);
    expect(r.steps[1]!.allow_freeform).toBe(false);
  });

  it('reports ALL of them at once, not the first', () => {
    const r = validateQuestionSteps([
      { id: '', title: '' },
      { id: 'dup', title: 'ok', options: Array.from({ length: 9 }, (_, i) => ({ label: `o${i}` })) },
      { id: 'dup', title: 'again', options: [{ label: '' }] },
      { id: 'nothing', title: 'nothing', options: [], allow_freeform: false },
    ]);
    if (r.ok) throw new Error('expected a rejection');
    // An empty id, an empty title, nine options, a repeated id, an empty label, and a step offering nothing.
    expect(r.errors).toHaveLength(6);
    expect(r.errors.join('\n')).toMatch(/at most 8/);
    expect(r.errors.join('\n')).toMatch(/must be unique/);
    expect(r.errors.join('\n')).toMatch(/must offer options or freeform/);
  });

  it('bounds the count at 1 and at 10', () => {
    expect(validateQuestionSteps([]).ok).toBe(false);
    expect(validateQuestionSteps(Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: 't' }))).ok).toBe(true);
    expect(validateQuestionSteps(Array.from({ length: 11 }, (_, i) => ({ id: `s${i}`, title: 't' }))).ok).toBe(false);
  });
});

describe('REQ-CHAT-093/094/096 — the wait registry', () => {
  it('holds one prompt per conversation and refuses a second for the same one', () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    expect(pending.create(prompt(), 300_000)).not.toBeNull();
    expect(pending.create(prompt({ request_id: 'q2' }), 300_000)).toBeNull();
    // Another conversation is unaffected — the guard is per conversation, not global.
    expect(pending.create(prompt({ request_id: 'q3', conversation_id: 'child' }), 300_000)).not.toBeNull();
    expect(pending.size).toBe(2);
  });

  it('REQ-CHAT-093: zero means no limit, so no timer is armed at all', () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    void pending.create(prompt(), 0);
    expect(timers.armed).toBe(0);
    void pending.create(prompt({ request_id: 'q2', conversation_id: 'c2' }), 300_000);
    expect(timers.armed).toBe(1);
  });

  it('times out with the elapsed seconds, and releases the conversation for a later prompt', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    const wait = pending.create(prompt(), 300_000)!;
    timers.advance(300_000);
    expect(await wait).toEqual({ kind: 'timed_out', afterSeconds: 300 });
    expect(pending.size).toBe(0);
    expect(pending.create(prompt({ request_id: 'q2' }), 300_000)).not.toBeNull();
  });

  it('REQ-CHAT-096: a stale prompt id resolves nothing; teardown and the bulk cancel release the rest', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    const one = pending.create(prompt(), 0)!;
    const two = pending.create(prompt({ request_id: 'q2', conversation_id: 'child' }), 0)!;
    expect(pending.resolve('nope', {})).toBe(false);
    expect(pending.cancelConversation('nobody')).toBe(false);
    expect(pending.cancelConversation('root')).toBe(true);
    expect(await one).toEqual({ kind: 'cancelled' });
    expect(pending.cancelAll()).toBe(1);
    expect(await two).toEqual({ kind: 'cancelled' });
    // A second cancel of a released id changes nothing and reports so.
    expect(pending.cancel('q2')).toBe(false);
  });
});

describe('REQ-CHAT-095 — the four outcomes and the `## User Answers` rendering', () => {
  const steps = [
    { id: 'scope', title: 'Which scope?', description: '', options: [{ label: 'One file', description: '' }], allow_freeform: true },
    { id: 'notes', title: 'Notes?', description: '', options: [], allow_freeform: true },
  ];

  it('renders one line per step, "(no answer)" for an empty one, and counts grammatically', () => {
    const text = userAnswersText(steps, { scope: { selected_option: 'One file', freeform_text: null }, notes: { selected_option: null, freeform_text: null } });
    expect(text.split('\n')[0]).toBe('Received answers for 2 steps.');
    expect(text).toContain('## User Answers');
    expect(text).toContain('- **scope**: One file');
    expect(text).toContain('- **notes**: (no answer)');
    // REQ-CHAT-168 at one and at zero.
    expect(userAnswersText([steps[0]!], { scope: { selected_option: 'One file', freeform_text: null } }).split('\n')[0]).toBe('Received answers for 1 step.');
    expect(userAnswersText([], {}).split('\n')[0]).toBe('Received answers for 0 steps.');
    // Whitespace-only freeform is not an answer.
    expect(userAnswersText([steps[1]!], { notes: { selected_option: null, freeform_text: '   ' } })).toContain('- **notes**: (no answer)');
  });

  it('the executor rejects an invalid action, publishes nothing, and never reaches the registry', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    let published = 0;
    const tool = askQuestionsTool({ pending, conversationId: 'root', agentId: 'orchestrator', timeoutMs: 300_000, publish: () => { published += 1; return true; }, newRequestId: () => 'q1' });
    const r = await tool.execute({ steps: [{ id: 'a', title: '' }] }, context());
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/rejected before anything was shown/);
    expect(published).toBe(0);
    expect(pending.size).toBe(0);
  });

  it('REQ-CHAT-094: a prompt that cannot be published is discarded with the fixed sentence', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    const tool = askQuestionsTool({ pending, conversationId: 'root', agentId: 'orchestrator', timeoutMs: 300_000, publish: () => false, newRequestId: () => 'q1' });
    const r = await tool.execute({ steps: [{ id: 'a', title: 'A' }] }, context());
    expect(r.text).toBe(QUESTIONS_NOT_SHOWN);
    expect(r.isError).toBe(false);
    expect(pending.size).toBe(0);
  });

  it('resolves with the answers, and a reentrant second prompt observes cancelled', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    const tool = askQuestionsTool({ pending, conversationId: 'root', agentId: 'orchestrator', timeoutMs: 300_000, publish: () => true, newRequestId: () => 'q1' });
    const first = tool.execute({ steps: [{ id: 'a', title: 'A' }] }, context());
    await Promise.resolve();
    const second = await tool.execute({ steps: [{ id: 'b', title: 'B' }] }, context());
    expect(second.text).toBe(QUESTIONS_CANCELLED);
    expect(pending.resolve('q1', { a: { selected_option: 'yes', freeform_text: null } })).toBe(true);
    const r = await first;
    expect(r.text).toContain('Received answers for 1 step.');
    expect(r.text).toContain('- **a**: yes');
  });

  it('REQ-CHAT-095: a timeout tells the MODEL one sentence and the record the other', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    const tool = askQuestionsTool({ pending, conversationId: 'root', agentId: 'orchestrator', timeoutMs: 300_000, publish: () => true, newRequestId: () => 'q1' });
    const call = tool.execute({ steps: [{ id: 'a', title: 'A' }] }, context());
    await Promise.resolve();
    timers.advance(300_000);
    const r = await call;
    expect(r.text).toBe('User did not respond to the questions in time.');
    expect(r.warnings).toEqual(['User did not respond within 300 seconds.']);
  });

  it('REQ-CHAT-096: an aborted run releases the waiting call at once', async () => {
    const timers = new TestTimers();
    const pending = new PendingQuestions(timers);
    const controller = new AbortController();
    const tool = askQuestionsTool({ pending, conversationId: 'root', agentId: 'orchestrator', timeoutMs: 0, publish: () => true, newRequestId: () => 'q1' });
    const call = tool.execute({ steps: [{ id: 'a', title: 'A' }] }, context(controller.signal));
    await Promise.resolve();
    controller.abort();
    expect((await call).text).toBe(QUESTIONS_CANCELLED);
    expect(pending.size).toBe(0);
  });
});
