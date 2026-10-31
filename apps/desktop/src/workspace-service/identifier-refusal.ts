import type { ProcessReply } from '@rotaris/contracts';
import { accessSync, constants, statSync } from 'node:fs';
import { dirname, join, parse, relative, sep } from 'node:path';

/**
 * REQ-SESSION-197: the open's refusal of a workspace whose identifier cannot be read — reported as a condition for the person
 * to resolve and never minted over, since the file is the only thing binding the workspace to its recorded sessions. The
 * words are pure: the file, what was read from it and what was found at its path in, the service's words out, so a test pins
 * every one. Main holds this refusal and raises it as a notice (`main/store-notice.ts`, `WORKSPACE_REFUSALS`), in these words.
 *
 * The way on is the person's, by hand, outside the product: neither action in Settings › Project resolves it (the restore
 * refuses an unreadable identifier, `packages/workspace/src/restore.ts`; so does the new store, `store-establish.ts`), so
 * the detail names the ways that do and what each leaves.
 */
export const IDENTIFIER_UNREADABLE_CODE = 'workspace.identifier-unreadable';
export const IDENTIFIER_UNREADABLE_HEADLINE = 'The workspace identifier is present but cannot be read';

/**
 * What is at the identifier's path, asked only when the read produced nothing. The document reader (`guardedRead`) answers
 * every failed read but ENOENT as unreadable with no content, so an empty `raw` alone does not say whether a file is there:
 * a file this account may not read, an empty file, a folder of that name, and a path one of whose folders cannot be entered
 * (where whether the file exists cannot be told) all arrive as the same empty read.
 */
export type IdentifierPlace =
  | { readonly kind: 'file'; readonly size: number; readonly readable: boolean }
  | { readonly kind: 'folder' }
  | { readonly kind: 'other' }
  /** Nothing is there now: it went between the read and the look. */
  | { readonly kind: 'gone' }
  /** The path could not be examined; `blocked` is the first folder on it that cannot be entered, where one was found. */
  | { readonly kind: 'unreachable'; readonly blocked?: string; readonly code?: string };
export type ExamineIdentifier = (file: string) => IdentifierPlace;

/** The first folder from the filesystem's root down to `dir` that this account cannot enter; `undefined` where none is found. */
function firstUnenterable(dir: string): string | undefined {
  const { root } = parse(dir);
  let at = root;
  for (const part of ['', ...relative(root, dir).split(sep).filter(Boolean)]) {
    at = join(at, part);
    try { accessSync(at, constants.X_OK); } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'EACCES' && statSync(at, { throwIfNoEntry: false })?.isDirectory() ? at : undefined;
    }
  }
  return undefined;
}

const nodeExamine: ExamineIdentifier = (file) => {
  try {
    const s = statSync(file);
    if (s.isDirectory()) return { kind: 'folder' };
    if (!s.isFile()) return { kind: 'other' };
    let readable = true;
    try { accessSync(file, constants.R_OK); } catch { readable = false; }
    return { kind: 'file', size: s.size, readable };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { kind: 'gone' };
    const blocked = firstUnenterable(dirname(file));
    return { kind: 'unreachable', ...(blocked ? { blocked } : {}), ...(code ? { code } : {}) };
  }
};

/** The way on where the file is there with something in it: what it holds is kept, and both ways name what they leave. */
const KEPT = 'Nothing was written over it: what it holds may name this workspace\'s recorded sessions, and replacing it would detach them.';
const REMOVE = 'Removing the file instead opens the workspace with a new identifier and none of the sessions recorded before.';

function refused(headline: string, detail: string): Extract<ProcessReply, { kind: 'refused' }> {
  return { kind: 'refused', code: IDENTIFIER_UNREADABLE_CODE, headline, detail };
}

