import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceId } from '@rotaris/kernel';
import { CONTAINER_MANIFEST, CONTAINER_STORE_FILE, SESSIONS_DIR, storeDir, storeFile } from './layout.js';
import { openStore } from './open.js';

/**
 * REQ-SESSION-201 — the whole-store backup, taken in the workspace service
 * (ADR-0002): `VACUUM INTO` a staging snapshot, enumerate sessions FROM the
 * snapshot, copy their file bodies, seal the manifest, archive, rename onto
 * the destination the user chose. O(store); measured at a median 1,077 ms
 * per 41 MB under concurrent commits (spike 21).
 *
 * GD-4b: a backup in progress may be abandoned — the partial artifact is
 * discarded, the store untouched, nothing partial left at the destination.
 * That is what staging-then-rename gives by construction.
 *
 * The archive tool is the platform's `tar` (bsdtar on Windows 10+). A
 * TypeScript archiver is a later decision; the container format is fixed
 * here and the tool is behind this one function.
 */
export interface BackupManifest {
  readonly artifact_format_version: 1;
  readonly workspace_identifier: WorkspaceId;
  readonly taken_at_utc: string;
  readonly store_user_version: number;
  readonly counts: { readonly sessions: number; readonly rows: number; readonly locks: number };
  readonly last_seen_workspace_path: string | null;
  readonly absent_bodies: readonly string[];
}

export interface BackupResult {
  readonly manifest: BackupManifest;
  readonly bytes: number;
}

function tarBin(): string {
  return process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
}

export function takeBackup(workspacesRoot: string, id: WorkspaceId, destination: string, takenAtUtc: string, lastSeenPath: string | null): BackupResult {
  const stage = `${destination}.part-${process.pid}`;
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });

  const live = openStore(storeFile(workspacesRoot, id));
  const snap = join(stage, CONTAINER_STORE_FILE);
  live.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
  live.close();

  const s = openStore(snap, { readonly: true });
  const sessions = (s.prepare('SELECT session_id FROM sessions').all() as { session_id: string }[]).map((r) => r.session_id);
  const uv = s.pragma('user_version', { simple: true }) as number;
  const rows = (s.prepare('SELECT count(*) AS c FROM transcript_rows').get() as { c: number }).c;
  const locks = (s.prepare('SELECT count(*) AS c FROM session_locks').get() as { c: number }).c;
  s.close();

  const absent: string[] = [];
  for (const sid of sessions) {
    const src = join(storeDir(workspacesRoot, id), SESSIONS_DIR, sid);
    if (!existsSync(src)) { absent.push(sid); continue; }
    cpSync(src, join(stage, SESSIONS_DIR, sid), { recursive: true });
  }
  const manifest: BackupManifest = {
    artifact_format_version: 1,
    workspace_identifier: id,
    taken_at_utc: takenAtUtc,
    store_user_version: uv,
    counts: { sessions: sessions.length, rows, locks },
    last_seen_workspace_path: lastSeenPath,
    absent_bodies: absent,
  };
  writeFileSync(join(stage, CONTAINER_MANIFEST), JSON.stringify(manifest, null, 1));

  const tmp = `${destination}.tmp-${process.pid}`;
  execFileSync(tarBin(), ['-cf', tmp, '-C', stage, '.'], { stdio: 'pipe' });
  renameSync(tmp, destination);
  rmSync(stage, { recursive: true, force: true });
  return { manifest, bytes: statSync(destination).size };
}

export function expandArtifact(artifact: string, into: string): void {
  mkdirSync(into, { recursive: true });
  execFileSync(tarBin(), ['-xf', artifact, '-C', into], { stdio: 'pipe' });
}
