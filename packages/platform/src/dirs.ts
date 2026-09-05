import { homedir } from 'node:os';
import { join } from 'node:path';

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
  switch (e.platform) {
    case 'win32': {
      const local = e.env['LOCALAPPDATA'] ?? join(e.home, 'AppData', 'Local');
      // Both under the LOCAL profile: the roaming half is exactly what the requirement excludes.
      return { config: join(local, name, 'config'), data: join(local, name, 'data') };
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
      const config = e.env['XDG_CONFIG_HOME'] ?? join(e.home, '.config');
      const data = e.env['XDG_DATA_HOME'] ?? join(e.home, '.local', 'share');
      return { config: join(config, name), data: join(data, name) };
    }
  }
}

/** Fixed sub-locations inside the data directory. Fixed-length by construction where a path budget matters (ADR-0058 c.13). */
export function dataLayout(dirs: UserDirs) {
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
