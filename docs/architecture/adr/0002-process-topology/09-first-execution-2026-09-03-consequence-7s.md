# ADR-0002 — Process topology — First execution — 2026-09-03, consequence 7's narrow request back to main

Part 9 of 11 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## First execution — 2026-09-03, consequence 7's narrow request back to main

*Recorded under GD-10.*

**Built and run:** the workspace service's restore reaches the run host through a request back to main
(`ServiceAskEnvelope` on the process protocol, correlated by `ask`, answered by `ServiceAnswerEnvelope`),
which main forwards to the run host's existing requests and answers, every hop bounded (consequence 11).
Main supplied the save dialog, the open dialog and three message boxes, and did no work of its own
(`REQ-SHELL-150`): the backup and the restore ran in the workspace service, the refusal lease in the run
host. The two children never talked directly.

**Found: nothing in this record.** The route is a message shape and a forwarder.
