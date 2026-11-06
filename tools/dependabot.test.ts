/**
 * Dependabot's version updates (R-091; `docs/architecture/hardening.md` §3.5 row 9, bundle G1). This pins
 * `.github/dependabot.yml` so that it cannot drift silently:
 * - two ecosystems, `npm` and `github-actions`, each at the repository root and weekly;
 * - npm's cooldown equal to the release-age window `pnpm-workspace.yaml` sets, so a proposed version installs;
 * - npm's groups: `electron` (the three that move together), `dev-tooling`, and `production` last, as the catch-all
 *   that takes the rest (Dependabot puts a dependency in the first group that matches); vitest's scoped packages
 *   (`@vitest/coverage-v8`, R-091 hardening F1) in vitest's own group, since each peers on its exact version;
 * - every action the workflows use is pinned by a full commit SHA with its version in a trailing comment, the form
 *   Dependabot updates in place.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');

type Update = {
  'package-ecosystem': string;
  directory: string;
  schedule: { interval: string };
  cooldown?: { 'default-days'?: number };
  'open-pull-requests-limit'?: number;
  labels?: string[];
  groups?: Record<string, { patterns: string[] }>;
  ignore?: { 'dependency-name': string; 'update-types'?: string[] }[];
};
const config = parse(readFileSync(join(root, '.github', 'dependabot.yml'), 'utf8')) as { version: number; updates: Update[] };
const ecosystem = (name: string): Update => {
  const found = config.updates.filter((u) => u['package-ecosystem'] === name);
  expect(found, `one ${name} entry`).toHaveLength(1);
  return found[0]!;
};

describe('.github/dependabot.yml', () => {
  it('is version 2 and updates npm and github-actions only, each at the root, weekly', () => {
    expect(config.version).toBe(2);
    expect(config.updates.map((u) => u['package-ecosystem']).sort()).toEqual(['github-actions', 'npm']);
    for (const update of config.updates) {
      expect(update.directory).toBe('/');
      expect(update.schedule.interval).toBe('weekly');
      expect(update.labels?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('holds npm proposals back as long as pnpm holds a release back', () => {
    const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as { minimumReleaseAge: number };
    const npm = ecosystem('npm');
    expect(npm.cooldown?.['default-days']).toBe(workspace.minimumReleaseAge / (24 * 60));
    expect(npm['open-pull-requests-limit']).toBe(5);
  });

  it('groups npm updates as electron, dev-tooling, and production last', () => {
    const groups = ecosystem('npm').groups ?? {};
    expect(Object.keys(groups)).toEqual(['electron', 'dev-tooling', 'production']);
    expect(groups['electron']?.patterns).toEqual(['electron', 'electron-builder', 'electron-vite']);
    expect(groups['dev-tooling']?.patterns).toEqual(['eslint*', 'typescript*', 'vitest*', '@vitest/*', '@types/*']);
    expect(groups['production']?.patterns).toEqual(['*']);
  });

  /*
   * One entry, and one that says why. Dependabot re-proposes a version it still sees as behind on every weekly
   * run, so closing #54 (`undici` 7.30.1 → 8.12.3) does not by itself stop 8 coming back as a fresh pull request
   * — this list does. It is deliberately narrow: `undici` was measured incompatible with the product as built
   * (the `Dispatcher` given to `fetch` in `packages/agent-tools/src/tools/direct-fetch.ts` is 7's contract, and
   * 8.12.3 refuses it with `InvalidArgumentError: invalid onRequestStart method`), so only that one dependency
   * is named, and only its majors are held: 7's patches and minors are not in question. The list is derived
   * from the file rather than written out here, so an entry added without its reason is caught by the comment
   * check below at the same time it is added.
   */
  it('ignores undici majors and nothing else, and records why in the file', () => {
    const npm = ecosystem('npm');
    expect(npm.ignore?.map((entry) => entry['dependency-name'])).toEqual(['undici']);
    for (const entry of npm.ignore ?? []) {
      expect(entry['update-types'], entry['dependency-name']).toEqual(['version-update:semver-major']);
    }
    expect(ecosystem('github-actions').ignore ?? []).toEqual([]);
    // The entry is in the file with its evidence and the condition that lifts it: the reason lives beside the
    // dependency it names, not in a pull request's description, which the next reader of the file does not open.
    const text = readFileSync(join(root, '.github', 'dependabot.yml'), 'utf8');
    const entry = text.slice(text.indexOf('ignore:'), text.indexOf('groups:') > text.indexOf('ignore:') ? text.indexOf('groups:') : undefined);
    for (const cited of ['direct-fetch.ts', 'OQ-37', 'onRequestStart', 'Re-evaluate when']) expect(entry).toContain(cited);
  });

  it('moves every @vitest/ package the root manifest names in the same group as vitest, whose exact version it peers on', () => {
    // Dependabot puts a dependency in the first group with a matching pattern; `*` matches any run of characters.
    const groups = Object.entries(ecosystem('npm').groups ?? {});
    const matches = (pattern: string, name: string): boolean => {
      const [head = '', ...rest] = pattern.split('*');
      if (rest.length === 0) return name === pattern;
      if (!name.startsWith(head)) return false;
      let at = head.length;
      for (const part of rest.slice(0, -1)) {
        const found = name.indexOf(part, at);
        if (found < 0) return false;
        at = found + part.length;
      }
      const tail = rest[rest.length - 1]!;
      return name.length - tail.length >= at && name.endsWith(tail);
    };
    const groupOf = (name: string): string | undefined => groups.find(([, g]) => g.patterns.some((p) => matches(p, name)))?.[0];
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    const scoped = Object.keys(manifest.devDependencies).filter((name) => name.startsWith('@vitest/'));
    expect(scoped).toContain('@vitest/coverage-v8');
    for (const name of scoped) expect(groupOf(name), name).toBe(groupOf('vitest'));
    expect(groupOf('vitest')).toBe('dev-tooling');
  });

  it('finds every workflow action pinned by SHA with its version beside it', () => {
    const dir = join(root, '.github', 'workflows');
    const loose: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
      for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
        const use = /^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/.exec(line);
        if (!use || use[1]!.startsWith('./')) continue;
        if (!/@[0-9a-f]{40}$/.test(use[1]!) || !/^\s+#\s*v\d/.test(use[2]!)) loose.push(`${file}: ${line.trim()}`);
      }
    }
    expect(loose).toEqual([]);
  });
});
