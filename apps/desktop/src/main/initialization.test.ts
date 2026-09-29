import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import type { InitializationStateView, McpSetupStatus, McpSetupStep } from '@rotaris/contracts';
import { readInitializationState, writeConfigFields, type PlainMap } from '@rotaris/config';
import {
  CODE_INTELLIGENCE_FAILED_SUMMARY, CODE_INTELLIGENCE_SUCCESS_CODE, CODE_INTELLIGENCE_SUCCESS_NON_CODE,
  CODE_INTELLIGENCE_TASK_ID, InitializationCoordinator, NOT_A_LOCAL_LAUNCH_ERROR,
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
  readonly root: string;
  readonly agents: string;
  push(s: McpSetupStatus): void;
}

/** A hold a test can set at any moment: every setup status read taken while it is set waits on it. */
interface StatusHold { current: Promise<void> | null }

function harness(options: { applicable?: boolean; startFails?: boolean; writeFails?: string | null; modelReachable?: boolean; statusGate?: Promise<void>; hold?: StatusHold; onStart?: () => void; writeHold?: StatusHold } = {}): Harness {
  const { root, agents } = workspace();
  const published: InitializationStateView[] = [];
  const banners: { headline: string; detail: string }[] = [];
  const writes: PlainMap[] = [];
  const clock = new FakeClock(0, Date.parse('2026-09-15T12:00:00Z'));
  // Each workspace's own service applies its marker writes one at a time, in the order they are sent; a write sent
  // while `writeHold` is set lands only once it is released, and every write sent after it to the same root lands after
  // it. Two roots are two services, so nothing orders one root's writes against another's.
  const applied = new Map<string, Promise<unknown>>();
  const coordinator = new InitializationCoordinator({
    clocks: clock,
    log: () => undefined,
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
      start: async () => { options.onStart?.(); return options.startFails ? { ok: false, reason: 'not a local launch' } : { ok: true, status: status() }; },
      cancel: async () => undefined,
      status: async () => { await options.statusGate; await options.hold?.current; return status({ applicable: options.applicable !== false }); },
    },
    publish: (s) => published.push(s),
    banner: (headline, detail) => banners.push({ headline, detail }),
    modelReachable: () => options.modelReachable !== false,
  });
  coordinator.open(root, agents);
  return { coordinator, published, banners, writes, root, agents, push: (s) => coordinator.onSetupStatus(s) };
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

  /** REQ-WORKSPACE-094: a non-local launch is a non-retryable failure and no substitute is attempted. */
  it('fails non-retryably when the entry is not a local launch', async () => {
    const h = harness({ startFails: true });
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    const task = h.published.at(-1)!.report.tasks[0]!;
    expect(task.error).toBe(NOT_A_LOCAL_LAUNCH_ERROR);
    expect(task.retryable).toBe(false);
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
    const mounted = await h.coordinator.read();
    expect(mounted.view.consentPending).toEqual(['verification-consent']);
    expect(mounted.view.running).toBe(false);
    // Escape, before the slot: the dialog listed both runnable tasks.
    expect(await h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual(['verification-consent']);
    expect(h.published.at(-1)!.view.running).toBe(true);
    // The 800 ms slot: the one automatic resolution of this open has been made, so none is made again.
    const publishedBefore = h.published.length;
    const slot = await h.coordinator.resolve(true);
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
    const slot = h.coordinator.resolve(true);
    const skipped = h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
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
    expect(await h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
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
    expect((await h.coordinator.read()).backgroundRun).toBe(false);
    const before = h.published.length;
    expect(await h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent'])).toEqual({ ok: true });
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
    await h.coordinator.resolve(true);
    const before = h.published.length;
    expect(await h.coordinator.start()).toEqual({ ok: true });
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
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    expect(h.published.at(-1)!.view.running).toBe(true);
    // Every status read from here on is held until the run has ended.
    let release: () => void = () => undefined;
    hold.current = new Promise<void>((r) => { release = r; });
    const skipped = h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
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
    const skipped = h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
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
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    expect(h.published.at(-1)!.view.running).toBe(true);
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    h.push(status({ state: 'finished', outcome: 'completed', containsCode: false, steps: [step('create', 'succeeded', 'made')] }));
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    // The run's completion write is sent and held; nothing is on disk yet.
    expect(readInitializationState(h.agents).completed).toEqual([]);
    const skipped = h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
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
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    expect(h.published.at(-1)!.view.running).toBe(true);
    let release: () => void = () => undefined;
    writeHold.current = new Promise<void>((r) => { release = r; });
    const skipped = h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID, 'verification-consent']);
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
    const first = h.coordinator.resolve(true);
    for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
    expect(readInitializationState(h.agents).lastRun).toBeNull();
    writeHold.current = null;
    const other = workspace();
    h.coordinator.open(other.root, other.agents);
    let secondDone = false;
    const second = h.coordinator.resolve(true).then((s) => { secondDone = true; return s; });
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
    const h = harness({ startFails: true });
    // The resolution starts the background task, which fails and records nothing, so it stays pending (REQ-WORKSPACE-084).
    await h.coordinator.resolve(true);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(readInitializationState(h.agents).completed).toEqual([]);
    expect(await h.coordinator.skip([CODE_INTELLIGENCE_TASK_ID])).toEqual({ ok: true });
    expect(readInitializationState(h.agents).skipped).toEqual([CODE_INTELLIGENCE_TASK_ID]);
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
