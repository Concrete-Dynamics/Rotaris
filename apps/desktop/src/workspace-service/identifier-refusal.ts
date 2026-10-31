import type { ProcessReply } from '@rotaris/contracts';

/**
 * REQ-SESSION-197: the open's refusal of a workspace whose identifier file is present but cannot be read — reported as a
 * condition for the person to resolve and never minted over, since the file is the only thing binding the workspace to its
 * recorded sessions. Pure: the file and what was read from it in, the service's words out, so a test pins every one. Main
 * holds this refusal and raises it as a notice (`main/store-notice.ts`, `IDENTIFIER_REFUSALS`), in these words.
 *
 * The way on is the person's, by hand, outside the product: neither action in Settings › Project resolves it (the restore
 * refuses an unreadable identifier, `packages/workspace/src/restore.ts`; so does the new store, `store-establish.ts`), so
 * the detail names the two that do — the identifier put back, or the file removed — and what each leaves.
 */
export const IDENTIFIER_UNREADABLE_CODE = 'workspace.identifier-unreadable';
export const IDENTIFIER_UNREADABLE_HEADLINE = 'The workspace identifier is present but cannot be read';

/**
 * What was found, as the identifier reader reads the file: the first line that is neither blank nor a `#` comment. An empty
 * `raw` is a read that failed or a file with nothing in it — the reader does not say which — so nothing more is claimed for it.
 */
function found(file: string, raw: string): string {
  if (raw === '') return `${file} could not be read, or it is empty.`;
  const line = raw.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0 && !s.startsWith('#'));
  const holds = line === undefined ? 'It holds only comments.' : `Where the identifier belongs it holds "${line.length > 60 ? `${line.slice(0, 60)}…` : line}".`;
  return `${file} exists, but this workspace cannot be opened by what it holds. ${holds}`;
}

export function identifierUnreadableAtOpen(file: string, raw: string): Extract<ProcessReply, { kind: 'refused' }> {
  return {
    kind: 'refused',
    code: IDENTIFIER_UNREADABLE_CODE,
    headline: IDENTIFIER_UNREADABLE_HEADLINE,
    detail: `${found(file, raw)} Nothing was written over it: it names this workspace's recorded sessions, and replacing it would detach them. Put back the identifier this workspace had — from version control or a copy of the folder — and open the workspace again. Removing the file instead opens the workspace with a new identifier and none of the sessions recorded before.`,
  };
}
