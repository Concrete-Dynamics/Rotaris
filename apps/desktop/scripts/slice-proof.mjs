import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, oneDatabase, proofIsolationEnv, tokensDirFor } from './lib/harness.mjs';
import { overrunMessage, spawnBounded } from './lib/bounded-launch.mjs';
import { primingProblem } from './lib/priming-report.mjs';
import { proofEndpoint } from './lib/endpoint-registry.mjs';
import { starterMissing } from './lib/starter-config.mjs';
import { answerlessCompletion, answerRows, INTENTS, intentVerdict } from './lib/live-answers.mjs';
import { hostLoad, keepEvidence, keepRed } from './lib/proof-reds.mjs';

/**
 * The vertical slice's proof (Part K.4): sign in to a real OpenAI-compatible endpoint through the product and complete
 * runs on a real model. The endpoint is the live-run registry's (`~/.rotaris/live-run/endpoints.json`, R-068): its
 * default, or the one `--endpoint=<name>` names, exactly as `pnpm live-run` picks it, read through
 * `lib/endpoint-registry.mjs`. Its label, base URL and model are what the product is given and what every assertion
 * reads; the provider id is the one the product mints for that label (REQ-PROVIDER-051). Until 2026-10-02 these were
 * OpenRouter constants and the owner pasted an OpenRouter key by hand; the owner holds no OpenRouter credits and the
 * registered default (`katalyst`) is self-hosted and unmetered, so the proof now signs in where `live-run` does.
 *
 * THE KEY. The registered endpoint's stored key is supplied the way `live-run` supplies it: `ROTARIS_LIVE_API_KEY`
 * first, else `~/.rotaris/live-run/<name>.key(.dpapi)`; it reaches the product only through the add-endpoint dialog's
 * key field (the fill seam's third segment, which presses the dialog's own button). `--paste-key` keeps the proof's
 * original design for an endpoint whose key is not stored: the label and URL are filled, the owner pastes the key and
 * presses "Add endpoint", and the script waits `SLICE_PROOF_KEY_WAIT_MS` (default ten minutes) for the credential file.
 * The key never reaches a log, the repository or this proof's output directory: every log is written with the key
 * substituted out and is asserted to have held none; the scratch profile, where the product's credential store keeps
 * the key as it would on the owner's machine, lives in the system temp directory and not under `.proof/`; and
 * `credential-facts.json` records the credential file's shape without its token.
 *
 * ONE scratch profile is carried across the launches, because the credential written by the first must be the one the
 * runs lease. Every assertion reads the files on disk, the store, or the application log; the PNGs are read back.
 *
 *   1. first-launch  — the notice; Settings → Models → Add endpoint; label, URL (and the stored key) filled and the
 *                      dialog's own button pressed (or the owner pastes, `--paste-key`); the credential file, its
 *                      protection, the snapshot, the discovered-models count and the starter agents.yaml (its
 *                      header, persona and twelve nulls, `lib/starter-config.mjs`) asserted;
 *                      the log holds no credential.
 *   2. slots         — the three tier slots set to the registered model and saved, or, on a one-model endpoint whose
 *                      discovery picks already name it, asserted through the discovered picks.
 *   3. run           — one real run: the leased bearer, a request to the endpoint, an agent row, a tool call
 *                      settled through the gate, usage figures, the terminal result. A run the product completed in
 *                      which the model wrote no answer is the model's call, not a requirement's (`lib/live-answers.mjs`):
 *                      it is reported, kept as `run.attempt-1.*` (and copied into `.proof/slice-proof-answerless/`)
 *                      and run once more; a second such run is a red.
 *   3b. intents      — three more real runs, one prompt per intent family: the classifier's answer is a category
 *                      from the small slot, never the fallback (Part L; the first real run fell to it), and one of the
 *                      categories REQ-ORCH-006 and REQ-ORCH-021 leave in reach of the prompt (`INTENTS`, with the
 *                      reason for each, in `lib/live-answers.mjs`).
 *   4. spike6        — spike 6's live half against the same endpoint and model, with the same key (the figures go
 *                      into spikes/responses-dialect.md).
 *   5. sign-out      — Sign out from the providers card; the file gone, the snapshot kept.
 *   6. refused       — a relaunch with a prompt: the run refused "Provider authentication required".
 *
 * `--resume` keeps the profile (in the system temp directory, so a host that clears it at reboot leaves `--resume`
 * nothing to keep: sign in again with a fresh run); `--from=<scenario>` (with --resume) replays the earlier scenarios from their
 * logs and the store instead of launching them, so one scenario can be re-run without signing in again.
 * `--skip-build` trusts `apps/desktop/out`. On a host without a display, run it under
 * `xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/slice-proof.mjs --skip-build`.
 *
 * EVERY RED IS KEPT. A red copies the output directory into `.proof/slice-proof-reds/<stamp>-<scenario>/` beside a
 * `red.json` (the scenario, the error, the commit, the host's load and the results so far, `lib/proof-reds.mjs`), where
 * the next run, which clears `.proof/slice-proof/`, does not remove it. Each launch's load is recorded in
 * `results.json`'s `loads`: a timing red, such as a classification at its 12 s bound (OQ-114), is judged beside it.
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
const from = process.argv.find((a) => a.startsWith('--from='))?.slice(7) ?? (resume ? 'slots' : 'first-launch');
if (!ORDER.includes(from)) throw new Error(`--from must be one of ${ORDER.join(', ')}`);
/** A scenario before `from` is replayed from its evidence rather than launched. */
const replay = (name) => resume && ORDER.indexOf(name) < ORDER.indexOf(from);
// The endpoint the proof signs into: the registry's default, or `--endpoint=<name>` (R-068). Read before anything is
// removed or built, so an endpoint without a stored key is refused with the last run's evidence still in place.
const endpoint = proofEndpoint();
// The scratch profile holds the product's credential store, which holds the key: it lives outside the repository and
// outside the output directory, in the system temp directory, one per checkout so two worktrees never share one.
const root = join(tmpdir(), 'rotaris-slice-proof', basename(repo), 'profile');
if (resume) { for (const name of ORDER) if (!replay(name)) for (const file of name === 'intents' ? INTENTS.map((_, i) => `intents-${i + 1}`) : name === 'run' ? ['run', 'run.attempt-1'] : [name]) for (const ext of ['.log', '.png', '.json']) rmSync(join(output, `${file}${ext}`), { force: true }); rmSync(join(output, 'results.json'), { force: true }); }
else { rmSync(output, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
mkdirSync(output, { recursive: true });

const PASTE = endpoint.key === null;
const PROVIDER_ID = endpoint.providerId;
const LABEL = endpoint.label;
const BASE_URL = endpoint.baseUrl;
const MODEL = endpoint.model;
const QUALIFIED = endpoint.qualified;
/** A label, quoted for a regular expression: the product's lines name the endpoint by it. */
const LABEL_RE = LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The owner pastes within ten minutes; a stored key signs in as fast as the endpoint answers discovery.
const KEY_WAIT_MS = Number(process.env.SLICE_PROOF_KEY_WAIT_MS ?? (PASTE ? 600_000 : 120_000));
const RUN_WAIT_MS = Number(process.env.SLICE_PROOF_RUN_WAIT_MS ?? 300_000);

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);





// The ONE profile of this proof (`root`, above).
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
  // The host's load as each launch starts (another live run may share the endpoint and this host).
  results.loads.push({ launch: name, at: new Date().toISOString(), load: hostLoad() });
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
  // Written with every known secret substituted out; the caller asserts the raw text held none.
  writeFileSync(join(output, `${name}.log`), redact(log));
  if (result.overran) throw new Error(`${redact(overrunMessage(name, result, log))}\n(see ${name}.log)`);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${name}.log`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  return log;
}
/** Every value that must never reach a log or the output directory: the stored key, and the token the product stored. */
const secrets = new Set(endpoint.key ? [endpoint.key] : []);
const redact = (text) => [...secrets].reduce((out, secret) => out.split(secret).join('[redacted]'), text);
function assertNoCredential(log, name) {
  for (const secret of secrets) if (log.includes(secret)) throw new Error(`${name}.log carries the endpoint's key`);
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

const results = { endpoint: { name: endpoint.name, label: LABEL, baseUrl: BASE_URL, model: MODEL, providerId: PROVIDER_ID, key: PASTE ? 'pasted by the owner (--paste-key)' : 'stored', unmetered: endpoint.unmetered === true }, keyPasted: false, loads: [] };
console.error(`slice-proof: ${LABEL} (${endpoint.name}) at ${BASE_URL}, model ${MODEL}; key ${PASTE ? 'pasted by the owner (--paste-key)' : `from ${endpoint.keySource}`}; load ${hostLoad().join(' ')}`);

// Every red from here on keeps its evidence where the next run does not remove it (`lib/proof-reds.mjs`): the run after
// a red clears `.proof/slice-proof/`, and until 2026-10-04 took the red's logs and screenshots with it
// (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`).
const reds = resolve(repo, '.proof', 'slice-proof-reds');
/** The scenario under way, named in a red's directory and its `red.json`. */
let scenario = 'first-launch';
process.on('uncaughtException', (error) => {
  let kept = null;
  try {
    const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' });
    kept = keepRed({ output, reds, scenario, error, results, commit: head.status === 0 ? head.stdout.trim() : null, redact });
  } catch (failure) {
    console.error(`slice-proof: the red's evidence could not be kept: ${failure instanceof Error ? failure.message : String(failure)}`);
  }
  console.error(redact(error instanceof Error ? (error.stack ?? error.message) : String(error)));
  if (kept !== null) console.error(`slice-proof: red at scenario ${scenario} (load ${hostLoad().join(' ')}); its evidence is kept in ${relative(repo, kept)}`);
  process.exit(1);
});

// 1. First launch: the notice; the add-endpoint dialog; the stored key filled and the dialog's own button pressed, or
//    (--paste-key) the owner pastes the key.
if (PASTE && !replay('first-launch')) {
  console.error('\n================================================================================');
  console.error(' SLICE PROOF — the authentication window will open in the app.');
  console.error(` Paste the API key of ${LABEL} into the "API key" field and press "Add endpoint".`);
  console.error(` The label and URL are filled for you. You have ${Math.round(KEY_WAIT_MS / 60_000)} minutes; the script waits for the credential file.`);
  console.error('================================================================================\n');
}
const log1 = replay('first-launch') ? readFileSync(join(output, 'first-launch.log'), 'utf8') : await launch('first-launch', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_CLICKS: '[data-action="add-endpoint"]@2200',
  ROTARIS_CAPTURE_PROVIDER_FILL: PASTE ? `${LABEL}>>${BASE_URL}` : `${LABEL}>>${BASE_URL}>>${endpoint.key}`,
  ROTARIS_CAPTURE_WAIT: `file:${tokensFile}`, ROTARIS_CAPTURE_WAIT_MS: String(KEY_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
}, KEY_WAIT_MS + 60_000);
assertNoCredential(log1, 'first-launch');
if (!/notice: No model provider is authenticated yet/.test(log1)) throw new Error('the first-launch notice was not raised');
if (!/providers: 0 authenticated/.test(log1)) throw new Error('the first launch did not report zero authenticated providers');
if (/capture: wait for .* timed out/.test(log1) || (!replay('first-launch') && !existsSync(tokensFile))) {
  results.firstLaunch = { notice: 'raised', dialog: /provider dialog filled/.test(log1) ? 'opened and filled' : 'not filled', keyPasted: false };
  writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  if (!PASTE) throw new Error(`the sign-in through the product wrote no credential file within ${KEY_WAIT_MS} ms with the stored key of "${endpoint.name}"; see first-launch.log and first-launch.png`);
  console.error('\nThe key was not pasted within the wait: scenarios 2–6 did not run. Run `pnpm slice-proof --paste-key` again when you can paste it.');
  process.exit(2);
}
results.keyPasted = true;
// The count is the endpoint's own (REQ-PROVIDER-133's discovery): read as a count, at least the one model the proof
// runs on, and worded with a noun that agrees with it (REQ-SHELL-044), never compared with a fixed figure.
const added = new RegExp(`providers: (Added ${LABEL_RE}; discovered (\\d+) (models?)\\.)`).exec(log1);
if (!added) throw new Error(`the sign-in outcome was not logged:\n${redact(log1)}`);
const discovered = Number(added[2]);
if (!Number.isInteger(discovered) || discovered < 1) throw new Error(`the sign-in discovered ${added[2]} models; the proof needs at least ${MODEL}`);
if ((discovered === 1) !== (added[3] === 'model')) throw new Error(`the sign-in notice's noun does not agree with its count: ${added[1]}`);
// After the sign-out scenario the file is gone; a replay reads the credential facts it recorded. The facts are the
// file's shape, never its token: this proof's output directory never holds the key.
const credentialFacts = join(output, 'credential-facts.json');
const credential = existsSync(tokensFile) ? JSON.parse(readFileSync(tokensFile, 'utf8')) : existsSync(credentialFacts) ? { ...JSON.parse(readFileSync(credentialFacts, 'utf8')), replayed: true } : { keys: ['access_token', 'refresh_token', 'expires_at', 'account_id', 'extra'], expires_at: 0, extra: { provider_family: 'openai-compatible', api_base: BASE_URL }, replayed: true };
const storedToken = credential.replayed ? '' : String(credential.access_token ?? '');
if (storedToken !== '' && !secrets.has(storedToken)) {
  // A pasted key is known only now: the first launch's log is written again without it, and asserted again to hold none.
  secrets.add(storedToken);
  if (!replay('first-launch')) writeFileSync(join(output, 'first-launch.log'), redact(log1));
  assertNoCredential(log1, 'first-launch');
}
const credentialKeys = credential.replayed ? credential.keys : Object.keys(credential);
if (existsSync(tokensFile)) writeFileSync(credentialFacts, JSON.stringify({ keys: credentialKeys, expires_at: credential.expires_at, account_id: credential.account_id ?? null, extra: credential.extra }));
if (!credential.replayed && (typeof credential.access_token !== 'string' || credential.access_token.length === 0 || credential.expires_at !== 0 || credential.extra?.provider_family !== 'openai-compatible' || credential.extra?.api_base !== BASE_URL)) throw new Error('the credential file does not carry the five keys with the instance extras');
// The product stored exactly the key it was given through its own dialog.
if (!credential.replayed && !PASTE && credential.access_token !== endpoint.key) throw new Error('the credential file does not hold the key the dialog was given');
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
for (const line of [`  ${PROVIDER_ID}:`, `    id: ${PROVIDER_ID}`, `    display_name: ${LABEL}`, '    family: openai-compatible', `    base_url: ${BASE_URL}`, '    authenticated: true']) if (!snapshot.split('\n').includes(line)) throw new Error(`the snapshot lacks the line ${JSON.stringify(line)}`);
if (!snapshot.startsWith('version: 1\n')) throw new Error('the snapshot does not start with its version');
if (/access_token|sk-or-/.test(snapshot) || [...secrets].some((secret) => snapshot.includes(secret))) throw new Error('the snapshot carries a credential');
const picks = Object.fromEntries(['large_model', 'medium_model', 'small_model', 'fallback_model', 'default_summary_model'].map((k) => [k, new RegExp(`^    ${k}: (.+)$`, 'm').exec(snapshot)?.[1] ?? null]));
if (!snapshot.includes(`      - id: ${QUALIFIED}\n`)) throw new Error(`the catalog did not carry ${MODEL}`);
// REQ-CONFIG-025 / REQ-WORKSPACE-038: the whole starter (header, persona, the twelve nulls), written at the workspace's open
// and found by the sign-in's bootstrap (REQ-WORKSPACE-135). Until 2026-10-03 initialization's record created the file
// first and this check was red on every run whose code-intelligence setup succeeded before the sign-in
// (`docs/defects/fixed/a-first-run-workspace-never-gets-the-starter-agents-yaml.md`).
const starterLacks = existsSync(agentsFile) ? starterMissing(readFileSync(agentsFile, 'utf8')) : ['the file itself'];
if (starterLacks.length > 0) throw new Error(`the starter agents.yaml was not bootstrapped: it lacks ${starterLacks.join(', ')}`);
// The starter runs in `ask` mode, which put the owner at the approval dialog for every tool call of every real run. This
// scratch workspace is the proof's: its runs are unattended from here on (REQ-TOOLS-071's unsandboxed-autonomous consent
// given in the file, as a person would give it in Settings → Runtime).
if (!readFileSync(agentsFile, 'utf8').includes('permission_mode:')) writeFileSync(agentsFile, `${readFileSync(agentsFile, 'utf8')}runtime:\n  permission_mode: autonomous\n  allow_unsandboxed_autonomous: true\n`);
results.firstLaunch = { notice: 'raised', outcome: added[1], discovered, credential: { keys: credentialKeys, expiresAt: credential.expires_at, extra: credential.extra }, protection: dacl ? { protected: dacl.protected, aces: dacl.aces.map((a) => `${a.type};${a.rights};${a.sid.startsWith('S-1-5-21') ? 'owner' : a.sid}`) } : 'posix', picks, bootstrap: 'written' };

scenario = 'slots';
// 2. The three tier slots pinned to the proof model and saved (or, on a one-model endpoint, already its discovered picks).
const log2 = replay('slots') ? readFileSync(join(output, 'slots.log'), 'utf8') : await launch('slots', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  // The slot's model control is the design system's SearchableSelect, not a native `<select>`: named by its label alone,
  // the capture seam drives either kind (`docs/defects/fixed/slice-proof-names-the-model-slots-as-native-selects.md`).
  ROTARIS_CAPTURE_SELECT: `[aria-label="Model for small_model"]>>${QUALIFIED}@2200;;[aria-label="Model for medium_model"]>>${QUALIFIED}@2500;;[aria-label="Model for large_model"]>>${QUALIFIED}@2800`,
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary>>Save@3600',
  ROTARIS_CAPTURE_AFTER_MS: '5200',
});
assertNoCredential(log2, 'slots');
const undriven = log2.split('\n').filter((l) => /capture: select .* → no such (control|option)/.test(l)).map((l) => l.replace(/^.*capture: /, ''));
if (undriven.length > 0) throw new Error(`the slots were not driven:\n${undriven.join('\n')}`);
if (!new RegExp(`providers: 1 authenticated \\(${PROVIDER_ID}\\)`).test(log2)) throw new Error('the relaunch did not find the provider authenticated');
if (/notice: No model provider/.test(log2)) throw new Error('the first-launch notice was raised with a provider authenticated');
const agents = readFileSync(agentsFile, 'utf8');
const TIERS = ['small_model', 'medium_model', 'large_model'];
// An endpoint that serves one model (a self-hosted one, typically) has its sign-in's discovery picks already naming it
// for every tier, shown in the Models page with the origin "discovered". Choosing the value a slot already shows is no
// edit — a setter re-selecting the current value cannot dirty the form (`config-state.ts`'s `applyChange`, the rule
// REQ-CONFIG-335 states for the reasoning setter) — so no Save appears and nothing is written: the tiers name the model
// through the discovered layer, which this scenario then asserts in place of the saved file. An endpoint whose picks
// name other models (OpenRouter's did) takes the edit and the Save, and the saved file is asserted as before.
const pickedAlready = TIERS.every((slot) => results.firstLaunch.picks[slot] === QUALIFIED);
if (pickedAlready) {
  for (const slot of TIERS) {
    const raw = new RegExp(`^${slot}: (.*)$`, 'm').exec(agents)?.[1]?.trim() ?? 'null';
    if (raw !== 'null' && raw !== QUALIFIED) throw new Error(`the slot ${slot} names ${raw} over the discovered ${QUALIFIED}:\n${agents}`);
  }
  const loaded = log2.split('\n').find((l) => /run host: configuration: loaded/.test(l)) ?? '';
  if (!loaded.includes(`slots: small=${QUALIFIED}`) || !loaded.includes(`on openai-compatible/${MODEL} `)) throw new Error(`the run host did not resolve the tiers to ${QUALIFIED}: ${loaded.trim() || 'no configuration line'}`);
  results.slots = { source: 'the discovered picks (one model; re-selecting it is no edit, so nothing was saved)', picks: Object.fromEntries(TIERS.map((slot) => [slot, results.firstLaunch.picks[slot]])), agentsFile: agents };
} else {
  for (const slot of TIERS) if (!agents.includes(`${slot}: ${QUALIFIED}\n`)) throw new Error(`the slot ${slot} was not saved:\n${agents}`);
  results.slots = { source: 'saved from the Models page', agentsFile: agents };
}

