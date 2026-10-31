## A workspace path that is not a directory is reported as an unreadable identifier

When a launch is handed a path that is a file rather than a directory, the open reads `<file>/.rotaris/workspace-id`, which fails
with `ENOTDIR`. `guardedRead` (`packages/platform/src/document.ts`) treats every read error but `ENOENT` as `unreadable` with an
empty `raw`, so `establishWorkspaceId` answers `unreadable` and the workspace service refuses with
`workspace.identifier-unreadable`, headline "The workspace identifier is present but cannot be read". Nothing is present: the
workspace is not a folder. Since 2026-10-31 that refusal is raised as an error notice
(`docs/defects/fixed/an-unreadable-workspace-identifier-leaves-the-window-unopened-without-a-notice.md`), whose detail for an
empty read says only that the file "could not be read, or it is empty"; the headline's "present" is still false for this case.

Seen 2026-10-31 on the Linux host through the launch-order note beside this one, where the entry script was opened as the
workspace. A file manager handing a file to the application is the product path that would meet it.

## Specs

REQ-STARTUP-163 (a launch is handed a directory); REQ-SESSION-197 (the unreadable-identifier condition is for an identifier that is
present). What a launch handed a non-directory should do is not stated here and may be an open question.

## Relevant files

- `packages/platform/src/document.ts`: `guardedRead`, which folds `ENOTDIR`, `EACCES` and `EISDIR` into `unreadable`.
- `packages/store/src/resolve.ts`: `establishWorkspaceId`, which passes that on.
- `apps/desktop/src/workspace-service/index.ts`: `openOwn`, which refuses with the identifier's code.
- `apps/desktop/src/main/index.ts`: `workspaceFromArgv`, which does not check that the path is a directory.
