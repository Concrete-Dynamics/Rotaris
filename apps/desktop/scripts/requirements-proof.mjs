/**
 * The requirements proof — Part AK (ADR-0041's first execution; the delivery store) extended by Part AK′ (its second
 * execution; the board). Renamed from `delivery-proof.mjs` on 2026-09-09, as the plan reserved.
 *
 * Stage 1 (vitest) is Part AK's, unchanged: the delivery suites run under the JSON reporter and the NINE proof
 * assertions are read back by their `it` titles from `packages/workspace/src/delivery/proof.test.ts`; every other
 * delivery suite must be green, and the board's own model suite (`packages/ui/src/requirements/requirements.test.ts`)
 * rides with them.
 *
 * Stage 2 (Electron) is Part AK′'s: the built application launched over COPIES of the fixture store (never the
 * fixture itself) and over a generated 1,500-requirement store, driven through the capture harness — real clicks,
 * real chords, a `<select>` chosen, DOM drag events with a `DataTransfer` — and read back through probes:
 *
 *   board     — Ctrl+4 at 1264 px shows the board; putting it on screen costs the interface thread < 100 ms
 *               (REQ-TRACE-239: the view's own measure from the projection's arrival to the laid-out DOM, and the
 *               longest long task the renderer observed meanwhile); every requirement is in exactly one column and
 *               the counts sum to the total (REQ-TRACE-235); the one primary control is 32 high and the rest 24, and
 *               every header control lies wholly inside the window (REQ-TRACE-489/491).
 *   minimum   — at REQ-SHELL-022's 1000 × 680: every open column is between 276 and 340 wide and the columns area
 *               reports a positive horizontal scroll range (REQ-TRACE-237/238); the budget holds there too.
 *   fold      — clicking a heading folds the column to a rail that takes the focus (REQ-TRACE-307/320); the fold
 *               is still there on a RELAUNCH of the same workspace, and a second workspace opened against the same
 *               preference root does not have it (REQ-TRACE-312/321).
 *   filter    — an epic filter survives a switch of the grouping axis and the summary still states it (REQ-TRACE-299).
 *   chord     — a card selected, Ctrl+M places focus on the move control, which names the first reachable target
 *               with the consequence in the sentence and its accessible description equal to it (REQ-TRACE-390/391).
 *   drop      — a requirement deprecated in the profile's copy, dropped on Ready: the engine refuses, the card is back where it was and
 *               the engine's own words are on the card (REQ-TRACE-397/398). The drag is DOM drag events carrying a
 *               `DataTransfer` through the board's own handlers — the operating system's drag loop cannot be driven
 *               by injected input, so what is proved is the payload, the private type and the refusal path, not the
 *               pointer.
 *   scale     — the generated store grouped by epic: 100 populated columns PRESENT, each at least 276 wide, the row
 *               a hundred minimum-width columns long and the area scrollable to its end, while only the columns the
 *               viewport exposes are BUILT (REQ-TRACE-300 with REQ-TRACE-239, defect AK2-3); the delivery-axis column
 *               of 1,500 members realises fewer than a quarter of them and stays bounded across a ten-step scroll
 *               that reaches the last card (REQ-TRACE-365); the board's paint figure on that store (REQ-TRACE-239's
 *               "does not grow"); the axis switch itself within the budget; the post-debounce filter recomputation
 *               within REQ-TRACE-367's 100 ms.
 *
 * Evidence under `.requirements-proof/`: `vitest.json`, one PNG and one log per launch, `results.json`.
 * `--skip-build` skips the desktop build.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = join(repo, '.requirements-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
const RM = { recursive: true, force: true, maxRetries: 10, retryDelay: 200 };
rmSync(output, RM);
mkdirSync(output, { recursive: true });
const fixture = join(app, 'scripts', 'fixtures', 'requirements-store');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

// ── Stage 1: Part AK's nine assertions, under vitest ───────────────────────────────────────────────
const SUITES = [
  'packages/store/src/delivery/delivery.test.ts',
  'packages/workspace/src/delivery/transition.test.ts',
  'packages/workspace/src/delivery/projection.test.ts',
  'packages/workspace/src/delivery/gate.test.ts',
  'packages/workspace/src/delivery/guard.test.ts',
  'packages/workspace/src/delivery/proof.test.ts',
  'packages/ui-core/src/requirements/display.test.ts',
  'apps/desktop/src/workspace-service/delivery.test.ts',
  'apps/desktop/src/main/requirements.test.ts',
  // Part AK′: the board's pure model rides with the delivery suites.
  'packages/ui/src/requirements/requirements.test.ts',
];
/** The plan's nine assertions, verbatim as `it` titles in proof.test.ts. */
const ASSERTIONS = {
  everyCardInBacklog: 'fixture store + empty delivery: every card in backlog',
  releaseWritesOneHistoryOneAudit: 'release moves to ready and writes exactly one history + one audit row in one transaction',
  secondActionRefusedWritesNothing: 'a second action on the same requirement while one is in flight is refused with the stated reason and writes nothing',
  holdResumeRoundTrips: 'hold/resume round-trips to the origin column',
  acceptRefusedOnHashMismatch: 'accept refused when the canonical hash differs from the snapshot',
  readerOffersNoWrite: 'a reader handle offers no write method (structural test over the module graph)',
  projectionIdenticalPerGeneration: 'projection value identical across two reads of one generation',
  reapReportsInterrupted: 'reap after a simulated dead run host reports "interrupted, work retained"',
  refusalEnumeratesWithoutRecursing: 'a refused move carries the engine\'s words and what the source column can reach, without recursing (defect 46)',
};

