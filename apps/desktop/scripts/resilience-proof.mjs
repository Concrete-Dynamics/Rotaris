import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';

/**
 * Part Q's first execution in the built app: the model resilience paths against the scripted client's fault steps
 * (REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..093/263). Seven launches, each asserting the store's events, issues,
 * timeline and children, the record's `wait` through the capture probes, and the log. `pnpm resilience-proof`.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'resilience-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

/**
 * A scratch workspace: `alpha` on provider `scripted` fills every tier; `beta` on provider `scripted-b` is configured
 * beside it. With `snapshot: true` the per-user discovery snapshot lists `scripted-b` as an authenticated provider
 * whose own tier picks are `scripted-b/beta`, so a same-tier candidate on a different provider exists (the recorded
 * role of a discovered model is the provider's pick, REQ-NOTIFY-082); without it no model shares alpha's role.
 */
function scenario(name, agentsYaml, opts = {}) {
  const root = join(output, name);
  const workspace = join(root, 'workspace');
  const local = join(root, 'local');
  mkdirSync(join(workspace, '.rotaris'), { recursive: true });
  mkdirSync(local, { recursive: true });
  writeFileSync(join(workspace, 'README.md'), '# proof\n');
  writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
    'models:',
    '  alpha: { provider: scripted, model_id: alpha }',
    '  beta: { provider: scripted-b, model_id: beta }',
    'small_model: alpha', 'medium_model: alpha', 'large_model: alpha',
    ...(opts.fallback ? [`fallback_model: ${opts.fallback}`] : []),
    'runtime:', '  permission_mode: autonomous', ...agentsYaml,
    // Since Part T the shipped code_intelligence entry is enabled by default and its discovery costs every run start
    // about 4.5 s (ADR-0035's note, finding 6); this proof measures another mechanism, so the entry is off here.
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    ...(opts.personas ?? []),
    ...(opts.delegation ? [] : ['rotaris:', '  delegation_strategy: single']), '',
  ].join('\n'));
  if (opts.snapshot) {
    // By the platform that reads it (`configDirFor`), not the Windows spelling alone.
    const configDir = configDirFor(local);
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'project_settings.yaml'), [
      'version: 1', 'providers:', '  scripted-b:', '    id: scripted-b', '    display_name: Scripted B', '    family: scripted', '    authenticated: true',
      '    discovered_at: 2026-09-05T00:00:00Z', '    small_model: scripted-b/beta', '    medium_model: scripted-b/beta', '    large_model: scripted-b/beta',
      '    models:', '      - { id: scripted-b/beta, discovered_at: 2026-09-05T00:00:00Z, capabilities: {}, limits: {}, pricing: {} }', '',
    ].join('\n'));
  }
  return { root, workspace, local };
}
function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  // `hostSwitches`: Chromium refuses to start as root with its sandbox on, and this proof's first launch died with
  // SIGTRAP before its first assertion (`docs/defects/fixed/resilience-proof-cannot-launch-the-app-as-root.md`).
  const result = spawnSync(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, encoding: 'utf8', timeout: opts.timeout ?? 180_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: join(s.root, 'preferences') }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (opts.expectPng !== false && !existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return { log, png, elapsedMs: Date.now() - started };
}
function open(s) { return new Database(oneDatabase(s.local), { readonly: true }); }
const session = (db) => db.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, summary_text FROM sessions ORDER BY created_at DESC').get();
const names = (db, sid) => db.prepare('SELECT name, metadata FROM timeline WHERE session_id = ? ORDER BY ordinal').all(sid);
const issues = (db, sid) => db.prepare('SELECT kind, severity, message, metadata FROM issues WHERE session_id = ? ORDER BY ordinal').all(sid);
const systemRows = (db, sid) => db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'system' ORDER BY row_index").all(sid).map((r) => r.body);
const probes = (log, label) => [...log.matchAll(new RegExp(`capture: ${label} (.*?) → (\\[.*\\])`, 'g'))].map((m) => ({ selector: m[1], found: JSON.parse(m[2]) }));
const modelCalls = (log) => [...log.matchAll(/scripted model call: ([^\s]+) \((\w[\w-]*)\)/g)].map((m) => ({ model: m[1], who: m[2] }));
const results = {};
const expect = (cond, message) => { if (!cond) throw new Error(message); };

