import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv, tokensDirFor } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';

/**
 * The vertical slice's proof (Part K.4): sign in to OpenRouter through the product and complete one run on a
 * real model. ONE scratch profile is carried across the launches, because the credential written by the
 * second must be the one the fourth leases. The owner pastes the key into the authentication window; the
 * script never reads it from an environment variable and never writes it to a log. Every assertion reads
 * the files on disk, the store, or the application log; the PNGs are read back.
 *
 *   1. first-launch  — the notice; Settings → Models → Add endpoint; label + URL filled; the owner pastes the
 *                      key and presses "Add endpoint"; the credential file, its protection, the snapshot and
 *                      the starter agents.yaml asserted; the log holds no credential.
 *   2. slots         — the three tier slots set to anthropic/claude-haiku-4.5 and saved.
 *   3b. intents      — three more real runs, one prompt per intent family: the classifier's answer is a category
 *                      from the small slot, never the fallback (Part L; the first real run fell to it).
 *   3. run           — one real run: the leased bearer, a request to OpenRouter, an agent row, a tool call
 *                      settled through the gate, usage figures, the terminal result.
 *   4. spike6        — spike 6's live half against the same endpoint, with the credential the owner stored in
 *                      this proof's scratch profile (the figures go into spikes/responses-dialect.md).
 *   5. sign-out      — Sign out from the providers card; the file gone, the snapshot kept.
 *   6. refused       — a relaunch with a prompt: the run refused "Provider authentication required".
 *
 * `--resume` keeps the profile; `--from=<scenario>` (with --resume) replays the earlier scenarios from their
 * logs and the store instead of launching them, so one scenario can be re-run without a second paste.
 */
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'slice-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
// --resume keeps the profile (and the credential the owner already pasted) and skips the first launch.
const resume = process.argv.includes('--resume');
const ORDER = ['first-launch', 'slots', 'run', 'intents', 'spike6', 'sign-out', 'refused'];
const INTENTS = [
  { prompt: 'What is the first heading of README.md?', expect: ['question'] },
  { prompt: "Append the line 'hello' to the end of README.md.", expect: ['explicit_trivial', 'single_file_change'] },
  { prompt: 'Add a --json flag to the CLI that prints the effective configuration as JSON, with a unit test for it.', expect: ['small_feature', 'moderate_feature', 'large_feature'] },
];
const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? (resume ? 'slots' : 'first-launch');
if (!ORDER.includes(from)) throw new Error(`--from must be one of ${ORDER.join(', ')}`);
/** A scenario before `from` is replayed from its evidence rather than launched. */
const replay = (name) => resume && ORDER.indexOf(name) < ORDER.indexOf(from);
if (resume) { for (const name of ORDER) if (!replay(name)) for (const file of name === 'intents' ? INTENTS.map((_, i) => `intents-${i + 1}`) : [name]) for (const ext of ['.log', '.png']) rmSync(join(output, `${file}${ext}`), { force: true }); rmSync(join(output, 'results.json'), { force: true }); }
else rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const PROVIDER_ID = 'openai-compatible--openrouter';
const BASE_URL = 'https://openrouter.ai/api/v1';
const MODEL = 'anthropic/claude-haiku-4.5';
const QUALIFIED = `${PROVIDER_ID}/${MODEL}`;
const KEY_WAIT_MS = Number(process.env.SLICE_PROOF_KEY_WAIT_MS ?? 600_000);
const RUN_WAIT_MS = Number(process.env.SLICE_PROOF_RUN_WAIT_MS ?? 300_000);

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);





// The ONE profile of this proof.
const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# Slice proof workspace\n\nThis file exists so the agent has something to read.\n');
// The credential store (REQ-PROVIDER-014) where the product writes it on THIS platform (`tokensDirFor`).
const tokensFile = join(tokensDirFor(local), `${PROVIDER_ID}.json`);
// The discovery snapshot where the product writes it on THIS platform (`configDirFor`), not the Windows spelling alone.
const snapshotFile = join(configDirFor(local), 'project_settings.yaml');
const agentsFile = join(workspace, '.rotaris', 'agents.yaml');

