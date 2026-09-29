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

## Repaired — 2026-09-29 under R-067

**The status of a signal death was unspecified, so it is [OQ-132](../../architecture/open-questions.md), and the build
keeps REQ-TOOLS-179's −1 for `killed` alone.** A new `endOfExit` in `background.ts` decides the end from the `exit`
event's code and its signal. The exit handler used to ignore the signal.
- An exit code decides the status as before: `completed` for 0, `failed` for any other.
- A death by a signal that the session itself delivered is `killed` with −1. The signal counts as delivered when
  `send_signal` or the stream-control interrupt sent it, and `BackgroundSession.signal` remembers each one it sends.
- A death by a signal the product never sent is `failed`, with the shell's `128 + n` (143 for SIGTERM).

So the live run's session, stopped by the agent's own SIGINT, now reads `killed (exit -1)` at `warning`. Its
observation is not an error, so the gate files no `tool_error` for it (`gate.ts` files one only for `isError`).

**Pinned by** `terminal.test.ts`: "OQ-132: a signal death's status…" (the pure decision, every branch), and two
cases against a real shell. "REQ-TOOLS-109/179, OQ-132 (live-run L4): a session the agent ends with send_signal
SIGINT reads killed (−1) at warning, not an error" failed before the change with `failed` / `-1` / `error`.
"OQ-132: a signal death the product did not send reads failed with 128 + n" had also read −1 before. The live
run's `frictions` scenario was run again on the built branch; the round's report gives its pack. Repaired 2026-09-29
under R-067.
