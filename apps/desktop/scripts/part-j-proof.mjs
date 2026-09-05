import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * The control channel's first execution in the built app (Part J step 3): a queued message consumed at the
 * iteration boundary; a steer reaching the entry role; a graceful pause and the composer's Continue; the
 * message-limit pause with its dialog answered "double", then the relaunch finding a session paused at the
 * limit and its dialog answered "cancel"; a user-initiated quit during a run. Every assertion reads the store.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.part-j-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

function findDatabases(root) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findDatabases(path));
    else if (entry.name === 'workspace.db') found.push(path);
  }
  return found;
}
function oneDatabase(local) {
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  return databases[0];
}
function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  return env;
}
function scenario(name, agentsYaml) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    'models:', '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
    'runtime:', '  permission_mode: autonomous', ...agentsYaml,
    'rotaris:', '  delegation_strategy: single', '',
  ].join('\n'));
  return { root, workspace, local };
}
function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), s.workspace], {
    cwd: app, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), LOCALAPPDATA: s.local, APPDATA: join(dirname(s.local), 'roaming'), ROTARIS_PREFERENCES_ROOT: join(s.root, 'preferences'),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (opts.expectPng !== false && !existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}
function open(s) { return new Database(oneDatabase(s.local), { readonly: true }); }
const names = (db, sid) => db.prepare('SELECT name FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid).map((r) => r.name);
const results = {};

// 1. A message queued during the run is consumed at the iteration boundary as a "Queued Prompts" task, exactly once.
const s1 = scenario('queue', []);
// The capture at 9 s sat on a knife-edge the Parts R and S merge found (2026-09-05): the launch reaches `session.start`
// ~1.2 s in, the run needs ~8 s from there (the iteration boundary alone is ~4.2 s), and three runs landed 100 ms either
// side. The assertion is consumption, not a budget; the capture now waits 13 s.
launch('queue', s1, { ROTARIS_SCRIPT: 'read,read,read', ROTARIS_CAPTURE_PROMPT: 'first task', ROTARIS_CAPTURE_TYPE: 'and then this>>composer@2200', ROTARIS_CAPTURE_AFTER_MS: '13000' });
{
  const db = open(s1);
  const session = db.prepare('SELECT session_id, execution_status, iterations_completed, todo FROM sessions').get();
  const prompts = db.prepare('SELECT prompt_id, content, status FROM queued_prompts WHERE session_id = ?').all(session.session_id);
  db.close();
  if (session.execution_status !== 'completed' || session.iterations_completed < 2) throw new Error(`the queued run did not complete two iterations: ${JSON.stringify(session)}`);
  if (prompts.length !== 1 || prompts[0].content !== 'and then this' || prompts[0].status !== 'TRIGGERED') throw new Error(`the queued prompt was not consumed exactly once: ${JSON.stringify(prompts)}`);
  const todo = JSON.parse(session.todo);
  const phase = todo.phases.find((p) => p.name === 'Queued Prompts');
  if (!phase || phase.tasks[0].state !== 'complete') throw new Error(`the queued prompt did not become a completed task: ${session.todo}`);
  results.queue = { iterations: session.iterations_completed, prompt: prompts[0] };
}

// 2. A steer reaches the entry role at its next step.
const s2 = scenario('steer', []);
launch('steer', s2, { ROTARIS_SCRIPT: 'read,read,read,read', ROTARIS_CAPTURE_PROMPT: 'steer me', ROTARIS_CAPTURE_CLICKS: '.composer__actions .btn-secondary>>Steer@1900;;.dialog-actions .btn-primary>>Steer@2600', ROTARIS_CAPTURE_TYPE: 'go left>>no-enter@2300', ROTARIS_CAPTURE_AFTER_MS: '9000' });
{
  const db = open(s2);
  const sid = db.prepare('SELECT session_id FROM sessions').get().session_id;
  const list = names(db, sid);
  db.close();
  if (!list.includes('steering_submitted') || !list.includes('steering_injected')) throw new Error(`the steer was not submitted and injected: ${list.join(',')}`);
  results.steer = { timeline: list.filter((n) => n.startsWith('steering')) };
}

// 3. A graceful pause, then the composer's Continue.
const s3 = scenario('pause', []);
launch('pause', s3, { ROTARIS_SCRIPT: 'read,read,read,read,read', ROTARIS_CAPTURE_PROMPT: 'pause me', ROTARIS_CAPTURE_CLICKS: '.composer__actions .btn-secondary>>Pause@1900;;.composer__actions .btn-primary>>Continue run@6500', ROTARIS_CAPTURE_AFTER_MS: '16000' });
{
  const db = open(s3);
  const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions').get();
  const rows = db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'system'").all(session.session_id).map((r) => r.body);
  const list = names(db, session.session_id);
  db.close();
  if (!rows.some((b) => b.includes("paused at the user's request"))) throw new Error(`no pause row: ${rows.join(' | ')}`);
  if (!list.includes('run_pause_requested') || list.filter((n) => n === 'run_start').length < 2) throw new Error(`the pause and the continuation are not both recorded: ${list.join(',')}`);
  if (session.execution_status !== 'completed') throw new Error(`the continued run did not complete: ${JSON.stringify(session)}`);
  results.pause = { status: session.execution_status, runStarts: list.filter((n) => n === 'run_start').length };
}

// 4. The message limit: paused durably with the dialog, "double" continues; a second launch finds the session paused and "cancel" resolves it.
const s4 = scenario('limit', ['  message_limit: 1']);
launch('limit-double', s4, { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_PROMPT: 'limited', ROTARIS_CAPTURE_TYPE: 'one more>>composer@1500', ROTARIS_CAPTURE_PAUSE_ANSWER: 'double', ROTARIS_CAPTURE_AFTER_MS: '12000' });
{
  const db = open(s4);
  const session = db.prepare('SELECT session_id, execution_status, message_limit, paused_at_count, iterations_completed FROM sessions').get();
  const list = names(db, session.session_id);
  db.close();
  const pauses = list.filter((n) => n === 'run_paused_message_limit').length;
  const resolved = list.filter((n) => n === 'pause_resolved').length;
  if (pauses < 1 || resolved < 1) throw new Error(`no pause/resolution recorded: ${list.join(',')}`);
  if (session.message_limit < 2) throw new Error(`the limit was not doubled: ${JSON.stringify(session)}`);
  results.limitDouble = { session, pauses, resolved };
}
const s5 = scenario('limit-relaunch', ['  message_limit: 1']);
launch('limit-paused', s5, { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_PROMPT: 'limited', ROTARIS_CAPTURE_TYPE: 'one more>>composer@1500', ROTARIS_CAPTURE_AFTER_MS: '8000' });
{
  const db = open(s5);
  const session = db.prepare('SELECT execution_status, paused_at_count, message_limit FROM sessions').get();
  const locks = db.prepare('SELECT count(*) AS c FROM session_locks').get().c;
  db.close();
  if (session.execution_status !== 'paused_message_limit' || session.paused_at_count !== 1) throw new Error(`the pause did not survive the exit: ${JSON.stringify(session)}`);
  // The capture's exit is not the quit path: the paused session's lock row survives it, naming a pid that is now dead;
  // the relaunch below resumes through REQ-SESSION-047's one reap, which is the evidence that matters.
  results.limitPausedLocks = locks;
}
launch('limit-cancel', s5, { ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_PAUSE_ANSWER: 'cancel', ROTARIS_CAPTURE_AFTER_MS: '7000' });
{
  const db = open(s5);
  const session = db.prepare('SELECT execution_status, paused_at_count, stop_reason FROM sessions').get();
  const list = names(db, db.prepare('SELECT session_id FROM sessions').get().session_id);
  db.close();
  if (session.execution_status !== 'paused' || session.paused_at_count !== null || session.stop_reason !== 'message_limit_reached') throw new Error(`cancel did not resolve the pause: ${JSON.stringify(session)}`);
  if (!list.includes('pause_resolved')) throw new Error('the resolution was not recorded');
  results.limitRelaunch = { session };
}

// 5. A user-initiated quit during a run: the run stops for shutdown, its terminal result is written, the lock is released.
const s6 = scenario('quit', []);
launch('quit', s6, { ROTARIS_SCRIPT: 'read,read,read,read,read,read', ROTARIS_CAPTURE_PROMPT: 'quit me', ROTARIS_CAPTURE_QUIT_MS: '2200', ROTARIS_CAPTURE_AFTER_MS: '40000' }, { expectPng: false });
{
  const db = open(s6);
  const session = db.prepare('SELECT execution_status, stop_reason FROM sessions').get();
  const locks = db.prepare('SELECT count(*) AS c FROM session_locks').get().c;
  const events = db.prepare("SELECT kind FROM events WHERE kind IN ('session.end', 'result')").all().map((e) => e.kind);
  db.close();
  if (session.stop_reason !== 'application_shutdown') throw new Error(`the quit did not stop the run for shutdown: ${JSON.stringify(session)}`);
  if (!events.includes('session.end') || !events.includes('result')) throw new Error(`the terminal pair was not written before exit: ${events.join(',')}`);
  if (locks !== 0) throw new Error('the quit left a lock behind');
  results.quit = { session, events };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
