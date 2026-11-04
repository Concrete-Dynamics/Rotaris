import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { FakeClock, millis } from '@rotaris/kernel';
import { ProcessLink, type MessagePortLike } from '@rotaris/shell';
import { boundedReady, ChildLossReporter, childLossNotice, RUN_HOST_READY_BOUND_MS, runHostGoneRefusal, WORKSPACE_SERVICE_READY_BOUND_MS, workspaceServiceGoneRefusal } from './child-supervision.js';
import { ChildrenEndedByMain, endBeforeMain, QuitState, RUN_HOST_END_BOUND_MS, watchChildExit } from './exit.js';
import type { ReportInput } from './notices.js';

/**
 * A fake `utilityProcess`: its port answers `hello` (or stays silent), `kill()` ends it with Electron's 0 for main's kill,
 * and `crash(code)` ends it on its own with any status — 0, 70 (the last-resort handler), a signal's number.
 */
function fakeChild(opts: { answers: boolean; pid?: number }) {
  const events = new EventEmitter();
  const toChild = new Set<(m: unknown) => void>();
  const toMain = new Set<(m: unknown) => void>();
  let alive = true;
  const end = (code: number): void => { if (!alive) return; alive = false; events.emit('exit', code); };
  toChild.add((m) => {
    const e = m as { id: number; request: { kind: string } };
    if (opts.answers && e.request.kind === 'hello') for (const f of toMain) f({ v: CONTRACT_SCHEMA_VERSION, id: e.id, reply: { kind: 'hello', process: 'run-host', pid: opts.pid ?? 4242 } });
  });
  const port: MessagePortLike = {
    postMessage: (m) => { if (alive) for (const f of toChild) f(m); },
    onMessage: (f) => { toMain.add(f); return () => toMain.delete(f); },
  };
  const child = {
    pid: opts.pid ?? 4242,
    once: (event: 'exit', l: (code: number) => void) => { events.once(event, l); return child; },
    on: (event: 'exit', l: (code: number) => void) => { events.on(event, l); return child; },
    kill: () => { end(0); return true; },
    crash: (code: number) => { end(code); },
  };
  return { child, port };
}

/** Main's wiring of one child, as `index.ts` writes it: the link, the exit watch, the reporter and the link's end on exit. */
function supervised(kind: 'run-host' | 'workspace-service', opts: { answers: boolean }) {
  const clock = new FakeClock();
  const quit = new QuitState();
  const endedByMain = new ChildrenEndedByMain();
  const lines: [string, string | undefined][] = [];
  const notices: ReportInput[] = [];
  const reporter = new ChildLossReporter({ endedByMain: (n) => endedByMain.ended(n), quitting: () => quit.ending(), log: (m, level) => lines.push([m, level]) });
  const { child, port } = fakeChild(opts);
  const name = kind === 'run-host' ? 'rotaris-run-host' : 'rotaris-workspace:C:\\work\\alpha';
  const who = kind === 'run-host' ? { process: 'run-host' as const } : { process: 'workspace-service' as const, workspace: 'C:\\work\\alpha' };
  const link = new ProcessLink(port, clock, { boundary: 'run host', warn: () => {} });
  const exit = watchChildExit(child);
  const endable = endedByMain.endable(name, child);
  child.on('exit', (code) => {
    const how = reporter.exited(name, who, { code, pid: 4242 }, kind === 'run-host' || !reporter.didNotStart(name));
    link.end(kind === 'run-host' ? runHostGoneRefusal(how ?? 'stopped') : workspaceServiceGoneRefusal('C:\\work\\alpha'));
  });
  const bound = kind === 'run-host' ? RUN_HOST_READY_BOUND_MS : WORKSPACE_SERVICE_READY_BOUND_MS;
  const ready = () => boundedReady(() => link.request({ kind: 'hello' }, bound), async () => {
    reporter.missedReady(name, bound);
    await endBeforeMain(child, exit, clock, { graceMs: 0, boundMs: RUN_HOST_END_BOUND_MS }, () => lines.push(['still running', 'error']));
  });
  return { clock, quit, reporter, notices, lines, child, link, endable, ready, attach: () => reporter.attach((n) => notices.push(n)) };
}

describe('OQ-462 (2): a bounded ready', () => {
  it('both children are bounded at 5 s, the run host\'s hello bound', () => {
    expect(RUN_HOST_READY_BOUND_MS).toBe(5_000);
    expect(WORKSPACE_SERVICE_READY_BOUND_MS).toBe(5_000);
  });

  it('a child that answers its hello is ready, and nothing is raised', async () => {
    const s = supervised('run-host', { answers: true });
    s.attach();
    await expect(s.ready()).resolves.toEqual({ kind: 'hello', process: 'run-host', pid: 4242 });
    expect(s.notices).toEqual([]);
  });

  it('a run host that misses the bound is ended, never rejects out of the launch, and the notice is held until the store exists', async () => {
    const s = supervised('run-host', { answers: false });
    const ready = s.ready();
    s.clock.advance(RUN_HOST_READY_BOUND_MS);
    await expect(ready).resolves.toBeNull();
    // Ended through `endBeforeMain`'s kill: the fake reports Electron's 0 for it, and main did NOT end it through the
    // endable, so the miss is still a loss (it is the missed bound, not main's quit).
    expect(s.notices).toEqual([]);
    s.attach();
    expect(s.notices).toEqual([expect.objectContaining({ severity: 'error', persistent: true, title: 'The run host did not start', detail: expect.stringMatching(/no answer to its hello within 5000 ms, so main ended it \(pid 4242, exit status 0\)/) })]);
    expect(s.notices[0]!.action).toBeUndefined();
    expect(s.notices[0]!.sessionId).toBeUndefined();
    // (3): every request after it is refused at once, without the link's bound.
    await expect(s.link.request({ kind: 'ping' }, millis(30_000))).resolves.toEqual(runHostGoneRefusal('did-not-start'));
    expect(s.clock.pendingCount()).toBe(0);
  });

  it('a workspace service that misses it is ended and raises NO notice: its open is refused on its own surface', async () => {
    const s = supervised('workspace-service', { answers: false });
    s.attach();
    const ready = s.ready();
    s.clock.advance(WORKSPACE_SERVICE_READY_BOUND_MS);
    await expect(ready).resolves.toBeNull();
    expect(s.notices).toEqual([]);
    expect(s.lines.filter(([m]) => /^notice:/.test(m))).toEqual([]);
  });

  it('a hello answered with anything else is a miss too, naming what came', async () => {
    const causes: string[] = [];
    const r = await boundedReady(() => Promise.resolve({ kind: 'refused', code: 'x', headline: 'nope' }), async (c) => { causes.push(c); });
    expect(r).toBeNull();
    expect(causes).toEqual(['refused (x): nope']);
    const thrown = await boundedReady(() => Promise.reject(new Error('link closed')), async (c) => { causes.push(c); });
    expect(thrown).toBeNull();
    expect(causes[1]).toBe('link closed');
  });
});

