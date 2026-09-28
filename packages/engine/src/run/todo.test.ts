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
    expect(t.holdsFor(1)).toBe(true);
    expect(t.holdsFor(2)).toBe(false);
  });

  it('releaseHeld closes every task the iteration holds: complete when done, pending otherwise, with no retry counted', () => {
    const done = Todo.fresh('a', 'first');
    done.appendHeld('Continued Prompts', 'm1', 'one', 1);
    done.appendHeld('Continued Prompts', 'm2', 'two', 1);
    done.appendHeld('Continued Prompts', 'm3', 'other', 2);
    expect(done.releaseHeld(1, true)).toBe(2);
    expect(shape(done).slice(1)).toEqual([['m1', 'complete', undefined, 0], ['m2', 'complete', undefined, 0], ['m3', 'in_progress', 2, 0]]);
    const failed = Todo.fresh('a', 'first');
    failed.appendHeld('Continued Prompts', 'm', 'one', 1);
    expect(failed.releaseHeld(1, false)).toBe(1);
    expect(shape(failed)[1]).toEqual(['m', 'pending', undefined, 0]);
    expect(failed.selectNext()!.id).toBe('a');
  });

  it('releaseStale returns a task held by an iteration that is not the open one to pending', () => {
    const t = Todo.fresh('a', 'first');
    t.appendHeld('Continued Prompts', 'm1', 'one', 1);
    t.appendHeld('Continued Prompts', 'm2', 'two', 2);
    expect(t.releaseStale(2)).toBe(1);
    expect(shape(t).slice(1)).toEqual([['m1', 'pending', undefined, 0], ['m2', 'in_progress', 2, 0]]);
    expect(t.releaseStale(null)).toBe(1);
    expect(shape(t)[2]).toEqual(['m2', 'pending', undefined, 0]);
  });

  it('the binding survives the stored document', () => {
    const t = Todo.fresh('a', 'first');
    t.appendHeld('Continued Prompts', 'm', 'one', 3);
    const back = Todo.fromDocument(JSON.parse(JSON.stringify(t.toDocument())) as ReturnType<Todo['toDocument']>);
    expect(back.holdsFor(3)).toBe(true);
    expect(back.releaseHeld(3, true)).toBe(1);
  });
});
