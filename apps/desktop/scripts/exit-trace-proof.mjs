// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091): its types are owed, and the list only shrinks.
/**
 * `pnpm exit-trace-proof` — the exit trace's crash handlers fired in the BUILT application (PD-MONITOR-002), free: the
 * scripted client, no provider, no network.
 *
 * `apps/desktop/src/main/index.ts` writes why the process goes away: `before-quit` and `quit` for an orderly close,
 * `render-process-gone` for a renderer lost, `child-process-gone` for a utility child lost, and `process.on('exit')` last
 * (`docs/archive/defects/process-exit-left-no-diagnosable-trace.md`). The orderly half was measured when it landed; the crash
 * handlers were "argued, not measured", and no proof or live launch killed a process until this one
 * (`docs/archive/defects/the-exit-trace-crash-handlers-were-never-fired-in-a-built-app.md`). Twelve driven launches:
 *
 *   1. orderly — launched and quit through the driver: the log carries `quit: exiting with status 0` and
 *                `main process exiting with status 0`, and NO `error` line for a renderer or a child gone. The control for
 *                launch 2: a GONE line at `error` is the crash's, never every launch's.
 *   2. crash   — the run host, whose pid main logs in its `hello` line, is ended with SIGKILL from outside: main writes
 *                `run host exited (9)` and `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit 9)`, both at
 *                `error`, and not "main ended it" (`ChildrenEndedByMain`, `exit.ts`: only a kill main sent itself is
 *                `info`). Main still answers, and (OQ-462, ruled 2026-11-01) the person is told: ONE error notice "The run
 *                host stopped" with a dismiss and no action, and a submit after it is refused at once with the draft kept.
 *                Then the main window's renderer is crashed with SIGSEGV: main writes
 *                `RENDERER GONE (<reason>, exit <n>) for <its URL>` at `error`. The application's quit (`app.quit()`,
 *                a quit from outside any window) is then asked, and ends the process: since OQ-298's ruling it asks no
 *                close guard at all (`quitGuardsOutsideAnyWindow`, `exit.ts`), the window closes, and the orderly shutdown
 *                runs to `quit: exiting with status 0` and `main process exiting with status 0`, exit 0. Until 2026-10-14
 *                the dead renderer's guard was asked and its question never answered, and the quit was held for good
 *                (`docs/archive/defects/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`); from
 *                then until OQ-298 a guard that could not answer allowed. Should the quit be held again the check fails,
 *                and the immediate exit ends the launch for its trace.
 *
 *   3. hang    — the main window's renderer stopped with SIGSTOP (alive, answering nothing), then the driver's quit. Since
 *                OQ-298 (2026-10-14, R-072) the quit asks no close guard, so it waits for no renderer: main writes the
 *                OQ-298 line, no PD-SHELL-010 `warn` line, and exits 0 well under `RENDERER_LIVENESS_BOUND_MS` (5 s).
 *                Under PD-SHELL-010 alone (fin44) the same quit asked the guard and was released by the liveness probe
 *                after about 5.6 s (`docs/archive/defects/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md`).
 *   4. hang-close — the same hang, then the host's close of the window (the driver's `closeWindow`,
 *                `BrowserWindow.close()`): a person's close, which still asks the renderer's guard (REQ-SHELL-119 guard (1))
 *                and is released by the liveness probe (PD-SHELL-010's built-app measure), ending the application with its
 *                last window.
 *   5. unsaved — OQ-298: a main window whose renderer's unsaved-settings guard would never answer
 *                (`window.__rotarisCloseGuard`, a promise that never settles — what a dirty Settings form's guard is until
 *                a person answers Save/Discard/Cancel). Quit once through the driver (`unsaved-quit`) and once by SIGTERM to
 *                main (`unsaved-sigterm`): each exits 0 through the orderly path (`quit: exiting with status 0`) with the
 *                OQ-298 line, shows no dialog, and leaves the workspace configuration file byte-identical.
 *   6. last-resort — R-091 (hardening §3.2 row 1): a throw in the run host and a rejection in the workspace service that no
 *                request path catches (the seam `ROTARIS_CAPTURE_CHILD_FAULT`, compiled out of a packaged build), one launch
 *                each: the child writes ONE `error` line through main's log with the stack and exits 70, which main reads as
 *                its last-resort handler's; the application still answers and quits with 0.
 *   7. main-killed — main killed from outside: the run host and the workspace service, which probe main's pid every 250 ms,
 *                are gone within 2,000 ms (`RUN_HOST_END_BOUND_MS`), since Electron's parent port emits no `close`.
 *   8. not-ready — OQ-462 (2): a run host, then a workspace service, that never answers its `hello` (the seam's `silent`): the
 *                window still paints, main ends the child at the 5 s bound with no unhandled rejection, the run host's miss
 *                raises "The run host did not start" and refuses every later request at once, the service's refuses its
 *                open with the transient "The project could not be opened" and no notice, and the application quits 0.
 *   9. render-fault — R-091 (hardening §3.2 row 4): a component in the main window throws while it is drawn (the renderer
 *                seam `window.__rotarisRenderFault`, compiled out of a packaged build): the window draws the error boundary's
 *                fallback with "Reload this window" instead of going blank, main writes ONE `error` line carrying the error and
 *                the component stack, and the reload draws the shell again under the persistent error notice
 *                "This window stopped drawing", whose detail carries the error and the stack.
 *
 * What it cannot fire: `unhandledRejection` and `uncaughtException` in main. Neither can be raised in main from outside the
 * process, and adding a seam that throws inside main to prove a one-line log call is not justified (the repaired note's
 * own reasoning about `forcefullyCrashRenderer`); both stay argued from Node's documented events, not measured.
 *
 * Process discovery: the run host's pid from main's log; the renderer's from the launch's process tree (`/proc` on Linux,
 * `ps` on macOS, CIM on Windows). Only Linux was run when this was written (2026-10-13); the other two are written, not run.
 * *Windows was run 2026-10-20 (the Windows ARM64 session's C4) and met every product reading, but the proof's signals were
 * Linux's: Node on Windows sends only SIGINT, SIGTERM, SIGKILL and 0, each of the last three `TerminateProcess` with exit 1
 * (`docs/archive/defects/exit-trace-proof-expects-posix-signal-semantics-on-windows.md`).* So on Windows a kill from outside is
 * expected as exit 1 (`KILL_EXIT`), the renderer's crash is `TerminateProcess` (`process.kill(pid)`), the hang is the process
 * suspended with `NtSuspendProcess` (what Sysinternals' `pssuspend` does) and resumed after, and `unsaved-sigterm` measures
 * what Windows does with the signal — the process terminated, not quit — since no signal there reaches a quit path. macOS
 * is still written, not run.
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
const WINDOWS = process.platform === 'win32';
/** The exit status main is given for a process killed from outside: the signal's number on POSIX, `TerminateProcess`'s 1 on Windows. */
const KILL_EXIT = WINDOWS ? 1 : 9;
/**
 * Stop (`suspended` true) or continue the given processes: SIGSTOP/SIGCONT on POSIX; on Windows, which has neither, every
 * thread suspended or resumed through `NtSuspendProcess`/`NtResumeProcess`, so the renderer is alive and answers nothing.
 */
