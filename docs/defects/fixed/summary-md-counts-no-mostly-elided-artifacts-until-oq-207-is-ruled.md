## summary.md counts no mostly-elided artifacts until OQ-207 is ruled

REQ-SESSION-140's Warnings section covers "mostly-elided artifacts" beside stale-input drops, report downgrades,
permission denials, tool errors and the terminal's outcomes. Every other kind it names is built: the Warnings section
`renderSummary` writes since fin22 has one line per kind (`warningLines` in `packages/engine/src/run/summary.ts`). This
one has no count. No requirement says what eliding an artifact is, what share of it makes it "mostly" elided, or which
record would count one, so the line reads
`- Mostly-elided artifacts: n/a (no record measures how much of an artifact was elided)`. That is REQ-SESSION-140's
rule for an unavailable value (`n/a`, never `0`), and it is the reading
[OQ-207](../../architecture/open-questions.md) records the build as proceeding under.

The rest of the requirement was repaired by fin22 in
[`summary-md-carries-none-of-the-sections-its-requirement-lists.md`](summary-md-carries-none-of-the-sections-its-requirement-lists.md).
This note keeps the one gap open until the question is ruled: either the warning is defined and a record counts it, or it
is withdrawn from the requirement.

Split out 2026-10-06 by fin22's repair round 1, at its verifier's finding that the raised question left this kind unbuilt
while the whole note had moved to `fixed/`.

## Specs

REQ-SESSION-140 (the Warnings section's "mostly-elided artifacts"), with REQ-SESSION-139 and REQ-SESSION-133 (the
metrics and the record kinds a count would come from). Open under OQ-207 until 2026-10-07; since then `PD-SESSION-002`,
which extends REQ-SESSION-140.

## Relevant files

- `packages/engine/src/run/summary.ts` — `warningLines`, the line that reads `n/a`.
- `packages/engine/src/export.ts` — `sessionMetrics`, where a count would join the metrics document's figures.
- `docs/architecture/open-questions.md` — OQ-207, the question and the reading the build proceeds under.
- `packages/store/src/dal.ts` — `elidedAttachmentRowsOf`, the read the count is taken over (since the repair).

## Outcome

Repaired 2026-10-07 by fin28 (bundle `fin28-session-records`), on OQ-207's ruling under the owner's delegation
([R-072](../../product/requests.md#r-072)), which followed advocate A and minted
[`PD-SESSION-002`](../../product/directives.md#pd-session-002): a mostly-elided artifact is an artifact a delegating agent
attached to a delegated agent that the agent's `PRIOR AGENT CONTEXT (FULL)` block left out because it did not fit its budget
(REQ-LIBRARY-098), each agent-and-artifact pair counted once, from the timeline's `context_selection` entries. The line now
reads `- Mostly-elided artifacts: N (attached artifacts a delegated agent was not given because they did not fit its context
budget, across M agents; counted from the timeline's context_selection entries, which name each)`, and a plain `0` with the
same words where nothing was left out, never `n/a`. `StoreDal.elidedAttachmentRowsOf` reads each entry's `task_id` and
`attached_elided` over the timeline's primary key inside `summaryFactsOf`'s one read transaction; `elidedAttachmentsOf`
counts the distinct pairs; `warningLines` writes the line.

Pinned by `packages/engine/src/run/summary.test.ts` (the line at `0`, `1` and `3`; `elidedAttachmentsOf`'s cases: none, one
entry, a retry's second entry counted once, two children, malformed metadata skipped; `summaryFactsOf` over a real store),
`packages/store/src/store.test.ts` (the read, its order and its plan) and `apps/desktop/scripts/lib/summary-sections.test.ts`
(the live run's reading refuses the `n/a` line) — seven cases, each red on `d12f1f2` — and by `sessions-proof`'s seed, whose
built app's `summary.md` must read the plain `0` naming the `context_selection` entries.
