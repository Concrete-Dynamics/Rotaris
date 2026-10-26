# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Second execution — 2026-09-09 (Part AJ′)

Part 7 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## Second execution — 2026-09-09 (Part AJ′)

*Recorded under GD-10. This execution took the one specific the first left open — specific 3, the syntax-tree
parser — measured it as this record said it must be, and wired the four operations through to the surface that
invokes them. Defects are numbered `AJ2-n` here; the manager assigns the ordinals at merge.*

**Built and run:** `packages/workspace/src/traceability/parser.ts` (the TypeScript compiler API behind a port,
loaded once per process through `createRequire`, never a static import, so a sweep with nothing to decide pays
nothing and the bundler resolves the module at run time); the sweep and the verification pass now decide
`REQ-TRACE-104` rule 1 and `REQ-TRACE-109/110` for the built-in convention; the `verification` evidence state
(`REQ-TRACE-258/270`) filled from the pass's own verdict; the engine's ordering through contracts' `compareReqIds`
(`REQ-TRACE-289`); the consumer integration contracts as far as the product reaches them (`consumer.ts`:
`REQ-TRACE-176/182/183`, the build-break of `REQ-TRACE-500` compiled with the same compiler); the
`requirements.operation` and `requirements.cancel` arms of the workspace service reaching the one engine; and the
Project category's traceability card (`packages/ui/src/settings/ProjectSettings.tsx`), whose one pure mapping
states every result of spec 08 §1481. The proof (`pnpm traceability-proof`) times the parser over spike 7's tree,
plants a re-export-only module and a renamed test function into its fixture copies, drives the four operations
through the board's command family against a real `utilityProcess` with an open workspace, and asserts the
card's sentences over those real replies.

- **Specific 3 decided, by measurement (OQ-24).** The compiler API over the 1,000-file tree: **183–218 ms warm**
  (0.18–0.22 ms per file; 252–312 ms cold) after a one-time load of **329–627 ms** per process; inside the sweep
  only the files the patterns cannot decide are parsed — the 200 test files here, **35–45 ms** — because
  `REQ-TRACE-104`'s rules 2 and 3 excuse every traced or marked module before rule 1 is reached (R18). The
  half-size ratio is 1.76–2.17: linear. Six proof runs on a machine four other agents were loading. The sweep's matching-alone figure, which `REQ-TRACE-088` budgets, is
  unchanged at 279–413 ms warm and is now reported net of the parse time the sweep keeps apart. A native parser
  would buy back at most a fifth of a second once per process and would reintroduce the native-module burden this
  record named; the compiler API is the choice, and it needs no new dependency (the build already carries it).
- **What the parser decides, and what it cannot.** A module whose text does not parse is never excused (104's
  last sentence) and its orphan finding says so; a test file that does not parse contributes no functions (110);
  a type-only declaration is outside 104's closed list and does not excuse a module (R14); a test function is a
  declaration, never an arrow assigned to a constant (R15); the syntax-error count is the source file's own
  `parseDiagnostics`, with `transpileModule`'s diagnostics as the public fallback (R19). The `requires-parse`
  warning survives for exactly one case — a build in which the compiler cannot be loaded — and names the cause;
  `typescript` is not yet declared a runtime dependency of the desktop application, so a packaged build would
  be that case (handoff §8, a ruling request). The orphan-test ratchet's first real write happened (R11 decided,
  now R17): written wherever the set is decided, preserved where it is not.
- **Evidence (`REQ-TRACE-258/270`), reading R16.** The `verification` state is this pass's verdict — `failed` on
  an error naming the requirement, `stale` over a stale or missing artifact or on baselined debt, `satisfied`
  otherwise — recomputed by every pass and written nowhere (`REQ-TRACE-508`: the traceability check records
  none). The projection joins it in place of the "Missing evidence: verification." every approved requirement
  showed. `REQ-TRACE-410`'s suite run (a verdict with the commit and the hash) is not built; when it is, its
  record supersedes this state for the requirements it verified.
