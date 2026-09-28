/**
 * The Library proof (Part X): the sixth primary view of REQ-SHELL-023, its shell and its Prompts tab, measured
 * against the store rather than reasoned about (REQ-LIBRARY-102..107, 137..141; REQ-CHAT-042/044; REQ-SHELL-069).
 * Scripted client, scratch stores, six launches over four scratch profiles so that no launch's rows can be
 * mistaken for another's:
 *
 *   1. shell    — Ctrl+6 shows the Library: the title, the one search field with its stated placeholder and
 *                 accessible name, the three tabs in order, and the two stated empty labels.
 *   2. stash    — a prompt typed into the composer and stashed with the composer's own Stash control; the row is
 *                 in the store; the application is quit and RELAUNCHED, and the entry is still in the stash
 *                 (REQ-LIBRARY-138's "still there after the application restarts", measured).
 *   3. use      — "Use" copies into the composer, switches to Workspace and focuses it, and the entry is still
 *                 stashed; then, WITH A FILTER APPLIED, "Use and remove" removes exactly the row chosen and not
 *                 the row at that screen position (REQ-LIBRARY-104/107). The composer's three loads measure
 *                 REQ-CHAT-044's one blank line on both routes — the second Use lands on a composer REQ-CHAT-015
 *                 refilled from the draft the view switch flushed (REQ-SHELL-159), and the stash dialog's Apply
 *                 appends onto that (Part C2's repair of this scenario's reading; see the block at the assertion).
 *   4. burst    — twenty writes land while a search term is typed: the last one is visible afterwards and the
 *                 typed text is neither cleared nor reordered (REQ-LIBRARY-105).
 *   5. cap      — 201 history entries leave 200, the oldest gone, silently (REQ-LIBRARY-139: no notice).
 *   6. notice   — a notice carrying `open-library` opens the Library with the named tab active (REQ-SHELL-115).
 *
 * Evidence under `.proof/library-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'library-proof');
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



/** Both saved-prompt lists as the store holds them, newest first — what every claim below is checked against. */
function storedPrompts(local) {
  const db = new Database(oneDatabase(local), { readonly: true });
  const read = (table) => db.prepare(`SELECT text FROM ${table} ORDER BY seq DESC`).all().map((r) => r.text);
  const lists = { history: read('prompt_history'), stash: read('prompt_stash') };
  const version = db.pragma('user_version', { simple: true });
  db.close();
  return { ...lists, userVersion: version };
}


const PROBES = [
  '.app-shell', '[data-testid="library"]', '.library__title', '[data-testid="library-search"]', '[data-testid="library-tab"]',
  '[data-testid="library-stash-row"]', '[data-testid="library-history-row"]', '[data-testid="library-stash-empty"]', '[data-testid="library-history-empty"]',
  '[data-testid="library-artifacts"]', '[data-testid="library-proposals-placeholder"]', '[data-testid="library-divider"]',
  '[data-testid="composer-stash"]', '[data-testid="transcript-stash"]', '.composer__input', '[data-testid="notice"]', '[data-testid="notice-title"]',
];

function launch(name, workspace, local, preferences, extra, timeoutMs = 180_000) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  /** A mid-flight probe, keyed by `<selector>@<ms>` — the state that is gone by the final capture. */
  const at = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe-at (\d+) (.+?) → (.*)\s*$/.exec(line);
    if (m) { try { at[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { at[`${m[2]}@${m[1]}`] = []; } }
  }
  const inspects = {};
  for (const line of log.split('\n')) {
    const m = /capture: inspect-at (\d+) (.+?) → (.*)\s*$/.exec(line);
    if (m) { try { inspects[`${m[2]}@${m[1]}`] = JSON.parse(m[3]); } catch { /* left absent */ }}
  }
  return { png, log, probes, at, inspects };
}
const texts = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;

