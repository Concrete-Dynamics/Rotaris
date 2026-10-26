# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Revisit if

Part 5 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## Revisit if

`REQ-TRACE-089`'s index clause is amended in either direction — relaxed to permit a cache with a stated
invalidation rule, which would make alternative E ordinary engineering, or withdrawn, which would
restore the previous specific 7 unchanged and is why its argument is preserved above rather than
deleted.

A measured failure to meet `REQ-TRACE-088` or `REQ-TRACE-501` on a real repository at the stated scale,
which would make the streaming design a correctness problem rather than a memory-hygiene one — **and
which is also the only thing that should start a build of alternative E.** No such measurement exists.
The budgets are ~1 s for 10^3 documents parsed and ~1 s for 10^3 source files swept, both under
`REQ-TRACE-088`'s reference conditions, and neither has been run against a repository of that size with
this design. A second workflow is taking measurements as this is written and its results are not in
hand; **if they show either budget missed, the question that opens is which phase misses it**, because
an index answers only for the interpretation phases and answers not at all for enumeration and reading.
A measurement that reports one number will not decide this.

`REQ-TRACE-061` gains a bounded retry ladder (OQ-44), or a native replace primitive is adopted — the
writer-handle spike establishes `ReplaceFileW` succeeds where `fs.renameSync` cannot, so the remedy now
has a known mechanism and a measured out-of-process cost of ~767 ms; what it lacks is an owner and a
decision about a native module. Either would close specific 6's residual.

A second product process that reads these artifacts is reintroduced, which would undo specific 6's
premise and put OQ-41 back at full size. Or `REQ-TRACE-513` is amended, which is now the only route by
which alternative C reopens.
