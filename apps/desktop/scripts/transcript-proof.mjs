/**
 * The transcript proof (Part Z): ADR-0045's first execution and ADR-0046 steps 3, 4 and 5, measured in the
 * PRODUCT rather than in the spike. Scripted client, scratch store, five launches against one scratch profile:
 *
 *   1. empty      — a fresh workspace with no session: REQ-CHAT-073's empty state, word for word, and the
 *                   structural counts with nothing in the transcript.
 *   2. invariance — ONE process that opens three planted transcripts in turn — 1, 601 and 1200 displayed rows —
 *                   and then walks REQ-UIBENCH-060's five window sizes. ADR-0045's element-count invariant is a
 *                   within-iteration claim, so measuring it across three processes would not be measuring it.
 *   3. behaviour  — the 1200-row transcript: the fold of four reading calls into one header, expanding it with the
 *                   header still on screen, a search that matches inside the collapsed group, paging older rows in
 *                   with the reader's position undisturbed and the returned row identical to the released one, and
 *                   a burst of gapped publications producing exactly one `refused` and one `reset`.
 *   3b. geometry   — a planted run whose activity line MUST wrap and whose agent name is too long for the role
 *                   column, with a scripted run appended so that something is live while it is sampled: every
 *                   bound slot carries a measurement key, and no slot is drawn through its neighbour.
 *   4/5. append-empty / append-loaded — the same scripted run appended to an empty transcript and to a 1200-row
 *                   one, timed at REQ-CHAT-055's stated point: after the frame showing the update has been
 *                   painted, never a synchronous figure. Since the R-048 measurement round the two are launched
 *                   ALTERNATELY (empty, loaded, empty, loaded, …) so the host's drift lands on both alike, the
 *                   samples are pooled to thirty or more a side and reported in frames as well as milliseconds
 *                   with their spread, and one further launch of each is recorded with Chromium's own tracing so
 *                   the frames can be attributed to style, layout, paint, the observer pass or script.
 *
 * Evidence under `.proof/transcript-proof/`: one PNG and one log per launch, the two traces, `results.json`.
 * `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { readTrace, spread, summariseAppendTrace } from './lib/trace-summary.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'transcript-proof');
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



const PROBES = [
  '[data-testid="transcript-pane"]', '[data-testid="transcript-scroll"]', '[data-testid="transcript-empty"]',
  '[data-testid="transcript-search-count"]', '[data-testid="transcript-new-updates"]', '[data-testid="transcript-oldest"]',
  '[data-testid="transcript-page-failed"]', '.app-shell',
];

/**
 * One launch of the built app against the scratch profile. `electronArgs` are Chromium's own switches — the append
 * comparison's traced launches pass the startup-tracing switches through it; `hostSwitches` is what this host needs
 * on every launch (`--no-sandbox` as root, nothing elsewhere).
 */
function launch(name, extra, timeoutMs = 240_000, electronArgs = []) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, ...electronArgs, workspace], {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'} (see ${name}.log)`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  // `spawnSync` returns when MAIN exits; the run host is a child that can outlive it by a moment, and a session it
  // held is refused to the next launch for as long as its pid answers ("held by another run in this application
  // (pid …)"). Measured 2026-09-28: the behaviour launch opened S1200 1.5 s after the invariance launch's main exited
  // and was refused by the run host that launch had left exiting. So each launch ends only when its children are gone.
  const children = [...log.matchAll(/"process":"[a-z-]+","pid":(\d+)/g)].map((m) => Number(m[1]));
  const started = Date.now();
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  while (children.some(alive) && Date.now() - started < 10_000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  const lingering = children.filter(alive);
  if (lingering.length > 0) throw new Error(`${name}: child processes ${lingering.join(', ')} were still alive 10 s after main exited`);
  const probes = {};
  const evals = [];
  for (const line of log.split('\n')) {
    const p = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (p) { try { probes[p[1]] = JSON.parse(p[2]); } catch { probes[p[1]] = []; } }
    const e = /capture: eval-at (\d+) (.*?) → (.*)\s*$/.exec(line);
    if (e) { try { evals.push({ at: Number(e[1]), expression: e[2], value: JSON.parse(e[3]) }); } catch { evals.push({ at: Number(e[1]), expression: e[2], value: null }); } }
  }
  return { png, log, probes, evals };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const evalAt = (r, at) => r.evals.find((e) => e.at === at)?.value ?? null;
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Transcript proof workspace\n');
// REQ-CHAT-166: the `display` section, which `SECTION_KEYS` has declared since the key table was written and
// nothing stood behind until Part Z. Ten result lines and two input lines are the requirement's own defaults,
// written explicitly so the proof reads the file rather than the built-in.
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  'rotaris:', '  delegation_strategy: single',
  // REQ-CONFIG-172's keys, corrected in Part AG: Part Z wrote `tool_result_lines`, which no requirement states.
  'display:', '  show_tool_results: true', '  show_tool_inputs: true', '  tool_result_max_lines: 10', '  tool_input_max_lines: 2',
  '',
].join('\n'));
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' };
const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: 'ignore', env: gitEnv });
git('init', '-q', '-b', 'main');
git('config', 'core.autocrlf', 'false');
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
git('add', 'README.md', '.gitignore');
git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');