/** One scratch profile: a workspace that is a Git repository with a scripted model configured, and its own store. */
function profile(name) {
  const root = join(output, 'profiles', name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  const preferences = join(root, 'preferences');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(local, { recursive: true });
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  writeFileSync(join(workspace, 'README.md'), `# Library proof workspace (${name})\n`);
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:',
    '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted',
    'medium_model: scripted',
    'large_model: scripted',
    'runtime:',
    '  permission_mode: autonomous',
    '',
  ].join('\n'));
  const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' } });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
  git('add', 'README.md', '.gitignore');
  git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  return { workspace, local, preferences };
}

const results = {};

// ── 1. The Library, shown by its own shortcut (REQ-LIBRARY-102/103) ────────────────────────────────
const shellProfile = profile('shell');
const shown = launch('shell', shellProfile.workspace, shellProfile.local, shellProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '6@900',
  // The final probe carries only `data-*` and `aria-value*`; the field's and the splitter's stated NAMES need every attribute.
  ROTARIS_CAPTURE_INSPECT_AT: '[data-testid="library-divider"]@2600;;[data-testid="library-search"]@2600',
  ROTARIS_CAPTURE_AFTER_MS: '3200',
});
if (first(shown.probes, '.app-shell')?.data?.['data-view'] !== 'library') throw new Error(`Ctrl+6 did not show the Library (view ${first(shown.probes, '.app-shell')?.data?.['data-view'] ?? 'none'})`);
if (texts(shown.probes, '.library__title')[0] !== 'Library') throw new Error(`the page title read "${texts(shown.probes, '.library__title')[0] ?? ''}"`);
const searchAttrs = shown.inspects['[data-testid="library-search"]@2600']?.matches?.[0]?.attrs ?? null;
if (searchAttrs === null) throw new Error('the Library has no search field');
if (searchAttrs['aria-label'] !== 'Search Library') throw new Error(`the search field's accessible name is ${JSON.stringify(searchAttrs['aria-label'])}`);
if (searchAttrs['placeholder'] !== 'Search prompts, artifacts, and proposals…') throw new Error(`the search field's placeholder is ${JSON.stringify(searchAttrs['placeholder'])}`);
const tabs = shown.probes['[data-testid="library-tab"]'] ?? [];
const tabNames = tabs.map((t) => t.data['data-tab']);
const tabLabels = tabs.map((t) => t.text);
if (JSON.stringify(tabNames) !== JSON.stringify(['prompts', 'artifacts', 'proposals'])) throw new Error(`the tabs are ${JSON.stringify(tabNames)}, not REQ-LIBRARY-103's three in order`);
if (JSON.stringify(tabLabels) !== JSON.stringify(['Prompts', 'Artifacts', 'Improvement proposals'])) throw new Error(`the tab labels are ${JSON.stringify(tabLabels)}`);
if (texts(shown.probes, '[data-testid="library-stash-empty"]')[0] !== 'No stashed prompts.') throw new Error(`the stash empty label read "${texts(shown.probes, '[data-testid="library-stash-empty"]')[0] ?? ''}"`);
if (texts(shown.probes, '[data-testid="library-history-empty"]')[0] !== 'Prompt history is empty.') throw new Error(`the history empty label read "${texts(shown.probes, '[data-testid="library-history-empty"]')[0] ?? ''}"`);
const dividerAttrs = shown.inspects['[data-testid="library-divider"]@2600']?.matches?.[0]?.attrs ?? null;
if (dividerAttrs?.['aria-label'] !== 'Resize the prompt stash and history columns') throw new Error(`the splitter's accessible name is ${JSON.stringify(dividerAttrs?.['aria-label'])}`);
if (dividerAttrs['role'] !== 'separator' || dividerAttrs['tabindex'] !== '0') throw new Error(`the splitter is not a focusable separator: ${JSON.stringify(dividerAttrs)}`);
results.shell = { view: 'library', title: 'Library', tabs: tabNames, labels: tabLabels, stashEmpty: true, historyEmpty: true, searchName: searchAttrs['aria-label'], splitterName: dividerAttrs['aria-label'] };

