#!/usr/bin/env node
// @ts-check
// The platform preflight: the machine checks a proof suite needs, and what a named
// proof's registry record adds to them. `pnpm preflight [proof-id …]`.
//
// A proof launches the BUILT application against a scratch profile; this tool launches
// nothing. It names the reasons a suite would otherwise discover late — an absent
// Electron, a build older than its sources, a missing code-intelligence bundle, an
// unwritable `.proof/`, an exported `ROTARIS_*` variable (every launch strips them:
// "an exported variable never reaches it"), a Linux host with no display, an endpoint
// proof without a registered endpoint or key — before the launch rather than after it.
//
// The per-proof half reads `tools/proof-registry/registry.mjs`: the hosts a proof runs
// to its end on, what it needs beyond the standard harness, and its per-host clauses.
// A requirement kind this tool has no check for prints as a NOTE, and the test beside
// this file pins the kinds the registry holds, so a new one cannot go unnoticed.
//
// Usage (`pnpm preflight [proof-id …] [flags]`):
//   (none)              the checks every proof shares
//   proof-id …          add each named proof's registry record (docs/proofs/README.md lists the ids)
//   --json              the report as JSON
//   --help, -h          this text
//
// Reads the tree, the registry and git; writes nothing but a probe file under `.proof/`,
// which it removes. Exit 0 when nothing failed, 1 when a check failed, 2 on a usage error.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROOFS } from '../../../tools/proof-registry/registry.mjs';
import { runBundleScript } from './lib/code-intelligence-bundle.mjs';
import { KEY_ENV, endpointStore } from './lib/endpoint-registry.mjs';
import { app, electron, electronVersion, mainEntry, newestSourceMtime, presentSourceRoots, repo } from './lib/environment-facts.mjs';

// The facts live in `lib/environment-facts.mjs`, shared with `lib/evidence-manifest.mjs` so the preflight's
// reading and the evidence pack's recording cannot drift apart. `preflight.test.ts` holds these path expressions
// equal to `lib/harness.mjs`'s own.
export { app, electron, mainEntry, newestSourceMtime, repo };

/** The scratch root every proof's profile sits under. */
export const proofDir = join(repo, '.proof');

const BUNDLE = 'code-intelligence bundle';
const ENDPOINT = 'a registered endpoint with a stored key';
/** `portable-proof` builds the launcher stub (ADR-0054 P4) with Cargo before it launches anything. */
const CARGO = 'a Rust toolchain (`cargo`)';

const USAGE = `pnpm preflight [proof-id …] [flags]
  (none)              the checks every proof shares: node, git, electron, the desktop
                      build, the code-intelligence bundle, the scratch profile, the
                      environment and the display
  proof-id …          add what the proof registry records for each: the hosts it runs
                      to its end on, what it needs beyond the harness, its per-host clauses
  --json              the report as JSON
  --help, -h          this text

Reads the tree, the registry and git; writes nothing but a probe file under .proof/.
Exit 0 when nothing failed, 1 when a check failed, 2 on a usage error.
`;

/**
 * @typedef {{ name: string, status: 'pass' | 'warn' | 'fail' | 'note', message: string }} Outcome
 * @typedef {Outcome & { scope: string | null }} Check
 */

/**
 * Flags after `--help`/`--json` are refused; anything else is a proof id.
 * @param {string[]} args
 */
export function parseArgs(args) {
  let help = false;
  let json = false;
  /** @type {string[]} */
  const ids = [];
  /** @type {string[]} */
  const unknown = [];
  for (const a of args) {
    if (a === '--help' || a === '-h') { help = true; continue; }
    if (a === '--json') { json = true; continue; }
    if (a.startsWith('--')) { unknown.push(a); continue; }
    ids.push(a);
  }
  return { help, json, ids, unknown };
}

/** `>=24.0.0` admits every node whose major is at least 24; any other shape is no constraint. */
export function nodeCheck(version, engines) {
  const required = /^>=\s*(\d+)/.exec(String(engines ?? '').trim());
  const major = Number(/^v?(\d+)/.exec(String(version))?.[1] ?? 0);
  if (required && major < Number(required[1])) {
    return { name: 'node', status: 'fail', message: `node ${version} is below engines.node ${engines} (package.json)` };
  }
  return {
    name: 'node',
    status: 'pass',
    message: required ? `node ${version} meets engines.node ${engines}` : `node ${version} (no engines.node constraint read)`,
  };
}

/** @param {() => { status: number | null, stdout: string }} run */
export function gitCheck(run) {
  const r = run();
  if (r.status !== 0) {
    return { name: 'git', status: 'fail', message: 'git is not on PATH — every proof creates a repository or a worktree' };
  }
  return { name: 'git', status: 'pass', message: `git on PATH (${String(r.stdout).trim()})` };
}

