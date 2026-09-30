## A `kill` of a background session that has already ended says it was killed

`session_action: kill` on a background session that is no longer running answers `Session ts_… was killed.`, although
nothing was killed. `sessionAction`'s `kill` branch calls `BackgroundSession.end('killed')`, which returns at once for
a session whose status is not `running`, and then renders the fixed text whatever the session's status is. The
diagnostic block beside it reports the true `session_status` (`completed`, `failed`, `timeout`) and exit code, so the
detail and the block disagree. A session whose process could not be started (OQ-143) reads `was killed.` too, ahead
of its `execution_error` detail.

Noticed 2026-09-30 while repairing
[`a-background-session-whose-spawn-fails-reads-failed-with-exit-minus-one.md`](fixed/a-background-session-whose-spawn-fails-reads-failed-with-exit-minus-one.md).
Read from the code, not measured in a run. Not repaired.

## Specs

- `REQ-TOOLS-110`: `kill` "returns the final output"; it states no text, and no requirement says what a kill of an
  ended session answers. `REQ-TOOLS-109`: an explicit kill sets status `killed` and exit code −1, which this kill does
  not (the status is left as it was), so the detail claims an end the status denies.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts`: `sessionAction`'s `case 'kill'`, the fixed `Session ${s.id} was killed.`
- `packages/agent-tools/src/terminal/background.ts`: `BackgroundSession.end`, which returns without effect when the
  session is not running.
