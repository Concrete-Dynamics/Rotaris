import { homedir } from 'node:os';
import { SKILLS_GESTURE_REPLY_BOUND_MS, SKILLS_READ_REPLY_BOUND_MS, skillListing, skillListingBody, type SkillsState, type SkillRow } from '@rotaris/contracts';
import type { SessionWriter } from '@rotaris/engine';
import { millis, type Millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import {
  asyncDiscoveryPorts, discoverInstructionFiles, DiscoveryStopped, discoverSkills, discoverSkillsAsync, enabledInstructionFiles, instructionContextUnit, loadManualSkill, mergeInstructionContext,
  NODE_ASYNC_DISCOVERY_PORTS, NODE_DISCOVERY_PORTS, parseSkill, PRODUCT_DIRECTORIES_UNIT, resolveSkills,
  skillBodyBlock, skillCatalogBlock, skillReadRoots,
  type AsyncDiscoveryPorts, type DiscoveredSkill, type DiscoveryPorts, type InstructionFileEntry, type InstructionsSection, type SkillDiscovery, type SkillSessionState, type SkillsSection,
} from '@rotaris/config';

/** PD-WORKSPACE-002 — what one saved-configuration read answers for the instruction files: the section, the master switch, the global base. */
export interface InstructionPolicy {
  readonly section: InstructionsSection;
  readonly master: boolean;
  readonly globalDir: string;
}

/**
 * OQ-279 (ruled 2026-10-13 under R-072) read with REQ-CONFIG-478: one read of the SAVED configuration — the section it
 * states, or the fatal report when it does not load. A fatal load leaves the configuration UNLOADED ("the load fails as a
 * whole rather than falling back to a default"), so a reader answers the report and never the shipped defaults, which
 * both readers below returned until 2026-10-14
 * (docs/defects/fixed/the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md).
 */
export type SavedRead<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly fault: string };

/** The sections a run was configured with at its start: what a run already under way keeps whatever the file says since. */
export interface RunSections {
  readonly skills: SkillsSection;
  readonly instructions: InstructionPolicy;
}

/** OQ-279: the refusal of a skills gesture or projection while the workspace's configuration does not load; the detail is the report. */
export const SKILLS_CONFIGURATION_UNLOADED = 'The workspace configuration did not load, so no portable skill is offered until it is corrected';

/**
 * OQ-279: what `state` and `forceLoad` throw when the read they make of the saved `skills:` section does not load — carrying the
 * fault, so `dispatch.ts` answers the request with the refusal from THIS read, whatever an earlier read found
 * (docs/defects/fixed/a-skills-request-throws-when-the-configuration-stops-loading-between-its-two-reads.md).
 */
export class SkillsUnloaded extends Error {
  constructor(readonly fault: string) {
    super(`${SKILLS_CONFIGURATION_UNLOADED}: ${fault}`);
    this.name = 'SkillsUnloaded';
  }
}

/**
 * ADR-0063 — the portable-skill catalog, owned by the run host.
 *
 * **Why here and not in the configuration loader.** The catalog is cached per resolved workspace root and
 * cleared **on every session creation** (REQ-WORKSPACE-058), so skills are re-discovered from disk at each
 * new session. That is not configuration's lifetime — configuration is re-read at each run start and cached
 * across none — and only the process that creates sessions can honour it. The units it feeds are composed at
 * agent construction, which is also here.
 *
 * **Session state** (REQ-WORKSPACE-057, 073) is keyed by session id, with one `pending:<root>` bucket per
 * workspace root that the next session created for that root adopts. A gesture made from a window showing no
 * session has no session to name, and `PD-WORKSPACE-001` has since made two live sessions on one workspace
 * ordinary, so "the current session" needs a referent the requirements do not supply — logged as **OQ-58**,
 * built this way, and stated here so the two cannot drift.
 *
 * **What this module never does** (REQ-WORKSPACE-066): pre-fetch a body, rewrite one, or summarise one. A
 * body is read from disk at the moment a unit is composed, and an unreadable one produces no block and a
 * warning naming the skill, leaving every other part of the agent's context exactly as it would have been.
 */
