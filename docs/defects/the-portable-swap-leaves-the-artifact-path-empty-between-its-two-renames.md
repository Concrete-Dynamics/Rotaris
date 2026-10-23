## The portable swap leaves the artifact's path empty between its two renames

Noticed 2026-10-22 while reading the updater for R-084's plan (`docs/architecture/background-update-plan.md` §1); read, not
run. `applyPortable` renames the target to `<name>.old` and only then renames `<name>.update` onto the target. Between the
two renames the path the user starts names no file. A process ended there — killed, crashed, the machine losing power —
leaves only `<name>.old` and `<name>.update` beside each other, and no launch can repair it: the file a user double-clicks
is gone, and REQ-STARTUP-115's cleanup runs only from a launch of that file. The rollback inside the function (renaming the
backup back when the second rename fails) covers a failed rename, not an interrupted process. Never executed on a Windows
artifact: the portable does not exist yet (first-release plan §4.5).

On Windows a rename onto an existing file replaces it in one step, so the backup can be made first (a hard link on the same
volume, or a copy) and the new file renamed over the target, leaving the path naming the old or the new executable at every
instant. REQ-STARTUP-176 (R-084) states that requirement; `PD-STARTUP-008` narrows REQ-STARTUP-125's order to it. Repairing
it is scheduled in the plan's PR-2, not done by this note.

## Specs

- REQ-STARTUP-126: "should any stage fail, what is installed remains byte-for-byte what it was before the attempt" — an
  interruption between the renames leaves no artifact at the path.
- REQ-STARTUP-125: the order it prescribes ("renamed to `<name>.old`, and the new file SHALL then be moved into the target
  path") is the one that opens the window; narrowed by `PD-STARTUP-008` (6).
- REQ-STARTUP-176 (decided, R-084): the path names a complete executable at every instant.

## Relevant files

- `apps/desktop/src/main/updater/strategies.ts` — `applyPortable`, the two `files.rename` calls.
- `apps/desktop/src/main/updater/electron.ts` — the `rename` port (`fsp.rename`).
