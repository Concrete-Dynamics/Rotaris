[Product directives](../directives.md) › PD-ORCH-006

<a id="pd-orch-006"></a>

### PD-ORCH-006 — a coordinator granted the direct-work bundle does the work itself, and is told so

*Revision 3 (2026-10-07, [R-072](../requests.md#r-072)) — **a `swarm` run the mapping grants**, the ruling of OQ-205 under the
owner's delegation: the paragraph **A `swarm` run** becomes a governing clause, and REQ-ORCH-025 joins the Narrows line. The
generator admits one narrowing directive per requirement, so any later narrowing of REQ-ORCH-025 also lands here. Revisions 1
and 2 are otherwise unchanged.* *(No longer binding since 2026-10-13, [OQ-237](../../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

*Revision 2 (2026-10-06, [R-071](../requests.md#r-071)) — **which todo items REQ-ORCH-029's success clause ranges over**, a
section added after the directive's first two paragraphs; the owner's ruling of OQ-203. One clause of the first paragraph is
qualified there and quoted beside its replacement. This directive is the one that narrows REQ-ORCH-029, and the symbol
generator admits one narrowing directive per requirement, so a narrowing of REQ-ORCH-029 lands here whatever it is about
(as `PD-TOOLS-006` holds REQ-TOOLS-152's). Revision 1 (2026-10-06, the ruling of OQ-202) is otherwise unchanged. The
paragraph **A `swarm` run** was added the same day as a wording addition (fin22), not a revision: it changes no clause,
names how the clauses above reach a `swarm` run, and cites [OQ-205](../../architecture/open-questions.md) for what they do not
decide.* *(No longer binding since 2026-10-13, [OQ-237](../../architecture/open-questions.md): two directives may narrow, or extend, one requirement in disjoint cases, so a later narrowing need not land here when it is about something else; what landed here stays.)*

Where the intent-to-tools mapping grants the entry role the direct-work bundle of REQ-ORCH-016 — with the built-in
mapping, on a run whose intent is `explicit_trivial` or `single_file_change` — three of REQ-ORCH-029's constraints on the
coordinator SHALL NOT bind it for that run: it MAY make file-modifying tool calls, it MAY emit a plan, code or a diff of its
own authorship, and a work item it takes on NEED NOT reach a specialist through a `delegate` call. Its other constraints
still bind: work spanning more than one step is accompanied by a todo list it keeps current; no two implementation
delegations for the same todo item are outstanding at once; it does not report the run successful while a todo item is
non-terminal or disagrees with what happened; and it issues no delegation deeper than depth 3. `delegate` stays in the
bundle, so it MAY still delegate.

The instructions the entry role is given for that run SHALL say that it holds the tools to read and write files and run
commands and does the work with them, and SHALL NOT say that it modifies no files or runs no commands. A prompt supplied by
configuration (REQ-CONFIG-100) is kept whole, with that statement after it. While the plan gate holds the run
(REQ-ORCH-153), the bundle's writing and command tools are withheld, and the held turn is given the instructions of a
coordinating run. Every other run keeps REQ-ORCH-029 whole. *(Qualified by revision 2: on every run, the todo clause
ranges over the task's own items, below.)*

**A `swarm` run — revision 3.** Where the intent-to-tools mapping in force, built-in or a user's mapping file, grants the
entry role the direct-work bundle, a `swarm` override SHALL change nothing that run holds or is told. The entry role holds the
bundle with `delegate` in it and is given this directive's direct-work statement. It is given no `swarm` text on any turn of
the run, including the turn the plan gate holds and a continuation. REQ-ORCH-025's coordination-only tool set and its demand
for maximum parallel delegation do not reach that run. Its coordinating status in REQ-ORCH-025's sense stands: it is not a
`single` run, nothing is withheld, and the REQ-ORCH-029 constraints this directive leaves binding still bind. On every run the
mapping does not grant, REQ-ORCH-025's `swarm` governs as written. `swarm` stays outside the mapping's inputs (REQ-ORCH-016)
and is offered to every run alike (REQ-ORCH-150).

> *Revision 2 said, and no longer governs:*
> **A `swarm` run** (named 2026-10-06, a wording addition; nothing above changes, and this directive governs over
> REQ-ORCH-029 alone). A `swarm` override is not an input to the mapping (REQ-ORCH-016), so a `swarm` run whose intent the
> mapping grants is granted the bundle, and the paragraphs above reach it as they reach any run granted the bundle. That
> meets a clause this directive does not name: REQ-ORCH-025's `swarm` keeps "its coordinating status and its
> coordination-only tool set" and demands maximum parallel delegation, by instruction text alone. The two requirements do
> not say which governs such a run, and the question is raised as [OQ-205](../../architecture/open-questions.md), which is
> open. The build proceeds under the reading OQ-205 records: the run holds the bundle with `delegate` in it, keeps its
> coordinating status in REQ-ORCH-025's sense (it is not a `single` run, so nothing is withheld), and is told that it does
> the work itself. No `swarm` demand stands beside that statement, since the build renders REQ-ORCH-025's `swarm` text on
> no run (`packages/engine/src/children/personas.ts` reads no run override;
> [the defect recorded for it](../../defects/fixed/the-swarm-run-override-changes-no-instruction-text.md)). *(The reason, corrected
> 2026-10-06, finacc3, finding F07: the build now renders the `swarm` text on every run the mapping does not grant the bundle,
> `withRunOverride`, and withholds it on a granted run by a check of its own, OQ-205's reading; the outcome on a granted run is
> unchanged. In that bundle's repair round 1 the function became `runOverrideLayer`, its text placed after everything else the
> prompt carries by `runTurn`; the check on a granted run is the same.)*

**Which todo items the success clause ranges over (revision 2).** On every run, coordinating or granted the bundle,
REQ-ORCH-029's constraint "it does not report the run successful while a todo item is non-terminal" SHALL range over the
items of the plan that the task in hand answers for, as [`PD-ORCH-012`](pd-orch-012.md#pd-orch-012) decides them: the items not already
open when the task was first taken up. An item a task given up on, an earlier run or anything else left open before then
does not keep the coordinator from reporting the task's work done; it stays open in the plan. The clause's other half, a
todo item whose recorded state disagrees with what happened, is unchanged.

> *Revision 1 said, and no longer governs in the case above:* "it does not report the run successful while a todo item is
> non-terminal or disagrees with what happened" — among the constraints that "still bind", read over every item of the plan.

**Why, and what it costs.** REQ-ORCH-016 grants the coordinator the bundle on the two simplest intents and REQ-ORCH-029
forbids it to use it; neither names the other ([OQ-202](../../architecture/open-questions.md)). The build applied the grant and
kept REQ-ORCH-029's sentence in the instructions, so the model was offered `write_file` and `terminal` and told it must not
use them: in the default live run at `27a5127` the `frictions` scenario's first request spent 14.5 s and 1,034 output tokens
of a 32.0 s run reasoning about the contradiction before it made the calls itself (finding G2). A trivial change needs no
delegation, and the grant exists to let the coordinator make it. The cost is that the records of such a run show the
coordinator's own file-modifying calls, which REQ-ORCH-029 says a coordinating run never shows; a reader of those records
tells the two apart by the launch audit's `intent_grant`. A `single` override, which REQ-ORCH-025 already takes out of
REQ-ORCH-029, carries the same grant and is given the same instructions.

*Revision 3's why and cost.* Why: a `swarm` demand beside the direct-work statement would put back finding G2, which cost
14.5 s and 1,034 output tokens at `27a5127`; with the statement alone the default live run at `c2a9444` measured 2,910 ms and
83 output tokens for the `frictions` scenario's first `explicit_trivial` request, which went straight to `write_file`, and the
`c2fdd6a` autopsy records G2 as gone. The built-in granted intents fall in the micro cell, CHUNKING `single` with BUDGET
`tight`, and `SWARM_INSTRUCTION`'s own rule that a one-item task stays one delegation leaves a single delegation all `swarm`
could ask there. The strategy (`rotaris.delegation_strategy`) is a standing workspace setting, so any other reading would slow
every trivial edit in a `swarm` workspace. Withholding the grant instead would break REQ-ORCH-016's "not an input", the
Specification Gate's resolution 14 ("`swarm` is unaffected and stays instruction-only") and REQ-ORCH-025's own "changes
instruction text only". Cost: `swarm` has no effect on a granted run and no surface says so; the launch audit's
`intent_grant` and `config_snapshot.delegation_strategy` tell a reader why. A user mapping that grants a larger intent silences
`swarm` on that intent, and the run's records show the coordinator's own file-modifying calls under `swarm`.

> **Narrows:** REQ-ORCH-029, REQ-ORCH-025

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), which ruled OQ-202 as recommended. Revision 3 raised
under the owner's delegation, 2026-10-07, ruling OQ-205; logged as [R-072](../requests.md#r-072).*

> **First execution, 2026-10-06 (fin20).** `entryInstructionsFor` (`packages/engine/src/children/personas.ts`) gives the
> entry role its instructions for the run's grant, read by `Run`'s root turn (`packages/engine/src/run/run.ts`) with the
> pre-flight's `grant` and the entry persona's `coordinatorOnly`, and the held turn of a run at the plan gate keeps the
> persona's own prompt. **What was measured.** Four cases in `children/personas.test.ts`, one in `run/preflight.test.ts`
> (the model's request under `direct-work` and under `none`) and one in `run/plan-gate.test.ts` (a held turn); the run's two
> were red on the code before, each limb red with it removed. `pnpm fetch-proof` reads the instructions the model port
> received on its `explicit_trivial` launch. **What was not measured.** No live run: the orchestrator's default live run's
> `frictions` scenario should show the coordinator's first request answered without reasoning about the contradiction. The
> row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-07 (fin27), under [R-072](../requests.md#r-072):** confirmed as built, no behaviour
> changed; the clause held as written. **What was measured.** `intent/intent.test.ts` (a `swarm` override keeps the grant
> of the built-in mapping and of a file mapping granting `small_feature`), `children/personas.test.ts` (no layer on a granted
> run, held at the plan gate or not), two `run/preflight.test.ts` cases (a file-mapping grant carries the direct-work
> statement and no `SWARM_INSTRUCTION`; a plan-mode granted run's held turn carries neither `SWARM_INSTRUCTION` nor
> `SWARM_PLAN_HELD_NOTE`, and its first turn after approval carries the statement and no `swarm` text), each red with the
> granted-run check in `runOverrideLayer` removed, and `tools/symbol-artifact/back-pointers.test.ts` (REQ-ORCH-025 narrowed
> by this directive). In the built app, `pnpm fetch-proof`'s launch 8, `swarm-granted` (`rotaris.delegation_strategy:
> swarm`, `explicit_trivial`): the orchestrator's first request carries the direct-work statement, no `## Run override`
> heading, and offers 17 tools, `write_file`, `terminal` and `delegate` among them (the scripted client's capture
> now records the tool names it was offered). **What was not measured.** No live run: no live scenario takes a strategy, so
> the built-app launch stands in. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** the other half in the built app, and a live scenario. `pnpm delegation-proof`'s
> `swarm` launch saves `delegation_strategy: swarm` on a run the mapping does not grant (the scripted classifier's
> `moderate_feature`): the coordinator's first request carried ``## Run override: `swarm` ``, not the direct-work statement,
> and was offered `delegate` with none of `write_file`, `terminal`, `haet_edit`, `haet` — REQ-ORCH-025 as written, as this
> revision leaves it for such a run. The default live run's `delegation-swarm` launch sets the strategy and checks whichever half
> the mapping reaches; its run is the orchestrator's.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: revision 1's live measure,
> the `frictions` scenario. Its coordinator's first request after an `explicit_trivial` classification went straight to the
> work both times, `write_file` and a background `terminal` in one step: 4,329 ms and 227 output tokens (514 characters of
> reasoning) at `552d346`, 4,530 ms and 240 (463) at `0bc3eee`, against `27a5127`'s 14.5 s and 1,034 output tokens. Neither
> reasoning weighs what a coordinator may do ("Simple task. Create file, then run the command in background terminal, then
> send SIGINT."). Held as written. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
