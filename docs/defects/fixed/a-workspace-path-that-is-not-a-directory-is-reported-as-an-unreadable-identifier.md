## A workspace path that is not a directory is reported as an unreadable identifier

When a launch is handed a path that is a file rather than a directory, the open reads `<file>/.rotaris/workspace-id`, which fails
with `ENOTDIR`. `guardedRead` (`packages/platform/src/document.ts`) treats every read error but `ENOENT` as `unreadable` with an
empty `raw`, so `establishWorkspaceId` answers `unreadable` and the workspace service refuses with
`workspace.identifier-unreadable`, headline "The workspace identifier is present but cannot be read". Nothing is present: the
workspace is not a folder. The same holds for a folder whose `.rotaris` is a file.

From the first commits of `fix/unreadable-workspace-id-is-reported` that refusal was raised as an error notice
(`docs/defects/fixed/an-unreadable-workspace-identifier-leaves-the-window-unopened-without-a-notice.md`), so for a path that is a
file the person was shown, word for word (launch on `/tmp/e2e42/afile`, a file holding `just a file`):

> **The workspace identifier is present but cannot be read**
> /tmp/e2e42/afile/.rotaris/workspace-id could not be read, or it is empty. Nothing was written over it: it names this
> workspace's recorded sessions, and replacing it would detach them. Put back the identifier this workspace had — from version
> control or a copy of the folder — and open the workspace again. Removing the file instead opens the workspace with a new
> identifier and none of the sessions recorded before.

None of it is true of a file: nothing was ever written there, there are no recorded sessions, and there is no identifier to put
back or file to remove. Before that branch this case reached the log alone; the branch put the false words on screen, and the
review of its pull request (#42) found it. Seen first on 2026-10-31 on the Linux host through the launch-order note
(`docs/defects/a-dev-launch-with-a-switch-before-its-entry-script-opens-the-script-as-the-workspace.md`), where the entry script
was opened as the workspace. A file manager handing a file to the application is the product path that meets it.

## Specs

REQ-SESSION-197 (the unreadable-identifier condition is for an identifier that is present). REQ-STARTUP-163 speaks only of "a
directory" a launch carries; no requirement says what a launch handed a non-directory does, so the repair says what was found
and nothing more, and mints no requirement.

## Relevant files

- `packages/platform/src/document.ts`: `guardedRead`, which folds `ENOTDIR`, `EACCES` and `EISDIR` into `unreadable`.
- `packages/store/src/resolve.ts`: `establishWorkspaceId`, which passes that on.
- `apps/desktop/src/workspace-service/index.ts`: `openOwn`, which refused with the identifier's code.
- `apps/desktop/src/main/index.ts`: `workspaceFromArgv`, which does not check that the path is a directory.

## Outcome — repaired 2026-10-31 (`fix/unreadable-workspace-id-is-reported`, PR #42's rework)

- The workspace service's open asks first whether the root, then its `.rotaris`, is there and not a folder
  (`workspace-service/not-a-folder.ts`, `notAFolderAtOpen`, before `establishWorkspaceId`), and refuses with its own code,
  `workspace.not-a-folder`: "This workspace is a file, not a folder" / "<path> is a file, so it cannot be opened as a workspace.
  Nothing was read from it or written to it. Open a folder instead." — or, for `.rotaris`, "The workspace's .rotaris is a file,
  not a folder", naming that file, that the workspace cannot open while it is there, and to move or rename it.
- Main holds and raises it as it does the unreadable identifier (`main/store-notice.ts`, `WORKSPACE_REFUSALS`): one error
  notice, once while held, no action, and the window's workspace-scoped refusals answer it instead of "Open a workspace first".
- `guardedRead` is unchanged. Mapping `ENOTDIR` to `absent` there (as `packages/config/src/load.ts` does for a configuration
  file) would be true of the identifier file but would send the open on to mint one under a file, which fails and reaches the
  log alone as `request.failed`; and it would change every reader of the shared primitive. The check sits at the open, where
  the workspace root is known.
- Evidence: `not-a-folder.test.ts` (real files in a scratch directory; the service's open pinned to ask before the identifier is
  read); `store-notice.test.ts` (held, raised once, no action); the built app launched headless on a file shows the new notice
  and none of the identifier's words.
