// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091): its types are owed, and the list only shrinks.
/**
 * The driver's first execution (`pnpm driver-proof`).
 *
 * ONE launch of the built application, driven through the seam in `apps/desktop/src/main/driver.ts` and the
 * client in `lib/driver.mjs`: the window found, a view opened by clicking its name, a chord, text typed into the
 * composer, the document inspected and probed, the window resized to REQ-SHELL-022's minimum, a product command
 * sent through main's own `runCommand`, a photograph taken, a request with the wrong secret refused, and the app
 * quit. Every step WAITS for what it needs; no step is scheduled at a wall-clock offset, which is the whole
 * reason the seam exists.
 *
 * What it is evidence of: that the mechanism works against the shipped composition, and that the two claims the
 * design rests on hold — a wait bounded by a deadline reports the selector it gave up on, and a request without
 * the launch secret is refused without taking the window down with it.
 *
 * Since 2026-09-29 it is evidence of three repairs as well. A shot taken right after a navigation shows the view the
 * navigation opened: each of the primary views (six since PD-SHELL-015; seven then) is shot straight after its click, and every shot must differ from the one
 * before it, and the second launch's first navigation to the Workspace — the heaviest first paint, where the frame
 * before it was returned in a fifth of launches or more — is shot the same way
 * (`docs/archive/defects/the-drivers-shot-can-return-a-stale-frame.md`). And the driver's `quit` is the application's quit: a SECOND launch
 * starts a scripted run that holds its model call, quits through the driver while the run is live, and reads the store
 * afterwards — the session is at rest with the quit's stop reason, not `running`
 * (`docs/archive/defects/the-drivers-quit-skips-the-applications-shutdown.md`; before the repair it was `running` with no
 * stop reason). And the driver reaches the windows beside a main window: in that second launch the run's approval
 * dialog is answered with its own button and a persona window is probed through a role selector
 * (`docs/archive/defects/the-driver-cannot-address-persona-or-approval-windows.md`). Since 2026-10-07 a further launch
 * (13d) quits while a foreground `terminal` call runs and reads its record: PD-TOOLS-013's `interrupted`, no exit code, no
 * timeout and no issue (`docs/archive/defects/a-foreground-terminal-call-the-run-cancels-reads-as-a-timeout.md`).
 *
 * Since 2026-11-01 (R-091, step 9b) it is the first execution of the web-contents guard (`main/web-contents-guard.ts`): the
 * driven page calls `window.open` and sets `location.href` to another origin, and each is refused in main with one `warning`
 * line naming the origin alone while the window keeps the application's page (Electron security checklist 13 and 14).
 *
 * Since 2026-11-02 (R-091, steps 9c and 9d, 13a and 13c) it reads the web preferences of the main window, the approval dialog and
 * the persona and terminal windows back from Electron and asserts the secure set every window is built from
 * (`main/secure-web-preferences.ts`), and asks OQ-459's policy from the application's own page:
 * the microphone and the clipboard write granted, a camera, a display capture, a location and a notification refused.
 *
 * Since 2026-11-04 (R-091, hardening F3, step 9e) it measures the command boundary in the built app: the page sends a
 * request of an unknown kind and a 2,000,000-character prompt through its own preload channel, each answered
 * `command.malformed` as a value (the second naming the prompt and OQ-467's bound) — since OQ-485 was built (2026-11-04)
 * with exactly one `warning` line of the product's each, read as the whole line, the kind's text and the prompt absent
 * (until then with none) — and the driver's `commandThrowing` reaches the dispatcher's `command.failed` answer with one `error` line and
 * the thrown message redacted (ADR-0019, REQ-TOOLS-171).
 *
 * Evidence under `.proof/driver-proof/`: `app.log`, `screen.png`, `shots/`, `run-app.log`, `cut-app.log`, `results.json`.
 * `--skip-build` skips the build.
 *
 * PD-SHELL-015, PD-MONITOR-009 (2026-11-11): the rail carries six views and Mission is none; the agent table a persona is
 * popped out from stands on the Overview, reached by Ctrl+2 where 13b and 13c pressed Ctrl+3.
 * PD-SHELL-016 (2026-11-14): Workspace and Overview changed places, so the Overview is Ctrl+2 (it was Ctrl+1) and the
 * Workspace Ctrl+1 (it was Ctrl+2); the window opens on the Workspace.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect as connectSocket } from 'node:net';
import { join } from 'node:path';
import { buildDesktop, evidenceDirectory, oneDatabase } from './lib/harness.mjs';
import { clickLanded, endLaunch, startApp, until } from './lib/driver.mjs';
import { exitWithin } from './lib/bounded-launch.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const output = evidenceDirectory('.driver-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, 'shots'), { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

const workspace = join(output, 'workspace');
/**
 * finacc3 A2-19: the workspaces lie under the checkout's git-ignored `.proof/` and hold no repository of their own, so the
 * app's git climbed into the enclosing checkout and its Git view diffed that repository's branches (`main...fin27-d`).
 * fin30 set `GIT_CEILING_DIRECTORIES` at the evidence directory here (`NO_ENCLOSING_REPOSITORY`), which never reached the
 * app's git: the product deletes that variable from every git invocation (REQ-GIT-031, `GIT_ENV_DENYLIST`). Since fin34 the harness bars discovery at
 * `.proof/` for every proof (`barEnclosingRepository`, `lib/harness.mjs`), so each workspace is what it is meant to be here:
 * not a repository (`docs/archive/defects/proof-workspaces-under-the-checkouts-proof-directory-read-the-enclosing-repository.md`).
 */
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# driver proof\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  // ADR-0035's discovery costs ~4.5 s at every run start; this proof measures the driver, not the run.
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n'));

/** Whether the composer holds the document's focus — read from `activeElement`, which does not need the window focused. */
const COMPOSER_FOCUSED = "document.activeElement?.classList.contains('composer__input') === true";

