// @ts-check
// The development-time measurement tool (R-075). Priority 3 of the owner's process review of 2026-10-18: "Measure
// development time before optimizing checks. Capture time spent on setup, build, individual gate stages, proofs,
// repairs, and repeated rebases. Establishes where time actually goes. I haven't benchmarked these, so speed gains
// remain hypotheses." This tool is that measure: it wraps a command or a manual span around a clock, appends one
// honest record per span, and aggregates what was recorded — nothing more. It optimizes nothing and it fails nothing
// but itself: no gate reads the store, and the record is evidence for decisions, not a control on them.
//
// **Where the store lives.** `~/.rotaris/dev-time/log.jsonl`, by the precedent of the live-run endpoint registry
// (`apps/desktop/scripts/lib/endpoint-registry.mjs` reads `~/.rotaris/live-run/`). Worktrees are temporary and are
// removed, so a store inside one would lose exactly the history this tool exists to keep; a per-user store survives
// them all and shared across worktrees it can still be read per repository (`repo` on every record is the common
// directory, which one repository's worktrees share). `ROTARIS_DEV_TIME_HOME` overrides the directory — the tests
// use it, and a machine that wants its records elsewhere can too. Nothing here ever writes inside the repository.
//
// **What a record holds.** `schema` (1), `kind` and `label` (the identity), the command as it was spelled, the
// working directory, the repository facts at the time (`root`, `repo`, `branch`, `head`, `dirty` — all null outside
// a repository), the host facts (`platform`, `arch`, `node`, `cpus`, `memoryGb`), `startedAt`/`endedAt` (ISO 8601,
// UTC), `durationMs` (measured on the monotonic clock for a command; on the wall clock for a manual span, which has
// to cross processes — a clock correction can skew one), `exitCode`/`signal` (`null` for a manual span), and `error`
// (the spawn failure's code, `null` when the child was started). A failed command is recorded like any other: the
// wrapper's exit code is the child's, and a failing row in the report is a fact about the command, not a flaw of the
// tool.
//
// **Honesty rules.** Each record is one JSONL line, appended; a line that cannot be read back is skipped and
// *counted* — `readRecords` returns `skips` with the line numbers, and the report names them — so a torn line can
// never silently shrink the denominator. A `start` with a span already open for the same worktree is refused, not
// overwritten; a `stop` with no span open is refused, not invented.
//
// Usage — the CLI is `cli.mjs`; `pnpm dev-time` with no command prints it:
//   run <kind>:<label> -- <command…>   measure one command (setup, build, repair work, a rebase…)
//   gate [--stage=<name>]… [--keep-going]   the four `pnpm check` stages, one record each
//   proof <script> [args…]             a named pnpm script (a proof script, the live run)
//   start <kind>:<label> / stop / cancel / pending   manual spans around work no single command covers
//   report [--days=N] [--json]         aggregate by kind and label
//   log [--tail=N] [--all] [--json]    the recent records
//
// Plain JavaScript with `@ts-check`, like `tools/build-id/`: the callers are `pnpm dev-time` invocations and the
// tests beside it, and none compiles TypeScript. `dev-time.d.mts` is the contract for those tests.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, homedir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { REDIRECTING } from '../build-id/build-id.mjs';

/** The record schema this module writes and is willing to read back. */
export const SCHEMA = 1;

/** The closed set of kinds. A kind outside it is a usage error: an honest report cannot group an invented one. */
export const KINDS = Object.freeze(['setup', 'build', 'gate', 'proof', 'repair', 'rebase', 'other']);

/** `pnpm check`'s stages, in its own order (`symbols && typecheck && lint && test`). */
export const GATE_STAGES = Object.freeze(['symbols', 'typecheck', 'lint', 'test']);

/** The environment variable that overrides the store directory (the tests' seam, and a machine's choice). */
export const HOME_ENV = 'ROTARIS_DEV_TIME_HOME';

/** The one file records are appended to, under the store directory. */
export const STORE_FILE = 'log.jsonl';

/** The exit code a child ended by this signal maps to, POSIX shell style (128 + n); an unknown signal maps to 1. */
const SIGNAL_CODES = Object.freeze({ SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGABRT: 6, SIGKILL: 9, SIGSEGV: 11, SIGTERM: 15, SIGBREAK: 21 });

