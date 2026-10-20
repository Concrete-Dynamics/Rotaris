## The loop supervisor misses identical calls whose argument key order varies

**Outcome: repaired 2026-10-20 by `loc1-supervisor` under [OQ-364](../../architecture/open-questions.md#oq-364)** (ruled
2026-10-20 under R-072, no directive; a dated note beneath `REQ-ORCH-101`). A tool event's fingerprint in
`packages/engine/src/run/supervisor.ts` is now the tool name and the whole argument **value**: `JSON.parse(args)` written out
with every object's keys sorted at every depth, every member kept, arrays in order and strings quoted, tagged `v`; a text that
does not parse (or nests past the stack) is compared whole as text, tagged `t`. It is computed once per call in `observe()`,
and the repetition trigger, the cycle trigger and `PD-ORCH-016`'s raw-count evidence all read it. Pinned by
`supervisor.test.ts`'s block "OQ-364: REQ-ORCH-101's same action compares the arguments as one JSON value" (five cases red on
the build before, seven guards green before and after) and by `pnpm part-h-proof`'s `loop-reordered` launch (one
`read_file` value in key orders A, A, B: no activation in 20 calls before, three activations — the first `repetition` — one
`circuit_breaker_escalation` and `agent_session_aborted` after). Recorded in
[ADR-0059](../../architecture/adr/0059-the-loop-supervisor-as-an-in-turn-observer.md) (decision 3 and its 2026-10-20 section).
**Measured live** in the default live run's `crlf` scenario on this branch (2026-10-20, pack `2026-10-20T15-45-32-700Z`, endpoint `katalyst`, unmetered, R-068; Windows 11 ARM64, Node 24.18.0 arm64, beside three other trees' 18 Electron processes): four `haet_edit` calls of one value in the key orders A, B, B, B drew the activation
(`trigger: repetition`) after the fourth, and the scenario passed.

`REQ-ORCH-101` fires "repeated action" when the same action is observed four times in a row, and two actions are the same when their tool name and whole arguments are identical. The supervisor compares `tool\0<name>\0<args>`, where `<args>` is the text `JSON.stringify(part.input)` produced in the order the model emitted the keys. A model that sends one object with its keys in different orders therefore reads as different actions.

Seen in the default live run at `cb6d1d5` (2026-10-15, self-hosted reasoning endpoint), scenario `crlf`, session `4dad81df`. A child made 18 failed `haet_edit` calls on one step of `greet.js` (ordinals 14 to 29, 31 and 38). Its argument objects alternated between `{path, content_hash, old_string, new_string}` and `{content_hash, new_string, old_string, path}`. Compared as emitted, the longest run of identical calls was 2; compared with sorted keys it was 5, twice (#14 to #18 and #23 to #27). The trigger should have fired at #17 and never fired: the pack holds no `loop_supervisor_activation` and no classifier request. The loop held the child 179 s of the scenario's 420 s wait, the run did not reach its result inside the wait, and the live run's two `crlf` FAILs ("the run reached its result inside the wait", "the run completed — paused (application_shutdown)") follow from it. On the same loop in the pack of 2026-10-14 04:30 the trigger fired and the run completed in 191 s.

The session record already serialises arguments with sorted keys (`session-writer.ts`), so a person reading the record sees five identical calls the supervisor read as five different ones.

The packs named here live in an ephemeral cloud container (`Rotaris-crw-wt-live2/.live-run/runs/2026-10-15T12-31-04-666Z`) and may be gone; the figures above are the evidence.

## Specs

`REQ-ORCH-101` (the same action is the same tool name and whole arguments; key order is not part of an object's content). `REQ-NOTIFY-108` forbids normalising compared text so that different actions become equal; reading two serialisations of one object as one action makes no different actions equal. If a builder reads that clause otherwise, raise an open question before code. `REQ-ORCH-104` and `PD-ORCH-016` for the classification that follows a trigger.

## Relevant files

- `packages/engine/src/run/supervisor.ts` — `fingerprint` (about line 79) and the four-in-a-row comparison (about line 239).
- `packages/model/src/ai-sdk-client.ts` — line 348 serialises `part.input` in the emitted order.
- `packages/engine/src/run/turn.ts` — passes the arguments text to the supervisor.
- `packages/engine/src/session-writer.ts` — the record's own sorted-key serialisation.
- `apps/desktop/scripts/lib/crlf-scenario.mjs` — the live scenario that met it.
