import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv } from './lib/harness.mjs';
import { logTail, overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { startApp, stopApp, stopOverrunMessage, until } from './lib/driver.mjs';
import { backgroundSetupStarted, SETUP_ANSWERED } from './lib/initialization-marker.mjs';

/**
 * Part Q's first execution in the built app: the model resilience paths against the scripted client's fault steps
 * (REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..093/263), and since OQ-173 that a wait the run imposes is not a stall
 * (REQ-MONITOR-117..119), and since OQ-177 that an entry switch after a ladder move applies as its row says (REQ-MONITOR-142).
 * Seventeen scenarios (since 2026-10-02 the authentication class's: `fatal` and `reauth` the recovery dialog's, `generic`
 * REQ-NOTIFY-064's notice, `auth-fallback` the first failure's automatic fallback and its re-authentication prompt,
 * `auth-fallback-dialog` the two together, `auth-fallback-revise` a failed revise cycle restarted as the same revise), each
 * asserting the store's events, issues,
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
    `  alpha: { provider: ${opts.alphaProvider ?? 'scripted'}, model_id: alpha }`,
    '  beta: { provider: scripted-b, model_id: beta }',
    ...(opts.models ?? []),
    ...['small_model', 'medium_model', 'large_model'].map((slot) => `${slot}: ${opts.tier ?? 'alpha'}`),
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
 * the design system's `SearchableSelect`, by two real clicks, its rows read between them (`override-picker.png`; the pair
 * held out of quota listed with its reason, REQ-MONITOR-194/303) — then the run waited for in the store. Its first form
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
        // REQ-MONITOR-194 / REQ-MONITOR-303: the chooser opened and read before a model is chosen — every row's value and its
        // words, the pair held out of quota (alpha, the waiting one) annotated with the reason and still listed.
        await step('the chooser opened', d.click('.wait-header button[aria-label="Change model"]'));
        await step('the chooser\'s rows', d.waitFor('[role="option"][data-value="alpha"]'));
        const picker = await step('the chooser read', d.eval(`[...document.querySelectorAll('[role="listbox"][aria-label="Change model"] [role="option"]')].map((o) => ({ value: o.dataset.value, text: o.textContent, disabled: o.getAttribute('aria-disabled') }))`));
        await step('the chooser picture', d.screenshot(join(output, 'override-picker.png')));
        await step('the chooser → beta', d.click('[role="option"][data-value="beta"]'));
        const chosen = { kind: 'design-system', value: 'beta' };
        const settled = await step('the run settled', until(() => { const db = open(s); try { return session(db); } finally { db.close(); } }, (row) => row !== undefined && SETTLED.has(row.execution_status), { timeoutMs: 90_000, what: 'the session settling', signal: giveUp.signal }));
        // EVIDENCE, not an assertion: the header's absence once the run has settled.
        const after = await step('the header after the change', d.probe('.wait-header'));
        // REQ-CHAT-006 / REQ-SESSION-026: the composer's model chip names what the next run starts with — the override, beta.
        const chip = await step('the model chip after the change', until(() => d.eval(`document.querySelector('[data-testid="chip-model"]')?.textContent ?? null`), (t) => typeof t === 'string' && t.includes('beta'), { timeoutMs: 15_000, what: 'the model chip naming beta', signal: giveUp.signal }).catch(async () => d.eval(`document.querySelector('[data-testid="chip-model"]')?.textContent ?? null`)));
        return { during, picker, chosen, settled, after, chip };
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

// 3b. OQ-177 (REQ-MONITOR-142 over REQ-ORCH-091 b): after the same-tier move the user switches the entry model back to the
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
  // REQ-MONITOR-194 / REQ-MONITOR-303: alpha, the pair the 'quota' answer put out of quota, is listed with the reason and choosable; beta is not annotated.
  const pickerRow = (v) => r.value.picker.find((o) => o.value === v);
  expect(pickerRow('alpha') !== undefined && pickerRow('alpha').text.includes('provider reported insufficient quota in this session') && pickerRow('alpha').disabled !== 'true', `the excluded pair is not listed with its reason: ${JSON.stringify(r.value.picker)}`);
  expect(pickerRow('beta') !== undefined && !pickerRow('beta').text.includes('insufficient quota'), `beta is annotated as out of quota: ${JSON.stringify(r.value.picker)}`);
  expect(!list.some((t) => t.name === 'quota_fallback_model'), 'a same-tier fallback happened with no candidate');
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
  expect(calls.map((c) => c.model).join(',') === 'scripted/alpha,scripted-b/beta', `the run did not resume on beta: ${JSON.stringify(calls)}`);
  // REQ-CHAT-006 / REQ-SESSION-026: the next run starts on the override, and the chip says so (it read alpha until 2026-10-02:
  // the-model-chips-show-the-configured-model-while-a-session-wide-override-is-in-force.md).
  expect(typeof r.value.chip === 'string' && r.value.chip.includes('beta') && !r.value.chip.includes('alpha'), `the model chip reads ${JSON.stringify(r.value.chip)} with beta in force`);
  results.override = { status: row.execution_status, headerDuringWait: header.text, chooser: r.value.chosen.kind, picker: r.value.picker, modelChip: r.value.chip, override: JSON.parse(override.metadata), calls, headerAfterChange: r.value.after.length, png: r.png, elapsedMs: r.elapsedMs };
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
/**
 * A DRIVEN launch, bounded as `drivenOverride` is (its steps by `boundMs`, its ending by `stopApp`), for the scenarios whose
 * subject is a window the capture seams cannot reach — the authentication recovery dialog (REQ-NOTIFY-072), which is its
 * own modal window. `body(d, step, giveUp)` runs the steps; each lands in `<name>.steps.json`. It fails as `launch` fails.
 */
async function drivenLaunch(name, s, extra, body, { boundMs = 240_000 } = {}) {
  const png = join(output, `${name}.png`);
  rmSync(join(s.root, 'app.log'), { force: true });
  const trail = [];
  const started = Date.now();
  const launched = await startApp({ root: s.root, workspace: s.workspace, timeoutMs: 60_000, extra })
    .catch((cause) => { throw new Error(`${name}: ${cause instanceof Error ? cause.message : String(cause)}`); });
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
  const giveUp = new AbortController();
  let value;
  let failure = null;
  let bound;
  try {
    value = await Promise.race([
      body(launched.driver, step, giveUp.signal),
      new Promise((_, reject) => { bound = setTimeout(() => reject(new Error(`the steps did not finish within ${boundMs} ms`)), boundMs); }),
    ]);
  } catch (cause) {
    failure = cause;
  } finally {
    clearTimeout(bound);
    giveUp.abort(new Error(`the ${name} launch was given up`));
  }
  await launched.driver.useWindow().catch(() => undefined);
  const stopped = await stopApp(launched, { screenshot: png });
  const log = existsSync(launched.logFile) ? readFileSync(launched.logFile, 'utf8') : '';
  writeFileSync(join(output, `${name}.log`), log);
  writeFileSync(join(output, `${name}.steps.json`), `${JSON.stringify(trail, null, 2)}\n`);
  const problems = [];
  if (failure) problems.push(`${name}: ${failure.message} (see ${name}.steps.json)`);
  if (backgroundSetupStarted(log)) problems.push(`${name}: the workspace's initialization started code-intelligence-setup in the background, so its notice may stand in the notice slot`);
  if (stopped.overran) problems.push(stopOverrunMessage(name, stopped, log).split('\n--- ')[0]);
  else if (stopped.exit.code !== 0) problems.push(`${name} exited ${stopped.exit.code ?? stopped.exit.signal} on the driver's quit`);
  if (problems.length > 0) throw new Error(`${problems.join('; ')}\n--- the launch's last words ---\n${logTail(log)}\n(see ${name}.log)`);
  return { log, png, value, elapsedMs: Date.now() - started };
}

/** The session's newest row, polled until it has settled. */
const settled = (s, signal, what) => until(() => { const db = open(s); try { return session(db); } finally { db.close(); } }, (row) => row !== undefined && SETTLED.has(row.execution_status), { timeoutMs: 90_000, what, signal });
/** The recovery dialog as the driver reads it in its own window: title, error, the listed models, Retry's state, and its geometry. */
const RECOVERY_READING = `(() => {
  const q = (s) => document.querySelector(s);
  const error = q('[data-testid="auth-recovery-error"]');
  const probe = document.createElement('span');
  probe.style.color = 'var(--rt-danger-300)';
  document.body.append(probe);
  const failureColour = getComputedStyle(probe).color;
  probe.remove();
  return {
    title: q('[data-testid="auth-recovery-title"]')?.textContent ?? null,
    role: q('[data-testid="auth-recovery"]')?.getAttribute('role') ?? null,
    modal: q('[data-testid="auth-recovery"]')?.getAttribute('aria-modal') ?? null,
    error: error?.textContent ?? null,
    errorColour: error ? getComputedStyle(error).color : null,
    failureColour,
    models: [...document.querySelectorAll('[data-testid="auth-recovery-models"] [role="radio"]')].map((b) => ({ key: b.getAttribute('data-value'), provider: b.getAttribute('data-provider'), label: b.textContent, checked: b.getAttribute('aria-checked') })),
    empty: q('[data-testid="auth-recovery-empty"]')?.textContent ?? null,
    retryDisabled: q('[data-action="retry"]')?.disabled ?? null,
    width: window.innerWidth,
  };
})()`;
const recoveryWindows = async (d) => ((await d.windows()).auxiliary ?? []).filter((w) => w.role === 'auth-recovery');

// 8. REQ-NOTIFY-060/067/068/072..075/079/080 (the 401 note's part C): a 401 with no usable fallback (none configured, so
// `fallback_model` resolves to `small_model`, alpha, the model that failed) is never retried, and opens the 560 px modal
// recovery dialog over the session beside the authentication class's notice. Cancel closes it and nothing else (the run stays
// failed, its notice stays). A second prompt fails again and reopens it; beta, from another provider, is chosen and the run
// restarts on it; beta's provider refuses too (`fail:401:only=scripted+scripted-b`), which reopens the dialog naming beta
// (REQ-NOTIFY-075) and offering neither beta nor alpha — both failed authentication with the credentials their providers
// still hold (REQ-NOTIFY-068); gpt-4o, a shipped model on a third provider, is chosen and the run completes on it. Driven,
// because the dialog is its own window (`drivenLaunch`).
const s7b = scenario('fatal', []);
await scenarioRun('fatal', async () => {
  const r = await drivenLaunch('fatal', s7b, { ROTARIS_SCRIPT: 'fail:401:only=scripted+scripted-b' }, async (d, step, signal) => {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    // The first-launch notice (REQ-WORKSPACE-152 (3)) is raised 800 ms after the workspace opens, into the ONE slot this
    // scenario reads (REQ-NOTIFY-024): it is waited for first, so it cannot replace the failure's notice afterwards.
    await step('the first-launch notice', until(() => d.probe('.notice-slot'), (found) => Array.isArray(found) && /No model provider is authenticated yet/.test(found[0]?.text ?? ''), { timeoutMs: 30_000, what: 'the first-launch notice', signal }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus', signal }));
    await step('the prompt', d.type('bad key', { enter: true }));
    const failedOnce = await step('the run failed', settled(s7b, signal, 'the first run failing'));
    await step('the recovery dialog', until(() => recoveryWindows(d), (w) => w.length === 1 && w[0].visible, { timeoutMs: 30_000, what: 'the recovery window', signal }));
    await step('the dialog drawn', d.waitFor('[data-testid="auth-recovery-models"]', { window: 'auth-recovery', timeoutMs: 30_000 }));
    const first = await step('the dialog read', d.send('eval', { expression: RECOVERY_READING, window: 'auth-recovery' }));
    await step('the dialog picture', d.send('screenshot', { path: join(output, 'fatal-dialog.png'), window: 'auth-recovery' }));
    const noticeWhileOpen = await step('the notice beside it', until(() => d.probe('.notice-slot'), (found) => Array.isArray(found) && /Authentication failed/.test(found[0]?.text ?? ''), { timeoutMs: 15_000, what: 'the authentication notice', signal }));
    await step('Cancel', d.click('[data-action="cancel"]', { window: 'auth-recovery' }));
    await step('the dialog closed', until(() => recoveryWindows(d), (w) => w.length === 0, { timeoutMs: 15_000, what: 'the recovery window closing', signal }));
    const afterCancel = { row: await step('the run after Cancel', settled(s7b, signal, 'the run after Cancel')), notice: await step('the notice after Cancel', d.probe('.notice-slot')) };
    // A second failure of the session reopens the dialog (REQ-NOTIFY-072's "a second authentication failure").
    await step('Ctrl+L again', d.chord('Ctrl+L'));
    await step('the caret back in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus again', signal }));
    await step('the second prompt', d.type('bad key again', { enter: true }));
    await step('the second dialog', until(() => recoveryWindows(d), (w) => w.length === 1 && w[0].visible, { timeoutMs: 60_000, what: 'the recovery window reopening', signal }));
    await step('the second dialog drawn', d.waitFor('[data-testid="auth-recovery-models"]', { window: 'auth-recovery', timeoutMs: 30_000 }));
    await step('beta', d.click('[role="radio"][data-value="beta"]', { window: 'auth-recovery' }));
    await step('Retry on beta', d.click('[data-action="retry"]', { window: 'auth-recovery' }));
    // beta fails too: the dialog reopens, naming beta (REQ-NOTIFY-075), at most one open (REQ-NOTIFY-079).
    await step('the third dialog', until(async () => { const w = await recoveryWindows(d); if (w.length !== 1) return null; const read = await d.send('eval', { expression: RECOVERY_READING, window: 'auth-recovery' }).catch(() => null); return read; }, (read) => read !== null && read.title === 'Authentication failed for beta', { timeoutMs: 60_000, what: 'the dialog naming beta', signal }));
    const third = await step('the third dialog read', d.send('eval', { expression: RECOVERY_READING, window: 'auth-recovery' }));
    await step('gpt-4o', d.click('[role="radio"][data-value="gpt-4o"]', { window: 'auth-recovery' }));
    await step('Retry on gpt-4o', d.click('[data-action="retry"]', { window: 'auth-recovery' }));
    const done = await step('the run completed', until(() => { const db = open(s7b); try { return session(db); } finally { db.close(); } }, (row) => row?.execution_status === 'completed', { timeoutMs: 90_000, what: 'the restarted run completing', signal }));
    const closedAtEnd = await step('no dialog at the end', recoveryWindows(d));
    return { failedOnce, first, noticeWhileOpen, afterCancel, third, done, closedAtEnd };
  });
  const db = open(s7b);
  const row = session(db);
  const kinds = issues(db, row.session_id).map((i) => i.kind);
  const overrides = names(db, row.session_id).filter((t) => t.name === 'model_override').map((t) => JSON.parse(t.metadata));
  const events = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'result'").all(row.session_id).map((e) => JSON.parse(e.payload));
  db.close();
  const v = r.value;
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator').map((c) => c.model);
  // REQ-NOTIFY-068: a 401 is never retried against the same provider with the same credentials.
  expect(v.failedOnce.execution_status === 'failed', `a 401 did not fail the run at once: ${JSON.stringify(v.failedOnce)}`);
  expect(!kinds.includes('transient_llm_error') && !kinds.includes('model_wait'), `a 401 was retried or waited: ${kinds.join(',')}`);
  expect(JSON.stringify(calls) === JSON.stringify(['scripted/alpha', 'scripted/alpha', 'scripted-b/beta', 'openai/gpt-4o']), `the calls are not one per run, on the model each run was given: ${JSON.stringify(calls)}`);
  const error = events[0]?.result?.error ?? null;
  expect(typeof error === 'string' && /HTTP 401/.test(error), `the result does not carry the 401: ${JSON.stringify(events[0])}`);
  // REQ-NOTIFY-070 ahead of REQ-NOTIFY-072: the automatic fallback was asked first and found none usable — `fallback_model`
  // is unset, so it resolves to small_model (REQ-CONFIG-067), alpha, the model that failed — so the dialog's case.
  expect(/authentication recovery: session \S+ has no usable fallback \(.*fallback model .*is the model that failed/.test(r.log), `the automatic fallback was not asked first, or did not find "no usable fallback": see fatal.log`);
  expect(!/re-authentication prompt opened/.test(r.log), 'a re-authentication prompt opened although no restart happened');
  // REQ-NOTIFY-072/073/074: the modal dialog, 560 px wide, titled for the failed model, the error in the failure colour, beta listed.
  expect(v.first.role === 'alertdialog' && v.first.modal === 'true' && v.first.title === 'Authentication failed for alpha', `the dialog is not titled for alpha: ${JSON.stringify(v.first)}`);
  expect(v.first.width === 560, `the dialog is not 560 px wide: ${v.first.width}`);
  expect(v.first.error === error.replace(/\s+/g, ' ').trim().slice(0, 320) + (error.replace(/\s+/g, ' ').trim().length > 320 ? '…' : ''), `the dialog does not reproduce the provider's error: ${JSON.stringify(v.first.error)} vs ${JSON.stringify(error)}`);
  expect(v.first.errorColour === v.first.failureColour, `the error is not drawn in the failure text colour: ${v.first.errorColour} vs ${v.first.failureColour}`);
  // Every configured model a restart could reach is listed but alpha; here each is on a provider other than alpha's, so the
  // ordering's second half (alpha's provider's others) is empty, and that half is the unit test's (`auth-recovery.test.ts`).
  const firstKeys = v.first.models.map((m) => m.key);
  expect(!firstKeys.includes('alpha') && firstKeys.includes('beta') && firstKeys.includes('gpt-4o') && v.first.models.every((m) => m.provider !== 'scripted'), `the dialog does not list the other providers' models, and only those: ${JSON.stringify(v.first.models)}`);
  expect(v.first.models.find((m) => m.key === 'beta')?.label === 'beta · scripted-b' && v.first.models[0].checked === 'true' && v.first.retryDisabled === false, `the models are not labelled with their providers, or none is chosen: ${JSON.stringify(v.first.models)}`);
  // The authentication class's notice stands beside the dialog: its own title, the failure text as detail, the workspace action.
  const notice = v.noticeWhileOpen.find(Boolean);
  expect(notice !== undefined && /Authentication failed/.test(notice.text) && notice.text.includes(error) && /Dismiss/.test(notice.text) && /Back to the workspace/.test(notice.text), `the authentication notice is not on screen: ${JSON.stringify(notice)}`);
  // REQ-NOTIFY-080: Cancel closed the dialog and did nothing else.
  expect(v.afterCancel.row.execution_status === 'failed' && v.afterCancel.row.session_id === v.failedOnce.session_id, `the run did not stay failed after Cancel: ${JSON.stringify(v.afterCancel.row)}`);
  expect(v.afterCancel.notice.find(Boolean)?.text === notice.text, `the notice did not stay on screen after Cancel: ${JSON.stringify(v.afterCancel.notice)}`);
  // REQ-NOTIFY-075: the hand-chosen beta failed too, and the dialog came back naming beta. REQ-NOTIFY-068: neither beta nor
  // alpha is listed — each failed authentication with the credentials its provider still holds — so gpt-4o is what is left.
  const thirdKeys = v.third.models.map((m) => m.key);
  expect(!thirdKeys.includes('beta') && !thirdKeys.includes('alpha') && thirdKeys.includes('gpt-4o'), `the reopened dialog offers a pair that already failed authentication, or not gpt-4o: ${JSON.stringify(v.third)}`);
  expect(v.done.execution_status === 'completed' && v.closedAtEnd.length === 0, `the run did not complete on gpt-4o, or a dialog stayed: ${JSON.stringify(v.done)} / ${JSON.stringify(v.closedAtEnd)}`);
  // REQ-SESSION-026: the pins are recorded, each keyed by the pair that failed.
  expect(overrides.some((o) => o.provider === 'scripted' && o.model === 'alpha' && o.model_key === 'beta' && o.cause === 'authentication')
    && overrides.some((o) => o.provider === 'scripted-b' && o.model === 'beta' && o.model_key === 'gpt-4o' && o.cause === 'authentication'), `the pins are not recorded: ${JSON.stringify(overrides)}`);
  results.fatal = { status: row.execution_status, error, dialog: v.first, notice: notice.text, afterCancel: v.afterCancel.row.execution_status, reopenedFor: v.third.title, calls, overrides, png: join(output, 'fatal-dialog.png'), elapsedMs: r.elapsedMs };
});

// 9. REQ-NOTIFY-076/077/202 (the 401 note's part D): the dialog's re-authenticate path. The entry model `gamma` signs in
// through an OpenAI-compatible instance (`openai-compatible--proof`) whose catalog is a loopback stand-in answering any
// non-empty bearer; the instance is signed in through the product's own `provider.signIn` with `stale-key`. The scripted
// model refuses every call not carrying `fresh-key` (`fail:401:unless-key=fresh-key`), so the run fails, the dialog opens
// with the masked key field, `fresh-key` is typed and saved — validated against the catalog, then stored — and the run
// restarts on the same model with the new key and completes. The stand-in records only whether each bearer was the fixture.
const catalogSeen = [];
const catalog = createServer((req, res) => {
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  catalogSeen.push({ path: req.url, bearer: bearer === 'stale-key' ? 'stale-key' : bearer === 'fresh-key' ? 'fresh-key' : bearer === '' ? 'none' : 'other' });
  if (req.method === 'GET' && /\/models$/.test(req.url ?? '') && bearer !== '') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'gamma' }] })); return; }
  res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":{"message":"Incorrect API key provided"}}');
});
await new Promise((resolve) => catalog.listen(0, '127.0.0.1', resolve));
const catalogBase = `http://127.0.0.1:${catalog.address().port}/v1`;
const s9 = scenario('reauth', [], { models: [`  gamma: { provider: openai-compatible, model_id: gamma, auth_provider: openai-compatible--proof, base_url: ${catalogBase} }`], tier: 'gamma' });
await scenarioRun('reauth', async () => {
  const r = await drivenLaunch('reauth', s9, { ROTARIS_SCRIPT: 'fail:401:unless-key=fresh-key' }, async (d, step, signal) => {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    await step('the first-launch notice', until(() => d.probe('.notice-slot'), (found) => Array.isArray(found) && /No model provider is authenticated yet/.test(found[0]?.text ?? ''), { timeoutMs: 30_000, what: 'the first-launch notice', signal }));
    const signedIn = await step('the instance signed in with stale-key', d.command({ kind: 'provider.signIn', providerId: 'openai-compatible', label: 'Proof', baseUrl: catalogBase, apiKey: 'stale-key' }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus', signal }));
    await step('the prompt', d.type('stale key', { enter: true }));
    const failed = await step('the run failed', settled(s9, signal, 'the first run failing'));
    await step('the recovery dialog', until(() => recoveryWindows(d), (w) => w.length === 1 && w[0].visible, { timeoutMs: 30_000, what: 'the recovery window', signal }));
    await step('the key field drawn', d.waitFor('[data-testid="auth-recovery-key"]', { window: 'auth-recovery', timeoutMs: 30_000 }));
    const READ = `(() => ({ title: document.querySelector('[data-testid="auth-recovery-title"]')?.textContent ?? null, method: document.querySelector('[data-testid="auth-recovery-reauth"]')?.getAttribute('data-method') ?? null, message: document.querySelector('[data-testid="auth-recovery-reauth-message"]')?.textContent ?? null, inputType: document.querySelector('[data-testid="auth-recovery-key"]')?.getAttribute('type') ?? null, saveDisabled: document.querySelector('[data-action="save-and-retry"]')?.disabled ?? null, text: document.body.textContent }))()`;
    const blank = await step('the path read blank', d.send('eval', { expression: READ, window: 'auth-recovery' }));
    await step('the key field focused', d.click('[data-testid="auth-recovery-key"]', { window: 'auth-recovery' }));
    await step('fresh-key typed', d.type('fresh-key', { window: 'auth-recovery' }));
    const typed = await step('the path read typed', until(() => d.send('eval', { expression: READ, window: 'auth-recovery' }), (v) => v?.saveDisabled === false, { timeoutMs: 10_000, what: 'Save and retry enabled', signal }));
    await step('the re-authenticate picture', d.send('screenshot', { path: join(output, 'reauth-dialog.png'), window: 'auth-recovery' }));
    await step('Save and retry', d.click('[data-action="save-and-retry"]', { window: 'auth-recovery' }));
    const done = await step('the run completed', until(() => { const db = open(s9); try { return session(db); } finally { db.close(); } }, (row) => row?.execution_status === 'completed', { timeoutMs: 90_000, what: 'the restarted run completing', signal }));
    const closedAtEnd = await step('no dialog at the end', recoveryWindows(d));
    return { signedIn, failed, blank, typed, done, closedAtEnd };
  });
  const db = open(s9);
  const row = session(db);
  const overrides = names(db, row.session_id).filter((t) => t.name === 'model_override');
  const rows = systemRows(db, row.session_id);
  db.close();
  const v = r.value;
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator').map((c) => c.model);
  expect(v.signedIn?.value?.outcome === 'signed-in' && v.signedIn.value.id === 'openai-compatible--proof', `the instance did not sign in: ${JSON.stringify(v.signedIn)}`);
  expect(v.failed.execution_status === 'failed', `the stale key did not fail the run: ${JSON.stringify(v.failed)}`);
  // REQ-NOTIFY-076: the provider that failed is key-based, so the dialog offers a masked field, Save and retry enabled only while it is non-blank.
  expect(v.blank.title === 'Authentication failed for gamma' && v.blank.method === 'api-key' && v.blank.inputType === 'password' && v.blank.saveDisabled === true, `the key path is not offered as REQ-NOTIFY-076 says: ${JSON.stringify({ ...v.blank, text: undefined })}`);
  expect(v.typed.saveDisabled === false, 'Save and retry stayed disabled with a key typed');
  expect(!/terminal|shell|command line/i.test(v.blank.text ?? ''), `the dialog directs the user to a terminal: ${v.blank.text}`);
  // REQ-NOTIFY-202: the new key was validated against the catalog before it was saved, and the restarted run carried it.
  expect(catalogSeen.some((c) => c.bearer === 'stale-key') && catalogSeen.some((c) => c.bearer === 'fresh-key'), `the catalog did not see the sign-in and the re-authentication: ${JSON.stringify(catalogSeen)}`);
  expect(v.done.execution_status === 'completed' && v.closedAtEnd.length === 0, `the run did not complete after the re-authentication, or the dialog stayed: ${JSON.stringify(v.done)}`);
  expect(JSON.stringify(calls) === JSON.stringify(['openai-compatible/gamma', 'openai-compatible/gamma']), `the restart was not on the same model: ${JSON.stringify(calls)}`);
  expect(overrides.length === 0, `a re-authentication pinned a model: ${JSON.stringify(overrides)}`);
  expect(rows.some((b) => b.startsWith('Re-authenticated after the authentication failure')), `no row says the run restarted after the re-authentication: ${rows.join(' | ')}`);
  // REQ-PROVIDER-131: the key typed into the dialog reaches no log line.
  expect(!r.log.split('\n').filter((l) => !l.includes('ROTARIS_SCRIPT')).some((l) => l.includes('fresh-key')), 'the new key reached the application log');
  results.reauth = { status: row.execution_status, dialog: { ...v.blank, text: undefined }, catalogSeen, calls, png: join(output, 'reauth-dialog.png'), elapsedMs: r.elapsedMs };
});
catalog.close();

// 10. REQ-NOTIFY-060/064/065: a failure matching no earlier class — the scripted `fail` step, an HTTP 400 carrying no
// authentication or limit marker — raises the generic error notice: the run failed, the session and the draft were kept,
// the failure text as copyable detail, persistent, scoped to the session, and the action returning to the workspace view,
// which is followed from another view. No recovery dialog opens. Driven, as `fatal` is, so the session is the one on screen
// (REQ-NOTIFY-032 holds a failure of a session no window follows; `run-failure-notice.test.ts` pins that half).
const s10 = scenario('generic', []);
await scenarioRun('generic', async () => {
  const NOTICE = `(() => { const n = document.querySelector('.notice-slot [data-testid="notice"]'); return n === null ? null : { severity: n.getAttribute('data-severity'), session: n.getAttribute('data-session'), title: n.querySelector('[data-testid="notice-title"]')?.textContent ?? null, message: n.querySelector('[data-testid="notice-message"]')?.textContent ?? null, detail: n.querySelector('[data-testid="notice-detail"]')?.textContent ?? null, action: n.querySelector('.notice__action')?.textContent ?? null, actionKind: n.querySelector('.notice__action')?.getAttribute('data-action') ?? null, dismiss: n.querySelector('.notice__dismiss') !== null }; })()`;
  const VIEW = `document.querySelector('.app-shell')?.getAttribute('data-view') ?? null`;
  const r = await drivenLaunch('generic', s10, { ROTARIS_SCRIPT: 'fail' }, async (d, step, signal) => {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    await step('the first-launch notice', until(() => d.probe('.notice-slot'), (found) => Array.isArray(found) && /No model provider is authenticated yet/.test(found[0]?.text ?? ''), { timeoutMs: 30_000, what: 'the first-launch notice', signal }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus', signal }));
    await step('the prompt', d.type('a request the provider rejects', { enter: true }));
    const failed = await step('the run failed', settled(s10, signal, 'the run failing'));
    const notice = await step('the generic notice', until(() => d.eval(NOTICE), (n) => n !== null && n.title === 'The run failed', { timeoutMs: 30_000, what: 'the generic failure notice', signal }));
    const windows = await step('no recovery window', recoveryWindows(d));
    await step('Ctrl+1', d.chord('Ctrl+1'));
    const away = await step('another view', until(() => d.eval(VIEW), (v) => v !== null && v !== 'workspace', { timeoutMs: 10_000, what: 'a view other than the workspace', signal }));
    await step('Back to the workspace', d.click('.notice-slot .notice__action'));
    const back = await step('the workspace view', until(() => d.eval(VIEW), (v) => v === 'workspace', { timeoutMs: 10_000, what: 'the workspace view after the action', signal }));
    return { failed, notice, windows, away, back };
  });
  const db = open(s10);
  const row = session(db);
  const events = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'result'").all(row.session_id).map((e) => JSON.parse(e.payload));
  db.close();
  const v = r.value;
  const error = events[0]?.result?.error ?? null;
  expect(v.failed.execution_status === 'failed' && typeof error === 'string' && /HTTP 400/.test(error), `the run did not fail on the 400: ${JSON.stringify(v.failed)} / ${JSON.stringify(events[0])}`);
  // REQ-NOTIFY-064/065: severity error, the two statements, the failure text exactly as detail, persistent, the workspace action.
  expect(v.notice.severity === 'error' && v.notice.title === 'The run failed' && v.notice.message === 'The session and the draft were kept.', `the generic notice does not say the run failed and the session and the draft were kept: ${JSON.stringify(v.notice)}`);
  expect(v.notice.detail === error, `the generic notice does not carry the failure text as detail: ${JSON.stringify(v.notice.detail)} vs ${JSON.stringify(error)}`);
  expect(v.notice.dismiss === true && v.notice.session === row.session_id, `the generic notice is not persistent or not scoped to the session: ${JSON.stringify(v.notice)}`);
  expect(v.notice.action === 'Back to the workspace' && v.notice.actionKind === 'open-view' && v.back === 'workspace' && v.away !== 'workspace', `the action does not return to the workspace view: ${JSON.stringify({ notice: v.notice, away: v.away, back: v.back })}`);
  expect(v.windows.length === 0, `a recovery dialog opened for a failure that is not an authentication failure: ${JSON.stringify(v.windows)}`);
  results.generic = { status: row.execution_status, error, notice: v.notice, away: v.away, back: v.back, elapsedMs: r.elapsedMs };
});

// 11. `auth-fallback` — REQ-NOTIFY-070 / REQ-MONITOR-147 / REQ-SESSION-026: a first 401 with `fallback_model: beta` configured pins beta as the
// session's model override (keyed by the pair that failed), acknowledges both models, and restarts the run with the same
// prompt on beta, which answers. The acknowledgement is transient (REQ-NOTIFY-020's lifetime), so the wait expression
// writes its text onto the body the moment it is drawn and the probe reads it back from there.
//
// Two launches, because the prompt's placement is a question of size: the window as it opens on this host (1600x1000,
// alpha on `scripted`, which no credential store holds, so the shortest prompt — no key field) and REQ-SHELL-022's
// 1000x680 minimum with alpha on `deepseek`, an API-key provider, so the prompt carries its key field and hint, and is
// taller by them. The second form of the placement (absolute in the rail-and-view region) passed the first launch
// and covered the run header's switches and the composer's submit at the second (the verifier's probe, 2026-10-02).
//
// A third launch in plan mode (`runtime.run_start_mode: plan`, REQ-ORCH-152/153): the 401 is the plan cycle's turn, which
// recorded no failed model, so the session was never restarted on the fallback and the generic notice was published
// (the verifier's reproduction, 2026-10-02). Restarted, the cycle runs again on beta and parks at the gate, EXPANDED beside
// the open prompt at the minimum size — where the prompt, sized before the gate's flexible row, had left the gate 42 px and
// its three answers unreachable. Each gate answer and each prompt control must be the element under its own centre, the
// prompt drawn as its bar (its words not drawn), and the plan the largest part of the gate (PD-ORCH-002 revision 2).
const authVariants = [
  { name: 'auth-fallback', provider: 'scripted', method: 'none', resize: null, plan: false },
  { name: 'auth-fallback-minimum', provider: 'deepseek', method: 'api-key', resize: '1000x680', plan: false },
  { name: 'auth-fallback-plan', provider: 'deepseek', method: 'api-key', resize: '1000x680', plan: true },
];
await scenarioRun('auth-fallback', async () => {
  // REQ-NOTIFY-071 / ADR-0048: with the prompt open the composer is still the element under its own centre, takes the
  // focus and is enabled — the prompt traps nothing and covers nothing it leaves usable. Written onto the body for the probe.
  const composerUsable = "(() => { const ta = document.querySelector('textarea.composer__input'); if (!ta) return false; const r = ta.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); ta.focus(); document.body.dataset.composerUsable = [hit === ta || ta.contains(hit) || (hit !== null && hit.closest('.slash-field') !== null), document.activeElement === ta, !ta.disabled, !(document.querySelector('[data-testid=\"reauth-prompt\"]')?.hasAttribute('aria-modal') ?? true)].join(':'); return true; })()";
  // ADR-0048 again: the prompt stays open until answered, so it may overlay NO control — not the window's own (every
  // title-bar and notice-slot button is the element under its own centre, `chromeUsable`), and not the view's: every
  // control in the window that is on screen and outside the prompt is tested at its centre, and `underPrompt` lists those
  // whose centre is the prompt's — it must be empty. The prompt's own controls are tested the same way (`promptControls`):
  // its answers never scroll away, whatever the size. `size` and `promptRect` say what was measured.
  const chromeUsable = "(() => { const p = document.querySelector('[data-testid=\"reauth-prompt\"]'); if (p === null) return false; const label = (b) => (b.getAttribute('aria-label') || b.textContent || b.title || b.getAttribute('data-testid') || b.tagName).trim().slice(0, 60); const centre = (b) => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }; const centreHit = (b) => { const c = centre(b); const hit = document.elementFromPoint(c.x, c.y); return hit === b || b.contains(hit) ? 'ok' : (p.contains(hit) ? 'UNDER-PROMPT' : 'covered'); }; const onScreen = (b) => { const c = centre(b); return c.w > 0 && c.h > 0 && c.x >= 0 && c.y >= 0 && c.x < innerWidth && c.y < innerHeight; }; const chrome = [...document.querySelectorAll('.title-bar button, .notice-slot button')]; const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], [role=\"separator\"][tabindex], [tabindex]:not([tabindex=\"-1\"])')].filter(onScreen); document.body.dataset.chromeUsable = chrome.map((b) => label(b) + '=' + centreHit(b)).join('|'); document.body.dataset.underPrompt = controls.filter((b) => !p.contains(b) && centreHit(b) === 'UNDER-PROMPT').map(label).join('|'); document.body.dataset.outsideControls = String(controls.filter((b) => !p.contains(b)).length); document.body.dataset.promptControls = [...p.querySelectorAll('button, input')].map((b) => label(b) + '=' + (onScreen(b) ? centreHit(b) : 'off-screen')).join('|'); const r = p.getBoundingClientRect(); document.body.dataset.promptRect = [r.left, r.top, r.width, r.height].map(Math.round).join(','); document.body.dataset.size = innerWidth + 'x' + innerHeight; return chrome.length > 0; })()";
  // REQ-ORCH-153 beside the prompt: the gate's three answers are each the element under their own centre (`gateAnswers`).
  const gateUsable = "(() => { const g = document.querySelector('[data-testid=\"plan-gate\"]'); if (g === null) return false; const ids = ['plan-approve', 'plan-revise', 'plan-cancel']; document.body.dataset.gateAnswers = ids.map((id) => { const b = document.querySelector('[data-testid=\"' + id + '\"]'); if (b === null) return id + '=absent'; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; if (!(r.width > 0 && r.height > 0 && y >= 0 && y < innerHeight)) return id + '=off-screen'; const hit = document.elementFromPoint(x, y); return id + '=' + (hit === b || b.contains(hit) ? 'ok' : 'not-hit'); }).join('|'); const r = g.getBoundingClientRect(); document.body.dataset.gateRect = [r.left, r.top, r.width, r.height].map(Math.round).join(','); document.body.dataset.gateCollapsed = String(g.classList.contains('plan-gate--collapsed')); const d = document.querySelector('.reauth-prompt__detail'); document.body.dataset.promptDetailDrawn = String(d !== null && getComputedStyle(d).display !== 'none'); document.body.dataset.gateChildren = [...g.children].map((c) => c.className.split(' ')[0] + '=' + Math.round(c.getBoundingClientRect().height)).join('|'); return true; })()";
  const ackSeen = "(document.body.dataset.ackSeen ||= [...document.querySelectorAll('[data-testid=\"acknowledgement\"]')].map((a) => a.textContent).find((t) => t.includes('Authentication failed')) ?? '')";
  results.authFallback = {};
  for (const v of authVariants) {
    const s8 = scenario(v.name, v.plan ? ['  run_start_mode: plan'] : [], { fallback: 'beta', alphaProvider: v.provider });
    const primary = `${v.provider}/alpha`;
    const r = await launch(v.name, s8, {
      // `:only=<provider>`: alpha's provider refuses the key, beta's does not; the restarted root takes its script from the
      // first step again, so the fault is scoped to the provider rather than to the step.
      ROTARIS_SCRIPT: `fail:401:only=${v.provider}`, ROTARIS_CAPTURE_PROMPT: 'bad key, then the fallback',
      ...(v.resize === null ? {} : { ROTARIS_CAPTURE_RESIZE: `${v.resize}@200` }),
      ROTARIS_CAPTURE_WAIT: `js:${ackSeen} !== '' && ${v.plan ? `document.querySelector('[data-testid="plan-gate-plan"]') !== null` : `document.querySelector('[data-testid="run-header"]')?.dataset.state === 'completed'`} && document.querySelector('[data-testid="reauth-prompt"]') !== null${v.resize === null ? '' : ` && innerWidth + 'x' + innerHeight === '${v.resize}'`} && ${composerUsable} && ${chromeUsable}${v.plan ? ` && ${gateUsable}` : ''}`, ROTARIS_CAPTURE_WAIT_MS: '90000',
      ROTARIS_CAPTURE_PROBE: 'body;;.notice-slot;;[data-testid="reauth-prompt"];;[data-action="reauth-keep"];;[data-testid="reauth-error"]', ROTARIS_CAPTURE_AFTER_MS: '800',
    }, { timeout: 180_000 });
    const db = open(s8);
    const row = session(db);
    const list = names(db, row.session_id);
    const users = db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(row.session_id).map((u) => u.body);
    const rows = systemRows(db, row.session_id);
    // The first run's result carries the provider's failure text, which the prompt quotes (REQ-NOTIFY-071).
    const error0 = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'result'").all(row.session_id).map((e) => JSON.parse(e.payload)?.result?.error).find((e) => typeof e === 'string') ?? null;
    db.close();
    expect(row.execution_status === (v.plan ? 'awaiting_plan_decision' : 'completed'), `${v.name}: the restarted run did not ${v.plan ? 'park at the plan gate' : 'complete'} on the fallback: ${JSON.stringify(row)}`);
    expect(typeof error0 === 'string' && /HTTP 401/.test(error0), `${v.name}: the first run's result does not carry the 401: ${error0}`);
    const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator');
    expect(calls.length === 2 && calls[0].model === primary && calls[1].model === 'scripted-b/beta', `${v.name}: the 401 was not followed by one call on the fallback: ${JSON.stringify(calls)}`);
    const pin = list.find((t) => t.name === 'model_override');
    const meta = pin ? JSON.parse(pin.metadata) : null;
    expect(meta !== null && meta.provider === v.provider && meta.model === 'alpha' && meta.model_key === 'beta' && meta.cause === 'authentication', `${v.name}: the fallback was not pinned keyed by the pair that failed: ${pin?.metadata}`);
    expect(users.length === 2 && users[0] === users[1] && users[0] === 'bad key, then the fallback', `${v.name}: the run did not restart with the same prompt: ${JSON.stringify(users)}`);
    expect(rows.some((b) => b.startsWith(`Authentication failed on ${primary}`) && b.includes('beta')), `${v.name}: no system row names the restart on the fallback: ${rows.join(' | ')}`);
    const body = probes(r.log, 'probe').find((p) => p.selector === 'body')?.found[0];
    const ack = body?.data['data-ack-seen'] ?? '';
    expect(ack.includes(`Authentication failed on ${primary}`) && /scripted-b\/beta/.test(ack), `${v.name}: the acknowledgement did not name both models: ${JSON.stringify(ack)}`);
    const notice = probes(r.log, 'probe').find((p) => p.selector === '.notice-slot')?.found[0];
    expect(notice === undefined || !/The run failed|Authentication failed\b(?! on)/.test(notice.text), `${v.name}: the restarted run left a failure notice on screen: ${JSON.stringify(notice)}`);
    // REQ-NOTIFY-070 ahead of REQ-NOTIFY-072: the first failure with a usable fallback restarts and opens no recovery dialog.
    expect(!/authentication recovery: the dialog is open for session/.test(r.log), `${v.name}: the recovery dialog opened for a first failure with a usable fallback: see ${v.name}.log`);
    // REQ-NOTIFY-071: the non-modal prompt beside the continuing run — the primary named, the fallback in use, the provider's
    // error quoted, the dismissal that keeps the fallback offered — and, ADR-0048, no modality: no aria-modal, the composer usable.
    const prompt = probes(r.log, 'probe').find((p) => p.selector === '[data-testid="reauth-prompt"]')?.found[0];
    expect(prompt !== undefined, `${v.name}: no re-authentication prompt was on screen after the restart`);
    expect(prompt.text.includes(`${primary} could not authenticate`) && /continues on the fallback model scripted-b\/beta/.test(prompt.text) && /from the next iteration/.test(prompt.text), `${v.name}: the prompt does not say REQ-NOTIFY-071's three things: ${prompt.text}`);
    const quoted = probes(r.log, 'probe').find((p) => p.selector === '[data-testid="reauth-error"]')?.found[0]?.text ?? '';
    const keep = probes(r.log, 'probe').find((p) => p.selector === '[data-action="reauth-keep"]')?.found[0]?.text ?? '';
    expect(quoted === error0 && keep === 'Keep the fallback', `${v.name}: the prompt does not quote the provider's error or offer the dismissal: ${JSON.stringify({ quoted, keep })}`);
    // `scripted` is no provider the credential store holds, so the prompt offers switching back and no key field; `deepseek`
    // signs in with an API key, so the prompt offers the key field (REQ-NOTIFY-078).
    expect(prompt.data['data-method'] === v.method, `${v.name}: the prompt does not offer what this provider gets (${v.method}): ${JSON.stringify(prompt.data)}`);
    const size = body?.data['data-size'] ?? '';
    if (v.resize !== null) expect(size === v.resize, `${v.name}: the window was not measured at ${v.resize}: ${size}`);
    const composer = body?.data['data-composer-usable'] ?? '';
    expect(composer === 'true:true:true:true', `${v.name}: the composer is not usable behind a non-modal prompt (hit:focused:enabled:no-aria-modal = ${composer})`);
    // Plan mode: the gate stands EXPANDED beside the open prompt, and each of its three answers is reachable where it stands.
    const gateAnswers = body?.data['data-gate-answers'] ?? '';
    if (v.plan) {
      expect(body?.data['data-gate-collapsed'] === 'false', `${v.name}: the plan gate was not expanded beside the prompt: ${JSON.stringify(body?.data)}`);
      expect(gateAnswers === 'plan-approve=ok|plan-revise=ok|plan-cancel=ok', `${v.name}: a plan-gate answer is not reachable beside the prompt at ${body?.data['data-size']} (gate ${body?.data['data-gate-rect']}, prompt ${body?.data['data-prompt-rect']}): ${gateAnswers}`);
      // Beside the expanded gate the prompt is its bar: the provider's words are in the document (asserted above) but not drawn.
      expect(body?.data['data-prompt-detail-drawn'] === 'false', `${v.name}: the prompt is drawn whole beside the expanded gate, not as its bar: ${JSON.stringify(body?.data)}`);
      // PD-ORCH-002 revision 2, read as plan-gate-proof reads it: the plan's own text is taller than every other part of the
      // gate. The prompt sized before the gate's flexible row left the gate a strip whose answers fit and whose plan did not.
      const children = (body?.data['data-gate-children'] ?? '').split('|').filter((c) => c !== '').map((c) => { const [name, h] = c.split('='); return { name, h: Number(h) }; });
      const tallest = children.reduce((a, b) => (b.h > a.h ? b : a), { name: '', h: -1 });
      expect(/plan-gate__(preview-wrap|plan)/.test(tallest.name), `${v.name}: beside the prompt the plan is not the largest element of the gate at ${body?.data['data-size']} (gate ${body?.data['data-gate-rect']}, prompt ${body?.data['data-prompt-rect']}): ${body?.data['data-gate-children']}`);
    }
    const chrome = body?.data['data-chrome-usable'] ?? '';
    const chromeControls = chrome.split('|').filter((c) => c !== '');
    expect(chromeControls.length >= 4 && chromeControls.every((c) => c.endsWith('=ok')) && chromeControls.some((c) => c.startsWith('Close')), `${v.name}: a title-bar or notice control is not usable beside the non-modal prompt: ${chrome}`);
    // The placement itself: no control outside the prompt has the prompt at its centre, and the prompt's own controls are
    // usable where they stand (the key field and both answers, which never scroll away).
    const underPrompt = body?.data['data-under-prompt'] ?? '';
    const outside = Number(body?.data['data-outside-controls'] ?? '0');
    expect(outside >= 10 && underPrompt === '', `${v.name}: the prompt overlays ${underPrompt === '' ? 'nothing, but too few controls were tested' : 'controls'} at ${size} (${outside} tested): ${underPrompt}`);
    const own = (body?.data['data-prompt-controls'] ?? '').split('|').filter((c) => c !== '');
    const expectedOwn = v.method === 'api-key' ? 3 : 2;
    expect(own.length === expectedOwn && own.every((c) => c.endsWith('=ok')), `${v.name}: the prompt's own controls are not all usable at ${size}: ${own.join('|')}`);
    results.authFallback[v.name] = { size, status: row.execution_status, calls, pin: meta, acknowledgement: ack, users, prompt: prompt.text, method: prompt.data['data-method'], promptRect: body?.data['data-prompt-rect'] ?? '', composerUsable: composer, chromeUsable: chrome, outsideControlsTested: outside, underPrompt, promptControls: own.join('|'), ...(v.plan ? { gateAnswers, gateRect: body?.data['data-gate-rect'] ?? '', gateChildren: body?.data['data-gate-children'] ?? '' } : {}), png: r.png, elapsedMs: r.elapsedMs };
  }
});

// 12. `auth-fallback-dialog` — the automatic fallback and the recovery dialog together (the merge of the 401 note's four
// parts): a first 401 with `fallback_model: beta` restarts on beta and opens the re-authentication prompt; beta's provider
// refuses too (`fail:401:only=scripted+scripted-b`), a second authentication failure, which opens REQ-NOTIFY-072's dialog
// naming beta (REQ-NOTIFY-075: the fallback is not tried again) and closes the prompt (REQ-NOTIFY-079); the dialog offers
// neither alpha — the automatic fallback's primary, refused with the credentials it still has — nor beta (REQ-NOTIFY-068);
// gpt-4o is chosen and the run completes on it. Driven, because the dialog is its own window.
const s13 = scenario('auth-fallback-dialog', [], { fallback: 'beta' });
await scenarioRun('auth-fallback-dialog', async () => {
  const PROMPT_OPEN = `document.querySelector('[data-testid="reauth-prompt"]')?.getAttribute('data-session') ?? null`;
  const r = await drivenLaunch('auth-fallback-dialog', s13, { ROTARIS_SCRIPT: 'fail:401:only=scripted+scripted-b' }, async (d, step, signal) => {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    await step('the first-launch notice', until(() => d.probe('.notice-slot'), (found) => Array.isArray(found) && /No model provider is authenticated yet/.test(found[0]?.text ?? ''), { timeoutMs: 30_000, what: 'the first-launch notice', signal }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus', signal }));
    await step('the prompt', d.type('bad keys on both providers', { enter: true }));
    await step('the recovery dialog', until(() => recoveryWindows(d), (w) => w.length === 1 && w[0].visible, { timeoutMs: 60_000, what: 'the recovery window', signal }));
    await step('the dialog drawn', d.waitFor('[data-testid="auth-recovery-models"]', { window: 'auth-recovery', timeoutMs: 30_000 }));
    const dialog = await step('the dialog read', d.send('eval', { expression: RECOVERY_READING, window: 'auth-recovery' }));
    const promptWhileOpen = await step('the prompt behind it', d.eval(PROMPT_OPEN));
    await step('gpt-4o', d.click('[role="radio"][data-value="gpt-4o"]', { window: 'auth-recovery' }));
    await step('Retry on gpt-4o', d.click('[data-action="retry"]', { window: 'auth-recovery' }));
    const done = await step('the run completed', until(() => { const db = open(s13); try { return session(db); } finally { db.close(); } }, (row) => row?.execution_status === 'completed', { timeoutMs: 90_000, what: 'the restarted run completing', signal }));
    const closedAtEnd = await step('no dialog at the end', recoveryWindows(d));
    return { dialog, promptWhileOpen, done, closedAtEnd };
  });
  const db = open(s13);
  const row = session(db);
  const overrides = names(db, row.session_id).filter((t) => t.name === 'model_override').map((t) => JSON.parse(t.metadata));
  db.close();
  const v = r.value;
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator').map((c) => c.model);
  expect(JSON.stringify(calls) === JSON.stringify(['scripted/alpha', 'scripted-b/beta', 'openai/gpt-4o']), `the calls are not alpha, the automatic fallback beta, then the dialog's gpt-4o: ${JSON.stringify(calls)}`);
  // REQ-NOTIFY-070 then REQ-NOTIFY-071: the first failure restarted on beta and opened the prompt; REQ-NOTIFY-072/075: the
  // second opened the dialog naming beta; REQ-NOTIFY-079: the dialog's opening closed the prompt.
  const at = (re) => r.log.search(re);
  const order = [at(/pinned scripted-b\/beta in place of scripted\/alpha/), at(/re-authentication prompt opened for session/), at(/authentication recovery: the dialog is open for session \S+ \(scripted-b\/beta failed/), at(/re-authentication prompt\(s\) closed \(the recovery dialog opened/)];
  expect(order.every((n) => n >= 0) && order.every((n, k) => k === 0 || n > order[k - 1]), `the restart, the prompt, the dialog and the prompt's closing are not in that order: ${JSON.stringify(order)} (see auth-fallback-dialog.log)`);
  expect(v.dialog.title === 'Authentication failed for beta', `the dialog does not name the fallback that failed: ${JSON.stringify(v.dialog.title)}`);
  expect(v.promptWhileOpen === null, `the re-authentication prompt stayed drawn beside the recovery dialog (REQ-NOTIFY-079): ${v.promptWhileOpen}`);
  // REQ-NOTIFY-068: neither pair that failed with the credentials it still has is offered.
  const keys = v.dialog.models.map((m) => m.key);
  expect(!keys.includes('alpha') && !keys.includes('beta') && keys.includes('gpt-4o'), `the dialog offers a pair that already failed authentication, or not gpt-4o: ${JSON.stringify(keys)}`);
  expect(v.done.execution_status === 'completed' && v.closedAtEnd.length === 0, `the run did not complete on gpt-4o, or a dialog stayed: ${JSON.stringify(v.done)}`);
  expect(overrides.some((o) => o.provider === 'scripted' && o.model === 'alpha' && o.model_key === 'beta' && o.cause === 'authentication')
    && overrides.some((o) => o.provider === 'scripted-b' && o.model === 'beta' && o.model_key === 'gpt-4o' && o.cause === 'authentication'), `the two pins are not recorded: ${JSON.stringify(overrides)}`);
  results.authFallbackDialog = { status: row.execution_status, calls, dialog: { title: v.dialog.title, models: keys }, promptWhileOpen: v.promptWhileOpen, overrides, png: r.png, elapsedMs: r.elapsedMs };
});

// 13. `auth-fallback-revise` — REQ-ORCH-154 with REQ-NOTIFY-070 (the fourth repair round's blocking finding): a revise cycle
// whose turn fails on a first 401 is restarted on the fallback AS THE SAME REVISE — the changes the user stated and the plan
// they revised reach the fallback, the cycle is the revise's, and no prompt is re-submitted. Plan mode, `fallback_model:
// beta`. Cycle 1 runs on alpha (`scripted`) and parks; the gate's changes field is filled and Revise pressed with alpha's
// provider swapped to `deepseek` in the workspace's agents.yaml first (a run reads the configuration at its start, ADR-0037),
// so the revise cycle's call is refused (`fail:401:only=deepseek`) — a key revoked between the cycle and the revise, made
// reproducible — and the restart's call on beta answers. Driven, because the gate's changes and its Revise are clicked.
const s12 = scenario('auth-fallback-revise', ['  run_start_mode: plan'], { fallback: 'beta' });
await scenarioRun('auth-fallback-revise', async () => {
  const CHANGES = 'USE-THE-ZEBRA-LIBRARY';
  const r = await drivenLaunch('auth-fallback-revise', s12, { ROTARIS_SCRIPT: 'fail:401:only=deepseek' }, async (d, step, signal) => {
    await step('the shell', d.waitFor('.app-shell', { timeoutMs: 60_000 }));
    await step('the first-launch notice', until(() => d.probe('.notice-slot'), (found) => Array.isArray(found) && /No model provider is authenticated yet/.test(found[0]?.text ?? ''), { timeoutMs: 30_000, what: 'the first-launch notice', signal }));
    await step('Ctrl+2', d.chord('Ctrl+2'));
    await step('the composer', d.waitFor('.composer__input'));
    await step('Ctrl+L', d.chord('Ctrl+L'));
    await step('the caret in the composer', until(() => d.eval(`document.activeElement?.classList.contains('composer__input') === true`), (v) => v === true, { what: 'the composer holding focus', signal }));
    await step('the prompt', d.type('plan the thing', { enter: true }));
    await step('cycle 1 at the gate', d.waitFor('[data-testid="plan-gate-plan"]', { timeoutMs: 60_000 }));
    // alpha's provider refuses from now on: the revise cycle's call is alpha's, on `deepseek`.
    const yaml = join(s12.workspace, '.rotaris', 'agents.yaml');
    writeFileSync(yaml, readFileSync(yaml, 'utf8').replace('alpha: { provider: scripted, model_id: alpha }', 'alpha: { provider: deepseek, model_id: alpha }'));
    await step('the changes field opened', d.click('.plan-gate__changes-summary'));
    await step('the changes field', d.waitFor('#plan-gate-changes', { timeoutMs: 10_000 }));
    await step('the changes field focused', d.click('#plan-gate-changes'));
    await step('the changes typed', d.type(CHANGES));
    await step('Revise', d.click('[data-testid="plan-revise"]'));
    // The restarted revise parks at cycle 2, the gate drawn again with the changes it was asked for.
    const prior = await step('cycle 2 at the gate', until(() => d.eval(`document.querySelector('[data-testid="plan-gate-prior"]')?.textContent ?? null`), (t) => typeof t === 'string' && t.includes(CHANGES), { timeoutMs: 90_000, what: 'the restarted revise at the gate', signal }));
    const prompt = await step('the prompt beside it', until(() => d.eval(`document.querySelector('[data-testid="reauth-prompt"]')?.getAttribute('data-session') ?? null`), (v) => typeof v === 'string', { timeoutMs: 15_000, what: 'the re-authentication prompt', signal }));
    const windows = await step('no recovery window', recoveryWindows(d));
    return { prior, prompt, windows };
  });
  const db = open(s12);
  const row = session(db);
  const cycles = db.prepare('SELECT cycle, changes, plan FROM plan_cycles WHERE session_id = ? ORDER BY cycle').all(row.session_id);
  const users = db.prepare("SELECT body FROM transcript_rows WHERE session_id = ? AND kind = 'user' ORDER BY row_index").all(row.session_id).map((u) => u.body);
  const overrides = names(db, row.session_id).filter((t) => t.name === 'model_override').map((t) => JSON.parse(t.metadata));
  const rows = systemRows(db, row.session_id);
  db.close();
  const v = r.value;
  const calls = modelCalls(r.log).filter((c) => c.who === 'orchestrator').map((c) => c.model);
  expect(row.execution_status === 'awaiting_plan_decision', `the restarted revise did not park at the gate: ${JSON.stringify(row)}`);
  expect(JSON.stringify(calls) === JSON.stringify(['scripted/alpha', 'deepseek/alpha', 'scripted-b/beta']), `the calls are not cycle 1 on alpha, the revise refused on alpha, the restart on beta: ${JSON.stringify(calls)}`);
  // REQ-ORCH-154: the restarted cycle is the revise's — cycle 2, the changes stated — and its plan is the fallback's.
  expect(cycles.length === 2 && cycles[0].cycle === 1 && cycles[0].changes === '' && cycles[1].cycle === 2 && cycles[1].changes === CHANGES, `the restart was not the same revise: ${JSON.stringify(cycles)}`);
  expect(v.prior.includes(CHANGES), `the gate does not show the changes the restarted cycle was asked for: ${v.prior}`);
  // A decision is no prompt: nothing re-submitted.
  expect(users.length === 1 && users[0] === 'plan the thing', `the restart re-submitted a prompt: ${JSON.stringify(users)}`);
  expect(overrides.some((o) => o.provider === 'deepseek' && o.model === 'alpha' && o.model_key === 'beta' && o.cause === 'authentication'), `the fallback was not pinned for the pair that failed: ${JSON.stringify(overrides)}`);
  expect(rows.some((b) => b.startsWith('Authentication failed on deepseek/alpha') && b.includes('beta')), `no row names the restart on the fallback: ${rows.join(' | ')}`);
  // REQ-NOTIFY-070/071: the restart's prompt beside the gate, and no recovery dialog for a first failure with a usable fallback.
  expect(v.prompt === row.session_id && v.windows.length === 0 && !/authentication recovery: the dialog is open for session/.test(r.log), `the first failure did not take the automatic fallback alone: ${JSON.stringify({ prompt: v.prompt, windows: v.windows })}`);
  results.authFallbackRevise = { status: row.execution_status, calls, cycles: cycles.map((c) => ({ cycle: c.cycle, changes: c.changes })), users, prior: v.prior, png: r.png, elapsedMs: r.elapsedMs };
});

writeFileSync(join(output, 'results.json'), `${JSON.stringify({ ...results, ...(only === null ? {} : { only }), failures }, null, 2)}\n`);
console.log(JSON.stringify({ ...results, ...(only === null ? {} : { only }), failures }, null, 2));
if (failures.length > 0) {
  console.error(`resilience-proof: ${failures.length} scenario(s) failed: ${failures.map((f) => f.scenario).join(', ')}`);
  process.exitCode = 1;
}
