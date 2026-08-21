---
req-id: SWR-2911
status: approved
trace: required
test: required
type: technical
derived-from: SWR-1546
title: "Tool outcome histogram covers every recorded tool call"
epic: SWR-1500
date: 2026-08-11
---

# SWR-2911 — Tool outcome histogram covers every recorded tool call

`SWR-1546` requires `metrics.json` to be a high-signal inspection file. Its
`tool_outcomes` histogram was built by counting the `outcome_kind` field of
`evidence/tool-calls.jsonl`, but only the `terminal`/`bash` tool ever carries
that field — `classify_terminal_observation` is terminal-specific and every
other tool records `outcome_kind: null`. The histogram therefore filed roughly
96% of calls (765 of 796 across the sessions on disk at authoring time) under
`unknown`, hiding a success/error split that the same record already stores in
`status` and `is_error`.

`tool_outcomes` shall bucket every recorded tool call. A call carrying a
classified terminal `outcome_kind` keeps it; any other call is bucketed from
the facts already recorded, so `unknown` means "genuinely unclassifiable",
not "not a terminal tool".

## Acceptance criteria

- A tool call with an `outcome_kind` is counted under that kind, unchanged
  (`success`, `shell_failure`, `suspicious_success`, `timeout`,
  `invalid_request`, `execution_error`, `soft_pause`, `background_running`,
  `background_terminal`).
- A tool call without an `outcome_kind` and without an error is counted as
  `success`.
- A tool call without an `outcome_kind` that has `is_error` true or
  `status: "error"` is counted as `tool_error`, matching the issue kind
  already recorded for it.
- A tool call with `status: "rejected"` is counted as `rejected`, not folded
  into `tool_error`, so permission rejections stay distinguishable from tool
  failures.
- A record carrying neither a usable `status` nor an error flag is counted as
  `unknown`.
- The derived buckets do not change `terminal_shell_failures`,
  `terminal_suspicious_successes`, or `terminal_timeouts`, which continue to
  read the terminal-only kinds.

## Test coverage

Unit coverage at the `build_metrics` seam in
`tests/unit/test_session_diagnostics.py`: write a `tool-calls.jsonl` mixing a
classified terminal call, a plain successful tool call, an errored non-terminal
call, and a rejected call, then assert the resulting `tool_outcomes` histogram
and the unchanged terminal counters. No separate user-flow E2E test — the
originating product flow (session diagnostics inspection, `SWR-1546`) is
already covered end to end.

Derived from: [SWR-1546 — Session directories must include high-signal inspection files](../1500-sessions-diagnostics.md)

Epic: [Session Persistence & Diagnostics](../1500-sessions-diagnostics.md)
