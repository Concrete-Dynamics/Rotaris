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