/**
 * The store directory: `ROTARIS_DEV_TIME_HOME` when set, else `~/.rotaris/dev-time`.
 * @param {NodeJS.ProcessEnv} [env] @param {string} [home]
 */
export function defaultStoreDir(env = process.env, home = homedir()) {
  const override = env[HOME_ENV];
  return override !== undefined && override !== '' ? resolve(override) : join(home, '.rotaris', 'dev-time');
}

/**
 * The record file under a store directory.
 * @param {string} storeDir
 */
export function storePath(storeDir) {
  return join(storeDir, STORE_FILE);
}

/**
 * Parse a `<kind>:<label>` token: the kind from the closed set, the label a single word (letters, digits, `.`, `_`,
 * `-`), so it stays readable in the report's table and unambiguous on a command line.
 * @param {string} text
 * @returns {{ kind: string, label: string } | { problem: string }}
 */
export function parseKindLabel(text) {
  const at = text.indexOf(':');
  if (at < 1 || at === text.length - 1) {
    return { problem: `"${text}" is not a <kind>:<label> token — write it like \`gate:test\` or \`repair:flaky-windows-test\`` };
  }
  const kind = text.slice(0, at);
  const label = text.slice(at + 1);
  if (!KINDS.includes(kind)) {
    return { problem: `"${kind}" is not a kind; the kinds are ${KINDS.join(', ')}` };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(label)) {
    return { problem: `"${label}" is not a label; labels are one word of letters, digits, \`.\`, \`_\` or \`-\`` };
  }
  return { kind, label };
}

/**
 * One git command in `cwd`, answered as its trimmed output or the reason it gave none. The variables an enclosing
 * git process sets (a hook running `pnpm dev-time`) are removed first, as `tools/build-id/build-id.mjs` does, so the
 * facts describe the asked-for directory, never the repository some ancestor pointed git at.
 * @param {string} cwd @param {string[]} args @param {{ git?: string, env?: NodeJS.ProcessEnv }} [how]
 * @returns {{ ok: true, out: string } | { ok: false, why: string }}
 */
