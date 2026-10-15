# Spike 7 — the traceability engine at REQ-TRACE-300's scale

- **Date:** 2026-09-09
- **Taken as:** the first act of building the traceability engine (ADR-0040, Part AJ), as the plan requires of a
  spike — before the parser existed, the generator existed; each mechanism was measured the moment it landed.
- **Question:** `REQ-TRACE-501` budgets the store parse at "about one second" for a store of the order of 10³
  requirement documents, with peak memory bounded by one document plus the accumulated records; `REQ-TRACE-088`
  budgets the sweep at "about one second" for 10³ source files carrying 10⁴ annotation sites, on one execution
  thread, timing enumeration, reading and matching alone. Both name the **linear-growth clause as the binding
  one**. ADR-0040 §"Revisit if" says no measurement existed and that a measurement reporting one number would not
  decide which phase misses a budget. Does the streaming design (specific 1) meet both, and does it grow linearly?
- **Reproduce:** `pnpm traceability-proof` (stage 1; numbers in `.proof/traceability-proof/spike-results.json`). The
  generator is `packages/workspace/src/traceability/scale-fixture.ts` (since 2026-10-15 `scale-fixture.test-support.ts`) and is deterministic.

## Method

`traceability.proof.test.ts` under `ROTARIS_TRACEABILITY_PROOF` generates, in one vitest process:

- **the store**: 15 hundreds-blocks × (1 epic + 99 children) = **1,500 requirement documents** plus a
  frontmatter-less README, **3.54 MB** in all (about 2.4 KB per document: frontmatter, an H1, three prose
  paragraphs and an `## Acceptance criteria` section); every 10th child `draft`, every 50th `deprecated`, every
  7th `type: technical` with a `derived-from`;
- **the tree**: **800 implementation files** and **200 test files** under the default `src` / `tests` roots, ten
  annotation sites each, in five forms cycled per site — decorator position, a plain call naming two symbols, a
  call spread over four lines with `Requirement.`-qualified members, a bare-integer call, and a second decorator —
  and, in the test files, `@covers(...)` alternating with a `// covers:` comment: **10,000 sites**, of which the
  sweep resolves 13,200 identifier occurrences (two-symbol calls count twice) in 9,333 annotations;
- a **half-size** store (7 blocks, 701 documents) and tree (400 + 100 files) for the linear clause.

Each pass runs once cold (first read of the tree in the process) and once warm; the warm figure is the one
compared against the budget, per `REQ-TRACE-088`'s reference conditions. `process.memoryUsage()` is sampled
around the warm parse. Machine: Windows 11 Pro 26200, Intel i7-10875H @ 2.3 GHz, 16 GiB, NVMe SSD, Node 24.11.0,
one thread (vitest, one file), no other load. Six proof runs were taken; the spread is given.

## Results

| Pass | Size | Warm | Cold | Budget | Half size | Ratio (full ÷ half) |
|---|---|---|---|---|---|---|
| store parse (`REQ-TRACE-501`) | 1,501 documents, 3.54 MB, 1,500 records | **448–619 ms** | 467–688 ms | ~1,000 ms | 701 documents: 213–279 ms | 1.86–2.39 (documents ×2.14, bytes ×2.1) |
| repository sweep (`REQ-TRACE-088`) | 1,000 files, 10,000 sites (13,200 occurrences) | **244–391 ms** | 246–515 ms | ~1,000 ms | 500 files: 114–167 ms | 1.92–2.57 (files ×2.0) |