const dbFile = () => { const databases = findDatabases(local); if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`); return databases[0]; };
const withDb = (fn) => { const db = new Database(dbFile()); try { return fn(db); } finally { db.close(); } };
const results = {};

// ── 1. empty ────────────────────────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-073's empty state, word for word, and ADR-0045's structural counts with nothing in the transcript.
const EMPTY_TITLE = 'No transcript yet';
const EMPTY_BODY = 'Describe the outcome you want. Rotaris will show agent activity and results here.';
const empty = launch('empty', {
  ROTARIS_CAPTURE_VIEWS: '2@900',
  ROTARIS_CAPTURE_EVAL_AT: 'window.__rotarisCounts()@2200;;window.__rotarisReplica()@2400',
  ROTARIS_CAPTURE_AFTER_MS: '3200',
});
{
  const state = text(empty.probes, '[data-testid="transcript-empty"]').join(' ');
  expect(state.includes(EMPTY_TITLE), `the empty state does not read "${EMPTY_TITLE}": ${state}`);
  expect(state.includes(EMPTY_BODY), `the empty state does not carry the second line: ${state}`);
  const counts = evalAt(empty, 2200);
  expect(counts && counts.slots > 0, `no structural counts at 0 rows: ${JSON.stringify(counts)}`);
  results.empty = {
    emptyState: state, counts,
    // REQ-CHAT-073 is met in ONE CLAUSE OF TWO and is recorded that way: its second clause names a Clear action
    // that section 14 would have built, and no Clear action exists anywhere in this build.
    clearAction: 'absent — section 14 is out of the plan, so the clause has nothing to be true of',
  };
}

// ── planting ────────────────────────────────────────────────────────────────────────────────────────────────
// Three transcripts of different lengths, written straight into the store so the lengths are exact. The 1200-row
// one holds 200 rows already RELEASED into a page, so REQ-CHAT-165's paging has something to bring back.
const NEEDLE = 'NEEDLEINSIDEFOLD';
const LONG_OUTPUT = Array.from({ length: 30 }, (_, i) => `output line ${i + 1}`).join('\n');
function plant(sid, total, opts = {}) {
  return withDb((db) => {
    const wsRoot = db.prepare('SELECT workspace_root FROM sessions LIMIT 1').get()?.workspace_root ?? workspace;
    db.prepare('INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(sid, 'completed', wsRoot, opts.createdAt ?? '2026-09-06T09:00:00.000Z', opts.updatedAt ?? '2026-09-06T09:05:00.000Z');
    const insert = db.prepare(`INSERT INTO transcript_rows
      (session_id, row_index, kind, settled, body, at, persona, name, ts, page, tool_name, tool_status, call_key, duration_ms, started_at, input, output)
      VALUES (@sid, @i, @kind, 1, @body, @at, @persona, @name, @ts, @page, @toolName, @toolStatus, @callKey, @durationMs, @startedAt, @input, @output)`);
    const released = opts.released ?? 0;
    const planned = [];
    for (let i = 0; i < total; i += 1) {
      const at = new Date(Date.UTC(2026, 8, 6, 9, 0, Math.min(59, i % 60), 0)).toISOString();
      const base = { sid, i, at, ts: at.slice(11, 19), page: i < released ? 1 : null, persona: 'orchestrator', name: 'orchestrator', toolName: null, toolStatus: null, callKey: null, durationMs: null, startedAt: null, input: null, output: null };
      // REQ-CHAT-064: four consecutive same-agent `read_file` calls, which is one "reading" family run and
      // therefore ONE group header. The needle sits in a member's output, so REQ-CHAT-074 must match it through
      // REQ-CHAT-065's capped member blob while the group is collapsed.
      if (opts.foldAt !== undefined && i >= opts.foldAt && i < opts.foldAt + 4) {
        planned.push({ ...base, kind: 'tool', body: 'read_file', toolName: 'read_file', toolStatus: i === opts.foldAt + 3 ? 'failed' : 'ok', callKey: `call-${i}`, durationMs: 120, startedAt: at, input: JSON.stringify({ path: `file-${i}.md` }), output: i === opts.foldAt + 1 ? `${NEEDLE} was here` : `read ${i}` });
        continue;
      }
      // REQ-CHAT-166: a result far longer than the ten-line cap, so the cap and its marker are observable.
      if (opts.longAt !== undefined && i === opts.longAt) {
        planned.push({ ...base, kind: 'tool', body: 'grep', toolName: 'grep', toolStatus: 'ok', callKey: 'call-long', durationMs: 90, startedAt: at, input: JSON.stringify({ pattern: 'x' }), output: LONG_OUTPUT });
        continue;
      }
      planned.push({ ...base, kind: i === released ? 'user' : 'agent', body: i < released ? `released row ${i}` : `row ${i} of ${sid}` });
    }
    db.transaction((batch) => { for (const row of batch) insert.run(row); })(planned);
    return sid;
  });
}
/**
 * docs/defects/live-rows-are-never-measured.md: one agent, a name too long for the 112 px role column, and a run
 * long enough that `.activity__segments` MUST wrap — with the last call still `running`, so the activity line is
 * LIVE. That combination is the one the pool used to position by `estimateHeight` for the whole time it was live,
 * drawing three wrapped lines into a 36 px allocation and through the row beneath it.
 */
function plantLiveRun(sid) {
  return withDb((db) => {
    const wsRoot = db.prepare('SELECT workspace_root FROM sessions LIMIT 1').get()?.workspace_root ?? workspace;
    db.prepare('INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(sid, 'running', wsRoot, '2026-09-06T09:00:00.000Z', '2026-09-06T09:05:00.000Z');
    const insert = db.prepare(`INSERT INTO transcript_rows
      (session_id, row_index, kind, settled, body, at, persona, name, ts, page, tool_name, tool_status, call_key, duration_ms, started_at, input, output)
      VALUES (@sid, @i, @kind, @settled, @body, @at, @persona, @name, @ts, NULL, @toolName, @toolStatus, @callKey, @durationMs, @startedAt, NULL, @output)`);
    const families = ['read_file', 'grep', 'apply_patch', 'bash'];
    const planned = [];
    const CALLS = 24;
    for (let i = 0; i < CALLS; i += 1) {
      const at = new Date(Date.UTC(2026, 8, 6, 9, 0, Math.min(59, i), 0)).toISOString();
      const toolName = families[i % families.length];
      planned.push({
        sid, i, kind: 'tool', settled: i === CALLS - 1 ? 0 : 1, body: toolName, at, ts: at.slice(11, 19),
        persona: 'requirements-engineer', name: 'requirements-engineer',
        toolName, toolStatus: i === CALLS - 1 ? 'running' : 'ok', callKey: `live-${i}`,
        durationMs: 120, startedAt: at, output: `done ${i}`,
      });
    }
    // A row after the run, so an activity line that overruns its allocation has something to overrun INTO. The
    // defect is invisible in a transcript whose last row is the group.
    const last = new Date(Date.UTC(2026, 8, 6, 9, 1, 0, 0)).toISOString();
    planned.push({ sid, i: CALLS, kind: 'agent', settled: 1, body: 'the row the activity line used to be drawn through', at: last, ts: last.slice(11, 19), persona: 'requirements-engineer', name: 'requirements-engineer', toolName: null, toolStatus: null, callKey: null, durationMs: null, startedAt: null, output: null });
    db.transaction((batch) => { for (const row of batch) insert.run(row); })(planned);
    return sid;
  });
}

plant('S1', 1);
plant('S601', 601);
plant('S1200', 1200, { released: 200, foldAt: 400, longAt: 420 });
plantLiveRun('SLIVE');
plant('S0', 1);

// ── 2. invariance ───────────────────────────────────────────────────────────────────────────────────────────
// ADR-0045's own claim, measured in the product: the count of live structural elements the application's layout
// owns does not move across 0, 1, 601 and 1200 displayed rows, nor across REQ-UIBENCH-060's five window sizes.
const COUNTS = 'window.__rotarisCounts()';
const invariance = launch('invariance', {
  ROTARIS_CAPTURE_VIEWS: '2@900',
  ROTARIS_CAPTURE_OPEN_AT: 'S1@3000;;S601@8000;;S1200@13000',
  ROTARIS_CAPTURE_RESIZE: '1000x680@21000;;1440x900@22500;;1180x760@24000;;1000x680@25500;;1440x900@27000',
  ROTARIS_CAPTURE_EVAL_AT: [
    `${COUNTS}@2000`, `${COUNTS}@6500`, `${COUNTS}@11500`, `${COUNTS}@19000`,
    `${COUNTS}@21800`, `${COUNTS}@23300`, `${COUNTS}@24800`, `${COUNTS}@26300`, `${COUNTS}@27800`,
    'window.__rotarisReplica()@28200',
  ].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '29000',
});
{
  const at = (ms) => { const v = evalAt(invariance, ms); expect(v && typeof v.widgets === 'number', `no counts at ${ms} ms`); return v; };
  const rowCounts = [at(2000), at(6500), at(11500), at(19000)];
  const sweep = [at(21800), at(23300), at(24800), at(26300), at(27800)];
  expect(rowCounts[0].displayed === 0, `expected 0 displayed rows first, saw ${rowCounts[0].displayed}`);
  expect(rowCounts[1].displayed === 1, `expected 1 displayed row, saw ${rowCounts[1].displayed}`);
  expect(rowCounts[2].displayed === 601, `expected 601 displayed rows, saw ${rowCounts[2].displayed}`);
  expect(rowCounts[3].displayed === 1000 - 3, `expected 997 displayed rows (1000 resident, four reading calls folded into one header), saw ${rowCounts[3].displayed}`);
  const widgets = [...rowCounts, ...sweep].map((c) => c.widgets);
  const slots = [...rowCounts, ...sweep].map((c) => c.slots);
  expect(new Set(widgets).size === 1, `the structural count moved: ${JSON.stringify(widgets)}`);
  expect(new Set(slots).size === 1, `the slot pool changed size: ${JSON.stringify(slots)}`);
  results.invariance = {
    widgets: widgets[0], slots: slots[0],
    displayed: rowCounts.map((c) => c.displayed),
    perObservation: [...rowCounts, ...sweep].map((c) => ({ displayed: c.displayed, widgets: c.widgets, uiObjects: c.uiObjects, slots: c.slots, bound: c.bound })),
    // `ui_objects` is informational under REQ-UIBENCH-109 and is expected to move; it is reported, never asserted.
    uiObjectsRange: [Math.min(...[...rowCounts, ...sweep].map((c) => c.uiObjects)), Math.max(...[...rowCounts, ...sweep].map((c) => c.uiObjects))],
    replica: evalAt(invariance, 28200),
    png: invariance.png,
  };
}

// ── 3. behaviour ────────────────────────────────────────────────────────────────────────────────────────────
const SCROLL = `document.querySelector('[data-testid="transcript-scroll"]')`;
const GROUPS = `[...document.querySelectorAll('[data-shape="group"]')]`;
const behaviour = launch('behaviour', {
  ROTARIS_CAPTURE_RESUME: 'S1200',
  ROTARIS_CAPTURE_EVAL_AT: [
    `(() => { const s = ${SCROLL}; return { displayed: s.dataset.displayed, following: s.dataset.following, slots: s.dataset.slots }; })()@4000`,
    // REQ-CHAT-074: Ctrl+F opens the panel; the needle exists ONLY inside the collapsed group's member blob, so
    // finding it is finding a match inside a fold, and showing it must land on the group's visible header.
    `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true })); return true; })()@5000`,
    `(() => { const i = document.querySelector('[data-testid="transcript-search-input"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(NEEDLE)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()@5600`,
    `(() => { const c = document.querySelector('[data-testid="transcript-search-count"]'); const s = ${SCROLL}; const el = [...document.querySelectorAll('.transcript__slot')].find((n) => n.dataset.bound && n.dataset.bound.startsWith('group:')); const v = s.getBoundingClientRect(); const r = el && el.getBoundingClientRect(); return { count: c && c.textContent, following: s.dataset.following, key: el ? el.dataset.bound : null, members: el ? el.querySelector('[data-shape="group"]').dataset.members : null, summary: el ? el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 80) : null, onScreen: el ? (r.bottom > v.top && r.top < v.bottom) : null }; })()@6600`,
    // Expanding the group keeps its header on screen (REQ-CHAT-065).
    `(() => { const el = [...document.querySelectorAll('.transcript__slot')].find((n) => n.dataset.bound && n.dataset.bound.startsWith('group:')); if (!el) return null; el.querySelector('button').click(); return { key: el.dataset.bound }; })()@7200`,
    // The revealed members are drawn INSIDE the group's own row (`row__members`, REQ-CHAT-065 / PD-CHAT-004), so
    // they are counted there. Until 2026-09-22 this step counted pooled SLOTS bound to a member key — a shape the
    // product has never drawn: a folded group occupies one slot and expanding it adds none, so the count was
    // structurally zero and the assertion had stopped being about the product.
    `(() => { const el = [...document.querySelectorAll('.transcript__slot')].find((n) => n.dataset.bound && n.dataset.bound.startsWith('group:')); const s = ${SCROLL}; if (!el) return null; const r = el.getBoundingClientRect(); const v = s.getBoundingClientRect(); const members = [...el.querySelectorAll('[data-testid="group-members"] [data-member-key]')].map((m) => m.dataset.memberKey); return { onScreen: r.bottom > v.top && r.top < v.bottom, expanded: el.querySelector('button').getAttribute('aria-expanded'), membersRevealed: members.length, memberKeys: members.slice(0, 4), slotsForMembers: document.querySelectorAll('.transcript__slot[data-bound^="tool:call-4"]').length }; })()@8000`,
    // REQ-CHAT-166: the cap governs what is DISPLAYED and the record keeps all thirty lines — measured through
    // REQ-CHAT-074, which matches over displayed rows and therefore cannot see what the cap removed. The drawing
    // of a tool card is Part AA's; nothing here depends on it.
    `(() => { const i = document.querySelector('[data-testid="transcript-search-input"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'output line 25'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()@8600`,
    `(() => ({ beyondTheCap: document.querySelector('[data-testid="transcript-search-count"]').textContent }))()@9200`,
    `(() => { const i = document.querySelector('[data-testid="transcript-search-input"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '20 more lines'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()@9600`,
    `(() => { const r = window.__rotarisRow(420); const el = [...document.querySelectorAll('.transcript__slot')].find((n) => n.dataset.bound === 'tool:call-long'); return { marker: document.querySelector('[data-testid="transcript-search-count"]').textContent, recordedLines: r ? r.output.split('\\n').length : null, bound: el !== undefined }; })()@10000`,
    // REQ-CHAT-166: expansion shows the UNTRUNCATED value whatever the settings say.
    `(() => { const el = [...document.querySelectorAll('.transcript__slot')].find((n) => n.dataset.bound === 'tool:call-long'); if (!el) return null; el.querySelector('button').click(); return true; })()@10400`,
    `(() => { const el = [...document.querySelectorAll('.transcript__slot')].find((n) => n.dataset.bound === 'tool:call-long'); return el ? { expandedShowsAll: /output line 25/.test(el.innerText), expandedShowsMarker: /cut short/.test(el.innerText) } : null; })()@10800`,
    `(() => { document.querySelector('[data-testid="transcript-search-close"]').click(); return true; })()@11200`,
    // REQ-CHAT-165: scrolling toward the top loads the next older span; REQ-CHAT-071 keeps the reader in place.
    // The reader scrolls toward the top; the row at the top of the viewport AT THAT MOMENT is the anchor, and it
    // must be at the same viewport offset once the older span has been placed above it (REQ-CHAT-071).
    `(() => { const s = ${SCROLL}; s.scrollTop = 4000; return { scrollTop: s.scrollTop, rows: window.__rotarisReplica().rows, oldest: window.__rotarisReplica().oldestIndex }; })()@12000`,
    // 300 px is ABOVE the paging threshold, so this scroll only lets the pool settle at the new position; the pool
    // rebinds its slots on the scroll event and a render, so a rect read in the same tick as the assignment reads
    // the OLD binding — which is what the first attempt at this measurement did, and it read a row 3,880 px away.
    `(() => { const s = ${SCROLL}; s.scrollTop = 300; return { scrollTop: s.scrollTop }; })()@12600`,
    // 200 px is below the threshold: this is the scroll that asks for the older span. The reader's own movement is
    // 300 -> 200; everything else that changes the scroll position afterwards is the anchor holding them still.
    `(() => { const s = ${SCROLL}; const pool = document.querySelector('.transcript__pool').getBoundingClientRect().height; s.scrollTop = 200; return { scrollTop: 200, pool }; })()@13400`,
    `(() => { const s = ${SCROLL}; const rep = window.__rotarisReplica(); const pool = document.querySelector('.transcript__pool').getBoundingClientRect().height; return { rows: rep.rows, oldest: rep.oldestIndex, reachedOldest: rep.reachedOldest, paging: s.dataset.paging, scrollTop: s.scrollTop, pool, displayed: s.dataset.displayed }; })()@16000`,
    `window.__rotarisRow(150)@16400`,
    // ADR-0046 steps 0 to 2 reaching the product end to end: a REGRESSION CHECK on behaviour built on 2026-09-03
    // and reported into ADR-0043's note, not a first execution. A burst of gapped publications must produce
    // exactly ONE `refused` and ONE `reset`, whatever the burst's size (REQ-UIBENCH-083).
    'window.__rotarisReplica()@17000',
    'window.__rotarisReplica()@20500',
  ].join(';;'),
  ROTARIS_CAPTURE_GAP_AT: '6@17600',
  ROTARIS_CAPTURE_AFTER_MS: '21500',
}, 300_000);
{
  const search = evalAt(behaviour, 6600);
  expect(search && /1 of 1/.test(String(search.count)), `search did not find the needle inside the collapsed group: ${JSON.stringify(search)}`);
  expect(search.following === '0', `showing a match left tail-follow on: ${JSON.stringify(search)}`);
  expect(search.members === '4', `four consecutive reading calls did not fold into one header of four: ${JSON.stringify(search)}`);
  expect(search.onScreen === true, `the match inside the fold did not land on the group's visible header: ${JSON.stringify(search)}`);
  expect(!/NEEDLEINSIDEFOLD/.test(String(search.summary)), `the group header drew raw tool output: ${JSON.stringify(search)}`);
  const expanded = evalAt(behaviour, 8000);
  expect(expanded && expanded.onScreen === true, `the group header left the screen when it was expanded: ${JSON.stringify(expanded)}`);
  expect(expanded.expanded === 'true', `the group did not expand: ${JSON.stringify(expanded)}`);
  expect(expanded.membersRevealed >= 4, `expanding the group revealed ${expanded.membersRevealed} members beneath it, not four: ${JSON.stringify(expanded)}`);
  // The four are the group's OWN members, drawn inside its row rather than added to the pool — which is what
  // keeps "the pool's slot count never moves" (asserted above) true across an expansion.
  expect(expanded.memberKeys.every((k) => typeof k === 'string' && k.startsWith('tool:call-4')),
    `the revealed members are not the group's: ${JSON.stringify(expanded.memberKeys)}`);
  expect(expanded.slotsForMembers === 0, `expanding the group added ${expanded.slotsForMembers} slots to the pool`);
  const beyond = evalAt(behaviour, 9200);
  expect(beyond && /0 results/.test(String(beyond.beyondTheCap)),
    `a line past the ten-line cap is still displayed: ${JSON.stringify(beyond)}`);
  const cap = evalAt(behaviour, 10000);
  expect(cap && cap.recordedLines === 30, `the record did not retain the full result: ${JSON.stringify(cap)}`);
  expect(/1 of 1/.test(String(cap.marker)), `the drawn result does not mark the truncation and its size: ${JSON.stringify(cap)}`);
  const untruncated = evalAt(behaviour, 10800);
  expect(untruncated && untruncated.expandedShowsAll === true && untruncated.expandedShowsMarker === false,
    `expanding the row did not show the untruncated value: ${JSON.stringify(untruncated)}`);
  const beforePaging = evalAt(behaviour, 12000);
  const atRequest = evalAt(behaviour, 13400);
  const afterPaging = evalAt(behaviour, 16000);
  expect(afterPaging && afterPaging.rows > beforePaging.rows, `scrolling to the top brought no older rows in: ${JSON.stringify({ beforePaging, afterPaging })}`);
  expect(afterPaging.oldest < beforePaging.oldest, `the oldest held index did not move back: ${JSON.stringify({ beforePaging, afterPaging })}`);
  /*
   * REQ-CHAT-071, measured as the invariant it is rather than as a rectangle: everything that arrived arrived
   * ABOVE the reader, so the transcript grew by exactly as much as the reader's scroll position moved, and the
   * difference between the two is how far the content shifted under them. Reading it this way is immune to the
   * one-render lag between a scroll and the pool's rebinding, which the first attempt at this measurement read as
   * a 360 px drift that was mostly the probe's own.
   */
  const grew = afterPaging.pool - atRequest.pool;
  const moved = afterPaging.scrollTop - atRequest.scrollTop;
  expect(Math.abs(grew - moved) <= 4,
    `the reader moved when older rows arrived above the viewport: the transcript grew ${grew} px and the reader moved ${moved} px (${JSON.stringify({ atRequest, afterPaging })})`);
  const paged = evalAt(behaviour, 16400);
  const stored = withDb((db) => db.prepare('SELECT * FROM transcript_rows WHERE session_id = ? AND row_index = 150').get('S1200'));
  expect(paged && stored && paged.body === stored.body && paged.kind === stored.kind && paged.at === stored.at && paged.ts === stored.ts,
    `a paged-in row is not identical to the row released: ${JSON.stringify({ paged, stored })}`);
  const before = evalAt(behaviour, 17000);
  const after = evalAt(behaviour, 20500);
  const dRefused = after.rowOps.refused - before.rowOps.refused;
  const dReset = after.rowOps.reset - before.rowOps.reset;
  expect(dRefused === 1, `a burst of six gapped publications produced ${dRefused} refusals, not one`);
  expect(dReset === 1, `the recovery produced ${dReset} resets, not one`);
  results.behaviour = {
    fold: { members: search.members, key: search.key, summary: search.summary },
    expanded,
    cap: { recordedLines: cap.recordedLines, beyondTheCapIsNotDisplayed: beyond.beyondTheCap, truncationMarked: cap.marker, expansionShowsUntruncated: untruncated },
    search: { count: search.count, following: search.following },
    paging: { before: beforePaging, after: afterPaging, pagedRowIdenticalToReleased: true },
    anchor: { grewPx: grew, readerMovedPx: moved, driftPx: Math.abs(grew - moved), atRequest, afterPaging },
    burst: { refused: dRefused, reset: dReset, dropped: after.counters.dropped - before.counters.dropped, before: before.rowOps, after: after.rowOps },
    png: behaviour.png,
  };
}

