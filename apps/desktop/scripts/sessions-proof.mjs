/**
 * The sessions proof (Part U): the session browser's actions end to end — the explicit repair (REQ-SESSION-057/059/060),
 * the delete with its checkpoint-ref cleanup (REQ-SESSION-166, REQ-GIT-069/151), the four-record export (REQ-SESSION-199,
 * ADR-0024), the trajectory export single and batched (REQ-SESSION-153/189/193, REQ-EVENTS-132/144/145/166), the unreadable
 * row (REQ-SESSION-041) and the backup disclosure (REQ-SESSION-200), all from the browser REQ-SESSION-182 names. Scripted
 * client, scratch store, one scratch repository with checkpoints enabled and `.rotaris/` ignored. Sessions a dead process
 * would leave are PLANTED as rows straight into the store between launches — a crash leaves exactly rows. The launches:
 *
 *   1. seed             write,answer → session A completed with checkpoint 1 and its summary file.
 *   2. live             resume A + wait:20000,answer; the browser during the run: Actions → Delete… → confirm → refused with
 *                       REQ-GIT-092's first sentence; the app exits mid-run leaving A `running` behind a dead lock.
 *   3. repair-one       the browser marks A stale; Actions → Repair → the report (id, `running` → `interrupted`, the reason
 *                       naming the pid); the lock released, the timeline entry filed; then About backups → the disclosure panel.
 *   4. repair-all       B (running, no lock), C (running, dead lock) and D (running, a LIVE lock — a child process this
 *                       script holds) planted; Repair all stale → B and C repaired, D untouched; again → "Nothing was stale".
 *   5. export-records   B given an audit three entries over the cap, two issues, a timeline; Export records… on B and on C
 *                       (empty) through the ROTARIS_CAPTURE_SAVE_PATH seam; a SEPARATE node process with no product code
 *                       parses both files: four keys; B's audit `complete: false`, `dropped: 3`, contiguous ordinals; C's four empty.
 *   6. export-trajectory B given two `session.start` boundaries (resumed), C a capped history; Export trajectory… on B → the
 *                       document's keys, the events in order, the resumed warning; C then B ticked → Export selected → the
 *                       three-key wrapper, `count: 2`, C before B, the capped warning.
 *   7. unreadable       G planted with corrupt state → listed as unreadable with the detail, Open refused, Delete works, the rest usable.
 *   8. delete           A given a second ref by hand; F planted bound to a worktree that is gone; Delete A → every table's rows
 *                       gone, both refs gone, the files gone; Delete F → still deletes, the warning logged (REQ-GIT-151).
 *   9. isolated         New session → isolation → write,answer → E in a worktree, its ref in the shared repository.
 *  10. delete-isolated  Delete E → its ref gone from the shared repository's namespace.
 *
 * Evidence under `.proof/sessions-proof/`: one PNG and one log per launch, the delete confirmation's PNG, the exported files,
 * `results.json` with the delete times and the export sizes and times. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cleanEnvironment, findDatabases } from './lib/harness.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'sessions-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);



const PROBES = [
  '.session-browser tr[data-session-id]', '[data-testid="session-report"]', '[data-testid="session-browser-error"]', '[data-testid="session-disclosure"]',
  '[data-testid="session-unreadable-detail"]', '[data-testid="session-delete-confirm"]', '.notice__headline', '.notice__detail', '.app-shell',
];

function launch(name, extra, timeoutMs = 150_000) {
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
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  const probesAt = [];
  const shots = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
    const a = /capture: probe-at (\d+) (.+?) → (\[.*\])\s*$/.exec(line);
    if (a) { try { probesAt.push({ at: Number(a[1]), selector: a[2], found: JSON.parse(a[3]) }); } catch { probesAt.push({ at: Number(a[1]), selector: a[2], found: [] }); } }
    const s = /capture: shot-probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (s) { try { shots[s[1]] = JSON.parse(s[2]); } catch { shots[s[1]] = []; } }
  }
  return { png, log, probes, probesAt, shots };
}
const text = (probes, selector) => (probes[selector] ?? []).map((p) => p.text);
const at = (r, ms, selector) => r.probesAt.filter((p) => p.at === ms && p.selector === selector).flatMap((p) => p.found);
const atText = (r, ms, selector) => at(r, ms, selector).map((p) => p.text).join('\n');
const rowAt = (r, ms, sid) => at(r, ms, '.session-browser tr[data-session-id]').find((p) => p.data['data-session-id'] === sid) ?? null;
const expect = (ok, message) => { if (!ok) throw new Error(message); };

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  'rotaris:', '  delegation_strategy: single',
  'checkpoints:', '  enabled: true', '',
].join('\n'));
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv }).toString().trim();
git(workspace, 'init', '-q', '-b', 'main');
git(workspace, 'config', 'core.autocrlf', 'false');
// Both directories the load's amendment keeps ignored (REQ-CONFIG-013 / REQ-MCP-089; the runtime's marker since Parts T and U),
// so the amendment is a no-op on this scratch repository and the tree stays clean.
writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
writeFileSync(join(workspace, 'README.md'), '# Sessions proof workspace\n');
git(workspace, 'add', 'README.md', '.gitignore');
git(workspace, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
const refsOf = (cwd, sid) => git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)', `refs/rotaris/checkpoints/${sid}/`).split(/\r?\n/).filter((l) => l !== '').map((l) => l.split(' '));

const dbFile = () => { const databases = findDatabases(local); if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`); return databases[0]; };
const withDb = (fn) => { const db = new Database(dbFile()); try { return fn(db); } finally { db.close(); } };
const sessionRow = (sid) => withDb((db) => db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sid));
const latestSession = () => withDb((db) => db.prepare('SELECT * FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get());
const countIn = (table, sid) => withDb((db) => db.prepare(`SELECT count(*) AS c FROM ${table} WHERE session_id = ?`).get(sid).c);
const tablesWithSession = () => withDb((db) => db.prepare("SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'session_id')").all().map((t) => t.name));
const tablesReferencingSessions = () => withDb((db) => db.prepare("SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) WHERE \"table\" = 'sessions')").all().map((t) => t.name));
const machineId = () => readFileSync(join(local, 'rotaris', 'data', 'machine-id'), 'utf8').split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0 && !s.startsWith('#'));
/** A session a dead process would have left: rows only. */
const plantSession = (sid, status, opts = {}) => withDb((db) => {
  const wsRoot = opts.workspaceRoot ?? db.prepare('SELECT workspace_root FROM sessions LIMIT 1').get().workspace_root;
  db.prepare('INSERT INTO sessions (session_id, execution_status, workspace_root, created_at, updated_at, worktree) VALUES (?, ?, ?, ?, ?, ?)').run(sid, status, wsRoot, opts.createdAt ?? '2026-09-05T09:00:00.000Z', opts.updatedAt ?? '2026-09-05T09:05:00.000Z', opts.worktree ?? null);
  db.prepare("INSERT INTO transcript_rows (session_id, row_index, kind, settled, body, at, persona, name, ts) VALUES (?, 0, 'user', 1, ?, '', NULL, NULL, '')").run(sid, opts.prompt ?? `planted prompt of ${sid}`);
  if (opts.progress !== undefined) db.prepare('UPDATE sessions SET progress = ? WHERE session_id = ?').run(opts.progress, sid);
  if (opts.lock) db.prepare('INSERT INTO session_locks (session_id, pid, host, acquired_at) VALUES (?, ?, ?, ?)').run(sid, opts.lock.pid, opts.lock.host ?? machineId(), '2026-09-05T09:00:00.000Z');
  return sid;
});
const plantEvent = (db, sid, ordinal, kind, payload) => {
  const timestamp = `2026-09-05T09:00:${String(ordinal).padStart(2, '0')}.000Z`;
  db.prepare('INSERT INTO events (session_id, ordinal, kind, at, schema_version, iteration, payload) VALUES (?, ?, ?, ?, 1, NULL, ?)').run(sid, ordinal, kind, timestamp, JSON.stringify({ ...payload, event: kind, session_id: sid, timestamp, schema_version: 1 }));
};
const results = {};
const NOTHING_STALE = 'Nothing was stale: every session either asserts no run in progress or is still held by a live process.';
const LIVE_REFUSAL = "This session is still running. Deleting it would destroy the run's own record, so wait for it to finish or stop it first.";