// ── 2. Stashed from the composer, then measured across a real restart (REQ-CHAT-042, REQ-LIBRARY-138) ──
const stashed = launch('stash', shellProfile.workspace, shellProfile.local, shellProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '2@700',
  // The composer clicked (which focuses it), typed into WITHOUT submitting, then the Stash control clicked.
  ROTARIS_CAPTURE_CLICKS: '.composer__input@1000;;[data-testid="composer-stash"]@1900',
  ROTARIS_CAPTURE_TYPE: 'Draft a migration plan>>no-enter@1400',
  // `inspect-at` rather than `probe-at`: it reads a control's VALUE and every attribute, which the stated names need.
  ROTARIS_CAPTURE_INSPECT_AT: '.composer__input@2300;;[data-testid="transcript-stash"]@2300',
  ROTARIS_CAPTURE_AFTER_MS: '3000',
});
const afterStash = storedPrompts(shellProfile.local);
// v11 is where the two prompt tables land; a later part adds its own version and the store passes through v11 on
// the way, so what this asserts is "at least v11" and not the top of the ladder — the ladder itself is asserted in
// `store.test.ts`, and pinning the number here made the proof fail on Part Y's v12 for no behavioural reason.
if (afterStash.userVersion < 11) throw new Error(`the store migrated to v${afterStash.userVersion}, below v11`);
if (JSON.stringify(afterStash.stash) !== JSON.stringify(['Draft a migration plan'])) throw new Error(`the stash holds ${JSON.stringify(afterStash.stash)}`);
if (afterStash.history.length !== 0) throw new Error(`stashing wrote ${afterStash.history.length} history row(s); REQ-LIBRARY-137 records only a sent or queued prompt`);
const clearedComposer = stashed.inspects['.composer__input@2300']?.matches?.[0]?.text;
if (clearedComposer !== '') throw new Error(`REQ-CHAT-042: the composer was not cleared by Stash (it holds ${JSON.stringify(clearedComposer)})`);
const toolbar = stashed.inspects['[data-testid="transcript-stash"]@2300']?.matches?.[0];
if (toolbar?.text !== 'Apply stash (1)') throw new Error(`the transcript toolbar read "${toolbar?.text ?? 'nothing'}"`);
if (toolbar.attrs['aria-label'] !== 'Manage prompt stash' || toolbar.attrs['title'] !== 'Apply or pop a stashed prompt') throw new Error(`the toolbar control's names are ${JSON.stringify(toolbar.attrs)}`);

// The relaunch: a second process against the same profile — the entry is loaded from the store, not remembered.
const relaunched = launch('relaunch', shellProfile.workspace, shellProfile.local, shellProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '6@900',
  ROTARIS_CAPTURE_AFTER_MS: '3200',
});
const survivingRows = texts(relaunched.probes, '[data-testid="library-stash-row"]');
if (JSON.stringify(survivingRows) !== JSON.stringify(['Draft a migration plan'])) throw new Error(`after the restart the stash showed ${JSON.stringify(survivingRows)}`);
results.stash = { stored: afterStash.stash, historyRows: afterStash.history.length, composerCleared: true, toolbar: toolbar.text, afterRestart: survivingRows, storeVersion: afterStash.userVersion };