// ── 3b. geometry: nothing is drawn through anything else ────────────────────────────────────────────────────
// REQ-CHAT-058 says heights are MEASURED rather than assumed, and the pool positions every slot from the prefix
// sum of those heights. The property that makes the sum right is the one a reader actually sees: no two slots
// overlap. This reads boxes rather than attributes, because a row drawn through another row is in the DOM,
// focusable, carrying every identifier it should — and unreadable (docs/defects/live-rows-are-never-measured.md).
{
  // One line, deliberately: the log reader's `capture: eval-at (\d+) (.*?) → (.*)$` cannot span newlines, and a
  // multi-line expression parses as no result at all rather than as an error.
  //
  // The FIRST sample is taken the moment a live activity line exists (`>>.activity__now@~8000`), the other
  // twenty-five at appointments. The scripted run ends at `think` about 2.35 s after the session opens, and the
  // first appointment at 3,000 ms caught the live line in six runs of seven on 2026-09-28 and missed it in the
  // seventh (docs/defects/fixed/the-geometry-stage-catches-its-live-line-in-one-sample-or-none.md). A sample that
  // waits for the state cannot miss it while it exists, and gives up at 8 s so the guard below still fails honestly.
  const LIVE_SAMPLE_AT = 8000;
  const SAMPLE_AT = Array.from({ length: 25 }, (_, i) => 3300 + i * 300);
  const OVERLAP = `(() => { const boxes = [...document.querySelectorAll('.transcript__slot')].filter((n) => n.dataset.bound).map((n) => { const r = n.getBoundingClientRect(); return { key: n.dataset.bound, top: r.top, bottom: r.bottom, keyed: n.dataset.measure !== '' }; }).sort((a, b) => a.top - b.top); let worst = 0; let pair = null; for (let i = 1; i < boxes.length; i += 1) { const o = boxes[i - 1].bottom - boxes[i].top; if (o > worst) { worst = o; pair = [boxes[i - 1].key, boxes[i].key]; } } const seg = document.querySelector('[data-shape="group"] .activity__segments'); const segmentLines = seg ? new Set([...seg.querySelectorAll('.activity__segment')].map((e) => Math.round(e.getBoundingClientRect().top))).size : 0; const roles = [...document.querySelectorAll('.row__role')].map((e) => Math.round(e.getBoundingClientRect().height)); const g = document.querySelector('[data-shape="group"]'); return { bound: boxes.length, unkeyed: boxes.filter((b) => !b.keyed).length, worstOverlapPx: Math.round(worst * 10) / 10, pair, segmentLines, tallestRolePx: Math.max(0, ...roles), live: document.querySelectorAll('.activity__now').length, summaryTail: g ? g.innerText.replace(/\\s+/g, ' ').trim().slice(-90) : null }; })()`;
  const geometry = launch('geometry', {
    // A PLANTED running tool cannot stay running: a resumed session settles its in-flight calls through stale
    // detection (ADR-0002), which is correct and is why the fixture alone cannot produce a live line. The wrap
    // and the long name come from the planted run; the LIVENESS comes from a scripted run appended to it.
    ROTARIS_CAPTURE_RESUME: 'SLIVE',
    ROTARIS_SCRIPT: 'think,read,answer',
    ROTARIS_CAPTURE_PROMPT: 'Say something about the notes.',
    ROTARIS_CAPTURE_EVAL_AT: [`${OVERLAP}>>.activity__now@~${LIVE_SAMPLE_AT}`, ...SAMPLE_AT.map((ms) => `${OVERLAP}@${ms}`)].join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '11000',
  }, 240_000);
  const samples = [{ ms: 'on the first live line', ...(evalAt(geometry, LIVE_SAMPLE_AT) ?? {}) }, ...SAMPLE_AT.map((ms) => ({ ms, ...(evalAt(geometry, ms) ?? {}) }))].filter((s) => typeof s.bound === 'number');
  expect(samples.length >= 4, `the geometry stage took ${samples.length} readable samples, not enough to say anything`);
  expect(samples.every((s) => s.bound > 1), `a sample bound one slot or none, so nothing could overlap: ${JSON.stringify(samples)}`);
  // The two guards that keep the assertions below from being satisfied by construction. The line has to actually
  // WRAP — a one-line activity line is the case the old constant happened to be right about — and at least one
  // sample has to catch a row while it is LIVE, which is the state whose height was never read at all.
  const wrapped = Math.max(...samples.map((s) => s.segmentLines));
  const liveSamples = samples.filter((s) => s.live >= 1);
  expect(wrapped >= 2, `the activity line never wrapped, so the estimate was never asked the question: ${JSON.stringify(samples)}`);
  expect(liveSamples.length >= 1, `no sample caught a live line, so the state this repairs was never drawn: ${JSON.stringify(samples)}`);
  // The repair: a live row carries a measurement key now, and no slot is drawn through its neighbour at any
  // sample — while wrapping, while streaming, and while the run settles.
  const unkeyed = samples.filter((s) => s.unkeyed > 0);
  expect(unkeyed.length === 0, `bound slots carried no measurement key, so their height was assumed: ${JSON.stringify(unkeyed)}`);
  const worst = samples.reduce((a, b) => (b.worstOverlapPx > a.worstOverlapPx ? b : a));
  expect(worst.worstOverlapPx <= 1, `two rows overlap by ${worst.worstOverlapPx} px ${JSON.stringify(worst.pair)}: ${JSON.stringify(worst)}`);
  results.geometry = { samples, wrappedToLines: wrapped, liveSamples: liveSamples.length, worstOverlapPx: worst.worstOverlapPx, tallestRolePx: Math.max(...samples.map((s) => s.tallestRolePx)), png: geometry.png };
}

