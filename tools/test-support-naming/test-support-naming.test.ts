import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Test support is named as test support, in every package under `packages/`. A module under a package's `src/` that only
 * tests import, and that the package's own entries never reach, is named `<unit>.test-support.ts`, so a reader of `src/`
 * does not take it for product code; and no product module imports one. The cascade reading the two CSS tests share sat at
 * `packages/ui/src/css-cascade.ts`, beside the components, as if the renderer ran it
 * (docs/defects/fixed/the-css-cascade-reading-is-test-support-named-as-a-product-module.md), and the guard then pinned
 * `@rotaris/ui` alone, from `packages/ui/src/test-support.test.ts`; the traceability proof's scale fixture and growth
 * readings sat the same way in `@rotaris/workspace`
 * (docs/defects/fixed/workspace-traceability-test-support-is-named-as-product-modules.md), so since 2026-10-15 the guard
 * lives here and walks every package.
 *
 * The walk reads relative `import`/`export … from` specifiers only, which is how every module in a package reaches another;
 * a package import (`@rotaris/…`) leaves `src/` and is not followed. A package's entries are its `package.json` `exports`.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES = join(ROOT, 'packages');

/**
 * Product modules that only their own tests reach today, each with why it is product code all the same. An entry here
 * that a package entry comes to reach, or that is removed, fails the guard, so the list cannot outlive its reason.
 */
const PRODUCT_NOT_YET_REACHED: Readonly<Record<string, string>> = {
  'packages/workspace/src/traceability/consumer.ts':
    'the traceability consumer, built "as far as the product reaches" (Part AJ2, REQ-TRACE-176/181/182/183/500) and not yet wired to an entry',
};

const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file);
const isTestSupport = (file: string): boolean => /\.test-support\.tsx?$/.test(file);
const rel = (f: string): string => relative(ROOT, f).split('\\').join('/');

function modules(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...modules(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = resolve(dirname(file), m[1]!).replace(/\.js$/, '');
    const hit = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find((c) => existsSync(c));
    if (hit) found.push(hit);
  }
  return found;
}

interface PackageLayout {
  readonly name: string;
  readonly files: string[];
  readonly edges: Map<string, string[]>;
  readonly entries: string[];
  readonly reached: Set<string>;
  readonly importedByTests: Set<string>;
}

function layout(name: string): PackageLayout {
  const dir = join(PACKAGES, name);
  const files = modules(join(dir, 'src'));
  const edges = new Map(files.map((f) => [f, importsOf(f)] as const));
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  const entries = Object.values(manifest.exports).map((p) => resolve(dir, p));
  const reached = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (reached.has(f)) continue;
    reached.add(f);
    stack.push(...(edges.get(f) ?? []));
  }
  const importedByTests = new Set(files.filter(isTest).flatMap((f) => edges.get(f) ?? []));
  return { name, files, edges, entries, reached, importedByTests };
}

const packages = readdirSync(PACKAGES, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(PACKAGES, e.name, 'package.json')))
  .map((e) => layout(e.name));
const all = <T>(pick: (p: PackageLayout) => T[]): T[] => packages.flatMap(pick);

describe('test support is named as such in every package', () => {
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

  it('names every module only tests reach `<unit>.test-support.ts`', () => {
    const misnamed = all((p) => p.files
      .filter((f) => !isTest(f) && !p.reached.has(f) && p.importedByTests.has(f) && !isTestSupport(f))
      .map(rel))
      .filter((f) => !(f in PRODUCT_NOT_YET_REACHED));
    expect(misnamed).toEqual([]);
  });

  it('keeps each stated product exception true: present, and still reached by no entry', () => {
    for (const path of Object.keys(PRODUCT_NOT_YET_REACHED)) {
      const p = packages.find((candidate) => path.startsWith(`packages/${candidate.name}/`))!;
      const file = join(ROOT, path);
      expect(existsSync(file), `${path} is gone: remove its exception`).toBe(true);
      expect(p.reached.has(file), `${path} is reached by an entry now: remove its exception`).toBe(false);
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
    const leaks = all((p) => p.files
      .filter((f) => !isTest(f) && !isTestSupport(f))
      .flatMap((f) => (p.edges.get(f) ?? []).filter(isTestSupport).map((t) => `${rel(f)} -> ${rel(t)}`)));
    expect(leaks).toEqual([]);
    expect(all((p) => [...p.reached].filter(isTestSupport).map(rel))).toEqual([]);
  });
});
