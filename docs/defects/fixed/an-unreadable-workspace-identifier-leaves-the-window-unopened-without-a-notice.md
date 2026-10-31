## An unreadable workspace identifier leaves the window unopened without a notice

A launch on a workspace whose `.rotaris/workspace-id` is present but holds no identifier the product can read painted the
window with no workspace open and nothing on screen. The workspace service refused the open with
`workspace.identifier-unreadable` and minted nothing over the file, as REQ-SESSION-197 requires, but main's
`openWorkspaceInner` raised a notice only for the refusals in `STORE_REFUSALS` (`workspace.store-missing`,
`workspace.store-displaced`), so this one reached the log alone:

```
[main] info  workspace.open refused: {"kind":"refused","code":"workspace.identifier-unreadable","headline":"The workspace identifier is present but cannot be read","detail":"It will not be minted over (REQ-SESSION-197). Content begins: "}
```

Every workspace-scoped command in that window then answered "Open a workspace …" (`session.list`: "Open a workspace before
browsing sessions"), though the window held one and the product could not tell which store was its. Reproduced 2026-10-31 on the
Linux host by launching the built tree headless on such a workspace. (That reproduction's empty "Content begins:" was a second
defect, not this one's: its launch line put Chromium switches before the entry script, so the script itself was opened as the
workspace — `docs/defects/a-dev-launch-with-a-switch-before-its-entry-script-opens-the-script-as-the-workspace.md`.)

## Specs

REQ-SESSION-197 (an identifier present but unreadable MUST be reported as a condition for the user to resolve, never
overwritten); REQ-SESSION-043 (the listing must not answer as though the workspace had no sessions, or none were open, where the
product cannot tell); REQ-NOTIFY-044 (a notice's action, where it carries one, is a member of the closed vocabulary).

## Relevant files

- `apps/desktop/src/main/index.ts`: `openWorkspaceInner`, which raised and held only the store's refusals.
- `apps/desktop/src/main/store-notice.ts`: `STORE_REFUSALS`, the set that decided which refusals were said.
- `apps/desktop/src/workspace-service/index.ts`: `openOwn`, whose refusal detail named a requirement id and not the file.

## Outcome — repaired 2026-10-31 (`fix/unreadable-workspace-id-is-reported`)

- The refusal's words moved to `workspace-service/identifier-refusal.ts` (pure, pinned by its test): the file's path, what it
  holds where the identifier belongs (the first non-comment line, or that it could not be read), that nothing was written over
  it and why, and the two ways on by hand — put back the identifier, or remove the file and open with a new identifier and none
  of the sessions recorded before.
- `main/store-notice.ts` gains `WORKSPACE_REFUSALS` (named `IDENTIFIER_REFUSALS` until the review's rework, which added
  `workspace.not-a-folder` to it), a set of its own beside `STORE_REFUSALS` (this is a condition of the workspace itself, not of
  the store's place), and `holdOpenRefusal`, which `openWorkspaceInner` now calls: the refusal is
  held per root in `storeRefusals`, so `answerUnderHeldRefusal` and the listing answer it instead of "open a workspace", and it
  is raised as one persistent error notice, once while held; the successful open that clears the hold withdraws it.
- The notice carries no action. Settings › Project (OQ-281) is where a place holding no store is resolved, but both of its
  resolutions refuse an unreadable identifier themselves (the restore, `packages/workspace/src/restore.ts`; the new store,
  `workspace-service/store-establish.ts`), and nothing else in REQ-NOTIFY-044's vocabulary repairs a file.
- Evidence: `store-notice.test.ts` drives `holdOpenRefusal` with a recording report (red with the identifier refusal dropped from
  it: 4 tests); the built app launched headless on `not-an-id` shows the error notice with no action, and `session.list` and
  `config.read` answer `workspace.identifier-unreadable` (`pnpm app:drive`); the same launch built without the main-process
  change shows no notice. `store-resolution-proof` needs a display and was not run on that host.
- Review rework (PR #42): a hold that replaces another for the same root — the identifier put back over an empty store place,
  then opened again; or the same store refusal raised again — now withdraws the notice it held as the new one is raised
  (`holdOpenRefusal` takes the notice store's `dismiss`). Before, the map kept only the newer id, so the older notice could
  never be withdrawn and stood beside the workspace once it opened. The same workspace refusal seen again still raises nothing.
  `store-notice.test.ts` pins both, and pins `openWorkspaceInner`'s call from `index.ts`'s source. A path that is a file was
  shown this condition's words; it now has its own
  (`docs/defects/fixed/a-workspace-path-that-is-not-a-directory-is-reported-as-an-unreadable-identifier.md`).
- Review round 2 (PR #42): an empty read was said as "present but cannot be read … could not be read, or it is empty …
  it names this workspace's recorded sessions" where nothing may be there: a `.rotaris` that cannot be entered (mode 000,
  empty), and a workspace inside a folder that cannot be entered with no `.rotaris` at all. `guardedRead` answers every failed
  read but ENOENT as unreadable with no content, so the empty `raw` alone cannot tell a file from an unreachable path.
  `identifierUnreadableAtOpen` now examines the path where the read produced nothing (`stat`, then `access`): a file this
  account may not read, an empty file, a folder in its place, something that is not a file, and a path whose first folder
  that cannot be entered is named, with whether the file exists said to be unknown. Each has its own headline and detail;
  the case with content is unchanged. `guardedRead` is unchanged. `identifier-refusal.test.ts` pins each, and on real files
  the two reported shapes, an unreadable file, an empty file and a folder (9 tests, all red on the earlier head).
