## `theme-proof`'s text-contrast verdict at 150 % depends on ~~the checkout's path, not on the palette~~ where the status strip's layout ahead of an item leaves it: the branch label with its ahead count, and the theme's name

*Corrected in place 2026-09-30 (R-067, the verifier's fix round 1). The first reading is kept struck through beside its
replacement. The file keeps its first name so that the links naming it still hold.*

`pnpm theme-proof --skip-build --theme=rotaris-dim --scale=1.5` fails its contrast section in one worktree and passes in
another on the same product. The failing string is the status strip's `applied 0 · reset 0 · refused 0` item, drawn in
`oklch(0.68 0 0)` at 11 px ~~and elided to a 48 px box~~, measured at **3.05:1** against the 4.5:1 floor. ~~The status strip also
carries the workspace's `svc:` path. That path is the proof's own scratch directory, so its length moves every item after it:
the item sits at x = 1064.8 in `/home/user/Rotaris-crw-wt-compgrnd` and at x = 1025.2 in
`/home/user/Rotaris-crw-wt-compgrnd-base`. `pixels.cjs`'s `textContrast` takes the single pixel farthest from the box's modal
colour as the foreground. At a fractional device-pixel ratio, where a thin glyph stroke lands on the pixel grid decides
whether any pixel reaches the text's own colour, so one phase passes and the other reads a third of the way short.~~

### What the evidence shows instead

**The mechanism.** At 150 % on the 1600 × 1000 Xvfb screen the window is 1066 CSS px wide. The status strip is wider
than that and scrolls horizontally (`.status-strip { overflow-x: auto }` in `packages/ui/src/shell.css`), so its last
items lie past the window's right edge. In a failing capture the `applied · reset · refused` item's box runs from
x = 1064.8 to 1112.8: 1.2 CSS px of it is on screen and the rest is scrolled off.

The proof still measures the item, for two reasons:
- Its `visible()` test clamps the box's centre into the viewport (`x = min(innerWidth − 1, …)`), and the element under
  that clamped point is the item itself.
- `pixels.cjs`'s `textContrast` then clips the box to the image, so it reads **two device-pixel columns** of the first
  glyph's anti-aliased leading edge. Those two columns never reach the text's own colour.

Recomputed from the same capture's pixels, the sliver reads 3.25:1. The same item measured whole in the run's first
capture (x = 1006, 73 columns) reads 6.74:1 on `nocturne` and 5.84:1 on `rotaris-dim`, the same as the strip's other
items.

**What places the item.** Its x depends on everything the strip draws ahead of it:
- **The branch label and its ahead count.** `fix-composer-ground ↑2` is 145.2 px on this branch. A scratch workspace
  outside any repository reads `no git repository`, 112.2 px. A checkout on another branch, or on a detached HEAD, draws
  a label of another width. The scratch workspace sits under the checkout's `.proof/`, so the label it shows is the
  checkout's branch. That is how a change of checkout moved the item.
- **The theme's name.** `Rotaris Dim` is 72.6 px and `Nocturne` is 52.8 px.
- **The `svc:` items.**

The workspace's `svc:` path is an elided, flexible item (`data-elide`, `min-width: var(--rt-space-12)`). While the strip
overflows it stays at its 48 px floor, so the length of the scratch path does not move the item.

**What decides the verdict.** The strip's layout decides whether the item is wholly off screen (not measured), measured
as a sliver (fails), or on screen (passes). The palette's colours are not what fails. The palette is not beside the point
either, because the theme's name is one of the widths that place the item.

### Measurements

Measured 2026-09-29, as root under Xvfb on Linux, Node 24, with other workflows' Electron proofs on the host:
- origin/main `e4aac2b`, built in `…-wt-compgrnd-base`: **PASS** (minimum 3.71:1, no failure).
- The branch `fix-composer-ground`: **FAIL**. It still failed with its one product change (`highlight.ts`) reverted and
  the app rebuilt. The slash colours are painted only while a slash command is typed, and this proof types none.
- ~~The full matrix on the branch: `rotaris-dim` fails at 1.5 (the item above) and at 1.75 (the `svc:` path itself, 4.20:1).
  Every other theme and scale passes.~~ Not reproduced on the branch's final tree (below). The strip that run drew ahead
  of the item cannot be recovered: its `.proof/` evidence was overwritten.

Measured 2026-09-30 on the branch's final build, in the same checkout, with the branch label `fix-composer-ground ↑2`.
This was `pnpm theme-proof --skip-build` over the full matrix, as root under Xvfb on Linux, Node 24, with other
workflows' Electron proofs on the host:
- **Only `nocturne` @ 1.5 fails**: `applied 0 · reset 0 · refused 0` at **3.25:1**, x = 1064.8, with two device-pixel
  columns on screen.
- `rotaris-dim` passes at **every** scale, 1.5 included, with a minimum of 3.71:1. The verifier's run at
  `--output=.proof/theme-proof-dim15`, the path the first reading recorded red, passed too.
  - In the overflowing captures, `Rotaris Dim` is 19.8 px wider than `Nocturne`, so the item starts at x = 1084.6. That
    is wholly off screen, and the item is not measured. (The figure is computed from the `svc:` item before it; an item
    off screen is not in the proof's metadata.)
  - In the first capture the item sits whole at x = 1006 and reads 5.84:1.
- `high-contrast` passes at every scale.
- The same build at 1.5 with `--output` outside any repository passes on both `rotaris-dim` and `nocturne`. There the
  label reads `no git repository`, 33 px shorter, the item starts at x = 1051.6 and x = 1031.8, and it is measured whole
  (minimum 3.71:1 and 4.74:1).

So the same product in the same checkout turns red on one theme or another depending on the branch label.

### Repair

~~Recorded, not repaired.~~ *Repaired 2026-09-30 under R-067 (acceptance finding A53). The outcome is below.*
Noticed while running `theme-proof` for the slash-colour repair (R-067). ~~There are two possible
fixes, and the proof's owner should choose: the proof pins its scratch path's length (or measures the strip with a fixed
path), or `textContrast` reads a glyph's colour so that it does not depend on the subpixel phase.~~ Pinning the scratch
path is not a repair, because the path does not move the item.

Any of three repairs would remove the defect, and the proof's owner should choose:
- **Measure only what is on screen.** `visible()` requires the text's box to lie within the viewport and within its
  scroll container's clip, or the measurement skips a fragment narrower than a glyph.
- **Pin the whole strip ahead of the item.** That means the branch label and the theme's name, not only the path. For
  example, place the scratch workspace outside the checkout's repository.
- **Read a glyph's colour.** `textContrast` reads it so that the result does not depend on how much of the glyph lies
  inside the box.

OQ-56's `--rt-text-disabled` reds are a separate matter, measured on disabled controls.

## Specs

None contradicted by the product. The flaw is in the proof: REQ-SHELL-145 and REQ-SHELL-160 (a) are measured from rendered
pixels, and here the verdict turns on ~~the checkout's directory name~~ a two-pixel sliver of a strip item that the strip
has scrolled past the window's edge, and on how far the branch label and the theme's name push it.

## Relevant files

- `apps/desktop/scripts/pixels.cjs`: `textContrast`, which takes the pixel farthest from the modal colour and clips the
  box to the image.
- `apps/desktop/scripts/theme-proof.mjs`: `METADATA`'s `visible()`, which clamps the box's centre into the viewport and so
  admits a box that is almost wholly off screen. ~~The scratch workspace under the evidence directory, whose path the
  status strip shows.~~ The scratch workspace under the evidence directory, whose enclosing repository gives the strip
  its branch label.
- `apps/desktop/src/renderer/main.tsx`: where the status strip's items are composed, in order: the branch item, the
  theme's label, the `svc:` processes, then the `applied · reset · refused` counters.
- `packages/ui/src/shell.css`: `.status-strip`'s horizontal scroll, and `.status-strip__item[data-elide='1']`'s 48 px
  floor.

## Outcome

Repaired 2026-09-30 under R-067 (acceptance finding A53) by the first of the three repairs: **measure only what is on
screen**. What `visible()` admits is unchanged.
- The page's probe records each admitted text's on-screen part. That part is its box cut by the window and by every
  ancestor that clips along an axis, up to a fixed-position ancestor, which only the window clips.
- `textSample` (`apps/desktop/scripts/lib/text-sample.mjs`) decides what is read. If at least one em of the text is on
  screen along each axis, or all of it where it is shorter than an em, only that part is read. A smaller fragment is
  reported under `skipped`, with its size, and is not measured.
- The page computes the cut with `clipRect`, whose source `theme-proof` injects into the page. The probe and the tests
  therefore run the same code.

Taking the hit test at the on-screen part's centre was tried and dropped. It admitted Settings rows half scrolled out of
their pane, which the clamped centre had excluded. One of them, `grep` in the tools table, read 1.24:1 because its
visible part was the cell's padding. That would have widened what the proof measures, and this repair only narrows
where a text is read.

**Pinned by** `apps/desktop/scripts/lib/text-sample.test.ts`, 14 cases. `clipRect` is checked against the window edge,
a scroll container and a box wholly outside, and its injected source is checked too. `textSample` is checked with the
note's figures: the whole item at x = 1006 is read, and the 1.2 px sliver at x = 1064.8 is skipped. Through
`pixels.cjs`, the sliver read whole-box, as the proof did before, fails 4.5:1 on a synthetic capture, and `textSample`
skips it. A text a scroll container cuts is no longer read against what is painted past the clip.

**Shown by `theme-proof`**, as root under Xvfb on Linux, Node 24, on `fix-accept1-2` (`7ae8072` plus this repair),
with another workflow's live run on the host:
- **Reproduced before the change.** A scratch repository whose branch `theme-proof-sliver1` places the item at the
  window edge was used as `--output`'s parent (`--theme=rotaris-dim --scale=1.5`). The item sat at x = 1064.83 with
  1.17 CSS px on screen. The run **FAILED** its contrast section at **3.05:1**, on that item in 20 captures, with 1,077
  texts tested and none skipped.
- **The same setup after the change: PASS.** The minimum was 3.71:1, with 1,056 texts tested. The 20 skipped are all
  that item, each skipped as "less than a glyph of it is on screen (1.2×15.0 of 48.0×17.8 CSS px)".
- **The full matrix in the worktree: 14 of 15 PASS on the first run**, with contrast minimums of 3.68:1 on `rotaris-dim`,
  4.62:1 on `nocturne` and 5.25:1 on `high-contrast`.
  - `high-contrast` @ 1 failed its contrast section on one incoherent capture (`view-2`), with no ratio under its floor.
    That is the harness's own "the metadata moved across the photograph" failure, and it was taken with the other
    workflow's live run on the host. Re-run alone, it **PASSED** at 5.25:1.
  - The fragments skipped across the matrix are:
    - the strip items at the right edge on `high-contrast` at 1.5, 1.75 and 2 (5.8 to 7.8 CSS px on screen);
    - Settings rows cut vertically by their pane at 1.25 and 1.75 (8.4 to 12.8 CSS px of a 16 to 22.7 px box).
- **The text counterfactual still fails**: `--counterfactual=text` at `rotaris-dim` 1.5 **FAILED**, 1.52:1, 20
  failures.

Not shown: Windows or macOS (IC-3).