// ── 4/5. the append comparison ──────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-055's append clause, read as that requirement fixes it: a comparison of two SHOWN-UPDATE times, taken
// after the frame showing the update has been painted. Never a synchronous figure.
//
// The R-048 measurement round (docs/defects/fixed/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md)
// tightened how the comparison is taken, because two passes in three with a spread wider than the effect was not a
// verdict either way:
//
//  - the two fixtures are launched ALTERNATELY, so whatever the host is doing lands on both alike;
//  - the scripted run is six tool calls and a deliberation, each an appended row or two, so one launch yields about
//    thirty applies and the pooled sides reach thirty or more each;
//  - every sample carries where its time went (`sync` — the apply, React's flush and the layout effects; `frame1` —
//    the frame that showed it; `ms` — the frame after), and the increment's shape, so the clause is read on row
//    appends as well as on every update;
//  - the frame cadence is MEASURED in the renderer rather than assumed at 60 Hz, and every figure is reported in
//    frames beside milliseconds, with its spread;
//  - one further launch of each fixture is recorded with Chromium's own startup tracing, and `lib/trace-summary.mjs`
//    attributes each apply window to style, layout, pre-paint, paint, the compositor commit, the ResizeObserver
//    delivery and script. Those two launches are NOT pooled into the comparison — tracing has a cost of its own.
const APPLIES = 'window.__rotarisApplies()';
/** The renderer's frame cadence: sixty consecutive animation frames while nothing is live, as intervals. */
const FRAME_CADENCE = `(async () => { const ts = []; await new Promise((done) => { const step = (t) => { ts.push(t); if (ts.length < 61) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); }); const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b); return { medianMs: d[Math.floor(d.length / 2)], p25Ms: d[Math.floor(d.length / 4)], p75Ms: d[Math.floor((3 * d.length) / 4)], minMs: d[0], maxMs: d[d.length - 1] }; })()`;
/**
 * Six tool calls, then the deliberation: a scripted tool step streams a sentence and calls the tool, so each is two
 * appended rows (the sentence, the call) and a settle; `think` streams reasoning before its answer and ends the run
 * — it has to come LAST, because a plain answer ends the run and the earlier `think,read,answer` script never reached
 * its `read`. Alternating families keeps consecutive calls from folding into one activity line (PD-CHAT-004), so what
 * is measured is a row being appended rather than a header being redrawn.
 */
