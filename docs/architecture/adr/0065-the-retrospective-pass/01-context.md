# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Context

Part 1 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Context

The product has one analysis pass, and it is fenced. `REQ-LIBRARY-017`: "Data from another run, another
session, or another workspace MUST NOT inform it." That fence is right for a run's own analysis and it
is exactly why the corpus cannot answer the owner's request, which is for a pass that reads **across**
runs and proposes how the workspace is worked in. `PD-LIBRARY-002` therefore adds a second pass rather
than widening the first, and leaves `REQ-LIBRARY-015`'s scope — at most once per terminal task run —
untouched.

Everything the second pass needs downstream of itself already exists and is measured: the artifact
store (v18, ADR-0061), duplicate suppression (`REQ-LIBRARY-046`), versioned history
(`REQ-LIBRARY-162`), the review surfaces, the executor, the improvement checkpoints and the rollback.
The new mechanism is therefore small on purpose: a capture that reads a workspace instead of a run, a
prompt that asks a different question, and a trigger that is a person rather than a run ending.
