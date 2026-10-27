# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **The amended `REQ-TOOLS-053` and `REQ-TOOLS-069` dissolve the requirement
  conflict this record was written around**, and the liveness signal it invented as an answer stops
  being an invention. `owner-decisions.md` **SR-1** additionally makes the per-window registration
  reading well defined rather than merely recommended. The decision is unchanged in every particular;
  its *justification* moves from "the architecture supplies what the specification omits" to "the
  architecture implements the test the specification states". A residual tension with
  `REQ-SANDBOX-101` is named below rather than smoothed away.
- **Revised:** 2026-09-02, against `../spikes/presenter-liveness-and-instance-claim.md`, which measured
  this record's remedy on the target platform. **The decision stands in every particular and the state it
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
- **Origin:** EXEC (ADR-EXEC-05), RUNTIME (constraint C10.5), UI (ADR-UI-05)
- **Depends on:** ADR-0002, ADR-0013, ADR-0017
- **Contains an unresolved conflict between slices** (presenter registration per window or per session,
  OQ-4 — narrowed by SR-1, not closed) *(OQ-4 ruled 2026-10-06, [R-071](../../product/requests.md#r-071): per application window, as built)*.
- **No longer names a conflict between two live requirements.** The earlier header read: "`REQ-TOOLS-053`
  and `REQ-TOOLS-069` test attendedness by *presence* of a presenter alone, while `REQ-TOOLS-064` forbids
  a hang; a wedged presenter satisfies the first and defeats the second (OQ-39)." Both requirements have
  since been rewritten and neither says that any more — see *What the amendment changed*.

## Parts

Since 2026-10-26 the rest of this document is in [`0019-approvals-and-the-presenter-capability/`](0019-approvals-and-the-presenter-capability/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0019-approvals-and-the-presenter-capability/01-context.md) | Context |
| [02](0019-approvals-and-the-presenter-capability/02-what-the-amendment-changed.md) | What the amendment changed |
| [03](0019-approvals-and-the-presenter-capability/03-alternatives-considered.md) | Alternatives considered |
| [04](0019-approvals-and-the-presenter-capability/04-decision.md) | Decision; The synchronous-native-dialog prohibition — application-wide, and not a style preference; The channel-close revocation is not the mechanism that operates; No platform signal for "main is unresponsive" is usable from the run host; The flow, and the headless path |
| [05](0019-approvals-and-the-presenter-capability/05-unresolved-conflict-between-slices.md) | Unresolved conflict between slices |
| [06](0019-approvals-and-the-presenter-capability/06-consequences-accepted.md) | Consequences accepted |
| [07](0019-approvals-and-the-presenter-capability/07-revisit-if.md) | Revisit if |
| [08](0019-approvals-and-the-presenter-capability/08-first-execution-2026-09-03-the-presenter-across.md) | First execution — 2026-09-03, the presenter across the real boundary |
