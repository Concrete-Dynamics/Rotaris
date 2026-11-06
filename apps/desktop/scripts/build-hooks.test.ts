/**
 * The packaging hooks' naming rule (REQ-STARTUP-031, REQ-STARTUP-158): `checkNaming` at afterPack over what electron-builder
 * is configured to produce, `artifactBuildCompleted` over what it did produce — both against the DECLARED version, never
 * electron-builder's normalised `appInfo.version` (`docs/archive/defects/a-prerelease-version-reaches-the-installer-hyphenated.md`).
 * The rendering of a configured pattern is electron-builder's own macro expander over the app-info shape it would hold for
 * a prerelease, so the defect's exact scenario — a `${version}` template — is what the hyphenated case refuses. No artifact
 * is built (IC-3); the native-module rules beside these need one and are measured by `pnpm package` on Windows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
 * OQ-400, ruled 2026-10-15 under R-072 (`docs/archive/defects/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`):
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

/**
 * R-091 — the fuses (Electron security checklist 19; ADR-0054, ADR-0056 rule 4). electron-builder flips them from
 * electron-builder.yml's `electronFuses` after afterPack; `artifactBuildStarted` reads them back from the packed binary and
 * refuses the build when any differs from `FUSES`. These hold the list, the yml and the comparison together; the binary's
 * own wire is read by `pnpm package` on Windows (`docs/architecture/first-executions.md`).
 */
