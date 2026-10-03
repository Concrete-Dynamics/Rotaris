## A permission mode written elsewhere loses to an unsaved Settings selection

Reported 2026-10-03 by plan fin12's verifier and builder (merged `b56297e` and `bafd0cf`), outside their own tasks;
recorded by plan fin13 at origin/main `8850ea2`, before the repair.

While Settings is open with an unsaved selection of the permission mode, a write of `runtime.permission_mode` made
elsewhere — the composer's permission-mode control, which writes that key alone (REQ-CONFIG-288), or any other writer —
is announced back to the window, and the Settings hook adopts the reloaded snapshot keeping its pending state
(`adopt(next, true)` in `apps/desktop/src/renderer/main.tsx`). `rebasePending`
(`packages/ui/src/settings/config-state.ts`, line 188 at `8850ea2`) keeps every runtime key whose pending value differs
from the previous saved value, and nothing in it treats `permission_mode` differently from any other key. So the
user's unsaved selection survives the reload: the control goes on showing a mode the file no longer holds and no run
is operating under, and the form stays dirty against the new file value.

## Specs

- REQ-CONFIG-423 — "For this one field the last write wins over an unsaved selection on this screen": a change to the
  field made by another surface while Settings is open lands in the pending state, and the control never continues
  to display a mode the pending state no longer holds. It is the stated exception to REQ-CONFIG-420's rule that a
  refresh never discards an edit in progress, and it reaches this field and no other.
- REQ-CONFIG-420 — names the same exception from the other side: a mode applied elsewhere displaces an unsaved
  selection.

## Relevant files

- `packages/ui/src/settings/config-state.ts` — `rebasePending`, the per-key runtime rebase that keeps the pending
  value.
- `packages/ui/src/settings/config-state.test.ts` — the rebase cases, none of which writes the permission mode
  elsewhere.
- `apps/desktop/src/renderer/main.tsx` — the Settings hook's `adopt`, which calls the rebase on a `config:changed`
  announcement.
- `apps/desktop/src/main/commands/config.ts` — `config.setField`, which writes the key and announces the reloaded
  snapshot to every window of the workspace.
