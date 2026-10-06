## A stop's saved `cancelling` reads `running` again at the run's next save

The stop control (`op: 'cancel'`, REQ-SESSION-186's stop) saves the session `cancelling` when it is accepted
(`Sessions.control`, `s.writer.save('cancelling')`), but the run's own saves on the way to rest go through
`Run.saveRunning`, which writes `running` (or `waiting`) unless a pause was accepted. So the first save after the stop — a
token sample, a child's settle, a permission-mode change — puts the record back to `running` until the teardown writes the
run's end, and every window reads `running` for the rest of the graceful stop. Found 2026-10-06 while building OQ-165's
ruling (fin21), by a probe in `packages/engine/src/run/turn.test.ts` run and removed: start a run holding a tool call, send
`op: 'cancel'`, the record reads `cancelling`; send `setPermissionMode`, the record reads `running`. The explicit cancel's
`cancelling` (OQ-165) is held by `Run.cancelSaved`; the stop's is not, and was left as found, since the ruling names the
explicit cancel only.

## Specs

REQ-MONITOR-130 asks for identical observable state from every surface, and REQ-SESSION-073 names `cancelling` a
transitional status honoured as an active claim; a stop that persisted `cancelling` and then reads `running` while it is
still stopping says something false to every window that did not send it. REQ-MONITOR-124 holds `pausing` until the run has
come to rest on the same terms, which `saveRunning` already honours for a pause. Note that PD-ORCH-005 clause 3 makes a stop
rest `paused`, not `stopped`; which status a stop shows while it comes to rest is not ruled by OQ-165.

## Relevant files

- `packages/engine/src/sessions.ts` — `control`, `case 'cancel'`: the stop saves `cancelling`.
- `packages/engine/src/run/run.ts` — `saveRunning`: `pausing` and, since OQ-165, the explicit cancel's `cancelling` are kept;
  a stop's `cancelling` is not.
- `packages/engine/src/run/turn.test.ts` — the OQ-165 case beside which a stop's case would sit.

## Outcome

Repaired 2026-10-06 by fin22 (bundle `fin22-summary-and-counts`), on OQ-165's ruling's reading. The stop control no longer
writes the status itself: `Sessions.control`'s `cancel` raises the stop and calls `Run.stopAccepted`, which sets the flag
the explicit cancel sets (`cancelSaved`) and saves through `saveRunning`, so the run's every later save on the way to rest
keeps `cancelling` until the teardown writes the rest (`paused`, PD-ORCH-005 clause 3). Pinned by "REQ-SESSION-186 with
OQ-165: the stop's saved `cancelling` holds through the run's later saves until it rests" in
`packages/engine/src/run/turn.test.ts` — the probe the note describes, kept: red on the code before (`running` after the
mode change), green after. No proof presses the composer's Stop run on the built app; `pnpm resilience-proof`'s cancel
scenario drives the explicit cancel through the same `saveRunning` and still reads `user_cancelled`, `paused` at rest.
