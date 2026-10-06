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
  of the ordinary delivery labels still fits on a single line". The ordinary delivery labels are the one-word ones:
  Backlog, Ready, Running, Review and Done of REQ-TRACE-232, and Blocked, the one-word label of the condition column
  REQ-TRACE-233 keeps on the delivery axis; the longest of them are seven letters (Backlog, Running, Blocked). A
  seven-letter label that does not fit on one line at eight characters contradicts the sentence that fixes the width.
  "Ordinary" restricts the set, and "Needs Update" is the label it leaves out: read as all six of REQ-TRACE-232, the
  sentence would say that a twelve-character, two-word label fits on one line at eight average characters, which no
  proportional font does, so the clause would be false of the vocabulary it was written about. Whether Blocked counts
  as a delivery label or not changes nothing here: it is no longer than the longest one-word stage.
- **REQ-TRACE-309** — a heading too long for the rail wraps onto at most two lines and then elides, its complete text
  kept on the rail's tooltip and accessible name. "Needs Update" is that heading on the delivery axis, the one label
  longer than the rail: two words of five and six letters, it wraps at its space onto two lines, which is what this
  requirement provides for. A single word broken mid-way is not that wrap; it is the rail failing to hold a label the
  width was chosen to hold.

## Relevant files

- `packages/ui/src/shell.css` — `.req-rail` (the `8ch + 8px` width and the 4 px padding, line 2302 at `27a5127`) and
  `.req-rail__heading` (uppercase, tracked, `overflow-wrap: anywhere`, line 2305).
- `packages/ui/src/requirements/Column.tsx` — the folded branch renders the label in `.req-rail__heading`.
- `packages/ui-core/src/requirements/display.ts` — `columnLabel`, which spells the tokens as the labels above.
- `apps/desktop/scripts/requirements-proof.mjs` — the `fold` stage, which reads the rail's writing mode and transform
  but not whether its label fits.

Noticed 2026-10-06 by the autopsy of the default live run at `27a5127`.

## Repaired — 2026-10-06

The rail's heading is set in the rail's own font: sentence case and untracked, keeping weight 500, the two-line clamp,
`overflow: hidden` and `overflow-wrap: anywhere` (`.req-rail__heading` in `packages/ui/src/shell.css`). REQ-TRACE-310
measures the rail in average characters of its own font, and the kicker's paint (`docs/design/README.md` §1.4:
uppercase, `--rt-tracking-label`) is exactly what makes a word wider than that font's characters, so on the rail it is
dropped. A second, smaller cause turned up in the measurement: the rail is a border-box button, so its two hairlines
came out of the eight characters (49 px of content in a 58.9 px rail). The width is now
`calc(8ch + 8px + 2 * var(--rt-hairline-width))`, which leaves the heading exactly eight `ch`.

The reading the repair takes, from REQ-TRACE-309/310 (the Specs section gives the reasons): the ordinary delivery labels
are the one-word labels, the longest seven letters, and each of them, Blocked included, sits on one line; "Needs
Update" is REQ-TRACE-309's heading too long for the rail and wraps at its space onto at most two lines. No open question
was raised: this is the one reading under which REQ-TRACE-310's own reason holds of the labels it names.

The open column keeps its heading as a kicker (`card-kicker` in `packages/ui/src/requirements/Column.tsx`), so the same
column reads "DONE" open and "Done" folded. REQ-TRACE-308 asks the rail for "the heading and count that the open column
would show", and it shows them: both render the one string `columnLabel` returns, and the rail's accessible name and
tooltip carry it verbatim. `text-transform` changes no character of the text, the accessible name or the tooltip; it is
the paint of the open column's 276 to 340 px header, which has the room for it, and the rail's eight characters do not.
The design material's board (`docs/design/mockup/rotaris-ui-mockup.dc.html`) draws no folded or collapsed column, so the
adopted language alone decides the craft.

Pinned by:

- `packages/ui/src/layout-regression.test.ts` — "sets a folded rail's heading so a seven-letter label fits the
  eight-character rail on one line (REQ-TRACE-310, REQ-TRACE-309)": the rail's width and margin, and a heading with no
  `text-transform: uppercase` and no `letter-spacing` that still clamps to two lines and wraps (red before the repair on
  the uppercase rule);
- `apps/desktop/scripts/requirements-proof.mjs`, `fold` stage — every closed-vocabulary label set in turn into the
  folded Done rail's heading on the built app, its line boxes read: no word broken inside itself, a one-word label on
  one line, a two-word label on at most two, its widest line inside the rail's content box. Red before the repair: `the folded rail breaks
  "Backlog" inside ["Backlog"] at 58.9 px (text-transform uppercase, letter-spacing 0.75px; … "lines":2 …)`. Green
  after it at a 60.9 px rail whose content box is 51 px: Backlog 39.5 px, Ready 31, Running 41, Review 35.7, Done
  26.3, Blocked 39.2 — each one line — and Needs Update two lines, the wider 36.2 px, none broken (re-run by the repair
  round on 2026-10-06 at load average 15.4 falling to 9.3 on 4 CPUs beside the other bundles' agents; the measurement is
  geometry, not timing).

`pnpm ui-audit --views=4` after the repair: 0 findings at both sizes. It does not fold a column (its workspace holds
no requirement), so it moved no number here; the proof's measurement is the one that moved.

**The sideways assertion shown red (fin21, 2026-10-06, a verifier's finding).** The `fold` stage's last check, each
label's widest line box within the rail's content box, had never been seen to fail. In a scratch build (not committed)
`.req-rail`'s width was narrowed from `calc(8ch + 8px + 2 * var(--rt-hairline-width))` to `5ch`, and the heading's
`overflow-wrap: anywhere` set to `normal`, so a word too wide for the rail overflows sideways on one line rather than
breaking (with `anywhere` kept, the narrowed rail breaks the word, and the stage's earlier "breaks inside" check is the one
that fires). `pnpm build`, then `requirements-proof.mjs --skip-build` as root under Xvfb, Node 24, load 9.0 to 10.4 on 4
CPUs with another plan's agents on the host (the measurement is geometry, not timing): the proof stopped at
`REQ-TRACE-310: "Backlog" is 39.5 px wide in a rail whose content box is 32 px ({"label":"Backlog","lines":1,"broken":[],"widest":39.5})`.
The CSS was then restored and the app rebuilt.
