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
  /**
   * Copy the verified download beside its target (staging may sit on another volume, so this is a copy, not a rename).
   * Replaces `to` when it exists: the only destination is `<name>.update`, the updater's own sibling (`applyPortable`).
   */
  copyFile(from: string, to: string): Promise<void>;
  /**
   * Copy the target to its backup name beside it, leaving the target where it is (REQ-STARTUP-176): the only destination
   * is `<name>.old`, removed just before, so a file that appeared there since is refused (`EEXIST`) rather than replaced
   * — and `applyPortable` then leaves it alone, because it is not this step's to remove.
   */
  copyAside(from: string, to: string): Promise<void>;
  /** Write a file's data through to the medium, so that a power loss after this resolves keeps its bytes (REQ-STARTUP-176). */
  flushFile(path: string): Promise<void>;
  /** Write a directory's entries through to the medium, so that a name a copy or a rename put there survives a power loss. */
  flushDirectory(dir: string): Promise<void>;
  /** Move `from` onto `to`, replacing a file at `to` in one step (on Windows, as on POSIX, a rename onto a file replaces it). */
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

/**
 * Whether a copy refused a file already at the destination, rather than failing part-way through writing one. Node's
 * `COPYFILE_EXCL` reports the first as `EEXIST`, which is the one case where the destination is not this attempt's.
 */
const destinationExisted = (error: unknown): boolean => (error as { readonly code?: unknown } | null | undefined)?.code === 'EEXIST';

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
 * copied to `<name>.old`, and the new file is then renamed onto the target path in one step — while the application
 * being replaced is still running, the target being the artifact rather than the file the process is executing.
 * REQ-STARTUP-176 under PD-STARTUP-008 (narrowing REQ-STARTUP-125's "renamed to `<name>.old`, then moved in"): the
 * target is never moved aside, so its path names the previous executable until the rename replaces it with the new one
 * and is never empty — a process ended at any step leaves a file the user can start. If that final rename fails, the
 * target was never touched and still holds the original bytes, so nothing is put back: the fresh copy and the placed
 * sibling are removed and the step reports (REQ-STARTUP-126). The `<name>.old` file remains until a later launch
 * removes it (REQ-STARTUP-115). Where the artifact
 * sits on media that cannot be written — read-only, or removed since launch — the step fails reporting that it could
 * not install the update at the target, changes nothing anywhere, and leaves the running application and its
 * preparation exactly as they were.
 *
 * "The machine's loss of power included": a file system may journal a rename before the data of the file renamed, so
 * every copy is flushed before anything relies on it — `<name>.update` before it is renamed onto the target, `<name>.old`
 * and the directory's entries before the target is replaced — and the directory again after the rename, before the step
 * reports it. A flush that fails is a failure of the step like any other. One that fails after the rename puts the
 * previous bytes back by the same order (copy, flush, one rename), so the target is again what it was. How far each
 * flush reaches on which host is `flush.ts`'s; the consequence today: `classifyInstallation` answers `portable` only on
 * Windows, where `flushDirectory` does nothing and cannot fail, so neither directory flush does anything in production,
 * `putPreviousBack` is not reached, and the rename's own durability rests on NTFS. They stand because the strategy is
 * selected by flavour and never by operating system, and are decided here against the port's contract.
 */
export async function applyPortable(target: string, verifiedFile: string, files: StrategyFiles): Promise<ApplyOutcome> {
  const fail = (error: unknown): ApplyOutcome => ({ ok: false, sentence: `could not install the update at ${target}: ${messageOf(error)}` });
  const { dir } = splitPath(target);
  if ((await files.pathKind(target)) !== 'file') {
    // The artifact is not where it was: either its medium is gone or read-only (REQ-STARTUP-125's "removed since
    // launch", reported as not installable at the target) or there never was a released artifact there.
    if (dir !== '' && (await files.pathKind(dir)) !== 'directory') return fail('the directory holding it cannot be reached (the medium may have been removed)');
    return { ok: false, sentence: NO_TARGET_SENTENCE };
  }
  const incoming = portableIncomingPath(target);
  const backup = portableBackupPath(target);
  const holder = dir === '' ? '.' : dir;
  try {
    await files.copyFile(verifiedFile, incoming);
    await files.flushFile(incoming);
  } catch (error) {
    // Nothing was placed, or a partial or unflushed sibling was: remove it and change nothing else (REQ-STARTUP-126).
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
    await files.copyAside(target, backup);
  } catch (error) {
    // The target was only read. The previous backup was removed just above, so the backup name now holds either a
    // partial copy of this attempt's own (removed here) or a file that appeared there since — refused, and left
    // where it is, because removing a file this step did not write would change something it never touched.
    if (!destinationExisted(error)) await files.removeFile(backup).catch(() => undefined);
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  try {
    // The backup is relied on from the rename on, as the only copy of the previous executable: its bytes and its name
    // reach the medium first, with `<name>.update`'s name.
    await files.flushFile(backup);
    await files.flushDirectory(holder);
  } catch (error) {
    // `copyAside` wrote the backup, so it is this attempt's own; the target was only read.
    await files.removeFile(backup).catch(() => undefined);
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  try {
    await files.rename(incoming, target);
  } catch (error) {
    // The target was never moved, so it still holds the original bytes; re-renaming anything here would only reopen
    // the window this order closes. What this attempt added beside it is removed.
    await files.removeFile(backup).catch(() => undefined);
    await files.removeFile(incoming).catch(() => undefined);
    return fail(error);
  }
  try {
    await files.flushDirectory(holder);
  } catch (error) {
    return putPreviousBack(target, holder, files, error);
  }
  return { ok: true, outcome: 'replaced', message: REPLACED_MESSAGE };
}

/**
 * The rename took effect but could not be made durable, so the step fails, and what is installed must be what it was
 * (REQ-STARTUP-126): the previous bytes, kept in the flushed `<name>.old`, are copied beside the target, flushed and
 * renamed onto it in one step — the swap's own order, so the path names a complete executable throughout. Should that
 * fail too, the new version stays at the path with the previous one kept as `<name>.old`, and the sentence says so.
 */
async function putPreviousBack(target: string, holder: string, files: StrategyFiles, error: unknown): Promise<ApplyOutcome> {
  const incoming = portableIncomingPath(target);
  const backup = portableBackupPath(target);
  try {
    await files.copyFile(backup, incoming);
    await files.flushFile(incoming);
    await files.rename(incoming, target);
  } catch (restoreError) {
    await files.removeFile(incoming).catch(() => undefined);
    return { ok: false, sentence: `could not install the update at ${target}: ${messageOf(error)}; putting the previous version back failed too (${messageOf(restoreError)}), so the new version is at the path and the previous one is kept beside it as ${backup}` };
  }
  // Best effort: the flush that failed a moment ago is what this would need. Unflushed, a power loss leaves either rename,
  // and both name a complete, flushed executable.
  await files.flushDirectory(holder).catch(() => undefined);
  await files.removeFile(backup).catch(() => undefined);
  return { ok: false, sentence: `could not install the update at ${target}: ${messageOf(error)}` };
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
