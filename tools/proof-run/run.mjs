#!/usr/bin/env node
// `pnpm proofs:run` — one build, then the named proof suites several at a time.
//
// A proof launches the built application against a scratch profile of its own under `.proof/<id>/`, so two proofs
// share nothing but the build and the host. Run one after another, the suites a change touches took about an hour
// (the owner, 2026-11-20); eight of them side by side took the time of the slowest, each no slower than alone. So
// this builds once, passes `--skip-build` to every proof whose registry record lists it, and keeps `--jobs` of them
// running until none is left. A red stops nothing: every proof runs to its end and the summary names each red, so one
// run reads the whole suite.
//
// A proof that went red beside others is then run again alone, one at a time, which is how a proof is defined to run:
// two of twenty-four went red only beside seven neighbours on the day this was measured (a link's click, a sampler's
// window). The reading alone decides, and the summary says which proofs needed it, so a suite that cannot stand
// neighbours is seen and not hidden. The exit status is 1 when any proof was red alone.
//
//   pnpm proofs:run <proof-id>…        the named proofs
//   pnpm proofs:run --plan             the proofs `pnpm verify:plan` names for the diff (--base=<ref> is passed on)
//   --jobs=<n>                         how many run at once (default: a third of the cores, at least one)
//   --no-build                         the build is already current; every proof is still told to skip its own
//
// Each proof's output goes to `.proof/proofs-run/<id>.log`, and `.proof/proofs-run/results.json` holds the run:
// per proof its exit status and duration, and under `alone` the second reading where one was taken (`<id>.alone.log`). A proof records itself in the development-time store as it does alone.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROOFS } from '../proof-registry/registry.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const USAGE = `pnpm proofs:run [--plan [--base=<ref>] | <proof-id>…] [--jobs=<n>] [--no-build]

  one build, then the named proof suites side by side; a red stops nothing and the summary names each one
  --plan       the proofs pnpm verify:plan names for the diff
  --jobs=<n>   how many run at once (default: a third of the cores, at least one)
  --no-build   skip the build (it is current); each proof still skips its own
`;

/** How many proofs run at once by default: a third of the cores, where eight ran side by side on 24 without one slowing. @param {number} cores */
export const defaultJobs = (cores) => Math.max(1, Math.floor(cores / 3));

/**
 * @param {string[]} args
 * @returns {{ ids: string[], plan: boolean, base: string | null, jobs: number | null, build: boolean, help: boolean, unknown: string[] }}
 */
export function parseArgs(args) {
  /** @type {ReturnType<typeof parseArgs>} */
  const parsed = { ids: [], plan: false, base: null, jobs: null, build: true, help: false, unknown: [] };
  for (const a of args) {
    if (a === '--help' || a === '-h') parsed.help = true;
    else if (a === '--plan') parsed.plan = true;
    else if (a === '--no-build') parsed.build = false;
    else if (a.startsWith('--base=')) parsed.base = a.slice('--base='.length);
    else if (/^--jobs=[1-9]\d*$/.test(a)) parsed.jobs = Number(a.slice('--jobs='.length));
    else if (a.startsWith('-')) parsed.unknown.push(a);
    else parsed.ids.push(a);
  }
  return parsed;
}

/**
 * The command that runs one proof without its own build: the `node <script>` its pnpm script names, and
 * `--skip-build` where the registry says the script reads it (a script that does not builds nothing itself).
 * @param {string} id
 * @param {Record<string, string>} scripts the root package's scripts
 * @param {ReadonlyArray<{ id: string, flags: readonly string[] }>} [registry]
 * @returns {{ file: string, args: string[] }}
 */
export function commandFor(id, scripts, registry = PROOFS) {
  const record = registry.find((p) => p.id === id);
  if (!record) throw new Error(`${id} is not a proof the registry knows (tools/proof-registry/registry.mjs)`);
  const m = /^node (\S+\.mjs)$/.exec(scripts[id] ?? '');
  if (!m) throw new Error(`${id}'s pnpm script is not \`node <script>.mjs\`: ${scripts[id] ?? '(none)'}`);
  return { file: /** @type {string} */ (m[1]), args: record.flags.some((f) => f.split(/[ =]/)[0] === '--skip-build') ? ['--skip-build'] : [] };
}

