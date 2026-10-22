import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_KEYS } from '@rotaris/release-naming';
import { PUBLISHED_PLATFORMS } from '../../../../tools/release-pipeline/assets.mjs';
import { dmgVolumeName, PREPARED_TARGETS, preparedConfiguration } from './platform-targets.mjs';

/**
 * The prepared macOS and Linux configuration (R-080; ADR-0054, "Linux and macOS configuration prepared"), read against
 * the requirements it answers — and held inert: nothing that builds reads it, and the hooks refuse both platforms (IC-3).
 */

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const yaml = require('js-yaml') as { load(text: string): Record<string, unknown> };
const base = yaml.load(readFileSync(join(APP, 'electron-builder.yml'), 'utf8'));
type Section = Record<string, unknown>;

describe('inert under IC-3 and PD-STARTUP-001', () => {
  it('prepares exactly the two platform keys the directive leaves out, and not windows-x64', () => {
    expect(Object.keys(PREPARED_TARGETS).sort()).toEqual(PLATFORM_KEYS.filter((k) => k !== 'windows-x64').sort());
    expect(() => preparedConfiguration(base, 'windows-x64', '0.1.0')).toThrow(/has no prepared configuration/);
  });

  it('nothing that builds imports it: `pnpm package` builds --win from electron-builder.yml alone', () => {
    const pkg = readFileSync(join(APP, 'scripts', 'package.mjs'), 'utf8');
    expect(pkg).not.toMatch(/platform-targets/);
    expect(pkg).toMatch(/'electron-builder', '--win'/);
    expect(base['mac']).toBeUndefined();
    expect(base['linux']).toBeUndefined();
  });

  it('the release builds and publishes windows-x64 alone: no matrix entry and no published key for either', () => {
    const workflow = yaml.load(readFileSync(join(APP, '..', '..', '.github', 'workflows', 'release.yml'), 'utf8'));
    const build = (workflow['jobs'] as Record<string, Section>)['build'] as Section;
    const include = ((build['strategy'] as Section)['matrix'] as Section)['include'] as Section[];
    expect(include.map((entry) => entry['platform'])).toEqual(['windows-x64']);
    expect(PUBLISHED_PLATFORMS).toEqual(['windows-x64']);
  });

  it('the hooks a prepared build would still run refuse both platforms before anything is rebuilt or packed', async () => {
    const hooks = require(join(APP, 'scripts', 'build-hooks.cjs')) as Record<'beforeBuild' | 'afterPack', (ctx: unknown) => Promise<unknown>>;
    for (const name of ['darwin', 'linux']) {
      await expect(hooks.beforeBuild({ electronPlatformName: name, arch: 'x64', appDir: APP, electronVersion: '44.1.1' })).rejects.toThrow(`IC-3: no ${name} artifact may be produced`);
      await expect(hooks.afterPack({ electronPlatformName: name, arch: 'x64', appOutDir: join(APP, 'release', 'never') })).rejects.toThrow(`IC-3: no ${name} artifact may be produced`);
    }
    for (const platform of Object.keys(PREPARED_TARGETS)) {
      const config = preparedConfiguration(base, platform, '0.1.0');
      expect(config['beforeBuild']).toBe('./scripts/build-hooks.cjs');
      expect(config['afterPack']).toBe('./scripts/build-hooks.cjs');
    }
  });
});

describe('macos-arm64 — REQ-STARTUP-014, REQ-STARTUP-022, REQ-STARTUP-023', () => {
  const config = preparedConfiguration(base, 'macos-arm64', '0.1.0rc1');
  const mac = config['mac'] as Section;
  const dmg = config['dmg'] as Section;

  it('a disk image, native ARM64 only, under the bundle identifier REQ-STARTUP-014 fixes', () => {
    expect(mac['target']).toEqual([{ target: 'dmg', arch: ['arm64'] }]);
    expect(mac['appId']).toBe('ai.rotaris.app');
  });

  it('no code signature and no notarization (REQ-STARTUP-023)', () => {
    expect(mac['identity']).toBeNull();
    expect(mac['notarize']).toBe(false);
  });

  it('compressed, with the /Applications link, its volume `Rotaris <version>` in the declared text', () => {
    expect(dmg['format']).toBe('UDZO');
    expect(dmg['contents']).toContainEqual({ x: 410, y: 220, type: 'link', path: '/Applications' });
    expect(dmg['title']).toBe('Rotaris 0.1.0rc1');
    expect(dmgVolumeName('0.1.0rc1')).toBe('Rotaris 0.1.0rc1');
  });

  it('named by the authority, as a literal in both keys', () => {
    expect(mac['artifactName']).toBe('Rotaris-0.1.0rc1-macos-arm64.dmg');
    expect(dmg['artifactName']).toBe('Rotaris-0.1.0rc1-macos-arm64.dmg');
  });
});