export interface SkillHostDeps {
  /** The user's home; injectable so the proof can point discovery at a scratch tree. */
  readonly home?: string;
  /**
   * The machine-wide directory both discoveries read under, `/etc/codex` when absent: `PD-WORKSPACE-002`'s
   * machine-wide instruction base is the directory itself, and REQ-WORKSPACE-051's fourth user-scope skill root is
   * its `skills` child. Injectable on the same terms as `home`, so a proof lays a file down at that base, and the
   * catalog tests stage a skill under it, without reading or touching the machine's own.
   */
  readonly machineDir?: string | undefined;
  readonly platform?: NodeJS.Platform;
  readonly ports?: DiscoveryPorts;
  /**
   * OQ-386 point 1: the ports the warm-up at a workspace open reads through (`warm`). Absent, they are `ports` behind the
   * asynchronous face where `ports` is given, and `node:fs/promises` otherwise. One tree serves both walks only when it is
   * given as `ports` (alone, or with these beside it): `asyncPorts` given alone moves the warm-up and nothing else, and the
   * cold walk, the rescan and every body read still go to the real filesystem, because a synchronous port cannot be derived
   * from an asynchronous one.
   */
  readonly asyncPorts?: AsyncDiscoveryPorts;
  /** The SAVED `skills:` section for a workspace, or its fatal report (OQ-279) — see `forceLoad` on why it is read per gesture. */
  readonly section: (workspaceRoot: string) => SavedRead<SkillsSection>;
  /**
   * PD-WORKSPACE-002 — the master switch, the per-file policy and the global configuration directory
   * the instruction-file discovery reads its `global` base from, or the fatal report (OQ-279). Absent means the
   * workspace pair alone reaches an agent, which is what a build with no configuration layer would give it.
   */
  readonly instructions?: ((workspaceRoot: string) => SavedRead<InstructionPolicy>) | undefined;
  /**
   * OQ-279: the sections the session's run was configured with (`configuredRuns`), for an agent built while the saved file
   * no longer loads — the run keeps what it was given at its start. Absent, or undefined for a session with no run here:
   * nothing is offered from an unloaded configuration.
   */
  readonly configured?: ((sessionId: string) => RunSections | undefined) | undefined;
  /** ADR-0006: the monotonic clock port. Absent means the discovery log carries no duration, never a global read. */
  readonly monotonic?: MonotonicClock | undefined;
  /** ADR-0006: the timer port, which bounds a `skills.*` request's wait for a warm-up in flight (`settled`). */
  readonly timers: Timers;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}

/**
 * OQ-386 point 1 with ADR-0002 consequence 11 (every request bounded, and nothing proceeds on an expiry): how long a
 * `skills.*` request waits for a warm-up in flight before it is refused (`SKILLS_STILL_DISCOVERING`). A wedged walk — a read
 * that never returns — would otherwise hold every skills request for its root with no bound, past main's own bounds on them
 * (`SKILLS_READ_REPLY_BOUND_MS`, `SKILLS_GESTURE_REPLY_BOUND_MS`), so main's would expire and no answer would arrive at all.
 *
 * FALSIFIED 2026-10-31, kept beside its replacement: "when the bound fires, the request walks the tree synchronously, on the
 * loop", at 6 s so as to leave 4 s for that walk. The ruling says the warm-up never holds the loop and that a request waits
 * "instead of walking the tree a second time", and the case the bound fires in is the slow disk the repair exists for. So the
 * request is refused, the walk goes on and stores its catalogue for the next request, and nothing reads the tree on the loop.
 *
 * FALSIFIED 2026-11-01, kept beside its replacement: "the bound sits just under main's tightest", one 9 s for all four requests.
 * It refused at 9 s a read main allows 15 s, and left a gesture about 1 s, in which a loaded host could apply a force-load after
 * main had expired and reported failure. So each request's wait is main's bound for that request less
 * `WARM_UP_REPLY_MARGIN`: a read still answers a walk as slow as the 8,201.5 ms the launch of 2026-10-16 logged, and a gesture,
 * which a person is waiting on, is refused sooner and with room for the work it does when released.
 */
export const WARM_UP_REPLY_MARGIN = millis(3_000);
export type SkillsWaiter = 'read' | 'gesture';
export const warmUpWaitBound = (waiter: SkillsWaiter): Millis => millis((waiter === 'read' ? SKILLS_READ_REPLY_BOUND_MS : SKILLS_GESTURE_REPLY_BOUND_MS) - WARM_UP_REPLY_MARGIN);

/**
 * OQ-386 point 1: how long a warm-up runs before the product stops saying "in a moment" of it (`SKILLS_DISCOVERY_STALLED` states
 * this figure). A read that never returns keeps its walk in flight, since no read can be cancelled and a second walk would only
 * park beside it on the same dead mount, holding more of the thread pool. From here a gesture is refused at once rather than made
 * to wait for an answer that may never come; a read still waits, which is what lets a surface hold the catalogue the moment the
 * walk ends, however late.
 */
export const WARM_UP_STALL_BOUND = millis(60_000);

/** What a `skills.*` request found: it may read, or it is refused, the walk being under or past `WARM_UP_STALL_BOUND`. */
export type SkillsWait = 'ready' | 'discovering' | 'stalled';

/** One warm-up in flight: its promise, the flag its walk's `stopped` reads (set by a clear), what was said of it, and its stall. */
interface Warming {
  readonly promise: Promise<void>;
  stopped: boolean;
  overrunSaid: boolean;
  stalled: boolean;
  readonly stall: { cancel(): void };
}

/** The pending bucket's key: a workspace root that has no session yet, or none on screen. */
const pendingKey = (workspaceRoot: string): string => `pending:${workspaceRoot}`;
interface MutableSession {
  forced: Set<string>;
  manual: Map<string, DiscoveredSkill>;
}

export class SkillHost {
  /** REQ-WORKSPACE-058: per resolved workspace root, cleared by a rescan and by session creation. */
  private readonly catalogs = new Map<string, SkillDiscovery>();
  /**
   * OQ-386 point 1 — the generation guard. Every clear of a root's catalogue (a rescan, a session creation) advances its
   * generation, and a warm-up stores the catalogue it read only if the generation it began under is still the root's when
   * it ends. A warm-up that a clear overtook read the tree as it stood before the clear, and the clear exists so that the
   * next reader sees the tree as it stands now (REQ-WORKSPACE-058, 069): its result is set aside, never published over it.
   */
  private readonly generations = new Map<string, number>();
  /** OQ-386 point 1: the warm-up in flight per root, which a `skills.*` request waits for rather than walking the tree again. */
  private readonly warming = new Map<string, Warming>();
  /**
   * REQ-WORKSPACE-046: the merged workspace context, on the same lifetime and cleared in the same places.
   * REQ-WORKSPACE-050: nested by base workspace, then by the root the run EXECUTES in — a session in an
   * isolated worktree reads its context files from that worktree while keeping the base workspace's catalog,
   * so two sessions on one base with different execution roots hold different merges and neither answers for
   * the other. The clear stays keyed by the base root, which is what a rescan and a session creation name.
   */
  private readonly contexts = new Map<string, Map<string, string>>();
  private readonly sessions = new Map<string, MutableSession>();

