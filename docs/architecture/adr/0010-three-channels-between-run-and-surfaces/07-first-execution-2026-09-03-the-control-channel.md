# ADR-0010 — Three channels between the run host and its surfaces — First execution — 2026-09-03, the control channel and the wire bus

Part 7 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## First execution — 2026-09-03, the control channel and the wire bus

*Recorded under GD-10.*

**Built and run:** channel 1 with its first operation — `cancel`, carried as `{op, sessionId, args}` over
channel 5 and across the process boundary with the same shape and the same `{ok, value?}` answer
(`REQ-MONITOR-005/013`); a control against an ended run or an unbuilt operation answers `false` and never
raises (`REQ-MONITOR-007/011`). Channel 2 as `packages/engine/src/run/event-bus.ts`: every event is
recorded before it is forwarded — the writer's commit hand-off carries the wire lines and the run awaits
the bus before proceeding past the operation that raised them (`REQ-SESSION-147`, `REQ-EVENTS-165`); a
blocking consumer that has not taken an event in 5 s is detached with one warning and the run proceeds; a
buffered consumer holds 1,024 and discards beyond, its count only rising (`REQ-EVENTS-164`); a throwing
consumer loses the event for itself only (`REQ-EVENTS-074`); bindings go at teardown so a straggler has
no destination (`REQ-EVENTS-071`). The first consumer is the application consuming its own run
(`REQ-EVENTS-178`): the terminal `result` reaches main as one notice.

**Found: one ordering the record had not stated.** `session.start` and row 0 commit before the run — and
therefore its forward queue — exists. A consumer attached ahead of the start saw the history from
`iteration.start` on. The registry now holds those commits and replays them into the run's queue, so the
tee is whole from the first event (`REQ-EVENTS-069`). Caught by the test that asserts a consumer's view
equals the stored history; not by reading.

**Not exercised:** a consumer in another process (none is licensed, `REQ-EVENTS-178`); the 5 s bound
under a genuinely slow in-process consumer rather than a held promise; the twenty other control ops.