Memory around the warm parse: heap delta **6–25 MiB** across runs (the 1,500 records, each carrying its prose for
the canonical hash and the seam's `prose` field; the spread is garbage-collection timing between the two samples),
process RSS 123–167 MiB (the vitest process). No phase holds more
than one document's text: the parse is a loop that reads, decodes, normalises, hashes, reduces and drops.

Over the process boundary (stage 3 of the proof, a real `utilityProcess` and a real `worker_threads` worker):
`check` over the fixture store 101–472 ms end to end (the first job spawns the worker), `regenerate` 11–18 ms, a `check` over the 1,500-document
store **cancelled 49–56 ms after it began** through `traceability.cancel`, answered by the service's own loop while
the worker was inside the parse.

## What it settled

- **Both budgets are met with a margin of about 2× on this machine**, and the design is the streaming one
  ADR-0040 specific 1 requires — not read-all-then-parse-all. The margin is what lets the decision to leave
  alternative E (the validated index) unbuilt stand on measurement rather than on reasoning: no phase needs an
  accelerator at the stated scale.
- **Growth is linear.** Doubling the documents costs 1.9–2.4×; doubling the files costs 1.9–2.6×. The spread across
  runs (±25 %) is disk-cache and scheduler noise, not shape.
- **Where the time goes.** The parse is dominated by reading and hashing (SHA-256 over 3.5 MB is ~15 ms; the rest
  is `readFileSync` per document, UTF-8 decoding and the line-oriented grammar). The sweep is dominated by the two
  regular expressions per file over 1,000 files; the enumeration is under 30 ms. Neither is the phase an index
  could save (ADR-0040 consequence 10 — an index saves interpretation, never I/O), and interpretation is not where
  the time is.
- **The worker boundary costs nothing measurable** at this scale: the `check` over the fixture is 101–472 ms
  through the process protocol, the worker and back, against about 20 ms in-thread; the difference is the first
  job's worker spawn (paid once per service process) and the structured clone of the report — a second `check`
  in the same service answered in 7 ms.
- **The cancel path works as REQ-TRACE-222 describes it**: a shared `Int32Array` flag, raised by the owner thread,
  observed at the pass's next per-document checkpoint inside a synchronous loop — no yield, no message the loop
  would have to return to read. Worst-case waste is one document.

## What it did not measure

- **OQ-24 — the parse-requiring checks.** `REQ-TRACE-104` (re-export-only modules) and `REQ-TRACE-109/110`
  (test-function collection) need a syntax tree; this build reports them as `requires-parse` and no parser was
  timed. That measurement is wave 2's (AJ′), against this same 1,000-file tree, and it is the number ADR-0040 #3
  says decides between the compiler API and a native parser. **Measured 2026-09-09 (Part AJ′) — see below.**
- A project-declared convention's patterns at scale (`REQ-TRACE-073`): the tree carries only the built-in
  convention. A pathological pattern's cost is unbounded by requirement (OQ-25); the worker placement makes it
  terminable, and that termination was exercised in `worker.test.ts` against a fake worker, not timed.
- A store with a tombstone log in the thousands (the reuse check is a `Map` lookup per record and is not expected
  to move the figure).
- A cold file-system cache (the first read after a reboot); `REQ-TRACE-088` states warm as the reference condition.
- macOS and Linux (IC-3).
- **OQ-41 — one replace.** `replaceDocument` with `REQ-TRACE-061`'s ladder was executed by every regenerate and
  baseline update in the proof (five files, no contention, no retry needed: attempts = 1 every time). The
  contended case — a test session in the same checkout holding the artifact open on Windows — was not staged;
  ADR-0040 specific 6's residue stands as recorded.

## Second measurement — 2026-09-09 (Part AJ′): the parse-requiring checks (OQ-24)

- **Question:** ADR-0040 specific 3 left the syntax-tree parser open between the TypeScript compiler API (correct,
  heavy, already in the build) and a native parser (fast, a native-module burden), and said the first thing to do
  was to measure. `REQ-TRACE-104` rule 1 and `REQ-TRACE-109/110` need a full syntax tree; no requirement budgets
  them (OQ-24). What does the compiler API cost over this same tree, and does the sweep still meet `REQ-TRACE-088`?
- **Method:** `pnpm traceability-proof`, stage 1's third test. Every file of the tree is read once outside the
  timing; then `analyseModule` runs over the 800 implementation files and `collectTests` over the 200 test files,
  once cold and once warm, on one thread; the half-size tree the same way. Separately, the sweep reports how many
  files it parsed and how long, since it consults the parser only where the patterns cannot decide. The compiler's
  one-time load is timed by the clock the loader is given. Same machine as above, four other agents' builds and
  proofs running on it (the spread is load); six proof runs.

| Measurement | Result |
|---|---|
| compiler API (TypeScript 5.9.3), one-time load per process | **329–627 ms** |
| the two checks over 1,000 files (800 modules analysed, 200 test files collected → 2,000 functions) | **183–218 ms warm**, 252–312 ms cold; **0.18–0.22 ms per file** |
| half-size tree (500 files) | 86–115 ms; ratio 1.76–2.17 (linear) |
| parsed inside the sweep (only the 200 test files: every module here is traced, so rules 2 and 3 excuse it before rule 1) | **35–45 ms** |
| the board path over the process (`requirements.operation`, warm worker): check / regenerate / baselines | 13–17 ms / 6–7 ms / 20–26 ms (the direct path's first check, which spawns the worker, 470–798 ms) |
| sweep, matching alone (`REQ-TRACE-088`'s figure, now reported net of the parse time the sweep keeps apart) | 279–413 ms warm (unchanged from the first measurement's 244–391 under an idle machine) |

- **What it settled.** The compiler API is the parser: two tenths of a second over 10³ files after a load paid once
  per service process, and inside a real sweep a fraction of that because the parser is asked only where rules 2
  and 3 have not already excused a module. Even the worst case — a repository with no trace anywhere, every module
  parsed — adds about 0.2 s to a 0.3 s sweep, inside `REQ-TRACE-088`'s one second though no requirement says the
  checks must share it. A native parser could save at most a fraction of the load and would reintroduce the
  native-module burden ADR-0040 names; there is no number here that justifies it. OQ-24 is answered by handoff.
- **What it did not measure.** A repository of very large single files (the per-file figure is over 2–3 KB
  files); the parser under `REQ-TRACE-073`'s pattern-declared conventions (they never reach it, by specification);
  a packaged build in which `typescript` is absent beside the service — that path degrades to the `requires-parse`
  finding and is unit-tested with a simulated load failure, not packaged (handoff §8).
