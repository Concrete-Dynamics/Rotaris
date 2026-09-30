## A child that produces no output is never given its one corrective message

REQ-NOTIFY-111/112's stall recovery is not built. Nothing in the engine watches a delegated child for
`runtime.child_stall_timeout` seconds without output, and nothing composes the one corrective message a
recovery-eligible child is owed. Until 2026-09-27 `runtime.child_stall_timeout` and a role's `stall_timeout`
(REQ-CONFIG-108) were loaded and validated by `packages/config` and read by nothing. `PD-ORCH-004`'s progress rule
is now their only reader, and it reads the window only when `runtime.child_timeout` has already expired.

A child that goes quiet is therefore bounded only by the 1200 s hard limit (REQ-ORCH-088). No stall is detected, and
neither the corrective instruction nor its fixed read-then-edit fallback is ever sent.

Noticed 2026-09-27 while building `PD-ORCH-004` (R-057). That build wired the stall window into the run. Established by
searching the engine and the run host for any reader of the key, and for REQ-NOTIFY-111/112. Not observed on a live
run.

## Specs

- `REQ-NOTIFY-111`: a child reporting a recoverable stuck condition receives a corrective instruction and resumes.
  A fixed instruction stands in where none can be composed. The third recovery escalates under REQ-NOTIFY-105.
- `REQ-NOTIFY-112`: "it produced no output within `runtime.child_stall_timeout`" is recovery-eligible, and such a
  child receives at most one corrective message about its lack of progress. Nothing produces that outcome or that
  message.
- `REQ-CONFIG-113`: `child_stall_timeout` (default 90 s) is the "no-event threshold before a child is reported
  stalled", and `REQ-NOTIFY-100` bounds a child producing no output by it. Nothing reports a child stalled.
- `REQ-ORCH-089`: the stall watchdog that owns this threshold ("per-role override else the default 90 s"), a
  visibility-only evaluation with its cadence, warning, diagnostics issue and stall callback. It is not built either,
  and it is what would detect the stall the recovery above answers. ADR-0012 already records it as unbuilt
  ([`0012-the-delegated-child-scheduler.md`](../../architecture/adr/0012-the-delegated-child-scheduler.md), the
  REQ-ORCH-088 measurement paragraph: "the stall watchdog's badge (REQ-ORCH-089) is not built either").
- `REQ-ORCH-144`: the per-role stall threshold, one of the per-role overrides; REQ-MONITOR-285 names REQ-ORCH-089 and
  REQ-ORCH-144 as the owners of the per-agent stall timeout and its override. Since `PD-ORCH-004` the override reaches
  the run as `Persona.stallTimeoutMs`, read only by the progress rule.

## Relevant files

- `packages/config/src/sections/runtime.ts`: `child_stall_timeout`, parsed with its default.
- `packages/config/src/sections/personas.ts`: a role's `stall_timeout`, parsed.
- `apps/desktop/src/run-host/configuration.ts`: since `PD-ORCH-004`, hands both to the run (`childStallTimeoutMs`,
  `Persona.stallTimeoutMs`).
- `packages/engine/src/children/orchestration.ts`: `execute`, where a per-child stall watch would sit beside the
  hard timeout. `PD-ORCH-004` reads the window there, at the expiry only.
- `packages/engine/src/run/turn.ts`: `STALL_AFTER` (10 s) marks a live row stalled for the transcript
  (REQ-CHAT-164). That is a presentation mark and not this mechanism.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The watchdog and the recovery are built in `packages/engine/src/children/stall.ts` and
wired in `IterationChildren.execute`. The readings are [OQ-127](../../architecture/open-questions.md).

**The watch (REQ-ORCH-089, REQ-MONITOR-117 to REQ-MONITOR-120).** Every attempt of a child's execution runs a
`StallWatch`. It uses the clock ports and never cancels anything. Its threshold is the role's `stall_timeout`, else
`runtime.child_stall_timeout`, else 90 s, and its cadence is REQ-MONITOR-117's. It is fed three things:
- every streamed part of every model step: `TurnSink.event`, `TurnDeps.onModelEvent`;
- every tool call's start and end: `TurnDeps.onToolStarted`, `onToolCompleted`;
- every turn the run starts for the child: its payload or record, its children's reports, a re-prompt, the corrective
  message.

What it writes:
- at every stall evaluation, a `stall` issue carrying the active tools, the last five tool calls and the last model
  event's type (REQ-MONITOR-119); at stall entry, and at REQ-MONITOR-120's throttle after that, a warning on the run's
  warning channel too;
- with a tool call in flight, a `child waiting on tools: …` line in the session log instead (REQ-MONITOR-118);
- when activity resumes, a `child stall recovered: …` line (REQ-MONITOR-120).

**The corrective message (REQ-NOTIFY-111/112).** Some children's turns end `failed` after no output for the whole window,
with no tool call in flight. Such a child is given one corrective message and resumes from the conversation the failed
turn left; the session log says so in a `child corrective message: …` line. The exceptions are the outcomes
REQ-NOTIFY-112 excludes, loop supervision's escalation, the rest and an answer-only route. It gets one message per child
task: across REQ-ORCH-088's fallback retry, and across PD-ORCH-005's resume, which reads from the task's conversation
record whether it was already given one.

