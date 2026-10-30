import { closeSync, fsyncSync, openSync } from 'node:fs';

/**
 * REQ-SESSION-034 level 2 — the flushes the product issues. A file the product reports durable is flushed before it is
 * renamed into place, and the directory that holds the name after the rename.
 */
export function fsyncFile(file: string): void {
  const fd = openSync(file, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function fsyncDirectory(dir: string): void {
  // A directory's entry is durable once the directory is flushed; Windows refuses to open a directory for that and
  // flushes the entry with the file, so a refusal there is not a failure.
  let fd: number | undefined;
  try {
    fd = openSync(dir, 'r');
    fsyncSync(fd);
  } catch { /* EISDIR / EPERM on Windows */ } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
