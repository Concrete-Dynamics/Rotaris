## A provider wait or a compression is counted as a stall

An agent's stall watch (`StallWatch`, REQ-MONITOR-117) counts the silence since its last model event or token, and is fed
only by the streamed parts of its model steps, its tool calls' start and end, and what the run gives it. Two things a turn
does between model steps feed it nothing:
- REQ-ORCH-091 (c)'s suspended wait on a provider limit (`resilientStep` in `run/ladder.ts`) — the provider's retry-after
  or the local backoff, and indefinitely for an exhausted provider — which begins after the step's error part;
- a context compression's own model call (`CompressionRunner`, ADR-0060), automatic before a step or on a rejection.

A wait or a compression longer than the threshold (90 s by default) is therefore reported as a stall: an
`… appears stalled` warning and a `stall` issue at every evaluation, and the `stalled Ns` badge, beside the wait's own
notice. A child's watch has done this since it was built (2026-09-29); since the repair of
[`a-stalled-child-is-never-shown-stalled.md`](fixed/a-stalled-child-is-never-shown-stalled.md) (2026-09-30, R-067) the
entry agent's watch does it too, and the figure reaches the surfaces.

Noticed 2026-09-30 by acceptance round 1's verifier, and recorded by the repair round of that task, under R-067.
Established by reading the code; not driven.

## Specs

- `REQ-MONITOR-117` to `REQ-MONITOR-119` define a stall as no model event or token for the threshold, and
  `REQ-MONITOR-118` excepts only the wait on tool calls in flight; they do not say whether a wait the run itself imposes
  on a provider limit, or a compression, is silence. `REQ-NOTIFY-083` to `REQ-NOTIFY-087` give the suspended wait its own
  notice, so a stall reported beside it says twice, in two ways, that the agent is waiting — and calls the wait a stall.
  Whether this contradicts the specification or is an open question is not settled here.

## Relevant files

- `packages/engine/src/children/stall.ts` — `StallWatch`: what it is fed and what it counts as silence.
- `packages/engine/src/run/ladder.ts` — `resilientStep`: the backoff and the suspended wait, which feed the watch nothing.
- `packages/engine/src/run/turn.ts` — the automatic and rejection compressions before and around a step.
- `packages/engine/src/run/run.ts` (`Run.turn`, the root's watch) and `packages/engine/src/children/orchestration.ts`
  (`IterationChildren.execute`, a child's watch).
