import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { cleanEnvironment, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { unpressedClicks } from './lib/capture-clicks.mjs';
import { STEER_REST_CLICKS, STEER_REST_TYPE, STEER_REST_WHATS, steerPendingAtPause } from './lib/steer-rest.mjs';

/**
 * The control channel's first execution in the built app (Part J step 3): a queued message consumed at the
 * iteration boundary; a steer reaching the entry role; a graceful pause and the composer's Continue; a steer still
 * pending at a pause, delivered into the root's record and read by the resumed root, which carries on with its next
 * scripted step; the
 * message-limit pause with its dialog answered "double", then the relaunch finding a session paused at the
 * limit and its dialog answered "cancel"; a user-initiated quit during a run. Every assertion reads the store.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'part-j-proof');
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
    // Since Part T the shipped code_intelligence entry is enabled by default and its discovery costs every run start
    // about 4.5 s (ADR-0035's note, finding 6); this proof measures the control channel, so the entry is off here.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'rotaris:', '  delegation_strategy: single', '',
  ].join('\n'));
  return { root, workspace, local };
}
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: 120_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: join(s.root, 'preferences') }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (opts.expectPng !== false && !existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}
function open(s) { return new Database(oneDatabase(s.local), { readonly: true }); }
/*
 * ADR-0005 (the repair of a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md, R-067): what the store
 * says WHILE the app runs. A worker thread samples the store every 50 ms and records each change of (status, lock
 * holder, run starts, summary); the proof reads the record after the exit. A reading the store is busy for is skipped,
 * not guessed. It was a worker because the launch blocked this thread (`spawnSync`); the launch is `spawnBounded`'s
 * since 2026-09-29, and the worker stays, so its sampling does not depend on this thread's event loop.
 */
function sampleStore(local) {
  const stop = new Int32Array(new SharedArrayBuffer(4));
  const file = join(output, `samples-${Date.now()}.json`);
  const worker = new Worker(`
    const { workerData } = require('node:worker_threads');
    const { existsSync, readdirSync, writeFileSync } = require('node:fs');
    const { join } = require('node:path');
    const Database = require(workerData.sqlite);
    const find = (root) => { if (!existsSync(root)) return []; const out = []; for (const e of readdirSync(root, { withFileTypes: true })) { const p = join(root, e.name); if (e.isDirectory()) out.push(...find(p)); else if (e.name === 'workspace.db') out.push(p); } return out; };
    const samples = []; let db = null; let last = '';
    const tick = new Int32Array(new SharedArrayBuffer(4));
    while (Atomics.load(workerData.stop, 0) === 0) {
      try {
        if (!db) { const found = find(workerData.local); if (found.length === 1 && existsSync(found[0] + '-shm')) db = new Database(found[0], { readonly: true, fileMustExist: true }); }
        if (db) {
          const row = db.prepare('SELECT execution_status AS s, summary_text AS t FROM sessions LIMIT 1').get();
          const status = row?.s ?? null;
          const summary = row?.t ?? null;
          const lock = db.prepare('SELECT pid FROM session_locks LIMIT 1').get()?.pid ?? null;
          const runStarts = db.prepare("SELECT count(*) AS c FROM timeline WHERE name = 'run_start'").get().c;
          const key = JSON.stringify([status, lock, runStarts, summary]);
          if (key !== last) { last = key; samples.push({ status, lock, runStarts, summary }); writeFileSync(workerData.file, JSON.stringify(samples)); }
        }
      } catch { /* the store is busy or not yet migrated: skipped */ }
      Atomics.wait(tick, 0, 0, 50);
    }
    try { db?.close(); } catch { /* closing */ }
  `, { eval: true, workerData: { local, file, stop, sqlite: require.resolve('better-sqlite3') } });
  return {
    async finish() {
      Atomics.store(stop, 0, 1);
      await new Promise((done) => { worker.once('exit', done); });
      return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    },
  };
}
const names = (db, sid) => db.prepare('SELECT name FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid).map((r) => r.name);
const results = {};
// REQ-SESSION-055's six values that assert a run in progress (`packages/contracts/src/status.ts`).
const ACTIVE = new Set(['starting', 'running', 'background', 'waiting', 'pausing', 'cancelling']);

// 1. A message queued during the run is consumed at the iteration boundary as a "Queued Prompts" task, exactly once.
const s1 = scenario('queue', []);
// The capture at 9 s sat on a knife-edge the Parts R and S merge found (2026-09-05): the launch reaches `session.start`
// ~1.2 s in, the run needs ~8 s from there (the iteration boundary alone is ~4.2 s), and three runs landed 100 ms either
// side. The assertion is consumption, not a budget; the capture now waits 13 s.
await launch('queue', s1, { ROTARIS_SCRIPT: 'read,read,read', ROTARIS_CAPTURE_PROMPT: 'first task', ROTARIS_CAPTURE_TYPE: 'and then this>>composer@2200', ROTARIS_CAPTURE_AFTER_MS: '13000' });
{
  const db = open(s1);
  const session = db.prepare('SELECT session_id, execution_status, iterations_completed, todo FROM sessions').get();
  const prompts = db.prepare('SELECT prompt_id, content, status FROM queued_prompts WHERE session_id = ?').all(session.session_id);
  // REQ-CHAT-040 (the repair of every-iteration-is-sent-the-prompt-the-run-was-launched-with.md): the iteration that took
  // the queued prompt up was SENT it — its root's first user message, in the conversation record (PD-ORCH-005 clause 1),
  // carries the launch prompt and then the queued prompt as its task; the launch prompt's own iteration's does not.
  const iterations = db.prepare('SELECT iteration, root_task_id, todo_task_id FROM iterations WHERE session_id = ? ORDER BY iteration').all(session.session_id);
  const firstUser = (taskId) => {
    const sent = db.prepare("SELECT body FROM agent_messages WHERE session_id = ? AND task_id = ? AND kind = 'message' ORDER BY seq").all(session.session_id, taskId).map((r) => JSON.parse(r.body)).find((m) => m.role === 'user');
    return sent ? sent.content.filter((c) => c.kind === 'text').map((c) => c.text).join('\n') : '';
  };
  // REQ-CHAT-089: the queued prompt's task carries the backend's own id, so the iteration that took it up is known by that
  // id (the `prompt_triggered` timeline entry carries the prompt's).
  const queuedTaskId = JSON.parse(session.todo).phases.find((p) => p.name === 'Queued Prompts')?.tasks[0]?.id;
  const sent = iterations.map((i) => ({ iteration: i.iteration, queued: i.todo_task_id === queuedTaskId, first: firstUser(i.root_task_id) }));
  const triggered = db.prepare("SELECT metadata FROM timeline WHERE session_id = ? AND name = 'prompt_triggered'").all(session.session_id).map((r) => JSON.parse(r.metadata).prompt_id);
  db.close();
  if (session.execution_status !== 'completed' || session.iterations_completed < 2) throw new Error(`the queued run did not complete two iterations: ${JSON.stringify(session)}`);
  if (prompts.length !== 1 || prompts[0].content !== 'and then this' || prompts[0].status !== 'TRIGGERED') throw new Error(`the queued prompt was not consumed exactly once: ${JSON.stringify(prompts)}`);
  const todo = JSON.parse(session.todo);
  const phase = todo.phases.find((p) => p.name === 'Queued Prompts');
  if (!phase || phase.tasks[0].state !== 'complete') throw new Error(`the queued prompt did not become a completed task: ${session.todo}`);
  // REQ-CHAT-040 / REQ-ORCH-071 (acceptance A28): the task is NAMED "Queued Prompt: <first 8 characters of the prompt id>"
  // and carries the prompt text as its content.
  if (phase.tasks[0].name !== `Queued Prompt: ${prompts[0].prompt_id.slice(0, 8)}` || phase.tasks[0].text !== 'and then this') throw new Error(`the queued prompt's task is not named "Queued Prompt: <id>" with the prompt as its content: ${JSON.stringify(phase.tasks[0])}`);
  // REQ-CHAT-089 (the repair of a-queued-prompts-task-id-is-not-eight-hex-characters.md): every task and phase id
  // the backend assigned is 8 lowercase hexadecimal characters — the queued prompt's task's no longer its prompt's UUID —
  // and the prompt is still found, by the timeline entry its trigger wrote.
  const hex = /^[0-9a-f]{8}$/;
  const malformed = todo.phases.flatMap((p) => [p.id, ...p.tasks.map((t) => t.id)]).filter((id) => !hex.test(id));
  if (malformed.length > 0) throw new Error(`a backend task or phase id is not 8 lowercase hexadecimal characters: ${JSON.stringify(malformed)} in ${session.todo}`);
  if (triggered.length !== 1 || triggered[0] !== prompts[0].prompt_id) throw new Error(`the queued prompt's trigger is not on the timeline with its id: ${JSON.stringify(triggered)}`);
  const took = sent.filter((s) => s.queued);
  if (took.length !== 1 || !took[0].first.startsWith('first task') || !took[0].first.endsWith('\n\nand then this')) throw new Error(`the iteration that took the queued prompt up was not sent it: ${JSON.stringify(sent)}`);
  if (sent.some((s) => !s.queued && s.first.includes('and then this'))) throw new Error(`an iteration whose task is the launch prompt was sent the queued prompt: ${JSON.stringify(sent)}`);
  results.queue = { iterations: session.iterations_completed, prompt: prompts[0], task: phase.tasks[0], sent };
}

// 2. A steer reaches the entry role at its next step.
const s2 = scenario('steer', []);
await launch('steer', s2, { ROTARIS_SCRIPT: 'read,read,read,read', ROTARIS_CAPTURE_PROMPT: 'steer me', ROTARIS_CAPTURE_CLICKS: '[data-testid="composer-strip"] [aria-label="Steer the run"]@1900;;.dialog-actions .btn-primary>>Steer@2600', ROTARIS_CAPTURE_TYPE: 'go left>>no-enter@2300', ROTARIS_CAPTURE_AFTER_MS: '9000' });
{
  const db = open(s2);
  const sid = db.prepare('SELECT session_id FROM sessions').get().session_id;
  const list = names(db, sid);
  db.close();
  if (!list.includes('steering_submitted') || !list.includes('steering_injected')) throw new Error(`the steer was not submitted and injected: ${list.join(',')}`);
  results.steer = { timeline: list.filter((n) => n.startsWith('steering')) };
}

// 3. A graceful pause, then the paused Continue. The pause click WAITS for the run to be pausable
// (the `~` form) and the Continue waits for the paused strip — whose continue shows the pill's short
// label `Continue` with `Continue run` as its accessible name (PD-ORCH-005 phase 5), so the lookup is that name.
const s3 = scenario('pause', []);
const pauseSamples = sampleStore(s3.local);
await launch('pause', s3, { ROTARIS_SCRIPT: 'read,read,read,read,read', ROTARIS_CAPTURE_PROMPT: 'pause me', ROTARIS_CAPTURE_CLICKS: '[data-testid="composer-strip"] [aria-label="Pause the run"]@~8000;;.composer__strip .btn-primary[aria-label="Continue run"]@~24000', ROTARIS_CAPTURE_AFTER_MS: '26000' });
{
  const db = open(s3);
  const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions').get();
  const rows = db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'system'").all(session.session_id).map((r) => r.body);
  const list = names(db, session.session_id);
  db.close();
  if (!rows.some((b) => b.includes("paused at the user's request"))) throw new Error(`no pause row: ${rows.join(' | ')}`);
  if (!list.includes('run_pause_requested') || list.filter((n) => n === 'run_start').length < 2) throw new Error(`the pause and the continuation are not both recorded: ${list.join(',')}`);
  if (session.execution_status !== 'completed') throw new Error(`the continued run did not complete: ${JSON.stringify(session)}`);
  // ADR-0005, REQ-SESSION-083: the pause's teardown released the lock, and the Continue in the same process took it
  // back — every sample of the continued run while it was active names a holder (it held none before the repair).
  const samples = await pauseSamples.finish();
  const continued = samples.filter((x) => x.runStarts >= 2 && ACTIVE.has(x.status));
  if (continued.length === 0) throw new Error(`the sampler saw no active continued run: ${JSON.stringify(samples)}`);
  if (continued.some((x) => x.lock === null)) throw new Error(`the continued run ran without the session's lock: ${JSON.stringify(samples)}`);
  if (!samples.some((x) => x.runStarts === 1 && x.status === 'paused' && x.lock === null)) throw new Error(`the pause's teardown did not release the lock: ${JSON.stringify(samples)}`);
  // REQ-ORCH-082 rule 1 (the repair of a-paused-runs-notice-says-a-person-stopped-it.md, R-067, OQ-118): the rest's summary,
  // which the notice carries, names no stop beside the row that says the run paused — one message for every rest a person asks for.
  const restSummary = samples.find((x) => x.runStarts === 1 && x.status === 'paused')?.summary ?? null;
  if (restSummary !== "The run came to rest at the user's request.") throw new Error(`the paused session's summary reads ${JSON.stringify(restSummary)}`);
  results.pause = { status: session.execution_status, runStarts: list.filter((n) => n === 'run_start').length, lockWhileContinued: [...new Set(continued.map((x) => x.lock))], restSummary, samples };
}

// 3b. A steer still pending when the run comes to rest (the repair of a-steering-prompt-pending-at-a-rest-is-lost.md,
// R-067, REQ-MONITOR-134 with PD-ORCH-005 clause 4). The entry role's second step is held 7 s and then asks for a read
// (`wait:` prefixes the step after it), so the steer submitted meanwhile and the pause that follows it both land inside
// that step: the pause lets the read finish and stops the root before the step that would have injected the steer. The
// schedule is `lib/steer-rest.mjs`'s: the Steer waits for its control, and the Pause waits, from after the dialog's Steer,
// for the steer dialog to close on the steer's acceptance, so the pause follows the steer (it raced it before 2026-10-01,
// docs/defects/fixed/part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md), and the store must say the
// steer was pending when the pause was asked for, or the launch exercised a plain pause and is read as such. The
// rest delivers it into the root's record, marked injected once by the pause, and the Continue's resumed root reads it
// as the last message of its first request, whose answer follows it in the record. That answer is the script's third
// read: the resumed root carries on with its next step rather than its first.
const s3b = scenario('steer-rest', []);
const steerRestLog = await launch('steer-rest', s3b, { ROTARIS_SCRIPT: 'read,wait:7000,read,read', ROTARIS_CAPTURE_PROMPT: 'steer then pause', ROTARIS_CAPTURE_CLICKS: STEER_REST_CLICKS, ROTARIS_CAPTURE_TYPE: STEER_REST_TYPE, ROTARIS_CAPTURE_AFTER_MS: '27000' });
{
  const unpressed = unpressedClicks(steerRestLog, Object.values(STEER_REST_WHATS));
  if (unpressed.length > 0) throw new Error(`the steer-rest launch did not press every step on its own control: ${JSON.stringify(unpressed)} (see steer-rest.log)`);
  const db = open(s3b);
  const session = db.prepare('SELECT session_id, execution_status FROM sessions').get();
  const sid = session.session_id;
  const iterations = db.prepare('SELECT iteration, root_task_id, state, interruption FROM iterations WHERE session_id = ? ORDER BY iteration').all(sid);
  const record = db.prepare("SELECT body FROM agent_messages WHERE session_id = ? AND task_id = ? AND kind = 'message' ORDER BY seq").all(sid, iterations[0]?.root_task_id ?? '').map((r) => JSON.parse(r.body));
  const steering = db.prepare("SELECT name, metadata FROM timeline WHERE session_id = ? AND name LIKE 'steering%' ORDER BY ordinal").all(sid).map((r) => ({ name: r.name, ...JSON.parse(r.metadata) }));
  const list = names(db, sid);
  db.close();
  const text = (m) => (m?.content ?? []).filter((c) => c.kind === 'text').map((c) => c.text).join('');
  const at = record.findIndex((m) => m.role === 'user' && text(m) === '[Steering prompt] go left');
  // PD-ORCH-005 (the repair of the-scripted-client-restarts-its-script-for-every-run.md): the resumed root carries on with
  // the step after the ones its record holds — the third read — so its record holds the script's three reads exactly.
  // Before the repair the continue's new client took the script from its first step again, and the record held the two
  // reads before the rest and all three again after it.
  const reads = record.filter((m) => m.role === 'assistant').flatMap((m) => m.content).filter((c) => c.kind === 'tool-call' && c.name === 'read_file').length;
  if (!list.includes('run_pause_requested') || list.filter((n) => n === 'run_start').length < 2) throw new Error(`the pause and the continuation are not both recorded: ${list.join(',')}`);
  const notPending = steerPendingAtPause(list);
  if (notPending !== null) throw new Error(`the steer was not pending when the pause was asked for: ${notPending} (${list.join(',')})`);
  if (at < 0) throw new Error(`the steer never reached the root's record: ${JSON.stringify(record.map((m) => [m.role, text(m).slice(0, 60)]))}`);
  if (record[at - 1]?.role !== 'tool' || record[at + 1]?.role !== 'assistant') throw new Error(`the steer is not where the rest delivers it, after the read's result and before the resumed step: ${JSON.stringify(record.map((m) => m.role))}`);
  if (reads !== 3) throw new Error(`the resumed root did not carry on from its record: it holds ${reads} reads where the script names 3`);
  const injected = steering.filter((e) => e.name === 'steering_injected');
  if (steering.filter((e) => e.name === 'steering_submitted').length !== 1 || injected.length !== 1 || injected[0].interruption !== 'pause') throw new Error(`the steer was not submitted once and injected once, by the pause: ${JSON.stringify(steering)}`);
  if (session.execution_status !== 'completed' || iterations[0]?.state !== 'closed') throw new Error(`the continued run did not complete its resumed iteration: ${JSON.stringify({ session, iterations })}`);
  results.steerRest = { steering, reads, roles: record.map((m) => m.role), iterations };
}

// 4. The message limit: paused durably with the dialog, "double" continues; a second launch finds the session paused and "cancel" resolves it.
const s4 = scenario('limit', ['  message_limit: 1']);
await launch('limit-double', s4, { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_PROMPT: 'limited', ROTARIS_CAPTURE_TYPE: 'one more>>composer@1500', ROTARIS_CAPTURE_PAUSE_ANSWER: 'double', ROTARIS_CAPTURE_AFTER_MS: '12000' });
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
await launch('limit-paused', s5, { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_PROMPT: 'limited', ROTARIS_CAPTURE_TYPE: 'one more>>composer@1500', ROTARIS_CAPTURE_AFTER_MS: '8000' });
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
await launch('limit-cancel', s5, { ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_PAUSE_ANSWER: 'cancel', ROTARIS_CAPTURE_AFTER_MS: '7000' });
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
await launch('quit', s6, { ROTARIS_SCRIPT: 'read,read,read,read,read,read', ROTARIS_CAPTURE_PROMPT: 'quit me', ROTARIS_CAPTURE_QUIT_MS: '2200', ROTARIS_CAPTURE_AFTER_MS: '40000' }, { expectPng: false });
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
