import { millis, toIsoUtc, type Clocks, type TimerHandle } from '@rotaris/kernel';
import {
  BACKGROUND_BROKE_DOWN, BACKGROUND_FAILED_FALLBACK, BACKGROUND_FAILED_HEADLINE,
  EMPTY_INITIALIZATION_VIEW, EMPTY_RUN_REPORT, NEEDS_PROVIDER_DETAIL, NEEDS_PROVIDER_HEADLINE,
  NOTHING_LEFT, RESOLUTION_FAILED_DETAIL, RESOLUTION_FAILED_HEADLINE,
  type InitializationStateView, type InitRunReport, type McpSetupStatus,
} from '@rotaris/contracts';
import {
  CODE_INTELLIGENCE_SETUP_STEPS, deriveSets, executeTasks, labelFor, promptOwed, readInitializationState, recordSkip, stampOnly,
  TaskRegistry, viewOf, type InitializationState, type InitializationTask, type MarkerCommit, type PlainMap,
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
/**
 * REQ-WORKSPACE-093's "{reason}" for a setup in which no stage failed or began — a start the run host refused, a run
 * cancelled before its setup started. The requirement names per-stage reasons only; this is the build's, under OQ-167.
 */
const SETUP_REASON = "Code intelligence could not complete this project's setup";
/**
 * REQ-WORKSPACE-093/109: a run cancelled while its setup waited for another to end — "{reason}: {detail}", no stage begun.
 * The detail is the build's: REQ-WORKSPACE-092's cancelled sentence names a step, and none began (OQ-167).
 */
export const CANCELLED_BEFORE_SETUP_ERROR = `${SETUP_REASON}: the setup was cancelled before it started.`;

/**
 * REQ-WORKSPACE-109/084/093: the two ways a setup's follow ends without the run host's `finished` status — the run host
 * exited (main never forks another), or no outcome arrived within `SETUP_FOLLOW_BOUND_MS`. Each is a retryable failure in
 * REQ-WORKSPACE-093's summary, under the reason of the stage that was running (or `SETUP_REASON` when none was); the
 * details are the build's, under OQ-169.
 */
export const SETUP_RUN_HOST_EXITED_DETAIL = 'the run host exited before the setup finished.';
export const SETUP_OVERDUE_DETAIL = 'no outcome arrived within the setup\'s time budgets.';
/**
 * REQ-WORKSPACE-084/093: the third way, before any stage: the setup's start never answered — main's request rejected on its
 * bound, as when the run host has exited. A retryable failure under `SETUP_REASON`, its detail this sentence and the
 * request's own error; the build's, under OQ-167/OQ-169.
 */
export const SETUP_START_UNANSWERED_DETAIL = 'the run host did not answer the setup\'s start';
/** REQ-WORKSPACE-092: once a step is stopped, nothing it launched is still running 5 s later. */
const SETUP_STOP_GRACE_MS = 5_000;
/**
 * REQ-WORKSPACE-091/092: the longest a setup can take while its run host keeps the budgets — every stage's budget
 * (300 + 1800 + 120 s) and, for each, the 5 s in which what it launched is ended. A follow still open after it has lost
 * its finished status, and ends (OQ-169 records the reading).
 */
export const SETUP_FOLLOW_BOUND_MS = CODE_INTELLIGENCE_SETUP_STEPS.reduce((sum, s) => sum + s.budgetMs + SETUP_STOP_GRACE_MS, 0);

/**
 * REQ-WORKSPACE-092: a step stopped before it finished reads in one of two fixed sentences, so it is told apart from one
 * that ran to completion and exited non-zero. The run host's own words for it stay the MCP category's (REQ-MCP-099/112).
 */
export const STEP_STOPPED_BY_CANCEL = 'Setup was stopped before this step finished.';
export const STEP_STOPPED_BY_BUDGET = 'This step did not finish within its time budget.';
/** REQ-WORKSPACE-091: creation skipped because the runtime's marker file is present reports success with this output. */
export const STEP_MARKER_PRESENT = 'project file already exists; left as is';
/** REQ-WORKSPACE-091: the two stages a `non-code` workspace skips, each with its own fixed detail. */
export const STEP_NO_CODE: Readonly<Record<string, string>> = {
  index: 'No source files found, so there are no symbols to index.',
  memory: 'No source files found, so no memory layout was seeded.',
};
/** REQ-WORKSPACE-092: "every other step's detail SHALL be the last 400 bytes of its combined standard output and standard error". */
export const STEP_DETAIL_BYTES = 400;

/**
 * The last `bytes` bytes of `text` as UTF-8, cut where a character begins, so a character is never split (REQ-WORKSPACE-092:
 * non-ASCII characters survive into the detail).
 */
export function lastUtf8Bytes(text: string, bytes: number): string {
  const encoded = Buffer.from(text, 'utf8');
  if (encoded.length <= bytes) return text;
  let from = encoded.length - bytes;
  // A UTF-8 continuation byte is 10xxxxxx: the character it belongs to began before the cut, so it is left out whole.
  while (from < encoded.length && (encoded[from]! & 0xc0) === 0x80) from += 1;
  return encoded.subarray(from).toString('utf8');
}

/**
 * REQ-WORKSPACE-091/092: a setup step's detail in this domain's words, read from the facts the run host's status carries
 * beside its own `detail` — which stays the MCP category's (REQ-MCP-099/112) and is never shown here
 * (`docs/defects/fixed/the-other-setup-step-details-are-not-in-req-workspace-091-092s-words.md`). A stopped step and a
 * skipped one read in the requirements' fixed sentences; every other step's detail is the last 400 bytes of its output, with
 * no prefix, empty for a step that wrote nothing or never ran. A step whose command could not be started has no output and
 * reads in the launch's own error (OQ-175 records that reading and the empty ones).
 */
const stepDetail = (s: McpSetupStatus['steps'][number]): string => {
  if (s.stopped === 'cancelled') return STEP_STOPPED_BY_CANCEL;
  if (s.stopped === 'budget') return STEP_STOPPED_BY_BUDGET;
  if (s.skipped === 'marker-present') return STEP_MARKER_PRESENT;
  if (s.skipped === 'no-code' || s.status === 'skipped-no-code') return STEP_NO_CODE[s.id] ?? '';
  if (s.startError !== undefined) return s.startError;
  return lastUtf8Bytes(s.output ?? '', STEP_DETAIL_BYTES);
};

/** REQ-WORKSPACE-095: the two success summaries, by classification. */
export const CODE_INTELLIGENCE_SUCCESS_CODE = 'Code intelligence is set up for this project and its symbols are indexed.';
export const CODE_INTELLIGENCE_SUCCESS_NON_CODE = 'Code intelligence is set up for this project. No symbols were indexed because the workspace contains documentation only.';

/** REQ-WORKSPACE-094: the entry is not a local launch — non-retryable, no substitute invocation. */
export const NOT_A_LOCAL_LAUNCH_ERROR = "This workspace's `code_intelligence` entry is not a local launch, so its setup commands cannot be derived from it.";
export const NOT_A_LOCAL_LAUNCH_SUMMARY = 'Code intelligence project setup was skipped: the configured `code_intelligence` server is not one Rotaris can run setup commands against.';

/** REQ-WORKSPACE-013: why a closed workspace's run records nothing — the reason its refused recording carries in the log. */
export const CLOSED_WORKSPACE_RECORDS_NOTHING = 'the workspace was closed while its run was under way, so nothing is recorded for the cancelled run';

/**
 * Main's way to the run host's one setup. Every call names the workspace it is made for — the run's own, by the identifier
 * main was handed when that workspace opened (`open`) — never the focused window's: with two main windows open
 * (PD-SHELL-001) the focused one may hold the other workspace, and at quit none may be left at all
 * (`docs/defects/fixed/initialization-answers-for-the-last-opened-workspace-not-the-asking-window.md`).
 */
export interface SetupPort {
  /**
   * Starts the run host's setup; the reply is the status as it stands. A start the run host refuses carries the refusal's
   * code and its own words: its one setup slot taken (`mcp.setup.running`), the workspace not open there
   * (`workspace.unknown`), its configuration not loaded (`mcp.configuration`), or otherwise the kind of an unexpected
   * answer. An entry that is not a local launch is not refused: the run host answers it with a finished status whose
   * outcome is `unavailable` (REQ-MCP-099).
   */
  readonly start: (workspaceId: string) => Promise<{ readonly ok: true; readonly status: McpSetupStatus } | { readonly ok: false; readonly code: string; readonly reason: string }>;
  /** Asks the run host to end its setup; rejects when the request is not delivered (refused, or no answer). */
  readonly cancel: (workspaceId: string) => Promise<void>;
  /** The setup's status as the run host holds it, `applicable` judged against `workspaceId`'s own configuration. */
  readonly status: (workspaceId: string) => Promise<McpSetupStatus | null>;
}

/**
 * REQ-WORKSPACE-092: main's `SetupPort.cancel`, over the run host's `mcp.setup` request. It rejects unless the run host
 * took the cancellation — a refusal is an answer, not a delivery — so the coordinator says in the log that it was not
 * delivered rather than dropping it. It is addressed by the run's own workspace, which the run carries from its open.
 */
export async function deliverSetupCancel(
  workspaceId: string,
  send: (workspaceId: string) => Promise<{ readonly kind: string; readonly headline?: string }>,
): Promise<void> {
  const r = await send(workspaceId);
  if (r.kind === 'mcp.setup') return;
  throw new Error(r.kind === 'refused' ? `the run host refused it: ${r.headline ?? ''}` : `the run host answered ${r.kind}`);
}

export interface InitializationDeps {
  readonly clocks: Clocks;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
  /** The workspace `agents.yaml` write, routed to the service that owns it. */
  readonly writeMarker: (root: string, patch: PlainMap) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
  readonly setup: SetupPort;
  /**
   * Channel 12, to the windows holding `root` and to no other (REQ-WORKSPACE-105: the state a window works from is its own
   * workspace's). With two main windows open (PD-SHELL-001) the other window holds another workspace.
   */
  readonly publish: (root: string, state: InitializationStateView) => void;
  /** REQ-WORKSPACE-103: a failed background run reaches a banner, never a dialog. */
  readonly banner: (headline: string, detail: string) => void;
  /** REQ-WORKSPACE-110: a consent task runs an agent, so it needs a reachable model. */
  readonly modelReachable: () => boolean;
  /**
   * PD-ORCH-005 clause 9's `QuitState`: whether the application is quitting. At a quit the run host's own shutdown ends the
   * setup and everything its step launched (REQ-WORKSPACE-092/109, `McpHost.endSetup`), so a cancellation that cannot reach
   * the run host then is expected and said at `info` (PD-MONITOR-002); otherwise it is lost, and said at `warn`.
   */
  readonly quitting: () => boolean;
}

interface WorkspaceEntry {
  readonly root: string;
  readonly agentsFile: string;
  /** The identifier main was handed when this workspace opened; the setup port addresses the run host by it. */
  readonly workspaceId: string;
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
  /**
   * Whether `report` describes a run the resolution started for background tasks (REQ-WORKSPACE-083) rather than one the
   * user started. Published beside the report, because the dialog must not draw such a run as its own
   * (REQ-WORKSPACE-103; `docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`).
   */
  background: boolean;
  /**
   * REQ-WORKSPACE-102: exactly one automatic resolution per workspace open, held from the moment it begins so that whoever
   * needs it finished — the 800 ms slot or a skip answered before it (see `skip`) — waits on the same one. A "Check again"
   * is additional and is not held here.
   */
  automatic: Promise<void> | null;
  /**
   * REQ-WORKSPACE-013: the window that held this workspace has closed (`close`). A run still under way for it is
   * cancelled, nothing is recorded for it and nothing of it is published — the entry is no longer any window's.
   */
  closed: boolean;
}

/** REQ-WORKSPACE-091: the step names the log and the dialog show, in the requirement's order. */
const STEP_LABEL: Readonly<Record<string, string>> = { create: 'Project configuration', index: 'Symbol indexing', memory: 'Memory-layout seeding' };

export class InitializationCoordinator {
  readonly registry = new TaskRegistry();
  /**
   * Every workspace a main window holds, by its canonical root. There is no "current" one: each surface asks about its own
   * window's workspace, and every public method names the root it is asked for (REQ-WORKSPACE-013/102/105, PD-SHELL-001).
   */
  private readonly workspaces = new Map<string, WorkspaceEntry>();
  /**
   * The live setup's step sink, set for as long as `code-intelligence-setup` is following a setup, and cleared only by the
   * follow that set it. The run host pushes `mcp.setupStatus` with no workspace on it, because it holds one setup at a
   * time; `setupTurn` makes the coordinator's setups one at a time too, so the one sink always belongs to the setup the
   * statuses describe.
   */
  private setupListener: ((status: McpSetupStatus) => void) | null = null;
  /**
   * The live follow's way to end without a `finished` status, set and cleared beside `setupListener`: the run host's exit
   * (`onRunHostExit`) calls it, so the run ends and its turn of `setupTurn` passes on
   * (`docs/defects/fixed/nothing-bounds-the-wait-of-a-setup-queued-behind-one-that-never-finishes.md`).
   */
  private setupAbandon: ((detail: string) => void) | null = null;
  /**
   * REQ-WORKSPACE-109/084/013: the tail of the coordinator's setups, one at a time. A run's `code-intelligence-setup`
   * starts only once the setup before it has ended — after a workspace switch, the outgoing workspace's, still ending
   * under its cancellation. Before this, the replacement's start was refused as already running, or its follow took the
   * outgoing setup's cancelled finish as its own; and the outgoing run's end cleared the replacement's sink, so its steps
   * were never reported and its run never ended
   * (`docs/defects/fixed/a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`). The wait is the
   * task's, inside the run: the replacement's resolution returns at once and never waits on the cancellation.
   */
  private setupTurn: Promise<void> = Promise.resolve();
  /** How many runs hold or wait for a turn of `setupTurn` — read only to say in the log that a setup waits. */
  private setupTurns = 0;
  /**
   * REQ-WORKSPACE-084/085/086: every marker write this coordinator makes to one workspace's file, one at a time, in the
   * order asked, keyed by the workspace root. Each patch replaces both lists whole (REQ-CONFIG-050), so a patch is built
   * inside its turn from the file as the previous write left it (see `marker`). Before this, a skip built its patch from
   * the in-memory state while the background run's completion write was in flight, and the run built its patch from a
   * read taken before a skip's write had landed: whichever landed second erased the other
   * (`docs/defects/fixed/a-skip-can-move-a-completed-task-into-skipped.md`). One queue per root, not one for the
   * coordinator: each root's marker is its own file written by its own workspace service, so nothing orders it against
   * another root's, and a workspace just opened is not made to wait behind the last recording of the one it replaced,
   * which can take the whole 30 s write timeout (REQ-WORKSPACE-013).
   */
  private readonly markerQueues = new Map<string, Promise<unknown>>();

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
      // REQ-WORKSPACE-090: judged against the asked workspace's own configuration; a workspace no window holds has none.
      applicable: async ({ workspaceRoot }) => {
        const e = this.workspaces.get(workspaceRoot);
        return e !== undefined && (await this.deps.setup.status(e.workspaceId))?.applicable === true;
      },
      run: async (ctx) => {
        // The run's own workspace, taken as the run begins: the setup is started, followed and cancelled for it alone.
        const workspaceId = this.workspaces.get(ctx.workspaceRoot)?.workspaceId ?? null;
        const previous = this.setupTurn;
        let release: () => void = () => undefined;
        this.setupTurn = new Promise<void>((r) => { release = r; });
        if (this.setupTurns > 0) this.deps.log(`initialization: ${CODE_INTELLIGENCE_TASK_ID} for ${ctx.workspaceRoot} waits for the setup under way to end`);
        this.setupTurns += 1;
        try {
          // REQ-WORKSPACE-109: cancelled while it waited, the task never starts its setup and fails as REQ-WORKSPACE-093 says.
          // A workspace no window holds any more had its run aborted when it closed (`close`), so it fails the same way.
          if (workspaceId === null || !await this.turnReached(previous, ctx.signal)) return this.failure(CANCELLED_BEFORE_SETUP_ERROR, CODE_INTELLIGENCE_FAILED_SUMMARY, true, []);
          // REQ-WORKSPACE-084/093: a start the run host never answers — main's request rejects on its bound, as when the run
          // host has exited — is this task's own retryable failure, not one that ended without an outcome
          // (`docs/defects/fixed/a-setup-start-the-run-host-never-answers-is-reported-as-a-task-with-no-outcome.md`).
          let started: Awaited<ReturnType<SetupPort['start']>>;
          try {
            started = await this.deps.setup.start(workspaceId);
          } catch (cause) {
            const error = cause instanceof Error ? cause.message : String(cause);
            this.deps.log(`initialization: the run host did not answer ${CODE_INTELLIGENCE_TASK_ID}'s setup start for ${ctx.workspaceRoot} (${error})`, 'warn');
            return this.failure(`${SETUP_REASON}: ${SETUP_START_UNANSWERED_DETAIL} (${error})`, CODE_INTELLIGENCE_FAILED_SUMMARY, true, []);
          }
          // REQ-WORKSPACE-093/094: a refused start is not REQ-WORKSPACE-094's "not a local launch" — that one arrives as an
          // `unavailable` status, which `resultOf` maps — but a condition that may not hold at the next open: retryable, in
          // this domain's summary, the refusal's own words as the detail
          // (`docs/defects/fixed/a-refused-setup-start-is-reported-as-not-a-local-launch.md`).
          if (!started.ok) {
            this.deps.log(`initialization: the run host refused ${CODE_INTELLIGENCE_TASK_ID}'s setup start for ${ctx.workspaceRoot} (${started.code}: ${started.reason})`, 'warn');
            return this.failure(`${SETUP_REASON}: ${started.reason}`, CODE_INTELLIGENCE_FAILED_SUMMARY, true, []);
          }
          return await this.followSetup(workspaceId, started.status, ctx.signal, ctx.onStep);
        } finally {
          // The turn passes on only once the setup before this one has ended as well, however this one ended.
          void previous.then(() => { this.setupTurns -= 1; release(); });
        }
      },
    };
  }

  /** Whether the setup before this one ended before `signal` was aborted; an abort ends the wait at once. */
  private turnReached(previous: Promise<void>, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const onAbort = (): void => resolve(false);
      signal.addEventListener('abort', onAbort, { once: true });
      void previous.then(() => { signal.removeEventListener('abort', onAbort); resolve(!signal.aborted); });
    });
  }

  private failure(error: string, summary: string, retryable: boolean, steps: TaskResult['steps']): TaskResult {
    return { status: 'failure', steps, classification: null, error, retryable, summary };
  }

  /**
   * REQ-WORKSPACE-109: each step reported the moment it finishes. The status arrives on channel
   * `mcp.setupStatus`, which the run host pushes on every change — no cadence, SR-3.
   */
  private followSetup(workspaceId: string, first: McpSetupStatus, signal: AbortSignal, onStep: (s: { name: string; status: string; detail: string }) => void): Promise<TaskResult> {
    return new Promise<TaskResult>((resolve) => {
      const seen = new Map<string, string>();
      let ended = false;
      let last = first;
      let overdue: TimerHandle | null = null;
      /** Ends this follow once, whichever way; only this follow's own sinks are cleared (see `setupTurn`). */
      const end = (result: TaskResult): void => {
        if (ended) return;
        ended = true;
        if (this.setupListener === drain) this.setupListener = null;
        if (this.setupAbandon === abandon) this.setupAbandon = null;
        overdue?.cancel();
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      };
      // REQ-WORKSPACE-084/093: a setup whose finished status will never arrive still ends, as a retryable failure.
      const abandon = (detail: string): void => { if (!ended) end(this.unfinished(last, detail)); };
      const drain = (status: McpSetupStatus): void => {
        if (ended) return;
        last = status;
        for (const step of status.steps) {
          if (step.status === 'pending' || step.status === 'running') continue;
          if (seen.get(step.id) === step.status) continue;
          seen.set(step.id, step.status);
          onStep({ name: STEP_LABEL[step.id] ?? step.label, status: step.status, detail: stepDetail(step) });
        }
        if (status.state !== 'finished') return;
        // `end` clears only this follow's own sink: another may have been installed since (see `setupTurn`). Nor may this
        // run's abort reach the run host once its setup has ended. The run host's cancel is not a workspace's but its one
        // setup's, and `setupTurn` lets the next run's setup start while this run is still recording its outcome — so a
        // close or a Cancel landing in that interval cancelled the next workspace's setup (ADR-0064's seventh round).
        end(this.resultOf(status));
      };
      // REQ-WORKSPACE-092: the run host ends what the setup launched. A cancel whose request fails is said, not dropped: at a
      // quit as what is expected — the run host's shutdown ends the setup itself, and may have exited or closed its stores
      // before the request reached it — and otherwise as a fault (PD-MONITOR-002;
      // `docs/defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).
      const onAbort = (): void => {
        this.deps.setup.cancel(workspaceId).catch((cause: unknown) => {
          if (this.deps.quitting()) this.deps.log(`initialization: the setup's cancellation did not reach the run host at the quit, whose shutdown ends the setup itself (${String(cause)})`);
          else this.deps.log(`initialization: the setup's cancellation could not be delivered (${String(cause)})`, 'warn');
        });
      };
      this.setupListener = drain;
      this.setupAbandon = abandon;
      signal.addEventListener('abort', onAbort, { once: true });
      drain(first);
      // REQ-WORKSPACE-091/092: a lost push must not hold every later setup behind this one for the life of the process.
      if (!ended) {
        overdue = this.deps.clocks.timers.after(millis(SETUP_FOLLOW_BOUND_MS), () => {
          this.deps.log(`initialization: no finished status for ${CODE_INTELLIGENCE_TASK_ID}'s setup arrived within ${SETUP_FOLLOW_BOUND_MS / 1000} s; the run ends as a failure`, 'warn');
          abandon(SETUP_OVERDUE_DETAIL);
        });
      }
      // An abort that landed while the start request was in flight fired before the listener was added, and an aborted
      // signal fires no more: without this, the setup ran to the end of its stages uncancelled, and `setupTurn` held every
      // later setup behind it (ADR-0064's sixth round). A setup that had already ended in its first status is left be.
      if (signal.aborted && !ended) {
        signal.removeEventListener('abort', onAbort);
        onAbort();
      }
    });
  }

  /** REQ-WORKSPACE-093/094/095: the task's own result, in this domain's words rather than REQ-MCP-112's. */
  private resultOf(status: McpSetupStatus): TaskResult {
    const steps = status.steps
      .filter((s) => s.status !== 'pending' && s.status !== 'running')
      .map((s) => ({ name: STEP_LABEL[s.id] ?? s.label, status: s.status, detail: stepDetail(s) }));
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
    const reason = bad ? STAGE_REASON[bad.id] ?? `Code intelligence could not complete ${bad.label}` : SETUP_REASON;
    const detail = bad !== undefined && stepDetail(bad) !== '' ? stepDetail(bad) : status.message;
    return this.failure(`${reason}: ${detail}`, CODE_INTELLIGENCE_FAILED_SUMMARY, true, steps);
  }

  /**
   * REQ-WORKSPACE-093: a setup that ended without its finished status — the steps that finished, and the reason of the
   * stage that was running when it was lost, or `SETUP_REASON` when none was.
   */
  private unfinished(last: McpSetupStatus, detail: string): TaskResult {
    const steps = last.steps
      .filter((s) => s.status !== 'pending' && s.status !== 'running')
      .map((s) => ({ name: STEP_LABEL[s.id] ?? s.label, status: s.status, detail: stepDetail(s) }));
    const running = last.steps.find((s) => s.status === 'running');
    const reason = running ? STAGE_REASON[running.id] ?? `Code intelligence could not complete ${running.label}` : SETUP_REASON;
    return this.failure(`${reason}: ${detail}`, CODE_INTELLIGENCE_FAILED_SUMMARY, true, steps);
  }

  /** The run host pushes here; main routes it in. */
  onSetupStatus(status: McpSetupStatus): void {
    this.setupListener?.(status);
  }

  /**
   * Main calls this when the run host exits; it is never forked again, so a setup it held can never send its finished
   * status. The follow under way ends as a retryable failure and the next setup's turn comes (REQ-WORKSPACE-084/093/109).
   */
  onRunHostExit(code: number): void {
    if (this.setupAbandon === null) return;
    // PD-MONITOR-002: 0 is an orderly end — the quit, which has already closed the workspace — and any other the run host lost.
    this.deps.log(`initialization: the run host exited (${code}) while ${CODE_INTELLIGENCE_TASK_ID}'s setup was under way; the run ends as a failure`, code === 0 ? 'info' : 'warn');
    this.setupAbandon(SETUP_RUN_HOST_EXITED_DETAIL);
  }

  // ---- per workspace -----------------------------------------------------------------------------

  /**
   * The entry for `root`, made on its first open. A later open of a root that still has an entry keeps the entry's first
   * `workspaceId`: that holds while the workspace service hands one root one identifier (it reads it from the root's own
   * identifier file), and every setup start, cancel and status is addressed by it. A change that lets a root's identifier
   * change while a window still holds it must refresh `workspaceId` here, or the setup port is addressed by a stale id.
   */
  private entry(root: string, agentsFile: string, workspaceId: string): WorkspaceEntry {
    let e = this.workspaces.get(root);
    if (!e) {
      e = { root, agentsFile, workspaceId, state: readInitializationState(agentsFile), report: EMPTY_RUN_REPORT, running: null, attempting: new Set(), lastError: null, resolutionFailed: false, background: false, automatic: null, closed: false };
      this.workspaces.set(root, e);
    }
    return e;
  }

  /**
   * A main window has opened `root`, which the run host knows as `workspaceId`. Each window's surfaces then ask about their
   * own window's root (REQ-WORKSPACE-013/105); opening another root in another window changes nothing about this one.
   */
  open(root: string, agentsFile: string, workspaceId: string): void {
    this.entry(root, agentsFile, workspaceId);
  }

  /**
   * REQ-WORKSPACE-013: no window holds `root` any more — a workspace switch closed the outgoing window, or one of several
   * windows closed (main calls this from `MainWindows`' `workspaceClosed`). A run still under way is cancelled on
   * REQ-WORKSPACE-109's terms: no task that has not started begins, the task under way reaches its own conclusion and the
   * run host ends every process it launched (REQ-WORKSPACE-092). Nothing is recorded for that run (see `commit`), so its
   * tasks stay pending for the next open, and nothing of it is published or bannered: no live window is this workspace's,
   * and a banner reaches every window. The entry is dropped at once, without waiting for the run, so a later
   * open of the same root is a new open with its own automatic resolution (REQ-WORKSPACE-102) and the replacement
   * window's resolution never waits on the cancellation. Before this was called, a switch left the outgoing run going,
   * recorded its outcome, and a return to the root found its automatic resolution already spent
   * (`docs/defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`).
   *
   * OQ-141: REQ-WORKSPACE-013 names only a switch's outgoing window and a background run. The same rule is applied to
   * every run of a workspace no window holds any more — a plain close of one of several windows (PD-SHELL-001), a
   * replacement closed after a veto, and a run the user started — which is the reading that question records, not a
   * clause of the specification.
   */
  close(root: string): void {
    const e = this.workspaces.get(root);
    if (e) {
      e.closed = true;
      if (e.running !== null) {
        this.deps.log(`initialization: ${root} was closed while its run was under way; the run is cancelled and nothing is recorded for it`);
        e.running.abort();
      }
    }
    this.workspaces.delete(root);
  }

  /** The entry of the workspace a window holds; `null` for a window that holds none, or one whose open has not landed. */
  private held(root: string): WorkspaceEntry | null {
    return this.workspaces.get(root) ?? null;
  }

  private write(root: string): (patch: PlainMap) => Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    return (patch) => this.deps.writeMarker(root, patch);
  }

  /**
   * One turn of the root's queue in `markerQueues`: `work` runs once every write asked for before it on the same root
   * has landed, and is handed the state on disk read at that moment, from which it builds its own patch. Nothing else
   * may write the marker (REQ-WORKSPACE-085). A root's queue is dropped once its last turn has settled.
   */
  private marker<T>(e: WorkspaceEntry, work: (current: InitializationState) => Promise<T>): Promise<T> {
    const tail = this.markerQueues.get(e.root) ?? Promise.resolve();
    const turn = tail.then(async () => await work(readInitializationState(e.agentsFile)));
    const settled = turn.catch(() => undefined);
    this.markerQueues.set(e.root, settled);
    void settled.then(() => { if (this.markerQueues.get(e.root) === settled) this.markerQueues.delete(e.root); });
    return turn;
  }

  /** The run's recordings, each built inside its turn of the queue (`ExecuteDeps.commit`). */
  private commit(e: WorkspaceEntry): MarkerCommit {
    // REQ-WORKSPACE-013: decided inside the turn, so a close that lands while a recording waits its turn still stops it.
    return async (build) => await this.marker(e, async (current) => e.closed
      ? { ok: false, reason: CLOSED_WORKSPACE_RECORDS_NOTHING }
      : await this.deps.writeMarker(e.root, build(current)));
  }

  private nowIso = (): string => toIsoUtc(this.deps.clocks.wall.instant());

  private async sets(e: WorkspaceEntry): Promise<TaskSets> {
    return await deriveSets(this.registry, e.state, (m) => this.deps.log(m, 'warn'), { workspaceRoot: e.root });
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
    return { view, labels, descriptions, report: e.report, resolutionFailed: e.resolutionFailed, backgroundRun: e.background };
  }

  private async publish(e: WorkspaceEntry): Promise<void> {
    // REQ-WORKSPACE-013: a closed workspace is no window's.
    if (e.closed) return;
    const view = await this.viewFor(e);
    if (!e.closed) this.deps.publish(e.root, view);
  }

  /** REQ-WORKSPACE-115: the persisted section of `root` as it is on disk right now, and nothing else disturbed. */
  async read(root: string): Promise<InitializationStateView> {
    const e = this.held(root);
    if (!e) return { view: EMPTY_INITIALIZATION_VIEW, labels: {}, descriptions: {}, report: EMPTY_RUN_REPORT, resolutionFailed: false, backgroundRun: false };
    // In-progress and last-error describe this session only and are NOT taken from disk.
    e.state = readInitializationState(e.agentsFile);
    const state = await this.viewFor(e);
    if (!e.closed) this.deps.publish(e.root, state);
    return state;
  }

  /**
   * REQ-WORKSPACE-083: the one resolution. A never-initialized workspace with no applicable task is
   * marked silently; pending background work starts at once; pending consent work raises the prompt.
   * REQ-WORKSPACE-102: automatic exactly once per open of `root`, and a user-requested check is additional.
   */
  async resolve(root: string, automatic: boolean): Promise<InitializationStateView> {
    const e = this.held(root);
    if (!e) return { view: EMPTY_INITIALIZATION_VIEW, labels: {}, descriptions: {}, report: EMPTY_RUN_REPORT, resolutionFailed: false, backgroundRun: false };
    if (!automatic) return await this.resolution(e);
    if (e.automatic === null) {
      let done: () => void = () => undefined;
      e.automatic = new Promise<void>((r) => { done = r; });
      try { return await this.resolution(e); } finally { done(); }
    }
    await e.automatic;
    return await this.viewFor(e);
  }

  private async resolution(e: WorkspaceEntry): Promise<InitializationStateView> {
    try {
      e.state = readInitializationState(e.agentsFile);
      const sets = await this.sets(e);
      e.resolutionFailed = false;
      if (sets.applicable.length === 0 && sets.pending.length === 0) {
        // REQ-WORKSPACE-083: nothing shown, nothing started — and the never-initialized state is left behind.
        // A workspace closed while its sets were derived is no window's: the predicates read no configuration for it, so
        // "nothing applicable" is not a finding about it, and nothing is written for it (REQ-WORKSPACE-013, OQ-141).
        if (e.state.lastRun === null && !e.closed) {
          e.state = await this.marker(e, async (current) => await stampOnly(current, null, { nowIso: this.nowIso, write: this.write(e.root), log: this.deps.log }));
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
      // REQ-WORKSPACE-013 (OQ-141's reading): a workspace closed while its resolution was under way is no window's, and the
      // banner reaches every live window — so it is said in the log only, as `publish` shows nothing of it. The silent stamp's
      // write is one way there: main's marker request rejects when the service gives no reply within its bound
      // (`docs/defects/fixed/a-closed-workspaces-resolution-can-still-raise-the-resolution-failed-banner.md`).
      if (e.closed) {
        this.deps.log(`initialization: resolution failed for ${e.root}, which was closed while it was under way, so nothing is shown (${String(cause)})`);
        return await this.viewFor(e);
      }
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
  async start(root: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly headline: string; readonly detail: string }> {
    const e = this.held(root);
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
    // REQ-WORKSPACE-013: a resolution that was under way when its workspace closed starts nothing.
    if (e.closed) return;
    const controller = new AbortController();
    e.running = controller;
    e.background = background;
    e.attempting = new Set(tasks.map((t) => t.id));
    e.lastError = null;
    this.deps.log(`initialization: running ${tasks.map((t) => t.id).join(', ')} for ${e.root}${background ? ' (background)' : ''}`);
    try {
      const result = await executeTasks(tasks, e.state, {
        workspaceRoot: e.root,
        nowIso: this.nowIso,
        write: this.write(e.root),
        commit: this.commit(e),
        signal: controller.signal,
        log: this.deps.log,
        publish: (report) => { e.report = report; void this.publish(e); },
      });
      e.state = result.state;
      e.report = result.report;
      const failed = result.report.tasks.filter((t) => t.status === 'failure');
      e.lastError = failed.length === 0 ? null : failed.map((t) => t.error).join(' ');
      if (background && failed.length > 0 && !e.closed) {
        // REQ-WORKSPACE-103: a banner carrying the task's own summary, with the stated fallback.
        this.deps.banner(BACKGROUND_FAILED_HEADLINE, failed[0]?.summary ?? BACKGROUND_FAILED_FALLBACK);
      }
      for (const t of result.report.tasks) this.deps.log(`initialization: ${t.id} → ${t.status}${t.error === '' ? '' : ` — ${t.error}`}`);
    } catch (cause) {
      // REQ-WORKSPACE-109: the run as a whole failed, so nothing is recorded for any task.
      e.lastError = String(cause);
      e.report = { running: false, current: null, currentLabel: '', currentSteps: [], tasks: [], outcome: 'failed', error: String(cause) };
      this.deps.log(`initialization: the run broke down for ${e.root} (${String(cause)})`, 'warn');
      if (background && !e.closed) this.deps.banner(BACKGROUND_FAILED_HEADLINE, `${BACKGROUND_FAILED_FALLBACK} ${BACKGROUND_BROKE_DOWN}`);
    } finally {
      e.running = null;
      e.attempting = new Set();
      // The state on disk is authoritative: a skip answered while this ran wrote its own ids there.
      e.state = readInitializationState(e.agentsFile);
      await this.publish(e);
    }
  }

  /**
   * REQ-WORKSPACE-086/111: every listed id recorded as skipped, and the marker stamped even for an empty list — except an id
   * the live run is attempting or one already recorded completed, neither of which is pending.
   */
  async skip(root: string, ids: readonly string[]): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
    const e = this.held(root);
    if (!e) return { ok: false, reason: 'no workspace is open' };
    // REQ-WORKSPACE-083: the prompt a skip answers is a product of the open's resolution, and the same resolution starts
    // the background tasks. The window's mount read can open the dialog before main's 800 ms slot (OQ-122), so a skip
    // answered in that interval performs the open's one automatic resolution first (REQ-WORKSPACE-102; the window is
    // plainly accepting input, since it answered) and is recorded against what that resolution left. Without it the
    // skip wrote `code-intelligence-setup` as skipped before it had started, and the resolution then started nothing
    // (`init-proof` on Linux, `docs/defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md`).
    // Once that resolution is made, or under way, the skip waits for it and reads nothing more: a view recomputed here
    // would cost a run-host status read, and a background run could end inside it.
    if (e.automatic === null) {
      this.deps.log(`initialization: a skip arrived before ${e.root} was resolved, so the open's resolution runs first`);
      await this.resolve(e.root, true);
    } else {
      await e.automatic;
    }
    // What is recorded is decided inside the skip's turn of the marker queue, from the file as every write asked for
    // before it left it, in the same turn as `attempting` is read: a run clears `attempting` only after its recording has
    // landed, and a recording asked for after the skip is built from the file the skip left (see `markerQueues`).
    // A task the live run is attempting is not the user's to skip; its own outcome is owed (see `attempting`).
    // REQ-WORKSPACE-084/086: nor is a task already recorded completed. A skip names what the dialog last drew, and a
    // background run can finish between that draw and the skip, or while the skip performs the resolution; recording
    // it moved the id out of `completed` (`docs/defects/fixed/a-skip-can-move-a-completed-task-into-skipped.md`).
    const { r, mine } = await this.marker(e, async (current) => {
      const completed = new Set(current.completed);
      const running = ids.filter((id) => e.attempting.has(id));
      const done = ids.filter((id) => !e.attempting.has(id) && completed.has(id));
      const mine = ids.filter((id) => !e.attempting.has(id) && !completed.has(id));
      if (running.length > 0) this.deps.log(`initialization: ${running.join(', ')} is already running, so the skip leaves its outcome to the run`);
      if (done.length > 0) this.deps.log(`initialization: ${done.join(', ')} is already completed, so the skip leaves it completed`);
      return { r: await recordSkip(current, mine, { nowIso: this.nowIso, write: this.write(e.root) }), mine };
    });
    if (!r.ok) return r;
    e.state = r.state;
    this.deps.log(`initialization: skipped ${mine.length === 0 ? '(nothing)' : mine.join(', ')} for ${e.root}`);
    await this.publish(e);
    return { ok: true };
  }

  /** REQ-WORKSPACE-109: `root`'s run is cancelled; a task already under way still reaches its own conclusion. */
  async cancel(root: string): Promise<void> {
    const e = this.held(root);
    e?.running?.abort();
    if (e) await this.publish(e);
  }
}
