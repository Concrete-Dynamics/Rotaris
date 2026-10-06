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

## Repaired — 2026-10-06

The rail's heading is set in the rail's own font: sentence case and untracked, keeping weight 500, the two-line clamp,
`overflow: hidden` and `overflow-wrap: anywhere` (`.req-rail__heading` in `packages/ui/src/shell.css`). The kicker is
the one exception to sentence case in the adopted language (`docs/design/README.md` §1.4), and a rail's label is a
control's text, not a section kicker; eight characters of the rail's own font are what REQ-TRACE-310 sized it to
hold, so the text has to be set in that font. A second, smaller cause turned up in the measurement: the rail is a
border-box button, so its two hairlines came out of the eight characters (49 px of content in a 58.9 px rail). The
width is now `calc(8ch + 8px + 2 * var(--rt-hairline-width))`, which leaves the heading exactly eight `ch`.

The reading the repair takes, from REQ-TRACE-309/310: the ordinary delivery labels are REQ-TRACE-232's six; "Needs
Update" is the one longer than the rail and wraps at its space onto two lines, which REQ-TRACE-309 provides for; every
one-word label, Blocked included, sits on one line. The design material's board (`docs/design/mockup/rotaris-ui-mockup.dc.html`) draws no
folded or collapsed column, so the adopted language alone decides the craft.

Pinned by:

- `packages/ui/src/layout-regression.test.ts` — "sets a folded rail's heading so a seven-letter label fits the
  eight-character rail on one line (REQ-TRACE-310, REQ-TRACE-309)": the rail's width and margin, and a heading with no
  `text-transform: uppercase` and no `letter-spacing` that still clamps to two lines and wraps (red before the repair on
  the uppercase rule);
- `apps/desktop/scripts/requirements-proof.mjs`, `fold` stage — every closed-vocabulary label set in turn into the
  folded Done rail's heading on the built app, its line boxes read: no word broken inside itself, a one-word label on
  one line, a two-word label on at most two, no sideways overflow. Red before the repair: `the folded rail breaks
  "Backlog" inside ["Backlog"] at 58.9 px (text-transform uppercase, letter-spacing 0.75px; … "lines":2 …)`. Green
  after it at a 60.9 px rail: Backlog 40 px, Ready 31, Running 41, Review 36, Done 26, Blocked 39 — each one line —
  and Needs Update two lines of at most 51 px, none broken (load average 4.5 on 4 CPUs beside the other two bundles'
  agents; the measurement is geometry, not timing).

`pnpm ui-audit --views=4` after the repair: 0 findings at both sizes. It does not fold a column (its workspace holds
no requirement), so it moved no number here; the proof's measurement is the one that moved.
