# ADR-0019 — history

The passages of [ADR-0019](../../../architecture/adr/0019-approvals-and-the-presenter-capability.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-01"></a>

**The revision of 2026-09-01**, from [0019-approvals-and-the-presenter-capability.md](../../../architecture/adr/0019-approvals-and-the-presenter-capability.md), the header:

**The amended `REQ-TOOLS-053` and `REQ-TOOLS-069` dissolve the requirement
conflict this record was written around**, and the liveness signal it invented as an answer stops
being an invention. `owner-decisions.md` **SR-1** additionally makes the per-window registration
reading well defined rather than merely recommended. The decision is unchanged in every particular;
its *justification* moves from "the architecture supplies what the specification omits" to "the
architecture implements the test the specification states". A residual tension with
`REQ-SANDBOX-101` is named below rather than smoothed away.

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0019-approvals-and-the-presenter-capability.md](../../../architecture/adr/0019-approvals-and-the-presenter-capability.md), the header:

**The decision stands in every particular and the state it
detects is now reproducible rather than argued.** Three things changed underneath it, and two of them
are reasons rather than conclusions. (1) The detection mechanism gains **a condition that must be built
as stated**: the lapse test is *the gap since the last reply*, never *did a reply for sequence N
arrive*. (2) Obligation 3 is restated **application-wide and much harder** — no synchronous
platform-dialog call may ever be made on main — because the exposure turned out not to be the approval
dialog at all. (3) The consequence that registration "is revoked automatically when the channel to main
closes … **without a timeout**" was tested and **that path is not exercisable in this topology**; the
conclusion that a dead main leaves nothing hanging survives, the stated reason does not, and the reason
that actually holds has consequences of its own. Each is marked at the sentence it corrects rather than
only summarised here.