// 1. A 429 with retry-after 2 s: a 2 s wait the header counts down, auto-resume, the run completes; the wait issue and no transient budget spent.
const s1 = scenario('retry-after', []);
{
  const r = launch('retry-after', s1, { ROTARIS_SCRIPT: 'fail:429:retry-after=2,answer', ROTARIS_CAPTURE_PROMPT: 'rate limit me', ROTARIS_CAPTURE_PROBE_AT: '.wait-header@~6000', ROTARIS_CAPTURE_PROBE: '.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s1);
  const row = session(db);
  const list = names(db, row.session_id).map((t) => t.name);
  const kinds = issues(db, row.session_id);
  const rows = systemRows(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete after the wait: ${JSON.stringify(row)}`);
  const wait = kinds.find((i) => i.kind === 'model_wait');
  expect(wait !== undefined, `no model_wait issue: ${kinds.map((i) => i.kind).join(',')}`);
  const meta = JSON.parse(wait.metadata);
  expect(meta.wait_seconds === 2 && meta.auto_resume === true && meta.provider_exhausted === false && meta.attempt === 1, `the wait issue is wrong: ${wait.metadata}`);
  expect(!kinds.some((i) => i.kind === 'transient_llm_error'), 'a 429 was spent from the transient budget (REQ-ORCH-092)');
  expect(!list.includes('model_fallback'), 'a same-tier fallback happened with no candidate configured');
  expect(rows.some((b) => b.startsWith('Waiting on a provider limit') && b.includes('Wait 2 s')), `no wait row naming the interval: ${rows.join(' | ')}`);
  const during = probes(r.log, 'probe-at ~6000');
  const header = during[0]?.found[0];
  expect(header !== undefined, 'the wait header was not on screen 1.7 s into the run');
  expect(/Resumes automatically in 0:0[0-2]\./.test(header.text) && header.data['data-exhausted'] === '0', `the header did not count down: ${JSON.stringify(header)}`);
  expect(/scripted \/ alpha/.test(header.text) && /provider not marked exhausted/.test(header.text), `the header does not name the provider and the model: ${header.text}`);
  const after = probes(r.log, 'probe');
  expect(after.length > 0 && after[0].found.length === 0, `the header is still on screen after the run ended: ${JSON.stringify(after)}`);
  results.retryAfter = { status: row.execution_status, wait: meta, headerDuringWait: header.text, remainingS: header.data['data-remaining'], calls: modelCalls(r.log), png: r.png, elapsedMs: r.elapsedMs };
}

// 2. A 429 with no retry-after: a 60 s wait computed locally; cancel from the header ends the run user_cancelled with REQ-NOTIFY-063's notice.
const s2 = scenario('cancel', []);
{
  const r = launch('cancel', s2, { ROTARIS_SCRIPT: 'fail:429,answer', ROTARIS_CAPTURE_PROMPT: 'limit then cancel', ROTARIS_CAPTURE_PROBE_AT: '.wait-header@~6000', ROTARIS_CAPTURE_PNG_WHEN: '.wait-header', ROTARIS_CAPTURE_PNG_AT: `${join(output, 'cancel-waiting.png')}@~6000`, ROTARIS_CAPTURE_CLICKS: '.wait-header .btn-danger>>Cancel the run@~10000;;.dialog-actions .btn-danger>>Cancel the run@~10000', ROTARIS_CAPTURE_PROBE: '.notice-slot;;.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '1200' });
  const db = open(s2);
  const row = session(db);
  const kinds = issues(db, row.session_id);
  const events = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'result'").all(row.session_id).map((e) => JSON.parse(e.payload));
  db.close();
  expect(row.stop_reason === 'user_cancelled' && row.execution_status === 'paused', `cancel during the wait did not end the run user_cancelled: ${JSON.stringify(row)}`);
  const wait = kinds.find((i) => i.kind === 'model_wait');
  expect(wait !== undefined && JSON.parse(wait.metadata).wait_seconds === 60, `the local backoff is not 60 s: ${wait?.metadata}`);
  const header = probes(r.log, 'probe-at ~6000')[0]?.found[0];
  expect(header !== undefined && /Resumes automatically in (1:00|0:5[0-9])\./.test(header.text), `the header did not show the 60 s countdown: ${JSON.stringify(header)}`);
  expect(!/Wait \d+ s/.test(header.text), `the wording named an interval the provider did not supply: ${header.text}`);
  const error = events[0]?.result?.error ?? null;
  expect(typeof error === 'string' && /rate limiting model alpha/.test(error), `the result does not carry the condition: ${JSON.stringify(events[0])}`);
  const probed = probes(r.log, 'probe');
  const notice = probed.find((p) => p.selector === '.notice-slot')?.found[0];
  expect(notice !== undefined && /provider limit was reached/.test(notice.text) && /session is preserved/.test(notice.text) && /Open Models settings/.test(notice.text), `REQ-NOTIFY-063's notice was not raised: ${JSON.stringify(notice)}`);
  expect((probed.find((p) => p.selector === '.wait-header')?.found ?? []).length === 0, 'the wait header outlived the run');
  results.cancel = { session: row, error, notice: notice.text, headerDuringWait: header.text, png: r.png, elapsedMs: r.elapsedMs };
}

// 3. Quota on a tier with a second provider (the snapshot's pick): the same-tier fallback, transparent; the exhausted pair recorded.
const s3 = scenario('same-tier', [], { snapshot: true });
{
  const r = launch('same-tier', s3, { ROTARIS_SCRIPT: 'fail:quota,answer', ROTARIS_CAPTURE_PROMPT: 'quota with a candidate', ROTARIS_CAPTURE_PROBE: '.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s3);
  const row = session(db);
  const list = names(db, row.session_id);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete on the fallback: ${JSON.stringify(row)}`);
  const fallback = list.find((t) => t.name === 'model_fallback');
  expect(fallback !== undefined, `no model_fallback timeline entry: ${list.map((t) => t.name).join(',')}`);
  const meta = JSON.parse(fallback.metadata);
  expect(meta.from_provider === 'scripted' && meta.from_model === 'alpha' && meta.to_provider === 'scripted-b' && meta.to_model === 'beta' && meta.provider_exhausted === true, `the fallback names the wrong pair: ${fallback.metadata}`);
  const exhausted = list.find((t) => t.name === 'model_exhausted');
  expect(exhausted !== undefined && JSON.parse(exhausted.metadata).provider === 'scripted', `the exhausted pair was not recorded: ${exhausted?.metadata}`);
  expect(kinds.some((i) => i.kind === 'model_fallback' && i.severity === 'warning'), 'no warning issue for the fallback (REQ-NOTIFY-090)');
  expect(!kinds.some((i) => i.kind === 'model_wait'), 'the run waited although a candidate existed');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted/beta', `the calls did not move to beta: ${JSON.stringify(calls)}`);
  results.sameTier = { status: row.execution_status, fallback: meta, calls, png: r.png, elapsedMs: r.elapsedMs };
}

// 4. Quota with no candidate: an indefinite wait; setModel from the header → rebuilt, completes; the override persists; a relaunch and resume uses it.
const s4 = scenario('override', []);
{
  const r = launch('override', s4, { ROTARIS_SCRIPT: 'fail:quota,answer,answer', ROTARIS_CAPTURE_PROMPT: 'quota with no candidate', ROTARIS_CAPTURE_PROBE_AT: '.wait-header@~6000;;.wait-header@9000', ROTARIS_CAPTURE_PNG_WHEN: '.wait-header', ROTARIS_CAPTURE_PNG_AT: `${join(output, 'override-waiting.png')}@~6000`, ROTARIS_CAPTURE_CLICKS: '.wait-header .btn-secondary>>Change model@~10000', ROTARIS_CAPTURE_SELECT: '.wait-header select>>beta@~10000', ROTARIS_CAPTURE_PROBE: '.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s4);
  const row = session(db);
  const list = names(db, row.session_id);
  const kinds = issues(db, row.session_id);
  const rows = systemRows(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete after the model change: ${JSON.stringify(row)}`);
  const header = probes(r.log, 'probe-at ~6000')[0]?.found[0];
  expect(header !== undefined && /Resumes only when you decide\./.test(header.text) && header.data['data-exhausted'] === '1' && /provider marked exhausted/.test(header.text), `the indefinite wait is not shown as such: ${JSON.stringify(header)}`);
  const wait = kinds.find((i) => i.kind === 'model_wait');
  expect(wait !== undefined && JSON.parse(wait.metadata).auto_resume === false && JSON.parse(wait.metadata).wait_seconds === null, `the wait issue is not indefinite: ${wait?.metadata}`);
  const override = list.find((t) => t.name === 'model_override');
  expect(override !== undefined && JSON.parse(override.metadata).model_key === 'beta', `no model_override entry: ${list.map((t) => t.name).join(',')}`);
  expect(rows.some((b) => b.includes('Model changed to beta during the wait')), `no system row for the change: ${rows.join(' | ')}`);
  expect(!list.some((t) => t.name === 'model_fallback'), 'a same-tier fallback happened with no candidate');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted-b/beta', `the run did not resume on beta: ${JSON.stringify(calls)}`);
  // EVIDENCE, not an assertion: an absence cannot be waited FOR, so this one stays an appointment, moved out to
  // 9 s so a slow machine reports the header gone because it went rather than because the sample came early.
  const gone = probes(r.log, 'probe-at 9000')[0]?.found ?? [];
  results.override = { status: row.execution_status, headerDuringWait: header.text, override: JSON.parse(override.metadata), calls, headerAfterChange: gone.length, png: r.png, elapsedMs: r.elapsedMs };
  // The relaunch: the stored session opened from the browser and continued; the first call of the continuation goes to beta.
  const again = launch('override-resume', s4, { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_PROMPT: 'continue on the override', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const calls2 = modelCalls(again.log).filter((c) => c.who === 'orchestrator');
  expect(calls2.length > 0 && calls2.every((c) => c.model === 'scripted-b/beta'), `the resumed session returned to the exhausted model: ${JSON.stringify(calls2)}`);
  const db2 = open(s4);
  const row2 = session(db2);
  db2.close();
  expect(row2.execution_status === 'completed' && row2.iterations_completed >= 2, `the continuation did not complete: ${JSON.stringify(row2)}`);
  results.overrideResume = { calls: calls2, session: row2, png: again.png, elapsedMs: again.elapsedMs };
}

// 5. An unresponsive model: no event for 30 s with a fallback slot → the fallback; the same script with no fallback keeps waiting.
const s5 = scenario('unresponsive', ['  llm_response_timeout: 30'], { fallback: 'beta' });
{
  const r = launch('unresponsive', s5, { ROTARIS_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'hang then fall back', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '800' }, { timeout: 240_000 });
  const db = open(s5);
  const row = session(db);
  const list = names(db, row.session_id);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete on the fallback: ${JSON.stringify(row)}`);
  const entry = list.find((t) => t.name === 'unresponsive_model_fallback');
  expect(entry !== undefined && JSON.parse(entry.metadata).threshold_seconds === 30 && JSON.parse(entry.metadata).to_model === 'beta', `no unresponsive_model_fallback entry: ${list.map((t) => t.name).join(',')}`);
  expect(kinds.some((i) => i.kind === 'unresponsive_model'), 'no unresponsive_model issue (REQ-ORCH-090)');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted-b/beta', `the calls did not move to the fallback: ${JSON.stringify(calls)}`);
  const at = /unresponsive-model timer .*?(\d+) ms|no model event .* within (\d+) s/.exec(r.log);
  results.unresponsive = { status: row.execution_status, fallback: JSON.parse(entry.metadata), calls, elapsedMs: r.elapsedMs, timerLine: at?.[0] ?? null, png: r.png };
}
const s5b = scenario('unresponsive-no-fallback', ['  llm_response_timeout: 30']);
{
  const r = launch('unresponsive-no-fallback', s5b, { ROTARIS_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'hang with nothing to fall back to', ROTARIS_CAPTURE_AFTER_MS: '36000' }, { timeout: 120_000 });
  const db = open(s5b);
  const row = session(db);
  const list = names(db, row.session_id).map((t) => t.name);
  db.close();
  expect(row.execution_status === 'running', `with no fallback the call should still be waiting at 36 s: ${JSON.stringify(row)}`);
  expect(!list.includes('unresponsive_model_fallback'), 'a fallback fired although none is configured');
  expect(modelCalls(r.log).filter((c) => c.who === 'orchestrator').length === 1, 'a second call was made with no fallback');
  results.unresponsiveNoFallback = { status: row.execution_status, calls: modelCalls(r.log), png: r.png, elapsedMs: r.elapsedMs };
}

// 6. The hard child timeout: a child scripted `hang` under child_timeout 8 s and a role fallback is retried once on it (REQ-ORCH-088); without one it fails.
const childYaml = ['  child_timeout: 8', '  max_active_children: 2'];
const s6 = scenario('child-timeout', childYaml, { delegation: true, personas: ['personas:', '  coding-agent:', '    fallback_model: beta'] });
{
  const r = launch('child-timeout', s6, { ROTARIS_SCRIPT: 'delegate:coding-agent:helper,answer', ROTARIS_CHILD_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'delegate a hanging child', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '800' }, { timeout: 180_000 });
  const db = open(s6);
  const row = session(db);
  const list = names(db, row.session_id);
  const children = db.prepare('SELECT canonical_name, state, report FROM children WHERE session_id = ?').all(row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  expect(children.length === 1 && children[0].state === 'succeeded', `the child did not succeed on the fallback: ${JSON.stringify(children)}`);
  const entry = list.find((t) => t.name === 'child_timeout_fallback');
  expect(entry !== undefined && JSON.parse(entry.metadata).timeout_seconds === 8 && JSON.parse(entry.metadata).to_model === 'beta', `no child_timeout_fallback entry: ${list.map((t) => t.name).join(',')}`);
  const childCalls = modelCalls(r.log).filter((c) => c.who === 'child');
  expect(childCalls[0]?.model === 'scripted/alpha' && childCalls[1]?.model === 'scripted-b/beta', `the child was not retried on beta: ${JSON.stringify(childCalls)}`);
  results.childTimeoutFallback = { child: children[0].state, fallback: JSON.parse(entry.metadata), childCalls, png: r.png, elapsedMs: r.elapsedMs };
}
const s6b = scenario('child-timeout-no-fallback', childYaml, { delegation: true });
{
  const r = launch('child-timeout-no-fallback', s6b, { ROTARIS_SCRIPT: 'delegate:coding-agent:helper,answer', ROTARIS_CHILD_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'delegate a hanging child, no fallback', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '800' }, { timeout: 180_000 });
  const db = open(s6b);
  const row = session(db);
  const list = names(db, row.session_id).map((t) => t.name);
  const children = db.prepare('SELECT canonical_name, state, report FROM children WHERE session_id = ?').all(row.session_id);
  const kinds = issues(db, row.session_id).map((i) => i.kind);
  db.close();
  expect(children.length === 1 && children[0].state === 'failed', `the child did not fail at the timeout: ${JSON.stringify(children)}`);
  const report = JSON.parse(children[0].report);
  expect(report.errors.some((e) => e.message === 'Child timed out after 8s'), `the report does not carry the timeout text: ${children[0].report}`);
  expect(kinds.includes('timeout') && !list.includes('child_timeout_fallback'), `the timeout issue or a spurious fallback: ${kinds.join(',')} / ${list.join(',')}`);
  results.childTimeoutNoFallback = { child: children[0].state, errors: report.errors.map((e) => e.message), status: row.execution_status, png: r.png, elapsedMs: r.elapsedMs };
}

// 7. The transient path unchanged (one retry after 1 s, transient_llm_error), and a 401 fails at once with no retry.
const s7 = scenario('transient', []);
{
  const r = launch('transient', s7, { ROTARIS_SCRIPT: 'fail:503,answer', ROTARIS_CAPTURE_PROMPT: 'overloaded once', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s7);
  const row = session(db);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the transient retry did not complete: ${JSON.stringify(row)}`);
  const t = kinds.find((i) => i.kind === 'transient_llm_error');
  expect(t !== undefined && JSON.parse(t.metadata).attempt === 1 && JSON.parse(t.metadata).limit === 1 && JSON.parse(t.metadata).delay_seconds === 1, `the transient issue is wrong: ${t?.metadata}`);
  expect(!kinds.some((i) => i.kind === 'model_wait'), 'a 503 entered the wait');
  expect(modelCalls(r.log).filter((c) => c.who === 'orchestrator').length === 2, 'the transient retry did not happen exactly once');
  results.transient = { status: row.execution_status, issue: JSON.parse(t.metadata), png: r.png, elapsedMs: r.elapsedMs };
}
const s7b = scenario('fatal', []);
{
  const r = launch('fatal', s7b, { ROTARIS_SCRIPT: 'fail:401,answer', ROTARIS_CAPTURE_PROMPT: 'bad key', ROTARIS_CAPTURE_PROBE: '.notice-slot', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s7b);
  const row = session(db);
  const kinds = issues(db, row.session_id).map((i) => i.kind);
  db.close();
  expect(row.execution_status === 'failed', `a 401 did not fail the run at once: ${JSON.stringify(row)}`);
  expect(!kinds.includes('transient_llm_error') && !kinds.includes('model_wait'), `a 401 was retried or waited: ${kinds.join(',')}`);
  expect(modelCalls(r.log).filter((c) => c.who === 'orchestrator').length === 1, 'a 401 was retried');
  const notice = probes(r.log, 'probe').find((p) => p.selector === '.notice-slot')?.found[0];
  expect(notice !== undefined && !/provider limit was reached/.test(notice.text), `a 401 was reported as a provider limit: ${JSON.stringify(notice)}`);
  results.fatal = { status: row.execution_status, notice: notice?.text ?? null, png: r.png, elapsedMs: r.elapsedMs };
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
