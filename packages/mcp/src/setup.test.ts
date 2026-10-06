import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { millis, type Clocks, type Timers } from '@rotaris/kernel';
import { runSetupSteps, SETUP_SHUTDOWN_GRACE_MS, SETUP_TERMINATE_GRACE_MS, type SetupStepReport, type SetupStepSpec } from './setup.js';

/**
 * REQ-MCP-099's runner against node itself as the "runtime": the invocation is `node -e <script>` where the script reads
 * its trailing arguments (the step's subcommand and the workspace root) and behaves as the step asks — succeed, fail with
 * output, or sleep past the budget. Real clocks (a few seconds at most); the Timers port is node's.
 */
const realClocks = (): Clocks => {
  const timers: Timers = { after: (ms, fn) => { const h = setTimeout(fn, ms); return { cancel: () => clearTimeout(h) }; } } as Timers;
  return { monotonic: { now: () => performance.now() }, timers } as Clocks;
};
const script = 'const a = process.argv.slice(1); const step = a[0]; if (step === "ok") process.exit(0); if (step === "say") { process.stdout.write("Fehler: ä  \\n"); process.stderr.write("indexed"); process.exit(0); } if (step === "fail") { process.stdout.write("x".repeat(500) + "END-OF-OUTPUT"); process.exit(3); } if (step === "sleep") setTimeout(() => {}, 20000);';
const invocation = { command: process.execPath, args: ['-e', script] };
const log = { info: () => undefined, warn: () => undefined, debug: () => undefined };
const step = (id: string, sub: string, patch: Partial<SetupStepSpec> = {}): SetupStepSpec => ({ id, label: id, subcommand: [sub], budgetMs: 10_000, needsCode: false, ...patch });

