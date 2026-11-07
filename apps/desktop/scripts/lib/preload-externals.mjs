/**
 * The PRELOAD EXTERNALS check, for the emitted preload files (`scripts/package.mjs`, the step "the preload carries no
 * external package"). ADR-0044 puts every window's renderer under `sandbox: true`, and a sandboxed preload cannot
 * `require` a package out of `node_modules`: the loader refuses the whole script, the bridge never lands, and the
 * packaged launch opens no session — ADR-0056 rule 4 refused.
 *
 * electron-vite 6 externalises this package's `dependencies` by DEFAULT in every node-side section
 * (`build.externalizeDeps ?? true`), and it writes that list into the options the bundler actually reads
 * (`rolldownOptions.external`, bridged back to `rollupOptions.external`), so the `external` list the preload section
 * states does not replace it. That is what broke on 2026-11-07: the preload reached `zod` through
 * `@rotaris/contracts` and shipped `require("zod")` (md5 61c11cdf…), where the v5 build had inlined it
 * (md5 39d99be2…). `electron.vite.config.ts` answers it with `build.externalizeDeps: false` on the preload section;
 * this check reads that answer back out of the ARTIFACT, the way the seam check reads the seams back, because a config
 * that stopped being applied changes nothing a source reading would notice.
 *
 * The allowed set is the preload section's own: `electron` and its subpaths, the two native modules electron-builder
 * rebuilds and unpacks, and the node builtins. Anything else in a `require` is a package the sandbox cannot load.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The preload section's stated externals, by name (`apps/desktop/electron.vite.config.ts`, `EXTERNAL`). */
export const ALLOWED_EXTERNALS = ['electron', 'better-sqlite3', 'node-pty'];

/**
 * Node's own builtins. Taken from `module.builtinModules` rather than listed, so a runtime that adds one does not turn
 * this check red for a reason that is not the defect it guards.
 */
const BUILTINS = new Set(builtinModules);

/** A bare `require("x")` or `require('x')`, with the specifier. A computed or dynamic require is not read. */
const REQUIRE = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;

/**
 * The package names a preload file requires, in order, with duplicates removed. A relative or absolute path is not a
 * package: the one-file rule (`inlineDynamicImports`) already refuses a chunk, and it is not this check's subject.
 * @param {string} source
 * @returns {string[]}
 */
export function requiredPackages(source) {
  /** @type {string[]} */
  const found = [];
  for (const match of source.matchAll(REQUIRE)) {
    const specifier = match[2];
    if (specifier === undefined) continue;
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    found.push(specifier);
  }
  return [...new Set(found)];
}

/**
 * The package a specifier names: `zod` for `zod/deep`, `@scope/name` for `@scope/name/deep`.
 * @param {string} specifier
 * @returns {string}
 */
export function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : /** @type {string} */ (parts[0]);
}

/**
 * Reads every emitted file of the preload section and answers the required packages the sandbox cannot load.
 * @param {string[]} files the emitted preload files, absolute
 * @param {(path: string) => string} read
 * @returns {{ offenders: { package: string, specifier: string, file: string }[], files: number }}
 */
export function preloadExternals(files, read) {
  /** @type {{ package: string, specifier: string, file: string }[]} */
  const offenders = [];
  const seen = new Set();
  for (const file of files) {
    for (const specifier of requiredPackages(read(file))) {
      if (specifier.startsWith('node:')) continue;
      const pkg = packageOf(specifier);
      if (BUILTINS.has(pkg) || ALLOWED_EXTERNALS.includes(pkg)) continue;
      if (seen.has(`${pkg}\u0000${file}`)) continue;
      seen.add(`${pkg}\u0000${file}`);
      offenders.push({ package: pkg, specifier, file });
    }
  }
  return { offenders, files: files.length };
}

/**
 * Every emitted file of a preload output directory, absolute, `.cjs` and `.js`.
 * @param {string} preloadOut
 * @returns {string[]}
 */
export function preloadFiles(preloadOut) {
  return readdirSync(preloadOut, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(c|m)?js$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preloadOut = resolve(process.argv[2] ?? join(fileURLToPath(new URL('../..', import.meta.url)), 'out', 'preload'));
  const files = preloadFiles(preloadOut);
  const r = preloadExternals(files, (f) => readFileSync(f, 'utf8'));
  console.log(JSON.stringify({ preloadOut, ...r }, null, 2));
  console.log(r.offenders.length === 0 ? 'preload externals: PASS' : `preload externals: FAIL — ${r.offenders.map((o) => o.specifier).join(', ')}`);
  process.exitCode = r.offenders.length === 0 ? 0 : 1;
}
