# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Context

Part 1 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

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
