# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — Consequences accepted

Part 4 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## Consequences accepted

1. We own the input path, the wheel arithmetic, the selection extraction and the encoder, and **we must
   keep them from drifting back to library defaults during upgrades.** A test that asserts an unmapped
   key transmits nothing is the cheapest guard.
2. The persona window is a separate renderer running its own display emulator over the same frames. That
   is ADR-0021's decision and its cost — a golden-stream equality test is the evidence for
   `REQ-SHELL-102`.
3. The pop-out and the persona window have **deliberately different lifecycles** — rebuild versus hide —
   and must not be unified.
4. The wheel's fractional-remainder accumulation is a stateful detail that is easy to lose in a
   refactor; it is specified and it needs a test with sub-notch deltas.
