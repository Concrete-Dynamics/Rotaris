# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Sixth execution — 2026-09-30 (R-067), `theme-proof` reads a text only where it is on screen

Part 13 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Sixth execution — 2026-09-30 (R-067), `theme-proof` reads a text only where it is on screen

REQ-SHELL-160 (a) measures contrast from the pixels painted behind a rendered label. The proof had been reading pixels
the label does not paint. It read a text's whole box even where the window or a scroll container cut the text off. The
status strip scrolls past the window's right edge at 150 %, and its last item could be admitted with 1.2 px on screen
and read as its first glyph's anti-aliased edge (the fifth execution's `theme-proof` paragraph). Acceptance finding A53
reopened that note, and it is repaired in the proof, not in the palette:
- The probe records each admitted text's on-screen part: its box cut by the window and by every ancestor that clips
  it.
- `apps/desktop/scripts/lib/text-sample.mjs` reads only that part.
- A fragment under one em along either axis is reported as skipped, with its size, and is not measured.
- `visible()`'s admission is unchanged. A hit test at the on-screen part's centre was tried and dropped, because it
  admitted Settings rows half scrolled out of their pane and read one as its padding (1.24:1).
- An admitted text with no part on screen keeps its record, and `textSample` reports it skipped ("no part of it is on
  screen"). The first form dropped it inside the probe, so it was neither measured nor counted; since the verifier's
  fix round 1 every admitted text is counted, measured or skipped.

**Coverage boundary.** The cut is conservative, so it can hide a text from the proof but cannot fail one falsely:
- `clipsOf` cuts a text by every ancestor that clips, up to a fixed-position ancestor. An absolutely positioned
  descendant whose containing block lies outside a clipping ancestor (a popover inside a scroller) is not clipped by
  that ancestor in the page, but the probe cuts it anyway. Such a text is read in part, or skipped with its size; it is
  never read against pixels that are not its own. Its loss of coverage shows only as a skip line.
- The one-em rule skips any fragment under the font size. At high device-pixel ratios that is stricter than needed:
  7.8 CSS px at a ratio of 2 can hold a whole glyph. At 150 % and above, whether the status strip's trailing items are
  measured depends on where the strip's layout leaves them, and so on the branch label. In the builder's matrix the
  last item on `high-contrast` lay 5.8 to 7.8 CSS px inside the window at 150 %, 175 % and 200 % and was skipped. In
  the fix round's matrix it lay 1.2 CSS px inside at 150 % (skipped), and at 175 % the `svc:` item before it was the
  1.2 px sliver (skipped). So the strip's trailing strings are covered with certainty only at 100 % and 125 %, where
  they are on screen whole on every theme.
- The one-em rule also skips rows that a pane cuts vertically with most of their glyphs showing. It compares the shown
  height of the text's box with the font size, and the box is the line box, not the glyphs. At 125 % on every theme,
  Settings' "Compression threshold", "Iteration cap" and their units "%" and "iterations" (14 px, line box 22.7 px) are
  cut by their pane at 12.8 of 22.7 CSS px, from below. If the leading is split evenly, the em box starts about 4.3 px
  into the line box, so what shows is roughly the upper 8.5 px of the 14 px em box. All four are skipped. At 175 %, "No
  hooks are declared." is skipped the same way at 11.8 of 22.7 px. A threshold below one em for the vertical axis alone,
  such as cap height, would keep these rows measured. It is not taken here. How much of the glyphs a cut leaves depends
  on where it falls against the baseline and the leading, and the probe measures neither. A height threshold on the line
  box cannot ensure a whole stroke. The loss is recorded, row by row, rather than closed by a guess.

**Measured**, as root under Xvfb on Linux, Node 24:
- **Before the change: FAIL.** With the item placed at x = 1064.83 by a scratch repository's branch label, `rotaris-dim`
  at 150 % read 3.05:1 on that item.
- **After the change: PASS.** The same setup gave a minimum of 3.71:1, with that item skipped in each of its 20
  captures.
- **The full matrix: 14 of 15 PASS on the builder's first run.** Its minimums at 100 % were 3.68:1 on `rotaris-dim`,
  4.62:1 on `nocturne` and 5.25:1 on `high-contrast`. `high-contrast` at 100 % failed on one incoherent capture with
  another workflow's live run on the host, and passed re-run alone.
- **The full matrix after the verifier's fix round 1: 15 of 15 PASS in one run**, with no incoherent capture. The
  lowest ratios at any scale were 3.07:1 on `rotaris-dim`, 4.08:1 on `nocturne` and 4.92:1 on `high-contrast`, all at
  125 %; the first two are on texts whose floor is 3:1. The skips were the strip's 1.2 px slivers and texts cut
  vertically by the pane that scrolls them (Settings rows, a tools list). No admitted text had no part on screen.
- **The full matrix after origin/main merged into the branch: 15 of 15 PASS, twice** (after `6f80d5f`, and again after
  `8574828`). The lowest ratios were 3.68:1 on `rotaris-dim` and 4.62:1 on `nocturne`, both at 100 %, and 4.92:1 (then
  5.57:1) on `high-contrast`. The skips were the ones the coverage boundary above names: the strip's trailing item, 7.8
  or 5.8 CSS px on screen at 150 % and above, and the Settings rows cut vertically at 125 % and 175 %. The second run
  also skipped "Session checkpoints" (10 px, 9.1 of a 16.2 px line box) in one `rotaris-dim` capture at 150 %, a
  vertical cut of the same kind.
- **The text counterfactual stays red**, at 1.52:1.
- **`discovered` is not comparable between runs.** It is the number of admitted texts summed over a cell's captures, and
  it varies between runs of the same build. `rotaris-dim` at 100 % counted 1384 in one run and 1263 in another, as the
  verification of `8f79daf` reported them, and 1264 and then 1376 in the two merged-branch runs. Nothing in this
  execution explains the variation. So two matrices are compared by verdict, minimum and the skips named, not by count.

The palette is unchanged, and OQ-56's disabled-text question is untouched. The repaired note is
`../../../defects/fixed/theme-proofs-text-contrast-verdict-depends-on-the-checkouts-path.md`. Not shown: Windows or macOS
(IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*).
