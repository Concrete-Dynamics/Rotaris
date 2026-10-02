/**
 * The retrospective proof (`pnpm retrospective-proof`) — ADR-0065's first execution in the BUILT application.
 *
 * PD-LIBRARY-002 asks for a second analysis pass that reads THIS workspace's own history and proposes how the
 * workspace is worked in. Every unit test around it can only show that the pieces agree with each other; what
 * the directive actually promises is a gesture a person makes and an outcome they can review, so this drives
 * the built application through the driver seam, with the scripted provider and a scratch profile, and reads
 * the store, the DOM and the log back.
 *
 * What it proves, in the order the launches run:
 *
 *   1. PASS — a workspace with a seeded multi-session record: the Library's gesture captures, analyses and
 *      stores an artifact with `source_kind: 'retrospective'`, a NULL source session and
 *      `considered_session_ids` naming every session the capture read. The proposals reach the Library's
 *      Proposals tab AND the Overview card, and an approval on one of them still writes through.
 *      Evidence attribution is measured in both directions: an entry citing a session the pass read keeps it,
 *      and an entry citing a session it never read is stripped to null rather than carried.
 *   2. INDICATORS — REQ-LIBRARY-125/126, built here for both passes: while the pass runs, the title-bar and
 *      the run-header indicators are on screen, labelled in words and marked with the pass they describe; when
 *      no pass runs, neither exists. Both halves are measured in launch 1, which is the only way to tell an
 *      indicator that appears from one that is always there.
 *   3. PALETTE — the third surface the gesture lives on is in the palette's list under its own label.
 *   4. NO MODEL — a workspace whose model slot names nothing configured: each gesture answers with its own
 *      informational notice carrying the Settings action, the second gesture raises a SECOND notice rather
 *      than being suppressed (REQ-LIBRARY-037 per gesture, not per workspace), the action opens Settings at
 *      Models, and no artifact is written.
 *   5. TIMEOUT — a provider that never answers: within `retrospective_timeout` the pass ends in the empty
 *      artifact whose notes say it timed out, the indicators go, and the composer still accepts input.
 *   6. SHUTDOWN — the application closed while a pass is running leaves no artifact and no proposal behind
 *      (REQ-LIBRARY-127).
 *
 * Evidence under `.proof/retrospective-proof/`: a PNG per scenario, each launch's `app.log`, `results.json`.
 * `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { buildDesktop, evidenceDirectory, findDatabases } from './lib/harness.mjs';
import { startApp } from './lib/driver.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const output = evidenceDirectory('.retrospective-proof');
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

const results = [];
let failures = 0;
const check = (name, ok, detail) => {
  results.push({ name, verdict: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One scratch workspace: the configuration, the instruction file and the persona memory the capture reads.
 * `medium` is the model slot's target — a name that is NOT in `models:` is how a workspace with no resolvable
 * retrospective model is written, which is the fourth launch's whole subject.
 */
function workspaceAt(name, { medium = 'scripted', timeout = 120 } = {}) {
  const workspace = join(output, name, 'workspace');
  mkdirSync(join(workspace, '.rotaris', 'persona_memory'), { recursive: true });
  writeFileSync(join(workspace, 'README.md'), `# retrospective proof workspace (${name})\n`);
  writeFileSync(join(workspace, 'AGENTS.md'), '# House rules\n\nRun the suite before claiming a change is done.\n');
  writeFileSync(join(workspace, '.rotaris', 'persona_memory', 'coding-agent.md'), 'Remember: this workspace has no build gate named anywhere.\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', `medium_model: ${medium}`, 'large_model: scripted',
    'runtime:', '  permission_mode: autonomous', `  retrospective_timeout: ${timeout}`,
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    /*
     * The project-initialization section as a workspace that has already been set up holds it
     * (REQ-WORKSPACE-088/115). Without it the one registered task runs in the background on every launch,
     * fails for want of the bundled code-intelligence runtime, and publishes its own error notice — which,
     * since exactly one notice is current (REQ-NOTIFY-024), would replace the notice this proof is reading
     * and make every notice assertion a race. Nothing here is a test seam: it is the product's own state.
     */
    'initialization:', '  completed: [code-intelligence-setup]', '  skipped: []',
    '  last_run: "2026-09-01T00:00:00.000+00:00"', '  classification: code', '',
  ].join('\n'));
  return workspace;
}

