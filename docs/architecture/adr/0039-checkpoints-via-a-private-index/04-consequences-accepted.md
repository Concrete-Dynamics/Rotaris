# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Consequences accepted

Part 4 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## Consequences accepted

1. Capture cost is a full stage of the changed set into a fresh index. `REQ-GIT-033`'s 300 s budget is
   the whole budget and a repository too large to stage inside it produces the timeout error, which that
   requirement states is "a correct result of this requirement and not a defect in it".
2. We depend on a set of long-stable plumbing subcommands being available.
3. **A workspace that is not a Git repository has no undo.** That is `REQ-GIT-044`'s stated behaviour
   and `REQ-LIBRARY-163`'s. ESC-4 accepted it, and the database does not change it: rows record where a
   commit is, and there is no commit without a repository.
4. Retention differs deliberately between the two namespaces: session checkpoints are **configurable**
   at a documented default with a minimum enforced at load, while improvement checkpoints are fixed at a
   constant with the newest pre-improvement checkpoint never dropped (`REQ-GIT-049`, `REQ-GIT-071`,
   `REQ-LIBRARY-071`). Two retention policies, deliberately, and they must not be unified — the fact
   that both are now `DELETE` statements over the same table makes unifying them one careless line
   away.
5. **Refs and rows can still diverge, and that is stated behaviour.** `REQ-GIT-049` says so in terms: a
   ref pruned by hand, lost with a repository restored from backup, or gone with a repository that was
   moved leaves the list and the refs divergent. The maximum-of-both-sources numbering absorbs it. The
   database changes nothing about this.
6. **The blast radius is bounded, and the index is rebuildable.** SR-4 concentrates the crash domain:
   one database per workspace where there was one directory per session. The mitigation specific to
   *this* store is that the database holds no checkpoint content — every checkpoint is a commit
   reachable from `refs/rotaris/checkpoints/`, so a lost database loses the mapping from iteration to
   commit, not a single byte of captured work, and the refs enumerate what survived. That is a real
   argument for putting the list in a row and it should be tested, not assumed: an enumeration of the
   namespace reconstructs sequence, ref and commit for every checkpoint the repository still holds.
7. `REQ-GIT-016`'s `files` list rides on the row as a serialised value. It is not queryable, and if a
   later requirement wants to query it — "which checkpoints touched this path" — that is the change
   that introduces a child table.
