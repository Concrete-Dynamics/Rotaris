# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Alternatives considered — scope

Part 3 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Alternatives considered — scope

**E — One store per session.** Preserves the file design's blast radius exactly. Rejected: it reinstates the
O(sessions) open-and-read that `REQ-SESSION-042` exists to avoid — that requirement now requires listing to
read "nothing but those listing records ... so the cost of listing grows with the number of sessions and
with nothing else" — a workspace-wide question (the improvement library of `REQ-LIBRARY-042`, delivery
records, the checkpoint index) has no store to live in, and it multiplies migration by the number of
sessions a user has ever run.

**F — One store for the whole installation.** Rejected, and the grounds have **shifted** under ESC-15 rather
than survived intact, which is worth showing. The previous version rejected it partly because "a workspace
copied, moved or deleted must take its sessions with it" — that clause is now **false and must not be
cited**: under `REQ-SESSION-198` a deleted workspace leaves its sessions on the machine, and a copied one
shares them. What survives is stronger than what was lost. First, blast radius: one store for every
workspace is one corruption domain for a user's entire history, and there is now no copy of it in the user's
own backup (SR-9(b)) to fall back on. Second, and new: **reclamation**. Machine-local storage accumulates
records for workspaces that no longer exist, and per-workspace scope makes reclaiming one workspace's whole
record a directory deletion the user can be shown and can confirm, where an installation-wide store would
make it row surgery.

**G — Two stores per workspace**, one written only by the run host and one only by the workspace service.
Better on two axes — no cross-process write contention, half the blast radius each. Not chosen, because SR-4
rules "database, one per workspace" and this record follows rulings. Recorded rather than discarded; it is
the first thing to reach for under *Revisit if*, and the split is invisible to every requirement, since
nothing joins a session row to a delivery record.

**H — One store per workspace.** Chosen, per SR-4.
