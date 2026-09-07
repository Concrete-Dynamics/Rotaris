// ADR-0035 (Part T): the pre-bootstrap branch is the FIRST import and must never be reordered — with the reserved token
// first on the command line it hands the process to the bundled runtime and exits before anything below is evaluated.
import './sentinel.js';
import { PersonaWindows } from './windows.js';
import { createNoticeStore } from './notices.js';
import { createLibraryRevision } from './library.js';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, screen, shell, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { millis, toIsoUtc } from '@rotaris/kernel';
import { CHANNEL, CHECKPOINT_BUSY_TOAST, CHECKPOINTS_NO_WORKSPACE, CHECKPOINTS_STORE_UNREADABLE, CommandRequestSchema, CONTRACT_SCHEMA_VERSION, LIVE_RUN_REFUSAL, LIVENESS_UNKNOWN_REFUSAL, oklchToSrgb, parseOklch, resolveTheme, restoredNoticeBody, restoreSummary, srgbToHex, type Theme, type HooksSummary, type ApprovalPayload, type PausePayload, type CheckpointListPayload, type CheckpointPreviewPayload, type CheckpointRestoreOutcomePayload, type CommandOutcome, type NoticeAction, type NoticeSeverity, type ProviderDialogPayload, type ProviderHealthPayload, type ProviderRow, type ProviderSignInResult, type ProcessKind, type ProcessReply, type RunHostRequest, type WorkspaceServiceRequest, type WorktreeBinding } from '@rotaris/contracts';
import { claimInstance, dataLayout, nodeClocks, readOrMintMachineId, resolveUserDirs, canonicalPath, PreferenceStore, resolvePreferenceRoot, type HandOver } from '@rotaris/platform';
import { ProcessLink, UpdateRelay, type MessagePortLike } from '@rotaris/shell';
import { CATALOGUE, createProtector, CredentialStore, destinationHint, METHOD_LABELS, ProjectSettingsStore, ProviderService, validateCatalog } from '@rotaris/providers';
import { PROJECT_SETTINGS_FILE } from '@rotaris/config';

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
const dirs = resolveUserDirs();
const layout = dataLayout(dirs);
mkdirSync(dirs.data, { recursive: true });
const machineId = readOrMintMachineId(layout.machineId);

// ADR-0028: the catalogue's integrity is checked at process start as well as in the build's test (REQ-PROVIDER-003).
const catalogue = validateCatalog();
if (!catalogue.ok) throw new Error(`the provider catalogue is invalid: ${catalogue.error.join('; ')}`);

const log = (m: string) => console.log(`[main ${new Date().toISOString()}] ${m}`);
// ADR-0019's prohibition, from the other side: an uncaught exception in main would raise the platform's native
// error box — a synchronous modal that blocks the loop and every poll reply. Log it instead; nothing here may hang.
process.on('uncaughtException', (e) => { log(`UNCAUGHT in main: ${e.stack ?? String(e)}`); });

function workspaceFromArgv(argv: readonly string[]): string | undefined {
  // REQ-STARTUP-163: a directory the OS hands a launch. The product defines no argument vocabulary
  // of its own (P-13); a bare path is what a file manager passes.
  const candidate = argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-'));
  return candidate ? canonicalPath(candidate) : undefined;
}

