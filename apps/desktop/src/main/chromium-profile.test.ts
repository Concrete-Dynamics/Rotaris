import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataLayout, resolveUserDirs } from '@rotaris/platform';
import { placeChromiumProfile } from './chromium-profile.js';

/** REQ-STARTUP-145: Chromium's profile below the machine-local data directory (`docs/defects/fixed/electrons-own-profile-is-written-outside-the-per-user-directories.md`). */
describe('Chromium\'s own profile — REQ-STARTUP-145', () => {
  const placedFor = (platform: NodeJS.Platform, env: Record<string, string | undefined>, home: string) => {
    const set: [string, string][] = [];
    const made: string[] = [];
    const profile = dataLayout(resolveUserDirs({ platform, env, home }), platform).chromiumProfile;
    placeChromiumProfile({ setPath: (name, path) => { set.push([name, path]); } }, profile, (dir) => { made.push(dir); });
    return { profile, set: Object.fromEntries(set), made };
  };

  it('Linux: below the data directory, never `$XDG_CONFIG_HOME/<name>` — a relative value is ignored, not used as it stands', () => {
    const { profile, set, made } = placedFor('linux', { XDG_CONFIG_HOME: 'rel-config', XDG_DATA_HOME: 'rel-data' }, '/home/me');
    expect(profile).toBe('/home/me/.local/share/rotaris/chromium');
    expect(set['userData']).toBe(profile);
    expect(set['sessionData']).toBe(profile);
    // `Crashpad` is joined by the host's path module, as in production, where the profile is always the host's: asked for a
    // Linux profile on a Windows host it reads `…/chromium\Crashpad`, which a `${profile}/` prefix never matched
    // (`docs/defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md`).
    expect(set['crashDumps']).toBe(join(profile, 'Crashpad'));
    // Every directory is made before it is named: `setPath` throws for one that does not exist.
    expect(made).toEqual([profile, profile, join(profile, 'Crashpad')]);
  });

  it('Windows: below `%LOCALAPPDATA%`, never the roaming `%APPDATA%` (pinned by a platform switch; not measured on Windows here)', () => {
    const { profile, set } = placedFor('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'C:\\Users\\me');
    expect(profile).toBe('C:\\Users\\me\\AppData\\Local\\rotaris\\data\\chromium');
    for (const path of Object.values(set)) expect(path.includes('Roaming')).toBe(false);
  });

  it('macOS: below the data directory under Application Support (pinned by a platform switch; not measured on macOS here)', () => {
    expect(placedFor('darwin', {}, '/Users/me').profile).toBe('/Users/me/Library/Application Support/rotaris/data/chromium');
  });
});
