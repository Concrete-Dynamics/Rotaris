import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Test support is named as test support, in every package under `packages/` and in `apps/desktop`. A module that only
 * tests import, and that no entry reaches, is named `<unit>.test-support.ts` (`.test-support.mjs` or `.cjs` among the
 * scripts), so a reader does not take it for product code; and no product module imports one. The cascade reading the
 * two CSS tests share sat at `packages/ui/src/css-cascade.ts`, beside the components, as if the renderer ran it
 * (docs/archive/defects/the-css-cascade-reading-is-test-support-named-as-a-product-module.md), and the guard then pinned
 * `@rotaris/ui` alone, from `packages/ui/src/test-support.test.ts`; the traceability proof's scale fixture and growth
 * readings sat the same way in `@rotaris/workspace`
 * (docs/archive/defects/workspace-traceability-test-support-is-named-as-product-modules.md), so since 2026-10-15 the guard
 * lives here and walks every package. Since 2026-11-01 (R-091, hardening F1) it walks `apps/desktop` too: the five
 * composition roots under `src/`, whose entries are the build's own inputs (`electron.vite.config.ts`, and the module
 * the renderer's page loads), and the proof and release scripts under `scripts/`, whose entries are the scripts a
 * `package.json` runs, every script at the top of `scripts/`, and the modules a script launches by path.
 *
 * The walk reads relative `import`/`export … from`/`require` specifiers only, which is how every module in a package
 * reaches another (a `?query` suffix, such as the build's `?nodeWorker`, is the same module); a package import
 * (`@rotaris/…`) leaves the tree and is not followed. A package's entries are its `package.json` `exports`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES = join(ROOT, 'packages');
const APP = join(ROOT, 'apps', 'desktop');

/**
 * Product modules that only their own tests reach today, each with why it is product code all the same. An entry here
 * that an entry comes to reach, or that is removed, fails the guard, so the list cannot outlive its reason.
 */
const PRODUCT_NOT_YET_REACHED: Readonly<Record<string, string>> = {
  'packages/workspace/src/traceability/consumer.ts':
    'the traceability consumer, built "as far as the product reaches" (Part AJ2, REQ-TRACE-176/181/182/183/500) and not yet wired to an entry',
  // `apps/desktop/scripts/lib/platform-targets.mjs` was the second entry: the Linux and macOS packaging targets,
  // prepared and unattempted (R-080, PD-STARTUP-001, IC-3). ADR-0066 wired them for the Linux key —
  // `scripts/lib/package-platform.mjs` imports `preparedConfiguration` — so the exception is gone, as its own rule says.
};

/**
 * Modules under `apps/desktop/scripts/` that a script launches by path (an Electron main, a preload, an esbuild entry)
 * rather than imports, each with the script that names it. An entry whose launcher no longer names it, or that an
 * import comes to reach, fails the guard.
 */
const LAUNCHED_BY_PATH: Readonly<Record<string, string>> = {
  'apps/desktop/scripts/terminal-proof/main.cjs': 'apps/desktop/scripts/terminal-proof.mjs',
  'apps/desktop/scripts/terminal-proof/preload.cjs': 'apps/desktop/scripts/terminal-proof.mjs',
  'apps/desktop/scripts/terminal-proof/harness.mjs': 'apps/desktop/scripts/terminal-proof.mjs',
};

const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file);
const isTestSupport = (file: string): boolean => /\.test-support\.(?:tsx?|mjs|cjs)$/.test(file);
const rel = (f: string): string => relative(ROOT, f).split('\\').join('/');

