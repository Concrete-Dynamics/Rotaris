# Archived open questions — Spikes, and the questions raised since (27 of 35)

The ruled, closed, resolved and withdrawn entries of [part 60](../../../architecture/open-questions/60-spikes-and-later-questions-27.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-284"></a>

**OQ-284 — What becomes of a stuck trigger a root's empty turn armed when the run does not follow that turn up?**
*(REQ-ORCH-096; REQ-ORCH-104's stuck-mode clause; REQ-ORCH-105, "after every activation cycle … counters and fingerprints MUST
reset"; REQ-ORCH-078 and [`PD-ORCH-015`](../../../product/directives/pd-orch-015.md#pd-orch-015), the plan correction;
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 3. Raised 2026-10-14 by fin43 (`fin43-live-findings`) from
[`../../../defects/fixed/a-stuck-trigger-a-roots-unanswered-empty-turn-armed-lands-after-a-later-plan-correction.md`](../../../defects/fixed/a-stuck-trigger-a-roots-unanswered-empty-turn-armed-lands-after-a-later-plan-correction.md).)*

**What is open.** A root's final empty turn that the run does not follow up — the re-prompt answered by a second silence, or an
empty turn after an answer and a plan correction — arms a stuck trigger that stays pending in that root's supervisor. Confirmed by
tests before this entry was written: when the run then sends a plan correction (REQ-ORCH-078) into the same conversation, the
correction's request takes the trigger at its first step and the stuck corrective follows the correction in that request
(`coordinator-plan.test.ts`, "OQ-284: …", two cases, the second at `validation_retries: 2`). The other route the raising agent
named, the next iteration's first request, **does not occur**: each iteration's root is a fresh task id and so a fresh
conversation in the run's `SupervisorRegistry` (`answerless.test.ts`, "PD-ORCH-009 revision 3 with OQ-284 …"). A root resumed
as a parent after a child's report (`runWithChildren`) would take it the same way and was not measured.

**What the build proceeds under.** As found: the pending trigger is taken by the root's next turn in the same execution, after
whatever message leads it.

**What a ruling decides.** Whether a stuck trigger is withdrawn when the turn that armed it is the root's last (the run's own
follow-up being a correction, not a recovery), whether it stands and the corrective follows the correction (two instructions),
or whether the correction replaces it. **The costs:** withdrawing it loses a stuck report the requirement names; keeping it puts
"Pause and reassess" after an instruction that already tells the root what to do.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a plan correction replaces the
stuck corrective its empty turn armed. When the run sends an execution iteration's root REQ-ORCH-078's plan correction
(`PD-ORCH-015`), the correction is the only message the run adds for the turn it follows: a stuck trigger that turn armed is
withdrawn, so no classification is asked, no corrective message follows, and no stuck `loop_supervisor_activation` is written.
A repetition, cycle or raw-count trigger is kept, so the case stays disjoint from `PD-ORCH-016`. The correction also counts as
REQ-ORCH-105's todo-correction instruction and restarts the consecutive-activation series — REQ-ORCH-105 as written, which the
build did not do (recorded as
[`../../../defects/fixed/a-plan-correction-does-not-restart-the-consecutive-activation-series.md`](../../../defects/fixed/a-plan-correction-does-not-restart-the-consecutive-activation-series.md)).
Recorded as [`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 4 beside [OQ-283](59-spikes-and-later-questions-26.md#oq-283)'s ruling, citing
REQ-ORCH-078, REQ-ORCH-096, REQ-ORCH-099, REQ-ORCH-102 and REQ-ORCH-105 without change. A root resumed with a child's report
after an empty turn is outside this ruling: measured, recorded as a defect note and raised as [OQ-296](#oq-296). *The as-built
reading — the correction followed by the stuck corrective in one request — is kept above as the falsified one.* Written
2026-10-14 by fin44 (`fin44-supervision-and-match`).
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 04:58 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "When the run sends the root its plan correction … the correction is the only message the run adds … The
correction also counts as REQ-ORCH-105's todo-correction instruction, so the consecutive-activation counter resets." **Advocate
B** (the system's lens, change-behaviour): "the plan correction replace the stuck corrective … This would be recorded as
PD-ORCH-009 revision 4 … the correction should also reset the consecutive-activation counter." Both followed.

<a id="oq-285"></a>

**OQ-285 — Does an improvement artifact whose collector crashed read as "nothing to propose", or as the failure it is?**
*(REQ-LIBRARY-023, "On any other crash, `notes` = `collector crashed: <exc>`"; REQ-LIBRARY-124, the zero-proposal info notice and
the failure warning "a job that ended without producing an artifact"; REQ-LIBRARY-035; REQ-NOTIFY-100;
[`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002) revision 2 (c), the retrospective's three notices;
[`PD-CONFIG-003`](../../../product/directives/pd-config-003.md#pd-config-003) revision 2 and OQ-223, the timed-out detail. Raised
2026-10-14 by fin43 (`fin43-live-findings`) from the live scenario run at `ce5f952` (finding F3) and
[`../../../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md`](../../../defects/fixed/a-crashed-improvement-collector-reads-as-an-analysis-that-found-nothing.md).
Ruled 2026-10-14 under R-072, below.)*