describe('runSetupSteps (REQ-MCP-099)', () => {
  it('runs the three steps in order, reports each, and completes', async () => {
    const seen: string[] = [];
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'ok'), step('index', 'ok'), step('memory', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: (s: SetupStepReport) => { seen.push(`${s.id}:${s.status}`); }, pollMs: millis(50) });
    expect(r.outcome).toBe('completed');
    expect(r.steps.map((s) => s.status)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    expect(seen).toEqual(['create:running', 'create:succeeded', 'index:running', 'index:succeeded', 'memory:running', 'memory:succeeded']);
    // A step that ran carries its output apart from `detail`, which the MCP category shows empty for a success (REQ-MCP-112).
    expect(r.steps.map((s) => [s.detail, s.output, s.skipped, s.startError])).toEqual([['', '', undefined, undefined], ['', '', undefined, undefined], ['', '', undefined, undefined]]);
  });

  it('carries a succeeded step\'s combined output, UTF-8 intact, apart from its detail (REQ-WORKSPACE-092)', async () => {
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'say')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50) });
    expect(r.steps[0]!.status).toBe('succeeded');
    expect(r.steps[0]!.detail).toBe('');
    // Both streams, trimmed; the order between them is the pipes', so only their content is asserted.
    expect(r.steps[0]!.output).toContain('Fehler: ä');
    expect(r.steps[0]!.output).toContain('indexed');
  });

  it('carries a step that could not be started as its launch error, with no output', async () => {
    const r = await runSetupSteps({ invocation: { command: join(tmpdir(), 'rotaris-no-such-runtime', 'ci'), args: [] }, workspaceRoot: process.cwd(), steps: [step('create', 'ok'), step('index', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50) });
    expect(r.outcome).toBe('failed');
    expect(r.steps[0]!.status).toBe('failed');
    expect(r.steps[0]!.startError).toBeTruthy();
    expect(r.steps[0]!.detail).toBe(`the setup command could not be started: ${r.steps[0]!.startError}`);
    expect(r.steps[0]!.output).toBeUndefined();
    expect(r.steps[1]!.status).toBe('not-attempted');
  });

  it('PD-MONITOR-002, live-run finding a71-9: a step\'s outcome is the caller\'s to log (its onStep), never the runner\'s as well', async () => {
    // The run host's step reporter writes "mcp setup: <id> succeeded (<n> ms)"; the runner wrote "succeeded in <n> ms"
    // beside it, so every step that succeeded reached the application log twice.
    const lines: string[] = [];
    const recording = { info: (m: string) => { lines.push(m); }, warn: (m: string) => { lines.push(m); }, debug: (m: string) => { lines.push(m); } };
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'ok'), step('index', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log: recording, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50) });
    expect(r.outcome).toBe('completed');
    expect(lines.filter((l) => /succeeded|failed|skipped/.test(l))).toEqual([]);
    // The spawn line stays: it says which command ran, which no step report carries.
    expect(lines.filter((l) => / → /.test(l))).toHaveLength(2);
  });

  it('skips creation on the marker, skips the gated steps without code, and never overwrites', async () => {
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'fail'), step('index', 'fail', { needsCode: true }), step('memory', 'fail', { needsCode: true })], creationStepId: 'create', markerPresent: true, containsCode: false, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50) });
    expect(r.outcome).toBe('completed');
    expect(r.steps.map((s) => s.status)).toEqual(['succeeded', 'skipped-no-code', 'skipped-no-code']);
    expect(r.steps[0]!.detail).toContain('creation skipped');
    // The reasons travel as facts, so a reader owing its own words for them need not read the prose (REQ-WORKSPACE-091).
    expect(r.steps.map((s) => s.skipped)).toEqual(['marker-present', 'no-code', 'no-code']);
    expect(r.steps.map((s) => s.output)).toEqual([undefined, undefined, undefined]);
  });

  it('stops after a failure with the LAST 400 characters of its output, the rest not attempted', async () => {
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'ok'), step('index', 'fail'), step('memory', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50) });
    expect(r.outcome).toBe('failed');
    expect(r.steps.map((s) => s.status)).toEqual(['succeeded', 'failed', 'not-attempted']);
    const tail = /last output: (.*)$/s.exec(r.steps[1]!.detail)![1]!;
    expect(tail).toHaveLength(400);
    expect(tail.endsWith('END-OF-OUTPUT')).toBe(true);
    expect(r.steps[1]!.detail).toContain('code 3');
    expect(r.steps[1]!.stopped).toBeUndefined();
    // The same tail travels without the prose around it.
    expect(r.steps[1]!.output).toBe(tail);
    expect(r.steps[1]!.skipped).toBeUndefined();
    expect(r.steps[2]!.output).toBeUndefined();
  });

  it('terminates a step past its budget and reports it failed', async () => {
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'sleep', { budgetMs: 700 }), step('index', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50), graceMs: millis(300) });
    expect(r.outcome).toBe('failed');
    expect(r.steps[0]!.status).toBe('failed');
    expect(r.steps[0]!.detail).toContain('exceeded its budget');
    expect(r.steps[0]!.stopped).toBe('budget');
    expect(r.steps[0]!.output).toBe('');
    expect(r.steps[1]!.stopped).toBeUndefined();
    expect(r.steps[1]!.status).toBe('not-attempted');
  }, 20_000);

  it('cancels: the step in flight is terminated and the rest are not attempted', async () => {
    const abort = new AbortController();
    const p = runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'sleep'), step('index', 'ok'), step('memory', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: abort.signal, onStep: (s) => { if (s.id === 'create' && s.status === 'running') setTimeout(() => abort.abort(), 300); }, pollMs: millis(50), graceMs: millis(300) });
    const r = await p;
    expect(r.outcome).toBe('cancelled');
    expect(r.steps.map((s) => s.status)).toEqual(['failed', 'not-attempted', 'not-attempted']);
    expect(r.steps[0]!.detail).toContain('cancelled');
    expect(r.steps[0]!.stopped).toBe('cancelled');
    expect(r.steps[1]!.detail).toContain('cancelled before this step');
    expect(r.steps[1]!.stopped).toBeUndefined();
  }, 20_000);

  /**
   * REQ-WORKSPACE-092: "nothing the step launched SHALL still be running 5 s later — neither the command the step itself
   * started nor anything descended from it". On POSIX the termination reached the step alone, so a process the step had
   * started outlived the cancellation; measured 2026-10-01 on the built app at an orderly quit too
   * (`docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).
   * The step here starts a descendant that ignores the ask to terminate, writes both pids, and holds.
   */
  const family = 'const a = process.argv.slice(1); const root = a[1]; const cp = require("child_process"); const g = cp.spawn(process.execPath, ["-e", "process.on(\'SIGTERM\', () => {}); setTimeout(() => {}, 20000)"], { stdio: "ignore" }); require("fs").writeFileSync(require("path").join(root, "pids"), process.pid + " " + g.pid); if (a[0] === "stubborn") process.on("SIGTERM", () => {}); setTimeout(() => {}, 20000);';
  const familyInvocation = { command: process.execPath, args: ['-e', family] };
  /** Running, not merely a zombie no one has reaped yet (a container's pid 1 may never reap an orphan). */
  const alive = (pid: number): boolean => {
    try { process.kill(pid, 0); } catch { return false; }
    try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; }
  };
  const pidsIn = (root: string): number[] => readFileSync(join(root, 'pids'), 'utf8').split(' ').map(Number);
  /**
   * Once the step has written both pids, hand them on. Polled rather than read at a fixed delay: on a loaded host the
   * step's Node may not have written the file yet, and a read that throws inside a timer would be lost to the test.
   */
  const whenPids = (root: string, then: (pids: number[]) => void): void => {
    const look = (): void => {
      let pids: number[] = [];
      try { pids = pidsIn(root); } catch { /* not written yet */ }
      if (pids.length === 2 && pids.every((pid) => pid > 0)) then(pids);
      else setTimeout(look, 20);
    };
    look();
  };
  const settled = async (pids: readonly number[], ms = 1_000): Promise<boolean> => {
    const until = performance.now() + ms;
    while (pids.some(alive) && performance.now() < until) await new Promise((r) => setTimeout(r, 20));
    return !pids.some(alive);
  };

  it.skipIf(process.platform === 'win32')('cancels: what the step started is ended with it, a descendant that ignores the ask included (REQ-WORKSPACE-092)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-setup-family-'));
    const abort = new AbortController();
    let pids: number[] = [];
    const r = await runSetupSteps({ invocation: familyInvocation, workspaceRoot: root, steps: [step('create', 'holds')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: abort.signal, onStep: (s) => { if (s.id === 'create' && s.status === 'running') whenPids(root, (found) => { pids = found; abort.abort(); }); }, pollMs: millis(50), graceMs: millis(400) });
    expect(r.steps[0]!.stopped).toBe('cancelled');
    expect(pids).toHaveLength(2);
    expect(await settled(pids)).toBe(true);
  }, 20_000);

  /**
   * PD-MCP-003 (OQ-172, ruled 2026-10-06, R-071): every stop of a setup step gives it the same 2 s before the force-kill — a
   * Cancel or a switch's cancellation and an exhausted budget as well as the close. Before, the cancellation and the budget
   * kept REQ-MCP-099's 5 s, and a step that ignored the ask outlived REQ-WORKSPACE-092's 5 s bound (measured on Windows
   * 2026-10-02: 5.489 s after a switch, 5.603 s after a Cancel). No `graceMs` is passed: the default is what is measured.
   */
  it('gives every stop one grace, the close\'s 2 s (PD-MCP-003, REQ-WORKSPACE-092)', () => {
    expect(SETUP_TERMINATE_GRACE_MS).toBe(2_000);
    expect(SETUP_SHUTDOWN_GRACE_MS).toBe(SETUP_TERMINATE_GRACE_MS);
  });

  it.skipIf(process.platform === 'win32')('cancels a step that ignores the ask with the force-kill 2 s after the cancellation, by default (PD-MCP-003, REQ-WORKSPACE-092)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-setup-cancel-grace-'));
    const abort = new AbortController();
    let pids: number[] = [];
    let cancelledAt = 0;
    const r = await runSetupSteps({
      invocation: familyInvocation, workspaceRoot: root, steps: [step('create', 'stubborn')], creationStepId: 'create', markerPresent: false, containsCode: true,
      env: process.env as Record<string, string>, clocks: realClocks(), log, signal: abort.signal, pollMs: millis(50),
      onStep: (s) => { if (s.id === 'create' && s.status === 'running') whenPids(root, (found) => { pids = found; cancelledAt = performance.now(); abort.abort(); }); },
    });
    const endedAfter = performance.now() - cancelledAt;
    expect(r.steps[0]!.stopped).toBe('cancelled');
    expect(endedAfter).toBeGreaterThanOrEqual(1_900);
    expect(endedAfter).toBeLessThan(4_000);
    expect(await settled(pids)).toBe(true);
  }, 20_000);

  it.skipIf(process.platform === 'win32')('ends a step past its budget that ignores the ask with the force-kill 2 s after the budget, by default (PD-MCP-003, REQ-WORKSPACE-092)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-setup-budget-grace-'));
    const started = performance.now();
    const r = await runSetupSteps({
      invocation: familyInvocation, workspaceRoot: root, steps: [step('create', 'stubborn', { budgetMs: 600 })], creationStepId: 'create', markerPresent: false, containsCode: true,
      env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, pollMs: millis(50), onStep: () => undefined,
    });
    const took = performance.now() - started;
    expect(r.steps[0]!.stopped).toBe('budget');
    expect(took).toBeGreaterThanOrEqual(600 + 1_900);
    expect(took).toBeLessThan(600 + 4_000);
    expect(await settled(pidsIn(root))).toBe(true);
  }, 20_000);

  it.skipIf(process.platform === 'win32')('at its host\'s shutdown, force-kills a step that ignores the ask after the shutdown\'s grace, shortening a cancellation\'s grace already under way (REQ-WORKSPACE-092, REQ-WORKSPACE-109)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-setup-shutdown-'));
    const abort = new AbortController();
    const shutdown = new AbortController();
    let pids: number[] = [];
    let shutdownAt = 0;
    const r = await runSetupSteps({
      invocation: familyInvocation, workspaceRoot: root, steps: [step('create', 'stubborn'), step('index', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true,
      env: process.env as Record<string, string>, clocks: realClocks(), log, signal: abort.signal, pollMs: millis(50), graceMs: millis(10_000),
      shutdown: { signal: shutdown.signal, graceMs: millis(300) },
      // A cancellation under the 10 s grace first, then the shutdown 300 ms into it.
      onStep: (s) => { if (s.id === 'create' && s.status === 'running') whenPids(root, (found) => { pids = found; abort.abort(); setTimeout(() => { shutdownAt = performance.now(); shutdown.abort(); }, 300); }); },
    });
    const endedAfter = performance.now() - shutdownAt;
    expect(r.outcome).toBe('cancelled');
    expect(r.steps.map((s) => s.status)).toEqual(['failed', 'not-attempted']);
    expect(endedAfter).toBeLessThan(2_000);
    expect(await settled(pids)).toBe(true);
  }, 20_000);
});
