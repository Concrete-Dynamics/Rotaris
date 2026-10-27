# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — Open question — the design reference

Part 5 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## Open question — the design reference

> **Closed, 2026-09-14, under A1 of the accepted specification review.** The paragraph below was
> written while the design material was believed missing; `docs/design/` has existed since 2026-09-01,
> and the two themes this paragraph says cannot be built were built and pixel-proven on 2026-09-04 —
> see this record's first execution, below, and `../spikes/theme-proof.md`. OQ-30 closed with that
> proof. The paragraph is kept so the record shows what was believed and when it stopped being true.

`REQ-SHELL-129` fixes the default theme's shell metrics and token groups and `REQ-SHELL-133` fixes what
each theme's description must convey, **but the palettes themselves are not specified anywhere in
`docs/spec/`.** They come from the approved visual design reference, which was not available to the
architects who produced these proposals. Nothing above depends on the particular values — the mechanism
is what is being decided — but no screen can be built without them. See OQ-30.
