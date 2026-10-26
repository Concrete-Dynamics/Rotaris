# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Alternatives considered — how a store is located

Part 5 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Alternatives considered — how a store is located

**P — By the workspace's resolved path, or a hash of it.** Rejected. It fails the first thing
`REQ-SESSION-197` requires: moving or renaming a workspace folder must preserve its sessions. It also
encodes a user's directory layout into a value that may end up in a bug report or a commit.

**It is also the one alternative in this record with field evidence against it rather than argument**, and
ESC-19's survey supplies it: three comparable products key by path and all three carry the same filed
defect — history orphaned by a move, a rename, or a change of case — with one user reporting 63 sessions
lost across 10 projects. The remedy their users ask for is the file `REQ-SESSION-197` already mints. This
alternative is kept here, and kept explicit, because it is what a later simplification pass will propose:
it deletes a file, a mint, a resolution step and the whole two-folders-one-identifier class of edge cases
below. Everything it deletes is what stops a rename destroying a user's history.

**Q — By something derived from the repository** (the initial commit id, a remote URL). Rejected on two
counts. It would make a **fresh clone resolve to the same identity**, which the reconciliation of
`REQ-SESSION-197` with `REQ-CONFIG-013` deliberately rules out — a clone mints its own identifier and starts
with an empty local history, "which is what `REQ-SESSION-198` requires of a machine that has not run the
workspace before" (`REQ-CONFIG-010`). And `REQ-GIT-044` allows a workspace Git cannot manage at all, which
would then have no identity.

**R — A stored identifier, minted once, read thereafter.** Chosen, per `REQ-SESSION-197`.