/** The words where the read produced nothing: each says only what was found at the path. */
function nothingRead(file: string, place: IdentifierPlace): Extract<ProcessReply, { kind: 'refused' }> {
  switch (place.kind) {
    case 'file':
      if (place.size === 0) {
        return refused('The workspace identifier file is empty', `${file} is there and empty, so it names no workspace. Nothing was written over it. If this workspace had an identifier, put it back — from version control or a copy of the folder — and open the workspace again. Removing the empty file instead opens the workspace with a new identifier.`);
      }
      return refused(IDENTIFIER_UNREADABLE_HEADLINE, place.readable
        ? `${file} is there, but reading it failed. ${KEPT} Open the workspace again once it can be read. ${REMOVE}`
        : `${file} is there, but this account is not permitted to read it. ${KEPT} Give this account read access to the file and open the workspace again. ${REMOVE}`);
    case 'folder':
      return refused('The workspace identifier is a folder, not a file', `${file} is a folder. The product keeps this workspace's identifier in a file of that name, so the workspace cannot be opened while the folder is there. Nothing was read from it or written to it. Move or rename the folder and open the workspace again.`);
    case 'other':
      return refused('The workspace identifier is not a file', `${file} is there but is not a file. The product keeps this workspace's identifier in a file of that name, so the workspace cannot be opened while it is there. Nothing was read from it or written to it. Move or rename it and open the workspace again.`);
    case 'gone':
      return refused('The workspace identifier could not be read', `${file} could not be read, and nothing is there now. Nothing was written there. Open the workspace again.`);
    case 'unreachable':
      return refused('The workspace identifier cannot be reached', place.blocked
        ? `${place.blocked} cannot be entered with this account's permissions, so whether ${file} exists cannot be told. Nothing was written there. Give this account access to ${place.blocked} and open the workspace again.`
        : `${file} could not be examined${place.code ? ` (${place.code})` : ''}, so whether it exists cannot be told. Nothing was written there. Open the workspace again once it can be examined.`);
  }
}

/**
 * The refusal for an identifier that could not be read. Where the read produced content, the file is there and what it holds
 * is said, as the identifier reader reads it: the first line that is neither blank nor a `#` comment. `raw` is only the
 * file's beginning (`guardedRead` keeps its first 200 characters), so where no such line is in it nothing is said of the
 * rest of the file — it may hold comments, blank lines, or a line past what was read — and the way on is hedged as `KEPT` is.
 * Where the read was cut (`truncated`) and the line found is the last in `raw`, the line may run on past the cut, so it is
 * quoted as how the line begins, never as all it holds.
 * Where the read produced nothing, the path is examined first (`examine`), so presence is never claimed where it was not found.
 */
export function identifierUnreadableAtOpen(file: string, read: string | { readonly raw: string; readonly truncated?: true }, examine: ExamineIdentifier = nodeExamine): Extract<ProcessReply, { kind: 'refused' }> {
  const { raw, truncated } = typeof read === 'string' ? { raw: read, truncated: undefined } : read;
  if (raw === '') return nothingRead(file, examine(file));
  const lines = raw.split(/\r?\n/).map((s) => s.trim());
  const at = lines.findIndex((s) => s.length > 0 && !s.startsWith('#'));
  const line = at === -1 ? undefined : lines[at];
  if (line === undefined) {
    return refused(IDENTIFIER_UNREADABLE_HEADLINE, `${file} exists, but this workspace cannot be opened by what it holds. Nothing that reads as an identifier was found in what was read of it. ${KEPT} If this workspace had an identifier, put it back — from version control or a copy of the folder — and open the workspace again. ${REMOVE}`);
  }
  const shown = line.length > 60 ? `${line.slice(0, 60)}…` : line;
  const holds = truncated && at === lines.length - 1
    ? `Where the identifier belongs it holds a line beginning "${shown}"; the file is longer than the part that was read, so the line may run on past it.`
    : `Where the identifier belongs it holds "${shown}".`;
  return refused(IDENTIFIER_UNREADABLE_HEADLINE, `${file} exists, but this workspace cannot be opened by what it holds. ${holds} Nothing was written over it: it names this workspace's recorded sessions, and replacing it would detach them. Put back the identifier this workspace had — from version control or a copy of the folder — and open the workspace again. ${REMOVE}`);
}
