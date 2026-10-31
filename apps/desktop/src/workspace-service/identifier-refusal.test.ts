import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { establishWorkspaceId } from '@rotaris/store';
import { identifierUnreadableAtOpen, type IdentifierPlace } from './identifier-refusal.js';

/**
 * REQ-SESSION-197: the open's refusal of a workspace whose identifier cannot be read — the condition as found, that
 * nothing was written over it, and the way on by hand. Main raises it as the notice's words (`main/store-notice.ts`).
 */
describe('the open of a workspace whose identifier cannot be read (REQ-SESSION-197)', () => {
  const file = '/w/.rotaris/workspace-id';
  const rest = 'Nothing was written over it: it names this workspace\'s recorded sessions, and replacing it would detach them. Put back the identifier this workspace had — from version control or a copy of the folder — and open the workspace again. Removing the file instead opens the workspace with a new identifier and none of the sessions recorded before.';

  it('names the file, what it holds where the identifier belongs, that nothing was minted over it, and the way on', () => {
    expect(identifierUnreadableAtOpen(file, 'not-an-id\n')).toEqual({
      kind: 'refused',
      code: 'workspace.identifier-unreadable',
      headline: 'The workspace identifier is present but cannot be read',
      detail: `/w/.rotaris/workspace-id exists, but this workspace cannot be opened by what it holds. Where the identifier belongs it holds "not-an-id". ${rest}`,
    });
  });

  it('reads past the file\'s own comment header, as the identifier reader does, and shortens a long line', () => {
    const header = '# This file names this workspace to its machine-local session store.\n# Removing it detaches this workspace from its recorded sessions.\n';
    expect(identifierUnreadableAtOpen(file, `${header}v1-garbled\n`).detail).toContain('Where the identifier belongs it holds "v1-garbled".');
    expect(identifierUnreadableAtOpen(file, `${'x'.repeat(70)}\n`).detail).toContain(`it holds "${'x'.repeat(60)}…".`);
  });

  /** Where no line reads as an identifier, only what was read is spoken of: it may be comments, blanks, or the file's cut beginning. */
  describe('where nothing in what was read reads as an identifier', () => {
    const notFound = '/w/.rotaris/workspace-id exists, but this workspace cannot be opened by what it holds. Nothing that reads as an identifier was found in what was read of it. Nothing was written over it: what it holds may name this workspace\'s recorded sessions, and replacing it would detach them. If this workspace had an identifier, put it back — from version control or a copy of the folder — and open the workspace again. Removing the file instead opens the workspace with a new identifier and none of the sessions recorded before.';
    const claims = /only comments|it names this workspace's recorded sessions|Put back the identifier this workspace had/;

    it('comments only: claims neither that it holds only comments nor that it names the sessions', () => {
      const r = identifierUnreadableAtOpen(file, '# only comments\n# more comments\n');
      expect(r).toMatchObject({ headline: 'The workspace identifier is present but cannot be read', detail: notFound });
      expect(r.detail).not.toMatch(claims);
    });

    it('blank lines only: not said to be comments', () => {
      expect(identifierUnreadableAtOpen(file, '\n\n\n').detail).toBe(notFound);
    });

    it('a beginning cut before its data line (a 250-character comment): nothing said of the rest of the file', () => {
      expect(identifierUnreadableAtOpen(file, '#'.repeat(200)).detail).toBe(notFound);
    });
  });

  it('says what it holds without examining the path, where the read produced content', () => {
    let examined = 0;
    identifierUnreadableAtOpen(file, 'not-an-id\n', () => { examined += 1; return { kind: 'gone' }; });
    expect(examined).toBe(0);
  });

  /** Where the read produced nothing, `guardedRead` does not say why; each place found at the path gets its own words. */
  describe('where nothing could be read, presence is said only where it was found', () => {
    const at = (place: IdentifierPlace) => identifierUnreadableAtOpen(file, '', () => place);
    const presumes = /names this workspace's recorded sessions|Put back the identifier this workspace had/;

    it('a file this account may not read: there, not permitted, and the way on', () => {
      const r = at({ kind: 'file', size: 41, readable: false });
      expect(r.headline).toBe('The workspace identifier is present but cannot be read');
      expect(r.detail).toBe('/w/.rotaris/workspace-id is there, but this account is not permitted to read it. Nothing was written over it: what it holds may name this workspace\'s recorded sessions, and replacing it would detach them. Give this account read access to the file and open the workspace again. Removing the file instead opens the workspace with a new identifier and none of the sessions recorded before.');
    });

    it('an empty file: there and empty, naming no workspace', () => {
      const r = at({ kind: 'file', size: 0, readable: true });
      expect(r.headline).toBe('The workspace identifier file is empty');
      expect(r.detail).toMatch(/^\/w\/\.rotaris\/workspace-id is there and empty, so it names no workspace\. Nothing was written over it\. If this workspace had an identifier, put it back/);
      expect(r.detail).not.toMatch(presumes);
    });

    it('a folder of that name: said as a folder', () => {
      const r = at({ kind: 'folder' });
      expect(r).toMatchObject({ code: 'workspace.identifier-unreadable', headline: 'The workspace identifier is a folder, not a file' });
      expect(r.detail).toMatch(/^\/w\/\.rotaris\/workspace-id is a folder\. .* Move or rename the folder and open the workspace again\.$/);
      expect(r.detail).not.toMatch(presumes);
    });

    it('a path whose folder cannot be entered: names that folder, and that whether the file exists cannot be told', () => {
      const r = at({ kind: 'unreachable', blocked: '/w/.rotaris', code: 'EACCES' });
      expect(r).toEqual({
        kind: 'refused', code: 'workspace.identifier-unreadable',
        headline: 'The workspace identifier cannot be reached',
        detail: '/w/.rotaris cannot be entered with this account\'s permissions, so whether /w/.rotaris/workspace-id exists cannot be told. Nothing was written there. Give this account access to /w/.rotaris and open the workspace again.',
      });
      const vague = at({ kind: 'unreachable', code: 'EIO' });
      expect(vague.headline).toBe('The workspace identifier cannot be reached');
      expect(vague.detail).toBe('/w/.rotaris/workspace-id could not be examined (EIO), so whether it exists cannot be told. Nothing was written there. Open the workspace again once its folder can be reached.');
    });

    it('nothing there any more, and something that is not a file: neither claimed present as an identifier', () => {
      expect(at({ kind: 'gone' })).toMatchObject({ headline: 'The workspace identifier could not be read', detail: '/w/.rotaris/workspace-id could not be read, and nothing is there now. Nothing was written there. Open the workspace again.' });
      expect(at({ kind: 'other' }).headline).toBe('The workspace identifier is not a file');
      for (const place of [{ kind: 'gone' }, { kind: 'other' }, { kind: 'unreachable' }] as const) {
        expect(`${at(place).headline} ${at(place).detail}`).not.toMatch(/present|exists,|is there, but|names this workspace's recorded sessions|Put back/);
      }
    });
  });

  /** The reported shapes, on real files: the identifier read answers each as unreadable with nothing read, and this examines it. */
  describe.skipIf(process.getuid?.() === 0)('on disk, as the open meets them', () => {
    const dirs: string[] = [];
    const locked: string[] = [];
    const scratch = (): string => { const d = mkdtempSync(join(tmpdir(), 'rotaris-identifier-')); dirs.push(d); return d; };
    const lock = (p: string): void => { chmodSync(p, 0o000); locked.push(p); };
    afterEach(() => {
      for (const p of locked.splice(0)) chmodSync(p, 0o755);
      for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    });
    const refusalFor = (root: string) => {
      const ident = establishWorkspaceId(root);
      if (ident.state !== 'unreadable') throw new Error(`identifier read answered ${ident.state}`);
      expect(ident.raw).toBe('');
      return identifierUnreadableAtOpen(join(root, '.rotaris', 'workspace-id'), ident.raw);
    };

    it('an empty .rotaris that cannot be entered: names it, and claims no file', () => {
      const root = scratch();
      mkdirSync(join(root, '.rotaris'));
      lock(join(root, '.rotaris'));
      const r = refusalFor(root);
      expect(r.headline).toBe('The workspace identifier cannot be reached');
      expect(r.detail).toBe(`${join(root, '.rotaris')} cannot be entered with this account's permissions, so whether ${join(root, '.rotaris', 'workspace-id')} exists cannot be told. Nothing was written there. Give this account access to ${join(root, '.rotaris')} and open the workspace again.`);
    });

    it('a workspace inside a folder that cannot be entered, with no .rotaris: names the parent', () => {
      const parent = join(scratch(), 'locked');
      const root = join(parent, 'inner');
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'x'), '');
      lock(parent);
      const r = refusalFor(root);
      expect(r.headline).toBe('The workspace identifier cannot be reached');
      expect(r.detail).toMatch(new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} cannot be entered `));
    });

    it('an identifier file this account may not read: there, and not permitted', () => {
      const root = scratch();
      mkdirSync(join(root, '.rotaris'));
      const id = join(root, '.rotaris', 'workspace-id');
      writeFileSync(id, 'v1-0123456789abcdef0123456789abcdef\n');
      lock(id);
      const r = refusalFor(root);
      expect(r.headline).toBe('The workspace identifier is present but cannot be read');
      expect(r.detail).toMatch(new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} is there, but this account is not permitted to read it\\. `));
    });

    it('a first line of 250 "#" before a data line: the read is cut inside the comment, and no file content is claimed', () => {
      const root = scratch();
      mkdirSync(join(root, '.rotaris'));
      const id = join(root, '.rotaris', 'workspace-id');
      writeFileSync(id, `${'#'.repeat(250)}\nnot-an-id\n`);
      const ident = establishWorkspaceId(root);
      if (ident.state !== 'unreadable') throw new Error(`identifier read answered ${ident.state}`);
      const r = identifierUnreadableAtOpen(id, ident.raw);
      expect(r.detail).toContain('Nothing that reads as an identifier was found in what was read of it.');
      expect(r.detail).not.toMatch(/only comments|it names this workspace's recorded sessions/);
    });

    it('a .rotaris that is a file, met without the service\'s guard: not called a folder that cannot be entered', () => {
      const root = scratch();
      writeFileSync(join(root, '.rotaris'), 'x');
      const r = refusalFor(root);
      expect(r.detail).not.toMatch(/cannot be entered/);
      expect(r.headline).toBe('The workspace identifier cannot be reached');
    });

    it('an empty identifier file, and a folder in its place', () => {
      const empty = scratch();
      mkdirSync(join(empty, '.rotaris'));
      writeFileSync(join(empty, '.rotaris', 'workspace-id'), '');
      expect(refusalFor(empty).headline).toBe('The workspace identifier file is empty');
      const folder = scratch();
      mkdirSync(join(folder, '.rotaris', 'workspace-id'), { recursive: true });
      expect(refusalFor(folder).headline).toBe('The workspace identifier is a folder, not a file');
    });
  });
});
