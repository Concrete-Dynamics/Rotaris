import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { backgroundSetupStarted, SETUP_ANSWERED } from './lib/initialization-marker.mjs';
import { startApp, stopApp, until } from './lib/driver.mjs';

/**
 * ADR-0049's first execution in full (Part V), in the built application.
 *
 *  1. THE LOST ADVISORY, reproduced and answered. A global hook that fails is switched off, so at teardown the run
 *     publishes the "Hooks need attention" advisory and its own outcome in one turn. The screen still holds the last
 *     of the burst — REQ-NOTIFY-024 makes single-slot replacement canonical — and the advisory is now READ BACK OUT
 *     OF THE SESSION'S TIMELINE, which is what REQ-NOTIFY-268 requires and what ADR-0049's Part C note found missing.
 *  1b. An invalid hook entry (a global `timeout_seconds: 0`) fails the configuration load before the hook port sees it
 *     (REQ-HOOKS-012): the run is refused with REQ-CONFIG-478's report — file, scope, key path — on screen, and no hook
 *     runs. REQ-HOOKS-085's "continuing without them" line is therefore not reachable this way; its unit cases stand.
 *     Since OQ-279's ruling the same report is the notice on screen when the workspace opens, before any prompt.
 *  1c. The same fault in the WORKSPACE scope (OQ-279): raised at the open, then the file corrected and a run started with
 *     no relaunch, which clears the notice (REQ-CONFIG-478's recovery).
 *  2. Scoping (REQ-NOTIFY-028/029/058): a notice about another session survives a run start; an unscoped one does not.
 *  3. Compare-and-clear (REQ-NOTIFY-026): dismissing a superseded identifier leaves its successor standing.
 *  4. The ONE transient surface (REQ-NOTIFY-012/013/016/017/021): four published, three visible, newest nearest the
 *     corner, the widths and the 16 px inset measured against the window's own content box, and a view change clears.
 *  5. The presentations (REQ-NOTIFY-014/035/258): border and rule, never a filled background; the severity word in
 *     the accessible name; the four severities and the four kinds drawing one glyph set.
 *  6. The action carries its object, and the object is the one on screen (REQ-NOTIFY-044 as amended under ESC-34,
 *     REQ-NOTIFY-224): the unreviewed-hooks notice offers `open-hook-review` naming its workspace, and activating it
 *     opens REQ-HOOKS-106's review for THAT workspace. The identity main writes and the identity main reaches with it
 *     travel through the renderer, so only the built application proves they are the same string.
 *     6b. And when the object is NOT the one on screen (ESC-34's owed half, OQ-267): a notice naming a workspace no
 *     window holds adds a window for it, asking nothing and closing nothing, and opens its review there.
 *     6c. A project-setup banner's action (PD-WORKSPACE-005 revisions 2 and 3, OQ-262, OQ-294), pressed in the window that
 *     does not hold its project: the holder is surfaced on Settings › Project, an unsaved edit in another category kept; one
 *     naming a project no window holds adds a main window for it, asking nothing, which shows Settings › Project with
 *     "Retry initialization" — no "not open in any window" acknowledgement (revision 2's answer). Then REQ-NOTIFY-031's
 *     "Open the session" for a run of the holding window, pressed in the other one (PD-SHELL-001 revision 3, OQ-292): the
 *     holding window is brought forward and follows the session, and no "could not be loaded" error is raised.
 *     6d. The same press after the session's own window switched to another project (PD-SHELL-001 revision 3): no window
 *     holds the session's workspace, so one is added for it, asking nothing, and the added window follows the session. On
 *     the way, the window the switch built after the notice was published shows that notice (ADR-0049, `notice.current`).
 *  7. The retry action reaches its target (REQ-NOTIFY-045, REQ-NOTIFY-030, OQ-178): activated on a failed session, it
 *     resubmits that session's last submitted prompt as a second run of that session.
 *     And it resubmits the prompt the session sent, wherever its row is (REQ-SESSION-192) and with the image it carried
 *     (REQ-CHAT-173): a failed session whose prompt — one PNG attached — has been released from the resident window is
 *     reopened, and the retry sends the same text and the same image, digest for digest, to the model.
 *  8. A run that ends while its session is not on screen (REQ-NOTIFY-031, REQ-MONITOR-202): DRIVEN — a run is started,
 *     "New session" is accepted while it runs (the window then shows no session, REQ-MONITOR-249/252), and its completion
 *     raises the persistent `success` notice naming the session and the state, saying the session on screen is
 *     unaffected, without moving the window; its "Open the session" action then focuses the finished session.
 *  9. A run that ends on a provider limit while its session is not on screen (REQ-NOTIFY-093 with REQ-NOTIFY-030/031):
 *     DRIVEN — a run parks on a quota wait with no candidate (the wait never resumes on its own), "New session" is
 *     accepted, and the parked run is stopped from the background (the Stop control's own `session.control` cancel,
 *     addressed to that session: no control in the window reaches a session it does not show). REQ-NOTIFY-031's `info`
 *     notice names it; its "Open the session" action focuses it, and REQ-NOTIFY-063's notice — the provider limit and its
 *     "Open Models settings" action — arrives with the focus, replacing the first in the one slot.
 *
 * Every assertion reads the application's own log, its store, or the rendered DOM.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'notice-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);
// `--only=<sections>` (comma-separated: 1, 1b, 1c, 2, 4, 6, 6b, 6c, 6d, 7, 7b, 8, 9) runs those sections alone; the default is all.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg === undefined ? null : onlyArg.slice('--only='.length).split(',').map((x) => x.trim()).filter((x) => x !== '');
const want = (id) => only === null || only.includes(id);

function scenario(name, { globalHooks = null, workspaceHook = false, images = false, runtime = [], workspaceLines = [] } = {}) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# notice proof workspace\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:', `  scripted: { provider: scripted, model_id: scripted${images ? ', accepts_image_input: true' : ''} }`,
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    // Part T's shipped code_intelligence entry costs about 4.5 s per run start; this proof measures notices.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'runtime:', '  permission_mode: autonomous', ...runtime,
    // The project-setup task answered (REQ-WORKSPACE-081/111): `enabled: false` above does not make it inapplicable
    // (REQ-WORKSPACE-090), and without the bundled runtime its background run (REQ-WORKSPACE-083) fails and publishes
    // "Project setup did not finish" into the ONE notice slot this proof reads (REQ-NOTIFY-024) — in `review-action`
    // 0.8 s after the hook-review notice it replaced (REQ-NOTIFY-224).
    ...SETUP_ANSWERED, '',
    // REQ-HOOKS-013: a WORKSPACE hook is never trusted without review, so the summary reports `review` and
    // REQ-NOTIFY-224's notice is raised once the window is interactive.
    ...(workspaceHook ? ['hooks:', '  entries:', '    - event: pre_tool', '      command: "exit 0"', ''] : []),
    ...workspaceLines,
  ].join('\n'));
  if (globalHooks !== null) {
    // The GLOBAL scope is trusted without review (REQ-HOOKS-013), so the run reaches the failure limit without a dialog.
    // By the platform that reads it (`configDirFor`), not the Windows spelling alone.
    const configDir = configDirFor(local);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'agents.yaml'), globalHooks);
  }
  return { root, workspace, local, preferences: join(root, 'preferences') };
}
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: opts.timeout ?? 150_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: s.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  // The precondition the section establishes, checked rather than assumed: a background setup's notice is not this proof's subject.
  if (backgroundSetupStarted(log)) throw new Error(`${name}: the workspace's initialization started code-intelligence-setup in the background, so its notice may stand in the slot this proof reads; see ${name}.log`);
  const errors = log.split('\n').filter((l) => /renderer console:/.test(l));
  return { log, png, elapsedMs: Date.now() - started, errors };
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inspectAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: inspect-at ${at} ${escape(selector)} → (\\{.*\\})`)); return m ? JSON.parse(m[1]) : null; };
const probesAt = (log, at, selector) => { const m = log.match(new RegExp(`capture: probe-at ${at} ${escape(selector)} → (\\[.*\\])`)); return m ? JSON.parse(m[1]) : null; };
const noticeSteps = (log) => log.split('\n').filter((l) => /capture: notices at /.test(l)).map((l) => l.slice(l.indexOf('capture: notices at ')));
const results = {};
const expect = (cond, message) => { if (!cond) throw new Error(message); };
const open = (s) => new Database(oneDatabase(s.local), { readonly: true });
const timelineOf = (db) => db.prepare('SELECT session_id, name, actor, message, metadata, id, severity FROM timeline ORDER BY ordinal').all();

// ─────────────────────────────────────────────────────────────────────────────
// 1. The advisory the single slot loses is recorded before it is rendered (REQ-NOTIFY-268).
const s1 = scenario('advisory', {
  globalHooks: [
    '# a global hook that always fails: three failures switch it off (REQ-HOOKS-046), and the switched-off',
    '# advisory is published at teardown, a moment before the run\'s own outcome (REQ-HOOKS-054).',
    'hooks:', '  entries:', '    - event: pre_tool', '      command: "exit 1"', '',
  ].join('\n'),
});
if (want('1')) {
  const r = await launch('advisory', s1, {
    ROTARIS_SCRIPT: 'read,read,read,read,answer',
    ROTARIS_CAPTURE_PROMPT: 'read a few files so the hook fails its way to being switched off',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '2500',
    ROTARIS_CAPTURE_PROBE: '[data-testid="notice-title"];;[data-testid="notice"]',
  }, { timeout: 180_000 });

  const db = open(s1);
  const rows = timelineOf(db);
  const session = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at DESC').get();
  db.close();
  const noticeRows = rows.filter((t) => t.name === 'notice');
  expect(/switched off|Hooks need attention/i.test(r.log), 'the run never switched the hook off, so no advisory was raised — see advisory.log');
  const advisory = noticeRows.find((t) => t.message === 'Hooks need attention');
  expect(advisory !== undefined, `the timeline holds ${JSON.stringify(noticeRows.map((t) => t.message))} — the advisory was not recorded (REQ-NOTIFY-268)`);
  const meta = JSON.parse(advisory.metadata);
  // REQ-NOTIFY-268: title, body and technical detail go in unchanged. The run host carries the advisory's sentence as
  // the notice's body (its text is prose, not diagnostic output), so that is the field the entry must hold.
  expect(meta.severity === 'warning' && typeof meta.message === 'string' && meta.message.length > 0, `the recorded entry carries ${JSON.stringify(meta)} — title, body and detail go in unchanged`);
  expect(advisory.actor === 'system' && advisory.session_id === session.session_id, `the entry was written as ${advisory.actor} on ${advisory.session_id}`);
  // REQ-SESSION-134 (schema v10, the repair of Part U's defect 42): the entry has its own 12-hex id, and the notice's
  // severity reaches the record's COLUMN — mapped from REQ-NOTIFY-023's vocabulary, which is not the timeline's.
  // Every hook_run entry the same run wrote carries an id too: nothing this run recorded is left without one.
  expect(/^[0-9a-f]{12}$/.test(advisory.id) && advisory.severity === 'warning', `the recorded entry's id and severity: ${JSON.stringify([advisory.id, advisory.severity])}`);
  expect(rows.every((t) => /^[0-9a-f]{12}$/.test(t.id)) && new Set(rows.map((t) => t.id)).size === rows.length, `an entry this run wrote carries no id, or two share one: ${JSON.stringify(rows.map((t) => [t.name, t.id]))}`);
  const hookRuns = rows.filter((t) => t.name === 'hook_run');
  expect(hookRuns.length > 0 && hookRuns.every((t) => t.severity === 'info' || t.severity === 'warning'), `REQ-HOOKS-119's severities: ${JSON.stringify(hookRuns.map((t) => t.severity))}`);
  expect(hookRuns.every((t) => JSON.parse(t.metadata).severity === undefined), `a hook_run entry still carries severity in its metadata: ${JSON.stringify(hookRuns.map((t) => t.metadata))}`);
  // The burst itself: the run's outcome and the advisory are published in the same turn of the loop, and the slot
  // holds ONE of them (REQ-NOTIFY-024). Which of the two wins is acceptance order and this proof does not fix it; what
  // it fixes is that both were published, exactly one is on screen, and the warning half is retrievable afterwards.
  const outcomeLogged = /run [0-9a-f-]+ ended /.test(r.log);
  const advisoryLogged = /notice from the run host: Hooks need attention/.test(r.log);
  expect(outcomeLogged && advisoryLogged, `the burst did not happen: outcome=${outcomeLogged}, advisory=${advisoryLogged}`);
  const onScreen = (r.log.match(/capture: probe \[data-testid="notice-title"\] → (\[.*\])/) ?? [])[1];
  const parsedScreen = onScreen ? JSON.parse(onScreen) : [];
  const shown = parsedScreen[0]?.text ?? null;
  expect(parsedScreen.length === 1, `the slot holds ${parsedScreen.length} notices; exactly one is current (REQ-NOTIFY-024)`);
  results.advisory = {
    sessionStatus: session.execution_status,
    recordedNotices: noticeRows.map((t) => ({ title: t.message, severity: JSON.parse(t.metadata).severity })),
    advisoryBody: meta.message.slice(0, 160),
    onScreenAfterTheBurst: shown,
    // Read in Part C the other way round (the outcome replaced the advisory); the acceptance order is what decides,
    // and neither is lost now: the warning is recorded, and the run's own outcome is in the session record.
    burst: { outcomePublished: outcomeLogged, advisoryPublished: advisoryLogged, slotHeld: parsedScreen.length },
    png: r.png, elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b. An invalid hook entry in the built app (REQ-HOOKS-012 before REQ-HOOKS-085). The run host's unit case for
// REQ-HOOKS-085 (`run-host/hooks.test.ts`) fails the hook port's own load with a `timeout_seconds: 0` entry and reads
// "Could not resolve this run's hooks; continuing without them." on the application log (first-executions, 2026-09-28:
// "Not measured on a run with a failing hook in the built app"). Driven here on 2026-10-13, the same entry never reaches
// that port: REQ-HOOKS-012 makes the CONFIGURATION load fail first, naming the YAML path, so the run is refused before
// it starts — REQ-CONFIG-478's report, file, scope and key path — and no hook runs. So REQ-HOOKS-085's line is not
// reachable in the built app by an invalid entry; it needs a hook set that fails to assemble after the configuration
// loaded, which no free seam produces, and its unit cases stay its evidence. What this launch pins is the order.
// OQ-279 (ruled 2026-10-13 under R-072): "a workspace opens" is its configuration loading. The window, the history and
// Settings stay available; what the user is told, and when, changed: the report is raised as a persistent error notice
// when the workspace opens — the file, its scope, the key — before any prompt (until 2026-10-14 it first showed as the
// refusal of the first prompt). The prompt is then refused as before (REQ-EVENTS-021).
const s1b = scenario('hook-load-fault', {
  globalHooks: ['# an entry with a budget of zero (REQ-HOOKS-012)', 'hooks:', '  entries:', '    - event: pre_tool', '      command: "exit 1"', '      timeout_seconds: 0', ''].join('\n'),
});
if (want('1b')) {
  const r = await launch('hook-load-fault', s1b, {
    ROTARIS_SCRIPT: 'read,answer',
    ROTARIS_CAPTURE_PROMPT: 'read a file; no hook should run',
    // The run is refused, so no result comes: the wait is short and its timeout is the expected end.
    // The prompt waits until the open-time notice has been read (OQ-279).
    ROTARIS_CAPTURE_PROMPT_MS: '5000', ROTARIS_CAPTURE_PROBE_AT: '[data-testid="notice-title"]@3500;;[data-testid="notice-detail"]@3500;;[data-testid="notice-message"]@3500',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '12000', ROTARIS_CAPTURE_AFTER_MS: '800',
    ROTARIS_CAPTURE_PROBE: '[data-testid="notice-title"]',
  }, { timeout: 150_000 });
  // OQ-279: before any prompt, the open has raised the fatal load as the notice on screen, naming the file, the global
  // scope and the rejected key, with the step that recovers.
  const atOpen = (probesAt(r.log, 3500, '[data-testid="notice-title"]') ?? []).map((n) => n.text);
  const detailAtOpen = (probesAt(r.log, 3500, '[data-testid="notice-detail"]') ?? []).map((n) => n.text).join('\n');
  const messageAtOpen = (probesAt(r.log, 3500, '[data-testid="notice-message"]') ?? []).map((n) => n.text).join('\n');
  expect(atOpen.includes('The workspace configuration did not load'), `before the prompt the notice on screen was ${JSON.stringify(atOpen)}, not the fatal load (OQ-279)`);
  expect(/agents\.yaml at hooks\.entries\.0\.timeout_seconds \(global scope\)/.test(detailAtOpen), `the open-time notice does not name the file, the key and the global scope: ${JSON.stringify(detailAtOpen)}`);
  expect(/open the workspace again or start a run/.test(messageAtOpen), `the open-time notice does not name the step that recovers: ${JSON.stringify(messageAtOpen)}`);
  const refusedAt = r.log.split('\n').findIndex((l) => / run refused: The run was refused before it started/.test(l));
  const raisedAt = r.log.split('\n').findIndex((l) => l.includes('notice: The workspace configuration did not load for'));
  expect(raisedAt >= 0 && (refusedAt < 0 || raisedAt < refusedAt), `the fatal-load notice was not raised before the prompt's refusal (raised at line ${raisedAt}, refused at line ${refusedAt})`);
  const db = open(s1b);
  const rows = timelineOf(db);
  const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
  db.close();
  const refused = r.log.split('\n').find((l) => / info +run refused: The run was refused before it started — The configuration could not be loaded: /.test(l));
  expect(refused !== undefined, 'the run was not refused on the configuration load — see hook-load-fault.log');
  expect(/agents\.yaml at hooks\.entries\.0\.timeout_seconds \(global scope\): /.test(refused), `the refusal does not name the file, the key path and the scope (REQ-HOOKS-012, REQ-CONFIG-478): ${refused}`);
  expect(!r.log.includes("Could not resolve this run's hooks"), "the hook port's load ran although the configuration did not load");
  expect(rows.filter((t) => t.name === 'hook_run').length === 0 && sessions === 0, `a run started or a hook ran: ${sessions} session(s), ${rows.filter((t) => t.name === 'hook_run').length} hook_run entries`);
  const onScreen = JSON.parse((r.log.match(/capture: probe \[data-testid="notice-title"\] → (\[.*\])/) ?? [])[1] ?? '[]');
  expect(onScreen.some((n) => n.text === 'The run was refused before it started'), `the refusal is not the notice on screen: ${JSON.stringify(onScreen)}`);
  results.hookLoadFault = { atOpen: { titles: atOpen, detail: detailAtOpen, message: messageAtOpen }, refusal: refused.slice(refused.indexOf('The configuration could not be loaded')), notice: onScreen.map((n) => n.text), sessions, hookRuns: 0, hookPortLoadLine: 'not reached (REQ-HOOKS-012 fails the configuration load first)', png: r.png, elapsedMs: r.elapsedMs };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1c. OQ-279 in the WORKSPACE scope, and REQ-CONFIG-478's recovery within one launch. The workspace file carries the rejected
// key; the open raises the fatal load naming that file, the workspace scope and the key. The proof then corrects the file
// on disk and submits a prompt: the run's own load (the per-run reload) succeeds, the run starts with no relaunch, and the
// standing notice is cleared.
const s1c = scenario('workspace-load-fault', { workspaceLines: ['hooks:', '  entries:', '    - event: pre_tool', '      command: "exit 0"', '      timeout_seconds: 0', ''] });
if (want('1c')) {
  const workspaceFile = join(s1c.workspace, '.rotaris', 'agents.yaml');
  const launched = await startApp({ root: join(output, 'workspace-load-fault-app'), workspace: s1c.workspace, timeoutMs: 90_000, extra: { ROTARIS_SCRIPT: 'answer' } });
  const d = launched.driver;
  let value = null;
  let failure = null;
  const noticeNow = () => d.eval(`(() => { const n = document.querySelector('[data-testid="notice"]'); return n ? { title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, message: n.querySelector('[data-testid="notice-message"]')?.textContent ?? null, detail: n.querySelector('[data-testid="notice-detail"]')?.textContent ?? null, action: n.querySelector('.notice__action')?.textContent ?? null } : null; })()`);
  try {
    const atOpen = await until(noticeNow, (n) => n?.title === 'The workspace configuration did not load', { timeoutMs: 30_000, what: 'the open-time fatal-load notice' });
    // REQ-CONFIG-478's recovery: correct the rejected key in the named file, then start a run — no relaunch.
    writeFileSync(workspaceFile, readFileSync(workspaceFile, 'utf8').replace('      timeout_seconds: 0\n', '      timeout_seconds: 5\n').replace(/hooks:\n  entries:\n(    .*\n)+/u, ''));
    await d.click('.nav-item', { text: 'Workspace' });
    await d.waitFor('.composer__input', { timeoutMs: 10_000 });
    await d.click('.composer__input');
    await d.type('the file is corrected; start the run', { enter: true });
    const header = await until(() => d.eval(`document.querySelector('[data-testid="run-header"]')?.getAttribute('data-state') ?? null`), (v) => v !== null, { timeoutMs: 30_000, what: 'a run header after the corrected file' });
    const after = await until(noticeNow, (n) => n === null || n.title !== 'The workspace configuration did not load', { timeoutMs: 15_000, what: 'the fatal-load notice cleared' });
    value = { atOpen, header, after };
  } catch (cause) {
    failure = cause;
  }
  const stopped = await stopApp(launched, { screenshot: join(output, 'workspace-load-fault.png') });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, 'workspace-load-fault.log'), log);
  if (failure) throw new Error(`workspace-load-fault: ${failure.message} (see workspace-load-fault.log)`);
  expect(!stopped.overran, 'workspace-load-fault: the app did not stop within its bound');
  expect(/\.rotaris[\\/]agents\.yaml at hooks\.entries\.0\.timeout_seconds \(workspace scope\)/.test(value.atOpen.detail ?? ''), `the open-time notice does not name the workspace file, the key and the workspace scope: ${JSON.stringify(value.atOpen)}`);
  expect(value.atOpen.action === 'Open Models settings', `the open-time notice offers ${JSON.stringify(value.atOpen.action)}, not the Settings category drawing the report`);
  expect(!/run refused: The run was refused before it started — The configuration could not be loaded/.test(log), 'the run after the corrected file was refused');
  expect(/the configuration of .* loaded again; the fatal-load notice #\d+ is cleared/.test(log), 'main did not clear the fatal-load notice when the run started');
  results.workspaceLoadFault = value;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 and 3. Scoping and compare-and-clear, driven through the real store.
const s2 = scenario('scoping');
if (want('2')) {
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const r = await launch('scoping', s2, {
    ROTARIS_CAPTURE_NOTICES: [
      // Unscoped, then a run starts: cleared (REQ-NOTIFY-058).
      step(2600, { op: 'report', severity: 'info', title: 'unscoped notice' }),
      step(3000, { op: 'run-start', sessionId: 'session-a' }),
      // About another session, then a run starts elsewhere: it stands (REQ-NOTIFY-029).
      step(3400, { op: 'report', severity: 'warning', title: 'about session b', sessionId: 'session-b' }),
      step(3800, { op: 'run-start', sessionId: 'session-a' }),
      // Its own session starting does clear it.
      step(4200, { op: 'run-start', sessionId: 'session-b' }),
      // Two publications; dismissing the FIRST leaves the second standing (REQ-NOTIFY-026).
      step(4600, { op: 'report', severity: 'info', title: 'first of two' }),
      step(5000, { op: 'report', severity: 'error', title: 'second of two', detail: 'a stack trace' }),
      // Identifier 4 is 'first of two' and 5 is 'second of two' (1 is the boot notice, 2 and 3 the two above): the
      // dismissal names the SUPERSEDED one, which must leave its successor standing (REQ-NOTIFY-026).
      step(5400, { op: 'dismiss', id: 4 }),
    ].join(';;'),
    ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="notice"]@3200;;[data-testid="notice"]@4000;;[data-testid="notice"]@4400;;[data-testid="notice"]@5800;;[data-testid="notice-detail"]@5800',
    ROTARIS_CAPTURE_AFTER_MS: '6400',
  });
  const title = (at) => inspectAt(r.log, at, '[data-testid="notice"]')?.matches[0]?.text?.split('\n')[0] ?? null;
  const count = (at) => inspectAt(r.log, at, '[data-testid="notice"]')?.matches.length ?? -1;
  expect(count(3200) === 0, `an unscoped notice survived a run start: ${JSON.stringify(inspectAt(r.log, 3200, '[data-testid="notice"]'))} (REQ-NOTIFY-058)`);
  expect(count(4000) === 1 && /about session b/.test(title(4000)), `a notice about another session did not survive an unrelated run start: ${title(4000)} (REQ-NOTIFY-029)`);
  expect(count(4400) === 0, 'the notice survived its own session starting (REQ-NOTIFY-029)');
  const after = inspectAt(r.log, 5800, '[data-testid="notice"]');
  expect(after?.matches.length === 1 && /second of two/.test(after.matches[0].text), `dismissing a superseded identifier removed the wrong notice: ${JSON.stringify(after?.matches.map((m) => m.text))} (REQ-NOTIFY-026)`);
  expect(after.matches[0].attrs['data-severity'] === 'error' && after.matches[0].attrs['role'] === 'alert', `the error presentation: ${JSON.stringify(after.matches[0].attrs)}`);
  expect(/Error: second of two/.test(after.matches[0].attrs['aria-label']), `the accessible name omits the severity word: ${after.matches[0].attrs['aria-label']} (REQ-NOTIFY-258)`);
  const detail = inspectAt(r.log, 5800, '[data-testid="notice-detail"]');
  expect(detail?.matches[0]?.text === 'a stack trace', `the detail row: ${JSON.stringify(detail?.matches[0]?.text)} (REQ-NOTIFY-037)`);
  results.scoping = {
    unscopedAfterRunStart: count(3200), otherSessionAfterRunStart: title(4000), ownSessionAfterRunStart: count(4400),
    afterDismissingTheSuperseded: after.matches[0].text.split('\n')[0], accessibleName: after.matches[0].attrs['aria-label'],
    steps: noticeSteps(r.log), png: r.png, elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 and 5. The one transient surface: depth, order, widths, inset, the clear on a view change, the presentations.
const s3 = scenario('stack');
if (want('4')) {
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const r = await launch('stack', s3, {
    ROTARIS_CAPTURE_NOTICES: [
      // One alone: the wide presentation (REQ-NOTIFY-013).
      step(2600, { op: 'acknowledge', kind: 'info', title: 'alone' }),
      // Three more within the lifetime: the stack, the fourth evicting the oldest (REQ-NOTIFY-016).
      step(3200, { op: 'acknowledge', kind: 'ok', title: 'second' }),
      step(3400, { op: 'acknowledge', kind: 'warn', title: 'third', body: 'with a body' }),
      step(3600, { op: 'acknowledge', kind: 'fail', title: 'fourth' }),
    ].join(';;'),
    ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="acknowledgement"]@2900;;[data-testid="acknowledgement"]@3900;;[data-testid="acknowledgements"]@3900;;[data-testid="acknowledgement-title"]@3900;;[data-testid="acknowledgement"]@5200',
    // REQ-NOTIFY-021: a view change clears every visible acknowledgement.
    ROTARIS_CAPTURE_VIEWS: '4@4200',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="acknowledgement"]@4600',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'stack.png')}@3950`,
    ROTARIS_CAPTURE_AFTER_MS: '5600',
  });
  const alone = inspectAt(r.log, 2900, '[data-testid="acknowledgement"]');
  expect(alone?.matches.length === 1, `one acknowledgement was published and ${alone?.matches.length} are on screen`);
  expect(Math.round(alone.matches[0].rect.width) === 520, `a lone acknowledgement measured ${Math.round(alone.matches[0].rect.width)} px, not 520 (REQ-NOTIFY-013)`);
  const stacked = inspectAt(r.log, 3900, '[data-testid="acknowledgement"]');
  expect(stacked?.matches.length === 3, `four were published and ${stacked?.matches.length} are visible; three is the maximum (REQ-NOTIFY-016)`);
  // The titles from their own elements: a row's text is its glyph, its title, its body and its close control.
  const order = (inspectAt(r.log, 3900, '[data-testid="acknowledgement-title"]')?.matches ?? []).map((m) => m.text);
  expect(order[0] === 'second' && order[2] === 'fourth', `the stack reads ${JSON.stringify(order)} — the oldest went and the newest is nearest the corner (REQ-NOTIFY-016/017)`);
  const tops = stacked.matches.map((m) => m.rect.y);
  expect(tops[0] < tops[1] && tops[1] < tops[2], `the newest is not lowest: ${JSON.stringify(tops)} (REQ-NOTIFY-017)`);
  const gaps = [Math.round(tops[1] - (tops[0] + stacked.matches[0].rect.height)), Math.round(tops[2] - (tops[1] + stacked.matches[1].rect.height))];
  expect(gaps.every((g) => g === 8), `the gaps measured ${JSON.stringify(gaps)} px, not 8 (REQ-NOTIFY-017)`);
  expect(stacked.matches.every((m) => Math.round(m.rect.width) === 360), `a stacked acknowledgement measured ${JSON.stringify(stacked.matches.map((m) => Math.round(m.rect.width)))}, not 360 (REQ-NOTIFY-013)`);
  const stack = inspectAt(r.log, 3900, '[data-testid="acknowledgements"]');
  const view = stack.viewport ?? null;
  expect(view !== null, 'the inspect seam reported no viewport to measure the inset against');
  const right = Math.round(view.width - (stack.matches[0].rect.x + stack.matches[0].rect.width));
  const bottom = Math.round(view.height - (stack.matches[0].rect.y + stack.matches[0].rect.height));
  expect(right === 16 && bottom === 16, `the surface sits ${right} px from the right and ${bottom} px from the bottom of the window's content area, not 16 (REQ-NOTIFY-012)`);
  const kinds = stacked.matches.map((m) => m.attrs['data-kind']);
  const names = stacked.matches.map((m) => m.attrs['aria-label']);
  expect(JSON.stringify(kinds) === JSON.stringify(['ok', 'warn', 'fail']), `the kinds on screen: ${JSON.stringify(kinds)}`);
  expect(names[0].startsWith('Done.') && names[1].startsWith('Warning.') && names[2].startsWith('Failed.'), `the kind words are wrong: ${JSON.stringify(names)} (REQ-NOTIFY-019)`);
  const cleared = probesAt(r.log, 4600, '[data-testid="acknowledgement"]') ?? [];
  expect(cleared.length === 0, `a view change left ${cleared.length} acknowledgement(s) standing (REQ-NOTIFY-021)`);
  const expired = inspectAt(r.log, 5200, '[data-testid="acknowledgement"]');
  expect(expired?.matches.length === 0, `an acknowledgement outlived its 4200 ms: ${JSON.stringify(expired?.matches.map((m) => m.text))} (REQ-NOTIFY-011)`);
  results.stack = {
    aloneWidth: Math.round(alone.matches[0].rect.width), stackedWidths: stacked.matches.map((m) => Math.round(m.rect.width)),
    visible: stacked.matches.length, order, gaps, insetRight: right, insetBottom: bottom, kinds, accessibleNames: names,
    afterViewChange: cleared.length, afterLifetime: expired.matches.length,
    png: join(output, 'stack.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ESC-34: the review action names its workspace, and that name reaches the review.
const s4 = scenario('review-action', { workspaceHook: true });
if (want('6')) {
  const r = await launch('review-action', s4, {
    ROTARIS_CAPTURE_AFTER_MS: '6000',
    // The notice is raised 800 ms after the workspace opens; probe it, then click its action.
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="notice-title"]@2500',
    ROTARIS_CAPTURE_INSPECT_AT: '.notice__action@2500',
    ROTARIS_CAPTURE_CLICKS: '.notice__action>>Review hooks@3200',
    // Leaving the review without choosing is a rejection (REQ-HOOKS-107); the proof chooses, so nothing is left open.
    ROTARIS_CAPTURE_HOOK_REVIEW: 'refuse', ROTARIS_CAPTURE_HOOK_REVIEW_MS: '900',
  });
  const titles = (probesAt(r.log, 2500, '[data-testid="notice-title"]') ?? []).map((m) => m.text);
  expect(titles.includes('Workspace hooks need review'), `the notice on screen: ${JSON.stringify(titles)} (REQ-NOTIFY-224)`);
  const actions = inspectAt(r.log, 2500, '.notice__action')?.matches ?? [];
  expect(actions.length === 1 && actions[0].text === 'Review hooks', `the notice offers ${JSON.stringify(actions.map((a) => a.text))} (REQ-NOTIFY-224)`);
  expect(actions[0].attrs['data-action'] === 'open-hook-review', `the action is ${actions[0].attrs['data-action']}, not the member REQ-NOTIFY-044 gained under ESC-34`);
  // The whole point of the parameter: main writes the workspace into the action, the renderer hands it back, main reaches
  // the window holding it (here the one on screen) and the review opens for THAT workspace. A mismatch in the form of the
  // string — a slash, a drive letter's case — would add a second window on the same folder, which the assertion below
  // that the reach `surfaced` catches; no unit test spans the processes to catch it.
  const opened = r.log.match(/hook review opened for (.+) \((\d+) hook\(s\)\)/);
  expect(opened !== null, `the action was activated and no review opened — see review-action.log`);
  expect(!/is not the open workspace/.test(r.log), `the renderer refused the action's workspace: ${(r.log.match(/names .+ which is not the open workspace/) ?? [''])[0]}`);
  const surfaced = r.log.match(/notice action reached (.+): (added|surfaced) window (\d+)/);
  expect(surfaced?.[2] === 'surfaced', `the action named the window's own workspace and main ${surfaced?.[2] ?? 'reached nothing'} (a second window on one folder is REQ-STARTUP-163's breach)`);
  const sameRoot = opened[1].replace(/\\/g, '/').toLowerCase() === s4.workspace.replace(/\\/g, '/').toLowerCase();
  expect(sameRoot, `the review opened for ${opened[1]}, not for ${s4.workspace}`);
  results.reviewAction = {
    title: titles.find((t) => t === 'Workspace hooks need review') ?? null,
    actionLabel: actions[0].text, member: actions[0].attrs['data-action'],
    reviewOpenedFor: opened[1], hooks: Number(opened[2]), workspaceMatched: sameRoot,
    png: join(output, 'review-action.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6b. ESC-34's owed half: the action names ANOTHER workspace than the window it is activated in. Notices are
// application-wide, so this is a second window's notice, or one that outlived a workspace switch. The window holds a
// workspace with no hooks; the notice names a second workspace declaring one, which no window holds. Activating it
// reaches that workspace — a window added for it, nothing asked, nothing closed (OQ-267) — and opens ITS review there.
// Before the repair of docs/defects/fixed/a-hook-review-notice-for-another-workspace-opens-nothing.md the renderer logged
// "… which is not the open workspace" and opened nothing.
const s4b = scenario('review-other');
const s4bTarget = scenario('review-other-target', { workspaceHook: true });
if (want('6b')) {
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const r = await launch('review-other', s4b, {
    ROTARIS_CAPTURE_AFTER_MS: '11000',
    ROTARIS_CAPTURE_NOTICES: step(2000, {
      op: 'report', severity: 'warning', title: 'Workspace hooks need review', message: 'Another workspace declares a hook.', persistent: true,
      action: { label: 'Review hooks', action: { kind: 'open-hook-review', workspace: s4bTarget.workspace } },
    }),
    ROTARIS_CAPTURE_INSPECT_AT: '.notice__action@2600',
    ROTARIS_CAPTURE_CLICKS: '.notice__action>>Review hooks@3200',
    ROTARIS_CAPTURE_HOOK_REVIEW: 'refuse', ROTARIS_CAPTURE_HOOK_REVIEW_MS: '900',
  });
  const actions = inspectAt(r.log, 2600, '.notice__action')?.matches ?? [];
  expect(actions.length === 1 && actions[0].attrs['data-action'] === 'open-hook-review', `the notice offers ${JSON.stringify(actions.map((a) => a.attrs['data-action']))}`);
  expect(!/is not the open workspace/.test(r.log), `the renderer refused the action as naming another workspace: ${(r.log.match(/names .+ which is not the open workspace/) ?? [''])[0]}`);
  const reached = r.log.match(/notice action reached (.+): (added|surfaced) window (\d+)/);
  expect(reached !== null, `the action was activated and no window reached the named workspace — see review-other.log`);
  const same = (a, b) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase();
  expect(same(reached[1], s4bTarget.workspace), `the action reached ${reached[1]}, not ${s4bTarget.workspace}`);
  expect(reached[2] === 'added', `no window held ${s4bTarget.workspace}, yet the action ${reached[2]} window ${reached[3]}`);
  const opened = r.log.match(/hook review opened for (.+) \((\d+) hook\(s\)\)/);
  expect(opened !== null, `the named workspace was reached and no review opened — see review-other.log`);
  expect(same(opened[1], s4bTarget.workspace), `the review opened for ${opened[1]}, not for ${s4bTarget.workspace}`);
  // Nothing the user had open was closed, and nothing asked: the first window kept its workspace and no chooser opened.
  expect(!/workspace switched to/.test(r.log), 'the activating window was replaced; the action must add or surface, never close (OQ-267)');
  expect(!/workspace open declined|ended by the unsaved-settings guard/.test(r.log), 'a REQ-SHELL-021 gate ran on a notice action');
  // The decision was stored against the named workspace (the dialog's own payload), not the window it was activated in.
  const decided = r.log.match(/hook review → (allowed|refused) for (.+)/);
  expect(decided !== null && decided[1] === 'refused', `the scripted choice was not recorded: ${decided?.[0] ?? 'no decision line'}`);
  expect(same(decided[2].trim(), s4bTarget.workspace), `the decision was stored for ${decided[2]}, not for ${s4bTarget.workspace}`);
  results.reviewOther = {
    actionWorkspace: s4bTarget.workspace, windowWorkspace: s4b.workspace,
    reached: { workspace: reached[1], how: reached[2], window: Number(reached[3]) },
    reviewOpenedFor: opened[1], hooks: Number(opened[2]), decision: decided[1], decidedFor: decided[2].trim(),
    png: join(output, 'review-other.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6c. PD-WORKSPACE-005 revision 2 (OQ-262, ruled 2026-10-13 under R-072): a project-setup banner's action, pressed in the
// window that does NOT hold its project. The launch opens a project that has answered every task; a second main window is
// added on `atlas-billing`, which owes one failing background task (`ROTARIS_INIT_TEST_TASK`, the ordinary registry), so its
// open raises "Project setup did not finish: atlas-billing" with "Try again" — a real banner, not a publication of the
// proof's — once both windows exist, and the banner, an application notice, stands in both. (A window added AFTER a notice
// was published did not show it until 2026-10-14: docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md;
// the order is kept, and section 6d reads the repair.) With
// an unsaved edit standing in the holding window's Settings › Instructions, "Try again" is pressed in the FIRST window, which
// does not hold the project: the holding window is surfaced and shows Settings › Project, its edit still pending.
// Then a banner naming a project folder no window holds is pressed: PD-WORKSPACE-005 revision 3 (OQ-294, ruled 2026-10-14
// under R-072) adds a third main window for that project on PD-SHELL-001's add terms, and Settings › Project opens there,
// held by the window until its renderer registers for channel 15 (`projectInit.ready`); the project owes the same failing
// task, so its card reaches "Retry initialization". Under revision 2 the pressing window said "Project <name> is not open in
// any window." and nothing else happened. Before revision 2 the arm logged "has no target in this build".
// Last, PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): a run in the holding window, released there by "New
// session", ends while no window shows it, and REQ-NOTIFY-031's notice — "Open the session", naming the session and its
// workspace — is pressed in the FIRST window. The holding window is brought forward and follows the session; no "could not be
// loaded" error is raised. (From 2026-10-14 until the revision the press was not dispatched; before that it raised that error
// in the pressing window, docs/defects/fixed/a-focus-session-notice-action-acts-in-a-window-holding-another-workspace.md.)
if (want('6c')) {
  const base = join(output, 'project-init');
  const folder = (name, skipped) => {
    const root = join(base, name);
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    writeFileSync(join(root, 'README.md'), `# notice proof, ${name}\n`);
    writeFileSync(join(root, 'AGENTS.md'), '# instructions the proof switches off without saving\n');
    writeFileSync(join(root, '.rotaris', 'agents.yaml'), [
      '# scratch configuration written by the proof script',
      'models:', '  scripted: { provider: scripted, model_id: scripted }',
      'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
      'mcp_servers:', '  code_intelligence: { enabled: false }',
      // The improvement collector off: its notice follows a completed run and would replace REQ-NOTIFY-031's in the one slot.
      'runtime:', '  permission_mode: autonomous', '  improvement_collector_enabled: false',
      'initialization:', '  completed: []', `  skipped: [${skipped.join(', ')}]`, "  last_run: '2026-09-29T00:00:00.000Z'", '',
    ].join('\n'));
    return root;
  };
  const PROMPT = 'a run that ends while its window shows another session';
  const holder = folder('atlas-billing', ['code-intelligence-setup']);
  const other = folder('other-project', ['code-intelligence-setup', 'verification-fail']);
  // A real project folder now (PD-WORKSPACE-005 revision 3): the press opens it in an added window. It owes the failing task too.
  const closed = folder('closed-project', ['code-intelligence-setup']);
  const launched = await startApp({
    root: join(base, 'app'), workspace: other, timeoutMs: 90_000,
    extra: {
      // The capture seams are installed only while capturing; the capture's own end is put past the proof's, which quits first.
      ROTARIS_INIT_TEST_TASK: 'fail', ROTARIS_CAPTURE_PROJECT_FOLDER: holder, ROTARIS_CAPTURE_PNG: join(output, 'project-init.png'), ROTARIS_CAPTURE_AFTER_MS: '170000',
      // The focus leg's run holds its one model call 6 s, long enough to release it from its window before it ends.
      ROTARIS_SCRIPT: 'wait:6000,answer',
      // The second banner, naming a folder no window holds: published through the REAL store once the first press is done.
      ROTARIS_CAPTURE_NOTICES: [
        `${JSON.stringify({ op: 'report', severity: 'error', title: 'Project setup did not finish: closed-project', message: 'Rotaris could not finish setting this workspace up for code search.', persistent: true, action: { label: 'Try again', action: { kind: 'open-project-init', workspace: closed } } })}@15000`,
      ].join(';;'),
    },
  });
  const d = launched.driver;
  const trail = [];
  const step = async (what, promise) => { const t0 = Date.now(); try { const v = await promise; trail.push({ what, ms: Date.now() - t0 }); return v; } catch (cause) { trail.push({ what, ms: Date.now() - t0, error: String(cause) }); throw cause; } };
  const onScreenIn = async (which, text) => { await d.useWindow(which); return await d.eval(`document.querySelector('.app-shell main, .app-shell')?.innerText.includes(${JSON.stringify(text)}) === true && !document.querySelector('[data-testid="notice"]')?.innerText.includes(${JSON.stringify(text)})`); };
  const noticeIn = async (which) => { await d.useWindow(which); return await d.eval(`(() => { const n = document.querySelector('[data-testid="notice"]'); if (!n) return null; const a = n.querySelector('.notice__action'); return { title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, action: a?.textContent ?? null, member: a?.getAttribute('data-action') ?? null }; })()`); };
  let value = null;
  let failure = null;
  try {
    await step('the first window', d.waitFor('.nav-item', { timeoutMs: 30_000 }));
    // The second window, on the project that owes the failing task, added last and so the active one.
    await step('the second window', d.command({ kind: 'workspace.choose', newWindow: true }));
    await step('two main windows', until(() => d.windows(), (w) => w.windows.length === 2 && String(w.windows[0]?.workspace ?? '').endsWith('atlas-billing'), { timeoutMs: 30_000, what: 'the holding window added' }));
    const banner = await step('the project-setup banner in the holding window', until(() => noticeIn('atlas-billing'), (n) => n !== null && n.title === 'Project setup did not finish: atlas-billing', { timeoutMs: 45_000, what: 'the background banner' }));
    const there = await step('the banner in the first window', until(() => noticeIn('other-project'), (n) => n !== null && n.title === 'Project setup did not finish: atlas-billing', { timeoutMs: 15_000, what: 'the banner in the first window' }));
    // An unsaved edit in another Settings category of the holding window (REQ-CONFIG-287: Settings-to-Settings is free).
    await d.useWindow('atlas-billing');
    await step('Settings in the holding window', d.click('.nav-item', { text: 'Settings' }));
    await step('Instructions', d.click('.settings__categories .nav-list__item', { text: 'Instructions' }));
    await step('the instruction switch', d.click('[data-testid="instruction-toggle"][data-id="workspace:AGENTS.md"]'));
    const dirty = await step('the unsaved edit', until(() => d.eval(`document.querySelector('.save-bar__status')?.textContent ?? null`), (v) => v === 'Unsaved changes', { timeoutMs: 10_000, what: 'the save bar reporting the edit' }));
    await d.useWindow('other-project');
    await step('Try again in the first window', d.click('.notice__action', { text: 'Try again' }));
    const surfaced = await step('the holding window surfaced', until(() => d.windows(), (w) => String(w.windows[0]?.workspace ?? '').endsWith('atlas-billing'), { timeoutMs: 10_000, what: 'the holding window focused' }));
    await d.useWindow('atlas-billing');
    const project = await step('Settings › Project in the holding window', until(() => d.eval(`({ view: document.querySelector('main.view')?.getAttribute('aria-label') ?? null, category: document.querySelector('.settings__body')?.getAttribute('aria-label') ?? null, card: document.querySelector('[data-project-init]')?.getAttribute('data-init-state') ?? null, retry: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Retry initialization'), save: document.querySelector('.save-bar__status')?.textContent ?? null })`), (v) => v?.view === 'Settings' && v?.category === 'Project' && v?.card !== null, { timeoutMs: 10_000, what: 'Settings › Project' }));
    await d.useWindow('other-project');
    const stayed = await d.eval(`document.querySelector('main.view')?.getAttribute('aria-label') ?? null`);
    // The banner naming a folder no window holds, pressed in the second window.
    const closedBanner = await step('the closed project\'s banner', until(() => noticeIn('other-project'), (n) => n !== null && n.title === 'Project setup did not finish: closed-project', { timeoutMs: 60_000, what: 'the closed project\'s banner' }));
    await d.useWindow('other-project');
    await step('Try again for the closed project', d.click('.notice__action', { text: 'Try again' }));
    // PD-WORKSPACE-005 revision 3: a third main window, added for the closed project, shows its Settings › Project.
    const after = await step('a third window, on the closed project', until(() => d.windows(), (w) => w.windows.length === 3 && w.windows.some((x) => String(x.workspace).endsWith('closed-project')), { timeoutMs: 30_000, what: 'a window added for the closed project' }));
    const told = await d.useWindow('other-project').then(() => d.eval(`[...document.querySelectorAll('[data-testid="acknowledgement-title"]')].map((n) => n.textContent)`));
    await d.useWindow('closed-project');
    const addedProject = await step('Settings › Project in the added window', until(() => d.eval(`({ view: document.querySelector('main.view')?.getAttribute('aria-label') ?? null, category: document.querySelector('.settings__body')?.getAttribute('aria-label') ?? null, card: document.querySelector('[data-project-init]')?.getAttribute('data-init-state') ?? null, retry: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Retry initialization') })`), (v) => v?.view === 'Settings' && v?.category === 'Project' && v?.retry === true, { timeoutMs: 45_000, what: 'Settings › Project with "Retry initialization" in the added window' }));
    // The edit was the proof's, and an unsaved one would hold the quit at the unsaved-settings guard: it is discarded.
    await d.useWindow('atlas-billing');
    await step('Discard the edit', d.click('.save-bar .btn-secondary', { text: 'Discard' }));
    await step('the form clean again', until(() => d.eval(`document.querySelector('.save-bar__status')?.textContent ?? null`), (v) => v === 'All changes saved', { timeoutMs: 10_000, what: 'the save bar clean' }));
    // PD-SHELL-001 revision 3: a run of the holding window, released there, ends while no window shows it.
    await step('Workspace in the holding window', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus' }));
    await step('the prompt', d.type(PROMPT, { enter: true }));
    await step('the run on screen', until(() => onScreenIn('atlas-billing', PROMPT), (v) => v === true, { timeoutMs: 20_000, what: 'the prompt on screen' }));
    await d.useWindow('atlas-billing');
    await step('Ctrl+1', d.chord('Ctrl+1'));
    await step('New session', d.click('button', { text: 'New session' }));
    await step('Start session', d.click('[data-testid="start-session-accept"]'));
    await step('the holding window released it', until(() => onScreenIn('atlas-billing', PROMPT), (v) => v === false, { timeoutMs: 10_000, what: 'the released run off screen' }));
    const ending = await step('the ending notice in the first window', until(() => noticeIn('other-project'), (n) => n !== null && /^Session \S+ completed$/.test(n.title ?? ''), { timeoutMs: 60_000, what: "REQ-NOTIFY-031's notice in the first window" }));
    await d.useWindow('other-project');
    await step('Open the session, in the window that does not hold it', d.click('.notice__action', { text: 'Open the session' }));
    const followed = await step('the holding window follows the session', until(() => onScreenIn('atlas-billing', PROMPT), (v) => v === true, { timeoutMs: 20_000, what: 'the session on screen in the holding window' }));
    const firstStill = await onScreenIn('other-project', PROMPT);
    const windowsAtEnd = await d.windows();
    value = { ending, followed, firstStill, windowsAtEnd: windowsAtEnd.windows.map((w) => w.workspace), banner, dirty, there, surfaced: surfaced.windows.map((w) => w.workspace), project, stayed, closedBanner, told, addedProject, windowsAfter: after.windows.map((w) => w.workspace) };
  } catch (cause) {
    failure = cause;
  }
  const stopped = await stopApp(launched, { screenshot: join(output, 'project-init.closing.png') });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, 'project-init.log'), log);
  writeFileSync(join(output, 'project-init.steps.json'), `${JSON.stringify(trail, null, 2)}\n`);
  if (failure) throw new Error(`project-init: ${failure.message} (see project-init.log, project-init.steps.json)`);
  expect(!stopped.overran, 'project-init: the app did not stop within its bound');
  expect(value.banner.action === 'Try again' && value.banner.member === 'open-project-init', `the background banner offers ${JSON.stringify(value.banner)} (PD-WORKSPACE-005 revision 2, REQ-WORKSPACE-103)`);
  expect(value.there.action === 'Try again' && value.there.member === 'open-project-init', `the first window's banner offers ${JSON.stringify(value.there)}`);
  const holderId = (log.match(/main window (\d+) loaded for .*atlas-billing/) ?? [])[1];
  expect(holderId !== undefined && new RegExp(`project-setup action for .*atlas-billing: surfaced window ${holderId} and opened`).test(log), `main did not surface the holding window (${holderId ?? 'not found'})`);
  expect(value.project.view === 'Settings' && value.project.category === 'Project', `the holding window shows ${JSON.stringify(value.project)}, not Settings › Project`);
  expect(value.project.retry === true, `Settings › Project offers no "Retry initialization": ${JSON.stringify(value.project)}`);
  expect(value.project.save === 'Unsaved changes', `opening Settings › Project lost the unsaved Instructions edit: the save bar reads ${JSON.stringify(value.project.save)}`);
  expect(value.stayed !== 'Settings', 'the pressing window opened Settings itself; only the holding window should');
  expect(value.surfaced[0]?.endsWith('atlas-billing'), `the holding window is not the focused one after the press: ${JSON.stringify(value.surfaced)}`);
  expect(/project-setup action for .*atlas-billing: surfaced window \d+ and opened Settings › Project there/.test(log), 'main did not log the surfacing');
  expect(!/notice action "open-project-init" has no target/.test(log), 'the renderer still reports the action without a target');
  // PD-WORKSPACE-005 revision 3 (OQ-294): the closed project's press added a window for it, which shows Settings › Project.
  expect(value.windowsAfter.length === 3 && value.windowsAfter.some((w) => w.endsWith('closed-project')), `no window was added for the closed project: ${JSON.stringify(value.windowsAfter)}`);
  expect(value.addedProject.view === 'Settings' && value.addedProject.category === 'Project' && value.addedProject.retry === true, `the added window shows ${JSON.stringify(value.addedProject)}, not Settings › Project with "Retry initialization"`);
  expect(!value.told.some((t) => /not open in any window/.test(t)), `revision 2's acknowledgement appeared: ${JSON.stringify(value.told)}`);
  expect(/notice action reached .*closed-project: added window \d+ for it/.test(log), 'main did not log the reach adding a window for the closed project');
  expect(/project-setup action for .*closed-project: added window \d+ and opened Settings › Project there \((sent|held); PD-WORKSPACE-005 revision 3, OQ-294\)/.test(log), 'main did not log the closed project\'s press opening Settings › Project in the added window');
  // PD-SHELL-001 revision 3 (OQ-292): the press reached the holding window, which follows the session; nothing was refused.
  expect(value.ending.member === 'focus-session' && value.ending.action === 'Open the session', `the ending notice offers ${JSON.stringify(value.ending)}`);
  const endedId = (value.ending.title.match(/^Session (\S+) completed$/) ?? [])[1];
  expect(new RegExp(`notice action "focus-session" for ${endedId}: surfaced window ${holderId} for .*atlas-billing; the focus was sent`).test(log), `main did not log the press reaching the holding window ${holderId}`);
  expect(value.followed === true, 'the holding window does not show the session after the press');
  expect(value.firstStill === false, 'the pressing window loaded the session itself; the holding window should');
  expect(value.windowsAtEnd.length === value.windowsAfter.length, `the press added or closed a window: ${JSON.stringify([value.windowsAfter, value.windowsAtEnd])}`);
  expect(!/notice #\d+ error "The session could not be loaded"/.test(log), 'the focus-session press raised "The session could not be loaded"');
  expect(!/not dispatched in window/.test(log), 'the withdrawn silence still logged a press as not dispatched');
  results.projectInit = value;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6d. PD-SHELL-001 revision 3 (OQ-292) after a switch: the session's workspace is held by no window when its notice is
// pressed. Window A runs a session and releases it with "New session"; window B is added on another project before the run
// ends, so REQ-NOTIFY-031's notice stands in both; A then switches to a third project (REQ-SHELL-017's replacement: no run is
// active by then). "Open the session" pressed in B reaches A's project, which no window holds: a window is added for it on
// PD-SHELL-001's add terms — nothing asked, nothing closed — and the added window, given the focus once its renderer listens
// (`session.focusReady`), follows the session.
if (want('6d')) {
  const base = join(output, 'focus-reach');
  const folder = (name) => {
    const root = join(base, name);
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    writeFileSync(join(root, 'README.md'), `# notice proof, ${name}\n`);
    writeFileSync(join(root, '.rotaris', 'agents.yaml'), [
      '# scratch configuration written by the proof script',
      'models:', '  scripted: { provider: scripted, model_id: scripted }',
      'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
      'mcp_servers:', '  code_intelligence: { enabled: false }',
      'runtime:', '  permission_mode: autonomous', '  improvement_collector_enabled: false',
      ...SETUP_ANSWERED, '',
    ].join('\n'));
    return root;
  };
  const alpha = folder('reach-alpha');
  const beta = folder('reach-beta');
  const gamma = folder('reach-gamma');
  const PROMPT = 'a run whose window switched away before its notice was pressed';
  const launched = await startApp({
    root: join(base, 'app'), workspace: alpha, timeoutMs: 90_000,
    extra: { ROTARIS_SCRIPT: 'wait:6000,answer', ROTARIS_CAPTURE_PROJECT_FOLDER: `${beta};;${gamma}`, ROTARIS_CAPTURE_PNG: join(output, 'focus-reach.png'), ROTARIS_CAPTURE_AFTER_MS: '170000' },
  });
  const d = launched.driver;
  const trail = [];
  const step = async (what, promise) => { const t0 = Date.now(); try { const v = await promise; trail.push({ what, ms: Date.now() - t0 }); return v; } catch (cause) { trail.push({ what, ms: Date.now() - t0, error: String(cause) }); throw cause; } };
  const onScreenIn = async (which, text) => { await d.useWindow(which); return await d.eval(`document.querySelector('.app-shell main, .app-shell')?.innerText.includes(${JSON.stringify(text)}) === true && !document.querySelector('[data-testid="notice"]')?.innerText.includes(${JSON.stringify(text)})`); };
  const noticeIn = async (which) => { await d.useWindow(which); return await d.eval(`(() => { const n = document.querySelector('[data-testid="notice"]'); if (!n) return null; const a = n.querySelector('.notice__action'); return { title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, action: a?.textContent ?? null, member: a?.getAttribute('data-action') ?? null }; })()`); };
  let value = null;
  let failure = null;
  try {
    await step('the first window', d.waitFor('.nav-item', { timeoutMs: 30_000 }));
    // B, added before the run ends, so the notice is published while it exists.
    await step('window B', d.command({ kind: 'workspace.choose', newWindow: true }));
    await step('two main windows', until(() => d.windows(), (w) => w.windows.length === 2, { timeoutMs: 30_000, what: 'window B added' }));
    // The run in A, released there by "New session" while its scripted call waits.
    await d.useWindow('reach-alpha');
    await step('Workspace in A', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus' }));
    await step('the prompt', d.type(PROMPT, { enter: true }));
    await step('the run on screen', until(() => onScreenIn('reach-alpha', PROMPT), (v) => v === true, { timeoutMs: 20_000, what: 'the prompt on screen' }));
    await d.useWindow('reach-alpha');
    await step('Ctrl+1', d.chord('Ctrl+1'));
    await step('New session', d.click('button', { text: 'New session' }));
    await step('Start session', d.click('[data-testid="start-session-accept"]'));
    await step('A released it', until(() => onScreenIn('reach-alpha', PROMPT), (v) => v === false, { timeoutMs: 10_000, what: 'the released run off screen' }));
    const ending = await step('the ending notice in B', until(() => noticeIn('reach-beta'), (n) => n !== null && /^Session \S+ completed$/.test(n.title ?? ''), { timeoutMs: 60_000, what: "REQ-NOTIFY-031's notice in window B" }));
    // A switches to the third project: the replacement route, no run active any more.
    await d.useWindow('reach-alpha');
    await step('A switches to gamma', d.command({ kind: 'workspace.choose', newWindow: false }));
    const switched = await step('no window holds alpha', until(() => d.windows(), (w) => w.windows.length === 2 && w.windows.every((x) => !String(x.workspace).endsWith('reach-alpha')) && w.windows.some((x) => String(x.workspace).endsWith('reach-gamma')), { timeoutMs: 30_000, what: 'A replaced by gamma' }));
    // The gamma window was built after the notice was published, and shows it all the same: it asked main for the current
    // notice at boot (`notice.current`; docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).
    const lateNotice = await step('the notice in the window built after it', until(() => noticeIn('reach-gamma'), (n) => n !== null && n.title === ending.title, { timeoutMs: 15_000, what: 'the current notice in the window built after its publication' }));
    await d.useWindow('reach-beta');
    await step('Open the session, in B', d.click('.notice__action', { text: 'Open the session' }));
    const added = await step('a window added for alpha', until(() => d.windows(), (w) => w.windows.length === 3 && w.windows.some((x) => String(x.workspace).endsWith('reach-alpha')), { timeoutMs: 30_000, what: 'a window added for alpha' }));
    const followed = await step('the added window follows the session', until(() => onScreenIn('reach-alpha', PROMPT), (v) => v === true, { timeoutMs: 30_000, what: 'the session on screen in the added window' }));
    const bStill = await onScreenIn('reach-beta', PROMPT);
    const gammaStill = await onScreenIn('reach-gamma', PROMPT);
    value = { ending, lateNotice, switched: switched.windows.map((w) => w.workspace), added: added.windows.map((w) => w.workspace), followed, bStill, gammaStill };
  } catch (cause) {
    failure = cause;
  }
  const stopped = await stopApp(launched, { screenshot: join(output, 'focus-reach.closing.png') });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, 'focus-reach.log'), log);
  writeFileSync(join(output, 'focus-reach.steps.json'), `${JSON.stringify(trail, null, 2)}\n`);
  if (failure) throw new Error(`focus-reach: ${failure.message} (see focus-reach.log, focus-reach.steps.json)`);
  expect(!stopped.overran, 'focus-reach: the app did not stop within its bound');
  expect(value.ending.member === 'focus-session' && value.ending.action === 'Open the session', `the ending notice offers ${JSON.stringify(value.ending)}`);
  expect(value.lateNotice.title === value.ending.title && value.lateNotice.member === 'focus-session', `the window built after the publication shows ${JSON.stringify(value.lateNotice)}`);
  const endedId = (value.ending.title.match(/^Session (\S+) completed$/) ?? [])[1];
  expect(new RegExp(`notice action "focus-session" for ${endedId}: added window \\d+ for .*reach-alpha; the focus was (sent|held)`).test(log), 'main did not log the press adding a window for the session\'s workspace');
  expect(/notice action reached .*reach-alpha: added window \d+ for it/.test(log), 'the reach did not add a window for alpha');
  expect(value.followed === true, 'the added window does not show the session');
  expect(value.bStill === false && value.gammaStill === false, `a window other than the added one loaded the session: ${JSON.stringify([value.bStill, value.gammaStill])}`);
  expect(!/workspace open declined|ended by the unsaved-settings guard/.test(log.slice(log.lastIndexOf('notice action "focus-session"'))), 'a REQ-SHELL-021 gate ran on the notice action');
  expect(!/notice #\d+ error "The session could not be loaded"/.test(log), 'the focus-session press raised "The session could not be loaded"');
  results.focusReach = value;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REQ-NOTIFY-045 (OQ-178): the retry action reaches its target. A run fails at its first model call (a 401, which no
// recovery retries), so the session's last submitted prompt is the one that failed and the composer, submitted, is empty.
// No failure notice in this build carries the retry as its one action (OQ-178's reading, confirmed 2026-10-06 by R-071: each failure class names
// another), so the proof publishes one carrying it through the REAL store, scoped to the failed session, and clicks it:
// the window resubmits the last submitted prompt to the session it follows, and a second run of that session starts on
// it. (Its outcome is the double's: a new iteration's root starts the script again, so it meets the same 401; what is
// measured is that the retry reached its target.) Before the repair of
// `docs/defects/fixed/the-retry-run-notice-action-has-no-target.md` the window logged "has no target" and nothing ran.
const s5 = scenario('retry-action');
if (want('7')) {
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const PROMPT = 'the prompt that failed once';
  const r = await launch('retry-action', s5, {
    ROTARIS_SCRIPT: 'fail:401',
    ROTARIS_CAPTURE_PROMPT: PROMPT,
    ROTARIS_CAPTURE_NOTICES: step(6000, { op: 'report', severity: 'error', title: 'The run failed', message: 'Retry the failed run.', persistent: true, action: { label: 'Retry', action: { kind: 'retry-run' } } }),
    ROTARIS_CAPTURE_INSPECT_AT: '.notice__action@6600',
    ROTARIS_CAPTURE_CLICKS: '.notice__action>>Retry@7000',
    ROTARIS_CAPTURE_AFTER_MS: '14000',
  });
  const action = inspectAt(r.log, 6600, '.notice__action')?.matches ?? [];
  expect(action.length === 1 && action[0].text === 'Retry' && action[0].attrs['data-action'] === 'retry-run', `the notice offers ${JSON.stringify(action.map((a) => [a.text, a.attrs['data-action']]))}`);
  expect(/capture: clicked "Retry"/.test(r.log), 'the retry action was not clicked — see retry-action.log');
  expect(!/notice action "retry-run" has no target/.test(r.log), 'the window still dispatches retry-run nowhere');
  const db = open(s5);
  const sessions = db.prepare('SELECT session_id, execution_status, iterations_completed FROM sessions ORDER BY created_at').all();
  const users = sessions.length === 1 ? db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(sessions[0].session_id).map((row) => row.body) : [];
  db.close();
  expect(sessions.length === 1, `the retry went to ${sessions.length} sessions, not the one that failed (REQ-NOTIFY-030)`);
  expect(users.length === 2 && users.every((b) => b === PROMPT), `the session's submitted prompts: ${JSON.stringify(users)} — the retry did not resubmit the last one (REQ-NOTIFY-045)`);
  // The retried run is a second run of the same session: a second iteration, and an orchestrator call after the click.
  expect(sessions[0].iterations_completed === 2, `the retry started no second run of the session: ${JSON.stringify(sessions[0])}`);
  const afterClick = r.log.slice(r.log.indexOf('capture: clicked "Retry"'));
  expect(/scripted model call: [^\n]* \(orchestrator\)/.test(afterClick), 'no model call followed the retry');
  expect((r.log.match(/run [0-9a-f-]+ ended /g) ?? []).length === 2, `the session did not run twice: ${(r.log.match(/run [0-9a-f-]+ ended [^\n]*/g) ?? []).join(' | ')}`);
  results.retryAction = {
    actionLabel: action[0].text, member: action[0].attrs['data-action'], submittedPrompts: users,
    session: sessions[0], png: join(output, 'retry-action.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// 7b. REQ-NOTIFY-045 with REQ-SESSION-192 and REQ-CHAT-173: the retry resubmits the session's last prompt from the store,
// image included. A first launch fails a prompt at its first model call; between the launches the proof gives that
// prompt's row one stored PNG (the file under the session's directory, its digest on the row, as `persistAttachments`
// writes them) and appends more rows after it than the resident window holds, releasing the oldest pages as the writer
// does, so the prompt is no longer resident. The second launch reopens the session, and the retry action is clicked.
// Before the repair of `docs/defects/fixed/the-retry-action-reads-the-last-prompt-from-the-resident-window.md` the
// window searched its replica, found no prompt and refused ("Nothing was retried"); before that of
// `docs/defects/fixed/the-retry-action-resubmits-a-prompt-without-its-images.md` it re-sent the text alone.
const s6 = scenario('retry-image', { images: true });
if (want('7b')) {
  const step = (at, obj) => `${JSON.stringify(obj)}@${at}`;
  const PROMPT = 'the prompt that failed with its image';
  const RESIDENT_ROW_CAP = 5000;
  const PAGE = 50;
  const first = await launch('retry-image-first', s6, { ROTARIS_SCRIPT: 'fail:401', ROTARIS_CAPTURE_PROMPT: PROMPT, ROTARIS_CAPTURE_AFTER_MS: '9000' });
  expect(first.errors.length === 0, `renderer errors: ${first.errors.join(' | ')}`);
  const dbPath = oneDatabase(s6.local);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
  const digest = createHash('sha256').update(png).digest('hex');
  let sid;
  {
    const db = new Database(dbPath);
    const sessions = db.prepare('SELECT session_id, execution_status FROM sessions').all();
    expect(sessions.length === 1 && sessions[0].execution_status === 'failed', `the first launch left ${JSON.stringify(sessions)}, not one failed session`);
    sid = sessions[0].session_id;
    const user = db.prepare("SELECT row_index FROM transcript_rows WHERE session_id = ? AND kind = 'user'").all(sid);
    expect(user.length === 1, `the first launch recorded ${user.length} prompts`);
    const rel = `attachments/${digest.slice(0, 16)}-shot.png`;
    mkdirSync(join(dirname(dbPath), 'sessions', sid, 'attachments'), { recursive: true });
    writeFileSync(join(dirname(dbPath), 'sessions', sid, rel), png);
    db.prepare('UPDATE transcript_rows SET attachments = ? WHERE session_id = ? AND row_index = ?').run(JSON.stringify([{ name: 'shot.png', mediaType: 'image/png', size: png.length, path: rel, digest }]), sid, user[0].row_index);
    const at = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO transcript_rows (session_id, row_index, kind, settled, body, at, ts, page, attachments) VALUES (?, ?, 'agent', 1, ?, ?, ?, NULL, '[]')`);
    const release = db.prepare(`UPDATE transcript_rows SET page = ? WHERE rowid IN (SELECT rowid FROM transcript_rows WHERE session_id = ? AND page IS NULL ORDER BY row_index LIMIT ${PAGE})`);
    db.transaction(() => {
      let next = db.prepare('SELECT max(row_index) AS m FROM transcript_rows WHERE session_id = ?').get(sid).m + 1;
      for (let i = 0; i < RESIDENT_ROW_CAP + PAGE; i += 1, next += 1) insert.run(sid, next, `a later row ${i}`, at, at.slice(11, 19));
      while (db.prepare('SELECT count(*) AS c FROM transcript_rows WHERE session_id = ? AND page IS NULL').get(sid).c > RESIDENT_ROW_CAP) {
        release.run((db.prepare('SELECT max(page) AS m FROM transcript_rows WHERE session_id = ?').get(sid).m ?? -1) + 1, sid);
      }
    })();
    const prompt = db.prepare("SELECT page FROM transcript_rows WHERE session_id = ? AND kind = 'user'").get(sid);
    expect(prompt.page !== null, 'the planted rows did not release the prompt from the resident window');
    db.close();
  }
  const calls = join(output, 'retry-image-calls.jsonl');
  const r = await launch('retry-image', s6, {
    ROTARIS_CAPTURE_RESUME: sid,
    ROTARIS_CAPTURE_MODEL_REQUESTS: calls,
    ROTARIS_CAPTURE_NOTICES: step(9000, { op: 'report', severity: 'error', title: 'The run failed', message: 'Retry the failed run.', persistent: true, sessionId: sid, action: { label: 'Retry', action: { kind: 'retry-run' } } }),
    ROTARIS_CAPTURE_INSPECT_AT: '.notice__action@9600',
    ROTARIS_CAPTURE_CLICKS: '.notice__action>>Retry@10000',
    ROTARIS_CAPTURE_AFTER_MS: '18000',
  }, { timeout: 180_000 });
  expect(new RegExp(`capture: opened session "${sid}"`).test(r.log), 'the failed session was not reopened — see retry-image.log');
  expect(/capture: clicked "Retry"/.test(r.log), 'the retry action was not clicked — see retry-image.log');
  expect(!/Nothing was retried/.test(r.log), 'the retry was refused — the window still looks for the prompt in its resident window');
  const db = open(s6);
  const session = db.prepare('SELECT session_id, execution_status, iterations_completed FROM sessions WHERE session_id = ?').get(sid);
  const users = db.prepare("SELECT row_index, body, page, attachments FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(sid);
  db.close();
  expect(users.length === 2 && users.every((u) => u.body === PROMPT), `the session's submitted prompts: ${JSON.stringify(users.map((u) => u.body))} — the retry did not resubmit the released prompt (REQ-NOTIFY-045, REQ-SESSION-192)`);
  const resent = JSON.parse(users[1].attachments);
  expect(resent.length === 1 && resent[0].digest === digest && resent[0].name === 'shot.png', `the retried prompt's row carries ${users[1].attachments}, not the image it was sent with (REQ-CHAT-173)`);
  expect(session.iterations_completed === 2, `the retry started no second run of the session: ${JSON.stringify(session)}`);
  const sent = existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const withImage = sent.filter((c) => c.who === 'orchestrator' && c.images.includes(digest));
  expect(withImage.length >= 1, `no model call after the retry carried the image: ${JSON.stringify(sent.map((c) => [c.who, c.images]))}`);
  results.retryImage = {
    releasedPromptPage: users[0].page, promptRowIndex: users[0].row_index, retriedRowIndex: users[1].row_index,
    digest, retriedDigest: resent[0].digest, modelCallsWithImage: withImage.length, session, png: join(output, 'retry-image.png'), elapsedMs: r.elapsedMs,
  };
  expect(r.errors.length === 0, `renderer errors: ${r.errors.join(' | ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. REQ-NOTIFY-031 / REQ-MONITOR-202: a run that completes while its session is not the one on screen raises the notice
// naming it. Before the repair of `docs/defects/fixed/a-background-runs-non-failure-ending-raises-its-summary-not-a-notice-naming-the-session.md`
// the ending raised the run's summary ("The run completed.") whatever the focus, and after "New session" main still
// counted the released session as the one on screen (`session.release`).
// The improvement collector off: its own notice follows a completed run within seconds and would replace the one read here
// in the single slot (REQ-NOTIFY-024), which is that notice's business and not this scenario's.
const s7 = scenario('background-ending', { runtime: ['  improvement_collector_enabled: false'] });
if (want('8')) {
  const PROMPT = 'a run that finishes in the background';
  const started = Date.now();
  const launched = await startApp({ root: s7.root, workspace: s7.workspace, timeoutMs: 60_000, extra: { ROTARIS_SCRIPT: 'wait:6000,answer' } });
  const d = launched.driver;
  const trail = [];
  const step = async (label, pending) => { const at = Date.now() - started; const value = await pending; trail.push({ at, label }); return value; };
  const onScreen = (text) => d.eval(`document.querySelector('.app-shell main, .app-shell')?.innerText.includes(${JSON.stringify(text)}) === true && !document.querySelector('[data-testid="notice"]')?.innerText.includes(${JSON.stringify(text)})`);
  let failure = null;
  let value = null;
  try {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus' }));
    await step('the prompt', d.type(PROMPT, { enter: true }));
    await step('the run on screen', until(() => onScreen(PROMPT), (v) => v === true, { timeoutMs: 20_000, what: 'the prompt on screen' }));
    // "New session" from the Overview, accepted while the run holds its scripted 6 s wait: the window follows nothing now.
    await step('Ctrl+1', d.chord('Ctrl+1'));
    await step('New session', d.click('button', { text: 'New session' }));
    await step('Start session', d.click('[data-testid="start-session-accept"]'));
    const released = await step('the window released it', until(() => onScreen(PROMPT), (v) => v === false, { timeoutMs: 10_000, what: 'the released run off screen' }));
    const notice = await step('the notice naming the session', until(() => d.eval(`[...document.querySelectorAll('[data-testid="notice-title"]')].map((t) => t.textContent)`), (titles) => titles.length === 1 && /^Session \S+ completed$/.test(titles[0]), { timeoutMs: 60_000, what: "REQ-NOTIFY-031's notice" }));
    const parts = await step('the notice read', d.eval(`(() => { const n = document.querySelector('[data-testid="notice"]'); return { title: n.querySelector('[data-testid="notice-title"]')?.textContent, message: n.querySelector('[data-testid="notice-message"]')?.textContent, severity: n.getAttribute('data-severity'), action: n.querySelector('.notice__action')?.textContent, member: n.querySelector('.notice__action')?.getAttribute('data-action') }; })()`));
    const stillReleased = await step('the window did not move', onScreen(PROMPT));
    await step('the notice picture', d.screenshot(join(output, 'background-ending.png')));
    await step('Open the session', d.click('.notice__action', { text: 'Open the session' }));
    const focused = await step('the finished session on screen', until(() => onScreen(PROMPT), (v) => v === true, { timeoutMs: 20_000, what: 'the finished session focused' }));
    await step('the focused picture', d.screenshot(join(output, 'background-ending-focused.png')));
    value = { released, notice: notice[0], parts, stillReleased, focused };
  } catch (cause) {
    failure = cause;
  }
  const stopped = await stopApp(launched, { screenshot: join(output, 'background-ending.closing.png') });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, 'background-ending.log'), log);
  writeFileSync(join(output, 'background-ending.steps.json'), `${JSON.stringify(trail, null, 2)}\n`);
  if (failure) throw new Error(`background-ending: ${failure.message} (see background-ending.log, background-ending.steps.json)`);
  expect(!stopped.overran, 'background-ending: the app did not stop within its bound');
  expect(!backgroundSetupStarted(log), 'background-ending: a background setup started, so its notice may stand in the slot this proof reads');
  const db = open(s7);
  const session = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at').all();
  db.close();
  expect(session.length === 1 && session[0].execution_status === 'completed', `the released run: ${JSON.stringify(session)}`);
  const sid = session[0].session_id;
  const p = value.parts;
  expect(p.title === `Session ${sid} completed` && p.severity === 'success', `the notice names ${JSON.stringify(p.title)} at ${p.severity}, not the session and its state at success (REQ-NOTIFY-031)`);
  expect(p.message === 'The session on screen is unaffected. Open the finished session to review it.', `the notice's body: ${JSON.stringify(p.message)}`);
  expect(p.action === 'Open the session' && p.member === 'focus-session', `the notice's action: ${JSON.stringify([p.action, p.member])}`);
  expect(value.stillReleased === false, 'publishing the notice moved the window onto the finished session (REQ-NOTIFY-031)');
  expect(/session \S+ is not focused; REQ-NOTIFY-031's notice is raised/.test(log), 'main did not log the unfocused ending');
  results.backgroundEnding = { sessionId: sid, notice: p, windowMovedByNotice: value.stillReleased, focusedByAction: value.focused, png: join(output, 'background-ending.png'), focusedPng: join(output, 'background-ending-focused.png'), elapsedMs: Date.now() - started };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. REQ-NOTIFY-093 with REQ-NOTIFY-030/031: a run that ends on a provider limit while its session is not on screen raises
// REQ-NOTIFY-031's notice naming it, and REQ-NOTIFY-063's notice with its model-settings action arrives with the focus.
// Before the repair of `docs/defects/fixed/a-background-run-ended-on-a-provider-limit-loses-its-quota-notice.md` nothing
// was held for the focus, so the limit reached the user only as a plain ending.
const s9 = scenario('background-quota', { runtime: ['  improvement_collector_enabled: false'] });
if (want('9')) {
  const PROMPT = 'a run that parks on a provider limit';
  const started = Date.now();
  // `fail:quota` with no same-tier candidate: the provider is marked exhausted and the wait never resumes on its own.
  const launched = await startApp({ root: s9.root, workspace: s9.workspace, timeoutMs: 60_000, extra: { ROTARIS_SCRIPT: 'fail:quota,answer' } });
  const d = launched.driver;
  const trail = [];
  const step = async (label, pending) => { const at = Date.now() - started; const value = await pending; trail.push({ at, label }); return value; };
  const onScreen = (text) => d.eval(`document.querySelector('.app-shell main, .app-shell')?.innerText.includes(${JSON.stringify(text)}) === true && !document.querySelector('[data-testid="notice"]')?.innerText.includes(${JSON.stringify(text)})`);
  const readNotice = () => d.eval(`(() => { const n = document.querySelector('[data-testid="notice"]'); return n ? { title: n.querySelector('[data-testid="notice-title"]')?.textContent, message: n.querySelector('[data-testid="notice-message"]')?.textContent ?? null, detail: n.querySelector('[data-testid="notice-detail"]')?.textContent ?? null, severity: n.getAttribute('data-severity'), action: n.querySelector('.notice__action')?.textContent, member: n.querySelector('.notice__action')?.getAttribute('data-action') } : null; })()`);
  const sessionRow = () => { const db = open(s9); try { return db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at').all(); } finally { db.close(); } };
  let failure = null;
  let value = null;
  try {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus' }));
    await step('the prompt', d.type(PROMPT, { enter: true }));
    await step('the wait header', d.waitFor('.wait-header', { timeoutMs: 60_000 }));
    const rows = await step('the session recorded', until(() => sessionRow(), (r) => r.length === 1, { timeoutMs: 10_000, what: 'the parked session in the store' }));
    const sid = rows[0].session_id;
    await step('Ctrl+1', d.chord('Ctrl+1'));
    // Under load the Overview and the start-session dialog can take longer than the click's default to be actionable
    // (a verifier saw it at load 4.58); the bound is the wait for them, not a timing claim.
    await step('New session', d.click('button', { text: 'New session', timeoutMs: 60_000 }));
    await step('Start session', d.click('[data-testid="start-session-accept"]', { timeoutMs: 60_000 }));
    const released = await step('the window released it', until(() => onScreen(PROMPT), (v) => v === false, { timeoutMs: 10_000, what: 'the parked run off screen' }));
    const cancel = await step('the parked run stopped from the background', d.eval(`window.rotaris.command({ kind: 'session.control', request: { op: 'cancel', sessionId: ${JSON.stringify(sid)}, args: { force: false } } })`));
    const ending = await step('the notice naming the session', until(() => readNotice(), (n) => n !== null && n.title?.startsWith(`Session ${sid} `) === true, { timeoutMs: 60_000, what: "REQ-NOTIFY-031's notice" }));
    const stillReleased = await step('the window did not move', onScreen(PROMPT));
    await step('the notice picture', d.screenshot(join(output, 'background-quota.png')));
    await step('Open the session', d.click('.notice__action', { text: 'Open the session' }));
    const focused = await step('the parked session on screen', until(() => onScreen(PROMPT), (v) => v === true, { timeoutMs: 20_000, what: 'the stopped session focused' }));
    const quota = await step("REQ-NOTIFY-063's notice", until(() => readNotice(), (n) => n !== null && n.title === 'The provider limit was reached; the session is preserved', { timeoutMs: 20_000, what: "REQ-NOTIFY-063's notice with the focus" }));
    await step('the focused picture', d.screenshot(join(output, 'background-quota-focused.png')));
    await step('Open Models settings', d.click('.notice__action', { text: 'Open Models settings' }));
    const settings = await step('the model settings', until(() => d.eval(`document.querySelector('main.view')?.getAttribute('aria-label') ?? null`), (v) => v === 'Settings', { timeoutMs: 10_000, what: 'the Settings view' }));
    value = { sid, released, cancel, ending, stillReleased, focused, quota, settings };
  } catch (cause) {
    failure = cause;
  }
  const stopped = await stopApp(launched, { screenshot: join(output, 'background-quota.closing.png') });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, 'background-quota.log'), log);
  writeFileSync(join(output, 'background-quota.steps.json'), `${JSON.stringify(trail, null, 2)}\n`);
  if (failure) throw new Error(`background-quota: ${failure.message} (see background-quota.log, background-quota.steps.json)`);
  expect(!stopped.overran, 'background-quota: the app did not stop within its bound');
  expect(!backgroundSetupStarted(log), 'background-quota: a background setup started, so its notice may stand in the slot this proof reads');
  const db = open(s9);
  const sessions = db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at').all();
  db.close();
  const row = sessions.find((r) => r.session_id === value.sid);
  expect(row !== undefined && row.execution_status !== 'failed', `the parked run: ${JSON.stringify(sessions)} (a cancelled wait is not a failure, so REQ-NOTIFY-032 does not reach it)`);
  const e = value.ending;
  // REQ-NOTIFY-031: `info` for every non-failure terminal state but `completed`, the state in the normalised vocabulary.
  // The cancelled wait is not a failure: the run rests at the state the stop reached (`paused`, observed 2026-10-02).
  const reached = new RegExp(`^Session ${value.sid} (\\w+)$`).exec(e.title ?? '')?.[1];
  expect(e.severity === 'info' && reached !== undefined && reached !== 'failed' && reached !== 'completed', `the ending notice: ${JSON.stringify(e)}`);
  expect(e.message === 'The session on screen is unaffected. Open the finished session to review it.' && e.action === 'Open the session' && e.member === 'focus-session', `REQ-NOTIFY-031's notice: ${JSON.stringify(e)}`);
  expect(value.stillReleased === false, 'publishing the notice moved the window onto the stopped session (REQ-NOTIFY-031)');
  const q = value.quota;
  expect(q.severity === 'error' && q.action === 'Open Models settings' && q.member === 'open-settings', `REQ-NOTIFY-063's notice: ${JSON.stringify(q)}`);
  expect(/Choose another model, or retry once the provider resets\./.test(q.detail ?? ''), `REQ-NOTIFY-063's notice carries no recovery sentence: ${JSON.stringify(q)}`);
  expect(/session \S+ is not focused; REQ-NOTIFY-031's notice is raised in place of its own, and REQ-NOTIFY-063's waits for the focus/.test(log), 'main did not log the held quota notice');
  expect(new RegExp(`session ${value.sid} is focused; its quota recovery is published`).test(log), 'main did not publish the held quota notice with the focus');
  results.backgroundQuota = { sessionId: value.sid, status: row.execution_status, stateNamed: reached, cancel: value.cancel, endingNotice: e, quotaNotice: { title: q.title, severity: q.severity, action: q.action }, settingsOpened: value.settings, png: join(output, 'background-quota.png'), focusedPng: join(output, 'background-quota-focused.png'), elapsedMs: Date.now() - started };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('\nPART V PROOF PASSED');
