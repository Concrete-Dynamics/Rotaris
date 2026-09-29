## A stalled child is never shown stalled

Since 2026-09-29 each delegated child's execution runs a stall watch (`StallWatch`). It writes a warning and a `stall`
issue when the child goes silent, and it calls its stall callback on every evaluation with whether the child is
stalled. `IterationChildren.execute` passes that callback nowhere. No host listens to it, so:
- nothing reaches the child's `AgentRecord`;
- no surface draws a stalled badge, a stalled activity text or a countdown that advances with each evaluation;
- a recovery is written as a session-log line (`child stall recovered: …`) through the run's `warn` (OQ-127), and is
  not notified to any surface.

The entry agent (the root) is not watched at all. The watch is built into a child's execution only, and wiring it into
the root's turn would mean editing `Run.turn`, which another bundle owned in the round that built the watch.

The same missing listener leaves REQ-MONITOR-135's stall-evaluation leg unbuilt: no steering prompt is injected from a
stall evaluation. ADR-0010 reading (d) records that leg as waiting on the stall detector, which now exists.

Noticed 2026-09-29 while building the watch under R-067
([`a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`](fixed/a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md)).
Established by reading the code: nothing in `packages/engine/src/run/run.ts`, `sessions.ts` or the run host passes a
stall callback.

## Specs

- `REQ-ORCH-089`: "a stall callback fires on each evaluation with stalled/recovered so a UI badge can update". The
  callback fires, and no UI can update from it.
- `REQ-MONITOR-119`: every stall evaluation must "invoke the host's stall callback", which "fires on every evaluation
  … so a host countdown advances at that rate". `REQ-MONITOR-120`: "When activity resumes, recovery must be logged and
  notified." It is logged and not notified.
- `REQ-MONITOR-117`: "Each agent is evaluated for a stall". The root is not.
- `REQ-MONITOR-135`: injection "opportunistically from stall evaluations".
- `REQ-TUI-139` describes the stalled activity text for the terminal interface. Which surface of this product owes a
  badge is for `REQ-SHELL-023`'s surfaces to say. OQ-127 records the readings the watch was built under.

## Relevant files

- `packages/engine/src/children/stall.ts`: `StallWatch`, with its `evaluated` sink.
- `packages/engine/src/children/orchestration.ts`: `execute`, where the sink is a no-op.
- `packages/engine/src/run/run.ts`: `Run.turn`, the root's turn, which has no watch.
- `packages/engine/src/sessions.ts`: `toAgentRecord`, where a stalled state would reach the record.