/** @param {{ path: string, present: boolean, version: string | null | undefined }} facts */
export function electronCheck({ path, present, version }) {
  if (!present) {
    return {
      name: 'electron',
      status: 'fail',
      message: `the electron executable is absent: ${path} — run pnpm install (node_modules/electron/install.js fetches the binary)`,
    };
  }
  return { name: 'electron', status: 'pass', message: `electron ${version ?? '(version unreadable)'} at ${path}` };
}

/**
 * @param {{ path: string, exists: boolean, buildMtimeMs: number, newest: { label: string, mtimeMs: number } | null }} facts
 */
export function buildCheck({ path, exists, buildMtimeMs, newest }) {
  if (!exists) {
    return { name: 'build', status: 'warn', message: `the desktop build is missing (${path}) — a proof builds it unless --skip-build; pnpm build builds it now` };
  }
  if (newest && newest.mtimeMs > buildMtimeMs) {
    return { name: 'build', status: 'warn', message: `the desktop build is older than ${newest.label} — default proofs rebuild it; a --skip-build run or pnpm app:drive would drive the older build` };
  }
  return { name: 'build', status: 'pass', message: `the desktop build is newer than its sources (${path})` };
}

/**
 * @param {{ ok: boolean, requiredBy?: string[], needing?: string[] }} facts
 */
export function bundleCheck({ ok, requiredBy = [], needing = [] }) {
  if (requiredBy.length > 0) {
    return {
      name: 'bundle',
      status: ok ? 'pass' : 'fail',
      message: ok
        ? 'requires the code-intelligence bundle — present'
        : 'requires the code-intelligence bundle — absent or stale: run pnpm code-intel:bundle',
    };
  }
  if (ok) {
    return { name: 'bundle', status: 'pass', message: 'the code-intelligence bundle is present and matches its pins' };
  }
  const who = needing.length > 0 ? needing.join(', ') : 'no proof in the registry';
  return { name: 'bundle', status: 'note', message: `the code-intelligence bundle is absent or stale — needed by ${who}: run pnpm code-intel:bundle` };
}

/** @param {{ error: string | null }} facts */
export function scratchCheck({ error }) {
  if (error !== null) {
    return { name: 'scratch', status: 'fail', message: `the scratch directory .proof/ is not writable: ${error}` };
  }
  return { name: 'scratch', status: 'pass', message: 'the scratch directory .proof/ is writable' };
}

/** @param {NodeJS.ProcessEnv} env */
export function environmentCheck(env) {
  const names = Object.keys(env).filter((key) => key.startsWith('ROTARIS_')).sort();
  if (names.length === 0) {
    return { name: 'environment', status: 'pass', message: 'no ROTARIS_* variable is exported (a launch strips them anyway)' };
  }
  return {
    name: 'environment',
    status: 'warn',
    message: `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} exported; every launch strips ROTARIS_* — an exported variable never reaches the app`,
  };
}

/** @param {{ platform: string, display: string | undefined, xvfb: boolean }} facts */
export function displayCheck({ platform, display, xvfb }) {
  if (platform === 'linux') {
    if (display) return { name: 'display', status: 'pass', message: `the display is available (DISPLAY=${display})` };
    if (xvfb) return { name: 'display', status: 'warn', message: 'no DISPLAY is set — run the proof under xvfb-run -a -s "-screen 0 1600x1000x24"' };
    return { name: 'display', status: 'fail', message: 'no DISPLAY is set and xvfb-run is not on PATH — Electron cannot open a window on this host' };
  }
  return { name: 'display', status: 'pass', message: `no display server is needed on ${platform}` };
}

/**
 * A host a proof cannot run to its end on is refused before the launch, not measured
 * halfway. Null when the host is one the record names.
 * @param {{ id: string, platforms: string[], platformNotes: string[] }} entry
 * @param {string} platform
 */
export function platformCheck(entry, platform) {
  if (entry.platforms.includes(platform)) return null;
  const clauses = entry.platformNotes.length > 0 ? ` — ${entry.platformNotes.join('; ')}` : '';
  return {
    name: entry.id,
    status: 'fail',
    message: `"${entry.id}" runs to its end on ${entry.platforms.join(', ')} only, not ${platform}${clauses}`,
  };
}

