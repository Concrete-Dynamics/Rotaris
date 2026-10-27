[Product directives](../directives.md) › PD-SESSION-002

<a id="pd-session-002"></a>

### PD-SESSION-002 — summary.md's mostly-elided artifacts are the attached artifacts a delegated agent was not given

The Warnings section of `summary.md` (REQ-SESSION-140) SHALL count as its mostly-elided artifacts every artifact a delegating
agent attached to a delegated agent (`attach_artifacts`, REQ-TOOLS-152) that the agent's `PRIOR AGENT CONTEXT (FULL)` block
left out because it did not fit that block's budget (REQ-LIBRARY-098). Each pair of agent and artifact counts once, however
many times that agent's payload was assembled. The count is taken over REQ-LIBRARY-098's context-selection diagnostic as the
session's timeline records it (`context_selection`, PD-ORCH-014). No retention cap trims that diagnostic, so the count reads
as a plain number, and `0` when nothing was left out. The line SHALL state what it counts, how many agents it concerns, and
the record it is counted from. Not counted: entries left out of the sibling index (REQ-LIBRARY-097), the continuation
handoff's cut of the latest artifact (REQ-SESSION-115), an unresolvable reference, and a document that could not be read.
Every other clause of REQ-SESSION-140 still governs, and the Metrics section's context-selection line keeps reading `n/a`,
because REQ-SESSION-133's context-selection ring is not kept (ADR-0024).

**As built.** `StoreDal.elidedAttachmentRowsOf` (`packages/store/src/dal.ts`) reads each `context_selection` entry's
`task_id` and `attached_elided` over the timeline's primary key, inside `summaryFactsOf`'s one read transaction;
`elidedAttachmentsOf` (`packages/engine/src/run/summary.ts`) counts the distinct pairs and the agents, skipping metadata it
cannot read; `warningLines` writes
`- Mostly-elided artifacts: N (attached artifacts a delegated agent was not given because they did not fit its context budget, across M agents; counted from the timeline's context_selection entries, which name each)`,
and at `0` the same words without the agents. The entry is written by `artifactContext` in
`packages/engine/src/children/orchestration.ts`.

**Why, and what it costs.** The specification names the kind and defines it nowhere (OQ-207): the line as built could
never show a value. This is the one elision a delegating agent chose and a child was promised — an attached artifact is
handed over in full or not at all — and the store already records it, whole, on a timeline no cap trims. What it costs:
"mostly" is read as "wholly"; the line reads `0` in most sessions, since attachments rarely overflow the budget; a continued
session whose latest artifact the handoff cut to 6,000 characters raises no warning; and every save's rebuild reads the
session's `context_selection` entries.

> **Extends:** REQ-SESSION-140

*Ruled under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the ruling of OQ-207.*

> **First execution, 2026-10-07, built by fin28 under [R-072](../requests.md#r-072):** the rule held as written; nothing in the
> text was wrong. **What was measured.** `elidedAttachmentsOf`'s cases (none, one entry with two ids, a retry's second
> entry counted once, two children, malformed metadata skipped) and the Warnings line at `0`, `1` and `3` in
> `run/summary.test.ts`; the read itself, its order and its plan over the primary key in `store.test.ts`; the live run's
> reading in `lib/summary-sections.test.ts`; each red on `d12f1f2`. `sessions-proof`'s seed holds the built app's line to a
> plain `0` naming the `context_selection` entries. **What was not measured.** No built-app or live run delegated with
> attachments that overflowed the 48,000-character budget, so a non-zero line has been seen in unit tests only. **Found on
> the way:** the delegate tool's observation counts attachments before the budget applies, and REQ-TOOLS-152 budgets the
> section at 100,000 characters where REQ-LIBRARY-098 and the build use 48,000
> ([`the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`](../../defects/fixed/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md),
> recorded, not repaired). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Cross-reference, 2026-10-07 ([OQ-221](../../architecture/open-questions.md), under [R-072](../requests.md#r-072)):** no clause
> above changes, so this directive gains no revision. "That block's budget (REQ-LIBRARY-098)" now reads as
> [`PD-TOOLS-006`](pd-tools-006.md#pd-tools-006) revision 5's 100,000-character section and its skip-and-continue rule. The count reads the
> distinct agent-and-artifact pairs whose body did not fit that section after the attachments carried before it; for every
> child whose payload was assembled, those are exactly the ids its delegate observation named as left out for size. The note
> found on the way above is repaired by that revision.

> **Reported back 2026-10-13:** "a non-zero line has been seen in unit tests only" no longer holds for the built app.
> `pnpm artifacts-proof` launch 7 (`attached`, PD-TOOLS-006 revision 5's first execution, 2026-10-07) attached three artifacts
> and a reference, one of them left out for size, and the session's `summary.md` read "Mostly-elided artifacts: 1"
> ([`PD-TOOLS-006`](pd-tools-006.md#pd-tools-006)). The live half stays open: no live run has yet attached artifacts to a delegation. The
> row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
