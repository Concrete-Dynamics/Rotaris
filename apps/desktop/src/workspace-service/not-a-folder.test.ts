import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { establishWorkspaceId } from '@rotaris/store';
import { notAFolderAtOpen } from './not-a-folder.js';

/**
 * A workspace path that is a file, or whose `.rotaris` is a file, is refused as what it is, before the identifier read would
 * report it as "present but cannot be read" (REQ-SESSION-197's condition, which no identifier file can be in here).
 */
describe('the open of a path that is not a folder', () => {
  const dirs: string[] = [];
  const scratch = (): string => { const d = mkdtempSync(join(tmpdir(), 'rotaris-not-a-folder-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  /**
   * What the identifier read answers for a non-folder when nothing asks first: on POSIX the read under a regular file fails
   * ENOTDIR, folded into `unreadable`; on Windows it fails ENOENT, so the read says absent and the mint under the file throws.
   * Either way the file's absent identifier is spoken of as the workspace's, which is why the open asks `notAFolderAtOpen` first.
   */
  const withoutTheGuard = (root: string): string => { try { return establishWorkspaceId(root).state; } catch { return 'threw'; } };
  const unguarded = process.platform === 'win32' ? 'threw' : 'unreadable';

  it('a workspace path that is a file: said as a file, and nothing about an identifier, sessions or putting anything back', () => {
    const file = join(scratch(), 'afile');
    writeFileSync(file, 'just a file\n');
    // Without this check the identifier read is what answers, and calls the file's absent identifier unreadable (or fails to mint one).
    expect(withoutTheGuard(file)).toBe(unguarded);
    const refusal = notAFolderAtOpen(file);
    expect(refusal).toEqual({
      kind: 'refused', code: 'workspace.not-a-folder',
      headline: 'This workspace is a file, not a folder',
      detail: `${file} is a file, so it cannot be opened as a workspace. Nothing was read from it or written to it. Open a folder instead.`,
    });
    expect(`${refusal?.headline} ${refusal?.detail}`).not.toMatch(/identifier|session|put back/i);
    expect(readFileSync(file, 'utf8')).toBe('just a file\n');
  });

  it('a workspace whose .rotaris is a file: names that file and the way on', () => {
    const root = scratch();
    writeFileSync(join(root, '.rotaris'), 'mine\n');
    expect(withoutTheGuard(root)).toBe(unguarded);
    expect(notAFolderAtOpen(root)).toMatchObject({
      code: 'workspace.not-a-folder',
      headline: 'The workspace\'s .rotaris is a file, not a folder',
      detail: expect.stringMatching(new RegExp(`^${join(root, '.rotaris').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is a file\\. .* Move or rename the file and open the workspace again\\.$`)),
    });
  });

  it('a folder, with or without .rotaris, and a path with nothing at it are not this case', () => {
    const bare = scratch();
    expect(notAFolderAtOpen(bare)).toBeUndefined();
    const prepared = scratch();
    mkdirSync(join(prepared, '.rotaris'));
    expect(notAFolderAtOpen(prepared)).toBeUndefined();
    expect(notAFolderAtOpen(join(bare, 'nothing-here'))).toBeUndefined();
  });

  it('the service\'s open asks this before it reads or mints the identifier', () => {
    const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8');
    const openOwn = /function openOwn\(workspaceRoot: string\): ProcessReply \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
    const asked = openOwn.indexOf('notAFolderAtOpen(workspaceRoot)');
    expect(asked).toBeGreaterThan(-1);
    expect(openOwn.indexOf('establishWorkspaceId(workspaceRoot)')).toBeGreaterThan(asked);
    expect(openOwn).toMatch(/const notAFolder = notAFolderAtOpen\(workspaceRoot\);\s*if \(notAFolder\) return notAFolder;/);
  });
});