// 1. seed — session A with checkpoint 1.
const seed = launch('seed', { ROTARIS_SCRIPT: 'write,answer', ROTARIS_CAPTURE_PROMPT: 'Write the notes.', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500' });
const A = latestSession().session_id;
{
  expect(sessionRow(A).execution_status === 'completed', `seed ended ${sessionRow(A).execution_status}`);
  expect(countIn('checkpoints', A) === 1, `A has ${countIn('checkpoints', A)} checkpoint rows`);
  expect(refsOf(workspace, A).length === 1, 'A has no ref');
  const files = join(dirname(dbFile()), 'sessions', A);
  expect(existsSync(join(files, 'summary.md')), `no summary.md under ${files}`);
  results.seed = { sessionId: A, png: seed.png };
}

// 2. live — the delete refused during a run; the app exits mid-run and leaves A running behind a dead lock.
const rowSel = (sid) => `.session-browser tr[data-session-id="${sid}"]`;
const live = launch('live', {
  ROTARIS_SCRIPT: 'wait:20000,answer', ROTARIS_CAPTURE_RESUME: A, ROTARIS_CAPTURE_PROMPT: 'Wait a while.',
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@7000;;${rowSel(A)} [data-testid="session-actions"]@7800;;[data-testid="session-delete"]@8400;;.confirm-dialog .btn-danger@9400`,
  ROTARIS_CAPTURE_SHOT: `${join(output, 'delete-confirm-live.png')}@9000`,
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="session-browser-error"]@10600',
  ROTARIS_CAPTURE_AFTER_MS: '12000',
});
{
  const error = atText(live, 10600, '[data-testid="session-browser-error"]');
  expect(error.includes(LIVE_REFUSAL), `the live delete was answered "${error}"`);
  expect(live.shots['[data-testid="session-delete-confirm"]']?.length === 1, 'the confirmation dialog was not on screen for the shot');
  const row = sessionRow(A);
  expect(row.execution_status === 'running', `A was left ${row.execution_status}; the repair scenario needs a persisted-running session`);
  expect(sessionRow(A) && countIn('session_locks', A) === 1, 'A has no dead lock');
  results.live = { refused: true, text: error, leftRunning: true, png: live.png, dialogPng: join(output, 'delete-confirm-live.png') };
}

// 3. repair-one — the stale row, Actions → Repair, the report; then the disclosure.
const repairOne = launch('repair-one', {
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@1200;;${rowSel(A)} [data-testid="session-actions"]@2600;;[data-testid="session-repair"]@3200;;[data-testid="session-disclosure-toggle"]@4800`,
  ROTARIS_CAPTURE_PROBE_AT: `.session-browser tr[data-session-id]@2400;;[data-testid="session-report"]@4500;;.session-browser tr[data-session-id]@4500;;[data-testid="session-disclosure"]@5600;;[data-testid="session-disclosure-carried"]@5600;;[data-testid="session-disclosure-remedies"]@5600`,
  ROTARIS_CAPTURE_PNG_AT: `${join(output, 'repair-one-report.png')}@4600`,
  ROTARIS_CAPTURE_AFTER_MS: '6500',
});
{
  const before = rowAt(repairOne, 2400, A);
  expect(before?.data['data-stale'] === 'true' && /stale/.test(before.text), `A was not marked stale: ${JSON.stringify(before)}`);
  const report = atText(repairOne, 4500, '[data-testid="session-report"]');
  expect(report.includes(`Session ${A} was stuck at 'running' and is now 'interrupted'`), `the repair report reads "${report}"`);
  expect(/its process \(pid \d+\) is gone/.test(report), `the reason does not name the pid: "${report}"`);
  const after = rowAt(repairOne, 4500, A);
  expect(after?.data['data-stale'] === 'false' && /interrupted/.test(after.text), `A after the repair: ${JSON.stringify(after)}`);
  const row = sessionRow(A);
  expect(row.execution_status === 'interrupted', `A reads ${row.execution_status}`);
  expect(countIn('session_locks', A) === 0, 'the orphaned lock was not released');
  // REQ-SESSION-062 names this entry `session.interrupted_recovered`. The first implementation invented
  // `session_marked_interrupted`, and OQ-46's audit corrected the product without correcting the proofs that assert
  // the invented name (`docs/defects/fixed/the-proofs-assert-a-timeline-name-the-audit-corrected.md`).
  expect(withDb((db) => db.prepare("SELECT count(*) AS c FROM timeline WHERE session_id = ? AND name = 'session.interrupted_recovered'").get(A).c) === 1, 'no session.interrupted_recovered entry');
  // The probe cuts text at 400 characters, so the three paragraphs are read one by one.
  const disclosure = atText(repairOne, 5600, '[data-testid="session-disclosure"]');
  const carried = atText(repairOne, 5600, '[data-testid="session-disclosure-carried"]');
  const remedies = atText(repairOne, 5600, '[data-testid="session-disclosure-remedies"]');
  expect(/does not carry its session history/.test(disclosure) && /permission audit/.test(disclosure), `the disclosure reads "${disclosure.slice(0, 200)}"`);
  expect(/repository/.test(carried) && /identifier travels with the workspace/.test(carried) && /checkpoints are objects in your repository/.test(carried), `the carried paragraph reads "${carried}"`);
  expect(/Back up store/.test(remedies) && /Restore store/.test(remedies) && /Export records/.test(remedies) && /Export trajectory/.test(remedies), `the remedies paragraph reads "${remedies}"`);
  results.repairOne = { report, lockReleased: true, timelineEntry: true, disclosure: { opening: disclosure.slice(0, 160), carried, remedies }, png: repairOne.png, reportPng: join(output, 'repair-one-report.png') };
}

// 4. repair-all — two stale and one live; then nothing stale.
const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 300000)'], { stdio: 'ignore', windowsHide: true });
try {
  plantSession('B-nolock', 'running');
  plantSession('C-deadlock', 'running', { lock: { pid: 4242 } });
  plantSession('D-live', 'running', { lock: { pid: holder.pid } });
  const repairAll = launch('repair-all', {
    ROTARIS_CAPTURE_CLICKS: '.title-bar__sessions@1200;;[data-testid="session-repair-all"]@2400;;[data-testid="session-repair-all"]@4600',
    ROTARIS_CAPTURE_PROBE_AT: '[data-testid="session-report"]@3800;;[data-testid="session-report"]@6000;;.session-browser tr[data-session-id]@6000',
    ROTARIS_CAPTURE_PNG_AT: `${join(output, 'repair-all-report.png')}@3900`,
    ROTARIS_CAPTURE_AFTER_MS: '7000',
  });
  const first = atText(repairAll, 3800, '[data-testid="session-report"]');
  expect(first.includes("Session B-nolock was stuck at 'running' and is now 'interrupted': no process holds a lock for it"), `repair-all's first report: "${first}"`);
  expect(first.includes("Session C-deadlock was stuck at 'running' and is now 'interrupted': the lock names this machine and its process (pid 4242) is gone"), `repair-all's first report: "${first}"`);
  expect(!first.includes('D-live'), `the live session appears in the report: "${first}"`);
  const second = atText(repairAll, 6000, '[data-testid="session-report"]');
  expect(second.includes(NOTHING_STALE), `the second report reads "${second}"`);
  expect(sessionRow('B-nolock').execution_status === 'interrupted' && sessionRow('C-deadlock').execution_status === 'interrupted', 'B or C not repaired');
  expect(sessionRow('D-live').execution_status === 'running' && countIn('session_locks', 'D-live') === 1, 'the live session was touched');
  const dRow = rowAt(repairAll, 6000, 'D-live');
  expect(dRow?.data['data-stale'] === 'false', `D-live is marked stale: ${JSON.stringify(dRow)}`);
  results.repairAll = { repaired: ['B-nolock', 'C-deadlock'], liveUntouched: 'D-live', livePid: holder.pid, nothingStaleSecondTime: true, png: repairAll.png, reportPng: join(output, 'repair-all-report.png') };
} finally { holder.kill(); }

// 5. export-records — B capped, C empty; a separate node process parses the files.
const exportsDir = join(output, 'exports');
mkdirSync(exportsDir, { recursive: true });
const CAP = 5000;
withDb((db) => {
  const insertAudit = db.prepare("INSERT INTO permission_audit (session_id, ordinal, recorded_at, kind, entry, agent_id, persona, tool_name, decision, rule_id, source) VALUES (?, ?, ?, 'decision', ?, 'root', 'orchestrator', ?, ?, 'r1', 'policy')");
  const tx = db.transaction(() => {
    for (let o = 4; o <= CAP + 3; o++) insertAudit.run('B-nolock', o, `2026-09-05T09:0${o % 10}:00.000Z`, JSON.stringify({ id: o, timestamp: 't', session_id: 'B-nolock', agent_id: 'root', persona: 'orchestrator', tool_name: `tool${o}`, decision: o % 9 === 0 ? 'deny' : 'allow', rule_id: 'r1', source: 'policy', summary: `call ${o}`, reason: 'planted' }), `tool${o}`, o % 9 === 0 ? 'deny' : 'allow');
    db.prepare("INSERT INTO ring_state (session_id, kind, next_ordinal, held, dropped) VALUES ('B-nolock', 'permission_audit', ?, ?, 3)").run(CAP + 4, CAP);
    db.prepare("INSERT INTO issues (session_id, ordinal, id, recorded_at, kind, severity, actor, message, evidence_ref, metadata) VALUES ('B-nolock', 1, 'aaaaaaaaaaaa', 't1', 'permission_denied', 'warning', 'gate', 'denied once', 'permission_audit#9', '{}')").run();
    db.prepare("INSERT INTO issues (session_id, ordinal, id, recorded_at, kind, severity, actor, message, evidence_ref, metadata) VALUES ('B-nolock', 2, 'bbbbbbbbbbbb', 't2', 'tool_error', 'warning', 'gate', 'a tool errored', '', '{\"k\":1}')").run();
    db.prepare("INSERT INTO ring_state (session_id, kind, next_ordinal, held, dropped) VALUES ('B-nolock', 'issues', 3, 2, 0)").run();
    // The repair already filed B's `session.interrupted_recovered` at ordinal 1; the planted entries follow it.
    const next = db.prepare("SELECT coalesce(max(ordinal), 0) + 1 AS n FROM timeline WHERE session_id = 'B-nolock'").get().n;
    for (const [i, name] of [[0, 'run_start'], [1, 'issue'], [2, 'run_end']]) db.prepare("INSERT INTO timeline (session_id, ordinal, at, name, actor, message, metadata) VALUES ('B-nolock', ?, ?, ?, 'rotaris', ?, '{}')").run(next + i, `2026-09-05T09:1${i}:00.000Z`, name, `${name} planted`);
  });
  tx();
});
const recordsB = join(exportsDir, 'records-B.json');
const recordsC = join(exportsDir, 'records-C.json');
const exportRecords = launch('export-records', {
  ROTARIS_CAPTURE_SAVE_PATH: `${recordsB};;${recordsC}`,
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@1200;;${rowSel('B-nolock')} [data-testid="session-actions"]@2400;;[data-testid="session-export-records"]@3000;;${rowSel('C-deadlock')} [data-testid="session-actions"]@5000;;[data-testid="session-export-records"]@5600`,
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="session-report"]@4600;;[data-testid="session-report"]@7200',
  ROTARIS_CAPTURE_AFTER_MS: '8000',
});
{
  const first = atText(exportRecords, 4600, '[data-testid="session-report"]');
  expect(first.includes('Wrote 1 records document to') && first.includes('The permission audit is capped: 3 earlier entries were dropped'), `B's report reads "${first}"`);
  const second = atText(exportRecords, 7200, '[data-testid="session-report"]');
  expect(second.includes('Wrote 1 records document to') && !second.includes('capped'), `C's report reads "${second}"`);
  // A stock parser on a machine with none of this product's code: a separate node process, JSON.parse and nothing else.
  const check = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const b = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const ords = b.permission_audit.entries.map((e) => e.ordinal);
    const contiguous = ords.every((o, i) => i === 0 || o === ords[i - 1] + 1);
    console.log(JSON.stringify({
      bKeys: Object.keys(b).sort(), cKeys: Object.keys(c).sort(),
      audit: { complete: b.permission_audit.complete, dropped: b.permission_audit.dropped, retained: b.permission_audit.retained, oldest: b.permission_audit.oldest_ordinal, newest: b.permission_audit.newest_ordinal, cap: b.permission_audit.cap, entries: ords.length, contiguous, arithmetic: b.permission_audit.dropped + b.permission_audit.retained === b.permission_audit.newest_ordinal && b.permission_audit.oldest_ordinal - 1 === b.permission_audit.dropped, firstEntryFields: Object.keys(b.permission_audit.entries[0].entry).sort(), firstOrdinal: ords[0] },
      issues: { count: b.issues.entries.length, ids: b.issues.entries.map((e) => e.entry.id), locator: b.issues.entries[0].entry.evidence_ref, complete: b.issues.complete },
      timeline: b.timeline.map((t) => [t.ordinal, t.type, t.id ?? null, t.severity ?? null]),
      metrics: { session_id: b.metrics.session_id, decisions: b.metrics.permission_decisions, denials: b.metrics.permission_denials, issuesTotal: b.metrics.issues_total, buckets: b.metrics.tool_outcomes },
      empty: { timeline: c.timeline.map((t) => t.type), issues: c.issues.entries.length, audit: c.permission_audit.entries.length, auditComplete: c.permission_audit.complete, metricsId: c.metrics.session_id },
    }));
  `, recordsB, recordsC], { encoding: 'utf8' });
  expect(check.status === 0, `the stock parse failed: ${check.stderr}`);
  const parsed = JSON.parse(check.stdout);
  expect(JSON.stringify(parsed.bKeys) === '["issues","metrics","permission_audit","timeline"]' && JSON.stringify(parsed.cKeys) === '["issues","metrics","permission_audit","timeline"]', `keys: ${JSON.stringify([parsed.bKeys, parsed.cKeys])}`);
  expect(parsed.audit.complete === false && parsed.audit.dropped === 3 && parsed.audit.retained === CAP && parsed.audit.entries === CAP && parsed.audit.contiguous && parsed.audit.arithmetic && parsed.audit.firstOrdinal === 4 && parsed.audit.cap === CAP, `B's audit: ${JSON.stringify(parsed.audit)}`);
  expect(parsed.audit.firstEntryFields.includes('id') && parsed.audit.firstEntryFields.includes('decision') && parsed.audit.firstEntryFields.includes('rule_id'), `the entry's fields: ${JSON.stringify(parsed.audit.firstEntryFields)}`);
  expect(parsed.issues.count === 2 && parsed.issues.ids[0] === 'aaaaaaaaaaaa' && parsed.issues.locator === 'permission_audit#9' && parsed.issues.complete === true, `B's issues: ${JSON.stringify(parsed.issues)}`);
  expect(parsed.timeline.length === 4 && parsed.timeline[0][1] === 'session.interrupted_recovered' && JSON.stringify(parsed.timeline.slice(1).map((t) => t[1])) === '["run_start","issue","run_end"]' && parsed.timeline.every((t, i) => t[0] === i + 1), `B's timeline: ${JSON.stringify(parsed.timeline)}`);
  // REQ-SESSION-134 / REQ-SESSION-199, the repair of Part U's thirty-second defect (schema v10): the entry the PRODUCT
  // wrote — the repair's own `session.interrupted_recovered` — carries a 12-hex id and a severity through the export and out
  // to a stock parser. Its severity is REQ-SESSION-062's `warning` — the same correction as the entry's name, and asserted
  // as `info` here until Part AT. The three planted with the pre-v10 column list carry no `id` key at all (an identifier
  // the record never held is not invented on the way out) and read the requirement's default severity.
  expect(/^[0-9a-f]{12}$/.test(parsed.timeline[0][2] ?? '') && parsed.timeline[0][3] === 'warning', `the written entry's id and severity: ${JSON.stringify(parsed.timeline[0])}`);
  expect(parsed.timeline.slice(1).every((t) => t[2] === null && t[3] === 'info'), `the pre-v10 entries: ${JSON.stringify(parsed.timeline.slice(1))}`);
  expect(parsed.metrics.session_id === 'B-nolock' && parsed.metrics.decisions === CAP && parsed.metrics.issuesTotal === 2, `B's metrics: ${JSON.stringify(parsed.metrics)}`);
  // C holds nothing but the repair's own timeline entry: the two rings export as empty records with `complete: true`, never as nothing.
  expect(JSON.stringify(parsed.empty.timeline) === '["session.interrupted_recovered"]' && parsed.empty.issues === 0 && parsed.empty.audit === 0 && parsed.empty.auditComplete === true && parsed.empty.metricsId === 'C-deadlock', `C's empty records: ${JSON.stringify(parsed.empty)}`);
  const lines = [...exportRecords.log.matchAll(/records exported to (\S+): .*?; (\d+) bytes in (\d+) attempt\(s\), (\d+) ms/g)].map((m) => ({ destination: m[1], bytes: Number(m[2]), attempts: Number(m[3]), ms: Number(m[4]) }));
  expect(lines.length === 2, `export lines: ${JSON.stringify(lines)}`);
  results.exportRecords = { parsedByStockParser: parsed, files: [recordsB, recordsC], sizes: [statSync(recordsB).size, statSync(recordsC).size], writes: lines, png: exportRecords.png };
}

// 6. export-trajectory — B resumed (two session.start boundaries), C capped; single, then the batch C-then-B.
withDb((db) => {
  plantEvent(db, 'B-nolock', 1, 'session.start', { task: 'first run', workspace_root: 'D:/somewhere/else', persona: 'orchestrator', permission_mode: 'ask', sandbox: { enabled: false, backend: '' }, max_iterations: 3 });
  plantEvent(db, 'B-nolock', 2, 'iteration.start', { iteration: 1, task: 'first run' });
  plantEvent(db, 'B-nolock', 3, 'tool.start', { tool_name: 'glob', call_id: 'c1', arguments: { pattern: '*' } });
  plantEvent(db, 'B-nolock', 4, 'tool.finish', { tool_name: 'glob', call_id: 'c1', status: 'completed', duration_ms: 2, error: null });
  plantEvent(db, 'B-nolock', 5, 'session.end', { status: 'interrupted', stop_reason: 'user_cancelled', iterations_completed: 1, duration_seconds: 4, tokens: { input: 3, output: 1, total: 4 }, cost: { total: '0.01' } });
  plantEvent(db, 'B-nolock', 6, 'session.start', { task: 'second run', workspace_root: 'D:/somewhere/else', persona: 'orchestrator', permission_mode: 'autonomous', sandbox: { enabled: false, backend: '' }, max_iterations: 3 });
  plantEvent(db, 'B-nolock', 7, 'permission.decision', { tool_name: 'terminal', decision: 'deny', source: 'policy', rule_id: 'r', summary: 's', request_id: '' });
  plantEvent(db, 'B-nolock', 8, 'usage.update', { tokens: { input: 8, output: 3, total: 11 }, cost: { total: '0.05' } });
  plantEvent(db, 'C-deadlock', 1, 'session.start', { task: 'c task', workspace_root: 'D:/somewhere/else', persona: 'orchestrator', permission_mode: 'ask', sandbox: { enabled: false, backend: '' }, max_iterations: 1 });
  plantEvent(db, 'C-deadlock', 2, 'iteration.start', { iteration: 1, task: 'c task' });
  plantEvent(db, 'C-deadlock', 3, 'error', { message: 'boom', error_class: 'tool_error', detail: 'issues#aaaaaaaaaaaa', fatal: true });
  db.prepare("UPDATE sessions SET truncated = 1, dropped_count = 7, trim_cap = 100, last_trim_at = 't' WHERE session_id = 'C-deadlock'").run();
});
const trajB = join(exportsDir, 'trajectory-B.json');
const batchCB = join(exportsDir, 'trajectories-C-B.json');
const exportTraj = launch('export-trajectory', {
  ROTARIS_CAPTURE_SAVE_PATH: `${trajB};;${batchCB}`,
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@1200;;${rowSel('B-nolock')} [data-testid="session-actions"]@2400;;[data-testid="session-export-trajectory"]@3000;;${rowSel('C-deadlock')} input[type="checkbox"]@4800;;${rowSel('B-nolock')} input[type="checkbox"]@5300;;[data-testid="session-export-selected"]@5900`,
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="session-report"]@4500;;[data-testid="session-report"]@7400',
  ROTARIS_CAPTURE_PNG_AT: `${join(output, 'export-trajectory-report.png')}@7500`,
  ROTARIS_CAPTURE_AFTER_MS: '8200',
});
{
  const first = atText(exportTraj, 4500, '[data-testid="session-report"]');
  expect(first.includes('Wrote 1 trajectory document to') && first.includes('Session B-nolock was resumed: the document spans 2 runs and its identity fields describe the most recent one.'), `B's trajectory report reads "${first}"`);
  const second = atText(exportTraj, 7400, '[data-testid="session-report"]');
  expect(second.includes('Wrote 2 trajectory documents to') && second.includes("Session C-deadlock's history is capped: 7 events were dropped, so the document does not cover the whole run."), `the batch report reads "${second}"`);
  const check = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const b = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const batch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    console.log(JSON.stringify({
      keys: Object.keys(b).sort(), version: b.trajectory_version, task: b.task, workspace: b.workspace, mode: b.permission_mode, status: b.status,
      eventOrder: b.events.map((e) => e.event), summary: b.summary, truncated: b.truncated, dropped: b.dropped_events,
      batchKeys: Object.keys(batch).sort(), count: batch.count, order: batch.trajectories.map((t) => t.session_id), cDropped: batch.trajectories[0].dropped_events, cTruncated: batch.trajectories[0].truncated, cFatal: batch.trajectories[0].summary.fatal_errors,
    }));
  `, trajB, batchCB], { encoding: 'utf8' });
  expect(check.status === 0, `the stock parse failed: ${check.stderr}`);
  const parsed = JSON.parse(check.stdout);
  expect(JSON.stringify(parsed.keys) === JSON.stringify(['dropped_events', 'duration_seconds', 'ended_at', 'events', 'permission_mode', 'session_id', 'started_at', 'status', 'stop_reason', 'summary', 'task', 'trajectory_version', 'truncated', 'workspace']), `B's keys: ${JSON.stringify(parsed.keys)}`);
  expect(parsed.version === 1 && parsed.task === 'second run' && parsed.workspace === 'D:/somewhere/else' && parsed.mode === 'autonomous' && parsed.truncated === false && parsed.dropped === 0, `B's identity: ${JSON.stringify(parsed)}`);
  expect(JSON.stringify(parsed.eventOrder) === JSON.stringify(['session.start', 'iteration.start', 'tool.start', 'tool.finish', 'session.end', 'session.start', 'permission.decision', 'usage.update']), `B's event order: ${JSON.stringify(parsed.eventOrder)}`);
  expect(parsed.summary.runs === 2 && parsed.summary.events === 8 && parsed.summary.tool_calls === 1 && parsed.summary.permission_denials === 1 && parsed.summary.tokens.total === 11 && parsed.summary.cost === '0.05', `B's summary: ${JSON.stringify(parsed.summary)}`);
  expect(JSON.stringify(parsed.batchKeys) === '["count","trajectories","trajectory_version"]' && parsed.count === 2 && JSON.stringify(parsed.order) === '["C-deadlock","B-nolock"]', `the batch: ${JSON.stringify([parsed.batchKeys, parsed.count, parsed.order])}`);
  expect(parsed.cDropped === 7 && parsed.cTruncated === true && parsed.cFatal === 1, `C in the batch: ${JSON.stringify([parsed.cDropped, parsed.cTruncated, parsed.cFatal])}`);
  expect(!readFileSync(trajB, 'utf8').includes(workspace.replace(/\\/g, '/')) && !readFileSync(trajB, 'utf8').includes(workspace.replace(/\\/g, '\\\\')), 'the trajectory carries a path of this machine');
  const lines = [...exportTraj.log.matchAll(/trajectory export to (\S+): (\d+) document\(s\).*?; (\d+) bytes in (\d+) attempt\(s\), (\d+) ms/g)].map((m) => ({ destination: m[1], documents: Number(m[2]), bytes: Number(m[3]), attempts: Number(m[4]), ms: Number(m[5]) }));
  expect(lines.length === 2, `trajectory export lines: ${JSON.stringify(lines)}`);
  results.exportTrajectory = { parsedByStockParser: parsed, files: [trajB, batchCB], sizes: [statSync(trajB).size, statSync(batchCB).size], writes: lines, png: exportTraj.png, reportPng: join(output, 'export-trajectory-report.png') };
}

// 7. unreadable — G's corrupt state: listed with the detail, Open refused, Delete works, the rest usable.
plantSession('G-corrupt', 'completed', { progress: '{"unterminated": ' });
const unreadable = launch('unreadable', {
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@1200;;${rowSel('G-corrupt')} [data-testid="session-open"]@2600;;${rowSel('G-corrupt')} [data-testid="session-actions"]@3400;;[data-testid="session-delete"]@4000;;.confirm-dialog .btn-danger@5200`,
  ROTARIS_CAPTURE_PROBE_AT: `.session-browser tr[data-session-id]@2400;;[data-testid="session-unreadable-detail"]@2400;;${rowSel('G-corrupt')} [data-testid="session-open"]@2400;;.session-browser tr[data-session-id]@3200;;[data-testid="session-report"]@6600;;.session-browser tr[data-session-id]@6600`,
  ROTARIS_CAPTURE_SHOT: `${join(output, 'delete-confirm-unreadable.png')}@4700`,
  ROTARIS_CAPTURE_PNG_AT: `${join(output, 'unreadable-row.png')}@2500`,
  ROTARIS_CAPTURE_AFTER_MS: '7400',
});
{
  const g = rowAt(unreadable, 2400, 'G-corrupt');
  expect(g?.data['data-unreadable'] === 'true' && /unreadable/.test(g.text), `G's row: ${JSON.stringify(g)}`);
  const detail = atText(unreadable, 2400, '[data-testid="session-unreadable-detail"]');
  expect(/unreadable stored state/.test(detail) && /JSON/i.test(detail), `the detail reads "${detail}"`);
  const open = at(unreadable, 2400, `${rowSel('G-corrupt')} [data-testid="session-open"]`)[0];
  expect(open?.data['data-refused'] === 'true', `Open on the unreadable row: ${JSON.stringify(open)}`);
  // The click on Open at 2600 did nothing: the browser is still open with every row at 3200.
  const still = at(unreadable, 3200, '.session-browser tr[data-session-id]');
  expect(still.length >= 5 && still.some((r) => r.data['data-session-id'] === 'G-corrupt'), `after clicking Open: ${still.length} rows`);
  expect(unreadable.shots['[data-testid="session-delete-confirm"]']?.[0]?.text.includes('Its stored state is unreadable'), 'the confirmation did not state the unreadable state');
  const report = atText(unreadable, 6600, '[data-testid="session-report"]');
  expect(report.includes('Deleted session G-corrupt permanently (its stored state was unreadable)'), `G's delete report reads "${report}"`);
  expect(sessionRow('G-corrupt') === undefined, 'G still exists');
  const rows = at(unreadable, 6600, '.session-browser tr[data-session-id]').map((r) => r.data['data-session-id']);
  expect(!rows.includes('G-corrupt') && rows.includes(A) && rows.includes('B-nolock'), `rows after G's delete: ${JSON.stringify(rows)}`);
  results.unreadable = { detail, openRefused: true, deleted: true, othersUsable: rows, png: unreadable.png, rowPng: join(output, 'unreadable-row.png'), dialogPng: join(output, 'delete-confirm-unreadable.png') };
}

// 8. delete — A with two refs; F bound to a tree that is gone.
const head = git(workspace, 'rev-parse', 'HEAD');
git(workspace, 'update-ref', `refs/rotaris/checkpoints/${A}/2`, head);
withDb((db) => db.prepare("INSERT INTO checkpoints (session_id, sequence, ref, commit_id, created_at, iteration, child_name, files, kind) VALUES (?, 2, ?, ?, 't', 2, '', '[\"README.md\"]', 'iteration')").run(A, `refs/rotaris/checkpoints/${A}/2`, head));
const goneTree = join(root, 'moved-away', 'F-tree');
plantSession('F-moved', 'completed', { worktree: JSON.stringify({ worktree_path: goneTree, branch: 'feat/gone', base_branch: 'main', base_revision: head, created_at: '2026-09-05T09:00:00.000Z', mode: 'isolated' }) });
withDb((db) => db.prepare("INSERT INTO checkpoints (session_id, sequence, ref, commit_id, created_at, iteration, child_name, files, kind) VALUES ('F-moved', 1, 'refs/rotaris/checkpoints/F-moved/1', ?, 't', 1, '', '[]', 'iteration')").run(head));
const filesA = join(dirname(dbFile()), 'sessions', A);
const tables = tablesWithSession();
// Part Y (v12) added `artifacts`: fifteen tables carried a session_id, and the cascade took each of them. Part AK (v15)
// added a sixteenth, `delivery_runs`, whose `session_id` names a session as a fact about the run and carries no foreign
// key, because a requirement's run history outlives the session it names (REQ-TRACE-476; ADR-0041's first execution,
// ruled 2026-09-09). v20 gives `plan_cycles` the reference REQ-SESSION-166's delete assumes, so the cascade takes it
// too and `delivery_runs` stands alone as the one deliberate exception. The cascade premise is therefore "the tables
// whose session_id REFERENCES sessions", read from the schema rather than pinned by count. The count pin that stood
// here was the sixtieth defect: the ruling narrowed the premise in the store's own suite, and nothing carried it to
// this proof until the merge-1 proof pass ran it.
const cascaded = ['sessions', ...tablesReferencingSessions()];
const facts = tables.filter((t) => !cascaded.includes(t));
expect(cascaded.length === 16, `tables whose session_id references sessions: ${cascaded.join(', ')}`);
expect(JSON.stringify(facts) === '["delivery_runs"]', `tables carrying session_id as a fact: ${facts.join(', ')}`);
withDb((db) => db.prepare("INSERT INTO delivery_runs (req_id, unit, session_id, worktree_ref, permissions, status, stage, outcome, started_at, ended_at) VALUES ('REQ-PROOF-001', 'u1', ?, NULL, '', 'running', NULL, NULL, '2026-09-05T09:00:00.000Z', NULL)").run(A));
// v20 (REQ-SESSION-166): A's VERBATIM plan text is planted so the built-app delete below measures the cascade taking it.
withDb((db) => db.prepare("INSERT INTO plan_cycles (session_id, cycle, opened_at, plan, intent, todo) VALUES (?, 1, 't', 'proof plan, verbatim', 'small_feature', '')").run(A));
const plantedBefore = Object.fromEntries(tables.map((t) => [t, countIn(t, A)]));
expect(refsOf(workspace, A).length === 2, `A's refs before: ${JSON.stringify(refsOf(workspace, A))}`);
const del = launch('delete', {
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@1200;;${rowSel(A)} [data-testid="session-actions"]@2400;;[data-testid="session-delete"]@3000;;.confirm-dialog .btn-danger@4200;;${rowSel('F-moved')} [data-testid="session-actions"]@6200;;[data-testid="session-delete"]@6800;;.confirm-dialog .btn-danger@7600`,
  ROTARIS_CAPTURE_SHOT: `${join(output, 'delete-confirm.png')}@3700`,
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="session-report"]@5800;;[data-testid="session-report"]@9200;;.session-browser tr[data-session-id]@9200;;.notice__headline@9200',
  ROTARIS_CAPTURE_PNG_AT: `${join(output, 'delete-report.png')}@9300`,
  ROTARIS_CAPTURE_AFTER_MS: '10000',
});
{
  const dialog = del.shots['[data-testid="session-delete-confirm"]']?.[0]?.text ?? '';
  expect(/permanently/.test(dialog) && dialog.includes(`Session ${A}`) && /cannot be undone/.test(dialog), `the confirmation reads "${dialog.slice(0, 200)}"`);
  const first = atText(del, 5800, '[data-testid="session-report"]');
  expect(first.includes(`Deleted session ${A} permanently: 2 checkpoint refs removed; files removed.`), `A's delete report reads "${first}"`);
  expect(sessionRow(A) === undefined, 'A still exists');
  const after = Object.fromEntries(tables.map((t) => [t, countIn(t, A)]));
  expect(cascaded.every((t) => after[t] === 0), `rows left for A: ${JSON.stringify(after)}`);
  // REQ-TRACE-476: the run row that names A survives A's delete; the fact stands after the session is gone.
  expect(plantedBefore.delivery_runs === 1 && after.delivery_runs === 1, `A's delivery run: ${plantedBefore.delivery_runs} before, ${after.delivery_runs} after`);
  // REQ-SESSION-166 (v20): A's VERBATIM plan text leaves with the session; it is not a second `delivery_runs`.
  expect(plantedBefore.plan_cycles === 1 && after.plan_cycles === 0, `A's plan cycles: ${plantedBefore.plan_cycles} before, ${after.plan_cycles} after`);
  expect(refsOf(workspace, A).length === 0, `A's refs after: ${JSON.stringify(refsOf(workspace, A))}`);
  expect(!existsSync(filesA), `A's files remain at ${filesA}`);
  expect(refsOf(workspace, 'B-nolock').length === 0 && sessionRow('B-nolock') !== undefined && countIn('permission_audit', 'B-nolock') === CAP, 'another session was touched');
  const second = atText(del, 9200, '[data-testid="session-report"]');
  expect(second.includes('Deleted session F-moved permanently: 0 checkpoint refs removed; refs remain under refs/rotaris/checkpoints/F-moved/'), `F's delete report reads "${second}"`);
  expect(sessionRow('F-moved') === undefined, 'F still exists');
  expect(/no longer exists; any refs under refs\/rotaris\/checkpoints\/F-moved\/ stay where the repository went \(REQ-GIT-151\)/.test(del.log), 'the moved-repository warning was not logged');
  const rows = at(del, 9200, '.session-browser tr[data-session-id]').map((r) => r.data['data-session-id']);
  expect(!rows.includes(A) && !rows.includes('F-moved') && rows.includes('B-nolock'), `rows after: ${JSON.stringify(rows)}`);
  const lines = [...del.log.matchAll(/session (\S+) deleted[^:]*: (\d+) checkpoint row\(s\) with the record, (\d+) ref\(s\) deleted, files (\w+); (\d+) ms/g)].map((m) => ({ sessionId: m[1], checkpointRows: Number(m[2]), refsDeleted: Number(m[3]), files: m[4], ms: Number(m[5]) }));
  expect(lines.length === 2 && lines[0].refsDeleted === 2 && lines[0].checkpointRows === 2, `delete lines: ${JSON.stringify(lines)}`);
  results.delete = { cascaded, facts, plantedBefore, after, refsAfter: 0, filesRemoved: true, timings: lines, movedRepositoryWarned: true, dialogText: dialog, png: del.png, dialogPng: join(output, 'delete-confirm.png'), reportPng: join(output, 'delete-report.png') };
}

// 9 + 10. isolated — E in a worktree with its ref in the shared repository; then deleted from the browser.
const isolated = launch('isolated', {
  ROTARIS_SCRIPT: 'write,answer',
  ROTARIS_CAPTURE_CLICKS: 'button>>New session@1800;;[data-testid="start-session-isolation"]@2800;;[data-testid="start-session-accept"]@3400',
  ROTARIS_CAPTURE_TYPE: 'Write the notes in a worktree.>>composer@4400',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '1500',
}, 180_000);
const E = latestSession();
{
  expect(E.worktree !== null, 'the isolated session carries no binding');
  expect(refsOf(workspace, E.session_id).length === 1, `E's ref: ${JSON.stringify(refsOf(workspace, E.session_id))}`);
  results.isolated = { sessionId: E.session_id, worktree: JSON.parse(E.worktree).worktree_path, png: isolated.png };
}
const delIso = launch('delete-isolated', {
  ROTARIS_CAPTURE_CLICKS: `.title-bar__sessions@1200;;${rowSel(E.session_id)} [data-testid="session-actions"]@2400;;[data-testid="session-delete"]@3000;;.confirm-dialog .btn-danger@4200`,
  ROTARIS_CAPTURE_PROBE_AT: '[data-testid="session-report"]@5800',
  ROTARIS_CAPTURE_AFTER_MS: '6600',
});
{
  const report = atText(delIso, 5800, '[data-testid="session-report"]');
  expect(report.includes(`Deleted session ${E.session_id} permanently: 1 checkpoint ref removed`), `E's delete report reads "${report}"`);
  expect(refsOf(workspace, E.session_id).length === 0, 'the isolated session\'s ref survives in the shared repository');
  expect(sessionRow(E.session_id) === undefined, 'E still exists');
  expect(new RegExp(`checkpoint namespace ${E.session_id} in .*: 1 ref\\(s\\) deleted`).test(delIso.log), 'the service did not report the namespace deletion');
  const tree = JSON.parse(E.worktree).worktree_path;
  results.deleteIsolated = { refGoneFromSharedRepo: true, worktreeLeft: existsSync(tree), png: delIso.png };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`sessions proof: ${Object.keys(results).length} scenarios passed; evidence under ${output}`);
