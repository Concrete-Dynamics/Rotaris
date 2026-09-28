// ADR-0035 (Part T): the pre-bootstrap branch is the FIRST import and must never be reordered — with the reserved token
// first on the command line it hands the process to the bundled runtime and exits before anything below is evaluated.
import './sentinel.js';
import type { PersonaWindows, TerminalWindows } from './windows.js'; // Part AL2: the terminal window's registry beside the persona windows'
import { createElectronMainWindowAdapter, createElectronProjectFolderChooser, MainWindows, removeApplicationMenu } from './main-windows.js';
import { createNoticeStore } from './notices.js';
import { createLibraryRevision } from './library.js';
// The driver seam (verification only; `ROTARIS_DRIVER` names its endpoint file). Never reached by a product surface.
import { startDriver } from './driver.js';
// Part AK2 — the fold key's placeholder and its resolution (see `requirementsPreferenceKey`, which reads the window's workspace).
import { REQUIREMENT_FOLDS_PREFERENCE_KEY } from '@rotaris/contracts';
import { requirementColumnFoldsKey, type PreferenceKey } from '@rotaris/platform';
// Part AP — the board's run coordinator (spec 08 §Runs Started from the Board; ADR-0041).
import { createRequirementsRuns } from './requirements-runs.js';
import { createImprovementCoordinator } from './improvements.js';
import { homedir } from 'node:os';
import { FrameDeliveryLimiter } from './terminal.js';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { mkdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { millis, toIsoUtc } from '@rotaris/kernel';
import { type AcknowledgementAction, CHANNEL, CommandRequestSchema, type CommandRequest, CONTRACT_SCHEMA_VERSION, oklchToSrgb, parseOklch, resolveTheme, srgbToHex, type Theme, type HooksSummary, type ApprovalPayload, type PausePayload, type CommandOutcome, type NoticeSeverity, type ProposalStatus, type ProviderDialogPayload, type ProviderHealthPayload, type ProviderRow, type ProcessKind, type ProcessReply, type RunHostRequest, type WorkspaceServiceRequest, TERMINAL_WINDOW_ROLE, TERMINAL_AUTO_OPEN_PREFERENCE, type TerminalWindowCommand, type TerminalWindowOpened, type TerminalWindowPayload } from '@rotaris/contracts';
import { claimInstance, inheritInstance, dataLayout, inheritedChromiumSwitches, nodeClocks, readOrMintMachineId, resolveUserDirs, canonicalPath, samePath, PreferenceStore, resolvePreferenceRoot, type HandOver, type InstanceRecord } from '@rotaris/platform';
// The updater (first-release-plan.md §4.6, ADR-0054): the pure module, and the one file of it that touches Electron.
import { createUpdater } from './updater/updater.js';
import { createSuccessorWait } from './updater/successor.js';
import { classifyThisInstallation, createUpdaterPorts, successorArguments, successorEndpointFromArgv } from './updater/electron.js';
import { updateCommands } from './commands/update.js';
import { productVersion } from './version.js';
import { ProcessLink, UpdateRelay, type MessagePortLike } from '@rotaris/shell';
import { CATALOGUE, createProtector, CredentialStore, destinationHint, METHOD_LABELS, ProjectSettingsStore, ProviderService, validateCatalog } from '@rotaris/providers';
import { PROJECT_SETTINGS_FILE, scopeFiles } from '@rotaris/config';
import { InitializationCoordinator } from './initialization.js'; // Part AS (ADR-0064)
import { runCapture } from './capture/index.js'; // the scripted launch that ends in a photograph (verification only)
import { checkpointsCommands } from './commands/checkpoints.js';
import { configCommands } from './commands/config.js';
import { dialogsCommands } from './commands/dialogs.js';
import { gitCommands } from './commands/git.js';
import { hooksCommands } from './commands/hooks.js';
import { improvementsCommands } from './commands/improvements.js';
import { initializationCommands } from './commands/initialization.js';
import { libraryCommands } from './commands/library.js';
import { mcpCommands } from './commands/mcp.js';
import { providersCommands } from './commands/providers.js';
import { requirementsCommands } from './commands/requirements.js';
import { sessionCommands } from './commands/session.js';
import { shellCommands } from './commands/shell.js';
import { skillsCommands } from './commands/skills.js';
import { windowCommands, windowsCommands } from './commands/windows.js';
import { exitAfterChildWindows, shutdownAtQuit, watchChildExit, type ChildExit } from './exit.js';
import { APP_LOG_LEVEL_VARIABLE, appLogThreshold, createAppLog, type AppLogLevel } from './app-log.js'; // PD-MONITOR-002
import { workspaceCommands } from './commands/workspace.js';
// The answer every command ends in, and the inventory the facets above are given (ADR-0019, REQ-SHELL-020).
import { refusal, type ApprovalDialogState, type CommandContext, type CommandHandler, type CommandHandlers, type MainWindowState, type Recovery } from './commands/context.js';

/**
 * MAIN — the composition root for the Electron main process (ADR-0002 #1).
 *
 * Phase 0 (ADR-0055): the instance claim runs BEFORE anything else — before
 * `app.whenReady()`, before any window, before any write — so a handed-over
 * launch writes nothing and shows nothing (REQ-STARTUP-162). Then: fork the
 * run host and the workspace service, open one window, relay.
 *
 * Main never opens the workspace store and never writes a session (W-01).
 * The walking skeleton does exactly what is listed here and no product
 * behaviour beyond it.
 */
const clocks = nodeClocks();
/** Every immediate exit goes through this: on Linux, `app.exit` over an open modal child segfaults (`exit.ts`). */
const exitCleanly = (code: number): void => exitAfterChildWindows({ windows: () => BrowserWindow.getAllWindows(), exit: (c) => app.exit(c), timers: clocks.timers, nextTurn: (fn) => setImmediate(fn) }, code);
const dirs = resolveUserDirs();
const layout = dataLayout(dirs);
mkdirSync(dirs.data, { recursive: true });
const machineId = readOrMintMachineId(layout.machineId);

// ADR-0028: the catalogue's integrity is checked at process start as well as in the build's test (REQ-PROVIDER-003).
const catalogue = validateCatalog();
if (!catalogue.ok) throw new Error(`the provider catalogue is invalid: ${catalogue.error.join('; ')}`);

/**
 * The application log — main's standard output — and PD-MONITOR-002's threshold over it. `app-log.ts` holds the
 * level, the predicate and the line; this is the wiring. `ROTARIS_APP_LOG_LEVEL` is read here, once, before
 * anything is written, and never again: nothing a running application does moves the threshold, and no
 * configuration key or setting reaches it (`session_log_level` governs the per-session log alone).
 *
 * `logAt` is the one writer. The two forwarders pass a child's line through it with the level the child gave it,
 * so a run host `debug` line is filtered like one of main's; `log` is main's own line, `info` unless the caller
 * names a level — which a collaborator whose port distinguishes a warning (`improvements.ts`, `initialization.ts`,
 * the credential store, the settings store, the provider service) now does, rather than having its `warn` dropped.
 */
const appLogLevel = appLogThreshold(process.env[APP_LOG_LEVEL_VARIABLE]);
const logAt = createAppLog({ threshold: appLogLevel.threshold, now: () => toIsoUtc(clocks.wall.instant()), write: (line) => console.log(line) });
const log = (m: string, level: AppLogLevel = 'info'): void => { logAt(level, null, m); };
// ADR-0019's prohibition, from the other side: an uncaught exception in main would raise the platform's native
// error box — a synchronous modal that blocks the loop and every poll reply. Log it instead; nothing here may hang.
process.on('uncaughtException', (e) => { log(`UNCAUGHT in main: ${e.stack ?? String(e)}`, 'error'); });
process.on('unhandledRejection', (reason) => { log(`UNHANDLED rejection in main: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`, 'error'); });

/*
 * Why the process is going away, written down while it still can be.
 *
 * Run `7bd9c19d` (2026-09-20) ended orderly in the store — `session.end`, a result, a final transcript row —
 * and afterwards there was no electron process, no dump directory, and nothing anywhere saying whether the
 * application had crashed or simply been closed. The owner reported "it crashed somehow" and the record could
 * neither confirm nor refute it, because a crash and a quiet quit left the same trace: none.
 *
 * These lines cost nothing and make the two distinguishable. An orderly close writes `quit:` and its status.
 * A renderer or a utility child that dies writes its reason and its exit code — `render-process-gone` carries
 * `crashed`, `oom`, `killed` and the rest, which is the vocabulary a reader actually wants. And
 * `process.on('exit')` is the last line the main process can write, so a log that ends with NONE of them is
 * itself the finding: the process went away without passing through its own shutdown.
 */
app.on('before-quit', () => { log('quit: requested (before-quit)'); });
app.on('quit', (_e, code) => { log(`quit: exiting with status ${code}`); });
// PD-MONITOR-002: a process lost for any reason but `clean-exit` is an `error`, so a log kept at `warning` or `error`
// still says a crash happened; `clean-exit` is the one reason in Electron's vocabulary that is not a loss.
app.on('render-process-gone', (_e, contents, details) => {
  log(`RENDERER GONE (${details.reason}, exit ${details.exitCode}) for ${contents.getURL() || 'a destroyed frame'}`, details.reason === 'clean-exit' ? 'info' : 'error');
});
app.on('child-process-gone', (_e, details) => {
  log(`CHILD PROCESS GONE (${details.type}${details.name === undefined ? '' : ` ${details.name}`}: ${details.reason}, exit ${details.exitCode})`, details.reason === 'clean-exit' ? 'info' : 'error');
});
process.on('exit', (code) => { log(`main process exiting with status ${code}`); });

function workspaceFromArgv(argv: readonly string[]): string | undefined {
  // REQ-STARTUP-163: a directory the OS hands a launch. The product defines no argument vocabulary
  // of its own (P-13); a bare path is what a file manager passes.
  const candidate = argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-'));
  return candidate ? canonicalPath(candidate) : undefined;
}

function portOf(child: UtilityProcess): MessagePortLike {
  return {
    postMessage: (m) => child.postMessage(m),
    onMessage: (fn) => { child.on('message', fn); return () => { child.off('message', fn); }; },
  };
}

async function main(): Promise<void> {
  const pendingHandOvers: HandOver[] = [];
  let surface: ((h: HandOver) => void) | undefined;
  /** REQ-STARTUP-121: armed by the updater's restart while it waits for the record to pass to the successor it started. */
  const successorWait = createSuccessorWait();

  /**
   * REQ-STARTUP-121 / ADR-0055 ("The update restart is a hand-over of the record"): a launch the running instance
   * started as its update successor carries the reserved token and the predecessor's endpoint. It is not an ordinary
   * launch — it performs no claim and no hand-over attempt — and it carries no workspace of its own.
   */
  const successorOf = successorEndpointFromArgv(process.argv, app.isPackaged ? 1 : 2);
  const argvWorkspace = successorOf === null ? workspaceFromArgv(process.argv) : undefined;
  const claimDeps = {
    recordFile: layout.instanceRecord, endpointDir: dirs.data, machineId, pid: process.pid,
    wall: clocks.wall, timers: clocks.timers, handOverIntervalMs: millis(5_000),
    onHandOver: (h: HandOver) => { if (surface) surface(h); else pendingHandOvers.push(h); },
    onRecordPassed: () => { successorWait.passed(); },
    // REQ-STARTUP-121: an accepted successor the record could not be passed to fails the waiting restart, which then
    // surfaces `Update not installed` and clears the updater's in-flight guard, instead of waiting for ever.
    onRecordPassFailed: (_successor: InstanceRecord, reason: string) => {
      log(`update restart: the record could not be passed to the successor — ${reason} (REQ-STARTUP-121)`, 'warn');
      successorWait.failed(reason);
    },
    // REQ-STARTUP-161/121: the record passes only while a restart this instance started is waiting for its successor;
    // any other announcement is refused and leaves the record as it is. Not matched on the pid the restart spawned:
    // the portable's launcher (ADR-0054) stands between that process and the one that announces itself.
    acceptSuccessor: () => successorWait.accepting(),
  };
  const claim = successorOf === null
    ? await claimInstance(claimDeps, argvWorkspace ? { workspace: argvWorkspace } : {})
    : await inheritInstance(claimDeps, successorOf);

  if (claim.outcome === 'handed-over') {
    // REQ-STARTUP-162: show nothing, write nothing, end.
    app.exit(0);
    return;
  }
  if (claim.outcome === 'refused') {
    // An ordinary launch refused is REQ-STARTUP-164's bounded end. A successor refused ends quietly and starts no rival:
    // the running instance keeps its record and its window, which is REQ-STARTUP-121's failure branch.
    log(`launch refused: ${claim.reason}`, 'error');
    app.exit(successorOf === null ? 2 : 0);
    return;
  }
  log(successorOf === null
    ? `instance claimed (pid ${process.pid}, host ${machineId})`
    : `instance record inherited from the predecessor at ${successorOf} (pid ${process.pid}, host ${machineId}; REQ-STARTUP-121)`);
  // A value the variable does not accept is said once, here: after the claim, so a handed-over launch still writes nothing.
  if (appLogLevel.warning !== null) log(appLogLevel.warning, 'warn');
  app.on('will-quit', () => { void claim.close(); });

  const preferenceRoot = resolvePreferenceRoot();
  const preferences = new PreferenceStore(preferenceRoot);
  const capturing = Boolean(process.env['ROTARIS_CAPTURE_PNG']);
  const capturedTheme = capturing ? process.env['ROTARIS_CAPTURE_THEME'] : undefined;
  if (capturedTheme) preferences.writeThemeSync(capturedTheme);
  let currentTheme: Theme = resolveTheme(capturedTheme ?? preferences.read('appearance/theme'));
  const themeBackground = () => srgbToHex(oklchToSrgb(parseOklch(currentTheme.tokens.color['--rt-bg']!)));
  nativeTheme.themeSource = currentTheme.dark ? 'dark' : 'light';
  log(`preference root ${preferenceRoot}; theme ${currentTheme.name} (${currentTheme.dark ? 'dark' : 'light'})`);
  const captureScale = capturing ? process.env['ROTARIS_CAPTURE_SCALE'] : undefined;
  if (captureScale) app.commandLine.appendSwitch('force-device-scale-factor', captureScale);

  await app.whenReady();
  removeApplicationMenu(Menu);

  // ADR-0029/0030: the credential store and the provider service live HERE, in main; the run host is leased bearers.
  const lockDeps = { pid: process.pid, startedAt: toIsoUtc(clocks.wall.instant()), timers: clocks.timers, monotonic: clocks.monotonic };
  const random = () => Math.random().toString(36).slice(2, 10);
  const credentials = new CredentialStore({ dir: layout.tokens, protector: createProtector({ scratchDir: dirs.data }), lock: lockDeps, random, warn: (m) => log(`credentials: ${m}`, 'warn'), info: (m) => log(`credentials: ${m}`) });
  const projectSettings = new ProjectSettingsStore({ path: join(dirs.config, PROJECT_SETTINGS_FILE), lock: lockDeps, timers: clocks.timers, warn: (m) => log(`project settings: ${m}`, 'warn') });
  const providers = new ProviderService({ credentials, settings: projectSettings, wall: clocks.wall, log: (m) => log(`providers: ${m}`), warn: (m) => log(`providers: ${m}`, 'warn') });

  // ADR-0002: one run host for the application's lifetime; one workspace service per open workspace.
  // REQ-MCP-033 / OQ-82: the run host builds the reserved token's launch of this executable, and that launch carries the
  // sandbox switch THIS process was started with (`--no-sandbox`, as root on Linux). A utility process's argv is what it
  // is forked with, not the parent's, so the switch is handed over here; the run host reads it back from its own argv.
  const runHostChild = utilityProcess.fork(join(__dirname, 'run-host.js'), [...inheritedChromiumSwitches(process.argv)], { serviceName: 'rotaris-run-host' });
  // Watched from the fork so the quit can race its `shutdown` against it and never miss the event (`exit.ts`).
  const runHostExit = watchChildExit(runHostChild);
  const runHost = new ProcessLink<RunHostRequest>(portOf(runHostChild), clocks.timers);
  let lastLeaseLine = '';
  // ADR-0030: the run host's one ask — the bearers for the providers a run names. Never logged.
  // ADR-0039 / ADR-0002 c.4: the run host's three checkpoint asks are relayed to the workspace service of that root and answered back.
  runHost.onAsk(async (a) => {
    // Part U: `checkpoint.deleteNamespace` is the delete's ref cleanup (REQ-SESSION-166 step 2), relayed like the other three.
    if (a.kind === 'checkpoint.capture' || a.kind === 'checkpoint.refs' || a.kind === 'checkpoint.prune' || a.kind === 'checkpoint.deleteNamespace' || a.kind === 'improvements.command') {
      const svc = services.get(canonicalPath(a.workspaceRoot));
      if (!svc) return { kind: 'refused', code: 'workspace.none', headline: `no workspace service is running for ${a.workspaceRoot}` };
      return svc.link.request(a, millis(a.kind === 'checkpoint.capture' ? 320_000 : 60_000));
    }
    if (a.kind !== 'credentials.lease') return { kind: 'refused', code: 'ask.unhandled', headline: `main does not answer ${a.kind} from the run host` };
    const { bearers, report } = providers.lease(a.providerIds);
    /**
     * REQ-PROVIDER-068: an unresolved credential is reported once, not at every check. Every continuation
     * re-leases (ADR-0030, the standing substitute for the keep-fresh timer), so this answered three times a
     * prompt and said the same sentence each time. The same sentence twice running is one fact, not two.
     */
    const line = `credentials leased: ${report.authenticated.join(', ') || 'none'}${Object.keys(report.unresolved).length > 0 ? `; unresolved ${Object.entries(report.unresolved).map(([id, why]) => `${id} (${why})`).join(', ')}` : ''}`;
    if (line !== lastLeaseLine) { lastLeaseLine = line; log(line); }
    return { kind: 'credentials.leased', bearers, report: { authenticated: [...report.authenticated], renewed: [...report.renewed], unresolved: { ...report.unresolved } } };
  });
  // PD-MONITOR-002: 0 is an orderly end — main's own `shutdown` (`dispatch.ts`), or Electron tearing the process down at
  // quit, which also reports 0 (measured on a scratch Electron 44.1.1 app: `app.quit()`, `app.exit(0)` and
  // `utilityProcess.kill()` all report 0; an uncaught throw, `process.exit(3)`, SIGABRT, SIGKILL, SIGSEGV and SIGTERM
  // reported 1, 3, 6, 9, 11 and 15). Any other status is the process lost, and an `error`. A run host still running when
  // its `shutdown` bound elapses at quit is said on the quit path (`window-all-closed`, below).
  runHostChild.on('exit', (code) => log(`run host exited (${code}); NOT re-forked — every in-flight run is lost and settles through stale detection (ADR-0002)`, code === 0 ? 'info' : 'error'));

  const services = new Map<string, { child: UtilityProcess; link: ProcessLink<WorkspaceServiceRequest>; exit: ChildExit }>();
  let cancelImprovementWorkspace = (_workspaceRoot: string): void => undefined;
  /**
   * Step A1 of the window builder (ADR-0048's registry over main windows; ADR-0055 consequences 5 and 6).
   *
   * What belongs to ONE MAIN WINDOW rather than to the application, gathered into a record so that the
   * application-wide services around it — the notice store, the workspace open, the board's run coordinator —
   * read a window's state through a holder instead of through a variable that assumes there is only ever one.
   * The capacity is still exactly one and nothing here changes behaviour; lifting it is A3's job, and the
   * reason it is worth a step of its own is that `REQ-SHELL-017` needs two of these alive at once.
   */
  /**
   * A2 — the registry, and ADR-0055 consequence 5's ordering. Keyed by the window's `webContents` id, which is
   * what every message from a renderer carries, so "which window asked this" is a lookup rather than a guess.
   * `order` is most-recently-focused first and is maintained on FOCUS rather than on creation, because
   * `REQ-STARTUP-162` needs "the main window that most recently held keyboard focus, falling back to the one
   * built first" and that ordering "must survive a workspace switch in which two main windows are briefly
   * alive at once". Persona and terminal windows are deliberately absent: they are not main windows.
   *
   * The capacity is still one until A3. What this step buys is that nothing below asks "the main window" any
   * more — it asks for the ACTIVE one or for the SENDER's one, and those two questions have different answers
   * the moment there are two.
   */
  let mainWindows!: MainWindows<BrowserWindow, PersonaWindows, TerminalWindows, ApprovalPayload, ApprovalDialogState>;
  /** The window a message came from, when that sender is a main window at all (a dialog or a persona window is not). */
  const windowFor = (senderId: number): MainWindowState | undefined => mainWindows?.forSender(senderId);
  /**
   * REQ-STARTUP-162's ordering: most recently focused, else the one built first. Every application-wide service
   * that has to name *a* window — the notice store's focused session, the provider bootstrap, a notice's recovery
   * action — reads this one rather than a variable that assumed there was only ever one window to read.
   */
  const activeWindow = (): MainWindowState | undefined => mainWindows?.active();
  /**
   * The live main windows in REQ-STARTUP-162's order — most recently focused first, then the rest as built.
   * The driver seam reads this to address a window by index (A4); nothing in the product depends on it.
   */
  const orderedMainWindows = (): readonly MainWindowState[] => mainWindows?.ordered() ?? [];
  /**
   * REQ-TRACE-312's per-workspace fold key reads the active window's workspace, and the literal fallback key
   * when there is none — which is why it is a function and not a value: the answer changes with the window.
   */
  const foldsWorkspace = (): string | undefined => {
    const w = activeWindow();
    return w === undefined || w.workspace === '(no workspace)' ? undefined : w.workspace;
  };
  // The window paints BEFORE the workspace opens (REQ-STARTUP-156's first paint comes first), so a view's start-time
  // read — the Overview's session list and repository read (REQ-GIT-102: "beginning after the window has first been
  // drawn") — arrives while no workspace is open yet. Found on the Overview's first execution (ADR-0055 note): those
  // reads wait, bounded, for the open in flight instead of being refused with "no workspace".
  const openWorkspace = async (root: string, owner: MainWindowState): Promise<{ workspaceId: string; storeFile: string } | undefined> => {
    return mainWindows.open(owner.wcId, root);
  };
  const openWorkspaceInner = async (root: string): Promise<{ workspaceId: string; storeFile: string } | undefined> => {
    const key = canonicalPath(root);
    let svc = services.get(key);
    if (!svc) {
      const child = utilityProcess.fork(join(__dirname, 'workspace-service.js'), [], { serviceName: `rotaris-workspace:${key}` });
      svc = { child, link: new ProcessLink<WorkspaceServiceRequest>(portOf(child), clocks.timers), exit: watchChildExit(child) };
      services.set(key, svc);
      // PD-MONITOR-002: 0 is an orderly end — main's own `shutdown`, or Electron tearing the service down at quit (see the
      // run host's exit above); any other status is the service lost, and an `error`.
      child.on('exit', (code) => { log(`workspace service for ${key} exited (${code})`, code === 0 ? 'info' : 'error'); services.delete(key); cancelImprovementWorkspace(key); });
      // The service's log lines reach main's log too (Part P: the checkpoint capture, preview and restore lines the proof reads),
      // at the level the service gave them and under the same threshold as main's own (PD-MONITOR-002).
      svc.link.onEvent((e) => { if (e.kind === 'log') logAt(e.level, 'workspace service', e.message); });
      // ADR-0002 c.7 / ADR-0058: the service's narrow requests back to main are forwarded to the run host, bounded.
      svc.link.onAsk((a) => {
        switch (a.kind) {
          case 'runHost.refuseRuns': return runHost.request({ kind: 'workspace.refuseRuns', workspaceId: a.workspaceId, leaseMs: a.leaseMs }, millis(5_000));
          case 'runHost.renewLease': return runHost.request({ kind: 'workspace.renewLease', workspaceId: a.workspaceId, leaseMs: a.leaseMs }, millis(5_000));
          case 'runHost.closeStore': return runHost.request({ kind: 'workspace.closeStore', workspaceId: a.workspaceId }, millis(5_000));
          case 'runHost.release': return runHost.request({ kind: 'workspace.release', workspaceId: a.workspaceId }, millis(5_000));
          case 'runHost.reopen': return runHost.request({ kind: 'workspace.release', workspaceId: a.workspaceId }, millis(5_000));
          default: return Promise.resolve({ kind: 'refused', code: 'ask.unhandled', headline: `main does not answer ${a.kind} from a workspace service` } as ProcessReply);
        }
      });
    }
    const opened = await svc.link.request({ kind: 'workspace.open', workspaceRoot: key }, millis(10_000));
    if (opened.kind !== 'workspace.opened') { log(`workspace.open refused: ${JSON.stringify(opened)}`); return undefined; }
    // W-18: the run host is HANDED the resolved path; it never reads the identifier file.
    const ack = await runHost.request({ kind: 'workspace.opened', workspaceId: opened.workspaceId, storeFile: opened.storeFile, workspaceRoot: key }, millis(5_000));
    log(`workspace ${key} → ${opened.workspaceId} (schema v${opened.schemaVersion}); run host: ${ack.kind}`);
    // Stage B, as the A2 note here promised: the window this open was performed FOR is passed in. Reading
    // `activeWindow()` instead would, with two windows open, write one project's workspace identifier onto the
    // other project's window — and every workspace-scoped command resolves its window through that field.
    // REQ-NOTIFY-224 / REQ-SHELL-016: the unreviewed-hooks notice is raised after the window exists, never a dialog by itself.
    if (ack.kind === 'workspace.ack') {
      // REQ-WORKSPACE-141: initialization resolution takes the same slot as the hook-review notice — once
      // the window is interactive, never during its construction and never as a dialog opened unbidden.
      initialization.open(key, scopeFiles(resolveUserDirs().config, key).workspace.agents);
      clocks.timers.after(millis(process.env['ROTARIS_CAPTURE_RESUME'] ? 1_800 : 800), () => {
        void initialization.resolve(true).catch((cause: unknown) => log(`initialization: resolve failed (${String(cause)})`));
        void runHost.request({ kind: 'hooks.summary', workspaceId: opened.workspaceId }, millis(10_000)).then((r) => {
          if (r.kind === 'hooks.summary' && r.summary.status === 'review') { raiseNoticeKeyed(`hooks.review:${r.summary.workspace}:${r.summary.fingerprint}`, 'warning', 'Workspace hooks need review', r.summary.notice, recoveryFor('hooks.review', r.summary.workspace)); return; }
          // REQ-WORKSPACE-152 (3): once the window is interactive, never as a dialog; the only run-time consequence is REQ-WORKSPACE-137's refusal.
          const authenticated = providers.list().filter((row) => row.authenticated).map((row) => row.id);
          log(`providers: ${authenticated.length} authenticated${authenticated.length > 0 ? ` (${authenticated.join(', ')})` : ''}`);
          if (authenticated.length === 0 && raiseNoticeKeyed('providers.none', 'info', NO_PROVIDER_HEADLINE, 'Runs cannot start until a model provider is authenticated. Add one from Settings → Models.', recoveryFor('providers.add'))) log(`notice: ${NO_PROVIDER_HEADLINE}`);
        }).catch(() => undefined);
      });
    }
    return { workspaceId: opened.workspaceId, storeFile: opened.storeFile };
  };

  const rhHello = await runHost.request({ kind: 'hello' }, millis(5_000));
  // Main's own line about the handshake: named `run host hello:` so it cannot be read as a line the run host forwarded,
  // which the log writes as `run host: …` (PD-MONITOR-002's source column).
  log(`run host hello: ${JSON.stringify(rhHello)}`);

  const relay = new UpdateRelay();
  // Verification only: the capture may wait for the first terminal result (ROTARIS_CAPTURE_WAIT=result).
  let resultSeen = false;
  /**
   * ADR-0049 executed in full (Part V): the ONE notice store of this process (`main/notices.ts`) — a serialised
   * publication chain, record-then-render for a warning or an error, compare-and-clear, and the run-start clear of
   * REQ-NOTIFY-029/058. Nothing here publishes to channel 4 directly; the two entry points are `notices.report` and
   * `notices.acknowledge`, which is ADR-0049 decision 5's single entry point.
   *
   * REQ-NOTIFY-028: an unscoped notice belongs to the run the main window follows, which is the session its renderer
   * last subscribed to.
   */
  const notices = createNoticeStore({
    broadcast: (current) => relay.broadcast(CHANNEL.noticeCurrent, current),
    pushAcknowledgement: (a) => relay.broadcast(CHANNEL.acknowledgementPublish, a),
    // REQ-NOTIFY-268: the entry goes to the session's timeline, which the run host owns (ADR-0002); main never writes it.
    record: async (entry) => {
      const workspaceId = activeWindow()?.workspaceId;
      if (workspaceId === null || workspaceId === undefined) return false;
      // REQ-SESSION-134: the entry's severity is the record's own column. The notice vocabulary of REQ-NOTIFY-023 is
      // not the timeline's (it carries `success`, which no timeline entry may), so it is mapped rather than passed
      // through; only `warning` and `error` notices are recorded at all (REQ-NOTIFY-268), and the map is total anyway.
      const severity = entry.severity === 'error' ? 'error' : entry.severity === 'warning' ? 'warning' : 'info';
      const r = await runHost.request({ kind: 'timeline.append', workspaceId, sessionId: entry.sessionId, name: 'notice', actor: 'system', message: entry.title, severity, metadata: { notice_id: entry.noticeId, severity: entry.severity, message: entry.message, detail: entry.detail } }, millis(5_000)).catch(() => null);
      return r?.kind === 'timeline.appended';
    },
    log,
    focusedSession: () => activeWindow()?.followedSessionId ?? null,
  });
  /**
   * THE UPDATER (first-release-plan.md §4.6, ADR-0054; ruled into the first release by O-10) — `main/updater/`.
   * Classified once from the artifact the launch started from (REQ-STARTUP-106); its check runs from `MainWindows`'
   * post-show activation below, once per window shown (REQ-STARTUP-043/114); its two notice actions arrive as the
   * `update.install` and `update.restart` commands; the offer's dismissal reaches it through `notice.acknowledge`
   * before the clear (REQ-STARTUP-116/117). `updater/electron.ts` is the one file of it that touches Electron, the
   * network, the disk or a process; everything else is decided in its tests.
   */
  const updaterPorts = createUpdaterPorts();
  const classification = await classifyThisInstallation();
  const updater = createUpdater({
    classification,
    runningVersion: productVersion(),
    network: updaterPorts.network, staging: updaterPorts.staging, files: updaterPorts.files, spawn: updaterPorts.spawn,
    dismissedVersion: { read: () => preferences.read('updates/dismissedVersion'), write: (version) => preferences.write('updates/dismissedVersion', version) },
    notices,
    log: (level, message) => log(message, level),
    timers: clocks.timers,
    /**
     * REQ-STARTUP-121: the successor is the updated installation itself, started with the sentinel and this instance's
     * hand-over endpoint (`successorArguments`). The promise settles when `onRecordPassed` fires — the record has been
     * rewritten with the successor's fields and the successor told — and fails when the process cannot be started, or
     * when it started and was accepted but the record could not be passed to it (`onRecordPassFailed`; `successor.ts`).
     * It has no timeout of its own (ADR-0055): a successor that never signals leaves this instance as it is.
     */
    startSuccessor: (target) => successorWait.start(() => updaterPorts.spawn.spawnDetached(target, successorArguments(claim.record.endpoint))),
    // The window closes only after the successor has started, and the installer's hand-off closes it after its delay
    // (REQ-STARTUP-119/121): every main window is destroyed and the ordinary quit path follows.
    closeWindows: () => { mainWindows.dispose(); },
  });
  /**
   * Part X (REQ-LIBRARY-105): the library revision, and the ONE place it is broadcast from. `bump` takes a member of
   * REQ-LIBRARY-105's closed four, so a settings write has no way to reach it (`main/library.ts` explains why the
   * argument is a type and not a convention). Every live window is told, whichever view it is showing, because "a
   * change that arrives while the Library is off screen MUST be visible the next time the Library is shown".
   */
  const libraryRevision = createLibraryRevision((revision, change) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(CHANNEL.libraryChanged, { v: CONTRACT_SCHEMA_VERSION, revision });
    }
    log(`library change (${change}) → revision ${revision}`);
  });
  const improvementUndo = new Map<string, { artifactId: string; proposalId: string; previous: ProposalStatus; current: ProposalStatus; summary: string }>();
  const improvementRuns = new Map<string, { artifactId: string; workspaceRoot: string }>();
  const raiseNotice = (severity: NoticeSeverity, headline: string, detail?: string, recovery?: Recovery, sessionId?: string) => {
    void notices.report({ severity, title: headline, ...(detail === undefined ? {} : { detail }), ...(recovery === undefined || recovery.length === 0 ? {} : { action: recovery[0]! }), ...(sessionId === undefined ? {} : { sessionId }) });
  };
  /** REQ-NOTIFY-224: once per key within this application session; nothing persists across a restart (REQ-NOTIFY-027). */
  const raiseNoticeKeyed = (key: string, severity: NoticeSeverity, headline: string, detail?: string, recovery?: Recovery, sessionId?: string): boolean => {
    void notices.report({ severity, title: headline, key, ...(detail === undefined ? {} : { detail }), ...(recovery === undefined || recovery.length === 0 ? {} : { action: recovery[0]! }), ...(sessionId === undefined ? {} : { sessionId }) });
    // The chain answers whether the key had been published; the caller's own log line is the only consumer and the
    // store logs the suppression itself, so the synchronous answer here is "accepted", not "shown".
    return true;
  };
  /**
   * REQ-NOTIFY-223/224: the run host names an action; main maps it to the notice's own closed vocabulary member.
   * ESC-34: the review action carries the workspace whose hooks it concerns, so the caller supplies one; with no
   * workspace there is nothing to review and the notice is raised without an action rather than with an empty one.
   */
  const recoveryFor = (action: string | undefined, workspace?: string, sessionId?: string): Recovery =>
    action === 'hooks.review'
      ? (workspace === undefined || workspace === '' || workspace === '(no workspace)' ? [] : [{ label: 'Review hooks', action: { kind: 'open-hook-review', workspace } }])
      : action === 'hooks.settings' ? [{ label: 'Open hook settings', action: { kind: 'open-settings', category: 'hooks' } }]
        : action === 'config.models' ? [{ label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } }]
          : action === 'providers.add' ? [{ label: 'Add a provider', action: { kind: 'open-provider-sign-in' } }]
            /**
             * OQ-42: the durable-store failure's recovery. Reopening the session is what waits for every affected
             * run to settle, probes the store with a rolled-back write and rebuilds the session's writer and
             * projection (`Sessions.resume`) — so the action focuses the session the notice names, through
             * REQ-NOTIFY-044's existing `focus-session` member. A notice with no session to name carries no
             * action rather than one pointing nowhere, on the same terms as the hook review above.
             */
            : action === 'session.reopen' ? (sessionId === undefined || sessionId === '' ? [] : [{ label: 'Reopen the session', action: { kind: 'focus-session', sessionId } }])
              : [];
  /**
   * REQ-SHELL-155 / REQ-SESSION-062, OQ-46 (accepted 2026-09-06): the repair is ANNOUNCED, and the failure it
   * reports is plural. ADR-0002 accepts the run-host crash as a consequence, and it stales one session per
   * in-flight run — so three or five sessions needing repair at once is the realistic shape, and five notices
   * saying the same thing about five ids is not a report of it.
   *
   * One repaired session keeps the singular title REQ-SHELL-155 fixes, word for word. A batch is announced
   * ONCE: how many were repaired, their ids in the detail, and a route to the surface the affected-session list
   * is reached from — Overview, whose "List sessions" control opens it (REQ-SHELL-023's first view). The route
   * is deliberately an existing member of REQ-NOTIFY-044's closed vocabulary rather than a new one; widening
   * that vocabulary is the escalation OQ-46's own entry says this answer becomes if it needs one, and it does
   * not need one. Every repaired session still gets its own timeline entry (REQ-SESSION-062): this is what the
   * user is shown, not what is recorded.
   */
  const announceRepairs = (repaired: readonly { readonly sessionId: string; readonly from: string; readonly reason: string }[]): void => {
    if (repaired.length === 0) return;
    if (repaired.length === 1) {
      const one = repaired[0]!;
      raiseNotice('warning', 'Session marked interrupted', `This session was still marked '${one.from}', but ${one.reason}. Rotaris marked it interrupted, so its checkpoints can be restored again.`);
      log(`notice: Session marked interrupted (${one.sessionId}: was '${one.from}', ${one.reason})`);
      return;
    }
    raiseNotice(
      'warning', 'Sessions marked interrupted',
      `${repaired.length} sessions were still marked as running with no process behind them. Rotaris marked them interrupted, so their checkpoints can be restored again. Open Overview and choose "List sessions" to see them: ${repaired.map((r) => r.sessionId).join(', ')}.`,
      [{ label: 'Open Overview', action: { kind: 'open-view', view: 'overview' } }],
    );
    log(`notice: Sessions marked interrupted (${repaired.length}: ${repaired.map((r) => r.sessionId).join(', ')})`);
  };
  /** REQ-WORKSPACE-152 (3): the first-launch notice — persistent, informational, dismissible, gating nothing. */
  const NO_PROVIDER_HEADLINE = 'No model provider is authenticated yet';
  /**
   * ADR-0019 / REQ-TOOLS-063: main owns the per-window DIALOG QUEUE and nothing else — it never decides.
   * One approval dialog open per window, oldest first by the payload's sequence, the next within 100 ms
   * of the previous closing; a request answered or cancelled elsewhere closes its dialog; an
   * undeliverable answer leaves the dialog open with the buttons disabled. Every dialog is a modal
   * BrowserWindow painting the one renderer bundle with role=approval (ADR-0048, ADR-0056) — never a
   * synchronous native dialog (ADR-0019's prohibition).
   */
  const dialogs = new Map<number, { requestId: string; win: BrowserWindow; answered: boolean }>();
  // REQ-ORCH-086 / REQ-SESSION-109: one pause window per session; its payload read by the window's own command.
  const pauseWindows = new Map<string, BrowserWindow>();
  const pausePayloads = new Map<number, PausePayload>();
  const presentPause = async (payload: PausePayload): Promise<void> => {
    const existing = pauseWindows.get(payload.sessionId);
    if (existing && !existing.isDestroyed()) { existing.focus(); return; }
    const parent = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !dialogs.has(w.webContents.id) && !pausePayloads.has(w.webContents.id));
    if (!parent) { log('pause: no main window to present the dialog over'); return; }
    const dlg = new BrowserWindow({
      parent, modal: true, width: 560, height: 360, minWidth: 560, minHeight: 360, show: false, title: 'Run paused', backgroundColor: themeBackground(),
      resizable: true, minimizable: false, maximizable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const wc = dlg.webContents.id;
    pauseWindows.set(payload.sessionId, dlg);
    pausePayloads.set(wc, payload);
    dlg.setMenuBarVisibility(false);
    dlg.on('closed', () => { pausePayloads.delete(wc); if (pauseWindows.get(payload.sessionId) === dlg) pauseWindows.delete(payload.sessionId); });
    const answer = process.env['ROTARIS_CAPTURE_PNG'] ? process.env['ROTARIS_CAPTURE_PAUSE_ANSWER'] : undefined;
    const query = { role: 'pause', ...(answer ? { answer } : {}) };
    try {
      if (process.env['ELECTRON_RENDERER_URL']) await dlg.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query).toString()}`);
      else await dlg.loadFile(join(__dirname, '../renderer/index.html'), { query });
      dlg.show();
      dlg.focus();
    } catch (cause) {
      log(`pause dialog could not be shown: ${String(cause)}`, 'warn');
    }
  };

  // ADR-0030 / REQ-PROVIDER-116/117/142: the authentication window — one at a time, its payload read by its own command.
  let providerWindow: BrowserWindow | null = null;
  const providerPayloads = new Map<number, { mode: ProviderDialogPayload['mode']; providerId: string | null }>();
  const healthCache = new Map<string, ProviderHealthPayload>();
  const providerChoices = (): ProviderDialogPayload['choices'] => {
    const custom = CATALOGUE.find((c) => c.id === 'openai-compatible')!;
    const authenticated = new Set(providers.list().filter((r) => r.authenticated).map((r) => r.id));
    const builtIns = CATALOGUE.filter((c) => c.id !== 'openai-compatible' && c.id !== 'concrete-cloud' && !authenticated.has(c.id));
    return [
      { id: custom.id, displayName: 'OpenAI-compatible endpoint (custom URL)', method: custom.signInMethod, methodLabel: METHOD_LABELS[custom.signInMethod], hint: destinationHint(custom), defaultBaseUrl: custom.baseUrl, custom: true, available: true, unavailabilityReason: null },
      ...builtIns.map((c) => ({ id: c.id, displayName: c.displayName, method: c.signInMethod, methodLabel: METHOD_LABELS[c.signInMethod], hint: destinationHint(c), defaultBaseUrl: null, custom: false, available: c.available, unavailabilityReason: c.unavailabilityReason })),
    ];
  };
  const providerRows = (): ProviderRow[] => providers.list().map((r) => ({
    id: r.id, displayName: r.displayName, method: r.method, methodLabel: r.methodLabel, authenticated: r.authenticated, status: r.status, displayMask: r.maskedKey,
    baseUrl: r.baseUrl, modelCount: r.modelCount, userDefined: r.userDefined, available: r.available, lastError: r.lastError, health: healthCache.get(r.id) ?? null,
  }));
  const presentProvider = async (mode: ProviderDialogPayload['mode'], providerId: string | null): Promise<void> => {
    if (providerWindow && !providerWindow.isDestroyed()) { providerWindow.focus(); return; }
    const parent = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !dialogs.has(w.webContents.id) && !pausePayloads.has(w.webContents.id) && !providerPayloads.has(w.webContents.id));
    if (!parent) { log('providers: no main window to present the dialog over'); return; }
    const name = providerId ? providers.displayName(providerId) : null;
    const dlg = new BrowserWindow({
      parent, modal: true, width: 560, height: 560, minWidth: 500, minHeight: 420, show: false, title: mode === 'reauthenticate' ? `Re-authenticate ${name}` : mode === 'authenticate' ? `Authenticate ${name}` : 'Add provider', backgroundColor: themeBackground(),
      resizable: true, minimizable: false, maximizable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const wc = dlg.webContents.id;
    providerWindow = dlg;
    providerPayloads.set(wc, { mode, providerId });
    dlg.setMenuBarVisibility(false);
    dlg.on('closed', () => { providerPayloads.delete(wc); if (providerWindow === dlg) providerWindow = null; });
    const query = { role: 'provider' };
    try {
      if (process.env['ELECTRON_RENDERER_URL']) await dlg.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query).toString()}`);
      else await dlg.loadFile(join(__dirname, '../renderer/index.html'), { query });
      dlg.show();
      dlg.focus();
      // ROTARIS_CAPTURE_PROVIDER_FILL="label>>url[>>key]": the proof fills the two visible fields; a THIRD segment
      // fills the key field too and presses the dialog's own button with a real click, so an unattended live run
      // (`pnpm live-run`) signs in on the product's own path. The slice proof passes two segments and the paste
      // stays the owner's. The key is never logged: the fill reports which fields it found, nothing of what it wrote.
      // ROTARIS_CAPTURE_PROVIDER_EMPTY_OK=1: an endpoint that answers discovery with no models leaves an unattended
      // run at the zero-model alert, so the seam takes that dialog's own "Continue anyway" (REQ-PROVIDER-133's
      // recovery) — polled, because discovery takes as long as the endpoint takes.
      const fill = process.env['ROTARIS_CAPTURE_PNG'] ? process.env['ROTARIS_CAPTURE_PROVIDER_FILL'] : undefined;
      if (fill) {
        const [label, url, apiKey] = fill.split('>>');
        const centre = (selector: string, text: string | null): string => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => !x.disabled${text === null ? '' : ` && x.textContent.trim() === ${JSON.stringify(text)}`}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
        const press = (what: string, script: string): void => {
          void dlg.webContents.executeJavaScript(script)
            .then((found: unknown) => {
              const at = found as { x: number; y: number } | null;
              if (at === null) return;
              dlg.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(at.x), y: Math.round(at.y), button: 'left', clickCount: 1 });
              dlg.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(at.x), y: Math.round(at.y), button: 'left', clickCount: 1 });
              log(`capture: provider dialog ${what} pressed`);
            }).catch((e) => log(`capture: provider ${what} failed: ${String(e)}`));
        };
        clocks.timers.after(millis(600), () => {
          void dlg.webContents.executeJavaScript(`(() => { const set = (id, v) => { const el = document.getElementById(id); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }; const filled = [set('provider-label', ${JSON.stringify(label ?? '')}), set('provider-url', ${JSON.stringify(url ?? '')})]; ${apiKey ? `filled.push(set('provider-key', ${JSON.stringify(apiKey)}));` : ''} return filled; })()`)
            .then((r) => log(`capture: provider dialog filled ${JSON.stringify(r)}; ${apiKey ? "pressing the dialog's own button" : 'waiting for the key to be pasted and Authenticate pressed'}`)).catch((e) => log(`capture: provider fill failed: ${String(e)}`));
          if (apiKey !== undefined && apiKey !== '') {
            clocks.timers.after(millis(500), () => press('button', centre('[data-action="authenticate"]', null)));
            if (process.env['ROTARIS_CAPTURE_PROVIDER_EMPTY_OK']) {
              for (const at of [3_000, 6_000, 10_000, 16_000, 24_000]) clocks.timers.after(millis(at), () => press('"Continue anyway"', centre('[aria-label="No models discovered"] button', 'Continue anyway')));
            }
          }
        });
      }
    } catch (cause) {
      log(`provider dialog could not be shown: ${String(cause)}`, 'warn');
    }
  };
  /** After any change to the credential store or the snapshot: the workspace's starter file if absent, the load again, every window told. */
  const afterProviderChange = async (): Promise<void> => {
    const target = activeWindow();
    if (!target?.workspaceId || target.workspace === '(no workspace)') return;
    const root = canonicalPath(target.workspace);
    const svc = services.get(root);
    if (!svc) return;
    const r = await svc.link.request({ kind: 'config.bootstrap', workspaceRoot: root }, millis(30_000)).catch(() => null);
    if (r?.kind === 'config.snapshot') for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.configChanged, { v: CONTRACT_SCHEMA_VERSION, snapshot: r.snapshot });
    // ADR-0037 Tier B: the run host's next load folds the snapshot itself; nothing to hand over.
    if (notices.current()?.title === NO_PROVIDER_HEADLINE && providers.list().some((row) => row.authenticated)) void notices.dismiss(notices.current()?.id);
  };
  const parentWindowIds = new Set<string>();
  /**
   * A3 — which main window owns a session's approval. `REQ-TOOLS-063` ends "each presentation makes the dialog
   * the focused window of **its parent**", so the parent has to be the window the run is being watched in
   * rather than whichever window `getAllWindows()` happened to list first.
   *
   * The answer is derived, not chosen: a session belongs to one workspace, and at most one main window is open
   * on a workspace — `REQ-STARTUP-163` surfaces the existing window rather than building a second for a folder
   * already open, and the same-folder case offers a new session instead (the owner's decision recorded with
   * this part). `REQ-MONITOR-243`'s "one live session may be displayed in as many windows as the user has open"
   * is therefore about persona and terminal windows, not two main windows on one folder. So:
   *
   *   1. the MAIN window subscribed to that session, which the relay already knows (ADR-0043's subscription is
   *      bound to the sender, so this needs no second bookkeeping);
   *   2. else the active main window — where a background session's first approval lands.
   */
  const ownerOf = (sessionId: string): MainWindowState | undefined => {
    return mainWindows.ownerOfSession(sessionId, relay.subscribersOf(sessionId).map((sink) => sink.id));
  };
  /**
   * The main window that owns an AUXILIARY window, found by asking each window's own registries whether the
   * sender is theirs (ADR-0048: a persona or terminal window belongs to its main window). A payload command
   * from one of those windows arrives from the auxiliary window itself, so `windowFor` — which answers only for
   * main windows — cannot resolve it, and with two main windows alive "the main window" is not an answer.
   */
  const ownerOfAuxiliary = (senderId: number): MainWindowState | undefined => {
    return mainWindows.ownerOfAuxiliary(senderId);
  };
  const presentNext = async (w: MainWindowState): Promise<void> => {
    if (mainWindows.openDialog(w.wcId) || mainWindows.approvalQueue(w.wcId).length === 0) return;
    // REQ-TOOLS-061/063: oldest first by the published sequence, which ADR-0019 states orders presentation ACROSS windows.
    const payload = mainWindows.takeApproval(w.wcId, (a, b) => a.sequence - b.sequence)!;
    if (w.win.isDestroyed()) { await runHost.request({ kind: 'approval.shown', requestId: payload.request_id, ok: false, error: 'no main window is open' }, millis(5_000)).catch(() => undefined); return; }
    const dlg = new BrowserWindow({
      parent: w.win, modal: true, width: 560, height: 380, minWidth: 560, minHeight: 380, show: false, title: 'Permission required', backgroundColor: themeBackground(),
      resizable: true, minimizable: false, maximizable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const entry = { requestId: payload.request_id, win: dlg, answered: false };
    mainWindows.setOpenDialog(w.wcId, entry);
    // Read once, up front: `webContents` on a destroyed window throws, and a throw from a `closed` handler is an
    // uncaught exception that raises the platform's native error box and wedges main (found on first execution).
    const dlgWcId = dlg.webContents.id;
    dialogs.set(dlgWcId, entry);
    dialogPayloads.set(dlgWcId, { payload, othersWaiting: mainWindows.approvalQueue(w.wcId).length });
    dlg.setMenuBarVisibility(false);
    dlg.on('closed', () => {
      dialogs.delete(dlgWcId);
      dialogPayloads.delete(dlgWcId);
      if (mainWindows.openDialog(w.wcId) === entry) mainWindows.setOpenDialog(w.wcId, null);
      // REQ-TOOLS-063: closing the window answers Deny; a request already answered or cancelled asks nothing more.
      if (!entry.answered) void runHost.request({ kind: 'session.control', request: { op: 'answerApproval', sessionId: payload.session_id, args: { requestId: payload.request_id, option: 'deny' } } }, millis(5_000)).catch(() => undefined);
      clocks.timers.after(millis(50), () => { void presentNext(w); });
    });
    try {
      if (process.env['ELECTRON_RENDERER_URL']) await dlg.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?role=approval`);
      else await dlg.loadFile(join(__dirname, '../renderer/index.html'), { query: { role: 'approval' } });
      dlg.show();
      dlg.focus();
      await runHost.request({ kind: 'approval.shown', requestId: payload.request_id, ok: true }, millis(5_000));
      log(`approval ${payload.request_id} presented (${payload.tool_name}, rule ${payload.rule_id}); ${mainWindows.approvalQueue(w.wcId).length} waiting`);
      // Verification seam (only with ROTARIS_CAPTURE_PNG): answer the dialog with a real click or Escape.
      const scripted = capturing ? process.env['ROTARIS_CAPTURE_APPROVAL'] : undefined;
      if (scripted) {
        clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_APPROVAL_MS'] ?? 700)), async () => {
          if (dlg.isDestroyed()) return;
          const dialogPng = process.env['ROTARIS_CAPTURE_DIALOG_PNG'];
          if (dialogPng) { const { writeFileSync } = await import('node:fs'); writeFileSync(dialogPng, (await dlg.webContents.capturePage()).toPNG()); log(`captured dialog ${dialogPng}`); }
          if (scripted === 'escape') { dlg.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); dlg.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); log('capture: approval dialog → Escape'); return; }
          const label = scripted === 'once' ? 'Approve once' : scripted === 'session' ? 'Approve for this session' : 'Deny';
          const rect = await dlg.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
          if (!rect) { log(`capture: no "${label}" button in the approval dialog`); return; }
          dlg.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
          dlg.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
          log(`capture: approval dialog → clicked "${label}"`);
        });
      }
    } catch (cause) {
      log(`approval ${payload.request_id} could not be presented: ${String(cause)}`, 'warn');
      entry.answered = true;
      await runHost.request({ kind: 'approval.shown', requestId: payload.request_id, ok: false, error: String(cause) }, millis(5_000)).catch(() => undefined);
      if (!dlg.isDestroyed()) dlg.close();
    }
  };
  const dialogPayloads = new Map<number, { payload: ApprovalPayload; othersWaiting: number }>();
  /**
   * REQ-HOOKS-106/107: the review dialog — a modal BrowserWindow painting the one bundle with role=hook-review,
   * at least 620×440 logical pixels, opened only when the user asks (REQ-HOOKS-104, REQ-SHELL-016). Leaving it
   * without choosing is a rejection, reported once: the first exit path taken reports.
   */
  const reviewPayloads = new Map<number, { workspace: string; entries: HooksSummary['review']; decided: boolean; win: BrowserWindow }>();
  const openHookReview = async (): Promise<CommandOutcome> => {
    const workspaceId = activeWindow()?.workspaceId;
    if (!workspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reviewing its hooks' };
    const r = await runHost.request({ kind: 'hooks.summary', workspaceId }, millis(10_000));
    if (r.kind !== 'hooks.summary') return refusal(r, 'The hooks could not be read');
    if (r.summary.declaredCount === 0) return { ok: false, code: 'hooks.none', headline: 'This workspace declares no hooks' };
    const parent = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !dialogs.has(w.webContents.id) && !reviewPayloads.has(w.webContents.id));
    const dlg = new BrowserWindow({
      ...(parent ? { parent, modal: true } : {}), width: 720, height: 520, minWidth: 620, minHeight: 440, show: false, title: "Review this workspace's hooks", backgroundColor: themeBackground(),
      resizable: true, minimizable: false, maximizable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const wc = dlg.webContents.id;
    const entry = { workspace: r.summary.workspace, entries: r.summary.review, decided: false, win: dlg };
    reviewPayloads.set(wc, entry);
    dlg.setMenuBarVisibility(false);
    dlg.on('closed', () => {
      reviewPayloads.delete(wc);
      if (!entry.decided) {
        entry.decided = true;
        void runHost.request({ kind: 'hooks.decide', workspaceId, trusted: false }, millis(10_000)).then((d) => log(`hook review closed without a choice → refused (${d.kind})`)).catch(() => undefined);
      }
    });
    try {
      if (process.env['ELECTRON_RENDERER_URL']) await dlg.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?role=hook-review`);
      else await dlg.loadFile(join(__dirname, '../renderer/index.html'), { query: { role: 'hook-review' } });
      dlg.show();
      dlg.focus();
      log(`hook review opened for ${entry.workspace} (${entry.entries.length} hook(s))`);
      // Verification seam (only with ROTARIS_CAPTURE_PNG): capture the dialog, then click Allow or Do-not-run.
      const scriptedReview = capturing ? process.env['ROTARIS_CAPTURE_HOOK_REVIEW'] : undefined;
      if (scriptedReview) {
        clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_HOOK_REVIEW_MS'] ?? 900)), async () => {
          if (dlg.isDestroyed()) return;
          const png = process.env['ROTARIS_CAPTURE_REVIEW_PNG'];
          if (png) { const { writeFileSync } = await import('node:fs'); writeFileSync(png, (await dlg.webContents.capturePage()).toPNG()); log(`captured review dialog ${png}`); }
          const label = scriptedReview === 'allow' ? 'Allow these hooks' : 'Do not run these hooks';
          const rect = await dlg.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
          if (!rect) { log(`capture: no "${label}" button in the review dialog`); return; }
          dlg.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
          dlg.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
          log(`capture: review dialog → clicked "${label}"`);
        });
      }
      return { ok: true, value: { opened: true } };
    } catch (cause) {
      log(`the hook review could not be opened: ${String(cause)}`, 'warn');
      entry.decided = true;
      if (!dlg.isDestroyed()) dlg.close();
      return { ok: false, code: 'hooks.review', headline: 'The review dialog could not be opened', detail: String(cause) };
    }
  };

  const improvementCoordinator = createImprovementCoordinator({
    analyze: (request, bound) => runHost.request(request, bound),
    cancel: (artifactId) => { void runHost.request({ kind: 'improvement.cancel', artifactId }, millis(1_000)).catch(() => undefined); },
    service: (workspaceRoot, request, bound) => services.get(canonicalPath(workspaceRoot))?.link.request(request, bound),
    activity: (activity) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.improvementActivity, { v: CONTRACT_SCHEMA_VERSION, ...activity });
    },
    stored: (record) => {
      libraryRevision.bump('improvement-artifacts');
      /*
       * PD-LIBRARY-002: the same notice for both passes, saying which one produced the proposals. A
       * retrospective names no session — it looked at the workspace, not at one run — so the notice carries
       * none rather than a null one, and both open the Library at the tab the proposals landed on.
       */
      const count = record.artifact.proposals.length;
      const retrospective = record.artifact.source_kind === 'retrospective';
      const session = record.artifact.source_session_id ?? undefined;
      if (count === 0) {
        // REQ-LIBRARY-124: zero proposals is an informational notice with NO action — there is nothing to review.
        raiseNotice('info', retrospective ? 'The retrospective found nothing to propose' : 'Improvement analysis complete — no proposals', `Nothing was proposed in ${record.artifact.artifact_id}.`, undefined, session);
        return;
      }
      raiseNotice(
        'success',
        // REQ-LIBRARY-124 fixes the sibling's wording exactly; the retrospective says which pass proposed, per
        // PD-LIBRARY-002's "its own label", and both open the Library where the proposals landed.
        retrospective ? `${count} retrospective proposal${count === 1 ? '' : 's'} ready` : `${count} improvement proposal${count === 1 ? '' : 's'} ready`,
        retrospective ? `Collected in ${record.artifact.artifact_id} from this workspace's own history.` : `Collected in ${record.artifact.artifact_id}.`,
        [{ label: 'Review proposals', action: { kind: 'open-library', tab: 'proposals' } }],
        session,
      );
    },
    /**
     * REQ-LIBRARY-124: a worker failure MUST NOT be silent. A job that ended without an artifact for any
     * reason other than cancellation (REQ-LIBRARY-127, which stays silent because the user asked for it)
     * raises a warning naming the run it belonged to and carrying the failure's reason, and offers NO
     * action — there is nothing to review. REQ-LIBRARY-035(b)'s application-log line stays in addition to
     * it, written by the coordinator beside this call. PD-LIBRARY-002: a retrospective names no session, so
     * it names the history it read instead, on the same terms as the completion notice above.
     */
    failed: (job, reason) => {
      const retrospective = job.pass === 'retrospective';
      raiseNotice(
        'warning',
        retrospective ? 'The retrospective could not be completed' : 'The completed run could not be reviewed for improvements',
        retrospective
          ? `This workspace's own history was not reviewed: ${reason}.`
          : `Session ${job.source_session_id} was not reviewed for improvements: ${reason}.`,
        undefined,
        job.source_session_id ?? undefined,
      );
    },
    log,
  });
  cancelImprovementWorkspace = (workspaceRoot) => improvementCoordinator.cancelWorkspace(workspaceRoot);

  // ADR-0044: main RELAYS a publication unchanged; the number on it is the run host's.
  runHost.onEvent((e) => {
    if (e.kind === 'publish.increment') relay.relaySequenced(CHANNEL.transcriptIncrement, e.payload);
    else if (e.kind === 'publish.snapshot') relay.relaySequenced(CHANNEL.sessionSnapshot, e.payload);
    else if (e.kind === 'improvement.job') improvementCoordinator.enqueue(e.job);
    else if (e.kind === 'presenter.poll') {
      // ADR-0019: the reply carries the windows main holds; answered at once, never from a blocked loop.
      void runHost.request({ kind: 'presenter.pollReply', seq: e.seq, windows: [...parentWindowIds] }, millis(5_000)).catch(() => undefined);
    }
    else if (e.kind === 'approval.present') {
      // A3: the request joins the queue of the window the run is being watched in, and only that window
      // presents it. With no main window at all there is nobody to ask, which REQ-TOOLS-064 answers through
      // the headless policy — main says "not shown" and decides nothing itself (ADR-0019).
      const owner = ownerOf(e.payload.session_id);
      if (owner) { mainWindows.enqueueApproval(owner.wcId, e.payload); void presentNext(owner); }
      else void runHost.request({ kind: 'approval.shown', requestId: e.payload.request_id, ok: false, error: 'no main window is open' }, millis(5_000)).catch(() => undefined);
    }
    else if (e.kind === 'approval.close') {
      // Answered or cancelled elsewhere: the open dialog closes without asking again; a queued one is dropped
      // unshown. Every window is searched, because the request was queued against its owner rather than
      // against the active window, and the two need not be the same.
      mainWindows.removeApproval((approval) => approval.request_id === e.requestId);
      mainWindows.forEach((candidate) => {
        const open = mainWindows.openDialog(candidate.wcId);
        if (open && open.requestId === e.requestId) { open.answered = true; if (!open.win.isDestroyed()) open.win.close(); }
      });
    }
    else if (e.kind === 'notice.publish') {
      // REQ-NOTIFY-028: the run host names the session its notice concerns, so a notice about one run survives the
      // start of another (REQ-NOTIFY-029). No timer clears anything here any more: REQ-NOTIFY-040 allows a notice to
      // leave only by replacement, a run-start clear, or the user's dismissal.
      const recovery = recoveryFor(e.action, activeWindow()?.workspace, e.sessionId);
      void notices.report({
        severity: e.severity, title: e.title, message: e.message, detail: e.detail, persistent: e.persistent, sessionId: e.sessionId,
        ...(e.key === undefined ? {} : { key: e.key }),
        ...(recovery.length === 0 ? {} : { action: recovery[0]! }),
      });
      log(`notice from the run host: ${e.title}${e.action ? ` [${e.action}]` : ''}${e.sessionId === '' ? '' : ` (session ${e.sessionId})`}`);
    }
    else if (e.kind === 'acknowledgement.publish') {
      // REQ-NOTIFY-003's transient half, straight to the window's stack (REQ-MCP-044's warning arrives here since Part V).
      notices.acknowledge(e.kindOf, e.title, e.body);
      log(`acknowledgement from the run host: ${e.kindOf} "${e.title}"`);
    }
    else if (e.kind === 'run.paused') {
      // REQ-ORCH-085/086: the host is told; the dialog is a modal window over the main window.
      log(`run ${e.sessionId} paused at the message limit: ${e.count} of ${e.limit ?? 'no limit'}`);
      void presentPause({ sessionId: e.sessionId, count: e.count, limit: e.limit, tokens: e.tokens });
    }
    else if (e.kind === 'run.result') {
      const improvement = improvementRuns.get(e.sessionId);
      if (improvement) {
        improvementRuns.delete(e.sessionId);
        const svc = services.get(improvement.workspaceRoot);
        if (svc) void svc.link.request({ kind: 'improvements.command', workspaceRoot: improvement.workspaceRoot, command: { action: 'record-applied', artifact_id: improvement.artifactId } }, millis(320_000)).then((reply) => {
          if (reply.kind === 'improvements.result') {
            libraryRevision.bump('improvement-artifacts');
            log(`improvement ${improvement.artifactId}: applied checkpoint recorded after session ${e.sessionId}`);
          } else {
            raiseNotice('warning', `Improvement ${improvement.artifactId} completed without a post-run checkpoint`, reply.kind === 'refused' ? [reply.headline, reply.detail].filter(Boolean).join(': ') : `unexpected reply ${reply.kind}`, undefined, e.sessionId);
          }
        }).catch((cause: Error) => raiseNotice('warning', `Improvement ${improvement.artifactId} completed without a post-run checkpoint`, cause.message, undefined, e.sessionId));
      }
      // REQ-SESSION-186 / REQ-NOTIFY-003: the terminal outcome, presented once, at the severity summarisation assigned.
      const sev = e.result.severity === 'error' ? 'error' : e.result.severity === 'warning' ? 'warning' : 'info';
      // REQ-NOTIFY-060/063/093 (Part Q): a run ended by a rate-limit or quota condition — the wait cancelled, or the ladder out of
      // recoveries — is the third class: the provider limit was reached, the session is preserved, another model or a retry once
      // the provider resets, the failure text as detail, the action opening model settings. (REQ-NOTIFY-062's hosted-credit
      // branch is not built: no hosted provider exists.) The authentication and sandbox classes ahead of it are not built either.
      /**
       * REQ-EVENTS-088 (OQ-42): a run whose terminal persistence could not be confirmed has ALREADY been
       * reported — the run host published one failure notice carrying the last durable ordinal and the reopen
       * action, which is the "exactly one failure notification per affected run" that requirement allows. A
       * second notice here would be the same failure told twice, so this outcome is logged and not raised.
       * The condition is read from the structured field rather than from the summary sentence, so the
       * suppression cannot be lost by rewording.
       */
      if (e.result.persistence !== undefined) {
        log(`run ${e.sessionId}: completion unconfirmed, last durable event ordinal ${e.result.persistence.last_event_ordinal} — the recording-failure notice already carries it (REQ-EVENTS-088)`);
      } else if (e.result.error !== null && /rate.?limit|quota|429|too many requests/i.test(e.result.error)) {
        raiseNotice('error', 'The provider limit was reached; the session is preserved', `${e.result.error}\n\nChoose another model, or retry once the provider resets.`, recoveryFor('config.models'));
      } else {
        raiseNotice(sev, e.result.summary, e.result.error ?? undefined);
      }
      resultSeen = true;
      log(`run ${e.sessionId} ended ${e.result.status} (${e.result.stop_reason}) → ${e.result.execution_status}`);
    }
    // PD-MONITOR-002: the run host's level, under the same threshold as main's own — its MCP children's stderr is `debug`.
    else if (e.kind === 'log') logAt(e.level, 'run host', e.message);
  });
  // Part AL — channel 3 (ADR-0021 first executed): a terminal frame is delivered to each subscribed window under
  // REQ-MONITOR-306's per-window bound, merged into larger steps rather than dropped (REQ-SHELL-103) — `main/terminal.ts`.
  const terminalFrames = new FrameDeliveryLimiter({ relay, clocks, log });
  runHost.onEvent((e) => { if (e.kind === 'publish.terminal') terminalFrames.deliver(e.payload); });
  /**
   * Part AS — ADR-0064's project-initialization coordinator. It lives here because the marker's one
   * writer is the workspace service and the one task's work runs in the run host, and neither may
   * import the other (REQ-WORKSPACE-085; `eslint.config.js`). Channel 12 carries the nine values of
   * REQ-WORKSPACE-105 to every live window, whichever view it is showing.
   */
  const initialization = new InitializationCoordinator({
    clocks,
    log,
    writeMarker: async (root, patch) => {
      const svc = services.get(root);
      if (!svc) return { ok: false, reason: 'the workspace service is not running' };
      const r = await svc.link.request({ kind: 'config.setField', workspaceRoot: root, scope: 'workspace', patch }, millis(30_000));
      return r.kind === 'config.snapshot' ? { ok: true } : { ok: false, reason: r.kind === 'refused' ? r.headline : `the service answered ${r.kind}` };
    },
    setup: {
      start: async () => {
        const id = activeWindow()?.workspaceId;
        if (!id) return { ok: false, reason: 'no workspace is open' };
        const r = await runHost.request({ kind: 'mcp.setup', workspaceId: id, action: 'start' }, millis(15_000));
        return r.kind === 'mcp.setup' ? { ok: true, status: r.status } : { ok: false, reason: r.kind === 'refused' ? r.headline : `the run host answered ${r.kind}` };
      },
      cancel: async () => {
        const id = activeWindow()?.workspaceId;
        if (id) await runHost.request({ kind: 'mcp.setup', workspaceId: id, action: 'cancel' }, millis(15_000));
      },
      status: async () => {
        const id = activeWindow()?.workspaceId;
        if (!id) return null;
        const r = await runHost.request({ kind: 'mcp.setup', workspaceId: id, action: 'status' }, millis(15_000));
        return r.kind === 'mcp.setup' ? r.status : null;
      },
    },
    publish: (state) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.initializationState, { v: CONTRACT_SCHEMA_VERSION, ...state });
    },
    banner: (headline, detail) => raiseNotice('error', headline, detail),
    modelReachable: () => providers.list().some((row) => row.authenticated),
  });
  runHost.onEvent((e) => { if (e.kind === 'mcp.setupStatus') initialization.onSetupStatus(e.status); });
  /**
   * Verification only — `ROTARIS_INIT_TEST_TASK=consent|fail`. REQ-WORKSPACE-080's last sentence is what
   * this exercises and it is the only way to exercise it: "a setup task added after the fact SHALL
   * participate in the prompt and in the setup UI under exactly the rules stated here, with no additional
   * behavior of its own". The product's own default set requires no consent (REQ-WORKSPACE-088), so
   * REQ-WORKSPACE-104 is exactly right that a fresh workspace prompts for nothing — and the consent dialog
   * and the composer gate would therefore be unreachable by any launch of the shipped product. This seam
   * registers an ordinary task through the ordinary registry; it adds no code path of its own.
   */
  const testTask = process.env['ROTARIS_INIT_TEST_TASK'];
  if (testTask === 'consent' || testTask === 'fail') {
    initialization.registry.register({
      id: `verification-${testTask}`,
      label: testTask === 'consent' ? 'Verification consent task' : 'Verification failing task',
      description: 'Registered by ROTARIS_INIT_TEST_TASK for the initialization proof; not part of the product.',
      requiresConsent: testTask === 'consent',
      applicable: () => true,
      run: async (ctx) => {
        ctx.onStep({ name: 'Verification step', status: testTask === 'fail' ? 'failed' : 'success', detail: 'the seam reporting a step' });
        return testTask === 'fail'
          ? { status: 'failure', steps: [], classification: null, error: 'The verification task failed on purpose.', retryable: true, summary: 'Nothing was recorded; it can be run again.' }
          : { status: 'success', steps: [], classification: null, error: '', retryable: false, summary: 'The verification task finished.' };
      },
    });
    log(`initialization: verification task 'verification-${testTask}' registered (ROTARIS_INIT_TEST_TASK)`);
  }
  const processes: ProcessKind[] = ['run-host'];
  // A1: the resolved workspace is a field of the window record built below. Nothing outside a window may
  // assume there is one, so every reader above that point goes through `mainWindow`.
  // Part AK2 — REQ-TRACE-312 (spec 08 §Persisted state): the board's column folds are keyed by the workspace this
  // instance has open, and the renderer names them by the ONE placeholder `contracts` registers; main resolves it
  // here, as `composer.readDraft` resolves the draft's key, so a window can only ever read or write its own
  // workspace's folds. Every other key of the `prefs.*` enum passes through unchanged; with no workspace open the
  // literal fallback key applies (`requirementColumnFoldsKey(undefined)`). The two `prefs.*` call sites below use it.
  const requirementsPreferenceKey = (key: PreferenceKey | typeof REQUIREMENT_FOLDS_PREFERENCE_KEY): PreferenceKey =>
    (key === REQUIREMENT_FOLDS_PREFERENCE_KEY ? requirementColumnFoldsKey(foldsWorkspace()) : key);
  // Part AP — the board's run coordinator (REQ-TRACE-463..477): the SYSTEM actor of the `requirements.run.*` family. It claims
  // the scheduler's dispatches from the workspace service, starts each through the run host's `session.start` with the
  // elevation confined to that start (REQ-TRACE-470/471; the residues are stated in `requirements-runs.ts`), records the session
  // id on the run row the moment the host answers (REQ-TRACE-464), settles the row from the host's `run.result` (REQ-TRACE-477),
  // marks a run waiting on a person from its snapshots (REQ-TRACE-466), reaps after the host's exit (REQ-TRACE-476) and cancels
  // the board's runs when the last window closes (REQ-TRACE-464). Channel 10 is broadcast only after the service's committed reply.
  const requirementsRuns = createRequirementsRuns({
    currentWorkspace: () => { const w = activeWindow(); return w?.workspaceId && w.workspace !== '(no workspace)' ? canonicalPath(w.workspace) : undefined; },
    currentWorkspaceId: () => activeWindow()?.workspaceId,
    service: (root, r, bound) => services.get(root)?.link.request(r, bound),
    runHost: { request: (r, bound) => runHost.request(r, bound), onEvent: (fn) => runHost.onEvent(fn) },
    onRunHostExit: (fn) => { runHostChild.on('exit', (code) => fn(code ?? -1)); },
    preferences: { read: (key) => preferences.read(key), write: (key, value) => preferences.write(key, value) },
    mintSessionId: () => randomUUID(),
    broadcast: (payload) => { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.requirementsChanged, payload); },
    log,
  });
  app.on('window-all-closed', () => { void requirementsRuns.cancelAll('the last window closed'); });

  // A3: hoisted out of the builder below — `runCommand` calls this for whichever window opened the persona
  // window, and it closes over nothing per window (the window it measures is its argument).
  /**
   * Verification only: after a show, poll the window for the instant its renderer painted the first frame that carried a
   * whole-session update (`__rotarisPersonaPainted`, set after the snapshot's paint), and log the time from the show request.
   */
  const measurePersonaPaint = (persona: string, dlg: BrowserWindow, shownAt: number): void => {
    if (!capturing) return;
    let done = false;
    const poll = clocks.timers.every(millis(20), () => {
      if (dlg.isDestroyed() || done) { poll.cancel(); return; }
      void dlg.webContents.executeJavaScript('window.__rotarisPersonaPainted ?? null').then((v: unknown) => {
        if (done) return;
        const painted = v as { at: number; seq: number; agents: number } | null;
        if (painted && painted.at >= shownAt - 1) { done = true; poll.cancel(); log(`capture: persona "${persona}" first paint after show: ${Math.round(painted.at - shownAt)} ms (seq ${painted.seq}, ${painted.agents} agents)`); }
        else if (Date.now() - shownAt > 5_000) { done = true; poll.cancel(); log(`capture: persona "${persona}" first paint after show: not observed within 5 s`); }
      }).catch(() => { poll.cancel(); });
    });
  };

  const electronMainWindowAdapter = createElectronMainWindowAdapter({
    createWindow: (options) => new BrowserWindow({
      ...options,
      webPreferences: { ...options.webPreferences, preload: join(__dirname, '../preload/index.cjs') },
    }),
    themeBackground,
    capturing,
    timers: { after: (delayMs, callback) => clocks.timers.after(millis(delayMs), callback) },
    loadMainWindow: async (win) => {
      const rowsProof = capturing && process.env['ROTARIS_ROWS_PROOF'] === '1';
      if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(rowsProof ? `${process.env['ELECTRON_RENDERER_URL']}?role=rows-proof` : process.env['ELECTRON_RENDERER_URL']);
      else await win.loadFile(join(__dirname, '../renderer/index.html'), rowsProof ? { query: { role: 'rows-proof' } } : undefined);
    },
    loadPersonaWindow: async (win, persona) => {
      const query = { role: 'persona', persona };
      if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query).toString()}`);
      else await win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    },
    loadTerminalWindow: async (win) => {
      const query = { role: TERMINAL_WINDOW_ROLE };
      if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query).toString()}`);
      else await win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    },
    relayAttach: (win) => relay.attach({ id: win.webContents.id, send: (channel, payload) => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload); } }),
    relayDetach: (wcId) => { relay.detach(wcId); },
    registerPresenter: (wcId) => {
      parentWindowIds.add(String(wcId));
      void runHost.request({ kind: 'presenter.register', windowId: String(wcId) }, millis(5_000)).catch(() => undefined);
    },
    revokePresenter: (wcId) => {
      parentWindowIds.delete(String(wcId));
      void runHost.request({ kind: 'presenter.revoke', windowId: String(wcId) }, millis(5_000)).catch(() => undefined);
    },
    forgetTerminalFrames: (wcId) => terminalFrames.forget(wcId),
    log,
  });

  mainWindows = new MainWindows({
    adapter: electronMainWindowAdapter,
    timers: { after: (delayMs, callback) => clocks.timers.after(millis(delayMs), callback) },
    currentDirectory: () => canonicalPath(process.cwd()),
    rememberedWorkspace: () => {
      const remembered = preferences.read('workspace/lastOpened');
      return typeof remembered === 'string' && remembered !== '' ? remembered : undefined;
    },
    isDirectory: (path) => { try { return statSync(path).isDirectory(); } catch { return false; } },
    canonicalPath,
    samePath,
    chooseProjectFolder: (win, startAt) => chooseProjectFolder(win, startAt),
    openWorkspace: (workspace) => openWorkspaceInner(workspace),
    closeGuard: (owner) => owner.win.webContents
      .executeJavaScript('typeof window.__rotarisCloseGuard === "function" ? window.__rotarisCloseGuard() : true')
      .then((proceed: unknown) => proceed !== false)
      .catch(() => true),
    activeRunCount: async (workspaceId) => {
      const active = await runHost.request({ kind: 'runs.active', workspaceId }, millis(5_000)).catch(() => null);
      return active?.kind === 'runs.count' ? active.count : null;
    },
    persistWorkspace: (workspace) => preferences.write('workspace/lastOpened', workspace),
    raiseTransient: (windowId, kind, title, body, action) => {
      const owner = windowFor(windowId);
      if (owner) raiseTransient(owner, kind, title, body, action);
    },
    reportFailure: (windowId, title, audience) => {
      const owner = windowFor(windowId);
      if (audience === 'window' && owner) raiseTransient(owner, 'fail', title);
      else raiseNotice('error', title);
    },
    log,
    // REQ-STARTUP-043/114: the update check, initiated from the post-show activation of every main window and nowhere else.
    postShowActivation: (window) => { void updater.activate({ windowId: window.wcId }); },
  });
  /**
   * REQ-SHELL-109: "when a stream changes while the window is closed, the preference is on, and that stream is running,
   * the terminal window opens without taking keyboard focus. The window is never auto-opened for a stream that has
   * already exited." A stream's changes are its `meta` frames (REQ-SHELL-105); the running flag on the frame is what
   * decides, and only the followed session's streams count — a frame of another session's stream is not this window's.
   */
  runHost.onEvent((e) => {
    if (e.kind !== 'publish.terminal' || e.payload.kind !== 'meta' || e.payload.meta?.running !== true) return;
    // A3: the frame belongs to a session, and the window that auto-opens for it is the window watching that
    // session — never "the" main window, which with two open would auto-open a terminal over the wrong project.
    const owner = ownerOf(e.payload.sessionId);
    if (!owner) return;
    if (owner.terminalWindows.isOpen() || e.payload.sessionId !== (owner.terminalWindows.followed() ?? owner.followedSessionId)) return;
    if (preferences.read(TERMINAL_AUTO_OPEN_PREFERENCE) !== true) return;
    log(`terminal window auto-opening for ${e.payload.streamId} (REQ-SHELL-109)`);
    void owner.terminalWindows.open({ automatic: true, streamId: e.payload.streamId }).catch((cause: unknown) => log(`terminal window auto-open failed: ${String(cause)}`));
  });
  /** The five `window.*` commands of the terminal window (contracts `terminal.ts`); dispatched from `runCommand`'s terminal case block. */
  const terminalWindowCommand = async (req: TerminalWindowCommand, senderId: number): Promise<CommandOutcome> => {
    switch (req.kind) {
      case 'window.openTerminal': {
        // REQ-SHELL-080/081/085: open or raise, as a request (REQ-SHELL-161); the stream is brought forward when retained.
        // A3: the asking main window's own terminal window — REQ-SHELL-081 is "exactly one per main window".
        const asking = windowFor(senderId) ?? activeWindow();
        if (!asking) return { ok: false, code: 'window.notMain', headline: 'No main window is open' };
        const r = await asking.terminalWindows.open({ automatic: false, streamId: req.streamId ?? null });
        const value: TerminalWindowOpened = { opened: true, reused: r.reused };
        return { ok: true, value };
      }
      case 'window.terminalPayload': {
        // A3: this command comes FROM the terminal window, so its owner is found through the registries.
        const owner = ownerOfAuxiliary(senderId);
        if (!owner?.terminalWindows.bySender(senderId)) return { ok: false, code: 'window.unknown', headline: 'This window is not the terminal window' };
        const value: TerminalWindowPayload = { sessionId: owner.terminalWindows.followed() ?? owner.followedSessionId, focusStream: owner.terminalWindows.takeFocus(senderId), autoOpen: preferences.read(TERMINAL_AUTO_OPEN_PREFERENCE) === true };
        return { ok: true, value };
      }
      case 'window.terminalSession': {
        // Only the main window follows a session; a terminal or persona window reporting one is refused.
        const reporting = windowFor(senderId);
        if (reporting === undefined) return { ok: false, code: 'window.notMain', headline: 'Only the main window reports the session it follows' };
        const reopened = await reporting.terminalWindows.onSessionChange(req.sessionId);
        return { ok: true, value: { reopened } };
      }
      case 'window.terminalAutoOpen': {
        await preferences.write(TERMINAL_AUTO_OPEN_PREFERENCE, req.value);
        log(`terminal auto-open preference ${req.value ? 'on' : 'off'} (REQ-SHELL-109)`);
        return { ok: true };
      }
      case 'window.showWorkspace': {
        // REQ-SHELL-083's "Go to Workspace": the main window switches to the Workspace view and is surfaced, as a request (REQ-SHELL-161).
        // A3: the command comes FROM a terminal window, so the window to surface is the one that owns it. With two
        // open, "the main window" would raise the other project's window over the one the user asked from.
        const home = ownerOfAuxiliary(senderId) ?? windowFor(senderId) ?? activeWindow();
        if (!home) return { ok: false, code: 'window.notMain', headline: 'No main window is open' };
        void home.win.webContents.executeJavaScript('typeof window.__rotarisShowWorkspace === "function" ? window.__rotarisShowWorkspace() : false').catch(() => undefined);
        if (home.win.isMinimized()) home.win.restore();
        if (!home.win.isVisible()) home.win.show(); else home.win.focus();
        return { ok: true };
      }
    }
  };

  /**
   * Verification seams for an unattended run (only with ROTARIS_CAPTURE_PNG set): the save and open
   * dialogs answer from the environment and every message box is logged with its text and answered from
   * ROTARIS_CAPTURE_ANSWERS in order. A user-driven run never enters these branches.
   */
  const scriptedAnswers = (process.env['ROTARIS_CAPTURE_ANSWERS'] ?? '').split(',').filter((s) => s.length > 0).map(Number);
  /**
   * A3 — every one of these takes the window it is to be shown over. They had all closed over the one main
   * window, which is invisible as a bug until there are two: a modal parented onto the other window blocks a
   * window the user is not looking at, and `REQ-SHELL-164` holds the product answerable for what it hands the
   * host dialog. The parent is the window whose command asked, which `runCommand` now resolves (REQ-SHELL-020).
   *
   * All five use the ASYNCHRONOUS form, which ADR-0019 makes an application-wide prohibition rather than a
   * preference: a `…Sync` dialog on main stops every timer and every IPC reply for as long as it is open,
   * which lapses the presenter registration and silently denies the user's own agent's tool calls.
   */
  const chooseSave = async (parent: BrowserWindow, opts: Electron.SaveDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_BACKUP_TO'] : undefined;
    if (forced) { log(`capture: save dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showSaveDialog(parent, opts);
    return r.canceled || !r.filePath ? null : r.filePath;
  };
  // Part U: ROTARIS_CAPTURE_SAVE_PATH answers the EXPORT save dialogs (REQ-SESSION-189/199) in a scripted launch — a
  // separate seam from the backup's, so a proof can exercise both in one launch; verification only.
  // The seam takes `;;`-separated paths, consumed in order, so one launch can take several exports.
  const scriptedSavePaths = (capturing ? process.env['ROTARIS_CAPTURE_SAVE_PATH'] ?? '' : '').split(';;').map((s) => s.trim()).filter((s) => s !== '');
  const chooseExportPath = async (parent: BrowserWindow, opts: Electron.SaveDialogOptions): Promise<string | null> => {
    const forced = scriptedSavePaths.shift();
    if (forced) { log(`capture: save dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showSaveDialog(parent, opts);
    return r.canceled || !r.filePath ? null : r.filePath;
  };
  const chooseOpen = async (parent: BrowserWindow, opts: Electron.OpenDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_RESTORE_FROM'] : undefined;
    if (forced) { log(`capture: open dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showOpenDialog(parent, opts);
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]!;
  };
  // ROTARIS_CAPTURE_DIRECTORY: the folder chooser's answer for the attach flow (REQ-GIT-158); verification only.
  const chooseDirectory = async (parent: BrowserWindow, opts: Electron.OpenDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_DIRECTORY'] : undefined;
    if (forced) { log(`capture: folder chooser "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showOpenDialog(parent, opts);
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]!;
  };
  /*
   * REQ-WORKSPACE-151 (ADR-0063) — the "Load skill file…" chooser. The product is answerable for what it hands
   * the host (REQ-SHELL-164): the title, the initial location, the restriction, and interpreting every answer
   * the dialog can return; a dismissal by any host-offered means returns no selection and changes nothing.
   *
   * **`openFile` on win32 and linux, both properties on darwin.** The requirement asks for a chooser restricted
   * to "a SKILL.md file **or** a directory containing one", and Electron's two properties are mutually exclusive
   * on those two hosts — only macOS honours both at once. Logged as OQ-59. Nothing the specification states is
   * unreachable: the directory form of REQ-WORKSPACE-057 is still accepted through the typed `/skill <path>`
   * command, which needs no dialog at all.
   *
   * `ROTARIS_CAPTURE_SKILL_FILE` takes `;;`-separated answers consumed in order, so one launch can exercise a
   * selection and a dismissal; the literal `(cancel)` is a dismissal. Verification only.
   */
  const scriptedSkillFiles = (capturing ? process.env['ROTARIS_CAPTURE_SKILL_FILE'] ?? '' : '').split(';;').map((s) => s.trim()).filter((s) => s !== '');
  const chooseSkillFile = async (parent: BrowserWindow, startAt: string): Promise<string | null> => {
    const forced = scriptedSkillFiles.shift();
    if (forced) { log(`capture: skill file chooser → ${forced}`); return forced === '(cancel)' ? null : forced; }
    const r = await dialog.showOpenDialog(parent, {
      title: 'Load a skill file',
      defaultPath: startAt,
      properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'],
      filters: [{ name: 'Skill document', extensions: ['md'] }],
    });
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]!;
  };
  // A3: REQ-GIT-118's "id the launch dialog last showed" is a field of the window record — the dialog belongs
  // to one window, and a second window's launch dialog must not consume the first window's minted id.
  const askBox = async (parent: BrowserWindow, opts: Electron.MessageBoxOptions): Promise<number> => {
    if (capturing && scriptedAnswers.length > 0) {
      const answer = scriptedAnswers.shift()!;
      log(`capture: message box "${opts.title}" | ${opts.message} | ${opts.detail ?? ''} | buttons ${JSON.stringify(opts.buttons)} default ${opts.defaultId} → answered ${answer} (${opts.buttons?.[answer]})`);
      return answer;
    }
    return (await dialog.showMessageBox(parent, opts)).response;
  };

  /**
   * Stage B — REQ-NOTIFY-013 / REQ-SHELL-112: a transient belongs to ONE window's stack, so it is sent to that
   * window's renderer rather than through `relay.broadcast`. The store's broadcast is right for a PERSISTENT
   * notice (ADR-0049 makes that one per process), but a reminder about a chooser THIS window showed, or the
   * decline of a request this window raised, must not appear over another project's window.
   *
   * ADR-0052's per-channel counter is kept honest through `relay.count`, which exists for exactly this case — a
   * delivery made outside `relaySequenced` and `broadcast`, as `main/terminal.ts` does for channel 3.
   */
  const raiseTransient = (w: MainWindowState, kind: 'info' | 'ok' | 'warn' | 'fail', title: string, body?: string, action?: AcknowledgementAction): void => {
    if (w.win.isDestroyed()) return;
    relay.count(CHANNEL.acknowledgementPublish);
    w.win.webContents.send(CHANNEL.acknowledgementPublish, { v: CONTRACT_SCHEMA_VERSION, kind, title, ...(body === undefined ? {} : { body }), ...(action === undefined ? {} : { action }) });
  };

  /**
   * REQ-WORKSPACE-009 / REQ-SHELL-011: the platform's own folder chooser, titled "Open a project folder",
   * restricted to directories, pointed at the current workspace or else the user's home directory.
   *
   * ADR-0019's prohibition applies here as everywhere — the ASYNCHRONOUS form only. REQ-SHELL-164 fixes what the
   * product is answerable for (the title, the restriction to directories, the initial location, and the reading of
   * every answer the dialog can return) and makes a dismissal by ANY means the host offers — Cancel, Escape, the
   * window close control, a platform gesture — the identical answer, which `showOpenDialog` reports as `canceled`.
   *
   * What comes back is CANONICAL (REQ-STARTUP-163's rule, through `canonicalPath`): every later comparison and the
   * stored preference must be the resolved form, never the spelling the host dialog happened to hand back.
   */
  const chooseProjectFolder = createElectronProjectFolderChooser({
    forcedAnswers: __ROTARIS_SEAMS__ ? process.env['ROTARIS_CAPTURE_PROJECT_FOLDER'] : undefined,
    homeDirectory: homedir,
    canonicalPath,
    showOpenDialog: (parent, options) => dialog.showOpenDialog(parent, options),
    log,
  });

  /**
   * REQ-SESSION-201's restore, as main conducts it: every question before anything is changed, cancel the
   * default everywhere, and the work in the workspace service. ADR-0058's identifier cases and ESC-26's
   * confirmation; D9's foreign rows as one condition with the risk stated.
   */
  const restoreFlow = async (w: MainWindowState): Promise<CommandOutcome> => {
    if (!w.workspaceId || w.workspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before restoring its session store' };
    const root = canonicalPath(w.workspace);
    const svc = services.get(root);
    if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
    // REQ-SESSION-201 / REQ-SHELL-021's gate: refused while a run is active; the service's liveness gates hold it for the whole restore.
    const active = await runHost.request({ kind: 'runs.active', workspaceId: w.workspaceId }, millis(5_000));
    if (active.kind === 'runs.count' && active.count > 0) return { ok: false, code: 'run.active', headline: 'Finish the active run before restoring the session store.' };
    const artifact = await chooseOpen(w.win, { title: 'Restore a session store backup', properties: ['openFile'], filters: [{ name: 'Rotaris session store backup', extensions: ['tar'] }] });
    if (!artifact) return { ok: true, value: { cancelled: true } };
    const assessed = await svc.link.request({ kind: 'workspace.restore.assess', workspaceRoot: root, artifact }, millis(120_000));
    if (assessed.kind !== 'workspace.restore.assessment') return refusal(assessed, 'The backup could not be assessed');
    const a = assessed.assessment;
    if (a.refusal) { raiseNotice('error', 'The restore was refused', a.refusal.detail); return { ok: false, code: `restore.${a.refusal.why}`, headline: 'The restore was refused', detail: a.refusal.detail }; }
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const cancel = (): CommandOutcome => ({ ok: true, value: { cancelled: true } });

    // 1 — which workspace, when, and what it does to the store that is there now. Cancel is the default.
    const from = a.artifact.lastSeenWorkspacePath ?? a.artifact.workspaceId;
    const nowText = a.target.exists
      ? `The store this backup restores into currently holds ${plural(a.target.sessions, 'session')}. Restoring replaces it: those sessions are moved aside and kept (never deleted), and the backup's ${plural(a.artifact.sessions, 'session')} take their place. A session here and absent from the backup will no longer be listed; one in the backup and absent here will appear.`
      : `No store exists here for this backup's workspace yet; restoring creates it with the backup's ${plural(a.artifact.sessions, 'session')}.`;
    const first = await askBox(w.win, {
      type: 'question', title: 'Restore the session store', message: `This backup was taken from ${from} on ${a.artifact.takenAtUtc}.`, detail: nowText,
      buttons: ['Cancel', 'Restore'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (first !== 1) return cancel();

    // 2 — the identifier (ADR-0058 case (c), ESC-26): both values named, the consequence stated, cancel the default.
    let identifier: 'workspace' | 'artifact-store' | 'establish' = a.identifier.case === 'same' ? 'workspace' : 'establish';
    if (a.identifier.case === 'different') {
      const mine = a.identifier.current ?? '';
      const theirs = a.artifact.workspaceId;
      const second = await askBox(w.win, {
        type: 'warning', title: 'This workspace carries a different identifier',
        message: `This workspace's identifier is ${mine}. The backup was taken under ${theirs}.`,
        detail: `Restore into the backup's own store: the sessions are restored under ${theirs}, this workspace keeps ${mine}, and they will not appear here until a workspace carrying ${theirs} is opened.\n\nReplace this workspace's identifier with ${theirs} and restore: this workspace's existing sessions, recorded under ${mine}, become unreachable from this workspace. The store under ${mine} is kept intact; writing ${mine} back into .rotaris/workspace-id is a complete undo.`,
        buttons: ['Cancel', "Restore into the backup's own store", 'Replace the identifier and restore'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (second === 0) return cancel();
      identifier = second === 1 ? 'artifact-store' : 'establish';
    }

    // 3 — D9 / IC-4: lock rows naming another machine, together, with the risk stated. Cancel is the default.
    let proceedWithForeignLocks = false;
    if (a.target.foreignLocks.length > 0) {
      const third = await askBox(w.win, {
        type: 'warning', title: 'Lock records name another machine',
        message: `${plural(a.target.foreignLocks.length, 'session')} in the store carry lock records naming another machine: ${a.target.foreignLocks.join(', ')}.`,
        detail: 'Nothing on this machine is writing under them. If this store genuinely is reachable from another machine, a run there may be writing to it now, and the restore replaces what it writes. Nothing needs to be cleared one at a time.',
        buttons: ['Cancel', 'Restore anyway'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (third !== 1) return cancel();
      proceedWithForeignLocks = true;
    }

    const done = await svc.link.request({ kind: 'workspace.restore.perform', workspaceRoot: root, artifact, decisions: { identifier, proceedWithForeignLocks } }, millis(600_000));
    if (done.kind !== 'workspace.restored') return refusal(done, 'The restore could not be performed');
    const rep = done.report;
    if (rep.ok) {
      // The workspace now resolves as the restore left it; hand the run host the store again (W-18).
      await openWorkspace(root, w);
      raiseNotice('info', `Restored ${plural(a.artifact.sessions, 'session')} from the backup taken on ${a.artifact.takenAtUtc}.${rep.identifierEstablished ? ' This workspace now carries the backup\'s identifier.' : ''}${rep.displaced ? ` The previous store was kept at ${rep.displaced}.` : ''}`);
      return { ok: true, value: { restoredInto: rep.restoredInto, identifierEstablished: rep.identifierEstablished } };
    }
    const why = rep.refusal
      ? rep.refusal.why === 'sessions-live' ? `A session became live before the restore could finish (${rep.refusal.sessions.join(', ')}); nothing was changed.`
        : rep.refusal.why === 'ack-timeout' ? `The run host did not answer within ${rep.refusal.boundMs} ms at step ${rep.refusal.step}; nothing was changed.`
          : `Lock records name another machine (${rep.refusal.sessions.join(', ')}); nothing was changed.`
      : rep.error ?? 'The restore did not complete.';
    raiseNotice('error', 'The restore was not performed', why);
    await openWorkspace(root, w);
    return { ok: false, code: rep.refusal ? `restore.${rep.refusal.why}` : 'restore.failed', headline: 'The restore was not performed', detail: why };
  };

  /**
   * ADR-0039's desktop flow (REQ-GIT-091..100), conducted here: the rows and the liveness verdict from the run host, the
   * Git from the workspace service, the outcome recorded through the run host. ONE desktop checkpoint operation is in
   * flight at a time (REQ-GIT-091) — a second is declined with code `checkpoint.busy` and the renderer shows the toast
   * or retries a listing once after 150 ms (REQ-GIT-095). Every refusal is a returned value (REQ-GIT-052).
   */

  /**
   * A4 — the inventory `main()` hands the command facets (`./commands/`). It was the closure this
   * function was written inside; naming it is what lets a facet declare the slice it needs and a test
   * stand in for the rest. Nothing is copied: every member is the same object main itself holds.
   */
  /** REQ-GIT-101: written by the checkpoint commands, read by the quit path below and by nothing else. */
  const checkpointOp: { current: Promise<unknown> | null } = { current: null };
  const commandContext: CommandContext = {
    log, clocks, capturing, layout, processes,
    runHost, services, relay,
    mainWindows, windowFor, ownerOfAuxiliary, dialogs, dialogPayloads,
    pauseWindows, pausePayloads, presentPause, reviewPayloads,
    measurePersonaPaint, terminalWindowCommand, surface,
    notices, raiseNotice, raiseNoticeKeyed, recoveryFor, announceRepairs, updater,
    providers, healthCache, providerPayloads, providerChoices, providerRows, presentProvider, afterProviderChange,
    preferences, currentTheme: () => currentTheme, setTheme: (name) => (currentTheme = resolveTheme(name)), themeBackground, requirementsPreferenceKey,
    initialization, libraryRevision, requirementsRuns, improvementUndo, improvementRuns,
    enqueueImprovement: (job) => improvementCoordinator.enqueue(job),
    chooseSave, chooseExportPath, chooseDirectory, chooseSkillFile,
    openHookReview, restoreFlow, checkpointOp,
  };
  /**
   * Every command this product answers, filed under its kind. `CommandHandlers` is total over
   * `CommandRequest['kind']`, so a kind added to the contract and to no facet fails to compile here —
   * which is the stop `04-seams.md` §1 names, and is why this table has no `default`.
   */
  const handlers: CommandHandlers = {
    ...checkpointsCommands(commandContext),
    ...configCommands(commandContext),
    ...dialogsCommands(commandContext),
    ...gitCommands(commandContext),
    ...hooksCommands(commandContext),
    ...improvementsCommands(commandContext),
    ...initializationCommands(commandContext),
    ...libraryCommands(commandContext),
    ...mcpCommands(commandContext),
    ...providersCommands(commandContext),
    ...requirementsCommands(commandContext),
    ...sessionCommands(commandContext),
    ...shellCommands(commandContext),
    ...skillsCommands(commandContext),
    ...updateCommands(commandContext),
    ...windowCommands(commandContext),
    ...windowsCommands(commandContext),
    ...workspaceCommands(commandContext),
  };
  const runCommand = async (raw: unknown, senderId = activeWindow()?.wcId ?? -1): Promise<CommandOutcome> => {
    /**
     * A2 — REQ-SHELL-020: a command is answered for the window that RAISED it, so every workspace-scoped read
     * below resolves against the sender rather than against "the main window". A sender that is not a main
     * window at all (an approval dialog, a persona or terminal window asking for its own payload) falls back to
     * the active window, which while the capacity is one is the same object either way.
     *
     * A3: the default sender is the ACTIVE window's id (ADR-0055 c.5) — a verification seam and the driver speak
     * for no window, and what they mean is the window the user is looking at. It has to be a real id and not a
     * sentinel, because a subscription is keyed by the sender (Part R's twenty-seventh defect, noted below at
     * `session.follow`). With no main window open at all the command is refused rather than answered for a
     * window that is gone.
     */
    const w = windowFor(senderId) ?? activeWindow();
    if (!w) return { ok: false, code: 'window.notMain', headline: 'No main window is open' };
    const parsed = CommandRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'command.malformed', headline: 'The request could not be read' };
    const req = parsed.data;
    const awaitWorkspace = () => mainWindows.awaitWorkspace(w.wcId);
    /**
     * A4: the handler the table above names, called with the request narrowed to its own kind. The cast is
     * the one place that narrowing is asserted rather than proved — `handlers[req.kind]` is a union of
     * handlers, and TypeScript cannot pair it with `req` unaided. It is sound because `CommandHandlers` is
     * total over the contract's kinds: every entry answers the kind it is filed under, and a kind with no
     * entry does not compile. Nothing throws out of here (ADR-0019) — a handler that does is caught below.
     */
    const handler = handlers[req.kind] as CommandHandler<CommandRequest['kind']>;
    return handler(req, { w, senderId, awaitWorkspace });
  };
  ipcMain.handle(CHANNEL.command, (e, raw) => runCommand(raw, e.sender.id));

  /**
   * A3: the one call today. REQ-SHELL-010's resolution — the remembered folder, the working directory and the
   * deferred chooser — is Stage B's; until then a launch either carries a folder or the window opens on the
   * sentinel, which is the interval ADR-0055 requires to exist at all because the first paint precedes the
   * workspace read.
   */
  /**
   * Stage B — REQ-SHELL-010's resolution, evaluated BEFORE the window is built, because a window is built for a
   * workspace and its first paint happens on that workspace. The `'(no workspace)'` sentinel leaves the ordinary
   * paths entirely: (a), (b) and (c) all resolve to a real folder, and the sentinel now stands only for a window
   * built with none at all, which ADR-0055 still requires to be a state the shell can render.
   */
  const mainWin = await mainWindows.launch(argvWorkspace);
  /**
   * The verification seams at the end of this function drive the FIRST main window on purpose — a capture is a
   * photograph of one window — so they go on reading `win`. A proof that wants the second window addresses it
   * through the driver seam (`useWindow`), and every product path resolves its own window.
   */
  const win = mainWin.win;

  surface = (h) => { void mainWindows.handOver(h).catch((cause) => log(`hand-over failed: ${String(cause)}`, 'error')); };
  for (const h of pendingHandOvers.splice(0)) surface(h);

  /**
   * The driver seam (verification only). `ROTARIS_DRIVER=<path>` starts a loopback listener and writes the port
   * and this launch's secret to that path; with the variable unset nothing listens and nothing is written.
   *
   * It sits OUTSIDE the `ROTARIS_CAPTURE_PNG` block on purpose: the capture seams are a scripted launch that
   * ends in a photograph, and this is the opposite — a window that stays up and answers questions. A proof may
   * use both, and `pnpm app:drive` uses only this one.
   */
  // The same shape as the theme proof's read above: behind the flag, so a packaged bundle holds neither the
  // listener, nor `driver.ts` at all, nor the name of the variable that would have started it.
  const driverEndpoint = __ROTARIS_SEAMS__ ? process.env['ROTARIS_DRIVER'] : undefined;
  if (driverEndpoint) {
    const driver = startDriver(driverEndpoint, {
      /**
       * A4: the seam addresses a window instead of assuming there is one. `which` is an index into the
       * most-recently-focused ordering, or a suffix of a window's workspace path so a proof can say which
       * project it means; absent is the active window, which is what every proof written before two windows
       * existed already meant. A selector that matches nothing returns null and the driver refuses.
       */
      window: (which) => {
        const ordered = orderedMainWindows();
        const picked = which === undefined
          ? activeWindow()
          : /^\d+$/.test(which)
            ? ordered[Number(which)]
            : ordered.find((candidate) => candidate.workspace.toLowerCase().endsWith(which.toLowerCase()));
        return picked && !picked.win.isDestroyed() ? picked.win : null;
      },
      windows: () => orderedMainWindows().map((candidate, index) => ({ index, workspace: candidate.workspace, wcId: candidate.wcId })),
      timers: clocks.timers,
      monotonic: clocks.monotonic,
      log,
      command: (request, selectedWindow) => runCommand(request, selectedWindow.webContents.id),
      deferProjectOffer: (selectedWindow, delayMs) => mainWindows.deferProjectOffer(selectedWindow.webContents.id, delayMs),
      quit: () => exitCleanly(0),
    });
    app.on('will-quit', () => driver.close());
  }

  /**
   * A verification hook for the walking skeleton and the release gate's first-paint check
   * (REQ-STARTUP-156): capture the painted window to a file and exit. Not a user-facing surface.
   *
   * The script, its grammar and the packaging gate that keeps the scriptable half out of a shipped
   * build are `./capture/`; `capture/host.ts` states what each member below is for and which module
   * may name which environment variable. Main's part is to say what the capture may reach.
   */
  await runCapture({
    win,
    personaWindows: mainWin.personaWindows,
    followedSessionId: () => mainWin.followedSessionId,
    clocks,
    log,
    command: (request) => runCommand(request),
    notices,
    libraryRevision,
    runHost,
    themeName: () => currentTheme.name,
    resultSeen: () => resultSeen,
    exit: (code) => { exitCleanly(code); },
  });

  app.on('window-all-closed', () => {
    // ADR-0014: quit is main-driven, run-host-executed. The skeleton asks and waits, bounded.
    improvementCoordinator.shutdown();
    void (async () => {
      // REQ-STARTUP-046 / REQ-SHELL-121: an update check, download or install still in flight is waited for at most
      // 5000 ms; past that the download is abandoned and its partial file discarded, and the close completes.
      await updater.quiesce(millis(5_000));
      // REQ-GIT-101: a desktop checkpoint operation in flight finishes first — bounded only by REQ-GIT-033's limits.
      if (checkpointOp.current) { log('quit: waiting for the in-flight checkpoint operation (REQ-GIT-101)'); await checkpointOp.current.catch(() => undefined); }
      // PD-MONITOR-002: each `shutdown` is raced against its child's own exit (`shutdownAtQuit`, `exit.ts`). A child that
      // exits has ended, whether or not its answer arrived; one still running when the bound elapses is said at `error`,
      // and the quit goes on. Electron then tears it down, and its exit — when it is reported before main is gone — reads
      // 0, so this line is the only record that the work was cut off.
      await shutdownAtQuit(() => runHost.request({ kind: 'shutdown', deadlineMs: 30_000 }, millis(30_000)), runHostExit, (cause) => { log(`quit: the run host did not complete its shutdown (${String(cause)}); its in-flight runs may be lost`, 'error'); });
      // REQ-GIT-101 again, one process down: each workspace service finishes its in-flight checkpoint Git before it exits.
      await Promise.all([...services].map(([key, s]) => shutdownAtQuit(() => s.link.request({ kind: 'shutdown', deadlineMs: 30_000 }, millis(330_000)), s.exit, (cause) => { log(`quit: the workspace service for ${key} did not complete its shutdown (${String(cause)}); its in-flight work may be lost`, 'error'); })));
      app.quit();
    })();
  });
}

void main();
