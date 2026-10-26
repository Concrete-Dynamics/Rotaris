# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Alternatives considered

Part 2 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

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
