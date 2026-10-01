## traceability-proof's growth ratio times the full and half trees unevenly, and its failure message prints the half readings as full

`pnpm traceability-proof` asserts `REQ-TRACE-501`'s and `REQ-TRACE-088`'s linear-growth clause as a quotient: the
minimum of the full-size tree's warm readings over the minimum of the half-size tree's, below 3.0. The two sides are not
read under the same conditions, and the quotient comes out above the work ratio on a host that is not loaded.

- **The parse.** `traceability.proof.test.ts` reads the full tree first (one cold and three warm parses) and only then
  generates and reads the half tree (one unrecorded and three recorded parses). The half side runs on a hotter JIT and
  reads cheap. Acceptance round 1 measured a parse ratio of **3.04 and then 3.16**, twice in a row on an idle host,
  against a document ratio of 2.14 and a byte ratio of 2.11. An earlier run in `wt-proofs` read 3.09. On this branch,
  confirmed 2026-10-01 at load average 4 (another worktree's `vitest run`): **2.65, then 3.37**, the second red.
- **The sweep.** The full-size figure is **one** reading (the second sweep), and the half-size figure is the minimum of
  three readings taken after two warm-ups. The Part R2 comment above the code says "the minimum of three sweeps on each
  side", and ADR-0040's third execution says the same.
- **The parser pair** (OQ-24) reads the full corpus first and the half corpus afterwards, the same order as the parse.
- **The message.** `linear()` in `traceability-proof.mjs` prints `pair.warmRunsMs` as "full" and
  `pair.halfWarmRunsMs ?? pair.warmRunsMs` as "half". For `parseHalf` and `sweepHalf`, `warmRunsMs` holds the
  **half** readings and there is no `halfWarmRunsMs`. A red therefore prints the half readings on both sides and never
  shows the full ones: `parse growth ratio 3.16 is not linear — minimum of the readings [50.6,43.9,44.1] full against
  [50.6,43.9,44.1] half, work ratio 2.14`, where the full readings were `[140.7,138.8,148.5]`.

A scratch probe outside the repository (`parseStore` from source, seven interleaved samples a side) measured parse ratios
of 2.06 to 2.21. The product grows linearly; the red is the harness's.

## Specs

None contradicted by the product. `REQ-TRACE-501` and `REQ-TRACE-088` make the linear-growth clause the binding one, and
the proof is their evidence (`.claude/rules/tests-and-proofs.md`). As written, the proof misreads them: it fails a
product that meets them, and its failure message hides the figures a reader needs to tell so.

## Relevant files

- `packages/workspace/src/traceability/traceability.proof.test.ts`: the parse pair (full, then half), the sweep pair
  (one full reading against a minimum of three), and the parser pair (full, then half).
- `apps/desktop/scripts/traceability-proof.mjs`: `linear()`, its message, and the three calls to it.
- `docs/architecture/adr/0040-the-traceability-engine.md`: the third execution (Part R″), which describes the readings as
  "the minimum of three readings on each side".
