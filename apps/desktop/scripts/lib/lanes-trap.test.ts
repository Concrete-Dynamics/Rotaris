/**
 * The `pendingLanes` trap (live-run finding D8): its source run against a fake React root in a VM context — commits made
 * by replacing `current`, pending lanes left or cleared — and the reading of a launch's log. The trap is what the duress
 * launch installs through `ROTARIS_CAPTURE_EVAL_AT`, so its source must also be a whole step of that grammar.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parseSteps } from '../../src/main/capture/host.ts';
// @ts-expect-error — plain ESM beside the proofs, run by node without a build step.
import { COUNTING_LANES, LANES_TRAP_INSTALLED, LANES_TRAP_PREFIX, LANES_TRAP_READ, lanesTrapGuard, lanesTrapReading, lanesTrapSource, lanesTrapSteps } from './lanes-trap.mjs';

interface Fiber { tag: number; type: unknown; lanes: number; childLanes: number; child: Fiber | null; sibling: Fiber | null; stateNode?: unknown; alternate?: Fiber; memoizedState?: unknown; memoizedProps?: unknown }

/** A window with `#root` holding a container key to a HostRoot fiber whose stateNode is the FiberRoot. */
function fakeWindow() {
  const props = {};
  const leaf: Fiber = { tag: 0, type: function TranscriptPane() {}, lanes: 0, childLanes: 0, child: null, sibling: null, memoizedState: { n: 2 }, memoizedProps: props };
  leaf.alternate = { ...leaf, memoizedState: { n: 1 } };
  const app: Fiber = { tag: 0, type: { displayName: 'AppShell' }, lanes: 0, childLanes: 0, child: leaf, sibling: null, memoizedState: null, memoizedProps: props };
  app.alternate = { ...app };
  const host: Fiber = { tag: 3, type: null, lanes: 0, childLanes: 0, child: app, sibling: null };
  const root = { pendingLanes: 0, current: host as Fiber };
  host.stateNode = root;
  const container: Record<string, unknown> = { '__reactContainer$abc123': host };
  const warnings: string[] = [];
  const listeners: Array<(e: { message: string }) => void> = [];
  const microtasks: Array<() => void> = [];
  const window: Record<string, unknown> = { addEventListener: (_: string, fn: (e: { message: string }) => void) => listeners.push(fn) };
  const context = {
    window,
    document: { getElementById: (id: string) => (id === 'root' ? container : null) },
    console: { warn: (m: string) => warnings.push(m) },
    queueMicrotask: (fn: () => void) => microtasks.push(fn),
    Date,
    JSON,
    Object,
    String,
  };
  const flush = () => { while (microtasks.length > 0) microtasks.shift()!(); };
  const commit = (pending: number) => { root.current = { ...host }; root.pendingLanes = pending; };
  return { context, root, leaf, app, warnings, listeners, flush, commit };
}

