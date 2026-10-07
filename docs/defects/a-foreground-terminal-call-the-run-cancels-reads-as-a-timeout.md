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
