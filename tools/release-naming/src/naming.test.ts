import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artifactName, parseReleaseTag, releaseArtifacts, UnknownArtifactKindError } from './index.js';

const APP = resolve(import.meta.dirname, '..', '..', '..', 'apps', 'desktop');

describe('release naming — REQ-STARTUP-031', () => {
  it('produces the four exact shapes', () => {
    expect(artifactName('1.2.3', 'setup')).toBe('Rotaris-1.2.3-windows-x64-setup.exe');
    expect(artifactName('1.2.3', 'portable')).toBe('Rotaris-1.2.3-windows-x64-portable.exe');
    expect(artifactName('1.2.3', 'dmg')).toBe('Rotaris-1.2.3-macos-arm64.dmg');
    expect(artifactName('1.2.3', 'appimage')).toBe('Rotaris-1.2.3-linux-x86_64.AppImage');
  });
  it('an unknown kind errors listing the known kinds', () => {
    expect(() => artifactName('1.0.0', 'console')).toThrow(UnknownArtifactKindError);
    expect(() => artifactName('1.0.0', 'console')).toThrow(/setup, portable, dmg, appimage/);
  });
  it('REQ-STARTUP-030: the matrix is exactly three platforms and four artifacts, with no console kind', () => {
    const all = releaseArtifacts('0.1.0');
    expect(all.map((a) => a.name)).toEqual([
      'Rotaris-0.1.0-windows-x64-setup.exe',
      'Rotaris-0.1.0-windows-x64-portable.exe',
      'Rotaris-0.1.0-macos-arm64.dmg',
      'Rotaris-0.1.0-linux-x86_64.AppImage',
    ]);
  });
});

describe('loaded the way the packaging hook loads it — REQ-STARTUP-031 at afterPack', () => {
  /**
   * `build-hooks.cjs`'s `checkNaming` imports `src/index.ts` with plain Node — no bundler, no loader — and a failure
   * there refuses the installer build. Vitest's own resolution would hide a module Node cannot load, so the check runs
   * in a child `node`, through the hook's own export, exactly as `afterPack` calls it: the DECLARED version and the names
   * electron-builder is configured to produce (`build-hooks.test.ts` covers the rule itself).
   */
  const script = `require(${JSON.stringify(join(APP, 'scripts', 'build-hooks.cjs'))}).checkNaming(process.argv[1], [process.argv[2]]).then((r) => process.stdout.write(r.expected), (e) => { process.stderr.write(String(e && e.stack || e)); process.exit(1); })`;
  it('the hook\'s naming check answers the setup name from this module, for a stable and a prerelease version', () => {
    for (const version of ['0.1.0', parseReleaseTag('v0.1.0rc1').version]) {
      const r = spawnSync(process.execPath, ['-e', script, version, artifactName(version, 'setup')], { cwd: APP, encoding: 'utf8', timeout: 60_000 });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toBe(artifactName(version, 'setup'));
    }
  });
  it('and refuses, through the same load, the hyphenated name electron-builder\'s own macro renders for a prerelease', () => {
    const r = spawnSync(process.execPath, ['-e', script, '0.1.0rc1', 'Rotaris-0.1.0-rc1-windows-x64-setup.exe'], { cwd: APP, encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REQ-STARTUP-031/);
  });
});
