/**
 * The artifacts proof (Part Y): the session artifact store, the Artifacts tab and the inspector behind the
 * REAL run host, the real store and the real window. Five launches against one scratch profile:
 *
 *   1. publish   — a scripted run publishes through `artifact_write`; the row appears on the NEXT REFRESH
 *                  without a restart (REQ-LIBRARY-136 — the Library is shown empty first, the run publishes,
 *                  the view is left and returned to); the body file exists in the session's files directory
 *                  named flat (REQ-SESSION-002); and its sidecar parses as YAML frontmatter plus
 *                  REQ-LIBRARY-090's sections in the stated order, READ BY A STOCK PARSER IN A SEPARATE NODE
 *                  PROCESS with none of this product's code loaded.
 *   2. children  — a delegating run materialises every terminal child report exactly once (REQ-LIBRARY-092),
 *                  each with its `artifact_published` timeline entry carrying the artifact id, and the id of
 *                  that entry linked back onto the record. While that run is still active the inspector follows
 *                  the run-level agent: its chips are the live root port's resolution, and following its produced
 *                  artifact link opens that artifact in the Library (live-run finding K1, REQ-MONITOR-052/060/061).
 *                  Its ring caption states its own context window and never denies the reading (acceptance A36,
 *                  REQ-MONITOR-065/089).
 *   3. bad tag   — an invalid tag refuses the publish WHOLE: the observation is REQ-LIBRARY-089's wording, and
 *                  no row, no file and no partial state are left behind.
 *   3b. not granted — OQ-212 and REQ-CONFIG-106: the orchestrator declares `artifact_write` WITHOUT
 *                  `can_publish_artifacts: true`; the session log records REQ-TOOLS-004's `artifact_publish_not_granted`
 *                  removal at warning, and the scripted publish stores no artifact.
 *   4. inspector — the inspector opens on the selected row, its Preview starts below the frontmatter
 *                  (PD-LIBRARY-003; captured as `inspector-preview.png`), a link in it is pressed and requests its
 *                  open through `shell.openExternal` (ADR-0051 decision 4), the Markdown tab is edited and saved, the table's
 *                  status cell gains ` · edited`, and opening the same id again RE-RAISES the one dialog
 *                  (REQ-LIBRARY-131/132/133).
 *   5. missing   — the body file is deleted underneath a stored session; on a relaunch that resumes it the
 *                  record is still listed and the inspector reports the failure (REQ-LIBRARY-091, 134). Before
 *                  that, the reopened session AT REST shows the run-level agent's declared tools standing in, marked
 *                  from its reopened history, and still links what it published (K1, REQ-MONITOR-052/060).
 *   6. commands  — PD-LIBRARY-001: a child runs three ordered terminal calls (success, exit 7, one the
 *                  permission gate denies) and its child report carries the command ledger — exact order and
 *                  statuses — checked in SQLite, through the `artifact_read` sections filter (the tool path
 *                  the port's drifted allow-list broke), in the Markdown sidecar via the stock parser, and
 *                  rendered in the artifact inspector.
 *   7. attached  — PD-TOOLS-006 revision 5 (OQ-221, REQ-TOOLS-152/153, REQ-LIBRARY-098): the orchestrator publishes two long
 *                  artifacts and a short one and delegates a child attaching all three and a reference to nothing, in that
 *                  order. The 100,000-character section carries the first long body (which the old 48,000 budget left out),
 *                  leaves the second out because both would overflow it, and still carries the short one after it. The
 *                  delegate observation in the tool-call record names exactly that: two given whole, the second long id left
 *                  out for size with the budget, the reference unresolved. The child's `context_selection` entry and its
 *                  first message carry the same selection, and `summary.md` counts the one left out (PD-SESSION-002).
 *
 *   8. edited    — PD-LIBRARY-003 (c), since 2026-10-13 (fin42, N57): a fresh session publishes `travel-plan` and a person edits
 *                  and saves it in the inspector's Markdown tab: `edited_at` is stamped, the document carries the edit, and
 *                  `key_findings` keeps the published body.
 *   9. re-reported — PD-LIBRARY-003 (d) and (e): that session continued. The fresh root's first message carries the edited
 *                  document as REQ-SESSION-115's handoff, its header marked `edited` and its frontmatter removed; the root then
 *                  publishes `travel-plan-2` superseding it (REQ-LIBRARY-095), and the superseded document's re-render rewrites
 *                  its frontmatter (`superseded_by`) and keeps the person's text after it.
 *
 * Evidence under `.proof/artifacts-proof/`: one log and PNG per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { unpressedClicks } from './lib/capture-clicks.mjs';
import { ARTIFACTS_TAB, PUBLISH_SCHEDULE, emptyBeforePublish } from './lib/library-refresh.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'artifacts-proof');
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

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
// The global configuration directory by the platform that reads it (`configDirFor`), not the Windows spelling alone.
const configDir = configDirFor(local);
const preferences = join(root, 'preferences');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Artifacts proof workspace\n');

/**
 * The global configuration. `code_intelligence` is switched off: Part T's shipped entry starts a bundled
 * runtime (~4.5 s) ahead of every run, and this proof measures the artifact store rather than that runtime.
 * The orchestrator is granted publishing with both keys REQ-CONFIG-106 names, `artifact_write` in its `tools:` and
 * `can_publish_artifacts: true` beside it: no BUILT-IN persona publishes (OQ-212, ruled 2026-10-07 under R-072), so the
 * grant is the workspace's to make. `publish: false` drops the flag and keeps the declaration, which launch 3b reads
 * (REQ-TOOLS-004's `artifact_publish_not_granted`).
 */
function globalYaml({ personas = {}, publish = true } = {}) {
  return [
    '# scratch configuration written by the artifacts proof',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'personas:',
    `  orchestrator: { tools: [read_file, grep, glob, delegate, todo, artifact_read, artifact_list, artifact_write]${publish ? ', can_publish_artifacts: true' : ''} }`,
    ...Object.entries(personas).map(([role, v]) => `  ${role}: ${v}`),
    '',
  ].join('\n');
}
const WORKSPACE_SINGLE = ['# workspace configuration', 'runtime:', '  permission_mode: autonomous', '  allow_unsandboxed_autonomous: true', 'rotaris:', '  delegation_strategy: single', ''].join('\n');
const WORKSPACE_ORCHESTRATOR = WORKSPACE_SINGLE.replace('  delegation_strategy: single\n', '  delegation_strategy: orchestrator\n');

