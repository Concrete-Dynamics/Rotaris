<!-- schema:
## <defect name>
<concise defect description>
## Specs
<how it contradicts the specs or which one it violates (if any)>
## Relevant files
<list of relevant files with small explanation>
-->

A repaired note is **moved** to `fixed/` (`AGENTS.md`, "Defects noticed along the way"), and every relative link in
the record that named it at its old path moves with it, in the same commit — the note's own links move too, since
one more `../` now sits between it and what it cites. [`tools/check-record-links.mjs`](../../tools/check-record-links.mjs)
runs in `pnpm lint` and fails on a link left behind, naming the file, the line and the target — and on a
`docs/defects/….md` path in the code (`apps/`, `packages/`, `tools/`) that names no note, so a comment or a proof that
cites a note moves with it too. Such a path is written whole, on one line: the pass fails one a comment wraps across
lines or abbreviates with `…`, since it cannot tell where that one points.

A `docs/defects/….md` path written as inline code in the record's prose is a pointer too, and so is one written relative
to its own file (`../defects/fixed/….md`, `../../defects/….md`), resolved from that file's directory; the same check
fails one that names no note. A path kept on purpose as history (a repaired note saying where a note stood when it was written, a
struck-through passage) stays as written and is marked on its own line by an HTML comment naming it exactly,
`<!-- historical-path: <the path> -->`, which does not render; the check fails a mark that keeps no path on its line, or
keeps one a note is at. `docs/product/requests.md` is the orchestrator's to edit and is not read by this pass.

**Closing a note that was never reproduced** ([OQ-278](../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-278), ruled 2026-10-13 under
[R-072](../product/requests.md#r-072)). A note whose cause was never found may close unreproduced only when all of these hold:
(a) its investigations are recorded in the note; (b) a check that FAILS on recurrence runs in the acceptance round (the live
run or a proof), not a NOTE; (c) that check has executed at least once, with its instrument shown working; (d) the note moves
to `fixed/` with a first section headed "Outcome: not reproduced, not repaired; closed under a guard (OQ-278)", which names the
guard and says the cause is unidentified; and (e) a recurrence opens a new note that cites the closed one, rather than reopening
it. Such a close is not a repair and is never reported as one.