async function launch(name, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const result = await spawnBounded(electron, [join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    cwd: app, timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ local, preferences: join(root, 'preferences') }),
      ROTARIS_CAPTURE_PNG: png,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.overran) throw new Error(`${overrunMessage(name, result, log)}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}
function assertNoCredential(log, name) {
  if (/sk-or-/i.test(log)) throw new Error(`${name}.log carries a credential prefix`);
  if (/Bearer\s+(?!\*\*\*)\S{20,}/.test(log)) throw new Error(`${name}.log carries a bearer value`);
}

/** The Windows read-back the store performs, repeated here independently: icacls /save → SDDL → exactly two full-control ACEs, protected. */
function windowsDacl(path) {
  const save = join(tmpdir(), `slice-acl-${process.pid}.txt`);
  try {
    const r = spawnSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe'), [path, '/save', save], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return { error: r.stderr || r.stdout };
    const text = readFileSync(save).toString('utf16le').replace(/^\uFEFF/, '');
    const sddl = text.split(/\r?\n/).filter((l) => l.length > 0)[1] ?? '';
    const m = /D:([A-Z]*)((?:\([^)]*\))*)/.exec(sddl);
    if (!m) return { sddl, error: 'no DACL' };
    const aces = [...m[2].matchAll(/\(([^)]*)\)/g)].map((a) => a[1].split(';'));
    return { sddl, protected: m[1].includes('P'), aces: aces.map((f) => ({ type: f[0], flags: f[1], rights: f[2], sid: f[5] })) };
  } finally {
    rmSync(save, { force: true });
  }
}

const results = { keyPasted: false };

// 1. First launch: the notice; the add-endpoint dialog; the owner pastes the key.
console.error('\n================================================================================');
console.error(' SLICE PROOF — the authentication window will open in the app.');
console.error(` Paste your OpenRouter API key into the "API key" field and press "Add endpoint".`);
console.error(` The label and URL are filled for you. You have ${Math.round(KEY_WAIT_MS / 60_000)} minutes; the script waits for the credential file.`);
console.error('================================================================================\n');
const log1 = replay('first-launch') ? readFileSync(join(output, 'first-launch.log'), 'utf8') : await launch('first-launch', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_CLICKS: '[data-action="add-endpoint"]@2200',
  ROTARIS_CAPTURE_PROVIDER_FILL: `OpenRouter>>${BASE_URL}`,
  ROTARIS_CAPTURE_WAIT: `file:${tokensFile}`, ROTARIS_CAPTURE_WAIT_MS: String(KEY_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
}, KEY_WAIT_MS + 60_000);
assertNoCredential(log1, 'first-launch');
if (!/notice: No model provider is authenticated yet/.test(log1)) throw new Error('the first-launch notice was not raised');
if (!/providers: 0 authenticated/.test(log1)) throw new Error('the first launch did not report zero authenticated providers');
if (/capture: wait for .* timed out/.test(log1) || (!replay('first-launch') && !existsSync(tokensFile))) {
  results.firstLaunch = { notice: 'raised', dialog: /provider dialog filled/.test(log1) ? 'opened and filled' : 'not filled', keyPasted: false };
  writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.error('\nThe key was not pasted within the wait: scenarios 2–5 did not run. Run `pnpm slice-proof` again when you can paste it.');
  process.exit(2);
}
results.keyPasted = true;
const added = /providers: (Added OpenRouter; discovered (\d+) models?\.)/.exec(log1);
if (!added) throw new Error(`the sign-in outcome was not logged:\n${log1}`);
// After the sign-out scenario the file is gone; a replay reads the credential facts it recorded.
const credentialFacts = join(output, 'credential-facts.json');
const credential = existsSync(tokensFile) ? JSON.parse(readFileSync(tokensFile, 'utf8')) : existsSync(credentialFacts) ? JSON.parse(readFileSync(credentialFacts, 'utf8')) : { access_token: '', refresh_token: '', expires_at: 0, account_id: null, extra: { provider_family: 'openai-compatible', api_base: BASE_URL }, replayed: true };
if (existsSync(tokensFile)) writeFileSync(credentialFacts, JSON.stringify({ ...credential, access_token: credential.access_token }));
if (!credential.replayed && (typeof credential.access_token !== 'string' || credential.access_token.length === 0 || credential.expires_at !== 0 || credential.extra?.provider_family !== 'openai-compatible' || credential.extra?.api_base !== BASE_URL)) throw new Error('the credential file does not carry the five keys with the instance extras');
const strays = existsSync(dirname(tokensFile)) ? readdirSync(dirname(tokensFile)).filter((f) => !f.endsWith('.json')) : [];
if (strays.length > 0) throw new Error(`the credential directory holds more than <id>.json: ${strays.join(', ')}`);
let dacl = null;
if (process.platform === 'win32' && existsSync(tokensFile)) {
  dacl = windowsDacl(tokensFile);
  if (dacl.error || !dacl.protected || dacl.aces.length !== 2 || dacl.aces.some((a) => a.type !== 'A' || a.rights !== 'FA' || /ID/.test(a.flags))) throw new Error(`the credential file's protection is not exact: ${JSON.stringify(dacl)}`);
  const dirDacl = windowsDacl(dirname(tokensFile));
  if (dirDacl.error || !dirDacl.protected || dirDacl.aces.length !== 2) throw new Error(`the credential directory's protection is not exact: ${JSON.stringify(dirDacl)}`);
}
const snapshot = readFileSync(snapshotFile, 'utf8');
// Keys are emitted in written order (REQ-PROVIDER-085): the record's scalars, then the models, then the family, base URL and picks.
for (const line of [`  ${PROVIDER_ID}:`, `    id: ${PROVIDER_ID}`, '    display_name: OpenRouter', '    family: openai-compatible', `    base_url: ${BASE_URL}`, '    authenticated: true']) if (!snapshot.split('\n').includes(line)) throw new Error(`the snapshot lacks the line ${JSON.stringify(line)}`);
if (!snapshot.startsWith('version: 1\n')) throw new Error('the snapshot does not start with its version');
if (/access_token|sk-or-/.test(snapshot)) throw new Error('the snapshot carries a credential');
const picks = Object.fromEntries(['large_model', 'medium_model', 'small_model', 'fallback_model', 'default_summary_model'].map((k) => [k, new RegExp(`^    ${k}: (.+)$`, 'm').exec(snapshot)?.[1] ?? null]));
if (!snapshot.includes(`      - id: ${QUALIFIED}\n`)) throw new Error(`the catalog did not carry ${MODEL}`);
if (!existsSync(agentsFile) || !readFileSync(agentsFile, 'utf8').includes('default_persona: orchestrator')) throw new Error('the starter agents.yaml was not bootstrapped after sign-in');
// The starter runs in `ask` mode, which put the owner at the approval dialog for every tool call of every real run. This
// scratch workspace is the proof's: its runs are unattended from here on (REQ-TOOLS-071's unsandboxed-autonomous consent
// given in the file, as a person would give it in Settings → Runtime).
if (!readFileSync(agentsFile, 'utf8').includes('permission_mode:')) writeFileSync(agentsFile, `${readFileSync(agentsFile, 'utf8')}runtime:\n  permission_mode: autonomous\n  allow_unsandboxed_autonomous: true\n`);
results.firstLaunch = { notice: 'raised', outcome: added[1], discovered: Number(added[2]), credential: { keys: Object.keys(credential), expiresAt: credential.expires_at, extra: credential.extra }, protection: dacl ? { protected: dacl.protected, aces: dacl.aces.map((a) => `${a.type};${a.rights};${a.sid.startsWith('S-1-5-21') ? 'owner' : a.sid}`) } : 'posix', picks, bootstrap: 'written' };

