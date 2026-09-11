# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-11)
- **Depends on:** ADR-0042, ADR-0048
- **Depends on material not available to this record: the approved visual design reference.**

## Context

`REQ-SHELL-160(a)`, `REQ-SHELL-144` and `REQ-SHELL-145`: contrast is settled **from rendered pixels on a
real display**, not from token arithmetic — the label as painted against the background as painted,
after all styling, states and overlays. **A token pair that computes correctly but paints over a
different surface fails.** Thresholds are 4.5:1 for normal text and 3:1 for large text and non-text
boundaries.

`REQ-SHELL-134`, `REQ-SHELL-145` and `REQ-CHAT-027`: derived colours — persona shades, chips, the four
slash-highlight roles — are corrected by **raising perceptual lightness only**: hue and saturation
preserved, adjustment upward only, capped near white, **never by darkening**, until the floor is met. No
two concurrently running instances get the same shade, and the four slash-token colours must all differ
from one another.

`REQ-SHELL-149`, `REQ-NOTIFY-258`, `REQ-CHAT-086` and `REQ-CHAT-027`: **no state by colour alone**,
product-wide — severity by border *plus* glyph, status words beside dots, glyph-distinguished task
states, a control that re-labels rather than only recolouring, keycap chords announced as one accessible
name, the active theme legible as text. Every notice exposes its severity word in its accessible name.

`REQ-SHELL-058`, `REQ-CHAT-007` and `REQ-NOTIFY-008`: any element showing a tooltip exposes that
identical sentence as its accessible description, whether or not it takes focus, with the
platform-formatted shortcut appended where it has one. **No information in the shell is available on
hover alone.** Every disabled control publishes its reason through *both* tooltip and accessible
description.

`REQ-SHELL-135`, `REQ-SHELL-136` and `REQ-NOTIFY-022`: reduced motion resolves in a fixed precedence —
the stored in-app setting, then the operating-system signal where the host publishes one, else motion on
— and is **read at each animation start rather than cached**, so a change takes effect without
relaunch. Under reduced motion, **outcomes are preserved and only travel is removed**; nothing is
suppressed, delayed or reordered.

`REQ-SHELL-130`, `REQ-SHELL-031`, `REQ-SHELL-100` and `REQ-CHAT-058`: a theme change fully recolours
everything, including baked icon inks, native dialog, menu, caret and disabled-text colours, and every
live top-level window, with windows mid-close skipped safely; re-selecting the active theme still
applies fully; and **cell geometry derived from the monospace face is re-measured on theme change** and
the new grid size re-reported to the backend.

`REQ-SHELL-030` and `REQ-SHELL-160(d)`: icon artwork must cover the declared logical size at each device
pixel ratio, verified at five scaling factors and across a drag between monitors of different scale.
`REQ-SHELL-148`, `REQ-SHELL-068` and `REQ-SHELL-160(c)`: focus rings are drawn **wholly within the
control's own bounds**, at the theme's ring width and colour, clearing 3:1 — including on self-painted
navigation controls and divider handles, which take focus and are named.

`REQ-SHELL-129` declares the token groups and the shell metrics; `REQ-SHELL-133` requires each built-in
theme to declare a label and a one-line description. `REQ-UIBENCH-047` requires the benchmark to use the
bundled families and the default built-in theme with **no host-font fallback**.

## Alternatives considered

**A — Style-sheet custom properties only, one sheet per theme.**

*For:* the native mechanism; a theme switch is one attribute change and the whole tree recolours, which
is the requirement for our own surfaces. Cheap, no re-render, works in every window.
*Against:* it puts token **values** in the style sheet, where the runtime cannot read them to perform
the lightness-only correction or the contrast checks, and where the benchmark cannot assert which theme
was applied. It also cannot express the **non-colour declarations** — spacing, radius, size, typography,
motion, elevation, and the declared shell metrics — in a form the layout code can read: the navigation
rail's width, for instance, is derived from the theme **and** must widen when labels do not fit, which
is arithmetic, not styling.

**B — Themes as data, projected to custom properties at apply time.** Each theme is an object declaring
its light/dark flag, its token groups, its declared metrics, its label and its description; applying a
theme computes any derived colours, runs the contrast corrections, and writes the resulting values as
custom properties on every window's root. Chosen.

*For:* the runtime owns the values, so the lightness-only correction is a function over the theme
object; the declared metrics are readable by layout code; a theme's label and description live with it;
the benchmark can assert which theme is in force. A theme switch is still one attribute-and-properties
write, so "no widget retains a colour from the previous palette" holds by construction.
*Against:* two representations to keep in step, and a build-time discipline that **no component may
hard-code a colour**.

## Decision

**Alternative B.**

- **Derived colours are computed, not authored.** One correction function — raise perceptual lightness
  only, preserve hue and saturation, adjust upward only, cap near white — used by persona shades, chips
  and the four slash-highlight roles. Those four **must all differ from one another after correction**,
  so the caller checks pairwise distinctness rather than correcting each in isolation.