const APPEND_SCRIPT = 'read,glob,read,glob,read,glob,think';
const APPEND_LAUNCHES = 2;
const APPEND_READ_AT = 26_000;
const TRACE_CATEGORIES = 'devtools.timeline,disabled-by-default-devtools.timeline,blink,blink.user_timing,v8.execute,cc,toplevel';
function appendRun(name, sid, tracePath = null) {
  const electronArgs = tracePath === null ? [] : [`--trace-startup=${TRACE_CATEGORIES}`, `--trace-startup-file=${tracePath}`, '--trace-startup-format=json', '--trace-startup-duration=300'];
  const r = launch(name, {
    ROTARIS_SCRIPT: APPEND_SCRIPT,
    ROTARIS_CAPTURE_RESUME: sid,
    ROTARIS_CAPTURE_PROMPT: 'Say something about the notes.',
    ROTARIS_CAPTURE_EVAL_AT: `${APPLIES}@${APPEND_READ_AT};;${FRAME_CADENCE}@${APPEND_READ_AT + 400};;window.__rotarisReplica()@${APPEND_READ_AT + 2000}`,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '28000',
  }, 300_000, electronArgs);
  // The samples are read at an appointment, so the run must have ENDED before it: main logs the end and the read
  // with the same clock, and a read that came first would be a truncated sample set reported as a small one.
  const ended = /^\[main (\S+)\] .*run \S+ ended /m.exec(r.log);
  const read = new RegExp(`^\\[main (\\S+)\\] .*capture: eval-at ${APPEND_READ_AT} `, 'm').exec(r.log);
  expect(ended !== null, `${name}: the scripted run never ended (see ${name}.log)`);
  expect(read !== null, `${name}: the apply samples were never read (see ${name}.log)`);
  expect(Date.parse(ended[1]) <= Date.parse(read[1]), `${name}: the samples were read at ${read[1]}, before the run ended at ${ended[1]}`);
  // The renderer's timeline, in arrival order. An increment that arrived before the previous one had been SHOWN is
  // `queued`: its figure includes the work in front of it, which is what the reader waits for but not what one
  // append costs. The attach increment — the resident set arriving after the resume's whole read — is not an append
  // and is dropped, after it has been used to decide whether its successor was queued.
  const timeline = [...(evalAt(r, APPEND_READ_AT) ?? [])].sort((a, b) => a.at - b.at);
  let shownAt = Number.NEGATIVE_INFINITY;
  let burst = 0;
  for (const s of timeline) {
    s.queued = s.at < shownAt;
    burst = s.queued ? burst + 1 : 1;
    s.burst = burst;
    shownAt = Math.max(shownAt, s.at + s.ms);
  }
  // `isolated`: nothing was in front of it AND nothing arrived behind it before it was shown — the one figure that
  // is the cost of showing one update and nothing else. The head of a burst is not queued but is not isolated.
  for (let i = 0; i < timeline.length; i += 1) {
    const s = timeline[i];
    const next = timeline[i + 1];
    s.isolated = !s.queued && (next === undefined || next.at >= s.at + s.ms);
  }
  const all = timeline.filter((s) => s.kind !== 'attach');
  expect(all.length >= 20, `${name} produced only ${all.length} apply-to-paint samples`);
  const cadence = evalAt(r, APPEND_READ_AT + 400);
  expect(cadence && cadence.medianMs > 0, `${name}: the frame cadence could not be read: ${JSON.stringify(cadence)}`);
  // The pane's own count of projections, and of those that took the bounded form (`data-projections`, verification
  // only). The repair's mechanism is that an increment projects once and bounded; a launch in which the bounded form
  // never ran would be measuring a pane the repair does not reach, and says so rather than passing on its figures.
  const projections = String((r.probes['[data-testid="transcript-scroll"]'] ?? [])[0]?.data?.['data-projections'] ?? '').split('/').map(Number);
  expect(projections.length === 2 && projections[1] > 0, `${name}: the pane never took the bounded projection (data-projections ${JSON.stringify(projections)})`);
  return { name, samples: all, cadence, projections: { total: projections[0], bounded: projections[1] }, replica: evalAt(r, APPEND_READ_AT + 2000), png: r.png, log: r.log };
}
/**
 * One side's figures: pooled samples, per-launch medians, and the spread of every phase, in milliseconds and frames —
 * over every update, over the row appends, over the increments that arrived to a quiet surface (`alone`, which
 * includes the head of every burst and so carries the queue behind it), and over the increments with nothing in front
 * of them and nothing arriving behind them before they were shown (`isolated`), which is the one figure that says what
 * ONE append costs rather than what a burst of them costs. A scripted run is a burst by nature — six tool calls answer
 * within a few hundred milliseconds — so `isolated` is a handful a launch, and `sync` (the synchronous work one
 * increment costs, queue or no queue) is the per-increment figure with the count behind it.
 */
