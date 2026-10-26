# Open questions — Spikes, and the questions raised since (11 of 35)

Part 44 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-200 – OQ-205.

**OQ-200 — Which model call does the run timer count while a run has more than one?** *(REQ-CHAT-158, the run-timing
indicator counts "the time spent inside the model call currently in flight" and restarts "each time the run moves on to
the next model call within the same run"; REQ-ORCH-095 and the delegated children whose calls run beside the root's;
REQ-CHAT-063, the live-refresh rules the tick follows. Raised 2026-10-06 by
[`the-run-timer-counts-from-the-newest-row-not-from-the-model-call-in-flight.md`](../../defects/fixed/the-run-timer-counts-from-the-newest-row-not-from-the-model-call-in-flight.md)
(fin18, bundle `fin18-rail-label-and-observations`). ~~Open, the owner's.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed at the reading the build proceeds under: while a run is active the run timer counts from the newest transcript row the run produced, the unsettled one first, so a call that writes no row does not restart it, and no call boundary is published on the record. It was raised on 2026-10-06, after the overview the owner answered, and is confirmed under the same instruction at the reading this entry says the build proceeds under. [`PD-CHAT-008`](../../product/directives/pd-chat-008.md#pd-chat-008) narrows REQ-CHAT-158. Since no call boundary is owed, [`the-run-timer-counts-from-the-newest-row-not-from-the-model-call-in-flight.md`](../../defects/fixed/the-run-timer-counts-from-the-newest-row-not-from-the-model-call-in-flight.md) closes with this ruling.

The default live run at `27a5127` captured the run header at a moment when the one call in flight was the transcript
summariser's, 5.5 s in, and the header read 0:09, counted from the newest transcript row. A run can have several calls out
at once: the root's, each running child's, a summariser's, a classifier's. REQ-CHAT-158 speaks of "the model call
currently in flight" as if there were one, and does not say whether a call the product makes for itself (a summary, an
intent or completion classification) is one of "the run's" calls.

**What the build proceeds under.** Unchanged: the value counts from the newest transcript row the run produced, the
unsettled one first (`modelCallStartedAt`, `packages/ui/src/composer.ts`), so a call that writes no row does not restart
it. No call boundary is published on the record (`SessionRecord` carries `runStartedAt` only); the note above records
that as a defect whatever the ruling.

**What a ruling decides.** Which call the value counts when more than one is in flight — the root's alone, the newest to
start, or the oldest still running (the one "taking an unusual length of time") — and whether the product's own calls
count. Each needs the engine to publish a call's start on the record, which is a contracts and engine change before it is
a surface one.

