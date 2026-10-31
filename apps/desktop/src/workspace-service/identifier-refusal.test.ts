import { describe, expect, it } from 'vitest';
import { identifierUnreadableAtOpen } from './identifier-refusal.js';

/**
 * REQ-SESSION-197: the open's refusal of a workspace whose identifier file is present but cannot be read — the condition, that
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
    expect(identifierUnreadableAtOpen(file, header).detail).toContain('this workspace cannot be opened by what it holds. It holds only comments.');
  });

  it('claims nothing about the file where nothing could be read (a read refused, or an empty file)', () => {
    expect(identifierUnreadableAtOpen(file, '').detail).toBe(`/w/.rotaris/workspace-id could not be read, or it is empty. ${rest}`);
  });
});
