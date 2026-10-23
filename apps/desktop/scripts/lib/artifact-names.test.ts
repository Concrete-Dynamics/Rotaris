/**
 * The artifact names `pnpm package` hands electron-builder, rendered from the DECLARED version (REQ-STARTUP-031,
 * REQ-STARTUP-158, REQ-STARTUP-027/029; `docs/defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`).
 * Two things are pinned without a packaging run (IC-3): the names the module renders for a stable and each prerelease
 * kind, and that the configuration `pnpm package` writes — the repository's yml with the names set, parsed and dumped by
 * electron-builder's own `js-yaml` — is loaded by electron-builder's own configuration loader with both `artifactName`
 * keys literal and the rest of the yml kept, once.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { BUILDER_ARTIFACT_NAME_KEYS, configurationWithNames, declaredProductVersion, namedConfigurationText, packagingArtifactNames, producedNameProblem } from './artifact-names.mjs';
import { UnsupportedVersionError } from '../../../../tools/release-naming/src/index.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appRequire = createRequire(join(APP, 'package.json'));
/** electron-builder's own modules, resolved from where electron-builder resolves them. */
const abl = createRequire(appRequire.resolve('app-builder-lib/package.json'));
const yaml = abl('js-yaml') as { load: (text: string) => Record<string, any>; dump: (value: unknown, options?: unknown) => string };
const YML = readFileSync(join(APP, 'electron-builder.yml'), 'utf8');

const manifestDir = (version: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), 'rotaris-declared-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify(version === undefined ? { name: 'x' } : { name: 'x', version }));
  return dir;
};

describe('the names the declared version renders — REQ-STARTUP-031 over REQ-STARTUP-027/029', () => {
  it.each([
    ['0.1.0', 'Rotaris-0.1.0-windows-x64-setup.exe'],
    ['0.1.0rc1', 'Rotaris-0.1.0rc1-windows-x64-setup.exe'],
    ['0.1.0a2', 'Rotaris-0.1.0a2-windows-x64-setup.exe'],
    ['0.1.0b3', 'Rotaris-0.1.0b3-windows-x64-setup.exe'],
  ])('%s renders %s, the suffix without a separator', (version, setup) => {
    expect(packagingArtifactNames(version)).toEqual({ setup });
    const config = configurationWithNames(yaml.load(YML), packagingArtifactNames(version));
    expect(config.win.artifactName).toBe(setup);
    expect(config.nsis.artifactName).toBe(setup);
  });
  it('a version outside the grammar renders no name: the hyphenated spelling electron-builder makes is refused, not renamed', () => {
    expect(() => packagingArtifactNames('0.1.0-rc1')).toThrow(UnsupportedVersionError);
    expect(() => packagingArtifactNames('0.1.0dev1')).toThrow(UnsupportedVersionError);
  });
  it('every key electron-builder reads an installer name from on this configuration is overridden, the target key among them', () => {
    expect(BUILDER_ARTIFACT_NAME_KEYS).toEqual(['win.artifactName', 'nsis.artifactName']);
  });
});

