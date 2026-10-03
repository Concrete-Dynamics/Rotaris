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

## Repaired 2026-10-03

`rebasePending` (`packages/ui/src/settings/config-state.ts`) now treats the permission mode as REQ-CONFIG-423 states: when
a reloaded snapshot's `runtime.permission_mode` differs from the one the screen last saved, the file's value displaces an
unsaved selection, so the control shows the mode the composer (or any other writer) put in force, and the displaced
selection no longer counts as an edit. Every other field keeps an edit in progress (REQ-CONFIG-420), and a reload that did
not change the mode — a sign-in's, the diagnostics toggle's — keeps the unsaved selection. The screen shows nothing else
when its selection is overwritten: REQ-CONFIG-423 asks only that the control show the mode the pending state holds.

What the snapshot cannot tell apart is left to the owner as
[OQ-197](../../architecture/open-questions.md) (a write of the value the file already holds, while a different selection
is unsaved): the build proceeds under the change reading and keeps the selection.

Evidence:

- `packages/ui/src/settings/config-state.test.ts`: "REQ-CONFIG-423: a permission mode written elsewhere wins over an
  unsaved selection, and only that field" (red on the unrepaired file: `Expected: "autonomous"`, `Received: "plan"`), and
  "REQ-CONFIG-420: a reload that did not change the permission mode keeps the unsaved selection".
- `pnpm settings-proof`, launch 11′ (`reload-last-write`), no provider: `restricted` picked on the Runtime category and
  left unsaved, then `config.setField` of `runtime.permission_mode: autonomous` sent from the renderer exactly as the
  composer's control sends it (`session-actions.ts`). Against a build with the hook repaired and this change reverted the
  launch failed with `{"unsavedFlag":true,"status":"Unsaved changes","breaker":true,"mode":"restricted"}`; repaired, it
  reads `{"unsavedFlag":false,"status":"All changes saved","breaker":true,"mode":"autonomous"}` (load average about 6 on
  4 CPUs).

Not measured here: the composer's own control clicked in the Workspace while Settings holds the selection, which needs two
views at once. The live check that would show it is a live-run scenario switching the permission mode from the composer
during a run with an unsaved Settings selection; none of the current scenarios does, and the orchestrator decides whether
to add one.
