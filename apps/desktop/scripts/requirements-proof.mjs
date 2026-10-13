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
 *               reports a positive horizontal scroll range (REQ-TRACE-237/238); the budget holds there too; and
 *               (Part R″) the queue pane is OPENED at that size — REQ-TRACE-376's "with every surface installed,
 *               nothing in the area clips at the minimum window size; every pane shares one stack with the board" —
 *               its host's box measured against the window and its parent asserted to be the board's own body.
 *   fold      — clicking a heading folds the column to a rail that takes the focus (REQ-TRACE-307/320); the fold
 *               is still there on a RELAUNCH of the same workspace, and a second workspace opened against the same
 *               preference root does not have it (REQ-TRACE-312/321); the rail's computed writing mode and transform
 *               (REQ-TRACE-497's rotated-text clause, which is asserted here because this is the stage that has a
 *               rail) and REQ-TRACE-493's two accessible names with the rail operable without a pointer; and
 *               (2026-10-06) every closed-vocabulary label set into that rail's heading in turn, its line boxes read:
 *               no word broken inside itself, a one-word label on one line, "Needs Update" on at most two
 *               (REQ-TRACE-310/309).
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
 * Stage 3 (Electron) is Part R″'s — the lane driven end to end over the shipped composition:
 *
 *   end-to-end — REQ-TRACE-499 with no caller-supplied wiring: a card selected, the move control clicked, the
 *               consequence confirmed, the elevation's disclosure ABANDONED (and nothing written for it, which the
 *               SQL afterwards proves by counting one release and not two), then accepted; a real session started by
 *               main's coordinator against the scripted dialect; the review pane opened from the requirement's own
 *               detail and its accept decision taken — the pane then keeps the review it was reading, says it is out
 *               of date and offers the reload alone, drawing no refusal (REQ-TRACE-426, live-run finding L12), and
 *               the reload reads REQ-TRACE-424's refusal for a card in `done`; the card resting in `done`; then the requirement's source
 *               document edited ON DISK by this script and a SECOND launch of the same profile showing the card in
 *               `needs-update` (REQ-TRACE-407/499). The delivery store is then read with SQL for the two facts no
 *               surface can show: that every state-changing action left a record, and that the run record carries a
 *               session identifier and the permissions it was granted (REQ-TRACE-405/464/472/497).
 *   panes     — REQ-TRACE-369/375: the queue pane opened from the board, closed and opened again, with the board's
 *               own observable reporting that it was built ONCE and that no other key was built by asking; the
 *               relationship graph (REQ-TRACE-322..333) centred from a requirement's detail — its four node kinds,
 *               its navigability rule, its depth columns, its edge list, its bound statement and its depth control's
 *               range; the depth columns MEASURED (defect `R2-6`: ten node controls once passed this stage while
 *               painted nowhere, because every assertion read attributes and none read a box); and the rest of
 *               REQ-TRACE-497 a proof can reach — an epic card offering no delivery action and not draggable, a drag
 *               on a non-delivery axis refused in words, a column count agreeing with the widgets in it, and the card
 *               and its detail agreeing on health. The rotated-rail clause is asserted in `fold`, which has a rail.
 *   review-rerun — REQ-TRACE-426 with REQ-TRACE-472: a release accepted through the disclosure, the run arrived at
 *               review, and the application quits; relaunched, the review pane's Rerun taken. The disclosure is due again in
 *               that launch (one acceptance holds for the launch it was given in); while it stands the pane says
 *               nothing has been recorded, as the decision's state and not as a refusal; once it is accepted the pane
 *               says the re-run was recorded, offers the reload alone and draws no alert; the history holds one rerun.
 *   blocker-resume — REQ-TRACE-453/454 with REQ-TRACE-472: the queue stopped, a release accepted through the
 *               disclosure, the card held out of `ready` by a drag onto the blocked column with a stated reason, and the
 *               application quits; relaunched with the queue stopped again, the blockers pane's "Clear the blocker" taken.
 *               The disclosure is due again in that launch; while it stands the pane says
 *               nothing has been recorded as a status, not a refusal, with the resume held; once it is accepted the pane
 *               is re-read and says nothing holds the card, draws no alert, and the history holds one resume. The queue
               is then started, and a run begins on the one tree the release provisioned (`…-u1`): no "no run began" on
               the card, no second provisioning in the log, one run row and one worktree row (REQ-TRACE-464).
 *   ready-restart — REQ-TRACE-472/482/464 across a quit and a relaunch: the queue stopped and a release accepted through
 *               the disclosure, so REQ-101 rests in `ready` on its tree; the application quits. Relaunched, the queue
 *               asks for the disclosure, "Disclose and start" shows it, "Start the run" begins the run on the tree the
 *               release provisioned: one run row of u1, one worktree row, the take-over in the log and no second
 *               provisioning.
 *   ready-restart-automatic — REQ-TRACE-476/482: the same rest under automatic scheduling with the disclosure accepted
 *               permanently; relaunched, nothing is clicked, and the card reaches `running` on its recorded tree.
 *   disclosure-launch — REQ-TRACE-472: one plain acceptance on REQ-101, then REQ-102 released with no disclosure shown and
 *               its run permissive; relaunched, REQ-103's release shows the disclosure again.
 *
 * Evidence under `.proof/requirements-proof/`: `vitest.json`, one PNG and one log per launch, `results.json`.
 * `--skip-build` skips the desktop build.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { READ_LONGTASKS, REVEAL_UNTIL_FOCUSED } from './lib/board-window.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = join(repo, '.proof', 'requirements-proof');
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


