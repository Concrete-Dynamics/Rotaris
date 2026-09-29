/**
 * The live run (`pnpm live-run --confirm`): the built application, a real OpenAI-compatible endpoint, a real key
 * and a real workspace, end to end. It is the check to make after a major feature lands — the one thing the
 * scripted proofs cannot do, because every one of them answers the model itself.
 *
 * It never runs on its own: `pnpm check` does not reach it, `pnpm test` does not collect it, and without
 * `--confirm` it prints the plan and exits. It costs real money, so it is bounded three ways: the endpoint and
 * model the owner chose, a ceiling on iterations written into the workspace's configuration, and an accounting
 * check between scenarios that stops the run at `--budget` (default 1.00 USD). What that accounting can read
 * depends on the endpoint (see ACCOUNTING below); the iteration ceiling binds whatever it reads.
 *
 * ENDPOINTS. The owner registers one or more with `--add-endpoint`: a name, the label the product will show, the
 * base URL, the model id, optional prices, and the key behind a hidden prompt. They live in
 * `~/.rotaris/live-run/endpoints.json`; the keys live beside it, one file each, and never in this repository.
 * The default endpoint is the one a bare `--confirm` uses; `--endpoint=<name>` picks another for one run.
 *
 * ACCOUNTING, in order of what the endpoint allows:
 *   1. the provider's own figure — OpenRouter answers `GET /key` with credits used; the difference is the truth;
 *   2. the prices the owner registered — the store's token counts times `input`/`output` USD per million;
 *   3. tokens alone — no money figure exists, so the ceiling is `--max-tokens` (default 500 000) instead.
 * Whichever applies is named in the output and in `results.json`; none of them is ever inferred silently.
 *
 * The workspace is a COPY of `scripts/fixtures/todo-app` in the system temp directory — a small React todo
 * application with its requirements, its pure list functions and a `node --test` suite that needs nothing
 * installed. Its store is the conventional shape of REQ-TRACE-002 — an epic and four children — and its identifiers
 * are REQ-TRACE-022 identifiers, so the requirements BOARD can read it as well as the agent can. `REQ-103` and
 * `REQ-104` are approved and unimplemented on purpose: the first is the work scenario 3 hands over in the composer,
 * the second is the work scenario 4 releases from the board, so neither path depends on what the other did.
 *
 *   1. sign-in  — Settings → Models → Add endpoint, filled and pressed through the product's own dialog; the
 *                 credential file, the snapshot record and the catalogue asserted, the logs free of the key. An
 *                 endpoint that discovers no models takes the dialog's "Continue anyway", and the script writes
 *                 the `models:` entry the run needs by hand (REQ-CONFIG-082..097) rather than pretending.
 *   2. ask      — one real run that reads a file and answers. The lease, the request, a settled tool row, usage.
 *   3. edit     — one real run that implements REQ-103 and runs the suite in the terminal. Asserted from the
 *                 files on disk, from `git diff`, and by running `node --test` again in this script. The work is
 *                 split between two children writing IN PARALLEL, each under a declared write scope (PD-TOOLS-006):
 *                 both delegated with a scope, live at once, told the live scopes at start, and any refusal named.
 *   3b. resume  — PD-ORCH-005 against a real model: a delegating run paused through the composer's own Pause while a
 *                 child runs, the paused composer read, and the run continued through its own Continue. Asserted
 *                 from the store and the traffic: the iteration left open and resumed, every paused child resumed
 *                 under its task id with its record continuing across the pause, and its next request carrying
 *                 what it recorded last; the notes it was asked for are read back from disk.
 *
 * Every scenario that reads a session also asserts its PRICE (PD-MONITOR-001 revision 2): at registered prices the
 * cost reads `configured` and equals the store's tokens times those prices exactly. One run, several mechanisms —
 * so a feature is measured working beside the others, and the run costs no extra scenario for it.
 *   4. requirements — the REQUIREMENTS BOARD, driven as a person drives it: REQ-104 selected, the move control
 *                 pressed, the release confirmed, and the run that follows watched from `backlog` through
 *                 `running` to `review`, its review decision taken and the card left resting in `done`. Asserted
 *                 from the board itself, from the delivery store's own rows, from the worktree the run was confined
 *                 to, and by running `node --test` inside that worktree. It is the one path the composer scenarios
 *                 never take: the work is handed over by the board, not typed into a prompt.
 *   5. shell    — a relaunch with no prompt: Overview painted from the store, the sessions the runs left.
 *   6. frictions — one real run engineered to trip the inducible run-autopsy frictions (first-use
 *                 `write_file` without `operation`, a SIGINT stop on a win32 pipe session), read back from
 *                 the store rather than from the model's report. Red by design until the fixes land; the
 *                 exit-trace friction is recorded but not inducible on demand.
 *   7. faults    — the ENDPOINT misbehaves, on purpose, through the recording proxy: a 429 and a 500 on
 *                 named calls (does the ladder wait, fall back and finish?), then a stream that stops
 *                 mid-answer with the socket held open (is that reported as a user cancellation, which is
 *                 the eighty-second defect's signature?). Neither injected refusal reaches the endpoint,
 *                 so the ladder half costs nothing but retries.
 *   8. terminal  — the TERMINAL under duress, one run, the named shapes replayed from the record: a
 *                 multi-line here-string, forty lines of long output, off Windows a bash-ism `/bin/sh` cannot
 *                 expand (live-run L1), a wedge with no `timeout` supplied,
 *                 an exit-0 output carrying docker's lower-case `failed to connect` line, a `git diff` with
 *                 differences exiting 1, and a read-only git pipeline through a pipe. Asserted from
 *                 `tool_calls`, never from the model's prose; a shape the model never attempted is a NOTE,
 *                 not a failure.
 *   9. duress    — OPT-IN (`--only=duress`), tens of minutes: a delegating run long enough to reach
 *                 compression, re-spawn and a child that ends badly. Its assertions are coherence
 *                 questions the autopsy reader already computes, which is what makes a long run cheap to
 *                 check and hard to fool.
 *
 * The key is never passed on a command line and never written to the repository. For one endpoint `<name>`:
 *   1. `ROTARIS_LIVE_API_KEY` in the environment (for a one-off, or a machine where the prompt cannot run);
 *   2. `~/.rotaris/live-run/<name>.key.dpapi` — Windows DPAPI, this account on this machine only
 *      (`~/.rotaris/live-run/<name>.key`, mode 600, elsewhere).
 * Every log this script writes has the key substituted out of it, and each one is asserted to hold no bearer.
 *
 * EVIDENCE, and what it is FOR. A pack lands at `.live-run/runs/<stamp>/` — packs accumulate, `latest.txt` names
 * the newest, `--keep-runs` (default 10) prunes the oldest — with `results.json` and the copied `workspace.db` at
 * its root and one directory per scenario holding:
 *
 *   app.log            the launch verbatim, key substituted out and asserted free of a bearer, at `--app-log-level`
 *                      (default: the product's own, `info`)
 *   app.filtered.log   the same log without a child MCP server's stderr, consecutive repeats collapsed, the
 *                      sandbox path shortened — two thirds of a launch log is one language server booting
 *   autopsy.txt        `apps/desktop/scripts/autopsy.mjs` over this scenario's session
 *   session.log        the product's own per-session log, at `--session-log-level` (default INFO)
 *   transcript.md      every transcript row in full, not the 400 characters `results.json` keeps
 *   model-traffic.jsonl  what the model was SENT and what came back — bodies, status and duration per call,
 *                      recorded by a loopback proxy the sandbox is pointed at (`--no-record-traffic` skips it).
 *                      The product logs a method and a URL and nothing else, so this exists nowhere else.
 *   *.png              the end of the scenario, plus a fifth and three fifths of the way through its wait
 *   node-test.log, diff.txt, changed/   where the scenario produces them
 *
 * The shape is not arbitrary: it is the input `.agents/skills/run-autopsy/SKILL.md` asks for — a launch log, the
 * session store and a session id. This script produced all three and deleted two of them with the sandbox, which
 * is why every defect that skill has found came from a session driven by hand rather than from a live run. The
 * sandbox still goes away at the end unless `--keep` is given; the record of what happened in it no longer does.
 *
 * The run is unattended and its window is hidden; `--gui` shows it, for watching rather than using.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { cleanEnvironment, configDirFor, findDatabases, hostSwitches, proofIsolationEnv, tokensDirFor } from './lib/harness.mjs';
import { startRecordingProxy } from './lib/model-traffic.mjs';
import { LONG_OUTPUT_LINES, diagnosticOf, hereStringLinesReturned, longOutputReading, outputOf, terminalShapes } from './lib/terminal-shapes.mjs';

const require = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const fixture = join(app, 'scripts', 'fixtures', 'todo-app');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
/**
 * The evidence root, and why a run no longer overwrites the one before it.
 *
 * `.live-run/` used to BE the pack: emptied at every start, so run N-1 was unrecoverable and two runs could never
 * be compared. It is now a directory OF packs — `runs/<stamp>/`, the same stamp the sandbox carries, with
 * `latest.txt` naming the newest — and `--keep-runs` (default 10) prunes the oldest rather than the last one.
 * The whole tree is still gitignored; what changed is that the machine keeps a history the owner can read.
 */
const EVIDENCE_ROOT = resolve(repo, '.live-run');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = join(EVIDENCE_ROOT, 'runs', stamp);
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`the evidence directory escaped the repository: ${output}`);

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit === undefined ? fallback : hit.slice(name.length + 3); };

/**
 * `--gui`: show the window each scenario drives, instead of hiding it. Off by default — the run is unattended and
 * a window that appears on every launch is a nuisance — and asked for explicitly when the owner wants to watch.
 * It changes ONE thing, `windowsHide` on the spawn: every scripted click and keystroke goes through
 * `webContents.sendInputEvent`/`executeJavaScript` in the main process, so it needs no focus and the owner clicking
 * around cannot steal it. The evidence is identical either way — `capturePage()` photographs the composited frame
 * whether the window is on screen or not.
 */
const GUI = has('gui');
const BUDGET = Number(value('budget', '1.00'));
const MAX_TOKENS = Number(value('max-tokens', '500000'));
/**
 * The iteration ceiling written into the sandbox's `runtime.max_iterations`, for every scenario in the run.
 *
 * It was 15 while every scenario here was a short task; the long run made that number the thing being measured
 * rather than a bound on it — a delegating run hits 15 while it is still commissioning, and reports its own
 * ceiling as a result about the product. Raised to 500 by the owner's decision of 2026-09-22.
 *
 * **What that gives up, stated rather than buried:** this is the bound that exists so one confused run cannot
 * spend the lot, and 500 iterations against a METERED endpoint is a great deal more than 15. What still holds
 * is the accounting gate between scenarios (`--budget`, or `--max-tokens` where no money figure exists) and the
 * endpoint's own limits; what no longer holds is a tight bound WITHIN one run. The endpoint this was raised for
 * is registered unmetered, where the cost of a long run is wall clock. Name `--max-iterations` on a metered one.
 */
const MAX_ITERATIONS = Number(value('max-iterations', '500'));
const KEEP_RUNS = Math.max(1, Number(value('keep-runs', '10')));
/**
 * The session log level written into the sandbox's own configuration. `WARNING` is the product's default and
 * holds warnings alone; `INFO` adds the run-end line, the hook lines and the checkpoint lines. It is NOT raised
 * to `DEBUG` by default and that is deliberate: the engine has no `debug` call site on this log, so `DEBUG` and
 * `INFO` are the same file and naming the louder one would imply a detail that does not exist.
 */
const SESSION_LOG_LEVEL = value('session-log-level', 'INFO');
/**
 * The APPLICATION log's threshold, the one `session_log_level` never reaches (PD-MONITOR-002). The product reads it
 * from `ROTARIS_APP_LOG_LEVEL` alone, and `cleanEnvironment()` strips that name from every launch, so an exported
 * variable never gets through: this flag is how a live run asks for `debug` — a child MCP server's stderr among it.
 * Unnamed, nothing is set and the launch keeps the product's default, `info`. The value is checked against the
 * directive's four words here, because the product answers a word it does not know by recording `info` and
 * writing one warning line, which a pack read afterwards would show as a run that quietly did not ask.
 */
const APP_LOG_LEVEL = value('app-log-level', null);
if (APP_LOG_LEVEL !== null && !/^(?:debug|info|warning|error)$/i.test(APP_LOG_LEVEL)) {
  console.error(`--app-log-level=${APP_LOG_LEVEL}: expected debug, info, warning or error (PD-MONITOR-002)`);
  process.exit(2);
}
/**
 * `--no-record-traffic`: talk to the endpoint directly instead of through the recording proxy.
 *
 * The proxy is on by default because what the model was sent and what it answered is the one thing no pack has
 * ever carried, and it is where most of the questions a red raises are settled. It is a raw pipe — chunks are
 * forwarded as they arrive, nothing buffered — so a streamed completion reaches the product exactly as the
 * endpoint sent it. The flag exists for the run where the proxy itself is the suspect.
 */
const RECORD_TRAFFIC = !has('no-record-traffic');
/**
 * Declared here rather than where it is started, because the signal handlers below close over it and a Ctrl-C
 * during the build would otherwise reach a `let` still in its temporal dead zone — an exception inside the
 * handler whose whole job is to make sure the sandbox's credentials are deleted.
 */
let proxy = null;
const closeProxy = () => { try { proxy?.close(); } catch { /* the run is ending either way */ } };
const SIGN_IN_WAIT_MS = Number(process.env['LIVE_RUN_SIGN_IN_WAIT_MS'] ?? 120_000);
const RUN_WAIT_MS = Number(process.env['LIVE_RUN_WAIT_MS'] ?? 420_000);
/**
 * The edit scenario carries two children writing in parallel and a verifier after them, so it needs more wall clock
 * than one agent editing alone. The first run with them measured the work done at about five minutes and the run
 * still open at seven, the entry agent having delegated an unasked-for inspection; twice the ordinary wait covers the
 * work, and the prompt closes the detour.
 */
const EDIT_WAIT_MS = Number(process.env['LIVE_RUN_EDIT_WAIT_MS'] ?? RUN_WAIT_MS * 2);
const OPTIONAL = ['ask', 'edit', 'resume', 'requirements', 'shell', 'frictions', 'faults', 'terminal'];
/**
 * Scenarios that `--only` accepts and the default set never contains.
 *
 * `duress` is the long run — a delegating, compressing, re-spawning run measured in tens of minutes rather
 * than in the four each other scenario takes. The ordinary live run is a smoke test and stays one; a scenario
 * that trebles its wall clock does not belong in it by default, and a scenario nobody can leave out is a
 * scenario people stop running. Naming it is the consent.
 */
const OPT_IN = ['duress'];
const SCENARIOS = [...OPTIONAL, ...OPT_IN];
const only = value('only', null);
const wanted = only === null ? OPTIONAL : only.split(',').map((s) => s.trim()).filter((s) => s !== '');
for (const name of wanted) if (!SCENARIOS.includes(name)) throw new Error(`--only takes ${SCENARIOS.join(', ')}; got ${name}`);
/**
 * The workspace the `duress` scenario opens. `todo-app` is five files — enough to commission delegation by
 * instruction, not enough to commission it by weight — so the scenario reports which fixture it ran against
 * rather than implying the default was a considered choice. Point it at a larger throwaway tree to ask the
 * harder question; the scenario asserts the same things either way.
 */
const DURESS_FIXTURE = value('duress-fixture', null);
const DURESS_MS = Number(process.env['LIVE_RUN_DURESS_MS'] ?? 2_400_000);
/*
 * A named fixture replaces the workspace for the WHOLE run, because one sandbox holds one store and
 * `oneDatabase` refuses a second. Every other scenario's prompt names files `todo-app` has, so running them
 * against someone else's tree would fail them for a reason that is not about the product. Refused rather than
 * silently allowed: the reader of a red must never have to wonder which fixture produced it.
 */
if (DURESS_FIXTURE !== null && wanted.some((name) => name !== 'duress')) {
  throw new Error(`--duress-fixture replaces the workspace, so it runs with --only=duress alone; got --only=${wanted.join(',')}`);
}

// ── The endpoint registry and the key store ──────────────────────────────────────────────────────────────────
const HOME_DIR = join(homedir(), '.rotaris', 'live-run');
const REGISTRY = join(HOME_DIR, 'endpoints.json');
const KEY_ENV = 'ROTARIS_LIVE_API_KEY';
/**
 * The shell the key store talks to, probed once: PowerShell 7 first, because Windows PowerShell 5.1 cannot always
 * load `Microsoft.PowerShell.Security` — where the DPAPI cmdlets live — and a host that cannot load it cannot
 * encrypt. The probe is the cmdlet itself, not the version banner; when neither host answers, `storeKey` falls back.
 */
