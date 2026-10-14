## Consortium rulings of 2026-10-14 are dated 2026-10-13, before their questions were raised

The orchestrator's consortium ([R-072](../../product/requests.md#r-072)) sat four times between 2026-10-13 and 2026-10-14 (UTC, as
every date in the record): its sitting on E1 ended at 23:56 on 2026-10-13, and the next two sat on 2026-10-14, one from about
04:30 to 04:58 (HR1, OQ-281, OQ-283, OQ-284, OQ-285, OQ-292 to OQ-295) and one from about 10:00 to 10:14 (OQ-296, OQ-298 to
OQ-302). Seven of the 2026-10-14 rulings are dated 2026-10-13 in the record — OQ-283, OQ-284, OQ-285, OQ-295, OQ-296, OQ-299 and
OQ-300 — each a day before the question itself was raised (OQ-283, OQ-284, OQ-285, OQ-295 and OQ-296 raised 2026-10-14 by fin44,
OQ-296 in `0005d60` at 05:06; OQ-299 and OQ-300 in `67c267a` at 08:19), while the same sittings' other rulings (HR1, OQ-281,
OQ-292 to OQ-294, OQ-298, OQ-301, OQ-302) are dated 2026-10-14.

So the record disagrees with itself. fin45's reviewers found it on two of them (acceptance finding C1 of fin46): OQ-298 is
ruled 2026-10-14 in its entry and in `PD-SHELL-009`'s footer, where fin45's brief said the consortium ruled it 2026-10-13; and
`PD-ORCH-009` revision 5's header and footer pair a ruling date (2026-10-13) with a writing date (2026-10-14), so a reader cannot
tell which the back-pointer's "revision 5, 2026-10-14 (revision 4, 2026-10-14; …)" gives. The same day's error sits in
`PD-ORCH-009` revision 4, `PD-LIBRARY-002` revisions 4 and 5, `PD-LIBRARY-005`, `PD-TOOLS-020`, the back-pointer under
REQ-LIBRARY-124, and fourteen code comments in eleven files citing those rulings. No behaviour depends on it.

Found 2026-10-14 by fin46 (`fin46-accept1-12`) while confirming C1 against the consortium's ruling record (its sittings'
rulings files, held in the orchestrator's scratchpad, outside the repository).

## Specs

- None contradicted in the product. [R-072](../../product/requests.md#r-072): each ruling is written into its question's entry as
  "Ruled <date> under the owner's delegation"; the date is the ruling's.

## Relevant files

- `docs/architecture/open-questions.md` — the ruling paragraphs of OQ-283, OQ-284, OQ-285, OQ-295, OQ-296, OQ-299 and OQ-300,
  and OQ-285's heading ("Ruled 2026-10-13 under R-072, below").
- `docs/product/directives.md` — `PD-ORCH-009` revisions 4 and 5 (headers and footer), `PD-LIBRARY-002` revision 4 (header)
  and revisions 4 and 5 (footer), `PD-LIBRARY-005` and `PD-TOOLS-020` (footers).
- `docs/spec/14-library-artifacts-improvements.md` — the back-pointer under REQ-LIBRARY-124 ("Narrowed by `PD-LIBRARY-005`,
  2026-10-13").
- Code comments citing the rulings as "ruled 2026-10-13": `packages/engine/src/run/supervisor.ts`, `run.ts`,
  `coordinator-plan.test.ts`; `packages/engine/src/children/orchestration.ts`, `children.test.ts`;
  `packages/agent-tools/src/tools/files.ts`, `tools.test.ts`; `apps/desktop/src/run-host/mcp.test.ts`;
  `apps/desktop/scripts/part-h-proof.mjs`, `edits-proof.mjs`, `live-run.mjs`.
- `docs/product/requests.md` — R-072's row carries the same dates; it is the orchestrator's to edit, recorded apart in
  [`../the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md`](../the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md).

## Repaired — 2026-10-14 (fin46, `fin46-accept1-12`)

The date is the consortium's ruling record's: both sittings ruled on 2026-10-14. Each of the seven rulings now reads "Ruled
2026-10-14" in its entry (OQ-285 in its heading too), with a line beside it saying it read 2026-10-13 until fin46 corrected it
from that record and by when that sitting had ruled. In `docs/product/directives.md`, `PD-ORCH-009` revisions 4 and 5 now say
in their headers "ruled by the consortium and written on 2026-10-14", and its footer "ruled … and written, both 2026-10-14",
the footer keeping the words it replaced beside them; so the back-pointer under REQ-ORCH-104 ("revision 5, 2026-10-14 (revision 4,
2026-10-14; revision 3, 2026-10-13)") gives one date per revision, the day it was ruled and written, and needed no change.
`PD-LIBRARY-002` revision 4's header, its revisions 4 and 5 in the footer, and the footers of `PD-LIBRARY-005` and
`PD-TOOLS-020` carry 2026-10-14 with the same note; the back-pointer under REQ-LIBRARY-124 reads 2026-10-14. The fourteen code
comments cite the rulings as "ruled 2026-10-14"; `supervisor.ts` keeps OQ-282's 2026-10-13, which its sitting (E1, ended 23:56)
did fall on. OQ-298 needed no change in the record: its entry and `PD-SHELL-009`'s footer already said 2026-10-14, as the
ruling record does; its entry now says so and names the two places that said 2026-10-13 (fin45's brief, and R-072's row).

Pinned by `tools/open-question-rulings.test.ts`, "no question is ruled before it was raised": it reads every entry of
`open-questions.md` for the first "Raised … <date>" and every "Ruled <date>", and fails on a ruling dated before the raising.
It was red on exactly these seven before the correction (OQ-283, OQ-284, OQ-285 twice, OQ-295, OQ-296, OQ-299, OQ-300) and is
green after; a fixture case pins what it tells apart. What it cannot catch is a ruling dated wrongly on or after the day its
question was raised (the R-072 row's clauses, or a ruling of OQ-301 dated 2026-10-13, would pass it); the ruling record is
outside the repository, so that stays the orchestrator's to check.

Not repaired here: `docs/product/requests.md`'s R-072 row, which is the orchestrator's to edit and still dates ten of these
rulings 2026-10-13 (recorded open in
[`../the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md`](../the-r-072-row-dates-ten-rulings-of-2026-10-14-to-2026-10-13.md)).
