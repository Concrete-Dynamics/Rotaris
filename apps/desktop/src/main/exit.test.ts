import { describe, expect, it } from 'vitest';
import type { ProcessReply } from '@rotaris/contracts';
import { FakeClock } from '@rotaris/kernel';
import { CHILD_CLOSE_BOUND_MS, exitAfterChildWindows, shutdownAtQuit, watchChildExit, type ClosableWindow } from './exit.js';

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
