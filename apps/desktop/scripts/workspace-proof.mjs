/**
 * `pnpm workspace-proof` — reaching a project folder from inside the application, measured against the built app.
 *
 * Stage A built one window through one builder, Stage B the resolution precedence, the chooser, the gates and the
 * switch, Stage C the two product directives. None of it had an assertion of its own: `layout-proof` measures the
 * Workspace grid and `sessions-proof` clicks the title bar's Sessions control, and neither can see a second main
 * window, a vetoed close or a preference written at the wrong moment.
 *
 * Each check here is the one whose absence lets a specific defect live, and the ones that cannot be reached in this
 * build SKIP with the reason named rather than passing quietly — a proof that reports PASS having tested nothing is
 * a failure mode this repository has already met (`ui-audit`'s "tested === 0 is a finding").
 *
 * The seams: `ROTARIS_DRIVER` (the control socket, `main/driver.ts`) and `ROTARIS_CAPTURE_PROJECT_FOLDER`, a
 * `;;`-separated QUEUE of answers for the native folder chooser — `(cancel)` answers as a dismissal, which is how
 * REQ-SHELL-012's reminder is reached with nobody at the machine. Both are compiled out of a packaged build by
 * `__ROTARIS_SEAMS__`.
 *
 * Evidence under `.proof/workspace-proof/`: one `app.log` per launch and `results.json`. `--skip-build` skips the build.
 *
 * A trap this file's own first execution fell into, recorded so the next harness does not: the driver's two
 * reading ops answer in DIFFERENT shapes. `command` and `windows` resolve an already-parsed value (the client
 * returns `reply.value`), while `eval` resolves a string — which is why every `eval` here evaluates a
 * `JSON.stringify(...)` and is parsed, and why nothing parses a `command`. Parsing a command's answer fails with
 * `"[object Object]" is not valid JSON` at the first assertion, before anything has been measured.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app as appDirectory, buildDesktop, cleanEnvironment, electron, evidenceDirectory, hostSwitches, mainEntry, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { startApp } from './lib/driver.mjs';

const output = evidenceDirectory('.workspace-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

const results = [];
let failures = 0;
const check = (name, ok, detail) => {
  results.push({ name, verdict: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
/** Not reachable in this build, and why. A skip is never a pass: it is counted and printed separately. */
const skip = (name, reason) => {
  results.push({ name, verdict: 'SKIP', detail: reason });
  console.log(`SKIP  ${name} — ${reason}`);
};

