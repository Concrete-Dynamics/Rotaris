<!-- schema:
## <defect name>
<concise defect description>
## Specs
<how it contradicts the specs or which one it violates (if any)>
## Relevant files
<list of relevant files with small explanation>
-->

A repaired note is **moved** to `fixed/` (`CLAUDE.md`, "Defects noticed along the way"), and every relative link in
the record that named it at its old path moves with it, in the same commit — the note's own links move too, since
one more `../` now sits between it and what it cites. [`tools/check-record-links.mjs`](../../tools/check-record-links.mjs)
runs in `pnpm lint` and fails on a link left behind, naming the file, the line and the target — and on a
`docs/defects/….md` path in the code (`apps/`, `packages/`, `tools/`) that names no note, so a comment or a proof that
cites a note moves with it too. Such a path is written whole, on one line: the pass fails one a comment wraps across
lines or abbreviates with `…`, since it cannot tell where that one points.
