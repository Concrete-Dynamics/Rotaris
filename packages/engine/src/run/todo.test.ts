import { describe, expect, it } from 'vitest';
import { Todo } from './todo.js';

/** PD-ORCH-005 clause 17: a continue's message as a task the resumed iteration holds, and how it closes. */
describe('Todo — a task held by an open iteration (PD-ORCH-005 clause 17)', () => {
  const shape = (t: Todo) => t.toDocument().phases.flatMap((p) => p.tasks.map((x) => [x.id, x.state, x.heldBy, x.consecutiveRetries]));

  it('appendHeld appends the task in progress, held by the iteration, so no selection takes it', () => {
    const t = Todo.fresh('a', 'first');
    t.begin(t.selectNext()!);
    t.appendHeld('Continued Prompts', 'm', 'the message', 1);
    expect(shape(t)).toEqual([['a', 'in_progress', undefined, 0], ['m', 'in_progress', 1, 0]]);
    expect(t.selectNext()).toBeUndefined();
  });

  it('releaseHeld closes every task the iteration holds: complete when done, pending otherwise, with no retry counted', () => {
    const done = Todo.fresh('a', 'first');
    done.appendHeld('Continued Prompts', 'm1', 'one', 1);
    done.appendHeld('Continued Prompts', 'm2', 'two', 1);
    done.appendHeld('Continued Prompts', 'm3', 'other', 2);
    done.releaseHeld(1, true);
    expect(shape(done).slice(1)).toEqual([['m1', 'complete', undefined, 0], ['m2', 'complete', undefined, 0], ['m3', 'in_progress', 2, 0]]);
    const failed = Todo.fresh('a', 'first');
    failed.appendHeld('Continued Prompts', 'm', 'one', 1);
    failed.releaseHeld(1, false);
    expect(shape(failed)[1]).toEqual(['m', 'pending', undefined, 0]);
    // "So the next iteration takes it up": the released message is selected before the task ahead of it.
    expect(failed.pendingTexts()).toEqual(['one', 'first']);
    const next = failed.selectNext()!;
    expect(next.id).toBe('m');
    // Taken up once: begun, it is an ordinary task, and a requeue puts it back in its place.
    failed.begin(next);
    failed.requeue(next);
    expect(failed.selectNext()!.id).toBe('a');
  });

  it('releaseStale returns a task held by an iteration that is not the open one to pending', () => {
    const t = Todo.fresh('a', 'first');
    t.appendHeld('Continued Prompts', 'm1', 'one', 1);
    t.appendHeld('Continued Prompts', 'm2', 'two', 2);
    t.releaseStale(2, new Set());
    expect(shape(t).slice(1)).toEqual([['m1', 'pending', undefined, 0], ['m2', 'in_progress', 2, 0]]);
    t.releaseStale(null, new Set());
    expect(shape(t)[2]).toEqual(['m2', 'pending', undefined, 0]);
  });

  it('releaseStale completes a task whose holding iteration the record holds closed succeeded', () => {
    const t = Todo.fresh('a', 'first');
    t.appendHeld('Continued Prompts', 'm1', 'one', 1);
    t.appendHeld('Continued Prompts', 'm2', 'two', 2);
    t.releaseStale(null, new Set([1]));
    expect(shape(t).slice(1)).toEqual([['m1', 'complete', undefined, 0], ['m2', 'pending', undefined, 0]]);
  });

  it('the binding survives the stored document', () => {
    const t = Todo.fresh('a', 'first');
    t.appendHeld('Continued Prompts', 'm', 'one', 3);
    const back = Todo.fromDocument(JSON.parse(JSON.stringify(t.toDocument())) as ReturnType<Todo['toDocument']>);
    back.releaseHeld(3, false);
    const again = Todo.fromDocument(JSON.parse(JSON.stringify(back.toDocument())) as ReturnType<Todo['toDocument']>);
    expect(again.selectNext()!.id).toBe('m');
    // The mark that it is a continue's message outlives its release and the stored document (found by the iteration lane review).
    expect(again.task('m')!.message).toBe(true);
    expect(again.task('a')!.message).toBeUndefined();
  });

  it('releaseStale leaves a message it returns to pending to be taken up next', () => {
    const t = Todo.fresh('a', 'first');
    t.appendHeld('Continued Prompts', 'm', 'one', 1);
    t.releaseStale(null, new Set());
    expect(t.selectNext()!.id).toBe('m');
  });

  it('holdsUnfinished: a task carrying the text is pending, or in progress and held by the open iteration (OQ-102)', () => {
    const t = Todo.fresh('a', 'first');
    expect(t.holdsUnfinished('first', null)).toBe(true);
    expect(t.holdsUnfinished('other', null)).toBe(false);
    t.begin(t.selectNext()!);
    // The open iteration's own task counts; an in-progress task that nothing open holds does not (found by the iteration lane review).
    expect(t.holdsUnfinished('first', { iteration: 1, taskId: 'a' })).toBe(true);
    expect(t.holdsUnfinished('first', null)).toBe(false);
    expect(t.holdsUnfinished('first', { iteration: 1, taskId: 'other' })).toBe(false);
    // A message the open iteration holds counts; one another iteration holds does not.
    t.appendHeld('Continued Prompts', 'm', 'the message', 1);
    expect(t.holdsUnfinished('the message', { iteration: 1, taskId: 'a' })).toBe(true);
    expect(t.holdsUnfinished('the message', { iteration: 2, taskId: 'x' })).toBe(false);
    expect(t.heldIds(1)).toEqual(['m']);
    expect(t.heldIds(2)).toEqual([]);
    t.complete(t.task('a')!);
    expect(t.holdsUnfinished('first', { iteration: 1, taskId: 'a' })).toBe(false);
    t.appendTask('Continued Prompts', 'b', 'second');
    t.abandon(t.task('b')!);
    expect(t.holdsUnfinished('second', null)).toBe(false);
  });
});