/** The one store below a launch root, opened after the process that owned it has exited. */
function storeOf(root) {
  const databases = findDatabases(join(root, 'local'));
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${root}; found ${databases.length}`);
  return new Database(databases[0], { readonly: true });
}
function artifactsIn(root) {
  const db = storeOf(root);
  try {
    return db.prepare('SELECT artifact_id, source_session_id, source_kind, source_run_type, body FROM improvement_artifacts ORDER BY generated_at DESC, artifact_id ASC').all()
      .map((row) => ({ ...row, artifact: JSON.parse(row.body) }));
  } finally { db.close(); }
}

/**
 * The sessions the retrospective looks back over, planted directly into the store between two launches.
 *
 * Driving three real runs would cost minutes and measure the run loop, which has its own proofs; what THIS
 * proof needs is a record with several sessions in it. The columns are asserted before anything is written,
 * so a schema that moves fails here loudly instead of seeding less than it claims to.
 */
function plantSessions(root, workspaceRoot, count) {
  const databases = findDatabases(join(root, 'local'));
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${root}; found ${databases.length}`);
  const db = new Database(databases[0]);
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name));
    for (const needed of ['session_id', 'execution_status', 'workspace_root', 'created_at', 'updated_at', 'run_type', 'stop_reason', 'iterations_completed', 'tool_calls']) {
      if (!columns.has(needed)) throw new Error(`the sessions table has no ${needed} column; this proof's seed is stale`);
    }
    const ids = [];
    const insert = db.prepare('INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at, run_type, stop_reason, iterations_completed, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const row = db.prepare("INSERT INTO transcript_rows (session_id, row_index, kind, settled, body, at, persona, name, ts) VALUES (?, 0, 'user', 1, ?, '', NULL, NULL, '')");
    const tx = db.transaction(() => {
      for (let index = 0; index < count; index += 1) {
        const id = `planted-${String(index + 1).padStart(2, '0')}`;
        insert.run(id, 'completed', workspaceRoot, `2026-09-16T0${index}:00:00.000Z`, `2026-09-16T0${index}:30:00.000Z`, 'task_run', 'completed', 3 + index, 5 + index);
        row.run(id, `Planted prompt ${index + 1}: tidy the workspace and run the suite.`);
        ids.push(id);
      }
    });
    tx();
    return ids;
  } finally { db.close(); }
}

/**
 * The run-header indicator's visible label, word by word (L10): each word's Range boxes against the indicator's own
 * box, whether the box scrolls (overflow), whether it runs under the next control in the header, and how many lines the
 * label takes. The accessible description (`.visually-hidden`) is not drawn and is left out.
 */
const RUN_HEADER_LABEL_GEOMETRY = `(() => {
  const tag = document.querySelector('[data-testid="improvement-activity-run-header"]');
  if (!tag) return null;
  const header = tag.closest('.run-header');
  const box = tag.getBoundingClientRect();
  const walker = document.createTreeWalker(tag, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement && n.parentElement.closest('.visually-hidden') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const words = []; const tops = new Set(); let label = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    label += node.data;
    for (const match of node.data.matchAll(/\\S+/g)) {
      const range = document.createRange(); range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
      const rects = [...range.getClientRects()];
      const inside = rects.length > 0 && rects.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5);
      rects.forEach((r) => tops.add(Math.round(r.top)));
      words.push({ word: match[0], inside });
    }
  }
  const next = tag.nextElementSibling;
  const nextBox = next ? next.getBoundingClientRect() : null;
  const overlapsNext = nextBox !== null && nextBox.width > 0 && box.right > nextBox.left + 0.5 && box.bottom > nextBox.top && box.top < nextBox.bottom;
  const hb = header ? header.getBoundingClientRect() : null;
  return { label: label.trim(), words, lines: tops.size, box: { width: box.width, height: box.height },
    overflows: tag.scrollWidth > tag.clientWidth + 1 || tag.scrollHeight > tag.clientHeight + 1, overlapsNext,
    insideHeader: hb !== null && box.left >= hb.left - 0.5 && box.right <= hb.right + 0.5 };
})()`;

/**
 * The title-bar indicator's label (L10, the verifier's fix round 1): the title bar is one fixed row, so there the label
 * is either whole or elided on the label element itself, where `text-overflow: ellipsis` draws. It must not scroll the
 * indicator, and must not run under the control after it.
 */