const PROBES = [
  '.app-shell', '[data-testid="requirements"]', '[data-testid="req-total"]', '[data-testid="req-column"]', '[data-testid="req-rail"]', '[data-testid="req-card"]', '[data-testid="req-epic"]',
  '[data-testid="req-filter-summary"]', '[data-testid="req-feedback"]', '[data-testid="req-move-control"]', '[data-testid="req-error"]', '[data-testid="req-empty-source"]', '[data-testid="req-blocked"]',
];
async function launch(name, workspace, local, preferences, extra, timeoutMs = 180_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
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
 * Part R2 — the delivery store, read with SQL after a launch. Two of REQ-TRACE-497's never-observable clauses are
 * facts about the STORE and not about the screen — a state-changing action for which no record was written, and a run
 * in flight whose record carries no session identifier — and a third (a run started while its disclosure was due) can
 * only be proved by counting what the abandoned launch did NOT write.
 *
 * The store is found, never chosen: a profile holds exactly one workspace, so exactly one `workspace.db` may be under
 * it and the proof fails rather than picking. That is the sixty-eighth defect's rule applied here — a proof reads the
 * store its own launch wrote, and a store taken "by sort" names whichever hash sorts last.
 */
const proofRequire = createRequire(import.meta.url);
const Database = proofRequire('better-sqlite3');

function deliveryRows(local) {
  const files = findDatabases(local);
  if (files.length === 0) return null;
  expect(files.length === 1, `the profile holds ${files.length} stores and a proof may not choose between them: ${files.join(', ')}`);
  const query = (sql) => { const db = new Database(files[0], { readonly: true }); try { return db.prepare(sql).all(); } finally { db.close(); } };
  const tables = query("select name from sqlite_master where type='table' and name like 'delivery%' order by name").map((t) => t.name);
  const counts = {};
  for (const t of tables) counts[t] = query(`select count(*) as n from "${t}"`)[0].n;
  return { file: files[0], tables, counts, query };
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
// The read back: since 2026-10-07 (finacc3) a task that ended before the engine answered — the view's own first mount,
// which runs before the board is asked for — is reported apart (`beforeArrival`) and not counted (`lib/board-window.mjs`).
// REQ-TRACE-239 bounds the thread "putting a board on screen once the engine has answered".

const BUDGET_MS = 100;
const stage2 = {};
/**
 * Part R2 — failures that are evaluated where they belong and REPORTED AT THE END. Exactly one assertion uses this:
 * REQ-TRACE-300/239's axis-switch long task, which is the most load-sensitive number this proof takes (Part AK′
 * measured 72, 87, 89, 89 and 134 ms for it on one tree, the 134 with the machine loaded). Nothing about it is
 * relaxed — the same budget, the same comparison, and the proof still exits non-zero on it — but a breach no longer
 * stops the script before the REQ-TRACE-499 path has been driven, because a proof that stops at its flakiest
 * measurement reports less than it measured.
 */
const deferred = [];

// ── board: the fixture at 1264 px, the budget, the partition, the header ─────────────────────────
const boardProfile = profile('board');
const board = await launch('board', boardProfile.workspace, boardProfile.local, boardProfile.preferences, {
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
stage2.board = { view: 'requirements', paintMs, longestTaskMs: longTasks.longest, longTasks: longTasks.count, beforeArrivalTasks: longTasks.beforeArrival ?? [], total, columns, widgets: allCards.length, observable: longTasks.board, primaryHeight: primary[0].rect.height, otherControls: others.length, viewport: header.viewport };

// ── minimum: REQ-SHELL-022's 1000 × 680 — column bounds and the horizontal scroll range ──────────
// Part R2, after the gate: REQ-TRACE-376 binds the surface this Part built — "with EVERY surface installed, nothing in
// the area clips at the minimum window size; every pane shares one stack with the board" — and no proof measured a
// pane open at 1000 × 680. It is measured here, in the one launch already taken at that size: the queue pane is opened
// from the board's header, its host's box is compared with the window, and the host is asserted to be a child of the
// same board body that holds the columns, which is what "one stack" means when it is read off the built DOM.
const PANE_AT_MINIMUM = `(() => { const host = document.querySelector('[data-testid="req-pane-host"]'); const body = document.querySelector('.req-body'); const cols = document.querySelector('[data-testid="req-columns"]'); if (host === null) return null; const r = host.getBoundingClientRect(); const pane = host.querySelector('[data-testid="req-pane-queue"]'); const p = pane === null ? null : pane.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), sharesStackWithBoard: body !== null && host.parentElement === body && cols !== null && cols.parentElement === body, clipsHorizontally: host.scrollWidth > host.clientWidth + 1, pane: p === null ? null : { w: Math.round(p.width), h: Math.round(p.height) }, paneClipsHorizontally: pane === null ? null : pane.scrollWidth > pane.clientWidth + 1, close: document.querySelector('[data-testid="req-pane-close"]') !== null, viewport: { width: window.innerWidth, height: window.innerHeight } }; })()`;
const minimum = await launch('minimum', boardProfile.workspace, boardProfile.local, boardProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1000x680@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-column"]@4200;;.req-header .btn, .req-header .select, .req-header input@4200',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="req-queue-open"]@4600',
  ROTARIS_CAPTURE_EVAL_AT: `(() => { const el = document.querySelector('[data-testid="req-columns"]'); return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, range: el.scrollWidth - el.clientWidth } : null; })()@4300;;${PANE_AT_MINIMUM}@5200`,
  ROTARIS_CAPTURE_AFTER_MS: '5800',
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
// REQ-TRACE-376, measured where it is binding: a pane open at REQ-SHELL-022's minimum window.
const paneAtMinimum = minimum.evals['5200'];
expect(paneAtMinimum !== null && typeof paneAtMinimum === 'object', `REQ-TRACE-375/376: the queue pane did not open at 1000 × 680 (${JSON.stringify(paneAtMinimum)})`);
expect(paneAtMinimum.sharesStackWithBoard, `REQ-TRACE-376: the pane host and the columns are not children of one board body (${JSON.stringify(paneAtMinimum)})`);
expect(paneAtMinimum.x >= 0 && paneAtMinimum.y >= 0 && paneAtMinimum.x + paneAtMinimum.w <= paneAtMinimum.viewport.width + 0.5 && paneAtMinimum.y + paneAtMinimum.h <= paneAtMinimum.viewport.height + 0.5, `REQ-TRACE-376: at the minimum window the pane host's box ${JSON.stringify({ x: paneAtMinimum.x, y: paneAtMinimum.y, w: paneAtMinimum.w, h: paneAtMinimum.h })} lies outside the window ${JSON.stringify(paneAtMinimum.viewport)}`);
// Vertical overflow inside the host is scrolling, which the host declares and a person can perform; horizontal
// overflow is the clip REQ-TRACE-376 forbids, because nothing takes the reader sideways to what it hid.
expect(!paneAtMinimum.clipsHorizontally && paneAtMinimum.paneClipsHorizontally === false, `REQ-TRACE-376: the pane clips horizontally at the minimum window (${JSON.stringify(paneAtMinimum)})`);
expect(paneAtMinimum.pane !== null && paneAtMinimum.pane.w > 0 && paneAtMinimum.pane.h > 0 && paneAtMinimum.close, `REQ-TRACE-376: the queue pane occupies ${JSON.stringify(paneAtMinimum.pane)} at the minimum window and its way back is ${paneAtMinimum.close}`);
stage2.minimum = { viewport: minColumns.viewport, columnWidths: minColumns.matches.map((m) => Math.round(m.rect.width)), scroll: range, paintMs: minPaint, paneAtMinimum };

// ── fold: heading → rail with the focus; persists across a relaunch; not across workspaces ────────
// Defect AK2-3: Done is the sixth of seven columns and at this window width it lies outside the columns area's own
// viewport, so it is a placeholder and holds no heading — a control that is not on screen cannot be clicked, by a
// person or by this proof. The proof scrolls to it first, exactly as a person would, and that is the other half of
// REQ-TRACE-300 proved: a column that was not built becomes fully operable — heading, count, fold, accessible name —
// in the update that brings it into view, so nothing was truncated, hidden or refused, only deferred.
const SCROLL_TO_DONE = `(() => { const el = document.querySelector('[data-testid="req-columns"] > [data-column="done"]'); if (!el) return 'absent'; const offscreen = el.getAttribute('data-offscreen') === 'true'; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return { offscreen }; })()`;
// Part R2, after the gate: REQ-TRACE-497's "rotated text on a folded rail" clause was asserted in the `panes` stage,
// where NO column is folded — the read answered null and the assertion, guarded by `if (rail !== null)`, asserted
// nothing at all. The claim belongs in the one stage that folds a column, and this is it. REQ-TRACE-493's two
// accessible names and the rail's operability without a pointer are read in the same instant, from the same DOM.
const RAIL_AND_HEADING = `(() => { const rail = document.querySelector('[data-testid="req-rail"]'); const heading = document.querySelector('[data-testid="req-heading"]'); if (rail === null) return null; const s = getComputedStyle(rail); const r = rail.getBoundingClientRect(); return { writingMode: s.writingMode, transform: s.transform, w: Math.round(r.width), h: Math.round(r.height), railName: rail.getAttribute('aria-label'), railTag: rail.tagName, railDisabled: rail.disabled === true, railTabIndex: rail.tabIndex, headingName: heading === null ? null : (heading.getAttribute('aria-label') ?? heading.textContent.trim()), headingTag: heading === null ? null : heading.tagName }; })()`;
// REQ-TRACE-310 with REQ-TRACE-309, measured: the rail is eight characters of its own font wide because that is where
// the longest ordinary delivery label still fits on one line, and a heading too long for it wraps onto at most two.
// The ordinary delivery labels are the one-word ones, the longest seven letters (Backlog, Running, and Blocked beside
// them); "Needs Update", twelve characters in two words, is the heading too long for the rail that REQ-TRACE-309 wraps
// at its space. Read as all six of REQ-TRACE-232, REQ-TRACE-310's reason would be false of the labels it names.
// Only one column is folded here, so every closed-vocabulary label is set in turn into a copy of THIS rail's heading
// — the rail's own width, font and rules — and its lines read off the text's own line boxes: a word whose range spans
// two line tops was broken inside the word. The labels are `columnLabel`'s spelling of the seven tokens
// (`packages/ui-core/src/requirements/display.ts`): the six delivery states of REQ-TRACE-232 and Blocked (REQ-TRACE-233).
// Until 2026-10-06 the rail drew its heading as an uppercase, tracked kicker and "Blocked" read "BLOCKE / D"
// (`docs/defects/fixed/the-folded-blocked-rail-breaks-its-label-inside-the-word.md`).
const RAIL_LABELS = ['Backlog', 'Ready', 'Running', 'Review', 'Needs Update', 'Done', 'Blocked'];
const RAIL_LABEL_FIT = `(() => { const rail = document.querySelector('[data-testid="req-rail"]'); const real = rail === null ? null : rail.querySelector('.req-rail__heading'); if (real === null) return null; const tops = (rects) => new Set([...rects].filter((q) => q.width > 0 && q.height > 0).map((q) => Math.round(q.top))).size; const measure = (el) => { const text = el.firstChild; const broken = []; let i = 0; for (const word of el.textContent.split(' ')) { const r = document.createRange(); r.setStart(text, i); r.setEnd(text, i + word.length); if (tops(r.getClientRects()) > 1) broken.push(word); i += word.length + 1; } const all = document.createRange(); all.selectNodeContents(el); const widths = [...all.getClientRects()].map((q) => q.width); return { lines: tops(all.getClientRects()), broken, widest: Math.round(Math.max(0, ...widths) * 10) / 10 }; }; const s = getComputedStyle(real); const rs = getComputedStyle(rail); const out = { railWidth: Math.round(rail.getBoundingClientRect().width * 10) / 10, contentWidth: Math.round((rail.clientWidth - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight)) * 10) / 10, transform: s.textTransform, tracking: s.letterSpacing, own: { label: real.textContent, ...measure(real) }, labels: [] }; for (const label of ${JSON.stringify(RAIL_LABELS)}) { const copy = real.cloneNode(false); copy.textContent = label; rail.insertBefore(copy, real); out.labels.push({ label, ...measure(copy) }); copy.remove(); } return out; })()`;
const folded = await launch('fold', boardProfile.workspace, boardProfile.local, boardProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_EVAL_AT: `${SCROLL_TO_DONE}@3200;;${RAIL_AND_HEADING}@4600;;${RAIL_LABEL_FIT}@4700`,
  ROTARIS_CAPTURE_CLICKS: '[data-testid="req-column"][data-column="done"] [data-testid="req-heading"]@3600',
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-rail"]@4400',
  ROTARIS_CAPTURE_AFTER_MS: '5200',
});
const doneColumn = folded.evals['3200'];
expect(doneColumn !== undefined && doneColumn !== 'absent', `REQ-TRACE-300: the Done column is not among the columns area's children (${JSON.stringify(doneColumn)})`);
const railInspect = folded.inspects['[data-testid="req-rail"]@4400'];
expect(railInspect && railInspect.matches.length === 1 && railInspect.matches[0].attrs['data-column'] === 'done', `clicking the Done heading left ${railInspect?.matches.length ?? 0} rail(s) (${JSON.stringify(railInspect?.matches.map((m) => m.attrs['data-column']))})`);
expect(railInspect.active?.testId === 'req-rail', `REQ-TRACE-320: after folding, the focus is on ${JSON.stringify(railInspect.active)}, not the rail`);
expect(railInspect.matches[0].attrs['aria-label'] === 'Unfold Done · 0', `the rail's accessible name is ${JSON.stringify(railInspect.matches[0].attrs['aria-label'])}`);
const railShape = folded.evals['4600'];
expect(railShape !== null && typeof railShape === 'object', `REQ-TRACE-497: no rail was on screen to read after the fold (${JSON.stringify(railShape)})`);
// REQ-TRACE-497: rotated text on a folded rail is never observable. The rail reads top to bottom as ordinary
// horizontal text; a `writing-mode` or a `transform` is what a rail that had been turned on its side would carry.
expect(railShape.writingMode === 'horizontal-tb' && (railShape.transform === 'none' || railShape.transform === ''), `REQ-TRACE-497: the folded rail carries rotated text (${JSON.stringify(railShape)})`);
expect(railShape.w > 0 && railShape.h > 0, `REQ-TRACE-497: the folded rail occupies ${JSON.stringify({ w: railShape.w, h: railShape.h })}`);
// REQ-TRACE-493: an accessible name on BOTH the column heading and the folded rail, and a rail that is operable
// without a pointer — a real button, enabled, in the tab sequence, which the focus assertion above then exercises.
expect(typeof railShape.railName === 'string' && railShape.railName.length > 0, `REQ-TRACE-493: the folded rail has no accessible name (${JSON.stringify(railShape)})`);
expect(railShape.railTag === 'BUTTON' && !railShape.railDisabled && railShape.railTabIndex >= 0, `REQ-TRACE-493: the rail is not operable without a pointer (${JSON.stringify({ tag: railShape.railTag, disabled: railShape.railDisabled, tabIndex: railShape.railTabIndex })})`);
expect(typeof railShape.headingName === 'string' && railShape.headingName.length > 0, `REQ-TRACE-493: an unfolded column heading has no accessible name (${JSON.stringify(railShape)})`);
const railLabels = folded.evals['4700'];
expect(railLabels !== null && typeof railLabels === 'object' && Array.isArray(railLabels.labels) && railLabels.labels.length === RAIL_LABELS.length, `REQ-TRACE-310: the rail's labels could not be measured (${JSON.stringify(railLabels)})`);
expect(railLabels.own.label === 'Done' && railLabels.own.lines === 1 && railLabels.own.broken.length === 0, `REQ-TRACE-310: the folded Done rail's own heading is not one unbroken line (${JSON.stringify(railLabels.own)})`);
for (const fit of railLabels.labels) {
  // No label of the closed vocabulary is broken inside a word: a one-word label is one line, which is what eight
  // characters were chosen to hold (REQ-TRACE-310), and the one label longer than the rail wraps at its space onto at
  // most two (REQ-TRACE-309) — never mid-word, never eliding.
  expect(fit.broken.length === 0, `REQ-TRACE-310: the folded rail breaks "${fit.label}" inside ${JSON.stringify(fit.broken)} at ${railLabels.railWidth} px (text-transform ${railLabels.transform}, letter-spacing ${railLabels.tracking}; ${JSON.stringify(fit)})`);
  const words = fit.label.split(' ').length;
  expect(words === 1 ? fit.lines === 1 : fit.lines >= 1 && fit.lines <= 2, `REQ-TRACE-309/310: the folded rail sets "${fit.label}" on ${fit.lines} line(s) at ${railLabels.railWidth} px (${JSON.stringify(fit)})`);
  // Sideways, against the rail's content box: the heading shrinks to its text inside the centred rail, so its own
  // scroll and client widths are always equal and could never fail; the widest line box against the box it sits in can.
  expect(fit.widest > 0 && fit.widest <= railLabels.contentWidth + 0.5, `REQ-TRACE-310: "${fit.label}" is ${fit.widest} px wide in a rail whose content box is ${railLabels.contentWidth} px (${JSON.stringify(fit)})`);
}
const relaunched = await launch('fold-relaunch', boardProfile.workspace, boardProfile.local, boardProfile.preferences, { ROTARIS_CAPTURE_VIEWS: '4@1200', ROTARIS_CAPTURE_AFTER_MS: '4600' });
const relaunchRails = (relaunched.probes['[data-testid="req-rail"]'] ?? []).map((r) => r.data['data-column']);
expect(relaunchRails.join(',') === 'done', `REQ-TRACE-321: after the relaunch the folded columns are ${JSON.stringify(relaunchRails)}, not the Done column alone`);
const otherProfile = profile('other', boardProfile.preferences);
const other = await launch('fold-other-workspace', otherProfile.workspace, otherProfile.local, otherProfile.preferences, { ROTARIS_CAPTURE_VIEWS: '4@1200', ROTARIS_CAPTURE_AFTER_MS: '4600' });
const otherRails = (other.probes['[data-testid="req-rail"]'] ?? []).map((r) => r.data['data-column']);
expect(otherRails.length === 0, `REQ-TRACE-312: a fold made in one workspace reached another (${JSON.stringify(otherRails)})`);
stage2.fold = { folded: 'done', offscreenBeforeScroll: doneColumn.offscreen, focusAfterFold: railInspect.active?.testId, railName: railInspect.matches[0].attrs['aria-label'], afterRelaunch: relaunchRails, otherWorkspace: otherRails, railShape, railLabels };

// ── filter: an epic filter survives the axis switch (REQ-TRACE-299) ───────────────────────────────
const filterProfile = profile('filter');
const filtered = await launch('filter', filterProfile.workspace, filterProfile.local, filterProfile.preferences, {
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
const chord = await launch('chord', chordProfile.workspace, chordProfile.local, chordProfile.preferences, {
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
// id answers false and the drag is not attempted. The card must then hold the focus; since 2026-10-07 the stage waits
// for it frame by frame, up to 1000 ms, instead of reading it exactly two frames later, which went red on a loaded host
// (`revealUntilFocused`, docs/defects/fixed/requirements-proofs-drop-stage-reads-a-revealed-cards-focus-two-frames-after-asking-for-it.md).
const DROP = `(async () => { const board = window.__rotarisBoard; if (!board || typeof board.reveal !== 'function') return 'no observable'; if (board.reveal('REQ-999') !== false || board.reveal('') !== false) return 'reveal answered true for an unknown or empty id'; const seen = await ${REVEAL_UNTIL_FOCUSED}('REQ-104', 1000); const revealed = seen.revealed; const card = document.querySelector('[data-req-card="REQ-104"]'); const target = document.querySelector('[data-testid="req-column"][data-column="ready"]'); if (!card || !target) return { revealed, missing: true }; const focused = seen.focused; const dt = new DataTransfer(); const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const ev = (type, el) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })); ev('dragstart', card); await frame(); ev('dragenter', target); ev('dragover', target); await frame(); const dragging = document.querySelector('[data-testid="req-columns"]')?.getAttribute('data-dragging'); ev('drop', target); ev('dragend', card); return { revealed, focused, focusFrames: seen.frames, focusMs: seen.ms, dragging, types: [...dt.types] }; })()`;
const dropProfile = profile('drop');
const deprecatedPath = join(dropProfile.workspace, 'docs', 'requirements', 'REQ-100-fixture-epic', 'REQ-104-draft.md');
writeFileSync(deprecatedPath, readFileSync(deprecatedPath, 'utf8').replace('status: draft', 'status: deprecated'));
const drop = await launch('drop', dropProfile.workspace, dropProfile.local, dropProfile.preferences, {
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
stage2.drop = { revealed: dropped.revealed, focusFrames: dropped.focusFrames, focusMs: dropped.focusMs, transferTypes: dropped.types, feedback: feedback[0], column: reqThreeHundred.column, readyCount: readyAfterDrop.count };

// ── scale: the generated 1,500-requirement store — 100 columns on the epic axis, virtualisation, the budget ──
const scaleProfile = generatedProfile('scale');
const SCROLL = `(async () => { const list = document.querySelector('[data-testid="req-column"][data-column="backlog"] [data-testid="req-list"]'); if (!list) return 'no list'; const seen = []; for (let i = 0; i <= 10; i += 1) { list.scrollTop = ((list.scrollHeight - list.clientHeight) * i) / 10; await new Promise((r) => setTimeout(r, 80)); const ids = [...list.querySelectorAll('[data-req-card]')].map((el) => el.getAttribute('data-req-card')); seen.push({ top: Math.round(list.scrollTop), realised: ids.length, first: ids[0] ?? null, last: ids.at(-1) ?? null }); } list.scrollTop = list.scrollHeight; await new Promise((r) => setTimeout(r, 120)); const endIds = [...list.querySelectorAll('[data-req-card]')].map((el) => el.getAttribute('data-req-card')); return { seen, scrollHeight: list.scrollHeight, clientHeight: list.clientHeight, atEnd: list.scrollTop + list.clientHeight >= list.scrollHeight - 1, endLast: endIds.at(-1) ?? null, endRealised: endIds.length }; })()`;
const SCROLL_COLUMNS = `(() => { const el = document.querySelector('[data-testid="req-columns"]'); if (!el) return null; const present = el.querySelectorAll(':scope > [data-column]').length; const built = el.querySelectorAll(':scope > [data-column]:not([data-offscreen])').length; el.scrollLeft = el.scrollWidth; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollLeft: el.scrollLeft, columns: el.querySelectorAll('[data-testid="req-column"]').length, rails: el.querySelectorAll('[data-testid="req-rail"]').length, present, built, placeholders: present - built }; })()`;
const scale = await launch('scale', scaleProfile.workspace, scaleProfile.local, scaleProfile.preferences, {
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
// Part R2, after the gate: the arrival budget on the generated store is deferred on the same terms as the axis switch
// below it and for the same reason — it is a long-task measurement on a machine running three agents, it read 77 ms on
// the base commit at 2.93 GB free and 102 to 117 ms under load, and nothing in this branch touches virtualisation.
// Deferred means EVALUATED HERE and REPORTED AT THE END: the budget is not raised, the comparison is not weakened and
// the script still exits non-zero. What it buys is that one run always reaches stage 3, which is where this lane's
// whole contribution is measured; a proof that stops at its flakiest number reports less than it measured.
expect(scaleTasks && typeof scaleTasks === 'object' && 'longest' in scaleTasks, `the long-task observer answered ${JSON.stringify(scaleTasks)} on the generated store`);
if (!(scalePaint < BUDGET_MS)) deferred.push(`REQ-TRACE-239 on ${scaleProfile.requirements} requirements: the board's own arrival measure was ${scalePaint} ms against the ${BUDGET_MS} ms budget`);
if (!(scaleTasks.longest < BUDGET_MS)) deferred.push(`REQ-TRACE-239 on ${scaleProfile.requirements} requirements: a ${scaleTasks.longest} ms long task while the board arrived, against the ${BUDGET_MS} ms budget (every long task in that window: ${JSON.stringify(scaleTasks.tasks)})`);
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
// Part R2: evaluated here, reported at the end (see `deferred`). Not relaxed, not floored, not lowered.
if (!(axisTasks.longest < BUDGET_MS)) deferred.push(`REQ-TRACE-300/239: switching to 100 populated columns cost a ${axisTasks.longest} ms long task against the ${BUDGET_MS} ms budget (every long task in that window: ${JSON.stringify(axisTasks.tasks)})`);
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
stage2.scale = { requirements: scaleProfile.requirements, paintMs: scalePaint, longestTaskMs: scaleTasks.longest, arrivalTasks: scaleTasks.tasks, beforeArrivalTasks: scaleTasks.beforeArrival ?? [], observable: scaleTasks.board, backlog: { count: backlog.count, realised: backlog.realised }, sweep: scrolled.seen, endLast: scrolled.endLast, endRealised: scrolled.endRealised, realisedMax, epicColumns: epicAxis.matches.length, minColumnWidth: Math.min(...epicAxis.matches.map((m) => m.rect.width)), columnsScroll: scrolledColumns, columnsPresent: scrolledColumns.present, columnsBuilt: scrolledColumns.built, modelColumns: axisTasks.board?.columns ?? null, axisSwitchLongestTaskMs: axisTasks.longest, axisSwitchTasks: axisTasks.tasks, realisedOnEpicAxis, filterMs, filterTotal, filterLongestTaskMs: filterTasks?.longest ?? null };

// ══ Stage 3 (Part R2): REQ-TRACE-499 over the shipped composition, and REQ-TRACE-497 turned into assertions ══════
//
// REQ-TRACE-499 asks for ONE end-to-end path over the shipped composition with no caller-supplied wiring: release,
// run, review, accept, and notice a subsequent edit. It is driven here through the built application's own controls —
// a card clicked, the move control clicked, the consequence confirmed, the elevation's disclosure ABANDONED once and
// then accepted, a real session started by main's coordinator against the scripted dialect, the review pane opened
// from the requirement's detail and its accept decision taken — and then the requirement's source document is edited
// ON DISK, by this script rather than by the application, and a SECOND launch of the same profile must show the card
// in needs-update. The delivery store is read directly with SQL afterwards, because the two things REQ-TRACE-497
// forbids most sharply — a state-changing action that wrote no record, and a run started while its disclosure was due
// — are facts about the store and not about the screen.

const CARD_101 = '[data-req-card="REQ-101"]';
/** One read of everything the board can be asked for at an instant: the card, the columns, the rails, the feedback. */
const BOARD_AT = `(() => { const el = document.querySelector('[data-req-card="REQ-101"]'); const b = window.__rotarisBoard; return { column: el === null ? null : el.getAttribute('data-column'), health: el === null ? null : el.getAttribute('data-health'), generation: b ? b.generation : null, openPane: b ? b.openPane : null, panes: b ? b.panes : null, feedback: [...document.querySelectorAll('[data-testid="req-feedback"]')].map((f) => f.textContent.trim()), rails: [...document.querySelectorAll('[data-testid="req-rail"]')].map((r) => r.getAttribute('data-column')), columns: [...document.querySelectorAll('[data-testid="req-column"]')].map((c) => ({ key: c.getAttribute('data-column'), count: Number(c.getAttribute('data-count')), realised: Number(c.getAttribute('data-realised')), widgets: c.querySelectorAll('[data-req-card]').length, offscreen: c.getAttribute('data-offscreen') === 'true' })) }; })()`;
const DISCLOSURE_AT = `(() => { const d = document.querySelector('[data-testid="req-pane-disclosure"]'); return d === null ? null : { lines: [...d.querySelectorAll('li')].map((l) => l.textContent.trim()), buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) }; })()`;
/** REQ-TRACE-364: the board's own operation for bringing a named card into view, used before a read that must find it. */
const REVEAL_101 = `(() => { const b = window.__rotarisBoard; return b && typeof b.reveal === 'function' ? b.reveal('REQ-101') : 'no observable'; })()`;
/**
 * REQ-TRACE-426 with REQ-TRACE-424 (live-run finding L12): what the review pane shows once a decision is taken — the
 * notice, the actions it offers, the refusal line if one is drawn, the state tag of the payload on screen, and whether
 * the decisions are still offered.
 */
const REVIEW_AT = `(() => { const p = document.querySelector('[data-testid="req-pane-review"]'); if (p === null) return null; const d = p.querySelector('[data-testid="req-pane-review-decided"]'); const r = p.querySelector('[data-testid="req-pane-review-refusal"]'); const tag = p.querySelector('.req-pane__state'); const said = d === null ? null : d.querySelector('span'); return { decided: said === null ? null : said.textContent.trim(), actions: d === null ? [] : [...d.querySelectorAll('button')].map((b) => b.textContent.trim()), refusal: r === null ? null : r.textContent.trim(), column: tag === null ? null : tag.textContent.trim(), decisions: p.querySelector('[data-testid="req-pane-review-decisions"]') !== null, reads: window.__rotarisBoard?.reviewReads ?? null }; })()`;
const HISTORY_AT = `(() => { const p = document.querySelector('[data-testid="req-history-state"]'); const d = document.querySelector('[data-testid="req-detail"]'); return { state: p === null ? null : p.getAttribute('data-state'), entries: p === null ? [] : [...p.querySelectorAll('li')].map((l) => l.textContent.trim()), detailHealth: d === null ? null : (d.querySelector('[data-section="requirement"] dd .mono') || {}).textContent, runs: d === null ? [] : [...d.querySelectorAll('.req-detail__run')].map((r) => r.textContent.trim()) }; })()`;

const e2e = profile('end-to-end');
const release = await launch('end-to-end', e2e.workspace, e2e.local, e2e.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    `${CARD_101}@3000`,
    '[data-testid="req-move-control"]@4400',
    '[data-testid="req-confirm"] .btn>>Release@5400',
    // REQ-TRACE-472: abandoned first. Nothing may be written by this, and the second attempt below must therefore
    // leave exactly ONE release in the history — which is what the SQL after the launch reads.
    '[data-testid="req-pane-disclosure"] .btn>>Abandon@6800',
    `${CARD_101}@8200`,
    '[data-testid="req-move-control"]@9200',
    '[data-testid="req-confirm"] .btn>>Release@10200',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@11200',
    `${CARD_101}@30000`,
    '[data-testid="req-detail-review"]@32000',
    '[data-testid="req-pane-review-decisions"] .btn-primary@34000',
    '[data-testid="req-pane-review-confirm"] .btn-primary@35600',
    // REQ-TRACE-426: the notice's one action, taken after the resting reads below.
    '[data-testid="req-pane-review-decided"] .btn>>Reload the review@38800',
  ].join(';;'),
  // The focused card opens its own detail with Enter (REQ-TRACE-484); the harness sends single clicks only.
  ROTARIS_CAPTURE_KEYS: 'Return@31000',
  // The resting column is read through the board's OWN reveal operation (REQ-TRACE-364) first: `done` is the sixth of
  // seven columns and lies outside the columns area's viewport at 1264 px, so it is a sized placeholder holding no
  // card widget (defect AK2-3, by design). Reading the DOM without revealing first reads `null` and proves nothing.
  ROTARIS_CAPTURE_EVAL_AT: [`${DISCLOSURE_AT}@6400`, `${BOARD_AT}@7600`, `${BOARD_AT}@13000`, `${BOARD_AT}@18000`, `${BOARD_AT}@23000`, `${BOARD_AT}@29000`, `${REVIEW_AT}@36800`, `${REVEAL_101}@37000`, `${BOARD_AT}@38000`, `${HISTORY_AT}@38400`, `${REVIEW_AT}@39800`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '40400',
}, 300_000);

const disclosure = release.evals['6400'];
expect(disclosure !== null && Array.isArray(disclosure.lines) && disclosure.lines.length > 0, `REQ-TRACE-472: no disclosure was raised by the first action of the launch (${JSON.stringify(disclosure)})`);
expect(disclosure.lines.some((l) => /confined/i.test(l)), `REQ-TRACE-472: the disclosure does not identify the worktree the run is confined to (${JSON.stringify(disclosure.lines)})`);
expect(disclosure.buttons.includes('Abandon') && disclosure.buttons.includes('Start the run'), `REQ-TRACE-472: the disclosure offers ${JSON.stringify(disclosure.buttons)} rather than a way to abandon and a way to start`);
const abandoned = release.evals['7600'];
expect(abandoned && abandoned.column === 'backlog', `REQ-TRACE-472: after abandoning the disclosure REQ-101 sits in ${abandoned?.column}, not the column it was in`);
expect((abandoned.feedback ?? []).some((f) => f.includes('nothing was written')), `REQ-TRACE-472: abandoning left no statement that nothing happened (${JSON.stringify(abandoned?.feedback)})`);
const timeline = ['13000', '18000', '23000', '29000'].map((k) => release.evals[k]).filter((v) => v && typeof v === 'object');
const columnsSeen = timeline.map((t) => t.column);
expect(columnsSeen.some((c) => c === 'running' || c === 'review' || c === 'done'), `REQ-TRACE-499: the release never became a run — the card read ${JSON.stringify(columnsSeen)} across the launch`);
const reviewed = timeline.find((t) => t.column === 'review');
expect(reviewed !== undefined, `REQ-TRACE-499: the run never arrived at review (${JSON.stringify(columnsSeen)})`);
// REQ-TRACE-497: a card that has arrived in a column which remains folded is never observable.
expect(!(reviewed.rails ?? []).includes('review'), `REQ-TRACE-497: the review column held the arrived card while folded (${JSON.stringify(reviewed.rails)})`);
// REQ-TRACE-497: a column count that disagrees with the number of cards visible in that column. Only a column that
// has realised everything it holds can be counted on screen; a virtualised one reports what it built, by design.
for (const t of [abandoned, ...timeline]) for (const c of t.columns ?? []) if (!c.offscreen && c.realised === c.count) expect(c.widgets === c.count, `REQ-TRACE-497: column ${c.key} says ${c.count} and shows ${c.widgets} card widgets`);
expect(release.evals['37000'] === true, `REQ-TRACE-364: revealing REQ-101 before the resting read answered ${JSON.stringify(release.evals['37000'])}`);
const settled = release.evals['38000'];
expect(settled && settled.column === 'done', `REQ-TRACE-499: after the review's accept REQ-101 sits in ${settled?.column}, not done`);
// REQ-TRACE-426 (live-run finding L12): after the accept the pane keeps the payload the decision was made against, says
// it is out of date, and offers exactly one action — the reload. It draws no refusal: nobody opened a review on a card
// that is not awaiting one. Until 2026-09-29 the host re-read the review as soon as the decision was recorded, so the
// pane stood under REQ-TRACE-424's refusal ("… it is in done.") above a notice calling that refusal out of date.
const decidedPane = release.evals['36800'];
expect(decidedPane !== null && decidedPane !== undefined, `REQ-TRACE-426: the review pane was not open after the accept (${JSON.stringify(decidedPane)})`);
expect(decidedPane.decided === 'Accept recorded for REQ-101. The review you were reading is out of date.', `REQ-TRACE-426: after the accept the pane's notice reads ${JSON.stringify(decidedPane.decided)}`);
expect(JSON.stringify(decidedPane.actions) === JSON.stringify(['Reload the review']), `REQ-TRACE-426: the notice after the accept offers ${JSON.stringify(decidedPane.actions)}, not exactly the reload`);
expect(decidedPane.refusal === null, `REQ-TRACE-424/426 (L12): the pane shows a refusal right after the user's own accept: ${JSON.stringify(decidedPane.refusal)}`);
expect(decidedPane.column === 'review' && decidedPane.decisions === false, `REQ-TRACE-426: the pane shows the payload in ${JSON.stringify(decidedPane.column)} with decisions ${decidedPane.decisions ? 'still offered' : 'withdrawn'}, not the out-of-date review with the decisions withdrawn`);
// The reload is the one action, and what it reads is the requirement where the decision put it: REQ-TRACE-424's refusal.
const reloadedPane = release.evals['39800'];
expect(reloadedPane !== null && reloadedPane !== undefined && reloadedPane.decided === null, `REQ-TRACE-426: the reload left the notice standing (${JSON.stringify(reloadedPane)})`);
expect(reloadedPane.refusal === 'REQ-101 is not awaiting a review decision: it is in done.', `REQ-TRACE-424: the reloaded review reads ${JSON.stringify(reloadedPane.refusal)}`);
const history = release.evals['38400'];
expect(history && history.state === 'available' && history.entries.length >= 2, `REQ-TRACE-497: the delivery history of REQ-101 reads ${JSON.stringify(history)} after a release and an accept`);
expect(history.entries.some((e) => /release/i.test(e)) && history.entries.some((e) => /accept/i.test(e)), `REQ-TRACE-405: the history does not carry both actions (${JSON.stringify(history.entries)})`);
// REQ-TRACE-276: the card and the detail are one projection, so the health on each must be the same word.
expect(history.detailHealth === null || history.detailHealth === settled.health, `REQ-TRACE-497: the card reads health ${settled.health} and its detail reads ${history.detailHealth}`);

// The store, read directly: what the screen cannot show (REQ-TRACE-405/464/497).
const rows = deliveryRows(e2e.local);
expect(rows !== null, `no delivery store was written under ${e2e.local}`);
const historyTable = rows.tables.find((t) => /history/.test(t));
const runsTable = rows.tables.find((t) => /run/.test(t));
expect(historyTable !== undefined && runsTable !== undefined, `the store holds no delivery history or run table (${JSON.stringify(rows.tables)})`);
const entries = rows.query(`select * from "${historyTable}" order by rowid`);
const releases = entries.filter((e) => String(e.action) === 'release');
expect(releases.length === 1, `REQ-TRACE-472/497: the abandoned launch wrote a record — ${releases.length} release entries in the history, not one (${JSON.stringify(entries.map((e) => e.action))})`);
expect(entries.some((e) => String(e.action) === 'accept'), `REQ-TRACE-405: no accept was recorded (${JSON.stringify(entries.map((e) => e.action))})`);
const runRows = rows.query(`select * from "${runsTable}"`);
expect(runRows.length === 1, `REQ-TRACE-464: ${runRows.length} run rows were written for one release`);
expect(typeof runRows[0].session_id === 'string' && runRows[0].session_id.length > 0, `REQ-TRACE-464/497: the run record carries no session identifier (${JSON.stringify(runRows[0])})`);
expect(String(runRows[0].permissions).length > 0, `REQ-TRACE-472: the run record does not say what permissions it was granted (${JSON.stringify(runRows[0])})`);

// Part R2, after the gate: what this proof used to report as times — "released at 11 s, running by 18 s" — were the
// moments in `ROTARIS_CAPTURE_EVAL_AT` at which the script LOOKED. They are upper bounds on when a state was first
// observed and are not durations the product produced; a different schedule reports different figures for identical
// work, which is how the gate caught it. The product's own times are in the store: `delivery_history.at` carries a
// timestamp per recorded action and `delivery_runs` carries the run's start and end. Those are read here and are the
// only figures this lane reports as measurements; the observation schedule is reported as a schedule, named as one.
const msOf = (v) => { const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
const acceptEntry = entries.find((e) => String(e.action) === 'accept');
const releasedAt = msOf(releases[0].at);
const acceptedAt = msOf(acceptEntry.at);
const runStartedAt = msOf(runRows[0].started_at);
const runEndedAt = runRows[0].ended_at === null || runRows[0].ended_at === undefined ? null : msOf(runRows[0].ended_at);
expect(releasedAt !== null && acceptedAt !== null && runStartedAt !== null, `the store's own timestamps cannot be read (${JSON.stringify({ release: releases[0].at, accept: acceptEntry.at, started: runRows[0].started_at })})`);
expect(releasedAt <= runStartedAt && runStartedAt <= acceptedAt, `REQ-TRACE-405: the store's own order is release ${releases[0].at}, run start ${runRows[0].started_at}, accept ${acceptEntry.at}`);
const productTimings = {
  releaseToRunStartMs: runStartedAt - releasedAt,
  runMs: runEndedAt === null ? null : runEndedAt - runStartedAt,
  releaseToAcceptMs: acceptedAt - releasedAt,
  from: { release: String(releases[0].at), runStart: String(runRows[0].started_at), runEnd: runRows[0].ended_at === null ? null : String(runRows[0].ended_at), accept: String(acceptEntry.at) },
};

// The subsequent edit: the requirement's own document, changed on disk by something other than the application.
const storeDir = join(e2e.workspace, 'docs', 'requirements', 'REQ-100-fixture-epic');
const docName = readdirSync(storeDir).find((f) => f.startsWith('REQ-101'));
expect(docName !== undefined, `the fixture copy holds no REQ-101 document in ${storeDir}`);
const docPath = join(storeDir, docName);
const before = readFileSync(docPath, 'utf8');
// REQ-TRACE-499's "notice a subsequent edit": the change must fall inside the requirement's own canonical hash, which
// is taken per DECLARED identifier (spec 08 §Hashes) rather than over the file's bytes — so a paragraph appended past
// the end of the declared block moves the content hash and need not move the canonical one. The title is declared,
// the heading carries it, and the prose is the body; all three are changed, and the edit is one a person would make.
const edited = before
  .replace(/^title:.*$/m, (line) => `${line} (edited on disk)`)
  .replace(/^(#+ .*)$/m, (line) => `${line} (edited on disk)`)
  .trimEnd();
expect(edited !== before.trimEnd(), `the proof could not edit ${docName}: neither a title nor a heading was found in it`);
writeFileSync(docPath, `${edited}\n\nEdited on disk by requirements-proof after the delivery was accepted, so the text no longer matches the accepted snapshot.\n`);
const noticed = await launch('end-to-end-edited', e2e.workspace, e2e.local, e2e.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  // `needs-update` is the fifth column and lies outside the viewport at 1264 px, so the card is revealed first.
  ROTARIS_CAPTURE_EVAL_AT: [`${REVEAL_101}@6000`, `${BOARD_AT}@7000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '8000',
}, 240_000);
const after = noticed.evals['7000'];
expect(after && after.column === 'needs-update', `REQ-TRACE-499/407: after the source was edited on disk REQ-101 reads ${after?.column}, not needs-update`);
expect(after.health === 'needs-update', `REQ-TRACE-252: the card's health after the edit is ${after?.health}`);
stage2['end-to-end'] = {
  disclosure: { lines: disclosure.lines.length, buttons: disclosure.buttons },
  abandoned: { column: abandoned.column, statement: (abandoned.feedback ?? [])[0] ?? null },
  // `observedBy` is the capture schedule, in milliseconds after the launch: the card was in that column BY then. It
  // is not when it arrived. `timings` below is the product's own, read from the store's rows.
  observedBy: Object.fromEntries(['13000', '18000', '23000', '29000'].map((k) => [k, release.evals[k]?.column ?? null])),
  timings: productTimings,
  timeline: columnsSeen, settled: settled.column, history: history.entries.length,
  review: { afterAccept: decidedPane, afterReload: reloadedPane },
  store: { tables: rows.tables, counts: rows.counts, releases: releases.length, runs: runRows.length, session: String(runRows[0].session_id).slice(0, 8), permissions: runRows[0].permissions },
  afterEdit: { column: after.column, health: after.health },
};

// ── review-rerun: a review decision that starts a run, taken through the launch's disclosure (REQ-TRACE-426/472) ──
//
// Re-run and send-back start a run, so the disclosure stands between the decision and the record: the pane's first
// answer is that nothing has been recorded yet. Until 2026-10-01 the pane drew that answer as an error alert and was
// never told what the disclosure came to — accepting it took the decision while the pane went on saying nothing was
// recorded and offering the six decisions again, with no reload (defect note
// `a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`). The release here
// is accepted with "Start the run" and not "always", so the disclosure is due again for the re-run in the NEXT launch
// (REQ-TRACE-472).
/** The pane while a decision is waiting on the disclosure, and once it has been answered. */
const DECISION_AT = `(() => { const p = document.querySelector('[data-testid="req-pane-review"]'); if (p === null) return null; const text = (sel) => { const el = p.querySelector(sel); return el === null ? null : el.textContent.trim(); }; const d = p.querySelector('[data-testid="req-pane-review-decided"]'); const footer = p.querySelector('[data-testid="req-pane-review-decisions"]'); return { decided: text('[data-testid="req-pane-review-decided"] span'), actions: d === null ? [] : [...d.querySelectorAll('button')].map((b) => b.textContent.trim()), waiting: text('[data-testid="req-pane-review-waiting"]'), refused: text('[data-testid="req-pane-review-refused"]'), alerts: [...p.querySelectorAll('[role="alert"]')].map((a) => a.textContent.trim()), decisions: footer === null ? null : [...footer.querySelectorAll('button')].map((b) => ({ label: b.textContent.trim(), disabled: b.disabled })) }; })()`;
const rr = profile('review-rerun');
// The release and the re-run are taken in two launches of the application. REQ-TRACE-472: "Accepting SHALL suppress the
// disclosure for the remainder of that launch" — so in the launch whose release was accepted, the re-run asks for no
// disclosure at all, and the pane's state while one stands can only be read in a launch whose first run-starting action
// is the re-run (defect note `accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`: until
// 2026-10-02 this stage took both in one launch and relied on the disclosure being due again).
const rerunReviewed = await launch('review-rerun', rr.workspace, rr.local, rr.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    `${CARD_101}@3000`,
    '[data-testid="req-move-control"]@4400',
    '[data-testid="req-confirm"] .btn>>Release@5400',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@6800',
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [`${BOARD_AT}@29000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '30000',
}, 300_000);
expect(rerunReviewed.evals['29000']?.column === 'review', `REQ-TRACE-499: the release never arrived at review before the re-run (${JSON.stringify(rerunReviewed.evals['29000']?.column)})`);
const rerun = await launch('review-rerun-relaunch', rr.workspace, rr.local, rr.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    `${CARD_101}@3000`,
    '[data-testid="req-detail-review"]@5000',
    '[data-testid="req-pane-review-decisions"] .btn>>Rerun@7000',
    '[data-testid="req-pane-review-confirm"] .btn-primary@8600',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@10600',
  ].join(';;'),
  ROTARIS_CAPTURE_KEYS: 'Return@4000',
  ROTARIS_CAPTURE_EVAL_AT: [`${BOARD_AT}@2800`, `${DISCLOSURE_AT}@9600`, `${DECISION_AT}@9800`, `${DECISION_AT}@12400`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '13000',
}, 300_000);
expect(rerun.evals['2800']?.column === 'review', `REQ-TRACE-476: after the relaunch REQ-101 reads ${JSON.stringify(rerun.evals['2800']?.column)}, not review`);
const rerunDisclosure = rerun.evals['9600'];
expect(rerunDisclosure !== null && rerunDisclosure !== undefined && rerunDisclosure.buttons.includes('Start the run'), `REQ-TRACE-472: the review's re-run raised no disclosure (${JSON.stringify(rerunDisclosure)})`);
const waitingPane = rerun.evals['9800'];
expect(waitingPane !== null && waitingPane !== undefined, 'REQ-TRACE-426: the review pane was not open while the re-run waited on the disclosure');
// While the disclosure is on screen nothing has been recorded, and the pane says so — as the decision's state, not as
// a refusal: nothing refused the re-run.
expect(typeof waitingPane.waiting === 'string' && waitingPane.waiting.startsWith('Nothing has been recorded for REQ-101 yet'), `REQ-TRACE-472: while the disclosure stands the pane reads ${JSON.stringify(waitingPane.waiting)}`);
expect(waitingPane.alerts.length === 0, `REQ-TRACE-472: a re-run waiting on its disclosure is drawn as a refusal: ${JSON.stringify(waitingPane.alerts)}`);
const rerunPane = rerun.evals['12400'];
expect(rerunPane !== null && rerunPane !== undefined, 'REQ-TRACE-426: the review pane was not open after the disclosure was accepted');
expect(rerunPane.decided === 'Rerun recorded for REQ-101. The review you were reading is out of date.', `REQ-TRACE-426/472: once the disclosure was accepted the pane's notice reads ${JSON.stringify(rerunPane.decided)} (alerts ${JSON.stringify(rerunPane.alerts)})`);
expect(JSON.stringify(rerunPane.actions) === JSON.stringify(['Reload the review']), `REQ-TRACE-426: the notice after the re-run offers ${JSON.stringify(rerunPane.actions)}, not exactly the reload`);
expect(rerunPane.alerts.length === 0 && rerunPane.waiting === null, `REQ-TRACE-472: after the disclosure was accepted the pane still says ${JSON.stringify({ alerts: rerunPane.alerts, waiting: rerunPane.waiting })}`);
expect(rerunPane.decisions === null, `REQ-TRACE-426: after the re-run the pane still offers the decisions on an out-of-date payload: ${JSON.stringify(rerunPane.decisions)}`);
const rerunRows = deliveryRows(rr.local);
expect(rerunRows !== null, `no delivery store was written under ${rr.local}`);
const rerunHistory = rerunRows.query(`select * from "${rerunRows.tables.find((t) => /history/.test(t))}" order by rowid`).map((e) => String(e.action));
expect(rerunHistory.filter((a) => a === 'rerun').length === 1, `REQ-TRACE-422: the re-run accepted through the disclosure left ${JSON.stringify(rerunHistory)} in the history, not one rerun`);
stage2['review-rerun'] = { disclosure: rerunDisclosure.buttons, waiting: waitingPane.waiting, afterAccept: { decided: rerunPane.decided, actions: rerunPane.actions, alerts: rerunPane.alerts }, history: rerunHistory };

// ── blocker-resume: a blocker cleared from the blockers pane, taken through the launch's disclosure (REQ-TRACE-453/454/472) ──
//
// A resume that returns the card to `ready` starts a run, so the disclosure stands between the answer and the record,
// exactly as it does for the review pane's re-run above. Until 2026-10-01 the blockers pane drew the host's first
// answer ("Nothing has been recorded … yet") as its refusal alert and was never told what the disclosure came to, and
// the host re-read the blocker only on a first answer of `ok` (defect note
// `a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`). The queue is STOPPED
// first, so the release lands in `ready` without a run and the card can be held there: a hold out of `ready` is the
// blocker whose resume starts a run. Each disclosure is accepted with "Start the run", never "always", so the
// resume's own disclosure is due again in the next launch, where the resume is taken (REQ-TRACE-472).
/** The blockers pane while the answer waits on the disclosure, and once it has been answered. */
const BLOCKERS_AT = `(() => { const p = document.querySelector('[data-testid="req-pane-blockers"]'); if (p === null) return null; const text = (sel) => { const el = p.querySelector(sel); return el === null ? null : el.textContent.trim(); }; return { title: text('.req-pane__title'), none: text('[data-testid="req-pane-blockers-none"]'), waiting: text('[data-testid="req-pane-blockers-waiting"]'), refused: text('[data-testid="req-pane-blockers-refused"]'), alerts: [...p.querySelectorAll('[role="alert"]')].map((a) => a.textContent.trim()), answers: [...p.querySelectorAll('[data-testid="req-pane-blockers-paths"] button, .req-pane__options button')].map((b) => ({ label: b.textContent.trim(), disabled: b.disabled })) }; })()`;
/**
 * The hold, by the one route the board offers into the blocked column: a drag (the keyboard picker lists the delivery
 * states, and `blocked` is not one). As in `drop`, it is DOM drag events carrying a `DataTransfer` through the board's
 * own handlers. The blocked column is the last of seven and outside the columns area's viewport at 1264 px, so it is
 * scrolled into view between the drag's start and its drop, exactly as a person's drag would scroll the area; an empty
 * column is folded to a rail once anything has left the backlog, and a rail a drag enters opens for the drop.
 * The reason dialog is React's to draw after the drop: since fin34 it is waited for, up to 3 s of frames, rather than read
 * one frame later, which went red once at landing under load (fin30's review; the same bounded wait as `revealUntilFocused`).
 */
const DRAG_TO_BLOCKED = `(async () => { const board = window.__rotarisBoard; if (!board || typeof board.reveal !== 'function') return 'no observable'; const revealed = board.reveal('REQ-101'); const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); await frame(); const card = document.querySelector('[data-req-card="REQ-101"]'); if (card === null) return { revealed, card: false }; const dt = new DataTransfer(); const ev = (type, el) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })); ev('dragstart', card); await frame(); const slot = document.querySelector('[data-testid="req-columns"] > [data-column="blocked"]'); if (slot === null) return { revealed, slot: false }; slot.scrollIntoView({ block: 'nearest', inline: 'nearest' }); await frame(); await new Promise((r) => setTimeout(r, 400)); await frame(); const rail = document.querySelector('[data-testid="req-rail"][data-column="blocked"]'); if (rail !== null) { ev('dragenter', rail); await frame(); } const target = document.querySelector('[data-testid="req-column"][data-column="blocked"]'); if (target === null) return { revealed, rail: rail !== null, target: false }; ev('dragenter', target); ev('dragover', target); await frame(); const dragging = document.querySelector('[data-testid="req-columns"]')?.getAttribute('data-dragging'); ev('drop', target); ev('dragend', card); const until = performance.now() + 3000; do { await frame(); } while (document.querySelector('[data-testid="req-reason-dialog"]') === null && performance.now() < until); return { revealed, rail: rail !== null, dragging, types: [...dt.types], dialog: document.querySelector('[data-testid="req-reason-dialog"]') !== null }; })()`;
const br = profile('blocker-resume');
const held = await launch('blocker-resume', br.workspace, br.local, br.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="req-queue-open"]@3000',
    '[aria-label="Stop the queue"]@4000',
    '[data-testid="req-pane-close"]@4800',
    `${CARD_101}@5600`,
    '[data-testid="req-move-control"]@6800',
    '[data-testid="req-confirm"] .btn>>Release@7800',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@9000',
    // The hold's reason is typed into the dialog's own field (it takes the focus) and the hold is confirmed.
    '[data-testid="req-reason-dialog"] .btn-primary@13200',
  ].join(';;'),
  ROTARIS_CAPTURE_TYPE_AT: 'Waiting on a vendor answer@12200',
  ROTARIS_CAPTURE_EVAL_AT: [`${BOARD_AT}@10400`, `${DRAG_TO_BLOCKED}@11000`, `${REVEAL_101}@14000`, `${BOARD_AT}@14200`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '15000',
}, 300_000);
// The resume is taken in the NEXT launch: REQ-TRACE-472's plain acceptance suppresses the disclosure for the remainder of
// the launch it was given in, so only a launch whose first run-starting action is the resume shows the pane waiting on
// one (defect note `accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`; until 2026-10-02
// this stage took the release and the resume in one launch and relied on the disclosure being due again). The stop is
// not persisted (REQ-TRACE-480), so the relaunch stops the queue again before the resume, to read the card in `ready`.
const resumed = await launch('blocker-resume-relaunch', br.workspace, br.local, br.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="req-queue-open"]@2600',
    '[aria-label="Stop the queue"]@3400',
    '[data-testid="req-pane-close"]@4000',
    // The blocked column lies outside the columns area's viewport at 1264 px: the strip's "Go to card" reveals it.
    '[data-testid="req-blocked-row"][data-req="REQ-101"] .btn>>Go to card@4800',
    `${CARD_101}@5600`,
    '[data-testid="req-detail-blockers"]@7200',
    '[aria-label="Clear the blocker"]@8600',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@10600',
    // The dispatch (defect note `a-card-held-out-of-ready-and-resumed-provisions-its-unit-worktree-a-second-time.md`):
    // the queue is started again after the resume's reads, and the run must begin on the tree the release provisioned.
    '[data-testid="req-queue-open"]@14200',
    '[aria-label="Start the queue"]@15200',
  ].join(';;'),
  // The focused card opens its own detail with Enter (REQ-TRACE-484); the harness sends single clicks only. A card is
  // read through the board's own reveal first (REQ-TRACE-364): the column it sits in may lie outside the viewport.
  ROTARIS_CAPTURE_KEYS: 'Return@6200',
  ROTARIS_CAPTURE_EVAL_AT: [`${BLOCKERS_AT}@8000`, `${DISCLOSURE_AT}@9600`, `${BLOCKERS_AT}@9800`, `${BLOCKERS_AT}@13200`, `${REVEAL_101}@13300`, `${BOARD_AT}@13400`, `${REVEAL_101}@20100`, `${BOARD_AT}@20200`, `${REVEAL_101}@26100`, `${BOARD_AT}@26200`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '27200',
}, 300_000);
expect(held.evals['10400']?.column === 'ready', `REQ-TRACE-382: with the queue stopped the release left REQ-101 in ${JSON.stringify(held.evals['10400']?.column)}, not ready (feedback ${JSON.stringify(held.evals['10400']?.feedback)})`);
const heldDrag = held.evals['11000'];
expect(heldDrag !== null && typeof heldDrag === 'object' && heldDrag.dragging === 'true' && heldDrag.dialog === true, `REQ-TRACE-389: dropping REQ-101 on the blocked column did not ask for the hold's reason (${JSON.stringify(heldDrag)})`);
expect(held.evals['14200']?.column === 'blocked', `REQ-TRACE-446: the hold out of ready left REQ-101 in ${JSON.stringify(held.evals['14200']?.column)}, not blocked (feedback ${JSON.stringify(held.evals['14200']?.feedback)})`);
const heldPane = resumed.evals['8000'];
expect(heldPane !== null && heldPane !== undefined && heldPane.none === null && heldPane.answers.some((a) => a.label.startsWith('Clear the blocker')), `REQ-TRACE-448: the blockers pane offers no resume for the held REQ-101 (${JSON.stringify(heldPane)})`);
const resumeDisclosure = resumed.evals['9600'];
expect(resumeDisclosure !== null && resumeDisclosure !== undefined && resumeDisclosure.buttons.includes('Start the run'), `REQ-TRACE-472: the resume into ready raised no disclosure (${JSON.stringify(resumeDisclosure)})`);
const resumeWaiting = resumed.evals['9800'];
expect(resumeWaiting !== null && resumeWaiting !== undefined, 'REQ-TRACE-454: the blockers pane was not open while the resume waited on the disclosure');
// While the disclosure is on screen nothing has been recorded, and the pane says so as the answer's state — nothing
// refused the resume — with the answers held until the disclosure is answered.
expect(resumeWaiting.alerts.length === 0, `REQ-TRACE-454/472: a resume waiting on its disclosure is drawn as a refusal: ${JSON.stringify(resumeWaiting.alerts)}`);
expect(typeof resumeWaiting.waiting === 'string' && resumeWaiting.waiting.startsWith('Nothing has been recorded for REQ-101 yet'), `REQ-TRACE-472: while the disclosure stands the blockers pane reads ${JSON.stringify({ waiting: resumeWaiting.waiting, refused: resumeWaiting.refused })}`);
expect(resumeWaiting.answers.filter((a) => a.label.startsWith('Clear the blocker')).every((a) => a.disabled), `REQ-TRACE-472: the resume is offered again while its disclosure stands: ${JSON.stringify(resumeWaiting.answers)}`);
const resumeAfter = resumed.evals['13200'];
expect(resumeAfter !== null && resumeAfter !== undefined, 'REQ-TRACE-454: the blockers pane was not open after the disclosure was accepted');
expect(resumeAfter.alerts.length === 0 && resumeAfter.refused === null && resumeAfter.waiting === null, `REQ-TRACE-453/472: after the disclosure was accepted the blockers pane still says ${JSON.stringify({ alerts: resumeAfter.alerts, waiting: resumeAfter.waiting })}`);
// The host re-reads the blocker once the resume is taken, and a cleared blocker is REQ-TRACE-447's positive statement.
expect(resumeAfter.none === 'Nothing is holding REQ-101.', `REQ-TRACE-447/453: once the resume was taken the pane was not re-read: ${JSON.stringify(resumeAfter)}`);
expect(resumed.evals['13400']?.column === 'ready', `REQ-TRACE-453: the resume returned REQ-101 to ${JSON.stringify(resumed.evals['13400']?.column)}, not ready, the state it was held out of`);
const resumeRows = deliveryRows(br.local);
expect(resumeRows !== null, `no delivery store was written under ${br.local}`);
const resumeHistory = resumeRows.query(`select * from "${resumeRows.tables.find((t) => /history/.test(t))}" order by rowid`).map((e) => String(e.action));
expect(resumeHistory.filter((a) => a === 'resume').length === 1, `REQ-TRACE-453/472: the resume accepted through the disclosure left ${JSON.stringify(resumeHistory)} in the history, not one resume`);
// REQ-TRACE-464/453 — the dispatch. Until 2026-10-02 the resume provisioned u1 a second time, `createWorktree` refused
// the existing path, the soft failure replaced the launch with one that had no worktree, and the card read "REQ-101
// moved, and no run began: Worktree path already exists: …" while no claim could ever take it: this stage asserted the
// pane and the history and passed with that defect present. The resume now takes over the release's tree, and once the
// queue is started a run begins on it.
const dispatchReads = ['13400', '20200', '26200'].map((k) => resumed.evals[k]).filter((v) => v && typeof v === 'object');
const noRun = dispatchReads.flatMap((t) => t.feedback ?? []).filter((f) => /no run began/i.test(f));
expect(noRun.length === 0, `REQ-TRACE-464/463: the resumed card says no run began: ${JSON.stringify(noRun)}`);
expect(!/Worktree path already exists/.test(held.log + resumed.log), 'REQ-TRACE-464: the resume provisioned the unit\'s worktree a second time (the log carries "Worktree path already exists")');
const dispatched = ['20200', '26200'].map((k) => resumed.evals[k]?.column);
expect(dispatched.some((c) => c === 'running' || c === 'review' || c === 'done'), `REQ-TRACE-464/453: once the queue was started the resumed REQ-101 never became a run — it read ${JSON.stringify(dispatched)}`);
const resumeRuns = resumeRows.query("select * from delivery_runs where req_id = 'REQ-101'");
const resumeTrees = resumeRows.query("select * from delivery_worktrees where req_id = 'REQ-101'");
expect(resumeRuns.length === 1 && resumeRuns[0].unit === 'u1', `REQ-TRACE-464: the resumed REQ-101 has run rows ${JSON.stringify(resumeRuns.map((x) => x.unit))}, not one run of u1`);
expect(resumeTrees.length === 1 && String(resumeTrees[0].path).endsWith('-u1') && resumeTrees[0].ref === resumeRuns[0].worktree_ref, `REQ-TRACE-464/REQ-GIT-140: the run did not begin on the one tree the release provisioned (trees ${JSON.stringify(resumeTrees.map((t) => t.path))}, run on ${JSON.stringify(resumeRuns[0].worktree_ref)})`);
stage2['blocker-resume'] = { disclosure: resumeDisclosure.buttons, waiting: resumeWaiting.waiting, afterAccept: { none: resumeAfter.none, alerts: resumeAfter.alerts }, column: resumed.evals['13400'].column, history: resumeHistory, dispatched, run: { unit: resumeRuns[0].unit, worktree: resumeTrees[0].path } };

// ── ready-restart: a card resting in `ready` across a quit and a relaunch, disclosed and started from the queue (REQ-TRACE-472/482/464) ──
//
// Defect note `a-card-resting-in-ready-across-a-restart-can-never-be-started.md`. The first launch stops the queue and
// releases REQ-101 through the disclosure, so it rests in `ready` on its provisioned tree with no run begun, and quits.
// The launch the workspace service held lived in its memory only, so until 2026-10-02 the relaunched queue said the
// disclosure was due, its "Disclose and start" recorded nothing (the release arm rewrote only a launch it held), and no
// claim ever took the card. The relaunch must show the disclosure, take it from the queue, and begin the run on the
// one tree the release provisioned.
const QUEUE_AT = `(() => { const p = document.querySelector('[data-testid="req-pane-queue"]'); if (p === null) return null; return { rows: [...p.querySelectorAll('[data-testid="req-pane-queue-row"]')].map((r) => ({ id: (r.querySelector('.req-pane__mono') || {}).textContent, state: r.getAttribute('data-state'), reason: (r.querySelector('[data-testid="req-pane-queue-reason"]') || {}).textContent ?? null, buttons: [...r.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()) })), stopped: p.querySelector('[aria-label="Start the queue"]') !== null }; })()`;
const restartProfile = profile('ready-restart');
const resting = await launch('ready-restart', restartProfile.workspace, restartProfile.local, restartProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="req-queue-open"]@3000',
    '[aria-label="Stop the queue"]@4000',
    '[data-testid="req-pane-close"]@4800',
    `${CARD_101}@5600`,
    '[data-testid="req-move-control"]@6800',
    '[data-testid="req-confirm"] .btn>>Release@7800',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@9000',
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [`${REVEAL_101}@11800`, `${BOARD_AT}@12000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '13000',
}, 180_000);
expect(resting.evals['12000']?.column === 'ready', `REQ-TRACE-382: with the queue stopped the release left REQ-101 in ${JSON.stringify(resting.evals['12000']?.column)}, not ready (feedback ${JSON.stringify(resting.evals['12000']?.feedback)})`);
const restingRows = deliveryRows(restartProfile.local);
expect(restingRows !== null, `no delivery store was written under ${restartProfile.local}`);
const restingTrees = restingRows.query("select * from delivery_worktrees where req_id = 'REQ-101'");
expect(restingTrees.length === 1 && String(restingTrees[0].path).endsWith('-u1') && existsSync(restingTrees[0].path), `REQ-TRACE-464: the release did not leave one tree of u1 on disk (${JSON.stringify(restingTrees.map((t) => t.path))})`);
expect(restingRows.query("select * from delivery_runs where req_id = 'REQ-101'").length === 0, 'REQ-TRACE-479: a run began with the queue stopped');
const relaunchedQueue = await launch('ready-restart-relaunch', restartProfile.workspace, restartProfile.local, restartProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="req-queue-open"]@3000',
    '[aria-label="Show the disclosure and start REQ-101"]@4600',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@6400',
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [`${QUEUE_AT}@4000`, `${DISCLOSURE_AT}@5800`, `${REVEAL_101}@11900`, `${BOARD_AT}@12000`, `${REVEAL_101}@17900`, `${BOARD_AT}@18000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '19000',
}, 180_000);
const restartQueue = relaunchedQueue.evals['4000'];
const restartEntry = restartQueue?.rows?.find((r) => r.id === 'REQ-101');
// REQ-TRACE-480: the stop is not persisted; REQ-TRACE-472/497: the lost launch's disclosure is asked for again, and nothing has begun.
expect(restartQueue?.stopped === false, `REQ-TRACE-480: the relaunched queue reads stopped (${JSON.stringify(restartQueue)})`);
expect(restartEntry?.state === 'deferred' && /have not been disclosed and accepted/.test(restartEntry.reason ?? '') && restartEntry.buttons.includes('Show the disclosure and start REQ-101'), `REQ-TRACE-472: after the relaunch the queue entry of REQ-101 reads ${JSON.stringify(restartEntry)}`);
const restartDisclosure = relaunchedQueue.evals['5800'];
expect(restartDisclosure !== null && restartDisclosure !== undefined && restartDisclosure.buttons.includes('Start the run'), `REQ-TRACE-472: "Disclose and start" raised no disclosure (${JSON.stringify(restartDisclosure)})`);
const restartColumns = ['12000', '18000'].map((k) => relaunchedQueue.evals[k]?.column);
expect(restartColumns.some((c) => c === 'running' || c === 'review' || c === 'done'), `REQ-TRACE-472/482: the disclosure accepted from the relaunched queue started nothing — REQ-101 read ${JSON.stringify(restartColumns)} (feedback ${JSON.stringify(relaunchedQueue.evals['18000']?.feedback)})`);
expect(!/Worktree path already exists/.test(relaunchedQueue.log), 'REQ-TRACE-464: the relaunch provisioned the unit\'s worktree a second time');
expect(/REQ-101 unit u1 takes over its worktree/.test(relaunchedQueue.log), 'REQ-TRACE-464: the relaunch\'s log does not say the recorded tree was taken over');
const restartRows = deliveryRows(restartProfile.local);
const restartRuns = restartRows.query("select * from delivery_runs where req_id = 'REQ-101'");
const restartTrees = restartRows.query("select * from delivery_worktrees where req_id = 'REQ-101'");
expect(restartRuns.length === 1 && restartRuns[0].unit === 'u1', `REQ-TRACE-464: the relaunched REQ-101 has run rows ${JSON.stringify(restartRuns.map((x) => x.unit))}, not one run of u1`);
expect(restartTrees.length === 1 && restartTrees[0].path === restingTrees[0].path && restartTrees[0].ref === restartRuns[0].worktree_ref, `REQ-TRACE-464/REQ-GIT-140: the run did not begin on the tree the release provisioned before the quit (trees ${JSON.stringify(restartTrees.map((t) => t.path))}, run on ${JSON.stringify(restartRuns[0].worktree_ref)})`);
stage2['ready-restart'] = { before: resting.evals['12000'].column, entryAfterRelaunch: { state: restartEntry.state, reason: restartEntry.reason }, disclosure: restartDisclosure.buttons, columns: restartColumns, run: { unit: restartRuns[0].unit, worktree: restartTrees[0].path } };

// ── ready-restart-automatic: an automatic queue picks a resting card up at the relaunch, with no act (REQ-TRACE-476/482) ──
//
// Defect note `an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`. The workspace
// schedules automatically (`requirements.scheduling.mode: automatic`, REQ-CONFIG-196). The first launch stops the queue
// and releases REQ-101 through the disclosure accepted PERMANENTLY, so it rests in `ready` on its tree and the
// disclosure is suppressed in later launches; the application quits. Relaunched, nothing is clicked at all: the queue
// resumes where it stopped (REQ-TRACE-476) and the system itself picks the candidate up (REQ-TRACE-482). Until the
// repair nothing dispatched at a workspace open, so the card rested in `ready` until a person acted.
const CARD_AT = (id) => `(() => { const b = window.__rotarisBoard; if (b && typeof b.reveal === 'function') b.reveal('${id}'); const el = document.querySelector('[data-req-card="${id}"]'); return { column: el === null ? null : el.getAttribute('data-column'), feedback: [...document.querySelectorAll('[data-testid="req-feedback"]')].map((f) => f.textContent.trim()) }; })()`;
const autoProfile = profile('ready-restart-automatic');
writeFileSync(join(autoProfile.workspace, '.rotaris', 'agents.yaml'), `${readFileSync(join(autoProfile.workspace, '.rotaris', 'agents.yaml'), 'utf8')}requirements:\n  scheduling:\n    mode: automatic\n`);
const autoResting = await launch('ready-restart-automatic', autoProfile.workspace, autoProfile.local, autoProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="req-queue-open"]@3000',
    '[aria-label="Stop the queue"]@4000',
    '[data-testid="req-pane-close"]@4800',
    `${CARD_101}@5600`,
    '[data-testid="req-move-control"]@6800',
    '[data-testid="req-confirm"] .btn>>Release@7800',
    '[data-testid="req-pane-disclosure"] .btn>>Start, and do not show this again@9000',
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [`${CARD_AT('REQ-101')}@12000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '13000',
}, 180_000);
expect(autoResting.evals['12000']?.column === 'ready', `REQ-TRACE-479: with the queue stopped the release left REQ-101 in ${JSON.stringify(autoResting.evals['12000'])}, not ready`);
const autoRestingRows = deliveryRows(autoProfile.local);
expect(autoRestingRows !== null, `no delivery store was written under ${autoProfile.local}`);
const autoRestingTrees = autoRestingRows.query("select * from delivery_worktrees where req_id = 'REQ-101'");
expect(autoRestingTrees.length === 1 && existsSync(autoRestingTrees[0].path), `REQ-TRACE-464: the release did not leave one tree on disk (${JSON.stringify(autoRestingTrees.map((t) => t.path))})`);
expect(autoRestingRows.query("select * from delivery_runs where req_id = 'REQ-101'").length === 0, 'REQ-TRACE-479: a run began with the queue stopped');
const autoRelaunch = await launch('ready-restart-automatic-relaunch', autoProfile.workspace, autoProfile.local, autoProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_EVAL_AT: [`${CARD_AT('REQ-101')}@9000`, `${CARD_AT('REQ-101')}@15000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '16000',
}, 180_000);
const autoColumns = ['9000', '15000'].map((k) => autoRelaunch.evals[k]?.column);
expect(autoColumns.some((c) => c === 'running' || c === 'review' || c === 'done'), `REQ-TRACE-476/482: after the relaunch the automatic queue started nothing with no act — REQ-101 read ${JSON.stringify(autoColumns)} (feedback ${JSON.stringify(autoRelaunch.evals['15000']?.feedback)})`);
expect(/REQ-101 unit u1 takes over its worktree/.test(autoRelaunch.log), 'REQ-TRACE-464: the relaunch\'s log does not say the recorded tree was taken over');
const autoRows = deliveryRows(autoProfile.local);
const autoRuns = autoRows.query("select * from delivery_runs where req_id = 'REQ-101'");
const autoTrees = autoRows.query("select * from delivery_worktrees where req_id = 'REQ-101'");
expect(autoRuns.length === 1 && autoRuns[0].unit === 'u1' && autoRuns[0].permissions === 'permissive', `REQ-TRACE-464/472: the relaunched REQ-101 has run rows ${JSON.stringify(autoRuns.map((x) => ({ unit: x.unit, permissions: x.permissions })))}, not one permissive run of u1`);
expect(autoTrees.length === 1 && autoTrees[0].path === autoRestingTrees[0].path && autoTrees[0].ref === autoRuns[0].worktree_ref, `REQ-TRACE-464: the run did not begin on the tree the release provisioned before the quit (trees ${JSON.stringify(autoTrees.map((t) => t.path))})`);
stage2['ready-restart-automatic'] = { before: autoResting.evals['12000'].column, columns: autoColumns, run: { unit: autoRuns[0].unit, permissions: autoRuns[0].permissions, worktree: autoTrees[0].path } };

// ── disclosure-launch: one acceptance suppresses the disclosure for the rest of the launch, and the next launch asks again (REQ-TRACE-472) ──
//
// Defect note `accepting-the-disclosure-once-does-not-suppress-it-for-the-rest-of-the-launch.md`. REQ-101 is released
// and its disclosure accepted once ("Start the run", not permanently). REQ-102 is released next in the same launch: no
// disclosure may be shown, and its run starts with the permissions the first acceptance disclosed. Relaunched, REQ-103's
// release must show the disclosure again: a plain acceptance holds for its own launch only.
const CARD_102 = '[data-req-card="REQ-102"]';
const CARD_103 = '[data-req-card="REQ-103"]';
const twoProfile = profile('disclosure-launch');
const twoCards = await launch('disclosure-launch', twoProfile.workspace, twoProfile.local, twoProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    `${CARD_101}@3000`,
    '[data-testid="req-move-control"]@4200',
    '[data-testid="req-confirm"] .btn>>Release@5200',
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@6400',
    `${CARD_102}@10000`,
    '[data-testid="req-move-control"]@11200',
    '[data-testid="req-confirm"] .btn>>Release@12200',
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [`${DISCLOSURE_AT}@5800`, `${CARD_AT('REQ-102')}@9800`, `${DISCLOSURE_AT}@13400`, `${CARD_AT('REQ-102')}@18000`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '19000',
}, 180_000);
const firstDisclosure = twoCards.evals['5800'];
expect(firstDisclosure !== null && firstDisclosure !== undefined && firstDisclosure.buttons.includes('Start the run'), `REQ-TRACE-472: the first run-starting action of the launch raised no disclosure (${JSON.stringify(firstDisclosure)})`);
expect(twoCards.evals['9800']?.column === 'backlog', `the second card was not in the backlog before its release (${JSON.stringify(twoCards.evals['9800'])})`);
expect(twoCards.evals['13400'] === null, `REQ-TRACE-472: after one acceptance the second card's release showed the disclosure again within the same launch (${JSON.stringify(twoCards.evals['13400'])})`);
const secondColumn = twoCards.evals['18000']?.column;
expect(secondColumn === 'running' || secondColumn === 'review' || secondColumn === 'done', `REQ-TRACE-472/482: the second card's release started nothing — REQ-102 read ${JSON.stringify(twoCards.evals['18000'])}`);
const twoRows = deliveryRows(twoProfile.local);
const secondRuns = twoRows.query("select * from delivery_runs where req_id = 'REQ-102'");
expect(secondRuns.length === 1 && secondRuns[0].permissions === 'permissive', `REQ-TRACE-472: the second card's run carries ${JSON.stringify(secondRuns.map((r) => r.permissions))}, not the permissive grant the first acceptance disclosed`);
const nextLaunch = await launch('disclosure-launch-relaunch', twoProfile.workspace, twoProfile.local, twoProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    `${CARD_103}@3000`,
    '[data-testid="req-move-control"]@4200',
    '[data-testid="req-confirm"] .btn>>Release@5200',
  ].join(';;'),
  ROTARIS_CAPTURE_EVAL_AT: [`${DISCLOSURE_AT}@6400`].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '7400',
}, 180_000);
const relaunchDisclosure = nextLaunch.evals['6400'];
expect(relaunchDisclosure !== null && relaunchDisclosure !== undefined && relaunchDisclosure.buttons.includes('Start the run'), `REQ-TRACE-472: in the next launch the disclosure was not due again (${JSON.stringify(relaunchDisclosure)})`);
stage2['disclosure-launch'] = { first: firstDisclosure.buttons, secondShown: twoCards.evals['13400'], second: { column: secondColumn, permissions: secondRuns[0].permissions }, nextLaunch: relaunchDisclosure.buttons };

// ── panes and the graph: the registry's contract, and the rest of REQ-TRACE-497 a proof can reach ────────────────
// Defect `R2-6`, and the reason this read carries geometry at all: every assertion below once read attributes through
// `querySelectorAll`, so ten node controls that were in the DOM, focusable and PAINTED NOWHERE passed the whole stage.
// The wrapper's own box and the first node's box inside it are read here; a graph whose controls are clipped to
// nothing now fails where it is drawn rather than where it is queried.
const RECT = `(el) => { if (el === null) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }`;
const GRAPH_AT = `(() => { const rect = ${RECT}; const g = document.querySelector('[data-testid="req-graph"]'); const b = window.__rotarisBoard; if (g === null) return null; const wrap = document.querySelector('[data-testid="req-graph-nodes"]'); const firstNode = document.querySelector('[data-testid="req-graph-node"]'); return { centre: g.getAttribute('data-centre'), depth: Number(g.getAttribute('data-depth')), summary: (document.querySelector('[data-testid="req-graph-summary"]') || {}).textContent, bound: (document.querySelector('[data-testid="req-graph-bound"]') || {}).textContent, nodes: [...document.querySelectorAll('[data-testid="req-graph-node"]')].map((n) => ({ id: n.getAttribute('data-node'), kind: n.getAttribute('data-kind'), resolved: n.getAttribute('data-resolved') === 'true', navigable: n.getAttribute('data-navigable') === 'true', disabled: n.disabled })), columns: [...document.querySelectorAll('[data-testid="req-graph-column"]')].map((c) => c.getAttribute('data-depth')), edges: [...document.querySelectorAll('[data-testid="req-graph-edge"]')].map((e) => e.textContent.trim()), observable: b ? b.graph : null, wrapper: rect(wrap), firstNode: rect(firstNode), viewport: { width: window.innerWidth, height: window.innerHeight } }; })()`;
const SET_DEPTH = `(() => { const el = document.querySelector('[data-testid="req-graph-depth"]'); if (el === null) return 'absent'; const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(el, '3'); el.dispatchEvent(new Event('input', { bubbles: true })); return { min: el.getAttribute('min'), max: el.getAttribute('max'), description: el.getAttribute('aria-description') }; })()`;
const EPIC_AND_RAIL = `(() => { const epic = document.querySelector('[data-testid="req-epic"]'); const rail = document.querySelector('[data-testid="req-rail"]'); const styleOf = (el) => { const s = getComputedStyle(el); return { writingMode: s.writingMode, transform: s.transform }; }; return { epic: epic === null ? null : { draggable: epic.getAttribute('draggable'), actions: epic.querySelectorAll('button[data-req-move], [data-testid="req-move-control"]').length }, rail: rail === null ? null : styleOf(rail) }; })()`;
// Defect `R2-5`, found by this proof against itself: the first version read the refusal in the SAME tick as the
// dispatch, before React had re-rendered the card, so it saw an empty feedback list and reported a silent refusal
// where the product had refused in words. The read now waits two frames, as every other driven assertion here does.
const DRAG_ON_EPIC_AXIS = `(async () => { const card = document.querySelector('[data-req-card="REQ-101"]'); if (card === null) return 'absent'; const dt = new DataTransfer(); const ev = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }); card.dispatchEvent(ev); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const area = document.querySelector('[data-testid="req-columns"]'); return { defaultPrevented: ev.defaultPrevented, types: [...dt.types], dragging: area === null ? null : area.getAttribute('data-dragging'), feedback: [...document.querySelectorAll('[data-testid="req-feedback"]')].map((f) => f.textContent.trim()) }; })()`;

const paneProfile = profile('panes');
const panes = await launch('panes', paneProfile.workspace, paneProfile.local, paneProfile.preferences, {
  ROTARIS_CAPTURE_RESIZE: '1264x800@300',
  ROTARIS_CAPTURE_VIEWS: '4@1200',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="req-queue-open"]@3000',
    '[data-testid="req-pane-close"]@4200',
    '[data-testid="req-queue-open"]@4800',
    '[data-testid="req-pane-close"]@5600',
    `${CARD_101}@6200`,
    '[data-testid="req-detail-graph"]@7600',
    '[data-testid="req-graph-back"]@11000',
  ].join(';;'),
  ROTARIS_CAPTURE_KEYS: 'Return@6800',
  ROTARIS_CAPTURE_SELECT: '[data-testid="req-axis"]>>epic@11600',
  ROTARIS_CAPTURE_EVAL_AT: [`${BOARD_AT}@3600`, `${BOARD_AT}@5200`, `${GRAPH_AT}@8400`, `${SET_DEPTH}@9000`, `${GRAPH_AT}@9800`, `${EPIC_AND_RAIL}@11400`, `${DRAG_ON_EPIC_AXIS}@12400`].join(';;'),
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="req-pane-queue"]@3800',
  ROTARIS_CAPTURE_AFTER_MS: '13200',
}, 240_000);

const firstOpen = panes.evals['3600'];
const secondOpen = panes.evals['5200'];
const queuePane = panes.inspects['[data-testid="req-pane-queue"]@3800'];
expect(queuePane && queuePane.matches.length === 1, 'REQ-TRACE-375: the queue pane did not open from the board');
const queueMount = (firstOpen.panes ?? []).find((p) => p.key === 'queue');
expect(firstOpen.openPane === 'queue' && queueMount && queueMount.installed === true, `REQ-TRACE-369: the queue pane reports ${JSON.stringify(queueMount)} after being opened`);
for (const p of firstOpen.panes ?? []) if (p.key !== 'queue') expect(p.installed === false, `REQ-TRACE-375: asking about ${p.key} built it (${JSON.stringify(p)})`);
const queueAgain = (secondOpen.panes ?? []).find((p) => p.key === 'queue');
expect(queueAgain && queueAgain.openedAt === queueMount.openedAt, `REQ-TRACE-369: re-opening the queue pane built a second one (${queueMount.openedAt} then ${queueAgain?.openedAt})`);

const graph = panes.evals['8400'];
expect(graph !== null && graph.centre === 'REQ-101', `REQ-TRACE-322: the graph did not centre on REQ-101 (${JSON.stringify(graph)})`);
expect(graph.depth === 2 && graph.bound.includes('of 3'), `REQ-TRACE-323: the graph opened at depth ${graph.depth} and states ${JSON.stringify(graph.bound)}`);
expect(graph.summary.includes('Centred on REQ-101') && /at depth 2/.test(graph.summary), `REQ-TRACE-327: the contents summary reads ${JSON.stringify(graph.summary)}`);
expect(graph.nodes.length > 1 && graph.edges.length > 0, `REQ-TRACE-322: the graph drew ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
expect(graph.nodes.every((n) => ['requirement', 'epic', 'implementation', 'test'].includes(n.kind)), `REQ-TRACE-326: a node carries a kind outside the four (${JSON.stringify(graph.nodes.map((n) => n.kind))})`);
for (const n of graph.nodes) expect(n.navigable === ((n.kind === 'requirement' || n.kind === 'epic') && n.resolved), `REQ-TRACE-326: ${n.id} is ${n.kind}, resolved ${n.resolved}, navigable ${n.navigable}`);
for (const n of graph.nodes) expect(n.disabled === !n.navigable, `REQ-TRACE-326: ${n.id} is navigable ${n.navigable} and its control is disabled ${n.disabled}`);
expect(graph.observable && graph.observable.nodes === graph.nodes.length && graph.observable.edges === graph.edges.length, `the board's own model reports ${JSON.stringify(graph.observable)} against ${graph.nodes.length} nodes and ${graph.edges.length} edges on screen`);
const depthControl = panes.evals['9000'];
expect(depthControl && depthControl.min === '1' && depthControl.max === '3', `REQ-TRACE-323: the depth control's range is ${JSON.stringify(depthControl)}`);
expect(String(depthControl.description).includes('maximum of 3'), `REQ-TRACE-323: the depth control's accessible description reads ${JSON.stringify(depthControl.description)}`);
const deeper = panes.evals['9800'];
expect(deeper && deeper.depth === 3 && /at depth 3/.test(deeper.summary), `REQ-TRACE-323: after asking for depth 3 the graph reads ${JSON.stringify({ depth: deeper?.depth, summary: deeper?.summary })}`);
// This fixture SATURATES at depth 2: REQ-101's neighbourhood is its epic and that epic's five other children, and
// none of those carries an epic of its own, so the third level reaches nothing new. The old assertion here read
// `deeper.nodes.length >= graph.nodes.length` and passed with ten against ten, which a depth control that ignored
// the number entirely would also have passed. The saturation is asserted as the fact it is — exactly equal, with the
// summary and the bound statement beside it carrying the weight that the value was honoured — and the claim that a
// deeper walk ADMITS more is asserted where a fixture can be built for it, in `graph.test.ts`'s chain.
expect(deeper.nodes.length === graph.nodes.length, `the fixture's neighbourhood of REQ-101 is exhausted at depth 2, so depth 3 must show the same ${graph.nodes.length} nodes; it showed ${deeper.nodes.length}`);
expect(deeper.bound.includes('of 3') && deeper.bound !== graph.bound, `REQ-TRACE-324: the bound statement did not change when the depth did (${JSON.stringify({ at2: graph.bound, at3: deeper.bound })})`);
// REQ-TRACE-328, measured rather than queried (defect `R2-6`): the depth columns are LAID OUT, not merely present.
for (const [label, g] of [['depth 2', graph], ['depth 3', deeper]]) {
  expect(g.wrapper !== null && g.wrapper.h > 0 && g.wrapper.w > 0, `REQ-TRACE-328 at ${label}: the depth columns occupy ${JSON.stringify(g.wrapper)} — the node controls are in the DOM and are painted nowhere`);
  expect(g.firstNode !== null && g.firstNode.h > 0 && g.firstNode.w > 0, `REQ-TRACE-328 at ${label}: the first node control occupies ${JSON.stringify(g.firstNode)}`);
  expect(g.firstNode.y >= g.wrapper.y - 0.5 && g.firstNode.y + g.firstNode.h <= g.wrapper.y + g.wrapper.h + 0.5, `REQ-TRACE-328 at ${label}: the first node ${JSON.stringify(g.firstNode)} is clipped by its columns wrapper ${JSON.stringify(g.wrapper)}`);
  expect(g.wrapper.y >= 0 && g.wrapper.y < g.viewport.height, `REQ-TRACE-328 at ${label}: the columns wrapper starts outside the window (${JSON.stringify({ wrapper: g.wrapper, viewport: g.viewport })})`);
}

const shapes = panes.evals['11400'];
expect(shapes && shapes.epic !== null, 'the epic card is not on screen');
expect(shapes.epic.draggable !== 'true' && shapes.epic.actions === 0, `REQ-TRACE-497: the epic card offers a delivery action or can be dragged (${JSON.stringify(shapes.epic)})`);
// This profile folds nothing, so there is no rail here to read and the clause that needs one is asserted in `fold`.
// What was here before was `if (shapes.rail !== null) expect(…)`, which asserted NOTHING for exactly that reason —
// the gate found it passing on a null. The absence is asserted instead, so that a rail appearing in this profile
// (a fold arriving by preference, a default changing) fails here and is looked at rather than silently re-guarded.
expect(shapes.rail === null, `no column is folded in the panes profile, so a rail here means the profile changed: ${JSON.stringify(shapes.rail)}`);
const dragged = panes.evals['12400'];
expect(dragged !== 'absent' && dragged.dragging !== 'true' && dragged.types.length === 0, `REQ-TRACE-497: a card was dragged on the epic axis (${JSON.stringify(dragged)})`);
expect((dragged.feedback ?? []).some((f) => f.includes('Dragging moves a requirement between delivery states')), `REQ-TRACE-297: the refusal was silent (${JSON.stringify(dragged.feedback)})`);
stage2.panes = {
  registry: { first: queueMount, second: queueAgain, others: (firstOpen.panes ?? []).filter((p) => p.key !== 'queue').map((p) => p.installed) },
  // The geometry is RECORDED as well as asserted: defect `R2-6` passed every attribute assertion this stage had, so
  // the boxes are what a later reader needs to see to know the graph was drawn rather than merely present.
  graph: { centre: graph.centre, depth: graph.depth, nodes: graph.nodes.length, edges: graph.edges.length, kinds: [...new Set(graph.nodes.map((n) => n.kind))], columns: graph.columns, deeperNodes: deeper.nodes.length, wrapper: graph.wrapper, firstNode: graph.firstNode, wrapperAtDepth3: deeper.wrapper },
  epic: shapes.epic, rail: shapes.rail, dragOnEpicAxis: { dragging: dragged.dragging, feedback: (dragged.feedback ?? [])[0] ?? null },
};

results.stage2 = stage2;
// Part R2 — the deferred failure, reported now that everything else has been measured and recorded.
if (deferred.length > 0) {
  results.passed = false;
  results.deferred = deferred;
  writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  for (const [name, value] of Object.entries(stage2)) console.log(`  ${name}: ${JSON.stringify(value).slice(0, 220)}`);
  console.error(deferred.join('\n'));
  process.exit(1);
}
results.passed = true;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
for (const [name, value] of Object.entries(stage2)) console.log(`  PASS  ${name}: ${JSON.stringify(value).slice(0, 220)}`);
console.log(`requirements-proof PASSED (${results.tests} tests in ${elapsedMs} ms; board ${paintMs} ms on the fixture, ${scalePaint} ms on ${scaleProfile.requirements} requirements) ${join(output, 'results.json')}`);
