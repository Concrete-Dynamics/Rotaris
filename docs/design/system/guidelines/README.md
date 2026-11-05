# The foundation specimens — twenty cards, one per foundation

The design system's specimen cards: **20 self-contained HTML files** on 2026-11-05, each drawing one foundation or one
brand device from the adopted tokens. They are how the language is *looked at* rather than read —
[`../README.md`](../README.md) states it in prose, `docs/design/system/tokens/*.css` and `components.css` declare it,
and these cards render it.

## What a card is

- **One file, no build step.** Each opens with an `@dsCard` comment naming the group it belongs to, its viewport, its
  name and its subtitle — the metadata a design-tool gallery reads — then links `../styles.css` and draws with the
  same `var(--rt-*)` tokens the product uses. There is no JavaScript and no asset of its own.
- **The card is the specimen, not the specification.** A value here that disagrees with `tokens/*.css` is the card's
  defect, not a second source; the stylesheet governs (`packages/ui/src/design-system/design-system.test.ts` holds the
  components to the adopted sheet the same way).
- **`motion-tokens.html` and `guidelines`' companions in `tokens/` are the one known disagreement**, and it is
  recorded rather than papered over: the card documents 100 / 180 / 260 ms and a 4 px shift while
  `tokens/effects.css` ships 90 / 160 / 240 ms and 3 px. Both are reproduced as the source material had them, and the
  discrepancy needs a decision ([`../README.md`](../README.md), "Scope of this import").
- **The cards are the "how it looks" half of the language; the components are the other.** The specimen cards are the
  only place a token's ramp, scale or spacing module is shown all at once.

## The cards

| Card | Group | What it shows |
|---|---|---|
| [axis-mark.html](axis-mark.html) | Brand | the three-axis circles as one device — ring in accent violet, X and Y breaking its edge |
| [brand-wordmark.html](brand-wordmark.html) | Brand | the wordmark and mark; the icon is interim until a final logo lands |
| [grid-motif.html](grid-motif.html) | Brand | the graph-paper and dot grids — the "grids" half of the mathematical flair |
| [icon-colors.html](icon-colors.html) | Brand | icon colour carries meaning: neutral by default, coloured only for the listed semantics |
| [iconography.html](iconography.html) | Brand | Phosphor icons (regular + fill), the system's icon set |
| [colors-accent.html](colors-accent.html) | Colors | the accent ramp — Z axis / brand, one 100–900 ramp in OKLCH |
| [colors-axis.html](colors-axis.html) | Colors | the coordinate axes X/Y/Z, spoken as the product's own agent states |
| [colors-dataviz.html](colors-dataviz.html) | Colors | the categorical data ramp, from the three axes and their hue midpoints, used in order |
| [colors-neutrals.html](colors-neutrals.html) | Colors | the neutral ramp — ground, chrome and text; never blue-black, never sepia |
| [colors-semantic.html](colors-semantic.html) | Colors | danger and info, outside the three-axis system, for real exceptions |
| [diff-colors.html](diff-colors.html) | Colors | add rides axis Y, remove rides danger — translucent washes, coloured op glyph only |
| [motion.html](motion.html) | Motion | the motion language: decelerating ease-out, ≤ 4 px travel, 100–260 ms, nothing springy |
| [motion-tokens.html](motion-tokens.html) | Motion | the seven values everything animates from — three durations, three easings, one distance |
| [radii-shadows.html](radii-shadows.html) | Spacing | tight consistent rounding, and elevation as a hairline over a neutral ambient shadow |
| [spacing-in-use.html](spacing-in-use.html) | Spacing | a card built entirely on the grid unit — nothing placed off-module |
| [spacing-scale.html](spacing-scale.html) | Spacing | the 8 px base module, the unit the grid motif is drawn on |
| [type-body.html](type-body.html) | Type | body — Manrope, the reading voice of the brand |
| [type-display.html](type-display.html) | Type | display — Space Grotesk, headings at weight 500 |
| [type-mono.html](type-mono.html) | Type | mono — JetBrains Mono for every number, path, model id and log line |
| [type-scale.html](type-scale.html) | Type | the heading scale H1–H6, Space Grotesk over Manrope |

## How they are viewed

The design mockup server opens them with the icon font and the two variable faces resolved —
`pnpm mockup`, then `http://localhost:8791/system/guidelines/<card>.html` ([`../../README.md`](../../README.md) §7
is the obligation that serves it, and `tools/mockup.mjs` supplies what a straight file open lacks).

## Where a new card goes

One file named for the foundation it shows, in the group its `@dsCard` line names — and the group's other cards keep
their names, since a card's file name is how a link reaches it. A card does not introduce a token: it renders ones
`tokens/*.css` declares. The list above is held to the folder by
[`tools/folder-indexes.test.ts`](../../../../tools/folder-indexes.test.ts).
