# Design Brief — Rotaris Desktop Interface — 1. The design language

Part 1 of 7 of [the design README](../README.md), which indexes every part.

## 1. The design language

Everything below is in `docs/design/system/`. `styles.css` is the single entry point; it imports
`tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/effects.css`, then
`base.css`, `components.css`, `motif.css`. Token names are normative — cite the token, never a
literal colour or pixel value.

*Read 2026-11-03 ([OQ-499](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-499), ruled under R-072): "cite the token, never a literal colour or pixel value" governs every value written from now on, optical corrections included; §1.5 grants no step below `--rt-space-1`, so a 1 or 2 px nudge is not a value the language has. A literal pixel value stands in two cases only. (a) A requirement fixes the value and the literal cites its identifier; a value a requirement qualifies "in the default theme" is a theme token read from the active theme (REQ-SHELL-129, REQ-SHELL-167), never written. (b) The value is an occurrence `tools/ui-language-baseline.json` already counts. That file is standing debt, not an exception: colour is enforced exactly, the pixel half stands on that baseline, `check-ui-language` refuses both growth and an unlowered baseline, and paying the debt is the work of `build-ui` and `debug-ui`, surface by surface, never added to. A `spacing-token` relation's tolerance is a measurement's slack, not a licence to write a literal. A built-app finding that no token, variant or tolerance draws a surface correctly reopens the question; the clause on the baseline is retired by note when it reaches zero.*

### 1.1 The ground

A true neutral dark grey. OKLCH chroma is exactly `0` on every ground and text token: no hue tint,
never blue-violet, never sepia, never pure black. Ground levels sit five lightness points apart so
panels, cards and hover states stay legibly separate.

| Token | Value | Use |
|---|---|---|
| `--rt-bg` | `oklch(21% 0 0)` | window ground, view background |
| `--rt-surface` | `oklch(25% 0 0)` | cards, dialogs, raised panels |
| `--rt-surface-2` | `oklch(29% 0 0)` | inset tracks, meter grooves, code chips |
| `--rt-chrome` | `oklch(23% 0 0)` | title bar, nav rail, status strip, side panels |
| `--rt-hover` | `oklch(30% 0 0)` | resting hover wash |
| `--rt-overlay` | `oklch(12% 0 0 / 0.72)` | modal backdrop |

Text ramp: `--rt-text` `oklch(94% 0 0)` (primary), `--rt-text-secondary` `80%`,
`--rt-text-tertiary` `68%` (captions, passive metadata), `--rt-text-disabled` `58%` (OQ-56, ruled 2026-09-18; was `52%`).

### 1.2 The accent

One brand accent, violet, OKLCH hue **292**, shipped as a nine-stop ramp `--rt-accent-100` …
`--rt-accent-900`. `--rt-accent` aliases `--rt-accent-500` = `oklch(59% 0.160 292)`.

Selection and active states are **a tint plus accent ink**, never an outlined box and never a filled
block. Three tint strengths exist and no fourth may be invented:
`--rt-accent-tint-07`, `--rt-accent-tint-10`, `--rt-accent-tint-14`.

**Where the imported sheet disagrees with this rule, the rule governs — and it disagrees in one
place.** `system/components.css` line 65 draws `.seg-opt.is-active` with
`background: var(--rt-surface-2)`, a neutral block off the ground ramp rather than one of the three
tints. Found 2026-09-13 by the first visual-critic pass (UIR-005), which measured the product doing
exactly what the sheet says and read it as a violation of this paragraph — correctly. This document
is what **adopts** that sheet, so a sentence here outranks a declaration there; the product draws the
active option as `--rt-accent-tint-14` plus `--rt-accent-200`. The sheet is left as it was imported,
because it is reference material and not a file this repository authors, and this note is how a
reader learns the two differ without having to find it again.

`--rt-accent-300` is the readable accent shade for text and links on the dark ground.
`--rt-accent-200` is link hover.

### 1.3 The three-axis state colours

The brand's coordinate-system flourish is made functional: three axis colours are the product's own
agent lifecycle states. This is the single most load-bearing idea in the language.

| Axis | Hue | Meaning | Ramp | Product alias |
|---|---|---|---|---|
| **X** | amber, ~86 | **waiting** | `--rt-axis-x-100…900` | `--rt-wait` = `--rt-axis-x-500` |
| **Y** | teal, 165 | **running** | `--rt-axis-y-100…900` | `--rt-run` = `--rt-axis-y-500` |
| **Z** | violet, 292 | **done** | `--rt-axis-z-*`, aliasing the accent ramp | `--rt-done` = `--rt-axis-z-500` |

