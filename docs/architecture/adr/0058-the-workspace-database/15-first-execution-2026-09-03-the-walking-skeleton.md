# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — First execution — 2026-09-03, the walking skeleton

Part 15 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10.*

**Built and run as product code:** `@rotaris/store` — the open sequence (WAL set and read back, the
write probe in `BEGIN IMMEDIATE` rolled back), schema v1 with the migration runner, the
statement-shaped DAL, the identifier by exclusive create, `origin.txt` on first open, and **the
corrected restore ported from IC-1's `restore2.js` with IC-1's experiments as its test** — E1, E1c,
E2, E2c, E3a, E4, and the D9 foreign-lock confirmation. All pass; both counterfactuals reproduce
their defect. In the application, the workspace service opened and migrated a store for a carried
directory and the run host opened it by the handed path.

**Found, in rule 6's implementation:** the first cut compared a caller's spelling against the first
opener's and refused a mismatch — and the test showed that on this platform `realpath` returns the
on-disk casing, so a lower-cased spelling canonicalises to the same string and no mismatch can arise.
The refusal was therefore unreachable, and the rule as written was doing nothing. **The corrected
shape is that `openStore` hands the engine the canonical spelling regardless of what it was passed**,
so two openers cannot reach one store by two spellings because neither opener's spelling ever reaches
the engine. That is a stronger property than a refusal and needs no second opener to be present.

**Found, and recorded as the fourth entry of consequence 17's pattern in miniature:** the E3a test
passed its bound to the wrong parameter and measured the default 2,000 ms instead of 300 — a harness
defect, caught because the assertion named the number.

**Not exercised:** the restore behind a *real* run host over the process protocol (the test's run host
is in-process); IC-4 and IC-5 remain as `TODO` markers at the modules they bind.