Evidence:
- `stall.test.ts`, twelve unit cases over `FakeClock`: the cadence, the throttle, entry and repeat, the recovery, the
  wait on tools, the diagnostics, output against model events, eligibility against every excluded outcome, the
  composed and fixed instructions, and which conversations carry a corrective message.
- `record.test.ts`, two cases: `everRecorded` returns the messages a compression or the retry's restart replaced, and
  skips a row that does not decode (the second added by the third round).
- `children.test.ts`, "a child that produces no output is given its one corrective message", nine end-to-end cases
  through `Sessions`:
  - the stall is warned while the child still runs, and the message follows its task and lets it succeed;
  - a `stall` issue at every evaluation, and the warning only at entry and at the throttle;
  - a second silent failure ends the child `failed` with no second message;
  - a failure inside the window earns nothing;
  - `runtime.child_stall_timeout` of 30 s is the window, at 29 s against 30 s;
  - waiting on a tool call is not a stall, and a stall that ends in output is recorded recovered;
  - a child given its message, paused mid-turn and continued, is not given a second when its resumed step fails silent;
  - a child that waited on its own child past the window, and whose resumed step fails at once, is given nothing.
- `ladder.test.ts`, two end-to-end cases: one message across the fallback retry, and a role's `stall_timeout` as the
  threshold.
- `model.test.ts`: every streamed part reaches `TurnSink.event`.

The positive end-to-end cases fail with the wiring removed. The retry case fails with the once-per-child flag removed,
and the role case fails with the role's window dropped.

**Still not built** (recorded in [`a-stalled-child-is-never-shown-stalled.md`](../a-stalled-child-is-never-shown-stalled.md)):
- the stall callback reaches no host, so no badge draws;
- the root is not watched;
- REQ-MONITOR-135's stall-evaluation leg is missing.

REQ-NOTIFY-112's other three recovery-eligible conditions are not detected, so REQ-NOTIFY-111's third-recovery
escalation is unreachable (OQ-127). No live run was made (the `duress` scenario was not run).

**Corrected by the verifier's first round, 2026-09-29.** The first form wrote the `stall` issue only with each
throttled warning, which narrowed REQ-MONITOR-119's "every stall evaluation" (the throttle of REQ-MONITOR-120 bounds
"the warning itself"). The issue is now written at every evaluation, and the ring eviction that reasoning feared is
the question OQ-127 leaves for a ruling. `children.test.ts`'s "a `stall` issue at every stall evaluation" fails when
the issue is written with the warning only. The timeline words `child_waiting_on_tools`, `child_stall_recovered` and
`child_corrective_message` are outside REQ-ORCH-139's closed vocabulary; the first form minted them without saying so,
and OQ-127 now records the gap and the reading built.

**Corrected by the verifier's second round, 2026-09-29.** Three corrections, each with the reason it replaces:
- *Once per child task.* The first form held the count in a variable of one execution and said "one message per child
  task", having shown only REQ-ORCH-088's retry. PD-ORCH-005's resume is a new execution of the same task, and a
  paused and continued child was given a second message. The resumed execution now reads the task's whole
  conversation record for a corrective message (`hadCorrectiveMessage`, `ConversationRecord.everRecorded`), and
  `children.test.ts`'s "across PD-ORCH-005" fails without it.
- *The silence.* The first form started the silence again only at the attempt's start, at a tool result and at the
  corrective message, so a child that waited on its own children past the window was blamed for that wait: a resumed
  step that failed at once earned the message. Every turn the run starts for the child now starts it again, and
  "a child that waited on its own child past the window" fails without it.
- *The words.* The first round wrote the wait, the recovery and the message as the timeline entries
  `child_waiting_on_tools`, `child_stall_recovered` and `child_corrective_message`, names REQ-ORCH-139 forbids, on the
  reason that the session log was out of reach without editing `Run.turn`. It was not: the run's `warn`, which the
  children already hold, is the channel OQ-76's lines reach the session log through. They are session-log lines now,
  and OQ-127 keeps the question of their words for the owner.

**Corrected by the verifier's third round, 2026-09-29.** Two statements and one edge:
- *The wait on its own children.* The second round's "a wait on its own children is never counted as its silence" is
  true of the silence REQ-NOTIFY-112's recovery reads (`quietFor`) and false of the watch's own evaluation, which reads
  the last event and so still reports such a child stalled while the wait lasts. The runtime view and the
  first-executions row now say so, and that half stays recorded in
  [`a-child-waiting-on-its-own-children-is-reported-stalled.md`](a-child-waiting-on-its-own-children-is-reported-stalled.md),
  repaired 2026-09-30 (acceptance A7, OQ-152): the watch now counts no silence between the child's turns.
- *The recovery.* [`a-stalled-child-is-never-shown-stalled.md`](../a-stalled-child-is-never-shown-stalled.md) still
  said a recovery is recorded in the timeline; it is the session-log line `child stall recovered: …`.
- *A row that does not decode.* `ConversationRecord.everRecorded` parsed every row, the ones before the last
  replacement that `load` never reads included, so one corrupt early row failed a resume `load` allowed. It now skips
  a row that does not decode; `record.test.ts`'s "a row that does not decode is skipped" fails without it.
