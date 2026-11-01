[Product directives](../directives.md) › PD-SHELL-001

<a id="pd-shell-001"></a>

### PD-SHELL-001 — a chosen project folder may be opened in an additional main window

*Revision 3 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-292](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292)) — **`focus-session`
names its session's workspace and takes the reach**, in the gesture clause below; revision 2's clause quoted beside it.*
*Revision 2 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-267](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-267)) — **a notice
action's reach**, in the gesture clause below; revision 1's clause quoted beside it.*

Choosing a project folder from inside a window SHALL offer two outcomes, and which one is taken SHALL
be decided by the gesture that starts the flow rather than by a question asked afterwards: the
**replacement** of REQ-SHELL-017, or the **addition** of a main window on the chosen folder with the
window that issued the request left open and unchanged.

**The gestures — revision 3.** The add route SHALL be reachable by two gestures — a shortcut-less command
palette entry labelled "Open project folder in a new window", present in every window and in the
composer's slash catalogue on the terms of REQ-SHELL-048 and REQ-SHELL-056; and activating the
title-bar workspace chip of REQ-SHELL-035 with the platform's secondary-activation modifier held —
and by one reach that opens no chooser: **activating a notice action of REQ-NOTIFY-044 that names a
workspace.** Where a main window holds that workspace under REQ-STARTUP-163's rule, it is surfaced, no
window is built, and the action's surface opens there. Otherwise a main window is added for it on this
directive's add terms below, and the action's surface opens in the added window. The reach binds every
vocabulary member that names a workspace: the hook review, project initialization (OQ-262, OQ-294), and
**`focus-session`, which SHALL carry the workspace of the session it names**, taken from the run host's record
of the root that session was started or resumed under and never from a window. Its surface is the session
itself: the session SHALL be focused in the window surfaced or added, through that window's own session load.
A notice whose session's workspace is not known SHALL carry no action. Every other activation of the chip is
the replacement route, on which REQ-SHELL-021 governs in full.

> **Revision 2 said, and no longer governs:** "The reach binds every vocabulary member that names a workspace: the hook
> review now, and project initialization once a notice carries it (OQ-262)." — `focus-session` named a session and no
> workspace, so it was outside the reach; pressed in a window whose workspace did not hold the session it was, from
> 2026-10-14, not dispatched and only logged. That silence is withdrawn by this revision.

> **Revision 1 said, and no longer governs:** "The add route SHALL be reachable by exactly two gestures, and by no other: a
> shortcut-less command palette entry labelled "Open project folder in a new window", present in every window and in the
> composer's slash catalogue on the terms of REQ-SHELL-048 and REQ-SHELL-056; and activating the title-bar workspace chip of
> REQ-SHELL-035 with the platform's secondary-activation modifier held."

*Pointer, 2026-10-14:* [OQ-294](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-294) ruled the project-setup banner's press for a project
no window holds under revision 2's reach (a window is added), recorded as [`PD-WORKSPACE-005`](pd-workspace-005.md#pd-workspace-005) revision 3.
*(Moved out of the quotation of revision 1 on 2026-10-14 by fin44, where it read as part of the quote.)*

On the add route the product SHALL build a main window on the chosen folder, show it, surface it on
the terms REQ-SHELL-161 fixes for every window this product owns, and leave every window already open
exactly as it was — the same workspace, the same active view, the same composer contents, the same
runs still executing. The replacement semantics of REQ-SHELL-017 SHALL NOT apply, no window SHALL be
closed, and the three gates of REQ-SHELL-021 SHALL NOT be evaluated: an active run, an unsaved
settings edit or a running worktree integration, in the requesting window or in any other, neither
blocks the request nor is disturbed by it. The chosen folder SHALL be resolved and persisted as the
last-opened workspace on the terms REQ-WORKSPACE-005 already fixes for a folder chosen through the
chooser of REQ-WORKSPACE-009. A failure to build the added window SHALL leave every open window
usable and SHALL report it on the terms REQ-SHELL-019 fixes for a failed replacement. Whether the
chosen folder is one a window already has open is decided by the rule REQ-STARTUP-163 fixes, which
this directive cites rather than restating; where it is, PD-WORKSPACE-001 governs and no window is
built.