const jsonPath = join(output, 'vitest.json');
const args = ['exec', 'vitest', 'run', ...SUITES, '--reporter=json', `--outputFile=${jsonPath}`];
const started = Date.now();
const test = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
  : spawnSync('pnpm', args, { cwd: repo, encoding: 'utf8', timeout: 300_000 });
const elapsedMs = Date.now() - started;
writeFileSync(join(output, 'tests.log'), `${test.stdout ?? ''}\n${test.stderr ?? ''}`);

let report;
try { report = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch (e) { console.error(`no vitest report at ${jsonPath}: ${e}`); process.exit(1); }
const titles = new Map();
for (const file of report.testResults ?? []) for (const t of file.assertionResults ?? []) titles.set(t.title, t.status);

const results = { elapsedMs, suites: report.numTotalTestSuites, tests: report.numTotalTests, passedTests: report.numPassedTests, failedTests: report.numFailedTests };
for (const [key, title] of Object.entries(ASSERTIONS)) results[key] = titles.get(title) === 'passed';
results.allSuitesGreen = test.status === 0 && report.numFailedTests === 0 && report.numFailedTestSuites === 0;
const stageOne = results.allSuitesGreen && Object.keys(ASSERTIONS).every((k) => results[k]);
// Ruled 2026-09-09: the proof prints each of its nine titles with its verdict, so a red names the assertion, not the run.
for (const [key, title] of Object.entries(ASSERTIONS)) console.log(`  ${results[key] ? 'PASS' : 'FAIL'}  ${title}${titles.has(title) ? '' : '  (title not found in the report)'}`);
console.log(`  ${results.allSuitesGreen ? 'PASS' : 'FAIL'}  every delivery suite green (${results.passedTests}/${results.tests} tests, ${results.failedTests} failed, ${report.numFailedTestSuites} suite(s) failed)`);
if (!stageOne) {
  results.passed = false;
  writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}

// ── Stage 2: the board, in the built application ───────────────────────────────────────────────────
if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  expect(built.status === 0, `desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
expect(existsSync(electron), `Electron executable is absent: ${electron}`);

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  return env;
}
const PROBES = [
  '.app-shell', '[data-testid="requirements"]', '[data-testid="req-total"]', '[data-testid="req-column"]', '[data-testid="req-rail"]', '[data-testid="req-card"]', '[data-testid="req-epic"]',
  '[data-testid="req-filter-summary"]', '[data-testid="req-feedback"]', '[data-testid="req-move-control"]', '[data-testid="req-error"]', '[data-testid="req-empty-source"]', '[data-testid="req-blocked"]',
];
function launch(name, workspace, local, preferences, extra, timeoutMs = 180_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  const at = {};
  const inspects = {};
  const evals = {};
  for (const line of log.split('\n')) {
    let m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } continue; }
    m = /capture: probe-at (\d+) (.+?) → (.*)\s*$/.exec(line);
    if (m) { try { at[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { at[`${m[2]}@${m[1]}`] = []; } continue; }
    m = /capture: inspect-at (\d+) (.+?) → (.*)\s*$/.exec(line);
    if (m) { try { inspects[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { /* left absent */ } continue; }
    m = /capture: eval-at (\d+) (.+?) → (.*)\s*$/.exec(line);
    if (m) { try { evals[m[1]] = JSON.parse(m[3]); } catch { evals[m[1]] = m[3]; } }
  }
  return { png, log, probes, at, inspects, evals };
}
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;
const boardData = (probes) => first(probes, '[data-testid="requirements"]')?.data ?? null;
const columnsOf = (list) => (list ?? []).map((c) => ({ key: c.data['data-column'], count: Number(c.data['data-count']), realised: Number(c.data['data-realised']) }));
const cardsOf = (list) => (list ?? []).map((c) => ({ id: c.data['data-req-card'], column: c.data['data-column'] }));

/** One scratch profile over a copy of the fixture store: a Git repository with a scripted model configured, its own store and its own preference root (unless shared). */
function profile(name, preferencesRoot) {
  const root = join(output, 'profiles', name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const preferences = preferencesRoot ?? join(root, 'preferences');
  cpSync(fixture, workspace, { recursive: true });
  mkdirSync(local, { recursive: true });
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), ['# scratch configuration written by the proof script', 'models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', ''].join('\n'));
  const git = (...a) => execFileSync('git', a, { cwd: workspace, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' } });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  return { workspace, local, preferences };
}

/**
 * A generated store of 100 epics × 14 children = 1,500 requirements, shaped as spike 7's generator shapes one
 * (`packages/workspace/src/traceability/scale-fixture.ts`: an epic's number is a multiple of 100, its children live
 * in its stem directory and take it as their epic by the parser's index-document rule) but documents only, with
 * a two-file source tree so the sweep has something to read. Deterministic.
 */
function generatedProfile(name) {
  const root = join(output, 'profiles', name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const preferences = join(root, 'preferences');
  const store = join(workspace, 'docs', 'requirements');
  mkdirSync(store, { recursive: true });
  mkdirSync(local, { recursive: true });
  const doc = (n, epic) => ['---', `req-id: REQ-${n}`, `status: ${epic ? 'approved' : n % 50 === 0 ? 'deprecated' : n % 10 === 0 ? 'draft' : 'approved'}`, ...(epic ? ['trace: optional', 'test: optional'] : []), `title: Requirement ${n} ${epic ? 'epic' : 'behaviour'}`, `priority: P${(n % 3) + 1}`, '---', '', `# REQ-${n} - Requirement ${n}`, '', `The engine shall report requirement ${n} once and never twice, so a reader sees one state of it within an invocation.`, ''].join('\n');
  writeFileSync(join(store, 'README.md'), '# Requirements\n\nGenerated by requirements-proof; this file carries no frontmatter.\n');
  let requirements = 0;
  for (let b = 1; b <= 100; b += 1) {
    const epic = b * 100;
    const stem = `REQ-${epic}-epic-${b}`;
    writeFileSync(join(store, `${stem}.md`), doc(epic, true));
    mkdirSync(join(store, stem), { recursive: true });
    requirements += 1;
    for (let c = 1; c <= 14; c += 1) { writeFileSync(join(store, stem, `REQ-${epic + c}-requirement-${epic + c}.md`), doc(epic + c, false)); requirements += 1; }
  }
  mkdirSync(join(workspace, 'src'), { recursive: true });
  mkdirSync(join(workspace, 'tests'), { recursive: true });
  writeFileSync(join(workspace, 'src', 'module.ts'), '// generated by requirements-proof\nexport function site(): number { return 1; }\n');
  writeFileSync(join(workspace, 'tests', 'module.ts'), '// generated by requirements-proof\nexport function testSite(): void { }\n');
  writeFileSync(join(workspace, 'rotaris-traceability.json'), `${JSON.stringify({ layout: { requirements_dir: 'docs/requirements', id_prefix: 'REQ', generated_path: 'src/requirement_ids.ts', impl_roots: ['src'], test_roots: ['tests'] } }, null, 2)}\n`);
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), ['models:', '  scripted: { provider: scripted, model_id: scripted }', 'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', ''].join('\n'));
  const git = (...a) => execFileSync('git', a, { cwd: workspace, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' } });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  return { workspace, local, preferences, requirements };
}

/**
 * A long-task observer armed in the renderer before the view is shown; read back as the longest task in the window
 * that began at the LAST arming.
 *
 * Defect `AK2-5`, found by this proof's own evidence. The first version cleared the array and registered a fresh
 * observer with `buffered: true` on every arming — and `buffered` replays the entries recorded before the observer
 * existed, so a re-armed window reported the longest task since start-up rather than the longest in the window. Every
 * figure past the first was therefore `max(what this window cost, what every earlier window cost)`: the axis switch
 * was reading the board's arrival back as its own, and a 102 ms arrival made a 92 ms switch print 102. The observer
 * is registered ONCE with `buffered: true` (so the first window still sees what happened before it was created),
 * every entry keeps its start time, and a read takes only the entries that began at or after the arming. The 150 to
 * 180 ms breaches recorded before this fix stand: arrival never cost more than 71 ms, so nothing at that scale can
 * be explained by the replay.
 */
const ARM_LONGTASKS = `(() => { window.__rotarisArmedAt = performance.now(); if (window.__rotarisObserver) return true; window.__rotarisLongTasks = []; try { window.__rotarisObserver = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__rotarisLongTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); }); window.__rotarisObserver.observe({ type: 'longtask', buffered: true }); } catch (e) { return String(e); } return true; })()`;
const READ_LONGTASKS = `(() => { const since = window.__rotarisArmedAt ?? 0; const tasks = (window.__rotarisLongTasks ?? []).filter((t) => t.at >= since).map((t) => t.ms); const b = window.__rotarisBoard; return { longest: Math.max(0, ...tasks), count: tasks.length, tasks, board: b ? { paintMs: b.paintMs, ready: b.ready, pending: b.pending, realised: b.realised, cards: b.cards, columns: b.columns } : null }; })()`;
const BUDGET_MS = 100;
const stage2 = {};

// ── board: the fixture at 1264 px, the budget, the partition, the header ─────────────────────────
const boardProfile = profile('board');
const board = launch('board', boardProfile.workspace, boardProfile.local, boardProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_EVAL_AT: [`${ARM_LONGTASKS}@900`, `${READ_LONGTASKS}@4600`].join(';;'),
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_INSPECT_AT: '.req-header .btn, .req-header .select, .req-header input@4400;;[data-testid="req-columns"]@4400',
  ROTARIS_CAPTURE_AFTER_MS: '5200',
});
expect(first(board.probes, '.app-shell')?.data?.['data-view'] === 'requirements', `Ctrl+4 did not show the Requirements view (view ${first(board.probes, '.app-shell')?.data?.['data-view'] ?? 'none'})`);
const boardState = boardData(board.probes);
expect(boardState !== null && boardState['data-ready'] === 'true', 'the board never reported itself ready');
const paintMs = Number(boardState['data-paint-ms']);
expect(Number.isFinite(paintMs) && paintMs >= 0, `the board carries no paint figure (${boardState['data-paint-ms']})`);
expect(paintMs < BUDGET_MS, `REQ-TRACE-239: putting the fixture board on screen cost ${paintMs} ms on the interface thread, over the ${BUDGET_MS} ms budget`);
const longTasks = board.evals['4600'];
expect(longTasks && typeof longTasks === 'object' && 'longest' in longTasks, `the long-task observer answered ${JSON.stringify(longTasks)}`);
expect(longTasks.longest < BUDGET_MS, `REQ-TRACE-239: the renderer saw a ${longTasks.longest} ms long task while the board was put on screen`);
const columns = columnsOf(board.probes['[data-testid="req-column"]']);
const rails = board.probes['[data-testid="req-rail"]'] ?? [];
expect(columns.map((c) => c.key).join(',') === 'backlog,ready,running,review,needs-update,done,blocked', `the delivery columns are ${columns.map((c) => c.key).join(',')}, not REQ-TRACE-232's order with the blocked column`);
expect(rails.length === 0, `REQ-TRACE-304 rule 3: nothing has left the backlog, so no column should be folded, yet ${rails.length} rail(s) are on screen`);
const total = Number(first(board.probes, '[data-testid="req-total"]')?.text);
const allCards = [...cardsOf(board.probes['[data-testid="req-card"]']), ...cardsOf(board.probes['[data-testid="req-epic"]'])];
expect(total === 11, `the fixture store holds 11 requirements; the board shows ${total}`);
expect(columns.reduce((n, c) => n + c.count, 0) === total, `REQ-TRACE-235: the column counts sum to ${columns.reduce((n, c) => n + c.count, 0)}, not the ${total} on screen`);
// REQ-TRACE-358: only the visible band is realised, so the partition is read off the model — the counts, and the
// observable's realised + pending — while every realised widget must sit in a listed column under a unique id.
expect(new Set(allCards.map((c) => c.id)).size === allCards.length && allCards.length <= total, `REQ-TRACE-235: ${allCards.length} card widgets for ${total} requirements (${allCards.map((c) => c.id).join(', ')})`);
for (const c of allCards) expect(columns.some((col) => col.key === c.column), `${c.id} sits in a column the board does not list (${c.column})`);
expect(longTasks.board && longTasks.board.cards === total && longTasks.board.realised + longTasks.board.pending === total && longTasks.board.realised === allCards.length, `REQ-TRACE-366: the observable reports ${JSON.stringify(longTasks.board)} against ${allCards.length} widgets and ${total} requirements`);
const header = board.inspects['.req-header .btn, .req-header .select, .req-header input@4400'];
expect(header && header.matches.length > 5, 'the header controls could not be inspected');
const primary = header.matches.filter((m) => m.attrs['data-testid'] === 'req-reevaluate');
expect(primary.length === 1 && Math.round(primary[0].rect.height) === 32, `REQ-TRACE-491: the primary control is ${primary[0]?.rect.height ?? 'absent'} high, not 32`);
const others = header.matches.filter((m) => m.attrs['data-testid'] !== 'req-reevaluate' && m.attrs['data-testid'] !== 'req-move-control' && m.attrs['type'] !== 'checkbox');
for (const m of others) expect(Math.round(m.rect.height) === 24, `REQ-TRACE-491: header control ${m.attrs['data-testid'] ?? m.attrs['aria-label'] ?? m.text} is ${m.rect.height} high, not 24`);
for (const m of header.matches) expect(m.rect.x >= 0 && m.rect.x + m.rect.width <= header.viewport.width + 0.5, `REQ-TRACE-489: header control ${m.attrs['data-testid'] ?? m.attrs['aria-label'] ?? m.text} lies outside the window (${JSON.stringify(m.rect)} in ${header.viewport.width})`);
stage2.board = { view: 'requirements', paintMs, longestTaskMs: longTasks.longest, longTasks: longTasks.count, total, columns, widgets: allCards.length, observable: longTasks.board, primaryHeight: primary[0].rect.height, otherControls: others.length, viewport: header.viewport };