/**
 * Open `persona`'s window with the agent table's own Pop out (REQ-SHELL-072), on the row that agent has, as a click
 * known to have landed. PD-MONITOR-009 (2026-11-11): the table is a card of the Overview (Ctrl+2; Ctrl+1 until PD-SHELL-016), where it was the
 * Mission view's (Ctrl+3 then). Until 2026-10-06, 13b and 13c clicked the first `.agent-table__row .btn` reading Pop out straight
 * after that chord, and nothing checked the press: in the acceptance run of that day the provider notice filled the notice
 * slot between the driver's measurement and its press, the table moved 75 px down under it, no `window.openPersona`
 * reached main, and 13c waited 15 s for a window nobody had asked for
 * (`docs/archive/defects/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`). Now the row is found by its persona
 * cell, the press is the driver's settled click — taken once the button holds still and is what its centre would press,
 * refused when it met something else, and pressed again only then — and a press that landed and opened no window within
 * 15 s is REQ-SHELL-072's to answer for, not the harness's.
 */
async function popOutPersona(d, persona) {
  const rowId = await until(
    () => d.eval(`[...document.querySelectorAll('.agent-table__row[data-agent-id]')].find((row) => (row.querySelector('.agent-table__persona')?.textContent ?? '').trim() === ${JSON.stringify(persona)})?.getAttribute('data-agent-id') ?? null`),
    (id) => typeof id === 'string' && id !== '',
    { timeoutMs: 15_000, what: `the ${persona} row in the Overview's agent table` },
  );
  const pressed = await clickLanded(d, `.agent-table__row[data-agent-id=${JSON.stringify(rowId)}] .btn`, { text: 'Pop out', timeoutMs: 15_000 });
  const listed = await until(() => d.windows(), (w) => w.auxiliary.some((a) => a.selector === `persona:${persona}`),
    { timeoutMs: 15_000, what: `REQ-SHELL-072: the ${persona} persona window, after a Pop out press that landed on its settled row (landed ${JSON.stringify(pressed.landed)}, ${pressed.missed.length} missed press(es))` });
  return { rowId, pressed, window: listed.auxiliary.find((a) => a.selector === `persona:${persona}`) };
}

