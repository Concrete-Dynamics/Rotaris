import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

/**
 * REQ-STARTUP-145 — per-user directories for the application name `rotaris`.
 *
 * Three separate per-user stores, not interchangeable (constraint D-04): a
 * configuration directory, a different data directory, and a preference
 * store whose key set is closed (the last is main's, ADR-0042).
 *
 * "Which per-user location is meant": where a platform offers a replicated
 * location and a machine-local one, THIS is the machine-local one, and it
 * governs over the platform's own default. On Windows that is
 * `%LOCALAPPDATA%`, never `%APPDATA%` (roaming). Conformance is decided by
 * the directories the product actually writes to, so this module is the only
 * source of them and the composition roots never call `app.getPath` for data.
 */
export interface UserDirs {
  /** The user edits what lives here (global configuration). */
  readonly config: string;
  /** Machine-local, never replicated: workspace stores, credentials, the instance record, the machine identifier. */
  readonly data: string;
}

export interface DirEnv {
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
}

export function resolveUserDirs(e: DirEnv = { platform: process.platform, env: process.env, home: homedir() }): UserDirs {
  const name = 'rotaris';
  // The platform is a PARAMETER, so the separator is decided by IT and never by the host the code happens to run
  // on. Reading `node:path`'s host-bound `join` here made the Windows answer depend on whether the caller was
  // running Windows, which is the one thing a platform parameter exists to take out of the question.
  const { join } = e.platform === 'win32' ? win32 : posix;
  switch (e.platform) {
    case 'win32': {
      const local = localAppDataDirectory(e.env['LOCALAPPDATA'], join(e.home, 'AppData', 'Local'));
      // Both under the LOCAL profile: the roaming half is exactly what the requirement excludes.
      // REQ-CONFIG-001 spells the global configuration scope `%LOCALAPPDATA%\rotaris\rotaris\`; until 2026-09-29 this
      // answered `rotaris\config`, a name the requirement never spells (repaired under R-067;
      // `docs/defects/fixed/the-windows-global-configuration-directory-is-not-the-one-req-config-001-spells.md`).
      // No earlier directory is adopted (REQ-STARTUP-145, REQ-CONFIG-058). The data directory is the sibling `rotaris\data`, so the two stay
      // different directories (D-04).
      return { config: join(local, name, name), data: join(local, name, 'data') };
    }
    case 'darwin':
      return {
        config: join(e.home, 'Library', 'Application Support', name),
        // ~/Library/Application Support may be synchronised by the platform's own account features;
        // ~/Library/Caches is purgeable. The machine-local, non-purgeable choice is the data directory
        // under Application Support with the sync attribute handled at store creation (IC-3 item 4).
        data: join(e.home, 'Library', 'Application Support', name, 'data'),
      };
    default: {
      const config = xdgBaseDirectory(e.env['XDG_CONFIG_HOME'], join(e.home, '.config'));
      const data = xdgBaseDirectory(e.env['XDG_DATA_HOME'], join(e.home, '.local', 'share'));
      return { config: join(config, name), data: join(data, name) };
    }
  }
}

/**
 * An XDG base-directory variable's value, or its default where the XDG Base Directory Specification says the variable does
 * not name one: "either not set or empty" takes the default, and "all paths set in these environment variables must be
 * absolute. If an implementation encounters a relative path in any of these variables it should consider the path invalid
 * and ignore it." The one reading of the configuration and data homes, so `resolveUserDirs` and `resolvePreferenceRoot` never
 * part over them. Until finacc3 the first read the variables with `??` and the second with `||`, so `XDG_CONFIG_HOME=` put
 * the configuration directory at the relative path `rotaris` while the preference store fell back to `~/.config`
 * (`docs/defects/fixed/an-empty-xdg-config-home-puts-the-configuration-directory-at-a-relative-path.md`); until fin30 a
 * relative value was still used as it stood, so the per-user directories landed under the working directory
 * (`docs/defects/fixed/a-relative-xdg-config-home-or-xdg-data-home-is-used-as-it-stands.md`). The variables are read off
 * Windows and macOS alone, so "absolute" is POSIX's: a Windows spelling such as `D:/x` names nothing a POSIX launch can resolve.
 */
export function xdgBaseDirectory(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' || !posix.isAbsolute(value) ? fallback : value;
}

/**
 * `LOCALAPPDATA`'s value, or `<home>\AppData\Local` where it names no directory: unset, empty, or relative (`rel`, or `C:rel`,
 * which is relative to drive C's current directory). The one reading of it, so `resolveUserDirs` and `resolvePreferenceRoot`
 * never part over it. Until fin30 both took it with `??`, so `set LOCALAPPDATA=` put the configuration directory, the data
 * directory and the preference store at `rotaris\rotaris`, `rotaris\data` and `Rotaris\Rotaris`, relative to the working
 * directory (`docs/defects/fixed/an-empty-localappdata-puts-the-per-user-directories-at-a-relative-path.md`). REQ-STARTUP-145's
 * per-user location is never one relative to wherever the application happened to be started.
 */
export function localAppDataDirectory(value: string | undefined, fallback: string): string {
  return value === undefined || value === '' || !win32.isAbsolute(value) ? fallback : value;
}

/** Fixed sub-locations inside the data directory. Fixed-length by construction where a path budget matters (ADR-0058 c.13). */
export function dataLayout(dirs: UserDirs, platform: NodeJS.Platform = process.platform) {
  // The platform is a PARAMETER for the same reason `resolveUserDirs` takes one: the spelling of a
  // sub-location is decided by the platform the answer is FOR, not by the host the code runs on. In
  // production the two always agree (every caller passes no platform). A bare host-bound `join` here
  // spelled the Windows answer with POSIX separators whenever the question was asked off Windows.
  const { join } = platform === 'win32' ? win32 : posix;
  return {
    workspaces: join(dirs.data, 'workspaces'),
    instanceRecord: join(dirs.data, 'instance.json'),
    machineId: join(dirs.data, 'machine-id'),
    // REQ-PROVIDER-014 fixes `tokens/`; the name reserved here before the store was built was `credentials`,
    // which no requirement names — corrected when ADR-0029 was first executed (Part K, 2026-09-05).
    tokens: join(dirs.data, 'tokens'),
  } as const;
}

/** Per-workspace state lives at `<workspace>/.rotaris/` and nowhere else (D-03). */
export const WORKSPACE_SCOPE_DIR = '.rotaris' as const;
export const WORKSPACE_ID_FILE = 'workspace-id' as const;
