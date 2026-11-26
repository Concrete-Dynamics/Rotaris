import { describe, expect, it } from 'vitest';
import { runWorkflowScript, type WorkflowCall, type WorkflowHost } from './isolate.js';
import { canonicalJson, journaledHost, WorkflowInterrupted, type JournalEntry } from './journal.js';

const now = () => performance.now();
/** A host that records each call and answers an `agent` call with its prompt, upper-cased, after `delay(seq)` ms. */
function recordingHost(delay: (seq: number) => number = () => 0, fail: (c: WorkflowCall) => Error | null = () => null) {
  const calls: WorkflowCall[] = [];
  const host: WorkflowHost = {
    call: (c) => new Promise((resolve, reject) => {
      calls.push(c);
      setTimeout(() => {
        const e = fail(c);
        if (e) reject(e); else resolve(c.kind === 'agent' ? String((c.payload as { prompt: string }).prompt).toUpperCase() : null);
      }, delay(c.seq));
    }),
  };
  return { host, calls };
}

describe('the workflow isolate (PD-ORCH-019 clause 5)', () => {
  it('runs a script as an async body and returns what it returned', async () => {
    const { host } = recordingHost();
    expect(await runWorkflowScript('return { sum: 1 + 2, list: [1, "a"] };', host, { now })).toEqual({ ok: true, value: { sum: 3, list: [1, 'a'] }, calls: 0 });
    expect(await runWorkflowScript('const x = 1;', host, { now })).toEqual({ ok: true, value: null, calls: 0 });
  });

  it('numbers calls in the order the script makes them, whatever order the host answers in, and runs them side by side', async () => {
    const { host, calls } = recordingHost((seq) => 30 - seq * 10);
    const r = await runWorkflowScript(`
      await phase('Search');
      const found = await parallel([() => agent('one'), () => agent('two', { persona: 'tester' })]);
      const last = await agent('after ' + found.join('+'));
      return { found, last };`, host, { now });
    expect(r).toEqual({ ok: true, value: { found: ['ONE', 'TWO'], last: 'AFTER ONE+TWO' }, calls: 4 });
    expect(calls.map((c) => [c.seq, c.kind, c.payload])).toEqual([
      [0, 'phase', { title: 'Search' }],
      [1, 'agent', { prompt: 'one' }],
      [2, 'agent', { prompt: 'two', persona: 'tester' }],
      [3, 'agent', { prompt: 'after ONE+TWO' }],
    ]);
  });

  it('pipeline runs each item through the stages in turn, the items side by side', async () => {
    const { host, calls } = recordingHost();
    const r = await runWorkflowScript(`return await pipeline(['a', 'b'], (item) => agent('review ' + item), (review, item, index) => agent('verify ' + index + ' ' + review));`, host, { now });
    expect(r).toMatchObject({ ok: true, value: ['VERIFY 0 REVIEW A', 'VERIFY 1 REVIEW B'] });
    expect(calls.slice(0, 2).map((c) => (c.payload as { prompt: string }).prompt)).toEqual(['review a', 'review b']);
  });

  it('a call the host rejects reaches the script as an Error it can catch, and an uncaught one ends the script with its message', async () => {
    const { host } = recordingHost(() => 0, (c) => (c.kind === 'tool' ? new Error('write_file was denied') : null));
    expect(await runWorkflowScript(`try { await tool('write_file', { path: 'a' }); return 'no'; } catch (e) { return e.message; }`, host, { now })).toMatchObject({ ok: true, value: 'write_file was denied' });
    const r = await runWorkflowScript(`await tool('write_file', { path: 'a' });`, host, { now });
    expect(r).toMatchObject({ ok: false, reason: 'script_error' });
    expect((r as { error: string }).error).toContain('write_file was denied');
  });

  it('a script holds no ambient authority: no process, require, fetch, timer, clock or randomness, and no way back to the host function', async () => {
    const { host } = recordingHost();
    const r = await runWorkflowScript(`return [typeof process, typeof require, typeof fetch, typeof setTimeout, typeof console, typeof Date, typeof Math.random, typeof __host, typeof globalThis.__host, String(Function('return typeof process')())];`, host, { now });
    expect(r).toMatchObject({ ok: true, value: Array(10).fill('undefined') });
  });

  it('names the line of a syntax error and of a thrown error', async () => {
    const { host } = recordingHost();
    const syntax = await runWorkflowScript('const x = ;', host, { now });
    expect(syntax).toMatchObject({ ok: false, reason: 'script_error' });
    expect((syntax as { error: string }).error).toMatch(/SyntaxError: .*workflow\.js:2/);
    const thrown = await runWorkflowScript(`\nthrow new Error('agent two failed');`, host, { now });
    expect((thrown as { error: string }).error).toMatch(/Error: agent two failed \(.*workflow\.js:3/);
  });

  it('a script that loops is cut at its processor slice, before and after an await', async () => {
    const { host } = recordingHost();
    expect(await runWorkflowScript('for (;;) {}', host, { now, sliceMs: 50 })).toMatchObject({ ok: false, reason: 'cpu_limit' });
    expect(await runWorkflowScript(`await agent('x'); for (;;) {}`, host, { now, sliceMs: 50 })).toMatchObject({ ok: false, reason: 'cpu_limit', calls: 1 });
  });

  it('a script that allocates without end is stopped inside its memory bound', async () => {
    const { host } = recordingHost();
    const before = process.memoryUsage().rss;
    const r = await runWorkflowScript(`const a = []; for (;;) a.push(new Array(100000).fill(1));`, host, { now, memoryBytes: 32 * 1024 * 1024, sliceMs: 20_000 });
    expect(r).toMatchObject({ ok: false, reason: 'memory_limit' });
    expect(process.memoryUsage().rss - before).toBeLessThan(200 * 1024 * 1024);
  });

  it('a stop ends a script that waits on a call, and a call answered after the stop touches nothing', async () => {
    const stop = new AbortController();
    let answer: (value: string) => void = () => undefined;
    // The stop lands once the script's call has reached the host, whatever the machine's load.
    const host: WorkflowHost = { call: () => new Promise((resolve) => { answer = resolve; queueMicrotask(() => stop.abort()); }) };
    const running = runWorkflowScript(`await agent('slow'); return 'finished';`, host, { now, signal: stop.signal });
    expect(await running).toEqual({ ok: false, error: 'the workflow was stopped', reason: 'stopped', calls: 1 });
    answer('too late');
    await new Promise((r) => setTimeout(r, 5));
  });
});

describe('the workflow journal (PD-ORCH-019 clause 8)', () => {
  const sinkOf = (entries: JournalEntry[]) => ({ append: (e: JournalEntry) => { entries.push(e); }, truncate: (seq: number) => { for (let i = entries.length - 1; i >= 0; i -= 1) if (entries[i]!.seq >= seq) entries.splice(i, 1); } });
  const SCRIPT = `
    const found = await parallel([() => agent('one'), () => agent('two')]);
    const fixed = await agent('fix ' + found.join('+'));
    return fixed;`;

  it('a script started again over its journal receives the recorded results and repeats no work', async () => {
    const journal: JournalEntry[] = [];
    const first = recordingHost();
    expect(await runWorkflowScript(SCRIPT, journaledHost(first.host, [], sinkOf(journal)), { now })).toMatchObject({ ok: true, value: 'FIX ONE+TWO' });
    expect(journal.map((e) => e.seq).sort()).toEqual([0, 1, 2]);
    const second = recordingHost();
    const replay = journaledHost(second.host, journal, sinkOf(journal));
    expect(await runWorkflowScript(SCRIPT, replay, { now })).toMatchObject({ ok: true, value: 'FIX ONE+TWO' });
    expect(second.calls).toEqual([]);
    expect(replay.replayed()).toBe(3);
  });

  it('a workflow cut off continues from the first call with no recorded result', async () => {
    const journal: JournalEntry[] = [];
    // The third call is cut off by a rest: nothing is recorded for it.
    const first = recordingHost(() => 0, (c) => (c.seq === 2 ? new WorkflowInterrupted('the run came to rest') : null));
    expect(await runWorkflowScript(SCRIPT, journaledHost(first.host, [], sinkOf(journal)), { now })).toMatchObject({ ok: false });
    expect(journal.map((e) => e.seq).sort()).toEqual([0, 1]);
    const second = recordingHost();
    expect(await runWorkflowScript(SCRIPT, journaledHost(second.host, journal, sinkOf(journal)), { now })).toMatchObject({ ok: true, value: 'FIX ONE+TWO' });
    expect(second.calls.map((c) => c.seq)).toEqual([2]);
    expect(journal).toHaveLength(3);
  });

  it('a recorded failure is replayed as the failure it was', async () => {
    const journal: JournalEntry[] = [];
    const first = recordingHost(() => 0, (c) => (c.seq === 0 ? new Error('Max total children 20 exceeded') : null));
    const script = `try { await agent('one'); } catch (e) { return 'caught ' + e.message; }`;
    expect(await runWorkflowScript(script, journaledHost(first.host, [], sinkOf(journal)), { now })).toMatchObject({ value: 'caught Max total children 20 exceeded' });
    const second = recordingHost();
    expect(await runWorkflowScript(script, journaledHost(second.host, journal, sinkOf(journal)), { now })).toMatchObject({ value: 'caught Max total children 20 exceeded' });
    expect(second.calls).toEqual([]);
  });

  it('a script that no longer makes the recorded call replays up to it and drops the rest', async () => {
    const journal: JournalEntry[] = [];
    await runWorkflowScript(SCRIPT, journaledHost(recordingHost().host, [], sinkOf(journal)), { now });
    const second = recordingHost();
    const changed = SCRIPT.replace("agent('two')", "agent('TWO, differently')");
    expect(await runWorkflowScript(changed, journaledHost(second.host, journal, sinkOf(journal)), { now })).toMatchObject({ ok: true });
    expect(second.calls.map((c) => c.seq)).toEqual([1, 2]);
    expect(journal.map((e) => e.seq).sort()).toEqual([0, 1, 2]);
    expect(journal.find((e) => e.seq === 1)!.payload).toBe(canonicalJson({ prompt: 'TWO, differently' }));
  });

  it('canonical JSON ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }));
  });
});