/** @param {string} name @param {NodeJS.ProcessEnv} [env] */
export function findOnPath(name, env = process.env) {
  const dirs = String(env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':');
  for (const dir of dirs) {
    if (dir && existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

/** @param {string} a @param {string} b */
function editDistance(a, b) {
  /** @type {number[]} */
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** The up-to-three registry ids closest to a typo, within an edit distance of 3. */
export function suggestIds(input, ids = PROOFS.map((p) => p.id)) {
  const wanted = input.toLowerCase();
  return ids
    .map((id) => [id, editDistance(wanted, id)])
    .filter(([, distance]) => distance <= 3)
    .sort((a, b) => a[1] - b[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 3)
    .map(([id]) => id);
}

/**
 * The endpoint a proof that signs in needs: the registry's default with a stored key,
 * or `ROTARIS_LIVE_API_KEY` in the environment, mirroring `lib/endpoint-registry.mjs`.
 * @param {{ id: string, store: { file: string, registry: () => any, hasKey: (name: string) => boolean }, env?: NodeJS.ProcessEnv }} facts
 */
export function endpointCheck({ id, store, env = process.env }) {
  const reg = store.registry();
  const names = Object.keys(reg.endpoints ?? {});
  if (names.length === 0) {
    return { name: id, status: 'fail', message: `no endpoint is registered in ${store.file} — register one with pnpm live-run --add-endpoint` };
  }
  if (!reg.default) {
    return { name: id, status: 'fail', message: `no default endpoint is registered in ${store.file} (registered: ${names.join(', ')}) — a run needs --endpoint=<name> or a default` };
  }
  const endpoint = reg.endpoints[reg.default];
  if (!endpoint) {
    return { name: id, status: 'fail', message: `the default endpoint "${reg.default}" is not in ${store.file} — register it again with pnpm live-run --add-endpoint` };
  }
  for (const field of ['label', 'model']) {
    if (typeof endpoint[field] !== 'string' || endpoint[field].trim() === '') {
      return { name: id, status: 'fail', message: `the endpoint "${reg.default}" has no ${field} in ${store.file} — register it again with pnpm live-run --add-endpoint` };
    }
  }
  if (String(env[KEY_ENV] ?? '').trim() !== '') {
    return { name: id, status: 'pass', message: `endpoint "${reg.default}" with the key from ${KEY_ENV}` };
  }
  if (store.hasKey(reg.default)) {
    return { name: id, status: 'pass', message: `endpoint "${reg.default}" with a stored key` };
  }
  return {
    name: id,
    status: 'fail',
    message: `no key is stored for the endpoint "${reg.default}" — store one with pnpm live-run --set-key --endpoint=${reg.default}, or set ${KEY_ENV}`,
  };
}

/**
 * What one named proof adds to the universal checks, from its registry record.
 * @param {string} id
 * @param {{ platform?: string, bundle?: { ok: boolean }, getStore?: () => any, env?: NodeJS.ProcessEnv, needing?: string[] }} [opts]
 */
export function proofChecks(id, { platform = process.platform, bundle = { ok: true }, getStore = () => endpointStore(), env = process.env, needing = [], cargo = () => spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }) } = {}) {
  const entry = PROOFS.find((p) => p.id === id);
  if (!entry) {
    const guesses = suggestIds(id);
    return [{
      name: id,
      status: 'fail',
      message: `unknown proof id "${id}"${guesses.length > 0 ? ` — did you mean ${guesses.join(' or ')}?` : ''} (docs/proofs/README.md lists the proofs)`,
    }];
  }
  /** @type {Outcome[]} */
  const checks = [];
  const platformMiss = platformCheck(entry, platform);
  if (platformMiss) checks.push(platformMiss);
  else if (entry.platformNotes.length > 0) checks.push({ name: id, status: 'note', message: `host clauses: ${entry.platformNotes.join('; ')}` });
  for (const requirement of entry.requires) {
    if (requirement === BUNDLE) checks.push(bundleCheck({ ok: bundle.ok, requiredBy: [id], needing }));
    else if (requirement === ENDPOINT) checks.push(endpointCheck({ id, store: getStore(), env }));
    else if (requirement === CARGO) {
      const r = cargo();
      checks.push(r.status === 0
        ? { name: id, status: 'pass', message: `requires a Rust toolchain — ${String(r.stdout).trim()}` }
        : { name: id, status: 'fail', message: 'requires a Rust toolchain — `cargo --version` did not answer: install Rust (rustup) and put cargo on PATH' });
    }
    else if (requirement.startsWith('a packaged build for ')) checks.push({ name: id, status: 'note', message: `${requirement} — needed only when the run passes that flag (pnpm package builds it)` });
    else checks.push({ name: id, status: 'note', message: `no check exists for this record's requirement: "${requirement}"` });
  }
  if (checks.length === 0) checks.push({ name: id, status: 'pass', message: 'nothing beyond the standard harness' });
  return checks;
}

/**
 * The real effects the report is built from; a test passes its own.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function realIo(env = process.env) {
  return {
    /** @param {string} path */
    readFile: (path) => readFileSync(path, 'utf8'),
    exists: existsSync,
    /** @param {string} dir */
    list: (dir) => readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() })),
    /** @param {string} file */
    mtime: (file) => statSync(file).mtimeMs,
    git: () => {
      const r = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
      return { status: r.status, stdout: r.stdout ?? '' };
    },
    head: () => {
      const r = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', windowsHide: true });
      return r.status === 0 ? (r.stdout ?? '').trim() : null;
    },
    electronVersion,
    bundle: () => ({ ok: runBundleScript(['--check'], 60_000).status === 0 }),
    scratch: () => {
      try {
        mkdirSync(proofDir, { recursive: true });
        const probe = join(proofDir, '.preflight-write-probe');
        writeFileSync(probe, 'preflight\n');
        rmSync(probe, { force: true });
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    sourceRoots: presentSourceRoots,
    xvfb: () => findOnPath('xvfb-run', env) !== null,
    store: () => endpointStore(),
  };
}

