# The codebase — how the architecture is laid out in code — Opening a project from inside the application (2026-09-12)

Part 14 of 22 of [the codebase record](../codebase.md), which indexes every part.

## Opening a project from inside the application (2026-09-12)

Before this, the only route to a workspace was a launch argument: with none, `currentWorkspace` was the string
`(no workspace)` and some fifteen commands refused with "Open a workspace before …". `REQ-SHELL-010`'s
precedence, `REQ-SHELL-011`'s deferred offer, `REQ-SHELL-021`'s three gates, `REQ-SHELL-017`–`019`'s switch and
the title-bar chip of `REQ-SHELL-035` / `REQ-WORKSPACE-016`/`017` are all built, reported in place at ADR-0055.
`workspace/lastOpened` is registered in `PREFERENCE_KEYS` and deliberately **absent** from
`PREFERENCE_COMMAND_KEYS`: that list is an allow-list, so main owning the key is a property of the contract
rather than a convention anyone must remember.

**The eighty-eighth — the title bar had never put the workspace chip where `REQ-SHELL-033` puts it.**
That requirement fixes the strip's contents left to right: brand mark, wordmark, version label, *the workspace
chip as a centred region*, then the session control. What was drawn put the path last — a plain `<span>` after
the flexible spacer and after the Sessions button, hard against the right edge. The chip becoming a control is
a requirement that had not been built and is not the defect; its **position** is, because that ordering was
live when the strip was drawn and reading the requirement was all it would have taken. Found by drawing the
chip against the requirement rather than against the strip, which is the only reason it was found at all: no
proof asserts the title bar's order, and none of the seven views' layout assertions can see it.

Two hazards of the label rules, neither a defect because neither shipped, both worth the record because the
obvious implementation has each:

- **A budget read from the chip's own box ratchets shut.** `REQ-WORKSPACE-149` rule 2 measures against "the
  rendered width available to that label", and the available width had to come from the chip's *slot* — a flex
  item with a zero basis, whose width is therefore independent of the text inside it. Measuring the pill itself
  would have worked once and then never recovered: each shortening narrows the pill, and the narrower pill
  would be the next budget, so a widening window would never restore the path.
- **The measurement cannot happen while rendering.** `react-hooks/refs` refused the first version for reading
  `ref.current` during render, and the rule was right about more than style: the boxes that decide the label
  are the ones this render is about to produce, so a mid-render read measures the previous frame. The label is
  state written from a layout effect, which is also what makes the `ResizeObserver` and the first paint agree.

**Three obligations have nothing in this codebase to stand on, and are stated rather than passed silently.**
`REQ-WORKSPACE-109`'s initialization-cancellation machinery does not exist — three literal occurrences, all in
`docs/spec` — so `REQ-WORKSPACE-013` is **not** reported complete. *(Superseded 2026-09-30 under R-067, the sentence
above kept as it stood on 2026-09-12: the cancellation clause is now built. `MainWindows` reports a workspace no live
main window holds any more (`workspaceClosed`) and main calls `InitializationCoordinator.close`, which cancels the run
on `REQ-WORKSPACE-109`'s terms and records nothing for it — [ADR-0064](../adr/0064-the-project-initialization-registry.md)'s
sixth round, [the fixed note](../../defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md),
shown by `workspace-proof`'s scenario 8b. The same rule for a close that is not a switch's is a reading, and
[OQ-141](../open-questions.md) stays open for it — *ruled 2026-10-06 as built ([R-071](../../product/requests.md#r-071)): a close that is not a switch's cancels the same way*.)* No in-flight worktree integration is
observable from main (`worktree.integrate`: none; `'integrating'`: one occurrence, an unread member of
`MERGE_STATUSES`), so `REQ-SHELL-021`'s second gate is written in its place in the fixed order as an explicit
no-op that names the state it would read. *(That sentence was false until 2026-10-15: no such no-op existed in
`apps/desktop/src/main/`, so the gate's place was held by nothing
([the note](../../defects/fixed/the-integration-in-progress-close-guard-has-no-code.md)). Since 2026-10-15 (fin47) it holds:
`apps/desktop/src/main/integration-guard.ts` builds REQ-SHELL-119 guard (2) and REQ-SHELL-021 / REQ-STARTUP-053 gate (2) in their
places — the close's between the unsaved-settings guard and the active-run confirmation (`guardClose`), the workspace-open flow's
between gates 1 and 3 — over `noWorktreeIntegration`, the reader that names a binding's `'integrating'` status and answers none
running until integration is built; what the requirement leaves open beyond one window's close is
[OQ-361](../open-questions/63-spikes-and-later-questions-30.md#oq-361), *ruled 2026-10-20 and built 2026-10-21 (`PD-SHELL-009` revision 3): the close of one of several
windows and gate (2) count the window's own workspace, the last window's close and the update's `Restart now` and installer
hand-off count the whole instance (`integrationAllowsUpdate`), the reader is main's own record of an integration it admitted
and has not seen end — never a binding's `merge_status` or REQ-GIT-128's lock, so the "names a binding's `'integrating'`
status" above no longer describes it — and a record main cannot read refuses no close and declines no request, while the
update declines on it*.)* And this product has **no session name**: `SessionRecordSchema`
carries an identifier, a status, a workspace root, timestamps and run state, so `REQ-WORKSPACE-017`'s "the
current session name (or `—` when there is none)" can only honestly render `—`, which the chip does.
