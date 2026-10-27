## A Save or Discard answers before the stale close guard is taken down

## Outcome (2026-10-15, fin47 `fin47-rename-and-optionals`): repaired; the note written at review, after the repair

`settleGuard` (`apps/desktop/src/renderer/guard-question.ts`) answers the Settings screen's open guard question, and an answer
that lets the close go ahead (a Save that succeeded, a Discard) sets `window.__rotarisCloseGuard` to `undefined` first,
synchronously, before the answer reaches main. A Cancel, or a Save that failed, leaves the guard up, the form being still dirty.
The guard dialog's three answers in `useConfiguration` (`apps/desktop/src/renderer/main.tsx`) go through it and no longer resolve
the question bare.

Pinned by `apps/desktop/src/renderer/guard-question.test.ts`: "Save that succeeded, or Discard: the guard is gone when the answer
arrives" and "Cancel, or a Save that failed: the guard stays up" over the pure helper, and "answers Save, Discard and Cancel through
settleGuard, never by resolving the question bare" over the hook's source (the pattern `settings-form-wiring.test.ts` states), which
fails on `f37f49d`, where each answer called `g.resolve(…)` directly. `06-sequences.md`'s update paragraph says so.

**Not shown:** the race itself was never reproduced. Its path is the update's hand-off (`Restart now`, the installer's `Update
now`), reachable only in a packaged Windows build. The builder re-ran `settings-proof` (its Save/Discard guard dialog; exit 0, load
1.03) and `exit-trace-proof` (37 checks, load 1.36 to 2.62) green on the repaired build. This note was written by the bundle's
reviewer: the builder carried the finding as an optional one and repaired it without a note, which the task's "record a defect
note before code" required.

Noticed 2026-10-14 by the reviewer of fin46 (`fin46-accept1-9`, optional finding on Task 2), and flagged by that bundle's builder.

The Settings screen publishes its close guard as `window.__rotarisCloseGuard` from a React effect while the form is dirty, and
takes it down from the same effect when `dirty` turns false. Main asks it in two steps at the update's hand-off: a probe
(`RENDERER_UNSAVED_PROBE_SCRIPT`, `typeof window.__rotarisCloseGuard === "function"`), then, for a window the probe reports dirty,
the guard itself (`askRendererGuard`). The guard dialog's Save resolved the question as soon as the save returned, and its Discard
at once; the effect that takes the guard down is passive, so it runs after the next render commits. A probe arriving between the
answer and that effect finds the stale guard, whose closure still holds `dirty = true`, and asking it opens the Save/Discard/Cancel
dialog a second time for a form that is already saved or discarded.

## Specs

- `REQ-SHELL-124`: the save/discard/cancel dialog, put once for a close the person started; a second dialog for an answered
  question contradicts it.
- `REQ-CONFIG-287` and [OQ-311](../../architecture/open-questions/61-spikes-and-later-questions-28.md#oq-311): the update's `Restart now` and `Update now` are
  user-initiated closes for the guard, one question per window, and an asking while the question is open joins it.

## Relevant files

- `apps/desktop/src/renderer/guard-question.ts` — `joinOrAsk`, and `settleGuard`, the repair.
- `apps/desktop/src/renderer/main.tsx` — `useConfiguration`: the effect that publishes and takes down the guard, and the guard
  dialog's three answers.
- `apps/desktop/src/main/main-windows.ts` — `RENDERER_UNSAVED_PROBE_SCRIPT` and `RENDERER_CLOSE_GUARD_SCRIPT`, what main asks.
- `apps/desktop/src/main/index.ts` — the update's `confirmUnsaved`: the probe, then the asking.
