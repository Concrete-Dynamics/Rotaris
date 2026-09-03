import { existsSync, rmSync } from 'node:fs';
import { err, failure, ok, type Failure, type Result, type WorkspaceId } from '@rotaris/kernel';
import { takeBackup } from '@rotaris/store';

/**
 * REQ-SESSION-201 — the whole-store backup, orchestrated in the workspace
 * service (ADR-0002: the only process that can name what to copy; main
 * supplied the destination through the save dialog and nothing else).
 * Valid while runs are live; never pauses, throttles or refuses on a live
 * session. Staging then rename means nothing partial ever lands at the
 * destination (GD-4b); a failure leaves no file there.
 */
export interface BackupDeps {
  readonly workspacesRoot: string;
  readonly id: WorkspaceId;
  readonly destination: string;
  readonly takenAtUtc: string;
  readonly lastSeenPath: string | null;
}

export interface BackupOutcome {
  readonly destination: string;
  readonly bytes: number;
  readonly sessions: number;
  readonly takenAtUtc: string;
}

export function backupWorkspace(d: BackupDeps): Result<BackupOutcome, Failure> {
  try {
    const r = takeBackup(d.workspacesRoot, d.id, d.destination, d.takenAtUtc, d.lastSeenPath);
    return ok({ destination: d.destination, bytes: r.bytes, sessions: r.manifest.counts.sessions, takenAtUtc: d.takenAtUtc });
  } catch (cause) {
    // Nothing partial may remain where the user chose (REQ-SESSION-201).
    for (const leftover of [`${d.destination}.part-${process.pid}`, `${d.destination}.tmp-${process.pid}`]) {
      if (existsSync(leftover)) rmSync(leftover, { recursive: true, force: true });
    }
    return err(failure('backup.failed', 'The backup could not be taken', String(cause), cause));
  }
}
