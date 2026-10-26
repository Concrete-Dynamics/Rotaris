# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — First execution — 2026-09-09 (Part AJ)

Part 6 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## First execution — 2026-09-09 (Part AJ)

*Recorded under GD-10: a mechanism's first execution reports back into the record that decided it, including when
it found nothing. Spike 7 (`spikes/traceability-scale.md`) was taken as the first act, as the plan required.*

**Built and run:** `packages/workspace/src/traceability/` — alternative B with specifics 1, 2, 6 and 7 as decided,
and the four operations of `REQ-TRACE-508` to `REQ-TRACE-511` reached from the workspace service through
`traceability.operate` / `traceability.cancel` (`apps/desktop/src/workspace-service/traceability.ts`). The proof
`pnpm traceability-proof` drives the engine in-thread over a copy of a fixture store, then forks the built
workspace service as a real `utilityProcess` and speaks the process protocol to it, so the worker thread, the shared
cancel flag and the single I/O owner executed before merge.

- **Specific 1 (streaming parse):** one document resident at a time — read, decode with replacement, normalise,
  hash, reduce, drop. Measured: 1,501 documents (3.54 MB) in 448–619 ms warm; heap delta 6–25 MiB, which is the
  1,500 records under garbage-collection timing; half the store in 213–279 ms. `REQ-TRACE-501` met with a ~2× margin and linear.
- **Specific 2 (the hand-written reader):** `frontmatter.ts` shares nothing with ADR-0036's YAML library; the
  grammar of `REQ-TRACE-008..011` exactly, with an unterminated block yielding no frontmatter and no diagnostic.
- **Specific 3 (a syntax-tree parser):** *not built, as this record left it* — `REQ-TRACE-104` rule 1 and
  `REQ-TRACE-109/110` for the built-in TypeScript convention are reported as `requires-parse` findings that state
  why, never approximated by a pattern. A pattern-declared convention (`REQ-TRACE-073`) runs both checks in full,
  because it is regex by specification. The measurement OQ-24 asks for is wave 2's.
- **Specific 4 (TypeScript chose the convention):** the artifact is a TypeScript module — `export enum Requirement`
  with one JSDoc per member carrying the status marker and `@deprecated` on a deprecated one (`REQ-TRACE-181`
  (1)), the deprecated set, the metadata map of positional `new RequirementMeta(...)` calls; the built-in convention
  claims `.ts` and recognises `traces(...)` and `covers(...)` in decorator position and as plain calls, with the
  enum's members, `Requirement.`-qualified members, or bare integers inside; `skip_parts` defaults to `fixtures`,
  `node_modules` and `dist`.
- **Specific 6 (one I/O owner):** every read of the five artifacts is an open-read-close in `engine.ts`, every
  replace is platform's `replaceDocument` with `REQ-TRACE-061`'s ladder (five attempts, 0.05/0.1/0.2/0.4 s), and a
  job receives bytes and returns an ordered write list; the worker never opens one of those paths. The tombstone is
  written before the artifact (`REQ-TRACE-133`), asserted by the write order in two proofs. OQ-41's "one replace":
  every replace in the proof succeeded on the first attempt with no contention staged; the residue stands.
- **Specific 7 (consulted versus validated):** no index was built and the engine's entry points take no database
  handle. The behavioural test `REQ-TRACE-089` states is written (`engine.test.ts`): a document, a baseline, the
  artifact and the retired log changed by another program are reported by the very next operation with nothing
  cleared — it exists so that an index arriving by accident is caught.
- **Worker placement:** `worker.ts` posts a job with an `Int32Array` over a `SharedArrayBuffer`; a cancel raises it
  atomically and the pass's next per-document checkpoint observes it inside a synchronous loop; a worker that does
  not answer within a 2 s grace is terminated and respawned for the next job. Measured over the process: a `check`
  over the 1,500-document store cancelled 49–55 ms after it began, the cancel answered by the service's own loop
  while the worker was inside the parse (`REQ-TRACE-337`, `REQ-TRACE-497`).

**Found — three, the forty-seventh to the forty-ninth, two in the engine and one in the harness that measured it:**

- **Defect forty-seven — one file's occurrences came back in pass order, not text order.** The scan matched every
  annotation, then every `covers:` comment, and reported them in that order, so a consumer walking a file's sites
  "at its own line" (`REQ-TRACE-084`, `REQ-TRACE-508`) met a comment on line 2 after a call on line 3. No reading
  caught it: `REQ-TRACE-082`'s occurrence is a tuple with no stated order, and "sorted by path" was read as the
  whole ordering rule. The sweep now sorts each file's occurrences by offset before reporting.
