## The project setup dialog is drawn over the title bar's window controls

The project setup consent dialog (REQ-WORKSPACE-106: "a non-modal, window-level dialog (the rest of the app stays
navigable)") is positioned by `.project-setup` in `packages/ui/src/shell.css`: `position: fixed`, `top` and `right`
`var(--rt-space-4)`, `z-index: 40`. That corner of the window is the title bar's right end, where the session browser
control (`Sessions`) and the product-drawn window controls (`Minimize`, `Maximize`, `Close window`, PD-SHELL-003) sit, and
below it the notice slot, whose banner carries a notice's answers and its dismissal at its right end. While the dialog is
open (it opens by itself once per workspace open, REQ-WORKSPACE-105, and stays until answered), those controls are
under it.

Inferred, not measured on this dialog: the re-authentication prompt of REQ-NOTIFY-071 was first drawn with the same rule,
copied from `.project-setup`, and the verifier of 2026-10-02 measured in the built app (`elementFromPoint` at the centre
of every `.title-bar` and `.notice-slot` button, `resilience-proof`'s `auth-fallback` scenario) that `Sessions`,
`Minimize`, `Maximize`, `Close window` and the notice's `Dismiss` were all under it. That prompt was moved into AppShell's
`windowPanel` slot inside the rail-and-view region (`.body`) and the scenario now asserts those controls usable. *(Since
the prompt's second repair round, 2026-10-02: that slot was an overlay too — at 1000x680 it covered the run header's
switches and the composer's submit — and is gone; the prompt is laid out in flow as the Workspace view's own grid row,
and `auth-fallback` asserts that no on-screen control has it at its centre. Any repair of this dialog meets the same
choice: an overlay that stays open until answered covers something at some size.)* The setup
dialog keeps the fixed rule; `pnpm init-proof` checks its texts, that it is visible and the composer's gate, and nothing
under it. Noticed while repairing the 401 note's part B; not repaired (outside that task).

## Specs

- REQ-WORKSPACE-106 — the dialog is non-modal and "the rest of the app stays navigable"; the window's minimise, maximise
  and close controls and the session browser are not reachable by pointer while it covers them.
- ADR-0048 — the non-modal window-level level is an in-window panel that traps no focus and leaves the rest navigable.
- REQ-SHELL-024's notice slot — its banner's answers and dismissal are under the dialog while a notice is shown.

## Relevant files

- `packages/ui/src/shell.css` — `.project-setup` (the fixed corner placement); `.reauth-prompt` beside it, the repaired
  sibling, with the measurement in its comment.
- `packages/ui/src/WorkspaceView.tsx` — the `reauthPrompt` row, where the repaired sibling is laid out in flow (AppShell's
  `windowPanel` slot, its intermediate placement, is gone).
- `apps/desktop/src/renderer/main.tsx` — where `ProjectSetupDialog` is mounted beside the shell.
- `apps/desktop/scripts/resilience-proof.mjs` — `auth-fallback`'s `chromeUsable` probe (every on-screen control tested at its
  centre, at the opening size and at 1000x680), the measurement a repair can reuse
  in `init-proof`.

## Outcome

Repaired 2026-10-02 (fin8, bundle `fin8-noticed-gaps-4`). Measured first in the built app (a scratch driver read of
`elementFromPoint` at the centre of every control outside the dialog, `ROTARIS_INIT_TEST_TASK=consent`, a notice
standing): at 1440x900 in the Overview and Workspace views and at 1000x680 in all seven, Sessions, Minimize, Maximize, Close window and the notice's
"Dismiss this error" all had the dialog at their centre — the inference above, confirmed.

- AppShell has a `windowDialog` slot drawn inside the rail-and-view region (`.body`, now `position: relative`), after the
  view; the renderer mounts `ProjectSetupDialog` there (`apps/desktop/src/renderer/main.tsx`) in place of beside the
  shell. `.project-setup` is `absolute` at that region's top corner with the language's `--rt-space-4` inset and bounded
  by the region (`max-height`/`max-width` `calc(100% - 2 * var(--rt-space-4))`, never `100vh`), so it begins below the
  title bar and the notice slot at any notice height. Shorter than it needs, it scrolls and its answers stay at its floor
  (`.project-setup > .dialog-actions`, sticky, on `--rt-surface` behind a `--rt-divider` hairline — the
  re-authentication prompt's answer row, the craft already adopted for a panel open until answered). The width is still
  `.dialog`'s own. `pnpm mockup` was consulted first; it draws no non-modal dialog, so the `.dialog` card and the title
  bar's own geometry decided.
- After the repair, the same read: no title-bar or notice control under the dialog at either size, in any view read. It lies
  over the view's top corner instead (at 1440x900 the Overview's List sessions and New session, the Workspace inspector's
  Persona, Steer, Cancel and Pop out; at 1000x680 also the run header's switches, the composer's right part and other
  views' top-right controls). Any overlay that stays open until answered lies over something; whether this one may lie
  over the view, or must stand in a region every view yields room to, is raised as OQ-187 with the reading built
  ([open-questions.md](../../architecture/open-questions.md)).

Pinned by `packages/ui/src/project-setup-placement.test.ts` (AppShell draws the dialog inside `.body`, after the title bar
and the notice slot; `.project-setup` is absolute, inset by `--rt-space-4`, bounded by the region and never fixed;
`.body` is the positioned ancestor; the answers are sticky — every case red before). Shown by `init-proof`'s `consent`
scenario, which now reads every title-bar and notice-slot button's centre while the dialog is open (five tested, none
under the dialog) and photographs the dialog before its Escape (`.proof/init-proof/consent-dialog.png`), 2026-10-02,
load 0.6 to 1.6, all five scenarios green (the code-intelligence bundle copied from another worktree's build, which
`--skip-build` requires).
