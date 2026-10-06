## The live run's pack carries no summary.md

`apps/desktop/scripts/live-run.mjs`'s `preserveRun` copies three records of each run-bearing scenario's session into the
evidence pack before the sandbox is deleted: the autopsy's output, the product's own `session.log` (read from
`<store dir>/sessions/<id>/`) and the transcript. The product writes the session's human-readable summary in that same
directory (`${sessionFilesDir}/summary.md`, `packages/engine/src/sessions.ts`), and `preserveRun` leaves it there. The
sandbox goes at the run's end, so the file is lost with it, and nothing in the run reads it first: no check asks whether
the file holds REQ-SESSION-140's sections, in its order.

Found by the autopsy of the final default live run at `c2a9444` (2026-10-06, finding M5). The pack
`.live-run/runs/2026-10-06T17-41-48-175Z/` holds `autopsy.txt`, `session.log` and `transcript.md` per scenario and no
`summary.md` (e.g. `requirements/` lists `app.filtered.log`, `app.log`, `autopsy.txt`, `diff.txt`,
`model-traffic.jsonl`, `node-test.log`, two PNGs, `session.log`, `transcript.md`). fin22 had just repaired the file
(`docs/defects/fixed/summary-md-carries-none-of-the-sections-its-requirement-lists.md`), and that repair had no live
evidence: the autopsy could only rebuild the files from the pack's `workspace.db` by `renderSummary`'s rules, which is how
it found the Tool errors line's undercount (`docs/defects/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md`).

## Specs

None contradicted: this is the harness. It bears on the verification of REQ-SESSION-140 (what `summary.md` contains, in
its order) and REQ-SESSION-002 (the summary is one of the three kinds of file beside a session's record).

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `preserveRun` (copies `session.log`, not `summary.md`) and the EVIDENCE list in
  the header, which names what a scenario directory holds.
- `apps/desktop/scripts/sessions-proof.mjs` — the built-app proof that reads one session's `summary.md` for
  REQ-SESSION-140's order; the live run has no such reading.
- `packages/engine/src/run/summary.ts` — `renderSummary`, the file's sections and their order.