- **The consumer half (R20).** The declarations module `rotaris-traceability` is the entry point `REQ-TRACE-176`
  describes and the product does not offer: Rotaris is a desktop application with no published package and no
  right to write into a user's `node_modules` (`REQ-TRACE-152`). The in-app half is built — the module's exact
  source text, the regenerate-before-collection notice and the three meta-test assertions as plain functions —
  and the published package is raised in the handoff, not built. `REQ-TRACE-500` was proven with the compiler:
  a deleted requirement's reference is a compile error at its file and line (2339, or 2551 when the compiler can
  suggest a neighbour), and a deprecated one warns at its exact spot through the language service's suggestion
  diagnostics — the deprecation is not a program diagnostic, which a first reading assumed.
- **The operations reachable (R21, R22).** `requirements.operation` runs the seam's four methods on the injected
  engine and answers in `traceability.operate`'s reply shape, so a surface reads one form; a successful check,
  regeneration or baseline update re-reads the projection and moves the generation, which main publishes on
  channel 10 after the reply (a check IS the verification the board presents), while a comparison does not.
  `requirements.cancel` reaches the process's handle through a structural probe, since the seam's engine offers
  no cancel and a fake without one has nothing to stop. Over the process, the direct path's first check measured
  470–798 ms (the first job spawns the worker) and the board path on the warm worker check 13–17 ms, regenerate
  6–7 ms, a baseline update 20–26 ms; ~~two concurrent checks yielded exactly one `busy` (`REQ-TRACE-512`)~~ *(corrected 2026-10-01, see
  the end of this record: the two checks raced, and the pair is now held in flight)*; every
  card the board then read carried a `verification` state. The card allows one operation at a time across the
  four kinds; the engine's rule is per kind.

**Found — two, both in the harness, numbered `AJ2-1` and `AJ2-2`; the engine itself gave the parser nothing to
repair:**

- **AJ2-1 — a test that could never pass as written.** The no-compiler regression test asserted the
  `requires-parse` finding for an undecided module after running the baseline update; the update baselines an
  undecided candidate (the direction the ratchet allows, R11's second half), and a baselined candidate is
  suppressed before the undecided branch is reached (`REQ-TRACE-122`). The interaction is correct and was
  unstated: an undecided orphan candidate that is baselined becomes suppressed debt, silently. The test now
  checks before it baselines, and this note states the interaction.
- **AJ2-2 — the proof waited out its whole timeout on a dead service.** In a worktree never built, the driver
  forked a bundle that did not exist, the child exited at once, and the driver waited for `ready` until the
  harness's 180 s timeout because it listened for messages and never for exit. It fails at once now, naming the
  exit code; the shutdown path is exempted.

**Two toolchain notes, not counted:** the shell hook that rewrites commands collapses `\\` to `\` inside a
heredoc's body, so a TypeScript string holding `\n` can be neither matched nor written through one — source edits
go through the editor tools; and `REQ-TRACE-183`'s third assertion fails alongside the second on a missing
artifact, because a missing artifact is an error finding (`REQ-TRACE-093`) — a reading corrected in the test.

**Readings taken where the specification fixes nothing, each stated in code at the site:** R14–R22 above, and
R23 — the Project category's card takes `REQ-CONFIG-390`'s shape (a status headline, a selectable detail, an
indeterminate indicator, an action row whose disabled action names its condition), since the mockup draws no
Project category and that requirement is the one that fixes a card of this category.

**Not exercised:** the published consumer package (raised); progress on channel 10 (still logged by phase name);
the requirements view's own control for the check (`REQ-TRACE-508`'s "reachable from the requirements view" is
met through the card and the board's re-read, not a control on the view); a packaged build without `typescript`
beside the service (the degradation path is unit-tested with a simulated load failure, not packaged); the
contended replace (OQ-41); macOS and Linux (IC-3).
