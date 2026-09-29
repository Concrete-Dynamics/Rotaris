import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { InitializationStateView, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { readInitializationState, writeConfigFields, type PlainMap } from '@rotaris/config';
import {
  CODE_INTELLIGENCE_FAILED_SUMMARY, CODE_INTELLIGENCE_SUCCESS_CODE, CODE_INTELLIGENCE_SUCCESS_NON_CODE,
  CODE_INTELLIGENCE_TASK_ID, InitializationCoordinator,
} from './initialization.js';

function workspace(): { root: string; agents: string } {
  const root = mkdtempSync(join(tmpdir(), 'rotaris-coord-'));
  mkdirSync(join(root, '.rotaris'));
  return { root, agents: join(root, '.rotaris', 'agents.yaml') };
}

const step = (id: McpSetupStep['id'], status: McpSetupStep['status'], detail = ''): McpSetupStep => ({ id, label: id, status, detail, elapsedMs: null });

function status(over: Partial<McpSetupStatus> = {}): McpSetupStatus {
  return {
    provisioning: { store: '', servers: [] },
    state: 'running', steps: [step('create', 'pending'), step('index', 'pending'), step('memory', 'pending')],
    outcome: null, message: '', containsCode: null, invocation: 'x', startedAt: null, applicable: true,
    ...over,
  };
}

interface Harness {
  readonly coordinator: InitializationCoordinator;
  readonly published: InitializationStateView[];
  readonly banners: { headline: string; detail: string }[];
  readonly writes: PlainMap[];
  readonly startedRoots: string[];
  readonly cancelledRoots: string[];
  readonly root: string;
  readonly agents: string;
  push(s: McpSetupStatus): void;
}

function harness(options: { applicable?: boolean; startFails?: boolean; writeFails?: string | null; modelReachable?: boolean } = {}): Harness {
  const { root, agents } = workspace();
  const published: InitializationStateView[] = [];
  const banners: { headline: string; detail: string }[] = [];
  const writes: PlainMap[] = [];
  const startedRoots: string[] = [];
  const cancelledRoots: string[] = [];
  const clock = new FakeClock(0, Date.parse('2026-09-15T12:00:00Z'));
  const coordinator = new InitializationCoordinator({
    clocks: clock,
    log: () => undefined,
    writeMarker: async (root, patch) => {
      if (options.writeFails) return { ok: false, reason: options.writeFails };
      writes.push(patch);
      // The real path is the workspace service's `commitConfigFields`, which is this call plus a reload.
      const r = await writeConfigFields(join(root, '.rotaris', 'agents.yaml'), patch);
      return r.ok ? { ok: true } : { ok: false, reason: r.error.fault };
    },
    setup: {
      start: async (root) => { startedRoots.push(root); return options.startFails ? { ok: false, reason: 'not a local launch' } : { ok: true, status: status() }; },
      cancel: async (root) => { cancelledRoots.push(root); },
      status: async () => status({ applicable: options.applicable !== false }),
    },
    publish: (_root, s) => published.push(s),
    banner: (headline, detail) => banners.push({ headline, detail }),
    modelReachable: () => options.modelReachable !== false,
  });
  coordinator.open(root, agents);
  return { coordinator, published, banners, writes, startedRoots, cancelledRoots, root, agents, push: (s) => coordinator.onSetupStatus(root, s) };
}

/** REQ-WORKSPACE-088: the one registered task, its id and its label, and that it needs no consent. */
describe('the default task set', () => {
  it('registers exactly code-intelligence-setup, background', () => {
    const h = harness();
    const tasks = h.coordinator.registry.all();
    expect(tasks.map((t) => t.id)).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(tasks[0]?.label).toBe('Code intelligence project setup');
    expect(tasks[0]?.requiresConsent).toBe(false);
  });

  it('is applicable exactly when the setup status says the entry is launchable (REQ-WORKSPACE-090)', async () => {
    expect(await harness({ applicable: true }).coordinator.registry.all()[0]!.applicable()).toBe(true);
    expect(await harness({ applicable: false }).coordinator.registry.all()[0]!.applicable()).toBe(false);
  });
});

describe('resolution on workspace open', () => {
  it('resolves the workspace named by a delayed open callback, not whichever window is now active', async () => {
    const h = harness();
    const next = workspace();
    h.coordinator.open(next.root, next.agents);
    await h.coordinator.resolve(true, h.root);
    await new Promise((r) => setImmediate(r));
    expect(h.startedRoots).toEqual([h.root]);
    expect(readInitializationState(next.agents).completed).toEqual([]);
    h.coordinator.close(h.root);
    h.coordinator.onSetupStatus(h.root, status({ state: 'finished', outcome: 'cancelled', steps: [step('create', 'failed', 'cancelled')] }));
  });

  /** REQ-WORKSPACE-013: the replacement starts its own setup while the outgoing one is still being cancelled. */
  it('keeps two workspace setups and their status streams separate during a switch', async () => {
    const h = harness();
    const next = workspace();
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    h.coordinator.open(next.root, next.agents);
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    expect(h.startedRoots).toEqual([h.root, next.root]);

    h.coordinator.close(h.root);
    expect(h.cancelledRoots).toEqual([h.root]);
    h.coordinator.onSetupStatus(h.root, status({ state: 'finished', outcome: 'cancelled', steps: [step('create', 'failed', 'cancelled')] }));
    // A's completion cannot conclude B's run or put a failure banner over B.
    expect(readInitializationState(next.agents).completed).toEqual([]);
    h.coordinator.onSetupStatus(next.root, status({ state: 'finished', outcome: 'completed', containsCode: true, steps: [step('create', 'succeeded'), step('index', 'succeeded'), step('memory', 'succeeded')] }));
    await new Promise((r) => setImmediate(r));
    expect(readInitializationState(next.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(h.banners).toEqual([]);
  });

  /** REQ-WORKSPACE-083: a never-initialized workspace with no applicable task is marked silently. */
  it('marks a workspace with nothing applicable, stamping last_run and starting nothing', async () => {
    const h = harness({ applicable: false });
    const state = await h.coordinator.resolve(true);
    expect(state.view.neverInitialized).toBe(false);
    expect(state.view.pending).toEqual([]);
    expect(h.writes).toHaveLength(1);
    expect((h.writes[0]!['initialization'] as Record<string, unknown>)['last_run']).toBe('2026-09-15T12:00:00.000Z');
    expect(h.banners).toEqual([]);
  });

  /** REQ-WORKSPACE-102: automatic exactly once per open; a user-requested check is additional. */
  it('resolves automatically once and lets a check-again run beside it', async () => {
    const h = harness({ applicable: false });
    await h.coordinator.resolve(true);
    expect(h.writes).toHaveLength(1);
    const publishedAfterFirst = h.published.length;
    // A second AUTOMATIC resolution is not made; the one per workspace open has been used.
    await h.coordinator.resolve(true);
    expect(h.published).toHaveLength(publishedAfterFirst);
    // A user-requested check IS made — and writes nothing, the marker already standing (REQ-WORKSPACE-079).
    await h.coordinator.resolve(false);
    expect(h.published.length).toBeGreaterThan(publishedAfterFirst);
    expect(h.writes).toHaveLength(1);
  });

  /** REQ-WORKSPACE-083: background work starts by itself and no marker is written up front. */
  it('starts the background task and records its outcome when it finishes', async () => {
    const h = harness();
    const run = h.coordinator.resolve(true);
    // The run host pushes each step, then the finish.
    await new Promise((r) => setImmediate(r));
    h.push(status({ steps: [step('create', 'succeeded', 'made'), step('index', 'pending'), step('memory', 'pending')] }));
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: true, steps: [step('create', 'succeeded', 'made'), step('index', 'succeeded', 'indexed'), step('memory', 'succeeded', 'seeded')] }));
    await run;
    await new Promise((r) => setImmediate(r));
    const state = readInitializationState(h.agents);
    expect(state.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(state.classification).toBe('code');
    const last = h.published.at(-1)!;
    expect(last.report.tasks[0]?.status).toBe('success');
    expect(last.report.tasks[0]?.summary).toBe(CODE_INTELLIGENCE_SUCCESS_CODE);
    expect(h.banners).toEqual([]);
  });

  /** REQ-WORKSPACE-095: the non-code summary, and REQ-WORKSPACE-091's skip token surviving into the step. */
  it('summarises a documentation-only workspace in its own words', async () => {
    const h = harness();
    const run = h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made'), step('index', 'skipped-no-code', 'No source files found, so there are no symbols to index.'), step('memory', 'skipped-no-code', 'No source files found, so no memory layout was seeded.')] }));
    await run;
    await new Promise((r) => setImmediate(r));
    const last = h.published.at(-1)!;
    expect(last.report.tasks[0]?.summary).toBe(CODE_INTELLIGENCE_SUCCESS_NON_CODE);
    expect(last.report.tasks[0]?.steps.map((s) => s.status)).toEqual(['succeeded', 'skipped-no-code', 'skipped-no-code']);
    expect(readInitializationState(h.agents).classification).toBe('non-code');
  });

  /** REQ-WORKSPACE-093 / REQ-WORKSPACE-103: a failed stage reports "{reason}: {detail}" and reaches a banner. */
  it('reports a failed stage with its own reason and raises the background banner', async () => {
    const h = harness();
    const run = h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    h.push(status({ state: 'finished', outcome: 'failed', containsCode: true, message: 'A step failed', steps: [step('create', 'succeeded', 'made'), step('index', 'failed', 'exit 1'), step('memory', 'not-attempted', '')] }));
    await run;
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.status).toBe('failure');
    expect(task.error).toBe("Code intelligence could not index this project's symbols: exit 1");
    expect(task.summary).toBe(CODE_INTELLIGENCE_FAILED_SUMMARY);
    expect(task.retryable).toBe(true);
    // REQ-WORKSPACE-084: a failure records nothing, so the task stays pending.
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect(h.banners[0]).toEqual({ headline: 'Project setup did not finish', detail: CODE_INTELLIGENCE_FAILED_SUMMARY });
  });

  /** A refused start is not REQ-WORKSPACE-094's non-local launch verdict; only an unavailable status is. */
  it('reports a refused start with its own retryable reason', async () => {
    const h = harness({ startFails: true });
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.error).toBe("Code intelligence could not start this project's setup: not a local launch");
    expect(task.retryable).toBe(true);
  });
});

