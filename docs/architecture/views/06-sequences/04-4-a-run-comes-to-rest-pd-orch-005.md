# Sequences — the flows the runtime view does not own — 4. A run comes to rest (PD-ORCH-005)

Part 4 of 4 of [the sequences](../06-sequences.md), which indexes every part.

## 4. A run comes to rest (PD-ORCH-005)

`packages/engine/src/run/run.ts` (`pause`, the stop listener, `turn`'s `finally`, `leaveIterationOpen`, `teardown`) →
`children/orchestration.ts` (`beginRest`, `execute`, `rest`) → `children/scheduler.ts` (`hold`) →
`run/turn.ts` → `session-writer.ts` (`restChild`, `recordIterationInterruption`, `recordAgentTerminal`). A pause is
drawn; a stop and a quit differ where marked.

```mermaid
sequenceDiagram
  autonumber
  participant U as person (main)
  participant S as Sessions
  participant R as Run
  participant P as tool ports
  participant IC as IterationChildren
  participant C as a child's execution
  participant W as SessionWriter

  U->>S: session.control {op: pause}
  S->>R: pause()
  alt the plan gate holds
    R-->>S: false (clause 11)
  else accepted
    R->>W: save('pausing'), run_pause_requested
    R->>P: withdrawPending('pause') — each waiting call: blocked, interrupted
    R->>R: release every provider-limit wait; arm the tool deadline (clock port)
    R->>IC: beginRest() — scheduler held, waiting parents woken
    Note over R,C: a stop or a quit: the same withdrawal and beginRest from the stop listener, then the run signal aborts
    C->>C: the step in flight finishes; calls not started are recorded "not run"; no retry, fallback or summarising call
    C->>W: restChild(task, 'pause', resume state) — paused, child_paused
    R->>IC: rest('pause') — waits for every execution (a stop or a quit: within 30 s, then detaches the rest), pauses the unstarted where they stood
    R->>R: read the cause again — the explicit cancel meanwhile: every agent cancelled, the iteration closed
    R->>W: recordIterationInterruption, iteration_paused — the iteration stays open
    R->>W: teardown: agent_terminals (a pause leaves them running; a stop or a quit records its end, then ends them)
    R->>W: endRun('paused') — the lock released
  end
```

- **What does not happen.** No `iteration.end`, checkpoint, `iteration_end` hook or count for the open iteration; no
  summary, report or terminal state for a paused child; no model call after the pause beyond the step in flight.
- **A crash writes none of this.** The next repair or continue does (`run/crash.ts`): the interruption `crash` on the
  open row, its unfinished agents paused, a dead run's unanswered calls answered, its approvals withdrawn, its
  background sessions ended. Loading the session writes nothing, and the user's cancel of one crash-left child while the
  session rests records none of it but the cancelled agents' own cut-off calls, which no later record reaches (answered
  as interrupted, `answerOpenCalls`): it cancels that child from where it stood (`Sessions.cancelPausedAtRest`, OQ-101).
- **The explicit cancel is not a rest.** The reserved run id's final stop cancels the waits, drains and finalizes as
  before: every agent `cancelled`, the iteration closed — including when it arrives while a pause or a stop is still
  coming to rest, or later while teardown runs (the iteration this run left open then closes before the run's result is
  built; a cancel after that is refused). It ends the agents' background sessions as a stop does, and lets a child
  summarising during REQ-ORCH-080's drain finish (OQ-96).
- **The next continue resumes it** (`03-runtime-view.md` §2): the open iteration first, the same root and task, every
  paused agent moved back and carrying on from its record, told of its background sessions, the root handed a new
  message as its next. It runs under the intent it started with, carried and unclassified (PD-ORCH-005 clause 40, OQ-162):
  the Continue action makes no classification call, and a continue by message's classification governs from the run's
  next iteration. At its first model step each resumed agent's persona definition is compared with the fingerprint its
  record kept (PD-ORCH-005 clause 14, OQ-105); when they differ the run writes a `resumed_under_changed_instructions`
  warning issue and a transcript `system` row naming the agent, and keeps the new definition, so a change is stated once. Declined
  ("continue without them"), its paused agents end `cancelled` and it closes before the new run's first iteration
  (`closeLeftOpenIteration`).