const results = [];
let failures = 0;
const check = (name, ok, detail) => {
  results.push({ name, verdict: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const note = (name, detail) => { results.push({ name, verdict: 'NOTE', detail }); console.log(`NOTE  ${name} — ${detail}`); };

/**
 * R-091: the web preferences every window is built with (`main/secure-web-preferences.ts`), as the driver's `webPreferences`
 * op reads them back from Electron. Answers what differs, `[]` when nothing does; an empty `enableBlinkFeatures` reads `''`.
 */
const SECURE_PREFERENCES = { sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true, allowRunningInsecureContent: false, experimentalFeatures: false, webviewTag: false };
const looseKeys = (prefs) => [
  ...Object.entries(SECURE_PREFERENCES).filter(([key, value]) => prefs?.[key] !== value).map(([key]) => `${key}=${JSON.stringify(prefs?.[key])}`),
  ...(prefs?.enableBlinkFeatures === '' || prefs?.enableBlinkFeatures === null ? [] : [`enableBlinkFeatures=${JSON.stringify(prefs?.enableBlinkFeatures)}`]),
];

const started = await startApp({ root: join(output, 'app'), workspace, timeoutMs: 90_000 });
const d = started.driver;
try {
  const pong = await d.ping();
  check('the seam answers', pong.pid > 0 && pong.window === true, `pid ${pong.pid}, window present`);

  // 1. The wait. The shell is the first thing every other step depends on.
  const shell = await d.waitFor('.app-shell', { timeoutMs: 30_000 });
  check('waitFor finds the shell', shell.width > 0 && shell.height > 0, `${Math.round(shell.width)}×${Math.round(shell.height)} after ${shell.waitedMs} ms`);
  note('what the wait was worth', `the shell arrived ${shell.waitedMs} ms after the connection; a seam scheduled at a fixed offset would have had to guess this number`);

  // 2. The bound. A wait that cannot end must end anyway, and say what it was waiting for.
  const before = Date.now();
  const refused = await d.waitFor('.no-such-element-anywhere', { timeoutMs: 1_000 }).then(() => null).catch((cause) => cause);
  const waited = Date.now() - before;
  check('a wait that cannot succeed ends at its deadline', refused !== null && /no-such-element-anywhere/.test(refused.message) && waited < 4_000, `${refused === null ? 'it resolved' : refused.message} (after ${waited} ms)`);

  // 3. Six views, by PD-SHELL-015 over REQ-SHELL-023 (seven until 2026-11-11: Mission is no view). The inspect op reads the document the user is looking at.
  const rail = await d.inspect('.nav-item');
  const railNames = rail.matches.map((m) => (m.text ?? '').trim());
  check('the rail carries the six primary views (PD-SHELL-015)', rail.matches.length === 6 && !railNames.some((name) => /mission/i.test(name)), `${rail.matches.length} items: ${railNames.join(', ')}`);

  // 4. A click, located by the name on screen, changes the view (REQ-SHELL-049's views reached by pointer).
  const clicked = await d.click('.nav-item', { text: 'Git' });
  const gitView = await d.waitFor('.app-shell[data-view="git"]', { timeoutMs: 10_000 }).then(() => true).catch(() => false);
  check('a click by name opens that view', gitView, `clicked "${clicked.text}" at ${clicked.x},${clicked.y}; the shell reports data-view="git"`);

  // 5. A chord (REQ-SHELL-049: Ctrl+2 is Overview since PD-SHELL-016).
  await d.chord('Ctrl+2');
  const overview = await d.waitFor('.app-shell[data-view="overview"]', { timeoutMs: 10_000 }).then(() => true).catch(() => false);
  check('a chord reaches the shell', overview, 'Ctrl+2 returned the shell to Overview');

  // 6. Typing, into the control the product's own chord focuses (REQ-CHAT-002). No Enter: nothing is submitted.
  await d.chord('Ctrl+1'); // the Workspace: first view since PD-SHELL-016
  await d.waitFor('.composer__input', { timeoutMs: 10_000 });
  await d.chord('Ctrl+L');
  // The chord's focus is the product's to give, and it can come frames later (`focusComposer` retries after two); a
  // character sent before it lands nowhere. Wait for the focus the typing needs, as every other step waits.
  await until(() => d.eval(COMPOSER_FOCUSED), (v) => v === true, { timeoutMs: 10_000, what: 'the composer holding focus' });
  await d.type('driver proof draft');
  const composer = await d.eval(`document.querySelector('.composer__input')?.value ?? ''`);
  check('typed characters reach the focused control', composer === 'driver proof draft', JSON.stringify(composer));

  // 7. The probe shape the existing proofs read, from the same document.
  const probed = await d.probe('.nav-item');
  check('probe returns the proofs’ own shape', Array.isArray(probed) && probed.length === 6 && typeof probed[0].text === 'string', `${probed.length} rows, first "${probed[0]?.text}"`);

  // 8. REQ-SHELL-022's minimum window size, set and read back.
  const sized = await d.resize(1000, 680);
  check('the window resizes to the stated minimum', sized.width === 1000 && sized.height === 680, `${sized.width}×${sized.height}`);

  // 9. A product command through main's own path — not a shortcut around it.
  const themed = await d.command({ kind: 'theme.set', name: 'nocturne' });
  const applied = await d.eval(`document.documentElement.dataset.theme`);
  check('a command reaches the product’s own handler', themed.ok === true && applied === 'nocturne', `outcome ${JSON.stringify(themed)}, document reports "${applied}"`);

  // 9b. The web-contents guard (R-091; Electron security checklist 13 and 14; OQ-466): the page asks for a window and then
  // sends its own window to another origin. Both are refused in main, each with one `warning` line naming the origin alone
  // (never the path or the query, which carries a marker here), and the window still shows the application's page.
  const pageBefore = await d.eval('location.href');
  const opened = await d.eval(`window.open('https://example.invalid/driver-proof?marker=guard-open-9b') === null`);
  await d.eval(`(location.href = 'https://example.invalid/driver-proof?marker=guard-nav-9b', true)`);
  const guardLines = await until(
    () => (existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '').split(/\r?\n/).filter((line) => /(window|navigation) refused: /.test(line)),
    (lines) => lines.length >= 2,
    { timeoutMs: 10_000, what: 'the guard\'s two warning lines in the application log' },
  ).catch(() => []);
  const openLine = guardLines.find((line) => line.includes('window refused: a page asked to open https://example.invalid;'));
  const navLine = guardLines.find((line) => line.includes('navigation refused: will-navigate to https://example.invalid,'));
  check('window.open is denied with one warning naming the origin alone', opened === true && openLine !== undefined && /\bwarning\b/.test(openLine) && !openLine.includes('marker'), `window.open returned ${opened === true ? 'null' : 'a window'}; ${openLine ?? 'no line'}`);
  // The navigation is refused before it commits; the page is read once it answers again, so a refusal that came too late to
  // stop the load would show here as another URL or as no shell.
  const pageAfter = await until(() => d.eval('location.href').catch(() => null), (href) => typeof href === 'string', { timeoutMs: 10_000, what: 'the page answering after the refused navigation' });
  const shellStill = await d.waitFor('.app-shell', { timeoutMs: 10_000 }).then(() => true).catch(() => false);
  check('a page sent to another origin stays the application\'s page, with one warning naming the origin alone', navLine !== undefined && /\bwarning\b/.test(navLine) && !navLine.includes('marker') && pageAfter === pageBefore && shellStill, `${navLine ?? 'no line'}; before ${pageBefore}, after ${pageAfter}; shell ${shellStill ? 'present' : 'absent'}`);
  check('each refusal is said once', guardLines.length === 2, `${guardLines.length} guard line(s) in the log`);

  // 9c. One set of web preferences for every window (R-091; Electron security checklist 3, 4, 6, 8, 9 and 10): what the main
  // window's renderer was BUILT with, read back from Electron (`webContents.getLastWebPreferences()`), not what a site passed.
  const prefs = await d.webPreferences();
  const loose = looseKeys(prefs);
  check('the main window is built with the secure web preferences (R-091)', loose.length === 0, loose.length === 0 ? `${Object.keys(SECURE_PREFERENCES).length} keys as asked; enableBlinkFeatures ${JSON.stringify(prefs.enableBlinkFeatures)}` : `differs: ${loose.join(', ')}`);

  // 9d. OQ-459's policy (ruled 2026-11-01), asked by the application's own page: the microphone and the clipboard write are
  // granted, a camera, a display capture and a notification are refused. The display capture is refused by the request
  // handler (it is not audio alone) before the display-media handler is asked; `permissions.test.ts` holds that handler.
  const ask = (expression) => d.eval(`${expression}.then((answer) => answer, (e) => e.name)`);
  const display = await ask(`navigator.mediaDevices.getDisplayMedia({ video: true }).then(() => 'granted')`);
  const camera = await ask(`navigator.mediaDevices.getUserMedia({ video: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return 'granted'; })`);
  const states = {};
  for (const name of ['microphone', 'clipboard-write', 'camera', 'geolocation']) states[name] = await ask(`navigator.permissions.query({ name: '${name}' }).then((s) => s.state)`);
  const notification = await ask('Notification.requestPermission()');
  check('OQ-459: the own page is granted the microphone and the clipboard write, and nothing else it asked', states.microphone === 'granted' && states['clipboard-write'] === 'granted' && states.camera === 'denied' && states.geolocation === 'denied' && notification === 'denied', `${JSON.stringify(states)}; Notification ${notification}`);
  check('OQ-459: a display capture and a camera are refused to the own page', display === 'NotAllowedError' && camera === 'NotAllowedError', `getDisplayMedia ${display}; getUserMedia(video) ${camera}`);
  const devices = await d.eval(`Promise.all([navigator.hid?.getDevices(), navigator.serial?.getPorts(), navigator.usb?.getDevices()].map((p) => (p ?? Promise.resolve([])).then((l) => l.length, (e) => e.name)))`);
  note('OQ-459: devices the page already holds (HID, serial, USB)', JSON.stringify(devices));

  // 9e. The command boundary, measured in the built app (R-091, docs/architecture/hardening.md §3.5 row 7, F3; ADR-0044,
  // ADR-0019). Steps (1) and (2) are sent by the page itself through the preload's `command` — the renderer's own channel,
  // its sender check included — and step (3) through the driver's `commandThrowing`, main's own dispatcher with every
  // handler throwing, since no product handler throws on purpose. Each asserts the outcome's shape and the one line the step
  // leaves in the application log: for (1) and (2) the driver's own line for the eval that sent it and exactly one line of
  // the product's, the dispatcher's `warning` for the refusal (OQ-485, ruled and built 2026-11-04; until then none, which
  // this step asserted), matched as the whole line so that a second line, or one carrying a value, is a red; for (3) the
  // dispatcher's `error` line. Each refusal is the first of its class from this window, so neither is folded.
  // The log's complete lines: the empty text after its last newline is no line, or a slice taken from the count before a
  // step would start at it and miss the step's first line (measured: the first run of this step read none of its lines).
  const logLines = () => (existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '').split(/\r?\n/).slice(0, -1);
  const productCommandLine = (line) => !line.includes('driver: ') && /\bcommand\b|malformed/i.test(line);
  const viaPage = (request) => `window.rotaris.command(${request}).then((outcome) => outcome, (e) => ({ rejected: String(e?.message ?? e) }))`;
  const evalLine = /driver: eval .*ok\s*$/;
  // OQ-485: the dispatcher's line for a malformed command, whole — the window, the class (with the kind where it is one of
  // the union), the headline, and nothing else.
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const refusalLine = (what, headline) => new RegExp(`^\\[main [^\\]]+\\] warning\\s+refused a command from window \\d+ \\(${escaped(what)}\\): ${escaped(headline)}; answered command\\.malformed \\(OQ-485\\)$`);
  const stepLines = async (before, what) => until(() => logLines().slice(before), (lines) => lines.some((line) => evalLine.test(line)), { timeoutMs: 10_000, what }).catch(() => logLines().slice(before));

  // (1) A kind the contract does not have.
  const before1 = logLines().length;
  const unknownKind = await d.eval(viaPage(`{ kind: 'driver-proof.no-such-kind' }`));
  const lines1 = await stepLines(before1, 'the driver\'s line for the unknown kind\'s eval');
  const product1 = lines1.filter(productCommandLine);
  const kindEchoed = logLines().filter((line) => !line.includes('driver: ') && line.includes('no-such-kind')).length;
  check('9e(1): a request of an unknown kind is answered command.malformed, a value, with exactly one warning line of the product\'s, its kind not echoed (OQ-485)', unknownKind?.ok === false && unknownKind.code === 'command.malformed' && unknownKind.headline === 'The request could not be read: the kind is not valid' && lines1.filter((line) => evalLine.test(line)).length === 1 && product1.length === 1 && refusalLine('unknown kind', 'The request could not be read: the kind is not valid').test(product1[0] ?? '') && kindEchoed === 0, `outcome ${JSON.stringify(unknownKind)}; ${product1.length} line(s) of the product's: ${product1[0] ?? 'none'}; the kind's text in the product's lines ${kindEchoed} time(s)`);

  // (2) A prompt past the contract's bound (OQ-467: FREE_TEXT_MAX, 1,048,576 characters): refused before any handler, the
  // headline naming the field and the bound, and the value echoed neither in the outcome nor in the log.
  const OVERSIZED = 'driver-proof-oversized-9e';
  const before2 = logLines().length;
  const oversized = await d.eval(viaPage(`{ kind: 'session.start', prompt: '${OVERSIZED}' + 'x'.repeat(2_000_000) }`));
  const lines2 = await stepLines(before2, 'the driver\'s line for the oversized prompt\'s eval');
  const echoed = logLines().filter((line) => line.includes(OVERSIZED)).length + (JSON.stringify(oversized ?? null).includes(OVERSIZED) ? 1 : 0);
  const product2 = lines2.filter(productCommandLine);
  check('9e(2): a 2,000,000-character prompt is answered command.malformed naming the prompt and the bound, never echoed, with exactly one warning line of the product\'s (OQ-485)', oversized?.ok === false && oversized.code === 'command.malformed' && oversized.headline === 'The prompt is longer than 1,048,576 characters' && echoed === 0 && lines2.filter((line) => evalLine.test(line)).length === 1 && product2.length === 1 && refusalLine('past a bound, kind session.start', 'The prompt is longer than 1,048,576 characters').test(product2[0] ?? ''), `outcome ${JSON.stringify(oversized)}; the value echoed ${echoed} time(s); ${product2.length} line(s) of the product's: ${product2[0] ?? 'none'}`);

  // (3) A handler that throws: the invoke does not hang or reject, the answer is `command.failed` with the thrown message
  // through the redaction pass (its `token=` value masked), and the application log holds one `error` line naming the kind.
  const before3 = logLines().length;
  const failedLine = /command theme\.get failed: its handler threw; answered command\.failed \(ADR-0019\)/;
  const thrown = await d.commandThrowing({ kind: 'theme.get' });
  const lines3 = await until(() => logLines().slice(before3), (lines) => lines.some((line) => failedLine.test(line)), { timeoutMs: 10_000, what: 'the dispatcher\'s error line' }).catch(() => logLines().slice(before3));
  const failedLines = lines3.filter((line) => failedLine.test(line));
  const leaked = logLines().filter((line) => line.includes('sk-driver-not-a-secret')).length;
  check('9e(3): a handler that throws is answered command.failed, its message redacted, with one error line naming the kind', thrown?.ok === false && thrown.code === 'command.failed' && thrown.headline === 'The command failed' && thrown.detail === 'driver: this handler throws on purpose; token=***' && failedLines.length === 1 && /\]\s+error\s+command theme\.get failed/.test(failedLines[0] ?? '') && leaked === 0, `outcome ${JSON.stringify(thrown)}; ${failedLines.length} line(s): ${failedLines[0] ?? 'none'}; the secret in the log ${leaked} time(s)`);
  const afterwards = await d.command({ kind: 'theme.get' });
  check('9e: the product answers its own handler again after the boundary steps', afterwards?.ok === true, `theme.get ${JSON.stringify(afterwards)}`);

  // 10. The photograph.
  const shot = join(output, 'screen.png');
  const taken = await d.screenshot(shot);
  const signature = existsSync(shot) ? readFileSync(shot).subarray(0, 8).toString('hex') : '';
  check('a screenshot is written', signature === '89504e470d0a1a0a', `${shot} (${signature || 'absent'}), paint confirmed ${taken.painted}`);

  // 10b. A shot straight after a navigation shows the view the navigation opened — never the frame before it.
  const views = rail.matches.map((m) => m.text);
  const shots = [];
  for (const [i, view] of [...views, views[0]].entries()) {
    await d.click('.nav-item', { text: view });
    const path = join(output, 'shots', `${i}-${view.toLowerCase()}.png`);
    const reply = await d.screenshot(path);
    shots.push({ view, bytes: readFileSync(path), painted: reply.painted });
  }
  const stale = shots.slice(1).filter((s, i) => Buffer.compare(s.bytes, shots[i].bytes) === 0).map((s) => s.view);
  check('a shot straight after a navigation differs from the shot before it', stale.length === 0 && shots.every((s) => s.painted === true), `${shots.length - 1} navigations across ${views.join(', ')}; ${stale.length === 0 ? 'every shot new' : `identical to the previous shot after: ${stale.join(', ')}`}; paint confirmed ${shots.filter((s) => s.painted).length}/${shots.length}`);

  // 11. The secret. A request without it is refused, the connection dropped — and the window survives it.
  const endpoint = JSON.parse(readFileSync(started.endpointFile, 'utf8'));
  const intruder = await new Promise((resolve) => {
    const socket = connectSocket({ port: endpoint.port, host: '127.0.0.1' }, () => socket.write(`${JSON.stringify({ id: 1, token: 'wrong', op: 'eval', expression: '1' })}\n`));
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { text += chunk; });
    socket.on('close', () => resolve({ text, closed: true }));
    socket.on('error', () => resolve({ text, closed: true }));
    setTimeout(() => { socket.destroy(); resolve({ text, closed: false }); }, 5_000);
  });
  const stillAlive = await d.ping().then((p) => p.window === true).catch(() => false);
  check('a request without the launch secret is refused', /secret/.test(intruder.text) && intruder.closed, `reply ${JSON.stringify(intruder.text.trim())}, connection closed ${intruder.closed}`);
  check('the refusal does not take the window down', stillAlive, 'the seam still answers after dropping the intruder');

  // 12. The quit — the application's quit, which the driver sends unless asked for the immediate exit — and the
  // endpoint file with it.
  const quitting = await d.quit();
  const exited = await exitWithin(started.child, 30_000);
  const gone = !existsSync(started.endpointFile);
  check("quit is the application's quit: the app exits and removes the endpoint", quitting?.how === 'quit' && exited?.code === 0 && gone, `reply ${JSON.stringify(quitting)}; ${exited === null ? 'still running after 30 s' : `exited ${exited.code ?? exited.signal}`}; ${started.endpointFile} ${gone ? 'removed' : 'still present'}`);
} finally {
  d.close();
  try { if (started.child.exitCode === null && started.child.pid) process.kill(started.child.pid); } catch { /* already gone, which is the expected case after `quit` */ }
  await endLaunch(started.child);
  const log = existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '';
  writeFileSync(join(output, 'app.log'), log);
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

/*
 * 13. The second launch: a live run, its approval dialog and a persona window driven in their own windows, and the
 * driver's quit in the middle of it.
 *
 * The scripted orchestrator delegates one `coding-agent` child, `alpha`, and then holds its model call for two minutes
 * on the clock port (`wait:120000`), aborted by a stop, so the run is `running` for as long as the proof needs. Under
 * `permission_mode: ask` the child's `write_file` raises REQ-TOOLS-063's dialog, which is found by `windows`, probed,
 * photographed and answered with its own Approve once button through `window: 'approval'`; the child's persona window
 * (REQ-SHELL-072) is opened with the Pop out of the Overview's agent table (PD-MONITOR-009) and probed through `useWindow('persona:coding-agent')`
 * (`docs/archive/defects/the-driver-cannot-address-persona-or-approval-windows.md`). Then the quit is sent while the root
 * still waits; the store is read once the process is gone. PD-ORCH-005 clause 3: an application quit leaves the run at
 * rest — the stop reason is the quit's (`application_shutdown`), and the session is not left `running`, which is what a
 * crash leaves until repair.
 */
const runWorkspace = join(output, 'run-workspace');
mkdirSync(join(runWorkspace, '.rotaris'), { recursive: true });
writeFileSync(join(runWorkspace, 'README.md'), '# driver proof, a live run\n');
writeFileSync(join(runWorkspace, '.rotaris', 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: ask', '  max_depth: 3', '  max_active_children: 4',
  'mcp_servers:', '  code_intelligence: { enabled: false }', '',
].join('\n'));
const run = await startApp({
  root: join(output, 'run-app'), workspace: runWorkspace, timeoutMs: 90_000,
  extra: { ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,wait:120000,answer', ROTARIS_CHILD_SCRIPT: 'write,answer' },
});
const r = run.driver;
try {
  await r.waitFor('.nav-item', { timeoutMs: 30_000 });
  // The shot the stale-frame note measured: the launch's FIRST navigation to the Workspace, its heaviest first paint,
  // shot straight after the click. Before the repair it returned the Overview's bytes in a fifth of launches or more.
  const overviewShot = join(output, 'shots', 'run-0-overview.png');
  const workspaceShot = join(output, 'shots', 'run-1-workspace.png');
  // PD-SHELL-016 (2026-11-14): the window opens on the Workspace, so the Overview shot is taken after a click to the Overview.
  await r.click('.nav-item', { text: 'Overview' });
  await r.waitFor('.app-shell[data-view="overview"]', { timeoutMs: 10_000 });
  await r.screenshot(overviewShot);
  await r.click('.nav-item', { text: 'Workspace' });
  const firstPaint = await r.screenshot(workspaceShot);
  const same = Buffer.compare(readFileSync(overviewShot), readFileSync(workspaceShot)) === 0;
  check("a shot straight after the launch's first navigation to the Workspace shows the Workspace", !same && firstPaint.painted === true, `${same ? 'identical to the Overview shot' : 'differs from the Overview shot'}; paint confirmed ${firstPaint.painted}`);
  await r.waitFor('.composer__input', { timeoutMs: 10_000 });
  await r.chord('Ctrl+L');
  await until(() => r.eval(COMPOSER_FOCUSED), (v) => v === true, { timeoutMs: 10_000, what: 'the composer holding focus' });
  await r.type('hold the run while the driver quits', { enter: true });
  const live = await r.waitFor('[data-testid="run-header"][data-state="running"]', { timeoutMs: 30_000 }).then(() => true).catch(() => false);
  check('a run is live before the quit', live, 'the run header reports data-state="running"');

  // 13a. Every approval the run raises is answered in its own dialog, by its own button, until the child's write lands.
  const notes = join(runWorkspace, 'NOTES.md');
  const answered = [];
  let dialogListed = null;
  let approvalPrefs = null;
  await until(async () => {
    if (existsSync(notes)) return true;
    const open = await r.windows();
    const dialog = open.auxiliary.find((a) => a.selector === 'approval');
    if (dialog === undefined) return false;
    dialogListed ??= dialog;
    await r.waitFor('button', { text: 'Approve once', window: 'approval', timeoutMs: 10_000 });
    const [headline] = await r.send('probe', { selector: '#approval-title', window: 'approval' });
    if (answered.length === 0) await r.send('screenshot', { path: join(output, 'shots', 'run-2-approval.png'), window: 'approval' });
    // R-091: the approval dialog is one of main's own dialog sites (`index.ts`), built apart from the main window's adapter.
    if (answered.length === 0) approvalPrefs = await r.webPreferences({ window: 'approval' }).catch((cause) => ({ error: cause.message }));
    await r.send('click', { selector: 'button', text: 'Approve once', window: 'approval' });
    answered.push(headline?.text ?? '(no headline)');
    // The next dialog, if any, is presented once this one has closed; wait for the close before looking again.
    await until(() => r.windows(), (w) => !w.auxiliary.some((a) => a.selector === 'approval' && a.wcId === dialog.wcId), { timeoutMs: 10_000, what: 'the answered dialog closing' });
    return existsSync(notes);
  }, (done) => done === true, { timeoutMs: 60_000, what: "the child's write, approved in its dialog" }).catch((cause) => { answered.push(`gave up: ${cause.message}`); });
  const approvalLoose = approvalPrefs === null ? ['never read'] : looseKeys(approvalPrefs);
  check('the approval dialog is built with the secure web preferences (R-091)', approvalLoose.length === 0, approvalLoose.length === 0 ? 'every key as asked' : `differs: ${approvalLoose.join(', ')}${approvalPrefs?.error ? ` (${approvalPrefs.error})` : ''}`);
  check('the approval dialog is listed, probed and answered in its own window (REQ-TOOLS-063)', dialogListed !== null && dialogListed.role === 'approval' && answered.some((h) => /write_file/.test(h)) && existsSync(notes), `listed ${JSON.stringify(dialogListed)}; answered ${JSON.stringify(answered)}; NOTES.md ${existsSync(notes) ? 'written' : 'absent'}`);

  // 13b. The child's persona window, opened by the agent table's own Pop out, addressed and probed as a window.
  // PD-MONITOR-009 / PD-SHELL-015: the table stands on the Overview, Ctrl+2 (Ctrl+1 until PD-SHELL-016; it was the Mission view's, Ctrl+3).
  await r.chord('Ctrl+2');
  // The table lists the delegated agents; `alpha`, of the coding-agent persona, is the one.
  const popped = await popOutPersona(r, 'coding-agent').catch((cause) => ({ error: cause instanceof Error ? cause.message : String(cause) }));
  const personaListed = popped.window ?? null;
  let personaState = null;
  let personaName = null;
  if (personaListed) {
    await r.useWindow('persona:coding-agent');
    await r.waitFor('[data-testid="persona-agent-state"]', { timeoutMs: 15_000 });
    [personaState] = await r.probe('[data-testid="persona-agent-state"]');
    [personaName] = await r.probe('[data-testid="persona-agent-name"]');
    await r.screenshot(join(output, 'shots', 'run-3-persona.png'));
    await r.useWindow();
  }
  check('a persona window is listed and its document probed through useWindow (PD-ORCH-005 clause 13\'s surface)', personaListed?.role === 'persona' && personaName?.text === 'alpha' && typeof personaState?.text === 'string' && personaState.text !== '', `listed ${JSON.stringify(personaListed)}; name ${JSON.stringify(personaName?.text)}, state ${JSON.stringify(personaState?.text)}${popped.error ? `; ${popped.error}` : `; ${popped.pressed.missed.length} missed press(es)`}`);
  const refused = await r.useWindow('persona:nobody').then(() => null).catch((cause) => cause.message);
  const stillMain = await r.eval("document.querySelector('.app-shell') !== null");
  check('a role selector naming no open window is refused, and the selection stays', /^no window matches "persona:nobody"; open: /.test(refused ?? '') && stillMain === true, refused ?? 'it was accepted');
  const quitting = await r.quit();
  const exited = await exitWithin(run.child, 60_000);
  check('the quit during a live run exits', quitting?.how === 'quit' && exited?.code === 0, `reply ${JSON.stringify(quitting)}; ${exited === null ? 'still running after 60 s' : `exited ${exited.code ?? exited.signal}`}`);
  const db = new Database(oneDatabase(run.local), { readonly: true });
  const sessions = db.prepare('SELECT execution_status, stop_reason FROM sessions').all();
  db.close();
  const session = sessions[0];
  check('the quit leaves the live run at rest, not running (PD-ORCH-005 clause 3)', sessions.length === 1 && session.execution_status !== 'running' && session.stop_reason === 'application_shutdown', JSON.stringify(sessions));
  const log = existsSync(run.logFile) ? readFileSync(run.logFile, 'utf8') : '';
  check("the quit went through the application's shutdown", /quit: closing 1 main window\(s\) through their close guards first/.test(log) && !/did not complete its shutdown/.test(log), log.split('\n').filter((l) => /\bquit:/.test(l)).map((l) => l.replace(/^.*?(quit:)/, '$1')).join(' / '));
} finally {
  r.close();
  try { if (run.child.exitCode === null && run.child.pid) process.kill(run.child.pid); } catch { /* already gone after the quit */ }
  await endLaunch(run.child);
  writeFileSync(join(output, 'run-app.log'), existsSync(run.logFile) ? readFileSync(run.logFile, 'utf8') : '');
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

/*
 * 13c — a persona or terminal window's commands answer for the main window that OWNS it (REQ-MONITOR-069, REQ-STARTUP-163,
 * ADR-0048 B; `docs/archive/defects/a-persona-windows-commands-answer-for-the-active-main-window-not-its-owner.md`). Two main
 * windows on two workspaces: the first runs a delegated child and pops out its persona window, then the second is added
 * and becomes the active window. The persona window's `config.read` (its model, declared tools and threshold come from it)
 * and the terminal window's `session.list`, each sent through the driver from the auxiliary window itself, must answer
 * with the OWNER's workspace; before the repair `runCommand` fell back to the active window, the second one.
 */
const familyA = join(output, 'family-a');
const familyB = join(output, 'family-b');
for (const root of [familyA, familyB]) {
  mkdirSync(join(root, '.rotaris'), { recursive: true });
  writeFileSync(join(root, 'README.md'), `# driver proof, ${root.endsWith('family-a') ? 'the owner' : 'the active window'}\n`);
  writeFileSync(join(root, '.rotaris', 'agents.yaml'), [
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    'runtime:', '  permission_mode: autonomous', '  max_depth: 3', '  max_active_children: 4',
    'mcp_servers:', '  code_intelligence: { enabled: false }', '',
  ].join('\n'));
}
const family = await startApp({
  root: join(output, 'family-app'), workspace: familyA, timeoutMs: 90_000,
  extra: { ROTARIS_SCRIPT: 'delegate:coding-agent:alpha,wait:120000,answer', ROTARIS_CHILD_SCRIPT: 'answer', ROTARIS_CAPTURE_PROJECT_FOLDER: familyB },
});
const f = family.driver;
try {
  await f.waitFor('.nav-item', { timeoutMs: 30_000 });
  await f.click('.nav-item', { text: 'Workspace' });
  await f.waitFor('.composer__input', { timeoutMs: 10_000 });
  await f.chord('Ctrl+L');
  await until(() => f.eval(COMPOSER_FOCUSED), (v) => v === true, { timeoutMs: 10_000, what: 'the composer holding focus' });
  await f.type('delegate one child and hold the run', { enter: true });
  await f.waitFor('[data-testid="run-header"][data-state="running"]', { timeoutMs: 30_000 });
  // PD-MONITOR-009 / PD-SHELL-015: the agent table stands on the Overview, Ctrl+2 (Ctrl+1 until PD-SHELL-016; it was the Mission view's, Ctrl+3).
  await f.chord('Ctrl+2');
  const popped = await popOutPersona(f, 'coding-agent');
  check("13c: the child's Pop out, pressed on its settled row, landed and opened its persona window (REQ-SHELL-072)",
    popped.pressed.landed === true && popped.window?.role === 'persona',
    `row ${popped.rowId}; landed ${JSON.stringify(popped.pressed.landed)} after waiting ${popped.pressed.waitedMs} ms; ${popped.pressed.missed.length} missed press(es)${popped.pressed.missed.length === 0 ? '' : `: ${popped.pressed.missed.join(' / ')}`}`);
  await f.command({ kind: 'window.openTerminal' });
  await until(() => f.windows(), (w) => w.auxiliary.some((a) => a.selector === 'terminal'), { timeoutMs: 15_000, what: 'the terminal window listed' });
  // The second main window, on the other workspace, added last and so the active one.
  await f.command({ kind: 'workspace.choose', newWindow: true });
  const both = await until(() => f.windows(), (w) => w.windows.length === 2, { timeoutMs: 30_000, what: 'two main windows' });
  const activeIsOther = String(both.windows[0]?.workspace ?? '').endsWith('family-b');
  const owned = both.auxiliary.filter((a) => a.selector === 'persona:coding-agent' || a.selector === 'terminal');
  const ownerIndex = both.windows.findIndex((w) => String(w.workspace).endsWith('family-a'));
  check('13c precondition: the persona and terminal windows belong to the first main window while the second is the active one',
    activeIsOther && owned.length === 2 && owned.every((a) => a.owner === ownerIndex),
    `main windows ${JSON.stringify(both.windows.map((w) => w.workspace))}; auxiliary ${JSON.stringify(both.auxiliary.map((a) => ({ selector: a.selector, owner: a.owner })))}`);
  const childLoose = [];
  for (const window of ['persona:coding-agent', 'terminal']) {
    const read = await f.webPreferences({ window }).catch((cause) => ({ error: cause.message }));
    for (const key of read.error ? [read.error] : looseKeys(read)) childLoose.push(`${window}: ${key}`);
  }
  check('the persona and terminal windows are built with the secure web preferences (R-091)', childLoose.length === 0, childLoose.length === 0 ? 'every key as asked in both' : `differs: ${childLoose.join(', ')}`);
  await f.useWindow('persona:coding-agent');
  const personaConfig = await f.command({ kind: 'config.read' });
  await f.useWindow('terminal');
  const terminalList = await f.command({ kind: 'session.list' });
  await f.useWindow('family-b');
  const otherList = await f.command({ kind: 'session.list' });
  await f.useWindow();
  const personaRoot = personaConfig?.ok ? String(personaConfig.value.workspaceRoot) : null;
  check("REQ-MONITOR-069 / REQ-STARTUP-163: the persona window's configuration read answers for its owner's workspace, not the active window's",
    personaRoot !== null && personaRoot.endsWith('family-a'),
    personaConfig?.ok ? `workspaceRoot ${personaRoot}` : `refused ${JSON.stringify(personaConfig)}`);
  const terminalSessions = terminalList?.ok ? terminalList.value.sessions.length : null;
  const otherSessions = otherList?.ok ? otherList.value.sessions.length : null;
  check("REQ-STARTUP-163: the terminal window's session list is its owner's workspace's (one session), not the active window's (none)",
    terminalSessions === 1 && otherSessions === 0,
    `terminal window lists ${terminalSessions ?? JSON.stringify(terminalList)} session(s); the second main window lists ${otherSessions ?? JSON.stringify(otherList)}`);
  await f.quit();
  await exitWithin(family.child, 60_000);
} catch (cause) {
  check('13c: the two-window family scenario ran to the end', false, `it threw instead: ${cause instanceof Error ? cause.message : String(cause)}`);
} finally {
  f.close();
  try { if (family.child.exitCode === null && family.child.pid) process.kill(family.child.pid); } catch { /* already gone after the quit */ }
  await endLaunch(family.child);
  writeFileSync(join(output, 'family-app.log'), existsSync(family.logFile) ? readFileSync(family.logFile, 'utf8') : '');
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

/*
 * 13d — PD-TOOLS-013 (OQ-226; live-run P2 at a68f121): a foreground terminal call the application's quit cuts is recorded as
 * interrupted, not as a hard timeout. The scripted coordinator, granted the direct-work bundle, runs `sleep 60` with a
 * 100 s bound; once its record is open (`running`) and the command has marked that it runs, the quit is sent, and the
 * store is read after the exit. Before the
 * repair the call read `timeout`, exit 124, "exceeded its timeout of 100 seconds", and filed `terminal_timeout` at `error`.
 */
const cutWorkspace = join(output, 'cut-workspace');
mkdirSync(join(cutWorkspace, '.rotaris'), { recursive: true });
writeFileSync(join(cutWorkspace, 'README.md'), '# driver proof, a terminal call the quit cuts\n');
writeFileSync(join(cutWorkspace, '.rotaris', 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous', '  allow_unsandboxed_autonomous: true',
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n'));
const cut = await startApp({
  root: join(output, 'cut-app'), workspace: cutWorkspace, timeoutMs: 90_000,
  extra: {
    ROTARIS_SCRIPT: 'terminal:wedge,answer', ROTARIS_INTENT_SCRIPT: 'explicit_trivial',
    // The command marks that it runs before it sleeps, so the quit is sent once the command is under way and the cut is
    // the mid-command one; a quit inside the first call's handshake is the other variant ("before the command was
    // written"), which `terminal.test.ts` pins. Under load the open record alone came too early (292 ms in, 2026-10-07).
    ROTARIS_SCRIPT_TERMINAL_ARGS: JSON.stringify({ wedge: { command: process.platform === 'win32' ? `Set-Content -Path '${join(cutWorkspace, 'running.txt')}' -Value ran; Start-Sleep -Seconds 60` : `printf ran > '${join(cutWorkspace, 'running.txt')}'; sleep 60`, timeout: 100 } }),
  },
});
const c = cut.driver;
const cutCalls = () => {
  // Read while the app writes it: before the run's first save there is no database, which `oneDatabase` throws on.
  const db = new Database(oneDatabase(cut.local), { readonly: true, fileMustExist: true });
  try { return db.prepare("SELECT status, elapsed_ms, entry FROM tool_calls WHERE tool_name = 'terminal' ORDER BY ordinal").all(); } finally { db.close(); }
};
try {
  await c.waitFor('.nav-item', { timeoutMs: 30_000 });
  await c.click('.nav-item', { text: 'Workspace' });
  await c.waitFor('.composer__input', { timeoutMs: 10_000 });
  await c.chord('Ctrl+L');
  await until(() => c.eval(COMPOSER_FOCUSED), (v) => v === true, { timeoutMs: 10_000, what: 'the composer holding focus' });
  await c.type('run the long command', { enter: true });
  await until(() => { try { return cutCalls(); } catch { return []; } }, (rows) => rows.some((r) => r.status === 'running'), { timeoutMs: 60_000, what: "the terminal call's open record" });
  await until(() => existsSync(join(cutWorkspace, 'running.txt')), (ran) => ran === true, { timeoutMs: 30_000, what: 'the terminal command running' });
  const quitting = await c.quit();
  const exited = await exitWithin(cut.child, 60_000);
  check('13d: the quit during a running terminal call exits', quitting?.how === 'quit' && exited?.code === 0, `reply ${JSON.stringify(quitting)}; ${exited === null ? 'still running after 60 s' : `exited ${exited.code ?? exited.signal}`}`);
  const db = new Database(oneDatabase(cut.local), { readonly: true });
  const rows = db.prepare("SELECT status, elapsed_ms, entry FROM tool_calls WHERE tool_name = 'terminal' ORDER BY ordinal").all();
  const issues = db.prepare('SELECT kind, severity FROM issues').all();
  db.close();
  const entry = rows.length === 1 ? JSON.parse(rows[0].entry) : {};
  const result = String(entry.result ?? '');
  check('PD-TOOLS-013: the terminal call the quit cut is recorded interrupted, with no exit code and no timeout',
    rows.length === 1 && rows[0].status === 'failed' && entry.failure_kind === 'interrupted' && entry.outcome_kind === 'interrupted' && (entry.exit_code ?? null) === null
      && /"outcome_severity":"warning"/.test(result) && /"timeout":false/.test(result) && /"kill_status":"session_reset"/.test(result),
    `${rows.length} terminal record(s); status ${rows[0]?.status}, ${Math.round(rows[0]?.elapsed_ms ?? 0)} ms; failure_kind ${entry.failure_kind}, outcome_kind ${entry.outcome_kind}, exit_code ${entry.exit_code ?? 'none'}; ${(/\[terminal_diagnostic\] (.*)$/m.exec(result)?.[1] ?? '(no diagnostic)').replace(/"detail":"[^"]*",?/, '').slice(0, 300)}`);
  check('PD-TOOLS-013: its result says the run cancelled the call and names no timeout',
    /cancelled by the run before the command completed/.test(result) && !/exceeded its timeout/.test(result),
    result.split('\n')[0]?.slice(0, 240) ?? '(no result)');
  check('PD-TOOLS-013: the cut call files no terminal_timeout and no tool_error issue',
    !issues.some((i) => i.kind === 'terminal_timeout' || i.kind === 'tool_error'),
    `issues ${JSON.stringify(issues)}`);
} catch (cause) {
  check('13d: the terminal-cut scenario ran to the end', false, `it threw instead: ${cause instanceof Error ? cause.message : String(cause)}`);
} finally {
  c.close();
  try { if (cut.child.exitCode === null && cut.child.pid) process.kill(cut.child.pid); } catch { /* already gone after the quit */ }
  writeFileSync(join(output, 'cut-app.log'), existsSync(cut.logFile) ? readFileSync(cut.logFile, 'utf8') : '');
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

console.log(`\n${results.filter((r) => r.verdict === 'PASS').length} passed, ${failures} failed, ${results.filter((r) => r.verdict === 'NOTE').length} noted — evidence in ${output}`);
process.exit(failures === 0 ? 0 : 1);
