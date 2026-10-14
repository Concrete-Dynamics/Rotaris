## A refused hook-review notice action is reported only to the renderer console

The unreviewed-hooks notice offers `open-hook-review` naming its workspace (REQ-NOTIFY-224, ESC-34), and the renderer's
`dispatchNoticeAction` sends `hooks.review {workspace}` for it. When main refuses — "Open a workspace before reviewing its
hooks" (a window reached with no workspace open, its store refused, OQ-281), "This workspace declares no hooks" (the hooks
were removed from the configuration after the notice was raised), "The hooks could not be read", "The review dialog could
not be opened" — the arm's only answer is `console.warn(...)`. The person who pressed "Review hooks" sees nothing happen: no
dialog, no notice, no acknowledgement, and the notice they pressed stays as it was.

Found by fin45's review (`fin45-optional-findings`, an optional finding on the repair of
[`fixed/a-notice-action-reaching-a-window-whose-store-was-refused-answers-an-unreported-failure.md`](fixed/a-notice-action-reaching-a-window-whose-store-was-refused-answers-an-unreported-failure.md),
whose outcome paragraph says the hook review "answers its own 'Open a workspace before reviewing its hooks'", while that
answer reaches only the console), carried as acceptance finding C22 by fin46's first acceptance round. Recorded 2026-10-14
by fin46 (`fin46-accept1-10`).

## Specs

- `REQ-NOTIFY-254` — "No failure is reported by silence. Every refusal carries a reason worded by the layer that determined
  it": main words the reason, and the renderer drops it on the console.
- `REQ-NOTIFY-003` — a refusal is published as a persistent notice, so it stays readable.
- `REQ-SHELL-019` — the words the refused reach of a window that could not be built borrows; that refusal alone was reported
  (by `MainWindows.#addWindow`), every other refusal of the review was not.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `dispatchNoticeAction`, the `open-hook-review` arm: `if (!outcome.ok) console.warn(...)`.
- `apps/desktop/src/main/index.ts` — `openHookReview`, the refusals it answers.
- `apps/desktop/src/main/main-windows.ts` — `MainWindows.reach`, whose `workspace.openFailed` / `workspace.buildFailed`
  refusals were already reported under REQ-SHELL-019.
- `apps/desktop/scripts/notice-proof.mjs` — sections 6 and 6b press the action where the review opens; none presses it where
  it is refused.