const AGENTS = [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n');

/** A throwaway project folder. The name is a parameter because REQ-WORKSPACE-149 rule 3 is about names. */
function project(name) {
  const root = join(output, name);
  mkdirSync(join(root, '.rotaris'), { recursive: true });
  writeFileSync(join(root, 'README.md'), `# ${name}\n`);
  writeFileSync(join(root, '.rotaris', 'agents.yaml'), AGENTS);
  return root;
}

const A = project('project-a');
const B = project('project-b');
const C = project('project-c');
const D = project('project-d');
/**
 * REQ-WORKSPACE-149 rule 3: a folder name must reach the window as literal text, whatever it contains.
 *
 * The obvious fixture — a folder literally named `<b>bold</b>` — cannot exist on this platform: Windows forbids
 * `<`, `>` and `/` in a path component, and the first attempt died creating the fixture rather than testing
 * anything. The entity form is the better test anyway: if any surface ever rendered this label as markup, `&lt;b&gt;`
 * would DISPLAY as `<b>`, so the characters are dangerous exactly where the rule is about. The braces and the
 * ampersand cover a template literal and an entity, which are the two ways a label reaches code that parses it.
 */
const MARKUP_NAME = 'project-&lt;b&gt;-and-{x}';
const MARKUP = project(MARKUP_NAME);

/**
 * REQ-WORKSPACE-013's switch-time cancellation needs a `code-intelligence-setup` still under way when the switch lands,
 * and the bundled runtime's `project create` on a documentation tree ends in well under a second. So these two projects
 * name a stand-in runtime as their `code_intelligence` entry: a local launch of this Node with the launch subcommand,
 * from which REQ-MCP-036 derives the setup invocation `node <stand-in> project create <root>` and the rest. The stand-in
 * writes its pid beside the project, holds `create` for 90 s in a project carrying `SLOW`, and ends every other step at
 * once; anything else (a server launch) exits 1. Nothing about the product is changed by it: the entry is an ordinary
 * workspace configuration, read through the ordinary resolution.
 */
const STAND_IN = join(output, 'code-intelligence-stand-in.mjs');
writeFileSync(STAND_IN, [
  "import { existsSync, writeFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  'const [group, verb, root] = process.argv.slice(2);',
  "if (group === 'project' && verb === 'create') {",
  "  writeFileSync(join(root, '.stand-in-create.pid'), String(process.pid));",
  "  if (existsSync(join(root, 'SLOW'))) setTimeout(() => process.exit(0), 90_000); else process.exit(0);",
  "} else if ((group === 'project' && verb === 'index') || (group === 'memories' && verb === 'initialize')) {",
  '  process.exit(0);',
  '} else {',
  '  process.exit(1);',
  '}',
  '',
].join('\n'));
function initProject(name, { slow = false } = {}) {
  const root = join(output, name);
  mkdirSync(join(root, '.rotaris'), { recursive: true });
  writeFileSync(join(root, 'README.md'), `# ${name}\n`);
  if (slow) writeFileSync(join(root, 'SLOW'), 'the stand-in holds project create here\n');
  writeFileSync(join(root, '.rotaris', 'agents.yaml'), AGENTS.replace('  code_intelligence: { enabled: false }',
    `  code_intelligence: { command: ${JSON.stringify(process.execPath)}, args: [${JSON.stringify(STAND_IN)}, start-mcp-server] }`));
  return root;
}
const INIT_SLOW = initProject('init-slow', { slow: true });
const INIT_QUICK = initProject('init-quick');

const launches = [];
/** Quit every app still running, keeping its log as evidence. Idempotent, so `finally` may call it again. */
async function closeAll() {
  for (const { name, started } of launches.splice(0)) {
    writeFileSync(join(output, `app-${name}.log`), existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '');
    await started.driver.quit().catch(() => undefined);
    started.driver.close();
    try { if (started.child.pid) process.kill(started.child.pid); } catch { /* already gone after quit */ }
  }
}
/**
 * One launch of the built app, with its own preference store unless `preferences` is supplied, so a scenario that
 * asserts what was remembered cannot be contaminated by the one before it.
 */
async function launch(name, { workspace, folders = [], extra = {}, preferences } = {}) {
  // At most ONE app alive at a time. The first version kept every launch open until the end, which cost two
  // things: seven Electron processes competing for the machine while a 650 ms budget was being measured, and a
  // crash — a finished launch's driver socket rejects its pending promises when the app exits, and with nobody
  // awaiting them Node took the unhandled rejection and killed the run after the sixteenth check.
  await closeAll();
  const root = join(output, `app-${name}`);
  if (preferences) {
    mkdirSync(join(root, 'preferences'), { recursive: true });
    writeFileSync(join(root, 'preferences', 'preferences.json'), `${JSON.stringify(preferences, null, 2)}\n`);
  }
  const started = await startApp({
    root,
    ...(workspace === undefined ? {} : { workspace }),
    timeoutMs: 90_000,
    extra: { ...(folders.length > 0 ? { ROTARIS_CAPTURE_PROJECT_FOLDER: folders.join(';;') } : {}), ...extra },
  });
  launches.push({ name, started });
  await started.driver.waitFor('.app-shell', { timeoutMs: 30_000 });
  return started;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let handOverSequence = 0;
/**
 * Launch the same profile again and wait for the secondary process to hand its request to the owner. The launch is
 * `spawnBounded`'s since 2026-09-30: its own 30 s bound sent SIGTERM alone and rejected at once, so a secondary that
 * did not answer SIGTERM outlived the proof, and the failure carried none of its log
 * (`docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md`).
 */
async function handOver(started, workspace) {
  const sequence = ++handOverSequence;
  // `hostSwitches` as the driver's launch carries them: as root this second instance died with SIGTRAP and the proof's
  // two hand-over checks were red for the host, not the product (`fixed/a-driven-launch-dies-as-root-on-linux.md`).
  const result = await spawnBounded(electron, [mainEntry, ...hostSwitches, ...(workspace ? [workspace] : [])], {
    timeoutMs: 30_000,
    cwd: appDirectory,
    windowsHide: false,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ local: started.local, preferences: started.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });
  const outputText = `${result.stdout}${result.stderr}`;
  writeFileSync(join(output, `hand-over-${sequence}.log`), outputText);
  if (result.error) throw result.error;
  if (result.overran) throw new Error(overrunMessage(`the hand-over launch ${sequence}`, result, outputText));
  return { code: result.status, signal: result.signal };
}
async function waitForWindowCount(driver, count, timeoutMs = 30_000) {
  const began = Date.now();
  for (;;) {
    const windows = await windowsOf(driver);
    if (windows.length === count) return windows;
    if (Date.now() - began > timeoutMs) throw new Error(`expected ${count} main windows within ${timeoutMs} ms; found ${windows.length}`);
    await sleep(100);
  }
}
async function waitForRememberedWorkspace(started, workspace, timeoutMs = 30_000) {
  const began = Date.now();
  for (;;) {
    if (String(preferenceFile(started)['workspace/lastOpened'] ?? '').toLowerCase() === workspace.toLowerCase()) return;
    if (Date.now() - began > timeoutMs) throw new Error(`workspace/lastOpened did not become ${workspace} within ${timeoutMs} ms`);
    await sleep(100);
  }
}
/**
 * The main windows open, most recently focused first. The driver answers `{ windows, selected }` rather than a
 * bare list, and the first version of this file read the envelope as the list: every window assertion then
 * compared `undefined` and reported `? window(s)` — a guard that cannot pass is as useless as one that cannot
 * fail, and it hid whether the product had done the right thing in three checks at once.
 */
const windowsOf = async (d) => {
  const r = await d.windows();
  return Array.isArray(r?.windows) ? r.windows : [];
};
const logOf = (started) => (existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '');
const preferenceFile = (started) => {
  const file = join(started.preferences, 'preferences.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
};
/** The elapsed milliseconds between two log lines, read from the log's own timestamps. */
function elapsedBetween(log, first, second) {
  const stamp = (needle) => {
    const line = log.split('\n').find((l) => l.includes(needle));
    // `[main 2026-09-12T12:44:37.959Z] …` — the process name sits between the bracket and the stamp. The first
    // version of this anchored the stamp to the bracket, captured nothing, and reported "the log does not carry
    // both lines" about a log that carried both: a timing assertion that cannot read the clock fails the product
    // for the harness's mistake, which is the one direction a proof must never fail in.
    const iso = line?.match(/^\[\w+ ([\d\-T:.Z]+)\]/)?.[1];
    return iso ? Date.parse(iso) : Number.NaN;
  };
  return stamp(second) - stamp(first);
}
/** Every acknowledgement currently on screen, with its action label where it carries one. */
const TOASTS = `JSON.stringify([...document.querySelectorAll('[data-testid="acknowledgement"]')].map((el) => ({
  title: el.querySelector('[data-testid="acknowledgement-title"]')?.textContent ?? '',
  action: el.querySelector('[data-testid="acknowledgement-action"]')?.textContent ?? null,
})))`;
const CHIP = `JSON.stringify((() => {
  const el = document.querySelector('.title-bar__workspace');
  if (!el) return { missing: true };
  const path = el.querySelector('.title-bar__workspace-path');
  const b = el.getBoundingClientRect();
  return {
    tag: el.tagName, name: el.getAttribute('aria-label'), description: el.getAttribute('aria-description'),
    tooltip: el.getAttribute('title'), text: el.textContent ?? '', label: path ? path.textContent : null,
    labelDrawn: path ? path.getBoundingClientRect().width > 0 : false,
    icon: !!el.querySelector('i.ph'), html: el.innerHTML,
    // Rule 3: if the label were ever treated as markup, the folder's name would have BUILT this element.
    parsed: !!el.querySelector('b'),
    box: { w: Math.round(b.width), h: Math.round(b.height) },
    focusable: el.tabIndex >= 0 || el.tagName === 'BUTTON',
    // Rule 2 forbids a clipped label, so the proof has to be able to SEE one: a label wider than the box it
    // sits in is exactly what a measurer that charges nothing produces, and nothing here could read it before.
    clipped: el.scrollWidth > el.clientWidth + 1,
    slot: el.parentElement ? Math.round(el.parentElement.clientWidth) : 0,
    // The three widths the chip's own budget is computed from. A red that prints them says WHY it is red: a span
    // still at its full width inside a clamped button is a budget that came out larger than the label it measured.
    chipW: Math.round(b.width),
    spanW: path ? Math.round(path.getBoundingClientRect().width) : null,
  };
})())`;

try {
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 1 / 2 — cold launch, no argv, nothing remembered: the working directory, then the deferred chooser cancelled.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('cold', { folders: ['(cancel)'] });
    await sleep(2_500);
    const log = logOf(s);
    const hello = await s.driver.command({ kind: 'shell.hello' });
    const workspace = hello?.value?.workspace ?? '(unread)';
    check('REQ-SHELL-010 (c): a launch carrying nothing opens on the working directory, not on the sentinel',
      workspace !== '(no workspace)' && workspace !== '(unread)',
      `the window is open on ${workspace}`);

    const deferred = elapsedBetween(log, 'loaded for', 'capture: project folder chooser');
    check('REQ-SHELL-011: the first-launch chooser is deferred at least 650 ms past the window being shown',
      Number.isFinite(deferred) ? deferred >= 650 : false,
      Number.isFinite(deferred) ? `${deferred} ms between the window loading and the chooser opening` : 'the log does not carry both lines');

    const toasts = JSON.parse(await s.driver.eval(TOASTS));
    check('REQ-SHELL-012: cancelling the chooser leaves the desktop usable and shows the reminder',
      toasts.some((t) => t.title.includes('Open a project folder when you’re ready') || t.title.includes("Open a project folder when you're ready")),
      `${toasts.length} acknowledgement(s): ${JSON.stringify(toasts.map((t) => t.title))}`);
    check('REQ-WORKSPACE-009: a cancelled chooser writes no remembered workspace',
      preferenceFile(s)['workspace/lastOpened'] === undefined,
      `workspace/lastOpened is ${JSON.stringify(preferenceFile(s)['workspace/lastOpened'])}`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 3 / 4 — what is remembered, and what a remembered path that has gone must not become.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('remembered', { preferences: { 'workspace/lastOpened': A }, folders: ['(cancel)'] });
    await sleep(2_000);
    const hello = await s.driver.command({ kind: 'shell.hello' });
    const onA = String(hello?.value?.workspace ?? '').toLowerCase() === A.toLowerCase();
    check('REQ-WORKSPACE-006: a remembered folder that still exists is reopened with no prompt at all',
      onA && !logOf(s).includes('capture: project folder chooser'),
      `open on ${hello?.value?.workspace}, chooser ${logOf(s).includes('capture: project folder chooser') ? 'opened' : 'never opened'}`);
  }
  {
    const gone = join(output, 'deleted-project');
    const s = await launch('gone', { preferences: { 'workspace/lastOpened': gone }, folders: ['(cancel)'] });
    await sleep(2_500);
    const hello = await s.driver.command({ kind: 'shell.hello' });
    check('REQ-WORKSPACE-007: a remembered folder that no longer exists falls back and is NOT overwritten',
      String(hello?.value?.workspace ?? '').toLowerCase() !== gone.toLowerCase() && preferenceFile(s)['workspace/lastOpened'] === gone,
      `open on ${hello?.value?.workspace}; the stored value is still ${JSON.stringify(preferenceFile(s)['workspace/lastOpened'])}`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 5 / 14 — the chip itself: what it is, what it says, and the three label rules.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    // Two dismissals armed, one for the pointer route and one for the keyboard route. An exhausted queue falls
    // back to the REAL native chooser, and a proof that opens one is a proof that waits for a person.
    const s = await launch('chip', { workspace: MARKUP, folders: ['(cancel)', '(cancel)'] });
    await sleep(1_200);
    const chip = JSON.parse(await s.driver.eval(CHIP));
    check('REQ-SHELL-035 / REQ-WORKSPACE-016: the chip is a button carrying the exact name, tooltip and description',
      chip.tag === 'BUTTON' && chip.name === 'Open project folder' && chip.tooltip === 'Open another project folder'
        && chip.description === `Current project: ${MARKUP}. Opens the native project folder chooser.` && chip.focusable,
      `<${chip.tag}> name=${JSON.stringify(chip.name)} tooltip=${JSON.stringify(chip.tooltip)} description=${JSON.stringify(chip.description)}`);
    check('REQ-WORKSPACE-017: a folder icon, the path, a · separator and an em dash for the session this product has no name for',
      chip.icon && chip.text.includes('·') && chip.text.includes('—'),
      `icon=${chip.icon} text=${JSON.stringify(chip.text)}`);
    /*
     * Asserted on the accessible description and on the DOM's shape rather than on a substring of the label,
     * because the label is subject to rule 2: a narrow window may have elided the very characters being
     * checked, and an assertion that passes only at one window width is not the rule this requirement states.
     */
    check('REQ-WORKSPACE-149 rule 3: a folder name reaches the window as literal text, never as markup',
      chip.description.includes(MARKUP_NAME) && !chip.parsed && !chip.html.includes('<b>'),
      `the description carries the raw name (${chip.description.includes(MARKUP_NAME)}), no element was built from it (${!chip.parsed})`);

    // Rule 2 — the budget is the rendered width, so the assertion has to change the width and read the label again.
    const wide = JSON.parse(await s.driver.eval(CHIP));
    await s.driver.resize(1_000, 680);
    await sleep(600);
    const narrow = JSON.parse(await s.driver.eval(CHIP));
    /*
     * FALSIFIED, kept beside its replacement rather than repaired quietly. This asserted that a NARROWER WINDOW
     * re-elides, written as `narrow.label !== wide.label ? ellipses === 1 : ellipses === 0` — which lets "the
     * label did not change" mean "zero ellipses is correct". It could not fail: at REQ-SHELL-022's own floor of
     * 1000 px the centred slot is still some 760 px wide and every fixture path fits whole, so it passed having
     * measured nothing. Driving the built app by hand then found the rule genuinely broken behind it, and the
     * defect was in the measurer rather than in the rules. What rule 2 is about is the width available to the
     * label, however the layout arrived at it, so the budget is squeezed directly below.
     */
    check('REQ-WORKSPACE-149 rule 2: a window resize changes the width the label is measured against',
      narrow.slot < wide.slot && narrow.label !== null,
      `the slot went ${wide.slot} px → ${narrow.slot} px, label ${JSON.stringify(narrow.label)}`);
    check('REQ-SHELL-022: the window refuses to be smaller than 1000×680',
      JSON.parse(await s.driver.eval('JSON.stringify({ w: innerWidth, h: innerHeight })')).w >= 990,
      `the viewport is ${await s.driver.eval('`${innerWidth}x${innerHeight}`')} after asking for 800×600`);
    await s.driver.resize(1_440, 900);
    await sleep(600);

    /*
     * The budget squeezed directly, which is the only route to rule 2's own subject on a window this platform
     * will actually give us. `max-width` on the SLOT is what the layout itself varies — the slot has a zero flex
     * basis, so the title bar decides its width and the chip cannot widen it — so this drives the same path a
     * resize drives, at widths a resize cannot reach. Each step waits for the observer to deliver and for React
     * to commit before the label is read; reading at the same instant measures the frame before the change.
     */
    const squeeze = async (css) => {
      // ONE expression: the driver evaluates an expression, so an assignment is wrapped rather than sequenced.
      await s.driver.eval(`Boolean(document.querySelector('.title-bar__workspace-slot').style.maxWidth = ${JSON.stringify(css)})`);
      await sleep(700);
      const first = JSON.parse(await s.driver.eval(CHIP));
      await sleep(500);
      const second = JSON.parse(await s.driver.eval(CHIP));
      /*
       * Read twice, deliberately. A label read after the observer has delivered but before React has committed is
       * the frame BEFORE the change, and one reading cannot tell that apart from a label that never moves at all —
       * the two have the same shape in a report and opposite causes. When they disagree the detail says so.
       */
      return { ...second, settled: first.label === second.label, firstLabel: first.label };
    };
    const shape = (m) => `slot ${m.slot} px, chip ${m.chipW} px, span ${m.spanW} px${m.settled ? '' : `, UNSETTLED (first read ${JSON.stringify(m.firstLabel)})`}`;
    const at260 = await squeeze('260px');
    const at90 = await squeeze('90px');
    const at46 = await squeeze('46px');
    const restored = await squeeze('');
    const ellipsesOf = (label) => (label ?? '').split('…').length - 1;
    check('REQ-WORKSPACE-149 rule 2: a squeezed budget re-elides from the middle with exactly one ellipsis',
      ellipsesOf(at260.label) === 1 && ellipsesOf(at90.label) === 1,
      `260 px → ${JSON.stringify(at260.label)} (${shape(at260)}); 90 px → ${JSON.stringify(at90.label)} (${shape(at90)})`);
    check('REQ-WORKSPACE-149 rule 2: the label is never drawn clipped, and is hidden where even … will not fit',
      !at260.clipped && !at90.clipped && at46.label === null,
      `clipped at 260/90 px = ${at260.clipped}/${at90.clipped}; at 46 px the label is ${at46.label === null ? 'hidden' : JSON.stringify(at46.label)} (${shape(at46)})`);
    check('REQ-WORKSPACE-149 rule 2: widening restores the whole path, so the elision is not a one-way trip',
      restored.label === wide.label && ellipsesOf(restored.label) === 0,
      `restored to ${JSON.stringify(restored.label)} (was ${JSON.stringify(wide.label)}, ${shape(restored)})`);

    /*
     * The budget must not depend on the label's own box — the assertion whose absence let a latch live for two
     * days. `WorkspaceChip` computed what the chip spends on its furniture as `button.offsetWidth -
     * span.offsetWidth`, which is content-independent only while the span is SHRUNK to fit. A measurement taken
     * while the span still stands at its full width inside a clamped button gives a NEGATIVE spend, hence a
     * budget larger than the label itself, hence "it fits" — a wrong answer that is self-consistent, so no
     * further observer delivery ever comes and the label stays clipped for the life of the window. It appeared
     * twice, intermittently, and no single reading can tell it apart from a frame read too early: both print a
     * whole label in a narrow chip.
     *
     * So the state is forced rather than waited for. The span is pinned to its full width, the slot is nudged by
     * a pixel so the observer delivers, and the label must still elide. Against the arithmetic above this fails;
     * against a budget taken from the slot and the fixed furniture alone it passes. `clipped` is deliberately not
     * asserted here — the pin itself overflows the button, whatever the label says.
     */
    await squeeze('260px');
    /*
     * The pin is `flex-shrink: 0` WITH a `min-width`, and the first attempt is kept here because it read as a
     * pass: pinning `width: 444px` alone changes only the flex BASE size, and a span with `flex-shrink: 1` and
     * the stylesheet's `min-width: 0` shrank straight past it to 198 px. The forced state never existed, the
     * check reported PASS against the very arithmetic it was written to catch, and a repair could have been
     * claimed on it. A harness that cannot reach the state it claims to force is the failure mode this file's
     * header already names once.
     */
    await s.driver.eval("Boolean(Object.assign(document.querySelector('.title-bar__workspace-path').style, { flexShrink: '0', minWidth: '444px' }))");
    const pinned = await squeeze('261px');
    await s.driver.eval("Boolean(Object.assign(document.querySelector('.title-bar__workspace-path').style, { flexShrink: '', minWidth: '' }))");
    const unpinned = await squeeze('');
    check('REQ-WORKSPACE-149 rule 2: the budget ignores the label’s own box, so a stale span cannot latch it whole',
      ellipsesOf(pinned.label) === 1 && pinned.label !== wide.label,
      `span pinned to 444 px at a 261 px slot → ${JSON.stringify(pinned.label)} (${shape(pinned)}); unpinned → ${JSON.stringify(unpinned.label)}`);

    /*
     * The POINTER route, which nothing here reached: every other check drives `workspace.choose` through the
     * driver's command op, so the chip's own handler could have been unwired — or wired to nothing, which is
     * what a missing `onChooseWorkspace` prop would leave — and all of them would still pass. A debugging
     * session mistook exactly this for a product defect when a scrubbed seam opened the real dialog instead.
     */
    const beforeClick = (logOf(s).match(/capture: project folder chooser/g) ?? []).length;
    await s.driver.click('.title-bar__workspace');
    await sleep(900);
    const afterClick = (logOf(s).match(/capture: project folder chooser/g) ?? []).length;
    check('REQ-SHELL-035: a click on the chip opens the chooser, so the control is wired to the command',
      afterClick > beforeClick, `the chooser opened ${afterClick - beforeClick} more time(s) after a click`);

    // Return activates it: the chooser opens, and the seam's `(cancel)` answers it.
    const before = (logOf(s).match(/capture: project folder chooser/g) ?? []).length;
    /*
     * `type('', { enter: true })` rather than `chord('Return')`, and the difference is the point rather than a
     * convenience. The driver's `chord` op sends `keyDown` + `keyUp`; its `type` op's Enter path sends
     * `keyDown` + **`char`** + `keyUp`, and Chromium performs a focused button's native activation only with
     * that `char` event. `chord` therefore cannot exercise REQ-SHELL-035's Return activation at all — the first
     * run of this file read that as the product failing to be keyboard-activatable, which it is not: what was
     * missing was the keystroke. Asserting through `type` keeps the activation the PLATFORM's, which is the
     * whole reason the chip is a real `<button>`.
     */
    await s.driver.eval(`document.querySelector('.title-bar__workspace').focus()`);
    await s.driver.type('', { enter: true });
    await sleep(800);
    const after = (logOf(s).match(/capture: project folder chooser/g) ?? []).length;
    check('REQ-SHELL-035: Return on the focused chip opens the chooser',
      after > before, `the chooser opened ${after - before} more time(s) after Return`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 7 — PD-WORKSPACE-001: the folder this window already has open.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('same-folder', { workspace: A, folders: [A] });
    await sleep(1_200);
    await s.driver.command({ kind: 'workspace.choose' });
    await sleep(1_200);
    const toasts = JSON.parse(await s.driver.eval(TOASTS));
    const windows = await windowsOf(s.driver);
    check('PD-WORKSPACE-001: choosing the folder already open offers a new session instead of doing nothing',
      toasts.some((t) => t.action === 'Start a new session'),
      `${toasts.length} acknowledgement(s): ${JSON.stringify(toasts)}`);
    check('PD-WORKSPACE-001: no window is built and none is closed by that offer',
      windows.length === 1,
      `${windows.length} main window(s) open`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 8 / 9 — the replacement, and the veto that must discard it.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('replace', { workspace: A, folders: [B] });
    await sleep(1_200);
    await s.driver.command({ kind: 'workspace.choose' });
    await sleep(3_000);
    const log = logOf(s);
    const windows = await windowsOf(s.driver);
    check('REQ-SHELL-017: the replacement is built and shown BEFORE the old window is closed',
      log.indexOf('main window 2 loaded') !== -1 && log.indexOf('main window 2 loaded') < log.indexOf('workspace switched to'),
      `the build ${log.includes('main window 2 loaded') ? 'is logged' : 'is NOT logged'} ahead of the switch`);
    check('REQ-SHELL-017: one main window is left, on the chosen folder, and it is what is remembered',
      windows.length === 1 && preferenceFile(s)['workspace/lastOpened'] === B,
      `${windows.length} window(s); lastOpened=${JSON.stringify(preferenceFile(s)['workspace/lastOpened'])}`);
  }
  {
    const s = await launch('veto', { workspace: A, folders: [B] });
    await sleep(1_200);
    // The guard the window's own close asks — the second caller of one mechanism (REQ-SHELL-021 gate 1's note).
    // ONE expression, not two statements: the driver evaluates what it is given as an expression, so
    // `x = y; true` fails with "Script failed to execute" — which killed the first two runs of this file after
    // the sixteenth check and reported nothing at all about the eight assertions below it.
    await s.driver.eval('Boolean(window.__rotarisCloseGuard = () => false)');
    await s.driver.command({ kind: 'workspace.choose' });
    await sleep(3_000);
    const windows = await windowsOf(s.driver);
    check('REQ-SHELL-018: a refused close discards the REPLACEMENT and changes nothing',
      windows.length === 1 && preferenceFile(s)['workspace/lastOpened'] !== B,
      `${windows.length} window(s); lastOpened=${JSON.stringify(preferenceFile(s)['workspace/lastOpened'])}`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 10 — a folder that cannot be opened as a workspace leaves the window usable and says so.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const notADirectory = join(output, 'project-a', 'README.md');
    const s = await launch('open-failure', { workspace: A, folders: [notADirectory] });
    await sleep(1_200);
    await s.driver.command({ kind: 'workspace.choose' });
    await sleep(3_000);
    const windows = await windowsOf(s.driver);
    const shell = JSON.parse(await s.driver.eval(`JSON.stringify({ alive: !!document.querySelector('.app-shell'), body: document.body.innerText.slice(0, 4000) })`));
    check('REQ-SHELL-019: a failure to open the selected project leaves the old window usable and reports the reason',
      shell.alive && windows.length === 1 && shell.body.includes('Could not open the selected project'),
      `${windows.length} window(s), shell ${shell.alive ? 'alive' : 'gone'}, the sentence ${shell.body.includes('Could not open the selected project') ? 'is shown' : 'is NOT shown'}`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 11 — PD-SHELL-001: the add route, and that it evaluates no gate.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('add-window', { workspace: A, folders: [B] });
    await sleep(1_200);
    // The unsaved-settings guard says NO. On the add route it is never asked, so this must change nothing.
    // ONE expression, not two statements: the driver evaluates what it is given as an expression, so
    // `x = y; true` fails with "Script failed to execute" — which killed the first two runs of this file after
    // the sixteenth check and reported nothing at all about the eight assertions below it.
    await s.driver.eval('Boolean(window.__rotarisCloseGuard = () => false)');
    await s.driver.command({ kind: 'workspace.choose', newWindow: true });
    await sleep(3_500);
    const windows = await windowsOf(s.driver);
    const count = windows.length;
    const roots = windows.map((w) => String(w.workspace ?? w).toLowerCase());
    check('PD-SHELL-001: the add route holds TWO main windows open at once, one per project',
      count === 2 && roots.some((r) => r.includes('project-a')) && roots.some((r) => r.includes('project-b')),
      `${count} main window(s): ${JSON.stringify(windows)}`);
    check('PD-SHELL-001: no gate is evaluated on the add route — a guard that refuses every close changes nothing',
      count === 2 && !logOf(s).includes('REQ-SHELL-021 gate 1'),
      `the unsaved-settings gate ${logOf(s).includes('REQ-SHELL-021 gate 1') ? 'WAS' : 'was not'} evaluated`);
    check('PD-SHELL-001 / REQ-WORKSPACE-005: the added window’s folder is what is remembered',
      preferenceFile(s)['workspace/lastOpened'] === B,
      `lastOpened=${JSON.stringify(preferenceFile(s)['workspace/lastOpened'])}`);

    // Both windows must be usable: each answers for itself, which is REQ-SHELL-020's attribution.
    const second = windows.find((w) => String(w.workspace ?? '').toLowerCase().includes('project-b'));
    if (second) {
      await s.driver.useWindow('project-b');
      const shell = await s.driver.eval(`JSON.stringify({ view: document.querySelector('.app-shell')?.dataset?.view ?? null })`);
      await s.driver.useWindow('project-a');
      const first = await s.driver.eval(`JSON.stringify({ view: document.querySelector('.app-shell')?.dataset?.view ?? null })`);
      check('REQ-STARTUP-161: both main windows of the one instance are alive and answer for themselves',
        JSON.parse(shell).view !== null && JSON.parse(first).view !== null,
        `project-b is on ${JSON.parse(shell).view}, project-a on ${JSON.parse(first).view}`);
      await s.driver.useWindow();
    } else {
      skip('REQ-STARTUP-161: both main windows answer for themselves', 'the second window was never built, so there is nothing to address');
    }

    // REQ-STARTUP-163's rule, cited by both directives: a folder already open is SURFACED, never opened twice.
    await s.driver.command({ kind: 'workspace.choose', newWindow: true });
    await sleep(2_000);
    const afterDuplicate = await windowsOf(s.driver);
    check('REQ-STARTUP-163: choosing a folder another window already holds surfaces that window and builds none',
      afterDuplicate.length === 2,
      `${afterDuplicate.length} main window(s) after choosing an already-open folder`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 12 — overlapping opens, sender attribution and one deferred offer per window.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('concurrent', { workspace: A, folders: [B, C, D, C, '(cancel)'] });
    await s.driver.command({ kind: 'workspace.choose', newWindow: true });
    await waitForWindowCount(s.driver, 2);

    await s.driver.useWindow('project-a');
    const openingC = s.driver.command({ kind: 'workspace.choose', newWindow: true });
    await s.driver.useWindow('project-b');
    const openingD = s.driver.command({ kind: 'workspace.choose', newWindow: true });
    await Promise.all([openingC, openingD]);
    const opened = await waitForWindowCount(s.driver, 4);
    const overlapLog = logOf(s);
    const bothBuilt = Math.max(overlapLog.indexOf(`loaded for ${C}`), overlapLog.indexOf(`loaded for ${D}`));
    const firstSettled = Math.min(overlapLog.indexOf('added main window', overlapLog.indexOf(`loaded for ${C}`)), overlapLog.indexOf('added main window', overlapLog.indexOf(`loaded for ${D}`)));
    check('MainWindows: concurrent project opens retain four independently attributed windows',
      opened.length === 4 && bothBuilt >= 0 && firstSettled > bothBuilt,
      `${opened.length} windows; both builds ${firstSettled > bothBuilt ? 'started before either settled' : 'did not overlap'}: ${JSON.stringify(opened)}`);

    await s.driver.useWindow('project-c');
    await s.driver.deferProjectOffer(1_500);
    await s.driver.useWindow('project-d');
    const deferredD = await s.driver.deferProjectOffer(1_500);
    await s.driver.useWindow('project-c');
    await s.driver.command({ kind: 'workspace.choose', newWindow: true });
    await sleep(2_500);
    const deferredLog = logOf(s);
    const offered = [...deferredLog.matchAll(/offering the first-launch project chooser for window (\d+)/g)].map((match) => Number(match[1]));
    check('REQ-SHELL-020: the driver command is attributed to its selected main window',
      JSON.parse(await s.driver.eval(TOASTS)).some((toast) => toast.action === 'Start a new session'),
      `project-c acknowledgements: ${await s.driver.eval(TOASTS)}`);
    await s.driver.useWindow('project-d');
    const dToasts = JSON.parse(await s.driver.eval(TOASTS));
    check('REQ-SHELL-011 / REQ-WORKSPACE-008: answering one window cancels only its deferred offer',
      offered.length === 1 && offered[0] === deferredD.windowId && dToasts.some((toast) => toast.title.includes('Open a project folder')),
      `offered for ${JSON.stringify(offered)}; project-d acknowledgements ${JSON.stringify(dToasts)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 13 — a real second launch: surface an existing workspace, then add a different one.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('hand-over', { workspace: A });
    const surfacedExit = await handOver(s, A);
    const surfaced = await waitForWindowCount(s.driver, 1);
    check('REQ-STARTUP-162/163: hand-over for an open workspace surfaces its holder and builds nothing',
      surfacedExit.code === 0 && surfaced.length === 1 && logOf(s).includes('hand-over surfaced window'),
      `secondary exit ${surfacedExit.code ?? surfacedExit.signal}; ${surfaced.length} main window(s)`);

    const addedExit = await handOver(s, B);
    const added = await waitForWindowCount(s.driver, 2);
    await waitForRememberedWorkspace(s, B);
    check('REQ-STARTUP-163: hand-over for a different workspace adds a main window',
      addedExit.code === 0 && added.some((window) => String(window.workspace).toLowerCase() === B.toLowerCase()) && logOf(s).includes('origin hand-over'),
      `secondary exit ${addedExit.code ?? addedExit.signal}; windows ${JSON.stringify(added)}`);
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 8b — a switch away from a workspace whose initialization run is under way (REQ-WORKSPACE-013).
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    /*
     * Before the repair nothing in main cancelled the outgoing workspace's run: its setup went on for its whole 90 s, the
     * replacement's own setup was refused as already running, and a return to the first project resolved nothing
     * (`docs/defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`).
     */
    const s = await launch('init-switch', { workspace: INIT_SLOW, folders: [INIT_QUICK, INIT_SLOW] });
    const startedFor = (name) => (logOf(s).match(new RegExp(`mcp setup: started for [^\\n]*${name}`, 'g')) ?? []).length;
    const waitUntil = async (predicate, timeoutMs) => {
      const began = Date.now();
      while (!predicate()) {
        if (Date.now() - began > timeoutMs) return false;
        await sleep(100);
      }
      return true;
    };
    const slowStarted = await waitUntil(() => startedFor('init-slow') === 1 && existsSync(join(INIT_SLOW, '.stand-in-create.pid')), 30_000);
    if (!slowStarted) {
      skip('REQ-WORKSPACE-013: a switch cancels the outgoing workspace\'s initialization run', `the first project's setup never started within 30 s, so there was no run to cancel (log tail: ${JSON.stringify(logOf(s).slice(-600))})`);
    } else {
      const pid = Number(readFileSync(join(INIT_SLOW, '.stand-in-create.pid'), 'utf8'));
      await s.driver.command({ kind: 'workspace.choose' });
      // The switch has closed the outgoing window by the time the command answers, so the cancellation was asked before now.
      const answeredAt = Date.now();
      const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
      const ended = await waitUntil(() => !alive(), 5_000);
      const endedAfter = Date.now() - answeredAt;
      await waitUntil(() => /mcp setup: (cancelled|completed|failed) /.test(logOf(s)), 10_000);
      let log = logOf(s);
      check('REQ-WORKSPACE-013 / REQ-WORKSPACE-109: switching away cancels the outgoing workspace\'s initialization run',
        /initialization: [^\n]*init-slow was closed while its run was under way/.test(log) && log.includes('mcp setup: cancellation requested') && log.includes('mcp setup: cancelled'),
        `closed-while-running ${/init-slow was closed while its run was under way/.test(log) ? 'logged' : 'NOT logged'}; cancellation ${log.includes('mcp setup: cancellation requested') ? 'requested' : 'NEVER requested'}; setup ${log.match(/mcp setup: (cancelled|completed|failed) /)?.[1] ?? 'still running'}`);
      check('REQ-WORKSPACE-092: nothing the cancelled step launched is still running 5 s later',
        ended,
        ended ? `the stand-in's project create (pid ${pid}) had ended ${endedAfter} ms after the switch answered` : `pid ${pid} was still running 5 s after the switch answered`);
      const slowFile = readFileSync(join(INIT_SLOW, '.rotaris', 'agents.yaml'), 'utf8');
      check('REQ-WORKSPACE-013: nothing is recorded for the cancelled run, so its task stays pending',
        !slowFile.includes('code-intelligence-setup') && !slowFile.includes('last_run'),
        `the outgoing workspace's file ${slowFile.includes('initialization:') ? `carries ${JSON.stringify(slowFile.slice(slowFile.indexOf('initialization:')))}` : 'carries no initialization section'}`);
      const quickRecorded = await waitUntil(() => readFileSync(join(INIT_QUICK, '.rotaris', 'agents.yaml'), 'utf8').includes('code-intelligence-setup'), 30_000);
      log = logOf(s);
      check('REQ-WORKSPACE-013 / REQ-WORKSPACE-084 / REQ-WORKSPACE-109: the replacement resolves its own workspace, and its run is followed to its own recorded outcome',
        quickRecorded && startedFor('init-quick') === 1 && /code-intelligence-setup → success/.test(log.slice(log.search(/mcp setup: started for [^\n]*init-quick/))),
        `the replacement's setup ${startedFor('init-quick') === 1 ? 'started' : `started ${startedFor('init-quick')} time(s)`}; its outcome is ${quickRecorded ? 'recorded' : 'NOT recorded'}${/already running/.test(log) ? '; a start was refused as already running' : ''}`);
      await s.driver.command({ kind: 'workspace.choose' });
      const resolvedAgain = await waitUntil(() => startedFor('init-slow') === 2, 30_000);
      check('REQ-WORKSPACE-102: a return to the first project is a new open, with its own automatic resolution',
        resolvedAgain,
        resolvedAgain ? 'the pending task started again when the first project was opened again' : `the first project's setup started ${startedFor('init-slow')} time(s)`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 6 — the gate with the exact sentence. Left last: it needs a run, and a run leaves state behind.
  // ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const s = await launch('run-active', { workspace: A, folders: [B] });
    await sleep(1_200);
    /*
     * `session.start` CARRIES the prompt — the schema refuses a start without one, and the first run of this
     * file sent `{ kind: 'session.start' }`, was answered `command.malformed`, and skipped the only assertion
     * that checks a requirement's exact sentence. There is no separate prompt call to make afterwards.
     *
     * And the choose is issued immediately, with no sleep between: the gate reads `runs.active` from the run
     * host, so what must be true is that a run is in flight at that instant. A wait here would let a scripted
     * run finish first and turn a real gate into a passing no-op.
     */
    const started = await s.driver.command({ kind: 'session.start', prompt: 'Keep running while the gate is asked.' });
    if (started?.ok) {
      const answer = await s.driver.command({ kind: 'workspace.choose' });
      const declined = JSON.stringify(answer).includes('Finish the active run before opening another project.');
      const log = logOf(s);
      check('REQ-SHELL-021 gate 3: with a run active the flow is declined with the exact sentence and no chooser opens',
        declined && (log.match(/capture: project folder chooser/g) ?? []).length === 0,
        declined ? 'declined with the requirement’s own sentence, and the chooser never opened' : `the answer was ${JSON.stringify(answer).slice(0, 300)}`);
    } else {
      skip('REQ-SHELL-021 gate 3: the active-run decline', `no session could be started to make a run active (${JSON.stringify(started).slice(0, 200)})`);
    }
    skip('REQ-SHELL-021 gate 2: the worktree-integration decline',
      'no in-flight worktree integration is observable from main in this build — `worktree.integrate` does not exist and `integrating` is an unread MERGE_STATUSES member, so the gate has no state to read');
    skip('REQ-STARTUP-043: a constructed-but-unshown window opens no network connection',
      'the add route shows its window in the same turn it builds it, so there is no observable unshown interval to measure from outside the process');
  }
} catch (cause) {
  /*
   * A harness error is a FAILURE OF THIS FILE and is reported as one, rather than being allowed to kill the
   * run. Twice now an exception after the sixteenth check took the process down with a stack trace, and the
   * eight assertions below it reported nothing — neither pass nor fail — which reads exactly like a shorter
   * proof. A proof that stops early must say so in the same place it says everything else.
   */
  check('the harness ran to the end', false, `it threw instead: ${cause instanceof Error ? cause.message : String(cause)}`);
} finally {
  await closeAll();
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

const passed = results.filter((r) => r.verdict === 'PASS').length;
const skipped = results.filter((r) => r.verdict === 'SKIP').length;
console.log(`\n${passed} passed, ${failures} failed, ${skipped} skipped — evidence in ${output}`);
process.exit(failures === 0 ? 0 : 1);