describe('the skip path and the start refusals', () => {
  /** REQ-WORKSPACE-086/111: every id recorded, and the marker stamped even for an empty list. */
  it('records a skip and stamps the marker even with nothing listed', async () => {
    const h = harness();
    expect(await h.coordinator.skip([])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).lastRun).not.toBeNull();
    expect(await h.coordinator.skip(['a', 'b'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['a', 'b']);
  });

  /** The other half of the same defect: a task the live run is attempting is not the user's to skip. */
  it('leaves a task the live run is attempting out of a skip', async () => {
    const h = harness();
    const run = h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    // The prompt lists the runnable tasks, which includes the background one that started at open.
    expect(await h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['verification-consent']);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    await run;
    await new Promise((r) => setImmediate(r));
    // The task's own outcome lands, and the skip taken while it ran is still there.
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  it('reports a persistence failure rather than absorbing it', async () => {
    const h = harness({ writeFails: 'the file is read-only' });
    expect(await h.coordinator.skip(['a'])).toEqual({ ok: false, reason: 'the file is read-only' });
  });

  /** REQ-WORKSPACE-110: nothing left to run says so. */
  it('refuses a start with nothing runnable', async () => {
    const h = harness({ applicable: false });
    expect(await h.coordinator.start()).toEqual({ ok: false, headline: 'Everything in this workspace is already set up.', detail: '' });
  });

  /** REQ-WORKSPACE-110: a consent task with no reachable model fails fast. */
  it('refuses up front when a consent task needs a provider and none is reachable', async () => {
    const h = harness({ modelReachable: false });
    h.coordinator.registry.register({
      id: 'asks', label: 'Asks', description: 'runs an agent', requiresConsent: true,
      applicable: () => true,
      run: async () => ({ status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' }),
    });
    expect(await h.coordinator.start()).toEqual({
      ok: false,
      headline: 'Project setup needs a provider',
      detail: 'This setup step runs an agent, so it needs a model provider. Authenticate one in Settings, then start it again.',
    });
  });
});

/** REQ-WORKSPACE-115: the refresh reads the persisted section as it stands and disturbs nothing else. */
describe('the refresh', () => {
  it('shows an edit made to the section on disk', async () => {
    const h = harness({ applicable: false });
    writeFileSync(h.agents, 'initialization:\n  completed: [code-intelligence-setup]\n  skipped: []\n  last_run: "2026-09-01T00:00:00.000+00:00"\n  classification: code\nruntime:\n  permission_mode: ask\n');
    const state = await h.coordinator.read();
    expect(state.view.lastRun).toBe('2026-09-01T00:00:00.000+00:00');
    expect(state.view.classification).toBe('code');
    // In-progress and last-error describe this session only, never disk.
    expect(state.view.running).toBe(false);
    expect(state.view.lastError).toBeNull();
    // Every other top-level key of the file is still there.
    expect(readFileSync(h.agents, 'utf8')).toContain('permission_mode: ask');
  });
});
