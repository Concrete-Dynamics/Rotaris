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
  to be `fallback_model`) and `context_selection`. The three OQ-127 records (`child_waiting_on_tools`,
  `child_stall_recovered`, `child_corrective_message`) were written here until the verifier's second round of
  2026-09-29 moved them to the session log, as OQ-76 did; they were never on `main`;
- `packages/engine/src/session-writer.ts`: `child_paused`, `child_resumed`, `pause_resolved`, `prompt_queued`,
  `prompt_triggered`, `run_paused_message_limit`, `transcript_cleared`.

The issue kind `child_timeout_fallback` (orchestration.ts) is likewise outside the issue-kind vocabulary, which has
`timeout_fallback`. Some of these may be settled by a record this note's author did not find; each needs either a
word in a vocabulary or a move to another record (OQ-76's precedent chose the session log). Noticed on 2026-09-29
while answering the verifier's finding on OQ-127's three words; not repaired, since renaming would break every reader
of the store and the export.

*Corrected 2026-10-01 by acceptance finding A29's repair, which read every timeline write with a gate rather than a grep.*
The list above missed six names no list has: `steering_not_delivered` (`run.ts`), `approval_withdrawn` and
`question_withdrawn` (`packages/agent-tools/src/gate.ts`, as well as `crash.ts`), `prompt_edited` and `prompt_removed`
(`session-writer.ts`, through `queuedMove`), and `notice` (`apps/desktop/src/main/index.ts`, REQ-NOTIFY-268's entry, whose
type no requirement names). `artifact_published` (`packages/engine/src/artifacts/store.ts`) looked like a seventh and is
REQ-LIBRARY-092's word. Beyond `child_timeout_fallback`, five issue kinds are outside the issue-kind vocabulary:
`unresponsive_model` and `model_fallback` (`ladder.ts`, whose words are `llm_unresponsive` and `quota_fallback`), and
`model_wait`, `validation_llm_error` (`ladder.ts`) and `compression_failed` (`compression.ts`), which have none.

## Outcome — partly repaired 2026-10-01 under R-067 (acceptance A29); the rest is OQ-157

**Repaired where a vocabulary has the word for the fact.** The ladder's same-tier change writes `quota_fallback_model` and
the `quota_fallback` issue (was `model_fallback` for both); its unresponsive-model fallback writes `llm_unresponsive` as
entry and issue (was `unresponsive_model_fallback` and `unresponsive_model`); the children's hard-timeout retry writes
`fallback_model` and the `timeout_fallback` issue (was `child_timeout_fallback` for both). Pinned by
`packages/engine/src/run/ladder.test.ts` (the REQ-ORCH-091 a/b, REQ-ORCH-090 and REQ-ORCH-088 cases, six of which fail on
the old names) and by `apps/desktop/scripts/resilience-proof.mjs`, which reads the three in the built app.

**The vocabulary is now closed in the source.** `tools/check-timeline-vocabulary.mjs`, run by `pnpm lint`, reads every
timeline write in the product's source and fails on a name in no vocabulary, and on `permission_mode_downgraded`, which
REQ-SANDBOX-104 still states but `PD-TOOLS-002` withdrew (its `FORBIDDEN`); domain 01's list is read from the
specification so the two cannot drift. Its test (`tools/check-timeline-vocabulary.test.ts`) fails on the old code, pins
`AWAITING`'s names, and checks that each other domain's word is stated by the requirement cited for it.

**Not repaired: twenty-eight names** with no word in any list, held by the gate's `AWAITING` and raised as
[OQ-157](../../architecture/open-questions.md) — whether the specification gains their words or the facts move to another
record is a ruling, not a repair: three of them are durable memory two ADRs decided and the product reads back, eight are
`PD-ORCH-005`'s rest-and-resume record the live run's checks read, and the session log OQ-76 and OQ-127 chose would carry
routine facts as warnings or drop them. This note stayed open until that ruling was built (2026-10-06, below).

## Outcome — repaired 2026-10-06: ruled as built, the words given ([R-071](../../product/requests.md#r-071))

The owner ruled OQ-157 as recommended, with OQ-53, OQ-54, OQ-76 and OQ-127: the specification gains the words, and
nothing in the store moved or was renamed. One amendment adds every name the gate's `AWAITING` held and the five raised
beside it: [`PD-ORCH-014`](../../product/directives/pd-orch-014.md#pd-orch-014) extends REQ-ORCH-139 with fifteen run facts, OQ-127's
three watchdog words (`waiting_on_tools`, `stall_recovered`, `corrective_message`, written since the commit before this
one) and the three issue kinds (`model_wait`, `validation_llm_error`, `compression_failed`), and names REQ-NOTIFY-268's
entry `notice`; [`PD-CHAT-009`](../../product/directives/pd-chat-009.md#pd-chat-009) gives the chat domain its thirteen words for the
user's chat controls; [`PD-TOOLS-011`](../../product/directives/pd-tools-011.md#pd-tools-011) gives domain 05 OQ-76's `user_away` and
`user_returned`, now written by `UserPresence`, and the audit's `user-input` and `user` (OQ-54).
`tools/check-timeline-vocabulary.mjs` cites each name to its directive in `VOCABULARY`, and its `AWAITING` is empty, so a
name in no vocabulary fails `pnpm lint` again. Pinned by `tools/check-timeline-vocabulary.test.ts` (the empty `AWAITING`,
each directive's names, and each directive's entry stating its words in backticks), `presence.test.ts` and
`contracts.test.ts`.

## Specs

REQ-ORCH-139 (the closed timeline-event and issue-kind vocabularies; domain 01, Data & Formats, "Timeline event
vocabulary" and "Issue kinds").

## Relevant files

- `tools/check-timeline-vocabulary.mjs` — the gate, the vocabulary with its citations, and `AWAITING` (OQ-157).

- `packages/engine/src/run/run.ts`, `run/crash.ts`, `run/ladder.ts`, `run/turn.ts`, `run/compression.ts` — the root's
  run and its ladder.
- `packages/engine/src/children/orchestration.ts` — the children's execution.
- `packages/engine/src/session-writer.ts` — the writer's own timeline entries.
- `docs/spec/01-run-orchestration.md` — the vocabulary.
- `docs/architecture/open-questions.md` — OQ-76 and OQ-127, the two places this gap was raised for one mechanism each.
