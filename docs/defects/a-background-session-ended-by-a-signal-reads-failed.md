## A background session ended by a signal reads `failed (exit -1)` and files a tool error

When a background terminal session's process dies of a signal, the exit handler receives `code === null` and records
`exitCode = -1` and status `failed`, because only `code === 0` is `completed`. So a session the agent itself stopped
with `send_signal SIGINT` reads "failed (exit -1)", its observation is an error, and a `tool_error` issue is filed. The
model then spends a call confirming what happened.

Live-run finding: L4 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-109`: `failed` is a nonzero exit; `REQ-TOOLS-179`: `-1` is the code for `killed`. A signal death is neither
  a nonzero exit nor, necessarily, a kill the product made; which status it takes may itself be unspecified (an OQ if the
  repair finds so).

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `aef2f7f4` (`frictions`): #12 `send_signal SIGINT` ok; #13 query "Session ts_0a2319ed is failed
  (exit -1)", `background_terminal` / error, `is_error` 1; transcript row 24 `[failed]`; issue #1 `tool_error`; the model
  ran `list` (#14) to confirm.

## Relevant files

- `packages/agent-tools/src/terminal/background.ts:63` — `this.exitCode = code ?? -1; this.status = code === 0 ?
  'completed' : 'failed'`.
- `packages/agent-tools/src/terminal/classify.ts:106` — `failed` classifies as an error.
