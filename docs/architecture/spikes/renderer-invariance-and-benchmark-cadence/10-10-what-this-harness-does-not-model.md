# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 10. What this harness does not model

Part 10 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

## 10. What this harness does not model

- **It is not the product, and its absolute numbers are not the product's.** The mock shell is 629
  structural elements of plain `div`s and `span`s with a hand-written stylesheet. There is no renderer
  framework, no state store, no IPC contract, no theming layer, no accessibility tree, no icon set, no
  bundled fonts, no syntax highlighting, no tool rows, no group headers, no verifier rows, no live-row
  redraw path. Every one of those adds elements per row and work per update. The element counts in §3 are
  a floor, and the timings in §5 are a floor.
- **The counting rules are the harness's operationalisation of two English sentences**, not the product's
  definition of `widgets`. Rule 1 is "carries a `data-s` attribute", which is exactly as arbitrary as
  ADR-0045 says a product-defined rule is. Rule 2 is "computed display not `none`, computed visibility not
  `hidden`, border box non-degenerate", which is one defensible operationalisation of "occupies space in
  the window's layout and can be painted" and not the only one.
- **Empty slots here are laid out with non-zero boxes.** That makes the rule-2 count more stable than an
  implementation that collapsed them would be; §3.3.
- **No forced garbage collection, no memory pressure, no `--expose-gc`.** §4's figures are raw working-set
  readings from `process.memoryUsage().rss` in the renderer process, which on Windows the operating system
  trims for idle processes — as the one anomalous run demonstrates.
- **One machine, one architecture, `devicePixelRatio` 1, two identical 1080 px displays.** Nothing here
  says anything about a high-DPI display, a mixed-DPI arrangement, a display attached or removed at run
  time, macOS, or Linux. §6's answer is a Windows answer.
- **Row heights vary but are modest.** The fixture's bodies are 80–900 characters; a 2,000-line tool
  output or a very wide table would change both the measurement pass and the element counts per row.
- **Three iterations, one fixture, one seed.** The determinism claim in §3.4 is about three fresh
  processes replaying one fixture, not about fixture variety. The cost sweep is 60 repetitions per cell
  on an otherwise busy developer machine; the p95 and max columns carry the scheduling noise that implies.
- **The `streaming_updates` implementation follows `REQ-UIBENCH-057` literally**, including the full
  transcript assignment per prefix step. A product that streamed by appending to the last row instead
  would produce different numbers everywhere.
- **Part 2 measured the settle signal, not the fidelity of the offscreen composite.** It establishes when
  a paint arrives and, in §7.3, whether the delivered frame is current. It does not establish that
  offscreen composite timings resemble onscreen ones — `REQ-UIBENCH-099` already treats every timing as
  comparative for that reason.
- **The offscreen probes ran with hardware acceleration disabled** (as ADR-0053 requires) and the onscreen
  runs with it enabled. The two sets of timings are therefore not directly comparable to each other, and
  no comparison between them is drawn above except where the figures are identical by construction
  (element counts, operation counters).

---
