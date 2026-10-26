# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Consequences accepted

Part 4 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## Consequences accepted

1. `REQ-TRACE-173`'s N-scans cost stands, exactly as the specification accepts it.
2. Every board refresh re-reads the store and re-sweeps the repository. `REQ-TRACE-225` accepts this and
   states the mitigations: the read runs off the interface thread, the board says a refresh is in
   progress, the last good board stays on screen, and every external call the read makes is bounded.
   **The presence of a database is not a licence to change this.** What has changed is that the guard is
   no longer "there is no handle to reach for" but "an index may only be offered bytes already read", so
   an index can make a refresh cheaper and can never make one stale.
3. A syntax-tree parser ships inside the product, with a bundle-size and start-up cost that
   `REQ-STARTUP-155`'s 5 s first-paint budget must absorb (ADR-0055).
4. **Project-supplied regular expressions run unbounded** by requirement. The worker-thread placement
   makes them terminable; **whether they should be terminated, and what the user is told, is not
   specified** (OQ-25; *ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): no limit on a project's
   pattern, and a pass is terminated on the user's cancel alone, the user told only "cancelled"*). Note the
   pattern arrives with a checked-out repository, not from the user.
5. The board's ratchets shrink only and the tombstone log grows only (`REQ-TRACE-116`, `REQ-TRACE-130`,
   `REQ-TRACE-136`), and the retirement date comes from an **injectable clock** (`REQ-TRACE-140`) — the
   `WallClock` port of ADR-0006, not a global.
6. **The single I/O owner is a real constraint on how the engine is threaded**, and it costs something:
   a worker cannot read the generated artifact for itself, so the owner reads it and passes the bytes.
   For four small files that is negligible; it is written down because "just open the file on the
   worker" is a one-line change that would silently reintroduce the `EPERM` window.
7. **`REQ-TRACE-502` is reached inside the application and not against a concurrent test session on
   Windows.** OQ-41 stays open at that reduced scope, and C-11 should be restated to it rather than
   either asserting the property or denying it wholesale. A caller of `REQ-TRACE-509` must still handle
   a raised write.
8. The streaming parse of specific 1 holds a read descriptor on one document at a time. That is
   compatible with specific 6 only because the toolchain never replaces a requirement document —
   `REQ-TRACE-152` limits its writes to two named actions, so the documents it streams and the artifacts
   it replaces are disjoint sets. If a future operation writes into the store, the two collide directly.
9. **The engine may acquire an index and must not need one.** Specific 7 fixes the shape and declines to
   build it. The cost of deciding that way is that the accelerator is unavailable when someone first
   wants it and then has to be built under pressure. The cost of deciding the other way is an
   accelerator whose validation nobody exercises, because every test passes whether or not the
   validation is correct — a cold index and a correct one are indistinguishable to a passing test suite,
   which is the same failure `REQ-TRACE-089` describes one level up. The second is the worse outcome
   and it is the silent one.
10. **A validated index buys interpretation and never I/O, so the argument for one is narrower than it
    looks.** If a measurement ever motivates it, the thing it can accelerate is the regular-expression
    matching of `REQ-TRACE-073` and the metadata reduction of `REQ-TRACE-501` — not enumeration and not
    reading. An index proposed on the grounds that "the disk is the bottleneck" is proposing an
    inadmissible one.
11. **The residue is two failure modes with two different owners, and this record closes neither.**
    `REQ-TRACE-502`'s conformance gap is the test session — specific 6, OQ-41 at its narrowed scope.
    `REQ-TRACE-061`'s re-raise against a foreign handle is a user-visible failure that `REQ-TRACE-502`
    does not speak to at all, because its subject is another *invocation*; that is OQ-44. A reader who
    sees only "regeneration can fail on Windows" will reach for one remedy for both, and only one of
    them is a conformance question. C-11 should carry both halves and should still not assert
    `REQ-TRACE-502` satisfied.