Two colours sit **outside** the triad, deliberately, because they are exceptions rather than
coordinates:

- `--rt-danger-500` `oklch(64% 0.200 25)` — failure, destructive actions. Alias `--rt-fail`.
- `--rt-info-500` `oklch(70% 0.130 210)` — informational, idle.

A second, parallel reading of the same three hues covers connection and provider health, and the two
families are never mixed on one surface: `--rt-ok` (= axis Y, sound), `--rt-warn` (= axis X,
attention), `--rt-fail` (= danger, broken).

Derived families that ride the same triad:

- **Diff.** `--rt-diff-add` / `--rt-diff-add-bg` ride axis Y; `--rt-diff-del` / `--rt-diff-del-bg`
  ride danger; `--rt-diff-meta` rides info. Both washes are at 10 % opacity so code syntax colour
  survives underneath; line numbers never take a wash.
- **Pill fills.** `--rt-fill-accent` / `--rt-fill-x` / `--rt-fill-y` / `--rt-fill-danger`, each a
  ~16–17 % translucent wash of that hue's 500 stop, each carrying its own light ink token
  (`--rt-fill-*-ink`). Softer than the 800 block without going pastel.
- **Data-viz.** `--rt-viz-1` … `--rt-viz-6`, built from the three axes plus hue midpoints, used **in
  order**; `--rt-viz-grid` for chart rules. Never invent a chart colour outside this set.

Colour never carries a fact on its own anywhere in this product (`REQ-SHELL-149`,
`REQ-TRACE-261`, `REQ-NOTIFY-258`). Every state is icon-plus-text or dot-plus-word.

*Read 2026-11-03 ([OQ-501](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-501), ruled under R-072): in "the two families are never mixed on one surface", a surface is one component — a card, a dialog, a panel, the status strip, the delegation tree, one transcript row — as §1.1 and §1.6 use the word, and not the window; two components in one window may each draw a different family. The rule binds inside the component: one that draws a lifecycle state draws it from `--rt-run`, `--rt-wait`, `--rt-done`, `--rt-fail` or `--rt-info-500`, never from `--rt-ok` or `--rt-warn`. Across the window, `REQ-SHELL-149`'s word beside every dot and `REQ-SHELL-036`'s one colour per status word product-wide carry the glance. The agent row's `done` dot on `--rt-ok` is a breach of this reading inside one component (the Overview audit of 2026-11-02, finding 4), executed by `build-ui` as the inventory's `StatusDot`.*

