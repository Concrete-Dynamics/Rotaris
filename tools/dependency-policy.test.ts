/**
 * The pnpm supply-chain settings are written out, so that a change to any of them is an edit a reviewer sees
 * (R-091; `docs/architecture/hardening.md` §3.5, bundle G1). This pins:
 * - `minimumReleaseAge` at seven days (10080 minutes), the first line of defence, which Dependabot's cooldown matches;
 * - `minimumReleaseAgeExclude` absent or empty: an entry is a deliberate exception and carries its reason beside it,
 *   so adding one fails here until this test is edited too;
 * - `trustPolicy: no-downgrade`, its exclusions exact `name@version` pairs (a bare name would exempt every later
 *   publish of the package), `blockExoticSubdeps: true` and `engineStrict: true`;
 * - the catalog: every dependency two or more manifests name is written `catalog:` in each, and the catalog holds
 *   only dependencies some manifest takes from it;
 * - Node's pin: `.node-version` holds the major `engines.node` states as its floor, and CI's setup-node steps read it.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')) as Record<string, unknown>;

type Manifest = { file: string; json: Record<string, Record<string, string> | undefined> };
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

function manifests(): Manifest[] {
  const files = ['package.json'];
  for (const glob of workspace['packages'] as string[]) {
    const dir = glob.replace(/\/\*$/, '');
    for (const entry of readdirSync(join(root, dir))) {
      const file = `${dir}/${entry}/package.json`;
      if (existsSync(join(root, file))) files.push(file);
    }
  }
  return files.map((file) => ({ file, json: JSON.parse(readFileSync(join(root, file), 'utf8')) }));
}

describe('the pnpm supply-chain settings (pnpm-workspace.yaml)', () => {
  it('holds a version back seven days before it can be resolved', () => {
    expect(workspace['minimumReleaseAge']).toBe(10080);
  });

  it('excludes nothing from the release-age window', () => {
    expect(workspace['minimumReleaseAgeExclude'] ?? []).toEqual([]);
  });

  it('refuses a trust downgrade, excepting exact versions only', () => {
    expect(workspace['trustPolicy']).toBe('no-downgrade');
    const excluded = (workspace['trustPolicyExclude'] ?? []) as string[];
    for (const entry of excluded) expect(entry, `${entry} names no exact version`).toMatch(/^(@[^/@]+\/)?[^/@]+@\d+\.\d+\.\d+$/);
    expect(workspace['trustPolicyIgnoreAfter']).toBeUndefined();
  });

  it('blocks exotic subdependencies and installs only under the engines it states', () => {
    expect(workspace['blockExoticSubdeps']).toBe(true);
    expect(workspace['engineStrict']).toBe(true);
  });
});

describe('the catalog', () => {
  const all = manifests();
  const catalog = (workspace['catalog'] ?? {}) as Record<string, string>;

  it('is the one specifier of every dependency two or more manifests name', () => {
    const names = new Map<string, string[]>();
    for (const { file, json } of all) {
      for (const section of SECTIONS) {
        for (const [name, spec] of Object.entries(json[section] ?? {})) {
          if (spec.startsWith('workspace:')) continue;
          names.set(name, [...(names.get(name) ?? []), `${file} ${section} ${spec}`]);
        }
      }
    }
    const strays = [...names.entries()]
      .filter(([, uses]) => uses.length >= 2)
      .flatMap(([name, uses]) => uses.filter((use) => !use.endsWith(' catalog:') || !(name in catalog)).map((use) => `${name}: ${use}`));
    expect(strays).toEqual([]);
  });

  it('holds only what some manifest takes from it', () => {
    const taken = new Set(all.flatMap(({ json }) => SECTIONS.flatMap((s) => Object.entries(json[s] ?? {}).filter(([, v]) => v === 'catalog:').map(([n]) => n))));
    expect(Object.keys(catalog).filter((name) => !taken.has(name))).toEqual([]);
  });
});

describe('the Node pin', () => {
  it('.node-version holds the major engines.node states as its floor', () => {
    const pin = readFileSync(join(root, '.node-version'), 'utf8').trim();
    const engines = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines: { node: string } }).engines.node;
    expect(pin).toMatch(/^\d+$/);
    expect(engines).toBe(`>=${pin}.0.0`);
  });

  it('every setup-node step of CI reads it', () => {
    const ci = readFileSync(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    const steps = parse(ci) as { jobs: Record<string, { steps: { uses?: string; with?: Record<string, unknown> }[] }> };
    const setups = Object.values(steps.jobs).flatMap((job) => job.steps.filter((step) => step.uses?.startsWith('actions/setup-node@')));
    expect(setups.length).toBeGreaterThan(0);
    for (const step of setups) {
      expect(step.with?.['node-version-file']).toBe('.node-version');
      expect(step.with?.['node-version']).toBeUndefined();
    }
  });
});
