## summary.md counts no mostly-elided artifacts until OQ-205 is ruled

REQ-SESSION-140's Warnings section covers "mostly-elided artifacts" beside stale-input drops, report downgrades,
permission denials, tool errors and the terminal's outcomes. Every other kind it names is built: the Warnings section
`renderSummary` writes since fin22 has one line per kind (`warningLines` in `packages/engine/src/run/summary.ts`). This
one has no count. No requirement says what eliding an artifact is, what share of it makes it "mostly" elided, or which
record would count one, so the line reads
`- Mostly-elided artifacts: n/a (no record measures how much of an artifact was elided)`. That is REQ-SESSION-140's
rule for an unavailable value (`n/a`, never `0`), and it is the reading
[OQ-205](../architecture/open-questions.md) records the build as proceeding under.

The rest of the requirement was repaired by fin22 in
[`summary-md-carries-none-of-the-sections-its-requirement-lists.md`](fixed/summary-md-carries-none-of-the-sections-its-requirement-lists.md).
This note keeps the one gap open until the question is ruled: either the warning is defined and a record counts it, or it
is withdrawn from the requirement.

Split out 2026-10-06 by fin22's repair round 1, at its verifier's finding that the raised question left this kind unbuilt
while the whole note had moved to `fixed/`.

## Specs

REQ-SESSION-140 (the Warnings section's "mostly-elided artifacts"), with REQ-SESSION-139 and REQ-SESSION-133 (the
metrics and the record kinds a count would come from). Open under OQ-205.

## Relevant files

- `packages/engine/src/run/summary.ts` — `warningLines`, the line that reads `n/a`.
- `packages/engine/src/export.ts` — `sessionMetrics`, where a count would join the metrics document's figures.
- `docs/architecture/open-questions.md` — OQ-205, the question and the reading the build proceeds under.
