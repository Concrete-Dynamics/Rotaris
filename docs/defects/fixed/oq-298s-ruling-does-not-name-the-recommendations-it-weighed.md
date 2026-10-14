## OQ-298's ruling does not name the recommendations it weighed

[R-072](../../product/requests.md#r-072) writes each consortium ruling into its question's entry as "Ruled <date> under the owner's
delegation", and the ruling "names the two recommendations it weighed". OQ-298's ruling paragraph (a quit that starts outside
any window asks no close guard) names neither advocate's recommendation. It ends instead: "*The two advocates' recommendations
themselves were not handed to the building bundle; the orchestrator's ruling record holds them.*" Its sentence "The ruling
carries both of its recommendations into the record" means the ruling's own two record changes (`PD-SHELL-009` revision 2 and
the `PD-SHELL-010` amendments), not the advocates'. A reader of the entry cannot tell what either advocate argued, whether they
agreed, or which of their points the ruling took.

Found by fin45's reviewer (`fin45-supervision-and-quit`, Task 2), as fin45's builder had said in the entry; acceptance finding
C2 of fin46.

## Specs

- [R-072](../../product/requests.md#r-072): a ruling under the delegation "names the two recommendations it weighed".

## Relevant files

- `docs/architecture/open-questions.md` — OQ-298's ruling paragraph.

## Repaired — 2026-10-14 (fin46, `fin46-accept1-12`)

OQ-298's entry now carries a paragraph, "The recommendations it weighed", written from the consortium's ruling record for its
sitting of 2026-10-14: what advocate A (the user's lens) and advocate B (the system's lens) each recommended — the same outcome,
a quit from outside any window asking no close guard, A in terms of discarding the unsaved settings and B of leaving them
unsaved with nothing written — what each argued and what each named as its cost, the alternatives both rejected (keeping the
wait, a time bound, a save unasked), and what the ruling took from each (from B the wording, the pure function with its unit
case and the `hang` rewrite; from A the log line, the SIGTERM launch and the macOS reopening note). The sentence it replaces is
kept beside it.

Pinned by `tools/open-question-rulings.test.ts`, "every ruling under R-072 names what its two advocates recommended, but the
known gaps": every entry ruled under R-072 names advocate A and advocate B (or the user's and the system's lens), or records
the two as agreeing ("both advocates followed"); "both of its recommendations", which OQ-298 used of its own two record changes,
does not count. It was red on OQ-298 alone before the paragraph (the twenty-one other entries that name no advocate are listed
as known gaps, recorded open in
[`../twenty-one-r-072-rulings-do-not-name-what-the-advocates-recommended.md`](../twenty-one-r-072-rulings-do-not-name-what-the-advocates-recommended.md))
and is green after.
