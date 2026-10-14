import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Test support is named as test support. A module under this package's `src/` that only tests import, and that the
 * package's own entries never reach, is named `<unit>.test-support.ts`, so a reader of `src/` does not take it for
 * product code; and no product module imports one. The cascade reading the two CSS tests share sat at
 * `css-cascade.ts`, beside the components, as if the renderer ran it
 * (docs/defects/fixed/the-css-cascade-reading-is-test-support-named-as-a-product-module.md).
 *
 * The walk reads relative `import`/`export … from` specifiers only, which is how every module here reaches another;
 * a package import (`@rotaris/…`) leaves `src/` and is not followed.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const PACKAGE = resolve(SRC, '..');

const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file);
const isTestSupport = (file: string): boolean => /\.test-support\.tsx?$/.test(file);

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

function layout() {
  const files = modules(SRC);
  const edges = new Map(files.map((f) => [f, importsOf(f)] as const));
  const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  const entries = Object.values(manifest.exports).map((p) => resolve(PACKAGE, p));
  const reached = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (reached.has(f)) continue;
    reached.add(f);
    stack.push(...(edges.get(f) ?? []));
  }
  const importedByTests = new Set(files.filter(isTest).flatMap((f) => edges.get(f) ?? []));
  return { files, edges, entries, reached, importedByTests };
}

const rel = (f: string): string => relative(SRC, f).split('\\').join('/');

describe('test support in @rotaris/ui is named as such', () => {
  const { files, edges, entries, reached, importedByTests } = layout();

  it('reads the package: its entries exist and reach the components', () => {
    for (const e of entries) expect(existsSync(e), rel(e)).toBe(true);
    expect(reached.has(join(SRC, 'AppShell.tsx'))).toBe(true);
    expect(reached.has(join(SRC, 'design-system', 'core.tsx'))).toBe(true);
  });

  it('names every module only tests reach `<unit>.test-support.ts`', () => {
    const misnamed = files
      .filter((f) => !isTest(f) && !reached.has(f) && importedByTests.has(f) && !isTestSupport(f))
      .map(rel);
    expect(misnamed).toEqual([]);
  });

  it('keeps the cascade reading the CSS tests share under its test-support name', () => {
    expect(existsSync(join(SRC, 'css-cascade.test-support.ts'))).toBe(true);
    expect(existsSync(join(SRC, 'css-cascade.ts'))).toBe(false);
    expect(importedByTests.has(join(SRC, 'css-cascade.test-support.ts'))).toBe(true);
  });

  it('lets no product module import test support, and no entry reach it', () => {
    const leaks = files
      .filter((f) => !isTest(f) && !isTestSupport(f))
      .flatMap((f) => (edges.get(f) ?? []).filter(isTestSupport).map((t) => `${rel(f)} -> ${rel(t)}`));
    expect(leaks).toEqual([]);
    expect([...reached].filter(isTestSupport).map(rel)).toEqual([]);
  });
});