/**
 * @typedef {{ id: string, status: number | null, signal: string | null, durationMs: number, alone?: { status: number | null, signal: string | null, durationMs: number } }} ProofResult
 */

/**
 * Keep `jobs` proofs running until every id has run; results come back in the order given. A start that throws is a
 * red of that proof, not of the run.
 * @param {{ ids: readonly string[], jobs: number, start: (id: string) => Promise<{ status: number | null, signal?: string | null }>, now?: () => number, onEnd?: (result: ProofResult) => void }} options
 * @returns {Promise<ProofResult[]>}
 */
export async function runPool({ ids, jobs, start, now = Date.now, onEnd = () => undefined }) {
  /** @type {ProofResult[]} */
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const index = next;
      next += 1;
      const id = /** @type {string} */ (ids[index]);
      const began = now();
      /** @type {{ status: number | null, signal?: string | null }} */
      let ended;
      try {
        ended = await start(id);
      } catch {
        ended = { status: null, signal: null };
      }
      const result = { id, status: ended.status, signal: ended.signal ?? null, durationMs: now() - began };
      results[index] = result;
      onEnd(result);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, ids.length)) }, worker));
  return results;
}

/** @param {number} ms */
const seconds = (ms) => `${(ms / 1000).toFixed(0)}s`;

/** Whether a proof counts as green: green beside the others, or green alone after a red there. @param {ProofResult} r */
export const isGreen = (r) => r.status === 0 || r.alone?.status === 0;

/** The summary: one line per proof, then the count, the reds, and the proofs that were green only alone. @param {readonly ProofResult[]} results @param {number} wallMs */
export function summary(results, wallMs) {
  const how = (/** @type {{ status: number | null, signal: string | null }} */ r) => r.signal ?? `exit ${r.status}`;
  const lines = results.map((r) => {
    if (r.status === 0) return `  green  ${r.id}  ${seconds(r.durationMs)}`;
    const beside = `${seconds(r.durationMs)}  (${how(r)})`;
    if (r.alone === undefined) return `  RED    ${r.id}  ${beside}`;
    return `  ${r.alone.status === 0 ? 'green' : 'RED  '}  ${r.id}  ${beside} beside the others; alone ${seconds(r.alone.durationMs)}${r.alone.status === 0 ? '' : `  (${how(r.alone)})`}`;
  });
  const red = results.filter((r) => !isGreen(r));
  const onlyAlone = results.filter((r) => r.status !== 0 && r.alone?.status === 0);
  const sum = results.reduce((a, r) => a + r.durationMs, 0);
  lines.push(`proofs:run: ${results.length - red.length} green, ${red.length} red in ${seconds(wallMs)} (${seconds(sum)} one after another)`);
  if (onlyAlone.length > 0) lines.push(`proofs:run: green only alone: ${onlyAlone.map((r) => r.id).join(', ')}`);
  if (red.length > 0) lines.push(`proofs:run: red: ${red.map((r) => r.id).join(', ')}`);
  return lines.join('\n');
}

/** As `tools/verify-plan/plan.mjs` has it: true when this module is the entry point. @param {string | undefined} argv1 */
function isMainModule(argv1) {
  return argv1 !== undefined && import.meta.url === pathToFileURL(resolve(argv1)).href;
}

