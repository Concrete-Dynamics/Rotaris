import { describe, expect, it } from 'vitest';
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
});