const TITLE_BAR_LABEL_GEOMETRY = `(() => {
  const tag = document.querySelector('[data-testid="improvement-activity-title-bar"]');
  if (!tag) return null;
  const label = tag.querySelector('.improvement-activity__label');
  if (!label) return { label: null };
  const box = tag.getBoundingClientRect();
  const style = getComputedStyle(label);
  const elided = label.scrollWidth > label.clientWidth + 1;
  const next = tag.nextElementSibling;
  const nextBox = next ? next.getBoundingClientRect() : null;
  const overlapsNext = nextBox !== null && nextBox.width > 0 && box.right > nextBox.left + 0.5 && box.bottom > nextBox.top && box.top < nextBox.bottom;
  return { label: (label.textContent || '').trim(), width: box.width, elided, ellipsis: style.textOverflow === 'ellipsis' && style.overflow === 'hidden',
    overflows: tag.scrollWidth > tag.clientWidth + 1, overlapsNext };
})()`;

/**
 * Acceptance A40: every design Tag on screen — its foundation and its tone, and whether the loaded stylesheets define
 * that tone. Half the Tag's kinds named classes the adopted sheet does not define, and one caller spelled `tag-failure`;
 * a tone with no rule draws a bare tag. The walk reaches imported sheets and grouping rules.
 */
const TAG_TONES = `(() => {
  const defined = new Set();
  const walk = (rules) => { for (const r of rules) {
    if (r.styleSheet) { try { walk(r.styleSheet.cssRules); } catch {} }
    if (r.cssRules && !r.selectorText) walk(r.cssRules);
    if (r.selectorText) for (const sel of r.selectorText.split(',')) { const m = sel.trim().match(/^\\.(tag-[a-z]+)$/); if (m) defined.add(m[1]); }
  } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
  return [...document.querySelectorAll('[data-ui-component="Tag"]')].map((t) => {
    const tones = [...t.classList].filter((c) => c.startsWith('tag-'));
    return { text: (t.textContent || '').trim().slice(0, 40), tag: t.classList.contains('tag'), tones, undefinedTones: tones.filter((c) => !defined.has(c)) };
  });
})()`;
const tagsWellFormed = (tags) => Array.isArray(tags) && tags.length > 0 && tags.every((t) => t.tag && t.tones.length === 1 && t.undefinedTones.length === 0);
const tagsDetail = (tags) => (Array.isArray(tags) ? `${tags.length} tag(s): ${tags.map((t) => `"${t.text}" ${t.tag ? 'tag' : 'NO tag'} ${t.tones.join('+') || 'NO tone'}${t.undefinedTones.length > 0 ? ` (undefined: ${t.undefinedTones.join(', ')})` : ''}`).join('; ').slice(0, 400)}` : 'not read');

/** Acceptance A40: the indicator's design StatusDot — the state it writes and the colour it is painted. */
const INDICATOR_DOT = `(() => {
  const dot = document.querySelector('[data-testid="improvement-activity-run-header"] [data-ui-component="StatusDot"]');
  if (dot === null) return null;
  // Painted means a background other than the one an unstyled span computes, so no colour is written here.
  const bare = document.createElement('span'); document.body.append(bare); const none = getComputedStyle(bare).backgroundColor; bare.remove();
  const background = getComputedStyle(dot).backgroundColor;
  return { state: dot.getAttribute('data-state'), kind: dot.getAttribute('data-kind'), background, painted: background !== none };
})()`;

/** Every element matching the selector, with its text and its data/aria attributes. */
const probe = (d, selector) => d.probe(selector);
const one = async (d, selector) => (await d.probe(selector))[0] ?? null;
/** Poll until the predicate holds over the probe, or the deadline passes; returns whether it held. */
async function until(d, selector, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const matches = await d.probe(selector);
    if (predicate(matches)) return true;
    if (Date.now() > deadline) return false;
    await sleep(200);
  }
}

/**
 * The notice whose text matches, returned AS IT MATCHED rather than re-probed afterwards.
 *
 * Exactly one notice is current (REQ-NOTIFY-024), so any later publication replaces it: a proof that waits
 * for its notice and then asks the DOM again is reading whatever arrived in between. This returns null when
 * none matched inside the bound.
 */
async function noticeMatching(d, pattern, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await d.probe('[data-testid="notice"]')).find((notice) => pattern.test(notice.text));
    if (found) return found;
    if (Date.now() > deadline) return null;
    await sleep(200);
  }
}

