/**
 * The tooling's JavaScript is type-checked (`tsconfig.scripts.json`, `checkJs`; R-091, `docs/architecture/hardening.md`
 * §3.5 row 4), and a file too far gone for that today opens with `// @ts-nocheck` and is listed in
 * `tools/typecheck-exceptions.json`. The list ratchets: this pins
 * - every listed file exists and carries the line (TypeScript reads it among the file's leading comments, so a header
 *   block a test reads may stand above it, as `git-proof.mjs`'s does; one below the code would not hold, and
 *   `pnpm typecheck` would say so);
 * - every JavaScript file of the project's scope that carries the line is listed, so no file leaves checking unseen;
 * - no TypeScript file of the scope carries it: a test or a tool written in TypeScript is checked whole;
 * - the list is sorted and holds no duplicate, so its diff reads as a burn-down;
 * - its length is at most `CAP`, the count it started with on 2026-11-03. The cap is lowered with the list; it is never
 *   raised: a new script is written typed, not added here.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const CAP = 96;
const PRAGMA = /^\s*\/\/\s*@ts-nocheck\b/m;
const HEAD = '// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091)';

const listed = (JSON.parse(readFileSync(join(import.meta.dirname, 'typecheck-exceptions.json'), 'utf8')) as { files: string[] }).files;

/** The project's own roots (its `include`), less the material its `exclude` names. */
const ROOTS = ['apps/desktop/scripts', 'tools'];
const EXCLUDED = ['node_modules', 'apps/desktop/scripts/fixtures/todo-app', 'apps/desktop/scripts/fixtures/requirements-store', 'tools/release-naming/src'];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (EXCLUDED.some((x) => path === x || path.endsWith(`/${x}`))) continue;
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}
const inScope = ROOTS.flatMap(filesUnder).map((path) => relative(root, join(root, path)).split(sep).join('/'));
const carries = (path: string) => PRAGMA.test(readFileSync(join(root, path), 'utf8'));

describe('the tooling typecheck exceptions', () => {
  it('lists only files that carry the exception line', () => {
    for (const path of listed) {
      const lines = readFileSync(join(root, path), 'utf8').split('\n');
      expect(lines.some((line) => line.startsWith(HEAD)), `${path} carries no exception line`).toBe(true);
    }
  });

  it('lists every JavaScript file of the scope that skips the check, and no TypeScript file skips it', () => {
    const skipping = inScope.filter((path) => /\.(mjs|cjs|js)$/.test(path) && carries(path)).sort();
    expect(skipping).toEqual([...listed].sort());
    expect(inScope.filter((path) => /\.(ts|tsx|mts|cts)$/.test(path) && carries(path))).toEqual([]);
  });

  it('is sorted, holds no duplicate, and only shrinks', () => {
    expect(listed).toEqual([...new Set(listed)].sort());
    expect(listed.length).toBeLessThanOrEqual(CAP);
  });
});
