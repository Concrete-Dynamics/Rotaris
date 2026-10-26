# Architectural constraints extracted from the specification

This is the evidence base for every decision in [`adr/`](adr/). Each entry states what the approved
behavioural specification **forces**, and cites the requirement identifiers that force it. Nothing here
is a design choice; where a design choice was made, it is in an ADR and it cites an entry from this
document.

Entries are labelled:

- **HARD** — the specification fixes an observable that only some designs can produce.
- **HINT** — not fixed, but one design makes several requirements natural and the alternatives awkward.
- **FREE** — genuinely an implementation choice, recorded so it is not later mistaken for a constraint.
- **CONFLICT** — two live requirements cannot both be satisfied as written; carried to
  [`open-questions.md`](open-questions.md).

Domains 17 and 18 are retired; no `REQ-TUI` or `REQ-CLI` identifier appears anywhere below. Every
capability those documents carried is cited through the desktop requirement that owns it.

## Parts

Since 2026-10-26 the rest of this document is in [`constraints/`](constraints/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](constraints/01-the-second-half-of-the-evidence-base.md) | The second half of the evidence base: `docs/spec/resolutions/` |
| [02](constraints/02-the-nine-structural-rulings-and-what-the.md) | The nine structural rulings, and what the specification now compels |
| [03](constraints/03-1-process-placement-and-lifetime.md) | 1. Process placement and lifetime |
| [04](constraints/04-2-durable-state-layout-atomicity-ordering.md) | 2. Durable state: layout, atomicity, ordering |
| [05](constraints/05-3-concurrency-and-locking.md) | 3. Concurrency and locking |
| [06](constraints/06-4-the-event-journal-and-the-live-stream.md) | 4. The event journal and the live stream |
| [07](constraints/07-5-update-channels-latency-and-view-isolation.md) | 5. Update channels, latency and view isolation |
| [08](constraints/08-6-the-run-engine.md) | 6. The run engine |
| [09](constraints/09-7-tools-permissions-and-approvals.md) | 7. Tools, permissions and approvals |
| [10](constraints/10-8-terminal-execution-and-streaming.md) | 8. Terminal execution and streaming |
| [11](constraints/11-9-confinement-and-network-egress.md) | 9. Confinement and network egress |
| [12](constraints/12-10-lifecycle-hooks.md) | 10. Lifecycle hooks |
| [13](constraints/13-11-model-providers-and-tool-servers.md) | 11. Model providers and tool servers |
| [14](constraints/14-12-configuration.md) | 12. Configuration |
| [15](constraints/15-13-version-control.md) | 13. Version control |
| [16](constraints/16-14-traceability-and-delivery.md) | 14. Traceability and delivery |
| [17](constraints/17-15-the-interface.md) | 15. The interface |
| [18](constraints/18-16-startup-distribution-and-diagnostics.md) | 16. Startup, distribution and diagnostics |
| [19](constraints/19-17-what-the-structural-rulings-compel-that-the.md) | 17. What the structural rulings compel that the specification does not |
| [20](constraints/20-17-what-the-structural-rulings-compel-that-the-2.md) | 17. What the structural rulings compel that the specification does not *(continued, from "W-20 \| **The product keeps ONE liveness predicate over TWO lock media, and this is a …")* |
| [21](constraints/21-17-what-the-structural-rulings-compel-that-the-3.md) | 17. What the structural rulings compel that the specification does not *(continued, from "W-31 \| **New. A STORE IS ESTABLISHED WHERE NOTHING IS KEPT FOR THE WORKSPACE, AND …")* |
| [22](constraints/22-reconciliations-recorded.md) | Reconciliations recorded |