/**
 * Let the launch's own notices finish before a gesture raises one.
 *
 * Found by this proof's first execution: with no provider authenticated, startup publishes "No model provider
 * is authenticated yet" about a second in, and exactly one notice is current (REQ-NOTIFY-024) — so a gesture
 * made before it lands has its answer replaced within ~80 ms, and the assertion reads the startup notice
 * instead. That is the product behaving as specified; waiting for the last startup notice is what makes the
 * measurement about the gesture.
 */
async function settleStartupNotices(d) {
  await noticeMatching(d, /No model provider is authenticated/, 30_000);
  await sleep(400);
}

/** Open the Library at its Proposals tab, from wherever the shell happens to be. */
async function openProposals(d) {
  await d.click('.nav-item', { text: 'Library', timeoutMs: 20_000 });
  await d.waitFor('[data-testid="library"]', { timeoutMs: 20_000 });
  await d.click('[data-testid="library-tab"][data-tab="proposals"]', { timeoutMs: 20_000 });
  await d.waitFor('[data-testid="library-proposals"]', { timeoutMs: 20_000 });
}

const launches = [];
/** Start the built app on a scratch profile, run `body` against the driver, and always quit and keep the log. */
async function launch(name, workspace, extra, body, timeoutMs = 120_000) {
  const root = join(output, name, 'app');
  const started = await startApp({ root, workspace, extra, timeoutMs: 90_000 });
  const d = started.driver;
  try {
    await d.waitFor('.app-shell', { timeoutMs });
    await settleStartupNotices(d);
    return await body(d, root);
  } finally {
    await d.quit().catch(() => undefined);
    d.close();
    try { if (started.child.pid) process.kill(started.child.pid); } catch { /* already gone after the quit */ }
    await sleep(1_200);
    const log = existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '';
    writeFileSync(join(output, `${name}.log`), log);
    launches.push({ name, log: `${name}.log` });
  }
}

// ── 1. The seed launch: the store exists only once the application has opened the workspace once.
const passWorkspace = workspaceAt('pass');
let planted = [];
await launch('seed', passWorkspace, {}, async (d, root) => {
  await d.screenshot(join(output, 'seed.png'));
  return root;
});
planted = plantSessions(join(output, 'seed', 'app'), passWorkspace, 3);
check('the seeded record holds the sessions the pass will read', planted.length === 3, `planted ${planted.join(', ')}`);

// The pass launch reuses the seeded profile, so it opens the store the sessions were planted into.
const passRoot = join(output, 'seed', 'app');

