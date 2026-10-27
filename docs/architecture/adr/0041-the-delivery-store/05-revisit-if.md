# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Revisit if

Part 5 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Revisit if

`REQ-CONFIG-192` is amended in a direction that requires a delivery record to be a file a person or
another tool reads, which would reopen A′ — though `REQ-CONFIG-192`'s own amended text, which states the
records are "high-volume, queried and transactional" and written "together, indivisibly", now makes that
a large reversal rather than a small one.

A measured failure to meet `REQ-TRACE-239` at `REQ-TRACE-300`'s scale, which would be a query-shape
problem rather than a store problem. **No such measurement exists**: a second workflow is taking
store-side measurements as this is written and its results are not in hand, so the claim that a board is
one query inside 100 ms at a hundred populated columns is a design expectation and not a result. If it
is missed, the first thing to check is whether the board query and the export share a read path they
should not.

ESC-20's boundary is widened — a record carrying unredacted user or tool content is given an export —
which would invalidate commitment 2's premise that the export's handle need offer no route to session
evidence, and would make alternative G's failure mode reachable by design rather than by accident.

OQ-45 is decided in a way that brings `REQ-LIBRARY-047`'s version write inside the artifact write's
atomic boundary, which would remove the "never recorded versus pruned" ambiguity the export section
names and make part of that section unnecessary. Or a requirement appears that the delivery store and
the improvement store share a write path, which would collapse the boundary consequence 6 draws — no
longer to drag an accepted loss across it, since there is none left, but because the two stores' write
disciplines are stated separately and would have to be reconciled.
