# ADR-0010 — Three channels between the run host and its surfaces

- **Status:** proposed
- **Date:** 2026-09-01
- **Origin:** RUNTIME (ADR-RUNTIME-02)
- **Authority:** `owner-decisions.md` **SR-2**, **SR-3**, **SR-4** and **SR-8**; and the specification
  as amended on 2026-09-01, which withdrew the persistence debounce and stated `REQ-ORCH-155`'s figure
  as a percentile
- **Evidence:** `../spikes/ipc-hop-latency.md` — the first measurement of the run-host → main →
  renderer path on the target platform. It changes three conclusions in this record and confirms two.
- **Depends on:** ADR-0002, ADR-0003, ADR-0058 (the workspace store), ADR-0008, ADR-0009
- **Constrains:** ADR-0044, ADR-0043, ADR-0046, and — newly, on the measurement — ADR-0021

## Parts

Since 2026-10-26 the rest of this document is in [`0010-three-channels-between-run-and-surfaces/`](0010-three-channels-between-run-and-surfaces/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0010-three-channels-between-run-and-surfaces/01-context.md) | Context; Persist before publish, and why the rule got simpler; What the measurement changed |
| [02](0010-three-channels-between-run-and-surfaces/02-alternatives-considered.md) | Alternatives considered |
| [03](0010-three-channels-between-run-and-surfaces/03-decision.md) | Decision; The publish rule, anchored on the commit; Sequence numbers and gap detection; One projector; The terminal channel's isolation is not this record's to assume |
| [04](0010-three-channels-between-run-and-surfaces/04-consequences-accepted.md) | Consequences accepted |
| [05](0010-three-channels-between-run-and-surfaces/05-revisit-if.md) | Revisit if |
| [06](0010-three-channels-between-run-and-surfaces/06-first-execution-2026-09-03-the-view-channel-end.md) | First execution — 2026-09-03, the view channel end to end |
| [07](0010-three-channels-between-run-and-surfaces/07-first-execution-2026-09-03-the-control-channel.md) | First execution — 2026-09-03, the control channel and the wire bus |
| [08](0010-three-channels-between-run-and-surfaces/08-second-execution-2026-09-05-the-control.md) | Second execution — 2026-09-05, the control channel's operations (Part J) |
| [09](0010-three-channels-between-run-and-surfaces/09-third-execution-2026-09-05-the-provider-limit.md) | Third execution — 2026-09-05, the provider-limit wait's three choices (Part Q) |
| [10](0010-three-channels-between-run-and-surfaces/10-fourth-execution-2026-09-07-structured.md) | Fourth execution — 2026-09-07, structured questions on all three channels (Part AC) |