// ── 2. The pass itself, held open for ten seconds so the indicators can be READ — and measured at two window
//    sizes (L10, below) — while it runs. Six seconds held the reads alone; two resizes and two shots are added.
await (async () => {
  const started = await startApp({ root: passRoot, workspace: passWorkspace, extra: { ROTARIS_IMPROVEMENT_SCRIPT: 'wait:10000' }, timeoutMs: 90_000 });
  const d = started.driver;
  try {
    await d.waitFor('.app-shell', { timeoutMs: 60_000 });
    await settleStartupNotices(d);

    // The indicators are absent before any pass runs — the half that tells an indicator from a fixture.
    const before = await probe(d, '[data-testid="improvement-activity-title-bar"]');
    check('no indicator is drawn while no analysis runs (REQ-LIBRARY-126)', before.length === 0, `${before.length} indicator(s) on screen before the gesture`);

    // The third surface: the palette carries the gesture under its own label (REQ-SHELL-051's list).
    await d.chord('Ctrl+K');
    await d.waitFor('[data-testid="command-palette"]', { timeoutMs: 15_000 });
    const entry = await one(d, '.cmdk-item[data-command="improvements.retrospective"]');
    check('the palette offers the retrospective under its own label', entry !== null && /retrospective/i.test(entry.text), entry === null ? 'no palette row carries the command id' : `"${entry.text}"`);
    await d.screenshot(join(output, 'palette.png'));
    await d.chord('Escape');
    await sleep(400);

    await openProposals(d);
    const empty = await probe(d, '[data-testid="library-improvements-empty"]');
    check('the Proposals tab starts empty in a workspace that has never been looked back over', empty.length === 1, `${empty.length} empty state(s)`);
    await d.click('[data-testid="library-retrospective"]', { timeoutMs: 15_000 });

    // ── The indicators, WHILE the pass runs. The title bar is always on screen; the run header is the
    //    Workspace view's, so the proof goes there and comes back rather than assuming one stands for both.
    await d.waitFor('[data-testid="improvement-activity-title-bar"]', { timeoutMs: 30_000 });
    // `inspect` rather than `probe`: `role` is neither a data- nor an aria- attribute, and the accessible
    // role is half of what REQ-LIBRARY-125 fixes.
    const titleProbe = (await d.inspect('[data-testid="improvement-activity-title-bar"]')).matches[0] ?? null;
    check('the title-bar indicator names the pass in words, not by colour alone (REQ-LIBRARY-125, REQ-SHELL-149)',
      titleProbe !== null && titleProbe.attrs['data-pass'] === 'retrospective' && /Reviewing workspace history for improvements/.test(titleProbe.text) && titleProbe.attrs['aria-label'] === 'Improvement analysis status' && titleProbe.attrs['role'] === 'status',
      titleProbe === null ? 'absent while the pass ran' : `"${titleProbe.text.slice(0, 60)}" pass=${titleProbe.attrs['data-pass']} role=${titleProbe.attrs['role']} name=${titleProbe.attrs['aria-label']}`);
    await d.screenshot(join(output, 'activity-title-bar.png'));

    await d.click('.nav-item', { text: 'Workspace', timeoutMs: 15_000 });
    const header = await one(d, '[data-testid="improvement-activity-run-header"]');
    check('the run header carries the same indicator while the pass runs (REQ-LIBRARY-126)',
      header !== null && header.data['data-pass'] === 'retrospective' && /Reviewing workspace history for improvements/.test(header.text),
      header === null ? 'no run-header indicator while a pass was active' : `"${header.text}" pass=${header.data['data-pass']}`);
    await d.screenshot(join(output, 'activity-run-header.png'));
    const dot = await d.eval(INDICATOR_DOT);
    check('the run-header indicator\'s design StatusDot writes the language\'s `run` state and is painted (A40)',
      dot !== null && dot.state === 'run' && dot.kind === null && dot.painted,
      dot === null ? 'no StatusDot in the indicator' : `data-state=${dot.state} data-kind=${dot.kind} background ${dot.background}${dot.painted ? '' : ' (unpainted)'}`);

    // ── Live-run finding L10: the run header's label was cut mid-word at 1440 px ("Reviewing run for improvem")
    //    with no ellipsis. REQ-LIBRARY-125 with REQ-SHELL-149: the label is carried in words. Every word of the
    //    visible label is measured with a Range and must lie whole inside the indicator's box, the box must not
    //    overflow, and it must not run under the control after it — at the live run's 1440 px and at the
    //    1000×680 minimum (REQ-SHELL-022), where it may wrap between words but never cut one.
    const initial = await d.eval('[innerWidth, innerHeight]');
    for (const [width, height] of [[1440, 900], [1000, 680]]) {
      await d.resize(width, height);
      await sleep(300);
      const g = await d.eval(RUN_HEADER_LABEL_GEOMETRY);
      const clippedWords = g === null ? [] : g.words.filter((w) => !w.inside).map((w) => w.word);
      check(`at ${width}×${height} the run-header indicator carries its label in whole words, none cut at its edge (REQ-LIBRARY-125, REQ-SHELL-149; L10)`,
        g !== null && g.words.length > 0 && clippedWords.length === 0 && !g.overflows && !g.overlapsNext && g.insideHeader,
        g === null ? 'no run-header indicator while the pass ran' : `"${g.label}" in ${Math.round(g.box.width)}×${Math.round(g.box.height)} px, ${g.lines} line(s); cut: ${clippedWords.length === 0 ? 'none' : clippedWords.join(', ')}; overflows ${g.overflows}; overlaps the next control ${g.overlapsNext}; inside the header ${g.insideHeader}`);
      await d.screenshot(join(output, `activity-run-header-${width}.png`));
      const t = await d.eval(TITLE_BAR_LABEL_GEOMETRY);
      check(`at ${width}×${height} the title-bar indicator's label is whole or elided with its ellipsis drawn, never cut bare (REQ-LIBRARY-125, REQ-SHELL-149; L10)`,
        t !== null && t.label !== null && t.label.length > 0 && (!t.elided || t.ellipsis) && !t.overflows && !t.overlapsNext,
        t === null ? 'no title-bar indicator while the pass ran' : t.label === null ? 'the title-bar indicator has no label element' : `"${t.label}" in ${Math.round(t.width)} px; ${t.elided ? (t.ellipsis ? 'elided with an ellipsis' : 'cut without an ellipsis') : 'whole'}; overflows ${t.overflows}; overlaps the next control ${t.overlapsNext}`);
    }
    if (Array.isArray(initial) && initial[0] > 0 && initial[1] > 0) await d.resize(initial[0], initial[1]);

    // ── The outcome: the completion notice, then the proposals on the Library's tab.
    const completion = await noticeMatching(d, /retrospective proposals? ready/, 90_000);
    check('the completion notice says which pass proposed (REQ-LIBRARY-124 with PD-LIBRARY-002)', completion !== null,
      completion === null ? `no such notice; the current one reads "${(await probe(d, '[data-testid="notice-title"]')).map((n) => n.text).join(' | ')}"` : `"${completion.text.slice(0, 80)}"`);
    const action = await one(d, '.notice__action');
    check('the completion notice offers the review action', action !== null && action.data['data-action'] === 'open-library', action === null ? 'no action on the notice' : `${action.data['data-action']} — "${action.text}"`);

    const gone = await until(d, '[data-testid="improvement-activity-title-bar"]', (m) => m.length === 0, 30_000);
    const headerGone = (await probe(d, '[data-testid="improvement-activity-run-header"]')).length === 0;
    check('both indicators go when the pass ends (REQ-LIBRARY-125/126)', gone && headerGone, `title bar ${gone ? 'gone' : 'still there'}, run header ${headerGone ? 'gone' : 'still there'}`);

    await openProposals(d);
    const rowsAppeared = await until(d, '.library-proposals__proposals tbody tr', (m) => m.some((r) => /Name the build gate/.test(r.text)), 30_000);
    const summaries = (await probe(d, '.library-proposals__proposals tbody tr')).map((r) => r.text);
    check('the proposals reach the Library’s Proposals tab', rowsAppeared, `rows: ${JSON.stringify(summaries).slice(0, 300)}`);
    const libraryTags = await d.eval(TAG_TONES);
    check('every design Tag on the Proposals tab carries its foundation and one tone the loaded stylesheet defines (A40)', tagsWellFormed(libraryTags), tagsDetail(libraryTags));
    // The artifact row, selected, so the detail card names what a retrospective belongs to instead of a blank.
    await d.click('.library-proposals__artifacts tbody tr', { timeoutMs: 15_000 });
    const source = await one(d, '[data-testid="library-proposal-source"]');
    check('the artifact detail names the workspace history rather than an empty session cell',
      source !== null && /history/i.test(source.text) && /session/i.test(source.text),
      source === null ? 'the detail card carries no source cell' : `"${source.text}"`);
    await d.screenshot(join(output, 'library-proposals.png'));

    // ── The second surface: the Overview's proposals card carries the same proposals and the same gesture.
    await d.click('.nav-item', { text: 'Overview', timeoutMs: 15_000 });
    const onCard = await until(d, '.ov-proposal', (m) => m.some((r) => /Name the build gate/.test(r.text)), 20_000);
    const gesture = await one(d, '[data-testid="overview-retrospective"]');
    check('the proposals reach the Overview card, which carries the gesture too', onCard && gesture !== null, `${(await probe(d, '.ov-proposal')).length} row(s) on the card, gesture ${gesture === null ? 'absent' : `"${gesture.text}"`}`);
    const overviewTags = await d.eval(TAG_TONES);
    check('every design Tag on the Overview carries its foundation and one tone the loaded stylesheet defines (A40)', tagsWellFormed(overviewTags), tagsDetail(overviewTags));
    await d.screenshot(join(output, 'overview-card.png'));

    // ── Review still works on a retrospective proposal: it is an ordinary proposal (ADR-0065 decision 2).
    await openProposals(d);
    await d.click('.library-proposals__proposals tbody tr', { timeoutMs: 15_000 });
    await sleep(300);
    await d.click('.library-proposals__actions button', { text: 'Approve', timeoutMs: 15_000 });
    await d.waitFor('.proposal-dialog', { timeoutMs: 15_000 });
    await d.click('.proposal-dialog .btn-primary', { text: 'Yes', timeoutMs: 15_000 });
    const approved = await until(d, '.library-proposals__proposals tbody tr', (m) => m.some((r) => /approved/i.test(r.text)), 20_000);
    check('a retrospective proposal can be approved by the machinery that already existed', approved, approved ? 'the row reads approved' : (await probe(d, '.library-proposals__proposals tbody tr')).map((r) => r.text).join(' | '));
    await d.screenshot(join(output, 'approved.png'));
  } finally {
    await d.quit().catch(() => undefined);
    d.close();
    try { if (started.child.pid) process.kill(started.child.pid); } catch { /* already gone after the quit */ }
    await sleep(1_500);
    const log = existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '';
    writeFileSync(join(output, 'pass.log'), log);
    launches.push({ name: 'pass', log: 'pass.log' });
  }
})();

