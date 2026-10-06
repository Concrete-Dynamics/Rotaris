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

## Outcome

Repaired 2026-10-06 by fin23 (bundle `fin23-summary-and-live-checks`). The line now counts what REQ-SESSION-136 calls a
tool error: the issues record's `tool_error` entries, which the tool gate files for every failed call that is not a shell
failure, a suspicious success or a timeout (`outcomeIssues` in `packages/agent-tools/src/gate.ts`), whatever
`outcome_kind` the call's record carries. It reads them from the metrics' `issues_by_kind`, as the Metrics section's Issues
line does, so the file can no longer give two counts for one thing, and it says where the count comes from:
`- Tool errors: <n> (counted from the issues record, where each failed call that is not a terminal failure, suspicious
success or timeout is a tool_error entry)` (`warningLines` in `packages/engine/src/run/summary.ts`). A call the run's rest
cut short (PD-ORCH-005) or a crash settled files no issue and is not counted, where the histogram's derived bucket counted
it.

REQ-SESSION-139's histogram is unchanged: it still buckets by `outcome_kind` first, `mcp` included. Whether an MCP call's
record should carry `outcome_kind: 'mcp'` at all is a question the specification leaves open, raised as
[OQ-208](../../architecture/open-questions.md); the Tool errors line no longer depends on its answer.

Pinned by:
- `packages/engine/src/run/summary.test.ts` — "Tool errors counts every tool_error issue REQ-SESSION-136 filed, whatever
  outcome_kind its record carries, and agrees with the Issues line" (records refused as `invalid_request`, an
  `execution_error`, a failed MCP call, a plain failure, a shell failure and a timeout; four `tool_error` issues). It
  fails on the old line, which read 2.
- `apps/desktop/scripts/lib/summary-sections.test.ts` — the live run's reading of `summary.md` over the product's own
  renderer, which names a Tool errors line that disagrees with its Issues line.
- `pnpm sessions-proof` — the seed launch's script is `write,badterm,answer`: `badterm` (a scripted terminal call with a
  negative timeout, which its schema refuses) settles `failed` with `outcome_kind: invalid_request` and files one
  `tool_error` issue. With the old line the proof was red: `A's Tool errors line (undefined) against its Issues line
  ("- Issues: 2 (mcp_config 1, tool_error 1)")`, the file reading `- Tool errors: 0` beside
  `- Tool outcomes: success 1, tool_error 0, rejected 0, unknown 0, invalid_request 1`. With the repair it passed, 11
  scenarios, the file reading `- Tool errors: 1 (counted from the issues record, …)`.