function gitOut(cwd, args, { git: executable = 'git', env = process.env } = {}) {
  const clean = { ...env };
  for (const name of REDIRECTING) delete clean[name];
  const r = spawnSync(executable, ['--no-optional-locks', '-C', cwd, ...args], { encoding: 'utf8', env: clean, windowsHide: true, timeout: 60_000 });
  if (r.error) return { ok: false, why: `${executable} could not be run (${r.error.code ?? r.error.message})` };
  if (r.status !== 0) {
    const said = (r.stderr || r.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
    return { ok: false, why: said ?? `git ${args.join(' ')} exited ${r.status ?? r.signal}` };
  }
  return { ok: true, out: (r.stdout ?? '').trim() };
}

/**
 * The repository facts a record carries. Soft everywhere: a directory that is no repository (or no git at all)
 * answers nulls, never an error — a recorded command outside a repository is still a measurement.
 * @param {{ cwd?: string, git?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ root: string | null, repo: string | null, branch: string | null, head: string | null, dirty: boolean | null }}
 */
export function gitFacts({ cwd = process.cwd(), git, env } = {}) {
  const top = gitOut(cwd, ['rev-parse', '--show-toplevel'], { git, env });
  if (!top.ok) return { root: null, repo: null, branch: null, head: null, dirty: null };
  const common = gitOut(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'], { git, env });
  let repo = null;
  if (common.ok) repo = common.out;
  else {
    const plain = gitOut(cwd, ['rev-parse', '--git-common-dir'], { git, env });
    repo = plain.ok ? resolve(cwd, plain.out) : null;
  }
  const branch = gitOut(cwd, ['branch', '--show-current'], { git, env });
  const head = gitOut(cwd, ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'], { git, env });
  const status = gitOut(cwd, ['status', '--porcelain=v1', '--untracked-files=normal'], { git, env });
  return {
    root: top.out,
    repo,
    branch: branch.ok && branch.out !== '' ? branch.out : null,
    head: head.ok ? head.out : null,
    dirty: status.ok ? status.out !== '' : null,
  };
}

/**
 * The facts of the host the measurement ran on — small enough to sit on every record, so a slow row can be read
 * against the machine it was slow on.
 * @returns {{ platform: string, arch: string, node: string, cpus: number, memoryGb: number }}
 */
export function hostFacts() {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version.replace(/^v/, ''),
    cpus: cpus().length,
    memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  };
}

/**
 * Whether one parsed line is a record this schema understands.
 * @param {unknown} value
 * @returns {string | null} the reason it is not, or null
 */
function recordProblem(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'not an object';
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.schema !== SCHEMA) return `unknown schema ${JSON.stringify(record.schema)}`;
  if (typeof record.kind !== 'string' || !KINDS.includes(record.kind)) return `unknown kind ${JSON.stringify(record.kind)}`;
  if (typeof record.label !== 'string' || record.label === '') return 'no label';
  if (typeof record.startedAt !== 'string' || record.startedAt === '') return 'no startedAt';
  if (typeof record.durationMs !== 'number' || !Number.isFinite(record.durationMs) || record.durationMs < 0) return 'no durationMs';
  return null;
}

/**
 * Every readable record under a store directory, in the file's own order (append order), plus the lines that could
 * not be read — skipped, and *counted*, so a torn line cannot silently shrink the denominator (R-075).
 * @param {string} storeDir
 * @returns {{ records: any[], skips: { unreadable: number[], unknownSchema: number[], malformed: number[] }, missing: boolean }}
 */
export function readRecords(storeDir) {
  /** @type {{ unreadable: number[], unknownSchema: number[], malformed: number[] }} */
  const skips = { unreadable: [], unknownSchema: [], malformed: [] };
  /** @type {any[]} */
  const records = [];
  let text;
  try {
    text = readFileSync(storePath(storeDir), 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { records, skips, missing: true };
    throw error;
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      skips.unreadable.push(i + 1);
      continue;
    }
    const problem = recordProblem(value);
    if (problem === null) records.push(value);
    else if (problem.startsWith('unknown schema')) skips.unknownSchema.push(i + 1);
    else skips.malformed.push(i + 1);
  }
  return { records, skips, missing: false };
}

/**
 * Append one record as one JSONL line. The directory is made when it is absent; nothing else is ever written to.
 * @param {string} storeDir @param {Record<string, unknown>} record
 * @returns {string} the file appended to
 */
export function appendRecord(storeDir, record) {
  mkdirSync(storeDir, { recursive: true });
  const file = storePath(storeDir);
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
  return file;
}

/**
 * One command line built from tokens. Everywhere but Windows the tokens run directly (`shell: false`), so quoting
 * stays exactly as written; on Windows a `cmd` line is built, because a shim like `pnpm.cmd` is only reachable
 * through a shell — each token is quoted here rather than left to `spawn`'s (unquoted) join, and cmd's embedded
 * quote is `""`. The `pretty` form is what a record carries: the command as a person spelled it.
 * @param {string[]} tokens @param {string} [platform]
 * @returns {{ file: string, args: string[], pretty: string, shell?: boolean }}
 */
export function shellCommand(tokens, platform = process.platform) {
  if (tokens.length === 0) throw new TypeError('shellCommand needs at least one token');
  const pretty = tokens.join(' ');
  if (platform === 'win32') {
    const quote = (piece) => (/[\s"]/.test(piece) ? `"${piece.replaceAll('"', '""')}"` : piece);
    return { file: tokens.map(quote).join(' '), args: [], pretty, shell: true };
  }
  return { file: tokens[0], args: tokens.slice(1), pretty };
}

/**
 * The command to run `pnpm run <script>` with. Under `pnpm dev-time` the environment names pnpm's own entry
 * (`npm_execpath`), so the child is that entry run by this Node — exact, and immune to the Windows shim problem.
 * Without it, `pnpm` from the PATH is used, through `shellCommand`'s platform handling.
 * @param {string} script @param {string[]} [args] @param {NodeJS.ProcessEnv} [env]
 * @returns {{ file: string, args: string[], pretty: string, shell?: boolean }}
 */
export function pnpmCommand(script, args = [], env = process.env) {
  const suffix = args.length > 0 ? ` -- ${args.join(' ')}` : '';
  const pretty = `pnpm run ${script}${suffix}`;
  const entry = env.npm_execpath;
  if (entry !== undefined && entry !== '' && /\.(?:c?js|mjs)$/i.test(entry)) {
    const argv = [entry, 'run', script];
    if (args.length > 0) argv.push('--', ...args);
    return { file: process.execPath, args: argv, pretty };
  }
  if (process.platform === 'win32') {
    // The fallback path only (a direct `node tools/dev-time/cli.mjs`).
    const tokens = ['pnpm.cmd', 'run', script, ...(args.length > 0 ? ['--', ...args] : [])];
    return { ...shellCommand(tokens), pretty };
  }
  const argv = ['run', script];
  if (args.length > 0) argv.push('--', ...args);
  return { file: 'pnpm', args: argv, pretty };
}

/**
 * Run one command under the clock, append its record, and answer the child's exit code. The child's stdio is
 * inherited: the tool measures the session the person is already watching and keeps none of its output — records
 * hold the command as spelled, never a build log.
 * @param {{ storeDir: string, kind: string, label: string, command: { file: string, args: string[], pretty: string, shell?: boolean }, cwd?: string, env?: NodeJS.ProcessEnv, spawn?: typeof spawnSync }} options
 * @returns {{ record: Record<string, unknown>, code: number }}
 */
export function runMeasured({ storeDir, kind, label, command, cwd = process.cwd(), env = process.env, spawn = spawnSync }) {
  const startedAt = new Date();
  const began = process.hrtime.bigint();
  const child = spawn(command.file, command.args, { cwd, env, stdio: 'inherit', windowsHide: true, shell: command.shell ?? false });
  const endedAt = new Date();
  const durationMs = Number((process.hrtime.bigint() - began) / 1_000_000n);
  const status = child.status;
  const signal = child.signal;
  const error = child.error ? (/** @type {NodeJS.ErrnoException} */ (child.error).code ?? child.error.message) : null;
  const code = status ?? (signal ? 128 + (SIGNAL_CODES[/** @type {keyof typeof SIGNAL_CODES} */ (signal)] ?? 1) : error ? 1 : 0);
  const record = {
    schema: SCHEMA,
    kind,
    label,
    command: command.pretty,
    cwd: resolve(cwd),
    ...gitFacts({ cwd, env }),
    host: hostFacts(),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    exitCode: status ?? null,
    signal: signal ?? null,
    error,
  };
  appendRecord(storeDir, record);
  return { record, code };
}

/**
 * The four `pnpm check` stages, one measured record each, in the gate's own order (R-075 names them apart on
 * purpose: "individual gate stages"). A stage that fails stops the run with its code, as `pnpm check`'s `&&` does;
 * `keepGoing` runs the rest anyway and answers the first failure's code. Nothing here re-implements a stage: each is
 * `pnpm run <stage>`, the same script `pnpm check` spells.
 * @param {{ storeDir: string, stages?: readonly string[], keepGoing?: boolean, cwd?: string, env?: NodeJS.ProcessEnv, commandFor?: (script: string, args: string[]) => { file: string, args: string[], pretty: string, shell?: boolean }, spawn?: typeof spawnSync }} options
 * @returns {{ code: number }}
 */
export function runGate({
  storeDir,
  stages = GATE_STAGES,
  keepGoing = false,
  cwd = process.cwd(),
  env = process.env,
  commandFor = (script, args) => pnpmCommand(script, args, env),
  spawn = spawnSync,
}) {
  let code = 0;
  for (const stage of stages) {
    const { code: stageCode } = runMeasured({ storeDir, kind: 'gate', label: stage, command: commandFor(stage, []), cwd, env, spawn });
    if (stageCode !== 0) {
      if (code === 0) code = stageCode;
      if (!keepGoing) return { code };
    }
  }
  return { code };
}

/**
 * The file a manual span is held in for one worktree. Keyed by the worktree's top level (or the working directory
 * outside a repository), so two worktrees — or a session that `cd`s within one — share their span, and two
 * repositories never collide.
 * @param {string} storeDir @param {{ cwd?: string, git?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export function pendingFile(storeDir, { cwd = process.cwd(), git, env } = {}) {
  const top = gitOut(cwd, ['rev-parse', '--show-toplevel'], { git, env });
  const root = top.ok ? top.out : resolve(cwd);
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  return join(storeDir, 'pending', `${key}.json`);
}

/**
 * Open a manual span — work no single command covers (a repair, a rebase). Refused when one is already open for the
 * worktree: the open span is named rather than silently replaced, so two numbers can never stand for one piece of
 * work.
 * @param {{ storeDir: string, kind: string, label: string, cwd?: string, git?: string, env?: NodeJS.ProcessEnv, now?: () => Date }} options
 * @returns {{ file: string, span: Record<string, unknown> } | { problem: string }}
 */
export function startSpan({ storeDir, kind, label, cwd = process.cwd(), git, env, now = () => new Date() }) {
  const file = pendingFile(storeDir, { cwd, git, env });
  if (existsSync(file)) {
    const open = readSpan(file);
    const named = open === null ? '' : ` (${open.kind}:${open.label} since ${open.startedAt})`;
    return { problem: `a span is already open for ${resolve(cwd)}${named}; close it with \`pnpm dev-time stop\` or drop it with \`pnpm dev-time cancel\`` };
  }
  const span = { schema: SCHEMA, kind, label, cwd: resolve(cwd), startedAt: now().toISOString() };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(span, null, 2)}\n`, 'utf8');
  return { file, span };
}

/**
 * The span held in a pending file, or null when the file is absent or unreadable.
 * @param {string} file
 * @returns {{ kind: string, label: string, cwd?: string, startedAt: string } | null}
 */
function readSpan(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof value === 'object' && value !== null && typeof value.kind === 'string' && typeof value.label === 'string' && typeof value.startedAt === 'string') {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Close the worktree's open span and record it. The duration is wall-clock (the span crosses processes; a
 * monotonic pair cannot), clamped at zero so a backwards clock correction cannot mint a negative measurement.
 * @param {{ storeDir: string, cwd?: string, git?: string, env?: NodeJS.ProcessEnv, now?: () => Date }} options
 * @returns {{ record: Record<string, unknown>, file: string } | { problem: string }}
 */
export function stopSpan({ storeDir, cwd = process.cwd(), git, env, now = () => new Date() }) {
  const file = pendingFile(storeDir, { cwd, git, env });
  const span = existsSync(file) ? readSpan(file) : null;
  if (span === null) {
    return { problem: `no span is open for ${resolve(cwd)}; open one with \`pnpm dev-time start <kind>:<label>\`` };
  }
  const endedAt = now();
  const startedMs = Date.parse(span.startedAt);
  const durationMs = Number.isFinite(startedMs) ? Math.max(0, endedAt.getTime() - startedMs) : 0;
  const record = {
    schema: SCHEMA,
    kind: span.kind,
    label: span.label,
    command: null,
    cwd: resolve(cwd),
    ...gitFacts({ cwd, env }),
    host: hostFacts(),
    startedAt: span.startedAt,
    endedAt: endedAt.toISOString(),
    durationMs,
    exitCode: null,
    signal: null,
    error: null,
  };
  appendRecord(storeDir, record);
  rmSync(file, { force: true });
  return { record, file };
}

