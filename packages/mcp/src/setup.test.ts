import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { millis, type Clocks, type Timers } from '@rotaris/kernel';
import { runSetupSteps, type SetupStepReport, type SetupStepSpec } from './setup.js';

/**
 * REQ-MCP-099's runner against node itself as the "runtime": the invocation is `node -e <script>` where the script reads
 * its trailing arguments (the step's subcommand and the workspace root) and behaves as the step asks — succeed, fail with
 * output, or sleep past the budget. Real clocks (a few seconds at most); the Timers port is node's.
 */
const realClocks = (): Clocks => {
  const timers: Timers = { after: (ms, fn) => { const h = setTimeout(fn, ms); return { cancel: () => clearTimeout(h) }; } } as Timers;
  return { monotonic: { now: () => performance.now() }, timers } as Clocks;
};
const script = 'const a = process.argv.slice(1); const step = a[0]; if (step === "ok") process.exit(0); if (step === "fail") { process.stdout.write("x".repeat(500) + "END-OF-OUTPUT"); process.exit(3); } if (step === "sleep") setTimeout(() => {}, 20000);';
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
  });

  it('skips creation on the marker, skips the gated steps without code, and never overwrites', async () => {
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'fail'), step('index', 'fail', { needsCode: true }), step('memory', 'fail', { needsCode: true })], creationStepId: 'create', markerPresent: true, containsCode: false, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50) });
    expect(r.outcome).toBe('completed');
    expect(r.steps.map((s) => s.status)).toEqual(['succeeded', 'skipped-no-code', 'skipped-no-code']);
    expect(r.steps[0]!.detail).toContain('creation skipped');
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
  });

  it('terminates a step past its budget and reports it failed', async () => {
    const r = await runSetupSteps({ invocation, workspaceRoot: process.cwd(), steps: [step('create', 'sleep', { budgetMs: 700 }), step('index', 'ok')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: new AbortController().signal, onStep: () => undefined, pollMs: millis(50), graceMs: millis(300) });
    expect(r.outcome).toBe('failed');
    expect(r.steps[0]!.status).toBe('failed');
    expect(r.steps[0]!.detail).toContain('exceeded its budget');
    expect(r.steps[0]!.stopped).toBe('budget');
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
  const settled = async (pids: readonly number[], ms = 1_000): Promise<boolean> => {
    const until = performance.now() + ms;
    while (pids.some(alive) && performance.now() < until) await new Promise((r) => setTimeout(r, 20));
    return !pids.some(alive);
  };

  it.skipIf(process.platform === 'win32')('cancels: what the step started is ended with it, a descendant that ignores the ask included (REQ-WORKSPACE-092)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rotaris-setup-family-'));
    const abort = new AbortController();
    let pids: number[] = [];
    const r = await runSetupSteps({ invocation: familyInvocation, workspaceRoot: root, steps: [step('create', 'holds')], creationStepId: 'create', markerPresent: false, containsCode: true, env: process.env as Record<string, string>, clocks: realClocks(), log, signal: abort.signal, onStep: (s) => { if (s.id === 'create' && s.status === 'running') setTimeout(() => { pids = pidsIn(root); abort.abort(); }, 500); }, pollMs: millis(50), graceMs: millis(400) });
    expect(r.steps[0]!.stopped).toBe('cancelled');
    expect(pids).toHaveLength(2);
    expect(await settled(pids)).toBe(true);
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
      onStep: (s) => { if (s.id === 'create' && s.status === 'running') setTimeout(() => { pids = pidsIn(root); abort.abort(); setTimeout(() => { shutdownAt = performance.now(); shutdown.abort(); }, 300); }, 500); },
    });
    const endedAfter = performance.now() - shutdownAt;
    expect(r.outcome).toBe('cancelled');
    expect(r.steps.map((s) => s.status)).toEqual(['failed', 'not-attempted']);
    expect(endedAfter).toBeLessThan(2_000);
    expect(await settled(pids)).toBe(true);
  }, 20_000);
});
