/**
 * The proof harness — what every `*-proof.mjs` had a copy of.
 *
 * Extracted 2026-09-11 from twenty-eight scripts that each carried the same `cleanEnvironment`, the same
 * `findDatabases` and, in twelve of them, the same `oneDatabase`. The bodies here are those bodies, unchanged:
 * this is a move, not a rewrite, so a proof that was green before the extraction is green for the same reason
 * after it. Where a script's copy differed only in the name of a parameter (`live-run.mjs`'s `name` for `key`,
 * `artifacts-proof.mjs`'s `dir` for `root`) it took this one; where it differed in BEHAVIOUR it kept its own
 * and is named below.
 *
 * Not extracted, deliberately: `launch`. Twenty-six scripts define one and twenty are genuinely different —
 * different environments, different probes, different timeouts, different return shapes. Normalising them
 * would be a rewrite of the evidence, and the driver (`lib/driver.mjs`) replaces the reason they diverged.
 * `launchOptions` below is the part they DO share, offered to new code rather than forced on old.
 *
 * Nothing here is product code. It runs only from the proofs.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

/** The repository root, the desktop app's directory and the Electron executable, resolved the way every proof resolves them. */
export const repo = resolve(import.meta.dirname, '..', '..', '..', '..');
export const app = join(repo, 'apps', 'desktop');
export const electron = process.platform === 'win32'
  ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')
  : join(repo, 'node_modules', 'electron', 'dist', 'electron');
/** The built main entry the proofs launch (never the packaged binary; `pnpm package` has its own probe). */
export const mainEntry = join(app, 'out', 'main', 'index.js');

/**
 * The environment a launch starts from: this process's, with every `ROTARIS_*` variable removed.
 *
 * The removal is the point. A proof that inherited the caller's `ROTARIS_MODEL_DIALECT` or a stale
 * `ROTARIS_CAPTURE_*` would be measuring the shell it ran in, and the two would be indistinguishable in the log.
 */
export function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('ROTARIS_')) delete env[key];
  return env;
}

/** Every `workspace.db` below `root`, depth first. An absent root is no databases, not an error. */
export function findDatabases(root) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findDatabases(path));
    else if (entry.name === 'workspace.db') found.push(path);
  }
  return found;
}

/** The one store below `local`, or a thrown error naming how many there were — a proof that opened the wrong store is the defect this refuses to become. */
export function oneDatabase(local) {
  const databases = findDatabases(local);
  if (databases.length !== 1) throw new Error(`expected one workspace database below ${local}; found ${databases.length}`);
  return databases[0];
}

/**
 * An evidence directory below the repository, emptied. The containment check is not decoration: the path is
 * composed from a caller's string, and a proof that deleted a tree outside the repository would do it recursively.
 */
export function evidenceDirectory(name) {
  const output = resolve(repo, name);
  const inside = relative(repo, output);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`)) throw new Error(`proof output escaped the repository: ${output}`);
  return output;
}

/** `pnpm --filter @rotaris/desktop build`, with the log written beside the evidence. Skipped by `--skip-build` in the caller. */
export function buildDesktop(output) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 300_000 });
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  }
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}

/**
 * The environment every launch shares — the clean base, the scratch profile's three roots and the scripted
 * dialect. A caller adds its own seams on top; nothing here presumes a capture.
 */
export function launchOptions({ local, preferences, extra = {} }) {
  return {
    ...cleanEnvironment(),
    LOCALAPPDATA: local,
    APPDATA: join(local, '..', 'roaming'),
    ROTARIS_PREFERENCES_ROOT: preferences,
    ROTARIS_MODEL_DIALECT: 'scripted',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    ...extra,
  };
}

/** The `capture: probe <selector> → <json>` lines a launch logged, by selector. The shape twenty scripts parse. */
export function readProbes(log) {
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return probes;
}
