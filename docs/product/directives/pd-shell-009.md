[Product directives](../directives.md) › PD-SHELL-009

<a id="pd-shell-009"></a>

### PD-SHELL-009 — closing a main window ends its own project's runs, and asks first

*Revision 3 (2026-10-20, [R-072](../requests.md#r-072), ruling [OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361)): **REQ-SHELL-119's guard (2), "Integration in progress", and the workspace-open flow's gate (2) count the window's own project, as guard (3) and gate (3) do. They read main's own record of an integration, and a record main cannot read refuses no close.** What changes:*

- *the opening sentence names guard (2), with its earlier text quoted beside it;*
- *the first three cases and the gate case each end with a revision-3 sentence;*
- *a new case, "A worktree integration running", follows the gate case;*
- *the last case names REQ-NOTIFY-057 as the reason guard (2) is not asked there;*
- *REQ-STARTUP-053, REQ-WORKSPACE-012 and REQ-NOTIFY-056 join the Narrows line and gain back-pointers;*
- *REQ-SHELL-119 and REQ-SHELL-021 each gain a dated note.*

*Everything else stands as revisions 1 and 2 wrote it.*

*Revision 2 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298)) — **a quit
that starts outside any window asks no close guard**: the last case below is revised, its revision-1 text quoted beside it.
No requirement gains a back-pointer: the case now follows REQ-CONFIG-287 and REQ-SHELL-119 guard (1) as written. Everything
else stands as revision 1 wrote it.*

Closing a main window SHALL end the active runs of the project open in it, and SHALL ask REQ-STARTUP-046's confirmation first, after REQ-SHELL-119's earlier guards. Of those earlier guards, guard (2) refuses only a close that would end a worktree integration this instance is running (**revision 3**). Which close asks what:

> Revisions 1 and 2 said, and no longer govern: "Closing a main window SHALL end the active runs of the project open in it, and SHALL ask REQ-STARTUP-046's confirmation first, after REQ-SHELL-119's earlier guards. Which close asks what:"