describe('the declared version is the manifest\'s own text — REQ-STARTUP-158', () => {
  it('reads the text as written, prerelease suffix and all', () => {
    for (const v of ['0.1.0', '0.1.0rc1', '0.1.0a2', '0.1.0b3']) {
      const dir = manifestDir(v);
      try { expect(declaredProductVersion(dir)).toBe(v); } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
  it('the repository\'s own manifest declares a version in the grammar', () => {
    expect(declaredProductVersion(APP)).toMatch(/^\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?$/);
  });
  it('a manifest without a version, or with one outside the grammar, declares no name', () => {
    for (const [v, error] of [[undefined, /declares no product version/], [7, /declares no product version/], ['0.1.0-rc1', UnsupportedVersionError], ['v0.1.0', UnsupportedVersionError]] as const) {
      const dir = manifestDir(v);
      try { expect(() => declaredProductVersion(dir)).toThrow(error as never); } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
});

describe('a produced file\'s name — REQ-STARTUP-031, REQ-STARTUP-152', () => {
  const names = packagingArtifactNames('0.1.0rc1');
  it('the installer by the declared name passes, and so does the block map electron-builder names after it', () => {
    expect(producedNameProblem('Rotaris-0.1.0rc1-windows-x64-setup.exe', names)).toBeNull();
    expect(producedNameProblem('Rotaris-0.1.0rc1-windows-x64-setup.exe.blockmap', names)).toBeNull();
  });
  it('the hyphenated installer, and electron-builder\'s own pattern, are refused by name', () => {
    expect(producedNameProblem('Rotaris-0.1.0-rc1-windows-x64-setup.exe', names)).toMatch(/produced "Rotaris-0\.1\.0-rc1-windows-x64-setup\.exe"; the declared version renders "Rotaris-0\.1\.0rc1-windows-x64-setup\.exe"/);
    expect(producedNameProblem('Rotaris Setup 0.1.0-rc1.exe', names)).toMatch(/REQ-STARTUP-031/);
  });
});

describe('what electron-builder is handed — the written configuration through its own loader', () => {
  /**
   * `package.mjs` writes `release/electron-builder.package.yml` — the yml it would have run with, the two keys set — and
   * runs `electron-builder --win --config release/electron-builder.package.yml`. app-builder-lib's `getConfig` is what
   * electron-builder loads that path with; it is run here on the real yml, so a loader change, or an `artifactName`
   * reappearing in the yml, fails this before it fails a release. Nothing is built.
   */
  const { getConfig } = abl('app-builder-lib/out/util/config/config.js') as { getConfig: (projectDir: string, configPath: string | null, configFromOptions: null) => Promise<Record<string, any>> };
  const loaded = async (text: string) => {
    mkdirSync(join(APP, 'release'), { recursive: true });
    const dir = mkdtempSync(join(APP, 'release', 'naming-test-'));
    try {
      writeFileSync(join(dir, 'electron-builder.package.yml'), text);
      return await getConfig(APP, join(dir, 'electron-builder.package.yml'), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  it('the names land on both keys as literals, with the yml\'s hooks, targets and files kept — once, not merged twice', async () => {
    const config = await loaded(namedConfigurationText(YML, packagingArtifactNames('0.1.0rc1'), yaml));
    expect(config.win.artifactName).toBe('Rotaris-0.1.0rc1-windows-x64-setup.exe');
    expect(config.nsis.artifactName).toBe('Rotaris-0.1.0rc1-windows-x64-setup.exe');
    expect(config.afterPack).toBe('./scripts/build-hooks.cjs');
    expect(config.artifactBuildCompleted).toBe('./scripts/build-hooks.cjs');
    expect(config.beforeBuild).toBe('./scripts/build-hooks.cjs');
    expect(config.publish).toBeNull();
    expect(config.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
    // REQ-STARTUP-016/017: the assisted per-user installer, its directory the user's to choose, with the project include
    // that writes REQ-STARTUP-016's InstallDir; the icon the owner supplied (O-4).
    expect(config.nsis).toMatchObject({ oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, include: 'resources/installer.nsh' });
    expect(config.win.icon).toBe('resources/icon.ico');
    const source = yaml.load(YML);
    expect(config.extraResources).toHaveLength(source.extraResources.length);
    expect(config.files[0].filter).toEqual(source.files);
  });
  it('the yml itself carries no artifactName, so a build without pnpm package has none for afterPack to accept', async () => {
    const config = await loaded(YML);
    expect(config.win.artifactName).toBeUndefined();
    expect(config.nsis.artifactName).toBeUndefined();
  });
  it('a configuration that already names the artifact is refused, not overwritten: a template in the yml cannot come back quietly', () => {
    const withTemplate = { ...yaml.load(YML), nsis: { oneClick: true, artifactName: 'Rotaris-${version}-windows-x64-setup.${ext}' } };
    expect(() => configurationWithNames(withTemplate, packagingArtifactNames('0.1.0'))).toThrow(/already sets nsis\.artifactName/);
    expect(() => namedConfigurationText(yaml.dump(withTemplate), packagingArtifactNames('0.1.0'), yaml)).toThrow(/REQ-STARTUP-031/);
  });
  it('the keep-prebuild variant is named the same way, and its files list is the variant\'s alone', async () => {
    const variant = YML.replace('better-sqlite3/{prebuilds,build,deps,src}/**', 'better-sqlite3/{build,deps,src}/**');
    expect(variant).not.toBe(YML);
    const config = await loaded(namedConfigurationText(variant, packagingArtifactNames('0.1.0a2'), yaml));
    expect(config.nsis.artifactName).toBe('Rotaris-0.1.0a2-windows-x64-setup.exe');
    expect(config.files[0].filter.some((f: string) => f.includes('better-sqlite3/{prebuilds'))).toBe(false);
  });
});