  constructor(private readonly deps: SkillHostDeps) {}

  private get home(): string {
    return this.deps.home ?? homedir();
  }
  private get ports(): DiscoveryPorts {
    return this.deps.ports ?? NODE_DISCOVERY_PORTS;
  }
  private get asyncPorts(): AsyncDiscoveryPorts {
    return this.deps.asyncPorts ?? (this.deps.ports === undefined ? NODE_ASYNC_DISCOVERY_PORTS : asyncDiscoveryPorts(this.deps.ports));
  }
  private generationOf(workspaceRoot: string): number {
    return this.generations.get(workspaceRoot) ?? 0;
  }
  /**
   * REQ-WORKSPACE-058/069: the catalogue cleared, and its generation advanced so a warm-up begun before it is set aside. That
   * warm-up is no longer one a request waits for either: its result will not be the catalogue, so a request after the clear
   * reads the tree as it stands now (one already waiting is released when the walk ends and reads the same, or is refused at the bound).
   *
   * The rule for the superseded walk: it is STOPPED, not left to finish. Its result would be set aside anyway, and a walk left
   * running would keep reading the same tree beside the one a later `warm` starts — twice the disk load for one catalogue.
   * Its flag is set here, the walk starts no further read (`discoverSkillsAsync`'s `stopped`) and ends at once with the reads
   * already in flight.
   */
  private clearCatalog(workspaceRoot: string): void {
    this.catalogs.delete(workspaceRoot);
    this.generations.set(workspaceRoot, this.generationOf(workspaceRoot) + 1);
    const superseded = this.warming.get(workspaceRoot);
    if (superseded) { superseded.stopped = true; superseded.stall.cancel(); }
    this.warming.delete(workspaceRoot);
  }

  private stateFor(key: string): MutableSession {
    let held = this.sessions.get(key);
    if (!held) { held = { forced: new Set(), manual: new Map() }; this.sessions.set(key, held); }
    return held;
  }
  /** OQ-58: a gesture with a session is that session's; one without lands in its root's pending bucket. */
  private keyFor(workspaceRoot: string, sessionId: string | undefined): string {
    return sessionId === undefined || sessionId === '' ? pendingKey(workspaceRoot) : sessionId;
  }
  private sessionState(workspaceRoot: string, sessionId: string | undefined): SkillSessionState {
    const held = this.sessions.get(this.keyFor(workspaceRoot, sessionId));
    return held ? { forced: held.forced, manual: held.manual } : { forced: new Set(), manual: new Map() };
  }

  /** The catalog, discovering on a cold cache. Never throws: an unreadable tree yields an empty discovery. */
  catalog(workspaceRoot: string): SkillDiscovery {
    const held = this.catalogs.get(workspaceRoot);
    if (held) return held;
    const started = this.deps.monotonic?.now() ?? null;
    const discovery = discoverSkills(
      { workspaceRoot, home: this.home, platform: this.deps.platform ?? process.platform, machineDir: this.deps.machineDir, exists: (p) => this.ports.isDirectory(p) || this.ports.isFile(p) },
      this.ports,
    );
    return this.publish(workspaceRoot, discovery, started);
  }

  /** The catalogue stored for its root, and said: each warning and skip at `warn`, then the one count line either walk writes. */
  private publish(workspaceRoot: string, discovery: SkillDiscovery, started: Millis | null): SkillDiscovery {
    this.catalogs.set(workspaceRoot, discovery);
    for (const warning of discovery.warnings) this.deps.log(`skills: ${warning}`, 'warn');
    for (const skipped of discovery.skipped) this.deps.log(`skills: skipped ${skipped.path} — ${skipped.reason}`, 'warn');
    const took = started === null ? '' : ` in ${((this.deps.monotonic!.now() as number) - (started as number)).toFixed(1)} ms`;
    this.deps.log(`skills: ${discovery.skills.length} discovered${took} (${workspaceRoot})${discovery.skipped.length > 0 ? `; ${discovery.skipped.length} skipped` : ''}`);
    return discovery;
  }

