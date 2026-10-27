# Open questions — Spikes, and the questions raised since (30 of 35)

Part 63 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-361, OQ-331.

<a id="oq-361"></a>

**OQ-361 — Where does REQ-SHELL-119's guard (2), "Integration in progress", stand beyond a person's close of one window?**
*(REQ-SHELL-119 guard (2), "while a worktree integration is running, the close is refused **unconditionally** by an informational
dialog titled "Integration in progress""; guards (1) and (3), each written for a **user-initiated** close; REQ-SHELL-021 and
REQ-STARTUP-053 gate (2); [OQ-311](61-spikes-and-later-questions-28.md#oq-311), which ruled the update's `Restart now`, `Update now` and `Try again` user-initiated closes
for guard (1) and said nothing of guard (2); [OQ-86](15-specification-questions-10.md#oq-86), the same for guard (3); [OQ-298](61-spikes-and-later-questions-28.md#oq-298), under which a quit that starts
outside any window asks no close guard; [`PD-SHELL-009`](../../product/directives/pd-shell-009.md#pd-shell-009), which scoped guard (3) at the close of
one of several main windows to that window's own project and left guard (2) as written; REQ-GIT-083 and REQ-GIT-125 to REQ-GIT-135,
worktree integration itself, deferred from the first release. Raised 2026-10-15 by fin47 (`fin47-guard-and-support`) while building
the guard
([`the-integration-in-progress-close-guard-has-no-code.md`](../../defects/fixed/the-integration-in-progress-close-guard-has-no-code.md));
the plan's range OQ-361 to OQ-380, its first number — renumbered at landing if a sibling took it first. **Ruled 2026-10-20.**)*

**What is open.** The guard is built in its place in both fixed orders (`apps/desktop/src/main/integration-guard.ts`): a person's close
of a main window asks it between the renderer's unsaved-settings guard and the active-run confirmation (`guardClose`), and the
workspace chip's and the chooser's flow between gates 1 and 3 (`MainWindows`'s workspace-open gates). Main reads
`noWorktreeIntegration`, since nothing writes a binding's `'integrating'` status, so the guard refuses nothing in this build. Three
things the requirement does not fix, all reachable only once integration is built:

- **(a) The update's closes.** OQ-311 reads `Restart now`, and `Update now` / `Try again` on the installer flavour, as user-initiated
  closes of every main window, and asks guard (1) then guard (3) at the click and again at the hand-off. Guard (2)'s "unconditionally"
  says a close is refused while an integration runs, which would hold the update's restart back; nothing says whether those clicks
  are a close guard (2) refuses, nor whether the installer's 1,200 ms auto-close and the portable's in-place apply, which ask nothing
  under OQ-311, are refused by it.
- **(b) One of several main windows.** "While a worktree integration is running" names no project. PD-SHELL-009 scoped guard (3) at
  the close of one of several windows to that window's own project; whether guard (2) refuses such a close for an integration of
  another window's project, or only for the window's own, is not said. The same holds for the chip's gate 2 in a window whose project
  runs no integration.
- **(c) A state that cannot be read.** Whether an integration state main cannot read counts as one running (the close refused, with
  no answer that lets it through) or as none.

**What the build proceeds under** *(superseded 2026-10-20 by the ruling below; kept as the reading the build proceeded under
until then)*. (a) No update path asks guard (2): the updater's closes ask guards (1) and (3) as OQ-311 and OQ-86
ruled, and an integration running would not hold them. (b) The guard and the gate are instance-wide, as the requirement is written:
any integration running refuses every main window's close and declines every window's workspace-open flow. (c) A state that cannot
be read counts as an integration running, as an active-run count that cannot be read counts as a run active (REQ-STARTUP-046's
reading, `confirmActiveRunClose`). A quit that starts outside any window asks no guard, guard (2) included, as OQ-298 ruled.

**What a ruling decides.** For (a), whether the update's user-initiated closes ask guard (2) at the click and at the hand-off (and so
decline while an integration runs), and whether its programmatic closes do. For (b), whether guard (2) and gate (2) are instance-wide
or the window's own project's. For (c), which way an unreadable state falls. **The costs:** refusing the update's restart keeps a
person from an update until the integration ends, where not refusing it can cut an integration off mid-merge; an instance-wide guard
holds windows whose projects are idle, where a per-project one needs integration to say which workspace it belongs to; an unreadable
state that refuses leaves a close no answer can pass, where one that allows can cut an integration off.

**What a live run then shows.** Nothing: no build integrates a worktree, so no live scenario reaches the guard.

**Ruled 2026-10-20 under the owner's delegation ([R-072](../../product/requests.md#r-072)).** Kind change-behaviour. Points (b) and (c) depart from "while a worktree integration is running" as REQ-SHELL-119, REQ-SHELL-021, REQ-STARTUP-053, REQ-WORKSPACE-012 and REQ-NOTIFY-056 write it. They are recorded as [`PD-SHELL-009`](../../product/directives/pd-shell-009.md#pd-shell-009) **revision 3**, the directive that already narrows REQ-SHELL-119 and REQ-SHELL-021 for guard (3) and gate (3). Point (a) follows the requirements as written and takes no directive.

**(a) The update's closes ask guard (2).**
- `Restart now`, and `Update now` / `Try again` on the installer flavour, are user-initiated closes of every main window ([OQ-311](61-spikes-and-later-questions-28.md#oq-311)), and they close the application. So two requirements govern them as written:
  - REQ-SHELL-119 guard (2): the close is refused "unconditionally", and the guard's text carries no "user-initiated";
  - REQ-NOTIFY-056: "Closing the application while an isolated worktree integration is running is refused".
- Each of these clicks asks guard (2) twice: at the click, and again immediately before the installer or the successor starts. It asks after REQ-SHELL-124's Save/Discard/Cancel and before [OQ-86](15-specification-questions-10.md#oq-86)'s run box. This is REQ-SHELL-119's order, and REQ-CONFIG-287's: "the unsaved-settings prompt precedes any integration-in-progress prompt".
- The question covers the whole instance, since every window closes.
- While an integration runs, the "Integration in progress" box is shown over the active main window and nothing is started:
  - the notice stays as it was;
  - at the installer's hand-off, the verified download is discarded and the offer comes back in the same notice (OQ-86's declined path).
- A record main cannot read declines with no box and a `warn` line. The updater already declines this way for every guard it cannot ask. A declined update traps nothing: every window stays closable and the update stays offered.
- The portable's in-place apply closes nothing. The installer's 1,200 ms auto-close follows a hand-off whose guards were asked immediately before the installer started; under REQ-SHELL-120 the windows are then committed to closing. Neither asks anything, as OQ-311 ruled, and REQ-NOTIFY-057 forbids a box there: "A shutdown that no user gesture initiated raises no interactive dialog".

**(b) Guard (2) and gate (2) count the window's own project, as guard (3) and gate (3) do.**
- A person's close of one of several main windows is refused by guard (2) only while main records an integration running for the closing window's own workspace.
  - An integration in another window's project neither refuses the close nor shows the box.
  - A window that holds no workspace and leaves another main window open is never refused.
- The last main window's close counts the whole instance.
- REQ-SHELL-021 gate (2), REQ-STARTUP-053 gate (2) and REQ-WORKSPACE-012 count the requesting window's own workspace. A window that holds no workspace passes gate (2). PD-SHELL-001's add route still evaluates no gate.
- The specification already says which workspace an integration belongs to:
  - REQ-GIT-128: "At most one integration runs per base workspace at a time";
  - REQ-GIT-124: "an integration is already running for this workspace";
  - REQ-GIT-126: the progress dialog is window-modal.

  So the entry's stated cost, that a per-project guard "needs integration to say which workspace it belongs to", is already met.
- The integrating window can neither close nor switch while its integration runs. The last window left is therefore always its own, and nothing REQ-NOTIFY-056 protects is lost.
- REQ-STARTUP-053 and REQ-WORKSPACE-012 join revision 3's Narrows line. Their notes also record gate (3)'s count, which revision 1 built for the same flow without a back-pointer.

**(c) What "running" means, and a record that cannot be read.**
- An integration is running from the moment main admits its start (REQ-GIT-124's refusals passed) until main sees its end. The end is one of:
  - REQ-GIT-133's promotion or failure;
  - a preparation failure (REQ-GIT-127, REQ-GIT-130);
  - the process carrying it reported gone.
- Guard (2), gate (2) and the update's question read main's own record of that, keyed by the base workspace. They never read either of the following.
  - **A worktree binding's `merge_status`.** REQ-GIT-130 flushes it as `integrating`, and only REQ-GIT-133 resets it. One crash or kill would therefore leave a window that no answer could ever close. REQ-SESSION-064 forbids that kind of permanent block for integration's own precondition check.
  - **REQ-GIT-128's lock file.** Another host's lock is not this instance's to protect. A dead process's lock protects nothing. A reused pid reads as live. A file on storage that cannot be reached cannot be read.
- A record main cannot read refuses no person's close of a main window and declines no workspace-open request:
  - guard (2) allows, with a `warn` line, and the close goes on to guard (3), which asks when it cannot read its count;
  - gate (2) lets the flow go on to gate (3), and the switch's outgoing close asks the guards again.
- A refusal that no answer can pass is the kind of close [`PD-SHELL-010`](../../product/directives/pd-shell-010.md#pd-shell-010) exists to prevent. Its box would also claim a merge that may not be running.
- While main records an integration running, a box that cannot be shown still refuses, as built.

**[OQ-298](61-spikes-and-later-questions-28.md#oq-298) and earlier rulings.**
- [OQ-298](61-spikes-and-later-questions-28.md#oq-298) stands for guard (2): a quit that starts outside any window asks no guard. Its stated reason (guard (1)'s "user-initiated", and REQ-CONFIG-287) does not reach guard (2), whose text has no such qualifier. REQ-NOTIFY-057 does reach it, and revision 3 writes it into that case.
- No owner ruling is revised. OQ-86's confirmation keeps its place after guard (2), as it kept its place after guard (1) under OQ-311.
- Worktree integration stays deferred ([R-071](../../product/requests.md#r-071); `first-release-plan.md`, "Git integration and merge"). Every point is therefore vacuous in the first release, and is pinned over fakes.

*The readings the build proceeded under, kept above, are the falsified ones:*
- *(a) no update path asks guard (2);*
- *(b) guard (2) and gate (2) are instance-wide at every window;*
- *(c) a state that cannot be read counts as an integration running.*

*The entry attributed (c) to REQ-STARTUP-046, whose text has no such clause. The reading came from `PD-SHELL-009` and OQ-86, and it was about an active-run count, whose question has a Yes that lets the close through.*

The two recommendations weighed, and the ruling followed **both**, each in part:
- **Advocate A (the user's lens)** recommended:
  - (a) the update's user-initiated closes ask guard (2) at the click and at the hand-off, in REQ-SHELL-119's order, and the auto-close asks nothing;
  - (b) guard (2) and gate (2) are scoped to the window's own project, with the last window counting the instance, as `PD-SHELL-009` revision 3 with REQ-STARTUP-053 added;
  - (c) the build's refusal on an unreadable state is kept, but "running" is bound to "an integration this instance started and has not seen end", or to this host's lock held by a live pid, and never to the durable `merge_status` alone.

  The ruling took (a) and (b) whole, A's span for "running", and A's decline at the update. It declined two parts:
  - A's refusal at a window's close. Whenever the record cannot be read, that leaves a close no answer can pass, which is the trap A's own rule was written against.
  - A's lock-file limb. A reused pid or unreachable storage turns it into that same trap.
- **Advocate B (the system's lens)** recommended:
  - the same (a), resting it on REQ-NOTIFY-056 and REQ-NOTIFY-057, which nothing in the record or the code cited;
  - the same (b), adding REQ-WORKSPACE-012 to the Narrows line and recording the gate (3) back-pointers missing from it and from REQ-STARTUP-053;
  - (c) an unreadable state lets the close go on to guard (3) and the flow go on to gate (3), with a `warn` line; "running" means an integration run live in this instance's run host, and never the stamp.

  The ruling took B's two requirements, B's REQ-WORKSPACE-012, B's direction at the close and at the gate, and B's reason for OQ-298's reach. It declined two parts:
  - B's run-host reader. It covers only REQ-GIT-131's hidden run, not the preparation and promotion around it, and it asks across a process boundary when main can keep the record itself.
  - B's defect note on the two uncited requirements. The citations this ruling writes close that gap.

Both advocates set deferral aside, and so does the ruling. Nothing a first-release user meets depends on this. But the falsified readings, and the stamp reader that `integration-guard.ts` plans, would otherwise reach integration's builder without the rulings that decide them.

**Reopening condition:**
- worktree integration is built (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135) with its running state held anywhere but main's own record, or read from a binding's `merge_status` or from the lock file;
- two main windows are open on one workspace (against REQ-STARTUP-163), which would make the window's own workspace the wrong key;
- a quit that a person starts outside any window is added (a tray or menu Quit, macOS Dock Quit), which reopens OQ-298 for guard (2) as it does for guards (1) and (3);
- an integration is admitted after an update's hand-off has passed its guards, in the 1,200 ms before the installer's auto-close (REQ-SHELL-120).

**What a live run then shows.** Nothing. No build integrates a worktree, so no live scenario reaches guard (2), gate (2) or the update's question.

*Built 2026-10-21 (plan loc1, bundle `loc1-guard-2`), over fakes, vacuous in the built app by construction:*
- *(b) and (c) at a person's close: `integrationAllowsClose` (`apps/desktop/src/main/integration-guard.ts`) asks the reader,
  now `WorktreeIntegrationRunning = (workspaceId?) => Promise<boolean>`, for the closing window's own workspace while
  another main window stays, nothing for a window that holds none, and the instance at the last window; a reader that
  rejects writes one `warn` line and allows, and `guardClose` (`main-windows.ts`) lets a guard (2) that rejects go on to
  guard (3). Wired in `index.ts` with `anotherMainWindowStays` and the window record's `workspaceId`.*
- *(b) and (c) at the workspace-open flow: `integrationDeclinesWorkspaceOpen` takes the requesting window's workspace id,
  passes a window that holds none without asking, and goes on to gate (3) with a `warn` line on a reader that rejects.*
- *(a): `integrationAllowsUpdate` asks the instance, shows the box while one runs and declines on a reader that rejects;
  `UpdaterDeps.integrationAllows` (`updater/updater.ts`) is asked after `confirmUnsaved` and before the run box at the click
  of `Restart now` and of the installer's `Update now` / `Try again`, and in `confirmAtHandOff` before the successor's start
  and in `beforeApply`, a decline answering `UPDATE_DECLINED_INTEGRATION`; the portable's apply and the 1,200 ms auto-close
  ask nothing.*
- *The reader is still `noWorktreeIntegration`, answering false with and without an id, so nothing refuses in the built app.*

*The tests: `integration-guard.test.ts` (the close's four scopes, the unreadable record, the gate's three cases and its
unreadable record, `integrationAllowsUpdate`'s four), `main-windows.test.ts` (gate 2 over two windows, a window with no
workspace passing it, a guard 2 that throws going on to guard 3) and `updater.test.ts`'s OQ-361 block (both refusals of each
action, the order at both moments, the portable, the auto-close, a dependency that throws) with the OQ-311 block's order
gaining the integration entries: 25 cases red on the unchanged source. `workspace-proof` and `exit-trace-proof` read as
before on Windows; no proof reaches a refusal. The row is in [`first-executions.md`](../first-executions.md); the defect the
ruling's reading of `merge_status` exposed is recorded as
[`a-worktree-binding-left-integrating-by-a-crash-is-never-reset-and-never-offered-for-merging-again.md`](../../defects/a-worktree-binding-left-integrating-by-a-crash-is-never-reset-and-never-offered-for-merging-again.md).*

<a id="oq-331"></a>

**OQ-331 — What bound does a duress run's write-scope refusals meet, when its request routes two file tasks to personas that write
no files?** *(REQ-TOOLS-152's `write_scope` as [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006) narrows it: revision 3's
refusal of a scope for a persona that writes no files, revision 4's catalogue, revision 8's routing sentence and revision 9's
write-scope sentence and field description; REQ-ORCH-028, the routing table that sends design to `architect` and final acceptance to
`verifier`; OQ-216's target of zero, falsified 2026-10-13; [OQ-257](55-spikes-and-later-questions-22.md#oq-257)'s bound of "at most one refusal per duress
run"; [OQ-250](54-spikes-and-later-questions-21.md#oq-250)'s enforced bounds. Raised 2026-10-15 from finding F6 of fin46's final acceptance (round 2 at `3c03287`),
whose duress live run met OQ-257's reopening condition; the plan's range OQ-361 to OQ-380 does not hold it, because it is
written at the number the consortium's ruling names. **Ruled 2026-10-15.**)*

**What is open.** In the duress run at `3c03287` (pack `2026-10-15T04-01-06-491Z`, session `2fe0a837`, 2,820 s, 308 calls, 7
children all succeeded), with revision 9's write-scope sentence and field description in every delegating request, the coordinator
gave a write scope to a persona that writes no files twice: `#105` (task `wave2-decisions`, `architect`, `docs/decisions.md`), refused
in 7 ms before any record and re-routed by the next `delegate` 26.9 s later (`#126`, the architect without a scope, its answer then
handed to a docs-writer at `#204` through `inherited_context`); and `#231` (task `wave3-verify`, `verifier`, `docs/verification.md`),
refused in 17 ms and re-routed 15.9 s later to a `tester` (`#232`). The live run's NOTE read "write-scope refusals over OQ-257's bound
(reopens OQ-257) — duress: 2 write-scope refusals in one run". Every other limb held: each refusal came before any record, each was
re-routed by the coordinator's next request, and no non-writer child was briefed to write. Over the duress runs since OQ-216's target
the count has read **1, 1, 1, 1, 2** (`a68f121` `#115`; `552d346` `#92`; the two `b9e3005` packs, 05:15 and 14:29, one each;
`2fe0a837` two). The duress request itself names two file tasks whose route is a non-writer's: wave 2's decisions document (design,
`architect`) and wave 3's verification report (final acceptance, `verifier`). A bound of one per run counts the run, not the work.

**What the build proceeds under.** `PD-TOOLS-006` revision 9 as built: the sentences, the refusal and the routing table unchanged;
the harness flags the run under OQ-257's bound of one.

**Ruled 2026-10-15 by the consortium under the owner's delegation ([R-072](../../product/requests.md#r-072)), with no directive:**
`PD-TOOLS-006` revision 9 is confirmed as built — `delegate`'s write-scope sentence, the field's description, revision 3's refusal
and the routing table do not change. OQ-257's bound is falsified at `2fe0a837` and replaced by a bound **counted per task**: a run
may have at most one write-scope refusal for each task of its request that routes to a persona writing no files — two in the duress
run (`docs/decisions.md` and `docs/verification.md`), none in any other scenario — each refused before any record exists and
re-routed by the same agent's next `delegate` within 60 s; no task is refused twice, and no non-writer is briefed to write. The
directive's case and behaviour are unchanged, so **no revision 10 is written for it**; revision 9's cost bullet is reported back in
place under revision 9's first execution, its old bound quoted beside the new one, and REQ-TOOLS-152's and REQ-ORCH-028's
back-pointers stand as they are.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended confirming revision 9 as built and restating the bound as what a user meets: each
  piece of work refused at most once, before any record, and re-routed correctly by the next `delegate` within 60 s, the duress
  run's two documents whose route persona writes nothing allowing two refusals. Three rounds of wording (revisions 4, 8 and 9) left
  the count at one or two a run, and a fourth would add tokens to every delegating request for no measured gain. The ruling took
  A's 60 s re-route limb (the harness already measures the seconds, and the largest on record is 30.0 s) and A's key for repeated
  work: the same `write_scope` paths or the same `task_name`.
- **Advocate B (the system's lens)** recommended the same confirmation with the bound held per scenario as a constant (two for
  duress, zero elsewhere), so any refusal in the default run is still flagged; the red-first harness cases; OQ-216's update; and no
  directive revision, since no behaviour changes. The ruling took all four: revision 9's cost bullet is reported back in place, its
  falsified text quoted beside its replacement, as the standing first-execution rule asks. Neither advocate argued for deferring,
  which would leave the NOTE raising a false reopening on every duress pack.

~~At most one `write_scope` refusal for a non-writer per duress run.~~ **Falsified 2026-10-15 at `2fe0a837` and replaced by:** at
most one refusal per task of the run's request routed to a non-writer (two in duress, zero elsewhere), no work refused twice, each
re-routed by the same agent's next `delegate` within 60 s.

**Reopening condition:**
- refusals in a run over that run's count of tasks routed to non-writers (two in duress, zero elsewhere);
- the same work refused twice (the same set of `write_scope` paths, or the same `task_name`);
- a refusal not re-routed by the same agent's next `delegate`, or re-routed after more than 60 s;
- a non-writer briefed to write, with or without a scope;
- any enforced bound OQ-250 lists broken.

**What a live run then shows.** In the duress run each request carries the same `delegate` sentence and field description; at most
two write-scope refusals for a non-writer, one for the decisions document and one for the verification report, each refused before
any record and re-routed by the coordinator's next `delegate` within 60 s, and no task refused twice. A run shaped like `2fe0a837`
prints the seconds to re-route and raises no reopening NOTE. Any refusal in the default run or another scenario is flagged as a
reopening of OQ-331.

*Built 2026-10-15 (fin47, `fin47-delegation-routing`), harness only — no product code changes:* `routingMissReading`
(`apps/desktop/scripts/lib/routing-misses.mjs`) reads each session's `nonWriterFileTasks`, which `live-run.mjs` supplies from
`NON_WRITER_FILE_TASKS` (2 for duress, 0 for every other scenario), and flags refusals over it, the same work refused twice and a
re-route after more than 60 s, beside its existing flags for a refusal with no later `delegate` and one the next `delegate` does not
re-route; the NOTE reads "write-scope refusals over OQ-331's bound (reopens OQ-331)". Pinned by `lib/routing-misses.test.ts`: the
`2fe0a837` shape is not flagged, and a repeat refusal of the same paths under a new `task_name`, three refusals in duress, one refusal
in a scenario with none routed to a non-writer and a re-route after 61 s are each flagged — each red on the code before. The row is in
[`first-executions.md`](../first-executions.md).
