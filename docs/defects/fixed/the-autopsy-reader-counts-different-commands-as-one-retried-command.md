## The autopsy reader counts different commands as one "retried" command

Both autopsy readers group a session's `terminal` calls by the first 120 characters of `args.command` (whitespace
collapsed) and print every group of two or more as `retried N×: <command>`. The key ignores the rest of the command and the
call's `session_action`, so distinct calls read as one command retried:

- In the default live run at origin/main 1763f7f (2026-10-03 05:56 to 06:15 UTC), requirements scenario (session 76d7de01),
  the agents prefixed every command with `cd <the worktree's path> && `, about 110 characters. Twelve different commands
  collapsed into three lines of `requirements/autopsy.txt`: "retried 5×: … && gi" over #17, #27, #28, #31 and #48 (five
  different git commands), "retried 5×: … && no" over #25, #34, #49, #55 and #63 (five different node commands), and
  "retried 2×: … && ec" over #52 and #54.
- In the frictions scenario (session fa9ad7e8), a `send_signal` (#3, SIGINT to `ts_92897550`) and a `query` (#4) of the same
  background session, both carrying the placeholder command `true`, read "retried 2×: true" in `frictions/autopsy.txt`.

Four false efficiency signals in one pack; an autopsy reading them has to re-derive every group from the store. Seen by the
orchestrator's autopsy of that run (finding D6); recorded 2026-10-03 by plan fin12, before any repair.

## Specs

None contradicted directly: the reader is a harness (R-043's run-autopsy snapshot printer, covering REQ-SESSION-136's
tool-call record fields and REQ-SESSION-139's metrics document rebuilt from the records). Its "retried" line claims a
repetition the records do not show.

## Relevant files

- `apps/desktop/scripts/autopsy.mjs`: the `commands` map keyed on `head(command, 120)` and the `retried N×` lines.
- `packages/engine/src/autopsy.ts`: the same key for `coherence.retried_commands`.
- `packages/engine/src/autopsy.test.ts`: "identical commands retried group", the one case that pins the grouping.

## Outcome (2026-10-03, fin12, repaired)

A retry is now keyed on what was run again: the whole command, whitespace collapsed, and the call's `session_action`. The
script reader takes it from `retriedCommands` in `apps/desktop/scripts/lib/autopsy-retries.mjs` and prints a call with a
session action as `[<action>] <command>`; the engine's `readAutopsy` keys `coherence.retried_commands` the same way and
carries `session_action` on an entry whose calls had one (absent otherwise, so the existing grouping case reads as before).

Pinned by `apps/desktop/scripts/lib/autopsy-retries.test.ts` (four cases: the requirements scenario's `cd <worktree> && …`
commands, none retried; the frictions scenario's `send_signal` and `query` of one session, not a retry; the same command and
the same action run again, each a retry; a call without a command, not counted) and by "D6 (1763f7f): only a command run
again counts as retried …" in `packages/engine/src/autopsy.test.ts`, red on the unrepaired `autopsy.ts` (the 120-character
key grouped `… && git diff --stat` with `… && git diff`). Shown on the evidence pack's own store (a copy of
`2026-10-03T05-56-27-364Z/workspace.db`): `node apps/desktop/scripts/autopsy.mjs <copy> fa9ad7e8-…` and `… 76d7de01-…` printed
"retried 2×: true" and the three `cd … &&` lines before the repair and no retried line after it.
