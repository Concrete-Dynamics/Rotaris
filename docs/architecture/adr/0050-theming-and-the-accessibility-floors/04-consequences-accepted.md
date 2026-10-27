# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Consequences accepted

Part 4 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Consequences accepted

1. **A rendered-pixel contrast harness is real test infrastructure** to build and maintain across three
   platforms and three themes.
2. Every component must take its colours from tokens with no exceptions, which needs a **lint rule
   rather than a convention**.
3. A fourth theme is cheap to add, which is the upside.