- **Defect forty-eight — a project convention's line-anchored pattern never matched.** The four patterns of
  `REQ-TRACE-073` were compiled with the global flag only, so a `test_pattern` written `^def (test\w*)` — the
  natural declaration matcher — matched at the file's first character and nowhere else; the first Python fixture
  collected zero test functions. Patterns "evaluated against the file's normalized text" were read as a single
  string match. They are now compiled with the multiline flag, and that reading is recorded beside its replacement
  as R7 below.
- **Defect forty-nine — the proof's cleanup failed one run in three on Windows.** The fixture drive commits a
  base for the change comparison inside a copy of the fixture under `.traceability-proof/`; removing that copy at
  the end answered `EPERM` on the directory itself, on the first run of a series, even with ten retries over two
  seconds. **The first explanation was wrong and is kept here:** Git's `commit` detaching `gc --auto` (ADR-0039
  §3's finding), holding the directory open — the proof and `engine.test.ts` were given `-c gc.auto=0`, and the
  next series failed its first run exactly as before. The holder is outside the product (an indexer or scanner
  taking a freshly written `.git` and artifact for seconds after the last process using them exited) and cannot be
  waited out reliably. The remedy that held: the two fixture copies now live under the system temp directory, so a
  copy that cannot be removed is a stated warning and never a leftover `.ts` tree the linter would parse under
  the repository; the `gc.auto=0` stays, harmless and consistent with ADR-0039. A harness defect, counted because
  the harness is the mechanism's measurement.

**Two toolchain notes, not counted:** MSYS's path conversion turns a `// Part AJ` argument into `/ Part AJ`
when a banner line is passed to a script through Git Bash — the two package indexes were briefly unparseable; and
ESLint's project-wide run parses any `.ts` a proof leaves under the repository, so a proof that generates source
trees must remove them (the plan's `.traceability-proof/**` ignore lines are in the handoff).

**Readings taken where the specification fixes nothing, each stated in code at the site:**

- R1 — a `status` key that is absent is a parse error naming the accepted set: `REQ-TRACE-017/018` give `trace`,
  `test` and `type` defaults and `REQ-TRACE-016` gives `status` none, so absence is not a lifecycle.
- R2 — `skip_parts` applies to the store scan as well as the sweep (`REQ-TRACE-039`: "no file beneath a skipped
  component is parsed").
- R3 — `REQ-TRACE-049`'s "current working directory" is the directory the caller supplied; the service's own cwd
  names nothing, and `REQ-TRACE-512` fixes the start as the open workspace.
- R4 — "each member followed by a documentation string" (`REQ-TRACE-054`) is read as "each member carries one": a
  TypeScript doc comment precedes its member. `REQ-TRACE-055`'s two rewrites are applied, and `*/` — the terminator
  TypeScript has — is rewritten too, since the observable is that a title cannot terminate the string.
- R5 — the artifact imports `Lifecycle` and `RequirementMeta` from the bare specifier `rotaris-traceability`; where
  that module lives in a consuming project is wave 2's consumer-integration question (`REQ-TRACE-176/182/183`),
  raised in the handoff, and the specifier is the one thing fixed now so the artifact's shape does not move.
- R6 — the derived-from tuple in the metadata record is numbers (`REQ-TRACE-019`); the fingerprint's comma-joined
  list is identifiers (§Hashes).
- R7 — project patterns run with the multiline flag (defect forty-eight).
- R8 — a project convention's captured annotation kind is coverage when the capture contains `cover` or `test`
  (case-insensitive), implementation otherwise; the built-in names are exact.
- R9 — `REQ-TRACE-160`'s `status` kind (equal hashes, differing lifecycle) is unreachable from the documents alone,
  because a status line is document text and moves the hash; it arises only when the base artifact's recorded
  lifecycle disagrees with the text at an equal hash. Implemented as specified; the fixture cannot plant it and
  `classifyChanges` is where a unit case would go.
- R10 — the empty-store warning of `REQ-TRACE-503` leads the findings; `Finding.message` is the whole
  `REQ-TRACE-100` line and `path`/`id`/`line` carry it structured beside.
- R11 — the orphan-test baseline is **preserved, not rewritten**, while `.ts` test roots have no parser: a
  shrink-only file written from an undecided set would be empty and could never regain what wave 2 finds. The
  baseline update reports the existing entry count for it and says so in the log; orphan-module candidates the
  parser cannot excuse ARE recorded, since pruning is the direction the ratchet allows.
- R12 — the seam's `sweep(parse)` re-reads the layout from `parse.root`, because the seam's `LayoutConfig` cannot
  carry the exempt marker, the excused roots or the structured conventions (handoff §6).
- R13 — `REQ-TRACE-214`'s callbacks happen on the pass's thread inside the worker and are marshalled to the owner
  by the host, which the requirement allows the host to do for itself.

**Not exercised:** a contended replace (OQ-41's residue); a project pattern with catastrophic backtracking beyond
the fake-worker test of the grace-and-terminate path (OQ-25); a real consuming project importing the artifact;
macOS and Linux (IC-3). **The tally stands at forty-nine.**
