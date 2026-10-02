import type { Actor, BlockerPayload, BoardAction, BoardCard, BoardProjection, DisclosureState, Reachability, ReqId, RequirementDetail, RequirementRecord, RequirementsCommandPayload, ReviewPayload, RunClaim, RunLaunchPreview, RunPermissions, RunReaped, RunSettled, StandingDisclosure, StoreParse, TraceabilityEngine, TraceabilityFailure, VerificationReport } from '@rotaris/contracts';
import { SYSTEM_ONLY_REQUIREMENTS_COMMANDS } from '@rotaris/contracts'; // Part AP
import { asSessionId, err, millis, toIsoUtc, type Clocks } from '@rotaris/kernel';
import { StoreDal, type ResolvedStore } from '@rotaris/store';
import { assertWriterDeclares, createDeliveryReader, createDeliveryWriter, createQueueSettings, createTransitions, reapStaleRuns, type BoardInput, type DeliveryReader, type DeliveryWriter, type ReapResult, type RequirementNow } from '@rotaris/workspace';
// Part AP — runs from the board, the queue and the source write (spec 08 §Runs Started from the Board, §Delivery Queue, §Editing and Creating Requirements; ADR-0041's second execution).
import { ACTION_CLASS, appendEpicIndexRow, checkRepositoryForRuns, composeRequirementDocument, createLocation, documentWritable, editRequirementDocument, epicIndexLink, invokeGit, nextIdentifier, probeSourceWritability, provisionUnitWorktree, readOnlySentence, readSourceText, renderBranch, requirementWorktreePath, runPromptFor, scheduleQueue, slugOf, takeOverUnitWorktree, unitIdFor, WAITING_ON_PERSON, writeSourceDocument, type ProvisionArgs, type ProvisionedWorktree, type RepositoryForRuns, type TakeOverArgs } from '@rotaris/workspace';
import type { Result } from '@rotaris/kernel';
import { loadConfiguration, commitConfigFields, REQUIREMENTS_DEFAULTS, validateRequirementsPatch, type RequirementsSection } from '@rotaris/config';
import { resolveUserDirs } from '@rotaris/platform';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Part AK — the delivery store's service side (ADR-0041's first execution; ADR-0040 specific 5). Lives in the
 * workspace service because that process owns the store's writable connection and is where AJ's engine runs
 * (ADR-0002 #3, W-02): the projection is computed HERE, in the same process as the engine and the store, and the
 * renderer receives one immutable `BoardProjection` per generation over `requirements.board`.
 *
 * The composition is what REQ-TRACE-403 and REQ-TRACE-402 are about: the reader is built from the database handle,
 * the writer from the reader plus the transition function, and `assertWriterDeclares` refuses to serve delivery at
 * all when the writer does not declare the specification-hash comparison. That check runs at construction — the
 * first `requirements.*` command of a workspace open — and its failure is the named message, not a silent absence.
 *
 * The engine is INJECTED. Until Part AJ merges, `ENGINE_NOT_MERGED` answers every pass with a stated failure and the
 * board reports `source: none` with the cause in `parseErrors`; the merge replaces one line in `index.ts`'s case.
 */
export interface DeliveryAnswer {
  readonly value: unknown;
  /** Present exactly when a write moved the generation, or main's standing disclosure moved the queue; main publishes it on channel 10 AFTER the reply (persist before publish). */
  readonly changed?: { readonly generation: number; readonly affected: ReqId[] | null };
}
export interface DeliveryService {
  /** `disclosure`: main's standing disclosure, stamped on the envelope beside the actor (REQ-TRACE-472); absent, the last one held stands. */
  handle(command: RequirementsCommandPayload, actor: Actor, disclosure?: StandingDisclosure): Promise<DeliveryAnswer>;
  /** What the restart reap settled on the first pass (REQ-TRACE-476), for the log. */
  readonly reaped: readonly ReapResult[];
  readonly generation: number;
}
export interface DeliveryServiceDeps {
  readonly db: ResolvedStore['db'];
  readonly workspaceRoot: string;
  readonly engine: TraceabilityEngine;
  readonly clocks: Clocks;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
  /** Part AP — the global configuration directory (`resolveUserDirs().config` when absent; a test names its own). */
  readonly configDir?: string;
  /** Part AP — the two Git units a launch needs (REQ-TRACE-498's repository rows, REQ-GIT-137/140's provisioning); the real ones through ADR-0038's helper when absent, a fake in a test. */
  readonly git?: RunGitPort;
}
/** Part AP — what the service asks of Git for a launch; both are `runs.ts` units over ADR-0038's one helper. */
export interface RunGitPort {
  checkRepository(root: string): Promise<RepositoryForRuns>;
  provision(args: ProvisionArgs): Promise<Result<ProvisionedWorktree, string>>;
  /** REQ-TRACE-464's take-over of a tree the store recorded for the same unit, where the launch holding it was lost (`runs.ts` `takeOverUnitWorktree`). */
  takeOver(args: TakeOverArgs): Promise<Result<ProvisionedWorktree, string>>;
}

const NOT_MERGED = Object.freeze({ kind: 'failed', what: 'the traceability engine', cause: 'Part AJ is not merged into this build' } as const);
/** The stand-in until Part AJ's `createTraceabilityEngine` is wired at the merge: every pass fails with the reason stated. */
export const ENGINE_NOT_MERGED: TraceabilityEngine = {
  parseStore: async () => err(NOT_MERGED),
  sweep: async () => err(NOT_MERGED),
  verify: async () => err(NOT_MERGED),
  check: async () => err(NOT_MERGED),
  regenerate: async () => err(NOT_MERGED),
  updateBaselines: async () => err(NOT_MERGED),
  compare: async () => err(NOT_MERGED),
};

/** Part AP — the `requirements.act` payload keys this service reads: the disclosure state of a launch and a send-back's instructions. */
export const UNDISCLOSED_REASON = (id: ReqId): string => `The permissions of the run for ${id} have not been disclosed and accepted; open it from the queue to see the disclosure and start it.`;
/** Part AP — what `requirements.source.write` carries in `document` (the seam's one string): a JSON draft the service composes into the artifact (REQ-TRACE-439/440). */
export interface SourceEditDraft { readonly title: string; readonly prose: string }
export interface SourceCreateDraft { readonly title: string; readonly prose: string; readonly kind: 'product' | 'technical'; readonly derivedFrom?: readonly ReqId[]; readonly epic?: ReqId; readonly priority?: string }

export function createDeliveryService(deps: DeliveryServiceDeps): DeliveryService {
  const { db, workspaceRoot, engine, clocks, log } = deps;
  const queue = createQueueSettings();
  const reader: DeliveryReader = createDeliveryReader(db, { workspaceKey: workspaceRoot, queue });
  const writer: DeliveryWriter = createDeliveryWriter(reader, createTransitions(db, { wall: clocks.wall, workspaceKey: workspaceRoot, queue }));
  // REQ-TRACE-402: the startup self-check on the composition. A writer without the declaration is not served.
  assertWriterDeclares(writer);

  let generation = 0;
  let parse: StoreParse | undefined;
  let parseFailure: TraceabilityFailure | undefined;
  let report: VerificationReport | undefined;
  let current: BoardProjection | undefined;
  let stopped = false;
  let reaped: readonly ReapResult[] | undefined;
  let refreshing: Promise<number> | undefined;
  const inFlight = new Map<ReqId, BoardAction>();
  const now = () => toIsoUtc(clocks.wall.instant());

  // ---- Part AP — the configuration read, the scheduler's state, the launches (one contiguous block; the arms below delegate here) ----
  /**
   * REQ-TRACE-480/483: the two persisted queue controls ARE `requirements.scheduling.mode` and `max_concurrent_units`
   * (REQ-CONFIG-196), read from the layered configuration here and written back through the service's own Tier A
   * writer; the in-memory holder AK left is now the cache of the configured values, refreshed on every reload. The
   * elevation's second half (`runtime.permission_mode`, `approval_timeout_seconds`) is read from the same load for the
   * disclosure (REQ-TRACE-467/468/474).
   */
  const configDir = deps.configDir ?? resolveUserDirs().config;
  const git: RunGitPort = deps.git ?? { checkRepository: (root) => checkRepositoryForRuns(root, { clocks }), provision: (a) => provisionUnitWorktree(a, { clocks }), takeOver: (a) => takeOverUnitWorktree(a, { clocks }) };
  let requirements: RequirementsSection = REQUIREMENTS_DEFAULTS;
  let permissionMode = 'ask';
  let approvalTimeoutSeconds = 300;
  const loadConfig = (): void => {
    const r = loadConfiguration({ globalDir: configDir, workspaceRoot, keepIgnored: false, now: () => clocks.monotonic.now() });
    if (!r.ok) { log(`requirements: the configuration did not load (${r.error.file}: ${r.error.path} ${r.error.message}); the queue keeps its last values`, 'warn'); return; }
    requirements = r.value.requirements;
    permissionMode = r.value.runtime.permission_mode;
    approvalTimeoutSeconds = r.value.runtime.approval_timeout_seconds;
    queue.set(requirements.scheduling.mode === 'automatic', requirements.scheduling.max_concurrent_units);
  };
  loadConfig();
  /** The scheduler's in-memory facts (REQ-TRACE-479's hold, the arming under `manual`, a claim in flight, REQ-TRACE-463's stated stall). A restart clears them all, by requirement for the stop and by reading for the rest. */
  const held = new Set<ReqId>();
  const armed = new Set<ReqId>();
  const claimed = new Set<ReqId>();
  const stalled = new Map<ReqId, string>();
  const since = new Map<ReqId, string>();
  interface Launch { readonly unit: string; readonly disclosure: DisclosureState | 'undisclosed'; readonly instructions?: string; readonly worktree?: ProvisionedWorktree; readonly action: BoardAction }
  const launches = new Map<ReqId, Launch>();
  const recordOf = (id: ReqId): RequirementRecord | undefined => parse?.records.find((x) => x.id === id);
  const workspaceUnattended = (): boolean => permissionMode === 'autonomous';
  /**
   * What main's two preferences make of a launch nobody disclosed (REQ-TRACE-472): only main holds them, and it stamps
   * the value on every command it sends; this is the last one received, `due` until the first. ONE value feeds the
   * queue the service publishes, the launch preview and the claim, so the queue shows the candidate the scheduler takes
   * next, for the reason it takes or defers it (REQ-TRACE-478). The verifier's second finding on
   * `a-card-resting-in-ready-across-a-restart-can-never-be-started.md` put it on the claim alone, and the published queue
   * then still called "deferred, open it to see the disclosure" a card the next claim took with the disclosure
   * suppressed (the third finding).
   */
  let standing: StandingDisclosure = 'due';
  /**
   * REQ-TRACE-497: a run started while its disclosure was due and not accepted is never observable — a launch without one
   * is not claimable. A launch recorded undisclosed (one the restart recovery rebuilt) is disclosed once the disclosure
   * is permanently suppressed or the elevation is switched off, as a launch disclosed in this process would be.
   */
  const disclosed = (l: Launch | undefined): boolean => l !== undefined && (l.disclosure !== 'undisclosed' || standing !== 'due' || workspaceUnattended());
  /** REQ-TRACE-472: with the elevation switched off a board-started run adopts the workspace's own permission mode, whatever its launch recorded. */
  const permissionsOf = (l: Launch | undefined): RunPermissions => (l === undefined || l.disclosure === 'off' || standing === 'off' || workspaceUnattended() ? 'workspace' : 'permissive');
  /** The scheduler over the store's current state (REQ-TRACE-478): the base projection supplies the candidates, then the queue is the scheduler's own order and reasons. */
  const schedule = (base: BoardProjection) => {
    const stamp = now();
    const candidates = base.cards.filter((c) => c.column === 'ready').map((c) => {
      if (!since.has(c.id)) since.set(c.id, stamp);
      // Defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`: the candidate is the card's CURRENT
      // unit. A launch held for an earlier unit is spent — its run began, and a reject or a `cancelled` ending rested the
      // card in `ready` on the next one — so it never names the unit the queue shows or the claim starts (REQ-TRACE-423).
      return { id: c.id, unit: unitOfCard(c), priority: c.priority, since: since.get(c.id)! };
    });
    for (const id of [...since.keys()]) if (!candidates.some((c) => c.id === id)) since.delete(id);
    // Defect AP-4: the undisclosed condition is its OWN input, not a stall folded in. Folded in it was escaped by
    // arming — a resume that returns to `ready` provisions and arms — and the queue then called `next` a candidate
    // `claim()` refuses, so nothing started and the slot it held was denied to candidates that could have used it.
    const undisclosed = new Map<ReqId, string>();
    for (const c of candidates) if (!disclosed(launches.get(c.id))) undisclosed.set(c.id, UNDISCLOSED_REASON(c.id));
    return scheduleQueue({
      candidates, executing: reader.runningRuns().map((r) => ({ id: r.id, unit: r.unit })),
      settings: { ...reader.queue(), stopped }, held, armed, claimed, stalled, undisclosed,
    });
  };
  const source = () => (parse === undefined ? { writable: false, canCreate: false, reason: 'No requirement store is open.' } : probeSourceWritability(workspaceRoot, parse.layout.storeDir));
  /** The unit a card in `ready` is launched as: its `Units` fact counts the runs begun, and the next one is that count plus one. */
  const unitOfCard = (card: BoardCard | undefined): string => unitIdFor(Number(card?.facts.find((f) => f.label === 'Units')?.value ?? '0'));
  /**
   * REQ-TRACE-464's take-over of the tree the store recorded for this unit, where no launch in memory holds it (a restart
   * since the release). `undefined` when no row of this unit names a tree still on disk; otherwise Git's answer.
   */
  const takeOverRecorded = async (id: ReqId, unit: string): Promise<Result<ProvisionedWorktree, string> | undefined> => {
    const recorded = reader.worktrees(id).find((w) => w.unit === unit && existsSync(w.path));
    return recorded === undefined ? undefined : git.takeOver({ workspaceRoot, id, unit, path: recorded.path, branch: recorded.branch });
  };
  /** True when the store records no tree at all for this unit: no run-starting action provisioned it, and no claim either (REQ-TRACE-464). */
  const unrecorded = (id: ReqId, unit: string): boolean => reader.worktrees(id).every((w) => w.unit !== unit);
  /** The stall of a unit whose recorded tree is gone from disk: never provisioned again (REQ-TRACE-464), stated (REQ-TRACE-463). */
  const missingTreeReason = (id: ReqId, unit: string): string => `${id} unit ${unit} has no recorded worktree on disk to take over, and a start from the queue provisions none: restore the tree, or hold the card and resume it from the board, which provisions one.`;
  /**
   * The launch as it carries over to the card's current unit. A launch of an earlier unit is spent (defect note
   * `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`): its tree stays where REQ-TRACE-423 keeps it, and a
   * send-back's instructions were for the run that followed them, so neither carries over. Its disclosure does: it was
   * given in this launch of the application, and REQ-TRACE-472 suppresses the disclosure for the remainder of it.
   */
  const carriedOver = (prior: Launch | undefined, unit: string): Pick<Launch, 'action' | 'instructions'> =>
    (prior === undefined || prior.unit !== unit ? { action: 'release' } : { action: prior.action, ...(prior.instructions === undefined ? {} : { instructions: prior.instructions }) });
  /**
   * Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md` — REQ-TRACE-472/482/464. A card resting
   * in `ready` whose launch the process lost (a restart: `launches` is memory only) is recovered here from the store's
   * worktree row, by take-over and never by provisioning: the queue's release has no transition and so no row to write
   * a new tree into, and REQ-TRACE-464 forbids a second tree for the unit. Called from the queue's release, which records
   * the disclosure it carries on the recovered launch, and once on the first pass after a start, so an unattended
   * workspace's scheduler can claim the card with no release at all. A launch already holding this unit's tree only
   * takes the disclosure. Answers the reason when nothing could be taken over, for the caller to state as the stall
   * (REQ-TRACE-463); the launch is then kept without a tree, so the claim still refuses it.
   */
  const recoverLaunch = async (card: BoardCard, disclosure: Launch['disclosure'], opts: { readonly onlyIfAbsent?: boolean } = {}): Promise<string | undefined> => {
    const id = card.id;
    const prior = launches.get(id);
    const unit = unitOfCard(card);
    if (prior?.worktree !== undefined && prior.unit === unit && existsSync(prior.worktree.path)) { launches.set(id, { ...prior, disclosure }); return undefined; }
    const kept = carriedOver(prior, unit);
    // Defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`: a unit no tree was ever recorded for
    // (a reject, or a run ending `cancelled`, rested the card in `ready` on its next unit) is not a stall. The launch is
    // kept without a tree, and the claim provisions it (REQ-TRACE-464); this release and the pass write nothing
    // (REQ-TRACE-408). A recorded tree that is gone stays the stall below.
    if (unrecorded(id, unit)) {
      launches.set(id, { unit, disclosure, ...kept });
      log(`requirements: ${id} unit ${unit} has no tree yet; the claim provisions it (disclosure ${disclosure})`);
      return undefined;
    }
    const taken = await takeOverRecorded(id, unit);
    // The pass's recovery (`onlyIfAbsent`) found no launch before it waited on Git; a queue release that recovered the
    // card meanwhile recorded the person's disclosure, and an undisclosed launch must not overwrite it (the verifier's
    // optional finding, repair round 2).
    if (opts.onlyIfAbsent === true && launches.has(id)) return undefined;
    if (taken?.ok === true) {
      launches.set(id, { unit, disclosure, worktree: taken.value, ...kept });
      log(`requirements: ${id} unit ${unit} takes over its worktree at ${taken.value.path} on ${taken.value.branch} (the tree the store recorded for it, its launch lost since the release; disclosure ${disclosure})`);
      return undefined;
    }
    const reason = taken === undefined ? missingTreeReason(id, unit) : `the worktree recorded for ${id} unit ${unit} was not taken over: ${taken.error}`;
    launches.set(id, { unit, disclosure, ...kept });
    log(`requirements: ${id} unit ${unit} rests in ready with no launch to start: ${reason}`, 'warn');
    return reason;
  };
  /** REQ-TRACE-464's provisioning, inside the writer's `beforeCommit` slot: a refusal here writes nothing (REQ-TRACE-472's declined disclosure, REQ-TRACE-498's repository rows); a resume's failure never stops the blocker clearing (REQ-TRACE-463). */
  const beforeCommit = async (id: ReqId, action: BoardAction, decision: { readonly startsRun: boolean }, payload: Readonly<Record<string, string>> | undefined) => {
    if (!decision.startsRun) return undefined;
    const record = recordOf(id);
    const card = current?.cards.find((c) => c.id === id);
    const unitsStarted = Number(card?.facts.find((f) => f.label === 'Units')?.value ?? '0');
    const unit = unitOfCard(card);
    const d = payload?.['disclosure'];
    const disclosure: Launch['disclosure'] = d === 'accepted' || d === 'suppressed' || d === 'off' ? d : 'undisclosed';
    const instructions = payload?.['instructions'];
    const softFailure = !ACTION_CLASS[action].startsRun; // resume / answer-blocker returning to ready: the blocker clears whatever happens (REQ-TRACE-463)
    const fail = (reason: string) => { if (softFailure) { stalled.set(id, reason); launches.set(id, { unit, disclosure, action, ...(instructions === undefined ? {} : { instructions }) }); return undefined; } throw new Error(reason); };
    // REQ-TRACE-464: "The run SHALL take over the worktree already provisioned for it and SHALL never provision a second
    // one." A card held out of `ready` before its run began and then resumed derives the SAME unit (its `Units` fact has
    // not moved), and that unit's tree is already on disk: the launch the release left holds it, or — after a restart
    // lost the launch — the store's worktree row names it. Provisioning it again refused the existing path (REQ-GIT-140),
    // the soft failure replaced the launch with one that had no worktree, and no claim could ever take the card (defect
    // note `a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`). The resume's own
    // disclosure and instructions are recorded on the launch it takes over; the store's row is already written.
    const takeOver = (tree: ProvisionedWorktree, from: string) => {
      launches.set(id, { unit, disclosure, action, worktree: tree, ...(instructions === undefined ? {} : { instructions }) });
      stalled.delete(id);
      armed.add(id);
      log(`requirements: ${id} unit ${unit} takes over its worktree at ${tree.path} on ${tree.branch} (${from}; disclosure ${disclosure})`);
      return undefined;
    };
    const prior = launches.get(id);
    if (prior?.worktree !== undefined && prior.unit === unit && existsSync(prior.worktree.path)) return takeOver(prior.worktree, 'the launch its release provisioned');
    // A launch of an earlier unit is spent, so its tree is no reason to skip the store's row for THIS unit.
    const taken = prior?.worktree === undefined || prior.unit !== unit ? await takeOverRecorded(id, unit) : undefined;
    if (taken?.ok === true) return takeOver(taken.value, 'the tree the store recorded for it');
    if (taken !== undefined) log(`requirements: ${id} unit ${unit}'s recorded worktree was not taken over: ${taken.error}`, 'warn');
    const repo = await git.checkRepository(workspaceRoot);
    if (!repo.ok) return fail(repo.reason);
    const made = await git.provision({ workspaceRoot, id, unit, title: record?.title ?? id, branchTemplate: requirements.execution.branch_template, cycle: unitsStarted + 1 });
    if (!made.ok) return fail(made.error);
    launches.set(id, { unit, disclosure, action, worktree: made.value, ...(instructions === undefined ? {} : { instructions }) });
    stalled.delete(id);
    armed.add(id); // REQ-TRACE-482: the person released it (from the board); under `manual` that is the release the wording names
    log(`requirements: ${id} unit ${unit} provisioned at ${made.value.path} on ${made.value.branch} (disclosure ${disclosure})`);
    return { worktree: { ref: made.value.ref, unit, path: made.value.path, branch: made.value.branch } };
  };
  /**
   * Defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md` — REQ-TRACE-464/423/482. The tree of
   * the card's current unit when the launch held does not hold it: provisioned here when the store records none for the
   * unit (no run-starting action did: a reject, or a run ending `cancelled`), its row written at once so a restart before
   * the start takes it over rather than provisioning a second one; taken over when the store records one on disk; and
   * the stated stall when the recorded tree is gone. Only the claim reaches this — the system's dispatch, under both
   * modes — never a read of the board (REQ-TRACE-408) and never the reject (REQ-TRACE-389/422 fix what it does to the
   * worktree).
   */
  const treeForClaim = async (id: ReqId, unit: string, card: BoardCard | undefined, title: string): Promise<Result<ProvisionedWorktree, string>> => {
    if (unrecorded(id, unit)) {
      const repo = await git.checkRepository(workspaceRoot);
      if (!repo.ok) return err(repo.reason);
      const unitsStarted = Number(card?.facts.find((f) => f.label === 'Units')?.value ?? '0');
      const made = await git.provision({ workspaceRoot, id, unit, title, branchTemplate: requirements.execution.branch_template, cycle: unitsStarted + 1 });
      if (!made.ok) return made;
      writer.recordWorktreeProvisioned(id, { ref: made.value.ref, unit, path: made.value.path, branch: made.value.branch });
      log(`requirements: ${id} unit ${unit} provisioned at ${made.value.path} on ${made.value.branch} by the claim (no run-starting action provisioned it)`);
      return made;
    }
    const taken = await takeOverRecorded(id, unit);
    if (taken === undefined) return err(missingTreeReason(id, unit));
    if (!taken.ok) return err(`the worktree recorded for ${id} unit ${unit} was not taken over: ${taken.error}`);
    log(`requirements: ${id} unit ${unit} takes over its worktree at ${taken.value.path} on ${taken.value.branch} at the claim`);
    return taken;
  };
  /** Set when a claim stated a stall, so the claim's reply carries the queue's move for channel 10. */
  let claimStalled = false;
  const claim = async (): Promise<RunClaim | null> => {
    if (current === undefined) return null;
    const board = current;
    const out = schedule(board);
    for (const id of out.dispatch) {
      let l = launches.get(id);
      // The invariant defect AP-4 broke: what the scheduler offers, the claim takes. A mismatch is a defect of the
      // scheduler's inputs, so it is logged rather than passed over in silence.
      if (l === undefined || !disclosed(l)) { log(`requirements: the scheduler offered ${id} but its launch is ${l === undefined ? 'absent' : 'undisclosed'}; nothing was claimed for it`, 'warn'); continue; }
      const record = recordOf(id);
      if (record === undefined) continue;
      const card = board.cards.find((c) => c.id === id);
      const unit = unitOfCard(card);
      claimed.add(id); // held while Git works, so a second schedule reads the slot as taken
      if (l.unit !== unit || l.worktree === undefined || !existsSync(l.worktree.path)) {
        const tree = await treeForClaim(id, unit, card, record.title);
        if (!tree.ok) {
          // REQ-TRACE-463: the reason the start did not begin rides on the entry until the next release of it.
          claimed.delete(id); armed.delete(id);
          stalled.set(id, tree.error);
          claimStalled = true;
          log(`requirements: the start of ${id} unit ${unit} did not begin: ${tree.error}`, 'warn');
          continue;
        }
        l = { unit, disclosure: l.disclosure, ...carriedOver(l, unit), worktree: tree.value };
        launches.set(id, l);
        stalled.delete(id);
      }
      const wt = l.worktree!;
      return { id, unit: l.unit, worktree: { ref: wt.ref, path: wt.path, branch: wt.branch, baseBranch: wt.baseBranch, baseRevision: wt.baseRevision }, prompt: runPromptFor(record, l.unit, l.instructions), permissions: permissionsOf(l) };
    }
    return null;
  };
  const runBySession = (sessionId: string) => reader.runningRuns().find((r) => r.sessionId === sessionId);
  /** REQ-TRACE-417/418/420: every element shown or explicitly unavailable, read from the rows, the session record, Git and the run's `proposed-requirements.json` (REQ-TRACE-427). */
  const review = async (id: ReqId, board: BoardProjection): Promise<ReviewPayload> => {
    const card = board.cards.find((c) => c.id === id);
    const record = recordOf(id);
    const runs = reader.runs(id);
    const finished = [...runs].reverse().find((r) => r.status !== 'running');
    const latest = runs[runs.length - 1];
    const empty: ReviewPayload = {
      id, title: record?.title ?? id, column: card?.column ?? 'backlog',
      claim: { summary: null, risks: [], completion: { claimed: false, statement: 'No run has reported a completion claim.' } },
      measurement: { checks: [], verification: 'Nothing was verified for this requirement.', changedFiles: [], traceabilityChanges: [], unmetConditions: [] },
      work: { specification: { snapshotHash: null, snapshotAt: null, currentHash: record?.canonicalHash ?? '', diverged: false }, units: [], branch: null, worktree: null, proposals: [], proposalsState: 'none' },
    };
    if (card === undefined) return { ...empty, refusal: `${id} is not on this board.` };
    // REQ-TRACE-424's two sentences, worded apart.
    if (card.column !== 'review') return { ...empty, refusal: `${id} is not awaiting a review decision: it is in ${card.column}.` };
    if (finished === undefined) return { ...empty, refusal: `${id} is awaiting review, but no finished run was recorded for it: there is nothing to review yet.` };
    const dal = new StoreDal(db);
    const session = finished.sessionId === null ? undefined : dal.getSession(asSessionId(finished.sessionId));
    const summary = session?.summary_text ?? null;
    const claimed = session?.execution_status === 'completed';
    const measured = card.evidence.verification;
    const unmet: string[] = [];
    const n = nowOf(id);
    if (n !== undefined) { const r = reader.reachable(id, 'review', 'done', n, { kind: 'system' }, now()); if (!r.reachable && r.reason !== undefined) unmet.push(r.reason); }
    const contradicted = claimed && (measured === 'failed' || unmet.length > 0);
    const changedFiles = await changedFilesOf(finished.worktreePath, launches.get(id)?.worktree?.baseRevision ?? null);
    const proposals = readProposals(finished.worktreePath);
    const units = runs.map((r) => ({ unit: r.unit, ...(r.sessionId === null ? {} : { sessionId: r.sessionId }), status: r.status, ...(r.outcome === null ? {} : { outcome: r.outcome }), startedAt: r.startedAt, ...(r.endedAt === null ? {} : { endedAt: r.endedAt }), permissions: r.permissions }));
    const st = reader.state(id);
    const snapshot = { snapshotHash: st.snapshotHash, snapshotAt: st.snapshotAt };
    return {
      id, title: record?.title ?? id, column: card.column,
      claim: {
        summary, risks: risksOf(summary),
        completion: { claimed, statement: !claimed ? `The agent made no completion claim: the run ended ${finished.outcome ?? finished.status}.` : contradicted ? 'The agent claimed completion; measurement contradicted it.' : 'The agent claimed completion; the claim stands unmeasured.' },
      },
      measurement: {
        checks: session === undefined ? [] : [{ name: 'run', outcome: `${session.execution_status}${session.stop_reason ? ` (${session.stop_reason})` : ''}` }],
        verification: measured === undefined ? 'No verification has been recorded for this requirement.' : `Verification recorded: ${measured}.`,
        changedFiles, traceabilityChanges: card.evidence.sites.map((s) => `${s.kind} at ${s.path}:${s.line}`), unmetConditions: unmet,
      },
      work: { specification: { ...snapshot, currentHash: record?.canonicalHash ?? '', diverged: snapshot.snapshotHash !== null && snapshot.snapshotHash !== (record?.canonicalHash ?? '') }, units, branch: latest?.branch ?? null, worktree: latest?.worktreePath ?? null, ...proposals },
    };
  };
  /** The files the work modified: the unit's commits against the base it branched from where that is still known, plus what is uncommitted in its tree; each path once. */
  const changedFilesOf = async (worktree: string | null, baseRevision: string | null): Promise<ReviewPayload['measurement']['changedFiles']> => {
    if (worktree === null || !existsSync(worktree)) return [];
    const run = async (args: readonly string[]) => { const r = await invokeGit({ args, workspaceRoot: worktree, timeoutMs: millis(15_000), timers: clocks.timers, clock: clocks.monotonic }).catch(() => null); return r !== null && r.outcome === 'exited' && r.status === 0 ? r.stdout : ''; };
    const parseNumstat = (text: string) => text.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => { const [a, d, ...p] = l.split('\t'); return { path: p.join('\t'), added: a === '-' ? null : Number(a), removed: d === '-' ? null : Number(d) }; });
    const byPath = new Map<string, { path: string; added: number | null; removed: number | null }>();
    for (const f of parseNumstat(baseRevision === null ? '' : await run(['diff', '--numstat', baseRevision, 'HEAD']))) byPath.set(f.path, f);
    for (const f of parseNumstat(await run(['diff', '--numstat', 'HEAD']))) { const seen = byPath.get(f.path); byPath.set(f.path, seen === undefined ? f : { path: f.path, added: seen.added === null || f.added === null ? null : seen.added + f.added, removed: seen.removed === null || f.removed === null ? null : seen.removed + f.removed }); }
    for (const l of (await run(['ls-files', '--others', '--exclude-standard'])).split(/\r?\n/)) if (l.trim() !== '' && !byPath.has(l)) byPath.set(l, { path: l, added: null, removed: null });
    return [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  };
  const readProposals = (worktree: string | null): Pick<ReviewPayload['work'], 'proposals' | 'proposalsState'> => {
    if (worktree === null) return { proposals: [], proposalsState: 'none' };
    const file = join(worktree, '.rotaris', 'proposed-requirements.json');
    if (!existsSync(file)) return { proposals: [], proposalsState: 'none' };
    try {
      const v = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      if (!Array.isArray(v)) return { proposals: [], proposalsState: 'unreadable' };
      const list = v.filter((p): p is { title: string; description: string; derivedFrom: string; unit: string } => typeof p === 'object' && p !== null && typeof (p as { title?: unknown }).title === 'string');
      return { proposals: list.map((p) => ({ title: p.title, description: p.description ?? '', derivedFrom: p.derivedFrom ?? '', unit: p.unit ?? '' })), proposalsState: list.length === 0 ? 'none' : 'present' };
    } catch { return { proposals: [], proposalsState: 'unreadable' }; }
  };
  const risksOf = (summary: string | null): string[] => (summary ?? '').split(/\r?\n/).filter((l) => /^\s*[-*]?\s*risk\b/i.test(l)).map((l) => l.replace(/^\s*[-*]?\s*/, ''));
  const blockerPayload = (id: ReqId): BlockerPayload => {
    const st = reader.state(id);
    const open = st.openBlockers[st.openBlockers.length - 1];
    const run = open === undefined || open.runUnit === null ? undefined : reader.runs(id).find((r) => r.unit === open.runUnit);
    // REQ-TRACE-449's precedence, with `resume` always offered (REQ-TRACE-454; no "no way forward" path, REQ-TRACE-448).
    const paths = (o: NonNullable<typeof open>): BlockerPayload['answerPaths'] => (o.options.length > 0 ? ['choose', 'resume'] : o.blockingIds.length > 0 ? ['navigate', 'resume'] : o.kind === 'run-failure' ? ['inspect', 'resume'] : ['resume']);
    return {
      id, returnTo: (st.returnTo as BlockerPayload['returnTo']) ?? null,
      blocker: open === undefined ? null : { kind: open.kind, reason: open.reason, options: open.options, blockingIds: open.blockingIds, runUnit: open.runUnit, runSessionId: run?.sessionId ?? null, raisedAt: open.raisedAt },
      answerPaths: open === undefined ? ['resume'] : paths(open),
    };
  };
  const decodeDraft = <T,>(document: string): T | undefined => { try { const v = JSON.parse(document) as unknown; return typeof v === 'object' && v !== null ? (v as T) : undefined; } catch { return undefined; } };
  // ---- end of the Part AP block ----

  const input = (): BoardInput => ({
    workspace: workspaceRoot, generation, producedAt: now(), parse, ...(parseFailure === undefined ? {} : { parseFailure }), report,
    queue: { ...reader.queue(), stopped },
    // REQ-TRACE-346: reported by the pass, never deduced. No pass in this build analyses anything, so it is false and said so.
    analysisEnabled: false,
    inFlight,
    source: (({ writable, canCreate }) => ({ writable, canCreate }))(source()), // Part AP: REQ-TRACE-435/444 — the store directory's writability by this account, probed at every projection
  });
  /** REQ-TRACE-348: one immutable value per generation; the generation moves BEFORE the value is computed so the value carries it. */
  const rebuild = (): number => {
    generation += 1;
    // Part AP: the base projection supplies the scheduler's candidates; the published value carries the scheduler's own queue (REQ-TRACE-478).
    const base = reader.board(input());
    const scheduled = schedule(base);
    current = reader.board({ ...input(), queue: { ...reader.queue(), stopped, entries: scheduled.queue.entries } });
    return generation;
  };
  const nowOf = (id: ReqId): RequirementNow | undefined => {
    const r = parse?.records.find((x) => x.id === id);
    return r === undefined ? undefined : { id, canonicalHash: r.canonicalHash, lifecycle: r.status, isEpic: r.isEpic };
  };
  /** REQ-TRACE-349: concurrent cold reads coalesce onto one engine read. */
  const refresh = (): Promise<number> => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const signal = new AbortController().signal;
      const p = await engine.parseStore(workspaceRoot, { signal });
      if (!p.ok) { parse = undefined; parseFailure = p.error; report = undefined; }
      else {
        parse = p.value; parseFailure = undefined;
        const s = await engine.sweep(parse, { signal });
        if (!s.ok) { report = undefined; log(`requirements sweep failed: ${JSON.stringify(s.error)}`, 'warn'); }
        else {
          const v = await engine.verify(parse, s.value, { signal });
          report = v.ok ? v.value : undefined;
          if (!v.ok) log(`requirements verify failed: ${JSON.stringify(v.error)}`, 'warn');
        }
      }
      // REQ-TRACE-476: the restart reap runs once, after the first parse, so the settling entries carry the hash of that instant.
      if (reaped === undefined) {
        reaped = reapStaleRuns(reader, writer, new Set(), (id) => nowOf(id)?.canonicalHash);
        for (const r of reaped) log(`requirements reap: ${r.id} unit ${r.unit} ${r.statement}${r.held ? ' (held, returns to ready)' : ''}`, 'warn');
      }
      // Part AP — REQ-TRACE-407/437: a delivered requirement whose text moved is moved out of the terminal state by the pass, through the normal evaluation.
      if (parse !== undefined) for (const r of parse.records) { const n = nowOf(r.id); if (n !== undefined) { const m = writer.recordSpecificationMoved(r.id, { now: n }); if (m.ok && m.value.historyEntry !== 0) log(`requirements: ${r.id} moved ${m.value.from} → ${m.value.to} (specification changed since it was accepted)`); } }
      // Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md`: every pass that parses gives each
      // card resting in `ready` with NO launch held (a restart lost it; nothing else leaves a candidate without one) the
      // tree its release recorded, undisclosed — the queue's release records the disclosure; an unattended workspace needs
      // none (REQ-TRACE-474) and main's claim carries the standing one (REQ-TRACE-472), so the scheduler can claim it. It
      // was tied to the restart reap's one pass, and a first parse that failed used it up for the session (the verifier's
      // first finding). A card it could not recover keeps a launch with no tree, so it is tried once, not on every pass.
      // Git is only read here: nothing is provisioned and no delivery record is written (REQ-TRACE-408).
      // The cards' take-overs are independent Git reads, so they run together rather than one after another before the
      // first projection is published.
      if (parse !== undefined) {
        const resting = reader.board(input()).cards.filter((card) => card.column === 'ready' && !launches.has(card.id) && !inFlight.has(card.id));
        await Promise.all(resting.map(async (card) => { const failed = await recoverLaunch(card, 'undisclosed', { onlyIfAbsent: true }); if (failed !== undefined) stalled.set(card.id, failed); }));
      }
      return rebuild();
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  };
  const ensure = async (): Promise<BoardProjection> => {
    if (current === undefined) await refresh();
    return current!;
  };

  const detail = (id: ReqId, board: BoardProjection): RequirementDetail | undefined => {
    // REQ-TRACE-348: a detail read describes the generation of the board it was read against — the card is that board's.
    const card = board.cards.find((c) => c.id === id);
    if (card === undefined) return undefined;
    const record = parse?.records.find((r) => r.id === id);
    return {
      card,
      prose: record?.prose ?? '',
      history: reader.history(id),
      runs: reader.runs(id).map((r) => ({ unit: r.unit, ...(r.sessionId === null ? {} : { sessionId: r.sessionId }), ...(r.branch === null ? {} : { branch: r.branch }), ...(r.worktreePath === null ? {} : { worktree: r.worktreePath }), status: r.outcome === null ? r.status : `${r.status}: ${r.outcome}` })),
      evidenceDetail: [...card.evidence.sites].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line)),
      findings: (report?.findings ?? []).filter((f) => f.id === id),
    };
  };

  const service: DeliveryService = {
    get reaped() { return reaped ?? []; },
    get generation() { return generation; },
    async handle(command, actor, disclosure) {
      // REQ-TRACE-472/478: main's standing disclosure moved since the queue was last published (a permanent acceptance, the
      // elevation switched, or the first command after a start told the service what the preferences are). The queue is
      // recomputed under the new value BEFORE the command is answered, and the reply carries the move for channel 10, so
      // no surface keeps reading a reason the scheduler no longer gives. Nothing is written: the value is main's.
      const moved = disclosure !== undefined && disclosure !== standing && current !== undefined;
      if (disclosure !== undefined) standing = disclosure;
      if (moved) rebuild();
      const answer = await answerCommand(command, actor);
      return moved ? { ...answer, changed: { generation, affected: null } } : answer;
    },
  };
  /** The command proper, under the standing disclosure `handle` settled. */
  async function answerCommand(command: RequirementsCommandPayload, actor: Actor): Promise<DeliveryAnswer> {
      // Part AP — REQ-TRACE-392: the system is the sole actor that places a requirement into a run; a person's copy of a run command is refused.
      if (SYSTEM_ONLY_REQUIREMENTS_COMMANDS.has(command.name) && actor.kind !== 'system') return { value: { ok: false, error: { reason: `${command.name} is the run coordinator's to speak, not a person's; nothing changed.` } } };
      switch (command.name) {
        case 'requirements.board':
          return { value: await ensure() };
        case 'requirements.detail': {
          const board = await ensure();
          const d = detail(command.id, board);
          return { value: d ?? { error: `${command.id} is not on this board.` } };
        }
        case 'requirements.refresh': {
          // REQ-TRACE-341: a refresh the user initiates consults no model; this pass never does.
          const g = await refresh();
          return { value: { generation: g }, changed: { generation: g, affected: null } };
        }
        case 'requirements.reachable': {
          await ensure();
          const n = nowOf(command.id);
          const answer: Reachability = n === undefined
            ? { reachable: false, confirm: false, reason: `${command.id} is not in this requirement store.`, glyph: '⊘', reachableFromSource: [] }
            : reader.reachable(command.id, command.from, command.to, n, actor, now());
          return { value: answer };
        }
        case 'requirements.act': {
          await ensure();
          const n = nowOf(command.id);
          if (n === undefined) return { value: { ok: false, error: { reason: `${command.id} is not in this requirement store; nothing was written.` } } };
          inFlight.set(command.id, command.action);
          try {
            // Part AP: the writer's `beforeCommit` slot — the worktree and the disclosure of a run-starting action (REQ-TRACE-387/464/472).
            const r = await writer.transition(command.id, command.action, actor, { now: n }, { ...(command.target === undefined ? {} : { target: command.target }), ...(command.payload === undefined ? {} : { payload: command.payload }), beforeCommit: (d) => beforeCommit(command.id, command.action, d, command.payload) });
            inFlight.delete(command.id);
            if (!r.ok) return { value: r };
            if (r.value.historyEntry === 0) return { value: r };
            // Persist before publish: the commit is behind us; the generation moves now and main publishes after this reply.
            const g = rebuild();
            log(`requirements: ${command.id} ${command.action} ${r.value.from} → ${r.value.to} by ${actor.kind === 'user' ? `user ${actor.person}` : 'system'} (entry ${r.value.historyEntry}, generation ${g})`);
            // Part AP — REQ-TRACE-463: the reason nothing started rides on the action's result rather than being dropped.
            const stall = stalled.get(command.id);
            return { value: stall === undefined ? r : { ...r, value: { ...r.value, dispatch: stall } }, changed: { generation: g, affected: [command.id] } };
          } finally {
            inFlight.delete(command.id);
          }
        }
        case 'requirements.queue.set': {
          await ensure();
          const q = reader.queue();
          // Part AP — REQ-TRACE-480: the two persisted controls are written into the workspace configuration and take effect without a restart; the stop is never persisted.
          if (command.automatic !== undefined || command.concurrency !== undefined) {
            const patch = { requirements: { scheduling: { mode: (command.automatic ?? q.automatic) ? 'automatic' : 'manual', max_concurrent_units: command.concurrency ?? q.concurrency } } };
            const problems = validateRequirementsPatch(patch.requirements);
            if (problems.length > 0) return { value: { ok: false, error: { reason: problems.map((p) => `${p.path} ${p.message}`).join('; ') } } };
            const w = await commitConfigFields(configDir, workspaceRoot, 'workspace', patch, clocks.timers);
            if (!w.ok) return { value: { ok: false, error: { reason: `The queue setting could not be written to the workspace configuration: ${w.refusal.file}: ${w.refusal.fault}` } } };
            loadConfig();
            writer.setQueue(command.automatic ?? q.automatic, command.concurrency ?? q.concurrency);
          }
          if (command.stop === true) stopped = true;
          if (command.start === true) stopped = false;
          if (command.hold !== undefined) { held.add(command.hold); armed.delete(command.hold); }
          if (command.release !== undefined) {
            const id = command.release;
            held.delete(id); stalled.delete(id); armed.add(id);
            const l = launches.get(id);
            const card = current?.cards.find((c) => c.id === id);
            // Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md`: a candidate in `ready`
            // whose launch was lost (or holds no tree) is recovered from the store's row, so "Disclose and start"
            // records its disclosure and the release arms it (REQ-TRACE-472/482/464); otherwise the disclosure is
            // recorded on the launch held, as before.
            if (card?.column === 'ready') {
              const failed = await recoverLaunch(card, command.disclosure ?? l?.disclosure ?? 'undisclosed');
              if (failed !== undefined) { stalled.set(id, failed); armed.delete(id); }
            } else if (command.disclosure !== undefined && l !== undefined) launches.set(id, { ...l, disclosure: command.disclosure });
          }
          const g = rebuild();
          return { value: current!.queue, changed: { generation: g, affected: null } };
        }
        // Part AJ2 — REQ-TRACE-508..511 reach the one engine (ADR-0040 specific 6) through the board's command family, on
        // the route main's `traceability.operate` takes (`traceability.ts`), and the reply carries that route's shape so a
        // surface reads one form. REQ-TRACE-512: the root is the open workspace's, the engine itself refuses a second
        // operation of a kind as `busy`, and a layout or unanticipated failure comes back stated. A regeneration or a
        // baseline update changes what the next verification reads, and a check IS the verification the board presents
        // (REQ-TRACE-508: its findings reach the requirements view), so each of those three re-reads the projection and
        // moves the generation — main publishes it after this reply; a comparison writes nothing the board shows.
        case 'requirements.operation': {
          const started = Number(clocks.monotonic.now());
          // REQ-TRACE-212/216: the phases are logged by name; channel 10's `progress?` is where they would go (not built).
          const options = { signal: new AbortController().signal, progress: (r: { kind: string; phase: string }) => { if (r.kind === 'phase') log(`requirements ${command.operation} (${workspaceRoot}): phase ${r.phase}`); } };
          const r = command.operation === 'check' ? await engine.check(workspaceRoot, options)
            : command.operation === 'regenerate' ? await engine.regenerate(workspaceRoot, options)
              : command.operation === 'baselines' ? await engine.updateBaselines(workspaceRoot, options)
                : await engine.compare(workspaceRoot, command.base, options);
          const elapsedMs = Math.max(0, Math.round(Number(clocks.monotonic.now()) - started));
          log(`requirements ${command.operation} (${workspaceRoot}): ${r.ok ? 'ok' : `refused: ${r.error.kind}`} in ${elapsedMs} ms`, r.ok ? 'info' : 'warn');
          const value = { kind: 'traceability.result', operation: command.operation, root: workspaceRoot, elapsedMs, result: r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error } };
          if (!r.ok || command.operation === 'compare') return { value };
          const g = await refresh();
          return { value, changed: { generation: g, affected: null } };
        }
        case 'requirements.cancel': {
          // The seam's engine offers no cancel; the process's handle does (`TraceabilityEngineHandle`), and a fake without
          // one has nothing to stop. The board names the baseline update `baselines`; the engine names it `updateBaselines`.
          const handle = engine as { cancel?: (root: string, operation: 'check' | 'regenerate' | 'updateBaselines' | 'compare') => boolean };
          const op = command.operation === 'check' || command.operation === 'regenerate' || command.operation === 'compare' ? command.operation : command.operation === 'baselines' ? 'updateBaselines' : undefined;
          const cancelled = op !== undefined && typeof handle.cancel === 'function' ? handle.cancel(workspaceRoot, op) : false;
          log(`requirements cancel ${command.operation} (${workspaceRoot}): ${cancelled ? 'signalled' : 'nothing in flight'}`);
          return { value: { kind: 'traceability.cancelled', cancelled } };
        }
        // Part AP — the source write (REQ-TRACE-434..444, 498): the service composes and writes; the pane reports text and shows the result (REQ-TRACE-439).
        case 'requirements.source.write': {
          await ensure();
          if (parse === undefined) return { value: { ok: false, error: { reason: 'No requirement store is open, so nothing can be written.' } } };
          const s = source();
          if (!s.writable) return { value: { ok: false, error: { reason: s.reason ?? 'The requirement store is read-only here; nothing was written.' } } };
          if (command.id !== undefined) {
            const record = recordOf(command.id);
            if (record === undefined) return { value: { ok: false, error: { reason: `${command.id} is not in this requirement store; nothing was written.` } } };
            if (!documentWritable(workspaceRoot, record.sourcePath)) return { value: { ok: false, error: { reason: readOnlySentence(command.id, record.sourcePath) } } };
            const draft = decodeDraft<SourceEditDraft>(command.document);
            if (draft === undefined || typeof draft.title !== 'string' || typeof draft.prose !== 'string') return { value: { ok: false, error: { reason: 'The edit carried no title and description to write; nothing was written.' } } };
            if (draft.title.trim() === '') return { value: { ok: false, error: { reason: 'A requirement needs a title; nothing was written.' } } };
            const text = readSourceText(workspaceRoot, record.sourcePath);
            if (text === null) return { value: { ok: false, error: { reason: `${record.sourcePath} could not be read; nothing was written.` } } };
            const edited = editRequirementDocument(text, command.id, { title: draft.title, prose: draft.prose });
            if (!edited.ok) return { value: { ok: false, error: { reason: edited.error } } };
            const w = await writeSourceDocument(workspaceRoot, record.sourcePath, edited.value, { clocks });
            if (!w.ok) return { value: { ok: false, error: { reason: w.error } } };
            // REQ-TRACE-405/383: the record of the action, then the re-evaluation that picks the hash change up (REQ-TRACE-434/437).
            const n = nowOf(command.id)!;
            await writer.transition(command.id, 'edit', actor, { now: n }, { payload: { summary: `title and description written to ${record.sourcePath}` } });
            const g = await refresh();
            log(`requirements: ${command.id} edited in ${record.sourcePath} by ${actor.kind === 'user' ? `user ${actor.person}` : 'system'} (generation ${g})`);
            return { value: { ok: true, value: { id: command.id, path: record.sourcePath } }, changed: { generation: g, affected: null } };
          }
          const draft = decodeDraft<SourceCreateDraft>(command.document);
          if (draft === undefined || typeof draft.title !== 'string' || draft.title.trim() === '') return { value: { ok: false, error: { reason: 'A new requirement needs a title; nothing was written.' } } };
          if (draft.kind === 'technical' && (draft.derivedFrom === undefined || draft.derivedFrom.length === 0)) return { value: { ok: false, error: { reason: 'A technical requirement is not creatable without an origin: name the requirement it derives from (REQ-TRACE-444).' } } };
          const tombstoned = new Set<number>((parse as { details?: { tombstoned?: readonly number[] } }).details?.tombstoned ?? []);
          const id = nextIdentifier(parse, tombstoned, draft.epic);
          if (!id.ok) return { value: { ok: false, error: { reason: id.error } } };
          const location = command.location !== undefined ? { ok: true as const, value: command.location } : createLocation(parse, id.value, draft.title, draft.epic);
          if (!location.ok) return { value: { ok: false, error: { reason: location.error } } };
          const text = composeRequirementDocument({ id: id.value, title: draft.title, prose: draft.prose ?? '', kind: draft.kind ?? 'product', derivedFrom: draft.derivedFrom ?? [], ...(draft.priority === undefined ? {} : { priority: draft.priority }), date: now().slice(0, 10) });
          const w = await writeSourceDocument(workspaceRoot, location.value, text, { clocks });
          if (!w.ok) return { value: { ok: false, error: { reason: w.error } } };
          if (draft.epic !== undefined) {
            const epic = recordOf(draft.epic);
            const epicText = epic === undefined ? null : readSourceText(workspaceRoot, epic.sourcePath);
            const appended = epic === undefined || epicText === null ? null : appendEpicIndexRow(epicText, { id: id.value, title: draft.title, priority: draft.priority, lifecycle: 'draft', relativeLink: epicIndexLink(epic.sourcePath, location.value) });
            if (epic !== undefined && appended !== null) { const e = await writeSourceDocument(workspaceRoot, epic.sourcePath, appended, { clocks }); if (!e.ok) log(`requirements: the index of ${epic.id} was not updated (${e.error})`, 'warn'); }
          }
          const g = await refresh();
          const n = nowOf(id.value);
          if (n !== undefined) await writer.transition(id.value, 'create', actor, { now: n }, { payload: { summary: `created at ${location.value}` } });
          log(`requirements: ${id.value} created at ${location.value} by ${actor.kind === 'user' ? `user ${actor.person}` : 'system'} (generation ${g})`);
          return { value: { ok: true, value: { id: id.value, path: location.value } }, changed: { generation: rebuild(), affected: null } };
        }
        case 'requirements.source.previewLocation': {
          await ensure();
          if (parse === undefined) return { value: { ok: false, error: { reason: 'No requirement store is open, so no location can be previewed.' } } };
          // REQ-TRACE-444: a workspace with no writable store gets a board and no editor — and no previewed location either (REQ-TRACE-443 reports the inability rather than a path).
          const writable = source();
          if (!writable.canCreate) return { value: { ok: false, error: { reason: writable.reason ?? 'The requirement store cannot be created into here; no location can be previewed.' } } };
          const id = nextIdentifier(parse, new Set(), command.epic);
          if (!id.ok) return { value: { ok: false, error: { reason: id.error } } };
          const location = createLocation(parse, id.value, '', command.epic);
          // REQ-TRACE-443: the location the write produces, with the slug of the title still to come — the pane substitutes the title's slug into the same rule (`slugOf`).
          if (!location.ok) return { value: { ok: false, error: { reason: location.error } } };
          return { value: { ok: true, value: { id: id.value, location: location.value.replace(/-x\.md$/, '-<slug>.md'), confirmSourceWrites: requirements.human_in_the_loop.confirm_source_writes, storeDir: parse.layout.storeDir, epics: parse.records.filter((r) => r.isEpic).map((r) => ({ id: r.id, title: r.title })) } } };
        }
        // Part AP — the run family: main's coordinator speaks these as the system (REQ-TRACE-392); the guard above refuses a person's copy.
        case 'requirements.run.preview': {
          const board = await ensure();
          const record = recordOf(command.id);
          if (record === undefined) return { value: { ok: false, error: { reason: `${command.id} is not in this requirement store.` } } };
          const card = board.cards.find((c) => c.id === command.id);
          const unitsStarted = Number(card?.facts.find((f) => f.label === 'Units')?.value ?? '0');
          const unit = unitIdFor(unitsStarted);
          const branch = renderBranch(requirements.execution.branch_template, { requirementId: command.id, unitId: unit, slug: record.title }, { cycle: unitsStarted + 1 });
          const repo = await git.checkRepository(workspaceRoot);
          const simulated = schedule(board);
          const entry = simulated.queue.entries.find((e) => e.id === command.id);
          const free = Math.max(0, reader.queue().concurrency - reader.runningRuns().length) > simulated.dispatch.length;
          const preview: RunLaunchPreview = {
            id: command.id, action: command.action, unit, branch: branch.ok ? branch.value : `(${branch.error})`,
            worktreePath: branch.ok ? requirementWorktreePath(workspaceRoot, branch.value) : requirementWorktreePath(workspaceRoot, slugOf(command.id)),
            workspaceUnattended: workspaceUnattended(),
            startsNow: !stopped && free && (entry === undefined || entry.state === 'next'),
            ...(stopped ? { deferredReason: 'The queue is stopped: nothing new begins until it is started again, while work already dispatched continues and completes as usual.' } : entry?.reason !== undefined ? { deferredReason: entry.reason } : !free ? { deferredReason: `Waiting for a unit slot: ${reader.runningRuns().length} of ${reader.queue().concurrency} in use.` } : {}),
            repository: repo.ok ? { ok: true } : { ok: false, reason: repo.reason, offerSetup: repo.offerSetup },
            approvalTimeoutSeconds,
          };
          return { value: preview };
        }
        case 'requirements.run.claim': {
          // Before the first pass, under `manual` with nothing armed, nothing is claimable — under `manual` only the
          // queue's release arms a candidate, and nothing is armed after a start — so the claim main's kick at a
          // workspace open makes is answered without parsing the store (REQ-TRACE-482).
          if (current === undefined && !reader.queue().automatic && armed.size === 0) return { value: null };
          await ensure();
          claimStalled = false;
          const c = await claim();
          if (!claimStalled) return { value: c };
          const g = rebuild();
          return { value: c, changed: { generation: g, affected: null } };
        }
        case 'requirements.run.started': {
          await ensure();
          const n = nowOf(command.id);
          if (n === undefined) return { value: { ok: false, error: { reason: `${command.id} is not in this requirement store.` } } };
          const l = launches.get(command.id);
          const wt = (l?.unit === command.unit ? l.worktree : undefined) ?? reader.worktrees(command.id).find((w) => w.unit === command.unit);
          // The claim is settled whatever the write does: a store error here once left the card `next` holding a slot
          // until a restart (defect note `a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`).
          let r: ReturnType<DeliveryWriter['recordRunStarted']>;
          try { r = writer.recordRunStarted(command.id, command.unit, command.sessionId, wt === undefined ? null : { ref: wt.ref, path: wt.path, branch: wt.branch }, command.permissions, { now: n }); } finally { claimed.delete(command.id); armed.delete(command.id); stalled.delete(command.id); }
          if (!r.ok) return { value: r };
          const g = rebuild();
          log(`requirements: ${command.id} unit ${command.unit} running as session ${command.sessionId} with ${command.permissions} permissions (generation ${g})`);
          return { value: r, changed: { generation: g, affected: [command.id] } };
        }
        case 'requirements.run.ended': {
          await ensure();
          const run = runBySession(command.sessionId);
          if (run === undefined) return { value: { settled: false, reason: `No running unit is recorded for session ${command.sessionId}.` } satisfies RunSettled };
          const n = nowOf(run.id) ?? { id: run.id, canonicalHash: '', lifecycle: 'approved' as const, isEpic: false };
          const r = writer.recordRunEnded(run.id, run.unit, command.outcome, command.detail, { now: n });
          const g = rebuild();
          log(`requirements: ${run.id} unit ${run.unit} ended ${command.outcome}: ${command.detail} (generation ${g})`);
          return { value: { settled: r.ok, id: run.id, unit: run.unit, ...(r.ok ? { to: r.value.to } : { reason: r.error.reason }) } satisfies RunSettled, changed: { generation: g, affected: [run.id] } };
        }
        case 'requirements.run.abandon': {
          await ensure();
          claimed.delete(command.id); armed.delete(command.id);
          stalled.set(command.id, command.reason);
          const g = rebuild();
          log(`requirements: the start of ${command.id} unit ${command.unit} did not begin: ${command.reason}`, 'warn');
          return { value: { released: true }, changed: { generation: g, affected: [command.id] } };
        }
        case 'requirements.run.waiting': {
          await ensure();
          const run = runBySession(command.sessionId);
          if (run === undefined) return { value: { noted: false } };
          const stage = command.waiting ? WAITING_ON_PERSON : null;
          if ((run.stage === WAITING_ON_PERSON) === command.waiting) return { value: { noted: true } };
          writer.recordRunStage(run.id, run.unit, stage);
          const g = rebuild();
          return { value: { noted: true }, changed: { generation: g, affected: [run.id] } };
        }
        case 'requirements.run.reap': {
          await ensure();
          const out = reapStaleRuns(reader, writer, new Set(command.live), (id) => nowOf(id)?.canonicalHash);
          for (const r of out) { log(`requirements reap: ${r.id} unit ${r.unit} ${r.statement}${r.held ? ' (held, returns to ready)' : ''}`, 'warn'); launches.delete(r.id); claimed.delete(r.id); }
          const g = rebuild();
          return { value: out satisfies RunReaped[], ...(out.length === 0 ? {} : { changed: { generation: g, affected: out.map((r) => r.id) } }) };
        }
        case 'requirements.review':
          return { value: await review(command.id, await ensure()) };
        case 'requirements.blocker': {
          await ensure();
          return { value: blockerPayload(command.id) };
        }
      }
  }
  return service;
}

/** One service per open store, keyed by the `ResolvedStore` object so a reopen (after a restore) builds a new one. */
const services = new WeakMap<ResolvedStore, DeliveryService>();
export function deliveryServiceFor(open: ResolvedStore, deps: Omit<DeliveryServiceDeps, 'db'>): DeliveryService {
  let s = services.get(open);
  if (s === undefined) { s = createDeliveryService({ db: open.db, ...deps }); services.set(open, s); }
  return s;
}
