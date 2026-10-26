# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Decision

Part 3 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

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
