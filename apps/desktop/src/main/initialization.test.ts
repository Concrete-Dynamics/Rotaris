import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { InitializationStateView, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { readInitializationState, writeConfigFields, type InitializationTask, type PlainMap } from '@rotaris/config';
import {
  CANCELLED_BEFORE_SETUP_ERROR, CODE_INTELLIGENCE_FAILED_SUMMARY, CODE_INTELLIGENCE_SUCCESS_CODE, CODE_INTELLIGENCE_SUCCESS_NON_CODE,
  CODE_INTELLIGENCE_TASK_ID, deliverSetupCancel, InitializationCoordinator, NOT_A_LOCAL_LAUNCH_ERROR, NOT_A_LOCAL_LAUNCH_SUMMARY,
  SETUP_FOLLOW_BOUND_MS, SETUP_OVERDUE_DETAIL, SETUP_RUN_HOST_EXITED_DETAIL,
} from './initialization.js';

function workspace(): { root: string; agents: string } {
  const root = mkdtempSync(join(tmpdir(), 'rotaris-coord-'));
  mkdirSync(join(root, '.rotaris'));
  return { root, agents: join(root, '.rotaris', 'agents.yaml') };
}

const step = (id: McpSetupStep['id'], status: McpSetupStep['status'], detail = ''): McpSetupStep => ({ id, label: id, status, detail, elapsedMs: null });

/** The run host's refusal while its one setup slot is taken (`McpHost.startSetup`). */
const RUNNING_REFUSAL = { code: 'mcp.setup.running', reason: 'A code-intelligence setup is already running for this workspace; wait for it to finish or cancel it first.' };

function status(over: Partial<McpSetupStatus> = {}): McpSetupStatus {
  return {
    provisioning: { store: '', servers: [] },
    state: 'running', steps: [step('create', 'pending'), step('index', 'pending'), step('memory', 'pending')],
    outcome: null, message: '', containsCode: null, invocation: 'x', startedAt: null, applicable: true,
    ...over,
  };
}

/** The run host's answer to a start whose invocation cannot be derived (`McpHost.startSetup`): finished, `unavailable`. */
const unavailableSetup = (): McpSetupStatus => status({
  state: 'finished', outcome: 'unavailable', message: 'Setup is not available: the entry is not a local launch. This is not retried.',
  steps: [step('create', 'not-attempted', 'not attempted: no setup command could be derived'), step('index', 'not-attempted', 'not attempted: no setup command could be derived'), step('memory', 'not-attempted', 'not attempted: no setup command could be derived')],
});

interface Harness {
  readonly coordinator: InitializationCoordinator;
  readonly published: InitializationStateView[];
  readonly publishedTo: string[];
  readonly banners: { headline: string; detail: string }[];
  readonly writes: PlainMap[];
  readonly logs: { message: string; level: string }[];
  readonly root: string;
  readonly agents: string;
  readonly clock: FakeClock;
  /** Every setup-port call, with the workspace identifier it addressed the run host by. */
  readonly addressed: { readonly call: 'start' | 'cancel' | 'status'; readonly workspaceId: string }[];
  push(s: McpSetupStatus): void;
}

/** A hold a test can set at any moment: every setup status read taken while it is set waits on it. */
interface StatusHold { current: Promise<void> | null }

function harness(options: { applicable?: boolean; startRefusal?: { code: string; reason: string }; startStatus?: McpSetupStatus; writeFails?: string | null; modelReachable?: boolean; statusGate?: Promise<void>; hold?: StatusHold; onStart?: () => void; onCancel?: () => void; writeHold?: StatusHold; startHold?: StatusHold } = {}): Harness {
  const { root, agents } = workspace();
  const published: InitializationStateView[] = [];
  /** The root each entry of `published` was sent for, index for index. */
  const publishedTo: string[] = [];
  const banners: { headline: string; detail: string }[] = [];
  const writes: PlainMap[] = [];
  const logs: { message: string; level: string }[] = [];
  const addressed: { call: 'start' | 'cancel' | 'status'; workspaceId: string }[] = [];
  const clock = new FakeClock(0, Date.parse('2026-09-15T12:00:00Z'));
  // Each workspace's own service applies its marker writes one at a time, in the order they are sent; a write sent
  // while `writeHold` is set lands only once it is released, and every write sent after it to the same root lands after
  // it. Two roots are two services, so nothing orders one root's writes against another's.
  const applied = new Map<string, Promise<unknown>>();
  const coordinator = new InitializationCoordinator({
    clocks: clock,
    log: (message, level = 'info') => { logs.push({ message, level }); },
    writeMarker: (writeRoot, patch) => {
      const held = options.writeHold?.current ?? null;
      const landed = (applied.get(writeRoot) ?? Promise.resolve()).then(async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
        await held;
        if (options.writeFails) return { ok: false, reason: options.writeFails };
        writes.push(patch);
        // The real path is the workspace service's `commitConfigFields`, which is this call plus a reload.
        const r = await writeConfigFields(join(writeRoot, '.rotaris', 'agents.yaml'), patch);
        return r.ok ? { ok: true } : { ok: false, reason: r.error.fault };
      });
      applied.set(writeRoot, landed);
      return landed;
    },
    setup: {
      start: async (workspaceId) => { addressed.push({ call: 'start', workspaceId }); options.onStart?.(); await options.startHold?.current; return options.startRefusal ? { ok: false, ...options.startRefusal } : { ok: true, status: options.startStatus ?? status() }; },
      cancel: async (workspaceId) => { addressed.push({ call: 'cancel', workspaceId }); options.onCancel?.(); },
      status: async (workspaceId) => { addressed.push({ call: 'status', workspaceId }); await options.statusGate; await options.hold?.current; return status({ applicable: options.applicable !== false }); },
    },
    publish: (publishedRoot, s) => { publishedTo.push(publishedRoot); published.push(s); },
    banner: (headline, detail) => banners.push({ headline, detail }),
    modelReachable: () => options.modelReachable !== false,
  });
  coordinator.open(root, agents, 'ws-h');
  return { coordinator, published, publishedTo, banners, writes, logs, root, agents, clock, addressed, push: (s) => coordinator.onSetupStatus(s) };
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
    const yes = harness({ applicable: true });
    const no = harness({ applicable: false });
    expect(await yes.coordinator.registry.all()[0]!.applicable({ workspaceRoot: yes.root })).toBe(true);
    expect(await no.coordinator.registry.all()[0]!.applicable({ workspaceRoot: no.root })).toBe(false);
    // Judged against the asked workspace's own configuration, by its own identifier; a root no window holds has none.
    expect(yes.addressed).toEqual([{ call: 'status', workspaceId: 'ws-h' }]);
    expect(await yes.coordinator.registry.all()[0]!.applicable({ workspaceRoot: workspace().root })).toBe(false);
    expect(yes.addressed).toHaveLength(1);
  });
});

