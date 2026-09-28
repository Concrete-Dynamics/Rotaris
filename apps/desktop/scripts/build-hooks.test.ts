/**
 * The packaging hooks' naming rule (REQ-STARTUP-031, REQ-STARTUP-158): `checkNaming` at afterPack over what electron-builder
 * is configured to produce, `artifactBuildCompleted` over what it did produce — both against the DECLARED version, never
 * electron-builder's normalised `appInfo.version` (`docs/defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`).
 * The rendering of a configured pattern is electron-builder's own macro expander over the app-info shape it would hold for
 * a prerelease, so the defect's exact scenario — a `${version}` template — is what the hyphenated case refuses. No artifact
 * is built (IC-3); the native-module rules beside these need one and are measured by `pnpm package` on Windows.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactName } from '../../../tools/release-naming/src/index.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRequire = createRequire(join(APP, 'package.json'));
const hooks = appRequire('./scripts/build-hooks.cjs') as {
  checkNaming: (declared: string, rendered: string[]) => Promise<{ declared: string; expected: string; rendered: string[] }>;
  configuredArtifactNames: (ctx: unknown) => string[];
  artifactBuildCompleted: (ctx: { file: string }) => Promise<void>;
};
const abl = createRequire(appRequire.resolve('app-builder-lib/package.json'));
const { expandMacro } = abl('app-builder-lib/out/util/macroExpander.js') as { expandMacro: (pattern: string, arch: string | null, appInfo: unknown, extra?: Record<string, string>) => string };

/** A packager as afterPack's context holds it, with electron-builder's own expander over the version it normalised. */
const ctxFor = (config: Record<string, unknown>, normalisedVersion: string) => ({
  packager: {
    config,
    appInfo: { version: normalisedVersion },
    expandMacro: (pattern: string, arch: string, extra: Record<string, string>) => expandMacro(pattern, arch, { version: normalisedVersion, productName: 'Rotaris', sanitizedProductName: 'Rotaris' }, extra),
  },
});
const DECLARED = 'Rotaris-0.1.0rc1-windows-x64-setup.exe';

describe('checkNaming — the configuration against the declared version', () => {
  it('passes the declared name on both keys, and reports the expected name', async () => {
    await expect(hooks.checkNaming('0.1.0rc1', [DECLARED, DECLARED])).resolves.toEqual({ declared: '0.1.0rc1', expected: DECLARED, rendered: [DECLARED, DECLARED] });
    await expect(hooks.checkNaming('0.1.0', ['Rotaris-0.1.0-windows-x64-setup.exe'])).resolves.toMatchObject({ expected: 'Rotaris-0.1.0-windows-x64-setup.exe' });
  });
  it('refuses a hyphenated name, saying the version reached electron-builder normalised', async () => {
    await expect(hooks.checkNaming('0.1.0rc1', ['Rotaris-0.1.0-rc1-windows-x64-setup.exe'])).rejects.toThrow(/configured to produce "Rotaris-0\.1\.0-rc1-windows-x64-setup\.exe", the naming module renders "Rotaris-0\.1\.0rc1-windows-x64-setup\.exe".*hyphenated/);
  });
  it('refuses one wrong key among right ones, and a configuration with no name at all', async () => {
    await expect(hooks.checkNaming('0.1.0rc1', [DECLARED, 'Rotaris-0.1.0-rc1-windows-x64-setup.exe'])).rejects.toThrow(/REQ-STARTUP-031/);
    await expect(hooks.checkNaming('0.1.0rc1', [])).rejects.toThrow(/no artifactName is configured.*pnpm package/);
  });
  it('a declared version outside the grammar renders no name to compare against', async () => {
    await expect(hooks.checkNaming('0.1.0-rc1', ['Rotaris-0.1.0-rc1-windows-x64-setup.exe'])).rejects.toThrow(/not a supported product version/);
  });
});

describe('configuredArtifactNames — what electron-builder would produce from the configuration it runs with', () => {
  it('the defect as it stood: a ${version} template renders the normalised version, and the check refuses it', async () => {
    const template = 'Rotaris-${version}-windows-x64-setup.${ext}';
    const rendered = hooks.configuredArtifactNames(ctxFor({ win: { artifactName: template }, nsis: { artifactName: template } }, '0.1.0-rc1'));
    expect(rendered).toEqual(['Rotaris-0.1.0-rc1-windows-x64-setup.exe', 'Rotaris-0.1.0-rc1-windows-x64-setup.exe']);
    await expect(hooks.checkNaming('0.1.0rc1', rendered)).rejects.toThrow(/hyphenated/);
  });
  it('the repair: the literal names package.mjs passes survive the expander and pass the check', async () => {
    const rendered = hooks.configuredArtifactNames(ctxFor({ win: { artifactName: DECLARED }, nsis: { artifactName: DECLARED } }, '0.1.0-rc1'));
    expect(rendered).toEqual([DECLARED, DECLARED]);
    await expect(hooks.checkNaming('0.1.0rc1', rendered)).resolves.toMatchObject({ expected: DECLARED });
  });
  it('a stable version is the same either way, which is why v0.1.0 never showed the defect', async () => {
    const template = 'Rotaris-${version}-windows-x64-setup.${ext}';
    const rendered = hooks.configuredArtifactNames(ctxFor({ win: { artifactName: template } }, '0.1.0'));
    expect(rendered).toEqual([artifactName('0.1.0', 'setup')]);
    await expect(hooks.checkNaming('0.1.0', rendered)).resolves.toMatchObject({ expected: artifactName('0.1.0', 'setup') });
  });
  it('no configured name is an empty list, and only string names count', () => {
    expect(hooks.configuredArtifactNames(ctxFor({}, '0.1.0'))).toEqual([]);
    expect(hooks.configuredArtifactNames(ctxFor({ win: { artifactName: '' }, nsis: {} }, '0.1.0'))).toEqual([]);
  });
});

describe('artifactBuildCompleted — the produced file against this tree\'s declared version', () => {
  const declared = (appRequire('./package.json') as { version: string }).version;
  it('accepts the installer by the declared name and its block map', async () => {
    await expect(hooks.artifactBuildCompleted({ file: join(APP, 'release', artifactName(declared, 'setup')) })).resolves.toBeUndefined();
    await expect(hooks.artifactBuildCompleted({ file: join(APP, 'release', `${artifactName(declared, 'setup')}.blockmap`) })).resolves.toBeUndefined();
  });
  it('refuses a file by any other name — the hyphenated prerelease and electron-builder\'s own pattern', async () => {
    await expect(hooks.artifactBuildCompleted({ file: join(APP, 'release', `Rotaris-${declared}-rc1-windows-x64-setup.exe`) })).rejects.toThrow(/REQ-STARTUP-031: electron-builder produced/);
    await expect(hooks.artifactBuildCompleted({ file: join(APP, 'release', `Rotaris Setup ${declared}.exe`) })).rejects.toThrow(/REQ-STARTUP-031/);
  });
});