// 2. The three tier slots pinned to the proof model and saved.
const log2 = replay('slots') ? readFileSync(join(output, 'slots.log'), 'utf8') : await launch('slots', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_SELECT: `select[aria-label="Model for small_model"]>>${QUALIFIED}@2200;;select[aria-label="Model for medium_model"]>>${QUALIFIED}@2500;;select[aria-label="Model for large_model"]>>${QUALIFIED}@2800`,
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary>>Save@3600',
  ROTARIS_CAPTURE_AFTER_MS: '5200',
});
assertNoCredential(log2, 'slots');
if (!/providers: 1 authenticated \(openai-compatible--openrouter\)/.test(log2)) throw new Error('the relaunch did not find the provider authenticated');
if (/notice: No model provider/.test(log2)) throw new Error('the first-launch notice was raised with a provider authenticated');
const agents = readFileSync(agentsFile, 'utf8');
for (const slot of ['small_model', 'medium_model', 'large_model']) if (!agents.includes(`${slot}: ${QUALIFIED}\n`)) throw new Error(`the slot ${slot} was not saved:\n${agents}`);
results.slots = { agentsFile: agents };

// 3. One real run on the leased bearer.
const log3 = replay('run') ? readFileSync(join(output, 'run.log'), 'utf8') : await launch('run', {
  ROTARIS_CAPTURE_PROMPT: 'Read README.md in this workspace and tell me its first heading, in one sentence.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
}, RUN_WAIT_MS + 60_000);
assertNoCredential(log3, 'run');
// The lease's report is the run host's (REQ-PROVIDER-068, `LeaseReportLog`); main no longer restates it (a71-9).
if (!/credentials: leased for openai-compatible--openrouter/.test(log3)) throw new Error('main did not lease the bearer');
if (!/credentials: 1 provider\(s\) authenticated/.test(log3)) throw new Error('the run host did not report the priming');
const requests = (log3.match(/model request POST (\S+)/g) ?? []).map((l) => l.replace('model request POST ', ''));
if (!requests.some((u) => u.startsWith(`${BASE_URL}/chat/completions`))) throw new Error(`no request reached OpenRouter:\n${requests.join('\n')}`);
if (/capture: wait for result timed out/.test(log3)) throw new Error('the run did not end within the wait');
const db = new Database(oneDatabase(local), { readonly: true });
const session = db.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, tokens_input, tokens_output FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
const rows = db.prepare('SELECT kind, settled, body FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(session.session_id);
const events = db.prepare('SELECT kind, payload FROM events WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
const audit = db.prepare('SELECT payload FROM launch_audits WHERE session_id = ?').get(session.session_id);
db.close();
const kinds = rows.map((r) => r.kind);
const agentRows = rows.filter((r) => r.kind === 'agent');
const toolRows = rows.filter((r) => r.kind === 'tool');
const usage = events.filter((e) => e.kind === 'usage.update').map((e) => JSON.parse(e.payload));
const lastUsage = usage[usage.length - 1] ?? null;
if (session.execution_status !== 'completed') throw new Error(`the run ended ${session.execution_status} (${session.stop_reason})`);
if (agentRows.length === 0 || !agentRows.some((r) => r.body.length > 20)) throw new Error(`no agent row with text: kinds ${kinds.join(',')}`);
if (toolRows.length === 0 || !toolRows.every((r) => r.settled === 1)) throw new Error(`no settled tool row: kinds ${kinds.join(',')}`);
if (!events.some((e) => e.kind === 'result') || !events.some((e) => e.kind === 'session.end')) throw new Error('the terminal pair is missing');
if (!lastUsage || !(JSON.stringify(lastUsage).includes('input'))) throw new Error('no usage figures were recorded');
const auditPayload = audit ? JSON.parse(audit.payload) : null;
const intent = auditPayload?.run_intent ?? null;
results.run = {
  status: session.execution_status, stopReason: session.stop_reason, iterations: session.iterations_completed,
  tokens: { input: session.tokens_input, output: session.tokens_output }, rowKinds: kinds, toolRows: toolRows.length,
  requests: [...new Set(requests)], lastUsage, intent, answer: agentRows.map((r) => r.body).join(' ').slice(0, 400),
};

// 3b. The intent classifier on the real small slot (REQ-ORCH-005..010; Part L). The slice's first real run fell to
// the fallback because the model answered the request instead of labelling it; each of these runs must classify.
results.intents = [];
for (const [i, c] of INTENTS.entries()) {
  const name = `intents-${i + 1}`;
  const log = replay('intents') ? readFileSync(join(output, `${name}.log`), 'utf8') : await launch(name, {
    ROTARIS_CAPTURE_PROMPT: c.prompt, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '1500',
  }, RUN_WAIT_MS + 60_000);
  assertNoCredential(log, name);
  // PD-MONITOR-002 moved the level out of the message (`… info    run host: intent: …`); a log replayed from before it
  // still reads `run host info: intent: …`, so both are the run host's `info` intent line.
  const line = log.split('\n').find((l) => /\] info +run host: intent: |run host info: intent: /.test(l)) ?? '';
  const m = /intent: ([a-z_]+)(?: \(([^)]*)\))?(?: via (json_schema|json_object|text))?/.exec(line);
  if (!m) throw new Error(`${name}: no intent line in the log`);
  const [, category, detail, rung] = m;
  if (/fallback/.test(line)) throw new Error(`${name}: the classifier fell back: ${line.trim()}`);
  if (!c.expect.includes(category)) throw new Error(`${name}: "${c.prompt}" classified as ${category}, expected one of ${c.expect.join(', ')}`);
  const warned = log.split('\n').filter((l) => /intent classifier: .* (rejected|answered) the/.test(l)).map((l) => l.replace(/^.*intent classifier: /, '').trim());
  results.intents.push({ prompt: c.prompt, category, confidence: detail ?? null, rung: rung ?? null, rungNotes: warned });
}

