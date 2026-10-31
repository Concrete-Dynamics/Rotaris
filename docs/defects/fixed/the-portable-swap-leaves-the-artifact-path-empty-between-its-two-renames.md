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

## Repaired — 2026-10-31

*Falsified by the repair: `applyPortable` no longer renames the target to `<name>.old`, and no longer renames the backup
back when the final rename fails. The description above is what it did until this date.*

The shape this note suggested, with a copy and not a hard link. `applyPortable` places `<name>.update`, removes a previous
`<name>.old`, **copies** the target to `<name>.old` through a new port method `StrategyFiles.copyAside` (`electron.ts`:
`fsp.copyFile` with `COPYFILE_EXCL`, a sibling of the existing `copyFile`), and then renames `<name>.update` onto the target
in one step. The target is never the source of a rename, so its path names the previous executable until that rename
replaces it with the new one. When the final rename fails, the target was never touched: nothing is renamed back, and the
fresh `<name>.old` and `<name>.update` are removed. A copy aside that fails removes its partial `<name>.old` and the placed
sibling. The end state and REQ-STARTUP-115's cleanup are unchanged.

Pinned in `strategies.test.ts` over a fake volume that records what the target holds after every operation. It holds the
previous bytes after each step until the rename and the new ones after it, and the original bytes throughout every failure
case. Not executed on a Windows host. That `fsp.rename` replaces an existing file in one step there is Node's documented
behaviour (libuv's `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`), not a measurement.
