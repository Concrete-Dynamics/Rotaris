import { CONTRACT_SCHEMA_VERSION, type ProcessMessage, type ProcessReply, type ServiceAsk, type ServiceAskEnvelope } from '@rotaris/contracts';
import { millis, toIsoUtc, type Millis } from '@rotaris/kernel';
import { dataLayout, environmentWithout, installedProductVersion, nodeClocks, probePid, readOrMintMachineId, resolveUserDirs } from '@rotaris/platform';
import type { PromptLists, StoreDal, StoreHandle } from '@rotaris/store';
import { meteredBackend, RefusalLease, LOOP_ACTIVATION_BUDGET_MS, RungMemory, Sessions, SUPERVISOR_DEFAULTS } from '@rotaris/engine';
import type { ModelRef, ThinkingLevel } from '@rotaris/model';
import { ConfinementService, PresenterRegistry, renderUnavailability, spawnTrial, type AvailabilityVerdict, STREAM_SETTINGS_DEFAULTS, withheldUnderPlanGate, type FileToolState, type TerminalManager } from '@rotaris/agent-tools';
import { createToolPort, fileAppender, implementationRole, RunHostPresenter, terminalManagerFromHost } from './tools.js';
import { createTerminalHost } from './terminal.js';
import { createHookPort } from './hooks.js';
import { runPreflight } from './intent.js';
import { createLoopClassifier } from './loop.js';
import { createCheckpointPort } from './checkpoints.js';
import { McpHost } from './mcp.js';
import { CHECKPOINTS_DEFAULTS, INSTRUCTIONS_DEFAULTS, loadConfiguration, RUNTIME_DEFAULTS, SKILLS_DEFAULTS, type LiveState } from '@rotaris/config';
import { codeIntelligenceLaunchFor } from './code-intelligence-launch.js';
import { SkillHost } from './skills.js'; // ADR-0063
import { captureAfterRun, dalWhileOpen } from './improvement-capture.js';
import { classifierSlotsOf, configureRun, egressReader, improvementCollectorOf, modelRefOf, postRunAnalystOf, restingCatalogueOf, type ConfiguredRun } from './configuration.js';
import { leasedSetup, leaseForContinuation, LeaseReportLog, type LeasedSetup } from './launch.js';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// The step-driven stand-in every proof runs against (`scripted-client.ts`); no provider, no key, no network.
import { fileLedger, scriptedClient, type ScriptedCallRecord } from './scripted-client.js';
import { throwOnAbortNames } from './throw-on-abort.js';

/**
 * RUN HOST — one utilityProcess, forked after `app.ready`, living exactly as
 * long as the application (ADR-0002 #2). It holds every session lock this
 * application takes, and therefore everything that writes a session: the
 * session writers, the projection owners they feed, and the runs
 * (ADR-0008, ADR-0013, ADR-0043).
 *
 * It is HANDED a resolved store path and never reads the identifier file
 * (W-18). A publication leaves here already stamped; main relays it.
 *
 * ADR-0058 step 3b: the refusal of new runs is a lease this process expires
 * itself, so a workspace service that died releases the workspace by doing
 * nothing.
 *
 * WHERE THE MODEL AND THE RUNTIME COME FROM — the configuration files, loaded
 * per run start with the live state on top (ADR-0036/0037, `configuration.ts`).
 * `ROTARIS_MODEL_DIALECT=scripted` selects a built-in scripted client for every
 * model (verification only). A fatal file or an unreachable entry model refuses
 * the run before it starts (REQ-EVENTS-021, REQ-CONFIG-478).
 */

/**
 * THE RUN HOST ITSELF — everything one live session's process holds, built once and handed to the dispatch.
 *
 * It was thirty-six module-scope bindings in `index.ts`, which meant that IMPORTING the run host started it: the
 * MCP host, the confinement service, the terminal manager and the code-intelligence launch all came up as a side
 * effect of the module being loaded, so nothing in this process could be reached from a test at all. They are a
 * function now. Importing this file starts nothing; calling `createRunHost` starts everything, and the dispatch
 * beside it takes what it needs as an argument (`dispatch.ts`).
 *
 * The order below is load-bearing — the presenters before the presenter that registers with them, the
 * configuration dependencies before the sessions that read them — so it is kept exactly as it stood.
 */
