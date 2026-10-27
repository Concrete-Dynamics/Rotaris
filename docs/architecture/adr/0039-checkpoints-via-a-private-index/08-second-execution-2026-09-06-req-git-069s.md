# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Second execution — 2026-09-06, REQ-GIT-069's cleanup at deletion (Part U)

Part 8 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## Second execution — 2026-09-06, REQ-GIT-069's cleanup at deletion (Part U)

*Recorded under GD-10; the row this note closes is the first "not built" item of the note above.*

**Built and run:** the session browser's Delete (`REQ-SESSION-166`) discards the session's refs before the record goes,
in the requirement's order: the run host loads the state to find the tree — the binding's worktree path for an
isolated session, else the workspace root — decides the liveness refusal first (a run under way here, or a live or
unknowable lock, refuses with a sentence distinct from the restore's, `REQ-GIT-151`), then asks main
`checkpoint.deleteNamespace {workspaceRoot, treeRoot, sessionId}`, relayed to the workspace service of that root like
the other three checkpoint asks (ADR-0002 c.4), which runs `deleteNamespace` (`prune(…, keep 0)`: the listing, then one
`update-ref -d` per ref by compare-and-swap); only then the one transaction. Cleanup is best-effort: a tree that is not
there is not asked about at all, the leftover `refs/rotaris/checkpoints/<sid>/` is logged as a warning naming the tree,
and the session still deletes. The proof deleted a session with two refs (both gone by `for-each-ref`), a session bound
to a worktree that had vanished (deleted, the warning logged), and an isolated session whose ref lived in the shared
repository's namespace (gone from there). The worktree directory of an isolated session is not removed by the delete —
it is the user's tree under `REQ-GIT-111`'s removal, not the session's record — and the proof records it left in place.

**Found: nothing in this record.**
