---
req-id: SWR-3703
status: approved
trace: required
type: technical
derived-from: SWR-3700
title: "Typography ships with the application"
epic: SWR-2000
date: 2026-08-20
---

# SWR-3703 — Typography ships with the application

The design system pairs three faces — Space Grotesk for display, Manrope for
body and UI, JetBrains Mono for every number, path and line of code — and
self-hosts all three so that a consuming surface renders identically offline.
Rotaris named Inter and Cascadia Mono in a stylesheet and hoped the machine had
them. On a Linux desktop it usually does not, and Qt then silently substitutes:
the interface renders in whatever the fallback is, and a terminal painted on a
fixed grid gets a proportional face and spaces every glyph apart.

Rotaris shall ship the faces its type tokens depend on, and shall not depend on
a face it did not ship.

**Which faces the interface is set in is a product decision, not a token
decision.** The brand display/body pair was applied across the desktop and
rejected in review: at the sizes this interface actually uses — ten- and
eleven-pixel chips, dense table rows, a nav rail — it was not readable enough to
work in. The shipped palettes therefore name the host's own UI face, which is
the one the platform hinted for those sizes. What the design system contributes
to type here is the *system* — the size ramp, the weight roles, the tracking,
the tabular figures — which is the part that outlives any one face. A weight
token names a role, and the number filling it belongs to the face in use: 500
against Manrope and 500 against a grotesque like Segoe UI are not the same
colour of text on the page.

- The faces are **bundled as application assets** and registered with Qt at
  startup, before the first window is constructed. All three stay bundled: the
  brand pair so a future palette can name it without gambling on the host, and
  because under Qt's `offscreen` platform there are **no** host families at all,
  so an unregistered face means test and screenshot renders with no text in
  them.
- Registration is **not load-bearing for launch**: a face that fails to
  register is reported and the interface falls back down its stack. Rotaris
  starts either way.
- Type tokens name **stacks, not single families**, and the same faces are
  available as ordered family lists for code that has to *measure* text — a
  stylesheet's `font-family` never reaches `QWidget.fontMetrics()`, so eliding
  and terminal-cell sizing would otherwise measure against the wrong face.
- The faces are **variable**, so weight is a token value rather than a separate
  file per weight.
- Type properties Qt's stylesheet accepts and then ignores — letter spacing and
  tabular figures — are applied as font settings instead, so a label the design
  system tracks out is actually tracked out and a number that ticks upward does
  not make the row beside it dance.
- The bundled faces are **carried into the frozen build**, so a packaged Rotaris
  looks like a run-from-source Rotaris.
- Each bundled face ships with its licence.
- A type stack is **host-first, and cannot run out**: it asks for the faces the
  user's platform knows, and behind all of them names one that is bundled, so no
  stack can exhaust its options and let Qt resolve to a face nobody chose. A
  generic (`sans-serif`, `monospace`) sits alongside that floor for a desktop
  that maps generics well, but a generic is a request rather than a guarantee,
  and the terminal grid depends on the answer.

## Acceptance criteria

- The three faces are present as application assets with their licences.
- No shipped palette sets the interface in the rejected brand display/body pair;
  re-adopting it is a decision, not an accidental edit to one palette line.
- Font registration runs before the first window is built, and reports which
  families it registered.
- A registration failure leaves the application running with the fallback stack.
- Type tokens expose both a stylesheet stack and an ordered family list, and the
  two agree — the painted face and the measured face cannot drift apart, and a
  family whose name contains a space reaches the stylesheet quoted.
- The last family a stack names is a bundled one, and it sits after the host's
  own faces so that no machine with fonts of its own ever reaches it.
- A label declaring tracking or tabular figures carries them on its font, not
  only in its stylesheet.
- The packaging spec includes the font assets, and the frozen application
  resolves them.

## Test coverage

Unit tests assert the asset files exist with their licences, that the registrar
reports the expected families, and that a failed registration degrades instead of
raising. One test per shipped palette asserts none of them names the rejected
brand pair, and one asserts every stylesheet stack is derived from the same
family list the code measures with. A font-metrics test asserts that a tracked label and a tabular number
differ measurably from the untracked default, which is the only way to catch the
QSS properties Qt accepts and discards. The packaging test asserts the assets are
listed as frozen data.

Derived from: [SWR-3700 — Themeable design-token layer](SWR-3700-themeable-design-token-layer.md)

Related: [SWR-2429 — Terminal emulator widget](SWR-2429-terminal-emulator-widget.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
