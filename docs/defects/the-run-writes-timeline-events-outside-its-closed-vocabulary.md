## The run writes timeline events outside its closed vocabulary

REQ-ORCH-139 closes the names a run may give its timeline events to the timeline-event vocabulary of domain 01's
Data & Formats (and the lists other domains' Data & Formats add, such as domain 05's permission events and the
checkpoint and hook events), and forbids "any name outside those vocabularies". The engine writes many timeline
names that no list in `docs/spec/` or `docs/product/` has. A grep of `appendTimeline`, `appendTimelineEntry` and
`insertTimeline` call sites outside the tests, on 2026-09-29, finds these, named in no specification or directive:

- `packages/engine/src/run/run.ts`: `entry_model_switched`, `entry_reasoning_switched`, `iteration_paused`,
  `iteration_resumed`, `model_override`, `run_continuation_intent`, `run_pause_refused`, `run_pause_requested`,
  `steering_submitted`, `todo_edited`;
- `packages/engine/src/run/crash.ts`: `approval_withdrawn`, `iteration_paused`;
- `packages/engine/src/run/ladder.ts`: `model_exhausted`, `model_fallback`, `unresponsive_model_fallback`;
- `packages/engine/src/run/turn.ts`: `loop_supervisor_activation`, `steering_injected`;
- `packages/engine/src/run/compression.ts`: `context_compressed`;
- `packages/engine/src/children/orchestration.ts`: `child_timeout_fallback` (the vocabulary's word for the fact looks
  to be `fallback_model`) and `context_selection`. The three OQ-109 records (`child_waiting_on_tools`,
  `child_stall_recovered`, `child_corrective_message`) were written here until the verifier's second round of
  2026-09-29 moved them to the session log, as OQ-76 did; they were never on `main`;
- `packages/engine/src/session-writer.ts`: `child_paused`, `child_resumed`, `pause_resolved`, `prompt_queued`,
  `prompt_triggered`, `run_paused_message_limit`, `transcript_cleared`.

The issue kind `child_timeout_fallback` (orchestration.ts) is likewise outside the issue-kind vocabulary, which has
`timeout_fallback`. Some of these may be settled by a record this note's author did not find; each needs either a
word in a vocabulary or a move to another record (OQ-76's precedent chose the session log). Noticed on 2026-09-29
while answering the verifier's finding on OQ-109's three words; not repaired, since renaming would break every reader
of the store and the export.

## Specs

REQ-ORCH-139 (the closed timeline-event and issue-kind vocabularies; domain 01, Data & Formats, "Timeline event
vocabulary" and "Issue kinds").

## Relevant files

- `packages/engine/src/run/run.ts`, `run/crash.ts`, `run/ladder.ts`, `run/turn.ts`, `run/compression.ts` — the root's
  run and its ladder.
- `packages/engine/src/children/orchestration.ts` — the children's execution.
- `packages/engine/src/session-writer.ts` — the writer's own timeline entries.
- `docs/spec/01-run-orchestration.md` — the vocabulary.
- `docs/architecture/open-questions.md` — OQ-76 and OQ-109, the two places this gap was raised for one mechanism each.
