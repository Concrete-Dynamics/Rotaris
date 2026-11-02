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
[`a-stalled-child-is-never-shown-stalled.md`](a-stalled-child-is-never-shown-stalled.md) (2026-09-30, R-067) the
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

## Outcome

**Repaired 2026-10-01, under the reading of [OQ-173](../../architecture/open-questions.md)** (raised by this repair; the
ruling stays the owner's). Confirmed on the branch before the change by three failing cases in `ladder.test.ts`: the
entry agent's and a child's 120 s suspended wait on a provider limit each wrote `stall` issues from 90 s, and by the
compression case below, whose 100 s compressing call wrote three.

- `StallWatch.imposedWait` (`packages/engine/src/children/stall.ts`) marks a wait the run holds the agent in between two
  model steps; the returned release ends it, however the wait ends (`duringImposedWait`). While one is held, an
  evaluation past the threshold reports the wait through the watch's `imposed` sink and no stall, and calls the callback
  with *not stalled*, so no `stall` issue, no `… appears stalled` warning and no stalled seconds. A stall under way when
  the wait begins is over and not recovered (OQ-153). The release restarts the silence, as a tool call's result does.
- `resilientStep` (`packages/engine/src/run/ladder.ts`) holds one around the transient or validation backoff (`backoff`)
  and the suspended wait (`provider_limit`), through `LadderDeps.imposedWait`; `runTurn` (`packages/engine/src/run/turn.ts`)
  holds one around the automatic compression and the condensation on a rejection (`compression`), and hands the port to
  the ladder; `TurnDeps.onImposedWait` is wired to the root's watch in `Run.turn` (`packages/engine/src/run/run.ts`) and
  to each child's in `execute` (`packages/engine/src/children/orchestration.ts`).
- The silence is logged in REQ-MONITOR-118's manner, `… waiting on a provider limit: … the wait is the run's own and not a
  stall (OQ-173)` (`stallImposedWaitLine`), to the session log through the run's `warn`; the suspended wait's own notice,
  header and `model_wait` issue (REQ-NOTIFY-083 to REQ-NOTIFY-087) are unchanged and remain what the surfaces state.
- Pinned by `ladder.test.ts`, "REQ-MONITOR-117..119 with REQ-ORCH-091 (c) (OQ-173): a wait the run imposes is not a
  stall" (the entry agent's and a child's 120 s wait: no `stall` issue, no stalled seconds in any published record, one
  wait line; the wait's end restarts the silence), `compression.test.ts`, "REQ-MONITOR-117..119 (OQ-173): a compression's
  own model call, automatic or on a rejection, is a wait the run imposes …" (fails with `compressing` reduced to the bare
  pass: `[ 'stall', 'stall', 'stall' ]`), and `stall.test.ts`'s three OQ-173 cases. Shown in the built app by
  `resilience-proof`'s new `quota-wait` scenario: with `child_stall_timeout: 3`, a 10 s retry-after wait completes with
  no `stall` issue, and the session log reads `agent waiting on a provider limit: orchestrator (…) has no model event or
  token for 3 seconds; the wait is the run's own and not a stall (OQ-173)`.
- Not covered, and said so in OQ-173: the dispatch layer's own retries inside one model step (REQ-CONFIG-086's
  `num_retries`) send no event while they wait and stay counted as the step's silence.

