## The live run's closing-replace check passes with no closing replace

`PD-TOOLS-008` revision 3 (OQ-255) lets a coordinator's `replace` close a delegated item once every child serving it has
ended. The live run checks it as "no closing todo replace left an item IN_PROGRESS once every child serving it had ended"
(`restoredOverClose`, `heldItemReading` in `apps/desktop/scripts/lib/coordinator-todo.mjs`), and prints PASS whenever that list
is empty — including when no coordinator sent a closing `replace` at all, which is every pack so far. At `0bc3eee` (pack
`2026-10-13T12-18-40-282Z`) the three coordinating sessions' only root `replace` was the opening write (edit `#8`, resume `#2`,
requirements `#19`), every close was an `update`, and the check read PASS with nothing measured
(`live-run-0bc3eee-default.log`, line 203). No prompt of the live run asks a coordinator to close with a `replace`, so a
default pack can never exercise the revision, and its PASS says otherwise.

Recorded 2026-10-13 by fin41 (item N65) before the repair. A proof that cannot fail is a finding, not a pass
(`terminal-shapes.test.ts`'s header, after `codebase.md`'s finding of 2026-09-12).

## Specs

- None in the product: revision 3 is built and pinned (`tools.test.ts`, `pnpm mission-proof` item 1e). The fault is the
  harness's: its check claims a live measure it never took. `PD-TOOLS-008` revision 3's first execution and OQ-255 both name
  the next default run's edit session as the measure.

## Relevant files

- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `heldItemReading`'s `restoredOverClose`, which has no count of the closes
  it looked at.
- `apps/desktop/scripts/live-run.mjs` — the `restoredOverClose` check in `checkCoordinatorTodo`, and the edit scenario's prompt,
  which never asks for a closing `replace`.
- `apps/desktop/scripts/lib/coordinator-todo.test.ts` — the reading's tests.
