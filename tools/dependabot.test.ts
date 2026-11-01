/**
 * Dependabot's version updates (R-091; `docs/architecture/hardening.md` §3.5 row 9, bundle G1). This pins
 * `.github/dependabot.yml` so that it cannot drift silently:
 * - two ecosystems, `npm` and `github-actions`, each at the repository root and weekly;
 * - npm's cooldown equal to the release-age window `pnpm-workspace.yaml` sets, so a proposed version installs;
 * - npm's groups: `electron` (the three that move together), `dev-tooling`, and `production` last, as the catch-all
 *   that takes the rest (Dependabot puts a dependency in the first group that matches);
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
    expect(groups['dev-tooling']?.patterns).toEqual(['eslint*', 'typescript*', 'vitest*', '@types/*']);
    expect(groups['production']?.patterns).toEqual(['*']);
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