let powershellProbed;
function powershell() {
  if (powershellProbed !== undefined) return powershellProbed;
  const candidates = process.platform === 'win32' ? ['pwsh.exe', join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')] : ['pwsh'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-NoProfile', '-NonInteractive', '-Command', 'ConvertTo-SecureString -String 1 -AsPlainText -Force | Out-Null'], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0) { powershellProbed = candidate; return powershellProbed; }
  }
  powershellProbed = candidates[candidates.length - 1];
  return powershellProbed;
}
const dpapiFileFor = (name) => join(HOME_DIR, `${name}.key.dpapi`);
const plainFileFor = (name) => join(HOME_DIR, `${name}.key`);
/** Whichever form this account's key is in: the DPAPI ciphertext when there is one, the protected file otherwise. */
const keyFileFor = (name) => (existsSync(dpapiFileFor(name)) ? dpapiFileFor(name) : plainFileFor(name));
const hasKey = (name) => existsSync(dpapiFileFor(name)) || existsSync(plainFileFor(name));
/** The file's own protection: inheritance off and this account alone on Windows, mode 600 elsewhere. */
function lockDown(file) {
  if (process.platform !== 'win32') { chmodSync(file, 0o600); return; }
  const icacls = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'icacls.exe');
  spawnSync(icacls, [file, '/inheritance:r', '/grant:r', `${process.env['USERNAME'] ?? ''}:F`], { encoding: 'utf8', windowsHide: true });
}
/** REQ-PROVIDER-051, repeated here so the script can name the credential file before the app writes it. */
const instanceIdFor = (label) => `openai-compatible--${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;

function registry() {
  if (!existsSync(REGISTRY)) return { default: null, endpoints: {} };
  const read = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  return { default: read.default ?? null, endpoints: read.endpoints ?? {} };
}
function writeRegistry(next) {
  mkdirSync(HOME_DIR, { recursive: true });
  writeFileSync(REGISTRY, `${JSON.stringify(next, null, 2)}\n`);
}
/**
 * Storage, best available first: DPAPI through PowerShell's SecureString — ciphertext this account on this
 * machine can read and nothing else — and, where that shell cannot load `Microsoft.PowerShell.Security` (a
 * constrained host, a policy), the key in a file whose ACL names this account alone. Which one was used is
 * returned and printed; it is never quietly the weaker of the two.
 */
function storeKey(name, secret) {
  mkdirSync(HOME_DIR, { recursive: true });
  if (process.platform === 'win32') {
    const file = dpapiFileFor(name);
    const script = `$k = ConvertTo-SecureString -String $env:ROTARIS_LIVE_RUN_SECRET -AsPlainText -Force; ConvertFrom-SecureString -SecureString $k | Set-Content -NoNewline -Encoding ascii -Path ${JSON.stringify(file)}`;
    const written = spawnSync(powershell(),['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, env: { ...process.env, ROTARIS_LIVE_RUN_SECRET: secret } });
    if (written.status === 0 && existsSync(file)) { lockDown(file); rmSync(plainFileFor(name), { force: true }); return { file, protection: 'DPAPI, this account on this machine' }; }
    rmSync(file, { force: true });
    const plain = plainFileFor(name);
    writeFileSync(plain, secret);
    lockDown(plain);
    return { file: plain, protection: `an owner-only ACL — DPAPI was not available (${(written.stderr ?? '').split('\n')[0]?.trim() || `powershell exited ${written.status}`})` };
  }
  const plain = plainFileFor(name);
  writeFileSync(plain, secret, { mode: 0o600 });
  lockDown(plain);
  return { file: plain, protection: 'mode 600' };
}
function storedKey(name) {
  const file = keyFileFor(name);
  if (!existsSync(file)) return null;
  if (!file.endsWith('.dpapi')) return readFileSync(file, 'utf8').trim();
  const read = spawnSync(powershell(),['-NoProfile', '-NonInteractive', '-Command', `$s = Get-Content -Raw -Path ${JSON.stringify(file)} | ConvertTo-SecureString; [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))`], { encoding: 'utf8', windowsHide: true });
  if (read.status !== 0) throw new Error(`${file} could not be decrypted — DPAPI binds it to one account on one machine. Store it again with \`pnpm live-run --set-key --endpoint=${name}\`.\n${read.stderr?.trim() ?? ''}`);
  return read.stdout.trim();
}
/** A hidden prompt: PowerShell's own on Windows, `stty -echo` elsewhere. The secret never reaches a command line. */
function promptSecret(what) {
  if (!process.stdin.isTTY) throw new Error(`there is no terminal to prompt on; put the key in ${KEY_ENV} for this command instead`);
  if (process.platform === 'win32') {
    const script = `$k = Read-Host -AsSecureString ${JSON.stringify(what)}; [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($k))`;
    const read = spawnSync(powershell(),['-NoProfile', '-Command', script], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
    if (read.status !== 0) throw new Error('nothing was entered');
    return read.stdout.trim();
  }
  const read = spawnSync('sh', ['-c', `stty -echo < /dev/tty; printf '%s: ' ${JSON.stringify(what)} > /dev/tty; read k < /dev/tty; stty echo < /dev/tty; printf '\\n' > /dev/tty; printf '%s' "$k"`], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (read.status !== 0) throw new Error('nothing was entered');
  return read.stdout.trim();
}

/**
 * Registration. Every field may arrive as a flag (`--name= --label= --base-url= --model= --in-price= --out-price=`),
 * so this is scriptable; whatever is missing is asked for, which needs a terminal. The key comes from the hidden
 * prompt, or from the environment when there is no terminal to prompt on — never from a flag.
 */
async function addEndpoint() {
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (given, question) => {
    if (given !== null) return given.trim();
    if (rl === null) throw new Error('there is no terminal to prompt on; pass --name= --label= --base-url= --model= and put the key in ROTARIS_LIVE_API_KEY');
    return (await rl.question(question)).trim();
  };
  try {
    const reg = registry();
    const name = await ask(value('name', null), 'A short name for this endpoint (e.g. custom, openrouter): ');
    if (name === '' || !/^[a-z0-9][a-z0-9-]*$/i.test(name)) throw new Error('the name must be alphanumeric with dashes');
    const label = await ask(value('label', null), 'The label the product shows (e.g. My Endpoint): ');
    if (label === '') throw new Error('the label must not be empty');
    const baseUrl = await ask(value('base-url', null), 'The OpenAI-compatible base URL (the part before /chat/completions): ');
    if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error('the base URL needs a scheme and a host');
    const model = await ask(value('model', null), 'The model id as the endpoint names it: ');
    if (model === '') throw new Error('the model id must not be empty');
    const inUsd = await ask(value('in-price', rl === null ? '' : null), 'Input price, USD per million tokens (blank if unknown): ');
    const outUsd = await ask(value('out-price', rl === null ? '' : null), 'Output price, USD per million tokens (blank if unknown): ');
    const context = await ask(value('context', rl === null ? '' : null), 'Context window in tokens (blank to take whatever discovery reports): ');
    const unmeteredHere = has('unmetered') || (rl !== null && /^y/i.test(await ask(null, 'Unmetered — your own hardware, no cost ceiling? [y/N]: ')));
    rl?.close();
    // Re-registering keeps the key already stored; only a key in the environment, or `--set-key`, replaces one.
    const fromEnv = (process.env[KEY_ENV] ?? '').trim();
    const keep = fromEnv === '' && hasKey(name);
    const secret = keep ? null : fromEnv !== '' ? fromEnv : promptSecret('API key (hidden)');
    if (!keep && (secret === null || secret === '')) throw new Error('no key was entered');
    const stored = keep ? { file: keyFileFor(name), protection: 'kept as it was' } : storeKey(name, secret);
    reg.endpoints[name] = {
      label, baseUrl: baseUrl.replace(/\/+$/, ''), model,
      inputUsdPerMillion: inUsd === '' ? null : Number(inUsd),
      outputUsdPerMillion: outUsd === '' ? null : Number(outUsd),
      contextTokens: context === '' ? null : Number(context),
      unmetered: unmeteredHere,
    };
    if (reg.default === null || has('default')) reg.default = name;
    writeRegistry(reg);
    console.log(`\nregistered "${name}" → ${label} at ${baseUrl}, model ${model}`);
    console.log(`key at ${stored.file} (${stored.protection})`);
    console.log(reg.default === name ? `"${name}" is the default endpoint.` : `the default endpoint is still "${reg.default}".`);
  } finally {
    rl?.close();
  }
}
function listEndpoints() {
  const reg = registry();
  const names = Object.keys(reg.endpoints);
  if (names.length === 0) { console.log(`no endpoints registered; run \`pnpm live-run --add-endpoint\``); return; }
  for (const name of names) {
    const e = reg.endpoints[name];
    const priced = e.inputUsdPerMillion !== null && e.outputUsdPerMillion !== null;
    console.log(`${name === reg.default ? '*' : ' '} ${name.padEnd(14)} ${e.label} — ${e.baseUrl}  model ${e.model}  ${hasKey(name) ? 'key stored' : 'NO KEY'}${e.unmetered ? '  unmetered' : priced ? `  ${e.inputUsdPerMillion}/${e.outputUsdPerMillion} USD per Mtok` : '  unpriced'}${typeof e.contextTokens === 'number' ? `  ${e.contextTokens} ctx` : ''}`);
  }
  console.log('\n* is the default. `--endpoint=<name>` picks another for one run.');
}

const USAGE = `pnpm live-run — the application against a real model endpoint, on purpose only.

  pnpm live-run                     the plan, and nothing else
  pnpm live-run --confirm           the run (it spends money; the ceiling is --budget, default 1.00 USD)

  pnpm live-run --add-endpoint      register an endpoint: label, base URL, model, context, prices, key (hidden)
                                    scripted: --name= --label= --base-url= --model= --context=<tokens>
                                              --in-price= --out-price= --unmetered --default
  pnpm live-run --endpoints         list what is registered, which is the default, which has a key
  pnpm live-run --set-default=<n>   make one the default
  pnpm live-run --set-key           replace one endpoint's key      (with --endpoint=<name>)
  pnpm live-run --forget-key        delete one endpoint's key       (with --endpoint=<name>)
  pnpm live-run --remove-endpoint=<n>

  --endpoint=<name>    the endpoint to run against (default: the registry's default)
  --model=<id>         override the endpoint's model for this run (and skip discovery)
  --no-discover-model  keep the registered model instead of reading the endpoint's /models listing
  --base-url=<url>     override the endpoint's base URL for this run
  --budget=<usd>       stop when the spend crosses this (default 1.00); needs a provider figure or prices
  --max-tokens=<n>     the ceiling when no money figure exists (default 500000)
                       an endpoint registered --unmetered carries no ceiling unless one of these two is named here
  --max-iterations=<n> the ceiling written into the workspace's runtime configuration (default 500)
  --only=<csv>         run only some of ${OPTIONAL.join(', ')} (sign-in always runs; the sandbox is fresh)
                       and ${OPT_IN.join(', ')}, which only run when named — the long one, tens of minutes
  --duress-fixture=<dir>  the workspace duress opens (default: the same small todo-app the others use)
  --keep-runs=<n>      evidence packs to keep under .live-run/runs (default 10; the oldest are pruned)
  --session-log-level=<lvl>  the sandbox's session_log_level (default INFO; WARNING is the product's own default)
  --app-log-level=<lvl>      the application log's threshold, ROTARIS_APP_LOG_LEVEL (debug|info|warning|error;
                             default: unset, the product's own info)
  --no-record-traffic  talk to the endpoint directly; do not record request and response bodies
  --gui                show the window each scenario drives, to watch it (hidden by default; nothing else changes)
  --keep               keep the sandbox workspace instead of deleting it
  --skip-build         trust apps/desktop/out as it stands
`;

if (has('help')) { console.log(USAGE); process.exit(0); }
if (has('endpoints')) { listEndpoints(); process.exit(0); }
if (has('add-endpoint')) { await addEndpoint(); process.exit(0); }
if (value('set-default', null) !== null) {
  const reg = registry();
  const name = value('set-default', '');
  if (!reg.endpoints[name]) { console.error(`no endpoint named "${name}"`); process.exit(1); }
  reg.default = name; writeRegistry(reg); console.log(`the default endpoint is "${name}"`); process.exit(0);
}
if (value('remove-endpoint', null) !== null) {
  const reg = registry();
  const name = value('remove-endpoint', '');
  if (!reg.endpoints[name]) { console.error(`no endpoint named "${name}"`); process.exit(1); }
  delete reg.endpoints[name];
  if (reg.default === name) reg.default = Object.keys(reg.endpoints)[0] ?? null;
  writeRegistry(reg); rmSync(dpapiFileFor(name), { force: true }); rmSync(plainFileFor(name), { force: true });
  console.log(`removed "${name}" and its key`); process.exit(0);
}

/** The endpoint this invocation is about: --endpoint, else the registry's default. */
function chosenEndpoint() {
  const reg = registry();
  const name = value('endpoint', reg.default);
  if (name === null) return null;
  const found = reg.endpoints[name];
  if (!found) throw new Error(`no endpoint named "${name}"; \`pnpm live-run --endpoints\` lists them`);
  return { name, ...found, baseUrl: value('base-url', found.baseUrl).replace(/\/+$/, ''), model: value('model', found.model) };
}

if (has('set-key')) {
  const endpoint = chosenEndpoint();
  if (endpoint === null) { console.error('no endpoint registered; run `pnpm live-run --add-endpoint`'); process.exit(1); }
  const stored = storeKey(endpoint.name, promptSecret(`API key for ${endpoint.name} (hidden)`));
  console.log(`stored at ${stored.file} (${stored.protection})`); process.exit(0);
}
if (has('forget-key')) {
  const endpoint = chosenEndpoint();
  if (endpoint === null) { console.error('no endpoint registered'); process.exit(1); }
  const removed = [dpapiFileFor(endpoint.name), plainFileFor(endpoint.name)].filter((file) => existsSync(file));
  for (const file of removed) rmSync(file, { force: true });
  console.log(removed.length === 0 ? `no key was stored for "${endpoint.name}"` : `removed ${removed.join(', ')}`); process.exit(0);
}

const endpoint = chosenEndpoint();
if (endpoint === null) {
  console.log(USAGE);
  console.error('No endpoint is registered. Run `pnpm live-run --add-endpoint` first.');
  process.exit(1);
}
const envKey = (process.env[KEY_ENV] ?? '').trim();
const keySource = envKey !== '' ? `the environment (${KEY_ENV})` : hasKey(endpoint.name) ? keyFileFor(endpoint.name) : null;
const key = envKey !== '' ? envKey : hasKey(endpoint.name) ? storedKey(endpoint.name) : null;

/**
 * The model the run uses, asked of the ENDPOINT rather than remembered.
 *
 * A self-hosted endpoint serves whatever is loaded into it, and what is loaded changes — the registry's stored id
 * is a note of what was there when it was registered, not a fact about what is there now. So the endpoint's own
 * `/models` listing is read at every start and its FIRST entry is the model the run uses, exactly as a caller with
 * no prior knowledge would pick one. The stored id stays as the fallback for an endpoint that serves no listing,
 * and `--model=` still wins over both: an explicit choice is never overridden by discovery.
 *
 * Failure is never fatal. A listing that cannot be read, is empty, or is not the shape OpenAI's API documents
 * leaves the stored id in place and says why — the run is about the product, and refusing to start it over a
 * convenience read would be the wrong trade.
 */
async function discoverModel(baseUrl, bearer) {
  const url = `${baseUrl}/models`;
  try {
    const res = await fetch(url, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
    if (!res.ok) return { ok: false, reason: `${url} answered ${res.status} ${res.statusText}` };
    const body = await res.json();
    const list = Array.isArray(body?.data) ? body.data : null;
    if (list === null) return { ok: false, reason: `${url} answered without a \`data\` array` };
    const ids = list.map((entry) => (typeof entry?.id === 'string' ? entry.id.trim() : '')).filter((id) => id !== '');
    if (ids.length === 0) return { ok: false, reason: `${url} lists no model with an id` };
    const first = list.find((entry) => typeof entry?.id === 'string' && entry.id.trim() === ids[0]) ?? {};
    return { ok: true, model: ids[0], all: ids, url, entry: first };
  } catch (cause) {
    return { ok: false, reason: `${url} could not be reached: ${String(cause instanceof Error ? cause.message : cause)}` };
  }
}

const modelWasAsked = value('model', null) !== null;
const discovery = modelWasAsked || has('no-discover-model') ? null : await discoverModel(endpoint.baseUrl, key);
if (discovery?.ok) {
  endpoint.model = discovery.model;
  /*
   * The context window comes from the same listing, for the same reason the model does: the registry's figure was
   * measured against whatever was loaded the day the endpoint was registered, and a different model has a different
   * window. vLLM states it as `max_model_len`; an OpenAI-compatible gateway may state `context_length`. Neither is
   * guaranteed, so an entry that states no window leaves the registered figure alone rather than clearing it.
   */
  const stated = [discovery.entry?.max_model_len, discovery.entry?.context_length].find((n) => typeof n === 'number' && n > 0);
  if (stated !== undefined) endpoint.contextTokens = stated;
}
const modelSource = modelWasAsked ? '--model' : discovery === null ? 'the registry (discovery off)' : discovery.ok ? `discovered from ${discovery.url}` : `the registry — discovery failed: ${discovery.reason}`;

const PROVIDER_ID = instanceIdFor(endpoint.label);
const QUALIFIED = `${PROVIDER_ID}/${endpoint.model}`;
/** OpenRouter is the one endpoint in this build whose own accounting can be read; everything else is priced or counted. */
const providerAccounting = /(^|\/\/|\.)openrouter\.ai(\/|$)/.test(endpoint.baseUrl);
const priced = typeof endpoint.inputUsdPerMillion === 'number' && typeof endpoint.outputUsdPerMillion === 'number';
/** An endpoint registered unmetered spends nothing that needs guarding — the owner's own hardware — so no ceiling
 * is imposed on it unless this invocation asks for one by naming `--budget` or `--max-tokens` itself. */
const unmetered = endpoint.unmetered === true;
const ceilingAsked = argv.some((a) => a.startsWith('--budget=') || a.startsWith('--max-tokens='));
const accountingKind = unmetered && !ceilingAsked ? 'unmetered' : providerAccounting ? 'provider' : priced ? 'priced' : 'tokens';

if (!has('confirm')) {
  console.log(USAGE);
  console.log(`Endpoint: ${endpoint.name} — ${endpoint.label} at ${endpoint.baseUrl}`);
  console.log(`Model:    ${endpoint.model} (${modelSource})${discovery?.ok && discovery.all.length > 1 ? `; the endpoint also serves ${discovery.all.slice(1).join(', ')}` : ''}`);
  console.log(`Context:  ${typeof endpoint.contextTokens === 'number' ? `${endpoint.contextTokens} tokens` : 'whatever discovery reports'}`);
  console.log(`Plan:     ${['sign-in', ...wanted].join(' → ')}, ${MAX_ITERATIONS} iterations per run`);
  console.log(`Window:   ${GUI ? 'shown — each scenario appears on screen (--gui)' : 'hidden — add --gui to watch it'}`);
  console.log(`Traffic:  ${RECORD_TRAFFIC ? 'recorded — request and response bodies through a loopback proxy, one file per scenario' : 'not recorded (--no-record-traffic)'}`);
  console.log(`Ceiling:  ${accountingKind === 'unmetered' ? 'none — registered unmetered; only the iteration ceiling binds' : accountingKind === 'tokens' ? `${MAX_TOKENS} tokens (this endpoint reports no cost and carries no prices)` : `${BUDGET.toFixed(2)} USD, ${accountingKind === 'provider' ? "read from the provider's own accounting" : 'estimated from the registered prices'}`}`);
  console.log(`Key:      ${keySource ?? `NONE — run \`pnpm live-run --set-key --endpoint=${endpoint.name}\`, or set ${KEY_ENV}`}`);
  console.log('\nNothing ran. Add --confirm to spend.');
  process.exit(2);
}
if (key === null || key === '') { console.error(`No key for "${endpoint.name}". Run \`pnpm live-run --set-key --endpoint=${endpoint.name}\`, or set ${KEY_ENV}.`); process.exit(1); }
const redact = (text) => text.split(key).join('[redacted]');
console.log(`Model:    ${endpoint.model} (${modelSource})`);
if (GUI) console.log('window:   shown (--gui) — the window is driven from inside the process, so clicking it does not steer the run, but typing into it does write into the product');

// ── What has been spent ──────────────────────────────────────────────────────────────────────────────────────
async function providerCredits() {
  const res = await fetch(`${endpoint.baseUrl}/key`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`the endpoint refused the key check: ${res.status} ${res.statusText}`);
  const body = await res.json();
  const data = body?.data ?? {};
  return { usage: typeof data.usage === 'number' ? data.usage : null, remaining: data.limit_remaining ?? null };
}
const before = accountingKind === 'provider' ? await providerCredits() : { usage: null, remaining: null };
if (before.remaining !== null && before.remaining < BUDGET) console.error(`warning: the key has ${before.remaining} USD left, below the ${BUDGET.toFixed(2)} USD ceiling.`);

// ── The build, the sandbox and the evidence ──────────────────────────────────────────────────────────────────
/**
 * Prune, never wipe. The newest `KEEP_RUNS` packs stay; the oldest go. A pack that cannot be removed — the same
 * locked handle the sandbox sweep already forgives — is reported and skipped rather than killing the run before
 * it starts, because losing an old pack is not a reason to lose this one.
 */
mkdirSync(join(EVIDENCE_ROOT, 'runs'), { recursive: true });
const priorRuns = readdirSync(join(EVIDENCE_ROOT, 'runs')).sort();
for (const old of priorRuns.slice(0, Math.max(0, priorRuns.length - (KEEP_RUNS - 1)))) {
  try { rmSync(join(EVIDENCE_ROOT, 'runs', old), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (cause) { console.error(`warning: the pack ${old} could not be pruned: ${cause instanceof Error ? cause.message : String(cause)}`); }
}
mkdirSync(output, { recursive: true });
writeFileSync(join(EVIDENCE_ROOT, 'latest.txt'), `${output}\n`);
if (!has('skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`the desktop build exited ${built.status ?? built.signal ?? 'unknown'}; see build.log`);
}
if (!existsSync(electron)) throw new Error(`the Electron executable is absent: ${electron}`);

const SANDBOX_ROOT = join(tmpdir(), 'rotaris-live-run');
const KEPT = 'KEPT';
/**
 * The sandbox holds a real credential — the app writes the leased key into its own store, exactly as it would on
 * the owner's machine — so the credential directory is deleted on every exit path there is, including `--keep`,
 * a thrown error and a Ctrl-C. `--keep` keeps the workspace and the store to read, never the key.
 */
const dropCredentials = (dir) => rmSync(tokensDirFor(join(dir, 'local')), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
function cleanup(keep) {
  dropCredentials(sandbox);
  if (keep) writeFileSync(join(sandbox, KEPT), `kept by --keep at ${new Date().toISOString()}; its credential store was deleted.\n`);
  else rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
// Whatever a previous run left behind loses its credentials now, and loses everything unless it was kept on purpose.
// A locked handle (measured 2026-09-19: a Serena language server kept the prior sandbox's workspace open past
// process exit, so `rmSync` threw EPERM out of the sweep and the run died before starting) must never kill the
// run: the sweep reports the leftover and continues, and the startup of THIS run re-sweeps it next time.
for (const old of existsSync(SANDBOX_ROOT) ? readdirSync(SANDBOX_ROOT) : []) {
  const dir = join(SANDBOX_ROOT, old);
  try {
    dropCredentials(dir);
    if (!existsSync(join(dir, KEPT))) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (cause) {
    console.error(`warning: the previous sandbox could not be swept (${dir}): ${cause instanceof Error ? cause.message : String(cause)} — continuing with a fresh one.`);
  }
}
const sandbox = join(SANDBOX_ROOT, stamp);
const workspace = join(sandbox, 'workspace');
const local = join(sandbox, 'local');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
// An interrupt or a crash is an exit path too: it may not strand the key in the temp directory.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { console.error(`\n${signal}: deleting the sandbox.`); closeProxy(); cleanup(false); process.exit(130); });
for (const fatal of ['uncaughtException', 'unhandledRejection']) process.on(fatal, (error) => { console.error(`${fatal}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`); closeProxy(); cleanup(false); process.exit(1); });
const workspaceFixture = DURESS_FIXTURE === null ? fixture : resolve(DURESS_FIXTURE);
if (!existsSync(workspaceFixture)) throw new Error(`--duress-fixture names no directory: ${workspaceFixture}`);
cpSync(workspaceFixture, workspace, { recursive: true, filter: (from) => !/[\\/](?:node_modules|\.git)$/.test(from) });
const GIT_IDENTITY = { GIT_AUTHOR_NAME: 'rotaris-live-run', GIT_AUTHOR_EMAIL: 'live-run@rotaris.invalid', GIT_COMMITTER_NAME: 'rotaris-live-run', GIT_COMMITTER_EMAIL: 'live-run@rotaris.invalid' };
const git = (...args) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).trim();
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { console.error('the live run needs git on PATH: the workspace is a repository and the edit is read back from `git diff`.'); process.exit(1); }
git('init', '-q', '-b', 'main');
git('add', '.');
git('commit', '-q', '-m', `${basename(workspaceFixture)}, before the live run`);
const head = git('rev-parse', 'HEAD');

const tokensFile = join(tokensDirFor(local), `${PROVIDER_ID}.json`);
const snapshotFile = join(configDirFor(local), 'project_settings.yaml');
const agentsFile = join(workspace, '.rotaris', 'agents.yaml');

function oneDatabase() {
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  return databases[0];
}

/** What each scenario left in the pack, reported in `results.json` so a reader knows what exists without listing it. */
const scenarioEvidence = {};

/** One scenario's recorded model traffic, as records. An absent or half-written file reads as no records. */
function readTraffic(name) {
  const file = join(output, name, 'model-traffic.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}
/** One directory per scenario, so a pack reads as the run did rather than as one flat heap of prefixed names. */
function scenarioDir(name) {
  const dir = join(output, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * The readable half of the launch log. The verbatim log is always kept beside it — a line this drops must be
 * recoverable, so nothing here is a substitute for `app.log`, only a way to read it.
 *
 * Three reductions, in order of how much they take:
 *   1. a child MCP server's stderr, forwarded into the application log at `debug` by `packages/mcp/src/transport.ts`.
 *      Two thirds of a live launch log was one language server's boot noise (190 of 288 lines, measured on the
 *      2026-09-21 pack; 141 of 195 measured independently on 2026-09-16). Since PD-MONITOR-002 the product records
 *      `info` and above unless `ROTARIS_APP_LOG_LEVEL` says otherwise, and `cleanEnvironment()` strips that name from
 *      this launch, so those lines are absent from `app.log` unless `--app-log-level=debug` or a scenario's own
 *      `extra` sets it to `debug`.
 *   2. consecutive repeats of one line, collapsed to the line and a count, the shape `transport.ts` already uses.
 *   3. the sandbox's absolute path, which prefixes most lines at about ninety characters, shortened to `<sandbox>`.
 */
function filterLog(text, sandboxPath) {
  const dropped = { mcpStderr: 0, repeats: 0 };
  const short = (line) => line.split(sandboxPath).join('<sandbox>');
  const out = [];
  let previous = null;
  let run = 0;
  const flush = () => {
    if (previous !== null && run > 1) { out.push(`  … the line above repeated ${run} times`); dropped.repeats += run - 1; }
  };
  for (const raw of text.split('\n')) {
    if (/\] debug +(?:run host|workspace service): mcp \S+ stderr: /.test(raw)) { dropped.mcpStderr += 1; continue; }
    const body = short(raw).replace(/^\[[^\]]*\] /, '');
    if (body === previous) { run += 1; continue; }
    flush();
    previous = body;
    run = 1;
    out.push(short(raw));
  }
  flush();
  return { text: out.join('\n'), dropped };
}

/** No bearer may reach the evidence — the substitution is the belt, these two are the braces. */
function assertNoCredential(what, text) {
  if (/sk-[a-z-]*[a-z0-9]{16,}/i.test(text)) throw new Error(`${what} carries something shaped like an API key`);
  if (/Bearer\s+(?!\*\*\*)\S{20,}/.test(text)) throw new Error(`${what} carries a bearer value`);
}

/**
 * One launch of the built application, ASYNCHRONOUSLY — and the reason that word is load-bearing.
 *
 * Every scenario used `spawnSync`, which blocks this process's event loop for the whole scenario. That was
 * harmless while the harness only watched a child and read its output at the end. It stopped being harmless the
 * moment the recording proxy moved into the path: an in-process HTTP server cannot answer a request while the
 * loop is blocked, so the app's very first model call would hang until the scenario's own wait expired.
 * Measured before the repair: a child fetching a loopback server in this process while `spawnSync` blocked it
 * got **no answer in 6 s**, and the server served **0** requests. Nothing about the recording was wrong; what
 * was wrong was that the harness could not run a server and a scenario at the same time.
 *
 * `spawn` plus a promise restores that, and it is also what the fault scenario's own timers need — a press or
 * a kill scheduled DURING a run is impossible under a blocked loop, which is why no scenario had ever done one.
 * The returned shape is `spawnSync`'s (`status`, `signal`, `stdout`, `stderr`) so every caller reads unchanged.
 */
function runElectron(args, { timeout, env }) {
  return new Promise((resolve) => {
    const child = spawn(electron, args, { cwd: app, windowsHide: !GUI, env });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.on('error', (cause) => { clearTimeout(timer); resolve({ status: null, signal: null, stdout, stderr: `${stderr}\n${String(cause)}` }); });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      // `spawnSync` reports a timeout as a signal with a null status; the callers all read it that way.
      resolve({ status: timedOut ? null : status, signal: timedOut ? 'SIGKILL' : signal, stdout, stderr, pid: child.pid });
    });
    launchInFlight = child;
  });
}
/** The launch a scheduled fault acts on. Null between scenarios. */
let launchInFlight = null;

async function launch(name, extra, timeoutMs = 180_000) {
  const dir = scenarioDir(name);
  const png = join(dir, `${name}.png`);
  // Each scenario's model traffic lands in its own file, so a record is always attributable to a scenario.
  proxy?.sink(join(dir, 'model-traffic.jsonl'));
  /*
   * Two extra photographs, at a fifth and three fifths of the scenario's OWN wait budget, so a run that stalls
   * leaves a picture of where it stalled instead of one frame of whatever was on screen when it gave up. They
   * are proportional rather than fixed because the budgets here span 120 s (sign-in) to 900 s (the board), and
   * a fixed offset would photograph the splash screen in one and the finished run in the other. A caller that
   * names its own `_PNG_AT` keeps it; `capture/seams.ts` reads them at those offsets and writes nothing if the
   * launch has already exited.
   */
  const budget = Number(extra['ROTARIS_CAPTURE_WAIT_MS'] ?? 0);
  const paced = budget > 0 && extra['ROTARIS_CAPTURE_PNG_AT'] === undefined
    ? { ROTARIS_CAPTURE_PNG_AT: `${join(dir, `${name}.early.png`)}@${Math.round(budget * 0.2)};;${join(dir, `${name}.mid.png`)}@${Math.round(budget * 0.6)}` }
    : {};
  const result = await runElectron([join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace], {
    timeout: timeoutMs,
    env: {
      ...cleanEnvironment(),
      ...proofIsolationEnv({ profileRoot: sandbox, local, preferences: join(sandbox, 'preferences') }),
      ROTARIS_CAPTURE_PNG: png, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      // `--app-log-level`, ahead of `extra` so a scenario that names its own threshold keeps it.
      ...(APP_LOG_LEVEL === null ? {} : { ROTARIS_APP_LOG_LEVEL: APP_LOG_LEVEL }),
      ...paced,
      ...extra,
    },
  });
  launchInFlight = null;
  const log = redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  writeFileSync(join(dir, 'app.log'), log);
  const filtered = filterLog(log, sandbox);
  writeFileSync(join(dir, 'app.filtered.log'), `${filtered.text}\n`);
  scenarioEvidence[name] = { dir: relative(output, dir), lines: log.split('\n').length, filteredLines: filtered.text.split('\n').length, ...filtered.dropped };
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}; see ${join(dir, 'app.log')}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  assertNoCredential(`${name}/app.log`, log);
  return log;
}
/** The store as the run left it: the newest session, its rows, its events, and the totals across every session. */
/**
 * PD-MONITOR-001 revision 2, asserted by EVERY scenario that reads a session rather than by one of its own: the run's
 * cost carries the qualifier it earned, and where the only prices are the ones registered here, the total is exactly
 * the store's tokens times those prices — computed in scaled integers, so the check is as exact as the product must be.
 * A provider that reports its own figure takes precedence over a configured one, so there only the qualifier is read.
 */
const decimalOf = (text) => {
  const [whole, fraction = ''] = String(text).split('.');
  return { units: BigInt(`${whole}${fraction}` || '0'), scale: fraction.length };
};
const canonicalDecimal = (units, scale) => {
  const digits = units.toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
};
function expectedConfiguredCost(tokensIn, tokensOut) {
  // Registered as USD per MILLION tokens: six more places of scale, never a division in binary floating point.
  const a = decimalOf(endpoint.inputUsdPerMillion);
  const b = decimalOf(endpoint.outputUsdPerMillion);
  const scale = Math.max(a.scale, b.scale);
  const units = BigInt(tokensIn) * a.units * 10n ** BigInt(scale - a.scale) + BigInt(tokensOut) * b.units * 10n ** BigInt(scale - b.scale);
  return canonicalDecimal(units, scale + 6);
}
function checkPricing(name, session) {
  if (!session) return;
  const counted = (session.tokens_input ?? 0) + (session.tokens_output ?? 0) > 0;
  if (!counted) { noted(`${name}: no tokens were counted, so no price is asserted`, `${session.cost} (${session.cost_qualifier})`); return; }
  if (accountingKind === 'priced') {
    check(session.cost_qualifier === 'configured', `${name}: the run's cost reads at configured rates`, `${session.cost} (${session.cost_qualifier})`);
    const expected = expectedConfiguredCost(session.tokens_input, session.tokens_output);
    const stored = canonicalDecimal(decimalOf(session.cost).units, decimalOf(session.cost).scale);
    check(stored === expected, `${name}: the cost is exactly its tokens at the registered prices`, `${session.tokens_input} in × ${endpoint.inputUsdPerMillion}/M + ${session.tokens_output} out × ${endpoint.outputUsdPerMillion}/M = ${expected}; stored ${session.cost}`);
  } else if (accountingKind === 'provider') {
    check(['reported', 'configured', 'incomplete'].includes(session.cost_qualifier), `${name}: the run's cost carries a qualifier a figure earns`, `${session.cost} (${session.cost_qualifier})`);
  } else {
    check(session.cost_qualifier === 'unknown', `${name}: an unpriced endpoint's run reads price not established`, `${session.cost} (${session.cost_qualifier})`);
  }
}
function readSession() {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try {
    const session = db.prepare('SELECT session_id, execution_status, stop_reason, iterations_completed, tool_calls, tokens_input, tokens_output, cost, cost_qualifier FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    if (!session) return null;
    const rows = db.prepare('SELECT kind, settled, tool_name, tool_status, body FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(session.session_id);
    const events = db.prepare('SELECT kind, payload FROM events WHERE session_id = ? ORDER BY ordinal').all(session.session_id);
    const totals = db.prepare('SELECT COALESCE(SUM(tokens_input), 0) AS input, COALESCE(SUM(tokens_output), 0) AS output FROM sessions').get();
    // The ring the gate writes, by the agent that dispatched: what the session's own counter must agree with.
    const byAgent = db.prepare('SELECT agent_name, COUNT(*) AS calls FROM tool_calls WHERE session_id = ? GROUP BY agent_name ORDER BY agent_name').all(session.session_id);
    return { session, rows, events, totals, byAgent };
  } finally { db.close(); }
}
/**
 * Every tool call of one session with its `entry` parsed — `{ ordinal, tool_name, agent_name, status, args, result,
 * elapsedMs, endedAt }`.
 *
 * The scenarios below assert from THIS and never from the model's prose. A run that says it ran a command and a
 * run that ran one are different facts, and only one of them is in the store.
 */
function readToolCalls(sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try {
    return db.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(sessionId)
      .map((call) => {
        let entry = {};
        try { entry = JSON.parse(call.entry); } catch { /* a row that will not parse is still a call that happened */ }
        // `elapsed_ms` is the call's own duration and `timestamp` its end, both as the product recorded them.
        return { ...call, args: entry.args ?? {}, result: String(entry.result ?? ''), elapsedMs: typeof entry.elapsed_ms === 'number' ? entry.elapsed_ms : null, endedAt: typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : null };
      });
  } finally { db.close(); }
}
/** One session's `issues` rows — what the product itself recorded as having gone wrong, in its own words. */
function readIssues(sessionId) {
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  try { return db.prepare('SELECT ordinal, id, kind, severity, actor, message FROM issues WHERE session_id = ? ORDER BY ordinal').all(sessionId); }
  finally { db.close(); }
}

/**
 * The three records the run-autopsy skill asks for and this harness used to destroy.
 *
 * `.agents/skills/run-autopsy/SKILL.md` names its inputs — a launch log, the session store, a session id — and
 * its Step 1 runs `apps/desktop/scripts/autopsy.mjs` over them. This script produced all three and deleted two
 * with the sandbox, which is why every defect that skill has found came from a session somebody drove by hand
 * rather than from a live run. Each run-bearing scenario now leaves the autopsy's own output, the product's
 * per-session log and the transcript beside the launch log, so a pack can be autopsied days later.
 *
 * Nothing here may fail the run. A pack is evidence about the product; a reader that throws would turn a green
 * run red over its own bookkeeping, so each half reports what it could not write and continues.
 */
function preserveRun(name, sessionId) {
  const dir = scenarioDir(name);
  const wrote = [];
  const failed = [];
  const db = oneDatabase();
  try {
    // Step 1 of the skill, run here so the pack carries it rather than requiring the reader to re-derive it.
    const snapshot = spawnSync(process.execPath, [join(app, 'scripts', 'autopsy.mjs'), db, sessionId], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    const text = redact(`${snapshot.stdout ?? ''}\n${snapshot.stderr ?? ''}`);
    assertNoCredential(`${name}/autopsy.txt`, text);
    writeFileSync(join(dir, 'autopsy.txt'), text);
    wrote.push('autopsy.txt');
  } catch (cause) { failed.push(`autopsy.txt (${cause instanceof Error ? cause.message : String(cause)})`); }
  try {
    // The product's OWN per-session log (`run-host/host.ts`'s appender), at whatever level the sandbox was given.
    const sessionLog = join(dirname(db), 'sessions', sessionId, 'session.log');
    if (existsSync(sessionLog)) {
      const text = redact(readFileSync(sessionLog, 'utf8'));
      assertNoCredential(`${name}/session.log`, text);
      writeFileSync(join(dir, 'session.log'), text);
      wrote.push('session.log');
    } else failed.push(`session.log (the run wrote none at ${SESSION_LOG_LEVEL})`);
  } catch (cause) { failed.push(`session.log (${cause instanceof Error ? cause.message : String(cause)})`); }
  try {
    // The transcript in full. `results.json` keeps 400 characters of the answer; this keeps what was actually said.
    const Database = require('better-sqlite3');
    const handle = new Database(db, { readonly: true });
    let rows;
    try { rows = handle.prepare('SELECT row_index, kind, settled, tool_name, tool_status, body FROM transcript_rows WHERE session_id = ? ORDER BY row_index').all(sessionId); }
    finally { handle.close(); }
    const text = redact(rows.map((r) => `## ${r.row_index} ${r.kind}${r.tool_name ? ` — ${r.tool_name} [${r.tool_status}${r.settled === 1 ? '' : ', unsettled'}]` : ''}\n\n${r.body ?? ''}\n`).join('\n'));
    assertNoCredential(`${name}/transcript.md`, text);
    writeFileSync(join(dir, 'transcript.md'), `# ${name} — session ${sessionId}, ${rows.length} row(s)\n\n${text}`);
    wrote.push('transcript.md');
  } catch (cause) { failed.push(`transcript.md (${cause instanceof Error ? cause.message : String(cause)})`); }
  scenarioEvidence[name] = { ...(scenarioEvidence[name] ?? {}), sessionId, wrote, ...(failed.length > 0 ? { failed } : {}) };
  if (failed.length > 0) console.error(`warning: ${name} left an incomplete pack — ${failed.join('; ')}`);
}

/**
 * The store itself, copied out before the sandbox goes. It is the record every surface is derived from, and the
 * one thing a reader cannot reconstruct from anything else in the pack.
 *
 * The credential store is a SEPARATE directory and is deleted on every exit path, so this file should never hold
 * the key — but "should" is not a guarantee about a database whose transcript holds whatever the model wrote, so
 * the bytes are searched for the key before the copy is kept and the copy is dropped if it is found. Copying a
 * live SQLite file means taking its sidecars too; without `-wal` the copy reads as the last checkpoint.
 */
function preserveStore() {
  try {
    const db = oneDatabase();
    const bytes = readFileSync(db);
    if (bytes.includes(Buffer.from(key, 'utf8'))) { console.error('warning: the store held the key verbatim, so it was NOT copied into the pack'); return { copied: false, reason: 'the store held the key' }; }
    cpSync(db, join(output, 'workspace.db'));
    for (const sidecar of ['-wal', '-shm']) if (existsSync(`${db}${sidecar}`)) cpSync(`${db}${sidecar}`, join(output, `workspace.db${sidecar}`));
    return { copied: true, from: db };
  } catch (cause) {
    console.error(`warning: the store could not be copied into the pack: ${cause instanceof Error ? cause.message : String(cause)}`);
    return { copied: false, reason: cause instanceof Error ? cause.message : String(cause) };
  }
}

function storeTotals() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    try { return db.prepare('SELECT COALESCE(SUM(tokens_input), 0) AS input, COALESCE(SUM(tokens_output), 0) AS output FROM sessions').get(); } finally { db.close(); }
  } catch { return { input: 0, output: 0 }; }
}

const checks = [];
const check = (passed, what, detail) => { checks.push({ passed: Boolean(passed), what, detail: detail ?? null }); return Boolean(passed); };
const noted = (what, detail) => { checks.push({ passed: true, noted: true, what, detail }); };
const results = {
  startedAt: new Date().toISOString(), endpoint: { name: endpoint.name, label: endpoint.label, baseUrl: endpoint.baseUrl, model: endpoint.model, contextTokens: endpoint.contextTokens ?? null, unmetered },
  qualifiedModel: QUALIFIED, accounting: accountingKind, budgetUsd: BUDGET, maxTokens: MAX_TOKENS, keySource, sandbox, scenarios: {},
};
function finish(code) {
  results.finishedAt = new Date().toISOString();
  results.checks = checks;
  // The store goes into the pack BEFORE `cleanup` takes the sandbox — on every exit path through `finish`,
  // including the budget gate's early stop, because a run that stopped early is exactly the one worth reading.
  results.store = preserveStore();
  results.evidence = scenarioEvidence;
  results.traffic = proxy === null ? { recorded: false, reason: RECORD_TRAFFIC ? 'the proxy could not start' : '--no-record-traffic' } : { recorded: true, proxy: proxy.url, ...proxy.stats() };
  closeProxy();
  results.passed = code === 0 && checks.every((c) => c.passed);
  writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  // A red names the assertion, never the run.
  for (const c of checks) console.log(`  ${c.noted ? 'NOTE' : c.passed ? 'PASS' : 'FAIL'}  ${c.what}${c.detail === null ? '' : `  — ${c.detail}`}`);
  const tokens = results.tokens ? `${results.tokens.input} in / ${results.tokens.output} out` : 'none recorded';
  console.log(`\nspend: ${typeof results.spentUsd === 'number' ? `${results.spentUsd.toFixed(4)} USD (${accountingKind === 'provider' ? "the provider's figure" : 'estimated from the registered prices'}) of the ${BUDGET.toFixed(2)} USD ceiling` : accountingKind === 'unmetered' ? `no money figure for this endpoint; ${tokens}, no ceiling (registered unmetered)` : `no money figure for this endpoint; ${tokens} of the ${MAX_TOKENS} token ceiling`}`);
  console.log(`evidence: ${output}`);
  const packed = Object.entries(scenarioEvidence).filter(([, e]) => Array.isArray(e.wrote) && e.wrote.length > 0);
  if (packed.length > 0) console.log(`autopsy:  ${packed.map(([name, e]) => `${name} (${e.wrote.join(', ')})`).join('; ')}`);
  console.log(`          read one with \`node apps/desktop/scripts/autopsy.mjs "${join(output, 'workspace.db')}" <session-id>\`, or the run-autopsy skill over this directory`);
  cleanup(has('keep'));
  if (has('keep')) console.log(`sandbox kept (its credential store deleted): ${sandbox}`);
  console.log(results.passed ? 'live-run PASSED' : 'live-run FAILED');
  process.exit(results.passed ? 0 : 1);
}
/** Between scenarios: whichever figure this endpoint allows, and a stop when it crosses its ceiling. */
async function budgetGate() {
  const totals = storeTotals();
  results.tokens = { input: totals.input, output: totals.output };
  if (accountingKind === 'provider') {
    const now = await providerCredits();
    results.spentUsd = now.usage === null || before.usage === null ? null : Number((now.usage - before.usage).toFixed(6));
  } else if (priced) {
    results.spentUsd = Number(((totals.input / 1e6) * endpoint.inputUsdPerMillion + (totals.output / 1e6) * endpoint.outputUsdPerMillion).toFixed(6));
  }
  if (accountingKind === 'unmetered') return;
  if (typeof results.spentUsd === 'number' && results.spentUsd > BUDGET) {
    check(false, `the spend stayed under the ${BUDGET.toFixed(2)} USD ceiling`, `${results.spentUsd.toFixed(4)} USD spent; the remaining scenarios did not run`);
    finish(1);
  }
  if (accountingKind === 'tokens' && totals.input + totals.output > MAX_TOKENS) {
    check(false, `the run stayed under the ${MAX_TOKENS} token ceiling`, `${totals.input + totals.output} tokens; the remaining scenarios did not run`);
    finish(1);
  }
}

/**
 * The recording proxy, and the URL the PRODUCT is given.
 *
 * `endpoint.baseUrl` stays the real endpoint and is what this script's own reads use — discovery, and the
 * provider's credit check, neither of which is the product talking. `appBaseUrl` is what the sandbox is
 * configured with: the proxy when it is recording, the endpoint itself when it is not. Everything the product
 * is told, and every assertion about what the product did, uses `appBaseUrl`; nothing else may.
 *
 * A proxy that cannot start is not a reason to lose the run. It is reported, `appBaseUrl` falls back to the
 * endpoint, and the pack says traffic was not recorded rather than quietly holding no file.
 */
if (RECORD_TRAFFIC) {
  try { proxy = await startRecordingProxy({ upstreamUrl: endpoint.baseUrl, redact }); }
  catch (cause) { console.error(`warning: the recording proxy could not start (${cause instanceof Error ? cause.message : String(cause)}); the run talks to the endpoint directly.`); }
}
const appBaseUrl = proxy?.url ?? endpoint.baseUrl;

console.log(`live-run: ${endpoint.label} (${endpoint.name}) at ${endpoint.baseUrl}, model ${endpoint.model}`);
console.log(`traffic: ${proxy === null ? (RECORD_TRAFFIC ? 'NOT recorded — the proxy could not start' : 'not recorded (--no-record-traffic)') : `recorded through ${proxy.url} → model-traffic.jsonl per scenario`}`);
console.log(`accounting: ${accountingKind === 'unmetered' ? 'none — unmetered; tokens are counted and reported, nothing stops on them' : accountingKind === 'provider' ? "the provider's own figure" : accountingKind === 'priced' ? 'the registered prices over the store\'s tokens' : `tokens only, ceiling ${MAX_TOKENS}`}`);
console.log(`key: ${keySource}`);
console.log(`sandbox: ${sandbox}`);

// ── 1. Sign in through the product's own dialog ──────────────────────────────────────────────────────────────
const signIn = await launch('sign-in', {
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_SETTINGS: 'Models',
  ROTARIS_CAPTURE_CLICKS: '[data-action="add-endpoint"]@2200',
  ROTARIS_CAPTURE_PROVIDER_FILL: `${endpoint.label}>>${appBaseUrl}>>${key}`,
  ROTARIS_CAPTURE_PROVIDER_EMPTY_OK: '1',
  ROTARIS_CAPTURE_WAIT: `file:${tokensFile}`, ROTARIS_CAPTURE_WAIT_MS: String(SIGN_IN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
}, SIGN_IN_WAIT_MS + 90_000);
const added = /providers: (Added .+?; discovered (\d+) model\(s\)\.)/.exec(signIn);
check(existsSync(tokensFile), 'the credential file was written', tokensFile);
if (!check(added !== null, 'the endpoint was added and its catalogue discovered', added?.[1] ?? (/provider dialog "Continue anyway" pressed/.test(signIn) ? 'the endpoint discovered no models and the zero-model recovery was taken' : 'the outcome was not logged'))) finish(1);
const snapshot = existsSync(snapshotFile) ? readFileSync(snapshotFile, 'utf8') : '';
check(snapshot.includes(`  ${PROVIDER_ID}:`) && snapshot.includes('    authenticated: true'), 'the snapshot carries the authenticated provider', PROVIDER_ID);
check(!/access_token|sk-[a-z-]*[a-z0-9]{16,}/.test(snapshot), 'the snapshot carries no credential');
check(existsSync(agentsFile), 'the starter agents.yaml was bootstrapped');
const inCatalogue = snapshot.includes(`      - id: ${QUALIFIED}\n`);
if (inCatalogue) check(true, `the catalogue carries ${endpoint.model}`);
else noted(`the catalogue does not carry ${endpoint.model}`, 'the script writes the models: entry the run needs (REQ-CONFIG-082..097)');
results.scenarios['sign-in'] = { discovered: added === null ? 0 : Number(added[2]), modelInCatalogue: inCatalogue };

// The slots, the model entry when discovery did not supply one, and the two bounds this run answers for: an
// unattended run per scenario (REQ-TOOLS-071's consent given in the file, as a person gives it in Settings →
// Runtime), and a ceiling on iterations so a confused agent cannot spend the budget in one turn.
let agents = readFileSync(agentsFile, 'utf8');
for (const slot of ['large_model', 'medium_model', 'small_model']) agents = agents.replace(new RegExp(`^${slot}: .*$`, 'm'), `${slot}: ${QUALIFIED}`);
// A `models:` entry here REPLACES the snapshot layer's entry for the same key as a whole, so it carries everything
// the run needs, never a lone field: written when discovery supplied no entry at all, and when the owner registered
// a context window the endpoint does not declare (`/models` payloads rarely carry one discovery can read).
if (!inCatalogue || typeof endpoint.contextTokens === 'number') {
  // REQ-CONFIG-088 (amended): the product reads a price as the decimal its TEXT states, so the per-million figure is
  // written with an `e-6` exponent rather than divided here in binary floating point (0.1 / 1e6 prints 1.0000000000000001e-7).
  const prices = priced ? `    input_cost_per_token: ${endpoint.inputUsdPerMillion}e-6\n    output_cost_per_token: ${endpoint.outputUsdPerMillion}e-6\n` : '';
  const context = typeof endpoint.contextTokens === 'number' ? `    max_input_tokens: ${endpoint.contextTokens}\n` : '';
  agents += `models:\n  ${JSON.stringify(QUALIFIED)}:\n    provider: openai-compatible\n    model_id: ${JSON.stringify(endpoint.model)}\n    auth_provider: ${PROVIDER_ID}\n    base_url: ${appBaseUrl}\n${context}${prices}`;
}
// `session_log_level` is the one level knob the product actually honours (REQ-SESSION-142; the APPLICATION log
// filters on nothing, which is OQ-63's open question). It governs `<store>/sessions/<id>/session.log`, which
// `preserveRun` copies into the pack.
// No longer true since 2026-09-27: OQ-63 was ruled as PD-MONITOR-002 and built. The application log records `info`
// and above, and its one switch is the environment variable ROTARIS_APP_LOG_LEVEL, never a configuration key —
// `session_log_level` is still the only level knob in `agents.yaml`, and it still reaches the session log alone.
if (!agents.includes('permission_mode:')) agents += `runtime:\n  permission_mode: autonomous\n  allow_unsandboxed_autonomous: true\n  max_iterations: ${MAX_ITERATIONS}\n  session_log_level: ${SESSION_LOG_LEVEL}\n`;
writeFileSync(agentsFile, agents);
cpSync(agentsFile, join(output, 'agents.yaml'));
check(['large_model', 'medium_model', 'small_model'].every((slot) => agents.includes(`${slot}: ${QUALIFIED}`)), 'the three tier slots name the live model', QUALIFIED);

// ── 2. One real run that reads and answers ───────────────────────────────────────────────────────────────────
if (wanted.includes('ask')) {
  const log = await launch('ask', {
    ROTARIS_CAPTURE_PROMPT: 'Read src/todos.js in this workspace and reply, in one sentence, with the names of the functions it exports.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
  }, RUN_WAIT_MS + 90_000);
  const requests = [...new Set((log.match(/model request POST (\S+)/g) ?? []).map((line) => line.replace('model request POST ', '')))];
  check(log.includes(`credentials leased: ${PROVIDER_ID}`), 'main leased the bearer to the run host');
  // `appBaseUrl`, not the endpoint: the assertion is about what the PRODUCT did, and when the proxy is recording
  // the product was given the proxy. The traffic file below is what says the call reached the endpoint itself.
  check(requests.some((url) => url.startsWith(`${appBaseUrl}/chat/completions`)), 'a request reached the endpoint', requests.join(', '));
  check(!/capture: wait for result timed out/.test(log), 'the run reached its result inside the wait');
  const read = readSession();
  checkPricing('ask', read?.session);
  const answer = (read?.rows ?? []).filter((row) => row.kind === 'agent').map((row) => row.body).join(' ');
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const usage = (read?.events ?? []).filter((event) => event.kind === 'usage.update').map((event) => JSON.parse(event.payload));
  check(read?.session.execution_status === 'completed', 'the session completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  check(tools.length > 0 && tools.every((row) => row.settled === 1), 'every tool call settled', tools.map((row) => `${row.tool_name}:${row.tool_status}`).join(', '));
  check(/addTodo/.test(answer) && /toggleTodo/.test(answer), 'the answer names the functions the file exports', answer.trim().slice(0, 200));
  check(usage.length > 0, 'usage figures were recorded', JSON.stringify(usage[usage.length - 1] ?? null));
  /*
   * The recording is itself asserted, not assumed. A proxy that forwarded but recorded nothing would leave the
   * run green and the pack empty — the exact shape of gap this whole change exists to close — so the first
   * scenario that talks to the model reads its own traffic file back and requires a completion that the
   * ENDPOINT answered. It also proves the hop the check above can no longer see: the product reached the proxy,
   * and this says the proxy reached the endpoint and got a 200.
   */
  let askTraffic = null;
  if (proxy !== null) {
    const traffic = readTraffic('ask');
    const completions = traffic.filter((r) => String(r.path ?? '').includes('/chat/completions'));
    check(completions.some((r) => r.status === 200), 'the endpoint answered a completion, read from the recorded traffic', `${traffic.length} record(s), ${completions.length} completion(s), statuses ${[...new Set(completions.map((r) => r.status))].join(', ') || 'none'}`);
    check(completions.every((r) => r.requestHeaders?.authorization === '[redacted]'), 'the traffic record carries no bearer', `${completions.length} completion record(s)`);
    askTraffic = { records: traffic.length, completions: completions.length, slowestMs: Math.max(0, ...traffic.map((r) => r.ms ?? 0)) };
  }
  // The summary joins the scenario's record rather than being written onto it before it exists.
  results.scenarios.ask = { ...(askTraffic === null ? {} : { traffic: askTraffic }), status: read?.session.execution_status, iterations: read?.session.iterations_completed, tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output }, tools: tools.map((row) => row.tool_name), answer: answer.trim().slice(0, 400) };
  if (read) preserveRun('ask', read.session.session_id);
  await budgetGate();
}

// ── 3. One real run that changes the workspace and verifies it ───────────────────────────────────────────────
if (wanted.includes('edit')) {
  const log = await launch('edit', {
    // One run, several mechanisms at once: the implementation and its tests are written by two children working in
    // PARALLEL, each under a declared write scope (PD-TOOLS-006), and priced at configured rates (PD-MONITOR-001).
    ROTARIS_CAPTURE_PROMPT: 'Implement REQ-103 from docs/requirements: add a clearCompleted(todos) function to src/todos.js and export it, and add tests for it to src/todos.test.js. Do the two in parallel: in ONE turn, delegate two coding-agent children in the background, one for the implementation with write_scope ["src/todos.js"] and one for the tests with write_scope ["src/todos.test.js"], then wait for both with wait_for_tasks. Afterwards run `node --test` in the terminal yourself and tell me whether it passed. Delegate nothing else, and answer as soon as the suite has run.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(EDIT_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
  }, EDIT_WAIT_MS + 90_000);
  check(!/capture: wait for result timed out/.test(log), 'the run reached its result inside the wait');
  const read = readSession();
  checkPricing('edit', read?.session);
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const names = [...new Set(tools.map((row) => row.tool_name))];
  const source = readFileSync(join(workspace, 'src', 'todos.js'), 'utf8');
  const suite = readFileSync(join(workspace, 'src', 'todos.test.js'), 'utf8');
  check(read?.session.execution_status === 'completed', 'the session completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  check(tools.length > 0 && tools.every((row) => row.settled === 1), 'every tool call settled', names.join(', '));
  check(names.includes('terminal'), 'the agent ran the suite through the terminal tool', names.join(', '));
  // REQ-MONITOR-102: the session's own counter is SESSION-wide, so it must agree with the ring the gate wrote
  // across every agent that dispatched. The first live run found it holding the entry agent's calls alone, which
  // left the Overview card short and the synthetic run row reading zero on any run that delegated.
  const byAgent = read?.byAgent ?? [];
  const dispatched = byAgent.reduce((n, row) => n + row.calls, 0);
  const named = byAgent.map((row) => `${row.agent_name}:${row.calls}`).join(', ');
  check(dispatched >= 5000 || read?.session.tool_calls === dispatched, 'the session-wide tool-call total counts every agent', `${read?.session.tool_calls} counted vs ${dispatched} row(s) across ${byAgent.length} agent(s) — ${named}`);
  check(/export (function|const) clearCompleted/.test(source), 'clearCompleted is exported from src/todos.js');
  check(/clearCompleted/.test(suite), 'src/todos.test.js tests it');
  // The independent reading: this script runs the suite itself, whatever the agent reported.
  const suiteRun = spawnSync(process.execPath, ['--test'], { cwd: workspace, encoding: 'utf8', timeout: 120_000 });
  writeFileSync(join(scenarioDir('edit'), 'node-test.log'), `${suiteRun.stdout ?? ''}\n${suiteRun.stderr ?? ''}`);
  check(suiteRun.status === 0, 'node --test is green in the workspace afterwards', `exit ${suiteRun.status ?? suiteRun.signal}`);
  const diff = git('diff', head, '--stat');
  writeFileSync(join(scenarioDir('edit'), 'diff.txt'), `${git('diff', head)}\n`);
  check(diff !== '', 'git sees the change', diff.split('\n').pop() ?? '');
  /*
   * PD-TOOLS-006 in the same run, asserted from the store and the recorded traffic, never from the model's prose:
   * the two scoped children were delegated, were live at the same time, and were each told the live scopes at start.
   * A write the gate refused for a scope is RECORDED rather than required — whether a model tries to cross a claim is
   * its choice — but every such refusal must name its holder, in the directive's words.
   */
  const calls = read ? readToolCalls(read.session.session_id) : [];
  const scoped = calls.filter((c) => c.tool_name === 'delegate' && Array.isArray(c.args.write_scope) && c.args.write_scope.length > 0);
  const scopedIds = scoped.map((c) => /task_id: (bg_[0-9a-f]{8})/.exec(c.result)?.[1]).filter((id) => id !== undefined);
  check(scopedIds.length >= 2, 'two children were delegated with a write scope each (PD-TOOLS-006)', scoped.map((c) => `${c.args.task_name}: ${JSON.stringify(c.args.write_scope)}`).join('; ') || 'no delegate carried a write_scope');
  // Live at once: each reached `running` before the other reached a terminal state, read off the ordered events.
  const moves = (read?.events ?? []).filter((e) => e.kind === 'child.transition').map((e, i) => ({ i, ...JSON.parse(e.payload) }));
  const firstAt = (id, pick) => moves.find((m) => m.child_id === id && pick(m.to_state))?.i ?? Infinity;
  const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'blocked']);
  const overlapped = scopedIds.some((a) => scopedIds.some((b) => a !== b
    && firstAt(a, (s) => s === 'running') < firstAt(b, (s) => TERMINAL.has(s))
    && firstAt(b, (s) => s === 'running') < firstAt(a, (s) => TERMINAL.has(s))));
  check(overlapped, 'two scoped children were live at the same time', `${moves.length} transition(s) across ${scopedIds.length} scoped child(ren)`);
  // The disclosure block each child's payload carries after the workspace-root line.
  const told = readTraffic('edit').filter((r) => String(r.requestBody ?? '').includes('Write scopes:'));
  check(told.length > 0, 'the scoped children were told the write scopes at start', `${told.length} request(s) carried the block`);
  check(told.some((r) => String(r.requestBody).includes('Held by other agents')), "a child accepted beside a live scope was told whose it is", told.length === 0 ? 'none' : 'the block names the other child');
  // Only the file-write tools can be refused for a scope; a report QUOTING a refusal (wait_for_tasks) is not one.
  const refusals = calls.filter((c) => ['write_file', 'haet_edit', 'haet'].includes(c.tool_name) && /is inside the write scope of /.test(c.result));
  check(refusals.every((c) => c.status === 'blocked' && /which is still running: '.+'\. The write was not executed\./.test(c.result)), 'every write-scope refusal was blocked and named its holder', `${refusals.length} refusal(s)`);
  noted('writes the gate refused for a live scope', refusals.length === 0 ? 'none — no agent tried to write into another agent\'s scope' : refusals.map((c) => `${c.agent_name} → ${c.tool_name}`).join(', '));
  mkdirSync(join(scenarioDir('edit'), 'changed'), { recursive: true });
  cpSync(join(workspace, 'src'), join(scenarioDir('edit'), 'changed'), { recursive: true });
  results.scenarios.edit = { writeScopes: { scopedChildren: scopedIds.length, overlapped, told: told.length, refusals: refusals.length }, cost: { total: read?.session.cost ?? null, qualifier: read?.session.cost_qualifier ?? null }, status: read?.session.execution_status, iterations: read?.session.iterations_completed, tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output }, tools: names, toolCallTotal: read?.session.tool_calls ?? null, toolCallsByAgent: byAgent, diffstat: diff, suiteExit: suiteRun.status };
  if (read) preserveRun('edit', read.session.session_id);
  await budgetGate();
}

// ── 3b. A paused run resumes every agent from its own record ────────────────────────────────────────────────
/*
 * PD-ORCH-005, measured against a real model. A delegating run is paused through the composer's own Pause as soon as
 * a child is running, and continued through the composer's own Continue as soon as the paused composer has been
 * read. What is asserted comes from the store and the recorded traffic, never from the model's prose:
 * - the pause left the iteration open and its unfinished children `paused` by `pause` (clauses 2 and 3), and the
 *   composer drew them `paused` with the Continue action's count (clauses 6, 13 and 19);
 * - the continue resumed that same iteration and every child it paused, under the same task ids (clause 4);
 * - each resumed child carried on from its own record: entries before the pause and after it under one task id, and
 *   the first request after the continue carried what that child had recorded last (clauses 1 and 4);
 * - the run finished the work, read back from the files on disk.
 */
if (wanted.includes('resume')) {
  const PAUSE = '.workspace:has(.agent-row[data-state="running"]) button[aria-label="Pause the run"]';
  // Read the paused composer once, and mark the read on <body> so the Continue press waits for it.
  const READ_PAUSED = "(document.body.dataset.pausedRead = '1', JSON.stringify({ paused: document.querySelectorAll('.agent-row[data-state=\"paused\"]').length, count: document.getElementById('composer-resume-count')?.textContent ?? null, run: document.querySelector('[data-testid=\"run-header\"]')?.dataset.state ?? null }))";
  const CONTINUE = 'body[data-paused-read="1"] button[aria-label="Continue run"]';
  const log = await launch('resume', {
    ROTARIS_CAPTURE_PROMPT: 'Write two short notes in parallel. In ONE turn, delegate two coding-agent children in the background: one reads src/todos.js and then writes docs/notes-functions.md listing each exported function with one sentence on what it does; the other reads src/todos.test.js and then writes docs/notes-tests.md listing each test with one sentence on what it checks. Wait for both with wait_for_tasks, then reply with the two file names. Delegate nothing else.',
    ROTARIS_CAPTURE_CLICKS: [`${PAUSE}@~${EDIT_WAIT_MS}`, `${CONTINUE}@~${EDIT_WAIT_MS}`].join(';;'),
    ROTARIS_CAPTURE_EVAL_AT: `${READ_PAUSED}>>button[aria-label="Continue run"]@~${EDIT_WAIT_MS}`,
    ROTARIS_CAPTURE_WAIT: `js:document.querySelector('[data-testid="run-header"]')?.dataset.state === 'completed'`,
    ROTARIS_CAPTURE_WAIT_MS: String(EDIT_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
  }, EDIT_WAIT_MS + 90_000);
  check(/capture: clicked ".*Pause the run/.test(log), 'the composer\'s Pause was pressed while a child was running');
  check(/capture: clicked ".*Continue run/.test(log), 'the paused composer\'s Continue was pressed');
  check(!/capture: wait for js timed out|capture: wait for .* timed out/.test(log), 'the resumed run completed inside the wait');
  const shown = (() => { try { return JSON.parse(JSON.parse(/capture: eval-at \S+ .* → (".*")$/m.exec(log)?.[1] ?? 'null')); } catch { return null; } })();
  check(shown !== null && shown.paused > 0, 'the paused composer drew its paused children as `paused` (clause 13)', JSON.stringify(shown));
  check(shown !== null && /agents? will resume/.test(shown.count ?? ''), 'the paused composer stated the Continue action\'s count (clauses 6 and 19)', shown?.count ?? 'no count');
  const read = readSession();
  checkPricing('resume', read?.session);
  check(read?.session.execution_status === 'completed', 'the session completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  const Database = require('better-sqlite3');
  const db = new Database(oneDatabase(), { readonly: true });
  let rest = null;
  try {
    const sid = read?.session.session_id ?? '';
    const timeline = db.prepare("SELECT ordinal, at, name, metadata FROM timeline WHERE session_id = ? AND name IN ('iteration_paused', 'iteration_resumed', 'child_paused', 'child_resumed') ORDER BY ordinal").all(sid)
      .map((t) => ({ ...t, meta: JSON.parse(t.metadata) }));
    const iterationPaused = timeline.find((t) => t.name === 'iteration_paused' && t.meta.interruption === 'pause');
    const iterationResumed = timeline.find((t) => t.name === 'iteration_resumed' && t.ordinal > (iterationPaused?.ordinal ?? Infinity));
    check(iterationPaused !== undefined, 'the pause left the iteration open, recorded as paused by the pause (clause 2)', iterationPaused ? `iteration ${iterationPaused.meta.iteration}, ${iterationPaused.meta.paused_agents} agent(s)` : 'no iteration_paused entry');
    check(iterationResumed !== undefined && iterationResumed.meta.iteration === iterationPaused?.meta.iteration, 'the continue resumed that same iteration (clause 4)', iterationResumed ? `iteration ${iterationResumed.meta.iteration}` : 'no iteration_resumed entry after the pause');
    const pausedChildren = timeline.filter((t) => t.name === 'child_paused' && t.meta.interruption === 'pause').map((t) => t.meta.task_id);
    const resumedChildren = new Set(timeline.filter((t) => t.name === 'child_resumed').map((t) => t.meta.task_id));
    check(pausedChildren.length > 0, 'the pause left at least one child `paused` (clause 3)', pausedChildren.join(', ') || 'none');
    check(pausedChildren.every((id) => resumedChildren.has(id)), 'every paused child resumed under its own task id (clause 4)', `${pausedChildren.length} paused, ${pausedChildren.filter((id) => resumedChildren.has(id)).length} resumed`);
    const iterations = db.prepare('SELECT iteration, state, outcome, interruption FROM iterations WHERE session_id = ? ORDER BY iteration').all(sid);
    check(iterations.length > 0 && iterations.every((it) => it.state === 'closed') && iterations.some((it) => it.outcome === 'succeeded'), 'the resumed iteration closed succeeded', JSON.stringify(iterations));
    // Each resumed child carried on from its own record: entries on both sides of the pause, under one task id.
    const pausedAt = iterationPaused?.at ?? '';
    const records = pausedChildren.map((id) => {
      const entries = db.prepare('SELECT seq, kind, body, at FROM agent_messages WHERE session_id = ? AND task_id = ? ORDER BY seq').all(sid, id);
      return { id, before: entries.filter((e) => e.at <= pausedAt), after: entries.filter((e) => e.at > pausedAt) };
    });
    check(records.length > 0 && records.every((r) => r.before.length > 0 && r.after.length > 0), 'each resumed child\'s record continues across the pause (clause 1)', records.map((r) => `${r.id}: ${r.before.length} before, ${r.after.length} after`).join('; '));
    /*
     * What the model was sent. The last entry a child recorded before the pause can only reach a request made after
     * it, and the pause stops every agent before its next model step (clause 15), so a request carrying it is the
     * resumed step. A fragment is looked for as the request body spells it: plain words, no quote, backslash or line.
     */
    const traffic = readTraffic('resume').filter((r) => String(r.path ?? '').includes('/chat/completions'));
    const carried = records.map((r) => {
      const last = r.before.at(-1);
      let text = '';
      try {
        const message = JSON.parse(last?.body ?? '{}');
        text = (message.content ?? []).map((part) => part.kind === 'text' ? part.text : part.kind === 'tool-result' ? part.result : part.kind === 'tool-call' ? JSON.stringify(part.args ?? {}) : '').join(' ');
      } catch { /* an entry that will not parse offers no fragment */ }
      const fragment = (text.match(/[A-Za-z0-9 ,.:()_-]{24,}/g) ?? []).sort((a, b) => b.length - a.length)[0]?.slice(0, 48) ?? null;
      return { id: r.id, fragment, sent: fragment === null ? null : traffic.some((t) => String(t.requestBody ?? '').includes(fragment)) };
    });
    const unreadable = carried.filter((c) => c.fragment === null);
    check(carried.filter((c) => c.fragment !== null).every((c) => c.sent), 'each resumed child\'s next request carried what it recorded before the pause (clause 4)', carried.map((c) => `${c.id}: ${c.fragment === null ? 'no plain fragment' : c.sent ? 'carried' : 'NOT carried'}`).join('; '));
    if (unreadable.length > 0) noted('children whose last entry offered no plain fragment to look for', unreadable.map((c) => c.id).join(', '));
    rest = { pausedChildren: pausedChildren.length, iteration: iterationPaused?.meta.iteration ?? null, records: records.map((r) => ({ id: r.id, before: r.before.length, after: r.after.length })), carried, shown, iterations };
  } finally { db.close(); }
  const notes = ['notes-functions.md', 'notes-tests.md'].map((name) => ({ name, text: existsSync(join(workspace, 'docs', name)) ? readFileSync(join(workspace, 'docs', name), 'utf8') : '' }));
  check(notes.every((n) => n.text.trim() !== ''), 'both notes were written after the continue', notes.map((n) => `${n.name}: ${n.text.length} chars`).join(', '));
  results.scenarios.resume = { ...rest, status: read?.session.execution_status, tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output } };
  if (read) preserveRun('resume', read.session.session_id);
  await budgetGate();
}

// ── 4. The requirements board hands the work over ────────────────────────────────────────────────────────────
/**
 * The one path the composer scenarios never take. `edit` types a prompt; here nothing is typed: REQ-104 is selected
 * on the board, the move control is pressed, the release is confirmed, and everything after that is the product's —
 * the worktree it provisions, the run its coordinator starts, the review it raises and the accept that settles the
 * card in `done` (spec 08 §Runs Started from the Board; REQ-TRACE-464/472/474/499).
 *
 * The poll times below are an OBSERVATION schedule and are never reported as durations: they are the moments this
 * script LOOKED, and a different schedule would print different numbers for identical work. The product's own times
 * are read from the delivery store afterwards, which is the only place a duration here comes from.
 *
 * NOTHING THIS SCENARIO PRESSES IS PRESSED ON A CLOCK. Every click, the Open control that opens the card, and the two reads
 * of what the accept left behind wait for the state they act on (`@~ms`, a deadline rather than an appointment), and
 * the capture ends on the accept landing (`ROTARIS_CAPTURE_WAIT=js:…`) rather than at the far end of the window.
 *
 * That is a repair, and the defect it repairs is worth keeping in view: these presses used to fire at offsets
 * measured from the end of `LIVE_RUN_BOARD_MS`, whatever the board was showing by then. A model slower than the
  * window turned one timing failure into three, and two of the three accused the PRODUCT of faults it had not
  * committed — "the card rests in running", "the history lacks the accept" — when the truth was that accept had been
  * pressed at a card still running and the product had correctly declined it. Measured 2026-09-13 against
  * `qwen3.8-flash-next`: 240 s expired with the run about half-way, and the same run passed every check at 900 s.
  *
  * A second repair, 2026-09-19: the review presses went through the card's FOCUS — a click, then Enter into
  * whatever held focus once `[data-req-card]:focus` matched — and focus is not a thing the harness can hold.
  * Measured that day: the card-in-review click landed, the run's own completion re-rendered the board, focus was
  * lost, the `:focus` wait expired, and Enter went into unfocused space. The detail never opened, the review pane
  * never appeared, and the two closing checks accused the board of refusing an accept that was never presented.
  * The repair is the same rule applied one level down: the card is opened through its OWN OPEN CONTROL — the
  * `Open ${card.id}` button the card carries in its foot — pressed as soon as the card is in review, not through
  * a focus state no press can re-assert. Focus is a precondition the product owns; a click target is one the
  * harness can re-drive until it lands.
  *
  * A third repair, later the same day: the fallback above was UNSCOPED — `[data-testid="req-card-open"]` with no
  * column — so it matched a backlog card 1.5 s into the run and opened the detail mid-release, the 2026-09-13
  * premature-open resurrected. The scope is now part of the selector: the card in review, its foot, its Open
  * control, and nothing else matches. A press aimed at a state that is also true BEFORE the thing it waits for
  * is no better than a clock, and is harder to see.
  *
  * a defect note (removed once repaired) is the note. A harness that manufactures false
 * product symptoms is worse than one that is merely slow, because `AGENTS.md` rightly says to believe it.
 */
if (wanted.includes('requirements')) {
  // A bound now, not a schedule: the scenario ends when the accept lands, so a generous deadline costs a fast model
  // nothing. It is raised from 240 s because the endpoint's own model needs about twice that.
  const RUN_MS = Number(process.env['LIVE_RUN_BOARD_MS'] ?? 900_000);
  const CARD = '[data-req-card="REQ-104"]';
  const BOARD_AT = `(() => { const el = document.querySelector('[data-req-card="REQ-104"]'); const b = window.__rotarisBoard; return { column: el === null ? null : el.getAttribute('data-column'), openPane: b ? b.openPane : null, feedback: [...document.querySelectorAll('[data-testid="req-feedback"]')].map((f) => f.textContent.trim()).slice(0, 3) }; })()`;
  const HISTORY_AT = `(() => { const p = document.querySelector('[data-testid="req-history-state"]'); return p === null ? null : { state: p.getAttribute('data-state'), entries: [...p.querySelectorAll('li')].map((l) => l.textContent.trim()) }; })()`;
  // REQ-TRACE-364: `done` lies outside the columns area at this width, so the resting read goes through the board's
  // own reveal first; reading the DOM without it reads `null` and proves nothing. The reveal and the read are ONE
  // expression because two of them would be two coroutines racing for the same frame, with no order between them.
  const RESTING_AT = `(async () => { const b = window.__rotarisBoard; if (b && typeof b.reveal === 'function') b.reveal('REQ-104'); await new Promise((r) => requestAnimationFrame(() => r(undefined))); const el = document.querySelector('[data-req-card="REQ-104"]'); return { column: el === null ? null : el.getAttribute('data-column') }; })()`;
  // The accept's own trace in the surface: the history the detail panel already keeps live gains a second entry.
  // It is what the scenario waits on to finish and what the two closing reads wait on to look — one signal, so a
  // read can never happen before the thing it reads about.
  const ACCEPTED = '[data-testid="req-history-state"] li:nth-child(2)';
  const CARD_IN_REVIEW = `${CARD}[data-column="review"]`;
  // The detail is opened through the card's OWN Open control, not through focus plus Enter. Focus is a
  // precondition the product owns — the harness can wait for it but cannot re-assert it, so a lost focus
  // (measured 2026-09-19: the completion re-render between the click and the press) turns Enter into a
  // keystroke into unfocused space. A control is a target the harness CAN re-drive: the click seam retries
  // the match until the deadline, so a re-render that drops one attempt costs one poll, not the scenario.
  //
  // The selector carries the WHOLE chain — the card, its column, its foot, the control — because a press
  // aimed at a state that is also true BEFORE the thing it waits for is no better than a clock. The
  // unscoped `[data-testid="req-card-open"]` matched a backlog card 1.5 s into the run on 2026-09-19 and
  // opened the detail mid-release. The column is what makes this press wait: nothing matches until the run
  // puts the card in review. Scoped to the card for REQ-104 throughout, so the control is this card's and
  // not another's. The foot's Open control carries `data-testid="req-card-open"` (`Card.tsx`, added beside
  // the untestable label-only buttons); the click seam matches exact text, so the `>>Open` half names the
  // label while the selector half scopes it.
  const OPEN_CONTROL_SELECTOR = `${CARD_IN_REVIEW} [data-testid="req-card-open"]`;
  const OPEN_CONTROL = `${OPEN_CONTROL_SELECTOR}>>Open`;
  // Scoped to the open detail for REQ-104, so the control is this card's and not another's.
  const REVIEW_CONTROL = `[data-testid="req-detail"][data-req="REQ-104"] [data-testid="req-detail-review"]`;
  const poll = [];
  for (let t = 8_000; t < RUN_MS; t += 30_000) poll.push(t);
  const deadline = RUN_MS;
  const clicks = [
    `${CARD}@3000`,
    '[data-testid="req-move-control"]@4400',
    '[data-testid="req-confirm"] .btn>>Release@5400',
    // REQ-TRACE-474: a workspace that has already opted in to unattended work raises NO disclosure, and this
    // sandbox opts in — so the press is a no-op where there is none and the acceptance where there is one.
    '[data-testid="req-pane-disclosure"] .btn>>Start the run@6800',
    // From here the model decides the pace. Each press names the thing that must be on screen before it means
    // anything, and the deadline is the only number: the card once the run puts it in review, the Open control
    // once the card is there, the Review control once the detail is open, the decision once the pane is, the
    // confirmation once the dialog is. The Open press below is a second click at the same card: the first
    // click selects it for the release, this one opens its detail once the run puts it in review — the card's
    // own control, matched by state rather than by focus. The double-click travels its own seam
    // (`ROTARIS_CAPTURE_DOUBLE_CLICKS`, `seams.ts`): the click seam sends single clicks only and a single
    // click merely selects, while the card's `onDoubleClick` is what opens the detail — the same gesture a
    // person uses. Both wait on the CARD's state (in review), never on focus.
    `${CARD_IN_REVIEW}@~${deadline}`,
    `${OPEN_CONTROL}@~${deadline}`,
    `${REVIEW_CONTROL}@~${deadline}`,
    `[data-testid="req-pane-review-decisions"] .btn-primary@~${deadline}`,
    `[data-testid="req-pane-review-confirm"] .btn-primary@~${deadline}`,
  ];
  // The double-click is NOT in `clicks`: it must not fire at an appointment before the card is in review
  // (the 2026-09-13 premature-open) — one waited press, aimed at the card rather than at its foot.
  const doubleClicks = [
    `${CARD_IN_REVIEW}@~${deadline}`,
  ];
  // The fallback Open click IS in `clicks` beside the double-click: both share the deadline, and the match
  // names the card IN REVIEW — a card the double-click has already opened has moved past review, so the
  // fallback's match lapses before it presses. The fallback fires only into the gap the double-click left.
  const watches = [
    `${BOARD_AT}@6400`,
    ...poll.map((t) => `${BOARD_AT}@${t}`),
    `${RESTING_AT}>>${ACCEPTED}@~${deadline}`,
    `${HISTORY_AT}>>${ACCEPTED}@~${deadline + 1}`,
  ];
  const log = await launch('requirements', {
    ROTARIS_CAPTURE_RESIZE: '1264x800@300',
    ROTARIS_CAPTURE_VIEWS: '4@1200',
    ROTARIS_CAPTURE_CLICKS: [...clicks, `${OPEN_CONTROL}@~${deadline}`].join(';;'),
    ROTARIS_CAPTURE_DOUBLE_CLICKS: doubleClicks.join(';;'),
    ROTARIS_CAPTURE_EVAL_AT: watches.join(';;'),
    ROTARIS_CAPTURE_WAIT: `js:document.querySelector(${JSON.stringify(ACCEPTED)}) !== null`,
    ROTARIS_CAPTURE_WAIT_MS: String(deadline + 30_000),
    ROTARIS_CAPTURE_AFTER_MS: '6000',
  }, deadline + 150_000);
  const readEval = (at) => {
    const line = new RegExp(`capture: eval-at ${at} .*? → (.*)\\s*$`, 'm').exec(log);
    if (line === null) return null;
    try { return JSON.parse(line[1]); } catch { return null; }
  };
  /** What `settleAt` wrote about one waited-for selector: it matched, it never did, or the press never got that far. */
  const waited = (selector) => {
    const quoted = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`capture: ${quoted} matched with`).test(log)) return 'matched';
    if (new RegExp(`capture: ${quoted} never matched within`).test(log)) return 'expired';
    return 'not reached';
  };
  /** The detail counts as opened when the Review control was offered (the detail carries it) or when either
   * opening gesture landed: the double-click logs `double-clicked "…"`, the fallback click logs
   * `clicked "Open"`. A re-render can drop one poll while the press still lands, so no single line is
   * load-bearing — but the Review control appearing is conclusive either way. */
  const detailOpened = () => {
    if (waited(REVIEW_CONTROL) !== 'not reached') return waited(REVIEW_CONTROL);
    if (/capture: double-clicked /m.test(log)) return 'matched';
    if (waited(OPEN_CONTROL_SELECTOR) !== 'not reached') return waited(OPEN_CONTROL_SELECTOR);
    return /capture: clicked "Open"/m.test(log) ? 'matched' : 'not reached';
  };
  const columns = poll.map((t) => readEval(t)?.column ?? null);
  const trail = columns.filter((c) => c !== null).join(' → ') || 'the board showed nothing';
  check(columns.some((c) => c === 'running' || c === 'review' || c === 'done'), 'the release became a real run, started by the board and not by a prompt', trail);
  /**
   * One expiry, one failure. The presses after it are not attempted against a board that never offered them,
   * so they are NOTED rather than failed: a press that was never made cannot be evidence about the product, and
   * reporting it as one is how this scenario used to accuse the board of losing a card it had never been given.
   * That rule now covers every link of the review chain, not just the card reaching review: the detail never
   * opened means the Review control, the decision and the confirmation were never offered either — each
   * unreached press is noted with what its wait did.
   */
  const opened = detailOpened();
  const reviewOffered = waited(REVIEW_CONTROL) === 'matched';
  let settled = null;
  const reachedReview = waited(CARD_IN_REVIEW) === 'matched';
  check(reachedReview, `the run reached review inside the ${Math.round(deadline / 1000)} s the board was given`, reachedReview ? trail : `${trail} — the window expired with the card where the trail leaves it; raise LIVE_RUN_BOARD_MS if the model is slower than that`);
  if (!reachedReview) {
    noted('the review was never offered, so the accept was not pressed', `detail: ${opened}; review control: ${waited(REVIEW_CONTROL)}; decision: ${waited('[data-testid="req-pane-review-decisions"] .btn-primary')}; confirmation: ${waited('[data-testid="req-pane-review-confirm"] .btn-primary')}`);
  } else if (opened !== 'matched') {
    noted('the card reached review but its detail never opened', `detail: ${opened}; review control: ${waited(REVIEW_CONTROL)}; decision: ${waited('[data-testid="req-pane-review-decisions"] .btn-primary')}; confirmation: ${waited('[data-testid="req-pane-review-confirm"] .btn-primary')}`);
  } else if (!reviewOffered) {
    noted('the detail never offered its Review control, so the review was never offered', `review control: ${waited(REVIEW_CONTROL)}; decision: ${waited('[data-testid="req-pane-review-decisions"] .btn-primary')}; confirmation: ${waited('[data-testid="req-pane-review-confirm"] .btn-primary')}`);
  } else {
    settled = readEval(deadline);
    check(settled?.column === 'done', "the review's accept left the card resting in done", `it rests in ${settled?.column ?? 'nothing the board showed'}`);
    const entries = readEval(deadline + 1)?.entries ?? [];
    check(entries.some((e) => /release/i.test(e)) && entries.some((e) => /accept/i.test(e)), 'the delivery history carries both the release and the accept', entries.join(' | ') || 'the history read empty');
  }

  // The store, for the two facts no surface shows: that the run was recorded at all, and what it was granted.
  const db = new (require('better-sqlite3'))(oneDatabase(), { readonly: true });
  let runRows = [];
  let historyRows = [];
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    const runsTable = tables.find((t) => /delivery.*run|run.*delivery/.test(t));
    const historyTable = tables.find((t) => /delivery.*histor|histor.*delivery/.test(t));
    if (runsTable) runRows = db.prepare(`SELECT * FROM "${runsTable}"`).all();
    if (historyTable) historyRows = db.prepare(`SELECT * FROM "${historyTable}" ORDER BY rowid`).all();
  } finally { db.close(); }
  check(historyRows.filter((r) => String(r.action) === 'release').length === 1, 'exactly one release was written for one release', historyRows.map((r) => r.action).join(', '));
  // REQ-TRACE-464/472: the run record names its session and the permissions it was actually granted, so the
  // disclosure and the audit trail can never tell different stories.
  const run = runRows[0];
  check(runRows.length === 1 && typeof run?.session_id === 'string' && run.session_id.length > 0, 'the run record carries the session identifier', `${runRows.length} run row(s)`);
  check(String(run?.permissions ?? '').length > 0, 'the run record says what permissions it was granted', String(run?.permissions ?? 'nothing'));
  const read = readSession();
  checkPricing('requirements', read?.session);
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const names = [...new Set(tools.map((row) => row.tool_name))];
  check((read?.session.tokens_input ?? 0) > 0 && (read?.session.tokens_output ?? 0) > 0, 'the board-started run carries real usage from the endpoint', `${read?.session.tokens_input} in / ${read?.session.tokens_output} out over ${read?.session.iterations_completed} iteration(s)`);
  check(tools.length > 0 && tools.every((row) => row.settled === 1), 'every tool call in the board-started run settled', names.join(', '));

  // The work itself, in the worktree the run was confined to — never in the workspace the board sits in.
  const worktrees = git('worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9).trim());
  check(worktrees.length >= 2, 'the run was confined to a worktree of its own', worktrees.map((w) => w.split(/[\\/]/).pop()).join(', '));
  const unit = worktrees.slice(1).find((w) => existsSync(join(w, 'src', 'todos.js')));
  const source = unit === undefined ? '' : readFileSync(join(unit, 'src', 'todos.js'), 'utf8');
  const suiteText = unit === undefined ? '' : readFileSync(join(unit, 'src', 'todos.test.js'), 'utf8');
  check(/export (function|const) completedCount/.test(source), 'completedCount is exported from the worktree\'s src/todos.js');
  check(/completedCount/.test(suiteText), 'the worktree\'s suite tests it');
  // The independent reading, as in `edit`: this script runs the suite itself, whatever the agent reported.
  const suiteRun = unit === undefined ? { status: null } : spawnSync(process.execPath, ['--test'], { cwd: unit, encoding: 'utf8', timeout: 120_000 });
  if (unit !== undefined) writeFileSync(join(scenarioDir('requirements'), 'node-test.log'), `${suiteRun.stdout ?? ''}\n${suiteRun.stderr ?? ''}`);
  check(suiteRun.status === 0, 'node --test is green inside the worktree afterwards', `exit ${suiteRun.status ?? 'no worktree to run it in'}`);
  if (unit !== undefined) writeFileSync(join(scenarioDir('requirements'), 'diff.txt'), `${execFileSync('git', ['-C', unit, 'diff', head], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })}\n`);
  results.scenarios.requirements = {
    observed: columns, settledColumn: settled?.column ?? null, history: historyRows.map((r) => ({ action: r.action, at: r.at })),
    run: run === undefined ? null : { sessionId: run.session_id, permissions: run.permissions, startedAt: run.started_at, endedAt: run.ended_at },
    // The product's own durations, from its own timestamps — never from the poll schedule above.
    runMs: run?.started_at && run?.ended_at ? Date.parse(String(run.ended_at)) - Date.parse(String(run.started_at)) : null,
    tokens: { input: read?.session.tokens_input, output: read?.session.tokens_output }, tools: names, worktree: unit ?? null, suiteExit: suiteRun.status,
  };
  if (read) preserveRun('requirements', read.session.session_id);
  await budgetGate();
}

// ── 5. The shell over what the runs left ─────────────────────────────────────────────────────────────────────
if (wanted.includes('shell')) {
  const PROBES = ['[data-testid="overview-sessions"] .ov-session', '[data-testid="overview-repo-branch"]', '[data-testid="overview-tool-chips"] .tag', '.app-shell'];
  const log = await launch('shell', { ROTARIS_CAPTURE_END_VIEW: '1', ROTARIS_CAPTURE_END_VIEW_MS: '3500', ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ROTARIS_CAPTURE_AFTER_MS: '2500' });
  const probe = (selector) => {
    const line = new RegExp(`capture: probe ${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} → (\\[.*\\])\\s*$`, 'm').exec(log);
    return line === null ? null : JSON.parse(line[1]);
  };
  const sessions = probe('[data-testid="overview-sessions"] .ov-session') ?? [];
  const branch = probe('[data-testid="overview-repo-branch"]') ?? [];
  check(probe('.app-shell')?.length === 1, 'the shell painted');
  check(sessions.length >= wanted.filter((name) => name === 'ask' || name === 'edit').length, 'Overview lists the sessions the runs left', `${sessions.length} session row(s)`);
  check(branch.length > 0 && /main/.test(branch[0]?.text ?? ''), 'the repository card reads the branch', branch[0]?.text ?? 'absent');
  results.scenarios.shell = { sessions: sessions.map((row) => row.text), branch: branch[0]?.text ?? null, toolChips: (probe('[data-testid="overview-tool-chips"] .tag') ?? []).map((tag) => tag.text) };
}

// ── 6. The frictions probe: first-use write_file and the win32 SIGINT stop ───────────────────────────────
/**
 * One real run engineered to trip the inducible run-autopsy frictions, read back from the STORE rather than
 * from the model's report: a first-use `write_file` create (nine refusals across three fresh children in run
 * `7bd9c19d`; `docs/defects/a-first-use-schema-guess-failed-without-an-example.md`) and a SIGINT stop of a
 * pipe session on win32 (`docs/defects/win32-terminal-edge-cases-bounced-to-the-agent.md`).
 *
 * Red by design until the fixes land: each check below fails while its friction reproduces and passes once
 * the product absorbs it, which is what makes this scenario the fixes' verification. Two recorded frictions
 * are NOT covered because they are not inducible on demand — the stream-stall abort needs an endpoint fault
 * and the exit-trace gap needs a crash — and are noted as such instead of asserted.
 */
if (wanted.includes('frictions')) {
  const log = await launch('frictions', {
    ROTARIS_CAPTURE_PROMPT: 'Create a file called friction-probe.txt in the workspace root containing exactly one line with the text probe-ok. Then run `node -e "setTimeout(() => {}, 20000)"` in the terminal and stop it by sending SIGINT to its session. Reply DONE when both are finished.',
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
  }, RUN_WAIT_MS + 90_000);
  check(!/capture: wait for result timed out/.test(log), 'the probe run reached its result inside the wait');
  const read = readSession();
  checkPricing('frictions', read?.session);
  check(read?.session.execution_status === 'completed', 'the probe run completed', `${read?.session.execution_status} (${read?.session.stop_reason})`);
  const tools = (read?.rows ?? []).filter((row) => row.kind === 'tool');
  const names = [...new Set(tools.map((row) => row.tool_name))];
  check(names.includes('write_file'), 'the probe run attempted the file write', names.join(', '));
  // The tool-call record, for the two refusals no surface shows: what the agent passed and what refused it.
  const fdb = new (require('better-sqlite3'))(oneDatabase(), { readonly: true });
  let calls = [];
  try {
    if (read) calls = fdb.prepare('SELECT ordinal, tool_name, agent_name, status, entry FROM tool_calls WHERE session_id = ? ORDER BY ordinal').all(read.session.session_id);
  } finally { fdb.close(); }
  const entryOf = (call) => { try { return JSON.parse(call.entry); } catch { return {}; } };
  const resultOf = (call) => String(entryOf(call).result ?? '');
  const argsOf = (call) => entryOf(call).args ?? {};
  const writeOp = calls.filter((call) => call.tool_name === 'write_file' && call.status !== 'ok' && resultOf(call).includes('requires an operation'));
  check(writeOp.length === 0, 'write_file needed no operation repair on first use', writeOp.length === 0 ? 'no refusal in the record' : `${writeOp.length} refusal(s), e.g. ordinal ${writeOp[0].ordinal} (${writeOp[0].agent_name})`);
  const signalled = calls.some((call) => call.tool_name === 'terminal' && argsOf(call).session_action === 'send_signal');
  check(signalled, 'the probe run attempted the SIGINT stop', signalled ? 'send_signal dispatched' : 'no send_signal in the record — the model did not attempt it');
  const sigint = calls.filter((call) => call.tool_name === 'terminal' && resultOf(call).includes('cannot be delivered'));
  check(sigint.length === 0, 'SIGINT was delivered without a platform refusal', sigint.length === 0 ? 'no refusal in the record' : `${sigint.length} refusal(s), e.g. ordinal ${sigint[0].ordinal} (${sigint[0].agent_name})`);
  // Live-run finding L4 (OQ-133): the session the agent stopped with its own signal read `failed (exit -1)`, an error
  // that filed a tool_error. It reads `killed` now; a `failed (exit -1)` anywhere in the record is the old shape.
  const signalDeath = calls.filter((call) => call.tool_name === 'terminal' && /is failed \(exit -1\)/.test(resultOf(call)));
  const readKilled = calls.filter((call) => call.tool_name === 'terminal' && /is killed \(exit -1\)/.test(resultOf(call)));
  // Neither shape in the record means the model never read the session back after its signal: nothing was observed
  // about the product, so it is a NOTE, not a pass.
  if (signalDeath.length === 0 && readKilled.length === 0) noted("no background session's end was read back after the agent's signal", signalled ? 'the model did not query the session after send_signal, so the status of its signal death was not observed' : 'no send_signal in the record');
  else check(signalDeath.length === 0, "no background session read failed (exit -1) after the agent's signal", signalDeath.length === 0 ? `${readKilled.length} observation(s) read killed (exit -1)` : `ordinal ${signalDeath[0].ordinal} (${signalDeath[0].agent_name})`);
  // The probe file served its purpose in the record above; the sandbox stays clean for the scenarios after it.
  if (read) {
    check(existsSync(join(workspace, 'friction-probe.txt')), 'the probe file landed in the workspace', 'friction-probe.txt');
    rmSync(join(workspace, 'friction-probe.txt'), { force: true });
  }
  noted('the stream-stall abort is not covered here', 'the `faults` scenario induces it through the recording proxy; the observed shape is recorded in docs/defects/single-retry-stream-stall-aborted-a-76-minute-run.md');
  noted('the exit-trace gap is not covered here', 'it needs a crash; the observed shape is recorded in docs/defects/process-exit-left-no-diagnosable-trace.md');
  results.scenarios.frictions = { status: read?.session.execution_status, tools: names, writeOpRefusals: writeOp.map((call) => call.ordinal), sigintRefusals: sigint.map((call) => call.ordinal) };
  if (read) preserveRun('frictions', read.session.session_id);
  await budgetGate();
}

// ── 7. The endpoint misbehaves, on purpose ───────────────────────────────────────────────────────────────
/**
 * Two of the run-autopsy's recorded frictions have always been reported as uncoverable here — "the stream-stall
 * abort is not covered, it needs an endpoint fault". The recording proxy is already in the path, so the
 * endpoint fault is now something this harness can produce, on a call it NAMES rather than on one it hopes for.
 *
 * Two launches, because one fault can end a run before the next would fire, and a rule that never fired is not
 * evidence about anything:
 *
 *   faults-ladder — a 429 on the second completion and a 500 on the third. Neither reaches the endpoint, so
 *                   this costs the owner nothing but the retries. The question is REQ-ORCH-092's: does the
 *                   ladder wait, fall back, and still finish?
 *   faults-stall  — the bytes stop mid-stream on the second completion and the socket stays open. The question
 *                   is the eighty-second defect's: a model timeout once collapsed into the same `aborted` flag
 *                   a user's stop sets, and the run reported itself `user_cancelled` with nobody having
 *                   pressed anything. That is the assertion below, and it is a real regression guard.
 *
 * NEVER EXECUTED AT THE TIME OF WRITING. The fault mechanism is unit-tested against a loopback upstream
 * (`lib/model-traffic.test.ts`); what these two checks claim about the PRODUCT is unverified until a live run
 * reports back, and the first execution owes its row in `docs/architecture/first-executions.md`.
 */
if (wanted.includes('faults')) {
  if (proxy === null) {
    noted('the fault scenarios did not run', 'they need the recording proxy, and it is not in the path (--no-record-traffic, or it could not start)');
  } else {
    const PROMPT = 'Read src/todos.js and reply, in one sentence, with the names of the functions it exports.';

    proxy.setFaults([{ kind: 'status', at: 2, status: 429 }, { kind: 'status', at: 3, status: 500 }]);
    const ladder = await launch('faults-ladder', {
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, RUN_WAIT_MS + 90_000);
    void ladder;
    const ladderFired = proxy.stats().faultsFired;
    const ladderTraffic = readTraffic('faults-ladder');
    const injected = ladderTraffic.filter((r) => r.fault !== undefined).map((r) => r.status);
    const ladderRead = readSession();
    checkPricing('faults-ladder', ladderRead?.session);
    check(ladderFired.length === 2, 'both injected refusals reached the product', `${ladderFired.length} of 2 fired; statuses recorded: ${injected.join(', ') || 'none'}`);
    check(ladderRead?.session.execution_status === 'completed', 'the run completed despite a 429 and a 500', `${ladderRead?.session.execution_status} (${ladderRead?.session.stop_reason})`);
    // A ladder that waited and retried made MORE calls than the faults it was given; one that gave up made fewer.
    check(ladderTraffic.length > injected.length, 'the ladder retried past the refusals rather than giving up', `${ladderTraffic.length} call(s) for ${injected.length} refusal(s)`);
    if (ladderRead) preserveRun('faults-ladder', ladderRead.session.session_id);
    results.scenarios['faults-ladder'] = { fired: ladderFired, injected, calls: ladderTraffic.length, status: ladderRead?.session.execution_status, stopReason: ladderRead?.session.stop_reason };
    await budgetGate();

    /*
     * The hold must OUTLAST the product's own idle bound, or this scenario measures the proxy letting go
     * rather than the product noticing. `llm_response_timeout` is 120 s by default (REQ-CONFIG-115, re-armed
     * per part — ADR-0027's fourth execution, which is the repair for the eighty-second defect), so 300 s
     * leaves a wide margin. Lower this below the product's bound and the run recovers for the wrong reason.
     * Measured on the first live execution, 2026-09-22: the product gave up at 120.5 s and retried at 121.5 s,
     * both well inside the hold.
     */
    const HOLD_MS = Number(process.env['LIVE_RUN_STALL_HOLD_MS'] ?? 300_000);
    proxy.setFaults([{ kind: 'stall', at: 2, afterChunks: 2, holdMs: HOLD_MS }]);
    const stalled = await launch('faults-stall', {
      ROTARIS_CAPTURE_PROMPT: PROMPT,
      ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '2500',
    }, RUN_WAIT_MS + 120_000);
    void stalled;
    const stallFired = proxy.stats().faultsFired;
    const stallRead = readSession();
    checkPricing('faults-stall', stallRead?.session);
    check(stallFired.length === 1, 'the stall was injected', `${stallFired.length} of 1 fired`);
    if (stallRead === null) {
      check(false, 'the stalled run left a session row', 'no session was recorded at all');
    } else {
      /*
       * THE POSITIVE HALF, and the reason it exists.
       *
       * `stop_reason !== 'user_cancelled'` is a check that also passes when nothing stalled at all — a run
       * that never met a fault ends `tasks_complete` too. On its own it is a proof that cannot fail, which
       * `codebase.md` rules is a finding rather than a pass. So the product must be shown to have NOTICED:
       * its own `issues` row, in its own words, saying the stream went quiet and it is retrying.
       *
       * Together the two are the eighty-second defect's question in full — the stream did stall, the product
       * did classify it, and what it classified it as was transient rather than a user's stop.
       */
      const issues = readIssues(stallRead.session.session_id);
      const noticed = issues.filter((issue) => /stream activity|no stream|timed out/i.test(String(issue.message ?? '')));
      check(noticed.length > 0, 'the product noticed the stalled stream and said so', noticed.length > 0 ? `${noticed[0].kind}: ${String(noticed[0].message).slice(0, 120)}` : `none of ${issues.length} issue(s) mentions the stream — the stall may not have reached the run at all`);
      // The eighty-second defect's signature: nobody pressed stop, so nothing may say the user cancelled.
      check(stallRead.session.stop_reason !== 'user_cancelled', 'a stalled stream is not reported as a user cancellation', `stop_reason ${stallRead.session.stop_reason} (${stallRead.session.execution_status})`);
      if (noticed.length > 0) check(noticed.every((issue) => issue.kind !== 'fatal_llm_error'), 'the stalled stream was classified transient, not fatal', noticed.map((issue) => issue.kind).join(', '));
      noted('what the stalled run settled as', `${stallRead.session.execution_status} / ${stallRead.session.stop_reason} after ${stallRead.session.iterations_completed} iteration(s)`);
      preserveRun('faults-stall', stallRead.session.session_id);
      results.scenarios['faults-stall'] = { fired: stallFired, holdMs: HOLD_MS, status: stallRead.session.execution_status, stopReason: stallRead.session.stop_reason, issues: issues.map((issue) => ({ kind: issue.kind, severity: issue.severity, message: issue.message })) };
    }
    results.scenarios['faults-stall'] ??= { fired: stallFired, holdMs: HOLD_MS, status: null, stopReason: null, issues: [] };
    proxy.setFaults([]);
    await budgetGate();
  }
}

// ── 8. The terminal under duress ─────────────────────────────────────────────────────────────────────────
/**
 * The shapes the record NAMES, replayed; never a plausible family resembling them.
 *
 * `codebase.md` states why that distinction is the whole scenario: sixty real-PTY runs at four geometries could
 * not reproduce a concatenation the live run had shown, and the trigger the sixty missed was narrow — an empty
 * write between two non-empty ones, present in both production commands and in none of the sixty. **Sixty
 * negative runs are not a negative result when none of them carries the input that failed.** So each shape below
 * is taken from a recorded defect and issued as that defect's own command, and each assertion reads `tool_calls`
 * — what the agent passed and what came back — rather than what the model said about it.
 *
 * | shape | the record it replays |
 * |---|---|
 * | `here-string`   | a multi-line command lost its newlines in the PTY, so a here-string never terminated |
 * | `long-output`   | the concatenation above, and the agent's capture VT-stripped where the window's was not |
 * | `unexpandable`  | live-run finding L1 — `a-posix-command-that-fails-to-expand-loses-its-end-marker.md`: a bash-ism dash cannot expand abandoned the wrapper's end frame, so a finished command read as a soft pause (POSIX only) |
 * | `wedge`         | `hardMs` passed and read nowhere: a call supplying no `timeout` had the soft pause and no hard cap (REQ-TOOLS-097) |
 * | `poll`          | live-run finding L2 — `an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed.md`: an empty poll returned at once and said thirty seconds had passed |
 * | `failed-word`   | `exit-0-output-flagged-on-the-word-failed-twice.md` — PD-TOOLS-003's capitals-only marker, and a real regression guard |
 * | `diff-exit-1`   | `git-diff-with-differences-read-as-a-failure.md` — ESC-41's carve-out, and a real regression guard |
 * | `pipe-to-shell` | `a-read-only-git-pipeline-was-withheld-by-the-pipe-to-shell-rule.md` — also cost, not contradiction |
 *
 * **A shape the model never attempted is a NOTE, not a failure.** `pipe-to-shell` is a cost observation whose
 * behaviour is faithful to a requirement, and reporting it as a fault would train a reader to ignore this
 * scenario — the mistake the board scenario made twice. `here-string`, `long-output`, the wedge's bound,
 * `failed-word`, `diff-exit-1` and the marker leak are asserted as product facts.
 */
if (wanted.includes('terminal')) {
  /*
   * The shapes, their patterns and the readers live in `lib/terminal-shapes.mjs` and are pinned by
   * `terminal-shapes.test.ts` — a pattern that stopped matching its own command would turn every check below
   * into "the model never attempted it", which is a green run and a question nobody is told has stopped being
   * asked. Per platform, because a here-string and a pipe-into-a-shell are written differently and a scenario
   * that is a no-op off win32 would report green for having asked nothing.
   */
  const SHAPES = terminalShapes();
  const PROMPT = [
    'Run each of the following in the terminal, exactly as written, one call per command, in this order.',
    'Do not rewrite them, do not split them, do not add a timeout argument, and do not skip one because you',
    'expect it to fail — a failure is the answer for some of them. Report what each did in one line.',
    '',
    ...SHAPES.map((shape, i) => `${i + 1}. ${shape.prompt ?? shape.command}`),
  ].join('\n');
  const log = await launch('terminal', {
    ROTARIS_CAPTURE_PROMPT: PROMPT,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(RUN_WAIT_MS), ROTARIS_CAPTURE_AFTER_MS: '3000',
  }, RUN_WAIT_MS + 120_000);
  check(!/capture: wait for result timed out/.test(log), 'the terminal run reached its result inside the wait');
  const read = readSession();
  checkPricing('terminal', read?.session);
  const calls = read === null ? [] : readToolCalls(read.session.session_id);
  const terminals = calls.filter((call) => call.tool_name === 'terminal');
  const shapeOf = (id) => SHAPES.find((shape) => shape.id === id);
  const attempted = (id) => terminals.filter((call) => shapeOf(id).match.test(String(call.args.command ?? '')));
  const seen = {};
  for (const shape of SHAPES) seen[shape.id] = attempted(shape.id).length;
  noted('what the model attempted', SHAPES.map((s) => `${s.id}×${seen[s.id]}`).join(', '));

  const hereString = attempted('here-string')[0];
  if (hereString === undefined) noted('the here-string was not attempted', 'no terminal call carried it; nothing is asserted about the PTY');
  else {
    const d = diagnosticOf(hereString.result);
    // The defect's signature is the here-string never terminating: newlines lost, so the shell waits for a
    // delimiter that never comes and the call dies on its timeout rather than on its own last line.
    check(String(hereString.args.command ?? '').includes('\n'), 'the multi-line command reached the tool with its newlines', `${String(hereString.args.command ?? '').split('\n').length} line(s) in args.command`);
    check(d?.timeout !== true && d?.exit_code === 0, 'the here-string terminated rather than hanging on a lost delimiter', `exit ${d?.exit_code ?? 'none'}${d?.timeout ? ', timed out' : ''}`);
    // Read from the OUTPUT section alone (`hereStringLinesReturned`): the diagnostic repeats the command, which carries
    // both words, so the whole result matched whether or not the shell printed anything — the 2026-09-22 pass was not
    // evidence (`docs/defects/fixed/the-here-string-check-reads-its-own-command-back.md`).
    const printedLines = outputOf(hereString.result) ?? '';
    check(hereStringLinesReturned(hereString.result), 'both lines of the here-string came back, in the output the shell printed', `alpha-one ${/alpha-one/.test(printedLines) ? 'present' : 'absent'}, beta-two ${/beta-two/.test(printedLines) ? 'present' : 'absent'} in the output section`);
  }

  const longOutput = attempted('long-output')[0];
  if (longOutput === undefined) noted('the long-output command was not attempted', 'no terminal call carried it; the concatenation and VT questions are unasked');
  else {
    const reading = longOutputReading(longOutput.result);
    check(reading.distinct === LONG_OUTPUT_LINES, `all ${LONG_OUTPUT_LINES} lines of output reached the agent`, `${reading.distinct} distinct of ${reading.markers.length} marker(s)`);
    // The concatenation the sixty runs could not reproduce is visible here as two markers sharing one line.
    check(reading.doubled.length === 0, 'no two output lines were concatenated into one', reading.doubled.length === 0 ? 'every marker on its own line' : `${reading.doubled.length} line(s), e.g. ${reading.doubled[0].slice(0, 120)}`);
    // The agent's capture and the terminal window's are meant to be the same rendering of the same bytes: the
    // strip landed for the live stream and the agent's capture was left behind, so the two diverged.
    check(!reading.escaped, 'the agent read a VT-stripped capture', reading.escaped ? 'an escape sequence survived into the recorded result' : 'no escape sequence in the recorded result');
  }

  // Live-run L1: the command ends at once with the shell's own error status, never a soft pause after the window. The
  // shape exists only off win32 (`terminalShapes`), so on Windows nothing is asked here: not applicable, not a NOTE.
  if (shapeOf('unexpandable') !== undefined) {
    const unexpandable = attempted('unexpandable')[0];
    if (unexpandable === undefined) noted('the unexpandable bash-ism was not attempted', 'no terminal call carried it; the wrapper\'s guard is unasked');
    else {
      const d = diagnosticOf(unexpandable.result);
      const elapsed = unexpandable.elapsedMs ?? NaN;
      check(d?.outcome_kind !== 'soft_pause' && d?.exit_code !== -1, 'a command sh could not expand ended with its own status, not a soft pause', `outcome ${d?.outcome_kind ?? 'none'}, exit ${d?.exit_code ?? 'none'}`);
      check(Number.isFinite(elapsed) && elapsed < 30_000, 'it ended inside the no-output window rather than after it', `${Number.isFinite(elapsed) ? Math.round(elapsed) : '?'} ms`);
      check(/\bran\b/.test(outputOf(unexpandable.result) ?? ''), 'what the line printed before its error came back', `output ${JSON.stringify((outputOf(unexpandable.result) ?? '').slice(0, 120))}`);
    }
  }

  const wedge = attempted('wedge')[0];
  if (wedge === undefined) noted('the wedge was not attempted', 'no terminal call carried it; the hard cap is unasked');
  else {
    const d = diagnosticOf(wedge.result);
    check(wedge.args.timeout === undefined, 'the wedge was issued with no timeout argument, as asked', `timeout ${wedge.args.timeout ?? 'absent'}`);
    // REQ-TOOLS-097 wants BOTH bounds with the first to fire governing. The defect was a call with neither a
    // caller timeout nor a hard cap; either a soft pause or a hard timeout is a bound, and no bound is the fault.
    const bounded = d?.timeout === true || /still running|Poll by calling|No output for/.test(wedge.result);
    check(bounded, 'a call supplying no timeout was still bounded', d?.timeout === true ? `hard timeout at ${d.timeout_seconds}s` : bounded ? 'soft pause' : 'neither bound fired');
    if (d?.timeout === true) {
      check(Number.isFinite(d.timeout_seconds), 'the hard cap named its own bound', `timeout_seconds ${d.timeout_seconds}`);
      // PD-TOOLS-001: the reset must say what it lost AND what it put back, never be silent about the shell.
      check(/restored|failed|no earlier shell state/.test(wedge.result), 'the reset reported what it restored', 'the detail names the shell state');
    } else noted('the wedge did not reach the hard cap', 'it soft-paused first; the hard bound is unmeasured this run');
  }

  // Live-run L2: the first poll after the wedge. What it says it waited must be no more than the time between the wedge's
  // end and its own, both as the product recorded them; the no-output window it never waited out must not be claimed.
  const poll = wedge === undefined ? undefined
    : terminals.find((call) => call.ordinal > wedge.ordinal && String(call.args.command ?? '') === '' && call.args.is_input !== true && call.args.session_action === undefined && call.args.background !== true);
  if (poll === undefined) noted('no poll followed the wedge', 'no empty-command call after it; what a poll states is unasked');
  else {
    const d = diagnosticOf(poll.result);
    const since = /No new output in the (under 0\.1|\d+\.\d) seconds since the previous observation/.exec(poll.result);
    const gapMs = poll.endedAt !== null && wedge.endedAt !== null ? poll.endedAt - wedge.endedAt : null;
    if (d?.outcome_kind !== 'soft_pause' || (outputOf(poll.result) ?? '').trim() !== '(no output)') noted('the poll did not find the wedge silent', `outcome ${d?.outcome_kind ?? 'none'}; what an empty poll states is unasked`);
    else {
      check(!/No output for 30 seconds/.test(poll.result), 'an empty poll did not claim the no-output window it never waited out', /No output for 30 seconds/.test(poll.result) ? 'it said "No output for 30 seconds"' : 'no window claimed');
      const claimed = since === null ? null : since[1] === 'under 0.1' ? 0 : Number(since[1]) * 1000;
      check(claimed !== null && gapMs !== null && claimed <= gapMs + 100, 'what the poll said it waited is no more than the time that passed', `stated ${since?.[1] ?? 'nothing'} s, ${gapMs === null ? '?' : Math.round(gapMs)} ms between the wedge's end and the poll's`);
    }
  }

  const failedWord = attempted('failed-word')[0];
  if (failedWord === undefined) noted('the docker line was not attempted', 'no terminal call carried it; PD-TOOLS-003 is unasked');
  else {
    const d = diagnosticOf(failedWord.result);
    // PD-TOOLS-003: REQ-TOOLS-113's `FAILED ` marker matches in capitals only. This is the lower-case docker line
    // that warned in run `2e21e324` and cost the agent a second pass to explain it away — a real regression guard,
    // not a cost note. Its positive half reads the output alone: the diagnostic repeats the command, and with the
    // line absent from the output, "no marker warning" would pass for nothing.
    const printed = /failed to connect to the docker API/.test(outputOf(failedWord.result) ?? '');
    check(d?.exit_code === 0 && printed, 'the docker line was printed and exited 0, as the shape needs', `exit ${d?.exit_code ?? 'none'}, line ${printed ? 'present' : 'absent'} in the output`);
    if (d?.exit_code === 0 && printed) {
      const warnings = d.warnings ?? [];
      check(d.outcome_kind !== 'suspicious_success', 'a lower-case failed at exit 0 was not classified suspicious_success', `outcome ${d.outcome_kind ?? 'none'}`);
      check(!warnings.some((w) => /failure marker/.test(w)), 'no failure-marker warning on the lower-case line', `warnings: ${warnings.join(' ') || 'none'}`);
    }
  }

  const diffExitOne = attempted('diff-exit-1')[0];
  if (diffExitOne === undefined) noted('the git diff was not attempted', 'no terminal call carried it; ESC-41 is unasked');
  else {
    const d = diagnosticOf(diffExitOne.result);
    // ESC-41's carve-out: `git diff` exiting 1 IS the answer, and classifying it a failure made the agent
    // explain away its own evidence. A real regression guard, not a cost note.
    check(d?.exit_code === 1, 'the git diff found differences and exited 1, as the shape needs', `exit ${d?.exit_code ?? 'none'}`);
    if (d?.exit_code === 1) check(d?.outcome_kind !== 'shell_failure', 'exit 1 from git diff was not classified a shell failure', `outcome ${d?.outcome_kind ?? 'none'}`);
  }

  const piped = attempted('pipe-to-shell')[0];
  if (piped === undefined) noted('the piped git pipeline was not attempted', 'no terminal call carried it');
  else noted('a read-only git pipeline through a pipe', `${piped.status}${/pipe to shell/i.test(piped.result) ? ' by starter:deny-pipe-to-shell' : ''} — REQ-TOOLS-036/038 firing as specified; recorded for cost`);

  // The end marker is the harness the terminal uses to find where a command finished; the model must never
  // read it. Detection matched it unanchored while removal matched it anchored, and it leaked verbatim.
  const leaked = terminals.filter((call) => /__rot_/.test(call.result));
  check(leaked.length === 0, 'no end marker leaked into what the model read', leaked.length === 0 ? 'no __rot_ in any terminal result' : `${leaked.length} call(s), e.g. ordinal ${leaked[0].ordinal}`);

  results.scenarios.terminal = {
    platform: process.platform, status: read?.session.execution_status, stopReason: read?.session.stop_reason,
    attempted: seen, terminalCalls: terminals.length,
    diagnostics: SHAPES.map((shape) => {
      const call = shape.id === 'poll' ? poll : attempted(shape.id)[0];
      return { id: shape.id, command: shape.command, ...(call === undefined ? { attempted: false } : { attempted: true, ordinal: call.ordinal, status: call.status, diagnostic: diagnosticOf(call.result) }) };
    }),
  };
  if (read) preserveRun('terminal', read.session.session_id);
  await budgetGate();
}

// ── 9. The long run ──────────────────────────────────────────────────────────────────────────────────────
/**
 * OPT-IN, and the only scenario here that is. `--only=duress`.
 *
 * `codebase.md` names the gap this exists to enter: "`pnpm live-run` runs short tasks against an unmetered
 * endpoint, so it holds **no generation near the model timeout, no multi-line command, and no re-spawn**. Every
 * one of the seven lived in exactly that gap." Scenario 8 takes the multi-line command. This one takes the
 * length: a delegating run long enough to reach compression, a child that ends badly, and the aggregates that
 * only diverge after a while.
 *
 * **What it asserts is coherence, not correctness.** A long run's failures are mostly records that disagree with
 * each other — a stopped run with a null summary, tokens with no cost, a compressions counter that never
 * counted, a child report that hardcoded an empty command list. `autopsy.mjs` already computes most of those, so
 * the checks read its output and the store rather than re-deriving them here; that is what makes a thirty-minute
 * scenario cheap to write and hard to fool. What the model produced is NOT asserted: a weak model doing the work
 * badly is a fact about the model.
 *
 * Its wall clock is `LIVE_RUN_DURESS_MS` (default 40 minutes, the owner's figure of 2026-09-22).
 *
 * **The fixture question, ruled rather than left open (2026-09-22, delegated by the owner): the default stays
 * `todo-app`, and the LENGTH comes from the work asked for rather than from the tree's weight.** A bigger
 * fixture is a second tree to maintain and to keep in step with five other scenarios' prompts, and it does not
 * actually buy what it looks like it buys — a five-file repository and a five-hundred-file one both delegate
 * exactly as much as the prompt commissions. So the prompt below is three WAVES that each depend on the last,
 * which is what reaches compression, re-spawn and a child that ends badly; `--duress-fixture` remains for
 * pointing this at a real tree when the question is about size specifically.
 */
if (wanted.includes('duress')) {
  /*
   * Three dependent waves. Wave two cannot start until wave one's reports exist and wave three cannot start
   * until wave two's do, so the parent's conversation grows monotonically across all of them — which is the
   * thing a long run is FOR. A single wave of three parallel children finishes in minutes and measures the
   * short path under a longer deadline.
   */
  const PROMPT = [
    'Work through this repository as a team, delegating rather than doing the work yourself. Three waves, in order,',
    'each waiting for the one before it.',
    '',
    'Wave 1 — commission three children and wait for all three:',
    '  a. document every exported function under src/ into docs/api.md, one section each, with its signature,',
    '     its parameters and an example call taken from real usage in the repository;',
    '  b. add test/extra.test.js covering every branch of the list functions, run `node --test` in the terminal,',
    '     and keep fixing until it is green;',
    '  c. write docs/overview.md summarising the repository with a file-by-file table and a dependency list.',
    '',
    'Wave 2 — read all three outputs yourself, then commission two more children and wait for both:',
    '  d. reconcile docs/api.md against docs/overview.md and fix every disagreement in both files;',
    '  e. add docs/decisions.md recording, for each source file, one design decision it embodies and the',
    '     alternative it rejected, citing the lines that show it.',
    '',
    'Wave 3 — commission one final child to verify the whole result: it must re-read every file the other five',
    'touched, run `node --test` again in the terminal, and write docs/verification.md listing what it checked,',
    'what it found and what it could not confirm.',
    '',
    'Read files before describing them; do not describe a file you have not opened. When wave 3 has reported,',
    'reply with one paragraph naming what each child did and which files changed.',
  ].join('\n');
  const startedAt = Date.now();
  const log = await launch('duress', {
    ROTARIS_CAPTURE_PROMPT: PROMPT,
    ROTARIS_CAPTURE_WAIT: 'result', ROTARIS_CAPTURE_WAIT_MS: String(DURESS_MS), ROTARIS_CAPTURE_AFTER_MS: '4000',
  }, DURESS_MS + 180_000);
  const elapsed = Date.now() - startedAt;
  check(!/capture: wait for result timed out/.test(log), 'the long run reached its result inside the wait', `${Math.round(elapsed / 1000)} s of ${Math.round(DURESS_MS / 1000)} s`);
  const read = readSession();
  checkPricing('duress', read?.session);
  if (read === null) check(false, 'the long run left a session row', 'no session was recorded at all');
  else {
    const sessionId = read.session.session_id;
    // The autopsy is written FIRST, because the checks below read it. `preserveRun` never throws.
    preserveRun('duress', sessionId);
    const autopsyFile = join(scenarioDir('duress'), 'autopsy.txt');
    const autopsy = existsSync(autopsyFile) ? readFileSync(autopsyFile, 'utf8') : '';
    const coherent = (label) => new RegExp(`${label}: (true|false)`).exec(autopsy)?.[1] ?? null;
    if (autopsy === '') check(false, 'the autopsy reader produced a reading of the long run', 'autopsy.txt is absent or empty');
    else {
      check(coherent('null summary on stopped run') === 'false', 'a stopped run did not end with a null summary', `autopsy says ${coherent('null summary on stopped run')}`);
      /*
       * "Zero cost with tokens" is only incoherent where a cost COULD have been computed. On an endpoint
       * registered `--unmetered` with no prices, the product has no figure to record and `cost` is correctly
       * `0` — asserting otherwise would report a product fault that is not one. Caught before it was spent:
       * the 2026-09-22 `faults` pack shows this line reading `true` on katalyst against 18,810 tokens, with
       * nothing wrong. Where a money figure DOES exist, the original question stands.
       */
      const priceable = accountingKind === 'provider' || accountingKind === 'priced';
      if (priceable) check(coherent('zero cost with tokens') === 'false', 'tokens were not recorded against a zero cost', `autopsy says ${coherent('zero cost with tokens')}`);
      else noted('the zero-cost reading is not a question on this endpoint', `accounting is ${accountingKind}: no money figure exists, so cost 0 against real tokens is correct (autopsy says ${coherent('zero cost with tokens')})`);
    }

    const Database = require('better-sqlite3');
    const db = new Database(oneDatabase(), { readonly: true });
    let children = [];
    let compressed = 0;
    let aggregate = null;
    try {
      children = db.prepare('SELECT given_name, persona, state, tool_calls, report FROM children WHERE session_id = ? ORDER BY spawned_at').all(sessionId);
      compressed = db.prepare("SELECT COUNT(*) AS n FROM timeline WHERE session_id = ? AND name = 'context_compressed'").get(sessionId)?.n ?? 0;
      aggregate = db.prepare('SELECT compressions FROM sessions WHERE session_id = ?').get(sessionId)?.compressions ?? null;
    } finally { db.close(); }
    const reportOf = (child) => { try { return JSON.parse(child.report ?? '{}'); } catch { return {}; } };
    const calls = readToolCalls(sessionId);

    // A run that commissioned nobody asked none of the questions below. That is a fact about the model and the
    // fixture, not a fault of the product, so it is a NOTE — and the checks that depend on it say so too.
    // Six were asked for, over three dependent waves. Fewer is a fact about the model, not a fault of the
    // product, so it is reported rather than failed — but how many arrived decides whether this run reached
    // the depth the scenario is named for, and a reader should not have to count the list to find out.
    if (children.length === 0) noted('the long run commissioned no children', `fixture ${basename(workspaceFixture)}; delegation was asked for and not taken, so the child-record checks are unasked`);
    else if (children.length < 6) noted('the long run commissioned fewer children than it was asked for', `${children.length} of 6 across three waves — it did not reach the depth this scenario is for`);
    else {
      noted('what the long run commissioned', children.map((c) => `${c.given_name} [${c.persona}] ${c.state}, ${c.tool_calls} calls`).join('; '));
      // The eighty-second defect's shape at the child level: four of eleven children died with an empty
      // `final_response` because a model timeout was read as a user abort. An empty report from a failed child
      // is the observable, whatever the cause underneath it.
      const silent = children.filter((c) => c.state === 'failed' && String(reportOf(c).final_response ?? '') === '');
      check(silent.length === 0, 'no child ended failed with nothing to say', silent.length === 0 ? 'every failed child reported' : `${silent.length}: ${silent.map((c) => c.given_name).join(', ')}`);
      // The eighty-eighth: `commands: []` was hardcoded at all three construction sites, so a child that ran
      // eight commands reported none. Derived from the transcript now; this is the live reading of that.
      const ranCommands = children.filter((c) => c.tool_calls > 0 && calls.some((call) => call.agent_name === c.given_name && call.tool_name === 'terminal'));
      const mute = ranCommands.filter((c) => (reportOf(c).commands ?? []).length === 0);
      if (ranCommands.length === 0) noted('no child ran a terminal command', 'the report.commands reading is unasked this run');
      else check(mute.length === 0, 'every child that ran a command reported its commands', mute.length === 0 ? `${ranCommands.length} child(ren) reported theirs` : `${mute.length} reported none, e.g. ${mute[0].given_name}`);
    }

    // The eighty-seventh: the session `compressions` aggregate was declared, rehydrated, copied into every save
    // and never added to — three `context_compressed` entries against a persisted 0 (REQ-SESSION-139, ADR-0008).
    if (compressed === 0) noted('the long run never compressed its context', `${read.session.iterations_completed} iteration(s) was not long enough; the compressions aggregate is unasked`);
    else check(aggregate === compressed, 'the compressions aggregate counted what the timeline recorded', `aggregate ${aggregate} against ${compressed} timeline entr${compressed === 1 ? 'y' : 'ies'}`);

    const leaked = calls.filter((call) => call.tool_name === 'terminal' && /__rot_/.test(call.result));
    check(leaked.length === 0, 'no end marker leaked into what the model read', leaked.length === 0 ? 'no __rot_ in any terminal result' : `${leaked.length} call(s), e.g. ordinal ${leaked[0].ordinal}`);

    // Whether this run was duress at all. Said plainly rather than inferred from a green: a scenario built for
    // the long path that finished in four minutes has measured the short path under a longer deadline.
    noted('how long the long run was', `${Math.round(elapsed / 1000)} s, ${read.session.iterations_completed} iteration(s), ${calls.length} tool call(s), ${children.length} child(ren), ${compressed} compression(s) — fixture ${basename(workspaceFixture)}`);
    // The ceiling is written into the sandbox once for every scenario, so the long run inherits the smoke
    // test's. A run that stopped at it was bounded by the harness and not by the work, and the difference is
    // invisible in a green: `--max-iterations` is what raises it.
    if (read.session.iterations_completed >= MAX_ITERATIONS) noted('the long run stopped at the iteration ceiling', `${MAX_ITERATIONS} iterations — it was bounded by --max-iterations, not by the work; raise it to ask the longer question`);
    results.scenarios.duress = {
      fixture: basename(workspaceFixture), elapsedMs: elapsed, budgetMs: DURESS_MS,
      status: read.session.execution_status, stopReason: read.session.stop_reason,
      iterations: read.session.iterations_completed, toolCalls: calls.length, compressions: { aggregate, timeline: compressed },
      children: children.map((c) => ({ name: c.given_name, persona: c.persona, state: c.state, toolCalls: c.tool_calls, commands: (reportOf(c).commands ?? []).length })),
    };
  }
  await budgetGate();
}

await budgetGate();
const spentTokens = (results.tokens?.input ?? 0) + (results.tokens?.output ?? 0);
if (accountingKind === 'unmetered') noted('no ceiling was imposed', `${spentTokens} tokens over the run; this endpoint is registered unmetered`);
else if (typeof results.spentUsd === 'number') check(results.spentUsd <= BUDGET, `the spend stayed under the ${BUDGET.toFixed(2)} USD ceiling`, `${results.spentUsd.toFixed(4)} USD`);
else check(spentTokens <= MAX_TOKENS, `the run stayed under the ${MAX_TOKENS} token ceiling`, `${spentTokens} tokens`);
finish(0);
