/**
 * The approvals proof: the permission gate's approval waits in the BUILT app, under the `ask` preset, against the scripted
 * model — what the unit tests of `gate.ts`, `presence.ts` and `run-host/tools.test.ts` measure, driven through real dialogs.
 * Scripted client, scratch profile, the dialogs answered (or left) by `ROTARIS_CAPTURE_APPROVAL`'s per-tool form
 * (`src/main/capture/approval-answers.ts`). Launches, selected with `--only=<name>[,<name>]` (default: all):
 *
 *   away — PD-TOOLS-005 revisions 1 and 2 and PD-TOOLS-011's presence words. `approval_timeout_seconds: 12`. The root writes a
 *          todo list and delegates two coding agents (each approval answered once); each child writes `NOTES.md`, and the root
 *          then asks a structured question. The first child's write is the dialog shown first, and it is left unanswered:
 *          1. it ends by timeout, with REQ-TOOLS-052's reason, and the run marks its user away — a `user_away` timeline entry
 *             carrying `after_seconds: 12` and the session log's WARNING line;
 *          2. the children's next writes, asked while the user is away, are denied at once with the directive's reason
 *             (source `headless-policy`, REQ-TOOLS-065's resolution), no wait and no dialog;
 *          3. the second child's write, queued unshown behind the first, ends in the same tick with that reason (revision 2),
 *             while the question tool's own approval, queued behind it too, is NOT ended: it is shown and waits (the exemption);
 *          4. answering that approval is the user's next input: `user_returned` is written, and the root's last todo call asks
 *             again with a dialog — the run no longer treats the user as away.
 *
 * Every assertion reads the store (`permission_audit`, `events`, `timeline`), the session log or the application log.
 * Evidence under `.proof/approvals-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanEnvironment, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { awayStretch, timeoutReason } from './lib/approval-readings.mjs';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'approvals-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
const LAUNCHES = ['away'];
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const wanted = onlyArg === undefined ? LAUNCHES : onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter((s) => s !== '');
for (const name of wanted) if (!LAUNCHES.includes(name)) throw new Error(`--only takes ${LAUNCHES.join(', ')}; got ${name}`);
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

/** One scratch profile per launch: its own workspace, configuration and store, so no launch reads another's record. */
function profile(name, runtime) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# Approvals proof workspace\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    '# scratch configuration written by the proof script',
    'models:',
    '  scripted: { provider: scripted, model_id: scripted }',
    'small_model: scripted',
    'medium_model: scripted',
    'large_model: scripted',
    'runtime:',
    ...runtime.map((line) => `  ${line}`),
    // Code intelligence costs seconds of every run start and is not what this proof measures (plan-gate-proof's note).
    'mcp_servers:',
    '  code_intelligence: { enabled: false }',
    '',
  ].join('\n'));
  const git = (...args) => execFileSync('git', args, { cwd: workspace, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'proof', GIT_AUTHOR_EMAIL: 'proof@rotaris.local', GIT_COMMITTER_NAME: 'proof', GIT_COMMITTER_EMAIL: 'proof@rotaris.local' } });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(workspace, '.gitignore'), '.rotaris/\n.serena/\n');
  git('add', 'README.md', '.gitignore');
  git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  return { root, workspace, local, preferences: join(root, 'preferences') };
}

