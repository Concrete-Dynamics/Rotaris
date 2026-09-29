import { toIsoUtc, type Clocks } from '@rotaris/kernel';
import {
  BACKGROUND_BROKE_DOWN, BACKGROUND_FAILED_FALLBACK, BACKGROUND_FAILED_HEADLINE,
  EMPTY_INITIALIZATION_VIEW, EMPTY_RUN_REPORT, NEEDS_PROVIDER_DETAIL, NEEDS_PROVIDER_HEADLINE,
  NOTHING_LEFT, RESOLUTION_FAILED_DETAIL, RESOLUTION_FAILED_HEADLINE,
  type InitializationStateView, type InitRunReport, type McpSetupStatus,
} from '@rotaris/contracts';
import {
  deriveSets, executeTasks, labelFor, promptOwed, readInitializationState, recordSkip, stampOnly,
  TaskRegistry, viewOf, type InitializationState, type InitializationTask, type PlainMap,
  type TaskResult, type TaskSets, type WorkspaceClassification,
} from '@rotaris/config';

/**
 * ADR-0064 — the project-initialization coordinator (REQ-WORKSPACE-078..115).
 *
 * **Why main owns it.** REQ-WORKSPACE-085 gives the marker exactly one writer, and the file it writes
 * is `<workspace>/.rotaris/agents.yaml`, which the **workspace service** owns and nothing else may
 * touch (ADR-0037 Tier A). The one shipped task's work runs in the **run host**, the only process that
 * holds the MCP resolution and can launch the bundled runtime. Neither of those two is allowed to
 * import the other, and main already brokers between them — so the coordinator sits where the
 * decisions can be made and the effects delegated, and it holds nothing it could resolve itself.
 *
 * **What it refuses to do.** It never inspects a workspace to decide applicability (REQ-WORKSPACE-090
 * says the one availability rule is REQ-MCP-037's, and it is read off the setup status), and it never
 * lets a task write its own outcome (REQ-WORKSPACE-085).
 */

/** REQ-WORKSPACE-088: id, label and description, stated once — the display label every surface shows. */
export const CODE_INTELLIGENCE_TASK_ID = 'code-intelligence-setup';
export const CODE_INTELLIGENCE_TASK_LABEL = 'Code intelligence project setup';
export const CODE_INTELLIGENCE_TASK_DESCRIPTION = "Index this project's symbols so coding personas can search symbols and references without re-reading the tree.";

/** REQ-WORKSPACE-093: one reason per stage, "{reason}: {detail}". */
const STAGE_REASON: Readonly<Record<string, string>> = {
  create: "Code intelligence could not create this project's configuration",
  index: "Code intelligence could not index this project's symbols",
  memory: "Code intelligence could not seed this project's memory layout",
};
export const CODE_INTELLIGENCE_FAILED_SUMMARY = 'Code intelligence setup did not complete for this project. It runs again the next time this workspace is opened.';

/** REQ-WORKSPACE-095: the two success summaries, by classification. */
export const CODE_INTELLIGENCE_SUCCESS_CODE = 'Code intelligence is set up for this project and its symbols are indexed.';
export const CODE_INTELLIGENCE_SUCCESS_NON_CODE = 'Code intelligence is set up for this project. No symbols were indexed because the workspace contains documentation only.';

/** REQ-WORKSPACE-094: the entry is not a local launch — non-retryable, no substitute invocation. */
export const NOT_A_LOCAL_LAUNCH_ERROR = "This workspace's `code_intelligence` entry is not a local launch, so its setup commands cannot be derived from it.";
export const NOT_A_LOCAL_LAUNCH_SUMMARY = 'Code intelligence project setup was skipped: the configured `code_intelligence` server is not one Rotaris can run setup commands against.';

export interface SetupPort {
  /** Starts the run host's setup; the reply is the status as it stands. */
  readonly start: (root: string) => Promise<{ readonly ok: true; readonly status: McpSetupStatus } | { readonly ok: false; readonly reason: string }>;
  readonly cancel: (root: string) => Promise<void>;
  readonly status: (root: string) => Promise<McpSetupStatus | null>;
}

