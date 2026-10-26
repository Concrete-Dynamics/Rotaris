# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — Revisit if

Part 5 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

## Revisit if

A measured recycler cannot hold the 200 ms budget at a thousand-plus rows with Markdown bodies, in which
case alternative B returns — **but only together with a costed plan for the accessibility tree**,
because the selection, keyboard and accessible-name requirements do not bend. **This condition has now
been tested once and did not fire** (consequence 6), against a harness whose timings are explicitly a
floor: no framework, no state store, no theming layer, no syntax highlighting, no tool rows, no live-row
redraw path, and a fixture whose bodies are 80–900 characters. It should be re-run against the real
component before the budget is treated as banked, and a 2,000-line tool output or a very wide table is
the case most likely to move it.

**The clause that stood here — "Or OQ-28 is answered as reading 2, in which case this record is
withdrawn rather than amended" — is withdrawn.** ESC-13 refuses the canvas outright and relaxes
`REQ-UIBENCH-054` instead, so reading 2 no longer removes the only structure that satisfies both sets of
requirements; it removes the requirement that has no satisfiable structure. **A ruling caused this
reversal, not a measurement**, and the measurement that arrived alongside it went the other way —
reading 2's count moves in every run — which is precisely why the ruling mattered.

Two triggers replace it. **If `H_max` is chosen at a value a supported display can exceed**, the growth
branch stops being unreachable and `REQ-UIBENCH-054` acquires a real deviation rather than an
unreachable one. **Or if a settle primitive is adopted that resolves only on visible damage**, in which
case the memory tripwire and the phase timings both stop measuring what they name.

---
