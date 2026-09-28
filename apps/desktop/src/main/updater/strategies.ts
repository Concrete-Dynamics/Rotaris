import { messageOf } from './download.js';
import type { Flavour } from './classify.js';

/**
 * REQ-STARTUP-125, REQ-STARTUP-115, REQ-STARTUP-126 — the apply strategies, selected by installation flavour and
 * never by operating system, each a separate function with its own rollback story (ADR-0054). Every file operation
 * goes through `StrategyFiles`, so each step's observable results are decided with fakes here and the real
 * operations on a Windows host are the port's (`electron.ts`).
 *
 * PD-STARTUP-001: only the installer and the portable strategies are built. The disk-image and AppImage strategies
 * wait for the directive's withdrawal; until then an offer for either flavour cannot arise (no such asset is
 * published), and were one to reach `applyUpdate` it fails with one sentence naming the directive, leaving what is
 * installed byte-for-byte what it was (REQ-STARTUP-126).
 */
export interface StrategyFiles {
  pathKind(path: string): Promise<'file' | 'directory' | 'absent'>;
  /** Copy the verified download beside its target (staging may sit on another volume, so this is a copy, not a rename). */
  copyFile(from: string, to: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** Remove a file; an absent file is not an error. */
  removeFile(path: string): Promise<void>;
}

export interface StrategySpawn {
  /** Start a process that survives this application exiting; rejects when it cannot be started. */
  spawnDetached(executable: string, args: readonly string[]): Promise<void>;
}

export type ApplyOutcome =
  | { readonly ok: true; readonly outcome: 'replaced'; readonly message: string }
  | { readonly ok: true; readonly outcome: 'handed-off'; readonly quitRequired: boolean; readonly message: string }
  | { readonly ok: false; readonly sentence: string };

/** REQ-STARTUP-125's exact messages. */
export const REPLACED_MESSAGE = 'The update is installed. Restart Rotaris to run it.';
export const INSTALLER_HANDOFF_MESSAGE = 'Rotaris will close so the installer can replace it.';
export const NO_TARGET_SENTENCE = 'this Rotaris was not installed from a released artifact';

/** The path helpers for the platform the target lives on, without `node:path` binding to the host. */
function splitPath(target: string): { dir: string; name: string; sep: string } {
  const sep = target.includes('\\') && !target.includes('/') ? '\\' : target.includes('/') ? '/' : '\\';
  const at = Math.max(target.lastIndexOf('\\'), target.lastIndexOf('/'));
  return at < 0 ? { dir: '', name: target, sep } : { dir: target.slice(0, at), name: target.slice(at + 1), sep };
}
const sibling = (target: string, suffix: string): string => {
  const { dir, name, sep } = splitPath(target);
  return dir === '' ? `${name}${suffix}` : `${dir}${sep}${name}${suffix}`;
};
/** REQ-STARTUP-125/115: the portable's backup name, `<name>.old` beside the artifact. */
export const portableBackupPath = (target: string): string => sibling(target, '.old');
/** Where the verified file is placed beside the target before the swap. */
export const portableIncomingPath = (target: string): string => sibling(target, '.update');

/**
 * Windows portable → the verified file is placed beside the target, any previous backup is deleted, the target is
 * renamed to `<name>.old`, and the new file is then moved into the target path — while the application being replaced
 * is still running, the target being the artifact rather than the file the process is executing. If that final move
 * fails, the backup is renamed back before the step reports, so the executable present after a failure is the
 * original one. The `<name>.old` file remains until a later launch removes it (REQ-STARTUP-115). Where the artifact
 * sits on media that cannot be written — read-only, or removed since launch — the step fails reporting that it could
 * not install the update at the target, changes nothing anywhere, and leaves the running application and its
 * preparation exactly as they were.
 */
export async function applyPortable(target: string, verifiedFile: string, files: StrategyFiles): Promise<ApplyOutcome> {
  const fail = (error: unknown): ApplyOutcome => ({ ok: false, sentence: `could not install the update at ${target}: ${messageOf(error)}` });
  if ((await files.pathKind(target)) !== 'file') {
    // The artifact is not where it was: either its medium is gone or read-only (REQ-STARTUP-125's "removed since
    // launch", reported as not installable at the target) or there never was a released artifact there.
    const { dir } = splitPath(target);
    if (dir !== '' && (await files.pathKind(dir)) !== 'directory') return fail('the directory holding it cannot be reached (the medium may have been removed)');
    return { ok: false, sentence: NO_TARGET_SENTENCE };
  }
  const incoming = portableIncomingPath(target);
  const backup = portableBackupPath(target);
  try {
    await files.copyFile(verifiedFile, incoming);
  } catch (error) {
    // Nothing was placed, or a partial sibling was: remove it and change nothing else (REQ-STARTUP-126).
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  try {
    await files.removeFile(backup);
  } catch (error) {
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  try {
    await files.rename(target, backup);
  } catch (error) {
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  try {
    await files.rename(incoming, target);
  } catch (error) {
    // The one step after which the original is no longer at the target path: put it back before reporting.
    await files.rename(backup, target).catch(() => undefined);
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  return { ok: true, outcome: 'replaced', message: REPLACED_MESSAGE };
}

/**
 * Windows installer → the verified setup executable is started as a process that survives the application exiting,
 * and the application makes no edit of its own to the installed tree; the outcome is handed-off with quit required.
 * The setup runs from where it was downloaded, so staging is left for the installer and is not removed here.
 */
export async function applyInstaller(setupPath: string, spawn: StrategySpawn): Promise<ApplyOutcome> {
  try {
    await spawn.spawnDetached(setupPath, []);
  } catch (error) {
    return { ok: false, sentence: `could not start the installer at ${setupPath}: ${messageOf(error)}` };
  }
  return { ok: true, outcome: 'handed-off', quitRequired: true, message: INSTALLER_HANDOFF_MESSAGE };
}

/** The strategy for a flavour (REQ-STARTUP-125). The two PD-STARTUP-001 leaves unbuilt refuse with one sentence. */
export async function applyUpdate(flavour: Flavour, target: string, verifiedFile: string, files: StrategyFiles, spawn: StrategySpawn): Promise<ApplyOutcome> {
  switch (flavour) {
    case 'portable': return applyPortable(target, verifiedFile, files);
    case 'installer': return applyInstaller(verifiedFile, spawn);
    case 'appimage':
    case 'app-bundle':
      return { ok: false, sentence: `the ${flavour === 'appimage' ? 'AppImage' : 'disk-image'} strategy is not built while PD-STARTUP-001 stands; nothing was changed` };
  }
}

/**
 * REQ-STARTUP-115 — before the network round trip, a leftover `<name>.old` beside the ARTIFACT is deleted: for the
 * portable flavour only. A deletion failure is tolerated silently and retried on a later launch; a directory that
 * cannot be reached (the medium removed, or read-only) is nothing to do rather than a failure. Answers what happened,
 * for the log line and nothing else.
 */
export async function cleanupPortableBackup(flavour: Flavour, target: string, files: StrategyFiles): Promise<'removed' | 'nothing' | 'kept'> {
  if (flavour !== 'portable') return 'nothing';
  const backup = portableBackupPath(target);
  try {
    if ((await files.pathKind(backup)) !== 'file') return 'nothing';
    await files.removeFile(backup);
    return 'removed';
  } catch {
    return 'kept';
  }
}