// 4. Spike 6's live half, with the credential the owner stored in this proof's profile. The key reaches the harness
//    through a variable named for it and is never printed; only the harness's figures are kept.
const spikeEnv = { ...cleanEnvironment(), ROTARIS_SPIKE6_BASE_URL: BASE_URL, ROTARIS_SPIKE6_MODEL: MODEL, ROTARIS_SPIKE6_API_KEY_ENV: 'ROTARIS_SLICE_PROOF_KEY', ROTARIS_SLICE_PROOF_KEY: credential.access_token };
const spike = replay('spike6') ? null : process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx vitest run packages/model/src/ai-sdk-live.spike.test.ts'], { cwd: repo, encoding: 'utf8', timeout: 300_000, env: spikeEnv })
  : spawnSync('npx', ['vitest', 'run', 'packages/model/src/ai-sdk-live.spike.test.ts'], { cwd: repo, encoding: 'utf8', timeout: 300_000, env: spikeEnv });
const spikeOut = spike ? `${spike.stdout ?? ''}\n${spike.stderr ?? ''}`.split(credential.access_token).join('[redacted]') : readFileSync(join(output, 'spike6.log'), 'utf8');
if (spike) writeFileSync(join(output, 'spike6.log'), spikeOut);
const redactKey = (text) => (credential.access_token.length > 0 ? text.split(credential.access_token).join('[redacted]') : text);
const stripAnsi = (text) => text.replace(/\[[0-9;]*m/g, '');
const spikeLines = spikeOut.split('\n').filter((l) => l.includes('[spike6]')).map((l) => stripAnsi(redactKey(l.replace(/^.*\[spike6\]/, '[spike6]'))).trim());
const spikeSummary = stripAnsi(/Tests\s+(.*)$/m.exec(spikeOut)?.[1] ?? 'no summary').trim();
results.spike6 = { exit: spike ? spike.status : 'replayed', tests: spikeSummary, lines: spikeLines };

// 5. Sign out from the providers card; the file gone, the snapshot kept.
const log5 = replay('sign-out') ? readFileSync(join(output, 'sign-out.log'), 'utf8') : await launch('sign-out', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_CLICKS: `[data-provider="${PROVIDER_ID}"] .btn-link@2200;;[data-provider-settings="${PROVIDER_ID}"] .btn-secondary>>Sign out@3200`,
  ROTARIS_CAPTURE_AFTER_MS: '5000',
});
assertNoCredential(log5, 'sign-out');
if (!/providers: Signed out of OpenRouter\./.test(log5)) throw new Error(`the sign-out was not logged:\n${log5}`);
if (existsSync(tokensFile)) throw new Error('the credential file survived the sign-out');
if (!readFileSync(snapshotFile, 'utf8').includes(`  ${PROVIDER_ID}:`)) throw new Error('the sign-out removed the snapshot entry');
results.signOut = { credentialFile: 'removed', snapshot: 'kept' };

// 6. A prompt with the provider signed out: refused before any session exists (REQ-WORKSPACE-137).
const log6 = replay('refused') ? readFileSync(join(output, 'refused.log'), 'utf8') : await launch('refused', { ROTARIS_CAPTURE_PROMPT: 'Read README.md again.', ROTARIS_CAPTURE_AFTER_MS: '4000' });
assertNoCredential(log6, 'refused');
if (!/providers: 0 authenticated/.test(log6)) throw new Error('the relaunch after sign-out still found a provider authenticated');
if (!/run refused: Provider authentication required/.test(log6)) throw new Error(`the run after sign-out was not refused as specified:\n${log6.split('\n').filter((l) => /refused|session/.test(l)).join('\n')}`);
if (/session .* started/.test(log6)) throw new Error('a session was started without a leased bearer');
results.refused = { refusal: 'Provider authentication required', detail: 'Authenticate at least one configured provider before starting a run.' };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
