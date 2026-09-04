import { app, BrowserWindow, dialog, ipcMain, nativeTheme, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { millis } from '@rotaris/kernel';
import { CHANNEL, CommandRequestSchema, CONTRACT_SCHEMA_VERSION, oklchToSrgb, parseOklch, resolveTheme, srgbToHex, type Theme, type HooksSummary, type ApprovalPayload, type CommandOutcome, type NoticeCurrent, type ProcessKind, type ProcessReply, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { claimInstance, dataLayout, nodeClocks, readOrMintMachineId, resolveUserDirs, canonicalPath, PreferenceStore, resolvePreferenceRoot, type HandOver } from '@rotaris/platform';
import { ProcessLink, UpdateRelay, type MessagePortLike } from '@rotaris/shell';

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

  // ADR-0002: one run host for the application's lifetime; one workspace service per open workspace.
  const runHostChild = utilityProcess.fork(join(__dirname, 'run-host.js'), [], { serviceName: 'rotaris-run-host' });
  const runHost = new ProcessLink<RunHostRequest>(portOf(runHostChild), clocks.timers);
  runHostChild.on('exit', (code) => log(`run host exited (${code}); NOT re-forked — every in-flight run is lost and settles through stale detection (ADR-0002)`));

  const services = new Map<string, { child: UtilityProcess; link: ProcessLink<WorkspaceServiceRequest> }>();
  let currentWorkspaceId: string | undefined;
  const openWorkspace = async (root: string): Promise<{ workspaceId: string; storeFile: string } | undefined> => {
    const key = canonicalPath(root);
    let svc = services.get(key);
    if (!svc) {
      const child = utilityProcess.fork(join(__dirname, 'workspace-service.js'), [], { serviceName: `rotaris-workspace:${key}` });
      svc = { child, link: new ProcessLink<WorkspaceServiceRequest>(portOf(child), clocks.timers) };
      services.set(key, svc);
      child.on('exit', (code) => { log(`workspace service for ${key} exited (${code})`); services.delete(key); });
      // ADR-0002 c.7 / ADR-0058: the service's narrow requests back to main are forwarded to the run host, bounded.
      svc.link.onAsk((a) => {
        switch (a.kind) {
          case 'runHost.refuseRuns': return runHost.request({ kind: 'workspace.refuseRuns', workspaceId: a.workspaceId, leaseMs: a.leaseMs }, millis(5_000));
          case 'runHost.renewLease': return runHost.request({ kind: 'workspace.renewLease', workspaceId: a.workspaceId, leaseMs: a.leaseMs }, millis(5_000));
          case 'runHost.closeStore': return runHost.request({ kind: 'workspace.closeStore', workspaceId: a.workspaceId }, millis(5_000));
          case 'runHost.release': return runHost.request({ kind: 'workspace.release', workspaceId: a.workspaceId }, millis(5_000));
          case 'runHost.reopen': return runHost.request({ kind: 'workspace.release', workspaceId: a.workspaceId }, millis(5_000));
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
          if (r.kind === 'hooks.summary' && r.summary.status === 'review') raiseNoticeKeyed(`hooks.review:${r.summary.workspace}:${r.summary.fingerprint}`, 'warning', 'Workspace hooks need review', r.summary.notice, recoveryFor('hooks.review'));
        }).catch(() => undefined);
      });
    }
    return { workspaceId: opened.workspaceId, storeFile: opened.storeFile };
  };

  const rhHello = await runHost.request({ kind: 'hello' }, millis(5_000));
  log(`run host: ${JSON.stringify(rhHello)}`);

  const relay = new UpdateRelay();
  // ADR-0049 / REQ-SHELL-114: ONE current persistent notice, owned here; acknowledge is compare-and-clear.
  let noticeSeq = 0;
  let currentNotice: NoticeCurrent['current'] = null;
  const publishNotice = (n: NoticeCurrent['current']) => { currentNotice = n; relay.broadcast(CHANNEL.noticeCurrent, { v: CONTRACT_SCHEMA_VERSION, current: n } satisfies NoticeCurrent); };
  const publishedNoticeKeys = new Set<string>();
  type Recovery = { label: string; command: string }[];
  const raiseNotice = (severity: 'info' | 'warning' | 'error', headline: string, detail?: string, recovery?: Recovery) => {
    publishNotice({ id: ++noticeSeq, severity, headline, ...(detail === undefined ? {} : { detail }), ...(recovery === undefined || recovery.length === 0 ? {} : { recovery }) });
  };
  /** REQ-NOTIFY-224: once per key within this application session; nothing persists across a restart (REQ-NOTIFY-027). */
  const raiseNoticeKeyed = (key: string, severity: 'info' | 'warning' | 'error', headline: string, detail?: string, recovery?: Recovery): boolean => {
    if (publishedNoticeKeys.has(key)) return false;
    publishedNoticeKeys.add(key);
    raiseNotice(severity, headline, detail, recovery);
    return true;
  };
  /** REQ-NOTIFY-223/224: the run host names an action; main maps it to the notice's recovery entry. */
  const recoveryFor = (action: string | undefined): Recovery => action === 'hooks.review' ? [{ label: 'Review hooks', command: 'hooks.review' }] : action === 'hooks.settings' ? [{ label: 'Open hook settings', command: 'hooks.settings' }] : [];
  /**
   * ADR-0019 / REQ-TOOLS-063: main owns the per-window DIALOG QUEUE and nothing else — it never decides.
   * One approval dialog open per window, oldest first by the payload's sequence, the next within 100 ms
   * of the previous closing; a request answered or cancelled elsewhere closes its dialog; an
   * undeliverable answer leaves the dialog open with the buttons disabled. Every dialog is a modal
   * BrowserWindow painting the one renderer bundle with role=approval (ADR-0048, ADR-0056) — never a
   * synchronous native dialog (ADR-0019's prohibition).
   */
  const dialogs = new Map<number, { requestId: string; win: BrowserWindow; answered: boolean }>();
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
      const shown = e.key !== undefined ? raiseNoticeKeyed(e.key, e.severity, e.headline, e.detail, recoveryFor(e.action)) : (raiseNotice(e.severity, e.headline, e.detail, recoveryFor(e.action)), true);
      log(`notice from the run host: ${e.headline}${e.action ? ` [${e.action}]` : ''}${shown ? '' : ' (already shown this session)'}`);
    }
    else if (e.kind === 'run.result') {
      // REQ-SESSION-186 / REQ-NOTIFY-003: the terminal outcome, presented once, at the severity summarisation assigned.
      const sev = e.result.severity === 'error' ? 'error' : e.result.severity === 'warning' ? 'warning' : 'info';
      raiseNotice(sev, e.result.summary, e.result.error ?? undefined);
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
  relay.attach({ id: wcId, send: (c, p) => { if (!win.isDestroyed()) win.webContents.send(c, p); } });
  // ADR-0019 c.1: registration is explicit and prompt — on creation, and revoked on close (the last one closing makes the application unattended).
  parentWindowIds.add(String(wcId));
  void runHost.request({ kind: 'presenter.register', windowId: String(wcId) }, millis(5_000)).catch(() => undefined);
  win.on('closed', () => {
    relay.detach(wcId);
    parentWindowIds.delete(String(wcId));
    void runHost.request({ kind: 'presenter.revoke', windowId: String(wcId) }, millis(5_000)).catch(() => undefined);
  });

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
  const chooseOpen = async (opts: Electron.OpenDialogOptions): Promise<string | null> => {
    const forced = capturing ? process.env['ROTARIS_CAPTURE_RESTORE_FROM'] : undefined;
    if (forced) { log(`capture: open dialog "${opts.title}" → ${forced}`); return forced; }
    const r = await dialog.showOpenDialog(win, opts);
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]!;
  };
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

  const runCommand = async (raw: unknown, senderId = wcId): Promise<CommandOutcome> => {
    const parsed = CommandRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'command.malformed', headline: 'The request could not be read' };
    const req = parsed.data;
    switch (req.kind) {
      case 'approval.payload': {
        const p = dialogPayloads.get(senderId);
        return p ? { ok: true, value: p } : { ok: false, code: 'approval.none', headline: 'This window was not opened for an approval' };
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
      case 'shell.hello': {
        const cb = currentWorkspaceId
          ? await runHost.request({ kind: 'circuit_breaker.status', workspaceId: currentWorkspaceId }, millis(5_000))
          : { kind: 'circuit_breaker.status' as const, enabled: process.env['ROTARIS_CIRCUIT_BREAKER'] !== 'off' };
        return { ok: true, value: { version: app.getVersion(), workspace: currentWorkspace, processes: [...processes, ...services.keys()].map((p) => `svc:${p}`), circuitBreakerArmed: cb.kind === 'circuit_breaker.status' && cb.enabled } };
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
        if (req.key === 'ui/reduced_motion') {
          if (typeof req.value !== 'boolean') return { ok: false, code: 'preference.type', headline: 'Reduce motion requires a boolean value' };
          await preferences.write(req.key, req.value);
        } else {
          if (typeof req.value !== 'string') return { ok: false, code: 'preference.type', headline: 'The Settings category requires a string value' };
          await preferences.write(req.key, req.value);
        }
        return { ok: true };
      }
      case 'session.start': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before starting a run' };
        const r = await runHost.request({ kind: 'session.start', workspaceId: currentWorkspaceId, prompt: req.prompt }, millis(10_000));
        if (r.kind !== 'session.started') {
          // REQ-NOTIFY-003: a refusal is also published as a persistent notice, so it outlives the composer's error line.
          if (r.kind === 'refused') raiseNotice('error', r.headline, r.detail);
          return refusal(r, 'The session could not be started');
        }
        return { ok: true, value: { sessionId: r.sessionId } };
      }
      case 'session.list': {
        if (!currentWorkspaceId) return { ok: false, code: 'workspace.none', headline: 'Open a workspace before browsing sessions' };
        const r = await runHost.request({ kind: 'session.list', workspaceId: currentWorkspaceId }, millis(5_000));
        return r.kind === 'session.list' ? { ok: true, value: { sessions: r.sessions } } : refusal(r, 'The session list could not be loaded');
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
        return { ok: true, value: { sessionId: r.sessionId, settledChildren: r.settledChildren } };
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
        return r.kind === 'control.result' ? { ok: true, value: r.result } : refusal(r, 'The control could not be delivered');
      }
      case 'notice.acknowledge':
        if (currentNotice && currentNotice.id === req.noticeId) publishNotice(null);
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
        relay.subscribe(wcId, req.sessionId);
        const r = await runHost.request({ kind: 'session.attach', sessionId: req.sessionId }, millis(5_000));
        return r.kind === 'ack' ? { ok: true } : refusal(r, 'The session could not be followed');
      }
      case 'session.unsubscribe':
        relay.unsubscribe(wcId, req.sessionId);
        void runHost.request({ kind: 'session.detach', sessionId: req.sessionId }, millis(5_000)).catch(() => undefined);
        return { ok: true };
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

  win.once('ready-to-show', () => win.show());
  if (process.env['ELECTRON_RENDERER_URL']) await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else await win.loadFile(join(__dirname, '../renderer/index.html'));

  if (argvWorkspace) await openWorkspace(argvWorkspace);

  // A verification hook for the walking skeleton and the release gate's first-paint check
  // (REQ-STARTUP-156): capture the painted window to a file and exit. Not a user-facing surface.
  const capture = process.env['ROTARIS_CAPTURE_PNG'];
  if (capture) {
    const { writeFileSync } = await import('node:fs');
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
      clocks.timers.after(millis(resumeWanted ? 2_600 : 800), () => {
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
      clocks.timers.after(millis(600), async () => {
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
    const after = Number(process.env['ROTARIS_CAPTURE_AFTER_MS'] ?? (prompt ? 3_000 : 1_500));
    clocks.timers.after(millis(after), async () => {
      const img = await win.webContents.capturePage();
      writeFileSync(capture, img.toPNG());
      log(`captured ${capture}`);
      app.exit(0);
    });
    }
  }

  app.on('window-all-closed', () => {
    // ADR-0014: quit is main-driven, run-host-executed. The skeleton asks and waits, bounded.
    void runHost.request({ kind: 'shutdown', deadlineMs: 30_000 }, millis(30_000)).catch(() => undefined).then(() => app.quit());
  });
}

void main();