// ── minimum: REQ-SHELL-022's 1000 × 680 — column bounds and the horizontal scroll range ──────────
const minimum = launch('minimum', boardProfile.workspace, boardProfile.local, boardProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1000x680@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-column"]@4200;;.req-header .btn, .req-header .select, .req-header input@4200',
  ROTARIS_CAPTURE_EVAL_AT: `(() => { const el = document.querySelector('[data-testid="req-columns"]'); return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, range: el.scrollWidth - el.clientWidth } : null; })()@4300`,
  ROTARIS_CAPTURE_AFTER_MS: '4800',
});
const minColumns = minimum.inspects['[data-testid="req-column"]@4200'];
expect(minColumns && minColumns.matches.length === 7, `at 1000 × 680 the board shows ${minColumns?.matches.length ?? 0} open columns, not 7`);
expect(minColumns.viewport.width <= 1000, `the window was not resized to the minimum (viewport ${minColumns.viewport.width})`);
for (const m of minColumns.matches) expect(m.rect.width >= 276 && m.rect.width <= 340, `REQ-TRACE-238: column ${m.attrs['data-column']} is ${m.rect.width} wide at the minimum window`);
const range = minimum.evals['4300'];
expect(range && range.range > 0, `REQ-TRACE-238: the columns area reports no positive horizontal scroll range (${JSON.stringify(range)})`);
const minState = boardData(minimum.probes);
const minPaint = Number(minState?.['data-paint-ms']);
expect(minPaint < BUDGET_MS, `REQ-TRACE-239 at the minimum window: ${minPaint} ms`);
const minHeader = minimum.inspects['.req-header .btn, .req-header .select, .req-header input@4200'];
for (const m of minHeader.matches) expect(m.rect.x >= 0 && m.rect.x + m.rect.width <= minHeader.viewport.width + 0.5, `REQ-TRACE-489 at the minimum window: header control ${m.attrs['data-testid'] ?? m.attrs['aria-label'] ?? m.text} lies outside (${JSON.stringify(m.rect)})`);
stage2.minimum = { viewport: minColumns.viewport, columnWidths: minColumns.matches.map((m) => Math.round(m.rect.width)), scroll: range, paintMs: minPaint };

