[Product directives](../directives.md) › PD-SHELL-002

<a id="pd-shell-002"></a>

### PD-SHELL-002 — one window is a multi-session host: a second run starts beside the live one

Every main window SHALL behave as the multi-session host REQ-SHELL-125, REQ-SHELL-126 and
REQ-SHELL-127 already describe, and never as the single-run host those same requirements describe
beside it. Concretely:

The "New session" gesture SHALL stay available while a run is active and SHALL open the
"Start session" dialog rather than refusing with "Finish or cancel the active run before starting
a new session.". While any run is active in the workspace, the dialog SHALL lock the isolated
Git worktree on — the default `rotaris/session/<session-id>` (REQ-GIT-007) shown before it is
accepted — with attaching to an existing worktree as the only alternative. A start that still
arrives carrying neither choice while any run is active SHALL force-create the default isolated
tree rather than share the base tree with the live run. Accepting the dialog SHALL release the
window's focus and leave the previous run carrying on in the background; the window SHALL keep
that run's relay subscription, so its background notices and terminal frames still reach the
window while the replica follows only the focused session.

The session browser SHALL stay available while a run is active and SHALL NOT refuse with
"Finish or cancel the active run before switching sessions.". Focusing another session — from
the browser, from the Overview sessions card, or from a notice's focus action — SHALL switch
the window's focus and leave every other run's lifecycle untouched. Focusing a session whose
run is already executing in the background SHALL be allowed: the engine's already-active answer
for that session is a focus switch, not a failure.

A window of another project is untouched by all of this: each project's runs live in the
window open on that project, on the terms PD-SHELL-001 already fixes.

**Why, and what it costs.** The owner works on multiple things in parallel and wants each run
started, watched and steered from the window it belongs to — a second project in its own
window, a second run in the same window. The specification already holds both halves: the run
side fully allows concurrent runs in one workspace (REQ-ORCH-151, REQ-MONITOR-249..252,
REQ-MONITOR-258 with its closed list of five run-active gates), and the shell side already
describes the multi-session host beside the single-run one. What the product built was only
the single-run half, so the faithful requirements read as a refusal where the owner reads an
ordinary working state. The cost is threefold and none of it is hypothetical: focus is now
state the window must hold correctly — every control, the composer target, the sandbox badge,
the recovery state and the terminal attachment re-bind on every switch, and a switch must
never disturb the run it leaves behind; a second concurrent launch must never share the base
tree, which is why isolation is locked on and force-created rather than merely offered; and
the run-active gates that remain — a second start on the handle already running, resuming the
session a run is already executing, the integration and shutdown gates — must keep refusing
exactly as before, because a window that can start anything can no longer lean on one blanket
refusal to protect them.

> **Narrows:** REQ-SHELL-125, REQ-SHELL-126

*Raised by the owner, 2026-09-20; logged as [R-042](../requests.md#r-042).*

> **First execution, 2026-09-20:** built alongside this record rather than after it — the
> implementation preceded the paper, so the consultation rule is owed an acknowledgement, not
> a claim. `apps/desktop/src/renderer/main.tsx` (dialog opens while busy with `runActive`
> computed from the focused session plus `session.list`; focus switch keeps background
> subscriptions; already-live resume treated as focus), `apps/desktop/src/main/commands/session.ts`
> (no resume gate; concurrent start force-creates the default isolated tree),
> `apps/desktop/src/run-host/dispatch.ts` (no blanket resume gate; the engine's per-session
> guard stands). `pnpm check` green on symbols, typecheck and lint; tests 2020 passed with
> 2 failures in `terminal.test.ts` real-PTY under full-suite load, each passing isolated —
> the known parallelism flake, unrelated to this change.