function setSuspended(pids, suspended) {
  if (!WINDOWS) {
    for (const pid of pids) { try { process.kill(pid, suspended ? 'SIGSTOP' : 'SIGCONT'); } catch { /* gone */ } }
    return;
  }
  if (pids.length === 0) return;
  const call = suspended ? 'NtSuspendProcess' : 'NtResumeProcess';
  const script = [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class S {",
    '[DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint a, bool i, int p);',
    '[DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);',
    `[DllImport("ntdll.dll")] public static extern int ${call}(IntPtr h); }'`,
    // 0x0800 is PROCESS_SUSPEND_RESUME.
    `foreach ($p in @(${pids.join(',')})) { $h = [S]::OpenProcess(0x0800, $false, $p); if ($h -ne [IntPtr]::Zero) { [void][S]::${call}($h); [void][S]::CloseHandle($h) } }`,
  ].join('\n');
  try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', timeout: 30_000 }); } catch { /* gone, or not ours */ }
}
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
/** The persistent notice on screen (REQ-NOTIFY-023): its title, detail, severity, and whether it carries an action. */
const READ_NOTICE = `(() => { const n = document.querySelector('[data-testid="notice"]'); if (!n) return null; return { title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, message: n.querySelector('[data-testid="notice-message"]')?.textContent ?? null, detail: n.querySelector('[data-testid="notice-detail"]')?.textContent ?? null, severity: n.dataset.severity ?? null, action: n.querySelector('.notice__action') !== null, dismiss: n.querySelector('.notice__dismiss') !== null }; })()`;
/** The composer's draft and the error line under it. */
const READ_COMPOSER = `(() => { const t = document.querySelector('textarea.composer__input'); if (!t) return null; const e = t.closest('.composer')?.querySelector('.composer__error') ?? document.querySelector('.composer__error'); return { text: t.value, error: e ? e.textContent : null }; })()`;
/** The transient acknowledgements on screen (REQ-SHELL-112). */
const READ_ACKS = `[...document.querySelectorAll('[data-testid="acknowledgement-title"]')].map((e) => e.textContent)`;

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
  check('the run host killed from outside: main writes its exit status at error', exited?.level === 'error' && exited.message.startsWith(`run host exited (${KILL_EXIT})`), exited ? `${exited.level} ${exited.message}` : 'no line');
  check('…and Electron\'s child-process-gone at error, as a loss main did not cause', gone?.level === 'error' && gone.message === `CHILD PROCESS GONE (Utility rotaris-run-host: killed, exit ${KILL_EXIT})`, gone ? `${gone.level} ${gone.message}` : 'no line');
  check('main still answers after its run host is gone', (await started.driver.eval('1 + 1').catch((e) => String(e))) === 2);
  // OQ-462 (1), ruled 2026-11-01: ONE error notice for the loss, naming the process and saying it stopped, with no action.
  const lostNotice = await until(() => started.driver.eval(READ_NOTICE).catch(() => null), (n) => n?.title === 'The run host stopped', { timeoutMs: 15_000, what: 'the run host\'s loss notice' }).catch(() => null);
  check('OQ-462 (1): the person is told — one error notice "The run host stopped", a dismiss and no action, the status and pid in its detail', lostNotice?.severity === 'error' && lostNotice.action === false && lostNotice.dismiss === true && new RegExp(`pid \\d+ exited with status ${KILL_EXIT}`).test(lostNotice.detail ?? ''), JSON.stringify(lostNotice));
  // OQ-462 (3): a submit is refused at once — no ProcessLink bound waited out — and the composer keeps its draft.
  await started.driver.click('.nav-item', { text: 'Workspace' });
  await started.driver.click('textarea.composer__input');
  const submittedAt = Date.now();
  await started.driver.type('kept after the run host is gone', { enter: true });
  const refused = await until(() => started.driver.eval(READ_COMPOSER).catch(() => null), (c) => c !== null && c.error !== null, { timeoutMs: 15_000, what: 'the submit\'s refusal' }).catch(() => null);
  const refusedMs = Date.now() - submittedAt;
  // The proof's workspace is no Git repository, so a submit is refused by the session's worktree before the run host is
  // asked; that the draft stays is the ruling's clause, and the run host's own refusal is read through a command below.
  check('OQ-462 (3): a submit after the loss is refused, and the composer keeps its draft', refused?.text === 'kept after the run host is gone' && refusedMs < 5_000, `${JSON.stringify(refused)} after ${refusedMs} ms`);
  const listAskedAt = Date.now();
  const listed = await started.driver.command({ kind: 'session.list' }).catch((e) => ({ error: String(e) }));
  const listedMs = Date.now() - listAskedAt;
  check('OQ-462 (3): a request that reaches the run host is refused at once, as `runHost.gone`', listed?.ok === false && listed.code === 'runHost.gone' && listedMs < 3_000, `${JSON.stringify(listed).slice(0, 240)} after ${listedMs} ms`);
  const lostNotices = mainLines(logOf(started)).filter((l) => /^notice: The run host /.test(l.message));
  check('OQ-462 (1): one notice per loss, written to the log at error', lostNotices.length === 1 && lostNotices[0].level === 'error', lostNotices.map((l) => `${l.level} ${l.message}`).join(' | ') || 'none');

  const renderers = renderersOf(started.child.pid);
  check('the launch has a renderer to crash', renderers.length >= 1, renderers.map((r) => r.pid).join(', ') || 'none');
  const before = goneAtError(logOf(started)).length;
  // SIGSEGV on POSIX; on Windows, which cannot send it, `TerminateProcess` — a renderer lost from outside either way.
  for (const r of renderers) { try { process.kill(r.pid, WINDOWS ? undefined : 'SIGSEGV'); } catch { /* gone already */ } }
  const rendererLine = await until(() => mainLines(logOf(started)).find((l) => /^RENDERER GONE \(/.test(l.message)) ?? null, (l) => l !== null, { timeoutMs: 20_000, what: 'main\'s RENDERER GONE line' }).catch(() => null);
  check('the renderer crashed: main writes render-process-gone with its reason, exit code and URL at error', rendererLine?.level === 'error' && /^RENDERER GONE \((crashed|killed|abnormal-exit), exit -?\d+\) for (file|app|http):/.test(rendererLine.message), rendererLine ? `${rendererLine.level} ${rendererLine.message}` : 'no line');
  check('one more GONE line at error than before the renderer crashed', goneAtError(logOf(started)).length > before);

  /*
   * The application's quit after the crash. Measured 2026-10-13 (fin42): it was HELD — the renderer's close guard was asked
   * through `executeJavaScript` on a frame that is gone, which never settles, and nothing bounded the wait. Repaired
   * 2026-10-14 (docs/archive/defects/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md): a renderer
   * that is gone cannot answer, so its guard allows. The quit must now end the process through the orderly shutdown; if
   * it is held, the check fails and the immediate exit (the driver's `quit` with `immediate`, `app.exit`) ends the launch.
   */
  const guarded = await within(started.driver.quit(), 10_000);
  const guardedExit = await exitWithin(started.child, 30_000);
  check('the application\'s quit after a renderer crash ends the process, exit 0', guardedExit?.code === 0, guardedExit === null ? `held (${guarded === null ? 'unanswered' : 'answered'}, no exit in 30 s)` : JSON.stringify(guardedExit));
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
  check('the quit took the orderly path: the windows closed in clause 9\'s order asking no guard (OQ-298), and main wrote `quit: exiting with status 0`', guardedExit !== null && lines.some((l) => /^quit: closing 1 main window\(s\) through their close guards first/.test(l.message)) && lines.some((l) => l.message === 'quit: exiting with status 0'), lines.filter((l) => /^quit: /.test(l.message)).map((l) => l.message).join(' | ') || 'no quit line');
  // `process.on('exit')` is the last line main writes of its own; a child's exit Electron reports in the same turn may follow it.
  const lastOwn = lines.findLastIndex((l) => l.message === 'main process exiting with status 0');
  check('the log ends where the process did: main\'s exit line comes after the losses, and nothing of main\'s own work after it', lastOwn > lines.findIndex((l) => /^RENDERER GONE \(/.test(l.message)) && lines.slice(lastOwn + 1).every((l) => /^quit: exiting with status \d+$|^workspace service for .* exited \(\d+\)(, an orderly end)?$/.test(l.message)), lines.slice(-3).map((l) => l.message).join(' | '));
  results.crash = { runHostPid, runHost: runHostLines.map((l) => `${l.level} ${l.message}`), renderers: renderers.map((r) => r.pid), renderer: rendererLine ? `${rendererLine.level} ${rendererLine.message}` : null, guardedQuit: guardedExit === null ? { held: true } : { held: false, exit: guardedExit }, exit: ended, last: lines.slice(-3).map((l) => `${l.level} ${l.message}`) };
}

// ── 3 and 4. hang: the main window's renderer stopped (SIGSTOP), then the application's quit, or a person's close ──────
/*
 * PD-SHELL-010 (OQ-297, the consortium's HR1). A renderer that is alive but hung is not gone: until 2026-10-14 its close
 * guard's question was waited for with no bound, and it held the application's quit and a person's close of its window
 * (docs/archive/defects/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md). Main now asks a liveness probe of
 * its own beside the guard's question; unanswered within RENDERER_LIVENESS_BOUND_MS (5 s) the renderer cannot answer, its
 * guard allows, and main says so at `warn`. SIGSTOP is the hang: the renderer's process is alive and answers nothing.
 *
 *   3. hang       — the driver's quit (`app.quit()`) ends the process, exit 0, through the orderly path, within 15 s.
 *   4. hang-close — the host's close of the window (`BrowserWindow.close()`, what Alt+F4 or the taskbar sends: the title
 *                   bar's own close control is the hung renderer's to press) closes it as a person's close; it was the
 *                   last window, so the application ends the same way.
 *
 * The stopped renderers are continued once the launch has ended (or been ended), so no stopped process outlives the proof.
 */
const LIVENESS_BOUND_MS = 5_000;
/** OQ-298's line: main's `before-quit` says each close guard allows without a question (until 2026-10-14, fin46: "no close guard is asked"). */
const OQ298_LINE = 'quit: started outside any window; each close guard allows without a question, so no Save/Discard/Cancel or active-run box is shown, and unsaved settings, if any, stay unsaved (OQ-298)';
const hangWarned = (lines) => lines.filter((l) => l.level === 'warning' && /^main window \d+: close guard: the renderer cannot answer: unresponsive \(no answer to the liveness probe within 5000 ms\); its guard allows \(PD-SHELL-010\)/.test(l.message));
for (const [name, how] of [['hang', 'quit'], ['hang-close', 'close']]) {
  const started = await startApp({ root: join(output, name), workspace, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  const renderers = renderersOf(started.child.pid);
  check(`${name}: the launch has a renderer to hang`, renderers.length >= 1, renderers.map((r) => r.pid).join(', ') || 'none');
  setSuspended(renderers.map((r) => r.pid), true);
  check(`${name}: the stopped renderer answers nothing`, (await within(started.driver.eval('1 + 1').catch((e) => String(e)), 2_000)) === null);
  const askedAt = Date.now();
  const asked = how === 'quit' ? await within(started.driver.quit(), 10_000) : await within(started.driver.closeWindow().catch((e) => ({ error: String(e) })), 10_000);
  const exited = await exitWithin(started.child, 15_000);
  const tookMs = exited === null ? null : Date.now() - askedAt;
  check(
    how === 'quit' ? `${name}: the application's quit with its renderer hung ends the process, exit 0, within 15 s` : `${name}: a person's close of the window whose renderer hangs closes it, and the application ends, exit 0, within 15 s`,
    exited?.code === 0,
    exited === null ? `held (${asked === null ? 'unanswered' : `answered ${JSON.stringify(asked)}`}, no exit in 15 s)` : `${JSON.stringify(exited)} after ${tookMs} ms`,
  );
  let ended = exited;
  if (ended === null) {
    await within(started.driver.quit({ immediate: true }), 10_000);
    ended = await exitWithin(started.child, 15_000);
  }
  started.driver.close();
  setSuspended(renderers.map((r) => r.pid), false);
  if (ended === null) { await endLaunch(started.child); throw new Error(`${name}: the launch did not exit on the immediate exit either:\n${logTail(logOf(started))}`); }
  await drainGroup(started.child);
  const leftover = renderers.filter((r) => { try { process.kill(r.pid, 0); return true; } catch { return false; } });
  for (const r of leftover) { try { process.kill(r.pid, 'SIGKILL'); } catch { /* gone */ } }
  const lines = mainLines(logOf(started));
  const warned = hangWarned(lines);
  if (how === 'quit') check(`${name}: no renderer was asked, so main writes no PD-SHELL-010 warn line`, warned.length === 0 && !lines.some((l) => /PD-SHELL-010/.test(l.message)), warned.map((l) => `${l.level} ${l.message}`).join(' | ') || 'none');
  else check(`${name}: main writes at warn which signal fired — the liveness probe unanswered within ${LIVENESS_BOUND_MS} ms`, warned.length === 1, warned.map((l) => `${l.level} ${l.message}`).join(' | ') || 'no line');
  if (how === 'quit') {
    // OQ-298: the quit from outside any window asks no guard, so the hung renderer holds it for no bound and no probe.
    check(`${name}: no close guard put a question to the quit — well under the probe's ${LIVENESS_BOUND_MS} ms bound`, tookMs !== null && tookMs < LIVENESS_BOUND_MS, tookMs === null ? 'no exit' : `${tookMs} ms from the quit to the exit`);
    check(`${name}: the quit took the orderly path and said no close guard put a question: the OQ-298 line, and \`quit: exiting with status 0\``, exited !== null && lines.some((l) => /^quit: closing 1 main window\(s\) through their close guards first/.test(l.message)) && lines.some((l) => l.message === OQ298_LINE) && lines.some((l) => l.message === 'quit: exiting with status 0'), lines.filter((l) => /^quit: /.test(l.message)).map((l) => l.message).join(' | ') || 'no quit line');
  } else {
    check(
      `${name}: the close waited for the probe's bound and no longer`,
      tookMs !== null && tookMs >= LIVENESS_BOUND_MS - 500 && tookMs < 15_000,
      tookMs === null ? 'no exit' : `${tookMs} ms from the ${how} to the exit`,
    );
    check(`${name}: the close was a person's, not the application's quit: no guarded quit was started, and main wrote \`quit: exiting with status 0\``, exited !== null && !lines.some((l) => /^quit: closing \d+ main window\(s\) through their close guards first/.test(l.message)) && lines.some((l) => l.message === 'quit: exiting with status 0'), lines.filter((l) => /^quit: /.test(l.message)).map((l) => l.message).join(' | ') || 'no quit line');
  }
  check(`${name}: main's last line of its own is its exit`, lines.some((l) => l.message === 'main process exiting with status 0'), lines.slice(-3).map((l) => l.message).join(' | '));
  results[name] = { renderers: renderers.map((r) => r.pid), asked, exit: ended, tookMs, leftoverRenderers: leftover.map((r) => r.pid), warned: warned.map((l) => `${l.level} ${l.message}`), last: lines.slice(-4).map((l) => `${l.level} ${l.message}`) };
}

// ── 5. unsaved: a renderer guard that would never answer, then the quit from outside any window (OQ-298) ─────────────
/*
 * OQ-298, ruled 2026-10-14 under R-072: a quit that starts outside any window asks no close guard, so unsaved settings stay
 * unsaved and nothing is written. The renderer's guard is replaced by one that never settles — a dirty Settings form's guard
 * is exactly that until a person answers its Save/Discard/Cancel — so a quit that asked it would be held for good, as the
 * build before the ruling was. Twice: the driver's quit (`app.quit()`), and SIGTERM sent to main (Electron's quit on a signal).
 */
const configFile = join(workspace, '.rotaris', 'agents.yaml');
for (const [name, how] of [['unsaved-quit', 'driver'], ['unsaved-sigterm', 'sigterm']]) {
  const started = await startApp({ root: join(output, name), workspace, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  const before = readFileSync(configFile);
  // ONE expression: the driver evaluates what it is given as an expression (workspace-proof's veto launch says why).
  const armed = await started.driver.eval('Boolean(window.__rotarisCloseGuard = () => new Promise(() => undefined))').catch((e) => String(e));
  check(`${name}: the renderer's close guard now never answers`, armed === true, JSON.stringify(armed));
  const dialogBefore = await started.driver.eval('document.querySelectorAll(".dialog-title").length').catch(() => null);
  const askedAt = Date.now();
  if (how === 'driver') await within(started.driver.quit(), 10_000);
  else process.kill(started.child.pid, 'SIGTERM');
  const exited = await exitWithin(started.child, 20_000);
  const tookMs = exited === null ? null : Date.now() - askedAt;
  let ended = exited;
  if (ended === null) {
    await within(started.driver.quit({ immediate: true }), 10_000);
    ended = await exitWithin(started.child, 15_000);
  }
  started.driver.close();
  if (ended === null) { await endLaunch(started.child); throw new Error(`${name}: the launch did not exit on the immediate exit either:\n${logTail(logOf(started))}`); }
  await drainGroup(started.child);
  const lines = mainLines(logOf(started));
  const after = readFileSync(configFile);
  if (how === 'sigterm' && WINDOWS) {
    // Windows: SIGTERM is TerminateProcess — the process ends at once with exit 1 and runs no quit path, so nothing asks a guard.
    check(`${name}: on Windows the signal terminates the process (exit 1) and runs no quit path`, exited?.code === 1 && !lines.some((l) => /^quit: /.test(l.message)), exited === null ? 'held: no exit in 20 s' : `${JSON.stringify(exited)} after ${tookMs} ms; ${lines.filter((l) => /^quit: /.test(l.message)).map((l) => l.message).join(' | ') || 'no quit line'}`);
  } else {
    check(`${name}: the quit with a guard that never answers ends the process, exit 0`, exited?.code === 0, exited === null ? 'held: no exit in 20 s' : `${JSON.stringify(exited)} after ${tookMs} ms`);
    check(`${name}: it took the orderly path and no close guard put a question: the OQ-298 line, and \`quit: exiting with status 0\``, exited !== null && lines.some((l) => l.message === OQ298_LINE) && lines.some((l) => l.message === 'quit: exiting with status 0'), lines.filter((l) => /^quit: /.test(l.message)).map((l) => l.message).join(' | ') || 'no quit line');
  }
  check(`${name}: no dialog was shown, and no close guard was asked of the renderer`, dialogBefore === 0 && !lines.some((l) => /close guard: the renderer|PD-SHELL-010|a close guard refused/.test(l.message)), `${dialogBefore} dialog title(s) before the quit; ${lines.filter((l) => /close guard/.test(l.message)).map((l) => l.message).join(' | ') || 'no close-guard line'}`);
  check(`${name}: the workspace configuration file is byte-identical — nothing unsaved was written`, Buffer.compare(before, after) === 0, `${before.length} bytes before, ${after.length} after`);
  results[name] = { exit: ended, tookMs, armed, dialogBefore, configUnchanged: Buffer.compare(before, after) === 0, last: lines.slice(-4).map((l) => `${l.level} ${l.message}`) };
}

// ── 6. last-resort: a throw in the run host, and a rejection in the workspace service, that no request path catches ───────
/*
 * R-091 (hardening §3.2 row 1): each utility process ends on its last-resort handler with ONE `error` line through main's
 * log, carrying the stack, and status 70, which main reads as that handler's (`childExitReading`, `exit.ts`). The fault is
 * the verification seam `ROTARIS_CAPTURE_CHILD_FAULT` (`injectChildFault`, `@rotaris/platform`), compiled out of a packaged
 * build, armed late enough that the launch has opened its window first. The application then still quits orderly.
 */
const CHILD_FAULT_AFTER_MS = 15_000;
for (const [name, spec, source, event, exitPattern] of [
  ['last-resort-run-host', `run-host:uncaught:${CHILD_FAULT_AFTER_MS}`, 'run host', 'an uncaught exception', /^run host exited \(70\), its last-resort handler/],
  ['last-resort-workspace-service', `workspace-service:rejection:${CHILD_FAULT_AFTER_MS}`, 'workspace service', 'an unhandled rejection', /^workspace service for .* exited \(70\), its last-resort handler/],
]) {
  const started = await startApp({ root: join(output, name), workspace, extra: { ROTARIS_CAPTURE_CHILD_FAULT: spec }, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  const found = await until(() => mainLines(logOf(started)).filter((l) => l.message.startsWith(`${source}: ${event} reached the ${source}'s last-resort handler`) || exitPattern.test(l.message)), (f) => f.length >= 2, { timeoutMs: CHILD_FAULT_AFTER_MS + 30_000, what: `the ${source}'s last-resort line and its exit` }).catch(() => []);
  const handler = found.filter((l) => l.message.startsWith(`${source}: ${event}`));
  const exited = found.find((l) => exitPattern.test(l.message));
  // The stack's frames follow on lines of their own, which `mainLines` reads as main's continuation lines: the first line names the error.
  check(`${name}: the ${source} writes ONE error line through main's log, naming the error`, handler.length === 1 && handler[0].level === 'error' && /ending with status 70 \(R-091, ADR-0002\): Error: child fault: /.test(handler[0].message), handler.map((l) => `${l.level} ${l.message.slice(0, 240)}`).join(' | ') || 'no line');
  check(`${name}: …with the stack after it`, new RegExp(`\\n\\[main [^\\]]+\\] error\\s+${source}: \\s*at `).test(logOf(started).slice(logOf(started).indexOf(`${event} reached the ${source}'s last-resort handler`))), 'the frames that follow the line');
  check(`${name}: main reads its exit as the last-resort handler's, status 70, at error`, exited?.level === 'error', exited ? `${exited.level} ${exited.message}` : 'no line');
  check(`${name}: main still answers`, (await started.driver.eval('1 + 1').catch((e) => String(e))) === 2);
  const stopped = await stopApp(started);
  if (stopped.overran) throw new Error(stopOverrunMessage(name, stopped, logOf(started)));
  check(`${name}: the application then quits, exit 0`, stopped.exit?.code === 0, JSON.stringify(stopped.exit));
  results[name] = { spec, handler: handler.map((l) => `${l.level} ${l.message}`), exited: exited ? `${exited.level} ${exited.message}` : null, exit: stopped.exit };
}

// ── 7. main killed: both utility processes end within RUN_HOST_END_BOUND_MS ─────────────────────────────────────────────
/*
 * R-091 (hardening §3.2 row 1; docs/defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md):
 * main is killed from outside (SIGKILL; on Windows `TerminateProcess`, what `taskkill /F` sends), and each utility process —
 * which probes its parent's pid every 250 ms (`watchParent`, `@rotaris/platform`) — must be gone within 2,000 ms of the kill
 * (`RUN_HOST_END_BOUND_MS`, `exit.ts`). Electron's parent port emits no `close` for this (measured 2026-11-03), so this is the
 * mechanism's only end-to-end reading. Liveness is probed with signal 0, every 25 ms.
 */
{
  const RUN_HOST_END_BOUND_MS = 2_000;
  const started = await startApp({ root: join(output, 'main-killed'), workspace, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  await until(() => /run host: workspace\.ack/.test(logOf(started)), (ok) => ok, { timeoutMs: 30_000, what: 'the workspace opened' }).catch(() => false);
  const mainPid = started.child.pid;
  const children = processes().filter((p) => p.ppid === mainPid && /--utility-sub-type=node\.mojom\.NodeService/.test(p.command)).map((p) => p.pid);
  check('main-killed: the launch has a run host and a workspace service to watch', children.length >= 2, children.join(', ') || 'none');
  const goneAfter = new Map();
  const exitCodes = new Map();
  const survivors = [];
  if (WINDOWS) {
    /*
     * On Windows a pid is recycled within seconds on a busy host, so signal 0 on a pid can read a newcomer as the child
     * (2026-11-04: one child "still running 10 s after the kill" that no repetition by hand reproduced). PowerShell opens
     * each child's handle first, then kills main and waits on the handles, which also gives each exit code (69 is the
     * child's own parent watch; Chromium ending it first reads otherwise).
     */
    const script = [
      `$h = @{}; foreach ($i in @(${children.join(',')})) { try { $p = Get-Process -Id $i -ErrorAction Stop; [void]$p.Handle; $h[[int]$i] = $p } catch { } }`,
      '$sw = [Diagnostics.Stopwatch]::StartNew()',
      `Stop-Process -Id ${mainPid} -Force`,
      '$out = @{}',
      'while ($out.Count -lt $h.Count -and $sw.ElapsedMilliseconds -lt 10000) { foreach ($k in @($h.Keys)) { if (-not $out.ContainsKey($k) -and $h[$k].HasExited) { $out[$k] = @{ ms = $sw.ElapsedMilliseconds; code = $h[$k].ExitCode } } }; Start-Sleep -Milliseconds 10 }',
      '$out.GetEnumerator() | ForEach-Object { "{0} {1} {2}" -f $_.Key, $_.Value.ms, $_.Value.code }',
      // A child still running is described, so a red here says what the process was doing: its CPU time, its threads by state, its children.
      'foreach ($k in @($h.Keys)) { if (-not $out.ContainsKey($k)) { $p = $h[$k]; $p.Refresh(); "survivor {0}: cpu {1}; threads {2}; {3}; children {4}" -f $k, $p.TotalProcessorTime, $p.Threads.Count, (($p.Threads | Group-Object ThreadState, WaitReason | ForEach-Object { "{0}x {1}" -f $_.Count, $_.Name }) -join ", "), ((Get-CimInstance Win32_Process -Filter "ParentProcessId=$k" | ForEach-Object { "{0} {1}" -f $_.ProcessId, $_.Name }) -join ", ") } }',
    ].join('\n');
    const lines = (() => { try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 60_000 }); } catch (e) { return String(e.stdout ?? ''); } })();
    for (const line of lines.split(/\r?\n/)) { const m = /^(\d+) (\d+) (-?\d+)$/.exec(line.trim()); if (m) { goneAfter.set(Number(m[1]), Number(m[2])); exitCodes.set(Number(m[1]), Number(m[3])); } }
    survivors.push(...lines.split(/\r?\n/).filter((l) => l.startsWith('survivor ')));
  } else {
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
    const killedAt = Date.now();
    process.kill(mainPid, 'SIGKILL');
    while (goneAfter.size < children.length && Date.now() - killedAt < 10_000) {
      for (const pid of children) if (!goneAfter.has(pid) && !alive(pid)) goneAfter.set(pid, Date.now() - killedAt);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  started.driver.close();
  await drainGroup(started.child);
  const readings = children.map((pid) => `${pid}: ${goneAfter.has(pid) ? `gone ${goneAfter.get(pid)} ms after the kill${exitCodes.has(pid) ? `, exit ${exitCodes.get(pid)}` : ''}` : 'still running 10 s after the kill'}`);
  check(`main-killed: every utility process is gone within ${RUN_HOST_END_BOUND_MS} ms of main's kill`, children.length >= 2 && children.every((pid) => (goneAfter.get(pid) ?? Infinity) <= RUN_HOST_END_BOUND_MS), [...readings, ...survivors].join('; '));
  for (const pid of children) if (!goneAfter.has(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  results['main-killed'] = { mainPid, children: readings, survivors };
}

// ── 8. not-ready: a run host, then a workspace service, that never answers its hello (OQ-462 (2)) ─────────────────────────
/*
 * OQ-462 (2), ruled 2026-11-01: each child's first answer is bounded at 5 s; one that misses it is ended. The run host's
 * miss was an unhandled rejection in main that ended the launch with no window
 * (docs/archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md): now the window
 * paints with the "did not start" notice, every request to the run host is refused at once, and the application quits 0.
 * A service's miss refuses its open on the open's own surface (REQ-SHELL-112's transient) and raises no notice. The silence
 * is the seam `ROTARIS_CAPTURE_CHILD_FAULT=<process>:silent`: the child starts and answers nothing.
 */
for (const [name, spec, missLine, noticeTitle] of [
  ['not-ready-run-host', 'run-host:silent', /^run host did not answer its hello within 5000 ms \(no reply to hello within 5000 ms\); main ends it/, 'The run host did not start'],
  ['not-ready-workspace-service', 'workspace-service:silent', /^workspace service for .* did not answer its hello within 5000 ms \(no reply to hello within 5000 ms\); main ends it and refuses the open/, null],
]) {
  const started = await startApp({ root: join(output, name), workspace, extra: { ROTARIS_CAPTURE_CHILD_FAULT: spec }, timeoutMs: 90_000 });
  const painted = await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 }).then(() => true, () => false);
  check(`${name}: the window paints although the child never answered`, painted);
  const missed = await until(() => mainLines(logOf(started)).find((l) => missLine.test(l.message)) ?? null, (l) => l !== null, { timeoutMs: 30_000, what: 'main\'s missed-hello line' }).catch(() => null);
  check(`${name}: main writes the missed bound at error and ends the child`, missed?.level === 'error', missed ? `${missed.level} ${missed.message}` : 'no line');
  const unhandled = mainLines(logOf(started)).filter((l) => /^UNHANDLED rejection in main|^UNCAUGHT in main/.test(l.message));
  check(`${name}: no unhandled rejection or uncaught exception in main`, unhandled.length === 0, unhandled.map((l) => l.message).join(' | ') || 'none');
  if (noticeTitle !== null) {
    const notice = await until(() => started.driver.eval(READ_NOTICE).catch(() => null), (n) => n?.title === noticeTitle, { timeoutMs: 20_000, what: 'the did-not-start notice' }).catch(() => null);
    check(`${name}: one error notice "${noticeTitle}", no action, saying no run can start until a restart`, notice?.severity === 'error' && notice.action === false && /No run can start until the application is restarted/.test(notice.message ?? '') && /no answer to its hello within 5000 ms/.test(notice.detail ?? ''), JSON.stringify(notice));
    const askedAt = Date.now();
    const answer = await started.driver.command({ kind: 'session.list' }).catch((e) => ({ error: String(e) }));
    check(`${name}: a request that reaches the run host is answered at once, not after a bound`, Date.now() - askedAt < 3_000, `${Date.now() - askedAt} ms: ${JSON.stringify(answer).slice(0, 200)}`);
  } else {
    const acks = await until(() => started.driver.eval(READ_ACKS).catch(() => []), (a) => Array.isArray(a) && a.includes('The project could not be opened'), { timeoutMs: 20_000, what: 'the refusal of the open' }).catch(() => started.driver.eval(READ_ACKS).catch(() => []));
    check(`${name}: the open's refusal is the transient "The project could not be opened"`, Array.isArray(acks) && acks.includes('The project could not be opened'), JSON.stringify(acks));
    // The service's exit follows main's kill within the end bound; any notice it would raise has been raised by then.
    await new Promise((r) => setTimeout(r, 3_000));
    const notice = await started.driver.eval(READ_NOTICE).catch(() => null);
    check(`${name}: no persistent notice for the service — its open is refused on its own surface`, !/workspace service/i.test(notice?.title ?? ''), JSON.stringify(notice));
  }
  const stopped = await stopApp(started);
  if (stopped.overran) throw new Error(stopOverrunMessage(name, stopped, logOf(started)));
  check(`${name}: the application then quits, exit 0`, stopped.exit?.code === 0, JSON.stringify(stopped.exit));
  results[name] = { spec, missed: missed ? `${missed.level} ${missed.message}` : null, exit: stopped.exit };
}

// ── 9. render-fault: a component throws while the main window is drawn (R-091, hardening §3.2 row 4) ─────────────────────
/*
 * Until 2026-11-04 no window had an error boundary and no root was given React's error options: a component that threw while
 * it was drawn unmounted the whole tree to a blank window, said nothing, and left nothing in main's log. The seam
 * `window.__rotarisRenderFault` (`renderer/render-failure.tsx`, mounted under `__ROTARIS_SEAMS__`, so a packaged build has
 * none) makes a component inside the main window's boundary throw on its next render. The window must draw the boundary's
 * fallback with its one action; main must write ONE `error` line for it, carrying the component stack; and after "Reload this
 * window" the shell is drawn again, showing the persistent error notice whose detail carries the error and the stack.
 * Component names in the stack are the minified build's, so the reading is the stack's presence, not a name in it.
 */
{
  const FAULT = 'exit-trace-proof: a component threw while it was drawn';
  const rendererErrors = (log) => mainLines(log).filter((l) => l.level === 'error' && /^notice from the renderer: error "This window stopped drawing"/.test(l.message));
  const started = await startApp({ root: join(output, 'render-fault'), workspace, timeoutMs: 90_000 });
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  const armed = await until(() => started.driver.eval('typeof window.__rotarisRenderFault').catch(() => null), (t) => t === 'function', { timeoutMs: 15_000, what: 'the render fault seam' }).catch(() => null);
  check('render-fault: the seam is mounted in a build with seams', armed === 'function', String(armed));
  const before = rendererErrors(logOf(started)).length;
  await started.driver.eval(`window.__rotarisRenderFault(${JSON.stringify(FAULT)})`).catch(() => null);
  const drawn = await until(() => started.driver.eval(`(() => { const f = document.querySelector('[data-ui-component="RenderFailureFallback"]'); return f === null ? null : { shell: document.querySelector('.app-shell') !== null, role: f.getAttribute('role'), title: f.querySelector('.empty-state-title')?.textContent ?? null, action: [...f.querySelectorAll('button')].map((b) => b.textContent) }; })()`).catch(() => null), (d) => d !== null, { timeoutMs: 15_000, what: 'the fallback of the boundary' }).catch(() => null);
  check('render-fault: the window draws the fallback of the boundary in place of the shell, not a blank window', drawn?.shell === false && drawn.role === 'alert' && drawn.title === 'This window stopped drawing' && JSON.stringify(drawn.action) === JSON.stringify(['Reload this window']), JSON.stringify(drawn));
  const errorLines = await until(() => rendererErrors(logOf(started)), (found) => found.length > before, { timeoutMs: 15_000, what: 'the error line main writes for the fault' }).catch(() => rendererErrors(logOf(started)));
  const log = logOf(started);
  const stackLines = log.split('\n').filter((line) => /^\[main [^\]]+\] error\s/.test(line));
  check('render-fault: main writes ONE error line for the fault, carrying the error and the component stack', errorLines.length - before === 1 && stackLines.some((l) => l.includes(FAULT)) && stackLines.some((l) => /Component stack:/.test(l)), errorLines.map((l) => l.message).join(' | ') || 'no line');
  await started.driver.click('[data-ui="render-failure-reload"]').catch(() => null);
  const reloaded = await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 }).then(() => true, () => false);
  const reloadLine = mainLines(logOf(started)).find((l) => /^window \d+ reloaded at its renderer's request/.test(l.message));
  check('render-fault: "Reload this window" asks main, which reloads the window, and the shell is drawn again', reloaded && reloadLine !== undefined, reloadLine ? `${reloadLine.level} ${reloadLine.message}` : 'no reload line');
  const notice = await until(() => started.driver.eval(READ_NOTICE).catch(() => null), (n) => n?.title === 'This window stopped drawing', { timeoutMs: 15_000, what: 'the notice for the fault' }).catch(() => null);
  check('render-fault: the reloaded window shows the persistent error notice, the error and the component stack in its detail (REQ-NOTIFY-005, REQ-NOTIFY-023)', notice?.severity === 'error' && notice.dismiss === true && (notice.detail ?? '').includes(FAULT) && /Component stack:/.test(notice.detail ?? ''), JSON.stringify(notice)?.slice(0, 400));
  check('render-fault: still one error line for the one fault after the reload', rendererErrors(logOf(started)).length - before === 1);
  const stopped = await stopApp(started);
  if (stopped.overran) throw new Error(stopOverrunMessage('render-fault', stopped, logOf(started)));
  check('render-fault: the application then quits, exit 0', stopped.exit?.code === 0, JSON.stringify(stopped.exit));
  results['render-fault'] = { fallback: drawn, errorLines: errorLines.map((l) => `${l.level} ${l.message}`), reload: reloadLine?.message ?? null, notice, exit: stopped.exit };
}

results.checks = checks;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length === 0 ? `exit-trace-proof: PASS (${checks.length} checks)` : `exit-trace-proof: FAIL (${failed.length} of ${checks.length})`);
process.exitCode = failed.length === 0 ? 0 : 1;
