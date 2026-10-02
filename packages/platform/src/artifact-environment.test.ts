import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { APPIMAGE_VARIABLE, ARTIFACT_VARIABLES, PORTABLE_ARTIFACT_VARIABLE, takeArtifactVariables } from './index.js';

const inherited = (): NodeJS.ProcessEnv => ({
  PATH: '/usr/bin',
  HOME: '/home/u',
  APPIMAGE: '/tmp/SomeEditor-x86_64.AppImage',
  ROTARIS_PORTABLE_ARTIFACT: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe',
  APPDIR: '/tmp/.mount_abc',
  ARGV0: 'SomeEditor',
  OWD: '/home/u',
  ROTARIS_APP_LOG_LEVEL: 'info',
  COMSPEC: 'cmd.exe',
});

describe('the artifact variables are read once and taken out of the environment (REQ-STARTUP-106, REQ-STARTUP-147)', () => {
  it('names exactly APPIMAGE and ROTARIS_PORTABLE_ARTIFACT', () => {
    expect(ARTIFACT_VARIABLES).toEqual(['APPIMAGE', 'ROTARIS_PORTABLE_ARTIFACT']);
    expect(APPIMAGE_VARIABLE).toBe('APPIMAGE');
    expect(PORTABLE_ARTIFACT_VARIABLE).toBe('ROTARIS_PORTABLE_ARTIFACT');
  });

  it('REQ-STARTUP-147: returns the two values it read and deletes those two names — and nothing else — from the environment given', () => {
    const env = inherited();
    const taken = takeArtifactVariables(env, 'linux');
    expect(taken).toEqual({ APPIMAGE: '/tmp/SomeEditor-x86_64.AppImage', ROTARIS_PORTABLE_ARTIFACT: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' });
    const expected = inherited();
    delete expected['APPIMAGE'];
    delete expected['ROTARIS_PORTABLE_ARTIFACT'];
    // The AppImage runtime's other variables, the product's own and the interpreter variable are all still there.
    expect(env).toEqual(expected);
    expect(Object.isFrozen(taken)).toBe(true);
  });

  it('an absent variable is absent from what is returned, and taking twice returns nothing the second time', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', APPIMAGE: '/a.AppImage' };
    expect(takeArtifactVariables(env, 'linux')).toEqual({ APPIMAGE: '/a.AppImage' });
    expect(takeArtifactVariables(env, 'linux')).toEqual({});
    expect(env).toEqual({ PATH: '/usr/bin' });
  });

  it('on Windows the names are compared without regard to case; elsewhere a differently-cased name is another variable', () => {
    const win: NodeJS.ProcessEnv = { Path: 'C:\\Windows', Rotaris_Portable_Artifact: 'E:\\r.exe', appimage: 'C:\\x.AppImage' };
    expect(takeArtifactVariables(win, 'win32')).toEqual({ ROTARIS_PORTABLE_ARTIFACT: 'E:\\r.exe', APPIMAGE: 'C:\\x.AppImage' });
    expect(win).toEqual({ Path: 'C:\\Windows' });
    const posix: NodeJS.ProcessEnv = { PATH: '/usr/bin', appimage: '/x.AppImage' };
    expect(takeArtifactVariables(posix, 'linux')).toEqual({});
    expect(posix).toEqual({ PATH: '/usr/bin', appimage: '/x.AppImage' });
  });

  it('a child started after the take with the inherited environment carries neither variable, and the values read before it are intact', () => {
    // The seam every child of the product relies on: main takes the two out of its OWN environment, and the run host,
    // the workspace services and everything the run host starts inherit what is left. Measured with a real child here,
    // with this process's environment as the one taken from, restored afterwards.
    const saved = { APPIMAGE: process.env['APPIMAGE'], ROTARIS_PORTABLE_ARTIFACT: process.env['ROTARIS_PORTABLE_ARTIFACT'] };
    process.env['APPIMAGE'] = '/tmp/SomeEditor-x86_64.AppImage';
    process.env['ROTARIS_PORTABLE_ARTIFACT'] = '/tmp/Rotaris-portable.exe';
    process.env['ROTARIS_ARTIFACT_PROBE_KEPT'] = 'kept';
    try {
      const taken = takeArtifactVariables(process.env);
      expect(taken).toEqual({ APPIMAGE: '/tmp/SomeEditor-x86_64.AppImage', ROTARIS_PORTABLE_ARTIFACT: '/tmp/Rotaris-portable.exe' });
      const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify([process.env.APPIMAGE ?? null, process.env.ROTARIS_PORTABLE_ARTIFACT ?? null, process.env.ROTARIS_ARTIFACT_PROBE_KEPT ?? null]))'], { encoding: 'utf8' });
      expect(JSON.parse(child.stdout)).toEqual([null, null, 'kept']);
    } finally {
      delete process.env['ROTARIS_ARTIFACT_PROBE_KEPT'];
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
