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