function refusal(r: ProcessReply, headline: string): CommandOutcome {
  const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
  return { ok: false, code: r.kind === 'refused' ? r.code : 'reply.unexpected', headline, detail };
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

  const argvWorkspace = workspaceFromArgv(process.argv);
  const claim = await claimInstance(
    {
      recordFile: layout.instanceRecord, endpointDir: dirs.data, machineId, pid: process.pid,
      wall: clocks.wall, timers: clocks.timers, handOverIntervalMs: millis(5_000),
      onHandOver: (h) => { if (surface) surface(h); else pendingHandOvers.push(h); },
    },
    argvWorkspace ? { workspace: argvWorkspace } : {},
  );

  if (claim.outcome === 'handed-over') {
    // REQ-STARTUP-162: show nothing, write nothing, end.
    app.exit(0);
    return;
  }
  if (claim.outcome === 'refused') {
    console.error(`[main] launch refused: ${claim.reason}`);
    app.exit(2);
    return;
  }
  log(`instance claimed (pid ${process.pid}, host ${machineId})`);
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

  // ADR-0029/0030: the credential store and the provider service live HERE, in main; the run host is leased bearers.
  const lockDeps = { pid: process.pid, startedAt: toIsoUtc(clocks.wall.instant()), timers: clocks.timers, monotonic: clocks.monotonic };
  const random = () => Math.random().toString(36).slice(2, 10);
  const credentials = new CredentialStore({ dir: layout.tokens, protector: createProtector({ scratchDir: dirs.data }), lock: lockDeps, random, warn: (m) => log(`credentials: ${m}`), info: (m) => log(`credentials: ${m}`) });
  const projectSettings = new ProjectSettingsStore({ path: join(dirs.config, PROJECT_SETTINGS_FILE), lock: lockDeps, timers: clocks.timers, warn: (m) => log(`project settings: ${m}`) });
  const providers = new ProviderService({ credentials, settings: projectSettings, wall: clocks.wall, log: (m) => log(`providers: ${m}`), warn: (m) => log(`providers: ${m}`) });

  // ADR-0002: one run host for the application's lifetime; one workspace service per open workspace.
  const runHostChild = utilityProcess.fork(join(__dirname, 'run-host.js'), [], { serviceName: 'rotaris-run-host' });
  const runHost = new ProcessLink<RunHostRequest>(portOf(runHostChild), clocks.timers);
  // ADR-0030: the run host's one ask — the bearers for the providers a run names. Never logged.
  // ADR-0039 / ADR-0002 c.4: the run host's three checkpoint asks are relayed to the workspace service of that root and answered back.
  runHost.onAsk(async (a) => {
    // Part U: `checkpoint.deleteNamespace` is the delete's ref cleanup (REQ-SESSION-166 step 2), relayed like the other three.
    if (a.kind === 'checkpoint.capture' || a.kind === 'checkpoint.refs' || a.kind === 'checkpoint.prune' || a.kind === 'checkpoint.deleteNamespace') {
      const svc = services.get(canonicalPath(a.workspaceRoot));
      if (!svc) return { kind: 'refused', code: 'workspace.none', headline: `no workspace service is running for ${a.workspaceRoot}` };
      return svc.link.request(a, millis(a.kind === 'checkpoint.capture' ? 320_000 : 60_000));
    }
    if (a.kind !== 'credentials.lease') return { kind: 'refused', code: 'ask.unhandled', headline: `main does not answer ${a.kind} from the run host` };
    const { bearers, report } = providers.lease(a.providerIds);
    log(`credentials leased: ${report.authenticated.join(', ') || 'none'}${Object.keys(report.unresolved).length > 0 ? `; unresolved ${Object.entries(report.unresolved).map(([id, why]) => `${id} (${why})`).join(', ')}` : ''}`);
    return { kind: 'credentials.leased', bearers, report: { authenticated: [...report.authenticated], renewed: [...report.renewed], unresolved: { ...report.unresolved } } };
  });
  runHostChild.on('exit', (code) => log(`run host exited (${code}); NOT re-forked — every in-flight run is lost and settles through stale detection (ADR-0002)`));

  const services = new Map<string, { child: UtilityProcess; link: ProcessLink<WorkspaceServiceRequest> }>();
  let currentWorkspaceId: string | undefined;
  // The window paints BEFORE the workspace opens (REQ-STARTUP-156's first paint comes first), so a view's start-time
  // read — the Overview's session list and repository read (REQ-GIT-102: "beginning after the window has first been
  // drawn") — arrives while no workspace is open yet. Found on the Overview's first execution (ADR-0055 note): those
  // reads wait, bounded, for the open in flight instead of being refused with "no workspace".
  let workspaceReady: Promise<unknown> = Promise.resolve();
  const awaitWorkspace = () => Promise.race([workspaceReady, new Promise<void>((r) => clocks.timers.after(millis(30_000), r))]);
  const openWorkspace = async (root: string): Promise<{ workspaceId: string; storeFile: string } | undefined> => {
    const opening = openWorkspaceInner(root);
    workspaceReady = opening.catch(() => undefined);
    return opening;
  };
  const openWorkspaceInner = async (root: string): Promise<{ workspaceId: string; storeFile: string } | undefined> => {
    const key = canonicalPath(root);
    let svc = services.get(key);
    if (!svc) {
      const child = utilityProcess.fork(join(__dirname, 'workspace-service.js'), [], { serviceName: `rotaris-workspace:${key}` });
      svc = { child, link: new ProcessLink<WorkspaceServiceRequest>(portOf(child), clocks.timers) };
      services.set(key, svc);
      child.on('exit', (code) => { log(`workspace service for ${key} exited (${code})`); services.delete(key); });
      // The service's log lines reach main's log too (Part P: the checkpoint capture, preview and restore lines the proof reads).
      svc.link.onEvent((e) => { if (e.kind === 'log') log(`workspace service ${e.level}: ${e.message}`); });
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
    if (ack.kind === 'workspace.ack') currentWorkspaceId = opened.workspaceId;
    // REQ-NOTIFY-224 / REQ-SHELL-016: the unreviewed-hooks notice is raised after the window exists, never a dialog by itself.
    if (ack.kind === 'workspace.ack') {
      clocks.timers.after(millis(process.env['ROTARIS_CAPTURE_RESUME'] ? 1_800 : 800), () => {
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
  log(`run host: ${JSON.stringify(rhHello)}`);

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
      const workspaceId = currentWorkspaceId;
      if (workspaceId === null || workspaceId === undefined) return false;
      // REQ-SESSION-134: the entry's severity is the record's own column. The notice vocabulary of REQ-NOTIFY-023 is
      // not the timeline's (it carries `success`, which no timeline entry may), so it is mapped rather than passed
      // through; only `warning` and `error` notices are recorded at all (REQ-NOTIFY-268), and the map is total anyway.
      const severity = entry.severity === 'error' ? 'error' : entry.severity === 'warning' ? 'warning' : 'info';
      const r = await runHost.request({ kind: 'timeline.append', workspaceId, sessionId: entry.sessionId, name: 'notice', actor: 'system', message: entry.title, severity, metadata: { notice_id: entry.noticeId, severity: entry.severity, message: entry.message, detail: entry.detail } }, millis(5_000)).catch(() => null);
      return r?.kind === 'timeline.appended';
    },
    log,
    focusedSession: () => followedSessionId,
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
  type Recovery = { label: string; action: NoticeAction }[];
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
  const recoveryFor = (action: string | undefined, workspace?: string): Recovery =>
    action === 'hooks.review'
      ? (workspace === undefined || workspace === '' || workspace === '(no workspace)' ? [] : [{ label: 'Review hooks', action: { kind: 'open-hook-review', workspace } }])
      : action === 'hooks.settings' ? [{ label: 'Open hook settings', action: { kind: 'open-settings', category: 'hooks' } }]
        : action === 'config.models' ? [{ label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } }]
          : action === 'providers.add' ? [{ label: 'Add a provider', action: { kind: 'open-provider-sign-in' } }]
            : [];
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
      log(`pause dialog could not be shown: ${String(cause)}`);
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
      // ROTARIS_CAPTURE_PROVIDER_FILL="label>>url": the proof fills the two visible fields; the key is the owner's to paste (verification only).
      const fill = process.env['ROTARIS_CAPTURE_PNG'] ? process.env['ROTARIS_CAPTURE_PROVIDER_FILL'] : undefined;
      if (fill) {
        const [label, url] = fill.split('>>');
        clocks.timers.after(millis(600), () => {
          void dlg.webContents.executeJavaScript(`(() => { const set = (id, v) => { const el = document.getElementById(id); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; }; return [set('provider-label', ${JSON.stringify(label ?? '')}), set('provider-url', ${JSON.stringify(url ?? '')})]; })()`)
            .then((r) => log(`capture: provider dialog filled ${JSON.stringify(r)}; waiting for the key to be pasted and Authenticate pressed`)).catch((e) => log(`capture: provider fill failed: ${String(e)}`));
        });
      }
    } catch (cause) {
      log(`provider dialog could not be shown: ${String(cause)}`);
    }
  };
  /** After any change to the credential store or the snapshot: the workspace's starter file if absent, the load again, every window told. */
  const afterProviderChange = async (): Promise<void> => {
    if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return;
    const svc = services.get(canonicalPath(currentWorkspace));
    if (!svc) return;
    const r = await svc.link.request({ kind: 'config.bootstrap', workspaceRoot: canonicalPath(currentWorkspace) }, millis(30_000)).catch(() => null);
    if (r?.kind === 'config.snapshot') for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.configChanged, { v: CONTRACT_SCHEMA_VERSION, snapshot: r.snapshot });
    // ADR-0037 Tier B: the run host's next load folds the snapshot itself; nothing to hand over.
    if (notices.current()?.title === NO_PROVIDER_HEADLINE && providers.list().some((row) => row.authenticated)) void notices.dismiss(notices.current()?.id);
  };
  const queue: ApprovalPayload[] = [];
  let openDialog: { requestId: string; win: BrowserWindow; answered: boolean } | null = null;
  const parentWindowIds = new Set<string>();
  const presentNext = async (): Promise<void> => {
    if (openDialog || queue.length === 0) return;
    queue.sort((a, b) => a.sequence - b.sequence);
    const payload = queue.shift()!;
    const parent = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !dialogs.has(w.webContents.id));
    if (!parent) { await runHost.request({ kind: 'approval.shown', requestId: payload.request_id, ok: false, error: 'no main window is open' }, millis(5_000)).catch(() => undefined); return; }
    const dlg = new BrowserWindow({
      parent, modal: true, width: 560, height: 380, minWidth: 560, minHeight: 380, show: false, title: 'Permission required', backgroundColor: themeBackground(),
      resizable: true, minimizable: false, maximizable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const entry = { requestId: payload.request_id, win: dlg, answered: false };
    openDialog = entry;
    // Read once, up front: `webContents` on a destroyed window throws, and a throw from a `closed` handler is an
    // uncaught exception that raises the platform's native error box and wedges main (found on first execution).
    const dlgWcId = dlg.webContents.id;
    dialogs.set(dlgWcId, entry);
    dialogPayloads.set(dlgWcId, { payload, othersWaiting: queue.length });
    dlg.setMenuBarVisibility(false);
    dlg.on('closed', () => {
      dialogs.delete(dlgWcId);
      dialogPayloads.delete(dlgWcId);
      if (openDialog === entry) openDialog = null;
      // REQ-TOOLS-063: closing the window answers Deny; a request already answered or cancelled asks nothing more.
      if (!entry.answered) void runHost.request({ kind: 'session.control', request: { op: 'answerApproval', sessionId: payload.session_id, args: { requestId: payload.request_id, option: 'deny' } } }, millis(5_000)).catch(() => undefined);
      clocks.timers.after(millis(50), () => { void presentNext(); });
    });
    try {
      if (process.env['ELECTRON_RENDERER_URL']) await dlg.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?role=approval`);
      else await dlg.loadFile(join(__dirname, '../renderer/index.html'), { query: { role: 'approval' } });
      dlg.show();
      dlg.focus();
      await runHost.request({ kind: 'approval.shown', requestId: payload.request_id, ok: true }, millis(5_000));
      log(`approval ${payload.request_id} presented (${payload.tool_name}, rule ${payload.rule_id}); ${queue.length} waiting`);
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
      log(`approval ${payload.request_id} could not be presented: ${String(cause)}`);
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
    if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reviewing its hooks' };
    const r = await runHost.request({ kind: 'hooks.summary', workspaceId: currentWorkspaceId }, millis(10_000));
    if (r.kind !== 'hooks.summary') return refusal(r, 'The hooks could not be read');
    if (r.summary.declaredCount === 0) return { ok: false, code: 'hooks.none', headline: 'This workspace declares no hooks' };
    const parent = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !dialogs.has(w.webContents.id) && !reviewPayloads.has(w.webContents.id));
    const dlg = new BrowserWindow({
      ...(parent ? { parent, modal: true } : {}), width: 720, height: 520, minWidth: 620, minHeight: 440, show: false, title: "Review this workspace's hooks", backgroundColor: themeBackground(),
      resizable: true, minimizable: false, maximizable: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const wc = dlg.webContents.id;
    const workspaceId = currentWorkspaceId;
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
      log(`the hook review could not be opened: ${String(cause)}`);
      entry.decided = true;
      if (!dlg.isDestroyed()) dlg.close();
      return { ok: false, code: 'hooks.review', headline: 'The review dialog could not be opened', detail: String(cause) };
    }
  };

  // ADR-0044: main RELAYS a publication unchanged; the number on it is the run host's.
  runHost.onEvent((e) => {
    if (e.kind === 'publish.increment') relay.relaySequenced(CHANNEL.transcriptIncrement, e.payload);
    else if (e.kind === 'publish.snapshot') relay.relaySequenced(CHANNEL.sessionSnapshot, e.payload);
    else if (e.kind === 'presenter.poll') {
      // ADR-0019: the reply carries the windows main holds; answered at once, never from a blocked loop.
      void runHost.request({ kind: 'presenter.pollReply', seq: e.seq, windows: [...parentWindowIds] }, millis(5_000)).catch(() => undefined);
    }
    else if (e.kind === 'approval.present') { queue.push(e.payload); void presentNext(); }
    else if (e.kind === 'approval.close') {
      // Answered or cancelled elsewhere: the open dialog closes without asking again; a queued one is dropped unshown.
      const idx = queue.findIndex((p) => p.request_id === e.requestId);
      if (idx >= 0) queue.splice(idx, 1);
      if (openDialog && openDialog.requestId === e.requestId) { openDialog.answered = true; if (!openDialog.win.isDestroyed()) openDialog.win.close(); }
    }
    else if (e.kind === 'notice.publish') {
      // REQ-NOTIFY-028: the run host names the session its notice concerns, so a notice about one run survives the
      // start of another (REQ-NOTIFY-029). No timer clears anything here any more: REQ-NOTIFY-040 allows a notice to
      // leave only by replacement, a run-start clear, or the user's dismissal.
      void notices.report({
        severity: e.severity, title: e.title, message: e.message, detail: e.detail, persistent: e.persistent, sessionId: e.sessionId,
        ...(e.key === undefined ? {} : { key: e.key }),
        ...(recoveryFor(e.action, currentWorkspace).length === 0 ? {} : { action: recoveryFor(e.action, currentWorkspace)[0]! }),
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
      // REQ-SESSION-186 / REQ-NOTIFY-003: the terminal outcome, presented once, at the severity summarisation assigned.
      const sev = e.result.severity === 'error' ? 'error' : e.result.severity === 'warning' ? 'warning' : 'info';
      // REQ-NOTIFY-060/063/093 (Part Q): a run ended by a rate-limit or quota condition — the wait cancelled, or the ladder out of
      // recoveries — is the third class: the provider limit was reached, the session is preserved, another model or a retry once
      // the provider resets, the failure text as detail, the action opening model settings. (REQ-NOTIFY-062's hosted-credit
      // branch is not built: no hosted provider exists.) The authentication and sandbox classes ahead of it are not built either.
      if (e.result.error !== null && /rate.?limit|quota|429|too many requests/i.test(e.result.error)) {
        raiseNotice('error', 'The provider limit was reached; the session is preserved', `${e.result.error}\n\nChoose another model, or retry once the provider resets.`, recoveryFor('config.models'));
      } else {
        raiseNotice(sev, e.result.summary, e.result.error ?? undefined);
      }
      resultSeen = true;
      log(`run ${e.sessionId} ended ${e.result.status} (${e.result.stop_reason}) → ${e.result.execution_status}`);
    }
    else if (e.kind === 'log') log(`run host ${e.level}: ${e.message}`);
  });
  const processes: ProcessKind[] = ['run-host'];
  let currentWorkspace = argvWorkspace ?? '(no workspace)';

  const win = new BrowserWindow({
    width: 1280, height: 820, show: false, backgroundColor: themeBackground(), title: 'Rotaris',
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  // The id is read once, up front: `webContents` on a destroyed window throws, and a throw from a
  // `closed` handler during exit is an uncaught exception, which wedges the process (ADR-0044 note).
  const wcId = win.webContents.id;
  // Verification only: an occluded window stops painting, and a capture then returns a frame older than the DOM the
  // probes read (found on the Git proof's first execution: the PNG showed the split before the drag the probes saw).
  if (capturing) win.webContents.setBackgroundThrottling(false);
  relay.attach({ id: wcId, send: (c, p) => { if (!win.isDestroyed()) win.webContents.send(c, p); } });
  // ADR-0019 c.1: registration is explicit and prompt — on creation, and revoked on close (the last one closing makes the application unattended).
  parentWindowIds.add(String(wcId));
  void runHost.request({ kind: 'presenter.register', windowId: String(wcId) }, millis(5_000)).catch(() => undefined);
  win.on('closed', () => {
    relay.detach(wcId);
    parentWindowIds.delete(String(wcId));
    void runHost.request({ kind: 'presenter.revoke', windowId: String(wcId) }, millis(5_000)).catch(() => undefined);
    // REQ-SHELL-078: the persona windows are owned by this main window and do not outlive it.
    personaWindows.destroyAll('the main window closed');
  });
  /** The session the main window follows — what a persona window is opened onto (REQ-SHELL-072; Part R). */
  let followedSessionId: string | null = null;
  /**
   * ADR-0048's window registry, first executed (Part R): the persona windows — one per persona, hide on close, destroyed
   * with the main window and on a new session. A persona window is a full renderer of the one bundle (`role=persona`),
   * attached to the relay like the main window; it subscribes and unsubscribes itself as it is shown and hidden.
   */
  const personaWindows = new PersonaWindows({
    create: (persona) => {
      const dlg = new BrowserWindow({
        width: 820, height: 620, minWidth: 560, minHeight: 420, show: false, title: `Rotaris · ${persona}`, backgroundColor: themeBackground(),
        webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      dlg.setMenuBarVisibility(false);
      // Verification only (the same reason as the main window's): an occluded window stops painting, and a capture would lag the DOM.
      if (capturing) dlg.webContents.setBackgroundThrottling(false);
      return dlg;
    },
    load: async (dlg, persona) => {
      const query = { role: 'persona', persona };
      if (process.env['ELECTRON_RENDERER_URL']) await dlg.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?${new URLSearchParams(query).toString()}`);
      else await dlg.loadFile(join(__dirname, '../renderer/index.html'), { query });
    },
    select: (dlg, agentId, focusSteer) => dlg.webContents.executeJavaScript(`typeof window.__rotarisPersonaSelect === 'function' ? window.__rotarisPersonaSelect(${JSON.stringify(agentId)}, ${focusSteer ? 'true' : 'false'}) : false`).then(() => undefined),
    onCreated: (dlg, persona) => {
      const id = dlg.webContents.id;
      relay.attach({ id, send: (c, payload) => { if (!dlg.isDestroyed()) dlg.webContents.send(c, payload); } });
      if (capturing) dlg.webContents.on('console-message', (_event, level, message, line, sourceId) => { if (level >= 2) log(`capture: persona "${persona}" renderer console: ${message} (${sourceId}:${line})`); });
    },
    onDestroyed: (id) => { relay.detach(id); },
    log,
  });
  // ADR-0048 (Part W): a modal surface cannot outlive the renderer that opened it — a navigation, a reload or a crash of the
  // main window's renderer restores input to every persona window (the close destroys them, REQ-SHELL-078).
  const releaseModality = (why: string) => { if (personaWindows.isFamilyModal()) { const n = personaWindows.setFamilyModal(false); log(`application modality released: ${why} (${n} persona window(s) enabled; ADR-0048)`); } };
  win.webContents.on('did-start-navigation', (details) => { if (details.isMainFrame) releaseModality('the main window navigated'); });
  win.webContents.on('render-process-gone', (_event, details) => releaseModality(`the main window's renderer is gone (${details.reason})`));
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

  /**
   * Verification seams for an unattended run (only with ROTARIS_CAPTURE_PNG set): the save and open
   * dialogs answer from the environment and every message box is logged with its text and answered from
   * ROTARIS_CAPTURE_ANSWERS in order. A user-driven run never enters these branches.
   */
  const scriptedAnswers = (process.env['ROTARIS_CAPTURE_ANSWERS'] ?? '').split(',').filter((s) => s.length > 0).map(Number);
  const chooseSave = async (opts: Electron.SaveDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_BACKUP_TO'] : undefined;
    if (forced) { log(`capture: save dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showSaveDialog(win, opts);
    return r.canceled || !r.filePath ? null : r.filePath;
  };
  // Part U: ROTARIS_CAPTURE_SAVE_PATH answers the EXPORT save dialogs (REQ-SESSION-189/199) in a scripted launch — a
  // separate seam from the backup's, so a proof can exercise both in one launch; verification only.
  // The seam takes `;;`-separated paths, consumed in order, so one launch can take several exports.
  const scriptedSavePaths = (capturing ? process.env['ROTARIS_CAPTURE_SAVE_PATH'] ?? '' : '').split(';;').map((s) => s.trim()).filter((s) => s !== '');
  const chooseExportPath = async (opts: Electron.SaveDialogOptions): Promise<string | null> => {
    const forced = scriptedSavePaths.shift();
    if (forced) { log(`capture: save dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showSaveDialog(win, opts);
    return r.canceled || !r.filePath ? null : r.filePath;
  };
  const chooseOpen = async (opts: Electron.OpenDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_RESTORE_FROM'] : undefined;
    if (forced) { log(`capture: open dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showOpenDialog(win, opts);
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]!;
  };
  // ROTARIS_CAPTURE_DIRECTORY: the folder chooser's answer for the attach flow (REQ-GIT-158); verification only.
  const chooseDirectory = async (opts: Electron.OpenDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_DIRECTORY'] : undefined;
    if (forced) { log(`capture: folder chooser "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showOpenDialog(win, opts);
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]!;
  };
  // REQ-GIT-118: the id the launch dialog last showed; consumed by the next isolated or attached start.
  let mintedSessionId: string | null = null;
  const askBox = async (opts: Electron.MessageBoxOptions): Promise<number> => {
    if (capturing && scriptedAnswers.length > 0) {
      const answer = scriptedAnswers.shift()!;
      log(`capture: message box "${opts.title}" | ${opts.message} | ${opts.detail ?? ''} | buttons ${JSON.stringify(opts.buttons)} default ${opts.defaultId} → answered ${answer} (${opts.buttons?.[answer]})`);
      return answer;
    }
    return (await dialog.showMessageBox(win, opts)).response;
  };

  /**
   * REQ-SESSION-201's restore, as main conducts it: every question before anything is changed, cancel the
   * default everywhere, and the work in the workspace service. ADR-0058's identifier cases and ESC-26's
   * confirmation; D9's foreign rows as one condition with the risk stated.
   */
  const restoreFlow = async (): Promise<CommandOutcome> => {
    if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before restoring its session store' };
    const root = canonicalPath(currentWorkspace);
    const svc = services.get(root);
    if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
    // REQ-SESSION-201 / REQ-SHELL-021's gate: refused while a run is active; the service's liveness gates hold it for the whole restore.
    const active = await runHost.request({ kind: 'runs.active', workspaceId: currentWorkspaceId }, millis(5_000));
    if (active.kind === 'runs.count' && active.count > 0) return { ok: false, code: 'run.active', headline: 'Finish the active run before restoring the session store.' };
    const artifact = await chooseOpen({ title: 'Restore a session store backup', properties: ['openFile'], filters: [{ name: 'Rotaris session store backup', extensions: ['tar'] }] });
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
    const first = await askBox({
      type: 'question', title: 'Restore the session store', message: `This backup was taken from ${from} on ${a.artifact.takenAtUtc}.`, detail: nowText,
      buttons: ['Cancel', 'Restore'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (first !== 1) return cancel();

    // 2 — the identifier (ADR-0058 case (c), ESC-26): both values named, the consequence stated, cancel the default.
    let identifier: 'workspace' | 'artifact-store' | 'establish' = a.identifier.case === 'same' ? 'workspace' : 'establish';
    if (a.identifier.case === 'different') {
      const mine = a.identifier.current ?? '';
      const theirs = a.artifact.workspaceId;
      const second = await askBox({
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
      const third = await askBox({
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
      await openWorkspace(root);
      raiseNotice('info', `Restored ${plural(a.artifact.sessions, 'session')} from the backup taken on ${a.artifact.takenAtUtc}.${rep.identifierEstablished ? ' This workspace now carries the backup\'s identifier.' : ''}${rep.displaced ? ` The previous store was kept at ${rep.displaced}.` : ''}`);
      return { ok: true, value: { restoredInto: rep.restoredInto, identifierEstablished: rep.identifierEstablished } };
    }
    const why = rep.refusal
      ? rep.refusal.why === 'sessions-live' ? `A session became live before the restore could finish (${rep.refusal.sessions.join(', ')}); nothing was changed.`
        : rep.refusal.why === 'ack-timeout' ? `The run host did not answer within ${rep.refusal.boundMs} ms at step ${rep.refusal.step}; nothing was changed.`
          : `Lock records name another machine (${rep.refusal.sessions.join(', ')}); nothing was changed.`
      : rep.error ?? 'The restore did not complete.';
    raiseNotice('error', 'The restore was not performed', why);
    await openWorkspace(root);
    return { ok: false, code: rep.refusal ? `restore.${rep.refusal.why}` : 'restore.failed', headline: 'The restore was not performed', detail: why };
  };

  /**
   * ADR-0039's desktop flow (REQ-GIT-091..100), conducted here: the rows and the liveness verdict from the run host, the
   * Git from the workspace service, the outcome recorded through the run host. ONE desktop checkpoint operation is in
   * flight at a time (REQ-GIT-091) — a second is declined with code `checkpoint.busy` and the renderer shows the toast
   * or retries a listing once after 150 ms (REQ-GIT-095). Every refusal is a returned value (REQ-GIT-052).
   */
  let checkpointOp: Promise<unknown> | null = null;
  const checkpointGate = (fn: () => Promise<CommandOutcome>): Promise<CommandOutcome> => {
    if (checkpointOp) return Promise.resolve({ ok: false, code: 'checkpoint.busy', headline: CHECKPOINT_BUSY_TOAST });
    const p = fn().finally(() => { if (checkpointOp === p) checkpointOp = null; });
    checkpointOp = p;
    return p;
  };
  const checkpointContext = async (): Promise<{ workspaceId: string; root: string; svc: { link: ProcessLink<WorkspaceServiceRequest> } } | CommandOutcome> => {
    await awaitWorkspace();
    if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'checkpoint.no-workspace', headline: CHECKPOINTS_NO_WORKSPACE };
    const root = canonicalPath(currentWorkspace);
    const svc = services.get(root);
    if (!svc) return { ok: false, code: 'checkpoint.no-workspace', headline: CHECKPOINTS_NO_WORKSPACE };
    return { workspaceId: currentWorkspaceId, root, svc };
  };
  const readListing = async (workspaceId: string, sessionId: string): Promise<CheckpointListPayload | CommandOutcome> => {
    const r = await runHost.request({ kind: 'checkpoint.list', workspaceId, sessionId }, millis(15_000));
    if (r.kind !== 'checkpoint.list') {
      if (r.kind === 'refused' && r.code === 'checkpoint.no-session') return { ok: false, code: r.code, headline: r.headline };
      // REQ-GIT-095: a store that cannot be read is an empty listing behind the error dialog.
      return { ok: false, code: 'checkpoint.store', headline: "Could not read this session's checkpoints", detail: r.kind === 'refused' ? `${CHECKPOINTS_STORE_UNREADABLE} (${r.headline})` : CHECKPOINTS_STORE_UNREADABLE };
    }
    // REQ-GIT-094: the repair is announced as a warning notice.
    if (r.listing.repaired) {
      raiseNotice('warning', 'Session marked interrupted', `This session was still marked '${r.listing.repaired.previous}', but ${r.listing.repaired.reason}. Rotaris marked it interrupted, so its checkpoints can be restored again.`);
      log(`notice: Session marked interrupted (${sessionId}: was '${r.listing.repaired.previous}', ${r.listing.repaired.reason})`);
    }
    return r.listing;
  };
  const isOutcome = (x: unknown): x is CommandOutcome => typeof x === 'object' && x !== null && 'ok' in x;
  /** REQ-GIT-092: stamped on every listing and checked before every preview and restore; a broken check never enables a restore. */
  const livenessRefusal = (l: CheckpointListPayload): string | null => (l.liveness === 'live' ? LIVE_RUN_REFUSAL : l.liveness === 'unknown' ? LIVENESS_UNKNOWN_REFUSAL : null);
  /** REQ-GIT-056: the 10 most recent recorded plus the last restored when outside them, newest first. */
  const driftCandidates = (l: CheckpointListPayload): { sequence: number; commit: string }[] => {
    const newest = [...l.rows].sort((a, b) => b.sequence - a.sequence).slice(0, 10);
    const last = l.lastRestoredSequence === null ? undefined : l.rows.find((r) => r.sequence === l.lastRestoredSequence);
    if (last && !newest.some((r) => r.sequence === last.sequence)) newest.push(last);
    return newest.map((r) => ({ sequence: r.sequence, commit: r.commit }));
  };
  const previewOf = async (ctx: { workspaceId: string; root: string; svc: { link: ProcessLink<WorkspaceServiceRequest> } }, l: CheckpointListPayload, sequence: number) => {
    const row = l.rows.find((r) => r.sequence === sequence);
    if (!row) return null;
    const started = clocks.monotonic.now();
    const r = await ctx.svc.link.request({ kind: 'checkpoint.preview', workspaceRoot: ctx.root, treeRoot: l.treeRoot, sessionId: l.sessionId, sequence, commit: row.commit, candidates: driftCandidates(l), includeUntracked: l.includeUntracked }, millis(320_000));
    if (r.kind !== 'checkpoint.previewed') return { row, treeState: 'inspect-failed' as const, entries: [], dirty: [], blockedReason: `Git could not inspect checkpoint ${sequence}: ${r.kind === 'refused' ? r.headline : `unexpected answer ${r.kind}`}`, text: `Git could not inspect checkpoint ${sequence}: ${r.kind === 'refused' ? r.headline : `unexpected answer ${r.kind}`}`, invocations: 0, elapsedMs: 0 };
    log(`checkpoint preview ${l.sessionId}/${sequence}: ${r.treeState}, ${r.entries.length} entr${r.entries.length === 1 ? 'y' : 'ies'}, ${r.dirty.length} dirty; ${r.invocations} git invocations, ${r.elapsedMs} ms in the service, ${Math.round(clocks.monotonic.now() - started)} ms end to end`);
    return { row, ...r };
  };
  const checkpointPreview = async (sessionId: string, sequence: number): Promise<CommandOutcome> => {
    const ctx = await checkpointContext();
    if (isOutcome(ctx)) return ctx;
    const l = await readListing(ctx.workspaceId, sessionId);
    if (isOutcome(l)) return l;
    if (l.unavailable) return { ok: false, code: 'checkpoint.unavailable', headline: l.unavailable };
    const live = livenessRefusal(l);
    if (live) return { ok: false, code: 'checkpoint.live', headline: live };
    const p = await previewOf(ctx, l, sequence);
    if (p === null) return { ok: false, code: 'checkpoint.unrecorded', headline: `Checkpoint ${sequence} is no longer recorded for this session.` };
    const value: CheckpointPreviewPayload = { sessionId, sequence, treeRoot: l.treeRoot, entries: p.entries, dirty: p.dirty, blockedReason: p.blockedReason, text: p.text, summary: restoreSummary(sequence, p.entries.length, l.treeRoot), restorable: p.treeState === 'ok' };
    return { ok: true, value };
  };
  const checkpointRestore = async (sessionId: string, sequence: number, force: boolean): Promise<CommandOutcome> => {
    const ctx = await checkpointContext();
    if (isOutcome(ctx)) return ctx;
    const l = await readListing(ctx.workspaceId, sessionId);
    if (isOutcome(l)) return l;
    const outcome = (o: Omit<CheckpointRestoreOutcomePayload, 'sequence'>): CommandOutcome => ({ ok: true, value: { sequence, ...o } satisfies CheckpointRestoreOutcomePayload });
    if (l.unavailable) return outcome({ restored: false, safetySequence: null, changedPaths: 0, blockedReason: l.unavailable });
    const live = livenessRefusal(l);
    if (live) return outcome({ restored: false, safetySequence: null, changedPaths: 0, blockedReason: live });
    const started = clocks.monotonic.now();
    const row = l.rows.find((r) => r.sequence === sequence) ?? null;
    // REQ-GIT-058/062: every refusal at a gate is recorded on the session; the record never raises here.
    const record = async (o: { restored: boolean; safetySequence: number | null; changedPaths: number; blockedReason: string; dirtyPaths: readonly string[] }) => {
      const r = await runHost.request({ kind: 'checkpoint.recordRestore', workspaceId: ctx.workspaceId, sessionId, sequence, restored: o.restored, safetySequence: o.safetySequence, changedPaths: o.changedPaths, blockedReason: o.blockedReason, forced: force, treeRoot: l.treeRoot, dirtyPaths: [...o.dirtyPaths], ref: row?.ref ?? null, commit: row?.commit ?? null }, millis(15_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
      if (r.kind !== 'ack') log(`checkpoint restore ${sessionId}/${sequence}: the outcome could not be recorded (${r.kind === 'refused' ? r.headline : r.kind})`);
    };
    const refuse = async (blockedReason: string, safetySequence: number | null = null, dirtyPaths: readonly string[] = []) => {
      await record({ restored: false, safetySequence, changedPaths: 0, blockedReason, dirtyPaths });
      log(`checkpoint restore ${sessionId}/${sequence} refused: ${blockedReason}`);
      return outcome({ restored: false, safetySequence, changedPaths: 0, blockedReason });
    };
    // Gate 1.
    if (!row) return refuse(`No checkpoint ${sequence} is recorded for session ${sessionId}.`);
    // Gates 2 and 3 — the preview again, fresh (the tree may have moved since the dialog was shown).
    const p = await previewOf(ctx, l, sequence);
    if (p === null) return refuse(`No checkpoint ${sequence} is recorded for session ${sessionId}.`);
    if (p.treeState !== 'ok') return refuse(p.blockedReason);
    // Gate 4 — force bypasses this gate only.
    if (p.dirty.length > 0 && !force) return refuse(p.blockedReason, null, p.dirty);
    // Gate 5 — the safety checkpoint, untracked always included, numbered from both sources (REQ-GIT-059); it MUST succeed.
    let safetySequence: number | null = null;
    const refs = await ctx.svc.link.request({ kind: 'checkpoint.refs', workspaceRoot: ctx.root, treeRoot: l.treeRoot, sessionId }, millis(60_000)).catch(() => null);
    const fromRefs = refs?.kind === 'checkpoint.refs' && refs.ok ? refs.entries.reduce((m, e) => Math.max(m, e.sequence), 0) : 0;
    const safety = Math.max(fromRefs, ...l.rows.map((r) => r.sequence), 0) + 1;
    const captured = await ctx.svc.link.request({ kind: 'checkpoint.capture', workspaceRoot: ctx.root, treeRoot: l.treeRoot, sessionId, sequence: safety, iteration: 0, childName: '', checkpointKind: 'pre_restore', includeUntracked: true, message: `rotaris pre-restore checkpoint ${safety} for session ${sessionId} (before restoring checkpoint ${sequence})` }, millis(320_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
    if (captured.kind !== 'checkpoint.captured') return refuse(`Could not record a safety checkpoint before the restore: ${captured.kind === 'refused' ? captured.headline : `unexpected answer ${captured.kind}`}`, null, p.dirty);
    if (captured.outcome === 'failed' || captured.outcome === 'unavailable') return refuse(`Could not record a safety checkpoint before the restore: ${captured.detail ?? 'Git declined'}`, null, p.dirty);
    if (captured.outcome === 'recorded') {
      const persisted = await runHost.request({ kind: 'checkpoint.recordSafety', workspaceId: ctx.workspaceId, sessionId, sequence: safety, ref: captured.ref ?? '', commit: captured.commit ?? '', files: captured.files ?? [] }, millis(60_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
      if (persisted.kind !== 'checkpoint.recorded') return refuse(`Could not persist the safety checkpoint on the session: ${persisted.kind === 'refused' ? persisted.headline : `unexpected answer ${persisted.kind}`}`, null, p.dirty);
      safetySequence = safety;
      log(`checkpoint restore ${sessionId}/${sequence}: safety checkpoint ${safety} recorded over ${captured.files?.length ?? 0} file(s) (${captured.invocations} git invocations, ${captured.elapsedMs} ms)`);
    } else log(`checkpoint restore ${sessionId}/${sequence}: no safety checkpoint needed — the tree already matches the last commit`);
    // Gate 6 — the restore itself; a failure still reports the safety checkpoint, the sole surviving copy of the tree.
    const restored = await ctx.svc.link.request({ kind: 'checkpoint.restore', workspaceRoot: ctx.root, treeRoot: l.treeRoot, sessionId, sequence, commit: row.commit, entries: p.entries }, millis(320_000)).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
    if (restored.kind !== 'checkpoint.restored') return refuse(`Git could not restore checkpoint ${sequence}: ${restored.kind === 'refused' ? restored.headline : `unexpected answer ${restored.kind}`}`, safetySequence, p.dirty);
    if (!restored.ok) return refuse(`Git could not restore checkpoint ${sequence}: ${restored.detail ?? 'Git declined'}`, safetySequence, p.dirty);
    // Gate 7 — success: the record (last_restored_sequence, the timeline entry, the event) and the persistent notice (REQ-GIT-100).
    await record({ restored: true, safetySequence, changedPaths: restored.touched.length, blockedReason: '', dirtyPaths: p.dirty });
    raiseNotice('info', `Restored checkpoint ${sequence}`, restoredNoticeBody(restored.touched.length, safetySequence));
    log(`checkpoint restore ${sessionId}/${sequence}: restored ${restored.touched.length} file(s) in ${l.treeRoot}, safety ${safetySequence ?? 'none'}${force ? ', forced' : ''}; ${restored.invocations} git invocations, ${restored.elapsedMs} ms in the service, ${Math.round(clocks.monotonic.now() - started)} ms end to end`);
    return outcome({ restored: true, safetySequence, changedPaths: restored.touched.length, blockedReason: '' });
  };

  const runCommand = async (raw: unknown, senderId = wcId): Promise<CommandOutcome> => {
    const parsed = CommandRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'command.malformed', headline: 'The request could not be read' };
    const req = parsed.data;
    switch (req.kind) {
      case 'approval.payload': {
        const p = dialogPayloads.get(senderId);
        return p ? { ok: true, value: p } : { ok: false, code: 'approval.none', headline: 'This window was not opened for an approval' };
      }
      case 'pause.payload': {
        const p = pausePayloads.get(senderId);
        return p ? { ok: true, value: p } : { ok: false, code: 'pause.none', headline: 'This window was not opened for a pause' };
      }
      case 'pause.present':
        void presentPause(req.payload);
        return { ok: true };
      case 'providers.list':
        return { ok: true, value: providerRows() };
      case 'providers.health': {
        healthCache.set(req.id, { state: 'checking', detail: '', available: true });
        const h = await providers.health(req.id);
        healthCache.set(req.id, h);
        if (h.state === 'healthy') void afterProviderChange();
        return { ok: true, value: h };
      }
      case 'providers.open':
        void presentProvider(req.mode, req.providerId ?? null);
        return { ok: true };
      case 'provider.payload': {
        const p = providerPayloads.get(senderId);
        if (!p) return { ok: false, code: 'provider.none', headline: 'This window was not opened for a provider sign-in' };
        const payload: ProviderDialogPayload = { mode: p.mode, providerId: p.providerId, displayName: p.providerId ? providers.displayName(p.providerId) : null, choices: providerChoices() };
        return { ok: true, value: payload };
      }
      case 'provider.signIn': {
        // The pasted key comes in here and goes to the store or nowhere; it is never logged (REQ-PROVIDER-131).
        const outcome: ProviderSignInResult = req.providerId === 'openai-compatible'
          ? await providers.addInstance({ label: req.label ?? '', baseUrl: req.baseUrl ?? '', apiKey: req.apiKey, ...(req.replace ? { replace: true } : {}), ...(req.allowEmpty ? { allowEmpty: true } : {}) })
          : await providers.signInWithKey(req.providerId, req.apiKey, req.allowEmpty ?? false);
        if (outcome.outcome === 'signed-in') {
          // A catalog that answers without a key validated nothing (REQ-PROVIDER-133's gap on a public catalog): health stays unchecked and the notice warns.
          healthCache.set(outcome.id, outcome.keyValidated ? { state: 'healthy', detail: outcome.message, available: true } : { state: 'unknown', detail: outcome.message, available: true });
          raiseNotice(outcome.keyValidated ? 'info' : 'warning', outcome.message, 'Model slots were assigned from the discovered catalog; review them under Settings → Models.', recoveryFor('config.models'));
          await afterProviderChange();
        } else if (outcome.outcome === 'failed') {
          log(`providers: sign-in failed for ${req.providerId}: ${outcome.message}`);
        }
        return { ok: true, value: outcome };
      }
      case 'providers.save': {
        let message = '';
        if (req.baseUrl !== null) { const r = await providers.setBaseUrl(req.id, req.baseUrl); if (!r.ok) return { ok: true, value: { ok: false, message: r.error } }; message = r.value; }
        if (req.apiKey.trim() !== '') { const r = await providers.replaceKey(req.id, req.apiKey, req.validate); if (!r.ok) return { ok: true, value: { ok: false, message: r.error } }; message = r.value; }
        else if (req.baseUrl === null && !providers.status(req.id).startsWith('auth')) return { ok: true, value: { ok: false, message: `A key is required for ${providers.displayName(req.id)}.` } };
        if (message === '') message = 'Nothing changed.';
        else { healthCache.delete(req.id); await afterProviderChange(); }
        return { ok: true, value: { ok: true, message: `Saved. ${message}` } };
      }
      case 'providers.validate': {
        const r = await providers.validate(req.id);
        if (r.ok) { healthCache.set(req.id, { state: 'healthy', detail: r.value, available: true }); await afterProviderChange(); }
        else healthCache.delete(req.id);
        return { ok: true, value: r.ok ? { ok: true, message: r.value } : { ok: false, message: r.error } };
      }
      case 'providers.signOut': {
        const r = await providers.signOut(req.id);
        healthCache.delete(req.id);
        log(`providers: ${r.message}`);
        await afterProviderChange();
        return { ok: true, value: { ok: r.outcome === 'signed-out' || r.outcome === 'nothing', message: r.message } };
      }
      case 'providers.delete': {
        const r = await providers.deleteInstance(req.id);
        healthCache.delete(req.id);
        if (r.ok) { log(`providers: ${r.value.message}`); await afterProviderChange(); }
        return { ok: true, value: r.ok ? { ok: true, message: r.value.message } : { ok: false, message: r.error } };
      }
      case 'providers.refresh': {
        const lines: string[] = [];
        const summary = await providers.refresh(req.ids, (l) => { lines.push(l); log(`providers: ${l}`); });
        await afterProviderChange();
        return { ok: true, value: { ok: summary.complete, message: lines[lines.length - 1] ?? '' } };
      }
      case 'session.continue': {
        const r = await runHost.request({ kind: 'session.continue', sessionId: req.sessionId, action: req.action }, millis(10_000));
        if (r.kind !== 'session.continued') { if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail); return refusal(r, 'The session could not be continued'); }
        const open = pauseWindows.get(req.sessionId);
        if (open && !open.isDestroyed()) open.close();
        log(`session ${req.sessionId} ${req.action}: ${r.resumed ? 'continued' : 'left paused'}`);
        return { ok: true, value: { resumed: r.resumed, messageLimit: r.messageLimit } };
      }
      case 'hooks.summary': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace to see its hooks' };
        const r = await runHost.request({ kind: 'hooks.summary', workspaceId: currentWorkspaceId, ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }) }, millis(10_000));
        return r.kind === 'hooks.summary' ? { ok: true, value: r.summary } : refusal(r, 'The hooks could not be read');
      }
      case 'hooks.review':
        return openHookReview();
      case 'playbooks.catalogue': {
        const r = await runHost.request({ kind: 'playbooks.catalogue' }, millis(10_000));
        return r.kind === 'playbooks.catalogue' ? { ok: true, value: r.catalogue } : refusal(r, 'The playbook catalogue could not be read');
      }
      case 'hooks.reviewPayload': {
        const p = reviewPayloads.get(senderId);
        return p ? { ok: true, value: { workspace: p.workspace, entries: p.entries } } : { ok: false, code: 'hooks.review.none', headline: 'This window was not opened for a hook review' };
      }
      case 'hooks.reviewDecide': {
        const p = reviewPayloads.get(senderId);
        if (!p || p.decided) return { ok: false, code: 'hooks.review.none', headline: 'No review is open for this window' };
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'The workspace is no longer open' };
        const r = await runHost.request({ kind: 'hooks.decide', workspaceId: currentWorkspaceId, trusted: req.trusted }, millis(10_000));
        if (r.kind !== 'ack') return refusal(r, 'The decision could not be saved');
        p.decided = true;
        log(`hook review → ${req.trusted ? 'allowed' : 'refused'}`);
        clocks.timers.after(millis(50), () => { if (!p.win.isDestroyed()) p.win.close(); });
        return { ok: true };
      }
      case 'hooks.clearDecision': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
        const r = await runHost.request({ kind: 'hooks.clearDecision', workspaceId: currentWorkspaceId }, millis(10_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The stored decision could not be removed');
      }
      case 'hooks.setToggle': {
        const r = await runHost.request({ kind: 'hooks.setToggle', agent: req.agent, hookId: req.hookId, on: req.on }, millis(10_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The hook policy could not be saved');
      }
      // ADR-0034 (Part S): the MCP category is answered by the run host, the one holder of the pipeline, the probe and the session override.
      case 'mcp.list': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
        const r = await runHost.request({ kind: 'mcp.list', workspaceId: currentWorkspaceId }, millis(10_000));
        return r.kind === 'mcp.list' ? { ok: true, value: r.listing } : refusal(r, 'The MCP servers could not be listed');
      }
      case 'mcp.probe': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
        const r = await runHost.request({ kind: 'mcp.probe', workspaceId: currentWorkspaceId, ...(req.name === undefined ? {} : { name: req.name }) }, millis(req.name === undefined ? 120_000 : 12_000));
        return r.kind === 'mcp.probe' ? { ok: true, value: r.results } : refusal(r, 'The MCP server could not be probed');
      }
      case 'mcp.setEnabled': {
        const r = await runHost.request({ kind: 'mcp.setEnabled', name: req.name, enabled: req.enabled }, millis(10_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session toggle could not be applied');
      }
      case 'mcp.secrets': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
        const r = await runHost.request({ kind: 'mcp.secrets', workspaceId: currentWorkspaceId, ...(req.server === undefined ? {} : { server: req.server }) }, millis(10_000));
        return r.kind === 'mcp.secrets' ? { ok: true, value: r.view } : refusal(r, 'The stored secrets could not be read');
      }
      // ADR-0035 (Part T) / REQ-MCP-099/112: the code-intelligence project setup runs in the run host; main relays the action and the status.
      case 'mcp.setup': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
        const r = await runHost.request({ kind: 'mcp.setup', workspaceId: currentWorkspaceId, action: req.action }, millis(15_000));
        return r.kind === 'mcp.setup' ? { ok: true, value: r.status } : refusal(r, 'The code-intelligence setup could not be started');
      }
      case 'shell.hello': {
        const cb = currentWorkspaceId
          ? await runHost.request({ kind: 'circuit_breaker.status', workspaceId: currentWorkspaceId }, millis(5_000))
          : { kind: 'circuit_breaker.status' as const, enabled: process.env['ROTARIS_CIRCUIT_BREAKER'] !== 'off' };
        return { ok: true, value: { version: app.getVersion(), workspace: currentWorkspace, processes: [...processes, ...services.keys()].map((p) => `svc:${p}`), circuitBreakerArmed: cb.kind === 'circuit_breaker.status' && cb.enabled } };
      }
      /**
       * Part AA — REQ-CHAT-076: an `http(s)` link in transcript text opens in the SYSTEM BROWSER, the opening is
       * acknowledged and a failure is reported rather than passing silently. The renderer is sandboxed and never
       * navigates (ADR-0051); main is the only process that hands a URL to the platform.
       *
       * **The scheme is checked here and nowhere else.** Transcript text is model-authored, so a `file:`,
       * `javascript:` or shell-registered scheme reaching `shell.openExternal` would run at the reader's expense
       * on their machine. Only `http:` and `https:` are opened; everything else, and anything that is not a URL
       * at all, is refused with the target named.
       */
      case 'shell.openExternal': {
        let parsed: URL;
        try { parsed = new URL(req.url); }
        catch { return { ok: false, code: 'link.unreadable', headline: 'That link could not be opened', detail: `“${req.url}” is not a web address.` }; }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { ok: false, code: 'link.scheme', headline: 'That link could not be opened', detail: `Only http and https links open in the browser; this one is “${parsed.protocol.replace(':', '')}”.` };
        }
        // Verification seam (only with ROTARIS_CAPTURE_PNG): `record` opens nothing and reports success, `fail`
        // reports the platform refusal, so both halves of the requirement are exercised without launching a browser.
        const scripted = capturing ? process.env['ROTARIS_CAPTURE_OPEN_EXTERNAL'] : undefined;
        if (scripted === 'fail') { log(`capture: open-external REFUSED ${parsed.href}`); return { ok: false, code: 'link.failed', headline: 'That link could not be opened', detail: 'The system browser refused to open it (scripted).' }; }
        if (scripted === 'record') { log(`capture: open-external ${parsed.href}`); return { ok: true, value: { url: parsed.href } }; }
        try { await shell.openExternal(parsed.href); }
        catch (cause) { return { ok: false, code: 'link.failed', headline: 'That link could not be opened', detail: cause instanceof Error ? cause.message : String(cause) }; }
        log(`opened externally: ${parsed.href}`);
        return { ok: true, value: { url: parsed.href } };
      }
      case 'theme.get':
        return { ok: true, value: { name: currentTheme.name } };
      case 'theme.set': {
        currentTheme = resolveTheme(req.name);
        preferences.writeThemeSync(currentTheme.name);
        nativeTheme.themeSource = currentTheme.dark ? 'dark' : 'light';
        const background = themeBackground();
        for (const window of BrowserWindow.getAllWindows()) {
          if (window.isDestroyed()) continue;
          window.setBackgroundColor(background);
          window.webContents.send(CHANNEL.themeChanged, { v: CONTRACT_SCHEMA_VERSION, name: currentTheme.name });
        }
        log(`theme applied ${currentTheme.name} to every live window`);
        return { ok: true, value: { name: currentTheme.name } };
      }
      case 'prefs.get':
        return { ok: true, value: { value: preferences.read(req.key) } };
      case 'prefs.set': {
        if (req.key === 'panels/overview' || req.key === 'panels/git' || req.key === 'panels/library') {
          if (typeof req.value !== 'object') return { ok: false, code: 'preference.type', headline: 'A pane layout requires a layout record' };
          await preferences.write(req.key, req.value);
        } else if (req.key === 'ui/reduced_motion') {
          if (typeof req.value !== 'boolean') return { ok: false, code: 'preference.type', headline: 'Reduce motion requires a boolean value' };
          await preferences.write(req.key, req.value);
        } else if (req.key === 'interface/agentPopOut' || req.key === 'display/showReasoning' || req.key === 'display/autoCollapseTools') {
          // Part AA: REQ-CHAT-167's `display/showReasoning` and REQ-CHAT-067's `display/autoCollapseTools`, both booleans and both off by default.
          if (typeof req.value !== 'boolean') return { ok: false, code: 'preference.type', headline: 'This display preference requires a boolean value' };
          await preferences.write(req.key, req.value);
        } else {
          if (typeof req.value !== 'string') return { ok: false, code: 'preference.type', headline: 'The Settings category requires a string value' };
          await preferences.write(req.key, req.value);
        }
        return { ok: true };
      }
      case 'session.start': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting a run' };
        // REQ-GIT-021: the two conflicting choices, refused before anything is created (REQ-GIT-158 makes this unreachable from the dialog).
        if (req.isolation && req.attach) return { ok: false, code: 'session.worktree-options', headline: 'Choose either an isolated worktree or an existing worktree to attach, not both.' };
        /**
         * REQ-GIT-022/023 (Part O), the reading taken with a main-minted id: the binding is made BEFORE the run host is
         * asked for the session, so a binding failure leaves no session, no lock and no log — "deleted" by construction
         * rather than by a delete. The id the dialog showed (session.newId) is the id the session takes (REQ-GIT-007/118).
         */
        let binding: WorktreeBinding | undefined;
        let sessionId: string | undefined;
        const root = canonicalPath(currentWorkspace);
        const svc = services.get(root);
        if (req.isolation || req.attach) {
          if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
          sessionId = mintedSessionId ?? randomUUID();
          mintedSessionId = null;
          const bindFailure = (r: ProcessReply): CommandOutcome => {
            const detail = r.kind === 'refused' ? [r.headline, r.detail].filter(Boolean).join(': ') : `unexpected reply ${r.kind}`;
            const headline = `Error: could not create or attach the requested worktree: ${detail}`;
            raiseNotice('error', headline);
            log(`run refused before start: ${headline}`);
            return { ok: false, code: 'session.worktree', headline, detail };
          };
          if (req.isolation) {
            const made = await svc.link.request({ kind: 'worktree.create', workspaceRoot: root, branch: req.isolation.branch, collisionSafe: true, target: { kind: 'session', sessionId } }, millis(120_000));
            if (made.kind !== 'worktree.created') return bindFailure(made);
            binding = { worktree_path: made.path, branch: made.branch, base_branch: made.baseBranch, base_revision: made.baseRevision, created_by_session: true, merge_status: 'ready', integration_session_id: null };
          } else if (req.attach) {
            const checked = await svc.link.request({ kind: 'worktree.checkAttach', workspaceRoot: root, path: req.attach.path }, millis(60_000));
            if (checked.kind !== 'worktree.attachable') return bindFailure(checked);
            binding = { worktree_path: checked.path, branch: checked.branch, base_branch: checked.baseBranch, base_revision: checked.baseRevision, created_by_session: false, merge_status: 'ready', integration_session_id: null };
          }
        }
        const r = await runHost.request({ kind: 'session.start', workspaceId: currentWorkspaceId, prompt: req.prompt, ...(sessionId === undefined ? {} : { sessionId }), ...(binding === undefined ? {} : { effectiveRoot: binding.worktree_path, worktree: binding }), ...(req.sandboxMode === undefined ? {} : { sandboxMode: req.sandboxMode }) }, millis(10_000));
        if (r.kind !== 'session.started') {
          // A tree this request created for a session that never came to exist is taken away again, so nothing is left behind (REQ-GIT-023).
          if (binding?.created_by_session && svc) {
            const path = binding.worktree_path;
            void svc.link.request({ kind: 'worktree.remove', workspaceRoot: root, path, force: true }, millis(60_000)).then((x) => log(`worktree ${path} removed after the refused start (${x.kind})`)).catch(() => undefined);
          }
          // REQ-NOTIFY-003: a refusal is also published as a persistent notice, so it outlives the composer's error line.
          // REQ-WORKSPACE-137: the two provider refusals carry an action leading to the Models settings.
          if (r.kind === 'refused') { raiseNotice('error', r.headline, r.detail, r.code === 'session.no-model' || r.code === 'session.provider-auth' ? recoveryFor('config.models') : undefined); log(`run refused: ${r.headline}${r.detail ? ` — ${r.detail}` : ''}`); }
          return refusal(r, 'The session could not be started');
        }
        if (binding) log(`session ${r.sessionId} bound to ${binding.worktree_path} on ${binding.branch} (${binding.created_by_session ? 'created by the session' : 'attached'})`);
        // REQ-NOTIFY-058 / REQ-NOTIFY-029: a starting run clears the standing notice only where it is unscoped or
        // scoped to this same session; a notice about another session survives, whatever order the events arrived in.
        await notices.clearForRunStart(r.sessionId);
        // REQ-SHELL-078: a new session starts — every persona window and its cache go.
        personaWindows.destroyAll('a new session started');
        return { ok: true, value: { sessionId: r.sessionId } };
      }
      case 'session.newId': {
        // REQ-GIT-118: the id the launch dialog shows; the next isolated or attached start takes it.
        mintedSessionId = randomUUID();
        return { ok: true, value: { sessionId: mintedSessionId } };
      }
      case 'git.read': {
        await awaitWorkspace();
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its repository' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        // REQ-GIT-102: 15 s per read is the bound; a refresh of a repository with many worktrees is many reads.
        const r = await svc.link.request({ kind: 'git.view', workspaceRoot: canonicalPath(currentWorkspace) }, millis(600_000));
        if (r.kind !== 'git.state') return refusal(r, 'The repository could not be read');
        const st = r.state;
        log(`git view: ${st.reads} reads in ${st.readMs} ms (git=${st.gitAvailable} repo=${st.isRepository} branch=${st.branch ?? (st.detached ? 'detached' : '-')} +${st.ahead}/-${st.behind} worktrees=${st.worktrees.length} history=${st.history.length}${st.failed.length > 0 ? ` failed=${st.failed.join(',')}` : ''})`);
        // REQ-GIT-104 / ADR-0038 c.1: a fixed identity, so refreshes replace rather than stack it; a non-repository raises nothing.
        if (!st.gitAvailable && raiseNoticeKeyed('git.missing', 'info', 'Working without Git', 'Git is not installed or not on PATH, so this workspace has no history and no worktrees. Everything else works, and Rotaris makes its changes in place instead of in a worktree of its own.')) log('notice: Working without Git');
        return { ok: true, value: st };
      }
      case 'worktree.create': {
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before creating a worktree' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        // REQ-GIT-110/115: the user's own path, not collision-safe — a typed name is created exactly or refused with Git's wording.
        const r = await svc.link.request({ kind: 'worktree.create', workspaceRoot: canonicalPath(currentWorkspace), branch: req.branch, collisionSafe: false, target: { kind: 'path', path: req.path } }, millis(120_000));
        if (r.kind !== 'worktree.created') { log(`worktree create refused: ${r.kind === 'refused' ? r.headline : r.kind}`); return r.kind === 'refused' ? { ok: false, code: r.code, headline: r.headline, ...(r.detail === undefined ? {} : { detail: r.detail }) } : refusal(r, 'The worktree could not be created'); }
        log(`worktree created by the user: ${r.branch} at ${r.path}`);
        return { ok: true, value: { path: r.path, branch: r.branch } };
      }
      case 'worktree.remove': {
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before deleting a worktree' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        const r = await svc.link.request({ kind: 'worktree.remove', workspaceRoot: canonicalPath(currentWorkspace), path: req.path, force: req.force }, millis(120_000));
        if (r.kind !== 'worktree.removed') {
          // REQ-GIT-117: the one refusal force would cure is named by its code; everything else is Git's wording.
          if (r.kind === 'refused') { log(`worktree remove refused${r.needsForce ? ' (needs force)' : ''}: ${r.headline}`); return { ok: false, code: r.needsForce ? 'worktree.needs-force' : r.code, headline: r.headline }; }
          return refusal(r, 'The worktree could not be deleted');
        }
        log(`worktree deleted by the user: ${r.path}${req.force ? ' (forced)' : ''}`);
        return { ok: true, value: { path: r.path } };
      }
      case 'worktree.chooseAttach': {
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before attaching a worktree' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        const chosen = await chooseDirectory({ title: 'Attach to an existing worktree', properties: ['openDirectory'] });
        if (!chosen) return { ok: true, value: { cancelled: true } };
        // REQ-GIT-158: validated exactly as REQ-GIT-011 validates an attach, before any session exists.
        const r = await svc.link.request({ kind: 'worktree.checkAttach', workspaceRoot: canonicalPath(currentWorkspace), path: chosen }, millis(60_000));
        if (r.kind !== 'worktree.attachable') return r.kind === 'refused' ? { ok: false, code: r.code, headline: r.headline } : refusal(r, 'The worktree could not be checked');
        return { ok: true, value: { path: r.path, branch: r.branch } };
      }
      case 'checkpoints.list':
        return checkpointGate(async () => {
          const ctx = await checkpointContext();
          if (isOutcome(ctx)) return ctx;
          const l = await readListing(ctx.workspaceId, req.sessionId);
          return isOutcome(l) ? l : { ok: true, value: l };
        });
      case 'checkpoints.preview':
        return checkpointGate(() => checkpointPreview(req.sessionId, req.sequence));
      case 'checkpoints.restore':
        return checkpointGate(() => checkpointRestore(req.sessionId, req.sequence, req.force));
      case 'worktree.probePath': {
        try {
          if (!existsSync(req.path)) return { ok: true, value: { exists: false, nonEmpty: false } };
          const st = statSync(req.path);
          return { ok: true, value: { exists: true, nonEmpty: !st.isDirectory() || readdirSync(req.path).length > 0 } };
        } catch { return { ok: true, value: { exists: true, nonEmpty: true } }; }
      }
      case 'session.list': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before browsing sessions' };
        const r = await runHost.request({ kind: 'session.list', workspaceId: currentWorkspaceId }, millis(5_000));
        return r.kind === 'session.list' ? { ok: true, value: { sessions: r.sessions } } : refusal(r, 'The session list could not be loaded');
      }
      // ---- Part Y: the Library's Artifacts tab (REQ-LIBRARY-108/131..136). Main relays; the run host owns the store and the files. ----
      case 'artifacts.list': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before browsing artifacts' };
        const r = await runHost.request({ kind: 'artifacts.list', workspaceId: currentWorkspaceId }, millis(5_000));
        return r.kind === 'artifacts.state' ? { ok: true, value: r.state } : refusal(r, 'The session artifacts could not be read');
      }
      case 'artifacts.body': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before opening an artifact' };
        const r = await runHost.request({ kind: 'artifacts.body', workspaceId: currentWorkspaceId, ref: req.ref }, millis(10_000));
        return r.kind === 'artifacts.body' ? { ok: true, value: { id: r.id, slug: r.slug, title: r.title, artifactKind: r.kind_, status: r.status, producer: r.producer, persona: r.persona, edited: r.edited, body: r.body, fallback: r.fallback } } : refusal(r, 'The artifact could not be loaded');
      }
      case 'artifacts.save': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before saving an artifact' };
        const r = await runHost.request({ kind: 'artifacts.save', workspaceId: currentWorkspaceId, ref: req.ref, body: req.body }, millis(10_000));
        if (r.kind !== 'artifacts.saved') return refusal(r, 'The artifact could not be saved');
        // REQ-LIBRARY-105: the session artifact store is one of the closed four, so a hand edit that reached the
        // store IS a library change and every live window re-reads — the same counter a prompt write moves.
        libraryRevision.bump('session-artifacts');
        return { ok: true, value: { id: r.id, editedAt: r.editedAt } };
      }
      // ---- Part U: the session browser's actions (REQ-SESSION-182). Main supplies the dialogs and the platform's file manager; the run host does the work. ----
      case 'session.repair': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before repairing its sessions' };
        const r = await runHost.request({ kind: 'session.repair', workspaceId: currentWorkspaceId, ...(req.sessionId === undefined ? {} : { sessionId: req.sessionId }) }, millis(30_000));
        if (r.kind !== 'session.repaired') return refusal(r, 'The repair could not be carried out');
        for (const x of r.report.repaired) log(`session ${x.sessionId} repaired: '${x.from}' → interrupted (${x.reason})`);
        if (r.report.nothingStale) log(`session repair: nothing was stale`);
        return { ok: true, value: { report: r.report } };
      }
      case 'session.delete': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before deleting a session' };
        const r = await runHost.request({ kind: 'session.delete', workspaceId: currentWorkspaceId, sessionId: req.sessionId }, millis(120_000));
        if (r.kind !== 'session.deleted') { if (r.kind === 'refused') raiseNotice('error', 'The session was not deleted', r.headline); return refusal(r, 'The session was not deleted'); }
        if (r.refsLeft !== null) log(`session ${req.sessionId}: checkpoint refs remain under ${r.refsLeft} (REQ-GIT-069, best-effort)`);
        if (followedSessionId === req.sessionId) { followedSessionId = null; personaWindows.destroyAll('the followed session was deleted'); }
        if (r.existed) raiseNotice('info', `Deleted session ${req.sessionId}.`, `${r.refsDeleted} checkpoint ref${r.refsDeleted === 1 ? '' : 's'} removed${r.refsLeft === null ? '' : `; some refs remain under ${r.refsLeft}`}.`);
        return { ok: true, value: { sessionId: r.sessionId, existed: r.existed, refsDeleted: r.refsDeleted, refsLeft: r.refsLeft, filesRemoved: r.filesRemoved, unreadable: r.unreadable, elapsedMs: r.elapsedMs } };
      }
      case 'session.export':
      case 'session.exportTrajectory': {
        // REQ-SESSION-189/199: a file the user chooses; nothing is written until then; not a channel.
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before exporting a session' };
        const ids = req.kind === 'session.export' ? [req.sessionId] : req.sessionIds;
        const stamp = new Date(clocks.wall.instant()).toISOString().replace(/[:.]/g, '-');
        const destination = await chooseExportPath(req.kind === 'session.export'
          ? { title: 'Export the session records', defaultPath: `rotaris-session-${req.sessionId}-records-${stamp}.json`, filters: [{ name: 'JSON document', extensions: ['json'] }] }
          : { title: ids.length === 1 ? 'Export the trajectory' : `Export ${ids.length} trajectories`, defaultPath: ids.length === 1 ? `rotaris-trajectory-${ids[0]}-${stamp}.json` : `rotaris-trajectories-${ids.length}-${stamp}.json`, filters: [{ name: 'JSON document', extensions: ['json'] }] });
        if (!destination) return { ok: true, value: { cancelled: true } };
        const r = await runHost.request(req.kind === 'session.export'
          ? { kind: 'session.export', workspaceId: currentWorkspaceId, sessionId: req.sessionId, destination }
          : { kind: 'session.exportTrajectory', workspaceId: currentWorkspaceId, sessionIds: [...req.sessionIds], destination }, millis(120_000));
        if (r.kind !== 'session.exported') { if (r.kind === 'refused') raiseNotice('error', 'The export could not be written', [r.headline, r.detail].filter(Boolean).join(': ')); return refusal(r, 'The export could not be written'); }
        raiseNotice(r.warnings.length > 0 ? 'warning' : 'info', `Wrote ${r.documents} ${req.kind === 'session.export' ? 'records document' : `trajectory document${r.documents === 1 ? '' : 's'}`} to ${r.destination}.`, r.warnings.length > 0 ? r.warnings.join(' ') : undefined);
        return { ok: true, value: { destination: r.destination, bytes: r.bytes, documents: r.documents, warnings: r.warnings, elapsedMs: r.elapsedMs } };
      }
      case 'session.openLog':
      case 'session.revealFiles': {
        // REQ-SESSION-191: the log opened for reading, the files revealed in the platform's file manager; a missing file is reported, never faked.
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace first' };
        const r = await runHost.request({ kind: 'session.files', workspaceId: currentWorkspaceId, sessionId: req.sessionId }, millis(10_000));
        if (r.kind !== 'session.files') return refusal(r, 'The session files could not be located');
        if (req.kind === 'session.openLog') {
          if (r.files.log === null) return { ok: false, code: 'session.no-log', headline: 'No log is kept for this session', detail: `Nothing was logged at or above the configured level, so no log file exists in ${r.files.directory}.` };
          const failed = await shell.openPath(r.files.log);
          return failed === '' ? { ok: true, value: { path: r.files.log } } : { ok: false, code: 'session.open-failed', headline: 'The log could not be opened', detail: failed };
        }
        const anyFile = r.files.summary ?? r.files.log ?? r.files.artifacts;
        if (anyFile === null) return { ok: false, code: 'session.no-files', headline: 'This session has no files yet', detail: `No log, summary or artifact body has been written for it, so there is nothing to reveal in ${r.files.directory}.` };
        shell.showItemInFolder(anyFile);
        return { ok: true, value: { directory: r.files.directory, log: r.files.log, summary: r.files.summary, artifacts: r.files.artifacts } };
      }
      // ---- Part X: the saved prompts (REQ-LIBRARY-137/138). Relayed to the run host, which owns the store, exactly
      // as `timeline.append` is; main adds the library revision (REQ-LIBRARY-105) and REQ-LIBRARY-138's failure notice. ----
      case 'prompts.read':
      case 'prompts.push':
      case 'prompts.take': {
        await awaitWorkspace();
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its saved prompts' };
        const r = await runHost.request(
          req.kind === 'prompts.read' ? { kind: 'prompts.read', workspaceId: currentWorkspaceId }
            : req.kind === 'prompts.push' ? { kind: 'prompts.push', workspaceId: currentWorkspaceId, list: req.list, text: req.text }
              : { kind: 'prompts.take', workspaceId: currentWorkspaceId, list: req.list, index: req.index, remove: req.remove },
          millis(10_000),
        ).catch((e: Error) => ({ kind: 'refused' as const, code: 'prompts.ask', headline: 'Could not save prompt history', detail: e.message }));
        if (r.kind !== 'prompts.state' && r.kind !== 'prompts.taken') {
          // REQ-LIBRARY-138: the persistent notice, with the detail the requirement writes; the window's in-memory
          // lists stay usable, which is what that detail promises, so nothing here clears anything.
          if (req.kind !== 'prompts.read') raiseNotice('error', 'Could not save prompt history', 'Rotaris will keep prompts in memory for this window.');
          return refusal(r, 'Could not save prompt history');
        }
        // REQ-LIBRARY-105: exactly a write that changed a list is a library change; a read is not one, and neither is
        // a `take` that kept the entry (`remove: false` copies and stores nothing).
        if (req.kind === 'prompts.push') libraryRevision.bump(req.list === 'history' ? 'prompt-history' : 'prompt-stash');
        else if (req.kind === 'prompts.take' && req.remove) libraryRevision.bump(req.list === 'history' ? 'prompt-history' : 'prompt-stash');
        return { ok: true, value: r.kind === 'prompts.state' ? { state: r.state } : { text: r.text, state: r.state } };
      }
      case 'session.resume': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before loading a session' };
        const active = await runHost.request({ kind: 'runs.active', workspaceId: currentWorkspaceId }, millis(5_000));
        if (active.kind === 'runs.count' && active.count > 0) return { ok: false, code: 'session.run-active', headline: 'Finish or cancel the active run before switching sessions.' };
        const r = await runHost.request({ kind: 'session.resume', workspaceId: currentWorkspaceId, sessionId: req.sessionId }, millis(10_000));
        if (r.kind !== 'session.resumed') {
          if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail);
          return refusal(r, 'The session could not be loaded');
        }
        raiseNotice('info', `Loaded session ${r.sessionId}.`, r.settledChildren > 0 ? `${r.settledChildren} unfinished child record(s) were settled before continuation.` : undefined);
        // REQ-SHELL-078 read for a loaded session too: the windows were opened onto the previous session's agents and would otherwise show them (Part R's reading, ADR-0048 note).
        if (followedSessionId !== null && followedSessionId !== r.sessionId) personaWindows.destroyAll('a different session was loaded');
        return { ok: true, value: { sessionId: r.sessionId, settledChildren: r.settledChildren } };
      }
      case 'config.read': {
        // Part Q's first execution: the renderer asks for the configuration as it mounts, before the argv workspace has opened; without
        // this wait the answer was `workspace.none`, the run header's model list stayed empty (REQ-MONITOR-144) and the wait header
        // had no "Change model" to offer. `repository.read` already waited; this read did not.
        await awaitWorkspace();
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its configuration' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        const r = await svc.link.request({ kind: 'config.read', workspaceRoot: canonicalPath(currentWorkspace) }, millis(10_000));
        return r.kind === 'config.snapshot' ? { ok: true, value: r.snapshot } : refusal(r, 'The configuration could not be read');
      }
      case 'repository.read': {
        await awaitWorkspace();
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before reading its repository' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        // REQ-GIT-102: five reads at 15 s each is the bound; the request waits for all of them.
        const r = await svc.link.request({ kind: 'repository.read', workspaceRoot: canonicalPath(currentWorkspace) }, millis(80_000));
        if (r.kind !== 'repository.state') return refusal(r, 'The repository could not be read');
        const st = r.state;
        log(`repository ${canonicalPath(currentWorkspace)}: git=${st.gitAvailable} repo=${st.isRepository} branch=${st.branch ?? '-'} base=${st.base ?? '-'} +${st.ahead}/-${st.behind} touched=${st.touched} uncommitted=${st.uncommitted}${st.failed.length > 0 ? ` failed=${st.failed.join(',')}` : ''} in ${st.readMs} ms`);
        return { ok: true, value: st };
      }
      case 'config.save':
      case 'config.setField': {
        // ADR-0037 Tier A: the service writes and loads again; every window repopulates from the reloaded snapshot (decision 4 of the plan for REQ-CONFIG-423).
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before changing its configuration' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        const root = canonicalPath(currentWorkspace);
        const r = await svc.link.request(req.kind === 'config.save' ? { kind: 'config.save', workspaceRoot: root, save: req.save } : { kind: 'config.setField', workspaceRoot: root, ...(req.scope ? { scope: req.scope } : {}), patch: req.patch }, millis(30_000));
        if (r.kind !== 'config.snapshot') { if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail); return refusal(r, 'The configuration could not be written'); }
        for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(CHANNEL.configChanged, { v: CONTRACT_SCHEMA_VERSION, snapshot: r.snapshot });
        log(`configuration ${req.kind === 'config.save' ? 'saved' : 'field written'} for ${root}`);
        return { ok: true, value: r.snapshot };
      }
      case 'config.liveState': {
        // ADR-0037 Tier B: the settings store's current values reach the run host ahead of the next run start.
        const r = await runHost.request({ kind: 'config.liveState', state: req.state }, millis(5_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The live settings could not be handed over');
      }
      case 'session.control': {
        // ADR-0010 channel 1 across ADR-0013's boundary: the same arguments, the same `{ok, value?}`.
        const r = await runHost.request({ kind: 'session.control', request: req.request }, millis(10_000));
        if (req.request.op === 'answerApproval' && r.kind === 'control.result') {
          // REQ-TOOLS-063: a delivered answer marks its dialog answered (the run host's close follows); an undeliverable one leaves it open.
          const d = dialogs.get(senderId);
          if (d && r.result.ok) d.answered = true;
          log(`approval ${String(req.request.args['requestId'])} answered ${String(req.request.args['option'])} → ${r.result.ok ? 'delivered' : 'undeliverable'}`);
        }
        if (req.request.op !== 'answerApproval') log(`control ${req.request.op} on ${req.request.sessionId} → ${r.kind === 'control.result' ? (r.result.ok ? `ok${r.result.value ? ` (${r.result.value})` : ''}` : 'false') : r.kind}`);
        return r.kind === 'control.result' ? { ok: true, value: r.result } : refusal(r, 'The control could not be delivered');
      }
      case 'notice.acknowledge':
        // REQ-NOTIFY-026: with an identifier this is a compare-and-clear, so dismissing a notice already superseded
        // leaves its successor standing; without one it clears whatever is current.
        await notices.dismiss(req.noticeId);
        return { ok: true };
      case 'workspace.backup': {
        // REQ-SESSION-201: the destination is a file the user chooses; nothing is written until then.
        if (!currentWorkspaceId || currentWorkspace === '(no workspace)') return { ok: false, code: 'workspace.none', headline: 'Open a workspace before backing up its session store' };
        const svc = services.get(canonicalPath(currentWorkspace));
        if (!svc) return { ok: false, code: 'workspace.none', headline: 'The workspace service is not running' };
        const stamp = new Date(clocks.wall.instant()).toISOString().replace(/[:.]/g, '-');
        const destination = await chooseSave({
          title: 'Back up the session store', defaultPath: `rotaris-sessions-${currentWorkspaceId}-${stamp}.tar`,
          filters: [{ name: 'Rotaris session store backup', extensions: ['tar'] }],
        });
        if (!destination) return { ok: true, value: { cancelled: true } };
        const r = await svc.link.request({ kind: 'workspace.backup', workspaceRoot: canonicalPath(currentWorkspace), destination }, millis(600_000));
        if (r.kind !== 'workspace.backedUp') { if (r.kind === 'refused') raiseNotice('error', 'The backup could not be taken', [r.headline, r.detail].filter(Boolean).join(': ')); return refusal(r, 'The backup could not be taken'); }
        raiseNotice('info', `Backed up ${r.sessions} session${r.sessions === 1 ? '' : 's'} to ${r.destination}.`);
        return { ok: true, value: { destination: r.destination, sessions: r.sessions, bytes: r.bytes } };
      }
      case 'workspace.restore':
        return restoreFlow();
      case 'session.prompt': {
        const r = await runHost.request({ kind: 'session.prompt', sessionId: req.sessionId, prompt: req.prompt }, millis(10_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The prompt could not be recorded');
      }
      case 'session.subscribe': {
        // Subscribe the relay FIRST so the attach's snapshot and transcript reach this window.
        // Part R found the twenty-seventh defect here: this subscribed `wcId` — the MAIN window — whatever window asked, so a
        // second renderer on one session (ADR-0043's "several windows", REQ-SHELL-076) would have fed the main window twice and
        // itself never; unseen because only the main window had ever subscribed. The sender is the subscriber (ADR-0043 note).
        relay.subscribe(senderId, req.sessionId);
        if (senderId === wcId) followedSessionId = req.sessionId;
        const r = await runHost.request({ kind: 'session.attach', sessionId: req.sessionId }, millis(5_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session could not be followed');
      }
      case 'session.unsubscribe':
        relay.unsubscribe(senderId, req.sessionId);
        if (senderId === wcId && followedSessionId === req.sessionId) followedSessionId = null;
        void runHost.request({ kind: 'session.detach', sessionId: req.sessionId }, millis(5_000)).catch(() => undefined);
        return { ok: true };
      case 'window.openPersona': {
        // REQ-SHELL-072: an unknown agent — here, no followed session for it to belong to — is a silent no-op; the renderer
        // sends the command only for an id its replica holds (the reading in ADR-0048's note).
        if (followedSessionId === null) { log(`persona window for ${req.agentId} not opened: no session is followed`); return { ok: true, value: { opened: false } }; }
        const shownAt = Date.now();
        const wasVisible = personaWindows.entry(req.persona)?.win.isVisible() ?? false;
        const entry = await personaWindows.open(req.persona, req.agentId, req.focusSteer ?? false);
        if (!wasVisible) measurePersonaPaint(req.persona, entry.win, shownAt);
        return { ok: true, value: { opened: true, reused: wasVisible } };
      }
      case 'window.personaPayload': {
        const entry = personaWindows.bySender(senderId);
        if (!entry) return { ok: false, code: 'window.unknown', headline: 'This window is not a persona window' };
        return { ok: true, value: { persona: entry.persona, sessionId: followedSessionId, select: personaWindows.takeSelection(senderId) } };
      }
      case 'window.modality': {
        // ADR-0048's application modality, second execution (Part W): the main window's palette or keyboard help is open or
        // closed; every persona window of the family stops taking input, or takes it again. Only the main window may say so.
        if (senderId !== wcId) return { ok: false, code: 'window.notMain', headline: 'Only the main window registers an application-modal surface' };
        const n = personaWindows.setFamilyModal(req.active);
        log(`application modality ${req.active ? 'on' : 'off'}: ${n} persona window(s) ${req.active ? 'disabled' : 'enabled'} (ADR-0048)`);
        return { ok: true, value: { windows: n } };
      }
      case 'session.reconcile': {
        const r = await runHost.request({ kind: 'session.reconcile', sessionId: req.sessionId }, millis(5_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session could not be re-read');
      }
      case 'session.pageOlder': {
        const r = await runHost.request({ kind: 'session.pageOlder', sessionId: req.sessionId, beforeIndex: req.beforeIndex }, millis(5_000));
        return r.kind === 'session.page' ? { ok: true, value: { rows: r.rows, oldest: r.oldest } } : refusal(r, 'Older messages could not be loaded');
      }
      default:
        return { ok: false, code: 'command.unimplemented', headline: `${req.kind} is not built yet` };
    }
  };
  ipcMain.handle(CHANNEL.command, (e, raw) => runCommand(raw, e.sender.id));

  surface = (h) => {
    // REQ-STARTUP-162/163: surface the window; honour a carried workspace.
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (h.workspace) { void openWorkspace(h.workspace).then(() => { currentWorkspace = h.workspace!; }); }
    log(`hand-over received${h.workspace ? ` with workspace ${h.workspace}` : ''}`);
  };
  for (const h of pendingHandOvers.splice(0)) surface(h);

  // REQ-CONFIG-287: a user-initiated close asks the window's unsaved-settings guard; a cancelled guard leaves the window open.
  let closeConfirmed = false;
  win.on('close', (event) => {
    if (closeConfirmed || win.isDestroyed()) return;
    event.preventDefault();
    void win.webContents.executeJavaScript('typeof window.__rotarisCloseGuard === "function" ? window.__rotarisCloseGuard() : true').then((proceed: unknown) => {
      if (proceed === false) return;
      closeConfirmed = true;
      win.close();
    }).catch(() => { closeConfirmed = true; win.close(); });
  });
  win.once('ready-to-show', () => win.show());
  /**
   * Part AA's verification seams (only with `ROTARIS_CAPTURE_PNG`).
   *
   * `ROTARIS_CAPTURE_NET=1` logs **every request this window's session issues**, from the MAIN process rather
   * than from the page — REQ-CHAT-056's "no image is ever loaded from a Markdown image reference" is a claim
   * about the process, and a page cannot honestly measure itself. The observer sees the app's own `file:` assets too;
   * the proof reads the whole list rather than a filtered one.
   *
   * `ROTARIS_ROWS_PROOF=1` loads the renderer in the `rows-proof` role — the row renderer mounted over a fixture
   * array, which is the surface Part AA can prove before Part Z's pool exists (the plan's own instruction).
   */
  if (capturing && process.env['ROTARIS_CAPTURE_NET'] === '1') {
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      log(`capture: net ${details.method} ${details.resourceType} ${details.url}`);
      callback({});
    });
  }
  const rowsProof = capturing && process.env['ROTARIS_ROWS_PROOF'] === '1';
  if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(rowsProof ? `${process.env['ELECTRON_RENDERER_URL']}?role=rows-proof` : process.env['ELECTRON_RENDERER_URL']);
  else await win.loadFile(join(__dirname, '../renderer/index.html'), rowsProof ? { query: { role: 'rows-proof' } } : undefined);

  if (argvWorkspace) await openWorkspace(argvWorkspace);

  // A verification hook for the walking skeleton and the release gate's first-paint check
  // (REQ-STARTUP-156): capture the painted window to a file and exit. Not a user-facing surface.
  const capture = process.env['ROTARIS_CAPTURE_PNG'];
  if (capture) {
    const { writeFileSync } = await import('node:fs');
    // Every proof: a renderer error is logged here, so a blank window is explained by its log and not by its PNG (Part O).
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => { if (level >= 2) log(`capture: renderer console: ${message} (${sourceId}:${line})`); });
    const proofDir = process.env['ROTARIS_THEME_PROOF_DIR'];
    if (proofDir) {
      mkdirSync(proofDir, { recursive: true });
      const rendererErrors: string[] = [];
      win.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2) rendererErrors.push(message);
      });
      clocks.timers.after(millis(900), async () => {
        const pause = (amount: number) => new Promise<void>((resolve) => clocks.timers.after(millis(amount), resolve));
        const metadata = async () => win.webContents.executeJavaScript(`(() => {
          const rect = (element) => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
          const visible = (element) => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); const x=Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)); const y=Math.max(0,Math.min(innerHeight-1,r.y+r.height/2)); const hit=document.elementFromPoint(x,y); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight && s.visibility !== 'hidden' && s.display !== 'none' && (hit===element || element.contains(hit)); };
          const texts = [...document.body.querySelectorAll('*')].filter((element) => visible(element) && element.children.length === 0 && (element.textContent || '').trim()).map((element) => { const s = getComputedStyle(element); return { text:(element.textContent || '').trim(), rect:rect(element), color:s.color, background:s.backgroundColor, fontSize:parseFloat(s.fontSize), fontWeight:s.fontWeight, disabled:element.matches(':disabled') || element.closest(':disabled') !== null }; });
          const controls = [...document.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(visible).map((element) => ({ name:element.getAttribute('aria-label') || (element.textContent || '').trim() || element.getAttribute('name') || element.tagName, rect:rect(element), focused:element === document.activeElement }));
          const icons = [...document.querySelectorAll('.nav-item i')].map((element) => ({ rect:rect(element), color:getComputedStyle(element).color }));
          const labels = [...document.querySelectorAll('.nav-item span')].map((element) => ({ text:(element.textContent || '').trim(), rect:rect(element), scrollWidth:element.scrollWidth, clientWidth:element.clientWidth }));
          return { dpr:devicePixelRatio, viewport:{width:innerWidth,height:innerHeight}, theme:document.documentElement.dataset.theme, view:document.querySelector('.app-shell')?.getAttribute('data-view'), rootBackground:getComputedStyle(document.documentElement).getPropertyValue('--rt-bg').trim(), texts, controls, icons, labels };
        })()`);
        const take = async (name: string) => {
          const image = await win.webContents.capturePage();
          writeFileSync(join(proofDir, `${name}.png`), image.toPNG());
          writeFileSync(join(proofDir, `${name}.json`), `${JSON.stringify(await metadata(), null, 2)}\n`);
        };
        const keyView = async (view: number) => {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: String(view), modifiers: ['control'] });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: String(view), modifiers: ['control'] });
          await pause(100);
        };
        const counterfactual = process.env['ROTARIS_THEME_COUNTERFACTUAL'];
        if (counterfactual === 'text') await win.webContents.executeJavaScript(`document.documentElement.style.setProperty('--rt-text', 'oklch' + '(45% 0 0)')`);
        if (counterfactual === 'focus') await win.webContents.executeJavaScript(`document.documentElement.style.setProperty('--rt-focus', 'oklch' + '(40% 0 0)')`);
        for (let view = 1; view <= 7; view += 1) { await keyView(view); await take(`view-${view}`); }
        await keyView(7);
        const categories = await win.webContents.executeJavaScript(`[...document.querySelectorAll('.nav-list__item')].map((element) => (element.textContent || '').trim())`) as string[];
        for (let index = 0; index < categories.length; index += 1) {
          await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-list__item')[${index}]?.click()`);
          await pause(60);
          await take(`settings-${String(index + 1).padStart(2, '0')}`);
        }
        const focusCount = await win.webContents.executeJavaScript(`[...document.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((element) => { const r=element.getBoundingClientRect(); return r.width>0 && r.height>0; }).length`) as number;
        await win.webContents.executeJavaScript(`document.activeElement?.blur()`);
        for (let index = 0; index < focusCount; index += 1) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
          await pause(30);
          await take(`focus-${String(index + 1).padStart(2, '0')}`);
        }
        await keyView(2);
        await win.webContents.executeJavaScript(`(() => { const input=document.querySelector('.composer__input'); if(input){ const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; setter.call(input,'theme proof draft'); input.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
        const beforeSwitch = await metadata();
        const next = currentTheme.name === 'rotaris-dim' ? 'nocturne' : currentTheme.name === 'nocturne' ? 'high-contrast' : 'rotaris-dim';
        await runCommand({ kind: 'theme.set', name: next });
        await pause(120);
        const afterSwitch = await metadata();
        await take('theme-switch');
        writeFileSync(join(proofDir, 'switch.json'), `${JSON.stringify({ before: beforeSwitch, after: afterSwitch, composer: await win.webContents.executeJavaScript(`document.querySelector('.composer__input')?.value ?? ''`) }, null, 2)}\n`);
        writeFileSync(join(proofDir, 'console-errors.json'), `${JSON.stringify(rendererErrors, null, 2)}\n`);
        log(`theme proof captured ${proofDir}`);
        app.exit(rendererErrors.length === 0 ? 0 : 3);
      });
    } else {
    // ROTARIS_CAPTURE_RESUME=<sessionId|latest>: the user's route to a stored session — the title bar's
    // "Sessions" control opens the browser (REQ-SHELL-126), the row's "Open" loads it (REQ-SESSION-118).
    // Runs after the workspace is open (the list is the workspace's); the prompt seam then continues it.
    const resumeWanted = process.env['ROTARIS_CAPTURE_RESUME'];
    if (resumeWanted) {
      const clickAt = (rect: { x: number; y: number }) => {
        win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
      };
      const centre = (finder: string) => win.webContents.executeJavaScript(`(() => { const b = ${finder}; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as Promise<{ x: number; y: number } | null>;
      clocks.timers.after(millis(600), async () => {
        const control = await centre(`document.querySelector('.title-bar__sessions')`);
        if (!control) { log('capture: no "Sessions" control on screen'); return; }
        clickAt(control);
        await new Promise((r) => clocks.timers.after(millis(700), () => r(undefined)));
        const rowFinder = resumeWanted === 'latest' ? `document.querySelector('.session-browser tr[data-session-id] button')` : `document.querySelector('.session-browser tr[data-session-id=${JSON.stringify(resumeWanted)}] button')`;
        const open = await centre(rowFinder);
        if (!open) { log(`capture: no session row for "${resumeWanted}" in the browser`); return; }
        clickAt(open);
        log(`capture: opened session "${resumeWanted}" from the browser`);
      });
    }
    const prompt = process.env['ROTARIS_CAPTURE_PROMPT'];
    if (prompt) {
      // Real input events, not a script: Ctrl+2 opens Workspace (REQ-SHELL-049), Ctrl+L focuses the
      // composer (REQ-CHAT-002), the text is typed, Enter submits (REQ-CHAT-001).
      // ROTARIS_CAPTURE_PROMPT_MS: when the prompt is typed (the MCP proof toggles a Settings control first; verification only).
      clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_PROMPT_MS'] ?? (resumeWanted ? 2_600 : 800))), () => {
        const wc = win.webContents;
        wc.sendInputEvent({ type: 'keyDown', keyCode: '2', modifiers: ['control'] });
        wc.sendInputEvent({ type: 'keyUp', keyCode: '2', modifiers: ['control'] });
        clocks.timers.after(millis(200), () => {
          wc.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['control'] });
          wc.sendInputEvent({ type: 'keyUp', keyCode: 'L', modifiers: ['control'] });
          for (const ch of prompt) wc.sendInputEvent({ type: 'char', keyCode: ch });
          wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
          wc.sendInputEvent({ type: 'char', keyCode: 'Return' });
          wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        });
      });
    }
    // ROTARIS_CAPTURE_ACTION=backup|restore at ROTARIS_CAPTURE_ACTION_MS: the command a Settings action sends.
    const action = process.env['ROTARIS_CAPTURE_ACTION'];
    if (action === 'backup' || action === 'restore' || action === 'hooks-review') {
      clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_ACTION_MS'] ?? 1_500)), async () => {
        const outcome = await runCommand({ kind: action === 'backup' ? 'workspace.backup' : action === 'restore' ? 'workspace.restore' : 'hooks.review' });
        log(`capture: ${action} → ${JSON.stringify(outcome)}`);
      });
    }
    // ROTARIS_CAPTURE_VIEW=<n>: open view n and, for Settings, click the Project category.
    const view = Number(process.env['ROTARIS_CAPTURE_VIEW'] ?? 0);
    if (view > 0) {
      clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_VIEW_MS'] ?? 600)), async () => {
        const wc = win.webContents;
        wc.sendInputEvent({ type: 'keyDown', keyCode: String(view), modifiers: ['control'] });
        wc.sendInputEvent({ type: 'keyUp', keyCode: String(view), modifiers: ['control'] });
        if (view === 7) {
          await new Promise((r) => clocks.timers.after(millis(200), () => r(undefined)));
          const rect = await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.nav-list__item')].find((x) => x.textContent === ${JSON.stringify(process.env['ROTARIS_CAPTURE_SETTINGS'] ?? 'Project')}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
          if (rect) { wc.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 }); }
        }
      });
    }
    // ROTARIS_CAPTURE_MODE=<preset> at ROTARIS_CAPTURE_MODE_MS: click the mode selector's option, then the confirmation (REQ-TOOLS-077).
    const modeAt = Number(process.env['ROTARIS_CAPTURE_MODE_MS'] ?? 0);
    const modeWanted = process.env['ROTARIS_CAPTURE_MODE'];
    if (modeWanted && modeAt > 0) {
      const click = async (selector: string, text: string | null) => {
        const rect = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => ${text === null ? 'true' : `x.textContent.trim() === ${JSON.stringify(text)}`}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
        if (!rect) { log(`capture: no "${text ?? selector}" control on screen`); return false; }
        win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        log(`capture: clicked "${text ?? selector}"`);
        return true;
      };
      clocks.timers.after(millis(modeAt), async () => {
        if (!(await click('.seg-opt', modeWanted))) return;
        if (modeWanted === 'autonomous') { await new Promise((r) => clocks.timers.after(millis(300), () => r(undefined))); await click('.dialog-actions .btn-danger', 'Switch to autonomous'); }
      });
    }
    // ROTARIS_CAPTURE_CLICKS="selector>>text@ms;;…" and ROTARIS_CAPTURE_SELECT="selector>>value@ms;;…": real clicks on
    // Settings controls and a value chosen in a select, for the configuration proof (verification only).
    const steps = (raw: string | undefined) => (raw ?? '').split(';;').map((s) => s.trim()).filter((s) => s !== '').map((s) => {
      const at = Number(s.slice(s.lastIndexOf('@') + 1));
      const body = s.slice(0, s.lastIndexOf('@'));
      const sep = body.indexOf('>>');
      return { selector: sep === -1 ? body : body.slice(0, sep), arg: sep === -1 ? null : body.slice(sep + 2), at };
    });
    for (const step of steps(process.env['ROTARIS_CAPTURE_CLICKS'])) {
      clocks.timers.after(millis(step.at), async () => {
        const rect = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(step.selector)})].find((x) => ${step.arg === null ? 'true' : `x.textContent.trim() === ${JSON.stringify(step.arg)}`}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`) as { x: number; y: number } | null;
        if (!rect) { log(`capture: no "${step.arg ?? step.selector}" control on screen`); return; }
        win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        log(`capture: clicked "${step.arg ?? step.selector}"`);
      });
    }
    // ROTARIS_CAPTURE_TYPE="text@ms;;…": real key events into whatever control holds focus, then Enter (the composer's submit, REQ-CHAT-001).
    for (const step of steps(process.env['ROTARIS_CAPTURE_TYPE'])) {
      clocks.timers.after(millis(step.at), () => {
        const wc = win.webContents;
        // `>>composer` first focuses the composer with Ctrl+L (REQ-CHAT-002); `>>no-enter` leaves the text in the focused control.
        if (step.arg === 'composer') { wc.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['control'] }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'L', modifiers: ['control'] }); }
        for (const ch of step.selector) wc.sendInputEvent({ type: 'char', keyCode: ch });
        if (step.arg !== 'no-enter') { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); }
        log(`capture: typed "${step.selector}"`);
      });
    }
    // ROTARIS_CAPTURE_KEYS="keyCode@ms;;…": one real key press (down and up) into whatever holds focus — how the Git proof
    // drags the divider with Left after clicking it (REQ-SHELL-069; verification only).
    for (const step of steps(process.env['ROTARIS_CAPTURE_KEYS'])) {
      clocks.timers.after(millis(step.at), () => {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: step.selector });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: step.selector });
        log(`capture: key ${step.selector}`);
      });
    }
    // Part W's seams (verification only). ROTARIS_CAPTURE_CHORDS="Ctrl+K@ms;;F1@ms;;Escape@ms": one real chord (down and up,
    // with its modifiers) into the main window — how the palette proof presses Ctrl+K, Ctrl+,, Ctrl+Return, F1 and Escape.
    const chordEvent = (chord: string): { keyCode: string; modifiers: ('control' | 'shift' | 'alt')[] } => {
      const parts = chord.endsWith('++') ? [...chord.slice(0, -2).split('+'), '+'] : chord.split('+');
      const modifiers: ('control' | 'shift' | 'alt')[] = [];
      let keyCode = '';
      for (const p of parts) { if (p === 'Ctrl') modifiers.push('control'); else if (p === 'Shift') modifiers.push('shift'); else if (p === 'Alt') modifiers.push('alt'); else keyCode = p; }
      return { keyCode, modifiers };
    };
    for (const step of steps(process.env['ROTARIS_CAPTURE_CHORDS'])) {
      clocks.timers.after(millis(step.at), () => {
        const { keyCode, modifiers } = chordEvent(step.selector);
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
        log(`capture: chord ${step.selector} at ${step.at}`);
      });
    }
    // ROTARIS_CAPTURE_TYPE_AT="text@ms;;…": real characters into whatever holds focus (a chord alone moves no caret and
    // inserts nothing — the renderer needs the `char` event), so the proof fills the palette's filter field as a user does.
    for (const step of steps(process.env['ROTARIS_CAPTURE_TYPE_AT'])) {
      clocks.timers.after(millis(step.at), () => {
        for (const ch of step.selector) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: ch });
          win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: ch });
        }
        log(`capture: type-at ${step.at} ${JSON.stringify(step.selector)}`);
      });
    }
    // ROTARIS_CAPTURE_INSPECT_AT="selector@ms;;…": every match's bounding rectangle, every attribute and its text, plus the
    // viewport and the focused element — the palette's 560×420 measured, its names read, focus return checked (REQ-SHELL-051/052).
    const inspectScript = (selector: string) => `(() => { const d = (el) => ({ tag: el.tagName.toLowerCase(), id: el.id || null, className: typeof el.className === 'string' ? el.className : null, label: el.getAttribute('aria-label'), testId: el.getAttribute('data-testid') }); return { viewport: { width: innerWidth, height: innerHeight }, active: document.activeElement ? d(document.activeElement) : null, matches: [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => { const r = el.getBoundingClientRect(); return { rect: { x: r.x, y: r.y, width: r.width, height: r.height }, attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])), text: (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 600) }; }) }; })()`;
    for (const step of steps(process.env['ROTARIS_CAPTURE_INSPECT_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const found = await win.webContents.executeJavaScript(inspectScript(step.selector)).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
        log(`capture: inspect-at ${step.at} ${step.selector} → ${JSON.stringify(found)}`);
      });
    }
    // Part V's seams (verification only). ROTARIS_CAPTURE_NOTICES='<json>@ms;;…': one publication through the REAL
    // store — the same `report`/`acknowledge`/`dismiss`/`clearForRunStart` the product calls, never a shortcut to the
    // channel — so the proof exercises the queue, the record and the scoping rules rather than a stand-in for them.
    // The JSON is `{op:'report'|'acknowledge'|'dismiss'|'run-start', …}`.
    for (const step of steps(process.env['ROTARIS_CAPTURE_NOTICES'])) {
      clocks.timers.after(millis(step.at), () => {
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(step.selector) as Record<string, unknown>; }
        catch (cause) { log(`capture: notices at ${step.at} — unreadable step: ${String(cause)}`); return; }
        const op = String(parsed['op'] ?? 'report');
        if (op === 'acknowledge') { notices.acknowledge(parsed['kind'] as 'info' | 'ok' | 'warn' | 'fail', String(parsed['title']), parsed['body'] === undefined ? undefined : String(parsed['body'])); log(`capture: notices at ${step.at} acknowledge ${String(parsed['title'])}`); return; }
        if (op === 'dismiss') { void notices.dismiss(parsed['id'] === undefined ? undefined : Number(parsed['id'])).then(() => log(`capture: notices at ${step.at} dismiss ${String(parsed['id'] ?? 'current')} → current ${notices.current()?.id ?? 'null'}`)); return; }
        if (op === 'run-start') { void notices.clearForRunStart(String(parsed['sessionId'])).then(() => log(`capture: notices at ${step.at} run-start ${String(parsed['sessionId'])} → current ${notices.current()?.id ?? 'null'}`)); return; }
        void notices.report({
          severity: (parsed['severity'] ?? 'info') as NoticeSeverity, title: String(parsed['title']),
          ...(parsed['message'] === undefined ? {} : { message: String(parsed['message']) }),
          ...(parsed['detail'] === undefined ? {} : { detail: String(parsed['detail']) }),
          ...(parsed['persistent'] === undefined ? {} : { persistent: Boolean(parsed['persistent']) }),
          ...(parsed['sessionId'] === undefined ? {} : { sessionId: String(parsed['sessionId']) }),
          ...(parsed['action'] === undefined ? {} : { action: parsed['action'] as { label: string; action: NoticeAction } }),
          ...(parsed['acknowledge'] === undefined ? {} : { acknowledge: parsed['acknowledge'] as { kind: 'info' | 'ok' | 'warn' | 'fail'; body?: string } }),
        }).then((r) => log(`capture: notices at ${step.at} report #${r.id} shown=${r.shown} → current ${notices.current()?.id ?? 'null'}`));
      });
    }
    // Part X's seam (verification only). ROTARIS_CAPTURE_PROMPTS="history>>text@ms;;stash>>text@ms": one saved-prompt
    // write through the REAL command — the same `prompts.push` a surface sends, so the store, the caps, the duplicate
    // suppression and the library revision are all exercised rather than stood in for. `{n}` before the text pushes
    // n entries with the index appended, which is how a proof reaches REQ-LIBRARY-139's cap without an env var per row.
    for (const step of steps(process.env['ROTARIS_CAPTURE_PROMPTS'])) {
      clocks.timers.after(millis(step.at), async () => {
        const list = step.selector === 'stash' ? 'stash' : 'history';
        const raw = step.arg ?? '';
        const repeat = /^\{(\d+)\}(.*)$/.exec(raw);
        const count = repeat ? Number(repeat[1]) : 1;
        const template = repeat ? repeat[2] ?? '' : raw;
        let failures = 0;
        for (let n = 1; n <= count; n += 1) {
          const outcome = await runCommand({ kind: 'prompts.push', list, text: repeat ? `${template}${n}` : template });
          if (!outcome.ok) failures += 1;
        }
        log(`capture: prompts at ${step.at} ${list} ×${count} → ${failures === 0 ? 'ok' : `${failures} refused`}, revision ${libraryRevision.value}`);
      });
    }
    // ROTARIS_CAPTURE_TEXT_AT="needle@ms": whether the document's rendered text contains the needle — a keyword must be matched
    // and never displayed (REQ-SHELL-053).
    for (const step of steps(process.env['ROTARIS_CAPTURE_TEXT_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const found = await win.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(step.selector)})`).catch(() => 'error') as unknown;
        log(`capture: text-at ${step.at} ${JSON.stringify(step.selector)} → ${String(found)}`);
      });
    }
    // ROTARIS_CAPTURE_ORDER_AT="arm@ms;;read@ms": a mutation log over the document — the instant the palette left the DOM and
    // the instant the shell's view changed, in the order they happened (REQ-SHELL-052: close first, then run).
    for (const step of steps(process.env['ROTARIS_CAPTURE_ORDER_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        if (step.selector === 'arm') {
          const armed = await win.webContents.executeJavaScript(`(() => { const log = []; const t0 = performance.now(); window.__rotarisOrder = log; const shell = document.querySelector('.app-shell'); const view0 = shell?.getAttribute('data-view'); const mo = new MutationObserver((records) => { for (const r of records) { if (r.type === 'childList') for (const n of r.removedNodes) if (n.nodeType === 1 && (n.matches('[data-testid="command-palette"]') || n.querySelector('[data-testid="command-palette"]'))) log.push({ event: 'palette-removed', at: performance.now() - t0 }); if (r.type === 'attributes' && r.target === shell && r.attributeName === 'data-view') log.push({ event: 'view-changed', from: r.oldValue, to: shell.getAttribute('data-view'), at: performance.now() - t0 }); } }); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-view'] }); return { armed: true, view: view0, palette: document.querySelector('[data-testid="command-palette"]') !== null }; })()`).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
          log(`capture: order-at ${step.at} arm → ${JSON.stringify(armed)}`);
        } else {
          const read = await win.webContents.executeJavaScript(`({ events: window.__rotarisOrder ?? null, view: document.querySelector('.app-shell')?.getAttribute('data-view'), palette: document.querySelector('[data-testid="command-palette"]') !== null })`).catch((cause: unknown) => ({ error: String(cause) })) as unknown;
          log(`capture: order-at ${step.at} read → ${JSON.stringify(read)}`);
        }
      });
    }
    // ROTARIS_CAPTURE_RESIZE="WxH@ms": the main window resized to that content size — the 1000×680 minimum of REQ-SHELL-022.
    for (const step of steps(process.env['ROTARIS_CAPTURE_RESIZE'])) {
      clocks.timers.after(millis(step.at), () => {
        const [w, h] = step.selector.split('x').map(Number);
        if (w && h) { win.setContentSize(w, h); log(`capture: resize at ${step.at} → content ${win.getContentSize().join('×')}`); }
      });
    }
    // ROTARIS_CAPTURE_OS_INPUT="click:<selector>@ms;;type:<text>@ms;;where@ms" with ROTARIS_CAPTURE_OS_INPUT_SCRIPT=<ps1>: input
    // delivered by the OPERATING SYSTEM to the first persona window — the cursor moved over the element and a real button
    // click, real keystrokes to whatever window the host holds as foreground (only ever one of ours; the script checks) — so
    // ADR-0048's application modality is observed as the host enforces it. Injected events bypass `setEnabled(false)`
    // (they enter the renderer below the host's input block), which is why this seam exists (ADR-0048's Part W note).
    const osScript = process.env['ROTARIS_CAPTURE_OS_INPUT_SCRIPT'];
    const handleOf = (w: BrowserWindow): string => { const b = w.getNativeWindowHandle(); return b.length >= 8 ? b.readBigUInt64LE(0).toString() : String(b.readUInt32LE(0)); };
    const runOs = (args: string[]): Promise<string> => new Promise((resolve) => {
      if (!osScript) { resolve('no script'); return; }
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', osScript, ...args], { timeout: 20_000, windowsHide: true }, (error, stdout, stderr) => resolve(error ? `error: ${error.message} ${stderr}` : String(stdout).trim()));
    });
    for (const step of steps(process.env['ROTARIS_CAPTURE_OS_INPUT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const e = firstPersona();
        if (!e) { log(`capture: os-input ${step.at} ${step.selector}: no persona window`); return; }
        const own = [handleOf(win), handleOf(e.win)];
        const colon = step.selector.indexOf(':');
        const op = colon === -1 ? step.selector : step.selector.slice(0, colon);
        const arg = colon === -1 ? '' : step.selector.slice(colon + 1);
        if (op === 'click') {
          const local = await e.win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`).catch(() => null) as { x: number; y: number } | null;
          if (!local) { log(`capture: os-input ${step.at} click ${arg}: no such element in the persona window`); return; }
          const content = e.win.getContentBounds();
          const point = screen.dipToScreenPoint({ x: Math.round(content.x + local.x), y: Math.round(content.y + local.y) });
          e.win.moveTop();
          const out = await runOs(['click', String(point.x), String(point.y), own[0]!, own[1]!]);
          log(`capture: os-input ${step.at} click ${arg} at screen ${point.x},${point.y} (persona hwnd ${own[1]}, enabled=${e.win.isEnabled()}) → ${out}`);
        } else if (op === 'type') {
          const out = await runOs(['type', arg, own[0]!, own[1]!]);
          log(`capture: os-input ${step.at} type ${JSON.stringify(arg)} (persona hwnd ${own[1]}, enabled=${e.win.isEnabled()}) → ${out}`);
        } else {
          const out = await runOs(['where', '0', '0', own[0]!, own[1]!]);
          log(`capture: os-input ${step.at} where (main hwnd ${own[0]}, persona hwnd ${own[1]}, enabled=${e.win.isEnabled()}) → ${out}`);
        }
      });
    }
    // ROTARIS_CAPTURE_PNG_AT="path@ms;;…": a capture of the painted window at that time, beside the one at the end — the wait
    // header read by eye while the run still waits (Part Q's proof; verification only).
    for (const step of steps(process.env['ROTARIS_CAPTURE_PNG_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const image = await win.webContents.capturePage();
        writeFileSync(step.selector, image.toPNG());
        log(`capture: png-at ${step.at} → ${step.selector}`);
      });
    }
    // ROTARIS_CAPTURE_PROBE_AT="selector@ms;;…": a probe taken mid-run at that time (the same JSON as the end probes), so a proof
    // can read a state that is gone by the capture — the wait header's countdown (Part Q's proof; verification only).
    for (const step of steps(process.env['ROTARIS_CAPTURE_PROBE_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const found = await win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(step.selector)})].map((el) => ({ text: (el.textContent || '').trim().slice(0, 400), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-value')).map((a) => [a.name, a.value])) })))()`) as unknown;
        log(`capture: probe-at ${step.at} ${step.selector} → ${JSON.stringify(found)}`);
      });
    }
    // Part AA's seam (verification only). ROTARIS_CAPTURE_DRAG_AT="selector@ms;;…": a REAL pointer selection across the
    // matched element — press just inside its top-left, move, release just inside its bottom-right — then the resulting
    // document selection logged. REQ-CHAT-075 requires selection "in every row category including rows whose body is
    // rendered Markdown", and a Range set by script would prove the document model rather than the pointer.
    for (const step of steps(process.env['ROTARIS_CAPTURE_DRAG_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const box = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(step.selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`) as { x: number; y: number; width: number; height: number } | null;
        if (!box) { log(`capture: drag-at ${step.at} ${step.selector} → no such element`); return; }
        const from = { x: Math.round(box.x + 2), y: Math.round(box.y + 4) };
        const to = { x: Math.round(box.x + box.width - 2), y: Math.round(box.y + box.height - 4) };
        win.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round((from.x + to.x) / 2), y: Math.round((from.y + to.y) / 2), button: 'left' });
        win.webContents.sendInputEvent({ type: 'mouseMove', x: to.x, y: to.y, button: 'left' });
        win.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
        await new Promise((r) => clocks.timers.after(millis(120), () => r(undefined)));
        const selected = await win.webContents.executeJavaScript('String(document.getSelection() ?? "")') as string;
        log(`capture: drag-at ${step.at} ${step.selector} → ${JSON.stringify(selected)}`);
      });
    }
    // ROTARIS_CAPTURE_SHOT="path@ms;;…": a PNG of the main window at that time, so a proof can keep a dialog mid-flow (the
    // checkpoint proof's confirmation dialog, REQ-GIT-097); the final capture still happens at the end.
    for (const step of steps(process.env['ROTARIS_CAPTURE_SHOT'])) {
      clocks.timers.after(millis(step.at), async () => {
        try {
          // The same probes as the final capture, logged under a `shot-probe` prefix, so what the dialog showed is asserted, not eyeballed.
          for (const selector of (process.env['ROTARIS_CAPTURE_PROBE'] ?? '').split(';;').map((s) => s.trim()).filter((s) => s !== '')) {
            const found = await win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => ({ text: (el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 600), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'disabled' || a.name === 'title').map((a) => [a.name, a.value])) })))()`) as unknown;
            log(`capture: shot-probe ${selector} → ${JSON.stringify(found)}`);
          }
          writeFileSync(step.selector, (await win.webContents.capturePage()).toPNG());
          log(`captured shot ${step.selector}`);
        } catch (cause) { log(`capture: shot ${step.selector} failed: ${String(cause)}`); }
      });
    }
    // Part R's seams (verification only). ROTARIS_CAPTURE_WINDOWS_AT="ms;;ms": the registry's persona windows — title, size,
    // visible, minimized — logged as JSON (REQ-SHELL-072/076/078). ROTARIS_CAPTURE_PERSONA_PNG_AT="path@ms" and
    // ROTARIS_CAPTURE_PERSONA_PROBE_AT="selector@ms": a capture of, and a probe inside, the FIRST persona window.
    // ROTARIS_CAPTURE_PERSONA_CLOSE_AT="ms": the user's close of that window (hides it). ROTARIS_CAPTURE_PERSONA_STEER="text@ms":
    // the steer card's text set and "Send steer" clicked inside it (REQ-MONITOR-070).
    // ROTARIS_CAPTURE_VIEWS="n@ms;;n@ms": Ctrl+n at each time — a sequence of views in one launch (the parity probes of REQ-MONITOR-038).
    for (const step of steps(process.env['ROTARIS_CAPTURE_VIEWS'])) {
      clocks.timers.after(millis(step.at), () => {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: step.selector, modifiers: ['control'] });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: step.selector, modifiers: ['control'] });
        log(`capture: view ${step.selector} at ${step.at}`);
      });
    }
    // ROTARIS_CAPTURE_RECONCILE_AT="ms;;ms": a whole read of the followed session at that time — one publication while a chosen
    // view is visible, for REQ-MONITOR-038's refresh measurement on a stored record (verification only).
    for (const step of steps(process.env['ROTARIS_CAPTURE_RECONCILE_AT'])) {
      clocks.timers.after(millis(step.at), () => { if (followedSessionId) { void runCommand({ kind: 'session.reconcile', sessionId: followedSessionId }); log(`capture: reconcile at ${step.at}`); } else log(`capture: reconcile at ${step.at}: no session followed`); });
    }
    for (const step of steps(process.env['ROTARIS_CAPTURE_WINDOWS_AT'])) {
      clocks.timers.after(millis(step.at), () => { log(`capture: windows-at ${step.at} → ${JSON.stringify(personaWindows.list())}`); });
    }
    const firstPersona = () => personaWindows.list().map((w) => personaWindows.entry(w.persona)).find((e) => e !== undefined && !e.win.isDestroyed()) ?? null;
    for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_PNG_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const e = firstPersona();
        if (!e) { log(`capture: persona-png-at ${step.at}: no persona window`); return; }
        try { writeFileSync(step.selector, (await e.win.webContents.capturePage()).toPNG()); log(`capture: persona-png-at ${step.at} → ${step.selector} ("${e.persona}")`); } catch (cause) { log(`capture: persona-png-at failed: ${String(cause)}`); }
      });
    }
    for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_PROBE_AT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const e = firstPersona();
        if (!e) { log(`capture: persona-probe-at ${step.at} ${step.selector} → null`); return; }
        const found = await e.win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(step.selector)})].map((el) => ({ text: (el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')).trim().slice(0, 400), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'title').map((a) => [a.name, a.value])) })))()`).catch((cause: unknown) => `error: ${String(cause)}`) as unknown;
        log(`capture: persona-probe-at ${step.at} ${step.selector} → ${JSON.stringify(found)}`);
      });
    }
    for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_CLOSE_AT'])) {
      clocks.timers.after(millis(step.at), () => { const e = firstPersona(); if (e) { e.win.close(); log(`capture: persona-close-at ${step.at} ("${e.persona}") → visible=${e.win.isVisible()} destroyed=${e.win.isDestroyed()}`); } else log(`capture: persona-close-at ${step.at}: no persona window`); });
    }
    for (const step of steps(process.env['ROTARIS_CAPTURE_PERSONA_STEER'])) {
      clocks.timers.after(millis(step.at), async () => {
        const e = firstPersona();
        if (!e) { log(`capture: persona-steer-at ${step.at}: no persona window`); return; }
        const done = await e.win.webContents.executeJavaScript(`(() => { const el = document.querySelector('[data-testid="persona-steer"]'); if (!el) return 'no box'; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(step.selector)}); el.dispatchEvent(new Event('input', { bubbles: true })); const b = document.querySelector('[data-testid="persona-send"]'); if (!b) return 'no send'; b.click(); return 'sent'; })()`).catch((cause: unknown) => `error: ${String(cause)}`) as string;
        log(`capture: persona-steer-at ${step.at} → ${done}`);
      });
    }
    // ROTARIS_CAPTURE_QUIT_MS: a user-initiated close of the main window at that time — the quit path of REQ-MONITOR-131, not the capture's exit.
    const quitAt = Number(process.env['ROTARIS_CAPTURE_QUIT_MS'] ?? 0);
    if (quitAt > 0) clocks.timers.after(millis(quitAt), () => { log('capture: closing the main window (user-initiated)'); win.close(); });
    for (const step of steps(process.env['ROTARIS_CAPTURE_SELECT'])) {
      clocks.timers.after(millis(step.at), async () => {
        const done = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(step.selector)}); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(step.arg ?? '')}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`) as boolean;
        log(`capture: select ${step.selector} = ${step.arg ?? ''} → ${done ? 'chosen' : 'no such control'}`);
      });
    }
    // ROTARIS_CAPTURE_STOP_MS: press the stop control with a real click at its measured position (REQ-SESSION-186).
    const stopAt = Number(process.env['ROTARIS_CAPTURE_STOP_MS'] ?? 0);
    if (prompt && stopAt > 0) {
      clocks.timers.after(millis(stopAt), async () => {
        const rect = await win.webContents.executeJavaScript(`(() => { const b = document.querySelector('.composer__actions .btn-danger'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.textContent }; })()`) as { x: number; y: number; label: string } | null;
        if (!rect) { log('capture: no stop control on screen'); return; }
        const wc = win.webContents;
        wc.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        wc.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
        log(`capture: clicked "${rect.label}" at ${Math.round(rect.x)},${Math.round(rect.y)}`);
      });
    }
    // ROTARIS_CAPTURE_AFTER_MS lets a verification run wait for the run loop to finish before the capture.
    // ROTARIS_CAPTURE_WAIT=file:<path>|result, bounded by ROTARIS_CAPTURE_WAIT_MS: the AFTER timer starts only once the
    // file exists or the first terminal result was presented — how the slice proof waits for a pasted key and for a real run.
    const after = Number(process.env['ROTARIS_CAPTURE_AFTER_MS'] ?? (prompt ? 3_000 : 1_500));
    const wait = process.env['ROTARIS_CAPTURE_WAIT'];
    const waitBound = Number(process.env['ROTARIS_CAPTURE_WAIT_MS'] ?? 600_000);
    // ROTARIS_CAPTURE_END_VIEW=<n>: open view n (Ctrl+n) once the wait is over and before the capture, so a proof
    // can drive a run from the Workspace view and read the Overview afterwards. ROTARIS_CAPTURE_PROBE="selector;;…":
    // each selector's text and data-* attributes logged as JSON before the capture — what a proof asserts against.
    const endView = Number(process.env['ROTARIS_CAPTURE_END_VIEW'] ?? 0);
    const probes = (process.env['ROTARIS_CAPTURE_PROBE'] ?? '').split(';;').map((s) => s.trim()).filter((s) => s !== '');
    const finish = () => clocks.timers.after(millis(after), async () => {
      if (endView > 0) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: String(endView), modifiers: ['control'] });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: String(endView), modifiers: ['control'] });
        await new Promise((r) => clocks.timers.after(millis(Number(process.env['ROTARIS_CAPTURE_END_VIEW_MS'] ?? 2_500)), () => r(undefined)));
      }
      for (const selector of probes) {
        // `value` rides along for a control (a select, an input), since its text is every option it offers (Part R's proof reads the strategy selector).
        const found = await win.webContents.executeJavaScript(`(() => [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => ({ text: (el.textContent || '').trim().slice(0, 400), ...('value' in el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? { value: String(el.value) } : {}), data: Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-value')).map((a) => [a.name, a.value])) })))()`) as unknown;
        log(`capture: probe ${selector} → ${JSON.stringify(found)}`);
      }
      const img = await win.webContents.capturePage();
      writeFileSync(capture, img.toPNG());
      log(`captured ${capture}`);
      app.exit(0);
    });
    if (wait) {
      const { existsSync: exists } = await import('node:fs');
      const satisfied = () => (wait === 'result' ? resultSeen : wait.startsWith('file:') ? exists(wait.slice(5)) : true);
      const started = clocks.monotonic.now();
      const poll = clocks.timers.every(millis(500), () => {
        if (satisfied()) { poll.cancel(); log(`capture: wait for ${wait} satisfied after ${Math.round(clocks.monotonic.now() - started)} ms`); finish(); }
        else if (clocks.monotonic.now() - started > waitBound) { poll.cancel(); log(`capture: wait for ${wait} timed out after ${waitBound} ms`); finish(); }
      });
    } else finish();
    }
  }

  app.on('window-all-closed', () => {
    // ADR-0014: quit is main-driven, run-host-executed. The skeleton asks and waits, bounded.
    void (async () => {
      // REQ-GIT-101: a desktop checkpoint operation in flight finishes first — bounded only by REQ-GIT-033's limits.
      if (checkpointOp) { log('quit: waiting for the in-flight checkpoint operation (REQ-GIT-101)'); await checkpointOp.catch(() => undefined); }
      await runHost.request({ kind: 'shutdown', deadlineMs: 30_000 }, millis(30_000)).catch(() => undefined);
      // REQ-GIT-101 again, one process down: each workspace service finishes its in-flight checkpoint Git before it exits.
      await Promise.all([...services.values()].map((s) => s.link.request({ kind: 'shutdown', deadlineMs: 30_000 }, millis(330_000)).catch(() => undefined)));
      app.quit();
    })();
  });
}

void main();