/** Every module under `dir` whose name `pattern` matches, declaration files aside; `skip` names directories not walked. */
function modules(dir: string, pattern = /\.tsx?$/, skip: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !skip.includes(entry.name)) out.push(...modules(path, pattern, skip));
    } else if (pattern.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const m of text.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g)) {
    const named = resolve(dirname(file), m[1]!);
    const base = named.replace(/\.js$/, '');
    const hit = [named, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.cjs`, join(base, 'index.ts'), join(base, 'index.tsx')]
      .find((c) => existsSync(c) && statSync(c).isFile());
    if (hit) found.push(hit);
  }
  return found;
}

/** Every module `starts` reach through `edges`, the starts included. */
function closure(starts: readonly string[], edges: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...(edges.get(f) ?? []));
  }
  return seen;
}

interface Layout {
  /** A package's directory name, or `apps/desktop`. */
  readonly name: string;
  readonly files: string[];
  readonly edges: Map<string, string[]>;
  readonly entries: string[];
  readonly reached: Set<string>;
  readonly importedByTests: Set<string>;
  /**
   * Every module a test reaches, through any chain of relative imports — a module reached only through a test-support module
   * (test -> a.test-support.ts -> b.ts) is test support too. Until fin47 only a test's direct imports were read, so `b.ts`
   * escaped the guard (fin46's review, accept1-21).
   */
  readonly reachedByTests: Set<string>;
}

function layout(name: string, files: string[], entries: string[]): Layout {
  const edges = new Map(files.map((f) => [f, importsOf(f)] as const));
  const reached = closure(entries, edges);
  const importedByTests = new Set(files.filter(isTest).flatMap((f) => edges.get(f) ?? []));
  const reachedByTests = closure([...importedByTests], edges);
  return { name, files, edges, entries, reached, importedByTests, reachedByTests };
}

function packageLayout(name: string): Layout {
  const dir = join(PACKAGES, name);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  return layout(name, modules(join(dir, 'src')), Object.values(manifest.exports).map((p) => resolve(dir, p)));
}

/** The desktop application's entries: the build's inputs, the scripts `package.json` runs or that stand at the top. */
function appEntries(): string[] {
  const build = readFileSync(join(APP, 'electron.vite.config.ts'), 'utf8');
  const inputs = [...build.matchAll(/resolve\(__dirname,\s*'(src\/[^']+)'\)/g)].map((m) => join(APP, m[1]!));
  const roots = inputs.flatMap((input) => {
    if (!input.endsWith('.html')) return [input];
    const page = readFileSync(input, 'utf8');
    return [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => resolve(dirname(input), m[1]!));
  });
  const scripts = join(APP, 'scripts');
  const top = readdirSync(scripts, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(?:mjs|cjs)$/.test(e.name))
    .map((e) => join(scripts, e.name));
  const run = [join(ROOT, 'package.json'), join(APP, 'package.json')].flatMap((manifest) => {
    const { scripts: commands = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> };
    return Object.values(commands).flatMap((command) =>
      [...command.matchAll(/(?:^|\s)((?:apps\/desktop\/)?scripts\/[^\s"']+\.(?:mjs|cjs))/g)].map((m) =>
        resolve(m[1]!.startsWith('apps/') ? ROOT : APP, m[1]!)));
  });
  return [...new Set([...roots, ...top, ...run, ...Object.keys(LAUNCHED_BY_PATH).map((p) => join(ROOT, p))])];
}

function appLayout(): Layout {
  const files = [
    ...modules(join(APP, 'src')),
    // `scripts/fixtures/` holds fixture repositories a proof copies, read as data, never imported.
    ...modules(join(APP, 'scripts'), /\.(?:mjs|cjs|tsx?)$/, ['fixtures']),
  ];
  return layout('apps/desktop', files, appEntries());
}

const packages = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'package.json')))
  .map((e) => packageLayout(e.name));
const app = appLayout();
const layouts = [...packages, app];
const all = <T>(pick: (l: Layout) => T[]): T[] => layouts.flatMap(pick);
const owner = (path: string): Layout =>
  path.startsWith('apps/desktop/') ? app : packages.find((candidate) => path.startsWith(`packages/${candidate.name}/`))!;

describe('test support is named as such in every package and in apps/desktop', () => {
  it('reads every package: its entries exist and reach its modules', () => {
    expect(packages.map((p) => p.name)).toEqual(expect.arrayContaining(['ui', 'workspace', 'engine', 'store']));
    for (const p of packages) {
      for (const e of p.entries) expect(existsSync(e), rel(e)).toBe(true);
      expect(p.reached.size, p.name).toBeGreaterThan(1);
    }
    const ui = packages.find((p) => p.name === 'ui')!;
    expect(ui.reached.has(join(PACKAGES, 'ui', 'src', 'AppShell.tsx'))).toBe(true);
    expect(ui.reached.has(join(PACKAGES, 'ui', 'src', 'design-system', 'core.tsx'))).toBe(true);
  });

  it('reads apps/desktop: the five roots from the build, the scripts, and what each reaches', () => {
    for (const e of app.entries) expect(existsSync(e), rel(e)).toBe(true);
    const roots = ['main/index.ts', 'run-host/index.ts', 'workspace-service/index.ts', 'preload/index.ts', 'renderer/main.tsx'];
    for (const root of roots) expect(app.entries, root).toContain(join(APP, 'src', root));
    // A package script below `scripts/`, a top-level proof, and the modules a script launches by path.
    expect(app.entries).toContain(join(APP, 'scripts', 'code-intelligence', 'bundle.mjs'));
    expect(app.entries).toContain(join(APP, 'scripts', 'live-run.mjs'));
    const reached = (path: string): boolean => app.reached.has(join(ROOT, path));
    // Through a `?nodeWorker` import, a `require`, and a chain from a package script.
    expect(reached('apps/desktop/src/workspace-service/traceability-worker.ts')).toBe(true);
    expect(reached('apps/desktop/scripts/terminal-proof/fence.cjs')).toBe(true);
    expect(reached('apps/desktop/scripts/lib/code-intelligence-warm-ups.mjs')).toBe(true);
    expect(reached('apps/desktop/src/renderer/windows.tsx')).toBe(true);
    expect(app.files.some((f) => f.includes(`${join('scripts', 'fixtures')}`))).toBe(false);
  });

  it('names every module only tests reach `<unit>.test-support.ts`', () => {
    const misnamed = all((l) => l.files
      .filter((f) => !isTest(f) && !l.reached.has(f) && l.reachedByTests.has(f) && !isTestSupport(f))
      .map(rel))
      .filter((f) => !(f in PRODUCT_NOT_YET_REACHED));
    expect(misnamed).toEqual([]);
  });

  it('follows a test\'s imports through test support to what it reaches', () => {
    // A package of three: a test imports `a.test-support.ts`, which imports `b.ts`; nothing else reaches `b.ts`.
    const edges = new Map<string, string[]>([['x.test.ts', ['a.test-support.ts']], ['a.test-support.ts', ['b.ts']], ['b.ts', []], ['c.ts', []]]);
    expect([...closure(edges.get('x.test.ts')!, edges)].sort()).toEqual(['a.test-support.ts', 'b.ts']);
    // And on the real tree, every directly imported module is in the transitive set.
    for (const l of layouts) for (const f of l.importedByTests) expect(l.reachedByTests.has(f), rel(f)).toBe(true);
  });

  it('keeps each stated product exception true: present, and still reached by no entry', () => {
    for (const path of Object.keys(PRODUCT_NOT_YET_REACHED)) {
      const file = join(ROOT, path);
      expect(existsSync(file), `${path} is gone: remove its exception`).toBe(true);
      expect(owner(path).reached.has(file), `${path} is reached by an entry now: remove its exception`).toBe(false);
    }
  });

  it('keeps each module launched by path true: present, named by its launcher, and imported by nothing', () => {
    const imported = new Set([...app.edges.values()].flat());
    for (const [path, launcher] of Object.entries(LAUNCHED_BY_PATH)) {
      const file = join(ROOT, path);
      expect(existsSync(file), `${path} is gone: remove it from LAUNCHED_BY_PATH`).toBe(true);
      const name = path.slice(path.lastIndexOf('/') + 1);
      expect(readFileSync(join(ROOT, launcher), 'utf8'), `${launcher} no longer names ${name}`).toContain(`'${name}'`);
      expect(imported.has(file), `${path} is imported now: remove it from LAUNCHED_BY_PATH`).toBe(false);
    }
  });

  it('keeps the test support each repair renamed under its test-support name', () => {
    const renamed = [
      ['ui', 'css-cascade'],
      ['workspace', 'traceability/scale-fixture'],
      ['workspace', 'traceability/growth-readings'],
    ] as const;
    for (const [name, unit] of renamed) {
      const p = packages.find((candidate) => candidate.name === name)!;
      const support = join(PACKAGES, name, 'src', `${unit}.test-support.ts`);
      expect(existsSync(support), rel(support)).toBe(true);
      expect(existsSync(join(PACKAGES, name, 'src', `${unit}.ts`)), `${name}/src/${unit}.ts`).toBe(false);
      expect(p.importedByTests.has(support), rel(support)).toBe(true);
    }
  });

  it('lets no product module import test support, and no entry reach it', () => {
    const leaks = all((l) => l.files
      .filter((f) => !isTest(f) && !isTestSupport(f))
      .flatMap((f) => (l.edges.get(f) ?? []).filter(isTestSupport).map((t) => `${rel(f)} -> ${rel(t)}`)));
    expect(leaks).toEqual([]);
    expect(all((l) => [...l.reached].filter(isTestSupport).map(rel))).toEqual([]);
  });
});
