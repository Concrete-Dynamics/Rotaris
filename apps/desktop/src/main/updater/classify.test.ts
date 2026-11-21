import { describe, expect, it } from 'vitest';
import { APPIMAGE_VARIABLE, ARTIFACT_KIND_BY_FLAVOUR, classifyInstallation, enclosingBundle, insideDirectory, isLinkOnly, parseInstallDir, PORTABLE_ARTIFACT_VARIABLE, type ClassificationFacts } from './classify.js';

const win = (over: Partial<ClassificationFacts> = {}): ClassificationFacts => ({
  platform: 'win32', packaged: true, execPath: 'C:\\Users\\u\\AppData\\Local\\Rotaris\\Rotaris.exe', env: {}, installDir: null, ...over,
});

describe('installation-flavour classification — REQ-STARTUP-106', () => {
  it('a source-tree or development launch is not updatable on every platform, whatever else is set', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const c = classifyInstallation({ platform, packaged: false, execPath: '/repo/node_modules/electron/dist/electron', env: {}, installDir: 'C:\\Rotaris' });
      expect(c.updatable, platform).toBe(false);
      if (!c.updatable) expect(c.reason).toContain('development or source-tree');
      // PD-STARTUP-014 leaves it silent: not packaged is never link-only, so no request at all (REQ-STARTUP-150).
      expect(isLinkOnly(c), platform).toBe(false);
    }
  });

  it('the AppImage variable is tested before any other flavour test, and the target is the file it names', () => {
    const c = classifyInstallation({ platform: 'linux', packaged: true, execPath: '/tmp/.mount_abc/rotaris', env: { [APPIMAGE_VARIABLE]: '/home/u/Rotaris-0.1.0-linux-x86_64.AppImage' }, installDir: null });
    expect(c).toEqual({ updatable: true, flavour: 'appimage', target: '/home/u/Rotaris-0.1.0-linux-x86_64.AppImage' });
  });

  it('an inherited APPIMAGE never makes a source-tree or development launch updatable, on any platform', () => {
    // APPIMAGE is inherited by every child of an AppImage-hosted terminal or editor; a `pnpm dev` started from one
    // carries it. The released-artifact test comes first and no variable overrides it.
    for (const platform of ['linux', 'win32', 'darwin'] as const) {
      const c = classifyInstallation({ platform, packaged: false, execPath: '/repo/node_modules/electron/dist/electron', env: { [APPIMAGE_VARIABLE]: '/tmp/SomeEditor-x86_64.AppImage' }, installDir: null });
      expect(c.updatable, platform).toBe(false);
      if (!c.updatable) expect(c.reason).toContain('development or source-tree');
      expect(isLinkOnly(c), platform).toBe(false);
    }
  });

  it('APPIMAGE on a packaged Windows or macOS build selects nothing: the flavour follows the artifact that platform carries (REQ-STARTUP-111)', () => {
    // A variable a user can set must not turn a Windows build into a flavour PD-STARTUP-001 never offers.
    const installed = classifyInstallation(win({ env: { [APPIMAGE_VARIABLE]: 'C:\\tools\\SomeEditor.AppImage' }, installDir: 'C:\\Users\\u\\AppData\\Local\\Rotaris' }));
    expect(installed).toEqual({ updatable: true, flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris' });
    const portable = classifyInstallation(win({ env: { [APPIMAGE_VARIABLE]: 'C:\\tools\\SomeEditor.AppImage', [PORTABLE_ARTIFACT_VARIABLE]: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' } }));
    expect(portable).toEqual({ updatable: true, flavour: 'portable', target: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' });
    // macOS: the variable selects nothing there either; the build is link-only (PD-STARTUP-014), never the AppImage flavour.
    const bundle = classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Applications/rotaris.app/Contents/MacOS/rotaris', env: { [APPIMAGE_VARIABLE]: '/tmp/x.AppImage' }, installDir: null });
    expect(bundle.updatable).toBe(false);
    expect(isLinkOnly(bundle)).toBe(true);
  });

  it('a packaged Linux build without the variable is not updatable, and is link-only: the Debian package (PD-STARTUP-013, PD-STARTUP-014)', () => {
    const deb = classifyInstallation({ platform: 'linux', packaged: true, execPath: '/opt/rotaris/rotaris', env: {}, installDir: null });
    expect(deb.updatable).toBe(false);
    expect(isLinkOnly(deb)).toBe(true);
    if (!deb.updatable) expect(deb.reason).toMatch(/Debian package.*PD-STARTUP-014/);
    // An empty APPIMAGE names no file, so it is the same case.
    expect(isLinkOnly(classifyInstallation({ platform: 'linux', packaged: true, execPath: '/opt/rotaris/rotaris', env: { [APPIMAGE_VARIABLE]: '' }, installDir: null }))).toBe(true);
  });

  it('a packaged macOS build, inside a .app bundle or not, is link-only until a macOS artifact is published (PD-STARTUP-014, PD-STARTUP-001, IC-3)', () => {
    // Narrowed from "the bundle directory is its target": no `.dmg` is published for the bundle flavour to match, so the
    // build checks and links instead of matching an asset that never exists.
    const inBundle = classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Applications/rotaris.app/Contents/MacOS/rotaris', env: {}, installDir: null });
    expect(inBundle.updatable).toBe(false);
    expect(isLinkOnly(inBundle)).toBe(true);
    if (!inBundle.updatable) expect(inBundle.reason).toContain('/Applications/rotaris.app');
    expect(enclosingBundle('/Applications/rotaris.app/Contents/MacOS/rotaris')).toBe('/Applications/rotaris.app');
    expect(enclosingBundle('/Users/u/rotaris')).toBeNull();
    const loose = classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Users/u/rotaris', env: {}, installDir: null });
    expect(loose.updatable).toBe(false);
    expect(isLinkOnly(loose)).toBe(true);
  });

  it('a packaged build of a platform no artifact is released for stays silent: not updatable and not link-only (REQ-STARTUP-031)', () => {
    const other = classifyInstallation({ platform: 'freebsd', packaged: true, execPath: '/usr/local/rotaris/rotaris', env: { [APPIMAGE_VARIABLE]: '/tmp/x.AppImage' }, installDir: null });
    expect(other.updatable).toBe(false);
    expect(isLinkOnly(other)).toBe(false);
  });

  it('on Windows the installer flavour needs BOTH the registry value and the artifact resolving inside the directory it names', () => {
    const installed = classifyInstallation(win({ installDir: 'C:\\Users\\u\\AppData\\Local\\Rotaris' }));
    expect(installed).toEqual({ updatable: true, flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris' });
    // The comparison is the product's path identity: case and separators do not tell two spellings apart on Windows.
    expect(classifyInstallation(win({ installDir: 'c:/users/U/appdata/local/rotaris/' }))).toMatchObject({ flavour: 'installer' });
    // A value naming a directory the artifact is NOT inside is not an installation of this executable.
    expect(classifyInstallation(win({ installDir: 'D:\\Elsewhere\\Rotaris' })).updatable).toBe(false);
    // A sibling directory whose name merely starts with the install directory's is not inside it.
    expect(classifyInstallation(win({ installDir: 'C:\\Users\\u\\AppData\\Local\\Rota' })).updatable).toBe(false);
  });

  it('on Windows the portable flavour is the artifact the launcher published, never the running image', () => {
    const c = classifyInstallation(win({ execPath: 'C:\\Users\\u\\AppData\\Local\\rotaris\\prep\\abc\\Rotaris.exe', env: { [PORTABLE_ARTIFACT_VARIABLE]: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' } }));
    expect(c).toEqual({ updatable: true, flavour: 'portable', target: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' });
  });

  it('a portable running out of a preparation is never read as installed, whatever directory the preparation occupies', () => {
    // The preparation sits INSIDE the install directory here, and the classification still follows the artifact.
    const c = classifyInstallation(win({
      execPath: 'C:\\Users\\u\\AppData\\Local\\Rotaris\\prep\\Rotaris.exe',
      env: { [PORTABLE_ARTIFACT_VARIABLE]: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' },
      installDir: 'C:\\Users\\u\\AppData\\Local\\Rotaris',
    }));
    expect(c).toMatchObject({ flavour: 'portable', target: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' });
  });

  it('a published artifact that resolves inside InstallDir is the installer flavour (the requirement\'s own discriminator)', () => {
    const c = classifyInstallation(win({ env: { [PORTABLE_ARTIFACT_VARIABLE]: 'C:\\Users\\u\\AppData\\Local\\Rotaris\\Rotaris-0.1.0-windows-x64-portable.exe' }, installDir: 'C:\\Users\\u\\AppData\\Local\\Rotaris' }));
    expect(c).toMatchObject({ flavour: 'installer' });
  });

  it('a packaged Windows build with neither a registry match nor a published artifact is not updatable (ADR-0054\'s reading, OQ-84)', () => {
    const c = classifyInstallation(win({ execPath: 'D:\\copied-tree\\Rotaris.exe' }));
    expect(c.updatable).toBe(false);
    if (!c.updatable) expect(c.reason).toContain('OQ-84');
    // PD-STARTUP-014: packaged, so it still checks and links to the release (link-only).
    expect(isLinkOnly(c)).toBe(true);
  });

  it('maps each flavour to the artifact kind REQ-STARTUP-107 names', () => {
    expect(ARTIFACT_KIND_BY_FLAVOUR).toEqual({ installer: 'setup', portable: 'portable', 'app-bundle': 'dmg', appimage: 'appimage' });
  });

  it('reads InstallDir out of reg.exe\'s output, and nothing out of a query that found no value', () => {
    const out = '\r\nHKEY_CURRENT_USER\\Software\\Rotaris\r\n    InstallDir    REG_SZ    C:\\Users\\u\\AppData\\Local\\Rotaris\r\n\r\n';
    expect(parseInstallDir(out)).toBe('C:\\Users\\u\\AppData\\Local\\Rotaris');
    expect(parseInstallDir('    InstallDir    REG_EXPAND_SZ    %LOCALAPPDATA%\\Rotaris')).toBe('%LOCALAPPDATA%\\Rotaris');
    expect(parseInstallDir('ERROR: The system was unable to find the specified registry key or value.')).toBeNull();
    expect(parseInstallDir('')).toBeNull();
    expect(parseInstallDir('    OtherValue    REG_SZ    x')).toBeNull();
  });

  it('insideDirectory is a prefix test on the resolved spelling with a separator, case-folded only on Windows', () => {
    expect(insideDirectory('C:\\A\\B\\x.exe', 'c:\\a\\b', 'win32')).toBe(true);
    expect(insideDirectory('C:\\A\\BC\\x.exe', 'C:\\A\\B', 'win32')).toBe(false);
    expect(insideDirectory('/opt/rotaris/x', '/opt/rotaris', 'linux')).toBe(true);
    expect(insideDirectory('/opt/Rotaris/x', '/opt/rotaris', 'linux')).toBe(false);
  });
});
