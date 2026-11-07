/**
 * The preload-externals check's reading, held to the config it guards (`electron.vite.config.ts`'s preload section) and to
 * the defect it was written for (2026-11-07: electron-vite 6 shipped `require("zod")` in the preload, and the sandboxed
 * loader refused the whole script — ADR-0056 rule 4). The check runs in `pnpm package` after the build; this file proves
 * its reading, and that the reading can FAIL, without a packaging run.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLOWED_EXTERNALS, packageOf, preloadExternals, preloadFiles, requiredPackages } from './preload-externals.mjs';

const APP = join(import.meta.dirname, '..', '..');

describe('the preload-externals reading', () => {
  it('names the package a specifier belongs to, scoped or deep', () => {
    expect(packageOf('zod')).toBe('zod');
    expect(packageOf('zod/v4')).toBe('zod');
    expect(packageOf('@rotaris/contracts')).toBe('@rotaris/contracts');
    expect(packageOf('@rotaris/contracts/deep')).toBe('@rotaris/contracts');
  });

  it('reads a bare require and ignores a relative path and a computed one', () => {
    expect(requiredPackages(`const a = require("zod"); const b = require('./chunk.cjs'); const c = require(name);`)).toEqual(['zod']);
  });

  it('PASSES the externals the preload section states, and the node builtins', () => {
    const read = () => `require("electron"); require("electron/main"); require("node:fs"); require("fs"); require("better-sqlite3");`;
    expect(preloadExternals(['/x/index.cjs'], read).offenders).toEqual([]);
  });

  it('FAILS a package a sandboxed preload cannot load — the 2026-11-07 defect', () => {
    const read = () => `require("electron");\nrequire("zod");`;
    const { offenders } = preloadExternals(['/x/index.cjs'], read);
    expect(offenders.map((o) => o.package)).toEqual(['zod']);
  });

  it('reads every emitted file of the section, not one — a second file is not skipped', () => {
    const read = (f: string) => (f.endsWith('a.cjs') ? `require("electron")` : `require("ajv")`);
    const { offenders, files } = preloadExternals(['/x/a.cjs', '/x/b.cjs'], read);
    expect(files).toBe(2);
    expect(offenders.map((o) => o.package)).toEqual(['ajv']);
  });

  it('names no allow-listed package the config does not state as external', () => {
    // The other direction of the same rule: an allow-list entry the config does not carry would let a real offender pass.
    const config = readFileSync(join(APP, 'electron.vite.config.ts'), 'utf8');
    const stated = /const EXTERNAL = \[(?<list>[^\]]*)\]/s.exec(config)?.groups?.list ?? '';
    for (const name of ALLOWED_EXTERNALS) expect(stated).toContain(`'${name}'`);
  });
});

describe('the emitted preload of a built tree', () => {
  const out = resolve(APP, 'out', 'preload');
  const emitted = (() => { try { return preloadFiles(out); } catch { return []; } })();

  it.skipIf(emitted.length === 0)('carries no external package', () => {
    const { offenders } = preloadExternals(emitted, (f) => readFileSync(f, 'utf8'));
    expect(offenders).toEqual([]);
  });
});