function side(launches, frameMs) {
  const samples = launches.flatMap((l) => l.samples);
  const appends = samples.filter((s) => s.kind === 'append');
  const alone = samples.filter((s) => !s.queued);
  const isolated = samples.filter((s) => s.isolated);
  const inFrames = (ms) => Math.round((ms / frameMs) * 100) / 100;
  const phases = (set) => ({
    ms: spread(set.map((s) => s.ms)), sync: spread(set.map((s) => s.sync)), frame1: spread(set.map((s) => s.frame1)),
    frames: spread(set.map((s) => inFrames(s.ms))),
    framesRounded: spread(set.map((s) => Math.round(s.ms / frameMs))),
  });
  const burstSizes = launches.flatMap((l) => { const sizes = []; for (const s of l.samples) { if (!s.queued) sizes.push(1); else if (sizes.length > 0) sizes[sizes.length - 1] += 1; } return sizes; });
  return {
    launches: launches.map((l) => ({ name: l.name, samples: l.samples.length, medianMs: spread(l.samples.map((s) => s.ms)).median, aloneMedianMs: spread(l.samples.filter((s) => !s.queued).map((s) => s.ms)).median, cadence: l.cadence, projections: l.projections, png: l.png })),
    kinds: Object.fromEntries(['append', 'tail', 'update'].map((k) => [k, samples.filter((s) => s.kind === k).length])),
    queued: samples.filter((s) => s.queued).length,
    bursts: { count: burstSizes.length, sizes: spread(burstSizes) },
    all: phases(samples),
    appends: phases(appends),
    alone: phases(alone),
    isolated: phases(isolated),
    samplesMs: samples.map((s) => Math.round(s.ms * 10) / 10),
    appendsMs: appends.map((s) => Math.round(s.ms * 10) / 10),
    aloneMs: alone.map((s) => Math.round(s.ms * 10) / 10),
    isolatedMs: isolated.map((s) => Math.round(s.ms * 10) / 10),
  };
}
const emptyLaunches = [];
const loadedLaunches = [];
for (let i = 1; i <= APPEND_LAUNCHES; i += 1) {
  emptyLaunches.push(appendRun(`append-empty-${i}`, 'S0'));
  loadedLaunches.push(appendRun(`append-loaded-${i}`, 'S1200'));
}
// The traced pair, after the comparison's own launches and outside them.
const emptyTracePath = join(output, 'append-empty.trace.json');
const loadedTracePath = join(output, 'append-loaded.trace.json');
const emptyTraced = appendRun('append-empty-traced', 'S0', emptyTracePath);
const loadedTraced = appendRun('append-loaded-traced', 'S1200', loadedTracePath);
{
  const cadences = [...emptyLaunches, ...loadedLaunches].map((l) => l.cadence.medianMs);
  const frameMs = spread(cadences).median;
  const empty = side(emptyLaunches, frameMs);
  const loaded = side(loadedLaunches, frameMs);
  expect(empty.all.ms.n >= 30 && loaded.all.ms.n >= 30, `the pooled sides hold ${empty.all.ms.n} and ${loaded.all.ms.n} samples; thirty each is the least a verdict needs`);
  // REQ-CHAT-055: appending must cost no more than on an empty transcript. The frame cadence is the floor at both
  // ends, so the comparison is made with a tolerance of one frame — at the cadence measured, not assumed — rather
  // than as an exact inequality. It is read on every update and on the row appends alone; both must hold.
  const slack = frameMs;
  const verdict = (label, e, l) => {
    const pass = l.median <= e.median + slack;
    return { label, emptyMedianMs: e.median, loadedMedianMs: l.median, differenceMs: Math.round((l.median - e.median) * 100) / 100, slackMs: Math.round(slack * 100) / 100, emptyIqrMs: e.iqr, loadedIqrMs: l.iqr, pass };
  };
  const verdicts = { all: verdict('every update', empty.all.ms, loaded.all.ms), appends: verdict('row appends', empty.appends.ms, loaded.appends.ms) };
  const traced = (launch, path) => {
    const trace = existsSync(path) ? summariseAppendTrace(readTrace(JSON.parse(readFileSync(path, 'utf8')))) : null;
    const seqs = new Set(launch.samples.map((s) => s.seq));
    const covered = trace === null ? 0 : trace.windows.filter((w) => seqs.has(w.seq)).length;
    return {
      launch: launch.name, samples: spread(launch.samples.map((s) => s.ms)), cadence: launch.cadence, tracePath: relative(repo, path),
      coverage: { samples: seqs.size, windowsInTrace: trace === null ? 0 : trace.windows.length, covered, unfinished: trace === null ? [] : trace.unfinished },
      aggregate: trace === null ? null : trace.aggregate, topFunctions: trace === null ? [] : trace.topFunctions,
      windows: trace === null ? [] : trace.windows.filter((w) => seqs.has(w.seq)),
    };
  };
  results.append = {
    script: APPEND_SCRIPT, launches: APPEND_LAUNCHES, order: 'alternating: empty, loaded, empty, loaded, then one traced launch of each',
    frameMs: { median: frameMs, perLaunch: cadences },
    empty, loaded, verdicts,
    trace: { empty: traced(emptyTraced, emptyTracePath), loaded: traced(loadedTraced, loadedTracePath), categories: TRACE_CATEGORIES },
    measurementPoint: 'after the frame showing the update has been painted (double requestAnimationFrame; a proxy, per ADR-0045)',
  };
  // The evidence is written BEFORE the verdict is enforced, so a red run leaves its figures on disk.
  writeFileSync(join(output, 'append.json'), `${JSON.stringify(results.append, null, 2)}\n`);
  for (const v of Object.values(verdicts)) {
    expect(v.pass, `appending at 1200 rows showed in ${v.loadedMedianMs} ms (${loaded.all.frames.median} frames) against ${v.emptyMedianMs} ms (${empty.all.frames.median} frames) on an empty transcript, on ${v.label}; slack one frame of ${v.slackMs} ms; spreads (IQR) ${v.emptyIqrMs} and ${v.loadedIqrMs} ms`);
  }
  // REQ-CHAT-163 / REQ-CHAT-062: the scripted `think` step streams deliberation, so the run must have recorded a
  // streamed-reasoning row — the row kind that did not exist in this product before Part Z.
  const thinking = withDb((db) => db.prepare("SELECT count(*) AS c FROM transcript_rows WHERE session_id = ? AND kind = 'thinking'").get('S0').c);
  expect(thinking >= 1, 'the scripted deliberation produced no streamed-reasoning row');
  results.reasoning = { thinkingRows: thinking, note: 'REQ-CHAT-163: reasoning reached a row of its own rather than being discarded by the sink' };
}

results.verdict = 'PASSED';
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`transcript proof PASSED — evidence under ${relative(repo, output)}`);