describe('linux-x86_64 — REQ-STARTUP-024, ESC-11', () => {
  const config = preparedConfiguration(base, 'linux-x86_64', '1.2.3');
  const linux = config['linux'] as Section;

  it('an x64 AppImage on the static runtime, pinned explicitly on the stable line (ESC-11 (b))', () => {
    expect(linux['target']).toEqual([{ target: 'AppImage', arch: ['x64'] }]);
    expect(config['toolsets']).toEqual({ appimage: '1.0.3' });
  });

  it('with the static runtime the tool writes no --no-sandbox into Exec; with its default it does (the reason for the pin)', () => {
    const source = readFileSync(require.resolve('app-builder-lib/out/targets/appimage/AppImageTarget.js'), 'utf8');
    expect(source).toMatch(/appimageTool == null \|\| appimageTool === "0\.0\.0" \? \["--no-sandbox"\] : \[\]/);
  });

  it('carries REQ-STARTUP-024\'s desktop entry, with no Exec of its own', () => {
    const entry = (linux['desktop'] as Section)['entry'] as Section;
    expect(entry).toEqual({ Type: 'Application', Name: 'Rotaris', Terminal: 'false', Categories: 'Development;IDE;', MimeType: 'inode/directory;' });
    expect(entry['Exec']).toBeUndefined();
  });

  it('named by the authority, as a literal in both keys', () => {
    expect(linux['artifactName']).toBe('Rotaris-1.2.3-linux-x86_64.AppImage');
    expect((config['appImage'] as Section)['artifactName']).toBe('Rotaris-1.2.3-linux-x86_64.AppImage');
  });

  it('pins its runner to the oldest supported base (REQ-STARTUP-025), not to a moving label', () => {
    expect(PREPARED_TARGETS['linux-x86_64'].runner).toBe('ubuntu-24.04');
    expect(PREPARED_TARGETS['macos-arm64'].runner).not.toMatch(/latest/);
  });
});

describe('electron-builder\'s own schema', () => {
  it('accepts both prepared configurations, and refuses a key it does not know', async () => {
    const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js') as { validateConfiguration(config: unknown, logger: unknown): Promise<void> };
    const { DebugLogger } = require('builder-util') as { DebugLogger: new (enabled: boolean) => unknown };
    for (const platform of Object.keys(PREPARED_TARGETS)) {
      await expect(validateConfiguration(preparedConfiguration(base, platform, '0.1.0rc1'), new DebugLogger(false))).resolves.toBeUndefined();
    }
    await expect(validateConfiguration({ ...base, mac: { bogus: 1 } }, new DebugLogger(false))).rejects.toThrow(/does not match the API schema/);
  });
});

describe('the merge', () => {
  it('leaves electron-builder.yml\'s Windows configuration, files and resources as they are', () => {
    const config = preparedConfiguration(base, 'linux-x86_64', '0.1.0');
    for (const key of ['appId', 'productName', 'files', 'asarUnpack', 'extraResources', 'win', 'nsis', 'publish', 'npmRebuild', 'buildDependenciesFromSource']) {
      expect(config[key]).toEqual(base[key]);
    }
  });

  it('refuses a name composed outside the authority, and a version outside the grammar', () => {
    expect(() => preparedConfiguration({ ...base, linux: { artifactName: '${productName}-${version}.AppImage' } }, 'linux-x86_64', '0.1.0')).toThrow(/already sets linux\.artifactName/);
    expect(() => preparedConfiguration(base, 'macos-arm64', '0.1.0-rc1')).toThrow(/not a supported product version/);
  });
});
