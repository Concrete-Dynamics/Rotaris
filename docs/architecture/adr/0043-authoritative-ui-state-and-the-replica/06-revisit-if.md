# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Revisit if

Part 6 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

## Revisit if

The measured cost of two boundary crossings threatens `REQ-ORCH-155`'s 100 ms — in which case transfer a
message port from the run host directly to the renderer for the two update channels, keeping main for
control and notices only, which also removes the relay's ordering obligation in consequence 3. Or the
reconcile counter shows gaps occurring in normal operation — in which case the fault is a lossy hop or an
undersized subscriber queue, and the remedy is to fix that hop, **not** to soften the reconcile into
something cheaper or to reintroduce a timer.