// ── fold: heading → rail with the focus; persists across a relaunch; not across workspaces ────────
// Defect AK2-3: Done is the sixth of seven columns and at this window width it lies outside the columns area's own
// viewport, so it is a placeholder and holds no heading — a control that is not on screen cannot be clicked, by a
// person or by this proof. The proof scrolls to it first, exactly as a person would, and that is the other half of
// REQ-TRACE-300 proved: a column that was not built becomes fully operable — heading, count, fold, accessible name —
// in the update that brings it into view, so nothing was truncated, hidden or refused, only deferred.
const SCROLL_TO_DONE = `(() => { const el = document.querySelector('[data-testid="req-columns"] > [data-column="done"]'); if (!el) return 'absent'; const offscreen = el.getAttribute('data-offscreen') === 'true'; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return { offscreen }; })()`;
const folded = launch('fold', boardProfile.workspace, boardProfile.local, boardProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_EVAL_AT: `${SCROLL_TO_DONE}@3200`,
  ROTARIS_CAPTURE_CLICKS: '[data-testid="req-column"][data-column="done"] [data-testid="req-heading"]@3600',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-rail"]@4400',
  ROTARIS_CAPTURE_AFTER_MS: '5000',
});
const doneColumn = folded.evals['3200'];
expect(doneColumn !== undefined && doneColumn !== 'absent', `REQ-TRACE-300: the Done column is not among the columns area's children (${JSON.stringify(doneColumn)})`);
const railInspect = folded.inspects['[data-testid="req-rail"]@4400'];
expect(railInspect && railInspect.matches.length === 1 && railInspect.matches[0].attrs['data-column'] === 'done', `clicking the Done heading left ${railInspect?.matches.length ?? 0} rail(s) (${JSON.stringify(railInspect?.matches.map((m) => m.attrs['data-column']))})`);
expect(railInspect.active?.testId === 'req-rail', `REQ-TRACE-320: after folding, the focus is on ${JSON.stringify(railInspect.active)}, not the rail`);
expect(railInspect.matches[0].attrs['aria-label'] === 'Unfold Done · 0', `the rail's accessible name is ${JSON.stringify(railInspect.matches[0].attrs['aria-label'])}`);
const relaunched = launch('fold-relaunch', boardProfile.workspace, boardProfile.local, boardProfile.preferences, { ROTARIS_CAPTURE_VIEWS: '4@1200', ROTARIS_CAPTURE_AFTER_MS: '4600' });
const relaunchRails = (relaunched.probes['[data-testid="req-rail"]'] ?? []).map((r) => r.data['data-column']);
expect(relaunchRails.join(',') === 'done', `REQ-TRACE-321: after the relaunch the folded columns are ${JSON.stringify(relaunchRails)}, not the Done column alone`);
const otherProfile = profile('other', boardProfile.preferences);
const other = launch('fold-other-workspace', otherProfile.workspace, otherProfile.local, otherProfile.preferences, { ROTARIS_CAPTURE_VIEWS: '4@1200', ROTARIS_CAPTURE_AFTER_MS: '4600' });
const otherRails = (other.probes['[data-testid="req-rail"]'] ?? []).map((r) => r.data['data-column']);
expect(otherRails.length === 0, `REQ-TRACE-312: a fold made in one workspace reached another (${JSON.stringify(otherRails)})`);
stage2.fold = { folded: 'done', offscreenBeforeScroll: doneColumn.offscreen, focusAfterFold: railInspect.active?.testId, railName: railInspect.matches[0].attrs['aria-label'], afterRelaunch: relaunchRails, otherWorkspace: otherRails };

