# ADR-0019 — Approvals: the wait registry lives with the gate; the presenter is a revocable capability — Alternatives considered

Part 3 of 8 of [ADR-0019](../0019-approvals-and-the-presenter-capability.md), which indexes every part.

## Alternatives considered

**A — Registry in the Electron main process, gate calls out and awaits.** The dialog, the queue and the
pending map all sit next to the window, so the one-dialog-per-window rule is local bookkeeping.
Against: `REQ-TOOLS-020` and `REQ-TOOLS-064` require an `ask` raised when the presenter is unreachable
to resolve *without a prompt and without a hang*. If the registry is in main and the channel to main
is what has failed, the run host has no registry to fall back to and must invent a timeout-based
guess. The gate would also have to make a cross-process call on the decision path merely to discover
that there is nothing to call, which puts the fail-closed branch behind a round trip.

**B — Registry in the run host; the presenter is a capability registered by main over the channel.**
Chosen.

**C — No registry; the gate blocks on a promise per call.** Rejected against `REQ-TOOLS-054`:
duplicate-id rejection, resolve and cancel of unknown ids, bulk cancel, and `REQ-TOOLS-056`'s
"pending approvals are visible in session state as a mapping from request id to payload" all require a
first-class, enumerable map. Recorded because a promise-per-call is the natural first sketch.