// ── 3. Use, and Use-and-remove under a filter (REQ-LIBRARY-104/107, REQ-CHAT-044) ──────────────────
const useProfile = profile('use');
const used = launch('use', useProfile.workspace, useProfile.local, useProfile.preferences, {
  // Seeded through the real `prompts.push` command; newest first afterwards: alpha two(0), beta(1), alpha one(2).
  ROTARIS_CAPTURE_PROMPTS: 'stash>>alpha one@600;;stash>>beta@700;;stash>>alpha two@800',
  ROTARIS_CAPTURE_VIEWS: '6@1300;;6@3000',
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="library-stash-row"]>>alpha one@1800',
    '[data-testid="stash-use"]@2100',
    '[data-testid="library-search"]@3400',
    '[data-testid="library-stash-row"]>>alpha one@4200',
    '[data-testid="stash-use-remove"]@4500',
    // Back on the Workspace view with `alpha one` in the composer: the stash dialog, opened from the transcript
    // toolbar, applies onto a NON-EMPTY composer — REQ-CHAT-044's one blank line, on a route with no view switch.
    '[data-testid="transcript-stash"]@5100',
    '[data-testid="stash-dialog-apply"]@5700',
  ].join(';;'),
  ROTARIS_CAPTURE_TYPE_AT: 'alpha@3600',
  ROTARIS_CAPTURE_PROBE_AT: '.app-shell@2500;;[data-testid="library-stash-row"]@4000;;[data-testid="stash-dialog-row"]@5400',
  // Part C2 — the composer read on either side of the SECOND "Use and remove", which is what makes REQ-CHAT-044's
  // append measurable on the Library's own route rather than assumed (see the assertions below).
  ROTARIS_CAPTURE_INSPECT_AT: '.composer__input@2500;;.composer__input@4400;;.composer__input@4900;;[data-testid="stash-dialog"]@5400',
  ROTARIS_CAPTURE_AFTER_MS: '6600',
});
if (used.at['.app-shell@2500']?.[0]?.data?.['data-view'] !== 'workspace') throw new Error('"Use" did not switch to the Workspace view (REQ-LIBRARY-107)');
const loadedComposer = used.inspects['.composer__input@2500']?.matches?.[0]?.text;
if (loadedComposer !== 'alpha one') throw new Error(`"Use" put ${JSON.stringify(loadedComposer)} in the composer`);
const focused = used.inspects['.composer__input@2500']?.active;
if (!(focused && (focused.className ?? '').includes('composer__input'))) throw new Error(`"Use" did not focus the composer (focus was on ${JSON.stringify(focused)})`);
// The filter: two of the three rows match, and each keeps its ORIGINAL index (0 and 2), not its screen position.
const filtered = used.at['[data-testid="library-stash-row"]@4000'] ?? [];
if (JSON.stringify(filtered.map((r) => r.text)) !== JSON.stringify(['alpha two', 'alpha one'])) throw new Error(`the filter showed ${JSON.stringify(filtered.map((r) => r.text))}`);
if (JSON.stringify(filtered.map((r) => r.data['data-index'])) !== JSON.stringify(['0', '2'])) throw new Error(`the filtered rows carry indexes ${JSON.stringify(filtered.map((r) => r.data['data-index']))}, not their original 0 and 2`);
const afterUse = storedPrompts(useProfile.local);
// "Use" kept its entry; "Use and remove" removed exactly the row chosen — `beta`, the row at that SCREEN
// position in the unfiltered list, is untouched. That is the whole of REQ-LIBRARY-107's "keyed by the entry's
// original index so a filtered view removes the right item".
if (JSON.stringify(afterUse.stash) !== JSON.stringify(['alpha two', 'beta'])) throw new Error(`after Use and remove the stash holds ${JSON.stringify(afterUse.stash)}`);
// REQ-LIBRARY-141: the toolbar opened the dialog, it listed the stash newest first, and Apply was clicked with
// NO row chosen — so the text that arrives is the pre-selected first row's, which is what pre-selection means.
const dialog = used.inspects['[data-testid="stash-dialog"]@5400']?.matches?.[0];
if (dialog?.attrs['role'] !== 'dialog') throw new Error(`the transcript toolbar did not open the stash dialog (${JSON.stringify(dialog?.attrs ?? null)})`);
const dialogRows = (used.at['[data-testid="stash-dialog-row"]@5400'] ?? []).map((r) => r.text);
if (JSON.stringify(dialogRows) !== JSON.stringify(['alpha two', 'beta'])) throw new Error(`the stash dialog listed ${JSON.stringify(dialogRows)}`);
/*
 * REQ-CHAT-044, measured on BOTH routes that reach this composer — and the expectation below is the repair of a
 * reading that was true when it was written and false the moment Part AB's composer draft existed (Part C2).
 *
 * What this scenario actually does: "Use" at 2100 puts `alpha one` in the composer and switches to the Workspace
 * view; the switch back to the Library at 3000 UNMOUNTS that view (`AppShell` renders one view: `views[activeView]`),
 * and unmounting is REQ-SHELL-159's fourth flush point, so `alpha one` is written to the workspace's stored draft.
 * The second "Use and remove" at 4500 therefore lands on a composer REQ-CHAT-015 has already refilled from that
 * draft — a non-empty composer — and REQ-CHAT-044 requires the append, not a replacement. The stash dialog's Apply
 * then appends a third time. The old assertion read `alpha one\n\nalpha two`, which assumed the composer came back
 * empty; it did until 2026-09-08, when Part AB gave the composer a durable draft. What `library-proof` was waiting
 * for is that draft, not the slash catalogue (`codebase.md` foresaw it: "REQ-CHAT-044's blank-line append is
 * vacuously satisfied on the Library's own routes until REQ-SHELL-159's composer draft exists").
 *
 * The three reads below pin the whole chain, so neither a lost draft nor a lost append can pass.
 */