// ── 3. What the store actually holds, read after the process that owned it has gone.
{
  const stored = artifactsIn(passRoot);
  check('exactly one artifact was stored by the pass', stored.length === 1, `${stored.length} artifact(s): ${stored.map((a) => a.artifact_id).join(', ')}`);
  const row = stored[0];
  if (row) {
    check('the row is marked as the retrospective pass and belongs to no session (ADR-0065 decision 2)',
      row.source_kind === 'retrospective' && row.source_session_id === null,
      `source_kind=${row.source_kind}, source_session_id=${JSON.stringify(row.source_session_id)}, source_run_type=${row.source_run_type}`);
    const considered = row.artifact.considered_session_ids ?? [];
    check('considered_session_ids names every session the capture read',
      planted.every((id) => considered.includes(id)) && considered.length === planted.length,
      `considered ${JSON.stringify(considered)} against planted ${JSON.stringify(planted)}`);
    const evidence = row.artifact.proposals.flatMap((proposal) => proposal.evidence.map((entry) => entry.source_session_id));
    check('evidence citing a session the pass read keeps its attribution, and evidence citing one it never read is refused (PD-LIBRARY-002)',
      evidence.some((id) => planted.includes(id)) && evidence.some((id) => id === null) && !evidence.includes('session-never-read'),
      `evidence attributions: ${JSON.stringify(evidence)}`);
    const approvedCount = row.artifact.proposals.filter((proposal) => proposal.status === 'approved').length;
    check('the approval was written through to the stored artifact', approvedCount === 1, `${approvedCount} approved proposal(s) of ${row.artifact.proposals.length}`);
  }
}

