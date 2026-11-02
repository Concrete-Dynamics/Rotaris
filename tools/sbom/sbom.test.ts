import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { composeReleaseSbom, productRef, sbomName } from './sbom.mjs';

/**
 * The release's SBOM (R-091; `docs/architecture/hardening.md` §3.5 row 10; OQ-487 for where it is published). The
 * composition runs over a fixture shaped like pnpm 11's `pnpm -r sbom --sbom-format cyclonedx --prod` output; the
 * real command's reading over this workspace is the first execution recorded in `docs/architecture/first-executions/`.
 */

const WRITE = join(dirname(fileURLToPath(import.meta.url)), 'write.mjs');
const OLD_ROOT = 'pkg:npm/rotaris-crw@0.0.0';

const pnpmBom = () => ({
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  version: 1,
  metadata: {
    timestamp: '2026-11-02T00:00:00.000Z',
    tools: { components: [{ type: 'application', name: 'pnpm', version: '11.9.0' }] },
    component: { type: 'application', name: 'rotaris-crw', version: '0.0.0', 'bom-ref': OLD_ROOT },
  },
  components: [
    { type: 'library', name: 'zod', version: '4.6.7', 'bom-ref': 'pkg:npm/zod@4.6.7' },
    { type: 'library', name: 'undici', version: '7.30.1', 'bom-ref': 'pkg:npm/undici@7.30.1' },
  ],
  dependencies: [
    { ref: OLD_ROOT, dependsOn: ['pkg:npm/zod@4.6.7', 'pkg:npm/undici@7.30.1'] },
    { ref: 'pkg:npm/zod@4.6.7', dependsOn: [] },
    { ref: 'pkg:npm/undici@7.30.1', dependsOn: [] },
  ],
});
const release = { version: '0.1.0rc1', electronVersion: '44.3.0', license: 'GPL-3.0-only' };

describe('sbomName', () => {
  it('names the file after the release version', () => {
    expect(sbomName('0.1.0rc1')).toBe('Rotaris-0.1.0rc1-sbom.cdx.json');
  });

  it('refuses a version that is empty or would leave the directory', () => {
    for (const bad of ['', '../x', 'a b', 'x\\y']) expect(() => sbomName(bad)).toThrow(/not a version/);
  });
});

describe('composeReleaseSbom', () => {
  it('makes the product the root, at the release version, under the project licence', () => {
    const sbom = composeReleaseSbom(pnpmBom(), release);
    expect(sbom.metadata.component).toMatchObject({
      type: 'application',
      name: 'Rotaris',
      version: '0.1.0rc1',
      'bom-ref': productRef('0.1.0rc1'),
      licenses: [{ license: { id: 'GPL-3.0-only' } }],
    });
    expect(sbom.metadata['tools']).toEqual(pnpmBom().metadata.tools);
  });

  it('moves every edge of the workspace root to the product and leaves no reference to the old root', () => {
    const sbom = composeReleaseSbom(pnpmBom(), release);
    const text = JSON.stringify(sbom);
    expect(text).not.toContain(OLD_ROOT);
    const root = sbom.dependencies.find((d) => d.ref === productRef('0.1.0rc1'));
    expect(root?.dependsOn).toEqual(expect.arrayContaining(['pkg:npm/zod@4.6.7', 'pkg:npm/undici@7.30.1']));
  });

  it('adds Electron, the shipped runtime --prod cannot see, as a component the product depends on', () => {
    const sbom = composeReleaseSbom(pnpmBom(), release);
    const electron = sbom.components.filter((c) => c.name === 'electron');
    expect(electron).toEqual([expect.objectContaining({ version: '44.3.0', 'bom-ref': 'pkg:npm/electron@44.3.0' })]);
    expect(sbom.dependencies.find((d) => d.ref === productRef('0.1.0rc1'))?.dependsOn).toContain('pkg:npm/electron@44.3.0');
    expect(sbom.dependencies.filter((d) => d.ref === 'pkg:npm/electron@44.3.0')).toHaveLength(1);
  });

  it('keeps every production component pnpm listed, and adds Electron only once', () => {
    const twice = composeReleaseSbom(composeReleaseSbom(pnpmBom(), release), release);
    expect(twice.components.map((c) => c.name).sort()).toEqual(['electron', 'undici', 'zod']);
  });

  it('refuses a document that is not CycloneDX, has no root, or an Electron version that is not one', () => {
    expect(() => composeReleaseSbom({ bomFormat: 'SPDX' }, release)).toThrow(/not CycloneDX/);
    expect(() => composeReleaseSbom({ ...pnpmBom(), metadata: {} }, release)).toThrow(/no root component/);
    expect(() => composeReleaseSbom(pnpmBom(), { ...release, electronVersion: '' })).toThrow(/not an Electron version/);
  });
});

describe('pnpm sbom:write', () => {
  it('refuses with exit 2 a call that does not name a tag of REQ-STARTUP-027 and a directory', () => {
    for (const argv of [[], ['v0.1.0rc1'], ['0.1.0', 'out'], ['v0.1.0-beta', 'out']]) {
      const run = spawnSync(process.execPath, [WRITE, ...argv], { encoding: 'utf8' });
      expect(run.status, argv.join(' ')).toBe(2);
      expect(run.stderr).toMatch(/^usage: pnpm sbom:write <tag> <dir>/);
    }
  });

  it('refuses with exit 1, writing nothing, a tag whose version the desktop package does not declare', () => {
    const run = spawnSync(process.execPath, [WRITE, 'v999.0.0', 'never-written'], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^error: the tag v999\.0\.0 names 999\.0\.0, and apps\/desktop declares /);
  });
});