export interface InitializationDeps {
  readonly clocks: Clocks;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
  /** The workspace `agents.yaml` write, routed to the service that owns it. */
  readonly writeMarker: (root: string, patch: PlainMap) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
  readonly setup: SetupPort;
  readonly publish: (root: string, state: InitializationStateView) => void;
  /** REQ-WORKSPACE-103: a failed background run reaches a banner, never a dialog. */
  readonly banner: (headline: string, detail: string) => void;
  /** REQ-WORKSPACE-110: a consent task runs an agent, so it needs a reachable model. */
  readonly modelReachable: () => boolean;
}

interface WorkspaceEntry {
  readonly root: string;
  readonly agentsFile: string;
  state: InitializationState;
  report: InitRunReport;
  running: AbortController | null;
  /**
   * The ids the live run is attempting. Found by ADR-0064's first execution in the built app: the setup
   * prompt lists the **runnable** tasks (REQ-WORKSPACE-083), which on a fresh workspace includes the
   * background task that started itself the same moment — and answering the prompt with Skip then wrote
   * that id into `skipped` while the task was still running, so its own outcome overwrote the skip
   * seconds later. REQ-WORKSPACE-084 gives every ATTEMPTED task exactly one outcome and
   * REQ-WORKSPACE-085 gives the marker one writer; a skip is neither of those for a task already under
   * way, so `skip` drops the ids in here. No unit test could have seen it: the race needs a task that
   * takes real seconds.
   */
  attempting: ReadonlySet<string>;
  lastError: string | null;
  resolutionFailed: boolean;
  /** REQ-WORKSPACE-102: exactly one automatic resolution per workspace open. A "Check again" is additional. */
  resolvedOnce: boolean;
}

/** REQ-WORKSPACE-091: the step names the log and the dialog show, in the requirement's order. */
const STEP_LABEL: Readonly<Record<string, string>> = { create: 'Project configuration', index: 'Symbol indexing', memory: 'Memory-layout seeding' };

export class InitializationCoordinator {
  readonly registry = new TaskRegistry();
  private readonly workspaces = new Map<string, WorkspaceEntry>();
  private active: string | null = null;
  /** The live setup's step sink, set for as long as `code-intelligence-setup` is running. */
  private readonly setupListeners = new Map<string, (status: McpSetupStatus) => void>();

  constructor(private readonly deps: InitializationDeps) {
    this.registry.register(this.codeIntelligenceTask());
  }

  /**
   * REQ-WORKSPACE-088/090/091/093/094/095: the one task the product registers by default. It requires
   * no consent — "its outcome depends only on the workspace contents: it consults no model, needs no
   * authenticated provider, and holds no agent conversation" — so it starts by itself, raises no
   * dialog and gates no run.
   */
  private codeIntelligenceTask(): InitializationTask {
    return {
      id: CODE_INTELLIGENCE_TASK_ID,
      label: CODE_INTELLIGENCE_TASK_LABEL,
      description: CODE_INTELLIGENCE_TASK_DESCRIPTION,
      requiresConsent: false,
      applicable: async (root = this.active ?? '') => (await this.deps.setup.status(root))?.applicable === true,
      run: async (ctx) => {
        const started = await this.deps.setup.start(ctx.workspaceRoot);
        if (!started.ok) return this.failure(`Code intelligence could not start this project's setup: ${started.reason}`, CODE_INTELLIGENCE_FAILED_SUMMARY, true, []);
        return await this.followSetup(ctx.workspaceRoot, started.status, ctx.signal, ctx.onStep);
      },
    };
  }

  private failure(error: string, summary: string, retryable: boolean, steps: TaskResult['steps']): TaskResult {
    return { status: 'failure', steps, classification: null, error, retryable, summary };
  }

