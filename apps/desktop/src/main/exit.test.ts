import { describe, expect, it } from 'vitest';
import type { ProcessReply } from '@rotaris/contracts';
import { FakeClock, millis } from '@rotaris/kernel';
import { CHILD_CLOSE_BOUND_MS, closeThroughGuards, dialogCloseAnswersDeny, endBeforeMain, exitAfterChildWindows, QuitState, RUN_HOST_END_BOUND_MS, shutdownAtQuit, watchChildExit, type ClosableWindow } from './exit.js';

/** A window whose destruction reports `closed` at once, later, or never. */
function win(opts: { parent: boolean; closes?: 'now' | 'never' }, log: string[], name: string): ClosableWindow & { closed: () => void } {
  let listener: (() => void) | null = null;
  let destroyed = false;
  return {
    isDestroyed: () => destroyed,
    getParentWindow: () => (opts.parent ? {} : null),
    once: (_e, l) => { listener = l; },
    destroy: () => { destroyed = true; log.push(`destroy ${name}`); if (opts.closes !== 'never') listener?.(); },
    closed: () => listener?.(),
  };
}

describe('an immediate exit that does not crash on Linux (exit.ts)', () => {
  function harness(windows: ClosableWindow[]) {
    const log: string[] = [];
    const clock = new FakeClock();
    const turns: (() => void)[] = [];
    const deps = { windows: () => windows, exit: (c: number) => log.push(`exit ${c}`), timers: clock, nextTurn: (fn: () => void) => turns.push(fn) };
    const turn = () => { for (const fn of turns.splice(0)) fn(); };
    return { log, clock, deps, turn };
  }

  it('destroys every child window, waits for each to close, and exits on the NEXT turn — never in the same one', () => {
    const log: string[] = [];
    const parent = win({ parent: false }, log, 'main');
    const dialog = win({ parent: true }, log, 'provider');
    const h = harness([parent, dialog]);
    exitAfterChildWindows({ ...h.deps, exit: (c) => log.push(`exit ${c}`) }, 3);
    expect(log).toEqual(['destroy provider']);
    h.turn();
    expect(log).toEqual(['destroy provider', 'exit 3']);
  });

  it('with no child window it still exits on the next turn, and leaves the main window alone', () => {
    const log: string[] = [];
    const h = harness([win({ parent: false }, log, 'main')]);
    exitAfterChildWindows({ ...h.deps, exit: (c) => log.push(`exit ${c}`) }, 0);
    h.turn();
    expect(log).toEqual(['exit 0']);
  });

  it('a child that never reports closed does not hold the process open past the bound, and the exit happens once', () => {
    const log: string[] = [];
    const stuck = win({ parent: true, closes: 'never' }, log, 'stuck');
    const h = harness([stuck]);
    exitAfterChildWindows({ ...h.deps, exit: (c) => log.push(`exit ${c}`) }, 0);
    h.clock.advance(CHILD_CLOSE_BOUND_MS - 1);
    h.turn();
    expect(log).toEqual(['destroy stuck']);
    h.clock.advance(1);
    h.turn();
    stuck.closed();
    h.turn();
    expect(log).toEqual(['destroy stuck', 'exit 0']);
  });
});