**OQ-201 — Do the repository card's "touched" and "uncommitted" take the Git view's definitions?** *(REQ-MONITOR-168, the
repository card states "how many files were touched and how many changes are uncommitted"; REQ-GIT-105, the Git view's
uncommitted-path count includes untracked paths so that it and the cleanliness gates of REQ-GIT-014 never disagree;
REQ-GIT-107, a worktree row's "files-touched" figure; REQ-GIT-003, the `.rotaris/` exclusion of every working-tree read
the Git domain performs. Raised 2026-10-06 by
[`the-repository-card-and-the-git-view-count-uncommitted-paths-differently.md`](../../defects/fixed/the-repository-card-and-the-git-view-count-uncommitted-paths-differently.md)
(fin18, bundle `fin18-rail-label-and-observations`). ~~Open, the owner's.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed at the reading the build proceeds under: the repository card's "touched" counts every path `git status` lists, untracked ones included, and its "uncommitted" the tracked paths with a staged or unstaged change, with no `.rotaris/` exclusion; the Git view keeps REQ-GIT-105's count under REQ-GIT-003's exclusion, so the two may differ for one tree. It was raised on 2026-10-06, after the overview the owner answered, and is confirmed under the same instruction at the reading this entry says the build proceeds under. REQ-MONITOR-168 defines neither word, and REQ-GIT-003's consequences name the Git view's figures, not the card's, so this ruling settles it; [`the-repository-card-and-the-git-view-count-uncommitted-paths-differently.md`](../../defects/fixed/the-repository-card-and-the-git-view-count-uncommitted-paths-differently.md) closes with it.

In one launch of the default live run at `27a5127` the Overview's repository card read "4 files touched · 2 uncommitted"
and the Git view counted 4 uncommitted paths in the same tree. The card counts an untracked path as touched and not as
uncommitted, and does not exclude `.rotaris/`; the Git view counts it as uncommitted and excludes `.rotaris/`.
REQ-MONITOR-168 defines neither word. If the card took REQ-GIT-105's count, "touched" and "uncommitted" would be the same
number for the base tree unless "touched" means something else — REQ-GIT-107's files figure is the nearest candidate,
and for the base tree it is the same set again.

**What the build proceeds under.** Unchanged: the card's touched is every path `git status` lists, its uncommitted the
tracked paths with a staged or unstaged change (`countStatus`, `packages/workspace/src/git/repository.ts`); the Git view
keeps REQ-GIT-105's count.

**What a ruling decides.** What each of the card's two figures counts — in particular whether an untracked path is
uncommitted on the card as it is in the Git view, and whether the card's read applies REQ-GIT-003's exclusion — so that
one window never shows two different "uncommitted" counts for one tree.

**OQ-202 — On an `explicit_trivial` or `single_file_change` run, may the coordinator use the direct-work bundle REQ-ORCH-016
grants it, or does REQ-ORCH-029 forbid every file-modifying call and every work item it does not delegate?**
*(REQ-ORCH-016, "Exactly the two simplest intents (`explicit_trivial`, `single_file_change`) grant the entry role the
direct-work bundle", which includes "every tool the public tool-name registry declares as … writing workspace files, or
running commands"; REQ-ORCH-029, which binds the entry role "while it acts as coordinator, which is every run except one taken
under a `single` override": "it makes no file-modifying tool call … every work item it takes on reaches a specialist through a
`delegate` call", constraints that "MUST hold no matter what playbook cell or instruction text is in force" and are
"externally checkable from the run's own records"; REQ-ORCH-025, under which only `single` ends the coordinating status.
Raised 2026-10-06 from finding G2 of the orchestrator's final default live run at `27a5127` (fin18, bundle
`fin18-run-record-truth`; raised there as OQ-200 and renumbered OQ-202 when origin/main, which had taken OQ-200 and OQ-201,
was merged in). ~~Open, the owner's.~~ Ruled 2026-10-06.)*

Under REQ-ORCH-016 an `explicit_trivial` or `single_file_change` run grants the entry role `write_file`, `terminal` and the
rest of the direct-work bundle; no `single` override is in force, so by REQ-ORCH-025 and REQ-ORCH-029 the entry role is still
the coordinator, and the coordinator makes no file-modifying call and delegates every work item. The two requirements give it
the tools and forbid their use at once. The orchestrator's built-in instructions state REQ-ORCH-029's side ("You coordinate:
you do not modify files or run commands yourself — every work item reaches a specialist through the delegate tool",
`packages/engine/src/children/personas.ts`) while its listing carries REQ-ORCH-016's. Neither requirement names the other,
and no directive governs either.

In the default live run's `frictions` scenario (pack `.live-run/runs/2026-10-06T01-30-08-282Z/`, session `dc010fce`, the
self-hosted endpoint) the intent was `explicit_trivial` (0.98) and the orchestrator was offered 29 tools, `write_file`,
`terminal` and `haet_edit` among them (`frictions/model-traffic.jsonl` #1). Its first turn reasoned about the contradiction
("the guardrail says 'You do not modify files or run commands yourself' … Given the tension … do it directly", transcript
row 1): that request took 14,495 ms and 1,034 output tokens of a 32.0 s run, the longest of the run. It then made the
file-modifying call itself (#1 `write_file`) and four `terminal` calls, records REQ-ORCH-029 says must show no such call. The
same shape is in the `frictions` and `terminal` scenarios at `1763f7f` (2026-10-03), both `explicit_trivial`.

**What the build proceeds under** (the code as it stands; nothing changed for this question): REQ-ORCH-016's grant is
applied (`apps/desktop/src/run-host/tools.ts`, the entry port's `directWork`), the orchestrator's instructions keep
REQ-ORCH-029's sentence, and nothing refuses or flags the coordinator's use of a granted tool. A model that uses the bundle
is not stopped, and one that delegates is not either.

**What a ruling decides.** Which requirement gives way on the two simplest intents: whether the bundle's grant ends the
coordinating status for that run as `single` does (REQ-ORCH-029's exemption widened, and the instructions told so where the
bundle is granted), or whether the coordinator keeps it and the bundle is narrowed to what REQ-ORCH-029 allows (REQ-ORCH-016
amended); and, either way, whether the instructions the coordinator is given should name the case so it does not spend a turn
on the contradiction.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** on the simplest runs the coordinator does the work
itself with the bundle REQ-ORCH-016 grants, and its instructions for that run say so, so the grant and the instructions agree;
the coordinating status stays, and REQ-ORCH-029 gives way only in its three clauses that forbid doing the work. Carried by
[`PD-ORCH-006`](../../product/directives/pd-orch-006.md#pd-orch-006), which narrows REQ-ORCH-029. The reading taken where the ruling leaves a
detail open: "the simplest runs" are every run whose mapping grants the bundle (with the built-in mapping
`explicit_trivial` and `single_file_change`; a `single` override carries the same grant and is told the same); `delegate`
stays in the bundle and may still be used; a prompt the configuration supplies is kept whole with the statement after it; and
a turn the plan gate holds, which REQ-ORCH-153 denies the bundle's writing tools, keeps the coordinating prompt. **Built
2026-10-06 (fin20):** `entryInstructionsFor` (`packages/engine/src/children/personas.ts`) read by the root turn in
`packages/engine/src/run/run.ts`; cases in `children/personas.test.ts`, `run/preflight.test.ts` and `run/plan-gate.test.ts`;
`pnpm fetch-proof` reads the instructions its `explicit_trivial` launch received. *Since OQ-162's ruling was built beside
it (`PD-ORCH-005` revision 7 clause 40, fin20, before landing):* the grant the instructions are fitted to is the one the
iteration runs under (`Run.preflightInEffect`), so an iteration a continue by message resumes keeps the instructions of the
grant it started with, and the message's grant fits them from the next iteration; pinned by the fourth "OQ-162 as ruled"
case in `run/preflight.test.ts`.

**OQ-203 — Which items of the coordinator's own plan does REQ-ORCH-075's re-queue hold against a task: every non-terminal
item of the session's plan, or only those the task's own iterations left open?** *(REQ-ORCH-075, "when a report says
succeeded but the agent's own todo list still holds pending/in-progress items … the same top-level task MUST be re-queued
(not abandoned)"; REQ-ORCH-029, the coordinator "does not report the run successful while a todo item is non-terminal or
while a todo item's recorded state disagrees with what happened"; REQ-ORCH-067, each iteration does "work for that one
task only"; REQ-ORCH-077, the task abandoned at the consecutive-retry limit; REQ-TOOLS-144 and REQ-TOOLS-147, the plan is
the agent's own and session-scoped. Raised 2026-10-06 by the builder of fin18's repair of live-run finding G5, from its verifier's finding (bundle
`fin18-run-record-truth`; raised there as OQ-201 and renumbered OQ-203 when origin/main, which had taken OQ-200 and OQ-201,
was merged in). ~~Open, the owner's.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed at the reading the build proceeds under: a task answers for every open item of the plan that was not already open when it was first taken up (its plan cycle, else its first iteration), a record kept with the task, and for no other; a person's own addition to the plan during the task is held against it, and a `PENDING` item re-listed in the id-less shape is the re-listing task's. It was raised on 2026-10-06, after the overview the owner answered, and is confirmed under the same instruction at the reading this entry says the build proceeds under. [`PD-ORCH-012`](../../product/directives/pd-orch-012.md#pd-orch-012) narrows REQ-ORCH-075, and [`PD-ORCH-006`](../../product/directives/pd-orch-006.md#pd-orch-006) revision 2 reads REQ-ORCH-029's todo clause the same way.

The repair of `docs/defects/fixed/the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` returns a
task to the pending queue when its root answers `succeeded` with an item of its plan open (REQ-ORCH-075). The plan is the
session's, not the task's: it outlives the task, the run and every iteration. An item a task was given up on with
(REQ-ORCH-077), or one an earlier run of the session left open, is therefore still `PENDING` or `IN_PROGRESS` when the next
task is taken up. Read literally, REQ-ORCH-075's "the agent's own todo list still holds pending/in-progress items" and
REQ-ORCH-029's "a todo item is non-terminal" hold that item against every later task: each is re-queued and given up on in
turn though its own work was done. That record disagrees with what happened, which REQ-ORCH-029's own other clause forbids,
and a later task's root is told to finish another task's work, which REQ-ORCH-067 forbids. No requirement says which items
belong to which task. The verifier reproduced the literal reading with a queued prompt (REQ-CHAT-040) behind a task given up
on: outcomes `partial, partial, abandoned, partial, partial, abandoned`, the second task's done work recorded as abandoned.

**What the build proceeds under.** A task answers for every open item of the plan that was not already open when the task
was first taken up, and for no other. Its first take-up is the plan cycle that planned it, where one did (REQ-ORCH-153: the
cycle is the coordinator's turn and its grants keep the todo state writable, so the plan it writes there is the planned
task's own); otherwise its first iteration in the session, the one no iteration row names it in yet. That take-up record is
kept with the planner task in the stored todo (`Task.planExcused`, `packages/engine/src/run/todo.ts`; `Run.planCycleTakeUp`,
`Run.takeUp` and `openPlanItems`'s `excused`, `packages/engine/src/run/`), so every later iteration of the task reads the same
record back: the one a continue resumes, and a fresh iteration of the re-queued task in the same run or a later one. A revise
cycle, and the plan cycle after a resumed iteration (PD-ORCH-003 revision 2), keep a record a task already carries. An item
the task's plan cycle wrote, one the task opened, or one its own earlier iteration left open, therefore always holds it; an
item a given-up task, an earlier run or anything else left open before the task was first taken up never does. The continuation that names the open items
(REQ-ORCH-075's marker) is kept with the task too (`Task.planLeftOpen`), goes to the same task's next fresh root only, and is
dropped when the task completes or is given up on. An excused item is not altered: it stays open in the plan the Todo pane
counts, and a run in which a task was given up on reads failed by REQ-ORCH-082 anyway. A task first taken up by a build
before this record existed has none, so every open item is held against it. Pinned by
`packages/engine/src/run/coordinator-plan.test.ts`. (The first form of this reading held the record in the run's memory, so
the run a continue built had none: an iteration it resumed held a given-up task's item against its own task, and a fresh
iteration of a re-queued task in a later run took the task's own leftover item as excused and completed beside it. The
verifier of fin18's second repair round reproduced both; the record has been kept with the task since. The second form took
the first iteration as the first take-up even in plan mode, so the items the plan cycle wrote were recorded as already open
and excused, and every plan-mode run read completed beside its untouched plan; the verifier of the third round reproduced it,
and the plan cycle has counted as the take-up of the tasks it plans since.)

**What a ruling decides.** Whether REQ-ORCH-075 and REQ-ORCH-029 range over the whole session plan (and a stale item then
blocks every later task, or must be closed by someone before the run can succeed) or over the items a task owns, and if the
latter, how ownership is decided and recorded: by what was open at the task's first take-up (as built, kept with the planner task), by a
mark on the item (REQ-TOOLS-144's schema has no field for it), or otherwise; and whether a person's own addition to the agent
plan (REQ-CHAT-090) during a task is held against it, as it is built now. Ownership by id meets one case the build cannot
tell apart: REQ-TOOLS-146's `replace` keeps a `COMPLETED`, `IN_PROGRESS` or `ABANDONED` item by id, but a `PENDING` item
re-listed in the documented id-less shape is given a new id (`packages/agent-tools/src/tools/todo.ts`), so a `PENDING` item a
given-up task left, re-listed by the next task's root, stops being excused and counts against that task. A ruling decides
whether such a re-listed item is the new task's (it re-wrote it) or still the earlier task's.

**OQ-204 — When the expanded plan gate cannot hold all its parts, which clause of PD-ORCH-002 revision 2 yields?**
*(PD-ORCH-002 revision 2, over REQ-ORCH-153: expanded, the plan's own text "SHALL be the largest element of the surface and
the only element that grows with it: every other part of the gate is sized by its own content"; REQ-SHELL-022, the
1000x680 minimum; REQ-SHELL-048, every action reachable. Raised 2026-10-06 by
[`the-expanded-plan-gate-gives-the-whole-loss-to-the-plan-when-a-notice-shares-the-window.md`](../../defects/fixed/the-expanded-plan-gate-gives-the-whole-loss-to-the-plan-when-a-notice-shares-the-window.md)
(finacc2, bundle `finacc2-accept1-6`). First committed as OQ-202 on the bundle's branch; origin/main had already taken
OQ-202 and OQ-203 (`ef1e6d9`, `6998e3f`), so it takes the next free number, OQ-204. ~~Open, the owner's.~~ **Ruled
2026-10-07.**)*

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** "largest" holds against every
part the product sizes. A later cycle's "You asked for" line is bounded like the implied todo (`max-height:
var(--rt-space-16)`). It scrolls inside itself and wraps long unbroken text, so the plan's floor stands above every part
the product sizes. A revision field the user drags taller keeps the height the user gave it and may then stand taller than
the plan, the one case where "largest" yields. When the area is shorter than the gate's parts with the plan at its floor,
the gate scrolls with its three answers pinned at its foot, as built. Recorded as
[`PD-ORCH-002`](../../product/directives/pd-orch-002.md#pd-orch-002) revision 3, one paragraph added and nothing replaced, with REQ-ORCH-153's
back-pointer amended in place.

**The two recommendations weighed.** *Advocate A (the user's lens)*: decide by who sized the part — cap the "You asked for"
line as the todo is capped, so the plan stands taller than every part the product sizes, and let a field the user drags
keep the user's height. *Advocate B (the system's lens)*: the same layout — cap the line below the plan's floor, let the
drag stand, confirm the pinned-answers scroll — reached by refusing to choose between the directive's two clauses where a
layout keeping both exists, as the 2026-10-06 repair's verifier did. **The ruling followed both.** From A it took the
dragged-field reading and the amendment of REQ-ORCH-153's back-pointer in place; from B, that the cycle-2 reading must go
red on the CSS before the change, and that the error line (`composer__error`) is left as it is. The cap is the todo's own
token, so one bound serves both content-sized parts (B's whole-line cap was set aside).

On a short window the gate's row is less than its parts need: at 1000x680 with a 97 px persistent notice it is 261 px, and
199 px with the re-authentication bar as well. If every part but the plan keeps its content height and the plan has no
floor, the plan takes the whole loss (18 px beside the todo's 56 in finacc2's acceptance). The repair keeps both clauses
for every part with a bound: the plan has a floor above the todo's cap (72 px; in edit mode the adopted `textarea.input`
rule's 80 px), every other part keeps its content height, and the gate scrolls below that with its three answers pinned
(at 261 px: the plan 72, the todo 56, the gate scrolling 31 px). The revision field opened by its summary is bounded too:
at its default height (its summary, a step and a `textarea.input` at 80 px, which scrolls rather than grows with what is
typed) it measures 102 px, which beat the plan's 72 (preview) and 80 (edit mode) at 1000x680 with or without a notice, on
the ordinary path to Revise (the bundle's verifier, repair round 2). While that field is open the plan's floor rises to
`calc(var(--rt-space-24) + var(--rt-space-4))`, 112 px, in both modes (at 261 px: the plan 112, the open field 102, the
todo 56, the gate scrolling 151 px). That keeps the plan the largest of the parts that are bounded: the heading, the
intent sentence, the todo, the revision field closed or open at its default height, and the answers. Two parts have no
bound: a later cycle's "You asked for" line (`.plan-gate__prior`, the whole of the changes the user stated) and a revision
field the user drags taller than its default (`resize: vertical`). On a short window either can stand taller than the
plan's floor, and no floor fixed in advance is above a part with no bound. *(Corrected in repair round 2, 2026-10-06. The
entry first read: "Two parts have no bound: a later cycle's 'You asked for' line … and the revision field once opened,
which the user can drag taller". That put the open field at its default height among the unbounded parts; it is bounded,
and a layout keeping both clauses for it exists, so it is repaired rather than asked.)*

**What the build proceeds under.** The plan's floor is `calc(var(--rt-space-16) + var(--rt-space-2))` (edit mode:
`textarea.input`'s 80 px), above the todo's cap, the answers' row and the heading; while the revision field is open it is
`calc(var(--rt-space-24) + var(--rt-space-4))` in both modes, above the open field at its default height. Every other part,
the "You asked for" line and a revision field dragged taller included, keeps its content height, and the gate scrolls with
its three answers pinned to its floor; so on a short window either unbounded part may stand taller than the plan. (Until the bundle's repair round
1 the reading also let the todo yield first, down to its label's line; that chose between the two clauses where a layout
keeping both exists, and was withdrawn.)

**What a ruling decides.** Whether "largest" holds against parts the user wrote or sized (then they need a cap or their
own scroll, like the todo's), or "sized by its own content" holds for them (then "largest" is read over the gate's fixed
parts only). Also whether a gate that scrolls below its minimum, with its answers pinned, is the intended reading when
the window is shorter than the gate's parts.

**OQ-205 — What is a `swarm` run told on an intent the mapping grants the direct-work bundle: to do the work itself, or
to coordinate and delegate as widely as it can?** *(REQ-ORCH-025, a `swarm` override "demands maximum parallel
delegation … it changes instruction text only, and the entry role keeps its coordinating status and its
coordination-only tool set"; REQ-ORCH-016, "Exactly the two simplest intents (`explicit_trivial`, `single_file_change`)
grant the entry role the direct-work bundle … a `swarm` override is not an input to it";
[`PD-ORCH-006`](../../product/directives/pd-orch-006.md#pd-orch-006), which narrows REQ-ORCH-029 alone and tells the entry role a run
granted the bundle does the work itself. Raised 2026-10-06 by the repair of fin22's bundle `fin22-record-tidy`, from its
verifier's finding, beside
[`the-swarm-run-override-changes-no-instruction-text.md`](../../defects/fixed/the-swarm-run-override-changes-no-instruction-text.md).
~~Open.~~ Ruled 2026-10-07, confirmed as built.)*

The two requirements meet on one run: a `swarm` override on an `explicit_trivial` or `single_file_change` intent (with
the built-in mapping). REQ-ORCH-016 grants that run the direct-work bundle, since `swarm` is not an input to the
mapping, and the bundle is not the coordination-only tool set REQ-ORCH-025 says a `swarm` entry role keeps. REQ-ORCH-025
demands maximum parallel delegation of the same run, while `PD-ORCH-006` tells a coordinator granted the bundle to do
the work itself; the directive names REQ-ORCH-029 only, so it does not by itself displace REQ-ORCH-025's "keeps its
coordinating status and its coordination-only tool set". Neither requirement names the case. A demand for delegation
beside the direct-work statement would put back the contradiction `PD-ORCH-006` removed (finding G2 of the default live
run at `27a5127`: a first turn of 14.5 s spent reasoning about tools it was told not to use).

**What the build proceeds under** (the code as it stands; nothing changed for this question): the grant follows
REQ-ORCH-016, so the `swarm` run on a granted intent holds the direct-work bundle with `delegate` in it
(`packages/engine/src/intent/gate.ts`, `intentGrant`; `apps/desktop/src/run-host/intent.ts`). Its entry role keeps its
coordinating status in REQ-ORCH-025's sense: it is not a `single` run, so `coordinating` holds
(`packages/engine/src/sessions.ts`) and `delegate` is not withheld (`apps/desktop/src/run-host/tools.ts`). Its
instructions are `PD-ORCH-006`'s, the direct-work statement, and no `swarm` text is rendered beside them, since the
build renders that text on no run (`entryInstructionsFor`, `packages/engine/src/children/personas.ts`, reads no run
override; the defect note above). On every other intent a `swarm` run is today the same run as an `orchestrator` one.
*(Corrected 2026-10-06, finacc3, finding F07: the last two sentences no longer describe the build. On every intent the mapping
does not grant the bundle a `swarm` run is now told REQ-ORCH-025's demand, after its playbook (`withRunOverride`,
`SWARM_INSTRUCTION`); on a granted intent the build still renders no `swarm` text beside the direct-work statement, by a
deliberate check in `withRunOverride` rather than because no run reads the override. That is the reading this question
holds open. Corrected again in that bundle's repair round 1: the function is now `runOverrideLayer`, and `runTurn` places
its text after everything else the prompt carries, the MCP section included (`withRunOverrideLayer`); the check that keeps it
off a granted run is unchanged.)*

**What a ruling decides.** Whether a `swarm` override on a granted intent keeps the bundle and is told to do the work
itself (REQ-ORCH-025's coordination-only tool set and delegation demand yield on those intents, as built, carried by a
directive naming REQ-ORCH-025), or keeps the coordination-only tool set and the delegation demand (the grant withheld,
so `swarm` becomes an input to REQ-ORCH-016's mapping as `single` is, and `PD-ORCH-006` does not reach that run), or
keeps the bundle and is told both. The repair of the defect note can render REQ-ORCH-025's `swarm` text on the other
intents whichever way this is ruled; what it renders on the granted ones waits on the ruling.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)):** on every run where the
intent-to-tools mapping in force (the built-in mapping or a user's mapping file) grants the entry role the direct-work bundle,
a `swarm` override changes nothing the run holds or is told. The entry role keeps the bundle with `delegate` in it and is given
`PD-ORCH-006`'s direct-work statement. It is given no `swarm` text on any turn, including the turn the plan gate holds and any
continuation. [`PD-ORCH-006`](../../product/directives/pd-orch-006.md#pd-orch-006) revision 3 carries this by adding REQ-ORCH-025 to its
Narrows line. On every run the mapping does not grant, REQ-ORCH-025's `swarm` governs as written, and REQ-ORCH-016 and
REQ-ORCH-150 stay unchanged. **The two recommendations weighed:** advocate A (the user's lens) recommended confirming as built
through `PD-ORCH-006` revision 3, since the strategy is a standing workspace setting and the micro cell's one-item task has
nothing to fan out; advocate B (the system's lens) recommended the same confirmation, since withholding the grant would break
REQ-ORCH-016's "not an input", the Specification Gate's resolution 14 and REQ-ORCH-025's own "instruction text only", and both
texts together would restore finding G2. The ruling followed **both**, naming the plan-held turn and continuations, which
neither stated, and taking the owed built-app evidence now. **Confirmed as built 2026-10-07 (fin27):** no behaviour change
(`runOverrideLayer`, `packages/engine/src/children/personas.ts`, returns nothing on a granted run); pinned by
`intent/intent.test.ts` (a `swarm` override keeps the grant of the built-in and of a file mapping), `children/personas.test.ts`
(no layer on a granted run, held or not), two `run/preflight.test.ts` cases (a file-mapping grant; a plan-mode granted run's
held turn and its first turn after approval), each red with the granted-run check removed, and
`tools/symbol-artifact/back-pointers.test.ts`; shown in the built app by `pnpm fetch-proof`'s launch 8, `swarm-granted`.
