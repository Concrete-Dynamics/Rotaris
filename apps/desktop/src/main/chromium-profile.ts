import { join } from 'node:path';

/**
 * REQ-STARTUP-145: where Chromium keeps its own profile. Electron's default `userData` is a location the product does not
 * decide — on Linux `$XDG_CONFIG_HOME/<application name>`, the variable taken as it stands, so a relative value put the
 * profile under the working directory; on Windows `%APPDATA%\<application name>`, the roaming profile the requirement
 * excludes — and every launch writes `Local State`, `Preferences`, the caches, local and session storage and `Crashpad`
 * there. Conformance is decided by the directories the product actually writes to, so main places all of it below the
 * machine-local data directory (`dataLayout(...).chromiumProfile`) as its first act, synchronously, before `app` is ready:
 * Chromium reads these paths while it starts, and anything after the first `await` in main runs once it already has.
 *
 * `sessionData` (cookies and caches) and `crashDumps` follow `userData` by default; both are named anyway, so a later
 * Electron that derives either differently cannot move them back out. A profile an earlier launch left at the old path is
 * neither read, moved nor deleted: the product adopts no directory it did not create in its own place (REQ-STARTUP-145),
 * and in a development launch the old path is `Electron`, which every unpackaged Electron application shares.
 *
 * Until fin34 main placed none of it (`docs/defects/fixed/electrons-own-profile-is-written-outside-the-per-user-directories.md`).
 */
export interface ProfilePaths {
  setPath(name: 'userData' | 'sessionData' | 'crashDumps', path: string): void;
}

export function placeChromiumProfile(app: ProfilePaths, profile: string, mkdir: (dir: string) => void): { readonly userData: string; readonly sessionData: string; readonly crashDumps: string } {
  const placed = { userData: profile, sessionData: profile, crashDumps: join(profile, 'Crashpad') };
  // `setPath` throws for a directory that does not exist (Electron's own documentation), so each is made first.
  for (const [name, dir] of Object.entries(placed) as [keyof typeof placed, string][]) {
    mkdir(dir);
    app.setPath(name, dir);
  }
  return placed;
}