describe("a child's shutdown at quit, raced against its own exit (exit.ts)", () => {
  /** A forked child as far as the race sees it: something that reports `exit` once. */
  function child() {
    let listener: ((code: number) => void) | null = null;
    return { once: (_e: 'exit', l: (code: number) => void) => { listener = l; }, exit: (code: number) => listener?.(code) };
  }
  /** A request main can answer, fail, or leave hanging, and how often it was sent. */
  function request() {
    let settle: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null;
    let sent = 0;
    return {
      send: () => { sent += 1; return new Promise<ProcessReply>((resolve, reject) => { settle = { resolve: (v) => resolve(v as ProcessReply), reject }; }); },
      answer: (reply: unknown = { kind: 'ack' }) => settle?.resolve(reply),
      fail: (cause: unknown) => settle?.reject(cause),
      sent: () => sent,
    };
  }
  const flush = () => new Promise<void>((r) => setImmediate(r));

  it('says nothing when the child answers', async () => {
    const c = child(); const r = request(); const said: unknown[] = [];
    const done = shutdownAtQuit(r.send, watchChildExit(c), (cause) => said.push(cause));
    await flush();
    r.answer();
    await done;
    expect(said).toEqual([]);
  });

  it('ends at the exit when the child exits 0 before its answer arrives — the orderly end whose answer was lost', async () => {
    const c = child(); const r = request(); const said: unknown[] = [];
    const done = shutdownAtQuit(r.send, watchChildExit(c), (cause) => said.push(cause));
    await flush();
    c.exit(0);
    await done;
    expect(said).toEqual([]);
    // The request's own bound elapses later; its rejection is observed, and says nothing.
    r.fail(new Error('no reply to shutdown within 30000 ms'));
    await flush();
    expect(said).toEqual([]);
  });

  it('adds nothing when the child exits non-zero first: its exit handler has already written the error', async () => {
    const c = child(); const r = request(); const said: unknown[] = [];
    const done = shutdownAtQuit(r.send, watchChildExit(c), (cause) => said.push(cause));
    await flush();
    c.exit(9);
    await done;
    expect(said).toEqual([]);
  });

  it('says it once when the bound elapses and the child is still running', async () => {
    const c = child(); const r = request(); const said: unknown[] = [];
    const done = shutdownAtQuit(r.send, watchChildExit(c), (cause) => said.push(cause));
    await flush();
    const cause = new Error('no reply to shutdown within 30000 ms');
    r.fail(cause);
    await done;
    expect(said).toEqual([cause]);
    c.exit(0);
    await flush();
    expect(said).toEqual([cause]);
  });

  it('asks nothing and resolves at once when the child was gone before the quit began', async () => {
    const c = child(); const r = request(); const said: unknown[] = [];
    const exit = watchChildExit(c);
    c.exit(9);
    await flush();
    expect(exit.code).toBe(9);
    await shutdownAtQuit(r.send, exit, (cause) => said.push(cause));
    expect(r.sent()).toBe(0);
    expect(said).toEqual([]);
  });

  it('treats a request that throws before it is sent like one that failed, while the child runs', async () => {
    const c = child(); const said: unknown[] = [];
    const cause = new Error('link closed');
    await shutdownAtQuit(() => { throw cause; }, watchChildExit(c), (x) => said.push(x));
    expect(said).toEqual([cause]);
  });

  it('says it once when the child answers its shutdown with a refusal — the shutdown threw, and nothing it held was closed', async () => {
    const c = child(); const r = request(); const said: unknown[] = [];
    const done = shutdownAtQuit(r.send, watchChildExit(c), (cause) => said.push(String(cause)));
    await flush();
    r.answer({ kind: 'refused', code: 'request.failed', headline: 'Error: database is locked' });
    await done;
    expect(said).toEqual(['Error: refused (request.failed): Error: database is locked']);
    // Electron's teardown then reports 0; the refusal has already been said, and the exit adds nothing.
    c.exit(0);
    await flush();
    expect(said).toHaveLength(1);
  });
});