  /**
   * REQ-WORKSPACE-058 at a workspace open (OQ-386 point 1, ruled 2026-10-21) — the catalogue warmed without holding the run
   * host's loop: the tree read through the asynchronous walk, a few reads at a time (`discoverSkillsAsync`). It never
   * rejects: a failure is logged and costs nothing, because the next ask discovers on a cold cache anyway. A root whose
   * catalogue is held, or whose warm-up is already in flight, starts nothing.
   *
   * The result is stored only under the generation the warm-up began in (`generations`): a rescan or a session creation
   * that cleared the root meanwhile wins, and the warm-up's catalogue is set aside. A catalogue a cold ask stored meanwhile,
   * under the same generation, is kept rather than replaced: it is no older than this one.
   */
  warm(workspaceRoot: string): Promise<void> {
    if (this.catalogs.has(workspaceRoot)) return Promise.resolve();
    const inFlight = this.warming.get(workspaceRoot);
    if (inFlight) return inFlight.promise;
    const flags = { stopped: false, overrunSaid: false, stalled: false };
    const stall = this.deps.timers.after(WARM_UP_STALL_BOUND, () => {
      flags.stalled = true;
      this.deps.log(`skills: the discovery begun at the open of ${workspaceRoot} has not settled within ${WARM_UP_STALL_BOUND} ms, so a read it made may never return; a gesture is refused at once until it ends (OQ-386)`, 'warn');
    });
    const promise: Promise<void> = this.warmUnder(workspaceRoot, this.generationOf(workspaceRoot), () => flags.stopped).finally(() => {
      stall.cancel();
      if (this.warming.get(workspaceRoot) === walk) this.warming.delete(workspaceRoot);
    });
    const walk: Warming = Object.assign(flags, { promise, stall });
    this.warming.set(workspaceRoot, walk);
    return promise;
  }

  /** `warm`'s walk: the catalogue read asynchronously and stored only under `generation`, stopping once `stopped`. Never rejects. */
  private async warmUnder(workspaceRoot: string, generation: number, stopped: () => boolean): Promise<void> {
    const started = this.deps.monotonic?.now() ?? null;
    const ports = this.asyncPorts;
    const setAside = (): void => this.deps.log(`skills: the discovery begun at the open of ${workspaceRoot} was set aside: a rescan or a session creation cleared the catalogue while it ran`);
    try {
      const discovery = await discoverSkillsAsync(
        { workspaceRoot, home: this.home, platform: this.deps.platform ?? process.platform, machineDir: this.deps.machineDir, exists: async (p) => (await ports.isDirectory(p)) || (await ports.isFile(p)) },
        ports,
        undefined,
        stopped,
      );
      if (this.generationOf(workspaceRoot) !== generation) { setAside(); return; }
      if (!this.catalogs.has(workspaceRoot)) this.publish(workspaceRoot, discovery, started);
    } catch (cause) {
      // Only a clear stops a walk, and a clear moves the generation.
      if (cause instanceof DiscoveryStopped) { setAside(); return; }
      this.deps.log(`skills: discovery on workspace open failed: ${String(cause)}`, 'warn');
    }
  }

  /**
   * OQ-386 point 1: what `skills.read`, `skills.forceLoad`, `skills.loadFile` and `skills.list` wait for before they read the
   * catalogue — the warm-up in flight for this root, so it is read once and not walked a second time beside it. `ready` when the
   * request may read: at once when none is in flight or a catalogue is already held (a cold ask stored one beside the walk),
   * and otherwise when the walk ends, whether it succeeded, failed (`warm` resolves either way) or was set aside by a clear.
   * `discovering` or `stalled` when `warmUpWaitBound(waiter)` passed on the timer port first (ADR-0002 consequence 11): the request
   * is refused and reads nothing, and the walk goes on, so the next request finds its catalogue. The constants state why. A gesture
   * meeting a walk already past `WARM_UP_STALL_BOUND` is `stalled` at once.
   */
  settled(workspaceRoot: string, waiter: SkillsWaiter): Promise<SkillsWait> {
    const walk = this.warming.get(workspaceRoot);
    if (walk === undefined || this.catalogs.has(workspaceRoot)) return Promise.resolve('ready');
    if (waiter === 'gesture' && walk.stalled) return Promise.resolve('stalled');
    return new Promise<SkillsWait>((released) => {
      const limit = warmUpWaitBound(waiter);
      const bound = this.deps.timers.after(limit, () => {
        if (this.catalogs.has(workspaceRoot)) { released('ready'); return; }
        this.sayOverrun(workspaceRoot, walk, limit);
        released(walk.stalled ? 'stalled' : 'discovering');
      });
      void walk.promise.then(() => { bound.cancel(); released('ready'); });
    });
  }

  /**
   * A warm-up its waiters stopped waiting for: said once at `warn`, naming the root, however many waiters' bounds find it. A walk
   * a clear stopped does not go on: it is parked on a read already in flight, and only that read's return ends it.
   */
  private sayOverrun(workspaceRoot: string, walk: Warming, limit: Millis): void {
    if (walk.overrunSaid) return;
    walk.overrunSaid = true;
    const after = walk.stopped ? 'the discovery was stopped by a rescan or a session creation and starts no further read' : 'the discovery goes on';
    this.deps.log(`skills: the discovery begun at the open of ${workspaceRoot} has not settled within ${limit} ms; the request waiting on it is refused and ${after} (OQ-386, ADR-0002)`, 'warn');
  }

  /**
   * REQ-WORKSPACE-069: clear the cache for this root, re-run discovery against the filesystem. It changes
   * no load or invocation policy and marks nothing dirty; it governs agents constructed afterwards and
   * leaves agents already built untouched, which follows from the units being composed per construction.
   */
  rescan(workspaceRoot: string): SkillDiscovery {
    this.clearCatalog(workspaceRoot);
    // REQ-WORKSPACE-046: "an explicit cache-clear operation SHALL force a reload" — the rescan is that
    // operation for both caches, so a file edited between sessions reaches the next agent built.
    this.contexts.delete(workspaceRoot);
    return this.catalog(workspaceRoot);
  }

