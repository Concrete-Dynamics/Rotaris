# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Revisit if

Part 5 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## Revisit if

`REQ-GIT-004` or `REQ-GIT-030` is relaxed about the index or the branch set, which would reopen the
porcelain route; or a requirement appears that checkpoints work outside a Git repository, which would
force alternative B and would be a product decision rather than an architectural one (ESC-4); or a
requirement makes the recorded checkpoint list itself something a user or another tool reads, which
would pull it back out of the database under SR-4's own principle.