describe('PD-ORCH-005 clause 9: what the application\'s quit closes answers nothing (exit.ts)', () => {
  const windows = (...ws: [number, boolean][]) => ws.map(([wcId, destroyed]) => ({ wcId, destroyed }));

  it('the application stays while a main window neither destroyed nor confirmed closing remains', () => {
    const q = new QuitState();
    expect(q.quitting(windows([1, false]))).toBe(false);
    // One main window of two closes: the other stays.
    q.closeConfirmed(1);
    expect(q.quitting(windows([1, false], [2, false]))).toBe(false);
    expect(q.isClosing(1)).toBe(true);
    expect(q.isClosing(2)).toBe(false);
  });

  it('the application is quitting once every main window\'s close is confirmed or done, or the process exits', () => {
    const q = new QuitState();
    q.closeConfirmed(1);
    expect(q.quitting(windows([1, false]))).toBe(true);
    expect(q.quitting(windows([1, false], [2, true]))).toBe(true);
    const exiting = new QuitState();
    exiting.exiting();
    expect(exiting.quitting(windows([1, false]))).toBe(true);
  });

  it('a dialog closed unanswered answers Deny (REQ-TOOLS-063) unless the quit closed it; an answered one asks nothing more', () => {
    expect(dialogCloseAnswersDeny({ answered: false, quitting: false })).toBe(true);
    expect(dialogCloseAnswersDeny({ answered: false, quitting: true })).toBe(false);
    expect(dialogCloseAnswersDeny({ answered: true, quitting: false })).toBe(false);
  });
});

describe('PD-ORCH-005 clause 9: a quit Electron starts closes the main windows through their guards, all or none (exit.ts)', () => {
  const guard = (name: string, log: string[], allows: boolean, delayMs = 0) => ({
    ask: () => new Promise<boolean>((r) => setTimeout(() => { log.push(`asked ${name}`); r(allows); }, delayMs)),
    confirm: () => { log.push(`confirm ${name}`); },
    close: () => { log.push(`close ${name}`); },
  });

  it('asks every guard, then confirms every close before closing any window, so no dialog closes while a window is undecided (found by phase 7\'s second review)', async () => {
    const log: string[] = [];
    // A's guard answers at once, B's (unsaved settings) later: A must not close before B is confirmed.
    expect(await closeThroughGuards([guard('A', log, true), guard('B', log, true, 20)])).toBe(true);
    expect(log).toEqual(['asked A', 'asked B', 'confirm A', 'confirm B', 'close A', 'close B']);
  });

  it('a guard that refuses closes nothing, and confirms nothing', async () => {
    const log: string[] = [];
    expect(await closeThroughGuards([guard('A', log, true), guard('B', log, false, 5)])).toBe(false);
    expect(log).toEqual(['asked A', 'asked B']);
  });
});