/**
 * Drop the worktree's open span without recording it — for work abandoned, where a duration would be a lie.
 * @param {{ storeDir: string, cwd?: string, git?: string, env?: NodeJS.ProcessEnv }} options
 * @returns {{ span: { kind: string, label: string, startedAt: string }, file: string } | { problem: string }}
 */
export function cancelSpan({ storeDir, cwd = process.cwd(), git, env }) {
  const file = pendingFile(storeDir, { cwd, git, env });
  const span = existsSync(file) ? readSpan(file) : null;
  if (span === null) return { problem: `no span is open for ${resolve(cwd)}; nothing to cancel` };
  rmSync(file, { force: true });
  return { span, file };
}

/**
 * Every span still open under a store directory — across worktrees, since each is keyed to one — newest first.
 * @param {string} storeDir
 * @returns {{ file: string, span: { kind: string, label: string, cwd?: string, startedAt: string } | null }[]}
 */
export function listPending(storeDir) {
  const dir = join(storeDir, 'pending');
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const file = join(dir, name);
      return { file, span: readSpan(file) };
    })
    .sort((a, b) => (b.span?.startedAt ?? '').localeCompare(a.span?.startedAt ?? ''));
}

/**
 * The records inside a window of days, newest work only when a window is asked for; `null` is everything. A record
 * whose `startedAt` cannot be parsed is kept — its honesty was settled when it was read, and dropping it would
 * shrink the denominator.
 * @param {any[]} records @param {number | null} days @param {Date} [now]
 */