  /** REQ-WORKSPACE-058: session creation clears the catalog cache AND adopts that root's pending gestures. */
  onSessionCreated(workspaceRoot: string, sessionId: string): void {
    this.clearCatalog(workspaceRoot);
    // REQ-WORKSPACE-046: the merged context is cleared with the catalog, so each new session re-reads it.
    this.contexts.delete(workspaceRoot);
    const pending = this.sessions.get(pendingKey(workspaceRoot));
    if (pending) {
      this.sessions.set(sessionId, pending);
      this.sessions.delete(pendingKey(workspaceRoot));
      if (pending.forced.size > 0 || pending.manual.size > 0) this.deps.log(`skills: session ${sessionId} adopts ${pending.forced.size} forced and ${pending.manual.size} manual skill(s) chosen before it began`);
    }
  }


  /** A session that is gone takes its forced set and its manual skills with it (REQ-WORKSPACE-057/073). */
  onSessionEnded(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** OQ-279: the saved configuration's fatal report for this workspace, or undefined when it loads. */
  fault(workspaceRoot: string): string | undefined {
    const saved = this.deps.section(workspaceRoot);
    return saved.ok ? undefined : saved.fault;
  }

  /**
   * The `skills:` section in force: the SAVED one, or — while the file does not load (OQ-279) — the one the session's run
   * was started with, and none at all where no run of that session is known here. Never the shipped defaults.
   */
  private skillsSection(workspaceRoot: string, sessionId: string | undefined): SkillsSection | undefined {
    const saved = this.deps.section(workspaceRoot);
    if (saved.ok) return saved.value;
    const given = sessionId === undefined || sessionId === '' ? undefined : this.deps.configured?.(sessionId)?.skills;
    this.deps.log(`skills: the configuration did not load for ${workspaceRoot} (${saved.fault}); ${given === undefined ? 'no skill is offered from it' : `session ${sessionId} keeps the skills section its run started with`} (OQ-279, REQ-CONFIG-478)`, 'warn');
    return given;
  }

  /**
   * The instruction policy in force, on the `skills:` section's terms; `'unloaded'` reads no instruction file at all.
   * `saved` is false for a run's own policy, which is that session's and so is never cached for the workspace.
   */
  private instructionPolicy(workspaceRoot: string, sessionId: string | undefined): { readonly policy: InstructionPolicy | undefined; readonly saved: boolean } | 'unloaded' {
    const saved = this.deps.instructions?.(workspaceRoot);
    if (saved === undefined) return { policy: undefined, saved: true };
    if (saved.ok) return { policy: saved.value, saved: true };
    const given = sessionId === undefined || sessionId === '' ? undefined : this.deps.configured?.(sessionId)?.instructions;
    this.deps.log(`workspace context: the configuration did not load for ${workspaceRoot} (${saved.fault}); ${given === undefined ? 'no instruction file is read' : `session ${sessionId} keeps the instruction policy its run started with`} (OQ-279, REQ-CONFIG-478)`, 'warn');
    return given === undefined ? 'unloaded' : { policy: given, saved: false };
  }

  private resolved(workspaceRoot: string, sessionId: string | undefined) {
    const section = this.skillsSection(workspaceRoot, sessionId);
    return section === undefined ? [] : resolveSkills(this.catalog(workspaceRoot).skills, section, this.sessionState(workspaceRoot, sessionId));
  }

  /**
   * REQ-WORKSPACE-041..048 (PD-WORKSPACE-002) — the merged instruction context, cached per resolved
   * workspace root for as long as the session lasts (REQ-WORKSPACE-046) so a second agent built in the
   * same session touches no filesystem.
   *
   * The policy is read from the SAVED configuration at each cold read, on the same argument the skills
   * section is: a switch the user has just saved gates the next session, and a run that started earlier
   * keeps what it was given. With the master switch false nothing is read at all (REQ-WORKSPACE-048).
   */
  workspaceContext(workspaceRoot: string, executionRoot?: string, sessionId?: string): string {
    /*
     * REQ-WORKSPACE-050: the files are read from the run's EXECUTION root — the worktree of an isolated
     * session — while the policy, the catalog and persona memory stay with the base workspace the user
     * selected. A worktree's branch may have changed `AGENTS.md`, and the run working in that tree is the
     * run those instructions are for. The per-file switches are unaffected: they key on a stable identity
     * (`workspace:AGENTS.md`), not on a path, so the switch the user set governs either root.
     */
    const readRoot = executionRoot === undefined || executionRoot === '' ? workspaceRoot : executionRoot;
    const held = this.contexts.get(workspaceRoot)?.get(readRoot);
    if (held !== undefined) return held;
    /*
     * REQ-WORKSPACE-049: the cold path is what the 200 ms bound is stated over, so it is timed here, on the
     * monotonic clock port, in the three parts it is made of — the saved policy read, the discovery over the
     * bases, the merge of the enabled set — and said in one line a proof can read back. The policy read is
     * inside the figure on purpose: `PD-WORKSPACE-002` made the per-file policy part of deciding which files
     * are merged at all, so a figure without it would bound less than the injection does. A cache hit above
     * reads no file and is not timed. No clock, no line: never a global read (ADR-0006).
     */
    const clock = this.deps.monotonic;
    const started = clock?.now() ?? null;
    const read = this.instructionPolicy(workspaceRoot, sessionId);
    // OQ-279: nothing is read from an unloaded configuration, and nothing is cached either, so the agent built after the
    // file is corrected reads it (REQ-CONFIG-478: correcting the file and loading again is sufficient).
    if (read === 'unloaded') return '';
    const policy = read.policy;
    const policyRead = clock?.now() ?? null;
    const enabled = this.enabledUnder(policy, workspaceRoot, readRoot, 'workspace context');
    const discovered = clock?.now() ?? null;
    const merged = enabled.length === 0
      ? ''
      : mergeInstructionContext(enabled, this.ports, (m) => this.deps.log(`workspace context: ${m}`, 'warn'));
    if (clock !== undefined && started !== null && policyRead !== null && discovered !== null) {
      const ended = clock.now();
      const ms = (from: number, to: number): string => (to - from).toFixed(2);
      this.deps.log(`workspace context: the enabled set of ${enabled.length} instruction file(s) merged into ${Buffer.byteLength(merged, 'utf8')} bytes in ${ms(started, ended)} ms (policy read ${ms(started, policyRead)} ms, discovery ${ms(policyRead, discovered)} ms, merge ${ms(discovered, ended)} ms) for ${readRoot}`);
    }
    // A run's own policy (the saved file not loading, OQ-279) is that session's, not the workspace's: not cached for it.
    if (!read.saved) return merged;
    const byRoot = this.contexts.get(workspaceRoot) ?? new Map<string, string>();
    byRoot.set(readRoot, merged);
    this.contexts.set(workspaceRoot, byRoot);
    return merged;
  }

  /**
   * The instruction files this workspace's policy allows to be read, discovered once and decided once.
   *
   * It is a method rather than a step inside `workspaceContext` because there are TWO readers of these
   * files and they had drifted apart: the retrospective held its own copy of the rule — two names at the
   * workspace root, no policy at all — so a file the user had switched off was still read into an analysis
   * and could still be proposed as an edit, while injection honoured every switch
   * (`docs/defects/fixed/the-retrospective-reads-instruction-files-the-user-switched-off.md`). Whether an ANALYSIS
   * is bound by a switch stated over what agents are GIVEN was **OQ-65**, ruled 2026-10-06 (R-071) as built: it is.
   *
   * FALSIFIED 2026-10-13, kept beside its replacement: "One computation, both callers." The retrospective was handed
   * this whole set, and since `PD-WORKSPACE-002` it holds the global, home-relative and machine-wide bases, which
   * `PD-LIBRARY-002`'s reach clause ("no user-global location") keeps out of the analysis. One computation still
   * decides the switches for both readers; the retrospective reads the workspace-root part of it, through
   * `retrospectiveInstructionFiles` below (PD-LIBRARY-002 revision 2, OQ-235, ruled under R-072).
   */
  instructionFiles(workspaceRoot: string, executionRoot?: string, forLog = 'instruction files'): readonly InstructionFileEntry[] {
    const readRoot = executionRoot === undefined || executionRoot === '' ? workspaceRoot : executionRoot;
    const read = this.instructionPolicy(workspaceRoot, undefined);
    return read === 'unloaded' ? [] : this.enabledUnder(read.policy, workspaceRoot, readRoot, forLog);
  }

  /**
   * PD-LIBRARY-002 revision 2 (OQ-235): what a retrospective may read — the files of the enabled set above that were
   * discovered at the WORKSPACE ROOT (the four root names, REQ-WORKSPACE-048's master switch and the per-file switches
   * all applied by the one computation), and none under the global, home-relative or machine-wide bases. The filter
   * keys on the stable id's `workspace:` prefix, not on `source`, which is a display label. Injection is untouched:
   * an agent is still given every enabled base, and the analysis sees those files' effects in the session history
   * without citing them or proposing an edit to a file that governs every other workspace too.
   */
  retrospectiveInstructionFiles(workspaceRoot: string): readonly InstructionFileEntry[] {
    const enabled = this.instructionFiles(workspaceRoot, undefined, 'retrospective');
    const atRoot = enabled.filter((file) => file.id.startsWith('workspace:'));
    this.deps.log(`retrospective: ${atRoot.length} of ${enabled.length} enabled instruction file(s) at the workspace root${atRoot.length === 0 ? '' : ` (${atRoot.map((f) => f.id).join(', ')})`} for ${workspaceRoot}`);
    return atRoot;
  }

  /** The discovery and the decision under a policy already read — split out so `workspaceContext` can time the read apart. */
  private enabledUnder(policy: InstructionPolicy | undefined, workspaceRoot: string, readRoot: string, forLog: string): readonly InstructionFileEntry[] {
    if (policy !== undefined && !policy.master) {
      this.deps.log(`${forLog}: injection is switched off for ${workspaceRoot}; no instruction file was read`);
      return [];
    }
    const env = { workspaceRoot: readRoot, globalDir: policy?.globalDir ?? '', home: this.home, platform: this.deps.platform ?? process.platform, machineDir: this.deps.machineDir };
    const present = discoverInstructionFiles(env, (p) => this.ports.isFile(p));
    const enabled = enabledInstructionFiles(present, true, policy?.section.overrides ?? {});
    this.deps.log(`${forLog}: ${enabled.length} of ${present.length} instruction file(s) enabled for ${readRoot}${readRoot === workspaceRoot ? '' : ` (the worktree of ${workspaceRoot}, REQ-WORKSPACE-050)`}${enabled.length === 0 ? '' : ` (${enabled.map((f) => f.id).join(', ')})`}`);
    return enabled;
  }

  /** The projection a surface reads (REQ-WORKSPACE-067; `contracts/skills.ts`). */
  state(workspaceRoot: string, sessionId?: string): SkillsState {
    // OQ-279: a projection of the policy needs the policy; the run host's `skills.*` requests refuse first (`fault`).
    const saved = this.deps.section(workspaceRoot);
    if (!saved.ok) throw new SkillsUnloaded(saved.fault);
    const section = saved.value;
    const discovery = this.catalog(workspaceRoot);
    const forced = this.sessionState(workspaceRoot, sessionId).forced;
    const skills: SkillRow[] = this.resolved(workspaceRoot, sessionId).map((r) => ({
      name: r.skill.name,
      declaredName: r.skill.declaredName,
      description: r.skill.description,
      path: r.skill.path,
      directory: r.skill.directory,
      scope: r.skill.scope,
      triggers: [...(r.skill.trigger?.keywords ?? [])],
      shadowed: [...r.skill.shadowed],
      // REQ-WORKSPACE-073: the PERSISTED policy, so the Load selector never shows a session force as configuration.
      loadMode: r.persistedLoad,
      invocationMode: r.invocation,
      forcedThisSession: forced.has(r.skill.name),
      userInvocable: r.userInvocable,
    }));
    return { enabled: section.enabled, skills, skipped: discovery.skipped.map((s) => ({ ...s })) };
  }

  /**
   * REQ-WORKSPACE-073 — the invoked command's effect. The master switch is read from the SAVED
   * configuration through `deps.section`, not from a run's captured snapshot, because this gates a user
   * gesture happening now rather than a run that started earlier; the `fetch` tool's per-call policy read
   * (REQ-SANDBOX-038) is the existing precedent. On refusal the skill's load mode is left as it was.
   *
   * Nothing is persisted: `<workspace>/.rotaris/agents.yaml` is untouched, `skills.overrides` is left
   * exactly as it was, settings are not marked dirty.
   */
  forceLoad(workspaceRoot: string, sessionId: string | undefined, name: string): { ok: true; name: string } | { ok: false; reason: string } {
    const saved = this.deps.section(workspaceRoot);
    // OQ-279: a gesture made now reads the file now, and an unloaded one offers no skill to force: the request is refused with
    // the fault (`SkillsUnloaded`), never answered as a skill not found.
    if (!saved.ok) throw new SkillsUnloaded(saved.fault);
    if (!saved.value.enabled) return { ok: false, reason: 'disabled' };
    const known = this.resolved(workspaceRoot, sessionId).find((r) => r.skill.name === name);
    if (!known) return { ok: false, reason: `No skill named '${name}' was discovered in this workspace.` };
    this.stateFor(this.keyFor(workspaceRoot, sessionId)).forced.add(name);
    this.deps.log(`skills: '${name}' force-loaded for ${sessionId ?? `the next session in ${workspaceRoot}`}`);
    return { ok: true, name };
  }

  /**
   * REQ-WORKSPACE-057 / 151 — a skill loaded by hand. Scope label `manual`, overrides a discovered skill of
   * the same normalized name, applies to this session only, persists nothing.
   */
  loadFile(workspaceRoot: string, sessionId: string | undefined, raw: string): { ok: true; name: string } | { ok: false; reason: string } {
    const loaded = loadManualSkill(raw, { workspaceRoot, home: this.home }, this.ports);
    if (!loaded.ok) return loaded;
    this.stateFor(this.keyFor(workspaceRoot, sessionId)).manual.set(loaded.skill.name, loaded.skill);
    this.deps.log(`skills: '${loaded.skill.name}' loaded by hand from ${loaded.skill.path} for ${sessionId ?? `the next session in ${workspaceRoot}`} (this session only)`);
    return { ok: true, name: loaded.skill.name };
  }

  /**
   * REQ-WORKSPACE-059 — the sorted, resolved skill directories, as additional READ roots for agent file
   * tools. A manual skill's directory is included: it is cataloged for this session, and an agent told about
   * a skill it cannot read the siblings of is worse than one not told at all. Writes to these roots stay
   * refused, which the fence decides and this list does not touch.
   */
  readRoots(workspaceRoot: string, sessionId?: string): readonly string[] {
    return skillReadRoots(this.resolved(workspaceRoot, sessionId).map((r) => r.skill));
  }

  /**
   * REQ-WORKSPACE-060, 061, 062 — the context units this session's agents receive, in the requirement's
   * order. Called at every agent construction (a getter, not a captured value), so a force-load reaches the
   * next agent built and never retracts one already running (REQ-CONFIG-166).
   *
   * The order is **workspace context → skill catalog → force-loaded skill bodies → persona memory**, and then,
   * under `PD-TOOLS-012` revision 2, the product statement. The first three exist; persona memory does not, so
   * the list is the seam where it will sit — an empty slot in a sequence, not a shape a later part has to re-cut.
   */
  contextUnits(workspaceRoot: string, sessionId?: string, executionRoot?: string): readonly string[] {
    const resolved = this.resolved(workspaceRoot, sessionId);
    const units: string[] = [];
    // REQ-WORKSPACE-047: ahead of the catalog, ahead of every force-loaded body. Empty merged content
    // constructs no unit — "with no context files, or injection disabled, no such unit SHALL be built".
    // The unit closes after its last file, so nothing the prompt carries next reads as that file's own (H4, 27a5127).
    const context = instructionContextUnit(this.workspaceContext(workspaceRoot, executionRoot, sessionId));
    if (context !== '') units.push(context);
    const catalog = skillCatalogBlock(resolved);
    if (catalog !== null) units.push(catalog);
    for (const r of resolved) {
      if (!r.forceLoaded) continue;
      let body: string;
      try {
        body = this.ports.readFile(r.skill.path);
      } catch (cause) {
        // REQ-WORKSPACE-062: no block, every other part of the context exactly as it would have been, and a
        // warning naming the skill. Never a refusal — a skill file deleted mid-session must not stop a run.
        this.deps.log(`skills: '${r.skill.name}' is set to always load but its body could not be read from ${r.skill.path} (${cause instanceof Error ? cause.message : String(cause)}); no block was added`, 'warn');
        continue;
      }
      // REQ-WORKSPACE-062: "the skill's body, with the YAML frontmatter removed". Re-parsed rather than taken
      // from the cached discovery, so the block carries what is on disk NOW — REQ-WORKSPACE-066 forbids the
      // framework holding a rewritten copy, and a body cached at discovery is exactly that. A file that has
      // since stopped parsing still contributes its text: the requirement conditions the block on the body
      // being readable, not on the frontmatter still being valid.
      const parsed = parseSkill(body);
      units.push(skillBodyBlock(r.skill.name, r.skill.path, parsed.ok ? parsed.skill.body : body));
    }
    // [slot] persona memory (REQ-WORKSPACE-060) — not built.
    const workspaceUnits = units.length;
    // PD-TOOLS-012 revision 2 (OQ-230): the product statement, last, on every call — with no instruction file, no skill and
    // injection off too — so every agent of the session is told what the product's own directories are. The engine appends
    // the units after whatever prompt the persona carries, built in or configured (`withContextUnits`, run.ts and
    // orchestration.ts). Finding D4 of the final duress run at a68f121: a docs-writer with no terminal wrote that the hidden
    // directories were absent, and a tester with one put them in the user's report, the answer and a project memory.
    units.push(PRODUCT_DIRECTORIES_UNIT);
    /*
     * What this agent is actually being given, at the moment it is given it. It names the skills rather than
     * carrying any body text: a log is not a place to put a document, and REQ-WORKSPACE-066 is about what
     * reaches a MODEL, not what reaches an operator reading a session log. Without this line the only evidence
     * that injection happened at all is the model's own behaviour, which is not evidence.
     */
    if (workspaceUnits > 0) {
      const forced = resolved.filter((r) => r.forceLoaded).map((r) => r.skill.name);
      const catalogued = resolved.filter((r) => r.inCatalog).map((r) => r.skill.name);
      this.deps.log(`skills: context units for ${sessionId ?? workspaceRoot}: catalog ${catalogued.length === 0 ? '(none)' : catalogued.join(', ')}; force-loaded ${forced.length === 0 ? '(none)' : forced.join(', ')}`);
    }
    return units;
  }
}

/**
 * REQ-CHAT-162 — `/skills`: the session's catalog, listed into its transcript as **one system row** and saved with
 * it. The row goes through the session's own writer, the one every other row of that session goes through, so the
 * three things the requirement and the plan ask of it are what that writer already guarantees rather than three
 * paths of this module's: the row and its `transcript.row` event commit in one transaction (saved with the session,
 * and in the trajectory export, which reads those events), the projection owner is fed on commit (drawn in every
 * window following the session), and a reopened session reads it back from the store like any other row.
 *
 * `writer` is `Sessions.writer(sessionId)`: present exactly while the session is loaded in this process, which a
 * session a window follows is (`session.subscribe` attaches, `session.resume` loads). A live run's writer and a
 * loaded idle session's are the same object — REQ-CHAT-084's clear relies on the same fact — so the listing lands
 * in order whether or not a run is going. An absent writer is refused rather than written around: a row appended
 * under the store alone would skip the event record, the projection and the session's lock.
 *
 * The `state` is `SkillHost.state` for that session, so a skill loaded by hand for it (REQ-WORKSPACE-057, scope
 * `manual`) is listed and one loaded for another session is not. Every discovered skill is listed whatever its load
 * or invocation policy and whether or not `skills.enabled` is on: the requirement lists "the discovered skills",
 * and the Settings table lists the same set.
 */
export function writeSkillListing(
  writer: Pick<SessionWriter, 'appendRow'> | undefined,
  state: SkillsState,
): { ok: true; count: number; index: number } | { ok: false; code: 'session.not-loaded' | 'skills.list-failed'; reason: string } {
  if (writer === undefined) return { ok: false, code: 'session.not-loaded', reason: 'The session this window follows is not loaded, so its transcript cannot be written.' };
  const listing = skillListing(state.skills);
  const r = writer.appendRow('system', skillListingBody(listing), true);
  if (!r.ok) return { ok: false, code: 'skills.list-failed', reason: 'reason' in r.error ? r.error.reason : r.error.code };
  return { ok: true, count: listing.count, index: r.value.index };
}