describe('main is gone only after the run host — a session lock ends with the application (REQ-SESSION-047, REQ-SESSION-056, REQ-STARTUP-161)', () => {
  /**
   * A run host as main's end sees it: a process with a pid that probes alive until it exits, which it does by itself
   * `exitsAfterMs` after the wait begins (null: never by itself), or `killedExitMs` after it is ended (null: never).
   */
  function runHost(clock: FakeClock, opts: { exitsAfterMs: number | null; killedExitMs: number | null }) {
    let listener: ((code: number) => void) | null = null;
    let alive = true;
    let kills = 0;
    const exitNow = (code: number) => { if (!alive) return; alive = false; listener?.(code); };
    if (opts.exitsAfterMs !== null) clock.after(millis(opts.exitsAfterMs), () => exitNow(0));
    return {
      once: (_e: 'exit', l: (code: number) => void) => { listener = l; },
      kill: () => { kills += 1; if (opts.killedExitMs !== null) clock.after(millis(opts.killedExitMs), () => exitNow(0)); return true; },
      probe: () => alive,
      kills: () => kills,
    };
  }
  const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise<void>((r) => setImmediate(r)); };
  /** Drive the fake clock in small steps until `done` settles, and say at what instant it did. */
  async function settle(clock: FakeClock, done: Promise<void>, limitMs = 20_000): Promise<number> {
    let settled = false;
    void done.then(() => { settled = true; });
    const start = clock.instant();
    await flush();
    while (!settled && clock.instant() - start < limitMs) { clock.advance(10); await flush(); }
    return clock.instant() - start;
  }

  it('an immediate exit ends the run host at once and resolves when it has exited — the pid is dead before main goes', async () => {
    const clock = new FakeClock(); const said: string[] = [];
    // Measured: without this, a run host left by `app.exit` outlived main by ~1.7 s; ended, it exits at once.
    const host = runHost(clock, { exitsAfterMs: 1_750, killedExitMs: 5 });
    const exit = watchChildExit(host);
    const at = await settle(clock, endBeforeMain(host, exit, clock, { graceMs: 0, boundMs: RUN_HOST_END_BOUND_MS }, () => said.push('still running')));
    expect(host.kills()).toBe(1);
    expect(at).toBeLessThan(1_750);
    // The relaunch this defect was seen in starts only once main is gone: the lock's holder then probes dead, which
    // is the one condition under which REQ-SESSION-047 reaps it and the session opens.
    expect(host.probe()).toBe(false);
    expect(said).toEqual([]);
  });

  it('after an answered shutdown the run host exits by itself: main waits for that exit and ends nothing', async () => {
    const clock = new FakeClock(); const said: string[] = [];
    const host = runHost(clock, { exitsAfterMs: 0, killedExitMs: 5 });
    const exit = watchChildExit(host);
    await settle(clock, endBeforeMain(host, exit, clock, { graceMs: RUN_HOST_END_BOUND_MS, boundMs: RUN_HOST_END_BOUND_MS }, () => said.push('still running')));
    expect(host.kills()).toBe(0);
    expect(host.probe()).toBe(false);
    expect(said).toEqual([]);
  });

  it('a run host still running when the grace elapses — its shutdown unanswered or refused — is ended, and main goes after its exit', async () => {
    const clock = new FakeClock(); const said: string[] = [];
    const host = runHost(clock, { exitsAfterMs: null, killedExitMs: 5 });
    const exit = watchChildExit(host);
    const at = await settle(clock, endBeforeMain(host, exit, clock, { graceMs: RUN_HOST_END_BOUND_MS, boundMs: RUN_HOST_END_BOUND_MS }, () => said.push('still running')));
    expect(host.kills()).toBe(1);
    expect(at).toBeGreaterThanOrEqual(RUN_HOST_END_BOUND_MS);
    expect(at).toBeLessThan(RUN_HOST_END_BOUND_MS * 2);
    expect(host.probe()).toBe(false);
    expect(said).toEqual([]);
  });

  it('a run host that does not exit even when ended is said once, and main is not held open past the bound', async () => {
    const clock = new FakeClock(); const said: string[] = [];
    const host = runHost(clock, { exitsAfterMs: null, killedExitMs: null });
    const exit = watchChildExit(host);
    const at = await settle(clock, endBeforeMain(host, exit, clock, { graceMs: 0, boundMs: RUN_HOST_END_BOUND_MS }, () => said.push('still running')));
    expect(at).toBeGreaterThanOrEqual(RUN_HOST_END_BOUND_MS);
    expect(at).toBeLessThan(RUN_HOST_END_BOUND_MS + 100);
    expect(said).toEqual(['still running']);
  });

  it('a run host already gone is neither ended nor waited on', async () => {
    const clock = new FakeClock(); const said: string[] = [];
    const host = runHost(clock, { exitsAfterMs: 0, killedExitMs: 5 });
    const exit = watchChildExit(host);
    clock.advance(0); await flush();
    expect(exit.code).toBe(0);
    await endBeforeMain(host, exit, clock, { graceMs: 0, boundMs: RUN_HOST_END_BOUND_MS }, () => said.push('still running'));
    expect(host.kills()).toBe(0);
    expect(said).toEqual([]);
  });

  it('a kill that throws is not a failure of its own: the wait says whether the run host is gone', async () => {
    const clock = new FakeClock(); const said: string[] = [];
    const host = runHost(clock, { exitsAfterMs: 3, killedExitMs: null });
    const exit = watchChildExit(host);
    await settle(clock, endBeforeMain({ kill: () => { throw new Error('already gone'); } }, exit, clock, { graceMs: 0, boundMs: RUN_HOST_END_BOUND_MS }, () => said.push('still running')));
    expect(exit.code).toBe(0);
    expect(said).toEqual([]);
  });
});
