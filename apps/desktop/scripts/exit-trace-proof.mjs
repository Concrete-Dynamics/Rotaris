/**
 * `pnpm exit-trace-proof` — the exit trace's crash handlers fired in the BUILT application (PD-MONITOR-002), free: the
 * scripted client, no provider, no network.
 *
 * `apps/desktop/src/main/index.ts` writes why the process goes away: `before-quit` and `quit` for an orderly close,
 * `render-process-gone` for a renderer lost, `child-process-gone` for a utility child lost, and `process.on('exit')` last
 * (`docs/defects/fixed/process-exit-left-no-diagnosable-trace.md`). The orderly half was measured when it landed; the crash
 * handlers were "argued, not measured", and no proof or live launch killed a process until this one
 * (`docs/defects/fixed/the-exit-trace-crash-handlers-were-never-fired-in-a-built-app.md`). Two driven launches:
 *
 *   1. orderly — launched and quit through the driver: the log carries `quit: exiting with status 0` and
 *                `main process exiting with status 0`, and NO `error` line for a renderer or a child gone. The control for
 *                launch 2: a GONE line at `error` is the crash's, never every launch's.
 *   2. crash   — the run host, whose pid main logs in its `hello` line, is ended with SIGKILL from outside: main writes
 *                `run host exited (9)` and `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)`, both at
 *                `error`, and not "main ended it" (`ChildrenEndedByMain`, `exit.ts`: only a kill main sent itself is
 *                `info`). Main still answers. Then the main window's renderer is crashed with SIGSEGV: main writes
 *                `RENDERER GONE (<reason>, exit <n>) for <its URL>` at `error`. The application's quit is then asked, and
 *                is held by the dead renderer's close guard
 *                (`docs/defects/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`, open: a
 *                NOTE until it is repaired, a check after); the immediate exit ends the launch, exit 0, with
 *                `main process exiting with status 0` among main's last lines.
 *
 * What it cannot fire: `unhandledRejection` and `uncaughtException` in main. Neither can be raised in main from outside the
 * process, and adding a seam that throws inside main to prove a one-line log call is not justified (the repaired note's
 * own reasoning about `forcefullyCrashRenderer`); both stay argued from Node's documented events, not measured.
 *
 * Process discovery: the run host's pid from main's log; the renderer's from the launch's process tree (`/proc` on Linux,
 * `ps` on macOS, CIM on Windows). Only Linux was run when this was written (2026-10-13); the other two are written, not run.
 *
 *   node apps/desktop/scripts/exit-trace-proof.mjs [--skip-build]
 *
 * Evidence: `.proof/exit-trace-proof/` — each launch's application log and `results.json`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { drainGroup, exitWithin, logTail } from './lib/bounded-launch.mjs';
import { endLaunch, startApp, stopApp, stopOverrunMessage, until, within } from './lib/driver.mjs';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';

const output = evidenceDirectory('exit-trace-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const workspace = join(output, 'workspace');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Exit trace proof workspace\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), ['models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', 'mcp_servers:', '  code_intelligence: { enabled: false }', ''].join('\n'));

/** Every process on the host as `{ pid, ppid, command }` — what the renderer's pid is read from. */
function processes() {
  if (process.platform === 'linux') {
    return readdirSync('/proc').filter((d) => /^\d+$/.test(d)).flatMap((pid) => {
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
        return [{ pid: Number(pid), ppid, command: readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ') }];
      } catch { return []; }
    });
  }
  if (process.platform === 'win32') {
    const json = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(json).map((p) => ({ pid: p.ProcessId, ppid: p.ParentProcessId, command: p.CommandLine ?? '' }));
  }
  return execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n').flatMap((line) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }] : [];
  });
}
/** The launch's renderer processes: descendants of its main process started `--type=renderer`. */
function renderersOf(mainPid) {
  const all = processes();
  const ours = new Set([mainPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of all) if (!ours.has(p.pid) && ours.has(p.ppid)) { ours.add(p.pid); grew = true; }
  }
  return all.filter((p) => ours.has(p.pid) && p.pid !== mainPid && /--type=renderer\b/.test(p.command));
}
const logOf = (started) => readFileSync(started.logFile, 'utf8');
/** Main's own lines, as `<level> <message>`: the forwarded children's lines carry their own prefix. */
const mainLines = (log) => log.split('\n').flatMap((line) => { const m = /^\[main [^\]]+\] (\w+)\s+(.*)$/.exec(line); return m ? [{ level: m[1], message: m[2] }] : []; });
const goneAtError = (log) => mainLines(log).filter((l) => l.level === 'error' && /GONE \(/.test(l.message));

const results = {};
// ── 1. orderly: the control ─────────────────────────────────────────────────────────────────────────────
{
  const started = await startApp({ root: join(output, 'orderly'), workspace, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  const stopped = await stopApp(started);
  if (stopped.overran) throw new Error(stopOverrunMessage('orderly', stopped, logOf(started)));
  const log = logOf(started);
  const lines = mainLines(log);
  check('an orderly quit exits 0', stopped.exit?.code === 0, JSON.stringify(stopped.exit));
  check('an orderly quit writes its status and the main process\'s last line', lines.some((l) => l.message === 'quit: exiting with status 0') && lines.some((l) => l.message === 'main process exiting with status 0'), lines.slice(-3).map((l) => l.message).join(' | '));
  check('an orderly quit writes no renderer or child GONE line at error', goneAtError(log).length === 0, goneAtError(log).map((l) => l.message).join(' | ') || 'none');
  results.orderly = { exit: stopped.exit, last: lines.slice(-3).map((l) => `${l.level} ${l.message}`) };
}

// ── 2. crash: the run host killed, then the renderer crashed ────────────────────────────────────────────
{
  const started = await startApp({ root: join(output, 'crash'), workspace, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  const hello = await until(() => /run host hello: \{.*"pid":(\d+)/.exec(logOf(started))?.[1] ?? null, (pid) => pid !== null, { timeoutMs: 30_000, what: 'the run host\'s hello line' });
  const runHostPid = Number(hello);
  process.kill(runHostPid, 'SIGKILL');
  const runHostLines = await until(() => mainLines(logOf(started)).filter((l) => /^run host exited \(|^CHILD PROCESS GONE \(Utility rotaris-run-host:/.test(l.message)), (found) => found.length >= 2, { timeoutMs: 20_000, what: 'main\'s lines for the killed run host' }).catch(() => mainLines(logOf(started)).filter((l) => /run host exited|CHILD PROCESS GONE/.test(l.message)));
  const exited = runHostLines.find((l) => /^run host exited \(/.test(l.message));
  const gone = runHostLines.find((l) => /^CHILD PROCESS GONE \(/.test(l.message));
  check('the run host killed from outside: main writes its exit status at error', exited?.level === 'error' && /^run host exited \(9\)/.test(exited.message), exited ? `${exited.level} ${exited.message}` : 'no line');
  check('…and Electron\'s child-process-gone at error, as a loss main did not cause', gone?.level === 'error' && gone.message === 'CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)', gone ? `${gone.level} ${gone.message}` : 'no line');
  check('main still answers after its run host is gone', (await started.driver.eval('1 + 1').catch((e) => String(e))) === 2);

  const renderers = renderersOf(started.child.pid);
  check('the launch has a renderer to crash', renderers.length >= 1, renderers.map((r) => r.pid).join(', ') || 'none');
  const before = goneAtError(logOf(started)).length;
  for (const r of renderers) { try { process.kill(r.pid, 'SIGSEGV'); } catch { /* gone already */ } }
  const rendererLine = await until(() => mainLines(logOf(started)).find((l) => /^RENDERER GONE \(/.test(l.message)) ?? null, (l) => l !== null, { timeoutMs: 20_000, what: 'main\'s RENDERER GONE line' }).catch(() => null);
  check('the renderer crashed: main writes render-process-gone with its reason, exit code and URL at error', rendererLine?.level === 'error' && /^RENDERER GONE \((crashed|killed|abnormal-exit), exit -?\d+\) for (file|app|http):/.test(rendererLine.message), rendererLine ? `${rendererLine.level} ${rendererLine.message}` : 'no line');
  check('one more GONE line at error than before the renderer crashed', goneAtError(logOf(started)).length > before);

  /*
   * The application's quit after the crash. Measured 2026-10-13: it is HELD — the renderer's close guard is asked through
   * `executeJavaScript` on a frame that is gone, which never settles, and nothing bounds the wait
   * (docs/defects/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md, open). It is asked, bounded,
   * and reported; while that note is open a held quit is a NOTE naming it, and its repair turns this into a check. The
   * launch is then ended by the immediate exit (the driver's `quit` with `immediate`, `app.exit`), whose trace is asserted.
   */
  const guarded = await within(started.driver.quit(), 10_000);
  const guardedExit = await exitWithin(started.child, 15_000);
  const heldNote = 'docs/defects/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md';
  if (guardedExit !== null) check('the application\'s quit after a renderer crash ends the process', guardedExit.code === 0, JSON.stringify(guardedExit));
  else console.log(`NOTE  the application's quit after a renderer crash was held (${guarded === null ? 'unanswered' : 'answered'}, no exit in 15 s) — the open defect ${heldNote}`);
  let ended = guardedExit;
  if (ended === null) {
    await within(started.driver.quit({ immediate: true }), 10_000);
    ended = await exitWithin(started.child, 15_000);
  }
  started.driver.close();
  if (ended === null) { await endLaunch(started.child); throw new Error(`crash: the launch did not exit on the immediate exit either:\n${logTail(logOf(started))}`); }
  await drainGroup(started.child);
  const log = logOf(started);
  const lines = mainLines(log);
  check('after both losses the process exits 0', ended.code === 0, JSON.stringify(ended));
  // `process.on('exit')` is the last line main writes of its own; a child's exit Electron reports in the same turn may follow it.
  const lastOwn = lines.findLastIndex((l) => l.message === 'main process exiting with status 0');
  check('the log ends where the process did: main\'s exit line comes after the losses, and nothing of main\'s own work after it', lastOwn > lines.findIndex((l) => /^RENDERER GONE \(/.test(l.message)) && lines.slice(lastOwn + 1).every((l) => /^quit: exiting with status \d+$|^workspace service for .* exited \(\d+\)$/.test(l.message)), lines.slice(-3).map((l) => l.message).join(' | '));
  results.crash = { runHostPid, runHost: runHostLines.map((l) => `${l.level} ${l.message}`), renderers: renderers.map((r) => r.pid), renderer: rendererLine ? `${rendererLine.level} ${rendererLine.message}` : null, guardedQuit: guardedExit === null ? { held: true, note: heldNote } : { held: false, exit: guardedExit }, exit: ended, last: lines.slice(-3).map((l) => `${l.level} ${l.message}`) };
}

results.checks = checks;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length === 0 ? `exit-trace-proof: PASS (${checks.length} checks)` : `exit-trace-proof: FAIL (${failed.length} of ${checks.length})`);
process.exitCode = failed.length === 0 ? 0 : 1;
