/** ADR-0066; REQ-STARTUP-024/025: choose the build before any pipeline side effect. */
import { preparedConfiguration } from './platform-targets.mjs';
import { namedConfigurationText, packagingArtifactNames } from './artifact-names.mjs';

/** @param {string} platform @param {string} arch */
export function packagePlatform(platform, arch) {
  if (platform === 'darwin') throw new Error(`Unsupported package host ${platform}/${arch}: IC-3 binds the macOS artifact until the build hosts exist (implementation-conditions.md)`);
  if (arch !== 'x64' || !['win32', 'linux'].includes(platform)) throw new Error(`Unsupported package host ${platform}/${arch}: only win32/x64 and linux/x64 builds are wired`);
  return platform === 'win32'
    ? { platform, key: 'windows-x64', builderFlag: '--win', bundleTarget: '--target=win32-x64', configuration: 'electron-builder.package.yml', unpacked: 'win-unpacked', executable: 'Rotaris.exe' }
    : { platform, key: 'linux-x86_64', builderFlag: '--linux', bundleTarget: '--target=linux-x64', configuration: 'electron-builder.package.linux.yml', unpacked: 'linux-unpacked', executable: 'rotaris' };
}

/** Render the supplied text, including the keep-prebuild variant, never reread the base.
 * @param {ReturnType<typeof packagePlatform>} host @param {string} text @param {string} declared
 * @param {{ load: (text: string) => any, dump: (value: any, options: any) => string }} yaml
 */
export function packageConfigurationText(host, text, declared, yaml) {
  return host.platform === 'linux'
    ? yaml.dump(preparedConfiguration(yaml.load(text), host.key, declared), { lineWidth: -1, noRefs: true })
    : namedConfigurationText(text, packagingArtifactNames(declared), yaml);
}

/** @param {ReturnType<typeof packagePlatform>} host */
export function inapplicablePackageSteps(host) {
  if (host.platform !== 'linux') return [];
  return [
    { name: '2′ portable assembly', reason: 'Windows launcher built by Cargo around win-unpacked; not a Linux artifact' },
    { name: '2″ PE icon readback', reason: 'Windows PE resources; not a Linux artifact' },
    { name: '3 packaged app launch and capture', reason: 'Windows artifact and display-dependent session proof; no Linux first-paint or packaged-session claim' },
    { name: '3′ portable launched twice', reason: 'Windows portable and display-dependent launch proof; not a Linux artifact' },
  ].map((step) => ({ ...step, status: 'not applicable' }));
}
