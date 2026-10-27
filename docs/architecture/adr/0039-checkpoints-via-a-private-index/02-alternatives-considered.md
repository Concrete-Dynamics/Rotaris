# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Alternatives considered

Part 2 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## Alternatives considered

**A — Stashing, or a temporary branch.** The obvious approaches, and both are excluded outright rather
than merely awkward. Stashing — including the form that does not move the stash reference — takes the
repository index lock and refreshes the index, which `REQ-GIT-030` forbids in terms. A temporary branch
changes the branch set, which `REQ-GIT-004` forbids. Checking out and resetting move HEAD.

**B — Snapshot outside Git entirely, in a content-addressed store of our own.** Total control over the
exclusion rule and no Git needed, so it would work on a workspace that is not a repository. It fails
`REQ-GIT-029`, which requires checkpoints to be ordinary Git commit objects reachable from a reference,
and `REQ-GIT-060`, which requires overwritten uncommitted content to be retrievable from the safety
checkpoint's **commit**. It would also have to reimplement Git's own recording of the executable bit,
symlinks and submodule links, which `REQ-GIT-034` explicitly defers to Git — a strong hint that the
specification expects Git to do the recording.

  It is worth noting what B would buy, because it is not nothing: `REQ-GIT-044`'s "a tree Git cannot
  manage resolves to disabled — a workspace without undo" is a capability gap B would close. **ESC-4
  ruled the gap accepted as specified**, on the basis that checkpoints are ordinary commits; the
  arrival of a database does not reopen it, and this is the trap SR-4 most invites here. A checkpoint
  table is not a checkpoint store: **the content lives in commits and only the list lives in rows.**

**C — A private Git index plus plumbing, with the recorded list in the session's persisted JSON.**
The previous decision. Correct about Git, and it was correct about the list too under ADR-0003's
files-only rule. What it cost is set out in the decision below: a read-modify-write of a whole session
document for every capture and every trim, a two-artifact ordering with no transaction between the
checkpoint list and the timeline, and a debounced whole-file save sitting in front of an event
`REQ-GIT-048` requires to be published only after the write is durable.

**D — A private Git index plus plumbing, with the recorded list, the count and the last-restored
sequence as rows in the workspace database.** Chosen.