describe('the fuses — flipped at package time and read back (R-091, checklist 19)', () => {
  const fuses = appRequire('./scripts/build-hooks.cjs') as {
    FUSES: readonly { index: number; name: string; expected: boolean; flipped: boolean }[];
    fuseConfiguration: () => Record<string, boolean>;
    fuseProblems: (wire: unknown) => string[];
    checkFuses: (exe: string, read?: (exe: string) => Promise<unknown>) => Promise<{ exe: string; wire: Record<string, string> }>;
    unpackedDirFor: (arch: unknown) => string;
    artifactBuildStarted: (ctx: { file: string; arch: unknown; targetPresentableName: string }) => Promise<void>;
  };
  const yaml = abl('js-yaml') as { load: (text: string) => Record<string, unknown> };
  const ON = 49;
  const OFF = 48;
  /** The wire the list asks for, as @electron/fuses' `getCurrentFuseWire` returns it, with Electron 44.3.0's ninth fuse. */
  const asked = (): Record<string, unknown> => ({ version: '1', 0: OFF, 1: ON, 2: OFF, 3: OFF, 4: ON, 5: ON, 6: OFF, 7: ON, 8: ON });
  /** Electron 44.3.0's own wire, as `node_modules/electron/dist/electron.exe` read on 2026-11-02. */
  const unflipped = (): Record<string, unknown> => ({ version: '1', 0: ON, 1: OFF, 2: ON, 3: ON, 4: OFF, 5: OFF, 6: OFF, 7: ON, 8: ON });

  it('flips the six the checklist names, and leaves the file protocol and the V8 snapshot as Electron ships them (OQ-466)', () => {
    expect(fuses.fuseConfiguration()).toEqual({
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableCookieEncryption: true,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    });
    expect(fuses.FUSES.filter((f) => !f.flipped)).toEqual([
      { index: 6, name: 'loadBrowserProcessSpecificV8Snapshot', expected: false, flipped: false },
      { index: 7, name: 'grantFileProtocolExtraPrivileges', expected: true, flipped: false },
    ]);
  });
  it('electron-builder.yml flips exactly that map, over an asar, and names the hook that reads it back', () => {
    const config = yaml.load(readFileSync(join(APP, 'electron-builder.yml'), 'utf8'));
    expect(config['electronFuses']).toEqual(fuses.fuseConfiguration());
    expect(config['asar']).toBe(true);
    expect(config['artifactBuildStarted']).toBe('./scripts/build-hooks.cjs');
  });
  it('reads a wire flipped as listed as no problem, whatever lies past the list', () => {
    expect(fuses.fuseProblems(asked())).toEqual([]);
    expect(fuses.fuseProblems({ ...asked(), 8: OFF, 9: 114 })).toEqual([]);
  });
  it('refuses the unflipped binary fuse by fuse, saying what each reads and what was asked', () => {
    expect(fuses.fuseProblems(unflipped())).toEqual([
      'runAsNode reads on, flipped off',
      'enableCookieEncryption reads off, flipped on',
      'enableNodeOptionsEnvironmentVariable reads on, flipped off',
      'enableNodeCliInspectArguments reads on, flipped off',
      'enableEmbeddedAsarIntegrityValidation reads off, flipped on',
      'onlyLoadAppFromAsar reads off, flipped on',
    ]);
  });
  it('refuses one fuse out of place, a fuse left alone that moved, and a removed or absent one', () => {
    expect(fuses.fuseProblems({ ...asked(), 0: ON })).toEqual(['runAsNode reads on, flipped off']);
    expect(fuses.fuseProblems({ ...asked(), 7: OFF })).toEqual(['grantFileProtocolExtraPrivileges reads off, left on']);
    expect(fuses.fuseProblems({ ...asked(), 5: 114 })).toEqual(['onlyLoadAppFromAsar reads removed, flipped on']);
    const short = asked();
    delete short[6];
    expect(fuses.fuseProblems(short)).toEqual(['loadBrowserProcessSpecificV8Snapshot reads absent, left off']);
  });
  it('refuses a wire of another version, and no wire at all', () => {
    expect(fuses.fuseProblems({ ...asked(), version: '2' })).toEqual(['the fuse wire is version 2, not the 1 this list is written for']);
    expect(fuses.fuseProblems(null)).toEqual(['the binary carries no fuse wire']);
  });
  it('checkFuses answers the wire by name, and refuses with the binary named', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-fuses-'));
    try {
      const exe = join(dir, 'Rotaris.exe');
      writeFileSync(exe, 'stand-in');
      await expect(fuses.checkFuses(exe, () => Promise.resolve(asked()))).resolves.toEqual({ exe, wire: {
        version: '1', runAsNode: 'off', enableCookieEncryption: 'on', enableNodeOptionsEnvironmentVariable: 'off', enableNodeCliInspectArguments: 'off',
        enableEmbeddedAsarIntegrityValidation: 'on', onlyLoadAppFromAsar: 'on', loadBrowserProcessSpecificV8Snapshot: 'off', grantFileProtocolExtraPrivileges: 'on', 'fuse 8': 'on',
      } });
      await expect(fuses.checkFuses(exe, () => Promise.resolve(unflipped()))).rejects.toThrow(/^fuses: .*Rotaris\.exe — runAsNode reads on, flipped off; .*electronFuses/);
      await expect(fuses.checkFuses(join(dir, 'absent.exe'), () => Promise.resolve(asked()))).rejects.toThrow(/no packed executable/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('artifactBuildStarted reads the packed tree beside the installer it is about to make, and refuses one with no fuse wire', async () => {
    expect(fuses.unpackedDirFor('x64')).toBe('win-unpacked');
    expect(fuses.unpackedDirFor(1)).toBe('win-unpacked');
    expect(fuses.unpackedDirFor('arm64')).toBe('win-arm64-unpacked');
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-fuses-'));
    try {
      mkdirSync(join(dir, 'win-unpacked'));
      // The real reader over a file that is no Electron binary: no fuse wire, so the build is refused.
      writeFileSync(join(dir, 'win-unpacked', 'Rotaris.exe'), 'no sentinel here');
      await expect(fuses.artifactBuildStarted({ file: join(dir, 'Rotaris-0.1.0rc1-windows-x64-setup.exe'), arch: 1, targetPresentableName: 'nsis' })).rejects.toThrow();
      await expect(fuses.artifactBuildStarted({ file: join(dir, 'elsewhere', 'Rotaris-0.1.0rc1-windows-x64-setup.exe'), arch: 1, targetPresentableName: 'nsis' })).rejects.toThrow(/no packed executable/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('nothing the application runs needs RunAsNode (R-091, checklist 19)', () => {
  it('no source under apps/desktop/src or packages/*/src sets ELECTRON_RUN_AS_NODE for a process it starts', () => {
    const repo = join(APP, '..', '..');
    const roots = [join(APP, 'src'), ...readdirSync(join(repo, 'packages')).map((p) => join(repo, 'packages', p, 'src'))].filter((r) => existsSync(r));
    const files = roots.flatMap((root) => readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(f) && !/\.test\./.test(f)).map((f) => join(root, f)));
    expect(files.length).toBeGreaterThan(200);
    // Setting it: as a property of an environment object, or assigned. Reading it and deleting it start nothing.
    const sets = /ELECTRON_RUN_AS_NODE['"]?\s*[:=](?!=)|\[\s*['"]ELECTRON_RUN_AS_NODE['"]\s*\]\s*=(?!=)/;
    expect(files.filter((f) => sets.test(readFileSync(f, 'utf8')))).toEqual([]);
    // The one reader, main's sentinel, reads it to find its token and deletes it from the interpreter's environment.
    const readers = files.filter((f) => readFileSync(f, 'utf8').includes('ELECTRON_RUN_AS_NODE')).map((f) => f.slice(repo.length + 1).replace(/\\/g, '/'));
    expect(readers).toEqual(['apps/desktop/src/main/sentinel.ts']);
  });
});

/** ADR-0066 wiring evidence only: synthetic headers and loader reports, never an AppImage build. */
describe('Linux hook wiring — REQ-STARTUP-024/025', () => {
  const linux = appRequire('./scripts/build-hooks.cjs') as {
    platformOf: (ctx: unknown) => string;
    afterPack: (ctx: unknown) => Promise<void>;
    configuredArtifactNames: (ctx: unknown) => string[];
    checkNaming: (declared: string, names: string[], platform: string) => Promise<unknown>;
    artifactBuildCompleted: (ctx: unknown) => Promise<void>;
    artifactBuildStarted: (ctx: unknown) => Promise<void>;
    elfArchOf: (bytes: Buffer) => { machine: number; arch: string };
    checkRuntime: (dir: string, arch: string, spawn: (cmd: string, args: string[]) => ReturnType<typeof answering>, platform: string) => { python: string; machine: string };
    BINDINGS: { name: string; built: Record<string, string[]> }[];
    checkRule4: (probe: unknown, bindings: unknown[], root: string, marker: unknown) => unknown;
  };
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const elf = (machine = 0x3e) => {
    const bytes = Buffer.alloc(64);
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
    bytes.writeUInt16LE(machine, 18);
    return bytes;
  };
  const runtime = (bytes: Buffer, targetArch = 'x64') => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-linux-hooks-'));
    dirs.push(dir);
    const root = join(dir, 'resources', 'code-intelligence');
    mkdirSync(join(root, 'runtime', 'bin'), { recursive: true });
    writeFileSync(join(root, 'runtime', 'bin', 'python3'), bytes);
    writeFileSync(join(root, 'bundle.json'), JSON.stringify({ ...PINS, targetArch }));
    return dir;
  };
  it('accepts linux at the platform guard and afterPack proceeds to artifact checks, while darwin keeps its exact refusal', async () => {
    expect(linux.platformOf({ electronPlatformName: 'linux' })).toBe('linux');
    expect(linux.platformOf({ platform: { nodeName: 'linux' } })).toBe('linux');
    const refusal = 'IC-3: no darwin artifact may be produced until the build hosts exist (implementation-conditions.md)';
    expect(() => linux.platformOf({ electronPlatformName: 'darwin' })).toThrow(refusal);
    await expect(linux.afterPack({ electronPlatformName: 'darwin' })).rejects.toThrow(refusal);
    // No rebuild marker is created by these tests: entering afterPack reaches the marker, not IC-3.
    await expect(linux.afterPack({ electronPlatformName: 'linux', arch: 'x64' })).rejects.not.toThrow(/IC-3/);
    expect(linux.BINDINGS.map((binding) => [binding.name, binding.built['linux']])).toEqual([
      ['better-sqlite3', ['build/Release/better_sqlite3.node']], ['node-pty', ['build/Release/pty.node']],
    ]);
  });
  it('reads Linux naming keys, accepts the AppImage and refuses other names and blockmaps', async () => {
    const name = artifactName('0.1.0rc1', 'appimage');
    const ctx = { ...ctxFor({ linux: { artifactName: name }, appImage: { artifactName: name }, win: { artifactName: 'ignored.exe' } }, '0.1.0-rc1'), electronPlatformName: 'linux' };
    expect(linux.configuredArtifactNames(ctx)).toEqual([name, name]);
    await expect(linux.checkNaming('0.1.0rc1', [name, name], 'linux')).resolves.toMatchObject({ expected: name });
    await expect(linux.checkNaming('0.1.0rc1', ['other.AppImage'], 'linux')).rejects.toThrow(/REQ-STARTUP-031/);
    const declared = (appRequire('./package.json') as { version: string }).version;
    const produced = artifactName(declared, 'appimage');
    const context = (file: string) => ({ file, packager: { platform: { nodeName: 'linux' } } });
    await expect(linux.artifactBuildCompleted(context(produced))).resolves.toBeUndefined();
    for (const file of ['other.AppImage', produced.toLowerCase(), `${produced}.blockmap`]) {
      await expect(linux.artifactBuildCompleted(context(file))).rejects.toThrow(/REQ-STARTUP-031/);
    }
  });
  it('reads ELF machines and rejects malformed or truncated headers before reading e_machine', () => {
    expect(linux.elfArchOf(elf())).toEqual({ machine: 0x3e, arch: 'x64' });
    expect(linux.elfArchOf(elf(0xb7))).toEqual({ machine: 0xb7, arch: 'arm64' });
    for (const bytes of [Buffer.from('MZ'), Buffer.alloc(64), elf().subarray(0, 19), elf().subarray(0, 63)]) {
      expect(() => linux.elfArchOf(bytes)).toThrow(/ELF|truncated/);
    }
    const wrongEndian = elf(); wrongEndian[5] = 2;
    expect(() => linux.elfArchOf(wrongEndian)).toThrow(/malformed/);
  });
  it('reads runtime/bin/python3 and checks machine and marker before spawning, preserving isolation and version checks', () => {
    const dir = runtime(elf());
    const asked: string[] = [];
    expect(linux.checkRuntime(dir, 'x64', (cmd, args) => {
      asked.push(cmd); expect(args[0]).toBe('-I'); return answering();
    }, 'linux')).toMatchObject({ machine: 'x64', python: join(dir, 'resources', 'code-intelligence', 'runtime', 'bin', 'python3') });
    expect(asked).toHaveLength(1);
    const noSpawn = () => { throw new Error('must not spawn'); };
    expect(() => linux.checkRuntime(runtime(elf(0xb7)), 'x64', noSpawn, 'linux')).toThrow(/built for arm64, the artifact for x64/);
    expect(() => linux.checkRuntime(runtime(elf(), 'arm64'), 'x64', noSpawn, 'linux')).toThrow(/bundle.json says the bundle was built for arm64/);
    expect(() => linux.checkRuntime(runtime(Buffer.from('bad')), 'x64', noSpawn, 'linux')).toThrow(/not an ELF image/);
    expect(() => linux.checkRuntime(dir, 'x64', () => ({ ...answering(), stdout: JSON.stringify({ python: 'wrong', version: PINS.version }) }), 'linux')).toThrow(/pin is/);
  });
  it('uses the real artifact-start event shape for Linux fuse readback', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rotaris-linux-fuses-')); dirs.push(dir);
    await expect(linux.artifactBuildStarted({ file: join(dir, 'test.AppImage'), arch: 1, targetPresentableName: 'AppImage' })).rejects.toThrow(`fuses: no packed executable at ${join(dir, 'linux-unpacked', 'rotaris')}`);
  });
  it('keeps Linux paths case-sensitive and checks containment at a directory boundary', () => {
    const root = '/artifact/resources/app.asar.unpacked/node_modules';
    const file = `${root}/node-pty/build/Release/pty.node`;
    const probe = (opened: string) => ({ status: 0, report: { ok: true, versions: { electron: '44' }, dlopen: [opened] } });
    const bindings = (packaged: string) => [{ name: 'node-pty', files: [{ packaged }] }];
    const marker = { platform: 'linux', electronVersion: '44' };
    expect(() => linux.checkRule4(probe(file), bindings(file), root, marker)).not.toThrow();
    expect(() => linux.checkRule4(probe(file.toUpperCase()), bindings(file), root, marker)).toThrow(/not the compiled binary/);
    const sibling = `${root}-other/pty.node`;
    expect(() => linux.checkRule4(probe(sibling), bindings(sibling), root, marker)).toThrow(/outside/);
    const win = 'C:\\artifact\\resources\\app.asar.unpacked\\node_modules';
    const winFile = `${win}\\node-pty\\build\\Release\\pty.node`;
    expect(() => linux.checkRule4(probe(`\\\\?\\${winFile.toUpperCase()}`), bindings(winFile), win, { platform: 'win32', electronVersion: '44' })).not.toThrow();
  });
});
