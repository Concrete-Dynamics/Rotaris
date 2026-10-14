## A notice action reaching a window whose store was refused answers an unreported failure

A main window whose workspace open was refused by the workspace service keeps its record and the workspace it names — the
launch path does not destroy it, and OQ-281 keeps it open so Settings › Project can resolve the place — but it holds no
workspace id. Since 2026-10-14 (`fin44-notice-reach`) `MainWindows.reach`, meeting a holder with no workspace id, waits for its
open and then answers with a refusal whenever the id is still missing: "Could not open the selected project: <path> could not
be opened as a workspace." The comment beside it says the open "destroyed the window, and the press is refused (the failure was
already reported under REQ-SHELL-019)". That holds for a window `reach` itself added, whose failed open destroys it; it does not
hold for this one, which is alive, and no failure was reported under REQ-SHELL-019 — the reach's answer is only logged in the
pressing window. Before that bundle the reach surfaced the holder and answered it, and the action's surface refused or acted.

So a project-setup action (`open-project-init`) pressed for a project whose window holds `workspace.store-missing` surfaces
that window and then opens nothing, where Settings › Project — the very place OQ-281 resolves a missing store — is what the
action exists to open. A `focus-session` or hook-review action for that workspace is answered the same unreported way.

Noticed 2026-10-14 by fin44's review of `fin44-notice-reach` (interplay with OQ-281's store refusal), recorded 2026-10-14 by
fin45 (`fin45-optional-findings`).

## Specs

- `PD-SHELL-001` revision 2 (OQ-267) and revision 3 (OQ-292) — a notice action naming a workspace surfaces the window holding
  it, and "the caller then opens the action's surface in the reached window"; here a window holds it and is surfaced, and the
  surface is never opened.
- `PD-WORKSPACE-005` revision 3 (OQ-294) — the project-setup action opens Settings › Project in the reached window.
- `REQ-SHELL-019` — "Could not open the selected project: {reason}" is the error notification of a window that could not be
  built; this answer borrows its words for a window that was built and stands, and shows it nowhere.
- `REQ-SESSION-202` with OQ-281 — a place holding no store is resolved in Settings › Project.

## Relevant files

- `apps/desktop/src/main/main-windows.ts` — `MainWindows.reach`, the refusal after `awaitWorkspace` for a holder still live.
- `apps/desktop/src/main/commands/initialization.ts`, `apps/desktop/src/main/commands/session.ts`, `apps/desktop/src/main/index.ts`
  (`openHookReview`) — the three callers, which return the reach's outcome when it is not ok.
- `apps/desktop/src/main/main-windows.test.ts` — the reach cases.

## Outcome

*Repaired 2026-10-14 by fin45 (`fin45-optional-findings`).* Confirmed first on the branch: a launch window whose open settled
with no workspace id (the harness's open answering nothing, as a refused store does) was reached as a refusal
(`main-windows.test.ts`, "answers a reach of a live window whose open settled with no workspace id with that window, and builds
nothing", red before the repair). `MainWindows.reach` now refuses, after its wait, only a holder that is gone — the window
`#addWindow` built and destroyed when its open failed, which `#addWindow` reported under REQ-SHELL-019 — and answers a holder
that stands with that window, logging that it has no workspace open. The callers then act as before the readiness repair: the
project-setup action opens Settings › Project in it, where OQ-281 resolves the place; the hook review answers its own "Open a
workspace before reviewing its hooks"; `focus-session` asks the window to load the session, which its `session.resume` answers.
The readiness cases (a holder still opening, a failed add refused, a reach between build and open) stay green. No proof drives a
notice action pressed for a workspace whose store is refused (a refused store raises no project-setup banner of its own); the
unit case is the evidence. `06-sequences.md` and `02-process-view.md` say so.
