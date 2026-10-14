## Twenty-one R-072 rulings do not name what the advocates recommended

[R-072](../product/requests.md#r-072) requires each consortium ruling written into its question's entry to name "the two
recommendations it weighed". Most entries do: "advocate B's recommendation followed … with one point of advocate A's folded
in" (OQ-297), "both advocates' recommendations followed" (OQ-302), or the two positions set out. Twenty-one entries ruled
under R-072 since 2026-10-13 name neither advocate and say nothing of what was recommended: OQ-262, OQ-265, OQ-266, OQ-267,
OQ-271, OQ-272, OQ-279, OQ-280, OQ-281, OQ-282 (the consortium's E1), OQ-283, OQ-284, OQ-285, OQ-292, OQ-293, OQ-294,
OQ-295, OQ-296, OQ-299, OQ-300 and OQ-311. The consortium's ruling record (each sitting's rulings file, in the orchestrator's
scratchpad, outside the repository) holds both advocates' positions for every one of them.

Noticed 2026-10-14 by fin46 (`fin46-accept1-12`) while repairing the same fault in OQ-298 (acceptance finding C2), which was
the only one an acceptance round had named; outside that task, so recorded and not repaired.
`tools/open-question-rulings.test.ts` lists these twenty-one as known gaps, fails on any other R-072 ruling that names no
advocate, and fails on a listed entry once it names them, so the list shrinks as each is repaired.

## Specs

- [R-072](../product/requests.md#r-072): a ruling under the delegation "names the two recommendations it weighed".

## Relevant files

- `docs/architecture/open-questions.md` — the ruling paragraphs of the twenty-one entries listed above.
- `tools/open-question-rulings.test.ts` — `UNNAMED_RECOMMENDATIONS`, the known gaps this note lists.
