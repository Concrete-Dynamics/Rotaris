## R-072 rulings that do not name what the advocates recommended

## Repaired — 2026-10-15 (fin47, `fin47-record-and-windows-reading`)

Each of the twenty-two entries now carries a paragraph "**The recommendations it weighed**", placed after its R-072 ruling
paragraph in `docs/architecture/open-questions.md`, written from the consortium's ruling record (the orchestrator's rulings file,
`advocateA` and `advocateB` per question): advocate A (the user's lens) and advocate B (the system's lens) each named with the
kind of ruling they recommended and their recommendation quoted in one line, then what the ruling took from each as that record
says (both followed for twenty-one; advocate B's alone for OQ-271). Where an entry said the recommendations were "not handed to
the building bundle" (OQ-311, OQ-312) or "in the orchestrator's ruling record, not copied here" (OQ-265, OQ-266), that sentence
now points at the paragraph and keeps its old reading beside it.

Pinned by `tools/open-question-rulings.test.ts`, "every ruling under R-072 names what its two advocates recommended":
`UNNAMED_RECOMMENDATIONS` is now empty, so the test fails on any entry ruled under R-072 that names neither advocate. With the
list emptied and before the paragraphs, it was red on exactly these twenty-two (OQ-262 to OQ-312 as listed below); after, green.


[R-072](../../product/requests.md#r-072) requires each consortium ruling written into its question's entry to name "the two
recommendations it weighed". Most entries do: "advocate B's recommendation followed … with one point of advocate A's folded
in" (OQ-297), "both advocates' recommendations followed" (OQ-302), or the two positions set out. Twenty-two entries ruled
under R-072 since 2026-10-13 name neither advocate and say nothing of what was recommended: OQ-262, OQ-265, OQ-266, OQ-267,
OQ-271, OQ-272, OQ-279, OQ-280, OQ-281, OQ-282 (the consortium's E1), OQ-283, OQ-284, OQ-285, OQ-292, OQ-293, OQ-294,
OQ-295, OQ-296, OQ-299, OQ-300, OQ-311 and OQ-312 (OQ-312 joined the list when its ruling landed on `main` beside this
note: it says the advocates' recommendations "were not handed to the building bundle", as OQ-298's did). The consortium's ruling record (each sitting's rulings file, in the orchestrator's
scratchpad, outside the repository) holds both advocates' positions for every one of them.

Noticed 2026-10-14 by fin46 (`fin46-accept1-12`) while repairing the same fault in OQ-298 (acceptance finding C2), which was
the only one an acceptance round had named; outside that task, so recorded and not repaired.
`tools/open-question-rulings.test.ts` lists these as known gaps, fails on any other R-072 ruling that names no
advocate, and fails on a listed entry once it names them, so the list shrinks as each is repaired.

## Specs

- [R-072](../../product/requests.md#r-072): a ruling under the delegation "names the two recommendations it weighed".

## Relevant files

- `docs/architecture/open-questions.md` — the ruling paragraphs of the entries listed above.
- `tools/open-question-rulings.test.ts` — `UNNAMED_RECOMMENDATIONS`, the known gaps this note lists.