const whileInLibrary = used.inspects['.composer__input@4400']?.matches ?? null;
// Measured, not assumed: while the Library is on screen there is NO composer in the document — `AppShell` renders one
// view — so nothing the composer held in its own state can survive the switch, and the text below can only have come
// back from the stored draft. (This read was written expecting `alpha one` here; the empty match list is what the
// product actually does and is the stronger evidence, so the reading is corrected rather than the assertion relaxed.)
if (whileInLibrary === null || whileInLibrary.length !== 0) throw new Error(`the Workspace view should be unmounted while the Library shows; the composer read ${JSON.stringify(whileInLibrary)}`);
/*
 * Defect C2-1, found by running this three times (Part C2): the composer's state when the SECOND "Use and remove"
 * lands is decided by a race, so this scenario has two outcomes and neither is the schedule's fault.
 *
 * Returning to the Workspace view remounts the composer, which (a) asks main for the stored draft — a command round
 * trip — and (b) receives the loaded prompt through the shell seam two animation frames after the view switch
 * (`loadIntoComposer`'s `requestAnimationFrame` wait for the composer to register). Whichever arrives first wins:
 * with the draft first the load appends after one blank line (REQ-CHAT-044) and the text reads
 * `alpha one\n\nalpha one`; with the load first the draft is dropped on arrival, because REQ-CHAT-015 adopts a draft
 * only into an EMPTY composer, and the text reads `alpha one`. Measured: appended in two runs of three on
 * 2026-09-11, replaced in the third, same build, same schedule. The user-visible half is that a prompt used from the
 * Library sometimes discards what the composer had.
 *
 * REPAIRED 2026-09-11, and this assertion is what the repair is worth: `adoptDraft` composes the draft with a load
 * that beat it instead of dropping it, so BOTH orders now leave `alpha one\n\nalpha one` and the outcome no longer
 * depends on which of the two arrived first. The two-branch reading below is therefore gone rather than relaxed —
 * the note above is kept so the shape of what was wrong survives beside what replaced it, as this record's standing
 * rule requires. A single expected string is the stronger assertion, and it fails if either half regresses: drop
 * the draft and this reads `alpha one`, drop the append and it reads `alpha one` too.
 */
