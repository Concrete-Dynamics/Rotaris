# Design Brief — Rotaris Desktop Interface — 2. The adoption rule

Part 2 of 7 of [the design README](../README.md), which indexes every part.

## 2. The adoption rule

> **The design language is adopted. The information architecture is not.**

**Adopted, and authoritative for this product:** tokens, colour, typography, spacing, radii,
elevation, motion, the component inventory, the visual specification of each component, the
iconography rules, the motif, and the copy voice. Everything in section 1 of this document.
`REQ-GIT-152` and `REQ-TRACE-261` are examples of the specification explicitly handing rendered
appearance to the design system; that hand-off is general.

**Not adopted:** which screens exist, what is on them, how they are grouped, what they are called,
what order they appear in, and which tabs a screen carries. Those come from `docs/spec/`.
`REQ-SHELL-023` is the single definition of the primary views and their order. `REQ-SHELL-027` fixes
their labels, `REQ-SHELL-049` their shortcuts, `REQ-CONFIG-268` and `REQ-CONFIG-269` the Settings
categories, `REQ-LIBRARY-103` the Library tabs, `REQ-TRACE-232` the board columns.

**Why.** The design language was designed fresh for this product. The screen structure in the design
material was derived from a different product's requirements documentation, outside the clean-room
process that produced `docs/spec/`. Reading it was not a boundary breach — it is not reference
source, and it is not sealed material — but building this product's structure from it would put an
un-cleared derivation into the product's information architecture, where the specification already
holds a cleared one. Where the two disagree, the specification governs, without exception and without
negotiation.

**How to read `docs/design/mockup/rotaris-ui-mockup.dc.html`.** It is a reference for *how the
language is used*: density, composition, how a transcript row is actually drawn, how an agent list
row balances a status dot against a context ring, how a settings pane arranges its fields, how much
air a card gets. Its sample requirement identifiers have already been renamed onto this project's
convention. Read it for craft. Do not read it for structure, and do not treat any screen in it as a
statement that such a screen exists.

The design system's own `NavRail` component was stripped of its built-in view list for exactly this
reason: it takes its items from the caller, and the caller takes them from `REQ-SHELL-023`.

---
