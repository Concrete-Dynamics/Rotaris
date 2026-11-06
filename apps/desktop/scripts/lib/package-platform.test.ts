import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packagePlatform, packageConfigurationText, inapplicablePackageSteps } from './package-platform.mjs';
import { closingLines } from './package-verdict.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const yaml = require(require.resolve('js-yaml', { paths: [dirname(require.resolve('app-builder-lib/package.json'))] })) as {
  load: (text: string) => Record<string, { artifactName?: string; desktop: { entry: Record<string, string> } }>;
  dump: (value: unknown, options: unknown) => string;
};
const base = readFileSync(join(APP, 'electron-builder.yml'), 'utf8');

describe('ADR-0066; REQ-STARTUP-024/025 host selection and configuration', () => {
  it('keeps the Windows builder, target and declared names', () => {
    const host = packagePlatform('win32', 'x64');
    expect(host).toMatchObject({ key: 'windows-x64', builderFlag: '--win', bundleTarget: '--target=win32-x64' });
    const config = yaml.load(packageConfigurationText(host, base, '0.1.0rc1', yaml));
    expect(config['win']?.artifactName).toBe('Rotaris-0.1.0rc1-windows-x64-setup.exe');
    expect(config['nsis']?.artifactName).toBe(config['win']?.artifactName);
    expect(config['linux']).toBeUndefined();
  });
  it('renders the real YAML into the Linux AppImage configuration and desktop entry', () => {
    const host = packagePlatform('linux', 'x64');
    expect(host).toMatchObject({ key: 'linux-x86_64', builderFlag: '--linux', bundleTarget: '--target=linux-x64', configuration: 'electron-builder.package.linux.yml', unpacked: 'linux-unpacked', executable: 'rotaris' });
    const config = yaml.load(packageConfigurationText(host, base, '0.1.0rc1', yaml));
    expect(config['linux']?.artifactName).toBe('Rotaris-0.1.0rc1-linux-x86_64.AppImage');
    expect(config['appImage']?.artifactName).toBe(config['linux']?.artifactName);
    expect(config['linux']?.desktop.entry).toEqual({ Type: 'Application', Name: 'Rotaris', Terminal: 'false', Categories: 'Development;IDE;', MimeType: 'inode/directory;' });
    expect(config['toolsets']).toEqual({ appimage: '1.0.3' });
  });
  it('merges the keep-prebuild variant instead of reopening the pristine configuration', () => {
    const variant = base.replace('better-sqlite3/{prebuilds,build,deps,src}/**', 'better-sqlite3/{build,deps,src}/**').replace('node-pty/{prebuilds,build,deps,src,third_party,scripts}/**', 'node-pty/{build,deps,src,third_party,scripts}/**');
    for (const platform of ['win32', 'linux']) {
      const config = yaml.load(packageConfigurationText(packagePlatform(platform, 'x64'), variant, '1.2.3', yaml));
      expect(config['files']).toEqual(yaml.load(variant)['files']);
      expect(config['files']).not.toEqual(yaml.load(base)['files']);
    }
  });
  it.each([['darwin', 'arm64', /IC-3 binds the macOS artifact/], ['linux', 'arm64', /only win32\/x64 and linux\/x64/], ['win32', 'arm64', /only win32\/x64 and linux\/x64/]])('refuses %s/%s before any pipeline step', (platform, arch, reason) => {
    expect(() => packagePlatform(platform, arch)).toThrow(reason);
    expect(() => packagePlatform(platform, arch)).toThrow(`${platform}/${arch}`);
    const source = readFileSync(join(APP, 'scripts', 'package.mjs'), 'utf8');
    const selection = source.indexOf('host = packagePlatform(process.platform, process.arch)');
    expect(selection).toBeGreaterThan(0);
    expect(selection).toBeLessThan(source.indexOf('const report ='));
    expect(selection).toBeLessThan(source.indexOf('rmSync('));
    expect(selection).toBeLessThan(source.indexOf("step('code-intelligence bundle'"));
  });
  it('records and announces each Linux non-applicable step without claiming a launch', () => {
    const notApplicable = inapplicablePackageSteps(packagePlatform('linux', 'x64'));
    expect(notApplicable).toHaveLength(4);
    expect(notApplicable.every((s) => s.status === 'not applicable' && s.reason.length > 0)).toBe(true);
    expect(notApplicable[2]?.reason).toContain('no Linux first-paint or packaged-session claim');
    const report = { ok: true, ms: 1, counterfactual: null, steps: [], notApplicable };
    const lines = closingLines({ report, reportPath: 'load-proof.json' }).stdout;
    for (const step of notApplicable) expect(lines).toContain(`[package] ${step.name}: not applicable — ${step.reason}`);
    expect(lines.some((line) => line.includes('SEAM-FREE'))).toBe(false);
    expect(inapplicablePackageSteps(packagePlatform('win32', 'x64'))).toEqual([]);
  });
});