// ── filter: an epic filter survives the axis switch (REQ-TRACE-299) ───────────────────────────────
const filterProfile = profile('filter');
const filtered = launch('filter', filterProfile.workspace, filterProfile.local, filterProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="req-filter-toggle"]@3400',
  ROTARIS_CAPTURE_SELECT: '[data-testid="req-filter-epic"]>>REQ-100@3900;;[data-testid="req-axis"]>>epic@4700',
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="req-filter-summary"]@4400;;[data-testid="req-column"]@4400;;[data-testid="req-total"]@4400',
  ROTARIS_CAPTURE_AFTER_MS: '5400',
});
const summaryBefore = filtered.at['[data-testid="req-filter-summary"]@4400']?.[0]?.text;
expect(summaryBefore === 'Filtered by epic REQ-100.', `the filter summary read ${JSON.stringify(summaryBefore)} after choosing the epic`);
const beforeColumns = columnsOf(filtered.at['[data-testid="req-column"]@4400']);
expect(beforeColumns.reduce((n, c) => n + c.count, 0) === 7, `the epic filter left ${beforeColumns.reduce((n, c) => n + c.count, 0)} cards, not the epic and its six children`);
const summaryAfter = first(filtered.probes, '[data-testid="req-filter-summary"]')?.text;
expect(summaryAfter === 'Filtered by epic REQ-100.', `REQ-TRACE-299: after the axis switch the summary read ${JSON.stringify(summaryAfter)}`);
const afterColumns = columnsOf(filtered.probes['[data-testid="req-column"]']);
expect(afterColumns.map((c) => c.key).join(',') === 'REQ-100' && afterColumns[0].count === 7, `REQ-TRACE-299/295: on the epic axis the columns are ${JSON.stringify(afterColumns)}, not one REQ-100 column of 7`);
expect(first(filtered.probes, '[data-testid="req-total"]')?.text === '7 / 11', `the total read ${JSON.stringify(first(filtered.probes, '[data-testid="req-total"]')?.text)}`);
stage2.filter = { summaryBefore, cardsBefore: 7, summaryAfter, columnsAfter: afterColumns, total: '7 / 11' };