export function createRunHost() {
  const port = process.parentPort;
  const clocks = nodeClocks();
  const lease = new RefusalLease(clocks.monotonic);
  const stores = new Map<string, { file: string; root: string; db: StoreHandle | null; dal: StoreDal | null }>();
  const host = readOrMintMachineId(dataLayout(resolveUserDirs()).machineId);

  function send(m: ProcessMessage | ServiceAskEnvelope): void {
    port.postMessage(m);
  }

  /** The child's side of ADR-0002 c.7: a bounded request back to main, correlated by `ask` (the credential lease, ADR-0030). */
  let nextAsk = 1;
  const pendingAsks = new Map<number, { resolve: (r: ProcessReply) => void; reject: (e: Error) => void; cancel: () => void }>();
  function ask(request: ServiceAsk, boundMs: Millis): Promise<ProcessReply> {
    const n = nextAsk++;
    return new Promise<ProcessReply>((resolve, reject) => {
      const h = clocks.timers.after(boundMs, () => { pendingAsks.delete(n); reject(new Error(`main did not answer ${request.kind} within ${boundMs} ms`)); });
      pendingAsks.set(n, { resolve, reject, cancel: () => h.cancel() });
      send({ v: CONTRACT_SCHEMA_VERSION, ask: n, request });
    });
  }
  function reply(id: number, r: ProcessReply): void {
    send({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
  }
  function log(message: string, level: 'info' | 'warn' | 'debug' = 'info'): void {
    send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level, message } });
  }
  /** Part X: the DAL's readonly lists as the wire carries them (REQ-LIBRARY-138); the schema wants mutable arrays. */
  function asState(lists: PromptLists): { history: string[]; stash: string[] } {
    return { history: [...lists.history], stash: [...lists.stash] };
  }


  /**
   * ADR-0019: attendedness is a boolean THIS process maintains — true while main holds a live presenter
   * registration and the liveness poll has not lapsed. A lapse cancels every waiting approval (they
   * resolve `cancelled`); the next reply clears it. Decision 5 of the plan: 250 ms poll, 3,000 ms lapse.
   */
  const presenters = new PresenterRegistry({
    monotonic: clocks.monotonic, timers: clocks.timers,
    poll: (seq) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'presenter.poll', seq } }),
    onLapse: () => {
      const n = sessions.cancelAllPending();
      log(`presenter liveness lapsed (> ${presenters.lapseMs} ms without a reply): ${n} waiting approval(s) cancelled; the application is unattended until main answers (ADR-0019)`, 'warn');
    },
  });
  const presenter = new RunHostPresenter({
    post: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'approval.present', payload } }),
    close: (requestId) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'approval.close', requestId } }),
    clocks, shownBoundMs: 10_000,
  });
  const fileStates = new Map<string, FileToolState>();
  let approvalSequence = 0;
  // ADR-0020 / REQ-TOOLS-104: the terminal backend is decided once, by presence; the sessions live for the application.
  const terminalReady: Promise<TerminalManager | null> = terminalManagerFromHost(clocks, (m) => log(m, 'warn'), RUNTIME_DEFAULTS.shell_command_timeout)
    .then((t) => { log(t ? `terminal: PowerShell backend present (single-session)` : 'terminal: no shell found on PATH; the tool is removed from every persona (REQ-TOOLS-104)', t ? 'info' : 'warn'); return t; })
    .catch((e) => { log(`terminal: the PTY could not be loaded: ${String(e)}; the tool is removed`, 'warn'); return null; });
  let terminal: TerminalManager | null = null;
  void terminalReady.then((t) => { terminal = t; });

  // REQ-HOOKS-032: a hook inherits exactly the environment this process was started with; the desktop supplies no override.
  const hostEnv: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const configDir = resolveUserDirs().config;
  // REQ-ORCH-010: a rung a model rejected is remembered for the session — this process's lifetime.
  const rungMemory = new RungMemory();
  // ADR-0037 Tier B: the settings store's current values, as main last told this process; empty until it does.
  let liveState: LiveState = {};
  /** PD-PROVIDER-001: the shared-quota cap each provider's catalogue entry declares, by id; set by main's `hello`. */
  let sharedQuotaCaps: Readonly<Record<string, number>> = {};
  // Latest workspace configuration for workspace-scoped controls and continuation loads.
  const configured = new Map<string, ConfiguredRun>();
  // ADR-0030: latest workspace lease for continuation loads. Active launches capture their own lease.
  const leased = new Map<string, Readonly<Record<string, string>>>();
  // The workspace root a session was started or resumed under — the key a continuation's lease refresh reads.
  const sessionRoots = new Map<string, string>();
  // Each active run retains its setup through deferred preflight and tool creation.
  const configuredRuns = new Map<string, ConfiguredRun>();
  const runBearers = new Map<string, Readonly<Record<string, string>>>();
  // `analyst`: the post-run pass's model as the session's overrides left it at capture (OQ-189, PD-MONITOR-007).
  const improvementContexts = new Map<string, { run: ConfiguredRun; analyst?: { readonly model: ModelRef; readonly thinking: ThinkingLevel } }>();
  const missingCollectorNotified = new Set<string>();
  const improvementControllers = new Map<string, AbortController>();
  // ADR-0034 (Part S): the one MCP holder of the application — discovery memo, probes, session connections, the override, the sink.
  const mcp = new McpHost({
    clocks, log: (m, level) => log(m, level ?? 'info'), parentEnv: hostEnv,
    // REQ-STARTUP-158: this bundle sits in out/main beside main's, so this is the one file main's About reads too.
    productVersion: installedProductVersion(import.meta.dirname),
    // Part V: REQ-MCP-044's warning is a transient on the acknowledgement channel (REQ-NOTIFY-040 forbids the timed clear it had) — and the issue record it also writes.
    acknowledge: (a) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'acknowledgement.publish', kindOf: a.kind, title: a.title, ...(a.body === undefined ? {} : { body: a.body }) } }),
    // Part AS (ADR-0064): every step and the end, pushed — what ADR-0064's task runner follows instead of a cadence.
    publishSetup: (status) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'mcp.setupStatus', status } }),
  });
  // REQ-MCP-033 / ADR-0035 (Part T): what the reserved token launches — this application's own executable, built in
  // `code-intelligence-launch.ts`; the sandbox switch main forked this process with rides along (OQ-82's reading, confirmed 2026-10-06 by R-071).
  const { packaged, ...codeIntelligenceLaunch } = codeIntelligenceLaunchFor({ execPath: process.execPath, bundleDir: import.meta.dirname, argv: process.argv });
  log(`mcp: the reserved token launches ${codeIntelligenceLaunch.command} ${codeIntelligenceLaunch.args.join(' ')} (${packaged ? 'packaged' : 'development'})`);
  /**
   * ADR-0022's availability service, owned at application lifetime (REQ-SANDBOX-067): one probe per
   * process, cached, cleared only by REQ-SANDBOX-129's explicit re-check. It lives in the RUN HOST and
   * not in main because this is the process that executes commands — the verdict that gates a session
   * and the mechanism that would confine its commands are then one reading, and no message between
   * processes can land between them (REQ-SANDBOX-094).
   */
  const confinement = new ConfinementService({
    platform: process.platform,
    env: process.env,
    clocks,
    runTrial: spawnTrial(clocks, environmentWithout([], process.env)),
  });
  /**
   * REQ-SANDBOX-071 names the application log as one of the surfaces that presents the verdict's own
   * text, on the same terms as the settings label, the launch dialog and the run-refusal record.
   *
   * ADR-0022's first execution found this logged from the LAUNCH path only, so on a machine where the
   * user opened Settings and never started a run — which on this platform is the machine of anyone who
   * read the disclosure and left confinement alone — the log recorded nothing about why confinement was
   * unavailable. The falsified reason, kept beside its replacement: "the launch is where the verdict
   * first matters". It is where it first *gates* something; it is not where it is first *taken*.
   * Every path that settles the verdict now comes through here, and the line is written once.
   */
  const settleConfinement = async (): Promise<AvailabilityVerdict> => {
    const first = confinement.peek() === null;
    const verdict = await confinement.verdict();
    if (first) log(`confinement: ${verdict.available ? `available (${verdict.backend})` : `unavailable — ${renderUnavailability(verdict).replace(/\n/g, ' ')}`}`);
    return verdict;
  };
  /*
   * Verification only, and compiled out of a packaged build (`__ROTARIS_SEAMS__`): `ROTARIS_CAPTURE_MODEL_REQUESTS`
   * names a file the scripted client appends one JSON line to per call — what the model port RECEIVED, system text
   * included — which is how the injection proof reads the merged context an agent was actually given rather than a
   * log line saying it was built. The scripted client is the only writer, so no real provider's traffic can reach it.
   */
  // `ROTARIS_CAPTURE_THROW_ON_ABORT`: the tools whose executor rejects on its call's abort (`throw-on-abort.ts`, N51).
  const throwOnAbortTools = throwOnAbortNames(__ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_THROW_ON_ABORT'] : undefined);
  const modelCallFile = __ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_MODEL_REQUESTS'] : undefined;
  const recordModelCall = modelCallFile === undefined || modelCallFile === '' ? undefined : (call: ScriptedCallRecord): void => {
    try { appendFileSync(modelCallFile, `${JSON.stringify(call)}\n`); } catch (cause) { log(`capture: the model call could not be recorded (${String(cause)})`, 'warn'); }
  };
  /*
   * Verification only, and compiled out of a packaged build: where the scripted client keeps each agent's place between
   * the client of one run and the next — a continue in this process, or after a relaunch — for the call that ends with
   * no message and so leaves no mark in the record (`StandingLedger`; the repair of
   * `docs/defects/fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md`). It sits in
   * the data directory, which a proof's root isolates; a real provider's client never reads or writes it.
   */
  const standing = __ROTARIS_SEAMS__ ? fileLedger(join(resolveUserDirs().data, 'scripted-standing.json'), (m) => log(m, 'warn')) : undefined;
  const configurationDeps = {
    clocks, globalDir: configDir, env: process.env, scriptedClient: () => scriptedClient(clocks, log, recordModelCall, standing), codeIntelligenceLaunch,
    onRequest: (i: { method: string; url: string; headers: Record<string, string> }) => log(`model request ${i.method} ${i.url}${i.headers['authorization'] ? '' : ' (no authorization header)'}`),
    log: (m: string) => log(m), liveState: () => liveState, bearers: (root: string) => leased.get(root) ?? {},
    confinement: () => confinement.peek(),
    // PD-PROVIDER-001: the caps the provider catalogue declares, as main handed them at the handshake (`hello`).
    sharedQuotaCaps: () => sharedQuotaCaps,
  };
  /**
   * ADR-0063 — the portable-skill catalog. The run host owns it because REQ-WORKSPACE-058 clears it at
   * SESSION creation, a lifetime only the process that creates sessions can honour, and because the units it
   * feeds are composed at agent construction, which is also here.
   *
   * The `skills:` section is read from the SAVED configuration at each ask rather than from a run's captured
   * Tier B snapshot: REQ-WORKSPACE-073 gates a user gesture happening now, not a run that started earlier, and
   * the `fetch` tool's per-call policy read (REQ-SANDBOX-038) is the existing precedent for that. A load that
   * fails leaves the shipped defaults standing — a broken configuration must not silently switch skills off.
   */
  const machineDir = __ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_SKILLS_MACHINE'] ?? process.env['ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE'] : undefined;
  const skills = new SkillHost({
    log: (m, level) => log(m, level ?? 'info'),
    monotonic: clocks.monotonic,
    /*
     * Verification only — `ROTARIS_CAPTURE_SKILLS_HOME` points user-scope discovery at a scratch tree, so a proof
     * exercises `~/.agents/skills` and the OpenHands manifest without reading the operator's own skills.
     *
     * It is a seam rather than an override of `HOME`/`USERPROFILE` because overriding those **kills the Electron
     * process before it paints** on Windows (measured on this proof's first run, 2026-09-14). A user-driven launch
     * never sets it and takes `homedir()`.
     *
     * `ROTARIS_CAPTURE_INSTRUCTIONS_HOME` is the same seam for `PD-WORKSPACE-002`'s home-relative instruction
     * bases, and it is read here as well as in the workspace service: one `home` serves both discoveries, and a
     * proof that isolated the inventory but not the injection would put the operator's own `~/.agents/AGENTS.md`
     * into a driven run's agent context.
     */
    ...(process.env['ROTARIS_CAPTURE_SKILLS_HOME'] ?? process.env['ROTARIS_CAPTURE_INSTRUCTIONS_HOME']
      ? { home: (process.env['ROTARIS_CAPTURE_SKILLS_HOME'] ?? process.env['ROTARIS_CAPTURE_INSTRUCTIONS_HOME'])! }
      : {}),
    /*
     * `ROTARIS_CAPTURE_SKILLS_MACHINE` and `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE` are the same seam for the machine-wide
     * directory (`/etc/codex`): the skill search's fourth user-scope root is its `skills` child and the instruction
     * base is the directory itself, so one value moves both, as one `home` serves both discoveries above. The
     * instructions variable is read in the workspace service as well, for the reason above: a proof that lays a file
     * down at every base must not write into the machine's own `/etc`, and one that isolated only the inventory would
     * still inject whatever is there — an instruction file or a skill. Unlike the two above they are compiled out of a
     * packaged build.
     */
    ...(machineDir === undefined || machineDir === '' ? {} : { machineDir }),
    section: (workspaceRoot) => {
      const loaded = loadConfiguration({ globalDir: configDir, workspaceRoot });
      if (loaded.ok) return loaded.value.skills;
      log(`skills: the configuration could not be read for ${workspaceRoot}; the shipped defaults stand`, 'warn');
      return SKILLS_DEFAULTS;
    },
    /*
     * PD-WORKSPACE-002 / REQ-WORKSPACE-048 — the master switch and the per-file instruction policy, read
     * from the SAVED configuration on the same argument the `skills:` section is: a switch saved now gates
     * the next session, and a run already under way keeps what it was given. A configuration that cannot be
     * read leaves the shipped defaults standing — injection on, no file switched off — because a broken
     * file must not silently take an agent's standing instructions away.
     */
    instructions: (workspaceRoot) => {
      const loaded = loadConfiguration({ globalDir: configDir, workspaceRoot });
      if (loaded.ok) return { section: loaded.value.instructions, master: loaded.value.injectAgentsMd, globalDir: configDir };
      log(`workspace context: the configuration could not be read for ${workspaceRoot}; the shipped defaults stand`, 'warn');
      return { section: INSTRUCTIONS_DEFAULTS, master: true, globalDir: configDir };
    },
  });

  const configure = (workspaceRoot: string, attended: boolean, entryPersona?: string) => {
    const r = configureRun(workspaceRoot, attended, configurationDeps, entryPersona === undefined ? undefined : { entryPersona });
    if (r.ok) { configured.set(workspaceRoot, r.value); mcp.newConfiguration(r.value.cfg); }
    return r;
  };
  /**
   * ADR-0030 / REQ-PROVIDER-066 for the continuation paths: a paused or resumed session's run reads
   * the bearers of the LAST launch's lease (`leased`), which an application restart empties — the
   * 401 recorded in a defect note (removed once repaired). Every continuation
   * launch therefore re-asks main first (`leaseForContinuation`), publishes the fresh map under the
   * workspace root, and only then lets the engine resolve the setup. The user notices nothing; the
   * one refusal is an entry provider main cannot resolve, the same sentence a launch gives. A
   * session this process never started or resumed has no root to lease under — nothing is known
   * about it here, and the engine's own refusals (`not-live`, `no-session`) answer it instead.
   */
  const leaseReports = new LeaseReportLog();
  /**
   * The lease by workspace root. PD-LIBRARY-002's retrospective has no session and no run, so it cannot be
   * leased through one; it is the same path `leaseForContinuation` already walks, keyed by the only thing a
   * user-started pass knows about itself (ADR-0030, ADR-0065 decision 5).
   */
  const leaseDepsFor = (workspaceRoot: string) => ({
    workspaceRoot, attended: presenters.attended, configuration: configurationDeps,
    leaseCredentials: async (providers: readonly string[]) => {
      const answer = await ask({ kind: 'credentials.lease', providerIds: [...providers] }, millis(5_000)).catch((e: Error) => { log(`credentials: main did not answer the lease (${e.message})`, 'warn'); return null; });
      const bearers = answer?.kind === 'credentials.leased' ? answer.bearers : {};
      // The re-lease itself stays: it is what fixed the continuation's 401. Only the report is quieted.
      leaseReports.report(workspaceRoot, answer?.kind === 'credentials.leased' ? answer.report : null, (m) => log(m));
      return bearers;
    },
  });
  const leaseForWorkspace = async (workspaceRoot: string): Promise<ProcessReply | null> => {
    const r = await leaseForContinuation(workspaceRoot, leaseDepsFor(workspaceRoot));
    if (r.kind === 'refused') return r.reply;
    leased.set(workspaceRoot, r.bearers);
    return null;
  };
  /**
   * PD-LIBRARY-002 with ADR-0030: the retrospective's setup, leased and completed as a run's is (`leasedSetup`), at its capture
   * and again at its analysis — never the workspace's cached `configuredFor`, which may have been completed over no lease
   * (the live run at `ce5f952`, F2). It is not cached: a run start's `configure` owns `configured` and the MCP reload.
   */
  const retrospectiveSetup = async (workspaceRoot: string): Promise<LeasedSetup> => {
    const r = await leasedSetup(workspaceRoot, leaseDepsFor(workspaceRoot));
    if (r.kind === 'configured') leased.set(workspaceRoot, r.bearers);
    return r;
  };
  const continuationLeaseForSession = async (sessionId: string): Promise<ProcessReply | null> => {
    const workspaceRoot = sessionRoots.get(sessionId);
    if (workspaceRoot === undefined) return null;
    return leaseForWorkspace(workspaceRoot);
  };
  /** Only a tool port built outside a run start reaches this; the run path always configures first. */
  const configureRunFallback = () => {
    throw new Error('a tool port was requested for a workspace no run has configured');
  };
  const configuredFor = (workspaceRoot: string): ConfiguredRun | null => {
    const known = configured.get(workspaceRoot);
    if (known) return known;
    const r = configure(workspaceRoot, presenters.attended);
    if (!r.ok) log(r.error.reason, 'warn');
    return r.ok ? r.value : null;
  };
  const sessions = new Sessions({
    clocks,
    pid: process.pid,
    host,
    // REQ-CONFIG-473: the loaded `event_retention_per_session` per run; this is the shipped default behind it.
    retentionCap: RUNTIME_DEFAULTS.event_retention_per_session,
    warn: (m) => log(m, 'warn'),
    // REQ-HOOKS-138 / PD-MONITOR-002: the hook port's `log` — a `log` event at `info`, which main's default threshold keeps.
    log: (m) => log(m),
    mintSessionId: () => randomUUID(),
    model: null,
    /*
     * REQ-CHAT-006 / REQ-SESSION-026: a resting session's record reads its workspace's catalogue here, never through
     * `configure` below — that is a run start's, and called for a read it wrote `configuredRuns`/`runBearers` for a session
     * with no run, replaced the workspace's `configured` entry and reloaded the MCP configuration (`mcp.newConfiguration`:
     * a dropped discovery memo, its load-scope diagnostics raised again). Found by fin8's verifier.
     */
    restingCatalogue: (workspaceRoot) => restingCatalogueOf(workspaceRoot, configurationDeps),
    // ADR-0036/0037: the files, the live state, the loader's passes — once per run start.
    configure: (workspaceRoot, ctx) => {
      const r = configure(workspaceRoot, ctx.attended, ctx.entryPersona);
      if (r.ok) { configuredRuns.set(ctx.sessionId, r.value); runBearers.set(ctx.sessionId, leased.get(workspaceRoot) ?? {}); }
      // REQ-WORKSPACE-060: the units as a GETTER, read at every agent construction, so a skill invoked between
      // prompts reaches the next agent built and never retracts one already running (REQ-CONFIG-166).
      // REQ-WORKSPACE-050: the catalog from the BASE workspace, which is what `configure` is called with; the
      // context files from the run's EXECUTION root, which the session carries and which differs only for an
      // isolated session. The two halves of one sentence, and the second was the recorded defect.
      // REQ-NOTIFY-061: a refused confinement mode keeps its class through the engine, so a continuation's refusal is
      // reported as a start's is.
      return r.ok ? { ok: true as const, value: { ...r.value, contextUnits: () => skills.contextUnits(workspaceRoot, ctx.sessionId, ctx.executionRoot) } } : { ok: false as const, error: { reason: r.error.reason, ...(r.error.code === 'confinement' ? { code: 'confinement' as const } : {}) } };
    },
    /**
     * REQ-MONITOR-049 / REQ-CONFIG-085 (Part AH): a model's own maximum input tokens, from the configuration
     * the last run of any open workspace resolved. Part R declared this lookup and left it unfilled, so every
     * agent's meter read REQ-MONITOR-080's default whatever the model; REQ-MONITOR-078's capacity ladder needs
     * the same figure, so it is filled here rather than a second time inside the compressor.
     */
    contextLimitFor: (modelKey) => { for (const c of configured.values()) { const n = c.contextLimits?.[modelKey]; if (n !== undefined) return n; } return null; },
    isProcessAlive: (pid) => probePid(pid) === 'alive',
    sessionFilesDir: (dal, sid) => join(dirname(dal.db.name), 'sessions', sid),
    publisher: {
      increment: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.increment', payload } }),
      snapshot: (payload) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'publish.snapshot', payload } }),
    },
    onRunResult: (sessionId, result, helperModel) => {
      const run = configuredRuns.get(sessionId);
      configuredRuns.delete(sessionId);
      runBearers.delete(sessionId);
      send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.result', sessionId, result } });
      if (!run || !run.cfg.runtime.improvement_collector_enabled) return;
      const collector = improvementCollectorOf(run.cfg, run.scripted);
      if (collector === null) {
        if (!missingCollectorNotified.has(run.cfg.workspaceRoot)) {
          missingCollectorNotified.add(run.cfg.workspaceRoot);
          send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: 'info', title: 'Improvement analysis needs a model', message: 'Improvement analysis is switched on. Choose an improvement collector or medium model to produce proposals.', detail: '', action: 'config.models', key: `improvement-model:${run.cfg.workspaceRoot}`, sessionId, persistent: true } });
        }
        return;
      }
      // OQ-189's ruling (R-071, PD-MONITOR-007): the analyst's model with the session's overrides followed; where that pair
      // is held out of quota the analysis is skipped — no job captured, no call made — and the log says why. Until
      // 2026-10-06 the configured model was called, and a provider that had refused it reported the analysis failed.
      const analyst = postRunAnalystOf(collector, helperModel);
      if (!analyst.ok) { log(`improvement analysis: skipped for session ${sessionId}: the analyst's model ${analyst.reason} (PD-MONITOR-007)`, 'warn'); return; }
      const locatedStore = [...stores.entries()].find(([, candidate]) => candidate.root === run.cfg.workspaceRoot && candidate.dal !== null);
      if (!locatedStore?.[1].dal) return;
      const [workspaceId, store] = locatedStore;
      // REQ-ORCH-137 / REQ-LIBRARY-032: detached, and it never rejects — the store is read again after the history's
      // await, which a quit may have closed it under (`improvement-capture.ts`).
      void captureAfterRun({
        stopReason: result.stop_reason,
        input: { workspaceId, workspaceRoot: run.cfg.workspaceRoot, sessionId, generatedAt: toIsoUtc(clocks.wall.instant()), timeoutSeconds: run.cfg.runtime.improvement_collector_timeout, collectorModel: analyst.key },
        history: () => ask({ kind: 'improvements.command', workspaceRoot: run.cfg.workspaceRoot, command: { action: 'list' } }, millis(10_000)),
        currentDal: () => dalWhileOpen(stores.get(workspaceId), store),
        log,
      }).then((job) => {
        if (job === null) return;
        improvementContexts.set(job.artifact_id, { run, analyst: { model: analyst.model, thinking: analyst.thinking } });
        send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'improvement.job', job } });
      });
    },
    // REQ-ORCH-085: the host told the run paused at the message limit.
    onRunPaused: (sessionId, info) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'run.paused', sessionId, count: info.count, limit: info.limit, tokens: info.tokens } }),
    // REQ-ORCH-153 (ADR-0062): the registry predicate the plan gate's child-admission check reads; the engine holds
    // no copy of the tool declarations (ADR-0002's boundaries).
    planWithholds: withheldUnderPlanGate,
    // PD-TOOLS-006 revision 6 (OQ-220) with REQ-ORCH-028: which delegations are implementation delegations, read from the
    // grant `delegate`'s description states, for the todo-item refusals at admission.
    implementationRole,
    tools: (ctx) => createToolPort(ctx, {
      clocks, presenter, nextSequence: () => ++approvalSequence, fileStates, terminal, mcp, configured: () => configuredRuns.get(ctx.sessionId) ?? null,
      // PD-ORCH-005 clause 9: the quit closed the last window and its shutdown is still to come (`PresenterRegistry.quitting`).
      quitting: () => presenters.quitting,
      // Verification only, compiled out of a packaged build: PD-TOOLS-013 revision 2 (a) through the run host (`throw-on-abort.ts`).
      throwOnAbort: throwOnAbortTools,
      runtime: () => configuredRuns.get(ctx.sessionId)?.runtime ?? configureRunFallback(),
      personas: () => configuredRuns.get(ctx.sessionId)?.personas ?? null,
      // REQ-WORKSPACE-059 (ADR-0063): the cataloged skill directories as additional READ roots, so an agent can
      // read a SKILL.md and its siblings even outside the workspace; writes stay refused by the fence itself.
      // REQ-WORKSPACE-050: from the BASE workspace, never a worktree's effective root.
      skillReadRoots: () => skills.readRoots(ctx.workspaceRoot, ctx.sessionId),
      // ADR-0023 / REQ-SANDBOX-038: the saved files at each fetch call, never the live state; the read's cost logged.
      egress: (workspaceRoot) => {
        const read = egressReader(configDir, workspaceRoot, clocks);
        return async () => {
          const r = await read();
          log(`fetch: egress policy read from the saved configuration in ${r.loadMs.toFixed(1)} ms${r.ok ? ` (default ${r.policy.defaultDisposition}, ${r.policy.allowed.length} allowed, ${r.policy.denied.length} denied, tool_call_timeout ${r.toolCallTimeoutS} s)` : ` — the load failed: ${r.reason}`}`, r.ok ? 'info' : 'warn');
          return r;
        };
      },
    }),
    backgroundSessions: () => terminal?.runningBackground ?? 0,
    // PD-ORCH-005 clause 10: the background sessions a session's agents started, as this process holds them, and ending
    // them (REQ-TOOLS-109's end). Read through `terminal` at each call, since the manager arrives after the host starts.
    terminals: (sessionId) => ({
      list: () => (terminal?.backgroundOwnedBy(sessionId) ?? []).map((b) => ({ id: b.id, taskId: b.owner?.taskId ?? '', command: b.command, startedAt: b.startedAt, status: b.status, exitCode: b.exitCode, tail: b.tail() })),
      end: async (ids) => {
        const wanted = new Set(ids);
        await Promise.all((terminal?.backgroundOwnedBy(sessionId) ?? []).filter((b) => wanted.has(b.id)).map((b) => b.end('killed')));
      },
    }),
    attended: () => presenters.attended,
    sessionLogAppender: (dal, sid) => fileAppender(join(dirname(dal.db.name), 'sessions', sid, 'session.log')),
    // ADR-0015: the hook set per run from the two file scopes; the hook process inherits this process's environment (REQ-HOOKS-032).
    hooks: (ctx) => createHookPort(ctx, { clocks, globalDir: configDir, env: hostEnv }),
    // ADR-0039: the capture at iteration close — Git through main to the workspace service, the row through the writer.
    checkpoints: (ctx) => createCheckpointPort(ctx, { clocks, ask, section: configuredRuns.get(ctx.sessionId)?.cfg.checkpoints ?? CHECKPOINTS_DEFAULTS, log: (m) => log(m) }),
    // Part V: the engine's headline is the title and its prose the message body (REQ-NOTIFY-005: the detail block is for diagnostic output, which none of the three run notices carries); every run notice is dismissible.
    notice: (n) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: n.severity, title: n.headline, message: n.detail, detail: '', ...(n.action === undefined ? {} : { action: n.action }), ...(n.key === undefined ? {} : { key: n.key }), sessionId: n.sessionId ?? '', persistent: true } }),
    // Part AO — the two control arms' channels: the completion toast (REQ-CHAT-080/084) on the window's stack, and the two
    // failure notices with a COPYABLE detail block (REQ-MONITOR-094, REQ-NOTIFY-037/038) through main's one persistent slot.
    acknowledge: (kind, title, body) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'acknowledgement.publish', kindOf: kind, title, ...(body === undefined ? {} : { body }) } }),
    report: (n) => send({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'notice.publish', severity: n.severity, title: n.title, message: n.message, detail: n.detail, sessionId: n.sessionId, persistent: true } }),
    supervisor: (_workspaceRoot, sessionId, countUsage, helperModel) => {
      const run = configuredRuns.get(sessionId);
      if (!run) return null;
      const cb = run.cfg.circuitBreaker;
      if (!cb.enabled || process.env['ROTARIS_CIRCUIT_BREAKER'] === 'off') return null;
      // REQ-CONFIG-467: the configured value is an upper bound only, never more than REQ-NOTIFY-106's activation budget — the
      // model request's own timeout is given that ceiling, and the supervisor's timer cuts the call at what remains of the
      // budget when it is dispatched.
      const timeoutMs = Math.min(Math.round(run.runtime.loopClassificationTimeoutS * 1_000), LOOP_ACTIVATION_BUDGET_MS);
      const classifier = createLoopClassifier({
        // REQ-EVENTS-053: each classification is a request of the run, counted against it.
        backend: meteredBackend(run.model.backend, countUsage), runModel: run.model.config.model, thinking: run.model.config.thinking, credentialFor: run.model.config.credentialFor,
        memory: rungMemory, configuredModel: modelRefOf(run.cfg, cb.model, run.scripted), slots: classifierSlotsOf(run.cfg, run.scripted, runBearers.get(sessionId), (m) => log(m, 'warn')), modelTimeoutMs: timeoutMs,
        // OQ-189 (PD-MONITOR-007): the session's overrides followed at each classification; none made on a pair out of quota.
        helperModel,
      });
      return classifier ? {
        config: {
          ...SUPERVISOR_DEFAULTS, activationMode: cb.activation_mode, classificationTimeoutMs: timeoutMs,
          toolThreshold: cb.tool_call_threshold, messageThreshold: cb.message_count_threshold, toolWeight: cb.tool_weight, messageWeight: cb.message_weight, targetScore: cb.target_score,
          eventWindow: cb.max_recent_events, excerptCap: cb.max_transcript_chars, repetitionThreshold: cb.repetition_threshold, cycleThreshold: cb.cycle_threshold,
        },
        classifier,
      } : null;
    },
    // REQ-ORCH-005: the pre-flight before the coordinator exists; the slots, the strategy and the tier from the run's configuration.
    preflight: (ctx) => {
      const run = configuredRuns.get(ctx.sessionId);
      if (!run) throw new Error('the run has no configuration');
      return runPreflight(ctx, {
        clocks, backend: run.model.backend, runModel: run.model.config.model, credentialFor: run.model.config.credentialFor, modelTimeoutMs: run.model.config.modelTimeoutMs,
        globalDir: configDir, tier: run.tier, slots: classifierSlotsOf(run.cfg, run.scripted, runBearers.get(ctx.sessionId), (m) => ctx.warn(m)), runOverride: run.runtime.runOverride, memory: rungMemory, log: (m) => log(m),
        // The persona the root turn runs on (the engine's `config.persona`): its cell is the root's, audited and clamping.
        entryRole: run.model.config.persona,
      });
    },
  });
  presenters.start();
  // Part U: the browser's actions over this registry, the clock ports and the ask channel.
  const sessionActions = { sessions, clocks, ask, log: (m: string, level?: 'info' | 'warn') => log(m, level ?? 'info') };

  // Part AL — the live terminal (ADR-0021 first executed): the stream publisher over the terminal manager, the run's
  // `runtime.terminal_stream_*` settings (REQ-TOOLS-126), and the seven `terminal.*` requests (`run-host/terminal.ts`).
  // The tool hands the registry its EFFECTIVE root, which an isolated run keys nowhere; the base workspace's run is the
  // fallback, then the defaults.
  const terminalHost = createTerminalHost({
    ready: terminalReady, send, sessions, clocks, log: (m, level) => log(m, level ?? 'info'),
    settings: (workspaceRoot) => {
      const run = configured.get(workspaceRoot) ?? [...configured.values()].at(-1) ?? null;
      const r = run?.cfg.runtime;
      return r ? { enabled: r.terminal_stream_enabled, intervalMs: r.terminal_stream_interval_ms, bufferKb: r.terminal_stream_buffer_kb } : STREAM_SETTINGS_DEFAULTS;
    },
  });


  return {
    port,
    clocks,
    lease,
    stores,
    host,
    ask,
    reply,
    log,
    asState,
    presenters,
    presenter,
    hostEnv,
    configDir,
    configured,
    leased,
    sessionRoots,
    configuredRuns,
    runBearers,
    improvementContexts,
    improvementControllers,
    mcp,
    confinement,
    settleConfinement,
    configurationDeps,
    skills,
    configure,
    leaseReports,
    continuationLeaseForSession,
    leaseForWorkspace,
    retrospectiveSetup,
    configuredFor,
    sessions,
    sessionActions,
    terminalHost,
    send,
    pendingAsks,
    // The terminal manager arrives asynchronously and `liveState` is written by a command: both are read through
    // the host every time rather than copied out of it once, which a destructuring would silently do.
    get terminal() { return terminal; },
    get liveState() { return liveState; },
    set liveState(next: LiveState) { liveState = next; },
    get sharedQuotaCaps() { return sharedQuotaCaps; },
    set sharedQuotaCaps(next: Readonly<Record<string, number>>) { sharedQuotaCaps = next; },
  };
}

/** What one run-host process holds — inferred from the composition itself, so the two can never drift. */
export type RunHost = ReturnType<typeof createRunHost>;