async function launch(name, where, extra, timeoutMs = 240_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, where.workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: where.local, preferences: where.preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'} (see ${name}.log)`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}

/** The newest session's record, everything this proof asserts from, with each JSON column parsed. */
function readRecord(local) {
  const file = oneDatabase(local);
  const db = new Database(file, { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, stop_reason FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    const parse = (text) => { try { return JSON.parse(text); } catch { return {}; } };
    const audit = db.prepare("SELECT ordinal, recorded_at, agent_id, persona, tool_name, decision, rule_id, source, entry FROM permission_audit WHERE session_id = ? AND kind = 'decision' ORDER BY ordinal").all(session.session_id)
      .map((r) => ({ ...r, ...parse(r.entry), at: Date.parse(r.recorded_at) }));
    const events = db.prepare('SELECT ordinal, kind, at, payload FROM events WHERE session_id = ? ORDER BY ordinal').all(session.session_id)
      .map((e) => ({ ordinal: e.ordinal, kind: e.kind, at: Date.parse(e.at), payload: parse(e.payload) }));
    const timeline = db.prepare('SELECT ordinal, at, name, actor, message, metadata FROM timeline WHERE session_id = ? ORDER BY ordinal').all(session.session_id)
      .map((t) => ({ ...t, at: Date.parse(t.at), metadata: parse(t.metadata) }));
    const calls = db.prepare('SELECT ordinal, call_id, agent_name, tool_name, status, elapsed_ms, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(session.session_id)
      .map((c) => ({ ...c, result: String(parse(c.entry).result ?? '') }));
    const logFile = join(dirname(file), 'sessions', session.session_id, 'session.log');
    const sessionLog = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
    return { session, audit, events, timeline, calls, sessionLog };
  } finally { db.close(); }
}

const results = {};
/** Throws; an expression, so a lookup reads `find(…) ?? fail(…)`. */
const fail = (message) => { throw new Error(message); };

// ── away ────────────────────────────────────────────────────────────────────────────────────────────────────────
if (wanted.includes('away')) {
  const TIMEOUT_S = 12;
  const where = profile('away', ['permission_mode: ask', `approval_timeout_seconds: ${TIMEOUT_S}`, 'headless_approval_policy: deny', 'max_iterations: 2']);
  const log = await launch('away', where, {
    // The root: a todo list (OQ-213 asks one before a second delegation), two delegations, a pause long enough for both
    // children's writes to be asked, the question, then — once the children have ended — the list closed and an answer.
    ROTARIS_SCRIPT: 'plan:2,delegate:coding-agent:one,delegate:coding-agent:two,wait:9000,ask,wait:12000,donereplace,answer',
    // Each child waits so the root's delegations are answered before its write asks, then writes twice.
    ROTARIS_CHILD_SCRIPT: 'wait:2500,write,write,answer',
    ROTARIS_CAPTURE_APPROVAL: 'todo=once;;delegate=once;;ask_questions=once@3000;;write_file=none',
    ROTARIS_CAPTURE_PROMPT: 'Write the notes, and ask me once.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '180000', ROTARIS_CAPTURE_AFTER_MS: '2000',
  });
  const record = readRecord(where.local);
  writeFileSync(join(output, 'away.record.json'), `${JSON.stringify(record, null, 2)}\n`);
  results.away = assertAway(record, log, where, TIMEOUT_S);
}

function assertAway(record, log, where, seconds) {
  if (record.session.execution_status !== 'completed') fail(`the run ended ${record.session.execution_status} (${record.session.stop_reason})`);
  const r = awayStretch({ audit: record.audit, events: record.events, timeline: record.timeline, log });

  // 1. The first write shown is left unanswered; it ends by timeout with REQ-TOOLS-052's reason after the full wait, and the
  //    run marks its user away: one `user_away` entry naming the timeout, and the session log's WARNING line.
  if (!/capture: approval dialog \(write_file\) left unanswered/.test(log)) fail('the seam did not leave the first write\'s dialog unanswered');
  const first = r.first ?? fail('no approval wait ended by timeout');
  if (first.request.tool_name !== 'write_file' || first.request.resolver !== 'brokered' || first.shown === null) fail(`the wait that timed out was not the shown write: ${JSON.stringify(first.request)}`);
  if (r.shown.find((p) => p.tool === 'write_file')?.requestId !== first.request.request_id) fail('the write that timed out was not the first write shown');
  if (!String(first.decision.reason).endsWith(timeoutReason(seconds))) fail(`the timed-out write's reason: ${first.decision.reason}`);
  if (first.waitedMs < seconds * 1000 - 50) fail(`the first write waited ${first.waitedMs} ms, short of the ${seconds} s timeout`);
  if (r.awayCount !== 1 || r.away === null) fail(`${r.awayCount} user_away entries, not one`);
  if (r.away.actor !== 'rotaris' || r.seconds !== seconds) fail(`user_away reads ${JSON.stringify(r.away)}`);
  if (Math.abs(r.away.at - first.decision.at) > 100) fail(`user_away was written ${r.away.at - first.decision.at} ms from the timeout`);
  const awayLine = record.sessionLog.split('\n').find((l) => /user away: an approval in this run went unanswered for/.test(l)) ?? fail('the session log carries no "user away" line');
  if (!/ WARNING /.test(awayLine) || !awayLine.includes(`unanswered for ${seconds} seconds`)) fail(`the session log's away line reads: ${awayLine}`);

  // 3 (revision 2). A wait queued unshown behind the first ends with the away reason with it, and is never shown.
  const waiting = r.requests.filter((q) => q.tool_name === 'write_file' && q.resolver === 'brokered' && q.request_id !== first.request.request_id && q.at < first.decision.at);
  if (waiting.length === 0) fail('no second write was waiting when the first expired: the launch did not reach what revision 2 asks about (a timing precondition, not the product)');
  for (const q of waiting) if (!r.ended.some((e) => e.request.request_id === q.request_id)) fail(`the write ${q.request_id} waiting at the expiry was not ended with the away reason`);
  for (const e of r.ended) {
    if (e.shown !== null) fail(`the queued write ${e.request.request_id} was shown`);
    if (e.lagMs < 0 || e.lagMs > 1000) fail(`the queued write ended ${e.lagMs} ms after the timeout, not with it`);
  }

  // 2. An ask made while the user is away is denied at once: the headless shape, the away reason, no wait, no dialog.
  if (r.returnedCount !== 1 || r.returned === null) fail(`${r.returnedCount} user_returned entries, not one`);
  if (r.askedWhileAway.length === 0) fail('no ask was made while the user was away: the launch did not reach clause 2');
  for (const w of r.askedWhileAway) {
    if (w.request.unattended_reason !== 'headless-policy' || w.request.timeout_seconds !== null) fail(`the away ask's request reads ${JSON.stringify(w.request)}`);
    if (!w.awayReason) fail(`the away ask ended ${w.decision?.source}: ${w.decision?.reason}`);
    if (w.shown !== null) fail(`the away ask ${w.request.request_id} was shown`);
    if (w.decidedMs > 250) fail(`the away ask was decided ${w.decidedMs} ms after it was asked`);
  }
  if (r.claimsNoUi.length > 0) fail(`an away decision claims no approval UI is available: ${r.claimsNoUi[0].reason}`);

  // 3 (the exemption). The question tool's own approval, waiting when the user was marked away, is not ended: it is shown.
  if (r.exempt.length !== 1) fail(`${r.exempt.length} question approvals were waiting at the expiry: the launch did not reach the exemption (a timing precondition)`);
  const q = r.exempt[0];
  if (q.shown === null) fail('the question tool\'s approval was not shown: the away mark ended it');
  if (!(q.shown.at >= first.decision.at)) fail('the question\'s approval was shown before the first write expired; it was not queued behind it');
  if (q.decision?.source !== 'user-once') fail(`the question tool's approval ended ${q.decision?.source}: ${q.decision?.reason}`);
  const question = record.calls.find((c) => c.tool_name === 'ask_questions');
  if (!question || question.status !== 'ok') fail(`the question was not put after its approval: ${JSON.stringify(question)}`);

  // 4. The answer to that approval is the user's next input: user_returned, and the next ask is put to them again.
  if (r.returned.actor !== 'user' || r.returned.metadata.after_seconds !== seconds) fail(`user_returned reads ${JSON.stringify(r.returned)}`);
  if (!(r.returned.at >= q.shown.at && r.returned.at <= q.decision.at)) fail('user_returned was not written by the answer to the question\'s approval');
  const returnLine = record.sessionLog.split('\n').find((l) => /user returned: input reached this session/.test(l)) ?? fail('the session log carries no "user returned" line');
  if (!/ WARNING /.test(returnLine)) fail(`the session log's return line is not at WARNING: ${returnLine}`);
  if (r.askedAfterReturn.length === 0) fail('nothing asked after the user returned, so prompting again is unmeasured');
  for (const a of r.askedAfterReturn) if (a.request.resolver !== 'brokered' || a.shown === null) fail(`an ask after the return (${a.request.tool_name}) was ${a.request.resolver} and ${a.shown === null ? 'not shown' : 'shown'}`);
  if (existsSync(join(where.workspace, 'NOTES.md'))) fail('a denied write reached the disk');
  return {
    timeoutSeconds: seconds, firstWaitMs: first.waitedMs, userAway: { afterSeconds: r.seconds, msFromTimeout: r.away.at - first.decision.at },
    queued: r.ended.map((e) => ({ agent: e.request.agent_name, requestedBeforeExpiryMs: first.decision.at - e.request.at, endedAfterTimeoutMs: e.lagMs })),
    askedWhileAway: r.askedWhileAway.map((w) => ({ tool: w.request.tool_name, agent: w.request.agent_name, decidedMs: w.decidedMs })),
    exemption: { questionApprovalRequestedBeforeExpiryMs: first.decision.at - q.request.at, shownAfterExpiryMs: q.shown.at - first.decision.at, decision: q.decision.source, questionResult: question.result.split('\n')[0] },
    userReturned: { afterSeconds: r.returned.metadata.after_seconds, awayForMs: r.returned.at - r.away.at },
    askedAfterReturn: r.askedAfterReturn.map((a) => a.request.tool_name), dialogsShown: r.shown.map((p) => p.tool),
  };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log('PASSED');