export function filterByDays(records, days, now = new Date()) {
  if (days === null) return records;
  const cutoff = now.getTime() - days * 86_400_000;
  return records.filter((record) => {
    const at = Date.parse(record.startedAt);
    return !Number.isFinite(at) || at >= cutoff;
  });
}

/**
 * Whether a record's command ended badly: a non-zero exit, a signal, or a spawn failure. A manual span (nulls
 * everywhere) is not a failure.
 * @param {any} record
 */
export function failedRecord(record) {
  return (record.exitCode !== null && record.exitCode !== 0) || record.signal !== null || record.error !== null;
}

/**
 * The report's numbers, from the records alone: totals, then per kind (the closed set's order) and per kind+label,
 * newest-first rows sorted by the time they hold. Mean, median, min and max are over the same durations the total
 * sums. `share` is the row's fraction of the grand total.
 * @param {any[]} records
 */
export function aggregate(records) {
  let durationMs = 0;
  let failures = 0;
  /** @type {Map<string, { kind: string, label: string, count: number, durationMs: number, failures: number, durations: number[] }>} */
  const labels = new Map();
  for (const record of records) {
    const ms = record.durationMs;
    durationMs += ms;
    const failed = failedRecord(record);
    if (failed) failures += 1;
    const key = `${record.kind}:${record.label}`;
    const entry = labels.get(key) ?? { kind: record.kind, label: record.label, count: 0, durationMs: 0, failures: 0, durations: [] };
    entry.count += 1;
    entry.durationMs += ms;
    entry.failures += failed ? 1 : 0;
    entry.durations.push(ms);
    labels.set(key, entry);
  }
  const byKind = [];
  for (const kind of KINDS) {
    const rows = [...labels.values()].filter((entry) => entry.kind === kind);
    if (rows.length === 0) continue;
    byKind.push({
      kind,
      count: rows.reduce((sum, entry) => sum + entry.count, 0),
      durationMs: rows.reduce((sum, entry) => sum + entry.durationMs, 0),
      failures: rows.reduce((sum, entry) => sum + entry.failures, 0),
    });
  }
  const byLabel = [...labels.values()]
    .sort((a, b) => b.durationMs - a.durationMs || a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
    .map((entry) => {
      const sorted = [...entry.durations].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
      return {
        kind: entry.kind,
        label: entry.label,
        count: entry.count,
        durationMs: entry.durationMs,
        meanMs: entry.durationMs / entry.count,
        medianMs: median,
        minMs: sorted[0] ?? 0,
        maxMs: sorted[sorted.length - 1] ?? 0,
        failures: entry.failures,
        share: durationMs === 0 ? 0 : entry.durationMs / durationMs,
      };
    });
  return { count: records.length, durationMs, failures, byKind, byLabel };
}

/**
 * A duration for a person: milliseconds under a second, then `12.3s`, `4m05s`, `2h06m01s`. Rounded to whole
 * seconds above one second, so a column of them reads as a clock rather than as decimals.
 * @param {number} ms
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms)) return String(ms);
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalS = Math.round(ms / 1000);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${totalS}s`;
}

/**
 * One record as one line for `log`: when, its identity, how long, how it ended, and the command it measured.
 * @param {any} record
 */
export function formatRecordLine(record) {
  const when = typeof record.startedAt === 'string' ? record.startedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '?';
  const identity = `${record.kind}:${record.label}`;
  const ended = record.signal !== null ? `signal ${record.signal}` : record.error !== null ? `error ${record.error}` : record.exitCode !== null ? `exit ${record.exitCode}` : 'span';
  const command = record.command ?? '(manual span)';
  return `${when}  ${identity.padEnd(28)}  ${formatDuration(record.durationMs).padStart(9)}  ${ended.padEnd(14)}  ${command}`;
}

/**
 * The whole report as lines. It says what it read: the store, the window, the records skipped, the spans still
 * open — and when the store is empty or the window caught nothing, it says that too rather than printing nothing.
 * @param {{ aggregate: ReturnType<typeof aggregate>, store: string, missing: boolean, skips: { unreadable: number[], unknownSchema: number[], malformed: number[] }, days: number | null, pending: ReturnType<typeof listPending>, outsideWindow?: number }} options
 * @returns {string[]}
 */
export function formatReport({ aggregate: totals, store, missing, skips, days, pending, outsideWindow = 0 }) {
  const lines = [];
  lines.push('dev-time report');
  lines.push(`  store   ${store}`);
  if (missing) {
    lines.push('  no records yet — record one with `pnpm dev-time run <kind>:<label> -- <command>`');
    lines.push('                      or open a span with `pnpm dev-time start <kind>:<label>` and close it with `pnpm dev-time stop`');
    return lines;
  }
  lines.push(`  ${totals.count} records — ${formatDuration(totals.durationMs)} measured, ${totals.failures} ending non-zero`);
  if (days !== null) lines.push(`  window  the last ${days} day${days === 1 ? '' : 's'}${outsideWindow > 0 ? ` (${outsideWindow} older record${outsideWindow === 1 ? '' : 's'} outside it)` : ''}`);
  if (totals.count === 0) {
    lines.push('  nothing recorded in this window');
  } else {
    lines.push('');
    const header = ['KIND', 'LABEL', 'N', 'TOTAL', 'MEAN', 'MEDIAN', 'MAX', 'FAIL', 'SHARE'];
    const rows = totals.byLabel.map((row) => [
      row.kind,
      row.label,
      String(row.count),
      formatDuration(row.durationMs),
      formatDuration(row.meanMs),
      formatDuration(row.medianMs),
      formatDuration(row.maxMs),
      String(row.failures),
      `${(row.share * 100).toFixed(1)}%`,
    ]);
    const widths = header.map((title, i) => Math.max(title.length, ...rows.map((row) => row[i]?.length ?? 0)));
    const rightAligned = [2, 3, 4, 5, 6, 7, 8];
    const pad = (cell, i) => (rightAligned.includes(i) ? cell.padStart(widths[i] ?? 0) : cell.padEnd(widths[i] ?? 0));
    lines.push(`  ${header.map(pad).join('  ')}`);
    for (const row of rows) lines.push(`  ${row.map(pad).join('  ')}`);
  }
  const skipped = skips.unreadable.length + skips.unknownSchema.length + skips.malformed.length;
  if (skipped > 0) {
    const parts = [];
    if (skips.unreadable.length > 0) parts.push(`${skips.unreadable.length} unreadable`);
    if (skips.unknownSchema.length > 0) parts.push(`${skips.unknownSchema.length} of an unknown schema`);
    if (skips.malformed.length > 0) parts.push(`${skips.malformed.length} malformed`);
    const numbers = [...skips.unreadable, ...skips.unknownSchema, ...skips.malformed].sort((a, b) => a - b);
    lines.push(`  ! ${skipped} line${skipped === 1 ? '' : 's'} skipped: ${parts.join(', ')} (${STORE_FILE} lines ${numbers.join(', ')})`);
  }
  if (pending.length > 0) {
    const named = pending.map((entry) => (entry.span === null ? 'an unreadable pending file' : `${entry.span.kind}:${entry.span.label} (since ${entry.span.startedAt})`)).join('; ');
    lines.push(`  ${pending.length} span${pending.length === 1 ? '' : 's'} still open: ${named}`);
    lines.push('  close the current worktree\'s with `pnpm dev-time stop`, drop it with `pnpm dev-time cancel`');
  }
  return lines;
}