describe('OQ-462 (1) and (3): a child lost after it was ready', () => {
  it.each([
    ['its last-resort handler (70)', 70, /pid 4242 exited with status 70: its last-resort handler/],
    ['a signal or a crash (SIGKILL 9, Windows TerminateProcess 1)', 9, /pid 4242 exited with status 9: lost to a signal or a crash/],
    ['an exit main did not ask for, with status 0', 0, /pid 4242 exited with status 0: an orderly end/],
  ])('the run host ending on %s raises ONE "stopped" error notice, and every later request is refused at once', async (_what, code, detail) => {
    const s = supervised('run-host', { answers: true });
    s.attach();
    await s.ready();
    const waiting = s.link.request({ kind: 'ping' }, millis(30_000));
    s.child.crash(code);
    await expect(waiting).resolves.toEqual(runHostGoneRefusal('stopped'));
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toEqual(expect.objectContaining({ severity: 'error', persistent: true, title: 'The run host stopped', detail: expect.stringMatching(detail) }));
    expect(s.notices[0]!.message).toMatch(/Runs in progress were lost; what each had saved is kept\. .*stale.*repaired\. No run can start until the application is restarted\./);
    expect(s.lines).toContainEqual([expect.stringMatching(/^notice: The run host stopped \(.*\) \(OQ-462\)$/), 'error']);
  });

  it('a workspace service that stops raises one notice naming its workspace and saying reopening restores it', async () => {
    const s = supervised('workspace-service', { answers: true });
    s.attach();
    await s.ready();
    s.child.crash(70);
    expect(s.notices).toEqual([expect.objectContaining({ severity: 'error', title: 'The workspace service for C:\\work\\alpha stopped', message: 'Reopening the workspace restores it.' })]);
    await expect(s.link.request({ kind: 'ping' }, millis(10_000))).resolves.toEqual(workspaceServiceGoneRefusal('C:\\work\\alpha'));
  });

  it('a child main ended itself is no loss: no notice (the endable records the kill)', async () => {
    const s = supervised('run-host', { answers: true });
    s.attach();
    await s.ready();
    s.endable.kill();
    expect(s.notices).toEqual([]);
  });

  it('nothing is raised once the application is ending: the orderly shutdown, or the immediate exit', async () => {
    for (const end of ['shuttingDown', 'exiting'] as const) {
      const s = supervised('run-host', { answers: true });
      s.attach();
      await s.ready();
      s.quit[end]();
      s.child.crash(0);
      expect(s.notices).toEqual([]);
    }
  });

  it('a run host ended for a missed ready whose exit comes only once the application is ending raises nothing either', () => {
    const quit = new QuitState();
    const notices: ReportInput[] = [];
    const reporter = new ChildLossReporter({ endedByMain: () => false, quitting: () => quit.ending(), log: () => undefined });
    reporter.attach((n) => notices.push(n));
    reporter.missedReady('rotaris-run-host', 5_000);
    quit.shuttingDown();
    expect(reporter.exited('rotaris-run-host', { process: 'run-host' }, { code: 0, pid: 1 })).toBeNull();
    expect(notices).toEqual([]);
    expect(reporter.didNotStart('rotaris-run-host')).toBe(false);
  });

  it('`ending` reads no window, so a launch with no window yet is not a quit', () => {
    const q = new QuitState();
    expect(q.ending()).toBe(false);
    expect(q.quitting([])).toBe(true);
    q.shuttingDown();
    expect(q.ending()).toBe(true);
  });
});

describe('OQ-462 (1): the notice\'s words', () => {
  it('a workspace service that did not start, should one ever be raised, says so', () => {
    const n = childLossNotice({ process: 'workspace-service', workspace: 'W' }, 'did-not-start', { code: 0, pid: undefined, readyBoundMs: 5_000 });
    expect(n.title).toBe('The workspace service for W did not start');
    expect(n.detail).toBe('workspace service for W: no answer to its hello within 5000 ms, so main ended it (pid unknown, exit status 0)');
  });

  it('the refusals name the process and what follows', () => {
    expect(runHostGoneRefusal('stopped')).toEqual({ kind: 'refused', code: 'runHost.gone', headline: 'The run host has stopped; no run can start until the application is restarted' });
    expect(runHostGoneRefusal('did-not-start').code).toBe('runHost.notStarted');
    expect(workspaceServiceGoneRefusal('W').headline).toBe('The workspace service for W has stopped; reopen the workspace to restore it');
  });
});
