## summary.md's Tool errors line counts one outcome bucket, not every tool error

`summary.md`'s Warnings section prints `- Tool errors: <n>` from the metrics' tool-outcomes histogram, reading only the
bucket named `tool_error` (`warningLines` in `packages/engine/src/run/summary.ts`). That histogram (REQ-SESSION-139)
buckets a call by its `outcome_kind` first and derives `tool_error` only for a failed record that carries none
(`outcomeOf` in `packages/engine/src/export.ts`). So a failure whose record carries an `outcome_kind` never reaches the
line: a call refused at the tool gate as `invalid_request`, a terminal `execution_error` or `sandbox_unavailable`, and a
failed MCP call (`outcome_kind: 'mcp'`, `apps/desktop/src/run-host/mcp.ts`). REQ-SESSION-136 files each of those as a
`tool_error` issue, and the same file's Metrics line `- Issues: … (… tool_error <n>)` counts them. The line also counts a
timeout whose record carries `failure_kind: 'timeout'` and no `outcome_kind` (it derives to `tool_error`), which the
Timeouts line already counts.

Found by the autopsy of the final default live run at `c2a9444` (2026-10-06, finding M4), from the pack
`.live-run/runs/2026-10-06T17-41-48-175Z/`. The pack holds no `summary.md` (a separate harness defect, noted beside this
one), so the file was rebuilt from the pack's `workspace.db` by `renderSummary`'s rules:

- the requirements session (`requirements/autopsy.txt` lists the refusal: `invalid_request ×1 [write_file] ordinals 62`)
  holds failed records #24, #62, #66, #70 and #80: one `shell_failure` (#70), one `invalid_request` (#62), three with no
  `outcome_kind`. Its file would read `- Issues: 5 (terminal_shell_failure 1, tool_error 4)` beside `- Tool errors: 3`;
- the terminal session holds three `execution_error` records (#6, #8, #12), one `shell_failure` (#7) and a failed
  `artifact_read` (#14). Its file would read `- Issues: 6 (permission_denied 1, terminal_shell_failure 1, tool_error 4)`
  beside `- Tool errors: 1`.

A person reading one file sees two tool-error counts for one session.

## Specs

REQ-SESSION-140: the Warnings section covers "tool errors" beside "terminal failures, suspicious successes and
timeouts". REQ-SESSION-136 says what a tool error is: of the outcome-driven issues, a shell failure, a suspicious success
and a timeout each have their own kind, and "any other failure → `tool_error`". The line counts neither that set nor
the issues filed for it. REQ-SESSION-139's histogram is not wrong: it classifies by `outcome_kind` as that requirement
says; it is the wrong figure for this line.

## Relevant files

- `packages/engine/src/run/summary.ts` — `warningLines`, the `- Tool errors:` line.
- `packages/engine/src/export.ts` — `outcomeOf` and `sessionMetrics`, where the histogram is built and where a count of
  REQ-SESSION-136's tool errors belongs.
- `packages/agent-tools/src/gate.ts` — `outcomeIssues`, the rule that files a `tool_error` issue (any failure but a shell
  failure, a suspicious success, a timeout, or a call the run's rest cut short, PD-ORCH-005).
- `apps/desktop/src/run-host/mcp.ts` — an MCP call's record carries `outcome_kind: 'mcp'`, success or failure.
