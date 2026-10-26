# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — The resolution precedence and the deferred offer — first executed 2026-09-12

Part 14 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## The resolution precedence and the deferred offer — first executed 2026-09-12

The paragraph above is now discharged and is kept as it was written: what it called Stage B's is built.
`REQ-SHELL-010`'s three-way precedence, `REQ-SHELL-011`'s one deferred offer and `REQ-SHELL-021`'s gated
replacement all run for the first time, and the title-bar chip is the gesture that reaches them.

**The sequencing this record fixes held.** Nothing in the precedence, the deferral or the post-show activation
order needed changing to be built. Three findings are worth the record, none of them a defect of this decision:

- **The 650 ms figure had no home in the code.** `REQ-SHELL-011` makes itself the product's single definition
  of the deferred first-paint delay and tells other documents to cite it rather than restate it. A search found
  no constant, so the interval is minted once, named for the requirement, and the machine-setup modal of
  `REQ-SHELL-013` and the initialization offer of `REQ-SHELL-016` have something to cite when they are built.
- **The one-shot flag is set when the flow starts, not when it succeeds.** `REQ-SHELL-011` forbids two folder
  choosers being on screen at once, so a chooser the user opened must abandon the deferred offer *before* it
  is known whether they chose anything. Setting the flag on success would have put a second chooser over the
  first for as long as someone browsed.
- **A remembered path that no longer exists is never rewritten, and the store never asks the filesystem.**
  `REQ-WORKSPACE-007` says so, and the reason survives the coerce in `PREFERENCE_KEYS`: a key that answered
  "no workspace" for a folder on an unmounted drive would lose a project silently, so the existence question
  is asked at resolution and nowhere else.

**Two obligations this record places on the resolution have nothing to stand on**, and are reported rather than
quietly skipped. `REQ-WORKSPACE-109`'s initialization-cancellation machinery does not exist in the codebase —
three literal occurrences, all of them in `docs/spec` — so `REQ-WORKSPACE-013` cannot be reported complete; and
no in-flight worktree integration is observable from main (`worktree.integrate`: no occurrences; `'integrating'`:
one, an unread member of `MERGE_STATUSES`), so `REQ-SHELL-021`'s second gate is written in its place in the fixed
order as an explicit no-op naming the state it would read. `REQ-STARTUP-166`'s workspace-storage determination,
which this record places on every path that opens a workspace, is likewise not built.

*Note on deepened structure (2026-09-12):* The builder, startup resolution, project-folder chooser, gates,
add/replace flows, hand-over routing, and per-window deferred offers were deepened into `MainWindows`
(`apps/desktop/src/main/main-windows.ts`). Consequence 6's two entrances and listener-before-load ordering are
guaranteed by the `MainWindows` lifecycle seam.