if (isMainModule(process.argv[1])) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) { process.stdout.write(USAGE); process.exit(0); }
  if (parsed.unknown.length > 0 || (parsed.plan && parsed.ids.length > 0) || (!parsed.plan && parsed.ids.length === 0)) {
    process.stderr.write(parsed.unknown.length > 0 ? `proofs:run: unknown argument ${parsed.unknown.join(' ')}\n${USAGE}` : `proofs:run: name the proofs, or pass --plan (never both)\n${USAGE}`);
    process.exit(2);
  }
  let ids = parsed.ids;
  if (parsed.plan) {
    const planned = spawnSync(process.execPath, [join(repo, 'tools', 'verify-plan', 'plan.mjs'), '--json', ...(parsed.base === null ? [] : [`--base=${parsed.base}`])], { cwd: repo, encoding: 'utf8' });
    if (planned.status !== 0) { process.stderr.write(`proofs:run: verify:plan exited ${planned.status}: ${(planned.stderr || planned.stdout).trim()}\n`); process.exit(2); }
    ids = JSON.parse(planned.stdout).proofs;
    if (ids.length === 0) { process.stdout.write('proofs:run: the plan names no proof\n'); process.exit(0); }
  }
  const scripts = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts;
  /** @type {Map<string, { file: string, args: string[] }>} */
  const commands = new Map();
  try {
    for (const id of ids) commands.set(id, commandFor(id, scripts));
  } catch (error) {
    process.stderr.write(`proofs:run: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
  if (parsed.build) {
    const pnpm = process.platform === 'win32' ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm run build'], { cwd: repo, stdio: 'inherit' }) : spawnSync('pnpm', ['run', 'build'], { cwd: repo, stdio: 'inherit' });
    if (pnpm.status !== 0) { process.stderr.write(`proofs:run: the build exited ${pnpm.status ?? pnpm.signal} — no proof ran\n`); process.exit(1); }
  }
  const output = join(repo, '.proof', 'proofs-run');
  mkdirSync(output, { recursive: true });
  const jobs = parsed.jobs ?? defaultJobs(availableParallelism());
  process.stdout.write(`proofs:run: ${ids.length} proof(s), ${jobs} at a time; logs under ${output}\n`);

  /** @type {Set<import('node:child_process').ChildProcess>} */
  const live = new Set();
  // A proof that is signalled takes every launch it started with it (docs/proofs/README.md, "How a proof launch is
  // bounded"), so ending the run is passing the signal on.
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
    process.on(signal, () => { for (const child of live) child.kill(signal); process.exitCode = 1; });
  }
  /** @param {string} suffix */
  const starter = (suffix) => (/** @type {string} */ id) => new Promise((settle, fail) => {
    const { file, args } = /** @type {{ file: string, args: string[] }} */ (commands.get(id));
    const log = createWriteStream(join(output, `${id}${suffix}.log`));
    const child = spawn(process.execPath, [join(repo, file), ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    live.add(child);
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', (error) => { live.delete(child); log.end(); fail(error); });
    child.on('close', (status, signal) => { live.delete(child); log.end(); settle({ status, signal }); });
  });
  const said = (/** @type {ProofResult} */ r, /** @type {string} */ note) => process.stdout.write(`  ${r.status === 0 ? 'green' : 'RED  '}  ${r.id}  ${seconds(r.durationMs)}${note}\n`);
  const began = Date.now();
  const results = await runPool({ ids, jobs, start: starter(''), onEnd: (r) => said(r, '') });
  const again = results.filter((r) => r.status !== 0);
  if (jobs > 1 && again.length > 0 && process.exitCode === undefined) {
    process.stdout.write(`proofs:run: ${again.length} red beside the others — each again, alone\n`);
    const alone = await runPool({ ids: again.map((r) => r.id), jobs: 1, start: starter('.alone'), onEnd: (r) => said(r, '  (alone)') });
    for (const [i, r] of again.entries()) {
      const second = /** @type {ProofResult} */ (alone[i]);
      r.alone = { status: second.status, signal: second.signal, durationMs: second.durationMs };
    }
  }
  const wallMs = Date.now() - began;
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ jobs, wallMs, results }, null, 2)}\n`);
  process.stdout.write(`${summary(results, wallMs)}\n`);
  process.exit(results.every(isGreen) ? 0 : 1);
}