**Why, and what it costs.** Two projects open side by side is what the owner asked for, and the
specification has no route to it from inside the application: REQ-STARTUP-163 builds an additional
window only for a directory a *launch* carries, and says in its own text that a request originating
in a window is not that case. The alternative — two operating-system processes — is refused by
REQ-STARTUP-161 and was declined as [R-003](../requests.md#r-003). The cost is threefold and none of it
is hypothetical: per-window state that a single-window product could keep in one place must now be
correct per window (the approval queue, the followed session, the persona and terminal windows, the
deferred first-launch prompt); REQ-SHELL-021's gates no longer stand between a user and a second
workspace, so the gesture must be as cheap to undo as to make, which is why closing the added window
changes nothing else; and the choice cannot be offered by the native chooser, which carries no
buttons of ours (REQ-SHELL-164), which is why the gesture is chosen before the chooser opens.

**Why revision 2, and what it costs.** The closed list of two gestures existed so that skipping REQ-SHELL-021's gates is
always a deliberate, chosen act before a chooser opens. A notice opens no chooser, REQ-NOTIFY-044 forbids asking anything
further, and a declined gate would leave the action doing nothing, so that reason does not reach a notice's action; adding a
window asks nothing and closes nothing the user has open. What it costs: the reach is a full workspace open, so the
workspace's initialization resolution and its own automatic requirements queue (REQ-TRACE-476/482) may start work; the named
workspace becomes the remembered one; focus moves to the surfaced or added window; and a persistent notice kept after a
switch (REQ-NOTIFY-224) can reopen a workspace the user left.

**Why revision 3, and what it costs.** REQ-NOTIFY-031's and REQ-NOTIFY-032's notices are raised exactly when their session
is not on screen, and every notice is shown in every main window, so with two windows on two workspaces (or after a switch)
"Open the session" was pressed in a window whose store does not hold the session. It used to raise "The session could not be
loaded" there and record the session under the wrong workspace; from 2026-10-14 it did nothing visible. REQ-NOTIFY-044 asks
that an action concerning an object act on that object without asking anything further, and a session's object includes
where it lives: so the action carries the session's workspace, as the hook review carries its own (ESC-34), and reaches it
the same way. What it costs, beyond revision 2's costs for any reach: where no window holds the session's workspace, the press
adds one, so that workspace's initialization resolution and its automatic requirements queue (REQ-TRACE-476/482) may start
work, it becomes the remembered workspace, focus moves to the added window, and a persistent notice left over from a session
of a project the user has since closed (REQ-NOTIFY-224 keeps one across a switch) reopens that project when pressed. A notice
raised for a session the run host has no root for carries no action at all, rather than one that guesses a window. And the
logged silence is withdrawn: a refusal in the session's own workspace (a deleted session, a session another process holds)
is raised there as the ordinary load error.

> **Extends:** REQ-SHELL-017, REQ-STARTUP-161, REQ-NOTIFY-044, REQ-NOTIFY-031, REQ-NOTIFY-032
> **Narrows:** REQ-SHELL-021

*Raised by the owner, 2026-09-12; logged as [R-004](../requests.md#r-004).* *Revised by [R-072](../requests.md#r-072), 2026-10-13,
ruling [OQ-267](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-267) (revision 2): both advocates recommended the add; the ruling takes
one advocate's user-facing costs and the other's directive revision. The new case stays disjoint from
[`PD-SHELL-009`](pd-shell-009.md#pd-shell-009)'s narrowing of REQ-SHELL-021, which covers gate (3)'s count on the replacement route.*
*Revised by [R-072](../requests.md#r-072), 2026-10-14, ruling [OQ-292](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292) (revision 3): the
press reaches the session where it lives; REQ-NOTIFY-044 (with its Data & Formats parameterisation, which becomes "parameterised
by session identifier and its workspace"), REQ-NOTIFY-031 and REQ-NOTIFY-032 are extended and carry the back-pointer.*

> **First execution of revision 3, 2026-10-14 (fin44, `fin44-notice-reach`).** Built the day it was ruled: `focus-session`
> carries `{sessionId, workspace}` (`packages/contracts/src/notices.ts`); the run host stamps `run.result` and `notice.publish`
> with the root it recorded the session under (`withSessionRoot`, `apps/desktop/src/run-host/session-roots.ts`); main builds
> REQ-NOTIFY-031's and REQ-NOTIFY-032's notices and the recording failure's "Reopen the session" from it, with no action where
> none is recorded (`run-failure-notice.ts`, `recoveryFor` in `index.ts`); the renderer's arm sends `session.focusFromNotice`,
> main reaches the workspace (`MainWindows.reach`) and sends the reached window channel 16 (`session:focus`), which a window
> still loading holds on its record until its renderer's `session.focusReady` (`MainWindows.focusSession` /
> `sessionFocusReady`); the reached window focuses the session through its own `session.resume`. The `fromNotice` silence is
> gone. **What was measured.** `session-roots.test.ts` (the root stamped, and nothing where none is recorded),
> `run-failure-notice.test.ts` (the workspace carried, the action absent without one), `main-windows.test.ts` (held elsewhere,
> held nowhere, a request held until ready), `commands/session.test.ts` and `recovery-wiring.test.ts`, each red on the code
> before; `notice-proof` section 6c — a run of the holding window, released there, ends; its "Open the session" pressed in the
> other window surfaced the holder (`surfaced window 2 …; the focus was sent`), which followed the session, the pressing window
> loading nothing and no "could not be loaded" error raised — and section 6d, the same press after the session's window
> switched to another project: a window was added for the session's workspace, the focus **held** on its record and delivered
> 20 ms later at its renderer's `session.focusReady`, and the added window followed the session (load average 5.9 to 6.6 on
> four CPUs). **Found beside it:** the unreviewed-hooks notice a run publishes still names the focused window's workspace
> ([`a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md`](../../defects/fixed/a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md)),
> not repaired then; repaired 2026-10-14 by fin44 (`fin44-hooks-and-config`) under OQ-293's ruling. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2.** Built before it was ruled, as the reading OQ-267 recorded: `MainWindows.reach`
> (`apps/desktop/src/main/main-windows.ts`) for the hook review, the 2026-10-13 row of
> [`../architecture/first-executions.md`](../../architecture/first-executions.md) (fin41, N86), and `pnpm notice-proof` sections 6
> (a notice naming the window's own workspace surfaces it and builds none) and 6b (a notice naming a workspace no window holds
> adds a window, asks nothing and closes nothing). The ruling changed no behaviour; the comments that called the reading
> provisional now cite this revision (2026-10-14, fin43).
