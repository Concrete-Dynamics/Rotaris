/**
 * The packaging hooks' naming rule (REQ-STARTUP-031, REQ-STARTUP-158): `checkNaming` at afterPack over what electron-builder
 * is configured to produce, `artifactBuildCompleted` over what it did produce — both against the DECLARED version, never
 * electron-builder's normalised `appInfo.version` (`docs/defects/fixed/a-prerelease-version-reaches-the-installer-hyphenated.md`).
 * The rendering of a configured pattern is electron-builder's own macro expander over the app-info shape it would hold for
 * a prerelease, so the defect's exact scenario — a `${version}` template — is what the hyphenated case refuses. No artifact
 * is built (IC-3); the native-module rules beside these need one and are measured by `pnpm package` on Windows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactName } from '../../../tools/release-naming/src/index.js';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const appRequire = createRequire(join(APP, 'package.json'));
const hooks = appRequire('./scripts/build-hooks.cjs') as {
  checkNaming: (declared: string, rendered: string[]) => Promise<{ declared: string; expected: string; rendered: string[] }>;
  configuredArtifactNames: (ctx: unknown) => string[];
  artifactBuildCompleted: (ctx: { file: string }) => Promise<void>;
  peArchOf: (bytes: Buffer) => { machine: number; arch: string };
  checkRuntime: (appOutDir: string, arch: string, spawn?: (cmd: string, args: string[], opts: unknown) => { status: number | null; stdout: string; stderr: string }) => { python: string; machine: string; answers: { python: string; version: string } };
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

/**
 * OQ-400, ruled 2026-10-15 under R-072 (`docs/defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`):
 * the "runtime" rule reads the packaged `python.exe`'s PE machine field before it spawns the interpreter, and refuses one built
 * for another architecture than the artifact's, and a marker whose `targetArch` is not the artifact's. An arm64 interpreter
 * answers its versions correctly on an ARM64 host, so before the guard every check passed there. The fixtures are PE headers
 * only: the `MZ` stub with `e_lfanew` at 0x3C, the `PE\0\0` signature, then the machine (0x8664 x64, 0xAA64 arm64).
 */
const PINS = JSON.parse(readFileSync(join(APP, 'scripts', 'code-intelligence', 'pins.json'), 'utf8')) as { python: string; distribution: string; version: string };
const peHeader = (machine: number, lfanew = 0x80): Buffer => {
  const b = Buffer.alloc(lfanew + 24);
  b.write('MZ', 0, 'latin1');
  b.writeUInt32LE(lfanew, 0x3c);
  b.write('PE\0\0', lfanew, 'latin1');
  b.writeUInt16LE(machine, lfanew + 4);
  return b;
};
const X64 = 0x8664;
const ARM64 = 0xaa64;
const answering = () => ({ status: 0, stdout: JSON.stringify({ python: PINS.python, version: PINS.version, distribution: PINS.distribution }), stderr: '' });

describe('peArchOf — the machine a PE image is built for, read from its bytes', () => {
  it('reads x64 and arm64 from their machine field, wherever e_lfanew points', () => {
    expect(hooks.peArchOf(peHeader(X64))).toEqual({ machine: X64, arch: 'x64' });
    expect(hooks.peArchOf(peHeader(ARM64, 0xf8))).toEqual({ machine: ARM64, arch: 'arm64' });
    expect(hooks.peArchOf(peHeader(0x14c)).arch).toBe('ia32');
    expect(hooks.peArchOf(peHeader(0x1c4)).arch).toBe('machine 0x01c4');
  });
  it('refuses a file with no MZ stub, one cut short before its header, and one with no PE signature', () => {
    expect(() => hooks.peArchOf(Buffer.from('#!/bin/sh\nexec python3 "$@"\n'))).toThrow(/not a PE image/);
    expect(() => hooks.peArchOf(peHeader(X64).subarray(0, 0x84))).toThrow(/truncated/);
    expect(() => hooks.peArchOf(Buffer.from('MZ'))).toThrow(/truncated|not a PE image/);
    const noSig = peHeader(X64);
    noSig.write('NE', 0x80, 'latin1');
    expect(() => hooks.peArchOf(noSig)).toThrow(/no "PE\\0\\0" signature/);
  });
});

describe('checkRuntime — the packaged interpreter is built for the artifact\'s architecture (OQ-400)', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  /** An appOutDir holding `resources/code-intelligence/runtime/python.exe` and its `bundle.json`. */
  const appOut = (exe: Buffer, marker: Record<string, unknown>): string => {
    const d = mkdtempSync(join(tmpdir(), 'rotaris-build-hooks-'));
    dirs.push(d);
    const root = join(d, 'resources', 'code-intelligence');
    mkdirSync(join(root, 'runtime'), { recursive: true });
    writeFileSync(join(root, 'runtime', 'python.exe'), exe);
    writeFileSync(join(root, 'bundle.json'), JSON.stringify({ python: PINS.python, distribution: PINS.distribution, version: PINS.version, ...marker }));
    return d;
  };

  it('accepts an x64 interpreter for an x64 artifact, and then asks it for its versions', () => {
    const asked: string[] = [];
    const got = hooks.checkRuntime(appOut(peHeader(X64), { targetArch: 'x64' }), 'x64', (cmd) => { asked.push(cmd); return answering(); });
    expect(got).toMatchObject({ machine: 'x64', answers: { python: PINS.python, version: PINS.version } });
    expect(asked).toHaveLength(1);
  });
  it('refuses an arm64 interpreter for an x64 artifact before it is spawned, the marker saying x64 or not', () => {
    const spawn = () => { throw new Error('spawned an interpreter the guard should have refused'); };
    expect(() => hooks.checkRuntime(appOut(peHeader(ARM64), { targetArch: 'x64' }), 'x64', spawn)).toThrow('runtime: the packaged interpreter is built for arm64, the artifact for x64');
    expect(() => hooks.checkRuntime(appOut(peHeader(ARM64), {}), 'x64', spawn)).toThrow(/built for arm64, the artifact for x64/);
  });
  it('refuses a runtime/python.exe that is no PE image, or is cut short', () => {
    const spawn = () => { throw new Error('spawned'); };
    expect(() => hooks.checkRuntime(appOut(Buffer.from('#!/bin/sh\n'), { targetArch: 'x64' }), 'x64', spawn)).toThrow(/runtime: .*python\.exe is no interpreter this artifact can run: not a PE image/);
    expect(() => hooks.checkRuntime(appOut(peHeader(X64).subarray(0, 0x82), { targetArch: 'x64' }), 'x64', spawn)).toThrow(/truncated/);
  });
  it('refuses a marker built for another architecture, or recording none, over an x64 interpreter', () => {
    const spawn = () => { throw new Error('spawned'); };
    expect(() => hooks.checkRuntime(appOut(peHeader(X64), { targetArch: 'arm64' }), 'x64', spawn)).toThrow('runtime: bundle.json says the bundle was built for arm64, the artifact is x64');
    expect(() => hooks.checkRuntime(appOut(peHeader(X64), {}), 'x64', spawn)).toThrow(/built for no recorded architecture, the artifact is x64.*--target=win32-x64/);
  });
});
