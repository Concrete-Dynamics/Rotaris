# Archived open questions — Spikes, and the questions raised since (26 of 35)

The ruled, closed, resolved and withdrawn entries of [part 59](../../../architecture/open-questions/59-spikes-and-later-questions-26.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-281"></a>

**OQ-281 — Where does the user resolve a store place that holds no store, and what does the listing show meanwhile?**
*(REQ-SESSION-202, "An action that establishes a new store in that place MUST be one the user takes deliberately, having been
told what was found and that it recovers nothing that may have been there", and "the listing reports the condition rather than
an empty list"; REQ-SESSION-043; REQ-SESSION-089; REQ-EVENTS-084; W-31 (3), "a fence, not a new surface"; REQ-SHELL-023.
Raised 2026-10-14 by fin43 (`fin43-restore-recovery`) while repairing
[`../../../defects/fixed/a-store-place-that-holds-no-database-is-opened-as-a-fresh-empty-store.md`](../../../defects/fixed/a-store-place-that-holds-no-database-is-opened-as-a-fresh-empty-store.md);
the plan's range is OQ-281 to OQ-295, and this is the first of it this bundle takes — renumbered at landing if a sibling took
it first.)*

**What is open.** The open now refuses a place that exists and holds no `workspace.db`, creates nothing there, and says what was
found. REQ-SESSION-202 fixes what the resolving action must not be (automatic, a default, a side effect of a run, an open, a
preparation or a repair) and that it must be deliberate and told what it recovers, but not where it is offered or how it reads,
and W-31 (3) calls it "a fence, not a new surface". The listing is likewise owed "the condition rather than an empty list", and
no surface in REQ-SHELL-023's structure names where a refused store is shown.

**What the build proceeds under.** No product action establishes a store in such a place. The open is refused with
`workspace.store-missing` ("The session store for this workspace is not where it is kept"; the detail names the directory,
says the store is not in it, that nothing was created and that no session can start until it is resolved). Main raises that as
an error notice, and `session.list` answers it as the same refusal rather than an empty list or "Open a workspace". The only
resolution is outside the product (the directory removed or the store put back by hand, then the workspace opened again). A
narrower residue sits beside it: the open itself makes the place before the engine creates the file in it, so a process killed
between the two (microseconds) leaves the very condition this refuses; nothing measured it.

**What a ruling decides.** Whether the deliberate action is built, and where (an action on the error notice, a control in the
Sessions view's refusal, a Settings action beside the restore); its wording, which must say what was found and that it recovers
nothing; and whether the open's own window (the place made before the file) is closed by making the store first in a sibling
directory and renaming it into place.

**What a live run then shows.** Nothing: no live scenario empties a store's place.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), with no directive.** The refusal stands,
and **Settings › Project › Session store** becomes where the user resolves it (REQ-SHELL-023's Project category; REQ-SESSION-202,
REQ-SESSION-201, REQ-SESSION-043, REQ-SESSION-089, REQ-EVENTS-084, REQ-NOTIFY-044). The consortium weighed two recommendations:
**A**, the existing restore made to work there plus a deliberate establishing action beside it; and **B**, the restore alone,
with every other resolution left to the user by hand. The ruling takes A's action and builds it under B's scoping — no new
surface, no action on the notice or in the Sessions view that writes anything, and the action offered only while the
condition is held. What it fixes: while `workspace.store-missing` is held for a window's workspace, the restore is admitted
there (no store was handed to the run host, so its active-run gate is skipped; the service's liveness gates still run inside
the swap), its first question says the place exists and the store is not in it and that what is in it is moved aside and kept,
and its success names the kept place; a deliberate **"Start a new session store…"** appears beside it, Cancel the default and
the cancel, stating what was found and that it recovers nothing, moving the found place aside and keeping it; the error notice
opens Settings at Project; every workspace-scoped refusal in that window states the held condition rather than "open a
workspace"; and a first store is created in a sibling directory and renamed into place, closing the open's own window between
making the place and creating the file. **Built 2026-10-14 by fin44 (`fin44-store-resolution`):** the restore and the new store in
`main/store-resolution.ts` (`restoreFlow`, `establishFlow`), the service's two phases `workspace.store.establish.assess` and
`.perform` (`workspace-service/store-establish.ts` over `@rotaris/store`'s `establishInEmptyPlace`), `RestoreAssessment.target.placeEmpty`,
the notice's `open-settings`/`project` action (`main/store-notice.ts`) withdrawn once an open succeeds, and Settings' action
(`SettingsView.tsx`); pinned by `store-resolution.test.ts`, `store-establish.test.ts`, `store.test.ts` and
`pnpm store-resolution-proof`. W-31 (3) carries the report-back. **The refusals and the first create, built the same day by
fin44:** `session.start` in such a window says nothing was started because the store could not be opened (REQ-SESSION-089), and
`runCommand` turns every other gate's `workspace.none` (and the checkpoints' `checkpoint.no-workspace`) into the held refusal (`answerUnderHeldRefusal`, `main/store-notice.ts`);
`openWorkspaceStore` makes a first store whole in `.<identifier>.new` and renames it into place (`installFirstStore`,
`packages/store/src/resolve.ts`), so the open no longer leaves the place it made without a store — the residue this entry's
"What the build proceeds under" named is closed. W-31 (1) and (2) carry that report-back. *(First run on Windows 2026-10-15,
Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree: `.<identifier>.new` is five characters longer than the
place, so at a live path of 247 to 251 characters, which D11 admits, the sibling's database crossed the engine's 251, the
create failed, and its cleanup's `EPERM` replaced the engine's error; no first store could be made there. Repaired the same
day on the owner's ruling: the sibling is `.<32 hex>`, two characters shorter than the place, a `.<identifier>.new` an earlier
build left is removed at the next open too, and the cleanup never replaces the failure it follows
([`a-first-store-at-247-to-251-characters-cannot-be-created-on-windows.md`](../../../defects/fixed/a-first-store-at-247-to-251-characters-cannot-be-created-on-windows.md)).)*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "Build the resolution inside the product … the existing restore, made to work there, and a new deliberate
'Start a new session store…' action. Cancel is the default on both." **Advocate B** (the system's lens, change-behaviour): "Keep
the refusal, and build no one-click 'start a new store' action. Admit the existing Settings restore into a workspace whose open is
held as `workspace.store-missing`." Both followed on the refusal kept, the restore admitted and the first store created beside and
renamed into place; A's on the deliberate establishing action, which B read REQ-SESSION-202 as warning against.

<a id="oq-292"></a>

**OQ-292 — What does a `focus-session` notice action do when pressed in a window that does not hold its session?**
*(REQ-NOTIFY-044, "focus a named session", an action concerning an object carrying its identity and acting "without asking the
user anything further"; REQ-NOTIFY-031 and REQ-NOTIFY-032, "Open the session"; REQ-NOTIFY-024; PD-SHELL-001 and its revision 2
([OQ-267](57-spikes-and-later-questions-24.md#oq-267)), whose reach binds the members that name a workspace; PD-SHELL-002. Raised 2026-10-14 by fin43
(`fin43-notices-and-config`) while repairing
[`a-focus-session-notice-action-acts-in-a-window-holding-another-workspace.md`](../../../defects/fixed/a-focus-session-notice-action-acts-in-a-window-holding-another-workspace.md);
numbered from the top of the plan's range, OQ-281 to OQ-295, below the numbers its sibling bundles took. Ruled 2026-10-14
under R-072, below.)*

`focus-session` names a session and no workspace, and every notice reaches every main window. Pressed in a window whose
workspace's store does not hold the session (a second window, or a switch since the notice was raised), it used to raise "The
session could not be loaded" over the notice pressed and to record the session under the wrong workspace in the run host.
Since 2026-10-14 such a press is not dispatched: nothing is recorded, no notice replaces the one pressed, and the window
follows nothing new (main's `session.resume` with `fromNotice`, logged). The press therefore does nothing visible.

**What a ruling decides.** Whether the press should reach the session where it lives — the action carrying the session's
workspace, so PD-SHELL-001 revision 2's reach surfaces the window holding it (or adds one) and focuses the session there —
or say in the pressing window that the session belongs to another project, or stay as built. A workspace on the member is a
change to REQ-NOTIFY-044's vocabulary of the kind ESC-34 made for the hook review.

**What a live run then shows.** Nothing: no live scenario opens two workspaces.

**Ruled 2026-10-14 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the press reaches
the session where it lives. `focus-session` carries the workspace of the session it names, taken from the run host's record of
that session's root (never from a window), and a press takes [`PD-SHELL-001`](../../../product/directives/pd-shell-001.md#pd-shell-001)'s reach:
it brings forward the main window holding that workspace, or adds one where none does, and focuses the session in that window
through that window's own session load. A notice whose session's workspace is unknown carries no action, and the logged
silence of 2026-10-14 ("What the build proceeds under" above, the press not dispatched) is withdrawn: kept above as the
falsified reading. Recorded as PD-SHELL-001 revision 3, which extends REQ-NOTIFY-044 (with its Data & Formats
parameterisation, "parameterised by session identifier and its workspace"), REQ-NOTIFY-031 and REQ-NOTIFY-032, each with its
back-pointer.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "The `focus-session` notice action carries the workspace of the session it names, and pressing it takes
PD-SHELL-001 revision 2's reach … Record this as PD-SHELL-001 revision 3." **Advocate B** (the system's lens, change-behaviour):
"`focus-session` gains the workspace of the session it names, stamped by whatever raises the notice … Record this as PD-SHELL-001
revision 3." Both followed; B's source for the workspace (the run host's record of the session's root) and B's hold for an added
window not yet ready, A's user-facing account and proof section 6c.

<a id="oq-293"></a>

**OQ-293 — Does the unreviewed-hooks notice name the project it is about?** *(REQ-NOTIFY-224, the notice "where a workspace
declares hooks the user has not reviewed"; REQ-HOOKS-101, whose fixed text reads "declared by this workspace's
.rotaris/agents.yaml"; PD-WORKSPACE-005, which named the project in the project-setup banners for the same reason; PD-SHELL-001
revision 2. Raised 2026-10-14 by fin43 (`fin43-notices-and-config`) from the consortium's ruling of OQ-267 (step 8 (b)),
recorded in
[`the-unreviewed-hooks-notice-does-not-name-its-project.md`](../../../defects/fixed/the-unreviewed-hooks-notice-does-not-name-its-project.md);
numbered from the top of the plan's range. Ruled 2026-10-14 under R-072, below.)*

The notice is an application notice, shown in every main window, and its words — the title "Workspace hooks need review" and
REQ-HOOKS-101's message, "declared by this workspace's .rotaris/agents.yaml" — say "this workspace". In a window holding another
workspace "this" is that window's, which is the wrong project; its "Review hooks" reaches the right one (PD-SHELL-001 revision
2), so the words and the action disagree.

**What the build proceeds under.** Unchanged: the title and REQ-HOOKS-101's text as fixed, no project named. Changing
REQ-HOOKS-101's fixed text needs a directive.

**What a ruling decides.** Whether the notice names its project — the title followed by the project's name, and the project's
folder heading the detail area, as PD-WORKSPACE-005 does for the project-setup banners — and, if so, whether REQ-HOOKS-101's
"this workspace's" is narrowed by a directive or the name is carried by the title and detail alone.

**What a live run then shows.** Nothing: no live scenario opens two workspaces.

**Ruled 2026-10-14 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the notice names
its project, on [`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005)'s pattern and by its naming rule. Its title reads
"Workspace hooks need review: <name>", the name being the project folder's last segment (the root itself for a drive or
filesystem root); its message row carries REQ-HOOKS-101's text unchanged; its detail area holds "Project folder: <full path>".
Both raise sites — main's at the workspace's open and the run's through `notice.publish` — build it identically, and its
"Review hooks" action names the workspace whose hooks it counts (on the run path, the run's own workspace, never the focused
window's). Covered by REQ-NOTIFY-224, REQ-NOTIFY-005, REQ-HOOKS-101 and REQ-HOOKS-102: no directive is minted, and
REQ-HOOKS-101 keeps its text, since the name is carried by the title and the detail alone. Two defects found while writing it
up: [`the-unreviewed-hooks-notice-folds-its-sentence-under-details-at-open.md`](../../../defects/fixed/the-unreviewed-hooks-notice-folds-its-sentence-under-details-at-open.md)
(the open path put REQ-HOOKS-101's sentence in the folded detail) and
[`a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md`](../../../defects/fixed/a-runs-unreviewed-hooks-notice-names-the-active-windows-workspace.md)
(the run path's action named the focused window's workspace). **Built 2026-10-14 (fin44, `fin44-hooks-and-config`):** one
composer, `hooksReviewNotice` (`apps/desktop/src/main/hooks-review-notice.ts`), used by the open slot (`hooksReviewOpenReport`)
and by main's mapping of the run's `notice.publish` (`runNoticeReport`, `run-notice.ts`), which names the root the run host
recorded the session under (`workspaceRoot`, already on the event since PD-SHELL-001 revision 3, so no second field was added);
`notice-proof` sections 6 and 6b read the named title, the sentence in the message row and "Project folder:" heading the detail.

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "The title reads 'Workspace hooks need review: <project name>' … Record this as a new directive
(PD-NOTIFY-001, or the next free number) that extends REQ-NOTIFY-224." **Advocate B** (the system's lens, change-behaviour): "the
unreviewed-hooks notice names its project the way PD-WORKSPACE-005 names it … no new directive is needed because no requirement's
text changes." Both followed on the behaviour; B's on the record, with no directive.

<a id="oq-294"></a>

**OQ-294 — A project-setup banner pressed for a project no window holds: a notice (OQ-262) or an added window (OQ-267)?**
*([`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005) revision 2 (OQ-262); [`PD-SHELL-001`](../../../product/directives/pd-shell-001.md#pd-shell-001)
revision 2 (OQ-267); REQ-NOTIFY-044. Raised 2026-10-14 by fin43 (`fin43-notices-and-config`) while writing both revisions into
the record; numbered from the top of the plan's range. Ruled 2026-10-14 under R-072, below.)*

Both rulings were made on 2026-10-13 under R-072. OQ-262's: from any window, a project-setup banner's `open-project-init`
surfaces the main window holding the project and opens Settings › Project there; when no window holds it, the activating window
shows "Project <name> is not open in any window." and nothing else happens. OQ-267's: an action naming a workspace no window
holds adds a main window for it and opens the action's surface there, and the rule "binds every REQ-NOTIFY-044 member that names
a workspace … the project-initialization action of OQ-262 once a notice carries it". A notice has carried it since 2026-10-14,
so the two rules now speak to the same press and answer it differently.

**What the build proceeded under** *(kept as the falsified reading)*. OQ-262's ruling, the specific one for this member: the
press for a project no window holds showed the info notice and added nothing (`projectInit.open`, `notice-proof` section 6c).
The hook review followed OQ-267's.

**What a ruling decides.** Which of the two governs the project-setup action for a project no window holds, and the matching
correction of the other directive's text.

**What a live run then shows.** Nothing: no live scenario opens two workspaces.

**Ruled 2026-10-14 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** OQ-267's reach
governs the project-setup action. Pressing a project-setup banner's `open-project-init` for a project no window holds adds a
main window for that project on [`PD-SHELL-001`](../../../product/directives/pd-shell-001.md#pd-shell-001) revision 2's add terms, and Settings ›
Project opens in the added window. The request is held by that window until its renderer has registered for it, so a press
during the window's load still lands. Recorded as [`PD-WORKSPACE-005`](../../../product/directives/pd-workspace-005.md#pd-workspace-005) revision 3,
which replaces revision 2's "Project <name> is not open in any window." clause and its cost line, revision 2's text quoted
beside the new one as the falsified reading; the disposition "Narrows REQ-WORKSPACE-102, REQ-WORKSPACE-103" stands and their
back-pointers name revision 3. PD-SHELL-001 keeps revision 2's text; its "Noted 2026-10-14 by fin43, not ruled" block is now a
one-line pointer here. **Built 2026-10-14 (fin44, `fin44-notice-reach`):** `projectInit.open` reaches the workspace
(`MainWindows.reach`) and opens Settings › Project through `MainWindows.openProjectInit`, held until the window's
`projectInit.ready`; `notice-proof` section 6c presses it for a project no window holds and reads a third window on Settings ›
Project with "Retry initialization".

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "A project-setup banner pressed for a project no window holds adds a main window for that project on
PD-SHELL-001 revision 2's add terms and opens Settings › Project in it. PD-WORKSPACE-005 gains a revision 3." **Advocate B** (the
system's lens, change-behaviour): "a main window is added for it on PD-SHELL-001 revision 2's reach and Settings › Project opens
there … The vocabulary then has one navigation rule for every member that names a workspace." Both followed.

<a id="oq-282"></a>

**OQ-282 — When the entry role is sent PD-ORCH-009's answer re-prompt, is the empty turn that earned it also a stuck report to
loop supervision?** *(REQ-ORCH-096, "an empty reply with no call is the runtime's stuck report"; REQ-ORCH-104's stuck-mode clause,
"ALWAYS recover with a deterministic corrective message"; REQ-ORCH-099 and REQ-ORCH-102, the supervisor and its counter;
REQ-NOTIFY-102 and REQ-NOTIFY-103; [`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revisions 1 and 2, the re-prompt;
[`PD-ORCH-016`](../../../product/directives/pd-orch-016.md#pd-orch-016), the other narrowing of REQ-ORCH-104. Raised 2026-10-13 by the orchestrator
from the live scenario run at `ce5f952` (finding F1) and ruled the same day by the consortium as E1; entered here 2026-10-14 by
fin43 (`fin43-live-findings`), the plan's range OQ-281 to OQ-295, its first free number on this branch — renumbered at landing if
a sibling took it first.)*

**What was found.** In `empty-answer` and `empty-once` the root's empty turn earned the re-prompt (the warning logged, the issue's
metadata `reprompted: true`), and in the same request loop supervision's stuck steering followed it: the request ended [prompt,
empty assistant, re-prompt, "Pause and reassess the current task. …"], after a stuck classification over an empty excerpt. The
harness reads a re-prompt by the request's final message, so it counted none and FAILed "asked exactly once … 0 re-prompt
request(s), 1 log line(s)". As built, `runTurn` reads every empty reply with no call as `observeStuck()` (ADR-0059's third
execution), and the re-prompt's turn takes the trigger at its first step's `check()`.

**What the build proceeded under.** Both: the re-prompt and the stuck corrective, in that order, in one request.

**Ruled 2026-10-13 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), the consortium's E1:** when
`PD-ORCH-009` sends the entry role its answer re-prompt, the empty turn that earned it is not a stuck report to loop supervision.
The run asks no classification for it, adds no corrective message, writes no stuck `loop_supervisor_activation`, and leaves the
consecutive-activation count unchanged, so `ANSWER_REPROMPT` is the final message of the request it leads to. Recorded as
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 3, which keeps "Extends: REQ-ORCH-069" and adds "Narrows:
REQ-ORCH-104" for that one turn, disjoint from `PD-ORCH-016`'s raw-count case; REQ-ORCH-096, REQ-ORCH-099, REQ-ORCH-102,
REQ-NOTIFY-102 and REQ-NOTIFY-103 are cited without change. The live harness keeps its `sent` check and adds a check for no stuck
classification and one for no stuck activation. *The build's reading (both messages in one request) is kept above as the
falsified one.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "Loop supervision stays silent on the turn PD-ORCH-009's re-prompt answers … The re-prompt is the single
message the root receives, and it is the request's final message. Record this as PD-ORCH-009 revision 3." **Advocate B** (the
system's lens, change-behaviour): "Loop supervision stays silent on the entry role's empty turn in an execution iteration … The
harness reads it correctly and keeps its `sent` check; it gains three checks of its own." Both followed on the outcome; A's
mechanism (the stuck trigger withdrawn where the re-prompt is decided) in place of B's wider switch over every empty root turn,
and B's invisibility and escalation arguments with the delegated child's case raised apart ([OQ-283](#oq-283)).

**As built (fin43, `fin43-live-findings`, 2026-10-14).** `LoopSupervisor.withdrawStuck()` clears a pending trigger only when it
is `stuck` and leaves the counter alone; `Run.turn`'s `correction()` calls it on the root's supervisor immediately before it
returns `ANSWER_REPROMPT`. Two neighbouring shapes the ruling does not decide are raised as [OQ-283](#oq-283) (a delegated
child's REQ-ORCH-095 re-prompt) and [OQ-284](60-spikes-and-later-questions-27.md#oq-284) (a stuck trigger left pending by a turn the run does not follow up).

<a id="oq-283"></a>

**OQ-283 — Is a delegated child's REQ-ORCH-095 re-prompt also followed by the stuck corrective, in the same request?**
*(REQ-ORCH-095, "one re-prompt"; REQ-ORCH-096, "one corrective message"; REQ-ORCH-104's stuck-mode clause; [OQ-282](#oq-282) and
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 3, which narrowed the same shape for the entry role alone and
named every delegated child as unchanged. Raised 2026-10-14 by fin43 (`fin43-live-findings`) from
[`../../../defects/fixed/a-delegated-childs-re-prompt-is-followed-by-the-stuck-corrective-in-the-same-request.md`](../../../defects/fixed/a-delegated-childs-re-prompt-is-followed-by-the-stuck-corrective-in-the-same-request.md).)*

**What is open.** A child that ends its turn with neither text nor a call is re-prompted once ("Carry out the task now, …",
`IterationChildren` in `packages/engine/src/children/orchestration.ts`), and that empty turn also armed REQ-ORCH-096's stuck
trigger in its supervisor, so the re-prompt's first step (`runTurn`'s `check()`, `packages/engine/src/run/turn.ts`) adds the stuck
corrective after it: the child's request ends [task, empty turn, re-prompt, corrective], two instructions where REQ-ORCH-095 asks
for one re-prompt and REQ-ORCH-096 for one corrective message. Pinned as found by `children.test.ts`, "REQ-ORCH-096 with
PD-ORCH-009 revision 3: a delegated child's empty turn still arms stuck".

**What the build proceeds under.** As found: both messages, the re-prompt first; one stuck activation written for the child.

**What a ruling decides.** Whether the child's re-prompted turn is, like the root's under revision 3, no stuck report (the
re-prompt alone), whether the corrective replaces the re-prompt (the corrective alone), or whether both stand. **The costs:**
withdrawing it makes a child's first silence cost one message instead of two and leaves REQ-ORCH-102's counter for repeated
silences; keeping both doubles the instruction and spends a classification on an empty excerpt.

**Ruled 2026-10-14 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a delegated child's re-prompted
empty turn is no stuck report. When REQ-ORCH-095 re-prompts a delegated child whose turn ended with neither text nor a call,
the empty turn that earned the re-prompt is not a stuck report to loop supervision: the run asks no classification for it,
adds no corrective message, writes no stuck `loop_supervisor_activation`, and leaves the consecutive-activation count
unchanged, so the re-prompt is the last message of the request it leads to. Recorded as
[`PD-ORCH-009`](../../../product/directives/pd-orch-009.md#pd-orch-009) revision 4, which widens revision 3's "Narrows: REQ-ORCH-104" case from
the entry role's re-prompted turn to this child turn too, replaces revision 3's sentence that every delegated child stays
unchanged (quoted beside its replacement), stays disjoint from `PD-ORCH-016`'s raw-count case (only a pending stuck trigger is
withdrawn), and cites REQ-ORCH-095 without change. REQ-ORCH-104's text is unchanged; its back-pointer names revision 4.
*The build's reading — both messages, the re-prompt first, with one stuck activation for the child — is kept above as the
falsified one.* Written 2026-10-14 by fin44 (`fin44-supervision-and-match`).
*Dated 2026-10-13, a day before the question was raised, until fin46 (`fin46-accept1-12`) corrected it on 2026-10-14 from the
consortium's ruling record, whose sitting ruled it 2026-10-14 by 04:58 UTC.*

**The recommendations it weighed** *(written 2026-10-15 by fin47 from the consortium's ruling record)*. **Advocate A** (the user's
lens, change-behaviour): "When REQ-ORCH-095 re-prompts a delegated child after an empty turn, that empty turn is no stuck report.
The re-prompt is the only message the run adds for it." **Advocate B** (the system's lens, change-behaviour): "Rule the re-prompt
alone … This is the same ruling E1 (OQ-282) made for the root, and it is recorded as PD-ORCH-009 revision 4." Both followed; B's
reading of REQ-ORCH-095 as the specific rule for a child that does nothing decided it.