*Read 2026-11-03 ([OQ-536](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-2.md#oq-536), ruled under R-072): the sentence "**Pill fills.** `--rt-fill-accent` / `--rt-fill-x` / `--rt-fill-y` / `--rt-fill-danger`, each a ~16–17 % translucent wash of that hue's 500 stop, each carrying its own light ink token" stands as written, and the axis names are deliberate: a fill is a derived wash of one hue, and both readings of the triad consume it — `.tag-run` and `.tag-wait` for lifecycle, the question stepper's done pill and the answered badge under `--rt-ok` for health, the hooks table's "blocked — not reviewed" under `.tag-wait` for attention. The consumer's class (`.tag-run`, `.tag-wait`, `.tag-done`, `.tag-fail`) and the word beside the wash state the meaning; the fill token does not, and no state-named fill alias is declared. A lifecycle state here is a run's or an agent's status in `REQ-NOTIFY-048`'s vocabulary; a completed question step (`REQ-CHAT-099`, success-filled) and a done task (`REQ-CHAT-086`, success colour) are outcome marks the specification colours by word, outside that bound, and a component may carry one beside lifecycle marks drawn in another. Reopens when a theme gives `--rt-ok` and `--rt-run` different stops, or a requirement names a fill by state.*

*Read 2026-11-03 ([OQ-539](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-3.md#oq-539), ruled under R-072): the sentence "used **in order** … Never invent a chart colour outside this set" governs every `Sparkline`; a chart with a single series strokes `--rt-viz-1`. The `Sparkline` specimen's default stroke `--rt-accent-500` (`system/components/data/Sparkline.jsx`) and the mockup's `--rt-viz-2` overview strip are illustrative, as §1.2 ranks a sentence here over a declaration in the imported sheet and §1.12 reads a specimen card against `tokens/colors.css`; neither governs. The stroke is the shared component's own, never passed by a call site. Both set-aside strokes coincide with `--rt-done` on at least one theme (`--rt-accent-500` on the default, `--rt-accent-300` on `nocturne` and `high-contrast`), which is the harm this reading avoids.*

### 1.4 Type

Three faces, all self-hosted OFL variable fonts declared by `@font-face` in
`tokens/typography.css`. No Google Fonts, no network dependency — the application renders identically
offline.

- `--rt-font-display` — **Space Grotesk**. Headings, view titles, the wordmark.
- `--rt-font-body` — **Manrope**. All body and UI text.
- `--rt-font-mono` — **JetBrains Mono**. Every number, path, identifier, command, hash, branch name,
  token count and diff line. If it is data, it is monospaced.

**Three weights, and only three.** `--rt-weight-body: 400` for body, `--rt-weight-medium` /
`--rt-weight-display: 500` for headings, labels and controls, and `300` for large mono numerals.
Nothing in the system goes above 500. Hierarchy is size, colour and space — never weight.

Sizes: `--rt-text-2xs: 10`, `--rt-text-xs: 11`, `--rt-text-sm: 12`, `--rt-text-base: 14`,
`--rt-text-md: 16`. Headings: `--rt-h6: 11`, `--rt-h5: 16`, `--rt-h4: 20`, `--rt-h3: 24`,
`--rt-h2: 32`, `--rt-h1: 44`.

`h6` is not a heading in the usual sense — it is the **section kicker**: 11 px, weight 500,
uppercase, `--rt-tracking-label` (`0.075em`), painted in `--rt-text-tertiary`. It is also available
as `.card-kicker` and as the `SectionLabel` component, and it is the one exception to sentence case.

Tracking: `--rt-tracking-tight` (`-0.022em`) on display sizes, `--rt-tracking-wide` (`0.05em`),
`--rt-tracking-label` (`0.075em`). Leading: `--rt-leading-tight` `1.12` for headings,
`--rt-leading-body` `1.62` for prose.

*Read 2026-11-03 ([OQ-500](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-500), ruled under R-072): "Hierarchy is size, colour and space — never weight" forbids a ladder of weights above 500 built to rank text; it does not forbid the role split the paragraph states — `--rt-weight-medium` (500) for headings, labels and controls over `--rt-weight-body` (400) for body. A row header, a `Table` header cell and a label take 500 over body at 400 as that role split, never as a fourth weight. A group header in a dense list or `Table` is the section kicker (`h6`, `SectionLabel`, `.card-kicker`). A tool name in a dense row or a log is an identifier and is set in `--rt-font-mono`, separated by colour (§1.9's mono tool names); inside the approval dialog's headline it takes the headline's size tier, as built. Space Grotesk stays confined to headings, view titles and the wordmark, so a dense row carries two faces, Manrope and mono. The reading is held until a `design-ui` or `review-ui` capture shows a header and its rows, or a mono tool name and the prose beside it, each on their declared tokens, that cannot be told apart; that finding, a REQ-CHAT-027 or REQ-CHAT-056 conformance finding that 500 does not read as bold, or the owner's request for a weight above 500 reopens the question.*

### 1.5 Spacing

An **8 px module**: `--rt-space-1: 4` through `--rt-space-24: 96`
(4/8/12/16/20/24/32/40/48/64/96). `--rt-grid-unit: 32px` is the visible module the grid motif is
drawn on and the fade length of every divider — so "grid" is the actual layout discipline, not
only a background pattern.

### 1.6 Radii

`--rt-radius-sm: 5`, `--rt-radius-md: 8`, `--rt-radius-lg: 14`, `--rt-radius-pill: 999`. Every
surface uses one of the three. There are no one-off radii.

### 1.7 Borders and elevation

**Flat by default.** A 1 px hairline defines an edge; a shadow only ever means *this floats*.

- `--rt-border` `oklch(31% 0 0)` — ordinary hairline, sits close in value to the surface it bounds.
- `--rt-border-strong` `oklch(40% 0 0)` — emphasis edges, dot-grid dots, scrollbar thumb.
- `--rt-border-panel` `oklch(28% 0 0)` — structural panel seams.
- `--rt-divider` — `color-mix(in oklch, var(--rt-text) 9%, transparent)`, the faintest rule in the
  system, for row separators and internal rules.
- `--rt-focus` `oklch(83% 0.10 292)` — a 2 px ring is the **only** focus treatment. Never a
  colour-only focus cue.

Shadows: `--rt-shadow-sm` is a 1 px ring and nothing else. `--rt-shadow-md` and `--rt-shadow-lg` add
neutral ambient shadow and are reserved for dialogs, popovers, toasts and the command palette.
Cards at rest carry no shadow.

Forbidden throughout: glow, coloured shadows, inset highlights, bevels, gradient fills,
backdrop-blur or glass, photography, decorative illustration.

Hover is a `color-mix` wash at 7–14 % toward the accent or toward neutral; pressed goes one ramp
step darker. **No scale or shrink effects anywhere.**

**One filled control.** The primary button is the only filled surface in the system; every other
control is a hairline or bare text, so a dense screen carries exactly one accent surface.

*Read 2026-11-03 ([OQ-494](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-494), ruled under R-072): while the OS reports forced colours active, the shell defers to that palette and switches no theme; the operator's stored theme stands. "A 1 px hairline defines an edge; a shadow only ever means this floats" is read as written: the shadow carries the meaning and the hairline the edge, so a surface that carries `--rt-shadow-md` or `--rt-shadow-lg` draws its hairline as a border under forced colours, where the shadow (and the 1 px `--rt-border` ring it opens with) is dropped and a border is recoloured. The width is the hairline's, 1 px; the corpus's 2 px (guide 09, D09-11) is not adopted. The focus ring stays the 2 px outline. Which surfaces float is OQ-513's; REQ-SHELL-160 (b) is read under OQ-29 and is not measured against an OS palette.*

*Read 2026-11-03 ([OQ-503](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-503), ruled under R-072): in "every other control is a hairline or bare text", a control's hairline is its resting edge drawn in the strong boundary the theme measures under REQ-SHELL-145's 3:1 on every boundary background (`--rt-boundary-strong` in the built theme), never the ordinary `--rt-border`; a bare-text control is drawn in the ghost or link variant's accent ink (`--rt-accent-300`), never in neutral body ink. An icon-only control carries one of those two cues, its glyph clears REQ-SHELL-144's 3:1 for non-text content, and it has an accessible name and a tooltip; that ink is the control's under this section, not a meaning under §1.9. A neutral-ink glyph with no edge is not a control's presentation, outside the controls the specification fixes (REQ-SHELL-028 and REQ-SHELL-030 for the rail, REQ-SHELL-035 for the workspace chip, REQ-SHELL-039 for the status strip's links, REQ-CHAT-086 for the todo row's remove control). Flat, no bevels and one filled control are unchanged; an active state stays a tint plus accent ink (§1.2), never an outlined box. A `review-ui` journey walk or a `debug-ui` measurement that finds a control meeting these cues still missed or mis-pressed, or an owner's request for a click study, reopens the question.*

*Read 2026-11-03 ([OQ-504](../../archive/architecture/open-questions/70-spikes-and-later-questions-37.md#oq-504), ruled under R-072): the sentence "a 2 px ring is the **only** focus treatment. Never a colour-only focus cue." holds on every desktop, macOS included (the ring's width is the theme's, 2 px in the default theme, OQ-493). A focused transcript or `Table` row is ringed, not highlighted: REQ-SHELL-160 (c) measures the ring on each supported platform, REQ-SHELL-153 keeps focus apart from selection, and a row tint remains selection (§1.2), so the platform's focused-row highlight would make one tint mean two states. This departs from macOS's convention, and the departure is recorded here; what marks focus under an OS forced-colours palette is OQ-494's. It reopens when IC-3's host exists and a `review-ui` pass finds VoiceOver reporting a focused row without its ring.*

*Read 2026-11-03 ([OQ-513](../../archive/architecture/open-questions/70-spikes-and-later-questions-37-continued-2.md#oq-513), ruled under R-072): the sentence "`--rt-shadow-md` and `--rt-shadow-lg` add neutral ambient shadow and are reserved for dialogs, popovers, toasts and the command palette" stands as written and is read under the headline sentence above it: a shadow means the surface floats, and the list names the kinds of surface that float, not a closed census (the adopted sheet's `.tooltip-bubble` carries `--rt-shadow-md` and is on no list). A surface the specification places above the content floats: the compact overlay drawers of `REQ-SHELL-059` take `--rt-shadow-lg`, as built. A docked pane does not float and carries no shadow. A board card lifted in a drag is drawn by the platform's native drag image, not by the application, so nothing here is drawn for it; the card in its column is a card at rest and carries no shadow; a drag preview the application someday draws itself floats and takes `--rt-shadow-md`, with no scale. Pressed stays one ramp step darker. Nothing in this subsection is amended.*

### 1.8 Motion

Sparse and purposeful. Short distances, decelerating ease, nothing springy.

`--rt-ease` `cubic-bezier(.4,0,.2,1)` for in-place state changes; `--rt-ease-out`
`cubic-bezier(0,0,.2,1)` for entrances; `--rt-ease-in` `cubic-bezier(.4,0,1,1)` for exits.
Durations `--rt-duration-fast` / `--rt-duration` / `--rt-duration-slow` for hover-and-press /
state change / enter-and-exit respectively, and `--rt-shift` as the only entrance distance.

**No animation in conversation content.** Animation belongs to status indicators only. Exactly two
infinite animations are permitted in the whole system: `.status-dot.is-pulsing` (1.6 s opacity
breathe, used only while a state is actively running) and `.spinner` (0.8 s).

Reduced motion is resolved by `REQ-SHELL-135` — an in-app setting first, then an OS signal, then
motion on — read at each animation start rather than cached. The `prefers-reduced-motion` block that
ships in `base.css` implements only the OS leg and is therefore not sufficient on its own.

Three motion figures in the imported material need a decision before implementation:

1. `tokens/effects.css` ships **90 / 160 / 240 ms** and a **3 px** shift.
   `guidelines/motion-tokens.html` documents **100 / 180 / 260 ms** and a **4 px** shift. The two
   disagree in the source material and both are reproduced verbatim. `REQ-NOTIFY-022` fixes the
   default theme's acknowledgement enter at **160 ms** and exit at **120 ms**, which agrees with
   `tokens/effects.css`; that is the recommended tiebreaker, but it is a decision for the
   Architecture Gate, not a silent edit.
2. `REQ-NOTIFY-022` also fixes the acknowledgement travel at **12 px**, which neither shift value
   expresses. The theme needs a distinct acknowledgement-travel token; `--rt-shift` is not it.
3. `base.css` sets `:focus-visible { outline-offset: 2px }`, painting the ring **outside** the
   control's bounds. `REQ-SHELL-148` requires self-painted navigation controls and divider handles
   to draw the ring **entirely within their own bounds**. Those controls need an inset focus
   treatment at the same width and colour.

*Read 2026-11-03 ([OQ-493](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-493), ruled under R-072): note 3, "Those controls need an inset focus treatment at the same width and colour", stands: the ring is inset at the theme's width (`REQ-SHELL-148`, `REQ-SHELL-160` (c)), 2 px in the default theme (`REQ-SHELL-129`), and no WCAG level — SC 2.4.13 among them — is a target of this language or of the contract. A built-in theme other than the default may declare a wider ring under `REQ-SHELL-167` without a ruling.*

*Read 2026-11-03 ([OQ-496](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-496), ruled under R-072): "Animation belongs to status indicators only" governs conversation content, ambient and repeating motion, and every arrangement that carries meaning. The token sentence names the finite uses exhaustively: hover-and-press; the in-place state change of a control (`REQ-SHELL-136`'s toggle knob); and the enter-and-exit of a surface that enters, over `--rt-shift` — an acknowledgement (`REQ-NOTIFY-022`), a notice, a menu panel, a popup, a dialog including the command palette's own surface (`.cmdk`'s `rt-rise`), and an overlay drawer the operator opens (`REQ-SHELL-062`, `-063`). Each reads `REQ-SHELL-135` at its start and is drawn at rest under reduced motion. These take effect in one update and are not animated: rearranged structure (a board card changing column, the graph re-centring per `REQ-TRACE-327`, a re-sorting tree); a pane becoming an overlay drawer or re-docking at `REQ-SHELL-059`'s crossing; the palette's listing as it filters (`REQ-SHELL-052`); a primary view's arrival or first paint; and `REQ-TRACE-318`'s widening, which stands.*

*Read 2026-11-03 ([OQ-497](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-497), ruled under R-072): "read at each animation start rather than cached" is a floor, not a licence. A change in the resolved value, from the in-app setting or from the OS signal where REQ-SHELL-135 consults it, brings every running `.status-dot.is-pulsing` and `.spinner`, and every other marker animated while a state runs, to the rest REQ-SHELL-136 describes when the change happens — the dot at full opacity, the spinner a static arc with no timer running; none waits for a new start, and each starts again without relaunch when motion is resolved on again and its state is still running. The resolved value governs on both legs: a stored choice is read before the OS signal, so the `prefers-reduced-motion` block never stops a pulse against a stored motion-on. A finite transition already in flight completes as built (OQ-496).*

*Read 2026-11-03 ([OQ-502](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-3.md#oq-502), ruled under R-072): "used only while a state is actively running" stands as written and means the same as REQ-MONITOR-297's "actually running", read per the state the dot represents: a run or agent dot represents the lifecycle status of REQ-NOTIFY-048 and pulses while it is {`running`, `starting`} on the session chip (REQ-SHELL-036), a live agent (REQ-MONITOR-040, REQ-MONITOR-052, REQ-SHELL-075), an in-flight check (REQ-CONFIG-348), and on the sessions card the busy states REQ-MONITOR-171 names (REQ-NOTIFY-050). It never marks `paused` and never time elapsed. A run awaiting the operator's answer is still `running`, and its run and agent dots pulse as running; the awaiting condition is carried in words by REQ-MONITOR-175's sentence and REQ-SESSION-155's tag. The one mark that comes to rest for it is the held tool call's own row, whose dot represents the call, not the run (PD-CHAT-013). The pulse marks running, not what needs the operator, and no indicator grows in emphasis with the length of a wait: the duration label is the figure that grows. Reopened by built-app evidence that an operator could not tell an awaiting-input row from a working one with that sentence drawn, or by an owner's request for a growing emphasis, which would need a new token here and a requirement stating its reduced-motion behaviour (REQ-SHELL-135).*

### 1.9 Iconography

**Phosphor icons**, regular and fill weights. No emoji anywhere in product or brand copy, no
unicode-symbol icons, no PNGs.

Icon colour always carries meaning and never decoration, at most one coloured icon per row
(`guidelines/icon-colors.html`):

| Ink | Meaning |
|---|---|
| `--rt-text-secondary` | default — the icon inherits text and has no colour of its own |
| `--rt-text-tertiary` | passive metadata beside dim caption text |
| `--rt-accent-400` | skills and capabilities — the brand's own objects |
| `--rt-info-500` | tool invocations, matching mono tool names in logs |
| `--rt-run` / `--rt-ok` | live activity, healthy connection |
| `--rt-wait` / `--rt-warn` | blocked on input, nearing a limit |
| `--rt-fail` | failures and destructive actions only |
| `--rt-done` | completed lifecycle state |

If an icon is not one of those meanings, it stays neutral.

The system currently loads Phosphor from `unpkg.com/@phosphor-icons/web`. **That must be replaced by
a bundled local copy before implementation.** This is a desktop application that renders offline, and
`REQ-SHELL-139` requires the About page to render with zero network requests.

The mark at `docs/design/assets/rotaris-mark.svg` is final — the primary circle in accent violet with
the X (amber) and Y (teal) axis circles breaking its edge. Use it as-is; never redraw it, never
invent a variant. `REQ-SHELL-034` requires a graceful degradation when it cannot be rendered: a
letter placeholder "R" in a dashed accent frame.

### 1.10 Motif

`.rt-grid-bg` (32 px line grid) and `.rt-dot-grid-bg` (32 px dot grid) appear behind hero sections
and empty states **only** — never under dense data. `.rt-fade-rule` is a rule that dissolves to
transparent over one grid unit at each end rather than stopping cleanly. `.rt-axis-mark` is the
three-stroke coordinate mark: a decorative device, never a stand-in for the logo.

### 1.11 Copy voice

Direct, technical, unadorned. Sentence case everywhere — titles, buttons, nav labels ("New session",
not "New Session") — with the section kicker as the only exception. Second person in product copy and
empty states; first person plural only in brand statements. Numbers exact and monospaced
(`612,480 tok`, never "600K+"). States named plainly (`running`, `waiting`, `done`, `failed`), never
euphemised. No filler: every panel earns its place.

Where the specification fixes a string — an accessible name, a tooltip sentence, an error message,
an empty-state body — the specification's wording wins over the voice guidance. The voice governs
copy the specification leaves to the implementation.

*Read 2026-11-03 ([OQ-493](../../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-2.md#oq-493), ruled under R-072): "Numbers exact and monospaced (`612,480 tok`, never "600K+")" governs the visible text and is unchanged. The abbreviated unit's expansion is the accessible description the specification already owes: `REQ-SHELL-039` and `REQ-SHELL-058` expose a tooltip sentence as the item's description, and `REQ-MONITOR-176` fixes the tokens item's tooltip. The shell's accessibility contract is `REQ-SHELL-144`..`-168` as written; it names no WCAG conformance level, and a success criterion binds only where a requirement or directive restates it (§6.1: the corpus is guidance).*

*Read 2026-11-03 ([OQ-504](../../archive/architecture/open-questions/70-spikes-and-later-questions-37.md#oq-504), ruled under R-072): the sentence "Sentence case everywhere — titles, buttons, nav labels" is one casing on Windows, Linux and macOS. This departs from the title-case convention of macOS and Linux button labels, and the departure is recorded here: the strings the specification fixes (REQ-SHELL-049's labels, REQ-SHELL-051's names among them) are sentence case already and win over the voice guidance by the paragraph above, so a per-platform casing would fork every fixed string rather than vary the voice.*

*Read 2026-11-03 ([OQ-510](../../archive/architecture/open-questions/70-spikes-and-later-questions-37-continued-2.md#oq-510), ruled under R-072): the sentence "States named plainly (`running`, `waiting`, `done`, `failed`), never euphemised." names §1.3's axis meanings, not a vocabulary a surface shows. The run header shows them through REQ-MONITOR-114's mapping (paused→waiting, completed→done); every other surface that shows a run's or session's status shows the members of REQ-NOTIFY-048 (`paused`, `completed` among them); a task, a tool call or a session's tag shows the vocabulary its own requirement fixes (REQ-CHAT-086, REQ-CHAT-060, REQ-SESSION-155). None of these conflict, and none is changed. The same reading confirms the paragraph that follows: `Notice` (REQ-NOTIFY-019) and "Type an action…" (REQ-SHELL-051) are strings the specification fixes, and stand over the glossary's avoided words as its own exceptions.*

*Read 2026-11-03 ([OQ-514](../../archive/architecture/open-questions/70-spikes-and-later-questions-37-continued-2.md#oq-514), ruled under R-072): "Second person in product copy and empty states" reaches every string the application authors — a notice, an acknowledgement, a label, a tooltip, a status-strip value, an empty state, a system row — and no such string speaks in the agent's first person. Agent text — what the model produced, carried by the transcript as the row text of an agent-message row under the agent's own role (REQ-CHAT-046) — is not product copy: this subsection neither governs nor rewrites it, and a hedge the model wrote is the agent's statement, not filler. A product-authored notice about agent output states what the record shows — the observed outcome, its source and, where one applies, a REQ-NOTIFY-044 action — in the product's voice, never a hedge of tone on the agent's behalf; the product holds no measure of the agent's uncertainty to voice.*

*Read 2026-11-03 ([OQ-515](../../archive/architecture/open-questions/70-spikes-and-later-questions-37-continued-2.md#oq-515), ruled under R-072): "Direct, technical, unadorned … No filler" governs first launch, a crash that leaves a session to continue, and a cell the user cleared; none earns warmth, and this subsection is not amended. First launch speaks through REQ-WORKSPACE-152 (3)'s notice, REQ-MONITOR-165's onboarding empty state and the provider sign-in flow, with the grid motif §1.10 already allows and no illustration (§1.7). A crash speaks through the strings the specification fixes (REQ-SHELL-155, REQ-MONITOR-190, REQ-MONITOR-027, REQ-CHAT-004), under the second paragraph above. A cell the user cleared may state, as the reason sentence REQ-NOTIFY-006 requires, that its work is `done`, with the exact count where one exists, so that it reads apart from first use (REQ-NOTIFY-001); as a fact, never a celebration, an exclamation or an illustration, and only where the specification leaves that sentence to the implementation.*

### 1.12 Two wiring notes carried over from the import

- The stylesheets and specimen cards reference `assets/logo.svg` and `assets/fonts/*` relative to
  `docs/design/system/`. In this repository the extracted binaries live in `docs/design/assets/`
  under content-hashed names. Those paths must be re-pointed when the system is wired into a build.
- `guidelines/colors-axis.html` prints slightly different chroma figures for the X and Y 500 stops
  than `tokens/colors.css` carries. **`tokens/colors.css` is authoritative**; the specimen card is
  illustrative.

---
