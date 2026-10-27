# Open-Question Resolutions — Domain 08, Requirements Board and Traceability — Accepted amendment, 2026-09-06 — OQ-41: the replacement ladder and the scope of independence

Part 4 of 4 of [domain 08's resolutions](../08-requirements-traceability.md), which indexes every part.

## Accepted amendment, 2026-09-06 — OQ-41: the replacement ladder and the scope of independence

The user accepted specification-review item OQ-41, which takes the closure the
question register itself named: `REQ-TRACE-061` gains a bounded ladder, and the
residue recorded as OQ-44 — "no requirement in the corpus now states a Windows
retry ladder for these four files, and REQ-TRACE-061 requires a failed replace to
be re-raised" — closes with it.

**What each requirement now says.** `REQ-TRACE-061` states the ladder: five
attempts in total, delays 0.05, 0.1, 0.2 and 0.4 s before the four retries, never
conditioned on attributing the failure to another process, with **exhaustion
producing a recoverable error and the previous file retained**. `REQ-TRACE-502`
keeps the complete-file guarantee unnarrowed and scopes the independence promise
to whole invocations and view freshness; its "SHALL NEVER fail because another was
running" is narrowed in place, because a held file can exhaust the ladder and the
honest outcome is a failed operation the user can repeat. `REQ-TRACE-182` says
that "any failure" includes a failed replacement, so its catch sits around the
whole regeneration rather than around its parse alone.

**What applying it found.** The ladder was cited by name throughout the
implementation while the requirement stated none. And the generator the test
session runs — `tools/symbol-artifact/generate.mjs` — replaced the artifact with a
single `writeFileSync` **over the target**: no staging, no rename, no ladder, so a
concurrent reader could observe a partial artifact, which `REQ-TRACE-502` forbids
in terms. The test adapter did not catch either: `execFileSync` throws on a
non-zero exit and a throw out of vitest's `globalSetup` fails the whole run before
one test is collected, which is what `REQ-TRACE-182` says SHALL NEVER happen.
Both are repaired, through a shared `tools/symbol-artifact/replace.mjs` carrying
the requirement's own contract and constants.

**The contended case is staged.** `tools/symbol-artifact/replace.test.ts` holds the
artifact open with a real descriptor, drives the ladder to exhaustion, and asserts
the previous file byte-identical with no staged leftover — the measurement the
question register recorded as outstanding on 2026-09-09.