scenario = 'run';
// 3. One real run on the leased bearer.
const runLaunch = () => launch('run', {
  ROTARIS_CAPTURE_PROMPT: 'Read README.md in this workspace and tell me its first heading, in one sentence.',
  ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
}, RUN_WAIT_MS + 60_000);
/** What scenario 3 reads from a run's log before the store: no credential, the priming, the request, the wait. */
function runLogRequests(log) {
  assertNoCredential(log, 'run');
  // The lease's report is the run host's (REQ-PROVIDER-068, `LeaseReportLog`); main no longer restates it (a71-9).
  // REQ-PROVIDER-067/068: the priming report is its opening line — the provider among the authenticated, in whatever
  // place the sorted list puts it, and nothing unresolved. That one check is the lease check too: the bearer was leased
  // exactly when the provider is named authenticated. No product code writes "credentials: 1 provider(s) authenticated",
  // which this step asserted before (`docs/defects/fixed/slice-proof-asserts-a-priming-line-the-product-does-not-write.md`).
  const priming = primingProblem(log, PROVIDER_ID);
  if (priming !== null) throw new Error(`the run host did not report the priming: ${priming}`);
  const sent = (log.match(/model request POST (\S+)/g) ?? []).map((l) => l.replace('model request POST ', ''));
  if (!sent.some((u) => u.startsWith(`${BASE_URL}/chat/completions`))) throw new Error(`no request reached ${LABEL} at ${BASE_URL}:\n${sent.join('\n')}`);
  if (/capture: wait for result timed out/.test(log)) throw new Error('the run did not end within the wait');
  return sent;
}
/** The run a scenario-3 log names, read from the store. */
function storedRun(log) {
  const db = new Database(oneDatabase(local), { readonly: true });
  try {
    // The run's own session, named by its log: the newest session is the run's only while the intents have not run, so a
    // replay of this step after them (`--from=spike6` and later) read the third intent's session in its place.
    const runSessionId = /session ([0-9a-f-]{36}) started/.exec(log)?.[1] ?? null;
    const session = runSessionId !== null
      ? db.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, tokens_input, tokens_output FROM sessions WHERE session_id = ?').get(runSessionId)
      : db.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, tokens_input, tokens_output FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    if (!session) throw new Error(`the run's session ${runSessionId ?? '(none named in run.log)'} is not in the store`);
    return {
      session,
      rows: db.prepare('SELECT kind, settled, body FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(session.session_id),
      events: db.prepare('SELECT kind, payload FROM events WHERE session_id = ? ORDER BY ordinal').all(session.session_id),
      audit: db.prepare('SELECT payload FROM launch_audits WHERE session_id = ?').get(session.session_id),
    };
  } finally {
    db.close();
  }
}
let log3 = replay('run') ? readFileSync(join(output, 'run.log'), 'utf8') : await runLaunch();
let requests = runLogRequests(log3);
let stored = storedRun(log3);
// A run the product completed in which the model wrote no answer (run 2 of 2026-10-03: two settled reads, then reasoning
// about requests the run never made, then the end) is the model's call: no requirement makes the product answer for it
// (`lib/live-answers.mjs`; OQ-199). It is reported, its evidence kept as `run.attempt-1.*`, and the run made once more;
// the second run is held to every check below, and a second answerless run is a red that names both.
const firstAttempt = join(output, 'run.attempt-1.json');
if (!replay('run') && answerlessCompletion(stored.session, stored.rows, stored.events)) {
  const attempt = {
    session: stored.session.session_id, status: stored.session.execution_status, stopReason: stored.session.stop_reason,
    rowKinds: stored.rows.map((r) => r.kind), toolRows: stored.rows.filter((r) => r.kind === 'tool').length,
    reasoning: stored.rows.filter((r) => r.kind === 'thinking').map((r) => r.body.slice(0, 600)),
    load: results.loads.at(-1)?.load ?? null,
  };
  writeFileSync(firstAttempt, `${JSON.stringify(attempt, null, 2)}\n`);
  for (const ext of ['.log', '.png']) renameSync(join(output, `run${ext}`), join(output, `run.attempt-1${ext}`));
  // The attempt is the evidence OQ-199 asks about, so it is also copied where the next run's clearing of the output does
  // not reach, whether the run made once more goes green or red.
  const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  const keptAttempt = keepEvidence({ output, into: resolve(repo, '.proof', 'slice-proof-answerless'), label: 'run', record: 'answerless.json', only: (name) => name.startsWith('run.attempt-1.'), fields: { scenario: 'run', question: 'OQ-199', commit: head.status === 0 ? head.stdout.trim() : null, attempt } });
  console.error(`slice-proof: scenario 3's run ${attempt.session} completed (${attempt.stopReason}) without the model writing an answer (rows ${attempt.rowKinds.join(',')}); that is the model's call, not a requirement's. Running it once more; the first attempt is kept as run.attempt-1.log, .png and .json, and in ${relative(repo, keptAttempt)}.`);
  log3 = await runLaunch();
  requests = runLogRequests(log3);
  stored = storedRun(log3);
  if (answerlessCompletion(stored.session, stored.rows, stored.events)) throw new Error(`the run completed without the model writing an answer twice: ${attempt.session} (rows ${attempt.rowKinds.join(',')}; run.attempt-1.*) and ${stored.session.session_id} (rows ${stored.rows.map((r) => r.kind).join(',')}; run.*). REQ-ORCH-069 and REQ-ORCH-115 let both complete; OQ-199 asks whether they should`);
}
const { session, rows, events, audit } = stored;
const kinds = rows.map((r) => r.kind);
const agentRows = answerRows(rows);
const toolRows = rows.filter((r) => r.kind === 'tool');
const usage = events.filter((e) => e.kind === 'usage.update').map((e) => JSON.parse(e.payload));
const lastUsage = usage[usage.length - 1] ?? null;
if (session.execution_status !== 'completed') throw new Error(`the run ended ${session.execution_status} (${session.stop_reason})`);
if (agentRows.length === 0) throw new Error(`no agent row with text: kinds ${kinds.join(',')}`);
if (toolRows.length === 0 || !toolRows.every((r) => r.settled === 1)) throw new Error(`no settled tool row: kinds ${kinds.join(',')}`);
if (!events.some((e) => e.kind === 'result') || !events.some((e) => e.kind === 'session.end')) throw new Error('the terminal pair is missing');
if (!lastUsage || !(JSON.stringify(lastUsage).includes('input'))) throw new Error('no usage figures were recorded');
const auditPayload = audit ? JSON.parse(audit.payload) : null;
const intent = auditPayload?.run_intent ?? null;
results.run = {
  status: session.execution_status, stopReason: session.stop_reason, iterations: session.iterations_completed,
  tokens: { input: session.tokens_input, output: session.tokens_output }, rowKinds: kinds, toolRows: toolRows.length,
  requests: [...new Set(requests)], lastUsage, intent, answer: agentRows.map((r) => r.body).join(' ').slice(0, 400),
  // A first attempt that completed without an answer, kept beside the run that counted (null when there was none).
  answerlessAttempt: existsSync(firstAttempt) ? JSON.parse(readFileSync(firstAttempt, 'utf8')) : null,
};

scenario = 'intents';
// 3b. The intent classifier on the real small slot (REQ-ORCH-005..010; Part L). The slice's first real run fell to
// the fallback because the model answered the request instead of labelling it; each of these runs must classify, never
// fall back, into a category REQ-ORCH-006 and REQ-ORCH-021 leave in reach of its prompt (`INTENTS`, each with its reason,
// `lib/live-answers.mjs`). Until 2026-10-04 the README question accepted `question` alone and went red on the model's
// `explicit_trivial (0.99)` (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`).
results.intents = [];
for (const [i, c] of INTENTS.entries()) {
  const name = `intents-${i + 1}`;
  const log = replay('intents') ? readFileSync(join(output, `${name}.log`), 'utf8') : await launch(name, {
    ROTARIS_CAPTURE_PROMPT: c.prompt, ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '1500',
  }, RUN_WAIT_MS + 60_000);
  assertNoCredential(log, name);
  const verdict = intentVerdict(log, c);
  if (verdict.problem !== null) throw new Error(`${name}: ${verdict.problem}`);
  results.intents.push({ prompt: c.prompt, category: verdict.category, accepted: c.accept, confidence: verdict.confidence, rung: verdict.rung, rungNotes: verdict.rungNotes });
}

scenario = 'spike6';
// 4. Spike 6's live half against the same endpoint and model, with the same key: the stored one, or the token the
//    product stored from the owner's paste. The key reaches the harness through a variable named for it and is never
//    printed; only the harness's figures are kept. With no key in hand (a paste replayed after its sign-out) it is skipped.
//    `--reporter=verbose`: vitest's default reporter prints no test's console lines when every test passes, so the
//    `[spike6]` figures never reached spike6.log (`docs/defects/fixed/slice-proof-keeps-no-spike6-figures.md`).
const spikeKey = endpoint.key ?? storedToken;
const spikeEnv = { ...cleanEnvironment(), ROTARIS_SPIKE6_BASE_URL: BASE_URL, ROTARIS_SPIKE6_MODEL: MODEL, ROTARIS_SPIKE6_API_KEY_ENV: 'ROTARIS_SLICE_PROOF_KEY', ROTARIS_SLICE_PROOF_KEY: spikeKey };
const spikeSkipped = !replay('spike6') && spikeKey === '';
const spike = replay('spike6') || spikeSkipped ? null : process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx vitest run packages/model/src/ai-sdk-live.spike.test.ts --reporter=verbose'], { cwd: repo, encoding: 'utf8', timeout: 300_000, env: spikeEnv })
  : spawnSync('npx', ['vitest', 'run', 'packages/model/src/ai-sdk-live.spike.test.ts', '--reporter=verbose'], { cwd: repo, encoding: 'utf8', timeout: 300_000, env: spikeEnv });
const spikeOut = spike ? redact(`${spike.stdout ?? ''}\n${spike.stderr ?? ''}`) : spikeSkipped ? 'skipped: no key in hand (a pasted key replayed after its sign-out)\n' : readFileSync(join(output, 'spike6.log'), 'utf8');
if (spike || spikeSkipped) writeFileSync(join(output, 'spike6.log'), spikeOut);
const stripAnsi = (text) => text.replace(/\[[0-9;]*m/g, '');
const spikeLines = spikeOut.split('\n').filter((l) => l.includes('[spike6]')).map((l) => stripAnsi(redact(l.replace(/^.*\[spike6\]/, '[spike6]'))).trim());
const spikeSummary = stripAnsi(/Tests\s+(.*)$/m.exec(spikeOut)?.[1] ?? 'no summary').trim();
results.spike6 = { exit: spike ? spike.status : spikeSkipped ? 'skipped' : 'replayed', tests: spikeSummary, lines: spikeLines };

scenario = 'sign-out';
// 5. Sign out from the providers card; the file gone, the snapshot kept.
const log5 = replay('sign-out') ? readFileSync(join(output, 'sign-out.log'), 'utf8') : await launch('sign-out', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  // The row's own "Sign out", then the confirmation's (REQ-PROVIDER's sign-out asks first); the settings panel the step
  // opened before holds no Sign out (`docs/defects/fixed/slice-proof-signs-out-from-a-panel-that-no-longer-holds-sign-out.md`).
  ROTARIS_CAPTURE_CLICKS: `[data-provider="${PROVIDER_ID}"] .provider-row__actions button>>Sign out@2200;;[role="dialog"] .dialog-actions button>>Sign out@3200`,
  ROTARIS_CAPTURE_AFTER_MS: '5000',
});
assertNoCredential(log5, 'sign-out');
const unpressed = log5.split('\n').filter((l) => /capture: no ".*" control on screen/.test(l)).map((l) => l.replace(/^.*capture: /, ''));
if (unpressed.length > 0) throw new Error(`the sign-out was not driven:\n${unpressed.join('\n')}`);
if (!new RegExp(`providers: Signed out of ${LABEL_RE}\\.`).test(log5)) throw new Error(`the sign-out was not logged:\n${redact(log5)}`);
if (existsSync(tokensFile)) throw new Error('the credential file survived the sign-out');
if (!readFileSync(snapshotFile, 'utf8').includes(`  ${PROVIDER_ID}:`)) throw new Error('the sign-out removed the snapshot entry');
results.signOut = { credentialFile: 'removed', snapshot: 'kept' };

scenario = 'refused';
// 6. A prompt with the provider signed out: refused before any session exists (REQ-WORKSPACE-137).
const log6 = replay('refused') ? readFileSync(join(output, 'refused.log'), 'utf8') : await launch('refused', { ROTARIS_CAPTURE_PROMPT: 'Read README.md again.', ROTARIS_CAPTURE_AFTER_MS: '4000' });
assertNoCredential(log6, 'refused');
if (!/providers: 0 authenticated/.test(log6)) throw new Error('the relaunch after sign-out still found a provider authenticated');
if (!/run refused: Provider authentication required/.test(log6)) throw new Error(`the run after sign-out was not refused as specified:\n${redact(log6).split('\n').filter((l) => /refused|session/.test(l)).join('\n')}`);
if (/session .* started/.test(log6)) throw new Error('a session was started without a leased bearer');
results.refused = { refusal: 'Provider authentication required', detail: 'Authenticate at least one configured provider before starting a run.' };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