  /**
   * REQ-WORKSPACE-109: each step reported the moment it finishes. The status arrives on channel
   * `mcp.setupStatus`, which the run host pushes on every change — no cadence, SR-3.
   */
  private followSetup(root: string, first: McpSetupStatus, signal: AbortSignal, onStep: (s: { name: string; status: string; detail: string }) => void): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve) => {
      const seen = new Map<string, string>();
      const drain = (status: McpSetupStatus): void => {
        for (const step of status.steps) {
          if (step.status === 'pending' || step.status === 'running') continue;
          if (seen.get(step.id) === step.status) continue;
          seen.set(step.id, step.status);
          onStep({ name: STEP_LABEL[step.id] ?? step.label, status: step.status, detail: step.detail });
        }
        if (status.state !== 'finished') return;
        this.setupListeners.delete(root);
        resolve(this.resultOf(status));
      };
      this.setupListeners.set(root, drain);
      const onAbort = (): void => { void this.deps.setup.cancel(root); };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      drain(first);
    });
  }

  /** REQ-WORKSPACE-093/094/095: the task's own result, in this domain's words rather than REQ-MCP-112's. */
  private resultOf(status: McpSetupStatus): TaskResult {
    const steps = status.steps
      .filter((s) => s.status !== 'pending' && s.status !== 'running')
      .map((s) => ({ name: STEP_LABEL[s.id] ?? s.label, status: s.status, detail: s.detail }));
    const classification: WorkspaceClassification | null = status.containsCode === null ? null : status.containsCode ? 'code' : 'non-code';
    if (status.outcome === 'unavailable') return this.failure(NOT_A_LOCAL_LAUNCH_ERROR, NOT_A_LOCAL_LAUNCH_SUMMARY, false, steps);
    if (status.outcome === 'completed') {
      return {
        status: 'success',
        steps,
        classification,
        error: '',
        retryable: false,
        summary: classification === 'non-code' ? CODE_INTELLIGENCE_SUCCESS_NON_CODE : CODE_INTELLIGENCE_SUCCESS_CODE,
      };
    }
    // REQ-WORKSPACE-093: cancelling leaves the task in exactly the same retryable condition a failure would.
    const bad = status.steps.find((s) => s.status === 'failed');
    const reason = bad ? STAGE_REASON[bad.id] ?? `Code intelligence could not complete ${bad.label}` : "Code intelligence could not complete this project's setup";
    const detail = bad?.detail !== undefined && bad.detail !== '' ? bad.detail : status.message;
    return this.failure(`${reason}: ${detail}`, CODE_INTELLIGENCE_FAILED_SUMMARY, true, steps);
  }

  /** The run host pushes here; main routes it in. */
  onSetupStatus(root: string, status: McpSetupStatus): void {
    this.setupListeners.get(root)?.(status);
  }

  // ---- per workspace -----------------------------------------------------------------------------

  private entry(root: string, agentsFile: string): WorkspaceEntry {
    let e = this.workspaces.get(root);
    if (!e) {
      e = { root, agentsFile, state: readInitializationState(agentsFile), report: EMPTY_RUN_REPORT, running: null, attempting: new Set(), lastError: null, resolutionFailed: false, resolvedOnce: false };
      this.workspaces.set(root, e);
    }
    return e;
  }

  /** Which workspace the surfaces are asking about. Main sets it when a window opens one. */
  open(root: string, agentsFile: string): void {
    this.active = root;
    this.entry(root, agentsFile);
  }

  close(root: string): void {
    const e = this.workspaces.get(root);
    e?.running?.abort();
    this.workspaces.delete(root);
    if (this.active === root) this.active = null;
  }

  private current(): WorkspaceEntry | null {
    return this.active === null ? null : this.workspaces.get(this.active) ?? null;
  }

  private write(root: string): (patch: PlainMap) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    return (patch) => this.deps.writeMarker(root, patch);
  }

  private nowIso = (): string => toIsoUtc(this.deps.clocks.wall.instant());

  private async sets(e: WorkspaceEntry): Promise<TaskSets> {
    return await deriveSets(this.registry, e.state, (m) => this.deps.log(m, 'warn'), e.root);
  }

  /** The nine values plus the labels and the live report, as one message. */
  private async viewFor(e: WorkspaceEntry): Promise<InitializationStateView> {
    const sets = await this.sets(e);
    const view = viewOf(e.state, sets, e.running !== null, e.lastError);
    const labels: Record<string, string> = {};
    const descriptions: Record<string, string> = {};
    for (const id of [...view.pending, ...view.completed, ...view.skipped, ...sets.runnable.map((t) => t.id)]) {
      labels[id] = labelFor(this.registry, id);
      descriptions[id] = this.registry.get(id)?.description ?? '';
    }
    return { view, labels, descriptions, report: e.report, resolutionFailed: e.resolutionFailed };
  }

  private async publish(e: WorkspaceEntry): Promise<void> {
    this.deps.publish(e.root, await this.viewFor(e));
  }

  /** REQ-WORKSPACE-115: the persisted section as it is on disk right now, and nothing else disturbed. */
  async read(): Promise<InitializationStateView> {
    const e = this.current();
    if (!e) return { view: EMPTY_INITIALIZATION_VIEW, labels: {}, descriptions: {}, report: EMPTY_RUN_REPORT, resolutionFailed: false };
    // In-progress and last-error describe this session only and are NOT taken from disk.
    e.state = readInitializationState(e.agentsFile);
    const state = await this.viewFor(e);
    this.deps.publish(e.root, state);
    return state;
  }

  /**
   * REQ-WORKSPACE-083: the one resolution. A never-initialized workspace with no applicable task is
   * marked silently; pending background work starts at once; pending consent work raises the prompt.
   * REQ-WORKSPACE-102: automatic exactly once per open, and a user-requested check is additional.
   */
  async resolve(automatic: boolean, root?: string): Promise<InitializationStateView> {
    const e = root === undefined ? this.current() : this.workspaces.get(root) ?? null;
    if (!e) return { view: EMPTY_INITIALIZATION_VIEW, labels: {}, descriptions: {}, report: EMPTY_RUN_REPORT, resolutionFailed: false };
    if (automatic && e.resolvedOnce) return await this.viewFor(e);
    if (automatic) e.resolvedOnce = true;
    try {
      e.state = readInitializationState(e.agentsFile);
      const sets = await this.sets(e);
      e.resolutionFailed = false;
      if (sets.applicable.length === 0 && sets.pending.length === 0) {
        // REQ-WORKSPACE-083: nothing shown, nothing started — and the never-initialized state is left behind.
        if (e.state.lastRun === null) {
          e.state = await stampOnly(e.state, null, { nowIso: this.nowIso, write: this.write(e.root), log: this.deps.log });
          this.deps.log(`initialization: ${e.root} has no applicable task; marked initialized`);
        }
        await this.publish(e);
        return await this.viewFor(e);
      }
      this.deps.log(`initialization: ${e.root} — ${sets.pending.length} pending (${sets.consent.length} needing consent), ${sets.runnable.length} runnable`);
      await this.publish(e);
      // REQ-WORKSPACE-083: background work starts regardless of whether a prompt is also due, and no
      // marker is written up front — it is stamped once that work has run.
      if (sets.background.length > 0 && e.running === null) void this.run(e, sets.background, true);
      // REQ-WORKSPACE-082: the prompt is owed on a pending consent task; the window opens the dialog.
      if (promptOwed(sets)) this.deps.log(`initialization: ${e.root} owes the setup prompt`);
      return await this.viewFor(e);
    } catch (cause) {
      // REQ-WORKSPACE-102: the window stays fully usable and the composer gate stays OFF.
      e.resolutionFailed = true;
      this.deps.log(`initialization: resolution failed for ${e.root} (${String(cause)})`, 'warn');
      this.deps.banner(RESOLUTION_FAILED_HEADLINE, RESOLUTION_FAILED_DETAIL);
      await this.publish(e);
      return await this.viewFor(e);
    }
  }

  /**
   * REQ-WORKSPACE-110: starting re-reads the runnable list, so a retry after a partly successful run
   * offers only what is outstanding, and refuses up front when a listed task needs a model and none is
   * reachable — failing fast instead of starting and surfacing a raw authentication error.
   */
  async start(): Promise<{ readonly ok: true } | { readonly ok: false; readonly headline: string; readonly detail: string }> {
    const e = this.current();
    if (!e) return { ok: false, headline: 'No workspace is open', detail: 'Open a workspace before running its setup.' };
    // REQ-WORKSPACE-110: pressing Initialize while a run is already live starts nothing.
    if (e.running !== null) return { ok: true };
    e.state = readInitializationState(e.agentsFile);
    const sets = await this.sets(e);
    if (sets.runnable.length === 0) return { ok: false, headline: NOTHING_LEFT, detail: '' };
    if (sets.runnable.some((t) => t.requiresConsent === true) && !this.deps.modelReachable()) {
      return { ok: false, headline: NEEDS_PROVIDER_HEADLINE, detail: NEEDS_PROVIDER_DETAIL };
    }
    void this.run(e, sets.runnable, false);
    return { ok: true };
  }

  private async run(e: WorkspaceEntry, tasks: readonly InitializationTask[], background: boolean): Promise<void> {
    const controller = new AbortController();
    e.running = controller;
    e.attempting = new Set(tasks.map((t) => t.id));
    e.lastError = null;
    this.deps.log(`initialization: running ${tasks.map((t) => t.id).join(', ')} for ${e.root}${background ? ' (background)' : ''}`);
    try {
      const result = await executeTasks(tasks, e.state, {
        workspaceRoot: e.root,
        nowIso: this.nowIso,
        write: this.write(e.root),
        signal: controller.signal,
        log: this.deps.log,
        publish: (report) => { e.report = report; void this.publish(e); },
        reread: () => readInitializationState(e.agentsFile),
      });
      e.state = result.state;
      e.report = result.report;
      const failed = result.report.tasks.filter((t) => t.status === 'failure');
      e.lastError = failed.length === 0 ? null : failed.map((t) => t.error).join(' ');
      if (background && failed.length > 0 && this.active === e.root && !controller.signal.aborted) {
        // REQ-WORKSPACE-103: a banner carrying the task's own summary, with the stated fallback.
        this.deps.banner(BACKGROUND_FAILED_HEADLINE, failed[0]?.summary ?? BACKGROUND_FAILED_FALLBACK);
      }
      for (const t of result.report.tasks) this.deps.log(`initialization: ${t.id} → ${t.status}${t.error === '' ? '' : ` — ${t.error}`}`);
    } catch (cause) {
      // REQ-WORKSPACE-109: the run as a whole failed, so nothing is recorded for any task.
      e.lastError = String(cause);
      e.report = { running: false, current: null, currentLabel: '', currentSteps: [], tasks: [], outcome: 'failed', error: String(cause) };
      this.deps.log(`initialization: the run broke down for ${e.root} (${String(cause)})`, 'warn');
      if (background && this.active === e.root && !controller.signal.aborted) this.deps.banner(BACKGROUND_FAILED_HEADLINE, `${BACKGROUND_FAILED_FALLBACK} ${BACKGROUND_BROKE_DOWN}`);
    } finally {
      e.running = null;
      e.attempting = new Set();
      this.setupListeners.delete(e.root);
      // The state on disk is authoritative: a skip answered while this ran wrote its own ids there.
      e.state = readInitializationState(e.agentsFile);
      await this.publish(e);
    }
  }

  /** REQ-WORKSPACE-086/111: every listed id recorded as skipped, and the marker stamped even for an empty list. */
  async skip(ids: readonly string[]): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    const e = this.current();
    if (!e) return { ok: false, reason: 'no workspace is open' };
    // A task the live run is attempting is not the user's to skip; its own outcome is owed (see `attempting`).
    const mine = ids.filter((id) => !e.attempting.has(id));
    if (mine.length !== ids.length) this.deps.log(`initialization: ${ids.filter((id) => e.attempting.has(id)).join(', ')} is already running, so the skip leaves its outcome to the run`);
    const r = await recordSkip(e.state, mine, { nowIso: this.nowIso, write: this.write(e.root) });
    if (!r.ok) return r;
    e.state = r.state;
    this.deps.log(`initialization: skipped ${mine.length === 0 ? '(nothing)' : mine.join(', ')} for ${e.root}`);
    await this.publish(e);
    return { ok: true };
  }

  /** REQ-WORKSPACE-109: a task already under way still reaches its own conclusion. */
  async cancel(): Promise<void> {
    const e = this.current();
    e?.running?.abort();
    if (e) await this.publish(e);
  }
}
