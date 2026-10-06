import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as Fs from 'node:fs';
import { FakeClock } from '@rotaris/kernel';
import type { FenceConfig } from './fence.js';
import type { ToolContext } from './types.js';

/**
 * Undoing a create whose file cannot be removed (REQ-TOOLS-132, REQ-TOOLS-135). On Windows, the primary platform, `unlink`
 * refuses with EBUSY or EPERM while another process holds the file open; that cannot be produced on demand here, so
 * `unlinkSync` is made to refuse for the calls this test arms. The undo answers the error, leaves the file in place, and puts
 * its entry back, so the create stays undoable (docs/defects/fixed/undoing-a-create-leaves-an-empty-file.md). `vi.mock` is
 * hoisted over the whole file, which is why this case is not in tools.test.ts beside the rest of the describe.
 */
const refuse = { armed: false };
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  const unlinkSync = ((...args: Parameters<typeof real.unlinkSync>) => {
    if (refuse.armed) throw Object.assign(new Error('EBUSY: resource busy or locked, unlink'), { code: 'EBUSY' });
    return real.unlinkSync(...args);
  }) as typeof real.unlinkSync;
  return { ...real, default: { ...real, unlinkSync }, unlinkSync };
});

const { FileToolState, writeFileTool } = await import('./files.js');

let root: string;
const clock = new FakeClock();
const ctx = (): ToolContext => ({ workspaceRoot: root, sessionId: 's', agentName: 'a', persona: 'p', monotonic: clock, wall: clock, signal: new AbortController().signal, warn: () => undefined });

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-undo-failure-')); });
afterEach(() => { refuse.armed = false; rmSync(root, { recursive: true, force: true }); });

describe('undoing a create whose file cannot be removed answers the error and stays undoable (REQ-TOOLS-132, REQ-TOOLS-135)', () => {
  it('the refused removal leaves the file and its directory, and the next undo removes both', async () => {
    const fence: FenceConfig = { workspaceRoot: root, allowOutsideWorkspace: false, additionalReadOnlyRoots: [] };
    const w = writeFileTool(new FileToolState(), fence);
    expect(await w.execute({ operation: 'create', path: 'n/f.txt', content: 'held\n', replace_all: false }, ctx())).toMatchObject({ isError: false });

    refuse.armed = true;
    const refused = await w.execute({ operation: 'undo', path: 'n/f.txt', replace_all: false }, ctx());
    refuse.armed = false;
    expect(refused).toMatchObject({ isError: true, text: 'Could not remove n/f.txt: EBUSY: resource busy or locked, unlink' });
    expect(readFileSync(join(root, 'n', 'f.txt'), 'utf8')).toBe('held\n');

    // The entry was put back with the directory the create made: the write is still the create's to undo.
    const again = await w.execute({ operation: 'undo', path: 'n/f.txt', replace_all: false }, ctx());
    expect(again).toMatchObject({ isError: false, text: 'Removed n/f.txt: it did not exist before the create this undoes (1 line removed). Also removed the empty directory n/ the create made.' });
    expect(existsSync(join(root, 'n'))).toBe(false);
    expect(await w.execute({ operation: 'undo', path: 'n/f.txt', replace_all: false }, ctx())).toMatchObject({ isError: true, text: 'No edit history for n/f.txt.' });
  });
});
