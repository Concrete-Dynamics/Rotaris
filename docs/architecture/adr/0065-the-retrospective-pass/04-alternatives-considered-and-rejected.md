# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Alternatives considered and rejected

Part 4 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Alternatives considered and rejected

- **A sentinel session id** (`retro_…`) in `source_session_id`, avoiding the table rebuild. Rejected:
  every reader would have to learn the sentinel anyway, and a column that names a session would hold a
  value that is not one — the by-session query would answer with a lie rather than with nothing.
- **Widening `REQ-LIBRARY-017`'s fence to admit cross-session material.** Rejected by the directive
  itself: the fence is faithful to the per-run analyst's scope, and widening it would make one pass
  answer two questions and be bounded for neither.
- **An insights report surface**, the other half of the comparison the owner drew. Rejected in
  `PD-LIBRARY-002`: a report is a fifth kind of record this corpus has no home for, while a proposal is
  already a first-class record with evidence, review, undo, history, export and an executor behind it.
- **Running the capture in the workspace service**, which owns the improvement rows. Rejected: it has
  no model boundary and no credential lease, and giving it one would put a provider call in the process
  that owns the store.