const afterSecondUse = used.inspects['.composer__input@4900']?.matches?.[0]?.text;
if (afterSecondUse !== 'alpha one\n\nalpha one') throw new Error(`REQ-CHAT-044/REQ-CHAT-015 (C2-1 repaired): after "Use and remove" the composer must hold the restored draft, one blank line, then the loaded prompt, whichever of the two arrived first; it held ${JSON.stringify(afterSecondUse)}`);
const draftRace = 'composed (C2-1 repaired)';
const composerAfter = first(used.probes, '.composer__input')?.value;
// REQ-CHAT-044 on the toolbar's own route, measured against what was actually there: one blank line, nothing else.
if (composerAfter !== `${afterSecondUse}\n\nalpha two`) throw new Error(`REQ-CHAT-044: Apply onto a non-empty composer (${JSON.stringify(afterSecondUse)}) produced ${JSON.stringify(composerAfter)}`);
// The draft itself, from the preference file the flush wrote: what carried the text across the view switch.
const preferenceFile = join(useProfile.preferences, 'preferences.json');
const draftEntry = Object.entries(JSON.parse(readFileSync(preferenceFile, 'utf8'))).find(([key]) => key.endsWith('/composerDraft'));
if (!draftEntry || draftEntry[1] === '') throw new Error(`REQ-SHELL-159: no composer draft was stored for this workspace (${preferenceFile} holds ${readFileSync(preferenceFile, 'utf8')})`);
if (!composerAfter.startsWith(String(draftEntry[1]))) throw new Error(`the stored draft ${JSON.stringify(draftEntry[1])} is not a prefix of the composer's final text ${JSON.stringify(composerAfter)}`);
const afterApply = storedPrompts(useProfile.local);
if (JSON.stringify(afterApply.stash) !== JSON.stringify(['alpha two', 'beta'])) throw new Error(`REQ-LIBRARY-141: Apply changed the stash to ${JSON.stringify(afterApply.stash)} instead of keeping it`);
results.use = { switchedTo: 'workspace', focused: 'composer', filteredRows: filtered.map((r) => [r.text, r.data['data-index']]), stashAfterRemove: afterUse.stash, dialogFirstRow: 'alpha two', composerWhileInLibrary: whileInLibrary.length, composerAfterSecondUse: afterSecondUse, draftRace, composer: composerAfter, storedDraft: draftEntry[1], stashAfterApply: afterApply.stash };

// ── 4. A burst of writes settles, and the typed search text is untouched (REQ-LIBRARY-105) ─────────
const burstProfile = profile('burst');
const burst = launch('burst', burstProfile.workspace, burstProfile.local, burstProfile.preferences, {
  ROTARIS_CAPTURE_VIEWS: '6@700',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="library-search"]@1100',
  ROTARIS_CAPTURE_TYPE_AT: 'burst@1300',
  // Twenty writes back to back through the real command, each bumping the revision and re-reading the lists.
  ROTARIS_CAPTURE_PROMPTS: 'history>>{20}burst @1800',
  ROTARIS_CAPTURE_AFTER_MS: '5000',
});
const burstSearch = first(burst.probes, '[data-testid="library-search"]')?.value;
if (burstSearch !== 'burst') throw new Error(`the typed search text was ${JSON.stringify(burstSearch)} after the burst, not "burst"`);
const burstRows = texts(burst.probes, '[data-testid="library-history-row"]');
if (burstRows[0] !== 'burst 20') throw new Error(`the newest row after the burst is ${JSON.stringify(burstRows[0])}; the last write of the burst was "burst 20"`);
if (burstRows.length !== 20) throw new Error(`the burst left ${burstRows.length} rows on screen, not 20`);
const burstStored = storedPrompts(burstProfile.local);
if (burstStored.history.length !== 20 || burstStored.history[0] !== 'burst 20') throw new Error(`the store holds ${burstStored.history.length} history rows, newest ${JSON.stringify(burstStored.history[0])}`);
results.burst = { writes: 20, searchTextAfter: burstSearch, newestOnScreen: burstRows[0], rowsOnScreen: burstRows.length, storedNewest: burstStored.history[0] };

