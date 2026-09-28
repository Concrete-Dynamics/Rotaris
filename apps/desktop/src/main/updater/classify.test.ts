import { describe, expect, it } from 'vitest';
import { APPIMAGE_VARIABLE, ARTIFACT_KIND_BY_FLAVOUR, classifyInstallation, enclosingBundle, insideDirectory, parseInstallDir, PORTABLE_ARTIFACT_VARIABLE, type ClassificationFacts } from './classify.js';

const win = (over: Partial<ClassificationFacts> = {}): ClassificationFacts => ({
  platform: 'win32', packaged: true, execPath: 'C:\\Users\\u\\AppData\\Local\\Rotaris\\Rotaris.exe', env: {}, installDir: null, ...over,
});

describe('installation-flavour classification — REQ-STARTUP-106', () => {
  it('a source-tree or development launch is not updatable on every platform, whatever else is set', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const c = classifyInstallation({ platform, packaged: false, execPath: '/repo/node_modules/electron/dist/electron', env: {}, installDir: 'C:\\Rotaris' });
      expect(c.updatable, platform).toBe(false);
      if (!c.updatable) expect(c.reason).toContain('development or source-tree');
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
    }
  });

  it('APPIMAGE on a packaged Windows or macOS build selects nothing: the flavour follows the artifact that platform carries (REQ-STARTUP-111)', () => {
    // A variable a user can set must not turn a Windows build into a flavour PD-STARTUP-001 never offers.
    const installed = classifyInstallation(win({ env: { [APPIMAGE_VARIABLE]: 'C:\\tools\\SomeEditor.AppImage' }, installDir: 'C:\\Users\\u\\AppData\\Local\\Rotaris' }));
    expect(installed).toEqual({ updatable: true, flavour: 'installer', target: 'C:\\Users\\u\\AppData\\Local\\Rotaris' });
    const portable = classifyInstallation(win({ env: { [APPIMAGE_VARIABLE]: 'C:\\tools\\SomeEditor.AppImage', [PORTABLE_ARTIFACT_VARIABLE]: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' } }));
    expect(portable).toEqual({ updatable: true, flavour: 'portable', target: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' });
    const bundle = classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Applications/rotaris.app/Contents/MacOS/rotaris', env: { [APPIMAGE_VARIABLE]: '/tmp/x.AppImage' }, installDir: null });
    expect(bundle).toEqual({ updatable: true, flavour: 'app-bundle', target: '/Applications/rotaris.app' });
  });

  it('a packaged Linux build without the variable is not one of the released artifacts', () => {
    expect(classifyInstallation({ platform: 'linux', packaged: true, execPath: '/opt/rotaris/rotaris', env: {}, installDir: null }).updatable).toBe(false);
  });

  it('a macOS build inside a .app bundle has the bundle directory as its target, never the executable inside it', () => {
    const c = classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Applications/rotaris.app/Contents/MacOS/rotaris', env: {}, installDir: null });
    expect(c).toEqual({ updatable: true, flavour: 'app-bundle', target: '/Applications/rotaris.app' });
    expect(enclosingBundle('/Users/u/rotaris')).toBeNull();
    expect(classifyInstallation({ platform: 'darwin', packaged: true, execPath: '/Users/u/rotaris', env: {}, installDir: null }).updatable).toBe(false);
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
