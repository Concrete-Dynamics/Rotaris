import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushDirectory, flushFile } from './flush.js';

/**
 * REQ-STARTUP-176 — the flushes against the host's real file system. That they reach the medium is not observable from
 * here; that each is a sync on a real handle, which fails rather than passes silently, is.
 */
describe('the portable swap\'s flushes — REQ-STARTUP-176', () => {
  let dir = '';
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'rotaris-flush-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('flushes a file without changing a byte of it, and its directory', async () => {
    const file = join(dir, 'Rotaris.exe.update');
    await writeFile(file, 'v0.2.0');
    await flushFile(file);
    await flushDirectory(dir);
    expect(await readFile(file, 'utf8')).toBe('v0.2.0');
  });

  it('a flush that cannot open what it names rejects, so the swap fails rather than relying on it', async () => {
    await expect(flushFile(join(dir, 'absent'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(flushDirectory(join(dir, 'absent'), 'linux')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('on Windows the directory flush opens nothing (Node offers no directory handle there)', async () => {
    await expect(flushDirectory(join(dir, 'absent'), 'win32')).resolves.toBeUndefined();
  });
});
