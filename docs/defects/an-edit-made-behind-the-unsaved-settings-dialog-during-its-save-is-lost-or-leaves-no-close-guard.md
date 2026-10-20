## An edit made behind the unsaved-settings dialog during its Save is lost, or leaves no close guard

fin47's reviewer asked whether `settleGuard` (`apps/desktop/src/renderer/guard-question.ts`, called from `useConfiguration`
in `apps/desktop/src/renderer/main.tsx`) can leave no guard published. It takes the window's close guard down at once on a
Save that succeeded, and it relies on the effect keyed on `dirty` to publish the guard again. A Save that succeeds while
`dirty` stays true would leave `window.__rotarisCloseGuard` unset until `dirty` next changes. The reviewer thought this
unreachable because the dialog is modal. **It is reachable by keyboard.** `UnsavedGuardDialog`
(`packages/ui/src/settings/ConfigSettings.tsx`) has a backdrop and `aria-modal="true"`, but nothing holds focus inside it and
nothing behind it is `inert`. Driven at `57264dbb` (bundle `loc1-main-rejection`, 2026-10-20; Windows 11 ARM64, but nothing
here is platform-specific), with `pnpm app:drive`: the form was made dirty (large_model's reasoning strength set to High),
and leaving Settings raised the dialog with focus on Save. Tab moved focus out of the dialog after Cancel, to the status
strip. 33 Shift+Tab from there reached the large_model reasoning select behind the dialog, and a typed `m` changed it from
High to Max while the dialog stayed open.

What a keystroke there does, read from the code (the timing was not driven):
- **During the Save's round trip, the edit is lost.** `onSave` sends the form as it stood at the click, then
  `adopt(reply, false)` sets `{ saved: fresh, pending: fresh }`. An edit made while the save was in flight is overwritten,
  and the form reads clean. No Discard was chosen and nothing says the edit went.
- **Between that `adopt` and React's render, the guard stays down while the form is dirty.** `adopt`'s update and
  `settleGuard` run in one microtask chain, and the render is scheduled after it. A discrete input event handled first queues
  its change after `adopt`'s, so the render commits `fresh` plus the edit, and `dirty` is true before and after. The effect
  does not run again, so `__rotarisCloseGuard` stays as `settleGuard` left it, unset. A window close or the update's hand-off
  then finds no guard, and the dirty form is closed without the question. The navigation guard is not affected: `settleGuard`
  does not touch it.

Recorded by bundle `loc1-main-rejection` (task 2) instead of the comment the task would otherwise have written. Not repaired.
Containing focus in the dialog (or making what is behind it `inert`) closes both. Re-publishing the guard from the Save
answer when the form is still dirty closes the second only.

## Specs

REQ-SHELL-124: "Discard restores the saved values and proceeds", and the same gate protects "closing the window". The first
case discards an edit with no Discard. The second leaves the window's close unprotected while settings are unsaved, against
REQ-SHELL-119's guard (1) and REQ-CONFIG-286 ("The unsaved-changes guard returns immediately when the form is clean",
which implies it asks while the form is dirty). The specification does not say whether this dialog holds focus.
REQ-SHELL-055 calls such dialogs modal surfaces that answer Escape themselves.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx`: `UnsavedGuardDialog`, a backdrop with `aria-modal`, no focus containment.
- `apps/desktop/src/renderer/main.tsx`: `useConfiguration`, its `onSave` (`adopt(…, false)`), the guard effect keyed on
  `[dirty, guard]`, and the dialog's `onSave` calling `settleGuard`.
- `apps/desktop/src/renderer/guard-question.ts`: `settleGuard`, which takes the close guard down on a proceeding answer.
- `packages/ui/src/settings/config-state.ts`: `adoptSnapshot`, where `keepPending: false` replaces the pending half.
- `packages/ui/src/commands/CommandPalette.tsx`: a dialog that does hold focus, for comparison.
