import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFacts, electronVersion, environmentFacts, gitFacts, mainEntry, repo, treePath } from './environment-facts.mjs';

describe('environment facts — the tree', () => {
  it('names this repository and its built main entry', () => {
    expect(mainEntry).toBe(join(repo, 'apps', 'desktop', 'out', 'main', 'index.js'));
    expect(treePath(mainEntry)).toBe('apps/desktop/out/main/index.js');
    expect(existsSync(join(repo, 'package.json'))).toBe(true);
  });

  it('reads the installed Electron version', () => {
    expect(electronVersion()).toMatch(/^\d+\.\d+/);
  });
});

describe('environment facts — the build', () => {
  const src = join(repo, 'src');
  const generated = join(src, 'generated');
  const list = (dir) => (dir === src
    ? [{ name: 'a.ts', dir: false }, { name: 'a.test.ts', dir: false }, { name: 'generated', dir: true }]
    : dir === generated ? [{ name: 'requirements.ts', dir: false }] : []);

  it('is fresh when no source is newer than the build; tests and generated trees never count', () => {
    const mtimes = {
      [join(src, 'a.ts')]: 20,
      [join(src, 'a.test.ts')]: 500,
      [join(src, 'generated', 'requirements.ts')]: 900,
      [mainEntry]: 300,
    };
    const facts = buildFacts({ exists: () => true, mtime: (file) => mtimes[file] ?? 0, roots: [src], list });
    expect(facts).toBeTruthy();
    expect(facts?.present).toBe(true);
    expect(facts?.fresh).toBe(true);
    expect(facts?.newestSource).toEqual({ path: 'src/a.ts', mtimeMs: 20 });
  });

  it('is stale when a source is newer than the build, and names it', () => {
    const facts = buildFacts({ exists: () => true, mtime: (file) => (file === mainEntry ? 10 : 20), roots: [src], list });
    expect(facts?.fresh).toBe(false);
    expect(facts?.newestSource).toEqual({ path: 'src/a.ts', mtimeMs: 20 });
  });

  it('has no freshness when there is no build to be fresh', () => {
    expect(buildFacts({ exists: () => false })).toMatchObject({ present: false, fresh: null, mtimeMs: null, newestSource: null });
  });
});

describe('environment facts — git and the whole block', () => {
  it('reads the repository commit and whether the tree is dirty', () => {
    const facts = gitFacts();
    expect(facts.head).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof facts.dirty).toBe('boolean');
  });

  it('records the machine, the runtime and the git state as one block', () => {
    const facts = environmentFacts();
    expect(facts.platform).toBe(process.platform);
    expect(facts.node).toBe(process.version);
    expect(facts.git.head).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof facts.build.present).toBe('boolean');
    expect(facts.buildId === null || typeof facts.buildId === 'string').toBe(true);
  });
});
