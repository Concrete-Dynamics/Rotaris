## A foreground terminal call the run cancels reads as a timeout

When the run cancels a foreground `terminal` call (the tool context's signal aborted: a pause past REQ-ORCH-134's tool
deadline, a stop, a quit, the explicit cancel, an agent's cancellation or its limit), `ForegroundSession.run` ends the
process tree and restarts the session as a hard timeout does, and then reports the call **as** a hard timeout: exit code
124, `timedOut: true`, error "the call was cancelled". The tool's observation turns that into `failure_kind` and
`outcome_kind` `timeout`, severity `error`, `error_class` `TimeoutError`, output under `[partial_terminal_output]`, and the
detail "The command exceeded its timeout of N seconds; …"; the gate then files a `terminal_timeout` issue at `error`
("A terminal command exceeded its timeout."), and the metrics document and `summary.md` count it under Timeouts.

Seen in the final default live run at `a68f121` (2026-10-07, the self-hosted endpoint), session `5df89df3` (terminal),
tool call `#36`: the re-run child's 45 s wedge ran 3,505 ms before the quit cut it, and is recorded `failed`, `timeout`,
exit 124, "The command exceeded its timeout of 100 seconds; … (the call was cancelled)"; issue 10 is `terminal_timeout` at
`error`; `summary.md` reads "Timeouts: 1" and "terminal_timeout 1". The console's own NOTE said the hard cap was not reached
that run. On Continue, the agent would read that its wedge hit the 100 s bound. The same encoding answers a cancel that
lands during OQ-144's first-call handshake, where the command was never written.

**Repaired 2026-10-07 (fin31), under [`PD-TOOLS-013`](../../product/directives.md#pd-tools-013) (OQ-226).**
`ForegroundResult` gains `cancelled` (`'before'`, `'during'`), and both abort branches of `ForegroundSession.run` return no
exit code and `timedOut: false`, keeping the reset, the restore and `CANCELLED_ERROR`; the hard-timeout branch alone keeps
124. `terminal/index.ts` assigns the failure kind `interrupted` ahead of `timeout`, `error_class` `InterruptedError`,
`is_error` true at severity `warning`, output under `[terminal_output]`, and a detail that the run cancelled the call
(before the command was written, or before it completed), what became of the session and what was restored, naming no
timeout; `classify.ts` adds `interrupted` to both vocabularies and to test 1. The gate's existing `interrupted` branch then
marks the result interrupted and files no issue, and the metrics count it under `interrupted`, not Timeouts. **Pinned by**
`packages/agent-tools/src/terminal/terminal.test.ts` (the handshake cancel case and the new mid-command cancel case, both
red before; the classify case, red before), `packages/agent-tools/src/gate.test.ts` and
`packages/engine/src/run/summary.test.ts` (guards: no issue, Timeouts 0), and `pnpm driver-proof`'s launch 13d, which quits
while `sleep 60` runs under a 100 s bound: red on the source before (`timeout`, exit 124, "exceeded its timeout of 100
seconds", a `terminal_timeout` issue at `error`), green after (`interrupted`, no exit code, `InterruptedError`, warning,
no issue).

## Specs

- REQ-TOOLS-097: the hard-timeout observation of REQ-TOOLS-099 is returned "on reaching" the hard bound, and a cancel does
  not reach it.
- REQ-TOOLS-099: the detail says the command exceeded its timeout, which is untrue for a cancel.
- REQ-TOOLS-179: 124 is reserved for a hard timeout.
- PD-ORCH-005 clause 3: a call a quit cut off is recorded as interrupted.
- REQ-SESSION-136's `terminal_timeout` issue is filed for a timeout that did not happen.

The vocabularies of REQ-TOOLS-100 and REQ-TOOLS-112 have no kind for a cancel; OQ-226 rules that one is added, under
PD-TOOLS-013.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`: `CANCELLED_ERROR`, the cancel before the command is written (in
  `run`, `opts.signal?.aborted`), and the shared `timeout or abort` branch at the end of `run`.
- `packages/agent-tools/src/terminal/index.ts`: the failure kind from `r.timedOut`, the hard-timeout detail, `error_class`.
- `packages/agent-tools/src/terminal/classify.ts`: `FailureKind`, `OutcomeKind`, REQ-TOOLS-112's test 1.
- `packages/agent-tools/src/gate.ts`: `outcomeIssues`, which files `terminal_timeout` for the `timeout` kind.
- `packages/engine/src/export.ts`: `sessionMetrics`, which counts the call under `timeouts`.