describe('resolution on workspace open', () => {
  /** REQ-WORKSPACE-083: a never-initialized workspace with no applicable task is marked silently. */
  it('marks a workspace with nothing applicable, stamping last_run and starting nothing', async () => {
    const h = harness({ applicable: false });
    const state = await h.coordinator.resolve(h.root, true);
    expect(state.view.neverInitialized).toBe(false);
    expect(state.view.pending).toEqual([]);
    expect(h.writes).toHaveLength(1);
    expect((h.writes[0]!['initialization'] as Record<string, unknown>)['last_run']).toBe('2026-09-15T12:00:00.000Z');
    expect(h.banners).toEqual([]);
  });

  /** REQ-WORKSPACE-102: automatic exactly once per open; a user-requested check is additional. */
  it('resolves automatically once and lets a check-again run beside it', async () => {
    const h = harness({ applicable: false });
    await h.coordinator.resolve(h.root, true);
    expect(h.writes).toHaveLength(1);
    const publishedAfterFirst = h.published.length;
    // A second AUTOMATIC resolution is not made; the one per workspace open has been used.
    await h.coordinator.resolve(h.root, true);
    expect(h.published).toHaveLength(publishedAfterFirst);
    // A user-requested check IS made — and writes nothing, the marker already standing (REQ-WORKSPACE-079).
    await h.coordinator.resolve(h.root, false);
    expect(h.published.length).toBeGreaterThan(publishedAfterFirst);
    expect(h.writes).toHaveLength(1);
  });

  /** REQ-WORKSPACE-083: background work starts by itself and no marker is written up front. */
  it('starts the background task and records its outcome when it finishes', async () => {
    const h = harness();
    const run = h.coordinator.resolve(h.root, true);
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
    const run = h.coordinator.resolve(h.root, true);
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
    const run = h.coordinator.resolve(h.root, true);
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

  /**
   * REQ-WORKSPACE-092/093: a step stopped before it finished reads in this domain's fixed sentences — in its own row and in
   * the "{reason}: {detail}" error — and not in the run host's, so it is told apart from a step that exited non-zero
   * (`docs/defects/fixed/a-stopped-setup-step-is-not-reported-in-req-workspace-092s-words.md`).
   */
  it.each([
    {
      stop: 'cancelled' as const, outcome: 'cancelled' as const, sentence: 'Setup was stopped before this step finished.',
      runHost: 'cancelled while running; the child was terminated; its last output: indexing 40%',
    },
    {
      stop: 'budget' as const, outcome: 'failed' as const, sentence: 'This step did not finish within its time budget.',
      runHost: 'exceeded its budget of 1800 s and was terminated; its last output: indexing 40%',
    },
  ])('reports a step stopped by $stop in REQ-WORKSPACE-092\'s words', async ({ stop, outcome, sentence, runHost }) => {
    const h = harness();
    const run = h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    const steps = [step('create', 'succeeded', 'made'), { ...step('index', 'failed', runHost), stopped: stop }, step('memory', 'not-attempted', 'not attempted')];
    // REQ-WORKSPACE-109: the stopped step is published live the moment the run host reports it, before the setup's finish.
    h.push(status({ state: 'running', containsCode: true, steps }));
    await settle();
    expect(h.published.at(-1)!.report.currentSteps.find((s) => s.name === 'Symbol indexing')?.detail).toBe(sentence);
    h.push(status({ state: 'finished', outcome, containsCode: true, message: 'stopped', steps }));
    await run;
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.error).toBe(`Code intelligence could not index this project's symbols: ${sentence}`);
    expect(task.steps.find((s) => s.name === 'Symbol indexing')?.detail).toBe(sentence);
    expect(task.retryable).toBe(true);
    expect(task.summary).toBe(CODE_INTELLIGENCE_FAILED_SUMMARY);
    // Nor in the live report's step rows, published as each step finished (REQ-WORKSPACE-109).
    expect(JSON.stringify(h.published)).not.toContain(runHost);
  });

  /** REQ-WORKSPACE-092: a step that ran to completion and exited non-zero keeps its own output, told apart from a stopped one. */
  it('keeps a non-zero exit\'s own detail', async () => {
    const h = harness();
    const run = h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    h.push(status({ state: 'finished', outcome: 'failed', containsCode: true, message: 'A step failed', steps: [step('create', 'failed', 'exited with code 1; its last output: boom'), step('index', 'not-attempted'), step('memory', 'not-attempted')] }));
    await run;
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.error).toBe("Code intelligence could not create this project's configuration: exited with code 1; its last output: boom");
    expect(task.steps[0]?.detail).toBe('exited with code 1; its last output: boom');
  });

  /**
   * REQ-WORKSPACE-094: a non-local launch is a non-retryable failure and no substitute is attempted. The run host does not
   * refuse such a start: it answers with a finished status whose outcome is `unavailable`, every step not attempted.
   */
  it('fails non-retryably when the entry is not a local launch', async () => {
    const h = harness({ startStatus: unavailableSetup() });
    await h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.error).toBe(NOT_A_LOCAL_LAUNCH_ERROR);
    expect(task.summary).toBe(NOT_A_LOCAL_LAUNCH_SUMMARY);
    expect(task.retryable).toBe(false);
  });

  /**
   * REQ-WORKSPACE-093/094/103: a start the run host refuses — its one setup slot taken by the MCP category's setup
   * (REQ-MCP-112), the workspace not open there, its configuration not loaded — is not REQ-WORKSPACE-094's "not a local
   * launch". It is a retryable failure in this domain's summary, its detail the refusal's own words, and the background
   * banner carries that summary (`docs/defects/fixed/a-refused-setup-start-is-reported-as-not-a-local-launch.md`).
   */
  it.each([
    RUNNING_REFUSAL,
    { code: 'workspace.unknown', reason: 'That workspace is not open in the run host' },
    { code: 'mcp.configuration', reason: 'The configuration could not be loaded' },
  ])('fails retryably, in its own words, when the run host refuses the start ($code)', async (refusal) => {
    const h = harness({ startRefusal: refusal });
    await h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.status).toBe('failure');
    expect(task.retryable).toBe(true);
    expect(task.error).toBe(`Code intelligence could not complete this project's setup: ${refusal.reason}`);
    expect(task.summary).toBe(CODE_INTELLIGENCE_FAILED_SUMMARY);
    expect(`${task.error} ${task.summary}`).not.toContain('not a local launch');
    expect(`${task.error} ${task.summary}`).not.toContain('was skipped');
    expect(h.banners).toEqual([{ headline: 'Project setup did not finish', detail: CODE_INTELLIGENCE_FAILED_SUMMARY }]);
    expect(h.logs.some((l) => l.message.includes(`refused`) && l.message.includes(refusal.code))).toBe(true);
    // REQ-WORKSPACE-084: a failure records nothing, so the task stays pending for the next open.
    expect(readInitializationState(h.agents).completed).toEqual([]);
  });
});

