// @ts-check
// The machine and the build as plain facts: the platform, node and Electron, the display, git's answer for the
// repository, the build identifier and how the desktop build's freshness is judged against its sources.
//
// Two callers read them for different jobs. `preflight.mjs` reports them as checks before a proof launches;
// `lib/evidence-manifest.mjs` records them into an evidence directory so a pack read months later says which
// machine and which build produced it. They must not disagree, so the reading lives here once.
//
// The path expressions mirror `lib/harness.mjs`'s exports rather than importing them: that module creates
// `.proof/.git` as it is imported, and a tool that only reads the tree must not. `preflight.test.ts` holds the
// `repo`, `app`, `electron` and `mainEntry` below equal to the harness's own.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { release as osRelease } from 'node:os';
import { join, relative, resolve } from 'node:path';

/** The repository root — `apps/desktop/scripts/lib/` is four levels down from it. */
export const repo = resolve(import.meta.dirname, '..', '..', '..', '..');
export const app = join(repo, 'apps', 'desktop');
/** The Electron executable and the built main entry — the same expressions `live-run.mjs` spells for itself, held to `lib/harness.mjs`'s exports by a test. */
export const electron =
  process.platform === 'win32'
    ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')
    : join(repo, 'node_modules', 'electron', 'dist', 'electron');
export const mainEntry = join(app, 'out', 'main', 'index.js');

const electronManifest = join(repo, 'node_modules', 'electron', 'package.json');
/** The identifier `pnpm build-id` writes before packaging — and no development tree that never packaged holds one. */
export const buildIdFile = join(app, 'resources', 'build-id.txt');

/** A path inside the tree, written relative to its root with forward slashes. */
export function treePath(path) {
  return relative(repo, path).replaceAll('\\', '/');
}

/** The installed Electron's version, or null when `node_modules` holds none to read. */
export function electronVersion() {
  try { return JSON.parse(readFileSync(electronManifest, 'utf8')).version ?? null; } catch { return null; }
}

/** The build identifier `pnpm build-id` wrote, or null when the tree has none. */
export function buildIdentifier() {
  try { return readFileSync(buildIdFile, 'utf8').trim() || null; } catch { return null; }
}

/** Every source root a build reads: the app's `src` and each package's. */
export function presentSourceRoots() {
  const roots = [join(app, 'src')];
  try {
    for (const entry of readdirSync(join(repo, 'packages'), { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(repo, 'packages', entry.name, 'src'));
    }
  } catch { /* no packages directory: the app's own sources are the list */ }
  return roots;
}

/** One directory's entries as `{ name, dir }` — the walk `newestSourceMtime` reads. */
export function listDirectory(dir) {
  return readdirSync(dir, { withFileTypes: true }).map((entry) => ({ name: entry.name, dir: entry.isDirectory() }));
}

/** A file's modification time, in milliseconds. */
export function mtimeOf(file) {
  return statSync(file).mtimeMs;
}

/**
 * The newest non-test source file under `roots`, as `{ path, mtimeMs }`, or null.
 * Test files are not build inputs, so editing one is not a reason to rebuild.
 * @param {string[]} roots
 * @param {{ list: (dir: string) => Array<{ name: string, dir: boolean }>, mtime: (file: string) => number }} io
 */
export function newestSourceMtime(roots, { list, mtime }) {
  /** @type {{ path: string, mtimeMs: number } | null} */
  let best = null;
  /** @param {string} dir */
  const visit = (dir) => {
    /** @type {Array<{ name: string, dir: boolean }>} */
    let entries;
    try { entries = list(dir); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      // `generated/` is a generator's output, not a source: packages/kernel/src/generated/requirements.ts
      // is rewritten by `pnpm symbols` before every build and every test collection, so its mtime says
      // nothing about whether the build is current.
      if (entry.dir) { if (entry.name !== 'generated') visit(path); continue; }
      if (/\.test(-support)?\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      /** @type {number} */
      let mtimeMs;
      try { mtimeMs = mtime(path); } catch { continue; }
      if (best === null || mtimeMs > best.mtimeMs) best = { path, mtimeMs };
    }
  };
  for (const root of roots) visit(root);
  return best;
}

/** git's answer for the repository: the commit, and whether the working tree differs from it (null when git cannot say). */
export function gitFacts(cwd = repo) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  return {
    head: head.status === 0 ? String(head.stdout).trim() : null,
    dirty: status.status === 0 ? String(status.stdout).trim() !== '' : null,
  };
}

/**
 * What the built main entry is, in the same terms `buildCheck` judges it: present or not, its mtime, the newest
 * source it should be newer than (repo-relative), and `fresh` — false when a source is newer than the build.
 * `fresh` is null when no build is present: there is nothing to be fresh.
 * @param {{ exists?: (path: string) => boolean, mtime?: (file: string) => number, roots?: string[], list?: (dir: string) => Array<{ name: string, dir: boolean }> }} [io]
 */
export function buildFacts({ exists = existsSync, mtime = mtimeOf, roots = presentSourceRoots(), list = listDirectory } = {}) {
  if (!exists(mainEntry)) return { present: false, mainEntry: treePath(mainEntry), mtimeMs: null, newestSource: null, fresh: null };
  const mtimeMs = mtime(mainEntry);
  const newest = newestSourceMtime(roots, { list, mtime });
  return {
    present: true,
    mainEntry: treePath(mainEntry),
    mtimeMs,
    newestSource: newest === null ? null : { path: treePath(newest.path), mtimeMs: newest.mtimeMs },
    fresh: newest === null ? true : !(newest.mtimeMs > mtimeMs),
  };
}

/**
 * The environment block an evidence manifest records: which machine, which runtime, which repository state and
 * which build produced the evidence. The preflight reads the same facts through the functions above.
 */
export function environmentFacts() {
  return {
    platform: process.platform,
    arch: process.arch,
    release: osRelease(),
    node: process.version,
    electron: electronVersion(),
    display: process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY ?? null,
    git: gitFacts(),
    build: buildFacts(),
    buildId: buildIdentifier(),
  };
}
