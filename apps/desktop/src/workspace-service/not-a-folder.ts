import type { ProcessReply } from '@rotaris/contracts';
import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The open's refusal of a workspace path that is not a folder, or whose `.rotaris` is not one — checked before the identifier
 * is read, so that REQ-SESSION-197's "present but cannot be read" is never claimed where no identifier file can exist. Reading
 * `<root>/.rotaris/workspace-id` under a regular file fails with ENOTDIR, which the document reader (`guardedRead`) reports as
 * unreadable like any other failed read; that is true of the read and false of the workspace: nothing was ever written there,
 * there are no recorded sessions, and there is no identifier to put back. No requirement names this case (REQ-STARTUP-163
 * speaks only of "a directory" a launch carries); these words say what was found and nothing more
 * (`docs/defects/fixed/a-workspace-path-that-is-not-a-directory-is-reported-as-an-unreadable-identifier.md`).
 *
 * Main holds and raises it as the identifier's refusal is (`main/store-notice.ts`, `WORKSPACE_REFUSALS`): no action, since
 * nothing in REQ-NOTIFY-044's vocabulary turns a file into a folder.
 */
export const NOT_A_FOLDER_CODE = 'workspace.not-a-folder';

/** `true` where something is at `path` and it is not a directory; a path with nothing at it (or one that cannot be read) is not this case. */
export type IsNonFolder = (path: string) => boolean;
const nodeIsNonFolder: IsNonFolder = (path) => { try { return !statSync(path).isDirectory(); } catch { return false; } };

/** The refusal for the first of the workspace root and its `.rotaris` that is there and not a folder; `undefined` when neither is. */
export function notAFolderAtOpen(workspaceRoot: string, isNonFolder: IsNonFolder = nodeIsNonFolder): Extract<ProcessReply, { kind: 'refused' }> | undefined {
  if (isNonFolder(workspaceRoot)) {
    return {
      kind: 'refused', code: NOT_A_FOLDER_CODE,
      headline: 'This workspace is a file, not a folder',
      detail: `${workspaceRoot} is a file, so it cannot be opened as a workspace. Nothing was read from it or written to it. Open a folder instead.`,
    };
  }
  const scope = join(workspaceRoot, WORKSPACE_SCOPE_DIR);
  if (isNonFolder(scope)) {
    return {
      kind: 'refused', code: NOT_A_FOLDER_CODE,
      headline: 'The workspace\'s .rotaris is a file, not a folder',
      detail: `${scope} is a file. The product keeps this workspace's identifier and configuration in a folder of that name, so the workspace cannot be opened while the file is there. Nothing was read from it or written to it. Move or rename the file and open the workspace again.`,
    };
  }
  return undefined;
}
