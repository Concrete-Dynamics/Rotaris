import { promises as fsp } from 'node:fs';

/**
 * REQ-STARTUP-176's "the machine's loss of power included" — the two flushes `StrategyFiles` offers the portable swap,
 * kept out of `electron.ts` so they run, and are tested, on Node alone.
 *
 * `flushFile` opens the file read-write and syncs it: libuv's fsync, which is fsync(2) on POSIX and `FlushFileBuffers` on
 * Windows. Read-write because `FlushFileBuffers` needs a handle with write access (its documentation).
 *
 * `flushDirectory` syncs the directory's own entry list, so a name a copy or a rename put there survives a power loss:
 * fsync(2) on a directory handle on POSIX. On Windows it does nothing: Node opens no directory handle there, and NTFS
 * records a rename in its own metadata journal. What is left at stake there is the rename alone — lost, the path names the
 * previous executable, which the swap never moved or modified — not the bytes the path names.
 *
 * Measured on the Linux agent host (ext4, 2026-10-31, `strace -e trace=openat,fsync`): each issues one fsync(2), on the
 * file and on the directory. Not measured on a Windows host: that `FileHandle.sync` reaches `FlushFileBuffers` there is
 * libuv's documented behaviour, and what NTFS keeps of an unflushed rename after a power loss is NTFS's.
 */
export async function flushFile(path: string): Promise<void> {
  const handle = await fsp.open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function flushDirectory(dir: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform === 'win32') return;
  const handle = await fsp.open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
