# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase

- **Date:** 2026-08-31
- **Questions:**
  1. ADR-0045 paints the transcript from a fixed pool of recycled row slots allocated at window
     construction, because `REQ-UIBENCH-054` requires the count of live paintable elements to be
     invariant after construction. Does the count actually hold through the seven phases of
     `REQ-UIBENCH-053` — under **both** of the counting rules OQ-28 leaves open? Does the tail-phase
     memory tripwire of `REQ-UIBENCH-087` hold? Is update cost independent of total row count against
     `REQ-CHAT-055`'s budget? And is "the largest viewport the window can reach" knowable at
     construction time on Windows?
  2. ADR-0053 drives an **offscreen** window through those seven phases and closes each phase's timing
     on a paint event (`REQ-UIBENCH-051`, `REQ-UIBENCH-119`). Does that paint event correspond to
     layout settling, or does the settle time out?
- **Scope:** measurement only. No product code was written and none is authorised. Everything below was
  produced by a throwaway harness in the session scratchpad; nothing was written into this repository
  except this document.
- **Bearing on OQ-28:** this spike reports the two counts **separately and does not choose between
  them.** Section 3 gives what each reading costs. The choice remains the product owner's.

---

## Parts

Since 2026-10-26 the rest of this document is in [`renderer-invariance-and-benchmark-cadence/`](renderer-invariance-and-benchmark-cadence/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](renderer-invariance-and-benchmark-cadence/01-1-environment.md) | 1. Environment |
| [02](renderer-invariance-and-benchmark-cadence/02-2-method.md) | 2. Method; 2.1 What the harness is; 2.2 Fixture; 2.3 The seven phases, implemented from the requirement text; 2.4 The two element counts, measured separately; 2.5 Two scroll variants, because the two give different answers; 2.6 Runs actually taken |
| [03](renderer-invariance-and-benchmark-cadence/03-3-results-part-1a-is-the-element-count-invariant.md) | 3. Results — Part 1a: is the element count invariant?; 3.1 Rule 1 — invariant, in every run, at every point measured; 3.2 Rule 2 — not invariant, in any run, under either variant; 3.3 What each reading costs — stated, not resolved; 3.4 Incidental: determinism and cache bounds |
| [04](renderer-invariance-and-benchmark-cadence/04-4-results-part-1b-the-tail-phase-memory-tripwire.md) | 4. Results — Part 1b: the tail-phase memory tripwire |
| [05](renderer-invariance-and-benchmark-cadence/05-5-results-part-1c-update-cost-at-1000-plus-rows.md) | 5. Results — Part 1c: update cost at 1,000-plus rows with real Markdown bodies |
| [06](renderer-invariance-and-benchmark-cadence/06-6-results-part-1d-is-the-reachable-viewport.md) | 6. Results — Part 1d: is the reachable viewport knowable at construction? |
| [07](renderer-invariance-and-benchmark-cadence/07-7-results-part-2-the-offscreen-paint-cadence.md) | 7. Results — Part 2: the offscreen paint cadence; 7.1 The paint event fires at the requested rate — but only where there is damage; 7.2 Driven through the seven phases, the settle times out — on exactly the phases with no damage; 7.3 `invalidate()` forces a paint, and that paint carries the previous frame; 7.4 What does work offscreen: `requestAnimationFrame`; 7.5 Control: the paint event does not exist for an onscreen window |
| [08](renderer-invariance-and-benchmark-cadence/08-8-secondary-finding-the-interface-lag-invariant.md) | 8. Secondary finding — the interface-lag invariant and how a phase is driven |
| [09](renderer-invariance-and-benchmark-cadence/09-9-verdicts.md) | 9. Verdicts |
| [10](renderer-invariance-and-benchmark-cadence/10-10-what-this-harness-does-not-model.md) | 10. What this harness does not model |
| [11](renderer-invariance-and-benchmark-cadence/11-11-files.md) | 11. Files |