// ── 4. No resolvable model: one notice per gesture, its action opening Settings, and nothing written.
{
  const workspace = workspaceAt('no-model', { medium: 'a-model-this-workspace-does-not-have' });
  await launch('no-model', workspace, {}, async (d, root) => {
    await openProposals(d);
    await d.click('[data-testid="library-retrospective"]', { timeoutMs: 15_000 });
    const firstNotice = await noticeMatching(d, /needs a model/, 30_000);
    check('a workspace with no resolvable retrospective model answers the gesture with an informational notice (REQ-LIBRARY-037)',
      firstNotice !== null && firstNotice.data['data-severity'] === 'info',
      firstNotice === null ? 'no notice named the missing model' : `severity=${firstNotice.data['data-severity']} id=${firstNotice.data['data-notice-id']} — "${firstNotice.text.slice(0, 80)}"`);
    const firstId = Number(firstNotice?.data['data-notice-id'] ?? -1);
    const settings = await one(d, '.notice__action');
    check('the notice carries the action that opens the slot that would resolve it',
      settings !== null && settings.data['data-action'] === 'open-settings',
      settings === null ? 'no action on the notice' : `${settings.data['data-action']} — "${settings.text}"`);
    await d.screenshot(join(output, 'no-model-notice.png'));

    // The SECOND gesture: a new notice, not a suppressed repeat. A keyed notice would leave the id unmoved.
    await d.click('[data-testid="library-retrospective"]', { timeoutMs: 15_000 });
    const second = await until(d, '[data-testid="notice"]', (m) => m.some((n) => Number(n.data['data-notice-id']) > firstId && /needs a model/.test(n.text)), 30_000);
    const secondNotice = (await probe(d, '[data-testid="notice"]')).find((n) => /needs a model/.test(n.text)) ?? null;
    const secondId = Number(secondNotice?.data['data-notice-id'] ?? -1);
    check('every gesture is answered — the second raises its own notice rather than being suppressed', second && secondId === firstId + 1, `first notice #${firstId}, second #${secondId}`);

    // The action reaches Settings at the category holding the slot (REQ-SHELL-115's vocabulary).
    await d.click('.notice__action', { timeoutMs: 15_000 });
    const opened = await until(d, '.app-shell', (m) => m.some((shell) => shell.data['data-view'] === 'settings'), 15_000);
    const body = await one(d, '.settings__body');
    check('the notice action opens Settings at Models', opened && body !== null && /model/i.test(body.data['aria-label'] ?? ''), `view=${((await probe(d, '.app-shell'))[0] ?? { data: {} }).data['data-view']}, category="${body?.data['aria-label'] ?? 'none'}"`);
    await d.screenshot(join(output, 'no-model-settings.png'));
    return root;
  });
  const stored = artifactsIn(join(output, 'no-model', 'app'));
  check('a refused gesture writes no artifact', stored.length === 0, `${stored.length} artifact(s) in the store`);
}