describe('the skip path and the start refusals', () => {
  /** REQ-WORKSPACE-086/111: every id recorded, and the marker stamped even for an empty list. */
  it('records a skip and stamps the marker even with nothing listed', async () => {
    const h = harness();
    expect(await h.coordinator.skip(h.root, [])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).lastRun).not.toBeNull();
    expect(await h.coordinator.skip(h.root, ['a', 'b'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['a', 'b']);
  });

  /** The other half of the same defect: a task the live run is attempting is not the user's to skip. */
  it('leaves a task the live run is attempting out of a skip', async () => {
    const h = harness();
    const run = h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    // The prompt lists the runnable tasks, which includes the background one that started at open.
    expect(await h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['verification-consent']);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    await run;
    await new Promise((r) => setImmediate(r));
    // The task's own outcome lands, and the skip taken while it ran is still there.
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  const consentTask = {
    id: 'verification-consent', label: 'Verification consent task', description: 'asks first', requiresConsent: true,
    applicable: () => true,
    run: async () => ({ status: 'success' as const, steps: [], classification: null, error: '', retryable: false, summary: '' }),
  };

  /**
   * REQ-WORKSPACE-083/084/086/102: the window can open the dialog from its mount read before main's 800 ms slot, and a
   * skip answered then recorded the background task as skipped before it had started, so the resolution started
   * nothing (`init-proof` on Linux, `docs/defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md`).
   * The skip now performs the open's one resolution first, which starts the task, and the attempted task is owed its
   * own outcome; the slot then finds the resolution made.
   */
  it('performs the open\'s resolution before a skip answered ahead of it, so the background task starts and is left its own outcome (REQ-WORKSPACE-083, REQ-WORKSPACE-084, REQ-WORKSPACE-086, REQ-WORKSPACE-102)', async () => {
    const h = harness();
    h.coordinator.registry.register(consentTask);
    // The mount read: a consent task pending and no run in progress, so the window opens the dialog.
    const mounted = await h.coordinator.read(h.root);
    expect(mounted.view.consentPending).toEqual(['verification-consent']);
    expect(mounted.view.running).toBe(false);
    // Escape, before the slot: the dialog listed both runnable tasks.
    expect(await h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['verification-consent']);
    expect(h.published.at(-1)!.view.running).toBe(true);
    // The 800 ms slot: the one automatic resolution of this open has been made, so none is made again.
    const publishedBefore = h.published.length;
    const slot = await h.coordinator.resolve(h.root, true);
    expect(h.published).toHaveLength(publishedBefore);
    expect(slot.view.running).toBe(true);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  /** The same, with the skip landing while the slot's resolution is still checking applicability: it waits for that one. */
  it('waits for an automatic resolution already under way before recording a skip (REQ-WORKSPACE-083, REQ-WORKSPACE-084, REQ-WORKSPACE-102)', async () => {
    let release: () => void = () => undefined;
    const h = harness({ statusGate: new Promise<void>((r) => { release = r; }) });
    h.coordinator.registry.register(consentTask);
    const slot = h.coordinator.resolve(h.root, true);
    const skipped = h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
    await new Promise((r) => setImmediate(r));
    // Nothing is recorded while the resolution has not decided what it starts.
    expect(readInitializationState(h.agents).skipped).toEqual([]);
    release();
    await slot;
    expect(await skipped).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['verification-consent']);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(readInitializationState(h.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });

  /** REQ-WORKSPACE-086: when the resolution a skip performs first starts nothing, the skip records every given id. */
  it('records every given id when the resolution a skip performs first starts nothing (REQ-WORKSPACE-086)', async () => {
    const h = harness({ applicable: false });
    h.coordinator.registry.register(consentTask);
    expect(await h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
    expect(h.published.at(-1)!.view.running).toBe(false);
    expect(readInitializationState(h.agents).skipped).toEqual([CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
  });

  /**
   * `docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`: the resolution a skip performs first
   * publishes the background run while the skip is still in flight, and the dialog is still open. Main cannot order a
   * push behind the command's reply, so every view that shows that run must say it is a background run. That is what
   * the dialog reads to leave it undrawn (REQ-WORKSPACE-103) and what keeps the prompt due (OQ-123).
   */
  it('marks every view published during a skip that shows a run in progress as a background run (REQ-WORKSPACE-083, REQ-WORKSPACE-103)', async () => {
    const h = harness();
    h.coordinator.registry.register(consentTask);
    expect((await h.coordinator.read(h.root)).backgroundRun).toBe(false);
    const before = h.published.length;
    expect(await h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
    const during = h.published.slice(before);
    expect(during.some((v) => v.view.running)).toBe(true);
    for (const v of during.filter((x) => x.view.running || x.report.running)) expect(v.backgroundRun).toBe(true);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    // The finished report still describes the background run, so a dialog still open does not take its outcome either.
    const last = h.published.at(-1)!;
    expect(last.view.running).toBe(false);
    expect(last.report.outcome).toBe('reported');
    expect(last.backgroundRun).toBe(true);
  });

  /** REQ-WORKSPACE-106/110: a run the user starts is the dialog's own, so it is published as no background run. */
  it('publishes a run the user starts as no background run (REQ-WORKSPACE-106, REQ-WORKSPACE-110)', async () => {
    const h = harness({ applicable: false });
    let finish: () => void = () => undefined;
    const held = new Promise<void>((r) => { finish = r; });
    h.coordinator.registry.register({ ...consentTask, run: async () => { await held; return await consentTask.run(); } });
    await h.coordinator.resolve(h.root, true);
    const before = h.published.length;
    expect(await h.coordinator.start(h.root)).toEqual({ ok: true });
    await new Promise((r) => setImmediate(r));
    finish();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const during = h.published.slice(before);
    expect(during.some((v) => v.report.running)).toBe(true);
    for (const v of during) expect(v.backgroundRun).toBe(false);
    expect(readInitializationState(h.agents).completed).toEqual(['verification-consent']);
  });

  /**
   * `docs/defects/fixed/a-skip-can-move-a-completed-task-into-skipped.md`: with the open resolved and the background run
   * live, the dialog stays in its prompt state and Skip is live. The skip used to recompute the view before filtering,
   * which is a run-host status read, and a run that ended inside that read had its completed id moved into `skipped`.
   * A skip after the resolution now reads nothing more before it records (REQ-WORKSPACE-084, REQ-WORKSPACE-086).
   */
  it('leaves a background task completed when its run ends while a skip after the resolution is in flight (REQ-WORKSPACE-084, REQ-WORKSPACE-086)', async () => {
    const hold: StatusHold = { current: null };
    const h = harness({ hold });
    h.coordinator.registry.register(consentTask);
    await h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    expect(h.published.at(-1)!.view.running).toBe(true);
    // Every status read from here on is held until the run has ended.
    let release: () => void = () => undefined;
    hold.current = new Promise<void>((r) => { release = r; });
    const skipped = h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    release();
    expect(await skipped).toEqual({ ok: true });
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  /**
   * The same note, on the path where the skip performs the open's resolution first (OQ-122): the resolution starts the
   * background run and then reads the view once more, and a run that ends inside that read is recorded completed before
   * the skip records. The skip leaves a completed id where it is (REQ-WORKSPACE-084, REQ-WORKSPACE-086).
   */
  it('leaves a background task completed when its run ends while the resolution a skip performs first is still reading (REQ-WORKSPACE-084, REQ-WORKSPACE-086)', async () => {
    const hold: StatusHold = { current: null };
    let release: () => void = () => undefined;
    // The run's start is the moment to hold every later status read, the resolution's own last one among them.
    const h = harness({ hold, onStart: () => { hold.current = new Promise<void>((r) => { release = r; }); } });
    h.coordinator.registry.register(consentTask);
    const skipped = h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    expect(hold.current).not.toBeNull();
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    expect(readInitializationState(h.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    release();
    expect(await skipped).toEqual({ ok: true });
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  /**
   * The verifier's two orderings of a skip against the background run's own recording, both reachable because Skip and
   * Escape stay live for the whole background run (`docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`).
   * Both patches replace the two lists whole (REQ-CONFIG-050), so whichever lands second erased the other unless it was
   * built from what the first left on disk. (A) The skip arrives while the run's completion write is in flight: it was
   * built from the in-memory state, which the write had not yet reached, and erased `completed` (REQ-WORKSPACE-084).
   */
  it('keeps the run\'s completed outcome when a skip arrives while the completion write is in flight (REQ-WORKSPACE-084, REQ-WORKSPACE-086)', async () => {
    const writeHold: StatusHold = { current: null };
    const h = harness({ writeHold });
    h.coordinator.registry.register(consentTask);
    await h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    expect(h.published.at(-1)!.view.running).toBe(true);
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    // The run's completion write is sent and held; nothing is on disk yet.
    expect(readInitializationState(h.agents).completed).toEqual([]);
    const skipped = h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    release();
    expect(await skipped).toEqual({ ok: true });
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  /**
   * (B) The skip's write is in flight when the task finishes: the run re-read the disk before the skip had landed and its
   * recording then erased the skip, so the prompt returned on the next open (REQ-WORKSPACE-111, REQ-WORKSPACE-086).
   */
  it('keeps a skip whose write is in flight when the background run records its outcome (REQ-WORKSPACE-086, REQ-WORKSPACE-111)', async () => {
    const writeHold: StatusHold = { current: null };
    const h = harness({ writeHold });
    h.coordinator.registry.register(consentTask);
    await h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    expect(h.published.at(-1)!.view.running).toBe(true);
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    const skipped = h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    // The skip's write is sent and held; nothing is on disk yet.
    expect(readInitializationState(h.agents).skipped).toEqual([]);
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    release();
    expect(await skipped).toEqual({ ok: true });
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
    const after = readInitializationState(h.agents);
    expect(after.completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(after.skipped).toEqual(['verification-consent']);
  });

  /**
   * The queue is one per workspace root. A workspace opened while the one it replaced still has a marker write in flight
   * resolves without waiting for that write (REQ-WORKSPACE-013), and the held write still lands in its own file after.
   */
  it('lets a newly opened workspace record while the previous workspace\'s marker write is still in flight (REQ-WORKSPACE-013, REQ-WORKSPACE-083)', async () => {
    const writeHold: StatusHold = { current: null };
    const h = harness({ applicable: false, writeHold });
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    // The first workspace's silent stamp is sent and held.
    const first = h.coordinator.resolve(h.root, true);
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    expect(readInitializationState(h.agents).lastRun).toBeNull();
    writeHold.current = null;
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    let secondDone = false;
    const second = h.coordinator.resolve(other.root, true).then((s) => { secondDone = true; return s; });
    for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
    expect(secondDone).toBe(true);
    expect(readInitializationState(other.agents).lastRun).toBe('2026-09-15T12:00:00.000Z');
    expect(readInitializationState(h.agents).lastRun).toBeNull();
    release();
    await first;
    await second;
    expect(readInitializationState(h.agents).lastRun).toBe('2026-09-15T12:00:00.000Z');
  });

  /** Once the open's resolution has run and nothing is running, a listed background task is skipped as listed (REQ-WORKSPACE-086/111). */
  it('records a listed background task as skipped once the open has resolved and nothing is running (REQ-WORKSPACE-086, REQ-WORKSPACE-111)', async () => {
    const h = harness({ startRefusal: RUNNING_REFUSAL });
    // The resolution starts the background task, which fails and records nothing, so it stays pending (REQ-WORKSPACE-084).
    await h.coordinator.resolve(h.root, true);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect(await h.coordinator.skip(h.root, [CODE_INTELLIGENCE_TASK_ID])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });

  it('reports a persistence failure rather than absorbing it', async () => {
    const h = harness({ writeFails: 'the file is read-only' });
    expect(await h.coordinator.skip(h.root, ['a'])).toEqual({ ok: false, reason: 'the file is read-only' });
  });

  /** REQ-WORKSPACE-110: nothing left to run says so. */
  it('refuses a start with nothing runnable', async () => {
    const h = harness({ applicable: false });
    expect(await h.coordinator.start(h.root)).toEqual({ ok: false, headline: 'Everything in this workspace is already set up.', detail: '' });
  });

  /** REQ-WORKSPACE-110: a consent task with no reachable model fails fast. */
  it('refuses up front when a consent task needs a provider and none is reachable', async () => {
    const h = harness({ modelReachable: false });
    h.coordinator.registry.register({
      id: 'asks', label: 'Asks', description: 'runs an agent', requiresConsent: true,
      applicable: () => true,
      run: async () => ({ status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' }),
    });
    expect(await h.coordinator.start(h.root)).toEqual({
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
    const state = await h.coordinator.read(h.root);
    expect(state.view.lastRun).toBe('2026-09-01T00:00:00.000+00:00');
    expect(state.view.classification).toBe('code');
    // In-progress and last-error describe this session only, never disk.
    expect(state.view.running).toBe(false);
    expect(state.view.lastError).toBeNull();
    // Every other top-level key of the file is still there.
    expect(readFileSync(h.agents, 'utf8')).toContain('permission_mode: ask');
  });
});

/** Lets every promise chain the coordinator has started run as far as it can. */
async function settle(turns = 12): Promise<void> {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
}

const completedSetup = (): McpSetupStatus => status({ state: 'finished', outcome: 'completed', containsCode: true, steps: [step('create', 'succeeded', 'made'), step('index', 'succeeded', 'indexed'), step('memory', 'succeeded', 'seeded')] });
const cancelledSetup = (): McpSetupStatus => status({ state: 'finished', outcome: 'cancelled', message: 'The setup was cancelled; the workspace is only partly set up.', containsCode: true, steps: [step('create', 'succeeded', 'made'), step('index', 'failed', 'Setup was stopped before this step finished.'), step('memory', 'not-attempted')] });

/**
 * REQ-WORKSPACE-013: a workspace switch cancels the outgoing workspace's run on REQ-WORKSPACE-109's terms, records nothing
 * for it, and resolves the replacement independently; a later open of the same root is a new open (REQ-WORKSPACE-102).
 * `docs/defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`.
 */
describe('closing a workspace', () => {
  it('cancels the closed workspace\'s live run, records nothing for it even when the task under way succeeds, and publishes nothing of it (REQ-WORKSPACE-013, REQ-WORKSPACE-109, REQ-WORKSPACE-092)', async () => {
    let cancels = 0;
    const h = harness({ onCancel: () => { cancels += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    expect(h.published.at(-1)?.view.running).toBe(true);
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    h.coordinator.close(h.root);
    await settle();
    // REQ-WORKSPACE-092: the run host is asked to end what the setup launched.
    expect(cancels).toBe(1);
    const publishedAtClose = h.published.length;
    // The task under way reaches its own conclusion — here it completed before the cancellation reached it.
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect(readInitializationState(h.agents).lastRun).toBeNull();
    expect(h.writes).toEqual([]);
    // Nothing of the closed workspace reaches the windows, which are all another workspace's now.
    expect(h.published).toHaveLength(publishedAtClose);
    expect(h.banners).toEqual([]);
  });

  it('says in the log when the setup\'s cancellation could not be delivered (REQ-WORKSPACE-092, REQ-WORKSPACE-013)', async () => {
    const h = harness({ onCancel: () => { throw new Error('the run host refused it: That workspace is not open in the run host'); } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    h.coordinator.close(h.root);
    await settle();
    expect(h.logs).toContainEqual({ level: 'warn', message: "initialization: the setup's cancellation could not be delivered (Error: the run host refused it: That workspace is not open in the run host)" });
  });

  it('treats a setup cancellation as delivered only when the run host took it (REQ-WORKSPACE-092)', async () => {
    const sent: string[] = [];
    await expect(deliverSetupCancel('ws-1', async (id) => { sent.push(id); return { kind: 'mcp.setup' }; })).resolves.toBeUndefined();
    expect(sent).toEqual(['ws-1']);
    // A refusal is an answer, not a delivery.
    await expect(deliverSetupCancel('ws-2', async () => ({ kind: 'refused', headline: 'That workspace is not open in the run host' }))).rejects.toThrow('the run host refused it: That workspace is not open in the run host');
    await expect(deliverSetupCancel('ws-3', async () => ({ kind: 'error' }))).rejects.toThrow('the run host answered error');
  });

  it('raises no banner for a closed workspace\'s background run that ends in failure (REQ-WORKSPACE-013, REQ-WORKSPACE-103)', async () => {
    const h = harness();
    await h.coordinator.resolve(h.root, true);
    await settle();
    h.coordinator.close(h.root);
    h.push(cancelledSetup());
    await settle();
    expect(h.banners).toEqual([]);
    expect(readInitializationState(h.agents).lastRun).toBeNull();
  });

  it('resolves automatically again when the closed workspace is opened again (REQ-WORKSPACE-102, REQ-WORKSPACE-013)', async () => {
    let starts = 0;
    const h = harness({ onStart: () => { starts += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    expect(starts).toBe(1);
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    h.coordinator.close(h.root);
    h.push(cancelledSetup());
    await settle();
    // The switch back: a new open, with its own automatic resolution, which starts the still-pending task again.
    h.coordinator.close(other.root);
    h.coordinator.open(h.root, h.agents, 'ws-h');
    const state = await h.coordinator.resolve(h.root, true);
    expect(state.view.pending).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    await settle();
    expect(starts).toBe(2);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(h.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });

  it('starts nothing for a workspace closed while its resolution was still reading (REQ-WORKSPACE-013)', async () => {
    let starts = 0;
    const hold: StatusHold = { current: null };
    const h = harness({ hold, onStart: () => { starts += 1; } });
    let release: () => void = () => undefined;
    hold.current = new Promise<void>((r) => { release = r; });
    const resolving = h.coordinator.resolve(h.root, true);
    await settle();
    h.coordinator.close(h.root);
    hold.current = null;
    release();
    await resolving;
    await settle();
    expect(starts).toBe(0);
    expect(readInitializationState(h.agents).lastRun).toBeNull();
  });

  /**
   * REQ-WORKSPACE-102's error surface is the failing window's; once its workspace is closed there is none, and channel 12's
   * banner reaches every live window. The silent stamp of a workspace with nothing applicable is the resolution's one write,
   * and main's marker request rejects when the service gives no reply within its bound; here the write is made to reject
   * (`docs/defects/fixed/a-closed-workspaces-resolution-can-still-raise-the-resolution-failed-banner.md`).
   */
  it('raises the resolution-failed banner when an open workspace\'s silent stamp throws (REQ-WORKSPACE-102)', async () => {
    const failing = Promise.reject(new Error('link closed'));
    failing.catch(() => undefined);
    const h = harness({ applicable: false, writeHold: { current: failing } });
    const state = await h.coordinator.resolve(h.root, true);
    expect(state.resolutionFailed).toBe(true);
    expect(h.banners).toEqual([{ headline: 'Project setup could not be checked', detail: 'Rotaris could not work out whether this workspace still needs setting up. Runs are not blocked; you can check again.' }]);
    expect(h.logs).toContainEqual({ level: 'warn', message: `initialization: resolution failed for ${h.root} (Error: link closed)` });
  });

  it('raises no resolution-failed banner when a workspace closed while its silent stamp was in flight then fails it, and says so in the log (REQ-WORKSPACE-013, REQ-WORKSPACE-102, OQ-141)', async () => {
    let fail: (cause: Error) => void = () => undefined;
    const writeHold: StatusHold = { current: new Promise<void>((_, reject) => { fail = reject; }) };
    const h = harness({ applicable: false, writeHold });
    const resolving = h.coordinator.resolve(h.root, true);
    await settle();
    // The stamp's write is in flight when the switch lands: the replacement opens and this workspace closes.
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    h.coordinator.close(h.root);
    const publishedAtClose = h.published.length;
    fail(new Error('link closed'));
    await resolving;
    await settle();
    expect(h.banners).toEqual([]);
    expect(h.published).toHaveLength(publishedAtClose);
    expect(h.logs).toContainEqual({ level: 'info', message: `initialization: resolution failed for ${h.root}, which was closed while it was under way, so nothing is shown (Error: link closed)` });
    expect(h.logs.filter((l) => l.level === 'warn')).toEqual([]);
    expect(readInitializationState(h.agents).lastRun).toBeNull();
  });

  it('keeps answering for the workspace still open in another window when one of two closes (REQ-WORKSPACE-013)', async () => {
    const h = harness({ applicable: false });
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    h.coordinator.close(other.root);
    const state = await h.coordinator.resolve(h.root, true);
    // The silent stamp lands in the workspace that is still open, and nowhere else.
    expect(state.view.neverInitialized).toBe(false);
    expect(readInitializationState(h.agents).lastRun).toBe('2026-09-15T12:00:00.000Z');
    expect(readInitializationState(other.agents).lastRun).toBeNull();
  });
});

/**
 * REQ-WORKSPACE-109/084: the run host holds one setup, and its status reaches the coordinator on one channel with no
 * workspace on it. A closed workspace's run that is still ending must neither take the replacement run's statuses nor
 * clear the step sink the replacement installed; the replacement's setup starts once the outgoing one has ended.
 * `docs/defects/fixed/a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`.
 */
describe('one setup at a time across a workspace switch', () => {
  it('follows the replacement\'s run to its own recorded outcome while the closed workspace\'s setup is still ending (REQ-WORKSPACE-109, REQ-WORKSPACE-084, REQ-WORKSPACE-013)', async () => {
    let starts = 0;
    const h = harness({ onStart: () => { starts += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    expect(starts).toBe(1);
    // The switch: the replacement opens and the outgoing workspace closes; its setup is asked to cancel and is still ending.
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    h.coordinator.close(h.root);
    const replacement = await h.coordinator.resolve(other.root, true);
    // The replacement's resolution does not wait on the cancellation (REQ-WORKSPACE-013) …
    expect(replacement.view.pending).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    await settle();
    // … but its setup does not start while the run host's one setup is still the outgoing workspace's.
    expect(starts).toBe(1);
    // The outgoing setup ends, cancelled; that finish is the outgoing run's, not the replacement's.
    h.push(cancelledSetup());
    await settle();
    expect(starts).toBe(2);
    expect(h.published.at(-1)?.view.running).toBe(true);
    // The replacement's own steps are reported as they finish, and its outcome recorded.
    h.push(status({ steps: [step('create', 'succeeded', 'made'), step('index', 'pending'), step('memory', 'pending')] }));
    await settle();
    expect(h.published.at(-1)?.report.currentSteps.map((s) => s.name)).toEqual(['Project configuration']);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(h.published.at(-1)?.view.running).toBe(false);
    expect(h.published.at(-1)?.report.tasks[0]?.status).toBe('success');
    expect(readInitializationState(h.agents).completed).toEqual([]);
  });

  it('keeps the replacement\'s step sink when the previous workspace\'s run ends after the replacement\'s setup has started (REQ-WORKSPACE-109, REQ-WORKSPACE-084)', async () => {
    // The outgoing run's setup had already ended when the switch landed; its run is still recording (held here) when the
    // replacement's setup starts, and its end must not clear the replacement's sink.
    const writeHold: StatusHold = { current: null };
    const h = harness({ writeHold });
    await h.coordinator.resolve(h.root, true);
    await settle();
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    h.push(completedSetup());
    await settle();
    writeHold.current = null;
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    expect(h.published.at(-1)?.view.running).toBe(true);
    // The first workspace's recording lands and its run ends, after the replacement's setup has started.
    release();
    await settle();
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(h.published.at(-1)?.view.running).toBe(false);
  });

  it('leaves the next workspace\'s setup running when a workspace whose setup has ended is closed while its run still records (REQ-WORKSPACE-013, REQ-WORKSPACE-109, REQ-WORKSPACE-084)', async () => {
    // The first workspace's setup has finished and its run is recording (held here); the second workspace's setup has
    // started behind it. Closing the first workspace then cancels its run, whose own setup is over: the run host's one
    // setup is the second workspace's, and it must not be asked to cancel.
    let starts = 0;
    let cancels = 0;
    const writeHold: StatusHold = { current: null };
    const h = harness({ writeHold, onStart: () => { starts += 1; }, onCancel: () => { cancels += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    h.push(completedSetup());
    await settle();
    writeHold.current = null;
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    expect(starts).toBe(2);
    h.coordinator.close(h.root);
    release();
    await settle();
    expect(cancels).toBe(0);
    // The second workspace's setup is still its own, and reaches its recorded outcome with no banner.
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(h.banners).toEqual([]);
  });

  it('leaves the next workspace\'s setup running when the user cancels a run whose setup has ended while it still records (REQ-WORKSPACE-109, REQ-WORKSPACE-084)', async () => {
    let cancels = 0;
    const writeHold: StatusHold = { current: null };
    const h = harness({ writeHold, onCancel: () => { cancels += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    h.push(completedSetup());
    await settle();
    writeHold.current = null;
    // A second window's workspace starts its setup; the first window's Cancel is then pressed, for the first window's own
    // workspace.
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    await h.coordinator.cancel(h.root);
    release();
    await settle();
    expect(cancels).toBe(0);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });

  it('cancels the setup of a workspace closed while its start request is in flight, and starts the replacement\'s once it has ended (REQ-WORKSPACE-013, REQ-WORKSPACE-109, REQ-WORKSPACE-092)', async () => {
    // The run host has been asked to start the setup and has not answered yet when the switch lands. The abort then
    // comes before the follow listens for it, and must still reach the run host once the start has answered.
    let starts = 0;
    let cancels = 0;
    const startHold: StatusHold = { current: null };
    let answer: () => void = () => undefined;
    startHold.current = new Promise<void>((r) => { answer = r; });
    const h = harness({ startHold, onStart: () => { starts += 1; }, onCancel: () => { cancels += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    expect(starts).toBe(1);
    startHold.current = null;
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    h.coordinator.close(h.root);
    await h.coordinator.resolve(other.root, true);
    answer();
    await settle();
    // REQ-WORKSPACE-092: the run host is asked to end what the outgoing setup launched …
    expect(cancels).toBe(1);
    // … and the replacement's setup waits for it, then starts once the cancelled finish is pushed.
    expect(starts).toBe(1);
    h.push(cancelledSetup());
    await settle();
    expect(starts).toBe(2);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect(cancels).toBe(1);
  });

  it('cancels the setup of a run the user cancels while its start request is in flight (REQ-WORKSPACE-109, REQ-WORKSPACE-092)', async () => {
    let cancels = 0;
    const startHold: StatusHold = { current: null };
    let answer: () => void = () => undefined;
    startHold.current = new Promise<void>((r) => { answer = r; });
    const h = harness({ startHold, onCancel: () => { cancels += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    startHold.current = null;
    await h.coordinator.cancel(h.root);
    answer();
    await settle();
    expect(cancels).toBe(1);
    h.push(cancelledSetup());
    await settle();
    expect(h.published.at(-1)?.view.running).toBe(false);
    expect(h.published.at(-1)?.report.outcome).toBe('cancelled');
  });

  it('ends a run cancelled while its setup waits for another as a retryable failure, starting nothing, and keeps the order for the next (REQ-WORKSPACE-109, REQ-WORKSPACE-093)', async () => {
    let starts = 0;
    const h = harness({ onStart: () => { starts += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    expect(starts).toBe(1);
    // A second window's workspace: its background run waits behind the first workspace's setup.
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    expect(starts).toBe(1);
    await h.coordinator.cancel(other.root);
    await settle();
    const cancelled = h.published.at(-1)!;
    expect(cancelled.view.running).toBe(false);
    expect(cancelled.report.outcome).toBe('cancelled');
    expect(cancelled.report.tasks[0]).toMatchObject({ status: 'failure', retryable: true, error: CANCELLED_BEFORE_SETUP_ERROR, summary: CODE_INTELLIGENCE_FAILED_SUMMARY });
    expect(starts).toBe(1);
    // Started again, it still waits for the first workspace's setup, and starts once that has ended.
    expect(await h.coordinator.start(other.root)).toEqual({ ok: true });
    await settle();
    expect(starts).toBe(1);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(h.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(starts).toBe(2);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });
});

/**
 * REQ-WORKSPACE-109/084/093: a setup's follow ends only on a `finished` status, and every later setup waits for it
 * (`setupTurn`). When that status can never arrive — the run host exits mid-setup, and main never forks another — or a push
 * is lost, the follow must still end, as a retryable failure, and release its turn
 * (`docs/defects/fixed/nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`).
 */
describe('a setup whose finished status never arrives', () => {
  it('ends the follow as a retryable failure when the run host exits, and starts the setup queued behind it (REQ-WORKSPACE-109, REQ-WORKSPACE-084, REQ-WORKSPACE-093)', async () => {
    let starts = 0;
    const h = harness({ onStart: () => { starts += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    expect(starts).toBe(1);
    h.push(status({ steps: [step('create', 'succeeded', 'made'), step('index', 'running'), step('memory', 'pending')] }));
    await settle();
    // A second window's workspace: its background run waits behind the first workspace's setup.
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    expect(starts).toBe(1);
    h.coordinator.onRunHostExit(1);
    await settle();
    // The first run ends as REQ-WORKSPACE-093's retryable failure, under the stage that was running; nothing is recorded.
    const error = `Code intelligence could not index this project's symbols: ${SETUP_RUN_HOST_EXITED_DETAIL}`;
    expect(h.logs).toContainEqual({ level: 'info', message: `initialization: ${CODE_INTELLIGENCE_TASK_ID} → failure — ${error}` });
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect(readInitializationState(h.agents).lastRun).toBeNull();
    expect(h.banners).toEqual([{ headline: 'Project setup did not finish', detail: CODE_INTELLIGENCE_FAILED_SUMMARY }]);
    // The queued run's setup starts, and is followed to its own outcome.
    expect(starts).toBe(2);
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
  });

  it('ends the follow as a retryable failure once the setup has outlasted every stage budget and its stop grace, and starts the setup queued behind it (REQ-WORKSPACE-091, REQ-WORKSPACE-092, REQ-WORKSPACE-109)', async () => {
    let starts = 0;
    const h = harness({ onStart: () => { starts += 1; } });
    await h.coordinator.resolve(h.root, true);
    await settle();
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    expect(starts).toBe(1);
    // 300 + 1800 + 120 s of budgets, and REQ-WORKSPACE-092's 5 s for each stage's processes to be ended.
    expect(SETUP_FOLLOW_BOUND_MS).toBe(2_235_000);
    h.clock.advance(SETUP_FOLLOW_BOUND_MS - 1);
    await settle();
    expect(starts).toBe(1);
    h.clock.advance(1);
    await settle();
    const error = `Code intelligence could not complete this project's setup: ${SETUP_OVERDUE_DETAIL}`;
    expect(h.logs).toContainEqual({ level: 'info', message: `initialization: ${CODE_INTELLIGENCE_TASK_ID} → failure — ${error}` });
    expect(h.logs.some((l) => l.level === 'warn' && l.message.includes('no finished status'))).toBe(true);
    expect(starts).toBe(2);
    // The queued run's setup is followed to its own outcome.
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(readInitializationState(h.agents).completed).toEqual([]);
  });

  it('leaves a follow that ended in time unaffected by a later run-host exit or the bound (REQ-WORKSPACE-084)', async () => {
    const h = harness();
    await h.coordinator.resolve(h.root, true);
    await settle();
    h.push(completedSetup());
    await settle();
    h.coordinator.onRunHostExit(0);
    h.clock.advance(SETUP_FOLLOW_BOUND_MS);
    await settle();
    expect(readInitializationState(h.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(h.banners).toEqual([]);
  });
});

/**
 * PD-SHELL-001: two main windows, one per project, alive at once. Each window's surfaces ask about their own workspace, and
 * every answer, recording, publication and setup-port call is that workspace's alone (REQ-WORKSPACE-013/102/105). Before,
 * the coordinator held one "active" root — the one opened last — and answered every window with it, published every state
 * to every window, and main addressed the setup port by the focused window's workspace
 * (`docs/defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`).
 */
describe('two workspaces open at once, one per window', () => {
  const consentTask = (id: string): InitializationTask => ({
    id, label: id, description: 'asks', requiresConsent: true, applicable: () => true,
    run: async () => ({ status: 'success', steps: [], classification: null, error: '', retryable: false, summary: '' }),
  });

  it('records a Skip on the first window\'s workspace in that workspace only, and publishes it for that workspace only (REQ-WORKSPACE-013, REQ-WORKSPACE-086, REQ-WORKSPACE-105)', async () => {
    const h = harness({ applicable: false });
    h.coordinator.registry.register(consentTask('verification-consent'));
    const other = workspace();
    await h.coordinator.resolve(h.root, true);
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    const before = h.published.length;
    expect(await h.coordinator.skip(h.root, ['verification-consent'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['verification-consent']);
    expect(readInitializationState(other.agents).skipped).toEqual([]);
    expect(readInitializationState(other.agents).lastRun).toBeNull();
    expect(h.publishedTo.slice(before)).toEqual([h.root]);
    // Each window still reads its own workspace: the first has answered its prompt, the second still owes it.
    expect((await h.coordinator.read(h.root)).view.skipped).toEqual(['verification-consent']);
    expect((await h.coordinator.read(other.root)).view.consentPending).toEqual(['verification-consent']);
  });

  it('leaves the first window\'s view alone when the second window\'s workspace resolves automatically (REQ-WORKSPACE-102, REQ-WORKSPACE-105)', async () => {
    const h = harness({ applicable: false });
    writeFileSync(h.agents, 'initialization:\n  completed: []\n  skipped: []\n  last_run: "2026-09-01T00:00:00.000+00:00"\n  classification: code\n');
    await h.coordinator.resolve(h.root, true);
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    const before = h.published.length;
    // The second workspace's own automatic resolution: it has never been initialized, so it is stamped silently.
    await h.coordinator.resolve(other.root, true);
    expect(readInitializationState(other.agents).lastRun).toBe('2026-09-15T12:00:00.000Z');
    expect(h.publishedTo.slice(before).every((root) => root === other.root)).toBe(true);
    // The first window's state is still its own workspace's, and its own automatic resolution is still spent.
    const first = await h.coordinator.read(h.root);
    expect(first.view.lastRun).toBe('2026-09-01T00:00:00.000+00:00');
    expect(first.view.classification).toBe('code');
    const writes = h.writes.length;
    await h.coordinator.resolve(h.root, true);
    expect(h.writes).toHaveLength(writes);
    expect(readInitializationState(h.agents).lastRun).toBe('2026-09-01T00:00:00.000+00:00');
  });

  it('starts, follows and cancels each workspace\'s setup by that workspace\'s own identifier, whichever was opened last (REQ-WORKSPACE-013, REQ-WORKSPACE-092, REQ-WORKSPACE-109)', async () => {
    const h = harness();
    await h.coordinator.resolve(h.root, true);
    await settle();
    const other = workspace();
    h.coordinator.open(other.root, other.agents, 'ws-other');
    await h.coordinator.resolve(other.root, true);
    await settle();
    expect(h.addressed.filter((a) => a.call !== 'status')).toEqual([{ call: 'start', workspaceId: 'ws-h' }]);
    // The first window's Cancel: the first workspace's run, and its setup, addressed by its own identifier; what it changes
    // is published for the first workspace only.
    const beforeCancel = h.published.length;
    await h.coordinator.cancel(h.root);
    await settle();
    expect(h.addressed.filter((a) => a.call !== 'status')).toEqual([{ call: 'start', workspaceId: 'ws-h' }, { call: 'cancel', workspaceId: 'ws-h' }]);
    expect(h.publishedTo.slice(beforeCancel).every((root) => root === h.root)).toBe(true);
    expect((await h.coordinator.read(other.root)).view.running).toBe(true);
    // The first setup ends cancelled; the second workspace's queued setup starts, for the second workspace.
    h.push(cancelledSetup());
    await settle();
    expect(h.addressed.filter((a) => a.call !== 'status').at(-1)).toEqual({ call: 'start', workspaceId: 'ws-other' });
    // Each workspace's applicability was judged against its own configuration.
    expect(new Set(h.addressed.filter((a) => a.call === 'status').map((a) => a.workspaceId))).toEqual(new Set(['ws-h', 'ws-other']));
    h.push(completedSetup());
    await settle();
    expect(readInitializationState(other.agents).completed).toEqual([CODE_INTELLIGENCE_TASK_ID]);
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect((await h.coordinator.read(h.root)).report.outcome).toBe('cancelled');
    expect((await h.coordinator.read(other.root)).report.tasks[0]?.status).toBe('success');
  });

  it('answers a root no window holds with the empty state and starts nothing for it (REQ-WORKSPACE-105)', async () => {
    const h = harness();
    const stranger = workspace();
    expect((await h.coordinator.read(stranger.root)).view.pending).toEqual([]);
    expect(await h.coordinator.start(stranger.root)).toEqual({ ok: false, headline: 'No workspace is open', detail: 'Open a workspace before running its setup.' });
    expect(h.addressed).toEqual([]);
    expect(h.published).toEqual([]);
  });
});
