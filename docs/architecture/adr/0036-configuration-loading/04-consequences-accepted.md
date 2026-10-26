# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Consequences accepted

Part 4 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## Consequences accepted

1. **We own the merge.** It is the largest single piece of hand-written logic in the workspace service
   and the place where a conformance failure would be least visible. `REQ-CONFIG-051`'s end-to-end
   fixture is a first-class test, plus a per-rule test for each of the tri-state rules.
2. The no-cache rule means every settings-screen open, every run start and every workspace open
   re-reads and re-merges. At these file sizes that is microseconds; it is recorded here so it is not
   later "optimised" into a violation — and, now that a database exists in the product, so that the
   optimisation nobody should reach for is named: **not a configuration table, not a parsed-document
   cache in a row.**
3. **Comments and layout survive every write.** This reverses what this ADR previously accepted, and
   the reversal is now the specification's rather than a ruling's: `REQ-CONFIG-252` states preservation
   and withdraws its own earlier sentence. Key order preserved and never alphabetised
   (`REQ-CONFIG-248`) is unaffected and was always the case.
4. Both the workspace service and the run host instantiate this loader (ADR-0002). The tri-state model
   and the validating wrapper must therefore be free of process-specific dependencies — and, now, free
   of any database dependency.
5. **`requirements.delivery` stays a configuration block whose records are rows, and the loader is
   where that split is enforced.** `REQ-CONFIG-192`'s four remaining keys — `schema_version`,
   `retain_tombstones`, `audit_trail`, `history_limit` — are authored by a user in YAML and merged by
   this loader like any other section; the delivery records they govern are rows in ADR-0041's store.
   The requirement now states the split itself, including that `REQ-CONFIG-477`'s boundary does not
   reach it.
6. **Two withdrawn subpath keys become load failures, and this loader is what delivers them.** The
   storage move withdrew `store_subpath` with the directory it named, and `worktree_subpath` was never
   a key of this domain (`REQ-CONFIG-192`, `REQ-CONFIG-194`). Both sat under `requirements:`, where
   `REQ-CONFIG-183` makes an unrecognised key a **hard load failure** rather than a warning — so a
   workspace configured against an earlier build does not degrade, it stops loading, and under
   `REQ-GIT-071` that is fatal to the workspace: nothing that depends on it starts, no session
   directory and no lock are created, and the application goes on running with no workspace
   configuration. That is the one place the storage decision reaches this ADR at all, and it is worth
   stating because it is the only user-visible cost of the move that this record owns. Two things
   follow. The failure message must name the key and the file, as `REQ-CONFIG-183` and
   `REQ-CONFIG-237`'s `<dotted.path>: <message>` rendering require, and the strict block is exactly
   where a bare "unknown key" is least helpful. And this is a genuine argument *against* the strictness
   inversion that `REQ-CONFIG-183` chose, recorded rather than smoothed away: had `requirements:`
   followed the top-level carry-and-ignore policy, a withdrawn key would have been a warning and the
   workspace would still open. The inversion is the specification's decision and this record does not
   reopen it; it does note that the amendment pass made the inversion cost something it did not cost
   before.

   **Superseded by the specification, reported 2026-10-15 (fin47).** The reading above — that both keys are hard load
   failures — **is false** and is kept here beside its replacement. `REQ-CONFIG-183`'s carve-out and `REQ-CONFIG-192`/`194`
   now make a key the specification withdrew, or names as not a key of this domain, **reported and ignored**: a warning
   naming the file, its scope and the key's full path (`REQ-CONFIG-233`'s warn-and-continue), and the workspace opens —
   exactly the outcome this consequence said strictness had cost. The loader delivers it in
   `packages/config/src/sections/requirements.ts`: `execution.worktree_subpath` since Part AP, and `delivery.store_subpath`
   since fin47 (`WITHDRAWN_STORE_SUBPATH`; until then the opaque `delivery` block carried it unread, so it was neither
   rejected nor reported:
   [`../../../defects/fixed/a-withdrawn-delivery-store-subpath-is-accepted-silently-rather-than-reported.md`](../../../defects/fixed/a-withdrawn-delivery-store-subpath-is-accepted-silently-rather-than-reported.md)).