function oneDatabase() {
  const found = findDatabases(local);
  if (found.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${found.length}`);
  return found[0];
}
/** REQ-SESSION-002: the session's files sit beside the store, under `sessions/<id>`. */
const filesDir = (sessionId) => join(dirname(oneDatabase()), 'sessions', sessionId);

async function launch(name, extra, { files = {}, timeout = 180_000 } = {}) {
  writeFileSync(join(configDir, 'agents.yaml'), files.global ?? globalYaml());
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace ?? WORKSPACE_SINGLE);
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs: timeout, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const elapsedMs = Date.now() - started;
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  return { log, elapsedMs, png };
}
const lines = (log, re) => log.split('\n').filter((l) => re.test(l));
/** The probe lines the capture harness logs: `capture: probe <selector> → <json>` and `probe-at <ms> <selector> → <json>`. */
function probe(log, selector, at = null) {
  const marker = at === null ? `capture: probe ${selector} → ` : `capture: probe-at ${at} ${selector} → `;
  const line = log.split('\n').find((l) => l.includes(marker));
  return line ? JSON.parse(line.slice(line.indexOf(marker) + marker.length)) : [];
}
function latestSession(db) {
  return db.prepare('SELECT session_id, execution_status FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
}
function artifacts(db, sessionId) {
  return db.prepare('SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at, id').all(sessionId);
}
function toolRows(db, sessionId, tool) {
  return db.prepare('SELECT ordinal, status, is_error, agent_name, entry FROM tool_calls WHERE session_id = ? AND tool_name = ? ORDER BY ordinal').all(sessionId, tool).map((r) => ({ ...r, entry: JSON.parse(r.entry) }));
}
const PROBE_ROWS = 'tr[data-artifact-id]';
// Launch 4's Preview link (ADR-0051 decision 4): the URL the scripted body carries, and its control in the Preview.
const PREVIEW_LINK = 'https://example.com/reference';
const PREVIEW_LINK_BUTTON = `[data-testid="artifact-preview"] [data-href="${PREVIEW_LINK}"]`;
// The Library opens on its FIRST tab (REQ-LIBRARY-103's order), so every launch below picks the Artifacts tab
// after the view switch (`ARTIFACTS_TAB`, from `lib/library-refresh.mjs`). Before the merge this proof drove a Library
// that held only this tab and needed no click.
// Live-run finding K1: the inspector's name, chips and artifact links, and the produced group's links.
const INSPECTOR_NAME = '[data-testid="inspector-name"]';
const INSPECTOR_CHIPS = '[data-testid="inspector-chips"] .chip';
const INSPECTOR_ARTIFACTS = '[data-testid="inspector-artifacts"]';
const INSPECTOR_PRODUCED = '[data-testid="inspector-artifacts-produced"]';
// Acceptance A36: the ring caption, which denied the run-level agent's prompt reading one line under the figure.
const INSPECTOR_RING_CAPTION = '.inspector__ring-caption';
const INSPECTOR_META = '[data-testid="inspector-meta"]';
const PROBES = [PROBE_ROWS, '[data-testid="library-artifacts"]', '[data-testid="library-artifacts-empty"]', '[data-testid="library-artifacts-inspect"]', '[data-testid="artifact-inspector"]', '[data-testid="artifact-inspector-meta"]', '[data-testid="artifact-inspector-status"]', '[data-testid="artifact-preview"]', '[data-testid="artifact-save"]'];
const results = {};

// ---- 1. A scripted run publishes; the row appears on the next refresh; the sidecar parses elsewhere ----------
{
  const r = await launch('publish', {
    // The Library is shown FIRST (empty), the run then publishes, the view is left and returned to: the row
    // appears on the next refresh, with no restart and no manual reload (REQ-LIBRARY-136). The schedule waits for
    // the Library's tab and its loaded read instead of reading at appointments a startup stall can close
    // (`lib/library-refresh.mjs`); the prompt seam's own Ctrl+2 is the leave.
    ...PUBLISH_SCHEDULE,
    ROTARIS_CAPTURE_PROMPT: 'publish the plan',
    ROTARIS_SCRIPT: 'artifact:artifact_write,artifact:artifact_list,answer',
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
  });
  const missed = unpressedClicks(r.log, [ARTIFACTS_TAB]);
  if (missed.length > 0) throw new Error(`the Artifacts tab was not pressed: ${JSON.stringify(missed)}`);
  const notEmpty = emptyBeforePublish(r.log);
  if (notEmpty !== null) throw new Error(notEmpty);
  const after = probe(r.log, PROBE_ROWS);
  if (after.length !== 1) throw new Error(`the published artifact did not appear on the next refresh: ${JSON.stringify(after)}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const writes = toolRows(db, s.session_id, 'artifact_write');
  const listing = toolRows(db, s.session_id, 'artifact_list');
  const roots = db.prepare('SELECT iteration, root_task_id, root_canonical_name FROM iterations WHERE session_id = ? ORDER BY iteration').all(s.session_id);
  db.close();
  if (rows.length !== 1) throw new Error(`expected one artifact row, found ${rows.length}`);
  const record = rows[0];
  if (record.kind !== 'agent_published' || record.status !== 'published') throw new Error(`the record is not an agent publish: ${JSON.stringify(record)}`);
  if (!/^art_[0-9A-Za-z]{8}$/.test(record.id)) throw new Error(`the id is not REQ-LIBRARY-088's shape: ${record.id}`);
  // REQ-LIBRARY-093: `created_by` is the publishing agent INSTANCE by its canonical name. The publisher here is the
  // iteration's root, so that is the canonical name its iteration records, and the record's conversation is the root's
  // task id. (It once compared the tool call's recorded name, which for a root is its persona — the two coincide for
  // this persona id and not for one the canonicaliser rewrites: `a-roots-publish-names-its-persona-as-its-author.md`.)
  if (roots.length !== 1) throw new Error(`expected one iteration, found ${roots.length}`);
  if (record.created_by !== roots[0].root_canonical_name) throw new Error(`created_by is not the publishing root's canonical name: ${record.created_by} vs ${roots[0].root_canonical_name}`);
  if (record.conversation_id !== roots[0].root_task_id) throw new Error(`the publish's conversation is not the root's task id: ${record.conversation_id} vs ${roots[0].root_task_id}`);
  if (writes[0]?.agent_name === undefined) throw new Error('the publish recorded no tool call');
  if (!String(writes[0]?.entry.result ?? '').includes(`Published artifact ${record.id} (slug: ${record.slug}).`)) throw new Error(`the publish observation is wrong: ${JSON.stringify(writes[0])}`);
  if (!String(listing[0]?.entry.result ?? '').includes(`- ${record.id} [${record.slug}] persona=`)) throw new Error(`the listing observation is wrong: ${JSON.stringify(listing[0])}`);
  // REQ-SESSION-002: the body is a FILE beside the session's other files, named flat.
  const directory = filesDir(s.session_id);
  const files = readdirSync(directory);
  if (record.body_file !== `artifact-${record.id}.md` || !files.includes(record.body_file)) throw new Error(`the body file is not where the record says: ${record.body_file} in ${files.join(', ')}`);
  if (files.some((f) => f === 'artifacts')) throw new Error('an `artifacts` subdirectory was created; REQ-SESSION-002 closes that place to three kinds of file');
  // REQ-LIBRARY-090, read by a STOCK PARSER in a SEPARATE NODE PROCESS: none of this product's code is loaded.
  const checker = join(output, 'read-sidecar.mjs');
  writeFileSync(checker, [
    "import { readFileSync } from 'node:fs';",
    "import { createRequire } from 'node:module';",
    "const YAML = createRequire(process.argv[3]).call(null, 'yaml');",
    'const text = readFileSync(process.argv[2], "utf8");',
    'const m = /^---\\n([\\s\\S]*?)\\n---\\n/.exec(text);',
    'if (!m) { console.log(JSON.stringify({ ok: false, why: "no frontmatter" })); process.exit(0); }',
    'const front = YAML.parse(m[1]);',
    'const body = text.slice(m[0].length);',
    'const headings = [...body.matchAll(/^## (.+)$/gm)].map((x) => x[1]);',
    'const title = /^# (.+)$/m.exec(body);',
    'console.log(JSON.stringify({ ok: true, front, title: title ? title[1] : null, headings, body }));',
  ].join('\n'));
  const read = spawnSync(process.execPath, [checker, join(directory, record.body_file), join(repo, 'package.json')], { encoding: 'utf8', timeout: 20_000, env: { PATH: process.env.PATH } });
  const parsed = JSON.parse((read.stdout ?? '').trim() || '{"ok":false,"why":"no output"}');
  if (!parsed.ok) throw new Error(`the sidecar did not parse in a separate process: ${JSON.stringify(parsed)} ${read.stderr}`);
  if (parsed.front.id !== record.id || parsed.front.slug !== record.slug || parsed.front.status !== 'published') throw new Error(`the frontmatter does not carry the record: ${JSON.stringify(parsed.front)}`);
  if (parsed.title !== record.title) throw new Error(`the document's title is not the record's: ${parsed.title}`);
  const ORDER = ['Summary', 'Key Findings', 'Highlight Paths', 'Snippets', 'Edited Files', 'Created Files'];
  const positions = parsed.headings.map((h) => ORDER.indexOf(h));
  if (positions.some((p) => p < 0)) throw new Error(`the document carries a section outside REQ-LIBRARY-090's list: ${JSON.stringify(parsed.headings)}`);
  if (positions.some((p, i) => i > 0 && p <= positions[i - 1])) throw new Error(`the sections are out of order: ${JSON.stringify(parsed.headings)}`);
  if (parsed.headings.includes('Snippets') || parsed.headings.includes('Edited Files')) throw new Error(`an empty section was rendered: ${JSON.stringify(parsed.headings)}`);
  if ('edited_at' in parsed.front) throw new Error('edited_at was written before any person edited the body');
  results.publish = {
    rowsBeforeRefresh: 0, rowsAfterRefresh: after.length,
    record: { id: record.id, slug: record.slug, kind: record.kind, status: record.status, importance: record.importance, createdBy: record.created_by, persona: record.source_persona, bodyFile: record.body_file },
    sessionFiles: files, frontmatter: parsed.front, sections: parsed.headings,
    publishObservation: String(writes[0].entry.result).slice(0, 120),
    listObservation: String(listing[0].entry.result).slice(0, 200),
    tabRow: after[0],
  };
}

// ---- 2. Child reports materialise once, each with its artifact_published entry ---------------------------------
{
  const r = await launch('children', {
    ROTARIS_CAPTURE_PROMPT: 'delegate twice', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    // The orchestrator publishes FIRST, so the children are created with a session that already holds an
    // artifact: REQ-LIBRARY-097's `PRIOR SIBLING ARTIFACT INDEX` reaches them and its diagnostic is recorded.
    ROTARIS_SCRIPT: 'artifact:artifact_write,plan:2,delegate:coding-agent:one,delegate:tester:two,wait:4000,done,answer', ROTARIS_CHILD_SCRIPT: 'answer',
    ROTARIS_INTENT_SCRIPT: 'moderate_feature',
    ROTARIS_CAPTURE_VIEWS: '6@16000',
    // Live-run finding K1 (REQ-MONITOR-052/060/061, REQ-LIBRARY-102/131): WHILE THE RUN IS STILL ACTIVE (it ends after
    // the 11 s click — the root's `wait:4000` and the children run past it), the Workspace inspector follows the run-level
    // agent: its chips are the LIVE ROOT PORT'S resolution (the coordinator's `background_output` and `wait_for_tasks`,
    // which no declaration names), marked from its history, and the artifact it published is linked; following the link
    // opens the Library on the Artifacts tab with the artifact inspector open on it. The at-rest reading, with the
    // declared tools standing in, is launch 5's, in a freshly opened process.
    // (This comment first said "with the run over … its declared tools stand in" — false: the verifier found the 10 s
    // probes and the 11 s click land before the run ends, and the PNG reads "Run active".)
    ROTARIS_CAPTURE_PROBE_AT: [INSPECTOR_NAME, INSPECTOR_META, INSPECTOR_CHIPS, INSPECTOR_ARTIFACTS, INSPECTOR_PRODUCED, INSPECTOR_RING_CAPTION].map((s) => `${s}@10000`).concat(['.app-shell@12500', '[data-testid="artifact-inspector"]@12500', '[data-testid="library"]@12500']).join(';;'),
    ROTARIS_CAPTURE_CLICKS: [`${INSPECTOR_PRODUCED} .artifact-link__open@11000`, `${ARTIFACTS_TAB}@16400`].join(';;'),
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'children-inspector.png')}@10200`,
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '18000',
  }, { files: { workspace: WORKSPACE_ORCHESTRATOR } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const children = db.prepare('SELECT task_id, canonical_name, state FROM children WHERE session_id = ? ORDER BY spawned_at').all(s.session_id);
  const timeline = db.prepare("SELECT id, name, metadata FROM timeline WHERE session_id = ? AND name = 'artifact_published' ORDER BY ordinal").all(s.session_id);
  const context = db.prepare("SELECT metadata FROM timeline WHERE session_id = ? AND name = 'context_selection' ORDER BY ordinal").all(s.session_id).map((x) => JSON.parse(x.metadata));
  db.close();
  const reports = rows.filter((x) => x.kind === 'child_report');
  // REQ-LIBRARY-097: every newly created agent is given the block, and both injection paths record a
  // context-selection diagnostic (REQ-LIBRARY-098). Two children, two diagnostics, each listing what it got.
  if (context.length !== children.length) throw new Error(`expected one context-selection diagnostic per child, found ${context.length}`);
  if (!context.every((c) => c.sibling_index_included >= 1 && c.sibling_index_elided === 0)) throw new Error(`the sibling index did not reach the children: ${JSON.stringify(context)}`);
  if (children.length !== 2) throw new Error(`expected two children, found ${children.length}`);
  if (reports.length !== children.length) throw new Error(`expected one artifact per terminal child report, found ${reports.length} for ${children.length} children`);
  const byTask = new Set(reports.map((x) => x.source_task_id));
  if (byTask.size !== reports.length) throw new Error('two artifacts share a source task id: materialisation duplicated');
  if (timeline.length !== reports.length) throw new Error(`expected one artifact_published entry per artifact, found ${timeline.length}`);
  for (const entry of timeline) {
    const meta = JSON.parse(entry.metadata);
    const record = reports.find((x) => x.id === meta.artifact_id);
    if (!record) throw new Error(`the artifact_published entry names an unknown artifact: ${entry.metadata}`);
    if (record.timeline_event_id !== entry.id) throw new Error(`the entry's id is not linked back onto the record: ${record.timeline_event_id} vs ${entry.id}`);
  }
  // Live-run finding K1: the run-level agent's inspector while its run is active, and the link it draws for what it published.
  // (First written "at rest" — false; see the launch's comment.)
  const shownName = probe(r.log, INSPECTOR_NAME, 10000)[0]?.text;
  const chips = probe(r.log, INSPECTOR_CHIPS, 10000).map((c) => `${c.data['data-tool']}:${c.data['data-state']}`);
  const panel = probe(r.log, INSPECTOR_ARTIFACTS, 10000)[0] ?? null;
  const produced = probe(r.log, `${INSPECTOR_PRODUCED}`, 10000)[0]?.text ?? '';
  const published = rows.find((x) => x.kind === 'agent_published');
  if (shownName !== 'orchestrator') throw new Error(`the inspector did not follow the run-level agent at 10 s: "${shownName}"`);
  if (chips.length === 0) throw new Error('the running run-level agent drew no tool chips (REQ-MONITOR-060)');
  // The live resolution, not the declaration: the coordinator's port adds what no declaration names (REQ-TOOLS-004 facets).
  const chipNames = chips.map((c) => c.split(':')[0]);
  if (!chipNames.includes('background_output') || !chipNames.includes('wait_for_tasks')) throw new Error(`the running run-level agent's chips are not its root port's resolution (REQ-MONITOR-060/061): ${JSON.stringify(chips)}`);
  if (!chips.includes('delegate:used') || !chips.includes('artifact_write:used')) throw new Error(`the run-level agent's chips are not marked from its history (REQ-MONITOR-060): ${JSON.stringify(chips)}`);
  // Acceptance A20 (REQ-MONITOR-044/052): the meta line's count is the run-level agent's own while its turn runs — at least
  // one call per tool its chips mark used or active. It read `running · 8s · 0 tool calls` beside the used chips, because
  // the root's calls join the session total only when its turn returns
  // (docs/defects/fixed/the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md).
  const meta = probe(r.log, INSPECTOR_META, 10000)[0]?.text ?? '';
  const metaCalls = /· (\d+) tool calls?\b/.exec(meta);
  const marked = chips.filter((c) => c.endsWith(':used') || c.endsWith(':active')).length;
  if (!metaCalls || Number(metaCalls[1]) < marked) throw new Error(`the running run-level agent's meta line counts fewer calls than the ${marked} tools its chips mark used (REQ-MONITOR-052): "${meta}"`);
  if (/no artifact store/.test(panel?.text ?? '')) throw new Error(`the inspector still says there is no artifact store: "${panel?.text}"`);
  // Acceptance A36 (REQ-MONITOR-089/065): the caption states the run-level agent's own reading and never denies that the
  // record carries it.
  const caption = probe(r.log, INSPECTOR_RING_CAPTION, 10000)[0]?.text ?? '';
  if (!/This agent's own context window: [\d,.\s]+ of [\d,.\s]+ tokens\./.test(caption)) throw new Error(`the run-level agent's ring caption does not state its context window: "${caption}" (REQ-MONITOR-065)`);
  if (/does not carry/.test(caption)) throw new Error(`the run-level agent's ring caption still denies the prompt reading it shows: "${caption}" (REQ-MONITOR-089)`);
  if (!published || panel?.data?.['data-produced'] !== '1' || !produced.includes(published.slug)) throw new Error(`the inspector does not link what the run-level agent published: ${JSON.stringify(panel)} / "${produced}" (REQ-MONITOR-052)`);
  const view = probe(r.log, '.app-shell', 12500)[0]?.data?.['data-view'];
  const opened = probe(r.log, '[data-testid="artifact-inspector"]', 12500).map((d) => d.data['data-artifact-id']);
  const library = probe(r.log, '[data-testid="library"]', 12500)[0]?.data?.['data-tab'];
  if (view !== 'library' || library !== 'artifacts' || opened.length !== 1 || opened[0] !== published.id) throw new Error(`following the link did not open the artifact in the Library: view ${view}, tab ${library}, inspectors ${JSON.stringify(opened)} (REQ-LIBRARY-102/131)`);
  results.children = {
    inspector: { runActive: true, shown: shownName, meta, chips, produced, ringCaption: caption, openedFromLink: { view, tab: library, artifact: opened[0] }, png: join(output, 'children-inspector.png') },
    children: children.map((c) => `${c.canonical_name}:${c.state}`),
    artifacts: reports.map((x) => ({ id: x.id, slug: x.slug, status: x.status, importance: x.importance, task: x.source_task_id, persona: x.source_persona, timelineEventId: x.timeline_event_id })),
    publishedEntries: timeline.length,
    contextSelections: context,
  };
}

// ---- 3. An invalid tag refuses the publish whole ---------------------------------------------------------------
{
  const r = await launch('bad-tag', {
    ROTARIS_CAPTURE_PROMPT: 'publish with a bad tag', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'artifact:artifact_write:bad,answer',
    ROTARIS_SCRIPT_ARTIFACT_ARGS: JSON.stringify({ bad: { slug: 'refused', title: 'Refused', body: 'nothing should survive this', tags: ['research', 'Nonsense'] } }),
    ROTARIS_CAPTURE_VIEWS: '6@11000', ROTARIS_CAPTURE_CLICKS: `${ARTIFACTS_TAB}@11400`, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '13000',
  });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const writes = toolRows(db, s.session_id, 'artifact_write');
  db.close();
  const observation = String(writes[0]?.entry.result ?? writes[0]?.entry.error ?? '');
  const expected = 'Invalid tag(s): Nonsense. Valid tags are: research, planning, implementation, review, verification, errors';
  if (!observation.includes(expected)) throw new Error(`the refusal is not REQ-LIBRARY-089's wording: ${observation}`);
  if (rows.length !== 0) throw new Error(`a refused publish left ${rows.length} row(s) behind`);
  const directory = filesDir(s.session_id);
  const bodies = existsSync(directory) ? readdirSync(directory).filter((f) => f.startsWith('artifact-')) : [];
  if (bodies.length !== 0) throw new Error(`a refused publish left ${bodies.length} file(s) behind: ${bodies.join(', ')}`);
  const shown = probe(r.log, '[data-testid="library-artifacts-empty"]');
  results.badTag = { observation, rows: rows.length, bodyFiles: bodies.length, emptyStateShown: shown.length === 1, emptyLabel: shown[0]?.text ?? '' };
}

// ---- 3b. OQ-212: `artifact_write` declared without `can_publish_artifacts: true` is withheld and the removal recorded --
{
  const r = await launch('not-granted', {
    ROTARIS_CAPTURE_PROMPT: 'publish without the grant', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'artifact:artifact_write,answer',
    ROTARIS_CAPTURE_AFTER_MS: '9000',
  }, { files: { global: globalYaml({ publish: false }) } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const writes = toolRows(db, s.session_id, 'artifact_write');
  db.close();
  if (rows.length !== 0) throw new Error(`a role without can_publish_artifacts published ${rows.length} artifact(s) (REQ-CONFIG-106, REQ-TOOLS-150)`);
  const logFile = join(filesDir(s.session_id), 'session.log');
  const sessionLog = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
  const removal = "tool 'artifact_write' removed from orchestrator by prerequisite (artifact_publish_not_granted)";
  const removalLines = sessionLog.split('\n').filter((l) => l.includes(removal));
  if (removalLines.length === 0) throw new Error(`the session log does not record REQ-TOOLS-004's artifact_publish_not_granted removal (${existsSync(logFile) ? 'present' : 'absent'}: ${logFile}); see not-granted.log`);
  if (!removalLines.every((l) => /WARN/i.test(l))) throw new Error(`the removal is not logged at warning: ${JSON.stringify(removalLines)}`);
  const attempt = writes[0] ? { status: writes[0].status, isError: writes[0].is_error, observation: String(writes[0].entry.result ?? writes[0].entry.error ?? '').slice(0, 200) } : null;
  if (attempt !== null && attempt.isError !== 1) throw new Error(`the withheld artifact_write was not refused: ${JSON.stringify(attempt)}`);
  results.notGranted = { rows: rows.length, removal: removalLines[0], removals: removalLines.length, attempt, elapsedMs: r.elapsedMs };
}

// ---- 4. The inspector: open, edit, save, ` · edited`, and ONE dialog on re-opening -----------------------------
let edited = null;
{
  const r = await launch('inspector', {
    ROTARIS_CAPTURE_PROMPT: 'publish the plan', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'artifact:artifact_write,answer',
    // The scripted plan's own body with one Markdown link added, so the Preview has a link to open (ADR-0051 decision 4).
    ROTARIS_SCRIPT_ARTIFACT_ARGS: JSON.stringify({ artifact_write: { slug: 'scripted-plan', title: 'The scripted plan', body: `The first line of the scripted body.\n\nA second paragraph with \`code\` and **bold**, and [the reference](${PREVIEW_LINK}).`, tags: ['research'] } }),
    // A link the Preview opens goes through `shell.openExternal`, whose capture seam records it rather than starting a browser.
    ROTARIS_CAPTURE_OPEN_EXTERNAL: 'record',
    // The modeless inspector is 720x560 at the bottom-right (REQ-LIBRARY-131); the window is widened so the
    // tab's own controls stay reachable beside it rather than under it — the proof drives real clicks at real
    // coordinates, so an overlap would be measuring the window's size instead of the requirement.
    ROTARIS_CAPTURE_RESIZE: '1360x980@500',
    ROTARIS_CAPTURE_VIEWS: '6@11000',
    ROTARIS_CAPTURE_CLICKS: [
      `${ARTIFACTS_TAB}@11400`,                            // the Library opens on Prompts; take the tab this proof is about
      `${PROBE_ROWS}@12000`,                               // select the row
      '[data-testid="library-artifacts-inspect"]@13000',   // REQ-LIBRARY-108's primary control
      '[data-testid="artifact-tab-markdown"]@14500',       // REQ-LIBRARY-132's second tab
      'textarea[data-testid="artifact-editor"]@15200',     // focus the editor
      '[data-testid="artifact-save"]@17000',               // REQ-LIBRARY-133's save
      '[data-testid="library-artifacts-inspect"]@18600',   // REQ-LIBRARY-131: the same id again
      // ADR-0051 decision 4: back on the Preview, its link opens through the command channel. Pressed last, because the
      // acknowledgement it raises stands over the inspector's footer while it shows, and so over Save (a press at 14300
      // met the toast at Save's point; docs/defects/an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md).
      '[data-testid="artifact-tab-preview"]@19700',
      `${PREVIEW_LINK_BUTTON}@20200`,
    ].join(';;'),
    ROTARIS_CAPTURE_TYPE_AT: 'EDITED@16000',
    // PD-LIBRARY-003 (f): the Preview as drawn, before the Markdown tab is taken at 14500 (the end-of-launch capture shows
    // the Markdown tab and the saved edit).
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'inspector-preview.png')}@14100`,
    ROTARIS_CAPTURE_PROBE_AT: [
      '[data-testid="artifact-inspector"]@13800',
      '[data-testid="artifact-inspector-meta"]@13800',
      '[data-testid="artifact-preview"]@14000',
      `${PREVIEW_LINK_BUTTON}@14000`,
      '[data-testid="artifact-inspector"]@16600',
      '[data-testid="artifact-inspector-status"]@17800',
      'td[data-edited]@18200',
      '[data-testid="artifact-inspector"]@19400',
    ].join(';;'),
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '21000',
  });
  const opened = probe(r.log, '[data-testid="artifact-inspector"]', 13800);
  const meta = probe(r.log, '[data-testid="artifact-inspector-meta"]', 13800)[0]?.text ?? '';
  const preview = probe(r.log, '[data-testid="artifact-preview"]', 14000);
  const dirty = probe(r.log, '[data-testid="artifact-inspector"]', 16600)[0]?.data['data-dirty'] ?? '';
  const status = probe(r.log, '[data-testid="artifact-inspector-status"]', 17800)[0]?.text ?? '';
  const statusCells = probe(r.log, 'td[data-edited]', 18200);
  const reopened = probe(r.log, '[data-testid="artifact-inspector"]', 19400);
  if (opened.length !== 1) throw new Error(`the inspector did not open: ${JSON.stringify(opened)}`);
  if (!/^art_[0-9A-Za-z]{8} · agent_published · published · by /.test(meta)) throw new Error(`the metadata line is not REQ-LIBRARY-131's: ${meta}`);
  if (preview.length !== 1 || !preview[0].text.includes('scripted body')) throw new Error(`the Preview tab did not render the body: ${JSON.stringify(preview)}`);
  // PD-LIBRARY-003 (f), OQ-210's ruling: the Preview starts below the document's frontmatter, which rendered as a run-on
  // paragraph (`id: "art_…" slug: "…" …`) between two rules on every artifact before it.
  if (/\b(?:id|slug|kind|created_at): "/.test(preview[0].text)) throw new Error(`the Preview rendered the frontmatter (PD-LIBRARY-003): ${JSON.stringify(preview[0].text.slice(0, 200))}`);
  if (!existsSync(join(output, 'inspector-preview.png'))) throw new Error('the Preview was not captured (inspector-preview.png)');
  // ADR-0051 decision 4: the Preview's link is a control that requests an external open through `shell.openExternal`. Until
  // 2026-10-13 neither inspector mount passed an opener, so `Markdown` drew it disabled and a press reached nothing
  // (docs/defects/fixed/every-link-in-the-library-artifact-inspectors-preview-is-drawn-disabled.md).
  const previewLinks = probe(r.log, PREVIEW_LINK_BUTTON, 14000);
  if (previewLinks.length !== 1 || previewLinks[0].data['data-href'] !== PREVIEW_LINK) throw new Error(`the Preview did not draw the body's link as one control: ${JSON.stringify(previewLinks)}`);
  const linkMissed = unpressedClicks(r.log, ['[data-testid="artifact-tab-preview"]', PREVIEW_LINK_BUTTON]);
  if (linkMissed.length > 0) throw new Error(`the Preview link was not pressed on its own control: ${JSON.stringify(linkMissed)}`);
  if (!r.log.includes(`capture: open-external ${PREVIEW_LINK}`)) throw new Error(`pressing the Preview's link did not request ${PREVIEW_LINK} through shell.openExternal (a disabled link reaches nothing)`);
  if (dirty !== 'yes') throw new Error(`the editor did not take the typed characters (dirty=${dirty})`);
  if (status !== 'Saved.') throw new Error(`the footer did not read "Saved.": ${status}`);
  if (statusCells.length !== 1 || statusCells[0].data['data-edited'] !== 'yes' || !statusCells[0].text.endsWith(' · edited')) throw new Error(`the row's status cell did not gain " · edited": ${JSON.stringify(statusCells)}`);
  if (reopened.length !== 1) throw new Error(`opening the same id again produced ${reopened.length} dialogs; REQ-LIBRARY-131 re-raises the one`);
  if (reopened[0].data['data-raised'] !== '2') throw new Error(`the dialog was not re-raised: data-raised=${reopened[0].data['data-raised']}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  db.close();
  const record = rows[0];
  if (!record || record.edited_at === null) throw new Error(`the record did not record the edit: ${JSON.stringify(record)}`);
  const body = readFileSync(join(filesDir(s.session_id), record.body_file), 'utf8');
  if (!body.includes('EDITED')) throw new Error('the typed characters did not reach the body file');
  edited = { sessionId: s.session_id, id: record.id, slug: record.slug, bodyFile: record.body_file, directory: filesDir(s.session_id) };
  results.inspector = { meta, previewStart: preview[0].text.slice(0, 80), previewLinkOpened: PREVIEW_LINK, dirty, status, statusCell: statusCells[0].text, raisedOnReopen: reopened[0].data['data-raised'], dialogs: reopened.length, editedAt: record.edited_at, bodyCarriesEdit: true, previewPng: join(output, 'inspector-preview.png'), png: r.png };
}

// ---- 5. A body file deleted underneath: the record stays listed and the inspector reports the failure ----------
{
  // The store outlives the process; the file does not survive being removed from outside it (REQ-LIBRARY-158's
  // serialisation covers the store, and the bodies deliberately sit outside it).
  rmSync(join(edited.directory, edited.bodyFile), { force: true });
  const r = await launch('missing-body', {
    ROTARIS_CAPTURE_RESUME: edited.sessionId,
    ROTARIS_CAPTURE_RESIZE: '1360x980@300',
    ROTARIS_CAPTURE_VIEWS: '6@4000',
    ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@4400`, `${PROBE_ROWS}@5000`, '[data-testid="library-artifacts-inspect"]@6000'].join(';;'),
    // Live-run finding K1 (REQ-MONITOR-049/052/060): the reopened session AT REST, in a freshly opened process, before the
    // view switch — no run is live, so the orchestrator's DECLARED tools stand in, marked from its history as the tool-call
    // ring seeded it under the latest iteration's `root_persona`, and the artifact it published is still linked.
    ROTARIS_CAPTURE_PROBE_AT: [`${PROBE_ROWS}@4600`, '[data-testid="artifact-inspector-status"]@7200', `${INSPECTOR_NAME}@3400`, `${INSPECTOR_CHIPS}@3400`, `${INSPECTOR_PRODUCED}@3400`].join(';;'),
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'missing-body-inspector.png')}@3500`,
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '9000',
  });
  const restName = probe(r.log, INSPECTOR_NAME, 3400)[0]?.text;
  const restChips = probe(r.log, INSPECTOR_CHIPS, 3400).map((c) => `${c.data['data-tool']}:${c.data['data-state']}`);
  const restProduced = probe(r.log, INSPECTOR_PRODUCED, 3400)[0]?.text ?? '';
  // The global configuration's orchestrator declaration, in its own order (`globalYaml`).
  const declared = ['read_file', 'grep', 'glob', 'delegate', 'todo', 'artifact_read', 'artifact_list', 'artifact_write'];
  if (restName !== 'orchestrator') throw new Error(`the reopened session's inspector did not follow the run-level agent: "${restName}"`);
  if (JSON.stringify(restChips.map((c) => c.split(':')[0])) !== JSON.stringify(declared)) throw new Error(`at rest the orchestrator's declared tools did not stand in (REQ-MONITOR-060): ${JSON.stringify(restChips)}`);
  if (!restChips.includes('artifact_write:used')) throw new Error(`at rest the chips are not marked from the reopened history (REQ-MONITOR-060): ${JSON.stringify(restChips)}`);
  if (!restProduced.includes(edited.slug)) throw new Error(`at rest the inspector does not link what the run-level agent published: "${restProduced}" (REQ-MONITOR-052)`);
  const listed = probe(r.log, PROBE_ROWS, 4600);
  const status = probe(r.log, '[data-testid="artifact-inspector-status"]', 7200)[0]?.text ?? '';
  // `disabled` is carried by the END-OF-RUN probe (the mid-run one reads data-* attributes only), and the
  // inspector is still open then — nothing in this launch closes it.
  const save = probe(r.log, '[data-testid="artifact-save"]')[0]?.data ?? {};
  if (listed.length !== 1 || listed[0].data['data-artifact-id'] !== edited.id) throw new Error(`the record was not still listed with its body gone: ${JSON.stringify(listed)}`);
  if (!status.startsWith('Could not load artifact: ')) throw new Error(`the inspector did not report the failure: ${status}`);
  if (save['data-enabled'] !== 'no') throw new Error(`Save was not disabled on a load failure: ${JSON.stringify(save)}`);
  // REQ-LIBRARY-134 fixes the wording; the FIRST run of this proof found it doubled (the store prefixed the
  // reason and the surface prefixed it again), which is the defect this assertion now holds shut.
  if (/Could not load artifact: Could not load artifact:/.test(status)) throw new Error(`the load failure is worded twice: ${status}`);
  results.missingBody = { stillListed: listed.length, status, saveDisabled: true, resumedSession: edited.sessionId, inspectorAtRest: { shown: restName, chips: restChips, produced: restProduced, png: join(output, 'missing-body-inspector.png') } };
}

// ---- 6. PD-LIBRARY-001: the child's command ledger, end to end -------------------------------------------------
{
  // The delegating run's child takes three ordered terminal steps. The third names `rm -rf build`: the
  // `starter:deny-recursive-delete` rule denies it even in `autonomous` mode, the call never executes, and
  // the denial text carries no `[terminal_diagnostic]` block — which is exactly how "exit status not
  // recorded" reaches the ledger (REQ-TOOLS-100 drops the null key; `commandsFrom` records null).
  // After the wait, the orchestrator reads the report back through the TOOL path with the section filter —
  // the interface the port's private allow-list silently widened to the whole document (the defect this
  // launch exists to hold shut).
  const r = await launch('commands', {
    ROTARIS_CAPTURE_PROMPT: 'delegate one child that runs commands', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'delegate:coding-agent:commands,wait:15000,artifact:artifact_read:commands,answer',
    ROTARIS_CHILD_SCRIPT: 'terminal:ok,terminal:fail,terminal:denied,answer',
    ROTARIS_SCRIPT_TERMINAL_ARGS: JSON.stringify({
      ok: { command: 'node --version' },
      fail: { command: 'node -e "process.exit(7)"' },
      denied: { command: 'rm -rf build' },
    }),
    // The child report's slug is the kebab of its task name (REQ-LIBRARY-088: the slug comes from the
    // canonical instance name, and the scripted task IS that name) — so `commands` is a stable ref.
    ROTARIS_SCRIPT_ARTIFACT_ARGS: JSON.stringify({ commands: { id_or_slug: 'commands', sections: ['commands'] } }),
    ROTARIS_INTENT_SCRIPT: 'moderate_feature',
    ROTARIS_CAPTURE_VIEWS: '6@24000',
    ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@24400`, `${PROBE_ROWS}@24800`, '[data-testid="library-artifacts-inspect"]@25200'].join(';;'),
    ROTARIS_CAPTURE_PROBE_AT: [
      '[data-testid="artifact-inspector"]@25800',
      '[data-testid="artifact-preview"] h2@25800',
      '[data-testid="artifact-preview"] li@25800',
    ].join(';;'),
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '27000',
  }, { files: { workspace: WORKSPACE_ORCHESTRATOR }, timeout: 240_000 });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const reports = rows.filter((x) => x.kind === 'child_report');
  if (reports.length !== 1) throw new Error(`expected one child-report artifact, found ${reports.length} of ${rows.length}`);
  const record = reports[0];
  const ledger = JSON.parse(record.commands);
  const EXPECTED = [
    { command: 'node --version', exit_code: 0 },
    { command: 'node -e "process.exit(7)"', exit_code: 7 },
    { command: 'rm -rf build', exit_code: null },
  ];
  if (JSON.stringify(ledger) !== JSON.stringify(EXPECTED)) throw new Error(`the command ledger is not the ordered truth: ${JSON.stringify(ledger)}`);
  // The TOOL path, in the orchestrator's own recorded observation: `artifact_read` with
  // sections: ['commands'] returned EXACTLY the Commands section, not the whole document. This is the
  // interface the port's drifted allow-list broke — with it, this read came back carrying the Key
  // Findings and everything else, which is the false green the regression test above closes.
  const reads = toolRows(db, s.session_id, 'artifact_read');
  if (reads.length !== 1) throw new Error(`expected one artifact_read call, found ${reads.length}`);
  const readText = String(reads[0].entry.result ?? '');
  const EXPECTED_SECTION = [
    '## Commands',
    '',
    '- `node --version`',
    '- `node -e "process.exit(7)"` — **failed, exit 7**',
    '- `rm -rf build` — exit status not recorded',
  ].join('\n');
  if (readText !== EXPECTED_SECTION) throw new Error(`the filtered tool read is not exactly the Commands section: ${JSON.stringify(readText.slice(0, 400))}`);
  db.close();
  // The sidecar, through the stock parser: the Commands section sits between Snippets and Edited Files.
  const directory = filesDir(s.session_id);
  const sidecarRead = spawnSync(process.execPath, [join(output, 'read-sidecar.mjs'), join(directory, record.body_file), join(repo, 'package.json')], { encoding: 'utf8', timeout: 20_000, env: { PATH: process.env.PATH } });
  const parsed = JSON.parse((sidecarRead.stdout ?? '').trim() || '{"ok":false}');
  if (!parsed.ok) throw new Error(`the sidecar did not parse: ${JSON.stringify(parsed)} ${sidecarRead.stderr}`);
  // Empty sections are omitted entirely (REQ-LIBRARY-090), so this report — with no highlights,
  // snippets or files — carries Summary, Key Findings, then Commands LAST among the present headings.
  if (parsed.headings.filter((h) => h === 'Commands').length !== 1) throw new Error(`the sidecar does not carry exactly one Commands section: ${JSON.stringify(parsed.headings)}`);
  if (parsed.headings[parsed.headings.length - 1] !== 'Commands') throw new Error(`Commands is not the last section present: ${JSON.stringify(parsed.headings)}`);
  if (parsed.headings[parsed.headings.length - 2] !== 'Key Findings') throw new Error(`the heading before Commands is not Key Findings: ${JSON.stringify(parsed.headings)}`);
  const commandsBody = parsed.body.slice(parsed.body.indexOf('## Commands'));
  for (const line of ['- `node --version`', '- `node -e "process.exit(7)"` — **failed, exit 7**', '- `rm -rf build` — exit status not recorded']) {
    if (!commandsBody.includes(line)) throw new Error(`the sidecar's Commands section lacks "${line}"`);
  }
  // The rendered inspector: the child report opens and its Preview renders the same command ledger.
  const rowsShown = probe(r.log, PROBE_ROWS);
  const shown = rowsShown.find((x) => x.data['data-artifact-id'] === record.id);
  if (!shown) throw new Error(`the child-report row was not listed: ${JSON.stringify(rowsShown)}`);
  const inspector = probe(r.log, '[data-testid="artifact-inspector"]', 25800);
  const previewHeadings = probe(r.log, '[data-testid="artifact-preview"] h2', 25800).map((x) => x.text);
  const previewItems = probe(r.log, '[data-testid="artifact-preview"] li', 25800).map((x) => x.text);
  if (inspector.length !== 1) throw new Error(`the child-report inspector did not open: ${JSON.stringify(inspector)}`);
  if (!previewHeadings.includes('Commands')) throw new Error(`the child-report Preview lacks its Commands heading: ${JSON.stringify(previewHeadings)}`);
  const expectedPreviewItems = ['node --version', 'node -e "process.exit(7)" — failed, exit 7', 'rm -rf build — exit status not recorded'];
  if (JSON.stringify(previewItems.slice(-3)) !== JSON.stringify(expectedPreviewItems)) throw new Error(`the rendered command ledger is not the ordered truth: ${JSON.stringify(previewItems)}`);
  results.commands = {
    ledger, sidecarHeadings: parsed.headings, toolFilteredRead: readText,
    inspectorPreview: { headings: previewHeadings, commandItems: previewItems.slice(-3) },
    row: { id: record.id, slug: record.slug, status: record.status, importance: record.importance, persona: record.source_persona, task: record.source_task_id },
  };
}

// ---- 7. The attached-artifact section: 100,000 characters, skip-and-continue, an accurate observation -------------
{
  // Bodies chosen so the selection is visible: 55,000 + 46,000 overflow 100,000, 55,000 alone overflowed 48,000, and the
  // short one fits after the second is left out. The three bodies travel in one environment variable, under Linux's
  // 128 KiB limit for one.
  const ATTACH = { 'long-one': 'L'.repeat(55_000), 'long-two': 'M'.repeat(46_000), 'short-one': 'The short attached body.' };
  await launch('attached', {
    ROTARIS_CAPTURE_PROMPT: 'publish three and attach them', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'artifact:artifact_write:long-one,artifact:artifact_write:long-two,artifact:artifact_write:short-one,delegate:coding-agent:build,wait:6000,answer',
    ROTARIS_CHILD_SCRIPT: 'answer',
    ROTARIS_SCRIPT_ARTIFACT_ARGS: JSON.stringify(Object.fromEntries(Object.entries(ATTACH).map(([slug, body]) => [slug, { slug, title: slug, body, tags: ['research'] }]))),
    ROTARIS_SCRIPT_DELEGATE_ARGS: JSON.stringify({ build: { attach_artifacts: ['long-one', 'long-two', 'short-one', 'no-such-artifact'] } }),
    ROTARIS_INTENT_SCRIPT: 'moderate_feature',
    ROTARIS_CAPTURE_AFTER_MS: '12000',
  }, { files: { workspace: WORKSPACE_ORCHESTRATOR } });
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const id = (slug) => rows.find((x) => x.slug === slug)?.id;
  for (const slug of Object.keys(ATTACH)) if (!id(slug)) throw new Error(`the scripted publish of ${slug} stored no artifact: ${JSON.stringify(rows.map((x) => x.slug))}`);
  const child = db.prepare("SELECT task_id, state FROM children WHERE session_id = ? AND canonical_name = 'build'").get(s.session_id);
  const delegated = toolRows(db, s.session_id, 'delegate');
  const selection = db.prepare("SELECT metadata FROM timeline WHERE session_id = ? AND name = 'context_selection' ORDER BY ordinal").all(s.session_id).map((x) => JSON.parse(x.metadata)).filter((m) => m.task_id === child?.task_id);
  const firstMessage = child ? db.prepare("SELECT body FROM agent_messages WHERE session_id = ? AND task_id = ? AND kind = 'message' ORDER BY seq").all(s.session_id, child.task_id).map((x) => JSON.parse(x.body)).find((m) => m.role === 'user') : undefined;
  db.close();
  if (!child) throw new Error('the child `build` was not delegated');
  if (delegated.length !== 1) throw new Error(`expected one delegate call, found ${delegated.length}`);
  const observed = String(delegated[0].entry.result ?? '');
  const leftOut = id('long-two');
  const EXPECTED_OBSERVATION = [
    '2 attached artifacts will be given to the child whole.',
    `1 attached artifact was left out for size, because its whole body would carry the 100,000-character attachment budget past its limit: ${leftOut}; the child is told and can fetch it with artifact_read.`,
    '1 attachment could not be resolved: no-such-artifact.',
  ];
  for (const line of EXPECTED_OBSERVATION) if (!observed.includes(line)) throw new Error(`the delegate observation lacks "${line}": ${JSON.stringify(observed)}`);
  if (/attached to its context/.test(observed)) throw new Error(`the delegate observation still counts references before the budget: ${JSON.stringify(observed)}`);
  if (selection.length !== 1) throw new Error(`expected one context_selection entry for the child, found ${selection.length}`);
  const entry = selection[0];
  if (entry.attached_included !== 2 || JSON.stringify(entry.attached_elided) !== JSON.stringify([leftOut]) || JSON.stringify(entry.attached_unresolved) !== JSON.stringify(['no-such-artifact'])) throw new Error(`the context_selection entry is not the observation's selection: ${JSON.stringify(entry)}`);
  const payload = (firstMessage?.content ?? []).map((p) => (p.kind === 'text' ? p.text : '')).join('');
  if (!payload.includes(`## long-one (${id('long-one')})`) || !payload.includes(`## short-one (${id('short-one')})`)) throw new Error('the child\'s first message does not carry the two attachments it was said to be given');
  if (payload.includes(`## long-two (${leftOut})`) || !payload.includes(`left out: ${leftOut}`)) throw new Error('the child\'s first message does not leave the second long attachment out by name');
  const block = payload.slice(payload.indexOf('PRIOR AGENT CONTEXT (FULL)'));
  const blockSections = block.slice(0, block.search(/\n\(/) === -1 ? block.length : block.search(/\n\(/));
  if (blockSections.length > 100_000) throw new Error(`the attached-artifact section is ${blockSections.length} characters, past REQ-TOOLS-152's 100,000`);
  const summary = readFileSync(join(filesDir(s.session_id), 'summary.md'), 'utf8');
  const elidedLine = summary.split('\n').find((l) => l.startsWith('- Mostly-elided artifacts:')) ?? '';
  if (!/^- Mostly-elided artifacts: 1 \(/.test(elidedLine)) throw new Error(`summary.md does not count the one attachment left out (PD-SESSION-002): "${elidedLine}"`);
  results.attached = {
    childState: child.state, observation: observed.slice(0, 600), contextSelection: entry,
    sectionCharacters: blockSections.length, payloadCarries: ['long-one', 'short-one'], leftOut: { slug: 'long-two', id: leftOut }, summaryLine: elidedLine,
  };
}

// ---- 8 and 9. PD-LIBRARY-003 (c) to (e): a person's edit survives a supersession and travels to the next run ----------
let travel = null;
{
  // 8. A fresh session publishes `travel-plan`; a person edits it in the inspector's Markdown tab and saves, as launch 4 does.
  const TRAVEL = { travel: { slug: 'travel-plan', title: 'Travel plan', body: 'The submitted travel body.\n\nA second paragraph.', tags: ['research'] } };
  const r = await launch('edited', {
    ROTARIS_CAPTURE_PROMPT: 'publish the travel plan', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'artifact:artifact_write:travel,answer',
    ROTARIS_SCRIPT_ARTIFACT_ARGS: JSON.stringify(TRAVEL),
    ROTARIS_CAPTURE_RESIZE: '1360x980@500',
    ROTARIS_CAPTURE_VIEWS: '6@11000',
    ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@11400`, `${PROBE_ROWS}@12000`, '[data-testid="library-artifacts-inspect"]@13000', '[data-testid="artifact-tab-markdown"]@14500', 'textarea[data-testid="artifact-editor"]@15200', '[data-testid="artifact-save"]@17000'].join(';;'),
    // The click focuses the editor at its centre, which is inside the document's frontmatter, and PD-LIBRARY-003 (d) rewrites
    // that block at a re-render: the caret is taken to the end first, so the edit is in the text a re-render keeps.
    ROTARIS_CAPTURE_CHORDS: 'Ctrl+End@15600',
    ROTARIS_CAPTURE_TYPE_AT: 'EDITED-BY-A-PERSON@16000',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="artifact-inspector-status"]@17800',
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '19000',
  });
  const status = probe(r.log, '[data-testid="artifact-inspector-status"]', 17800)[0]?.text ?? '';
  if (status !== 'Saved.') throw new Error(`edited: the footer did not read "Saved.": ${status}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const record = artifacts(db, s.session_id).find((x) => x.slug === 'travel-plan');
  db.close();
  if (!record || record.edited_at === null) throw new Error(`edited: the record did not record the edit: ${JSON.stringify(record)}`);
  // (c): the edit replaces the document and stamps edited_at; key_findings keeps the published value.
  if (record.key_findings !== TRAVEL.travel.body) throw new Error(`edited: key_findings changed with the edit (PD-LIBRARY-003 (c)): ${JSON.stringify(record.key_findings)}`);
  const document = readFileSync(join(filesDir(s.session_id), record.body_file), 'utf8');
  const below = document.replace(/^---\n[\s\S]*?\n---\n/, '');
  if (below === document || !below.includes('EDITED-BY-A-PERSON')) throw new Error(`edited: the typed characters did not reach the document below its frontmatter:\n${document.slice(0, 1200)}`);
  travel = { sessionId: s.session_id, id: record.id, bodyFile: record.body_file, editedAt: record.edited_at };
  results.edited = { id: record.id, editedAt: record.edited_at, keyFindingsKept: true, png: r.png };
}
{
  // 9. The session continued: the fresh root's first message carries the edited document as the handoff (e), marked
  // `edited`, frontmatter removed; then it publishes `travel-plan-2` superseding `travel-plan`, whose re-render keeps the
  // person's text after a rewritten frontmatter (d).
  const requests = join(output, 're-reported.model-requests.jsonl');
  writeFileSync(requests, '');
  await launch('re-reported', {
    ROTARIS_CAPTURE_RESUME: travel.sessionId,
    ROTARIS_CAPTURE_PROMPT: 'supersede the travel plan',
    ROTARIS_CAPTURE_MODEL_REQUESTS: requests,
    ROTARIS_SCRIPT: 'artifact:artifact_write:travel2,answer',
    ROTARIS_SCRIPT_ARTIFACT_ARGS: JSON.stringify({ travel2: { slug: 'travel-plan-2', title: 'Travel plan, second', body: 'The second travel body.', tags: ['research'], supersedes: 'travel-plan' } }),
    ROTARIS_CAPTURE_AFTER_MS: '9000',
  });
  const calls = readFileSync(requests, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  const root = calls.find((c) => c.who === 'orchestrator');
  if (!root) throw new Error('re-reported: the model port recorded no orchestrator call');
  const handoff = root.firstUser;
  const header = `Artifact: ${travel.id} — Travel plan (agent_published, published, edited)`;
  if (!handoff.includes(header)) throw new Error(`re-reported: the continuation's handoff does not carry the edited artifact marked edited (PD-LIBRARY-003 (e)):\n${handoff.slice(0, 2000)}`);
  const carried = handoff.slice(handoff.indexOf(header));
  if (!carried.includes('EDITED-BY-A-PERSON')) throw new Error(`re-reported: the handoff does not carry the person's edit:\n${carried.slice(0, 1500)}`);
  if (/^(?:id|slug|created_at): "/m.test(carried.slice(0, 1200))) throw new Error(`re-reported: the handoff carries the document's frontmatter:\n${carried.slice(0, 600)}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const rows = artifacts(db, travel.sessionId);
  db.close();
  const older = rows.find((x) => x.id === travel.id);
  const newer = rows.find((x) => x.slug === 'travel-plan-2');
  if (!newer) throw new Error(`re-reported: the superseding publish stored no artifact: ${JSON.stringify(rows.map((x) => x.slug))}`);
  if (older?.superseded_by !== newer.id) throw new Error(`re-reported: travel-plan is not superseded by travel-plan-2: ${JSON.stringify(older)}`);
  const document = readFileSync(join(filesDir(travel.sessionId), travel.bodyFile), 'utf8');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(document);
  if (!front || !front[1].includes(`superseded_by: "${newer.id}"`)) throw new Error(`re-reported: the superseded document's frontmatter was not rewritten from the record (PD-LIBRARY-003 (d)):\n${document.slice(0, 800)}`);
  if (!document.slice(front[0].length).includes('EDITED-BY-A-PERSON')) throw new Error(`re-reported: the re-render wrote over the person's edit (PD-LIBRARY-003 (d)):\n${document.slice(0, 1200)}`);
  results.reReported = { handoffHeader: header, handoffCarriesEdit: true, supersededBy: newer.id, frontmatterRewritten: true, editKept: true };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