**What is open.** A collector that crashes (a provider's 401, a refused request, any raise other than the timeout) still stores
REQ-LIBRARY-023's empty artifact, so REQ-LIBRARY-124 reads it as "a result with zero proposals": the info notice "Improvement
analysis complete — no proposals", or for the retrospective "The retrospective found nothing to propose" with "Nothing was
proposed in <id>.". The failure warning is the letter's only for a job that produced no artifact. `PD-LIBRARY-002` revision 2 (c)
states the retrospective's zero-proposal and failure notices as the requirement states the sibling's and does not name a crashed
collector. A pass that never reached the model is told to the person as one that looked and found nothing.

**What the build proceeded under** *(kept as the falsified reading)*. The letter: a crashed collector's artifact is a
zero-proposal result, its info notice and the detail "Nothing was proposed in <id>."; only a post-run pass's timed-out note
changes the detail (`PD-CONFIG-003` revision 2).

**What a ruling decides.** For each pass, whether a crashed collector's artifact posts the failure warning ("The retrospective
could not be completed" / "The completed run could not be reviewed for improvements", with the crash as its reason) in place of the
zero-proposal notice; or keeps the info notice with a detail that says the analysis failed and why (the timed-out precedent);
and whether the timed-out retrospective, which has no control to name, is read the same way. **The costs:** the warning makes a
stored artifact report as a failure (the artifact still exists, with its notes, in the Library); the detail alone keeps a title
that reads as success.

**What a live run then shows.** `ask-retrospective` with a collector that cannot authenticate (a key withheld) shows the ruled
notice; with the credential repaired it shows neither.

**Ruled 2026-10-14 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a failed
improvement collector posts its pass's failure warning, for both passes. When an empty improvement artifact's notes begin
"collector crashed: " (REQ-LIBRARY-023) or "collector parse failed: " (REQ-LIBRARY-022), the pass posts its own failure warning —
"The completed run could not be reviewed for improvements" or "The retrospective could not be completed" — with no action, in
place of the zero-proposal info notice. The warning carries the recorded reason and says that the stored artifact, named by id,
holds no proposals: "Session <sid> was not reviewed for improvements: <reason>. <artifact id> holds no proposals." for the
post-run pass, "This workspace's own history was not reviewed: <reason>. <artifact id> holds no proposals." for the
retrospective, <reason> being "the analysis call failed (<exc>)" for a crash and "the model's answer could not be read (<err>)"
for a parse failure, each taken from the stored notes. The artifact is stored and the proposal list re-read as before. A timeout
keeps the info notice for both passes: the post-run pass keeps `PD-CONFIG-003` revision 2's detail unchanged, and a timed-out
retrospective's detail reads "The retrospective reached its <t>-second limit before it proposed anything." and names no control.
Recorded as the new directive [`PD-LIBRARY-005`](../../../product/directives/pd-library-005.md#pd-library-005), which narrows REQ-LIBRARY-124 for
both passes (its back-pointer in the same commit), and as [`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002) revision
4, one sentence added to clause (c); REQ-LIBRARY-022, REQ-LIBRARY-023, REQ-LIBRARY-024, REQ-LIBRARY-035, REQ-NOTIFY-100,
REQ-NOTIFY-254, `PD-CONFIG-003` revision 2 and OQ-223 are cited without change. Written 2026-10-14 by fin44
(`fin44-improvement-failures`).
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 04:58 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "When a pass ends on an empty artifact because its collector failed … it posts that pass's existing
failure warning … A timed-out retrospective posts the same warning with the reason 'it reached its <t>-second limit'." **Advocate
B** (the system's lens, change-behaviour): "When a pass's empty artifact records a collector failure … it posts that pass's
failure warning … A timeout keeps OQ-223's info notice and its limit detail … Record this as a new directive, PD-LIBRARY-005."
Both followed on the failure warning; B's on the timeout, which keeps its info notice with the limit in its detail, and on the
vehicle, `PD-LIBRARY-005`.

<a id="oq-295"></a>

**OQ-295 — Does match level 3 shift a blank line?** *(REQ-TOOLS-136 level 3, "exact after one and the same leading-whitespace
prefix is added to or removed from every line of the candidate"; [`PD-TOOLS-015`](../../../product/directives/pd-tools-015.md#pd-tools-015), whose
shift leaves a `new_string` line with no visible character as given; [`PD-TOOLS-019`](../../../product/directives/pd-tools-019.md#pd-tools-019),
which sets a trailing `\r` aside at level 3 and does not decide this; [`PD-TOOLS-014`](../../../product/directives/pd-tools-014.md#pd-tools-014)'s
level-3 near miss. Raised 2026-10-14 by fin43 (`fin43-rename-and-match`) from
[`a-block-with-a-blank-interior-line-never-matches-at-level-3`](../../../defects/fixed/a-block-with-a-blank-interior-line-never-matches-at-level-3.md);
numbered from the top of the plan's range, OQ-281 to OQ-295, to keep clear of its sibling bundles: whichever lands second takes
the next free number.)*

Level 3 as built prepends the prefix to every line of `old_string`, or requires every line to begin with it, blank lines
included, while the window's blank line is empty. So an indentation-shifted block holding a blank line never matches at level 3:
measured with `matchEdit`, a three-line block one tab off with an empty middle line reaches level 4 on an LF file (similarity 0.89
and 0.90, applied unshifted by `write_file` beside "Verify the result.") and no match on a CRLF file; without the blank line it
matches at level 3.

**What the build proceeds under.** As built: a blank line takes part in level 3's shift like any other, and such a block reaches
level 4 or no match.

**What a ruling decides.** Whether level 3 compares a line with no visible character (after `PD-TOOLS-019`'s `\r` is set aside)
without the prefix — so a blank line of `old_string` matches a blank line of the window at any shift, as `PD-TOOLS-015` already
writes a blank `new_string` line as given — or whether the build's reading stands. **The costs either way:** read without the
prefix, level 3 takes more cases level 4 took, and a whitespace-only line of the window that differs from `old_string`'s would
need a rule of its own; kept, the commonest multi-line edit shape — a block with a blank line — is outside `PD-TOOLS-015` and
`PD-TOOLS-014`, and lands unshifted at level 4 beside a success on an LF file.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** level 3 matches blank lines by having
no visible character. Once `PD-TOOLS-019` sets one trailing `\r` aside, a line of `old_string` with no visible character matches a
window line with no visible character at any shift, whatever whitespace either holds, and never matches a line that holds one.
The leading prefix is measured, added and removed only on lines that hold a visible character, starting from `old_string`'s
first such line and the window's line at the same index (`PD-TOOLS-015`'s O and W). An `old_string` with no visible character
never matches at level 3. In a level-3 `write_file` apply, a blank line of `new_string` paired with a blank line of `old_string`
is written as the window's own line, byte for byte. Recorded as [`PD-TOOLS-020`](../../../product/directives/pd-tools-020.md#pd-tools-020)
(narrowing REQ-TOOLS-136 at level 3 only; levels 1, 2 and 4, their order and the first-matching-level rule unchanged), with
[`PD-TOOLS-014`](../../../product/directives/pd-tools-014.md#pd-tools-014) revision 4 (the level-3 sentence names the lines that hold a visible
character when the window holds a blank one) and [`PD-TOOLS-016`](../../../product/directives/pd-tools-016.md#pd-tools-016) revision 4 (clause 1's
pairing also runs at level 3 for blank lines); `PD-TOOLS-015` and `PD-TOOLS-019` carry in-place notes. *The build's reading — "What
the build proceeds under" above, a blank line taking part in the shift like any other — is kept as the falsified one.* Written
2026-10-14 by fin44 (`fin44-supervision-and-match`).
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 04:58 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "a line of `old_string` with no visible character … matches a window line with no visible character at
the same position, whatever the shift … Record this as a new directive, PD-TOOLS-020." **Advocate B** (the system's lens,
change-behaviour): "a line of `old_string` with no visible character matches a window line with no visible character at any shift
… An `old_string` with no visible character never matches at level 3." Both followed.

<a id="oq-296"></a>

**OQ-296 — Is a root's empty turn, followed by a child's report rather than by a message of the run's own, still a stuck report
whose corrective joins the report?** *(REQ-ORCH-096, "an empty reply with no call is the runtime's stuck report"; REQ-ORCH-104's
stuck-mode clause; REQ-ORCH-055..059, the parent resumed with its children's reports;
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 4, whose case names three follow-ups and leaves this one out.
Raised 2026-10-14 by fin44 (`fin44-supervision-and-match`) from
[`../../../defects/fixed/a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md`](../../../defects/fixed/a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md),
as [OQ-284](#oq-284)'s ruling asked; the plan's range OQ-296 to OQ-310, its first free number on this branch — renumbered at
landing if a sibling took it first.)*

**What is open.** A root that delegates a background child and then ends its turn with neither text nor a call is not idle — a
child of its is pending — so neither `PD-ORCH-009`'s answer re-prompt nor REQ-ORCH-078's plan correction follows the turn
(`IterationChildren.runWithChildren` asks its follow-up only once no child is pending or unobserved). The stuck trigger the empty
turn armed stays pending, and the root's next turn — the one the child's report leads — takes it at its first step: the request
ends [… , the report, "Pause and reassess …"], after a stuck classification over the excerpt. Pinned as found by
`children.test.ts`, "as found: a root silent while its background child runs is resumed with the report, and the stuck
corrective follows the report".

**What the build proceeds under.** As found: the report, then the stuck corrective, in one request; one stuck activation for the
root.

**What a ruling decides.** Whether a root's empty turn while its children run is a stuck report at all (a parent that delegated
and waits has nothing to say until a report comes — REQ-ORCH-055's wait), whether the report replaces the corrective as
revision 4's three follow-ups do, or whether both stand. **The costs:** withdrawing it makes a waiting root's silence free and
leaves a root that is truly stuck to REQ-ORCH-102's counter on a later turn; keeping it puts "Pause and reassess" after the
report the root was waiting for and spends a classification.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a parent's silent wait on its children
is no stuck report. A parent's turn that ends with neither text nor a call while a child of its is pending, or has ended with a
report the parent has not seen, is REQ-ORCH-055's wait. When the run takes the parent into that wait it withdraws the stuck
trigger the turn armed, so the children's reports are the only message the run adds for that turn. This holds for an execution
iteration's root and for a delegated child waiting on children of its own. Only a pending stuck trigger is withdrawn — a
repetition, cycle or raw-count trigger is kept, so the case stays disjoint from `PD-ORCH-016` — and the consecutive-activation
count is neither moved nor reset, because a report is no user instruction under REQ-ORCH-105. Recorded as
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 5, case (d), which replaces revision 4's two sentences naming this
turn as governed by REQ-ORCH-104 as written (quoted there beside their replacements), and cites REQ-ORCH-055..059, REQ-ORCH-096,
REQ-ORCH-102, REQ-ORCH-105 and REQ-ORCH-106 without change. *The as-built reading — the report followed by the stuck corrective
in one request, one stuck activation per silent wait, and a root that waited silently across three batches escalated
(`agent_session_aborted`) — is kept above as the falsified one.* Written and built 2026-10-14 by fin45
(`fin45-supervision-and-quit`): `IterationChildren.runWithChildren` calls `withdrawStuck()` as the parent is taken into the wait;
[`../../../defects/fixed/a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md`](../../../defects/fixed/a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md)
moved to `fixed/`.
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 10:14 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "A parent's empty turn that ends while a child of its is still pending or reported-but-unobserved is the
wait REQ-ORCH-055 allows, so it is no stuck report … Record this as PD-ORCH-009 revision 5, case (d)." **Advocate B** (the
system's lens, change-behaviour): "that turn is no stuck report. The child's report is the only message the run adds for it. This
holds for the root and for a delegated child that is waiting on children of its own." Both followed; B's escalation point, the
activation count a silent wait would climb, decided it, and A confirmed it independently.

<a id="oq-297"></a>

**OQ-297 — When can a main window's renderer that is alive not answer its close guard?** *(REQ-SHELL-119 guard (1), "with
unsaved settings present, a user-initiated close raises the save/discard/cancel dialog of REQ-SHELL-124"; REQ-SHELL-124's close
case; REQ-SHELL-021 gate (1); REQ-SHELL-121's quit; [`PD-SHELL-009`](../../../product/directives/pd-shell-009.md#pd-shell-009)'s last case, a quit
that starts outside any window; PD-ORCH-005 clause 9, the quit that asks every main window's guard before confirming any.
Raised by the orchestrator's consortium as HR1 from
[`../../../defects/fixed/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md`](../../../defects/fixed/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md),
which asked that "whether Chromium's `unresponsive` judgement is that point" be raised with the repair and not decided in it;
entered 2026-10-14 by fin44 (`fin44-hang-and-seams`) at the first free number of the plan's range, OQ-296 to OQ-310 — renumbered
at landing if a sibling took it first.)*

**What is open.** A main window's close guard is the renderer's own (`window.__rotarisCloseGuard`, asked by `executeJavaScript`
through `askRendererGuard`, `apps/desktop/src/main/main-windows.ts`), and `guardClose` documents that a guard that cannot answer
allows. Since 2026-10-14 a renderer that is **gone** (crashed, killed, its contents destroyed) cannot answer, so its question
rejects at once or the moment it goes (fin43, built without a directive:
[`../../../defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`](../../../defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md)).
A renderer that is alive but **hung** — its main thread in an endless loop or stopped — is not gone: the question is sent and
never answered, nothing bounds the wait, and both a person's close of that window and the application's quit
(`closeThroughGuards`, `apps/desktop/src/main/exit.ts`), a SIGTERM's included, are held until it recovers or the process is
killed. No time bound on the question itself is admissible: the guard may be waiting on a person's Save/Discard/Cancel
(REQ-SHELL-124), which no bound may answer for. The question is when a renderer that is still alive "cannot answer".

**What the build proceeded under.** The letter: a live renderer is waited for with no bound.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), the consortium's HR1** (advocate B's
recommendation followed — main's own liveness probe, separate from the guard's question — with one point of advocate A's folded
in: Chromium's `unresponsive` event, which A took for the point itself, is kept as a second signal). A main window's renderer
cannot answer its close guard when it is **gone**, when it **fails main's liveness probe** — no reply within 5 s
(`RENDERER_LIVENESS_BOUND_MS`) to a trivial question main repeats for as long as the guard's question is out — or when Chromium
emits **`unresponsive`** for it while the question is out. A guard that cannot answer allows, so the close or the quit proceeds
without guard (1). A person's close still meets guard (3)'s native active-run box (REQ-SHELL-119, as `PD-SHELL-009` narrows it);
a quit that starts outside any window asks nothing more; and a renderer that answers the probe is waited for with no bound,
because its guard is a person's Save/Discard/Cancel. Recorded as [`PD-SHELL-010`](../../../product/directives/pd-shell-010.md#pd-shell-010),
narrowing REQ-SHELL-119, REQ-SHELL-124 and REQ-SHELL-021 and noted under `PD-SHELL-009`'s last case; it also gives fin43's
gone-renderer rule its record home. It adds no dialog and no string.

**What the ruling leaves open.** A live, answering renderer with unsaved settings met by a quit from outside any window (a
signal, a logout where Electron emits `before-quit`) still waits without bound on a person's Save/Discard/Cancel under
`PD-SHELL-009`: raised apart as [OQ-298](61-spikes-and-later-questions-28.md#oq-298).
