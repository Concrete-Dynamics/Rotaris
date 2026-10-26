# ADR-0065 — The retrospective: a second analysis pass, user-started, workspace-wide, riding the improvement lifecycle unchanged — Consequences

Part 3 of 13 of [ADR-0065](../0065-the-retrospective-pass.md), which indexes every part.

## Consequences

1. A retrospective proposal is an ordinary proposal in every mechanical respect, which is the whole
   point: review, edit, delete, undo, history, export, the executor and the rollback all reach it
   without knowing it exists.
2. Two passes can be queued at once, and the existing FIFO orders them. `REQ-LIBRARY-123`'s ordering
   and `REQ-LIBRARY-127`'s shutdown cancellation therefore cover the retrospective for free.
3. A reader that assumed `source_session_id` names a session must now check `source_kind` first. The
   compiler finds these because the field's type changed; the surfaces that show a source label are the
   Proposals tab, the artifact export and the Overview card.
4. The pass reads material whose per-run handling never lifts it out of the workspace. Nothing leaves
   the machine except what the provider call already carries, and the pass writes nothing but proposals.