// ── chord: Ctrl+M focuses the move control, which names the first reachable target with the consequence ──
const chordProfile = profile('chord');
const chord = launch('chord', chordProfile.workspace, chordProfile.local, chordProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: '[data-req-card="REQ-101"]@3400',
  ROTARIS_CAPTURE_CHORDS: 'Ctrl+M@4600',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-move-control"]@5200',
  ROTARIS_CAPTURE_AFTER_MS: '5800',
});
const move = chord.inspects['[data-testid="req-move-control"]@5200'];
expect(move && move.matches.length === 1, 'the move control could not be inspected');
expect(move.active?.testId === 'req-move-control', `REQ-TRACE-390: after Ctrl+M the focus is on ${JSON.stringify(move.active)}, not the move control`);
const sentence = move.matches[0].text;
expect(sentence.startsWith('→Move REQ-101 from Backlog to Ready. ') || sentence.startsWith('Move REQ-101 from Backlog to Ready. '), `REQ-TRACE-391: the control reads ${JSON.stringify(sentence)}`);
expect(sentence.includes('Releasing takes a snapshot of the specification'), `REQ-TRACE-391: the consequence is not in the sentence (${JSON.stringify(sentence)})`);
expect(sentence.endsWith(move.matches[0].attrs['aria-description']), `REQ-TRACE-391: the accessible description (${JSON.stringify(move.matches[0].attrs['aria-description'])}) is not the visible text`);
stage2.chord = { focus: move.active?.testId, sentence, name: move.matches[0].attrs['aria-label'] };

// ── drop: a refused drop returns the card with the engine's words on screen (REQ-TRACE-397/398) ────
// The fixture's deprecated document, REQ-300, is an EPIC by the parser's number rule (a multiple of 100), and an epic
// card offers no delivery action and is not draggable (REQ-TRACE-284/497) — the first drop attempt proved exactly
// that. So the drop profile's COPY deprecates REQ-104 (the fixture itself is never edited) and the engine refuses
// its release in its own words. The board's REQ-TRACE-364 operation realises the card first; an unknown or empty
// id answers false and the drag is not attempted.
const DROP = `(async () => { const board = window.__rotarisBoard; if (!board || typeof board.reveal !== 'function') return 'no observable'; if (board.reveal('REQ-999') !== false || board.reveal('') !== false) return 'reveal answered true for an unknown or empty id'; const revealed = board.reveal('REQ-104'); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const card = document.querySelector('[data-req-card="REQ-104"]'); const target = document.querySelector('[data-testid="req-column"][data-column="ready"]'); if (!card || !target) return { revealed, missing: true }; const focused = document.activeElement === card; const dt = new DataTransfer(); const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const ev = (type, el) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })); ev('dragstart', card); await frame(); ev('dragenter', target); ev('dragover', target); await frame(); const dragging = document.querySelector('[data-testid="req-columns"]')?.getAttribute('data-dragging'); ev('drop', target); ev('dragend', card); return { revealed, focused, dragging, types: [...dt.types] }; })()`;
const dropProfile = profile('drop');
const deprecatedPath = join(dropProfile.workspace, 'docs', 'requirements', 'REQ-100-fixture-epic', 'REQ-104-draft.md');
writeFileSync(deprecatedPath, readFileSync(deprecatedPath, 'utf8').replace('status: draft', 'status: deprecated'));
const drop = launch('drop', dropProfile.workspace, dropProfile.local, dropProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_EVAL_AT: `${DROP}@3600`,
  ROTARIS_CAPTURE_AFTER_MS: '5400',
});
const dropped = drop.evals['3600'];
expect(dropped && dropped.revealed === true && dropped.focused === true, `REQ-TRACE-364: revealing REQ-104 answered ${JSON.stringify(dropped)}`);
expect(Array.isArray(dropped.types) && dropped.types.includes('application/x-rotaris-requirement'), `REQ-TRACE-396: the drag payload travelled as ${JSON.stringify(dropped)}`);
expect(dropped.dragging === 'true', `the board did not report a drag in progress before the drop (${JSON.stringify(dropped)})`);
const feedback = (drop.probes['[data-testid="req-feedback"]'] ?? []).map((f) => f.text);
expect(feedback.length === 1 && feedback[0].includes('REQ-104 is deprecated and cannot be released.'), `REQ-TRACE-397: the card carries ${JSON.stringify(feedback)}, not the engine's refusal`);
const reqThreeHundred = cardsOf(drop.probes['[data-testid="req-card"]']).find((c) => c.id === 'REQ-104');
expect(reqThreeHundred?.column === 'backlog', `REQ-TRACE-388: after the refused drop REQ-104 sits in ${reqThreeHundred?.column ?? 'no column'}`);
const readyAfterDrop = columnsOf(drop.probes['[data-testid="req-column"]']).find((c) => c.key === 'ready');
expect(readyAfterDrop?.count === 0, `the Ready column holds ${readyAfterDrop?.count} after a refused drop`);
stage2.drop = { revealed: dropped.revealed, transferTypes: dropped.types, feedback: feedback[0], column: reqThreeHundred.column, readyCount: readyAfterDrop.count };