describe('lanes trap — its source in a renderer', () => {
  it('is one step of the eval grammar: no `;;`, no `>>`, and the step parses back to it', () => {
    const source = lanesTrapSource();
    expect(source).not.toContain(';;');
    expect(source).not.toContain('>>');
    const steps = parseSteps(lanesTrapSteps({ installAtMs: 2500, readEveryMs: 1000, untilMs: 4500 }));
    expect(steps.map((s) => [s.selector, s.at])).toEqual([[source, 2500], [LANES_TRAP_READ, 3500], [LANES_TRAP_READ, 4500]]);
  });

  it('never repeats React\'s own message, so the harness\'s count of it is untouched', () => {
    expect(lanesTrapSource()).not.toMatch(/Minified React error [#]185\b|Maximum update depth exceeded/);
  });

  it('answers why when there is no React root to trap, and writes no install line', () => {
    const f = fakeWindow();
    (f.context.document as { getElementById: (id: string) => unknown }).getElementById = () => ({});
    expect(runInNewContext(lanesTrapSource(), f.context)).toEqual({ installed: false, reason: 'no React root on #root' });
    expect(f.warnings).toEqual([]);
  });

  it('writes one install line, `rotaris-lanes-trap: installed`, once per window, never naming React\'s error (OQ-278)', () => {
    expect(LANES_TRAP_INSTALLED).toBe('rotaris-lanes-trap: installed');
    const f = fakeWindow();
    runInNewContext(lanesTrapSource(), f.context);
    runInNewContext(lanesTrapSource(), f.context);
    expect(f.warnings).toEqual([LANES_TRAP_INSTALLED]);
    expect(LANES_TRAP_INSTALLED).not.toMatch(/[#]185\b|Maximum update depth/);
  });

  it('counts commits, the run of commits that leave counting lanes pending, and names the fibers holding them', () => {
    const f = fakeWindow();
    const installed = runInNewContext(lanesTrapSource({ warnAt: 3 }), f.context);
    expect(installed).toMatchObject({ installed: true, commits: 0, maxRun: 0 });
    // Three commits in a row each leave Default work pending, held by the transcript pane.
    f.leaf.lanes = 32; f.app.childLanes = 32; f.root.current.childLanes = 32;
    for (let i = 0; i < 3; i += 1) { f.commit(32); f.flush(); }
    let summary = runInNewContext(LANES_TRAP_READ, f.context);
    expect(summary).toMatchObject({ commits: 3, evaluations: 3, counting: 3, run: 3, maxRun: 3, maxBurst: 1 });
    expect(summary.maxRunHolders).toEqual([`TranscriptPane (lanes 32)`]);
    // The pane re-rendered in those commits (its state differs from its alternate's); the shell did not.
    expect(summary.maxRunRendered).toEqual(['TranscriptPane']);
    // The install line first (OQ-278's relay check), then the run's line.
    expect(f.warnings).toHaveLength(2);
    expect(f.warnings[0]).toBe(LANES_TRAP_INSTALLED);
    expect(f.warnings[1]!.startsWith(`${LANES_TRAP_PREFIX} `)).toBe(true);
    expect(JSON.parse(f.warnings[1]!.slice(LANES_TRAP_PREFIX.length + 1))).toMatchObject({ what: 'run', run: 3, holders: ['TranscriptPane (lanes 32)'] });
    // A commit that leaves nothing counting pending resets the run, as React's count resets; idle lanes do not count.
    f.commit(COUNTING_LANES & 0); f.flush();
    f.commit(64); f.flush();
    summary = runInNewContext(LANES_TRAP_READ, f.context);
    expect(summary).toMatchObject({ commits: 5, run: 0, maxRun: 3 });
  });

  it('reads the root `current` it was given back unchanged, and installs once per window', () => {
    const f = fakeWindow();
    const before = f.root.current;
    runInNewContext(lanesTrapSource(), f.context);
    expect(f.root.current).toBe(before);
    const next = { ...before };
    f.root.current = next;
    expect(f.root.current).toBe(next);
    runInNewContext(lanesTrapSource(), f.context);
    f.flush();
    expect(runInNewContext(LANES_TRAP_READ, f.context)).toMatchObject({ commits: 1 });
  });

  it('counts a synchronous chain of commits as one burst, and writes a line at an update-depth error', () => {
    const f = fakeWindow();
    runInNewContext(lanesTrapSource({ warnAt: 4 }), f.context);
    for (let i = 0; i < 5; i += 1) f.commit(2);
    f.flush();
    expect(runInNewContext(LANES_TRAP_READ, f.context)).toMatchObject({ commits: 5, evaluations: 1, maxBurst: 5 });
    f.listeners.forEach((fn) => fn({ message: 'Uncaught Error: Minified React error \u0023185; visit https://react.dev/errors/185' }));
    const last = JSON.parse(f.warnings.at(-1)!.slice(LANES_TRAP_PREFIX.length + 1));
    expect(last).toMatchObject({ what: 'update-depth error', pendingLanes: 2 });
    expect(runInNewContext(LANES_TRAP_READ, f.context)).toMatchObject({ updateDepthErrors: 1 });
  });
});

describe('lanes trap — the reading of a launch log', () => {
  it('finds the install, the last summary and the lines the relay carried', () => {
    const log = [
      `[main t] info    capture: eval-at 2500 ${lanesTrapSource()} → {"installed":true,"commits":0,"maxRun":0}`,
      `[main t] info    capture: renderer console: ${LANES_TRAP_PREFIX} {"what":"run","run":10,"holders":["TranscriptPane (lanes 32)"]} (file:///x/index.js:12)`,
      `[main t] info    capture: eval-at 122500 ${LANES_TRAP_READ} → {"installed":true,"commits":4100,"maxRun":10}`,
    ].join('\n');
    expect(lanesTrapReading(log)).toEqual({
      installed: true, relayed: false, reason: null, readings: 2, last: { installed: true, commits: 4100, maxRun: 10 },
      lines: [{ what: 'run', run: 10, holders: ['TranscriptPane (lanes 32)'] }],
    });
  });

  it('reads the relayed install line as `relayed`, not as one of the trap\'s lines (OQ-278)', () => {
    const log = [
      `[main t] info    capture: eval-at 2500 ${lanesTrapSource()} → {"installed":true,"commits":0,"maxRun":0}`,
      `[main t] info    capture: renderer console: ${LANES_TRAP_INSTALLED} (:1)`,
    ].join('\n');
    expect(lanesTrapReading(log)).toMatchObject({ installed: true, relayed: true, lines: [] });
  });

  it('says why when the trap never installed, and when it was never read', () => {
    expect(lanesTrapReading(`capture: eval-at 2500 ${lanesTrapSource()} → {"installed":false,"reason":"no React root on #root"}`))
      .toMatchObject({ installed: false, reason: 'no React root on #root', readings: 1, last: null });
    expect(lanesTrapReading('nothing here')).toMatchObject({ installed: false, reason: 'no reading of the trap in the log', readings: 0 });
  });
});

describe('lanes trap — the duress launch\'s guard (OQ-278)', () => {
  const what = "the long run's pendingLanes trap installed and its install line reached duress/app.log through the console relay (D8 guard, OQ-278)";
  it('passes only when the trap installed and its install line was relayed', () => {
    expect(lanesTrapGuard({ installed: true, relayed: true, reason: null })).toEqual({ passed: true, what, detail: undefined });
  });
  it('fails a trap that did not install, with its reason', () => {
    expect(lanesTrapGuard({ installed: false, relayed: false, reason: 'no React root on #root' })).toEqual({ passed: false, what, detail: 'the trap did not install: no React root on #root' });
  });
  it('fails a trap that installed but whose install line never reached the log', () => {
    expect(lanesTrapGuard({ installed: true, relayed: false, reason: null })).toEqual({ passed: false, what, detail: `the trap installed, but no relayed "${LANES_TRAP_INSTALLED}" line is in the log: the console relay did not carry it` });
  });
});

/**
 * The guard decides nothing unless the duress launch takes it as a check: OQ-278's ruling is that a trap that did not install,
 * or whose install line was not relayed, FAILS the launch, where it was a NOTE before the ruling.
 */
describe('live-run\'s duress launch takes the trap guard as a check (OQ-278)', () => {
  it('checks lanesTrapGuard on the reading and records `relayed` in the scenario evidence', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const duress = text.slice(text.indexOf("if (wanted.includes('duress')) {"));
    expect(duress).toMatch(/const lanes = lanesTrapReading\(log\);/);
    expect(duress).toMatch(/scenarioEvidence\.duress\.lanesTrap = \{ installed: lanes\.installed, relayed: lanes\.relayed,/);
    expect(duress).toMatch(/const lanesGuard = lanesTrapGuard\(lanes\);\s*check\(lanesGuard\.passed, lanesGuard\.what, lanesGuard\.detail\);/);
    expect(duress).not.toMatch(/noted\([^\n]*trap did not install/);
  });
});
