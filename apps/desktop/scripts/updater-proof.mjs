/**
 * `pnpm updater-proof` — the updater in the BUILT application, on the one path a development host can execute:
 * a launch that is not a released artifact performs no update check and issues no request (REQ-STARTUP-106,
 * REQ-STARTUP-114, REQ-STARTUP-150), and says so once, at `info`, in the application log (PD-MONITOR-002).
 *
 * How the absence is observed, twice over. (1) The application log: main writes exactly one `update check:` line per
 * main window shown, and on this launch that line says the build is not updatable and that no request is made; no
 * line names the feed endpoint. (2) The network: Electron is started with `--proxy-server=127.0.0.1:<port>` pointing
 * at a listener this script owns, so every request Chromium's network stack would make — `net.fetch` in main among
 * them — arrives here as a connection or a CONNECT, and the listener records each one. A launch that made the request
 * would show `api.github.com` in that record. The listener records nothing.
 *
 * The same sink holds the runtime to REQ-STARTUP-160 and REQ-SHELL-005: from launch to first paint and an orderly quit
 * it must record NO connection at all, not merely none for `github.com`. The first execution (2026-09-28) recorded one,
 * `CONNECT redirector.gvt1.com:443` — Electron's spellchecker fetching a Hunspell dictionary — and `main/runtime-requests.ts`
 * removed it; this check keeps that finding found. The launch also writes a Chromium net-log (`--log-net-log`), and the
 * report lists every http(s) URL it names, so a connection the sink records arrives with the request that made it.
 *
 * The launch's environment is fixed here rather than inherited from the operator's shell: `APPIMAGE` and
 * `ROTARIS_PORTABLE_ARTIFACT` are SET, to files that name other things, because both are inherited by every child of an
 * AppImage-hosted terminal or editor (or of a shell that ran the portable), and a source-tree launch must stay not
 * updatable whatever they say (REQ-STARTUP-106: no variable overrides the released-artifact test). A launch the
 * classification got wrong would show a flavour and a `GET` in its `update check:` line, and `api.github.com` at the sink.
 *
 * What this proof cannot show (IC-3; first-release-plan.md §4.6's first-execution note): a check that DOES go out, an
 * offer, a download, the installer or portable apply, and the restart, all of which need a packaged Windows artifact
 * launched from its own install directory or its own launcher. Those steps are decided by the unit tests beside
 * `apps/desktop/src/main/updater/` over fakes, and their first execution against a real artifact is owed to the next
 * Windows package. Nothing here fakes a Windows run.
 *
 *   node apps/desktop/scripts/updater-proof.mjs [--skip-build]
 *
 * Evidence: `.proof/updater-proof/` — the application log, the proxy record, the net-log and `report.json`.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { startApp } from './lib/driver.mjs';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';

const output = evidenceDirectory('updater-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const skipBuild = process.argv.includes('--skip-build');
if (!skipBuild) buildDesktop(output);

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The proxy sink: records every connection and every request line it receives, answers nothing useful, closes. */
const connections = [];
const sink = createServer((socket) => {
  const entry = { at: new Date().toISOString(), from: `${socket.remoteAddress}:${socket.remotePort}`, firstLine: '' };
  connections.push(entry);
  socket.setEncoding('utf8');
  socket.once('data', (chunk) => { entry.firstLine = String(chunk).split(/\r?\n/)[0] ?? ''; socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'); });
  socket.on('error', () => undefined);
});
await new Promise((resolve) => sink.listen(0, '127.0.0.1', resolve));
const port = sink.address().port;
console.log(`proxy sink listening on 127.0.0.1:${port}`);

/** What an AppImage-hosted editor and a shell the portable started would leave in a `pnpm dev`'s environment. */
const INHERITED_APPIMAGE = '/tmp/SomeEditor-x86_64.AppImage';
const INHERITED_PORTABLE = '/tmp/Rotaris-0.1.0-windows-x64-portable.exe';
const netLog = join(output, 'netlog.json');
const started = await startApp({
  root: output,
  electronArgs: [`--proxy-server=127.0.0.1:${port}`, `--log-net-log=${netLog}`],
  extra: { ROTARIS_APP_LOG_LEVEL: 'info', APPIMAGE: INHERITED_APPIMAGE, ROTARIS_PORTABLE_ARTIFACT: INHERITED_PORTABLE },
});
let log = '';
try {
  await started.driver.waitFor('.app-shell', { timeoutMs: 60_000 });
  // The check is initiated from the post-show activation, so the line lands shortly after the window is shown;
  // wait for it rather than sleeping a fixed time, bounded.
  const deadline = Date.now() + 30_000;
  for (;;) {
    log = readFileSync(started.logFile, 'utf8');
    if (/update check: /.test(log) || Date.now() > deadline) break;
    await sleep(200);
  }
  // Give any request that WOULD have been made time to reach the sink, then quit through the ordinary path.
  await sleep(1_500);
  const before = started.driver;
  await before.quit();
  before.close();
  const exited = Date.now() + 30_000;
  while (Date.now() < exited) {
    try { process.kill(started.child.pid, 0); } catch { break; }
    await sleep(200);
  }
  log = readFileSync(started.logFile, 'utf8');
} finally {
  try { process.kill(started.child.pid); } catch { /* already gone */ }
  await new Promise((resolve) => sink.close(() => resolve()));
}

const lines = log.split('\n');
const checkLines = lines.filter((l) => l.includes('update check: '));
const notUpdatable = checkLines.filter((l) => /update check: this build is not updatable — .*; no request is made \(REQ-STARTUP-106\)/.test(l));
const requestLines = lines.filter((l) => /GET https:\/\/api\.github\.com/.test(l) || l.includes('REQ-STARTUP-105'));
const githubConnections = connections.filter((c) => /github\.com/i.test(c.firstLine));
/** Every http(s) or ws(s) URL the net-log names — what made a connection, when the sink records one. */
const netLogUrls = existsSync(netLog) ? [...new Set([...readFileSync(netLog, 'utf8').matchAll(/"url":"((?:https?|wss?):[^"]*)"/g)].map((m) => m[1]))] : [];

check('the application log carries exactly one `update check:` line — one main window, one activation (REQ-STARTUP-114)', checkLines.length === 1, `${checkLines.length} line(s)`);
check('that line says the build is not updatable and that no request is made (REQ-STARTUP-106)', notUpdatable.length === 1, notUpdatable[0] ?? checkLines[0] ?? '(none)');
check('with APPIMAGE and ROTARIS_PORTABLE_ARTIFACT set in the launch\'s environment, the reason is still the source-tree launch (REQ-STARTUP-106)', notUpdatable.length === 1 && !/appimage flavour|portable flavour/.test(log), `APPIMAGE=${INHERITED_APPIMAGE}, ROTARIS_PORTABLE_ARTIFACT=${INHERITED_PORTABLE}`);
check('the line names a development or source-tree launch as the reason', notUpdatable.some((l) => l.includes('development or source-tree launch')), notUpdatable[0] ?? '(none)');
check('the line is written at `info`, in the level column (PD-MONITOR-002)', notUpdatable.some((l) => /^\[main [^\]]+\] info\s+update check:/.test(l)), notUpdatable[0]?.slice(0, 60) ?? '(none)');
check('no line records a request to the feed endpoint (REQ-STARTUP-150)', requestLines.length === 0, `${requestLines.length} line(s)`);
check('the proxy sink saw no connection for github.com — no update request left the process (REQ-STARTUP-106)', githubConnections.length === 0, `${connections.length} connection(s) in all${connections.length > 0 ? `: ${connections.map((c) => c.firstLine || '(no request line)').join(' | ')}` : ''}`);
check('the proxy sink saw NO connection at all from launch to first paint and an orderly quit — the runtime makes no request of its own (REQ-STARTUP-160, REQ-SHELL-005)', connections.length === 0, connections.length === 0 ? `0 connections; the net-log names ${netLogUrls.length} http(s) URL(s)` : `${connections.map((c) => c.firstLine || '(no request line)').join(' | ')}; net-log URLs: ${netLogUrls.join(' | ') || '(none)'}`);
check('the launch quit cleanly after the check (REQ-STARTUP-046: nothing was in flight to wait for)', /quit: exiting with status 0/.test(log), lines.filter((l) => l.includes('quit:')).join(' / '));

writeFileSync(join(output, 'proxy-record.json'), `${JSON.stringify(connections, null, 2)}\n`);
writeFileSync(join(output, 'report.json'), `${JSON.stringify({ at: new Date().toISOString(), proxyPort: port, environment: { APPIMAGE: INHERITED_APPIMAGE, ROTARIS_PORTABLE_ARTIFACT: INHERITED_PORTABLE }, checkLines, requestLines, connections: connections.length, githubConnections: githubConnections.length, netLogUrls, checks }, null, 2)}\n`);
const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed; evidence in ${output}`);
if (!existsSync(started.logFile)) console.log('(no application log was written)');
process.exit(failed === 0 ? 0 : 1);
