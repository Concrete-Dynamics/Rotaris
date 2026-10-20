## A workspace whose store cannot be opened at launch is left unopened without a word

The Windows ARM64 session's E1 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git
Bash, built at `dbf6a514`) launched the built app on a fresh profile whose `LOCALAPPDATA` was deep enough to put the workspace's
store past the engine's path limit. At store paths of 215, 252 and 253 characters the store was made and opened (a first store
is made in a sibling two characters shorter and renamed in, OQ-281, so it opens two characters past the 251 at which the
engine can create one). At 256 and 263 the open failed:

```
workspace.open refused: {"kind":"refused","code":"request.failed","headline":"SqliteError: unable to open database file"}
workspace.open refused: {"kind":"refused","code":"request.failed","headline":"StoreOpenError: could not open <path>"}
```

and in both the window painted with no workspace open and no notice of any kind on screen; the session browser's command
answered "Open a workspace before browsing sessions". The person is not told that the folder they launched on was not opened,
or why, and nothing offers a way on. The log line is the only trace. C5's first-store EPERM (part-j's `pause`,
`a-first-store-on-windows-is-refused-with-eperm-on-its-sibling-and-the-workspace-does-not-open.md`) went the same silent way.

The product does say so for one refusal: a place that holds no store raises "The session store for this workspace is not where
it is kept" with "Open Project settings" (REQ-NOTIFY-044, OQ-281; measured on this host by `store-resolution-proof`, 24 checks
passed). The other ways an open can fail — the engine's path limit, a refused create, a sharing violation — fall through to the
log.

## Specs

REQ-SESSION-043 and REQ-SESSION-089 (a store that cannot be opened is said, not shown as an empty listing or a run that never
starts); REQ-NOTIFY-044 (a refusal that blocks the person names its condition and a way on); ADR-0058 consequence 18's D11 limit,
which the restore checks before it acts but a launch does not report at all.

## Relevant files

- `apps/desktop/src/main/index.ts` — logs `workspace.open refused` and goes on with no workspace and no notice.
- `packages/store/src/resolve.ts` — `openWorkspaceStore` and `installFirstStore`, whose errors reach it as `request.failed`.
- `packages/store/src/layout.ts` — `storePathLimit` (251 on win32); whether the launch's open consults it was not read here.
