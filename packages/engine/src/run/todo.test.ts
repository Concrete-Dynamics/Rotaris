import { describe, expect, it } from 'vitest';
import { mintTodoId, taskLine, taskTitle, Todo } from './todo.js';

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

/** The repair of `an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md` (REQ-ORCH-072/073/074/135). */
describe('Todo.settleStranded — an iteration\'s own task its closed iteration left in progress', () => {
  const shape = (t: Todo) => t.toDocument().phases.flatMap((p) => p.tasks.map((x) => [x.id, x.state, x.consecutiveRetries]));
  const stranded = (...ids: string[]) => {
    const t = Todo.fresh(ids[0]!, ids[0]!, 2);
    for (const id of ids.slice(1)) t.appendTask('main', id, id);
    for (const id of ids) t.begin(t.task(id)!);
    return t;
  };

  it('closes each as its iteration\'s outcome says: succeeded complete, partial requeued, failed or abandoned abandoned, cancelled or none pending', () => {
    const outcomes: Record<string, string | null> = { s: 'succeeded', p: 'partial', f: 'failed', a: 'abandoned', c: 'cancelled', n: null };
    const t = stranded('s', 'p', 'f', 'a', 'c', 'n');
    t.settleStranded(null, (id) => outcomes[id]);
    expect(shape(t)).toEqual([['s', 'complete', 0], ['p', 'pending', 1], ['f', 'abandoned', 0], ['a', 'abandoned', 0], ['c', 'pending', 0], ['n', 'pending', 0]]);
  });

  it('a partial close at the retry limit abandons it (REQ-ORCH-077)', () => {
    const t = stranded('p');
    t.task('p')!.consecutiveRetries = 1;
    t.settleStranded(null, () => 'partial');
    expect(shape(t)).toEqual([['p', 'abandoned', 2]]);
  });

  it('leaves the open iteration\'s task, a held message, and a task no closed row is the latest to name', () => {
    const t = stranded('open', 'none');
    t.appendHeld('Continued Prompts', 'm', 'message', 1);
    const asked: string[] = [];
    t.settleStranded('open', (id) => { asked.push(id); return undefined; });
    expect(shape(t)).toEqual([['open', 'in_progress', 0], ['none', 'in_progress', 0], ['m', 'in_progress', 0]]);
    expect(asked).toEqual(['none']);
  });
});

/**
 * REQ-CHAT-040 / REQ-ORCH-071: a queued prompt becomes a task NAMED "Queued Prompt: <first 8 characters of the prompt id>"
 * carrying the prompt text as its CONTENT — so a task has a name beside its content, as REQ-TOOLS-144's agent task does.
 * Acceptance finding A28: docs/defects/fixed/a-queued-prompts-task-is-not-named-queued-prompt.md.
 */
describe('Todo — a task named beside its content (REQ-CHAT-040, REQ-ORCH-071)', () => {
  it('appendTask keeps the name beside the text, and the stored document carries both', () => {
    const t = Todo.fresh('a', 'first');
    t.appendTask('Queued Prompts', 'p1', 'then do this', 'Queued Prompt: 0123abcd');
    expect(t.task('p1')).toMatchObject({ name: 'Queued Prompt: 0123abcd', text: 'then do this', state: 'pending' });
    expect(Todo.fromDocument(t.toDocument()).task('p1')).toMatchObject({ name: 'Queued Prompt: 0123abcd', text: 'then do this' });
    // A task without a name stores none: its text is both what it is called and what it holds.
    expect(Object.hasOwn(t.task('a')!, 'name')).toBe(false);
    // Selection and the run's reading of what to work on read the content.
    t.complete(t.selectNext()!);
    expect(t.pendingTexts()).toEqual(['then do this']);
    expect(t.textOf('p1')).toBe('then do this');
  });

  it('REQ-CHAT-091: a rename of a named task renames it and keeps its content; an unnamed task\'s rename edits its text', () => {
    const t = Todo.fresh('a', 'first');
    t.appendTask('Queued Prompts', 'p1', 'then do this', 'Queued Prompt: 0123abcd');
    expect(t.editTask('update', 'p1', 'Queued Prompt: 0123abcd')).toBe(false);
    expect(t.editTask('update', 'p1', '  my own name ')).toBe(true);
    expect(t.task('p1')).toMatchObject({ name: 'my own name', text: 'then do this' });
    expect(t.editTask('update', 'a', 'renamed')).toBe(true);
    expect(t.task('a')).toMatchObject({ text: 'renamed' });
    expect(Object.hasOwn(t.task('a')!, 'name')).toBe(false);
  });

  it('taskTitle and taskLine: the name where the task has one, the content beside it on a line', () => {
    expect(taskTitle({ text: 'then do this', name: 'Queued Prompt: 0123abcd' })).toBe('Queued Prompt: 0123abcd');
    expect(taskTitle({ text: 'first' })).toBe('first');
    expect(taskLine({ text: 'then do this', name: 'Queued Prompt: 0123abcd' })).toBe('Queued Prompt: 0123abcd: then do this');
    expect(taskLine({ text: 'first' })).toBe('first');
  });
});

