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
 *                  that entry linked back onto the record.
 *   3. bad tag   — an invalid tag refuses the publish WHOLE: the observation is REQ-LIBRARY-089's wording, and
 *                  no row, no file and no partial state are left behind.
 *   4. inspector — the inspector opens on the selected row, the Markdown tab is edited and saved, the table's
 *                  status cell gains ` · edited`, and opening the same id again RE-RAISES the one dialog
 *                  (REQ-LIBRARY-131/132/133).
 *   5. missing   — the body file is deleted underneath a stored session; on a relaunch that resumes it the
 *                  record is still listed and the inspector reports the failure (REQ-LIBRARY-091, 134).
 *   6. commands  — PD-LIBRARY-001: a child runs three ordered terminal calls (success, exit 7, one the
 *                  permission gate denies) and its child report carries the command ledger — exact order and
 *                  statuses — checked in SQLite, through the `artifact_read` sections filter (the tool path
 *                  the port's drifted allow-list broke), in the Markdown sidecar via the stock parser, and
 *                  rendered in the artifact inspector.
 *
 * Evidence under `.proof/artifacts-proof/`: one log and PNG per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases } from './lib/harness.mjs';

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
const configDir = join(local, 'rotaris', 'config');
const preferences = join(root, 'preferences');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
mkdirSync(configDir, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Artifacts proof workspace\n');

/**
 * The global configuration. `code_intelligence` is switched off: Part T's shipped entry starts a bundled
 * runtime (~4.5 s) ahead of every run, and this proof measures the artifact store rather than that runtime.
 * The personas declare `artifact_write` — no BUILT-IN persona does, because publishing is a grant
 * (REQ-TOOLS-002/004), and the gap is recorded in the handoff.
 */
function globalYaml({ personas = {} } = {}) {
  return [
    '# scratch configuration written by the artifacts proof',
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'personas:',
    '  orchestrator: { tools: [read_file, grep, glob, delegate, todo, artifact_read, artifact_list, artifact_write] }',
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

function launch(name, extra, { files = {}, timeout = 180_000 } = {}) {
  writeFileSync(join(configDir, 'agents.yaml'), files.global ?? globalYaml());
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), files.workspace ?? WORKSPACE_SINGLE);
  const png = join(output, `${name}.png`);
  const started = Date.now();
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), workspace], {
    cwd: app, encoding: 'utf8', timeout, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: local, APPDATA: join(dirname(local), 'roaming'), ROTARIS_PREFERENCES_ROOT: preferences,
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_INTENT_SCRIPT: 'explicit_trivial', ROTARIS_CIRCUIT_BREAKER: 'off', ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const elapsedMs = Date.now() - started;
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
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
// The Library opens on its FIRST tab (REQ-LIBRARY-103's order), so every launch below picks the Artifacts tab
// after the view switch. Before the merge this proof drove a Library that held only this tab and needed no click.
const ARTIFACTS_TAB = '[data-testid="library-tab"][data-tab="artifacts"]';
const PROBES = [PROBE_ROWS, '[data-testid="library-artifacts"]', '[data-testid="library-artifacts-empty"]', '[data-testid="library-artifacts-inspect"]', '[data-testid="artifact-inspector"]', '[data-testid="artifact-inspector-meta"]', '[data-testid="artifact-inspector-status"]', '[data-testid="artifact-preview"]', '[data-testid="artifact-save"]'];
const results = {};

// ---- 1. A scripted run publishes; the row appears on the next refresh; the sidecar parses elsewhere ----------
{
  const r = launch('publish', {
    // The Library is shown FIRST (empty), the run then publishes, the view is left and returned to: the row
    // appears on the next refresh, with no restart and no manual reload (REQ-LIBRARY-136).
    ROTARIS_CAPTURE_VIEWS: '6@1200;;2@2000;;6@14000',
    ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@1400`, `${ARTIFACTS_TAB}@14400`].join(';;'),
    ROTARIS_CAPTURE_PROMPT: 'publish the plan', ROTARIS_CAPTURE_PROMPT_MS: '2600',
    ROTARIS_SCRIPT: 'artifact:artifact_write,artifact:artifact_list,answer',
    ROTARIS_CAPTURE_PROBE_AT: `${PROBE_ROWS}@1600;;[data-testid="library-artifacts-empty"]@1600`,
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '16000',
  });
  const before = probe(r.log, PROBE_ROWS, 1600);
  const emptyBefore = probe(r.log, '[data-testid="library-artifacts-empty"]', 1600);
  const after = probe(r.log, PROBE_ROWS);
  if (before.length !== 0) throw new Error(`the Library showed ${before.length} row(s) before the run published`);
  if (emptyBefore.length !== 1) throw new Error('the empty state was not shown before the run published');
  if (after.length !== 1) throw new Error(`the published artifact did not appear on the next refresh: ${JSON.stringify(after)}`);
  const db = new Database(oneDatabase(), { readonly: true });
  const s = latestSession(db);
  const rows = artifacts(db, s.session_id);
  const writes = toolRows(db, s.session_id, 'artifact_write');
  const listing = toolRows(db, s.session_id, 'artifact_list');
  db.close();
  if (rows.length !== 1) throw new Error(`expected one artifact row, found ${rows.length}`);
  const record = rows[0];
  if (record.kind !== 'agent_published' || record.status !== 'published') throw new Error(`the record is not an agent publish: ${JSON.stringify(record)}`);
  if (!/^art_[0-9A-Za-z]{8}$/.test(record.id)) throw new Error(`the id is not REQ-LIBRARY-088's shape: ${record.id}`);
  // REQ-LIBRARY-093: `created_by` is the publishing agent INSTANCE by its canonical name — the name the tool call
  // was recorded under. (For the root that name is also its persona; there is one such instance, and a child's is not.)
  if (record.created_by !== writes[0]?.agent_name) throw new Error(`created_by is not the publishing agent's canonical name: ${record.created_by} vs ${writes[0]?.agent_name}`);
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
    rowsBeforeRefresh: before.length, rowsAfterRefresh: after.length,
    record: { id: record.id, slug: record.slug, kind: record.kind, status: record.status, importance: record.importance, createdBy: record.created_by, persona: record.source_persona, bodyFile: record.body_file },
    sessionFiles: files, frontmatter: parsed.front, sections: parsed.headings,
    publishObservation: String(writes[0].entry.result).slice(0, 120),
    listObservation: String(listing[0].entry.result).slice(0, 200),
    tabRow: after[0],
  };
}

// ---- 2. Child reports materialise once, each with its artifact_published entry ---------------------------------
{
  const r = launch('children', {
    ROTARIS_CAPTURE_PROMPT: 'delegate twice', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    // The orchestrator publishes FIRST, so the children are created with a session that already holds an
    // artifact: REQ-LIBRARY-097's `PRIOR SIBLING ARTIFACT INDEX` reaches them and its diagnostic is recorded.
    ROTARIS_SCRIPT: 'artifact:artifact_write,delegate:coding-agent:one,delegate:tester:two,wait:4000,answer', ROTARIS_CHILD_SCRIPT: 'answer',
    ROTARIS_INTENT_SCRIPT: 'moderate_feature',
    ROTARIS_CAPTURE_VIEWS: '6@16000', ROTARIS_CAPTURE_CLICKS: `${ARTIFACTS_TAB}@16400`, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
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
  results.children = {
    children: children.map((c) => `${c.canonical_name}:${c.state}`),
    artifacts: reports.map((x) => ({ id: x.id, slug: x.slug, status: x.status, importance: x.importance, task: x.source_task_id, persona: x.source_persona, timelineEventId: x.timeline_event_id })),
    publishedEntries: timeline.length,
    contextSelections: context,
  };
}

// ---- 3. An invalid tag refuses the publish whole ---------------------------------------------------------------
{
  const r = launch('bad-tag', {
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

// ---- 4. The inspector: open, edit, save, ` · edited`, and ONE dialog on re-opening -----------------------------
let edited = null;
{
  const r = launch('inspector', {
    ROTARIS_CAPTURE_PROMPT: 'publish the plan', ROTARIS_CAPTURE_PROMPT_MS: '1200',
    ROTARIS_SCRIPT: 'artifact:artifact_write,answer',
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
    ].join(';;'),
    ROTARIS_CAPTURE_TYPE_AT: 'EDITED@16000',
    ROTARIS_CAPTURE_PROBE_AT: [
      '[data-testid="artifact-inspector"]@13800',
      '[data-testid="artifact-inspector-meta"]@13800',
      '[data-testid="artifact-preview"]@14000',
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
  results.inspector = { meta, dirty, status, statusCell: statusCells[0].text, raisedOnReopen: reopened[0].data['data-raised'], dialogs: reopened.length, editedAt: record.edited_at, bodyCarriesEdit: true };
}

// ---- 5. A body file deleted underneath: the record stays listed and the inspector reports the failure ----------
{
  // The store outlives the process; the file does not survive being removed from outside it (REQ-LIBRARY-158's
  // serialisation covers the store, and the bodies deliberately sit outside it).
  rmSync(join(edited.directory, edited.bodyFile), { force: true });
  const r = launch('missing-body', {
    ROTARIS_CAPTURE_RESUME: edited.sessionId,
    ROTARIS_CAPTURE_RESIZE: '1360x980@300',
    ROTARIS_CAPTURE_VIEWS: '6@4000',
    ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@4400`, `${PROBE_ROWS}@5000`, '[data-testid="library-artifacts-inspect"]@6000'].join(';;'),
    ROTARIS_CAPTURE_PROBE_AT: [`${PROBE_ROWS}@4600`, '[data-testid="artifact-inspector-status"]@7200'].join(';;'),
    ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
    ROTARIS_CAPTURE_AFTER_MS: '9000',
  });
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
  results.missingBody = { stillListed: listed.length, status, saveDisabled: true, resumedSession: edited.sessionId };
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
  const r = launch('commands', {
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

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
