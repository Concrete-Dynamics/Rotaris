# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Second execution — 2026-09-09 (Part AN), the four slash-highlight roles derived from theme data

Part 9 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Second execution — 2026-09-09 (Part AN), the four slash-highlight roles derived from theme data

*Recorded under GD-10; the proof is `pnpm slash-proof`, evidence under `.slash-proof/`.*

**Built and run.** `REQ-CHAT-027` asks the composer to draw a typed `/name` token in one of three colours and the
argument in a fourth, each taken from a named role of the active theme — the readable accent shade, that shade blended
toward the surface behind it, the `fail` state colour, the secondary text colour — and each then lightened or darkened
until it clears 4.5:1 on the surface it is painted on, with no two rendering the same. `packages/ui/src/slash/highlight.ts`
derives the four from the theme's own tokens (`--rt-accent-300`, `--rt-fail`, `--rt-text-secondary`, ~~against `--rt-bg`,
which is what the design's `.input` paints on~~ against `--rt-bg`, which is what the design's `.input` paints on — **falsified
by the composer dock of 2026-09-18**, whose field is transparent on `--rt-surface`; since 2026-09-29 the four are derived
against the dock's ground, `COMPOSER_GROUND` — see the fifth execution), blends in OKLCH (lightness and chroma toward the surface, the accent's
hue kept), corrects with this record's lightness-only correction — `raiseLightness` on a dark theme and its mirror on
a light one — and steps the partial shade away from any coincidence. A unit test measures all three built-in themes;
the proof measured the painted colours in the built application on the default theme: resolved `oklch(83% 0.1 292)`
at 10.19:1, partial `oklch(60.404% 0.05 292)` at 4.50:1, unknown `oklch(64% 0.2 25)` at 4.79:1, the argument
`oklch(80% 0 0)` at 9.48:1, all on `oklch(21% 0 0)`. Two of the four needed no correction; the blend did — a 50 %
blend of the accent toward the ground sits at 3.0:1 and is raised to 60.4 % lightness.

**Defect fifty-six — the corrector can stop a hair short of the floor it was asked for.** `raiseLightness` bisects
lightness until the ratio clears the floor and then rounds the result to a thousandth of a percent; the rounding can
fall on the dark side, and did: the default theme's partial shade came back at **4.49997:1**, which
`themeContrastViolations`' own tolerance of one millionth would report as a violation. No adopted token is affected,
because none of them is corrected to exactly the floor — the theme proof's corrections all overshoot by more than the
rounding — which is why the first execution above did not see it. It is a defect of the corrector, not of the
highlight, and the corrector is `packages/contracts/src/theme/colour.ts`; the highlight module settles the returned
lightness one hundred-thousandth of a percent further from the surface until the measured ratio clears the floor.
**Repaired at the source the same day, ruled into the plan:** `raiseLightness` now measures the rounded value again and
steps it up by a thousandth of a percent until the ratio it names is the ratio it clears (a `// Part AN` hunk beside
the rounding, with the 4.49997 case as a regression test in `contracts.test.ts`); the highlight's settle step stays as a
guard and takes zero steps on the repaired corrector. The adopted tokens are untouched — the zero-drift guard measures
data, not the corrector — and `pnpm theme-proof` was re-run against the repaired corrector and, in the same hour, against
HEAD with this change stashed: the same fifteen reds on both, `focus` on every run, the two disabled Mission labels at 2.90
on every `rotaris-dim` scale (the finding `codebase.md` records under Part AI), and unsettled-frame ratios of 1.0 that sit
at different scales in any two runs of the same tree — none of them this corrector's, which reaches no painted token.

**A reading that turned out wrong.** The proof assumed Chromium would report a computed colour as `rgb()`; it reports
a custom-property colour in the form the token declares it, `oklch(L C H)` with a unitless lightness, so the proof
carries the same CSS Color 4 conversion this record's `colour.ts` carries and measures the painted ratio from that.
