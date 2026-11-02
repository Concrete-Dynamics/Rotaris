## The pool's capacity assumes no row is shorter than 30 px, and PD-CHAT-003 draws rows shorter than that

`POOL_CAPACITY` (`packages/ui/src/transcript/constants.ts`) is `ceil(H_MAX / ROW_MIN_HEIGHT) + OVERSCAN` — 144 slots for
the 4,320 px declared maximum viewport, plus 10, so 154 — and `visibleRange` (`packages/ui/src/transcript/pool.ts`) says a
span wider than the pool "cannot happen while the viewport is inside `H_MAX` (REQ-CHAT-057's 30 px floor bounds the span
by the capacity)". PD-CHAT-003 lifted that floor from the row's box: a row sizes to its content, and the directive's own
text says "real rows may be shorter".

**Measured, 2026-09-30.** A planted transcript of every row kind, read in the built app at a 740 px viewport (slot
heights, which carry the gap above each row): a one-line **system notice inside a block** draws **23.8 px** — `.row`'s
4 px margin, a 1 px border either side and one 17.82 px line of `--rt-text-xs`. Every other one-line row measured draws
30 px or more: an agent message inside a block 33.4 px (its Markdown paragraph keeps an 8 px margin), a user message 41.4
px, a system notice starting a block 31.8 px, a collapsed reasoning row starting a block 33.4 px. So the rows shorter than
the unit are system notices after the first of a run of them — REQ-CHAT-057's attribution rule makes consecutive notices
one block.

**What follows, computed from that figure and not measured at such a viewport** (this host's display is 1,000 px tall).
`visibleRange` binds the visible rows plus `OVERSCAN` above and below, and clamps `last` to `first + capacity - 1`, so a
span of more than 154 rows is cut at the bottom. At the tail, where nothing lies below, that is more than 144 visible
rows — a viewport taller than about 144 × 23.8 ≈ 3,430 px of such notices; scrolled into the middle of them, more than
134 — about 3,190 px. Both are inside `H_MAX`, where the growth branch (`capacityFor`) is never taken, and the rows past
the clamp are not drawn: blank space at the bottom of the transcript. A portrait 4K panel at a scale factor of 1 is such
a viewport; a run of 134 or more consecutive one-line notices is what fills it.

The constant's own comment calls 30 px PD-CHAT-003's "conservative unit" for the slot arithmetic; for capacity, a unit
LARGER than the shortest row is the opposite of conservative. Noticed 2026-09-29 while repairing
`fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`; recorded, not repaired.

**Corrected 2026-09-30, kept beside its replacement:** this note first rested on "a one-line row inside a block is
`.row`'s 4 px margin, a 1 px border either side and one line (19.5 px at `--rt-text-sm` and a 1.5 line height): about
25.5 px — computed, not measured", and a threshold of 144 × 25.5 ≈ 3,670 px. The built app contradicted the row it named:
a one-line agent message inside a block draws 33.4 px, above the unit. The figures above replace it, measured.

## Specs

REQ-CHAT-165 ("The desktop MUST keep the whole conversation readable") is what an unbound span at the bottom of the
viewport contradicts. The cause is where two records meet: ADR-0045's capacity rule (`ceil(H_max / 30 px)` plus overscan,
growth only above `H_MAX`) was derived from REQ-CHAT-057's 30 px minimum row height, which PD-CHAT-003 narrows off the
row's box. Whether the capacity unit or the growth condition moves is ADR-0045's to decide, not settled here.

## Relevant files

- `packages/ui/src/transcript/constants.ts` — `ROW_MIN_HEIGHT`, `POOL_CAPACITY`, `capacityFor`.
- `packages/ui/src/transcript/pool.ts` — `visibleRange`'s clamp and the comment that says it cannot bind.
- `packages/ui/src/shell.css` — `.row`'s 4 px margin, `.row--block-start`'s 12 px and `.row--system .row__body`'s `--rt-text-xs`, which set a one-line notice's height.
- `docs/architecture/adr/0045-what-paints-the-transcript.md` — the capacity rule.

## Outcome

**Repaired 2026-10-01 under R-067** (acceptance finding A38). The capacity unit moved, not the growth condition: ADR-0045's
rule is the declared maximum viewport over the minimum row height, and PD-CHAT-003 moved the minimum. `SHORTEST_ROW_HEIGHT`
(`packages/ui/src/transcript/constants.ts`) is the shortest a row can draw whatever it carries — `.row`'s 4 px top margin,
its 1 px border either side and REQ-CHAT-057's continuation bar at its 14 px `min-height`, 20 px (the first row of a block
carries 12 px above it and a role line instead, so it is taller) — and `POOL_CAPACITY` and `capacityFor` count in it:
`ceil(4320 / 20) + 10`, **226 slots**, fixed for the life of the window as before; the growth branch still opens only above
`H_MAX`. `ROW_MIN_HEIGHT` stays 30 px as the estimate's floor, which is what PD-CHAT-003's cost paragraph also calls it.
And `visibleRange` (`pool.ts`) now sheds the overscan — below, then above — before it cuts a visible row: a viewport `H`
tall shows up to `ceil(H / h) + 1` rows of height `h`, one partly at each edge, one more than the rule counts, and the old
rail cut that one first. Both falsified comments ("REQ-CHAT-057's 30 px floor bounds the span by the capacity", "At
REQ-CHAT-057's 30 px minimum row height that is 144 slots") are kept beside their replacements.

**Pinned by** `transcript.test.ts`: "REQ-CHAT-165 / PD-CHAT-003: inside H_MAX the pool binds every visible row, however
short a row PD-CHAT-003 draws" (23.8 px and 20 px rows at viewports of 900 to 4,320 px, at the tail and in the middle —
red on the code before: 23.8 px rows at 3,430 px bound rows 1845..1998 with row 1999 on screen); "PD-CHAT-003: the
capacity unit is no taller than the shortest row the stylesheet can draw", which reads the three figures from `shell.css`
and fails if a stylesheet change makes a row shorter than the unit; and the visible-span case's two new expectations
(the overscan gives way before a visible row), red on the code before.

**Shown in the built app** by `transcript-proof`'s new stage 3c, `capacity` (`--only=capacity`, under
`xvfb-run -s "-screen 0 1600x4400x24"`, as root, Node 24): 400 planted one-line system notices, the window resized to
1440x4300, so a 3,890 px transcript viewport of 23.8 px rows — 164 on screen. **On the code before**, the same stage went
red: a 154-slot pool binding 144 of the 164 rows on screen (and 10 of overscan above), the last bound `row:379` of 400 while the pane followed the tail, and the viewport
blank from 3,414.5 px to 3,890 px — what this note had computed and not measured, now measured. **On the repair**, green:
226 slots, 174 bound at the tail and 184 in the middle, the bound slots covering the viewport from 0 to 3,890 px with no
gap at both, the last notice bound at the tail.

**A host that cannot ask it** (fix round 1, 2026-10-01): Xvfb with no window manager does not clamp the window to its
screen, so the stage asks its question under the standard `-screen 0 1600x1000x24` as well (window 4,300, viewport 3,890,
green); a desktop whose window manager clamps the window below 4,300 px could not, and the stage now records itself NOT
ASKED there, with the height the host allowed, and the proof's verdict names it, instead of failing its own guard and
stopping the proof before the append comparison.

**Not shown:** a real portrait panel (the tall viewport is Xvfb's), Windows or macOS fonts (the 23.8 px is this host's
line height; the 20 px floor is the stylesheet's and does not depend on a font), and the growth branch above `H_MAX`,
which this repair does not touch.
