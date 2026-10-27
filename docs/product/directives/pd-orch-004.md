[Product directives](../directives.md) › PD-ORCH-004

<a id="pd-orch-004"></a>

### PD-ORCH-004 — a child cut off while making progress hands its work back to the parent

*Revision 5 (2026-10-06, [R-071](../requests.md#r-071)) — **two rulings**: what the parent is told of a continuation (OQ-114)
and how long the landing at the limit may take (OQ-196), two paragraphs added after "How a later root learns of an offer";
`REQ-CONFIG-113` joins the Narrows list. Nothing is replaced. The owner took both recommendations.*

*Revision 4 (2026-09-28, [R-064](../requests.md#r-064)) — **how a later root learns of an offer**, a paragraph added
after "Naming the continuation"; the owner's ruling on OQ-99. Nothing is replaced.*

*Revision 3 (2026-09-27, [R-059](../requests.md#r-059)) — **an offer outlives its run**, the last sentence of "Naming the
continuation", ruled with PD-ORCH-005. Revision 2 (2026-09-27, [R-058](../requests.md#r-058)) — **how the parent names the
child it continues**, which rules OQ-66. Revision 1 (2026-09-23, [R-048](../requests.md#r-048)) is otherwise unchanged.*

REQ-ORCH-088's expiry path still runs in its order: the child is gracefully paused; if the role has a
configured fallback model not yet attempted for this child, it is retried once on it; otherwise it is
recorded failed with a timeout issue and a report of the form "Child timed out after <N>s" carrying the
last response extracted from its transcript. This directive adds to that last step, and only for a child
that was **making progress** when it was cut off.

A child is **making progress** when it completed at least one tool call within the final
`runtime.child_stall_timeout` seconds before its `runtime.child_timeout` expired. For such a child the
failed record's report SHALL additionally carry:

- a statement that the child was cut off while making progress;
- the workspace paths the child's own file-writing calls changed during its run, in the order first
  changed, or a statement that it changed none;
- a **continuation offer** to the parent: the remaining work may be delegated to a new child as a
  continuation of this one.

A child delegated as a continuation carries that relationship in its record. A continuation that itself
times out while making progress SHALL receive the first two items and SHALL NOT receive a continuation
offer, so a piece of work is continued once and never chained.

**Naming the continuation (revision 2).** `delegate` SHALL accept one further optional action field,
`continuation_of`: the task id of the child whose work the new child continues. The delegation SHALL be refused
with status `rejected`, before any record is created and with a reason naming the cause, unless the id names a
direct child of the calling agent whose report carries a continuation offer and which no child of the session
already continues. The new child's record carries the id it continues; its payload is assembled as any child's
is, and nothing of the continued child is injected into it. **An offer outlives its run (revision 3):** it stays
open until it is taken up once — by the agent that delegated the child while that agent runs, or, in a later iteration
or a later run of the session, by that iteration's root agent.

**How a later root learns of an offer (revision 4).** Every root that may take up an open offer SHALL be told of it,
once:
- the root of a new run, in the continuation handoff's progress context;
- a resumed root, at the continue that resumes it, unless its conversation already holds the offer;
- the root of each later iteration of the same run, in that iteration's first message.

Each list names the open offers' children by canonical name and task id, the newest ten, and says when earlier ones
were left out. Revision 3 gave a later root the right to an offer and no way to learn that one existed. The build told
a new run's root and a resumed root, and the owner ruled that a later iteration of the same run is told as well.

**What the parent is told of a continuation (revision 5).** The continuation offer, and `delegate`'s description of
`continuation_of`, SHALL tell the parent that a continuation starts with no memory of the child it continues — it is given
only the task the parent writes, since nothing of the continued child is injected into it — so the parent writes a
complete brief: what was asked, what the child did and found, and what remains.

**The landing at the limit is bounded (revision 5).** When a child's `runtime.child_timeout` expires, its turn stops
before its next model step (REQ-ORCH-088's graceful pause). What it has in flight then — a model step, or a tool call —
SHALL have at most 30 s from the expiry to end; at that bound the child's execution is aborted. Of a model step so
aborted, its streamed reasoning SHALL stay in the session's transcript, and nothing of it reaches the child's
conversation, its report or a continuation. The child then ends as REQ-ORCH-088 and this directive say, so the child's
wall clock is its `child_timeout` and at most 30 s more, never longer.

> Revision 2 said, and no longer governs: "Which agent may take up an offer once the iteration that raised it has
> ended — after a stop, a pause or an interruption — is for the run-continuation policy R-058 opened; until that is
> ruled, only the agent that delegated the child can, within the same iteration."

> Revision 1 said nothing of how the parent names the child it continues, and it narrowed REQ-ORCH-088 alone,
> so the field built under [R-057](../requests.md#r-057) departed from REQ-TOOLS-152, which no directive named for it.
> That is [OQ-66](../../architecture/open-questions.md), ruled by this revision.

Unchanged: the child still ends `failed` with its timeout issue; the per-child limit and its default are
untouched; a child that was not making progress gets exactly REQ-ORCH-088's report; and REQ-NOTIFY-112
still holds that a child whose own `runtime.child_timeout` was exceeded is not recovery-eligible and earns
no corrective message — the continuation is the parent's decision, never an automatic resume.

**Why revision 5, and what it costs.** The owner ruled two questions the live runs raised ([R-071](../requests.md#r-071)).
The duress run of 2026-10-03 briefed both of its continuations as if they remembered ("You had already run everything …"),
and one rebuilt its brief from the product's own session store: 31 terminal calls and about 1.7M input tokens, roughly
18 % of the session (OQ-114). Telling the parent costs a few sentences in the offer and the tool's description; giving the
continuation its predecessor's record instead would have cost a payload change and its budget. The same runs had three
children reach the limit mid-step, and the 30 s backstop aborted each step after 87 to 115 s of generation; both cut-off
children of 2026-10-03 succeeded when continued (OQ-196). Keeping the bound keeps run times predictable at the price of
some repeated work, which the continuation offer already recovers; a longer landing would have made REQ-CONFIG-113's
ceiling soft. Neither changes code beyond the wording: the bound is the one the build already had (`CHILD_LANDING_GRACE`),
now written down.

**Why, and what it costs.** In run `2e21e324` two children were cut off at 1200 seconds after 110 and 113
tool calls. They were working, and the failure discarded what they knew about their own progress, leaving
the parent to rediscover it. The report now hands back what a continuation needs. What it costs: a longer
report for these children, and one more relationship in the child record. The limit itself is not raised,
so a child that genuinely loops is still stopped at the same point.

> **Narrows:** REQ-ORCH-088, REQ-CONFIG-113 (revision 5), REQ-TOOLS-152 (revision 2)

*Corrected 2026-10-13 under [OQ-237](../../architecture/open-questions.md) (GV1, [R-072](../requests.md#r-072)): REQ-TOOLS-152
moves from Extends to Narrows. It calls its field list "the whole of the `delegate` contract", and `continuation_of` joins
that list, a change to an exact enumeration and so a narrowing (acceptance finding F15), the verb `PD-TOOLS-006` took for
`write_scope`. R-058 recorded *Extends* because "the symbol artifact holds one narrowing directive per requirement", which no
longer holds. The two cases are disjoint: this directive's field names the child a continuation continues;
`PD-TOOLS-006`'s fields claim a write scope and resume a settled child. The disposition read until then, and no longer
governs:* "> **Extends:** REQ-TOOLS-152 (revision 2)"

*Raised by the owner, 2026-09-23; logged as [R-048](../requests.md#r-048). Revision 2 logged as [R-058](../requests.md#r-058), revision 3 as [R-059](../requests.md#r-059), revision 4 as [R-064](../requests.md#r-064), revision 5 as [R-071](../requests.md#r-071).*

> **First execution, 2026-09-27, built under [R-057](../requests.md#r-057):** the mechanism was built as written, and the
> text met the code in four places. **(1) The stall window had no reader.** `runtime.child_stall_timeout` and a role's
> `stall_timeout` were loaded and validated and reached no run; the progress rule is their first reader. Both are now
> handed to the run, and the role's value substitutes for the run's on that role's children (REQ-CONFIG-108). The
> stall recovery REQ-NOTIFY-111/112 describe for the same window is not built, and that is recorded in
> [`a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`](../../defects/fixed/a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md),
> not changed. *(Built 2026-09-29 under R-067, with REQ-ORCH-089's watchdog over the same window; the readings are
> OQ-127.)* **(2) How a parent names a continuation.** REQ-TOOLS-152's fields have none. `session_id` reuses a
> delegation's session, and this directive asks for a new child and never a resume, so `delegate` takes one new
> optional field, `continuation_of`, the task id of the child continued. It is recorded on the new child as
> `children.continuation_of` (store v22). REQ-TOOLS-152 calls itself the whole of the `delegate` contract, and this
> directive does not name it; the tension is reported, not settled, and is raised as
> [OQ-66](../../architecture/open-questions.md) with why `session_id`, `inherited_context` and `depends_on` do not fit. **(3) Where the parent reads the report.**
> REQ-ORCH-060's block shows, of the report, its status and its result text and nothing else, so the three additions
> would never have reached a parent through it. They follow the capped result text in the resume block and in `background_output`, outside the 4,000-character
> cap. **(4) The literal readings taken**, each an open question for the owner. A call is "completed" when its result
> returns to the child, whatever the outcome, so an error or a refusal counts. The window's bound is inclusive: a call
> completed exactly `child_stall_timeout` seconds before the expiry is progress, and one a millisecond earlier is not.
> The rule is read at the expiry of the attempt that ended failed, so calls completed during the landing do not
> count. A path "changed" when a `write_file`, `haet_edit` or `haet` call naming it returned `ok`; the name is matched
> in lower case, as the gate's own fallback dispatches `Write_File` to `write_file`. *(This reading was falsified by the
> duress live run at `a68f121` on 2026-10-07 and replaced by fin32: the code-intelligence EDIT tier's calls are
> file-writing calls too — see "The changed-paths reading falsified" below. Kept as written.)* Paths are collected across both
> attempts of REQ-ORCH-088's retry and resolved lexically against the workspace root, so a write outside the root is not
> a workspace path and is left out. Lexical is not what the file tools' fence does, which decides "inside" on real
> paths. So a write spelled through the real path of a root reached by a symbolic link (macOS `/var` →
> `/private/var`) is accepted by the fence and left out of the list, and on a case-insensitive filesystem `Src/A.ts`
> and `src/a.ts` are listed as two paths. "Continued once" is enforced at admission: a
> second continuation of the same child, a continuation of a child that made no offer (a continuation among them) and
> one naming anything but the caller's own child are refused with no record. The caller's "own child" is
> REQ-TOOLS-155's ownership test, and every iteration mints a new root task. So a continuation can be taken up only
> within the iteration whose child was cut off: a later iteration, or the next run after a stop, is refused with
> "names no child task of yours", and the offer's text does not say so (OQ-66); this limit is read from `run/run.ts`
> and `owns()`, not exercised by a test. *Revision 3 lifted this limit on 2026-09-27: an earlier iteration's offer, and
> a resumed iteration's own from an earlier run, are the later root's to take up (`continuationRefusalFor`, OQ-99), and
> the handoff lists the open offers.* The continuation's payload is
> assembled as any child's is; nothing of the timed-out child is injected into it. What was measured: unit and scripted
> end-to-end tests only. These cover the rule at a call completed exactly at the window's start and one millisecond
> before it, a 60 s window set through the run's configuration, the path list's order, de-duplication and failed
> writes, the "changed none" statement, the offer, the continuation's record, the refused chain and the refused
> second continuation. Each end-to-end case goes red when its limb of the mechanism is reverted. *Added after review,
> the same day:* four more end-to-end cases in `ladder.test.ts` exercise REQ-ORCH-088's own machinery. Attempt 1's
> write is listed beside attempt 2's across the fallback retry. A child progressing at attempt 1's expiry and not at
> attempt 2's gets REQ-ORCH-088's report alone. A call completing 5 s into the landing grace is not progress. A role's
> `stall_timeout` of 2 s replaces a run window of 5 s, and one of 3 s keeps the bound inclusive, with the run's window
> alone as the positive control. Each went red under its mutation: a log built per attempt, progress carried over from
> an earlier expiry, progress read when the report is built, and the role's value dropped. A unit case covers the
> lower-case name. What was not
> measured: no built-app run exercised the mechanism. `pnpm resilience-proof`, the proof nearest this path, could not
> launch the app as root and made no assertion
> ([`resilience-proof-cannot-launch-the-app-as-root.md`](../../defects/fixed/resilience-proof-cannot-launch-the-app-as-root.md)).
> No live run was made, so the offer's wording has not met a real model. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3, 2026-09-27, ruled by [R-059](../requests.md#r-059) and built with PD-ORCH-005 under [R-063](../requests.md#r-063):** the rule was
> built as written, and the text met the code in three places. OQ-99 records each reading.
>
> **(1) Who "that iteration's root" is for an offer.** A resumed iteration keeps its number across runs, so "an earlier
> iteration" alone would have given its root none of the offers its own children left in a run before. The build's
> first cut read it that way, and the review found it: the words "or a later run of the session" had become redundant.
> The root of a later run now takes up an offer from any earlier iteration, or from its own iteration if the child ended
> in an earlier run, whoever delegated it. Within an iteration, only the delegating agent takes it up, while that agent
> runs. The refusal names both routes.
>
> **(2) How a later root learns an offer exists.** The text gives the right and no channel. A new iteration's root reads
> the open offers, the newest ten, in the handoff's progress context. A resumed root is told, at the continue, the
> offers its conversation does not already hold. An offer counts as held when it came in a child's report or in a list
> the root was told, and a passing mention of the task id does not count. Three reviews shaped that rule: the second
> made the list told at every continue; the third found a root that had answered taking a step to read it each time;
> the fourth found a mention counted as the offer. Each falsified reading is kept in OQ-99.
>
> **(3) REQ-SESSION-115's "latest orchestrator artifact".** The built-in orchestrator publishes no artifact of its own.
> The handoff therefore states the latest artifact of any kind that nothing supersedes, id first, cut to 6,000
> characters without splitting a character. This replaces the placeholder that said none was recorded, repairing
> [`the-continuation-payload-says-no-artifact-is-recorded.md`](../../defects/fixed/the-continuation-payload-says-no-artifact-is-recorded.md).
> Two limits stand, each recorded:
> - a report re-materialised under a reused canonical name keeps its first creation time;
> - a document edited after publishing is stated as published.
>
> **What was measured.** Unit and scripted end-to-end tests in `children.test.ts`, `session-resume.test.ts` and
> `turn.test.ts`:
> - the earlier-iteration offer, the earlier-run offer of the resumed iteration's own child, and a grandchild's;
> - the refusals;
> - the list's cap, and the told-once rule;
> - the artifact's choice, cut and rendering.
>
> Each limb turned a test red when reverted.
>
> **What was not measured.** No built-app run took up an offer, because the scripted client cannot time a child out
> while it is making progress. No live run was made. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 4, 2026-09-28, ruled by [R-064](../requests.md#r-064) and built with `PD-ORCH-005` revision 4
> under [R-065](../requests.md#r-065):** the rule was built as written. Every execution root's first message names the open
> offers that message does not already hold (`offersForFirstMessage`), and a plan cycle is told none. The list and its
> reader moved to `packages/engine/src/run/offers.ts`, so the run tells a later iteration's root without importing the
> session manager, and REQ-SESSION-194's cut is one function, `run/cut.ts`. The text met the code in one place, recorded
> in [OQ-107](../../architecture/open-questions.md): "told of it, once" is read once per root, and the offers a handoff already covered, named or elided,
> count as told.
>
> **What was measured.** `offers.test.ts`, through the run, each limb red when reverted.
>
> **What was not measured.** No built-app run: the scripted client cannot cut a child off while it is making progress
> and then begin a second iteration. No live run was made. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First live execution, 2026-09-29 — the duress scenario of `pnpm live-run`, under [R-066](../requests.md#r-066), recorded
> under [R-067](../requests.md#r-067):** the built product at `fa377e6` (revisions 1 to 3 built; revision 4's `offers.ts` not
> yet on that commit) against the owner's self-hosted endpoint (`qwen3.8-flash-next`, unmetered), pack
> `.live-run/runs/2026-09-29T03-06-14-929Z/`, session `379f1490`. It is the first time a real model was cut off while
> making progress, and every part of the directive held end to end:
> - **The progress rule.** Child `d` (`bg_b8da141a`, `docs-writer`) reached its 1,200 s `child_timeout` at 03:34:25 with
>   61 tool calls, the last of them inside the final stall window; its report says "Cut off while making progress: this child completed a tool
>   call within the final 90s before its 1200s limit expired." It ended `failed` with the timeout error "Child timed out
>   after 1200s", as REQ-ORCH-088 has it.
> - **The changed paths, in order.** `cut_off.changed_paths` is `docs/api.md`, `docs/overview.md`, in the order first
>   changed, and matches the report's deterministic `edited_files`.
> - **The offer's text.** "Continuation offer: the remaining work may be delegated to a new child as a continuation of this
>   one — call delegate with continuation_of: "bg_b8da141a". A piece of work is continued once; a continuation is not
>   offered one of its own."
> - **The continuation.** The orchestrator took the offer at tool call #242, 03:35:55, 22 s after `d` settled: `d2`
>   (`bg_7d79e866`) carries `continuation_of` = `bg_b8da141a` in its record, was offered nothing of its own, and ended
>   `succeeded` at 03:44:30 (515 s), finishing the reconciliation `d` had begun.
>
> **What it found beside the directive.** Nothing in the text was wrong. Two costs showed, each recorded elsewhere:
> revision 2's "nothing of the continued child is injected" had `d2` make 34 reads before its first edit (6 min 40 s of
> its 515 s), re-deriving what `d` knew — put to the owner as [OQ-114](../../architecture/open-questions.md); and the first thing `d2` read was
> `d`'s report artifact, whose summary denied the edits `d` had made, because the summariser read only the transcript's
> head (`a-long-childs-report-denies-the-edits-it-made.md`, ruled as OQ-111). The duress run's own check "no child ended
> failed with nothing to say" flagged `d`, a false positive of the harness
> (`the-duress-silent-child-check-flags-a-cut-off-child.md`, repaired 2026-09-29 under R-067 and now in `docs/defects/fixed/`:
> a cut-off child's `last_response` and `cut_off` are something to say; an error entry alone is not).
>
> **What was not measured.** An offer taken up by a later iteration's or a later run's root (revisions 3 and 4): this one
> was taken within its iteration by the agent that delegated `d`. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Second live execution, 2026-10-01 — the duress scenario on merged `main` `71ad8e8`, under [R-066](../requests.md#r-066):**
> pack `.live-run/runs/2026-10-01T03-15-27-194Z/` of the `accept` worktree, session `57095770`, the same endpoint and
> model. It met a real model with the clause the first live execution could not reach: a continuation that itself times
> out while making progress. `reconcile-docs` (`bg_71164543`) and `verify-result` (`bg_5d571a7a`) were cut off at
> 1,200 s while making progress, each report carrying the offer, and the orchestrator took both.
> `reconcile-docs-continue` (`continuation_of` `bg_71164543`) was cut off at 1,200 s too; its report carries the cut-off
> statement and the changed paths (`docs/overview.md`), and its `continuation_offer` is `null`: "a piece of work is
> continued once and never chained". `verify-result-continue` succeeded. Nothing in the text was wrong. **What was not measured,
> still:** an offer taken up by a later iteration's or a later run's root. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md)
> ([`fixed/no-live-run-has-executed-on-merged-main.md`](../../defects/fixed/no-live-run-has-executed-on-merged-main.md)).


> **First execution of revision 5, 2026-10-06, ruled by [R-071](../requests.md#r-071) and built on branch
> `fin20-continue-and-continuation`:** both paragraphs were built as written, and the text met the code in two places.
> **(1) The wording.** The offer (`cutOffReport`, `packages/engine/src/children/cut-off.ts`) gains one sentence after its
> `continuation_of` instruction — "The continuation starts with no memory of this child's work: it is given only the task
> you write, so write a complete brief — what was asked, what this child did and found, and what remains." — and
> `delegate`'s description one after its `continuation_of` sentence. An offer stored in a report before this keeps its
> words; a root told of it later reads the stored text. **(2) The landing.** The bound was the build's already
> (`CHILD_LANDING_GRACE`, the run's one 30 s allowance), and it bounds whatever the child has in flight, a tool call as
> well as a model step, since the backstop aborts the child's execution; the paragraph says so. No code changed for it:
> it is reported back into ADR-0012 and beside the constant, where its reason promised a report.
> **What was measured.** `cut-off.test.ts` and `agent-tools`' `delegation.test.ts`, one case each, red on the wording
> before; the landing's existing cases (`ladder.test.ts`'s REQ-ORCH-088 cases) unchanged and green. In the built app,
> `pnpm resilience-proof` (the ladder, the waits and the fallbacks) passed. **What was not measured.** No built-app or
> live run cut a child off at its limit: the duress live run's continuations are the evidence owed. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First live execution of revision 5, 2026-10-06 (duress at `c2fdd6a` and `c2a9444`), recorded 2026-10-07 under
> [R-072](../requests.md#r-072):** the evidence owed above. Packs `2026-10-06T16-02-48-699Z` and `2026-10-06T17-59-41-271Z` of
> the live worktree, the self-hosted reasoning model. **Five cut-offs**, every one while making progress: at `c2fdd6a` d
> (reconcile), e (decisions) and d2 (d's continuation); at `c2a9444` d (reconcile) and d-continuation. **The landing:** at
> +7.3, +0.39, +26.7, +1.44 and +7.23 s after the ceiling, none aborted (the autopsies' figures). **The reports:** every one
> carried the timeout error, the cut-off statement and its changed paths; the three that were not continuations carried the
> offer with revision 5's sentence ("The continuation starts with no memory of this child's work …"), and both continuations
> carried none, "continued once and never chained" (read again from the packs' `children` rows on 2026-10-07). **The
> continuations:** both briefs stood alone, as OQ-114 asks, and both were cut off on the reconcile item, whose time went
> largely to a terminal the child does not hold (L4/N3), the code-intelligence marker directory (L3/N6, OQ-215) and the empty
> file an undone create left (N2, repaired). Nothing in the text was wrong. The premise R-071 accepted, "the continuation
> offer already recovers", held for five of the eight continuations made since 2026-09-29; the three that failed all
> continued the reconcile item. Reaffirmed 2026-10-07 under R-072 (OQ-214): the limit and its default stand, with OQ-214's
> reopening condition. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Second live execution of revision 5, 2026-10-07 (duress at `a68f121`), recorded under [R-072](../requests.md#r-072) with
> OQ-214's reopening:** pack `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`, the self-hosted reasoning
> model. **Two cut-offs, both while making progress:** `wave3-verify-all` (tester, the verification) and its continuation
> `wave3b-finish-verification`, their last calls 1.5 s and 8.8 s before the ceiling. **The landing:** +4.25 s and +0.44 s
> after the ceiling, each running an edit, none aborted. **The reports:** both carried the timeout error ("Child timed out
> after 1200s") and the cut-off statement; the offer stood on wave3 alone, with revision 5's sentence, and the continuation
> carried none — continued once and never chained; wave3b's brief stood alone, as OQ-114 asks. One record was false: wave3b's
> changed paths read empty, "Its file-writing calls changed no workspace paths.", over 11 `ok` edits through the
> code-intelligence EDIT tier — D1's, repaired by fin32 and reported above ("The changed-paths reading falsified"), the
> reading kept beside its replacement there. **R-071's premise**, "the continuation offer already recovers", is kept as
> written beside its new count: it held for five of the nine continuations made since 2026-09-29; here the continuation was
> cut off on its own on-task item, and the coordinator recovered the work by reading `docs/verification.md` itself. Nothing in
> the text was wrong. Reaffirmed 2026-10-07 under R-072 (OQ-214 reopened): the limit and its default stand, the relief for a
> slow reasoning model being PD-CONFIG-003's Per-agent timeout, which the duress harness now sets to 45 minutes. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **The changed-paths reading falsified, 2026-10-07 (duress at `a68f121`, finding D1), and its replacement, built by
> fin32:** the first execution's open reading (4), "a path 'changed' when a `write_file`, `haet_edit` or `haet` call naming
> it returned `ok`", is kept above as written. Pack `2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`:
> `wave3b-finish-verification`, a tester continuing `wave3-verify-all`, made 11 single-file content replacements of
> `docs/verification.md` through the code-intelligence server that returned `ok` (tool calls #367 to #392), taking it from
> 387 lines (#334) to 469 (#393), and was cut off while making progress. Its report carried `changed_paths: []` and "Its
> file-writing calls changed no workspace paths.", which the parent read in #336's result; the pass's facts (request 275)
> read "Edited files: (none)" and the summary called the edits "attempted"; the artifact listed no edited files; and the
> coordinator spent rows 751 and 761 on the contradiction before reading the file itself. REQ-MCP-015's EDIT tier — seven
> tools, among them single-file and cross-file content replacement, carried by coding-agent, tester and refactorer —
> writes files, so its calls are this directive's "file-writing calls". **The replacement:** a call is file-writing when
> its tool is one of the three native file tools or a tool of the binding manifest's `edit` tier (one source, matched in
> lower case and under the `code_intelligence_` collision prefix); its path is read from its arguments as the manifest
> names them (`editArguments`, generated and checked against the server's own input schema); and it changed that path
> when it returned `ok`. One reading, `writtenPathsOf` (`packages/engine/src/children/report.ts`), now feeds the cut-off's
> changed paths, the report's `edited_files`, the facts the pass is told never to deny and the fallback's "Files
> touched". The terminal stays outside, as PD-TOOLS-006 states. **A literal reading taken, open for the owner
> ([OQ-245](../../architecture/open-questions/52-spikes-and-later-questions-19.md#oq-245), numbered by fin35):** a
> cross-file EDIT capability is listed by the one file or directory its arguments confine it to — a symbol rename lists
> the file declaring the symbol, not the files whose references it rewrote, and a replacement across the whole project
> (no path argument) lists none — because the arguments name no more and the result's text is the server's; a preview
> (`dry_run`) changes nothing and lists none. **What was measured:** `cut-off.test.ts`, `report.test.ts` and `config`'s
> `code-intelligence.test.ts`, red before the change; `pnpm code-intel-proof`'s eighth launch (`child-edit`), a delegated
> tester's single replacement through the built app, read from its stored report and its child-report artifact (red on a
> build of the unrepaired engine, the report's `edited_files` `[]`; green after, `["src/edit.ts"]`, in 64.9 s at a load of
> about 12 on four CPUs).
> **Not measured:** a live run since the repair. The note is
> [`fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md`](../../defects/fixed/a-child-that-edits-through-the-code-intelligence-edit-tools-is-reported-as-having-changed-nothing.md);
> the row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **The literal reading for cross-file EDIT calls falsified, 2026-10-13, and its replacement, built by fin35 (ruled as
> [OQ-245](../../architecture/open-questions/52-spikes-and-later-questions-19.md#oq-245) under [R-072](../requests.md#r-072), XE1):** the reading taken above, "a
> cross-file EDIT capability is listed by the one file or directory its arguments confine it to", is kept as written. It is
> false against this directive's own words — the paths the calls "changed" — and against REQ-ORCH-109: a rename lists one
> file of the many it rewrites, a whole-project replacement none, a directory-scoped one the directory, so a child whose only
> writes are such calls is told to its parent as having "changed no workspace paths" and the pass's facts read "Edited files:
> (none)". The pinned runtime's results cannot fill it: a rename returns a count and no file, and a cross-file replacement
> names its files only when it succeeds, writing them one at a time, so a failure part-way leaves files written under an
> error result. **The replacement:** each EDIT capability's manifest entry carries a `scope` — `argument` for the five
> single-file tools and the safe delete (which refuses while references exist), `reach` for the rename (the project) and the
> cross-file replacement (its path, or the project) — checked by generation; the run host observes the files a `reach` call
> that is not a preview can reach, before and after it, whatever it returned, leaving out what another agent's native file
> writes touched meanwhile, and carries what changed on the call's result for the report alone (`observeReach`,
> `packages/agent-tools/src/tools/observe.ts`; the MCP executor in `apps/desktop/src/run-host/mcp.ts`); `writeReadingOf`
> (`packages/engine/src/children/report.ts`) lists it — an erred call observed to write included — for the changed paths,
> `edited_files`, the facts and the fallback; and where no observation was completed it lists the argument's file (a
> rename's declaring file, never a directory) and says "a <tool> call may have changed files the record cannot name", never
> "changed no workspace paths" — a walk the run host could not complete marks the result `unobserved`, so a call that erred
> unobserved is said too rather than read as refused (added by the fin35 review: the build first returned such a result
> unmarked, and an erred whole-project replacement on a tree past the walk's limit read "Edited files: (none)"). **The bound, stated:** a sibling's terminal write landing inside the window is listed under
> the observing child, since the terminal is outside every count (PD-TOOLS-006); REQ-ORCH-109 prefers overstating to
> concealing. The observation's cost is a walk of the reachable tree, twice per call. **What was measured:**
> `config`'s `code-intelligence.test.ts` (the scopes), `agent-tools`' `observe.test.ts` (a change, a creation, a removal, an
> unchanged size and modification time, the ignored directories, a partial failure, a sibling's write subtracted, an
> unobservable tree), `report.test.ts` and `cut-off.test.ts` (a rename across three files, a whole-project and a
> directory-scoped replacement, a partial failure, a preview, an unobserved call, an erred call carrying the `unobserved`
> mark, a refused one) and the run host's `mcp.test.ts` (a fake server whose replacement writes two files and then errs; one
> whose reach cannot be walked, marked `unobserved` though it erred), each red on the code before;
> `pnpm code-intel-proof`'s ninth launch (`child-across`) — see the row. **Not measured:** a rename through the built app,
> which needs the TypeScript language server provisioned (IC-7); a live run. The note is
> [`fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md`](../../defects/fixed/a-cross-file-code-intelligence-edit-is-reported-by-its-argument-path-alone.md);
> the row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **The rename through the built app, 2026-10-13 (fin42, the survey's N59):** the paragraph above's "Not measured: a rename
> through the built app, which needs the TypeScript language server provisioned (IC-7)" is kept as written; its reason did not
> hold. IC-7 was discharged on 2026-09-27 with only the pipeline evidence owed, and `pnpm code-intel-proof`'s fourth launch already
> had the runtime fetch and start the TypeScript server on first use: the rename had never been driven, not been blocked. Three
> launches were added, each a delegated child's scripted call against the real bundled runtime (scripted provider, free):
> **launch 10** (`child-rename`) — a refactorer searches for the references of `countItems`, declared in `src/rename-a.ts` and
> imported and called by `src/rename-b.ts`, then renames it with `rename_symbol`: the call `ok` ("2 changes applied"), both files
> renamed on disk, and exactly those two files in the child's stored report's `edited_files` and its child-report artifact's —
> OQ-245's reach observation through a language server, as the ruling wanted it (40.5 s, the server already provisioned, load
> about 4.4 to 6.5 on four CPUs beside the sibling plan); **launch 11** (`child-rename-cold`) — the same rename as the child's only
> call: the report and the artifact listed exactly the one file that changed, which is the observation working, and that one file
> was all the rename changed, while saying "Successfully renamed 'sumItems' to 'totalItems' (1 changes applied)" and leaving
> `src/cold-b.ts` importing a symbol that no longer exists. That is a defect of the tool the EDIT tier grants, not of this
> directive's reading: the pinned runtime waits for the language server's project loading before a references request and not
> before a rename, so a rename that is a server session's first cross-file request reaches the declaring file alone (measured
> also over the runtime's own stdio branch, a copy of the live run's `todo-app` fixture among four arrangements). Recorded as
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
> and raised as [OQ-273](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-273); launch 11 keeps the assertion and is red until it is repaired;
> **launch 12** (`child-renamed-tool`) — the global configuration's `tool_name_map` offers the cross-file replacement as
> `replace_across_project`, and a tester's call by that name lists both files it changed in its report and artifact, with the
> evidence's `renamed` map `{"replace_across_project":"replace_in_files"}` (41.5 s): fin38's repair of
> [`a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write`](../../defects/fixed/a-code-intelligence-edit-tool-renamed-by-tool-name-map-is-not-read-as-a-write.md)
> in the built app, which only a doctored entry reaches, since the shipped entry renames nothing (no live run can). **Not
> measured:** a live run. The opt-in `rename` scenario (`live-run.mjs --only=rename`) is written and is the orchestrator's: a
> coding-agent renames the fixture's `remaining` to `countRemaining` with `rename_symbol`; it should show the rename row `ok`,
> none of `src/todos.js`, `src/App.jsx` and `src/todos.test.js` still calling or importing `remaining`, all three in the child's
> `edited_files` and its artifact's, and `node --test` green — or, where the model renamed with nothing before it, OQ-273's
> signature named as a NOTE beside a red files check; a run with no rename call is a NOTE, "not reached". `summary.md` has no
> edited-files section (REQ-SESSION-140), so whether it names the files is the model's prose and only noted. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First built-app execution of revisions 3 and 4, 2026-10-13 (fin42, the survey's N50):** the first built-app run in which a
> later root took up an offer, which every execution above recorded as not measured ("No built-app run took up an offer").
> `pnpm continuation-proof`, scripted provider, the per-agent timeout at 3 s and every child scripted to complete a call and
> then hold past it. **(1) A later iteration's root** (`later-iteration`): the coordinator delegates `alpha` and is woken by
> its cut-off report without taking the offer; a prompt typed into the composer while the run is going is queued and runs as
> iteration 2, whose root's first recorded message carries the list ("Open continuation offers … - alpha (bg_…)") and which
> takes the offer up (`continuation_of` alpha's id, the continuation its own child, iteration 2); the delegating root's first
> message listed none. The continuation, cut off too, carries the statement and no offer — continued once, never chained.
> **(2) A later run's root** (`later-run`): the run that cut alpha off completes; a launch sets Settings › Runtime ›
> Per-agent timeout to 1 minute and saves; the relaunch opens the session from the Sessions browser, and the follow-up's root
> reads the offer in the continuation handoff ("This is a follow-up within an existing session. …", the list after
> `Progress:`), takes it up, and the continuation `succeeded` under the 60 s the run read. In both, no offer is left open.
> The scripted root takes an offer with a step of its own, `continue:<persona>:<name>` (`offeredTaskId`, the run's own
> `offersToldIn` reading, `apps/desktop/src/run-host/scripted-client.ts`), pinned by `scripted-client.test.ts`. Nothing in
> the text was wrong. **Not measured:** a live run in which a later root took an offer up — the live `cutoff` scenario
> (`--only=cutoff`) asks for it and is the orchestrator's to run; a model that declines the offer there is a NOTE. The row is
> in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. The changed-paths repair (finding D1) and the cross-file EDIT reading (XE1, OQ-245) met no
> code-intelligence EDIT-tier call:
> the duress tester held the tier and wrote through `write_file` and `haet_edit`, and every child's `edited_files` equals its
> successful `write_file` and `haet_edit` paths. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
