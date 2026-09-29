## A detached call still writes through its tool gate and its stream

When a stop's 30 s grace gives up on a child execution, PD-ORCH-005's rest detaches it. The engine writes nothing more
for it: no row settled, nothing recorded and no report (`IterationChildren.detached`, `TurnDeps.detached`). The call's
own tool gate is a different path, and so is a model step's streaming. When a call that ignored its abort returns after
the run ended, its gate still writes through its sink (the `tool_calls` ring, the `tool.finish` event, an issue). A
model step that ignored its abort likewise still writes the rows it streams. Nothing closes a run's tool ports at
teardown. Before phase 3 the run waited for such a call forever instead, so it never ended and nothing straggled.
Found by phase 3's third adversarial review, by reading.

## Specs

REQ-SESSION-094: "Straggling events MUST have no binding through which they could append to the finished session or
trigger a later run's hooks." The gate's sink and the stream's row writes are such a binding while a detached call is
still running.

## Relevant files

- `apps/desktop/src/run-host/tools.ts`: each agent's port and its gate's `writerSink`. There is no disposal at run end.
- `packages/agent-tools/src/gate.ts`: `finish` and the diagnostics write through `deps.sink` after the executor returns.
- `packages/engine/src/run/turn.ts`: the model step's streamed rows (`upsertMessageRow`) are written while it streams.
- `packages/engine/src/children/orchestration.ts`: `detached`, which covers only the engine's own writes.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. `ToolPort` gains `close(cutOff)`, and `Run.teardown` closes every port the run built
(`Run.closePorts`: the root's and each child's) as its first step, before anything terminal is written. The run host's
`writerSink` (`apps/desktop/src/run-host/tools.ts`) keeps the calls its gate opened. At the close it settles each one
still open, in the `tool_calls` ring with its `tool.finish`, as failed with the statement the engine hands it: the rest's
interrupted statement, or the cut-off one when no rest is named. From then on it drops every write: no settle, no
`tool.finish`, no issue, no audit or timeline entry, no approvals mirror. The port's gate fires no `post_tool` hook after
the close either, since the run's hooks write into its session. The close lands before the terminal pair, so nothing
the port settles can follow `result`. A model step whose `TurnDeps.detached` reads true (a child the rest gave up on,
or the root since the repair of `a-root-call-that-ignores-the-stop-holds-the-run-open.md`) streams no row, grows or
settles none, marks none stalled, and counts no usage (`turn.ts`: the step's sink, its settle, `observeRequestUsage`).
A stop that rests nothing — the explicit cancel, a stop the run raises itself, a plan cycle's — detaches too: once
`finalize` has settled the children's records, `Run.turn` awaits their executions within what is left of the 30 s grace
and detaches what still runs (`IterationChildren.outlast`), so a child's step that ignored the cancel writes nothing
either. *As first repaired the guards read only a rest's detach: under the explicit cancel the run settled the children
and ended without detaching them, so a child step that ignored the cancel still appended its row and `usage.update`
after `result`, and this note's sentence "A model step that ignored its abort likewise still writes the rows it streams"
still held there when the note was moved here (found by the verifier of the repair, repaired the same day).*

Evidence: `apps/desktop/src/run-host/tools.test.ts` ("a port closed at its run's end settles the call it still has open,
and the call writes nothing through its gate when it returns") drives a real port and gate over a store. The close
settles the open ring entry and its `tool.finish`. The call's late, failed return then writes no event, ring change,
issue, timeline or audit entry, and fires no `post_tool` hook. `packages/engine/src/children/children.test.ts` ("a
detached call no longer writes through its tool gate or its stream") has four cases. Teardown closes both agents' ports
before `session.end`, with the cut-off statement after a completed run and the stop's after a stop. A child's and a
root's model step that the stop's grace gave up on append no row, settle none and record no `usage.update` when they
return. A fifth, added by the repair round, has the explicit cancel land while the root honours it and a child's step
does not: the run waits for the child only to the grace, then ends, and the step's late return appends nothing; it failed
on the first repair (the run ended at once and the row and `usage.update` followed `result`). The tools case also pins
the sink's own drop of a late settle: the writer is not reached at all. Every case failed on the code before the repair. Reverting each limb in turn (the teardown close, the usage
guard, the delta guard, the settle guard, the sink's drop, the close's settle, the hook guard) turned its case red. OQ-96's
bullet "An execution the stop's grace gives up on" is reported back in place.

Not covered: what an executor does itself when it returns late (a file it writes, a process it started) is the
executor's, not the gate's, and no binding of the session stops it.
