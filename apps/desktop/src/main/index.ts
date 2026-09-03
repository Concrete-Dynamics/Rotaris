import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { millis } from '@rotaris/kernel';
import { CHANNEL, CommandRequestSchema, CONTRACT_SCHEMA_VERSION, type CommandOutcome, type NoticeCurrent, type ProcessKind, type ProcessReply, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';
import { claimInstance, dataLayout, nodeClocks, readOrMintMachineId, resolveUserDirs, canonicalPath, type HandOver } from '@rotaris/platform';
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
    }
    const opened = await svc.link.request({ kind: 'workspace.open', workspaceRoot: key }, millis(10_000));
    if (opened.kind !== 'workspace.opened') { log(`workspace.open refused: ${JSON.stringify(opened)}`); return undefined; }
    // W-18: the run host is HANDED the resolved path; it never reads the identifier file.
    const ack = await runHost.request({ kind: 'workspace.opened', workspaceId: opened.workspaceId, storeFile: opened.storeFile, workspaceRoot: key }, millis(5_000));
    log(`workspace ${key} → ${opened.workspaceId} (schema v${opened.schemaVersion}); run host: ${ack.kind}`);
    if (ack.kind === 'workspace.ack') currentWorkspaceId = opened.workspaceId;
    return { workspaceId: opened.workspaceId, storeFile: opened.storeFile };
  };

  const rhHello = await runHost.request({ kind: 'hello' }, millis(5_000));
  log(`run host: ${JSON.stringify(rhHello)}`);

  const relay = new UpdateRelay();
  // ADR-0049 / REQ-SHELL-114: ONE current persistent notice, owned here; acknowledge is compare-and-clear.
  let noticeSeq = 0;
  let currentNotice: NoticeCurrent['current'] = null;
  const publishNotice = (n: NoticeCurrent['current']) => { currentNotice = n; relay.broadcast(CHANNEL.noticeCurrent, { v: CONTRACT_SCHEMA_VERSION, current: n } satisfies NoticeCurrent); };
  const raiseNotice = (severity: 'info' | 'warning' | 'error', headline: string, detail?: string) => {
    publishNotice({ id: ++noticeSeq, severity, headline, ...(detail === undefined ? {} : { detail }) });
  };
  // ADR-0044: main RELAYS a publication unchanged; the number on it is the run host's.
  runHost.onEvent((e) => {
    if (e.kind === 'publish.increment') relay.relaySequenced(CHANNEL.transcriptIncrement, e.payload);
    else if (e.kind === 'publish.snapshot') relay.relaySequenced(CHANNEL.sessionSnapshot, e.payload);
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
    width: 1280, height: 820, show: false, backgroundColor: '#242424', title: 'Rotaris',
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  // The id is read once, up front: `webContents` on a destroyed window throws, and a throw from a
  // `closed` handler during exit is an uncaught exception, which wedges the process (ADR-0044 note).
  const wcId = win.webContents.id;
  relay.attach({ id: wcId, send: (c, p) => { if (!win.isDestroyed()) win.webContents.send(c, p); } });
  win.on('closed', () => relay.detach(wcId));

  ipcMain.handle(CHANNEL.command, async (_e, raw): Promise<CommandOutcome> => {
    const parsed = CommandRequestSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'command.malformed', headline: 'The request could not be read' };
    const req = parsed.data;
    switch (req.kind) {
      case 'shell.hello':
        return { ok: true, value: { version: app.getVersion(), workspace: currentWorkspace, processes: [...processes, ...services.keys()].map((p) => `svc:${p}`) } };
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
      case 'session.control': {
        // ADR-0010 channel 1 across ADR-0013's boundary: the same arguments, the same `{ok, value?}`.
        const r = await runHost.request({ kind: 'session.control', request: req.request }, millis(10_000));
        return r.kind === 'control.result' ? { ok: true, value: r.result } : refusal(r, 'The control could not be delivered');
      }
      case 'notice.acknowledge':
        if (currentNotice && currentNotice.id === req.noticeId) publishNotice(null);
        return { ok: true };
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
  });

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
    const prompt = process.env['ROTARIS_CAPTURE_PROMPT'];
    if (prompt) {
      // Real input events, not a script: Ctrl+2 opens Workspace (REQ-SHELL-049), Ctrl+L focuses the
      // composer (REQ-CHAT-002), the text is typed, Enter submits (REQ-CHAT-001).
      clocks.timers.after(millis(800), () => {
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

  app.on('window-all-closed', () => {
    // ADR-0014: quit is main-driven, run-host-executed. The skeleton asks and waits, bounded.
    void runHost.request({ kind: 'shutdown', deadlineMs: 30_000 }, millis(30_000)).catch(() => undefined).then(() => app.quit());
  });
}

void main();
