# ADR-0050 — Theming, design tokens, and how the accessibility floors are enforced — First execution — 2026-09-04, the three-theme pixel proof

Part 7 of 14 of [ADR-0050](../0050-theming-and-the-accessibility-floors.md), which indexes every part.

## First execution — 2026-09-04, the three-theme pixel proof

*Recorded under GD-10; full evidence is `../spikes/theme-proof.md`.*

**Built and run:** theme data and colour mathematics live in `packages/contracts/src/theme/`; every theme
declares the seven groups, its dark flag, label and description. Main reads the persisted choice before window
creation, selects Electron's native theme source and themed window ground, and every live renderer projects the
data to custom properties synchronously. `pnpm theme-proof` ran the built application for all three themes at
five scale factors and every run passed the six adopted acceptance items. A lowered text stop and a sub-3:1
focus colour each made the proof exit non-zero at the expected item.

**Found and corrected:** direct use of three adopted raw values missed the semantic floors: strong borders
reached 1.53–1.92:1, the primary hover label reached 3.98:1, and disabled text reached 2.90:1. The source
transcription remains byte-for-value guarded. Painted roles now use semantic boundary and primary-hover tokens,
and disabled controls use a raised text stop over a neutral themed ground. This preserves the falsified reason
beside its replacement and applies the lightness-only correction decided here.

**Harness findings:** off-viewport Settings elements initially entered the sampler; the composer seam bypassed
React's controlled-value path; programmatic focus failed to establish `:focus-visible`. The corrected proof
uses hit-testing for visibility, the native textarea setter plus input event, and real Tab input events. The
fifteen-run result was green after those repairs.
