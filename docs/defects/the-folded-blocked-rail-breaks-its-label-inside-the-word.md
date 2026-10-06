## The folded Blocked rail breaks its label inside the word

Observed 2026-10-06 by the orchestrator's final default live run at origin/main `27a5127` (pack
`2026-10-06T01-30-08-282Z` of the `wt-live` worktree, git-ignored; finding G7 of its autopsy). The pack's
`requirements/requirements.early.png` (window 1264 × 800, the Blocked column shown) has four folded rails, reading
"REVIEW", "NEEDS / UPDATE", "DONE" and "BLOCKE / D": the seven-letter label is split one letter from its end. The same
split is in the `requirements.early.png` of the pack taken at `1763f7f`.

The rail is `calc(8ch + 8px)` wide with 4 px of padding, so its heading has eight `ch` of its own font to fill. The
heading is drawn as a section kicker — `text-transform: uppercase`, `letter-spacing: var(--rt-tracking-label)` (0.075em),
weight 500 — and is `overflow-wrap: anywhere`. Seven capitals of the body face, each wider than the `0` that `ch`
measures and each tracked, are wider than eight `ch`, so the browser breaks the word wherever it runs out. "Backlog" and
"Running", which have seven letters too, break the same way whenever those columns fold.

## Specs

- **REQ-TRACE-310** — the rail is 8 average characters of its own font wide, "that being the width at which the longest
  of the ordinary delivery labels still fits on a single line". The ordinary delivery labels are the six of
  REQ-TRACE-232 (Backlog, Ready, Running, Review, Needs Update, Done); Blocked is the token REQ-TRACE-233 keeps out of
  the delivery stages, and at seven letters it is exactly as long as the longest single-word ones. A seven-letter label
  that does not fit on one line at eight characters contradicts the sentence that fixes the width.
- **REQ-TRACE-309** — a heading too long for the rail wraps onto at most two lines and then elides. "Needs Update" is
  the one delivery label longer than the rail, and it is two words of five and six letters: it wraps at its space onto
  two lines, which is what this requirement provides for. A single word broken mid-way is not that wrap; it is the rail
  failing to hold a label the width was chosen to hold.

## Relevant files

- `packages/ui/src/shell.css` — `.req-rail` (the `8ch + 8px` width and the 4 px padding, line 2302 at `27a5127`) and
  `.req-rail__heading` (uppercase, tracked, `overflow-wrap: anywhere`, line 2305).
- `packages/ui/src/requirements/Column.tsx` — the folded branch renders the label in `.req-rail__heading`.
- `packages/ui-core/src/requirements/display.ts` — `columnLabel`, which spells the tokens as the labels above.
- `apps/desktop/scripts/requirements-proof.mjs` — the `fold` stage, which reads the rail's writing mode and transform
  but not whether its label fits.

Noticed 2026-10-06 by the autopsy of the default live run at `27a5127`.
