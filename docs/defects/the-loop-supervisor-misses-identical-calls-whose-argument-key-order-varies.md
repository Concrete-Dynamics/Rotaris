## The loop supervisor misses identical calls whose argument key order varies

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