/**
 * @param {{ ids?: string[], platform?: string, env?: NodeJS.ProcessEnv, io?: ReturnType<typeof realIo> }} [opts]
 */
export function runPreflight({ ids = [], platform = process.platform, env = process.env, io = realIo(env) } = {}) {
  /** @type {Outcome[]} */
  const checks = [];
  let engines = '';
  try {
    const pkg = JSON.parse(io.readFile(join(repo, 'package.json')));
    engines = pkg?.engines?.node ?? '';
  } catch {
    checks.push({ name: 'repository', status: 'fail', message: `package.json is not readable at ${repo} — run pnpm preflight from the repository checkout` });
  }
  checks.push(nodeCheck(process.version, engines));
  checks.push(gitCheck(io.git));
  checks.push(electronCheck({ path: electron, present: io.exists(electron), version: io.electronVersion() }));

  const buildExists = io.exists(mainEntry);
  let buildMtimeMs = 0;
  /** @type {{ label: string, mtimeMs: number } | null} */
  let newest = null;
  if (buildExists) {
    buildMtimeMs = io.mtime(mainEntry);
    const source = newestSourceMtime(io.sourceRoots(), io);
    if (source) newest = { label: relative(repo, source.path).replaceAll('\\', '/'), mtimeMs: source.mtimeMs };
  }
  checks.push(buildCheck({ path: mainEntry, exists: buildExists, buildMtimeMs, newest }));

  const needing = PROOFS.filter((p) => p.requires.includes(BUNDLE)).map((p) => p.id);
  const bundle = io.bundle();
  checks.push(bundleCheck({ ok: bundle.ok, needing }));

  checks.push(scratchCheck(io.scratch()));
  checks.push(environmentCheck(env));
  checks.push(displayCheck({ platform, display: env.DISPLAY, xvfb: io.xvfb() }));

  let store = null;
  const getStore = () => (store ??= io.store());
  for (const id of [...new Set(ids)]) {
    for (const check of proofChecks(id, { platform, bundle, getStore, env, needing })) {
      checks.push({ ...check, scope: id });
    }
  }

  const head = io.head();
  /** @type {Record<'pass' | 'warn' | 'fail' | 'note', number>} */
  const summary = { pass: 0, warn: 0, fail: 0, note: 0 };
  for (const check of checks) summary[check.status] += 1;
  return {
    platform,
    head,
    headline: `${platform} · node ${process.version}${head ? ` · ${head}` : ''}`,
    checks: checks.map((check) => ({ scope: null, ...check })),
    summary,
    ok: summary.fail === 0,
  };
}

/** @param {{ headline: string, checks: Check[], summary: Record<string, number> }} report */
export function formatReport(report) {
  const lines = [`Platform preflight  ${report.headline}`];
  /** @type {string | null | undefined} */
  let scope;
  for (const check of report.checks) {
    if (check.scope !== scope) {
      scope = check.scope;
      if (scope !== null && scope !== undefined) lines.push('', scope);
    }
    lines.push(`${check.status.toUpperCase().padEnd(4)}  ${check.message}`);
  }
  const { pass, warn, fail, note } = report.summary;
  lines.push('', `${pass} passed, ${warn} warned, ${fail} failed, ${note} noted`);
  return lines.join('\n');
}

/** True when this module is the process entry. `resolve` so a relative `process.argv[1]` matches `import.meta.url` on Windows. */
export function isMainModule(argv1, metaUrl = import.meta.url) {
  return argv1 !== undefined && metaUrl === pathToFileURL(resolve(argv1)).href;
}

if (isMainModule(process.argv[1])) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (parsed.unknown.length > 0) {
    process.stderr.write(`preflight: unknown argument ${parsed.unknown.join(' ')} (known: --json --help)\n`);
    process.exit(2);
  }
  try {
    const report = runPreflight({ ids: parsed.ids });
    process.stdout.write(parsed.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report)}\n`);
    process.exit(report.summary.fail > 0 ? 1 : 0);
  } catch (err) {
    const e = /** @type {Error} */ (err);
    process.stderr.write(`preflight: ${e.message}\n`);
    process.exit(2);
  }
}