/** REQ-CHAT-089: every task id the backend assigns is 8 lowercase hexadecimal characters, unique within the todo. */
describe('mintTodoId — a backend task id (REQ-CHAT-089)', () => {
  it('mints 8 lowercase hexadecimal characters', () => {
    for (let i = 0; i < 50; i += 1) expect(mintTodoId(new Set())).toMatch(/^[0-9a-f]{8}$/);
  });

  it('never repeats an id the todo holds, and never yields a candidate of another form', () => {
    const t = Todo.fresh('0000000a', 'first');
    t.appendTask('Queued Prompts', 'S-1:continued:2', 'an id an earlier build minted, still read back');
    // Its tasks' ids, and its phases' (`main`'s, and the phase the append created).
    const phaseIds = t.toDocument().phases.map((p) => p.id!);
    expect(t.ids()).toEqual(new Set(['0000000a', 'S-1:continued:2', ...phaseIds]));
    const draws = ['0000000a', 'ABCDEF01', 'not-hex!', '0000000b'];
    // An uppercase draw is lowered (REQ-CHAT-089: "The hexadecimal digits MUST be lowercase"); one that is not hex is skipped.
    expect(mintTodoId(t.ids(), () => draws.shift()!)).toBe('abcdef01');
    const more = ['0000000a', 'abcdef01', 'zz', '0000000b'];
    expect(mintTodoId(new Set(['abcdef01', '0000000a']), () => more.shift()!)).toBe('0000000b');
  });
});

/** REQ-CHAT-089: a phase the backend creates carries an id of the same form; one an earlier build created is known by its name. */
describe('Todo — phase ids (REQ-CHAT-089)', () => {
  it('a fresh todo\'s phase and every phase appendTask creates carry 8 lowercase hexadecimal characters, unique within the todo', () => {
    const t = Todo.fresh('0000000a', 'first');
    t.appendTask('Queued Prompts', '0000000b', 'then this', 'Queued Prompt: 12345678');
    t.appendTask('Queued Prompts', '0000000c', 'and this');
    const phases = t.toDocument().phases;
    expect(phases.map((p) => [p.name, p.tasks.length])).toEqual([['main', 1], ['Queued Prompts', 2]]);
    for (const p of phases) expect(p.id).toMatch(/^[0-9a-f]{8}$/);
    expect(t.ids().size).toBe(5);
    // Fixed when created and unchanged thereafter: a document read back keeps them.
    expect(Todo.fromDocument(t.toDocument()).toDocument()).toEqual(t.toDocument());
  });

  it('editTask adds to the phase its id names, and to the phase an earlier build\'s document names by its name', () => {
    const t = Todo.fresh('0000000a', 'first');
    const main = t.toDocument().phases[0]!.id!;
    expect(t.editTask('add', '0000000d', 'by id', main)).toBe(true);
    expect(t.editTask('add', '0000000e', 'nowhere', 'ffffffff')).toBe(false);
    expect(t.toDocument().phases.map((p) => [p.id, p.tasks.map((x) => x.text)])).toEqual([[main, ['first', 'by id']]]);
    const old = Todo.fromDocument({ schema_version: 1, phases: [{ name: 'main', tasks: [{ id: 'S-1:main:1', text: 'old', state: 'pending', consecutiveRetries: 0 }] }] });
    expect(old.editTask('add', '0000000f', 'by name', 'main')).toBe(true);
    expect(old.toDocument()).toEqual({ schema_version: 1, phases: [{ name: 'main', tasks: [{ id: 'S-1:main:1', text: 'old', state: 'pending', consecutiveRetries: 0 }, { id: '0000000f', text: 'by name', state: 'pending', consecutiveRetries: 0 }] }] });
  });
});

/**
 * REQ-CHAT-089 with REQ-LIBRARY-060: an improvement run's plan arrives built (one `improvement_run` phase, a task per approved
 * proposal under the proposal's `imp_…` id, the phase with none); the todo the session creates from it carries backend ids.
 */
describe('Todo.seeded — a plan the backend built for a new session (REQ-CHAT-089)', () => {
  const plan = { schema_version: 1 as const, phases: [{ name: 'improvement_run', tasks: [
    { id: 'imp_1', text: 'Proposal: imp_1 (prompt_update)\nApply improvement imp_1: first', state: 'pending' as const, consecutiveRetries: 0 },
    { id: 'imp_2', text: 'Proposal: imp_2 (persona_memory_update)\nApply improvement imp_2: second', state: 'pending' as const, consecutiveRetries: 0 },
  ] }] };

  it('gives every task and the phase 8 lowercase hexadecimal characters, unique within the todo and apart from the ids it is told are taken', () => {
    const draws = ['0000000a', '0000000a', '0000000b', '0000000c', '0000000d'];
    const t = Todo.seeded(plan, undefined, new Set(['0000000a']), () => draws.shift()!);
    const doc = t.toDocument();
    expect(doc.phases.map((p) => [p.id, p.name, p.tasks.map((x) => x.id)])).toEqual([['0000000b', 'improvement_run', ['0000000c', '0000000d']]]);
    // The proposal stays named in what the task holds (REQ-LIBRARY-061), and nothing else of the task changes.
    expect(doc.phases[0]!.tasks.map((x) => [x.text, x.state, x.consecutiveRetries])).toEqual(plan.phases[0]!.tasks.map((x) => [x.text, 'pending', 0]));
    const random = Todo.seeded(plan).toDocument();
    for (const id of [random.phases[0]!.id, ...random.phases[0]!.tasks.map((x) => x.id)]) expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(Todo.seeded(plan).ids().size).toBe(3);
  });
});