// ── 5. The cap: 201 entries leave 200, oldest first, silently (REQ-LIBRARY-139) ────────────────────
const capProfile = profile('cap');
const capped = launch('cap', capProfile.workspace, capProfile.local, capProfile.preferences, {
  ROTARIS_CAPTURE_PROMPTS: 'history>>{201}entry @700',
  ROTARIS_CAPTURE_VIEWS: '6@4000',
  ROTARIS_CAPTURE_AFTER_MS: '6000',
}, 240_000);
const capStored = storedPrompts(capProfile.local);
if (capStored.history.length !== 200) throw new Error(`201 pushes left ${capStored.history.length} rows, not 200`);
if (capStored.history[0] !== 'entry 201') throw new Error(`the newest stored entry is ${JSON.stringify(capStored.history[0])}`);
if (capStored.history.at(-1) !== 'entry 2') throw new Error(`the oldest surviving entry is ${JSON.stringify(capStored.history.at(-1))}; "entry 1" should have gone`);
if (capStored.history.includes('entry 1')) throw new Error('the oldest entry was not discarded');
if (capStored.stash.length !== 0) throw new Error(`201 history writes touched the stash (${capStored.stash.length} rows); REQ-LIBRARY-138 keeps the two lists independent`);
// "Silent truncation" (REQ-LIBRARY-139): the trim said nothing — no notice about the prompts, and no line in the
// log about a discard. (A scratch profile has no provider credentials, so the startup notice about that is on
// screen; it is not this launch's subject and is named here rather than asserted away.)
const capNotices = texts(capped.probes, '[data-testid="notice-title"]');
const promptNotice = capNotices.find((t) => /prompt|history|discard|truncat|cap/i.test(t));
if (promptNotice !== undefined) throw new Error(`the cap raised a notice: ${JSON.stringify(promptNotice)}`);
if (/discard|truncat/i.test(capped.log.replace(/^.*capture: prompts.*$/gm, ''))) throw new Error('the trim wrote a line of its own; REQ-LIBRARY-139 makes it silent');
const capRows = texts(capped.probes, '[data-testid="library-history-row"]');
if (capRows.length !== 200 || capRows[0] !== 'entry 201') throw new Error(`the Library shows ${capRows.length} rows, newest ${JSON.stringify(capRows[0])}`);
results.cap = { pushed: 201, stored: capStored.history.length, newest: capStored.history[0], oldest: capStored.history.at(-1), discarded: 'entry 1', promptNotice: null, otherNotices: capNotices, rowsOnScreen: capRows.length };

// ── 6. A notice action opens the named tab (REQ-SHELL-115, REQ-LIBRARY-102/103) ────────────────────
const noticeProfile = profile('notice');
const notice = launch('notice', noticeProfile.workspace, noticeProfile.local, noticeProfile.preferences, {
  // Reported late enough that the scratch profile's own start-up notice (no provider authenticated) has already
  // been raised and replaced, so the slot holds this one when the action is activated.
  ROTARIS_CAPTURE_NOTICES: `${JSON.stringify({ op: 'report', severity: 'info', title: 'Artifacts were published', persistent: true, action: { label: 'Open Library', action: { kind: 'open-library', tab: 'artifacts' } } })}@3000`,
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="notice-title"]@3400;;.app-shell@3400',
  ROTARIS_CAPTURE_CLICKS: '.notice__action@3800',
  ROTARIS_CAPTURE_AFTER_MS: '5400',
});
if (notice.at['[data-testid="notice-title"]@3400']?.[0]?.text !== 'Artifacts were published') throw new Error(`the notice on screen before the click was ${JSON.stringify(notice.at['[data-testid="notice-title"]@3400'])}`);
if (notice.at['.app-shell@3400']?.[0]?.data?.['data-view'] === 'library') throw new Error('the Library was already showing before the action was activated');
const opened = first(notice.probes, '[data-testid="library"]');
if (opened === null) throw new Error('the notice action did not open the Library');
if (opened.data['data-tab'] !== 'artifacts') throw new Error(`the Library opened on the "${opened.data['data-tab']}" tab, not the one the action named`);
// The tab the action names is the one that renders. Part Y's `ArtifactsTab` occupies this slot since the merge;
// before it, the assertion read a placeholder here. What is asserted is unchanged: the named tab's body, and not
// another tab's, is what `open-library` put on screen.
if ((notice.probes['[data-testid="library-artifacts"]'] ?? []).length !== 1) throw new Error('the Artifacts tab body did not render for the tab the action named');
results.notice = { before: notice.at['.app-shell@3400']?.[0]?.data?.['data-view'] ?? null, action: 'open-library', tab: opened.data['data-tab'], artifactsTabRendered: true };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
