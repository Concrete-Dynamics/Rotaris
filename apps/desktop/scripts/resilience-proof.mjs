import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { logTail, overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { choose, startApp, stopApp, stopOverrunMessage, until } from './lib/driver.mjs';
import { backgroundSetupStarted, SETUP_ANSWERED } from './lib/initialization-marker.mjs';

/**
 * Part Q's first execution in the built app: the model resilience paths against the scripted client's fault steps
 * (REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..093/263), and since OQ-173 that a wait the run imposes is not a stall
 * (REQ-MONITOR-117..119), and since OQ-176 that an entry switch after a ladder move applies as its row says (REQ-MONITOR-142).
 * Twelve scenarios, each asserting the store's events, issues,
 * timeline and children, the record's `wait` through the capture probes or the driver, and the log.
 * `pnpm resilience-proof`.
 *
 * Every scenario runs to its end whatever the one before it did: a failed scenario is recorded in `results.json` with
 * its reason, the next one runs, and the proof exits 1 at the end if any failed. Every launch is BOUNDED — the ten the
 * capture seams drive by `spawnBounded`, the driven override launch by the driver's `stopApp` — and one that overruns
 * is ended (SIGTERM, a grace, SIGKILL) and reported as a failure with its log tail, where `spawnSync`'s timeout had left
 * the override launch alive 649 s after its 180 s
 * (`docs/defects/fixed/resilience-proofs-override-launch-selects-a-native-select-the-wait-header-no-longer-draws.md`).
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
    ...(opts.delegation ? [] : ['rotaris:', '  delegation_strategy: single']),
    // The project-setup task answered (REQ-WORKSPACE-081/111): `enabled: false` above does not make it inapplicable
    // (REQ-WORKSPACE-090), and without the bundled runtime its background run fails and publishes "Project setup did not
    // finish" into the ONE notice slot `cancel` and `fatal` read (REQ-NOTIFY-024) — read by `cancel` in place of
    // REQ-NOTIFY-063's notice, and passed by `fatal` as "not a provider limit"
    // (`docs/defects/fixed/resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md`).
    ...SETUP_ANSWERED, '',
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
async function launch(name, s, extra, opts = {}) {
  const png = join(output, `${name}.png`);
  const started = Date.now();
  // `hostSwitches`: Chromium refuses to start as root with its sandbox on, and this proof's first launch died with
  // SIGTRAP before its first assertion (`docs/defects/fixed/resilience-proof-cannot-launch-the-app-as-root.md`).
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, s.workspace], {
    cwd: app, timeoutMs: opts.timeout ?? 180_000, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local: s.local, preferences: join(s.root, 'preferences') }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? result.error?.message ?? 'unknown'}; see ${name}.log`);
  // The precondition the section establishes, checked rather than assumed: a background setup's notice is not this proof's subject.
  if (backgroundSetupStarted(log)) throw new Error(`${name}: the workspace's initialization started code-intelligence-setup in the background, so its notice may stand in the slot this proof reads; see ${name}.log`);
  if (opts.expectPng !== false && !existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return { log, png, elapsedMs: Date.now() - started };
}

/**
 * Scenario 4's first launch, DRIVEN (`lib/driver.mjs`): the prompt typed once the composer holds the caret, the wait
 * header read once it is on screen, "Change model" pressed, and the model chosen in the chooser the header draws —
 * the design system's `SearchableSelect`, by two real clicks — then the run waited for in the store. Its first form
 * addressed `.wait-header select`, a native control the header no longer draws, so no model was ever chosen and the
 * launch waited on a result that could not come. Each step lands in `override.steps.json`.
 *
 * It is bounded as the `spawnBounded` launches are, by its own means: the steps by `boundMs` (a store wait still
 * polling is abandoned with them), and the ending by `stopApp` — the closing picture and the driver's quit each within
 * a bound, then SIGTERM, a grace and SIGKILL for an application that has not exited. It fails as `launch` fails: on a
 * step that did not happen, an overrun, a non-zero exit, or no screenshot — every one of them with the log's tail.
 */
const SETTLED = new Set(['completed', 'failed', 'stopped', 'interrupted', 'paused', 'paused_message_limit']);
async function drivenOverride(s, { boundMs = 180_000 } = {}) {
  const png = join(output, 'override.png');
  rmSync(join(s.root, 'app.log'), { force: true });
  const trail = [];
  const started = Date.now();
  // A launch whose driver never answers is ended by `startApp` itself, and the failure carries its log's tail.
  const launched = await startApp({ root: s.root, workspace: s.workspace, timeoutMs: 60_000, extra: { ROTARIS_SCRIPT: 'fail:quota,answer,answer' } })
    .catch((cause) => { throw new Error(`override: ${cause instanceof Error ? cause.message : String(cause)}`); });
  const step = async (label, pending) => {
    const at = Date.now() - started;
    try {
      const value = await pending;
      trail.push({ at, ms: Date.now() - started - at, label, value });
      return value;
    } catch (cause) {
      trail.push({ at, ms: Date.now() - started - at, label, error: cause instanceof Error ? cause.message : String(cause) });
      throw cause;
    }
  };
  const d = launched.driver;
  const giveUp = new AbortController();
  let value;
  let failure = null;
  let bound;
  try {
    value = await Promise.race([
      (async () => {
        await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
        await step('Ctrl+2', d.chord('Ctrl+2'));
        await step('the composer', d.waitFor('.composer__input'));
        await step('Ctrl+L', d.chord('Ctrl+L'));
        await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus', signal: giveUp.signal }));
        await step('the prompt', d.type('quota with no candidate', { enter: true }));
        await step('the wait header', d.waitFor('.wait-header', { timeoutMs: 60_000 }));
        const during = await step('the header during the wait', d.probe('.wait-header'));
        await step('the waiting picture', d.screenshot(join(output, 'override-waiting.png')));
        await step('Change model', d.click('.wait-header .btn-secondary', { text: 'Change model' }));
        const chosen = await step('the chooser → beta', choose(d, '.wait-header button[aria-label="Change model"]', 'beta'));
        const settled = await step('the run settled', until(() => { const db = open(s); try { return session(db); } finally { db.close(); } }, (row) => row !== undefined && SETTLED.has(row.execution_status), { timeoutMs: 90_000, what: 'the session settling', signal: giveUp.signal }));
        // EVIDENCE, not an assertion: the header's absence once the run has settled.
        const after = await step('the header after the change', d.probe('.wait-header'));
        return { during, chosen, settled, after };
      })(),
      new Promise((_, reject) => { bound = setTimeout(() => reject(new Error(`the steps did not finish within ${boundMs} ms`)), boundMs); }),
    ]);
  } catch (cause) {
    failure = cause;
  } finally {
    clearTimeout(bound);
    // Steps still pending after the bound are abandoned: a store wait stops at its next poll rather than running on
    // beside the next scenario; a driver request is rejected when `stopApp` closes the connection.
    giveUp.abort(new Error('the override launch was given up'));
  }
  const stopped = await stopApp(launched, { screenshot: png });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, 'override.log'), log);
  writeFileSync(join(output, 'override.steps.json'), `${JSON.stringify(trail, null, 2)}\n`);
  const problems = [];
  if (failure) problems.push(`override: ${failure.message} (see override.steps.json)`);
  if (backgroundSetupStarted(log)) problems.push('override: the workspace\'s initialization started code-intelligence-setup in the background, so its notice may stand in the notice slot');
  if (stopped.overran) problems.push(stopOverrunMessage('override', stopped, log).split('\n--- ')[0]);
  else if (stopped.exit.code !== 0) problems.push(`override exited ${stopped.exit.code ?? stopped.exit.signal} on the driver's quit`);
  if (!existsSync(png)) problems.push(`override produced no screenshot (the closing picture: ${stopped.screenshot})`);
  if (problems.length > 0) throw new Error(`${problems.join('; ')}\n--- the launch's last words ---\n${logTail(log)}\n(see override.log)`);
  return { log, png, value, elapsedMs: Date.now() - started };
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
/** One scenario, run to its end: a failure is recorded under its name and the next scenario still runs. */
const failures = [];
/** `--only=<name>[,<name>…]` runs the named scenarios alone (the others are skipped and say so); absent, all of them run. */
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter((n) => n !== '') ?? null;
async function scenarioRun(name, body) {
  if (only !== null && !only.includes(name)) { console.log(`SKIP  ${name} (not named by --only)`); return; }
  const started = Date.now();
  try {
    await body();
    console.log(`PASS  ${name} (${Math.round((Date.now() - started) / 1000)} s)`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    failures.push({ scenario: name, error: message });
    console.log(`FAIL  ${name} (${Math.round((Date.now() - started) / 1000)} s) — ${message}`);
  }
}

// 1. A 429 with retry-after 2 s: a 2 s wait the header counts down, auto-resume, the run completes; the wait issue and no transient budget spent.
const s1 = scenario('retry-after', []);
await scenarioRun('retry-after', async () => {
  const r = await launch('retry-after', s1, { ROTARIS_SCRIPT: 'fail:429:retry-after=2,answer', ROTARIS_CAPTURE_PROMPT: 'rate limit me', ROTARIS_CAPTURE_PROBE_AT: '.wait-header@~6000', ROTARIS_CAPTURE_PROBE: '.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
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
  expect(!list.includes('quota_fallback_model'), 'a same-tier fallback happened with no candidate configured');
  expect(rows.some((b) => b.startsWith('Waiting on a provider limit') && b.includes('Wait 2 s')), `no wait row naming the interval: ${rows.join(' | ')}`);
  const during = probes(r.log, 'probe-at ~6000');
  const header = during[0]?.found[0];
  expect(header !== undefined, 'the wait header was not on screen 1.7 s into the run');
  expect(/Resumes automatically in 0:0[0-2]\./.test(header.text) && header.data['data-exhausted'] === '0', `the header did not count down: ${JSON.stringify(header)}`);
  expect(/scripted \/ alpha/.test(header.text) && /provider not marked exhausted/.test(header.text), `the header does not name the provider and the model: ${header.text}`);
  const after = probes(r.log, 'probe');
  expect(after.length > 0 && after[0].found.length === 0, `the header is still on screen after the run ended: ${JSON.stringify(after)}`);
  results.retryAfter = { status: row.execution_status, wait: meta, headerDuringWait: header.text, remainingS: header.data['data-remaining'], calls: modelCalls(r.log), png: r.png, elapsedMs: r.elapsedMs };
});

// 1b. OQ-173 (the repair of `a-provider-wait-or-a-compression-is-counted-as-a-stall.md`): a provider-limit wait longer than
// the stall threshold is the run's own wait and not the agent's silence. With `child_stall_timeout: 3` the entry agent's
// watch evaluates every second; a 10 s retry-after wait raises no `stall` issue, and its session log says the agent is
// waiting on a provider limit (REQ-MONITOR-118's manner) beside the wait's own notice and issue (REQ-NOTIFY-083..087).
const s1b = scenario('quota-wait', ['  child_stall_timeout: 3']);
await scenarioRun('quota-wait', async () => {
  const r = await launch('quota-wait', s1b, { ROTARIS_SCRIPT: 'fail:429:retry-after=10,answer', ROTARIS_CAPTURE_PROMPT: 'wait past the stall threshold', ROTARIS_CAPTURE_PROBE_AT: '.wait-header@~9000', ROTARIS_CAPTURE_PROBE: '.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s1b);
  const row = session(db);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete after the wait: ${JSON.stringify(row)}`);
  const wait = kinds.find((i) => i.kind === 'model_wait');
  expect(wait !== undefined && JSON.parse(wait.metadata).wait_seconds === 10, `no 10 s model_wait issue: ${wait?.metadata}`);
  const stalls = kinds.filter((i) => i.kind === 'stall');
  expect(stalls.length === 0, `the provider-limit wait was reported as a stall ${stalls.length} time(s): ${stalls[0]?.message}`);
  const header = probes(r.log, 'probe-at ~9000')[0]?.found[0];
  expect(header !== undefined, 'the wait header was not on screen 9 s into the run');
  const logFile = join(dirname(oneDatabase(s1b.local)), 'sessions', row.session_id, 'session.log');
  const sessionLog = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
  const waitLines = sessionLog.split('\n').filter((l) => l.includes('agent waiting on a provider limit:'));
  expect(waitLines.length >= 1, `the session log does not say the agent is waiting on a provider limit (${logFile})`);
  expect(!/appears stalled/.test(sessionLog), 'the session log calls the wait a stall');
  results.quotaWait = { status: row.execution_status, wait: JSON.parse(wait.metadata), stallIssues: stalls.length, headerDuringWait: header.text, waitLine: waitLines[0], png: r.png, elapsedMs: r.elapsedMs };
});

// 2. A 429 with no retry-after: a 60 s wait computed locally; cancel from the header ends the run user_cancelled with REQ-NOTIFY-063's notice.
const s2 = scenario('cancel', []);
await scenarioRun('cancel', async () => {
  const r = await launch('cancel', s2, { ROTARIS_SCRIPT: 'fail:429,answer', ROTARIS_CAPTURE_PROMPT: 'limit then cancel', ROTARIS_CAPTURE_PROBE_AT: '.wait-header@~6000', ROTARIS_CAPTURE_PNG_WHEN: '.wait-header', ROTARIS_CAPTURE_PNG_AT: `${join(output, 'cancel-waiting.png')}@~6000`, ROTARIS_CAPTURE_CLICKS: '.wait-header .btn-danger>>Cancel the run@~10000;;.dialog-actions .btn-danger>>Cancel the run@~10000', ROTARIS_CAPTURE_PROBE: '.notice-slot;;.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '1200' });
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
});

// 3. Quota on a tier with a second provider (the snapshot's pick): the same-tier fallback, transparent; the exhausted pair recorded.
const s3 = scenario('same-tier', [], { snapshot: true });
await scenarioRun('same-tier', async () => {
  const r = await launch('same-tier', s3, { ROTARIS_SCRIPT: 'fail:quota,answer', ROTARIS_CAPTURE_PROMPT: 'quota with a candidate', ROTARIS_CAPTURE_PROBE: '.wait-header', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s3);
  const row = session(db);
  const list = names(db, row.session_id);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete on the fallback: ${JSON.stringify(row)}`);
  const fallback = list.find((t) => t.name === 'quota_fallback_model');
  expect(fallback !== undefined, `no quota_fallback_model timeline entry: ${list.map((t) => t.name).join(',')}`);
  const meta = JSON.parse(fallback.metadata);
  expect(meta.from_provider === 'scripted' && meta.from_model === 'alpha' && meta.to_provider === 'scripted-b' && meta.to_model === 'beta' && meta.provider_exhausted === true, `the fallback names the wrong pair: ${fallback.metadata}`);
  const exhausted = list.find((t) => t.name === 'model_exhausted');
  expect(exhausted !== undefined && JSON.parse(exhausted.metadata).provider === 'scripted', `the exhausted pair was not recorded: ${exhausted?.metadata}`);
  expect(kinds.some((i) => i.kind === 'quota_fallback' && i.severity === 'warning'), 'no warning issue for the fallback (REQ-NOTIFY-090)');
  expect(!kinds.some((i) => i.kind === 'model_wait'), 'the run waited although a candidate existed');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted/beta', `the calls did not move to beta: ${JSON.stringify(calls)}`);
  results.sameTier = { status: row.execution_status, fallback: meta, calls, png: r.png, elapsedMs: r.elapsedMs };
});

// 3b. OQ-176 (REQ-MONITOR-142 over REQ-ORCH-091 b): after the same-tier move the user switches the entry model back to the
// configured key from the run header while iteration 1 holds on beta, and queues a follow-up beside it. Iteration 1 finishes
// on beta (the iteration in flight keeps its setting); iteration 2, the follow-up, runs on alpha, as the switch's row says.
// Before the repair the root's cell was rebuilt only when the requested model changed, so iteration 2 ran on beta under a
// row that said the switch applied (`docs/defects/fixed/an-entry-model-switch-row-says-it-applies-while-a-ladder-move-keeps-the-root.md`).
const s3b = scenario('switch-back', [], { snapshot: true });
await scenarioRun('switch-back', async () => {
  const r = await launch('switch-back', s3b, {
    ROTARIS_SCRIPT: 'fail:429,wait:12000,answer,answer', ROTARIS_CAPTURE_PROMPT: 'move, then switch back',
    ROTARIS_CAPTURE_TYPE: 'a second task>>composer@5000',
    ROTARIS_CAPTURE_CLICKS: 'button[aria-label="Active run model"]@7000;;[role="option"][data-value="alpha"]@7800',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800',
  });
  const db = open(s3b);
  const row = session(db);
  const list = names(db, row.session_id);
  const rows = systemRows(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed' && row.iterations_completed === 2, `the run did not complete two iterations: ${JSON.stringify(row)}`);
  expect(list.some((t) => t.name === 'quota_fallback_model'), `no same-tier move: ${list.map((t) => t.name).join(',')}`);
  const switched = list.find((t) => t.name === 'entry_model_switched');
  expect(switched !== undefined && JSON.parse(switched.metadata).model === 'alpha', `the switch was not recorded: ${list.map((t) => t.name).join(',')}`);
  expect(rows.includes('Entry model switched to alpha; it applies from the next iteration.'), `no row for the switch: ${rows.join(' | ')}`);
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  // Iteration 1: alpha refused, beta held then answered; iteration 2: alpha.
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted/beta,scripted/alpha', `the next iteration did not run on the switched-to model: ${JSON.stringify(calls)}`);
  results.switchBack = { status: row.execution_status, iterations: row.iterations_completed, row: rows.find((b) => b.startsWith('Entry model switched')), calls, png: r.png, elapsedMs: r.elapsedMs };
});

// 4. Quota with no candidate: an indefinite wait; setModel from the header → rebuilt, completes; the override persists; a relaunch and resume uses it.
const s4 = scenario('override', []);
await scenarioRun('override', async () => {
  const r = await drivenOverride(s4);
  const db = open(s4);
  const row = session(db);
  const list = names(db, row.session_id);
  const kinds = issues(db, row.session_id);
  const rows = systemRows(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete after the model change: ${JSON.stringify(row)}`);
  const header = r.value.during[0];
  expect(header !== undefined && /Resumes only when you decide\./.test(header.text) && header.data['data-exhausted'] === '1' && /provider marked exhausted/.test(header.text), `the indefinite wait is not shown as such: ${JSON.stringify(header)}`);
  const wait = kinds.find((i) => i.kind === 'model_wait');
  expect(wait !== undefined && JSON.parse(wait.metadata).auto_resume === false && JSON.parse(wait.metadata).wait_seconds === null, `the wait issue is not indefinite: ${wait?.metadata}`);
  const override = list.find((t) => t.name === 'model_override');
  expect(override !== undefined && JSON.parse(override.metadata).model_key === 'beta', `no model_override entry: ${list.map((t) => t.name).join(',')}`);
  expect(rows.some((b) => b.includes('Model changed to beta during the wait')), `no system row for the change: ${rows.join(' | ')}`);
  expect(!list.some((t) => t.name === 'quota_fallback_model'), 'a same-tier fallback happened with no candidate');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted-b/beta', `the run did not resume on beta: ${JSON.stringify(calls)}`);
  results.override = { status: row.execution_status, headerDuringWait: header.text, chooser: r.value.chosen.kind, override: JSON.parse(override.metadata), calls, headerAfterChange: r.value.after.length, png: r.png, elapsedMs: r.elapsedMs };
  // The relaunch: the stored session opened from the browser and continued; the first call of the continuation goes to beta.
  const again = await launch('override-resume', s4, { ROTARIS_SCRIPT: 'answer', ROTARIS_CAPTURE_RESUME: 'latest', ROTARIS_CAPTURE_PROMPT: 'continue on the override', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const calls2 = modelCalls(again.log).filter((c) => c.who === 'orchestrator');
  expect(calls2.length > 0 && calls2.every((c) => c.model === 'scripted-b/beta'), `the resumed session returned to the exhausted model: ${JSON.stringify(calls2)}`);
  const db2 = open(s4);
  const row2 = session(db2);
  db2.close();
  expect(row2.execution_status === 'completed' && row2.iterations_completed >= 2, `the continuation did not complete: ${JSON.stringify(row2)}`);
  results.overrideResume = { calls: calls2, session: row2, png: again.png, elapsedMs: again.elapsedMs };
});

// 5. An unresponsive model: no event for 30 s with a fallback slot → the fallback; the same script with no fallback keeps waiting.
const s5 = scenario('unresponsive', ['  llm_response_timeout: 30'], { fallback: 'beta' });
await scenarioRun('unresponsive', async () => {
  const r = await launch('unresponsive', s5, { ROTARIS_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'hang then fall back', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '120000', ROTARIS_CAPTURE_AFTER_MS: '800' }, { timeout: 240_000 });
  const db = open(s5);
  const row = session(db);
  const list = names(db, row.session_id);
  const kinds = issues(db, row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete on the fallback: ${JSON.stringify(row)}`);
  const entry = list.find((t) => t.name === 'llm_unresponsive');
  expect(entry !== undefined && JSON.parse(entry.metadata).threshold_seconds === 30 && JSON.parse(entry.metadata).to_model === 'beta', `no llm_unresponsive entry: ${list.map((t) => t.name).join(',')}`);
  expect(kinds.some((i) => i.kind === 'llm_unresponsive'), 'no llm_unresponsive issue (REQ-ORCH-090)');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted-b/beta', `the calls did not move to the fallback: ${JSON.stringify(calls)}`);
  const at = /unresponsive-model timer .*?(\d+) ms|no model event .* within (\d+) s/.exec(r.log);
  results.unresponsive = { status: row.execution_status, fallback: JSON.parse(entry.metadata), calls, elapsedMs: r.elapsedMs, timerLine: at?.[0] ?? null, png: r.png };
});
const s5b = scenario('unresponsive-no-fallback', ['  llm_response_timeout: 30']);
await scenarioRun('unresponsive-no-fallback', async () => {
  const r = await launch('unresponsive-no-fallback', s5b, { ROTARIS_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'hang with nothing to fall back to', ROTARIS_CAPTURE_AFTER_MS: '36000' }, { timeout: 120_000 });
  const db = open(s5b);
  const row = session(db);
  const list = names(db, row.session_id).map((t) => t.name);
  db.close();
  expect(row.execution_status === 'running', `with no fallback the call should still be waiting at 36 s: ${JSON.stringify(row)}`);
  expect(!list.includes('llm_unresponsive'), 'a fallback fired although none is configured');
  expect(modelCalls(r.log).filter((c) => c.who === 'orchestrator').length === 1, 'a second call was made with no fallback');
  results.unresponsiveNoFallback = { status: row.execution_status, calls: modelCalls(r.log), png: r.png, elapsedMs: r.elapsedMs };
});

// 6. The hard child timeout: a child scripted `hang` under child_timeout 8 s and a role fallback is retried once on it (REQ-ORCH-088); without one it fails.
const childYaml = ['  child_timeout: 8', '  max_active_children: 2'];
const s6 = scenario('child-timeout', childYaml, { delegation: true, personas: ['personas:', '  coding-agent:', '    fallback_model: beta'] });
await scenarioRun('child-timeout', async () => {
  const r = await launch('child-timeout', s6, { ROTARIS_SCRIPT: 'delegate:coding-agent:helper,answer', ROTARIS_CHILD_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'delegate a hanging child', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '800' }, { timeout: 180_000 });
  const db = open(s6);
  const row = session(db);
  const list = names(db, row.session_id);
  const children = db.prepare('SELECT canonical_name, state, report FROM children WHERE session_id = ?').all(row.session_id);
  db.close();
  expect(row.execution_status === 'completed', `the run did not complete: ${JSON.stringify(row)}`);
  expect(children.length === 1 && children[0].state === 'succeeded', `the child did not succeed on the fallback: ${JSON.stringify(children)}`);
  const entry = list.find((t) => t.name === 'fallback_model');
  expect(entry !== undefined && JSON.parse(entry.metadata).timeout_seconds === 8 && JSON.parse(entry.metadata).to_model === 'beta', `no fallback_model entry: ${list.map((t) => t.name).join(',')}`);
  const childCalls = modelCalls(r.log).filter((c) => c.who === 'child');
  expect(childCalls[0]?.model === 'scripted/alpha' && childCalls[1]?.model === 'scripted-b/beta', `the child was not retried on beta: ${JSON.stringify(childCalls)}`);
  results.childTimeoutFallback = { child: children[0].state, fallback: JSON.parse(entry.metadata), childCalls, png: r.png, elapsedMs: r.elapsedMs };
});
const s6b = scenario('child-timeout-no-fallback', childYaml, { delegation: true });
await scenarioRun('child-timeout-no-fallback', async () => {
  const r = await launch('child-timeout-no-fallback', s6b, { ROTARIS_SCRIPT: 'delegate:coding-agent:helper,answer', ROTARIS_CHILD_SCRIPT: 'hang,answer', ROTARIS_CAPTURE_PROMPT: 'delegate a hanging child, no fallback', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: '90000', ROTARIS_CAPTURE_AFTER_MS: '800' }, { timeout: 180_000 });
  const db = open(s6b);
  const row = session(db);
  const list = names(db, row.session_id).map((t) => t.name);
  const children = db.prepare('SELECT canonical_name, state, report FROM children WHERE session_id = ?').all(row.session_id);
  const kinds = issues(db, row.session_id).map((i) => i.kind);
  db.close();
  expect(children.length === 1 && children[0].state === 'failed', `the child did not fail at the timeout: ${JSON.stringify(children)}`);
  const report = JSON.parse(children[0].report);
  expect(report.errors.some((e) => e.message === 'Child timed out after 8s'), `the report does not carry the timeout text: ${children[0].report}`);
  expect(kinds.includes('timeout') && !list.includes('fallback_model'), `the timeout issue or a spurious fallback: ${kinds.join(',')} / ${list.join(',')}`);
  results.childTimeoutNoFallback = { child: children[0].state, errors: report.errors.map((e) => e.message), status: row.execution_status, png: r.png, elapsedMs: r.elapsedMs };
});

// 7. The transient path unchanged (one retry after 1 s, transient_llm_error), and a 401 fails at once with no retry.
const s7 = scenario('transient', []);
await scenarioRun('transient', async () => {
  const r = await launch('transient', s7, { ROTARIS_SCRIPT: 'fail:503,answer', ROTARIS_CAPTURE_PROMPT: 'overloaded once', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
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
});
const s7b = scenario('fatal', []);
await scenarioRun('fatal', async () => {
  const r = await launch('fatal', s7b, { ROTARIS_SCRIPT: 'fail:401,answer', ROTARIS_CAPTURE_PROMPT: 'bad key', ROTARIS_CAPTURE_PROBE: '.notice-slot', ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_AFTER_MS: '800' });
  const db = open(s7b);
  const row = session(db);
  const kinds = issues(db, row.session_id).map((i) => i.kind);
  const events = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'result'").all(row.session_id).map((e) => JSON.parse(e.payload));
  db.close();
  expect(row.execution_status === 'failed', `a 401 did not fail the run at once: ${JSON.stringify(row)}`);
  expect(!kinds.includes('transient_llm_error') && !kinds.includes('model_wait'), `a 401 was retried or waited: ${kinds.join(',')}`);
  expect(modelCalls(r.log).filter((c) => c.who === 'orchestrator').length === 1, 'a 401 was retried');
  const error = events[0]?.result?.error ?? null;
  expect(typeof error === 'string' && /HTTP 401/.test(error), `the result does not carry the 401: ${JSON.stringify(events[0])}`);
  // The notice is asserted as the 401's OWN, not merely as "not a limit": it carries the run's failure text as its
  // detail (REQ-NOTIFY-064, REQ-NOTIFY-065) and is dismissable. "Not a limit" alone was satisfied by a background
  // project setup's notice standing in the one slot (REQ-NOTIFY-024;
  // `docs/defects/fixed/resilience-proofs-cancel-scenario-reads-a-failed-project-setup-in-place-of-the-limit-notice.md`).
  const notice = probes(r.log, 'probe').find((p) => p.selector === '.notice-slot')?.found[0];
  expect(notice !== undefined && notice.text.includes(error) && /Dismiss/.test(notice.text), `the 401's own notice is not the one on screen: ${JSON.stringify(notice)}`);
  expect(!/provider limit was reached/.test(notice.text), `a 401 was reported as a provider limit: ${JSON.stringify(notice)}`);
  results.fatal = { status: row.execution_status, error, notice: notice.text, png: r.png, elapsedMs: r.elapsedMs };
});

writeFileSync(join(output, 'results.json'), `${JSON.stringify({ ...results, ...(only === null ? {} : { only }), failures }, null, 2)}\n`);
console.log(JSON.stringify({ ...results, ...(only === null ? {} : { only }), failures }, null, 2));
if (failures.length > 0) {
  console.error(`resilience-proof: ${failures.length} scenario(s) failed: ${failures.map((f) => f.scenario).join(', ')}`);
  process.exitCode = 1;
}