// ── scale: the generated 1,500-requirement store — 100 columns on the epic axis, virtualisation, the budget ──
const scaleProfile = generatedProfile('scale');
const SCROLL = `(async () => { const list = document.querySelector('[data-testid="req-column"][data-column="backlog"] [data-testid="req-list"]'); if (!list) return 'no list'; const seen = []; for (let i = 0; i <= 10; i += 1) { list.scrollTop = ((list.scrollHeight - list.clientHeight) * i) / 10; await new Promise((r) => setTimeout(r, 80)); const ids = [...list.querySelectorAll('[data-req-card]')].map((el) => el.getAttribute('data-req-card')); seen.push({ top: Math.round(list.scrollTop), realised: ids.length, first: ids[0] ?? null, last: ids.at(-1) ?? null }); } list.scrollTop = list.scrollHeight; await new Promise((r) => setTimeout(r, 120)); const endIds = [...list.querySelectorAll('[data-req-card]')].map((el) => el.getAttribute('data-req-card')); return { seen, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, atEnd: list.scrollTop + list.clientHeight >= list.scrollHeight - 1, endLast: endIds.at(-1) ?? null, endRealised: endIds.length }; })()`;
const SCROLL_COLUMNS = `(() => { const el = document.querySelector('[data-testid="req-columns"]'); if (!el) return null; const present = el.querySelectorAll(':scope > [data-column]').length; const built = el.querySelectorAll(':scope > [data-column]:not([data-offscreen])').length; el.scrollLeft = el.scrollWidth; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollLeft: el.scrollLeft, columns: el.querySelectorAll('[data-testid="req-column"]').length, rails: el.querySelectorAll('[data-testid="req-rail"]').length, present, built, placeholders: present - built }; })()`;
const scale = launch('scale', scaleProfile.workspace, scaleProfile.local, scaleProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_EVAL_AT: [`${ARM_LONGTASKS}@900`, `${READ_LONGTASKS}@9000`, `${SCROLL}@9200`, `${ARM_LONGTASKS}@11000`, `${READ_LONGTASKS}@14500`, `${SCROLL_COLUMNS}@14600`, `${ARM_LONGTASKS}@16000`, `${READ_LONGTASKS}@19000`].join(';;'),
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="req-column"]@9000;;[data-testid="requirements"]@9000;;[data-testid="req-column"]@14400',
  ROTARIS_CAPTURE_SELECT: '[data-testid="req-axis"]>>epic@11200',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-column"]@14400',
  // REQ-TRACE-367: the search box typed into after the filter row is shown; the recomputation that follows the 150 ms pause is measured by the view.
  ROTARIS_CAPTURE_CLICKS: '[data-testid="req-filter-toggle"]@15600;;[data-testid="req-filter-text"]@16200',
  ROTARIS_CAPTURE_TYPE_AT: 'REQ-77@16600',
  ROTARIS_CAPTURE_AFTER_MS: '19600',
}, 240_000);
const scaleState = scale.at['[data-testid="requirements"]@9000']?.[0]?.data;
expect(scaleState && scaleState['data-ready'] === 'true', `the generated board never reported ready by 9 s (${JSON.stringify(scaleState)})`);
const scalePaint = Number(scaleState['data-paint-ms']);
const scaleTasks = scale.evals['9000'];
expect(scalePaint < BUDGET_MS, `REQ-TRACE-239 on ${scaleProfile.requirements} requirements: ${scalePaint} ms`);
expect(scaleTasks && scaleTasks.longest < BUDGET_MS, `REQ-TRACE-239 on ${scaleProfile.requirements} requirements: a ${scaleTasks?.longest} ms long task`);
const scaleColumns = columnsOf(scale.at['[data-testid="req-column"]@9000']);
const backlog = scaleColumns.find((c) => c.key === 'backlog');
expect(backlog && backlog.count === scaleProfile.requirements, `the backlog column holds ${backlog?.count}, not every one of the ${scaleProfile.requirements} generated requirements`);
expect(backlog.realised < backlog.count / 4, `REQ-TRACE-365: ${backlog.realised} of ${backlog.count} members realised`);
const scrolled = scale.evals['9200'];
expect(scrolled && Array.isArray(scrolled.seen) && scrolled.seen.length === 11, `the scroll sweep answered ${JSON.stringify(scrolled)}`);
const realisedMax = Math.max(...scrolled.seen.map((s) => s.realised));
expect(realisedMax < backlog.count / 4, `REQ-TRACE-365: the realised count reached ${realisedMax} during the sweep`);
// REQ-TRACE-360: the scroll range is sized from an estimate (a mean) until measurements exist, so the sweep's tenth
// step lands within a card of the end; one settling nudge then reaches it, and the last member — REQ-10014, the
// hundredth epic's fourteenth child, last by identifier order — is the last realised widget.
expect(scrolled.seen[10].last === 'REQ-10014' && scrolled.endLast === 'REQ-10014', `REQ-TRACE-365: the last card realised was ${scrolled.seen[10].last} then ${scrolled.endLast}, not REQ-10014`);
expect(scrolled.atEnd, `REQ-TRACE-365: after the settling nudge the column is still short of its end (${JSON.stringify({ scrollHeight: scrolled.scrollHeight, clientHeight: scrolled.clientHeight })})`);
expect(scrolled.seen[0].last !== scrolled.seen[10].last && scrolled.seen[10].first !== scrolled.seen[0].first, 'REQ-TRACE-365: the cards realised at the bottom are not disjoint from those at the top');
const epicAxis = scale.inspects['[data-testid="req-column"]@14400'];
expect(epicAxis && epicAxis.matches.length >= 100, `REQ-TRACE-300: the epic axis shows ${epicAxis?.matches.length ?? 0} open columns, not 100`);
for (const m of epicAxis.matches) expect(m.rect.width >= 276, `REQ-TRACE-238 at 100 columns: column ${m.attrs['data-column']} is ${m.rect.width} wide`);
const scrolledColumns = scale.evals['14600'];
expect(scrolledColumns && scrolledColumns.scrollWidth > scrolledColumns.clientWidth && scrolledColumns.scrollLeft > 0, `REQ-TRACE-300: the columns area did not scroll (${JSON.stringify(scrolledColumns)})`);
const axisTasks = scale.evals['14500'];
// REQ-TRACE-300 and REQ-TRACE-239 together, which is the pair defect AK2-3 had to satisfy at once. 300 forbids
// truncating, hiding or refusing a column on account of how many there are; 239 requires the work of putting the
// board on screen to be bounded by what is on screen. So: all hundred columns are PRESENT — each in its place, at
// its width, holding its share of a row a hundred minimum-width columns long — while only the ones the area's
// viewport exposes are BUILT, and the switch that produces them stays inside the budget.
expect(scrolledColumns.present >= 100, `REQ-TRACE-300: the columns area holds ${scrolledColumns.present} columns, not the hundred the board reports`);
expect(scrolledColumns.scrollWidth >= 100 * 276, `REQ-TRACE-300/238: a hundred columns at the 276 minimum need ${100 * 276} px of row; the area reports ${scrolledColumns.scrollWidth}`);
expect(scrolledColumns.built > 0 && scrolledColumns.built < 100, `defect AK2-3: ${scrolledColumns.built} of the ${scrolledColumns.present} columns were built for a viewport ${scrolledColumns.clientWidth} px wide`);
expect(axisTasks && axisTasks.board && axisTasks.board.columns >= 100, `REQ-TRACE-300: the board's own model reports ${axisTasks?.board?.columns} columns on the epic axis, not a hundred`);
expect(axisTasks.longest < BUDGET_MS, `REQ-TRACE-300/239: switching to 100 populated columns cost a ${axisTasks?.longest} ms long task`);
const epicAxisColumns = columnsOf(scale.at['[data-testid="req-column"]@14400']);
const realisedOnEpicAxis = epicAxisColumns.reduce((n, c) => n + c.realised, 0);
expect(realisedOnEpicAxis > 0 && realisedOnEpicAxis < 100, `defects AK2-2/AK2-3: ${realisedOnEpicAxis} card widgets realised across 100 columns for a viewport four columns wide`);
const filterState = boardData(scale.probes);
const filterMs = Number(filterState?.['data-filter-ms']);
const filterTotal = first(scale.probes, '[data-testid="req-total"]')?.text;
expect(Number.isFinite(filterMs) && filterMs >= 0, `REQ-TRACE-367: no post-debounce figure was recorded (${JSON.stringify(filterState)})`);
expect(filterMs < BUDGET_MS, `REQ-TRACE-367: the post-debounce recomputation over ${scaleProfile.requirements} requirements cost ${filterMs} ms`);
expect(filterTotal === '15 / 1500', `the text filter "REQ-77" left ${JSON.stringify(filterTotal)}, not the fifteen identifiers that carry it`);
const filterTasks = scale.evals['19000'];
// Every long task is recorded, not only the longest: a budget missed by one task of its own reads differently from
// a budget missed while the machine was doing something else, and REQ-TRACE-088's reference conditions are "timing
// the work alone". A red that names the shape can be attributed; a red that names one number cannot.
stage2.scale = { requirements: scaleProfile.requirements, paintMs: scalePaint, longestTaskMs: scaleTasks.longest, arrivalTasks: scaleTasks.tasks, observable: scaleTasks.board, backlog: { count: backlog.count, realised: backlog.realised }, sweep: scrolled.seen, endLast: scrolled.endLast, endRealised: scrolled.endRealised, realisedMax, epicColumns: epicAxis.matches.length, minColumnWidth: Math.min(...epicAxis.matches.map((m) => m.rect.width)), columnsScroll: scrolledColumns, columnsPresent: scrolledColumns.present, columnsBuilt: scrolledColumns.built, modelColumns: axisTasks.board?.columns ?? null, axisSwitchLongestTaskMs: axisTasks.longest, axisSwitchTasks: axisTasks.tasks, realisedOnEpicAxis, filterMs, filterTotal, filterLongestTaskMs: filterTasks?.longest ?? null };

results.stage2 = stage2;
results.passed = true;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
for (const [name, value] of Object.entries(stage2)) console.log(`  PASS  ${name}: ${JSON.stringify(value).slice(0, 220)}`);
console.log(`requirements-proof PASSED (${results.tests} tests in ${elapsedMs} ms; board ${paintMs} ms on the fixture, ${scalePaint} ms on ${scaleProfile.requirements} requirements) ${join(output, 'results.json')}`);
