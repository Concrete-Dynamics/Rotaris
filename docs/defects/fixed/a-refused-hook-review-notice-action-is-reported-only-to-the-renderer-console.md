## A refused hook-review notice action is reported only to the renderer console

The unreviewed-hooks notice offers `open-hook-review` naming its workspace (REQ-NOTIFY-224, ESC-34), and the renderer's
`dispatchNoticeAction` sends `hooks.review {workspace}` for it. When main refuses — "Open a workspace before reviewing its
hooks" (a window reached with no workspace open, its store refused, OQ-281), "This workspace declares no hooks" (the hooks
were removed from the configuration after the notice was raised), "The hooks could not be read", "The review dialog could
not be opened" — the arm's only answer is `console.warn(...)`. The person who pressed "Review hooks" sees nothing happen: no
dialog, no notice, no acknowledgement, and the notice they pressed stays as it was.

Found by fin45's review (`fin45-optional-findings`, an optional finding on the repair of
[`a-notice-action-reaching-a-window-whose-store-was-refused-answers-an-unreported-failure.md`](a-notice-action-reaching-a-window-whose-store-was-refused-answers-an-unreported-failure.md),
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

## Outcome

*Repaired 2026-10-14 by fin46 (`fin46-accept1-10`).* Confirmed first in the built app: `notice-proof` section 6e
(`review-refused`, new) publishes the unreviewed-hooks notice for the window's own workspace, which declares no hooks, and
presses "Review hooks"; on the base `fb39dee` main reached the window and refused ("This workspace declares no hooks"), the
log carried only `capture: renderer console: notice action "open-hook-review" … was refused: This workspace declares no hooks`,
and the banner still read "Workspace hooks need review: workspace" two seconds later — the section went red on "the refusal is
not on screen".

The arm now hands main's answer to `reportNoticeActionRefusal` (`apps/desktop/src/renderer/notice-action-refusal.ts`), which
publishes a refusal as a persistent `warning` notice through `notice.report` — main's headline the title, its detail the
copyable detail, the shape the retry action's refusal already takes — and logs it at `info`. A rejected command is said as
"The application did not answer". A refused reach coded `workspace.buildFailed` or `workspace.openFailed` is only logged: those
are answered after `MainWindows.#addWindow` raised REQ-SHELL-019's "Could not open the selected project: {reason}", and a second
publication would replace that report with its copy. Pinned by `notice-action-refusal.test.ts` (six cases on the helper, and a
source-shape case on the arm, red before the wiring) and by `notice-proof` section 6e, green after: the banner reads "This
workspace declares no hooks", main logs `notice from the renderer: warning "This workspace declares no hooks"`, and no renderer
console line is relayed.

The two sibling arms that read a command's outcome the same way (`focus-session`, `open-project-init`) were outside this task
and are recorded in
[`a-refused-focus-session-or-project-setup-notice-action-is-reported-only-to-the-renderer-console.md`](a-refused-focus-session-or-project-setup-notice-action-is-reported-only-to-the-renderer-console.md), repaired 2026-10-15 by fin47 with the same helper.