- **Contrast is asserted twice, at two different strengths.** A **static** check over the theme objects
  catches the ordinary case cheaply and runs in continuous integration. But `REQ-SHELL-160(a)` is
  explicit that the real criterion is rendered pixels — "a token pair that computes correctly but paints
  over a different surface fails". So the acceptance evidence must be a **screenshot-sampling pass over
  the seven views and every tab page in each built-in theme**, sampling the rendered label against the
  rendered background. **That pass is a deliverable of this record, not an afterthought**:
  `REQ-SHELL-160` says a build that cannot demonstrate all four of its properties does not meet the
  accessibility contract.
- **The engine's own theme source is set from the theme's light/dark flag** and the document's colour
  scheme is set, which is what makes the caret, scrollbars, form controls and menus follow the theme.
  See ADR-0048's open reading for the limits of this on host-owned dialogs.
- **Icons are vector and inherit the current colour.** That satisfies the raster rule trivially — there
  is no raster — satisfies "no stale-theme icon colour survives a switch", and gives the two distinct
  inks for resting and selected rail icons with their 3:1 floor. The multi-monitor and scaling evidence
  is then a **rendering check rather than an asset-inventory check**.
- **Focus rings are drawn inside the control's own bounds** — a negative-offset outline or an inset
  shadow, never an outline that overflows — because no part of the ring may be cut off on self-painted
  controls and divider handles.
- **Reduced motion is a value read at each animation start**, resolved by the stated precedence.
  Concretely: **not a reduced-motion media query alone**, because the stored in-app setting outranks the
  operating system and the system signal must be re-read rather than cached. The resolved value is a
  store field; animations read it when they start.
- **Theme commit is synchronous and flushed** (ADR-0042), and reading a stored theme never writes it
  back, so an unrecognised name degrades to the default with the stored value untouched.

## Consequences accepted

1. **A rendered-pixel contrast harness is real test infrastructure** to build and maintain across three
   platforms and three themes.
2. Every component must take its colours from tokens with no exceptions, which needs a **lint rule
   rather than a convention**.
3. A fourth theme is cheap to add, which is the upside.

## Open question — the design reference

`REQ-SHELL-129` fixes the default theme's shell metrics and token groups and `REQ-SHELL-133` fixes what
each theme's description must convey, **but the palettes themselves are not specified anywhere in
`docs/spec/`.** They come from the approved visual design reference, which was not available to the
architects who produced these proposals. Nothing above depends on the particular values — the mechanism
is what is being decided — but no screen can be built without them. See OQ-30.

## Revisit if

The design reference introduces a token model incompatible with the group structure `REQ-SHELL-129`
declares — in which case the requirement, not the implementation, is what moves.

## First execution — 2026-09-04, the three-theme pixel proof

*Recorded under GD-10; full evidence is `../spikes/theme-proof.md`.*

**Built and run:** theme data and colour mathematics live in `packages/contracts/src/theme/`; every theme
declares the seven groups, its dark flag, label and description. Main reads the persisted choice before window
creation, selects Electron's native theme source and themed window ground, and every live renderer projects the
data to custom properties synchronously. `pnpm theme-proof` ran the built application for all three themes at
five scale factors and every run passed the six adopted acceptance items. A lowered text stop and a sub-3:1
focus colour each made the proof exit non-zero at the expected item.

**Found and corrected:** direct use of three adopted raw values missed the semantic floors: strong borders
reached 1.53–1.92:1, the primary hover label reached 3.98:1, and disabled text reached 2.90:1. The source
transcription remains byte-for-value guarded. Painted roles now use semantic boundary and primary-hover tokens,
and disabled controls use a raised text stop over a neutral themed ground. This preserves the falsified reason
beside its replacement and applies the lightness-only correction decided here.

**Harness findings:** off-viewport Settings elements initially entered the sampler; the composer seam bypassed
React's controlled-value path; programmatic focus failed to establish `:focus-visible`. The corrected proof
uses hit-testing for visibility, the native textarea setter plus input event, and real Tab input events. The
fifteen-run result was green after those repairs.

## The terminal tokens — 2026-09-09 (Part AM)

`REQ-SHELL-098` makes the sixteen ANSI colours theme tokens, and ADR-0047's first execution added them to every
palette as **additions only**: `--rt-term-bg`, `--rt-term-fg`, `--rt-term-cursor`, `--rt-term-selection` and
`--rt-term-{black..white}` / `--rt-term-bright-{black..white}`, twenty per theme, each a direct OKLCH value on the
language's own hues (red on danger 25, green on axis Y 165, yellow on axis X 86, blue and magenta either side of the
accent's 292, cyan on info 210). No adopted key moved; the zero-drift guard in `contracts.test.ts` is unaffected.

**A static check joins the others** in `static-contrast.ts`: every terminal ink clears 4.5:1 on `--rt-term-bg`, black
clears 3:1 (it is a grey, never the ground, and is used as a foreground only over a coloured cell), the cursor
clears 3:1. `assertThemeContrast` runs it for all three palettes; the lowest measured ratio is black at 3.13:1 on
Nocturne's ground.

