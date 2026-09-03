import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { millis } from '@rotaris/kernel';
import { CHANNEL, CommandRequestSchema, type CommandOutcome, type ProcessKind, type RunHostRequest, type WorkspaceServiceRequest } from '@rotaris/contracts';
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
    return { workspaceId: opened.workspaceId, storeFile: opened.storeFile };
  };

  const rhHello = await runHost.request({ kind: 'hello' }, millis(5_000));
  log(`run host: ${JSON.stringify(rhHello)}`);

  const relay = new UpdateRelay();
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
      case 'session.subscribe':
        relay.subscribe(wcId, req.sessionId);
        return { ok: true };
      case 'session.unsubscribe':
        relay.unsubscribe(wcId, req.sessionId);
        return { ok: true };
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
    clocks.timers.after(millis(1_500), async () => {
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
