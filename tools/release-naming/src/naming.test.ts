import { describe, expect, it } from 'vitest';
import { artifactName, releaseArtifacts, UnknownArtifactKindError } from './index.js';

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