// ── 5. A provider that never answers: the empty artifact inside the bound, and an application still usable.
{
  const workspace = workspaceAt('timeout', { timeout: 5 });
  await launch('timeout', workspace, { ROTARIS_IMPROVEMENT_SCRIPT: 'timeout' }, async (d, root) => {
    await openProposals(d);
    const started = Date.now();
    await d.click('[data-testid="library-retrospective"]', { timeoutMs: 15_000 });
    await d.waitFor('[data-testid="improvement-activity-title-bar"]', { timeoutMs: 30_000 });
    const ended = await until(d, '[data-testid="improvement-activity-title-bar"]', (m) => m.length === 0, 60_000);
    const elapsed = Math.round((Date.now() - started) / 1000);
    check('a provider that never answers ends the pass inside its own bound, and the indicators go with it',
      ended && elapsed <= 40, `the indicator was gone after ${elapsed} s against a 5 s bound`);
    const notice = await noticeMatching(d, /found nothing to propose/, 20_000);
    check('the timeout takes the zero-proposal outcome, said in an informational notice (REQ-LIBRARY-124)',
      notice !== null && notice.data['data-severity'] === 'info',
      notice === null ? (await probe(d, '[data-testid="notice-title"]')).map((n) => n.text).join(' | ') : `severity=${notice.data['data-severity']} — "${notice.text.slice(0, 80)}"`);

    // REQ-LIBRARY-130: the application stays usable throughout — the composer still takes what is typed into it.
    await d.click('.nav-item', { text: 'Workspace', timeoutMs: 15_000 });
    await d.click('.composer__input', { timeoutMs: 15_000 });
    await d.type('the composer still accepts input');
    await sleep(400);
    const composer = await one(d, '.composer__input');
    check('the application stayed usable while the pass ran and after it ended', composer !== null && composer.value === 'the composer still accepts input', `the composer holds ${JSON.stringify(composer?.value ?? null)}`);
    await d.screenshot(join(output, 'timeout.png'));
    return root;
  });
  const stored = artifactsIn(join(output, 'timeout', 'app'));
  const artifact = stored[0]?.artifact;
  check('the timed-out pass stored the empty artifact and said why (REQ-LIBRARY-016/023)',
    stored.length === 1 && artifact?.proposals.length === 0 && /collector timed out after 5 seconds/.test(artifact?.notes ?? ''),
    stored.length === 0 ? 'nothing was stored' : `${artifact?.proposals.length} proposal(s), notes ${JSON.stringify(artifact?.notes ?? null)}`);
}

// ── 6. Shutdown during a pass: nothing written, nothing announced (REQ-LIBRARY-127).
{
  const workspace = workspaceAt('shutdown');
  await launch('shutdown', workspace, { ROTARIS_IMPROVEMENT_SCRIPT: 'wait:60000' }, async (d, root) => {
    await openProposals(d);
    await d.click('[data-testid="library-retrospective"]', { timeoutMs: 15_000 });
    await d.waitFor('[data-testid="improvement-activity-title-bar"]', { timeoutMs: 30_000 });
    await d.screenshot(join(output, 'shutdown.png'));
    return root; // the finally block quits the application with the pass still running
  });
  const root = join(output, 'shutdown', 'app');
  const stored = artifactsIn(root);
  const log = readFileSync(join(output, 'shutdown.log'), 'utf8');
  // The assertion is only worth anything if the pass really WAS running: both halves are in the log.
  check('the pass was running when the application was closed',
    /retrospective .* queued over/.test(log) && /scripted improvement analyst: wait:60000/.test(log),
    log.split('\n').filter((line) => /retrospective|improvement analyst/.test(line)).slice(0, 3).join(' | ') || 'no retrospective line in the log');
  check('a pass cancelled by shutdown leaves no artifact behind (REQ-LIBRARY-127)', stored.length === 0, `${stored.length} artifact(s) in the store`);
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures, launches }, null, 2)}\n`);
console.log(`\n${results.filter((r) => r.verdict === 'PASS').length} passed, ${failures} failed — evidence in ${output}`);
process.exit(failures === 0 ? 0 : 1);