**The grid resolves tokens at run time**, because the emulator library takes colour strings it can parse and the
tokens are OKLCH text on the document root: `ui/src/terminal/colours.ts` reads the computed custom property and
converts through this package's own colour mathematics (`parseOklch` → `oklchToSrgb` → hex, alpha appended), and
re-resolves on every theme change. No literal colour appears in the grid; `tools/check-theme-colours.mjs` still fails
the lint on one — it caught the proof harness's own window background on the first full check, which was removed.

The rendered-pixel pass this record requires is extended, not replaced: `pnpm terminal-proof` samples the grid's
gutter after a theme switch and compares it to the resolved `--rt-term-bg`. `pnpm theme-proof` was run with the
tokens in place and is red for reasons that predate them — the same run against `main` at `9febbb3` fails the same
items (Workspace view-2 contrast, focus) — which is stated in Part AM's handoff rather than absorbed here.
## Second execution — 2026-09-09 (Part AN), the four slash-highlight roles derived from theme data

*Recorded under GD-10; the proof is `pnpm slash-proof`, evidence under `.slash-proof/`.*

**Built and run.** `REQ-CHAT-027` asks the composer to draw a typed `/name` token in one of three colours and the
argument in a fourth, each taken from a named role of the active theme — the readable accent shade, that shade blended
toward the surface behind it, the `fail` state colour, the secondary text colour — and each then lightened or darkened
until it clears 4.5:1 on the surface it is painted on, with no two rendering the same. `packages/ui/src/slash/highlight.ts`
derives the four from the theme's own tokens (`--rt-accent-300`, `--rt-fail`, `--rt-text-secondary`, against `--rt-bg`,
which is what the design's `.input` paints on), blends in OKLCH (lightness and chroma toward the surface, the accent's
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

## Third execution — 2026-09-11 (Part C″), the four highlight roles measured on all three palettes

*Recorded under GD-10; the proof is `pnpm slash-proof` — its `palettes` and `theme-restart` launches — with evidence
under `.slash-proof/`. Defects are numbered `C2-n`; the manager assigns the ordinals at merge.*

**What was asked, and what the second execution had left.** Wave 1 derived REQ-CHAT-027's four roles from theme data
and measured them on all three palettes in a unit test, but in the BUILT product on `rotaris-dim` alone. A unit test
measures the arithmetic; it does not measure what a window paints. This execution measures the painted pixels on each
of `REQ-SHELL-128`'s three built-in palettes, switching between them with `/theme <name>` — the product's own command,
so the palette under measurement is the one a user would have — and comparing each role with the ground that palette
actually paints.

**How the ground is established, and why no colour is written down.** The composer's painted background is read from
the field and the palette's `--rt-bg` from the document root in the same evaluation, and the two are compared as
colours rather than as text. That comparison is this execution's one harness correction: a computed colour serialises
with a unitless lightness (`oklch(0.21 0 0)`) while a custom property comes back as the theme declared it
(`oklch(21% 0 0)`), so the first run reported the palette's own ground as a mismatch with itself. The proof holds no
literal colour of its own, before or after.

**Measured** (built application, 1264 px, the scripted provider, default scale; ~2.1 GB free with two other agents
building on the same machine; **identical in two consecutive runs**):

| Palette | ground | resolved | partial | unknown | argument |
|---|---|---|---|---|---|
| `rotaris-dim` | `oklch(0.21 0 0)` | 10.193:1 | 4.500:1 | 4.788:1 | 9.483:1 |
| `nocturne` | `oklch(0.14 0 0)` | 11.453:1 | 4.500:1 | 10.521:1 | 11.789:1 |
| `high-contrast` | `oklch(0.08 0 0)` | 15.433:1 | 4.500:1 | 14.249:1 | 16.406:1 |

Every role clears 4.5:1 on every palette; the four render to four different colours on every palette; the weights are
400 for partial and 500 for resolved and unknown throughout, so the states stay tellable apart without colour; and the
three grounds differ from one another, which is what makes this three palettes measured rather than one palette
measured three times. The partial shade sits exactly on the floor in all three — the corrector doing what this record
asks of it, since the blend toward the surface starts below 4.5:1 and is raised to it.

**`/theme` against the real settings.** The three switches are made by the command, not by the harness's theme
environment variable, and the last of them is `high-contrast`: after the launch the desktop preference store's own
document holds `appearance/theme: high-contrast`, and a second launch on that preference root paints `high-contrast`
with the same ground before anything is typed. The setting the command writes is the setting the product reads.

**IC-2, stated and not skipped.** The condition is recorded DISCHARGED (2026-09-04) and all three palettes carry data,
so no palette here was unmeasurable and none was silently passed over. What IC-2's entry still leaves outstanding —
the different-scale multi-monitor drag on the owner's hardware — is not REQ-CHAT-027's, and macOS and Linux remain
IC-3's.

**Found — nothing** in the theme data or in the colour correction. The two reds `pnpm theme-proof` still carries (the
`focus` item over a `<summary>` the harness's control list does not enumerate, and the disabled labels at 2.90:1) were
not reached by this work: the four roles here are drawn only while a slash command is typed, they reach no adopted
token, and neither red is a slash role. They are left as they stand and said so rather than absorbed.