- **The last main window.** A person's close of the main window that leaves no other main window open asks REQ-SHELL-119's
  question ("Quit while a run is active?", "Quit while {n} runs are active?") while the run host counts any run active in
  the instance (REQ-SHELL-122's count, instance-wide). Its Yes is the application's quit, whose shutdown stops every run
  (PD-ORCH-005 clause 3). This is as built before this directive.

  **Revision 3:** its guard (2) counts the whole instance. While main records a worktree integration running in any workspace, REQ-SHELL-119's "Integration in progress" box ("Keep Rotaris open until the isolated worktree integration finishes.") refuses the close whatever its answer, and guard (3) is not asked. This is REQ-SHELL-119 and REQ-NOTIFY-056 as written.
- **One of several main windows.** A person's close of a main window that leaves another main window open asks "Close this
  window while a run is active?" ("Close this window while {n} runs are active?") while the closing window's own workspace
  has a run active — REQ-SHELL-122's count taken over that workspace's sessions alone. The box conveys REQ-STARTUP-046's
  three things: a run is still executing in this project, closing this window ends it (Rotaris will stop the run, and work
  in flight may not finish), and the alternative is Cancel, to return to the window and let it finish. It offers Cancel and
  Yes, Cancel first, the default, and Escape's and the box's close control's answer (REQ-SHELL-055). Its **Yes stops those
  runs as the stop control does** (REQ-SESSION-186's graceful stop) before the window closes: under PD-ORCH-005 clauses 3,
  9, 10 and 21 their agents rest `paused` by `stop`, Continue resumes them, the approvals and questions they wait on are
  withdrawn and never answered (the closing window's approval dialog and question dock answer nothing), and their background
  terminal sessions end. No notice of those runs appears on a window that stays while they come to rest (REQ-STARTUP-046's
  last sentence). Cancel, or a box that cannot be shown, aborts the close and changes nothing. A count that cannot be read
  is a run active.

  **Revision 3:** its guard (2) counts the closing window's own workspace. The same box refuses the close only while main records an integration running for that workspace. An integration in another window's project neither refuses the close nor shows the box, and the close goes on to the question above.
- **A window with no active run of its own** closes without asking, whatever runs in other projects, and touches no run.
  So does a window that holds no workspace and leaves another main window open.

  **Revision 3:** guard (2) refuses such a window's close only while its own workspace has an integration running. It never refuses a window that holds no workspace and leaves another main window open.
- **REQ-SHELL-021's gate 3** counts the requesting window's own workspace (through REQ-SHELL-122, whose test "a run is
  active" is the gate's; *since 2026-10-13 this directive narrows REQ-SHELL-021 itself as well, beside PD-SHELL-001's
  disjoint case of the add-a-window gestures, [OQ-237](../../architecture/open-questions.md); the reason first given here no
  longer is one:* "REQ-SHELL-021 itself is already narrowed by PD-SHELL-001, and the generator admits one narrowing
  directive per requirement, so this directive narrows the count rather than the gate"): a window whose project has no run active may
  open another project while another window's project runs, and the window whose project runs is declined with "Finish the
  active run before opening another project." as before. A switch's outgoing window therefore closes asking nothing, its
  workspace's count being zero once the gate has passed; a run started in between is asked about at that close, and a
  Cancel there discards the replacement (REQ-STARTUP-047).

  **Revision 3: gate 2** on the same route counts the requesting window's own workspace in the same way:

  - a window whose project runs no integration may open another project while another window's project integrates;
  - the window whose project integrates is declined with "Finish the worktree integration before opening another project.", as before;
  - a window that holds no workspace passes gate 2.

  This case and gate 3's case hold alike for REQ-STARTUP-053's chooser opened from a live window and for REQ-WORKSPACE-012's refusals, because the one workspace-open flow serves them and the chip. PD-SHELL-001's add route still evaluates no gate.
- **A worktree integration running** (**revision 3**). An integration is running from the moment main admits its start (REQ-GIT-124's refusals passed) until main sees its end. The end is REQ-GIT-133's promotion or failure, a preparation failure (REQ-GIT-127, REQ-GIT-130), or the process carrying it reported gone.

  Guard (2) and gate (2) read main's own record of it, keyed by the base workspace (REQ-GIT-128: "At most one integration runs per base workspace at a time"). They never read a worktree binding's `merge_status`: REQ-GIT-130 flushes `integrating` and only REQ-GIT-133 resets it, so a crash or a kill leaves it set. Nor do they read REQ-GIT-128's lock file.

  A record main cannot read refuses no close and declines no request:

  - guard (2) allows, and the close goes on to guard (3), which asks when it cannot read its count;
  - gate (2) lets the flow go on to gate (3), and the switch's outgoing close asks the guards again;
  - main writes at `warn` that the record could not be read.

  While main records an integration running, a box that cannot be shown still refuses, as REQ-SHELL-119 writes.

  The update's clicks, which close every window, are not this case. Under [OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361) (a) they ask guard (2) as REQ-SHELL-119 and REQ-NOTIFY-056 write it, and they decline on a record main cannot read.
- **A quit that starts outside any window** — a signal, the end of the desktop session where Electron emits `before-quit`,
  the driver's or the capture's quit — asks no close guard at all (**revision 2**, [OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298)):
  no active-run confirmation, as built, and no unsaved-settings guard, because such a quit is no **user-initiated** close
  (REQ-SHELL-119 guard (1), REQ-CONFIG-287: "a programmatic close does not prompt"). Unsaved Settings edits stay unsaved and
  nothing is written, so the workspace configuration keeps its last saved values. The main windows close in PD-ORCH-005
  clause 9's all-or-none order, and the run host's shutdown follows at once, leaving the runs as PD-ORCH-005 clause 3 says. A
  quit a person starts outside a window that a later change adds — a tray or menu Quit, or macOS Dock Quit once IC-3 allows
  a macOS release — reopens this case, together with the active-run confirmation noted under "What it costs".

  **Revision 3:** guard (2)'s text carries no "user-initiated", so for guard (2) the reason is REQ-NOTIFY-057: "A shutdown that no user gesture initiated raises no interactive dialog". Guard (2) refuses only by its dialog, and REQ-NOTIFY-056 refuses a person "closing the application".

  > Revision 1 said, and no longer governs: "asks no active-run confirmation, as built; it asks only the renderer's
  > unsaved-settings guard, and its shutdown leaves the runs as PD-ORCH-005 clause 3 says. *Since 2026-10-14
  > ([`PD-SHELL-010`](pd-shell-010.md#pd-shell-010), [OQ-297](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-297)) it asks that guard only while the
  > renderer can answer: a renderer that is gone, fails main's liveness probe or is reported `unresponsive` cannot, its guard
  > allows, and the quit goes on asking nothing more. A renderer that answers its probe is still waited for without bound
  > ([OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298), open).*" As built under it, a SIGTERM, the driver's quit or the
  > capture's quit with Settings left unsaved raised REQ-SHELL-124's Save/Discard/Cancel and held the quit — the run host never
  > asked to `shutdown` — until a person answered or the process was killed.

**As built.** `confirmActiveRunClose`, `activeRunCloseBox` and `windowCloseBox` (`apps/desktop/src/main/close-confirmation.ts`),
wired in `confirmRunsAtClose` (`apps/desktop/src/main/index.ts`), which awaits the run host's `runs.stopWorkspace` before the
close guard confirms the close, so the stop reaches the run host before the window's presenter is revoked; the stopped
sessions are kept in `QuitState.stoppedByClose` (`apps/desktop/src/main/exit.ts`), which `dialogCloseAnswersDeny`, the
question dock's cancellation (`apps/desktop/src/main/commands/session.ts`), the unshown-approval report and the notice
relay read until the session's rest is published *(as first built; since fin29 the same day, until the stopped run's own
`run.result`, whose outcome notice is held too — see the follow-up below)*. The run host's count and stop are keyed by the session row's
`workspace_root` (`Sessions.activeRunCount(workspaceRoot?)`, `Sessions.stopActiveIn`, `packages/engine/src/sessions.ts`;
`runs.active` and `runs.stopWorkspace` in `apps/desktop/src/run-host/dispatch.ts`). *Revision 3, built 2026-10-21 (loc1,
`loc1-guard-2`):* `integrationAllowsClose` (`apps/desktop/src/main/integration-guard.ts`) takes the closing window's
`othersStaying` and its own `workspaceId`, asks the reader for that workspace while another main window stays (asking nothing
for a window that holds none) and for the instance at the last, and allows with a `warn` line on a reader that rejects;
`guardClose` (`apps/desktop/src/main/main-windows.ts`) lets a guard (2) that rejects go on to guard (3);
`integrationDeclinesWorkspaceOpen` is asked by `MainWindows`'s workspace-open gates with the requesting window's workspace id,
passes a window that holds none, and goes on to gate (3) with a `warn` line on a reader that rejects; the reader's type,
`WorktreeIntegrationRunning`, takes an optional base-workspace id, and main still wires `noWorktreeIntegration` in
`apps/desktop/src/main/index.ts`, so nothing refuses in the built app. The update's closes, which are not this directive's
case, ask `integrationAllowsUpdate` through `UpdaterDeps.integrationAllows` (`apps/desktop/src/main/updater/updater.ts`, OQ-361
(a)).

**Why, and what it costs.** OQ-206, ruled 2026-10-07 under the owner's delegation (R-072). Before this, the close of one of
several windows asked nothing and ended nothing: the run kept executing and spending where no window showed it, its
approvals and pause dialogs opened over an unrelated project (`ownerOfSession` falls back to the active window), the other
window's switch was refused with "Finish the active run" about a run it never showed, and the last close told the person to
return to a window that never held the run. PD-SHELL-002 has each project's runs live in the window open on that project;
this directive makes the box true at every close that shows it. What it costs: a window can no longer be closed with its
run left going — a person who wants the run to carry on minimizes the window instead; a logout warns about nothing (on
Windows Electron emits no `before-quit` at a logout or shutdown at all,
[`a-windows-logout-skips-the-orderly-shutdown.md`](../../defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md)); and macOS
Dock Quit is a person's quit outside any window, which asks nothing — to be reopened when a macOS release is authorized
(IC-3, PD-STARTUP-001).

**Why, and what it costs: revision 3.** OQ-361, ruled 2026-10-20 under the owner's delegation (R-072).

As revisions 1 and 2 left them, guard (2) and gate (2) were instance-wide. One project's integration would have:

- refused the close of every other project's window, under a box saying "Keep Rotaris open ...", even though that close ends nothing of Rotaris;
- declined every other window's switch with "Finish the worktree integration ...", about a merge that window never showed.

That is the harm OQ-206 repaired for runs.

An integration belongs to one base workspace (REQ-GIT-124, REQ-GIT-126, REQ-GIT-128), so the window's own workspace is the key this directive already counts runs by. The integrating window can neither close nor switch while its integration runs. The last window left is therefore its own, and the instance-wide last case keeps REQ-NOTIFY-056 whole.

A refusal that no answer can pass is the close [`PD-SHELL-010`](pd-shell-010.md#pd-shell-010) exists to prevent. Had the guard read the durable `merge_status`, one crash would have left a window that could never close. REQ-SESSION-064 forbids that kind of permanent block for integration's own precondition check.

What it costs:

- if main's record were ever unreadable, a person's close could cut off an integration, leaving the base untouched (REQ-GIT-133) and the bindings `integrating`. The record is main's own, so only a defect makes it unreadable;
- integration's builder must keep that record in main, rather than reading the stamp or the lock.

> **Narrows:** REQ-STARTUP-046, REQ-SHELL-119, REQ-SHELL-122, REQ-SHELL-021, REQ-STARTUP-053, REQ-WORKSPACE-012, REQ-NOTIFY-056

*REQ-SHELL-021 joined the Narrows line on 2026-10-13 under [OQ-237](../../architecture/open-questions.md) (GV1,
[R-072](../requests.md#r-072)): OQ-206's ruling named it, and the one-narrowing-per-requirement rule that kept it out no longer
holds. Its case, gate (3)'s count on the replacement route, is disjoint from `PD-SHELL-001`'s, the two add-a-window
gestures on which no gate is evaluated.*

*REQ-STARTUP-053, REQ-WORKSPACE-012 and REQ-NOTIFY-056 joined the Narrows line on 2026-10-20 under [OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361) (revision 3):*

- *REQ-STARTUP-053 and REQ-WORKSPACE-012 for gate (2)'s scope, and for gate (3)'s count. Revision 1 built that count for the chooser and the refusal, as for the chip, and wrote no back-pointer for it;*
- *REQ-NOTIFY-056 for a record main cannot read.*

*Raised by the consortium under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the ruling of
[OQ-206](../../architecture/open-questions.md) (advocate A, the user's lens, followed). Revision 2 ruled by the consortium under
the same delegation, 2026-10-14, the ruling of [OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298). Revision 3 ruled by the consortium under the same delegation, 2026-10-20, the ruling of [OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361) (both advocates followed in part).*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072):** the directive held as written, and one claim the
> record carried was false. The run host's per-workspace predicate ADR-0013 names as its registry's job was not built: every
> count was instance-wide (`runs.active`'s "Sessions are not keyed by workspace yet"); it now keys by the session row's
> `workspace_root`, which REQ-SHELL-021's gate 3 and the restore's refusal (REQ-SESSION-201), which already passed the
> window's workspace id, now read. A third caller passed the window's workspace id too and must not read the keyed count:
> `session.start`'s forced isolation (REQ-GIT-120, REQ-MONITOR-251: "whenever **any** run is active"), which keyed would have
> stopped forcing a launch in an idle project into a worktree while another project's run executed. It asks the instance's
> count (the empty id) instead, so the launch rule is unchanged by this directive; `commands/session.test.ts`'s REQ-GIT-120
> case pins it, red on the keyed request (found by the verifier of this change, repair round 1). *Falsified the same day by
> [`PD-GIT-001`](pd-git-001.md#pd-git-001) (OQ-224), the claim kept:* "any" is not the whole instance — `session.start` and the launch
> dialog now ask one per-workspace count, `scope: 'sharing'`, and a launch in an idle project shares its own base tree. The record's claim that "the desktop's logout" reaches `before-quit` holds on Linux and
> macOS only; on Windows Electron's own typings say neither `before-quit` nor `will-quit` is emitted at a logout or shutdown
> (recorded as a defect, not repaired here). **What was measured.** `close-confirmation.test.ts`, `exit.test.ts`,
> `commands/session.test.ts`, `dispatch.test.ts`, `main-windows.test.ts` (the two-window gesture) and `run.test.ts` (the
> keyed count and the workspace stop resting the run `paused` by `stop`, the other workspace's run untouched), fourteen
> cases red on the source before this change; and `part-j-proof`'s two-window launch (`pair-app`), driven: the idle
> window's close asked nothing and left the other project's run `running`, the running window's close asked "Close this
> window while a run is active?" once, answered Yes, and its session rested `paused`, `user_cancelled`, its iteration open by
> `stop`, before the window closed; the last window's quit asked nothing. The routing that holds a stopped session's notice
> back, ends the hold at a later run's start and keeps its queued approvals from being reported unshown is
> `QuitState.holdsBack` and `QuitState.unshownToReport` (`apps/desktop/src/main/exit.ts`), which `runHost.onEvent` and
> `unshownApprovals` in `index.ts` call; `exit.test.ts` pins each gate, every case red with its gate removed (as first
> built the routing sat inline in `main()`, where no test reached it: found by the verifier, repair round 1, which also
> found that a rest published before the stop's reply left the session held for its next run, now repaired and pinned).
> **What was not measured.** A held-back notice, a withdrawn approval dialog or question dock in the built app: no proof
> makes a stopped session publish a notice or hold a dialog as its window closes, so the one-line calls in `index.ts` are
> exercised by no test or proof; a Windows host (IC-3 — *corrected 2026-10-14: a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Follow-up, 2026-10-20, on Windows (the Windows ARM64 session's C5).** **Still not measured:** the pair stage on Windows. `part-j-proof` reached it on one run of five and stopped there, on the proof's own window name (a forward-slash suffix that never matches a Windows path: [the note](../../defects/part-j-proofs-two-window-launch-names-a-window-by-a-forward-slash-suffix-that-never-matches-on-windows.md)); the other four stopped earlier, at `pause`, on a first store refused with EPERM ([the note](../../defects/a-first-store-on-windows-is-refused-with-eperm-on-its-sibling-and-the-workspace-does-not-open.md)). So the idle window's close, the running window's one question, the PD-SHELL-009 log line, `approval_withdrawn` against `approval_denied` and the held-back notice were not read on Windows. What was read: a simulated logoff over an open approval dialog withdrew it (`approval_withdrawn`, no `approval_denied`) and paused the session with its iteration open by `quit` (`docs/defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md`, stage A).
>
> **Follow-up, 2026-10-07, fin29 (fin28 reviewers' findings on the landed build, 2631eaf).** Four claims of the first
> execution were short of the directive, each recorded and repaired: **the hold followed statuses, not the run** — a run
> stopped before it had saved an active status (one released from the plan gate, or continued) lost its hold at its
> `cancelling`, a session never continued kept its notices held for as long as main ran, and the stopped run's own outcome
> notice (raised by main from `run.result`) was never held at all; `QuitState` now holds a stopped session until its run's
> `run.result`, holds that outcome, and ends there
> ([`a-window-close-registers-a-stopped-session-by-the-status-main-last-saw.md`](../../defects/fixed/a-window-close-registers-a-stopped-session-by-the-status-main-last-saw.md),
> [`a-stopped-session-that-is-never-continued-keeps-its-notices-held.md`](../../defects/fixed/a-stopped-session-that-is-never-continued-keeps-its-notices-held.md));
> **the box counted runs its Yes could not stop** (a run still ending is `isRunActive` and takes no stop), so the close now
> asks `runs.active` with `scope: 'stoppable'`, the stop's own predicate
> ([`the-window-close-box-counts-runs-its-yes-cannot-stop.md`](../../defects/fixed/the-window-close-box-counts-runs-its-yes-cannot-stop.md));
> and **what was not measured above is now measured**: `run.test.ts` pins the workspace stop's withdrawal of a pending wait and
> its end of a background session (clauses 9 and 10), REQ-SHELL-021 carries a cross-reference to this directive by way of
> REQ-SHELL-122, and `part-j-proof`'s two-window launch closes A while its run waits on an approval dialog — the store
> records `approval_withdrawn` and no `approval_denied`, and the stopped run's outcome is held back from B
> ([`pd-shell-009s-withdrawal-and-hold-paths-are-pinned-by-no-engine-case-or-proof.md`](../../defects/fixed/pd-shell-009s-withdrawal-and-hold-paths-are-pinned-by-no-engine-case-or-proof.md)).
> The Windows logout recorded above now runs the orderly shutdown on a main window's `session-end`
> ([`a-windows-logout-skips-the-orderly-shutdown.md`](../../defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md)); the
> Windows run that shows it is owed. **Still not measured:** the unshown-approval report in the built app (no proof queues a
> second approval behind an open dialog); a Windows host.

> **First execution of revision 2, 2026-10-14 (fin45, `fin45-supervision-and-quit`):** built as ruled. `quitGuardsOutsideAnyWindow`
> (`apps/desktop/src/main/exit.ts`) answers, for each open main window, a guard whose `ask` allows at once and whose `confirm` and
> `close` are the window's own `CloseGuard`'s (or the fallback's); `before-quit` in `apps/desktop/src/main/index.ts` feeds it to
> `closeThroughGuards`, keeping clause 9's ask-all, confirm-all, close-all order and its line, and adds one: "quit: started outside
> any window; no close guard is asked, and unsaved settings, if any, stay unsaved (OQ-298)". A window's own close (`guardClose`) and
> REQ-SHELL-021 gate (1) (`closeGuard`) are unchanged. **What was measured.** `exit.test.ts`, "OQ-298": over two windows whose
> renderer guard never settles, the builder asks no renderer, `closeThroughGuards` resolves true and both confirms precede both
> closes (a window with no `CloseGuard` takes the fallback in the same order); the same quit wired through the window's own
> `CloseGuard` stays held, the as-built shape. `pnpm exit-trace-proof` (37 of 37, load 1.9 to 2.3 on 4 CPUs): `hang` — the
> renderer stopped with SIGSTOP, the driver's quit exited 0 in 625 ms with the OQ-298 line and no PD-SHELL-010 `warn` line (it was
> 5.6 s under PD-SHELL-010's probe); `unsaved-quit` and `unsaved-sigterm` — the renderer's guard replaced by one that never settles
> (a dirty Settings form's guard until a person answers), the driver's quit and SIGTERM to main each exited 0 through
> `quit: exiting with status 0` in 133 ms and 70 ms, no dialog, the workspace configuration file byte-identical. On the build
> before the change the same proof read 28 of 37: `hang` released only by the 5 s probe (5,621 ms, with the `warn` line), and both
> `unsaved` launches held with no exit in 20 s until the immediate exit ended them. `hang-close` (a person's close, still asking
> the renderer) stays PD-SHELL-010's measure, 5,567 ms. `pnpm workspace-proof` (63 passed, 2 skipped): the `veto` and `add-window`
> launches, whose renderer guard refuses every close, now end at the driver's quit through the orderly path with the OQ-298 line.
> **Found beside it.** A second quit during the orderly shutdown exits at once, as REQ-MONITOR-283 requires: with the run host
> stopped (SIGSTOP) after a first quit, a second — SIGTERM or the driver's quit — exited 0 in 53 ms and 110 ms (a scratch check,
> not a proof). The update's closes (`mainWindows.dispose()`, REQ-STARTUP-119/121) ask no unsaved-settings guard either; whether
> `Restart now`, a person's action, is a user-initiated close for guard (1) is raised as
> [OQ-311](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-311). **Not measured:** a real dirty Settings form (the guard was replaced, which
> the ruling's implementation allows), a desktop logout, a Windows or macOS host. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **The added line's wording, corrected 2026-10-14 (fin46, `fin46-accept1-8`, C4):** the line quoted above, "no close guard is
> asked", sat beside clause 9's "closing N main window(s) through their close guards first" and read as its opposite: the windows
> do close through their own `CloseGuard`s, which put no question. It now reads "quit: started outside any window; each close
> guard allows without a question, so no Save/Discard/Cancel or active-run box is shown, and unsaved settings, if any, stay unsaved
> (OQ-298)"; clause 9's line is unchanged, and so is the behaviour. The handler is `QuitOutsideAnyWindow` (`exit.ts`) since the
> same round
> ([`the-quit-log-says-it-closes-through-close-guards-beside-saying-none-is-asked.md`](../../defects/fixed/the-quit-log-says-it-closes-through-close-guards-beside-saying-none-is-asked.md),
> [`no-unit-test-pins-the-before-quit-wiring-of-a-quit-outside-any-window.md`](../../defects/fixed/no-unit-test-pins-the-before-quit-wiring-of-a-quit-outside-any-window.md)).

> **First execution of revision 3, 2026-10-21 (plan loc1, `loc1-guard-2`; Windows 11 ARM64, Node 24.18.0 arm64, dev tree):**
> built as ruled, **held over fakes and vacuous in the built app by construction**, because main still reads
> `noWorktreeIntegration`. **What was measured.** `integration-guard.test.ts`: the close of one of several windows refused only
> for its own workspace's integration (the reader asked with that id, the box shown once), allowed for another workspace's
> (a reader that answers the instance-wide asking true as well), allowed without asking for a window that holds no workspace;
> the last window asking the instance; a reader that rejects allowing with one `warn` line; the gate's sentence for the own
> workspace, `null` for another's, for no workspace (not asked) and for a reader that rejects (one `warn` line).
> `main-windows.test.ts`: over windows on `C:/a` and `C:/b` with `C:/a` integrating, B's chip went on through gate 3 to the
> chooser and switched while A's was declined with the sentence; a window with no workspace passed gate 2; a guard 2 that
> throws went on to guard 3, which decided. Of those and the update's cases, 25 were red on the unchanged source. `pnpm
> workspace-proof` (50 passed, 0 failed, 5 skipped on Windows) and `pnpm exit-trace-proof` (36 checks) read as before: the gate 3
> check passes through gate 2, now asked with the requesting window's workspace id, and a person's close and the quits read as
> they did. **What was not measured.** Any refusal or decline in the built app: no build admits an integration. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md); the gap the ruling's reading of `merge_status`
> exposed is
> [`a-worktree-binding-left-integrating-by-a-crash-is-never-reset-and-never-offered-for-merging-again.md`](../../defects/a-worktree-binding-left-integrating-by-a-crash-is-never-reset-and-never-offered-for-merging-again.md).
