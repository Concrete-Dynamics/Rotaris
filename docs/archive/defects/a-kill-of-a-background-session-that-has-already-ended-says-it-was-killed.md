## A `kill` of a background session that has already ended says it was killed

`session_action: kill` on a background session that is no longer running answers `Session ts_… was killed.`, although
nothing was killed. `sessionAction`'s `kill` branch calls `BackgroundSession.end('killed')`, which returns at once for
a session whose status is not `running`, and then renders the fixed text whatever the session's status is. The
diagnostic block beside it reports the true `session_status` (`completed`, `failed`, `timeout`) and exit code, so the
detail and the block disagree. A session whose process could not be started (OQ-143) reads `was killed.` too, ahead
of its `execution_error` detail.

Noticed 2026-09-30 while repairing
[`a-background-session-whose-spawn-fails-reads-failed-with-exit-minus-one.md`](a-background-session-whose-spawn-fails-reads-failed-with-exit-minus-one.md).
Read from the code, not measured in a run.

## Specs

- `REQ-TOOLS-110`: `kill` "returns the final output"; it states no text, and no requirement says what a kill of an
  ended session answers. `REQ-TOOLS-109`: an explicit kill sets status `killed` and exit code −1, which this kill does
  not (the status is left as it was), so the detail claims an end the status denies.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts`: `sessionAction`'s `case 'kill'`, the fixed `Session ${s.id} was killed.`
- `packages/agent-tools/src/terminal/background.ts`: `BackgroundSession.end`, which returns without effect when the
  session is not running.

## Repaired — 2026-10-01

`sessionAction`'s `kill` reads the session's status before it acts. A running session is ended as before
(REQ-TOOLS-109: `killed`, −1) and answers `Session ts_… was killed.` Any other session is left as it was and answers
`Session ts_… had already ended; nothing was killed. It is <status> (exit <code>).`, the status and exit code its
diagnostic block reports, with its final output (REQ-TOOLS-110). A session whose process could not be started (OQ-143)
has no exit code, so it reads `It is failed.`, followed by its `execution_error` detail as before. A second kill of a
session a kill already ended reads `It is killed (exit -1).` No requirement states the wording; it is the build's,
following `query`'s own `Session ts_… is <status> (exit <code>).`

Pinned in `packages/agent-tools/src/terminal/terminal.test.ts`: "REQ-TOOLS-109/110: a kill of a session that has
already ended says so, kills nothing, and agrees with its status — after completion and after failure" (a completed
session, one that exited 3, and a second kill), and the kill added to "REQ-TOOLS-100/103/179: a spawn that fails after
start returns …" (the failed spawn). Both are red on the code before the repair. `BackgroundSession.end` is unchanged.
