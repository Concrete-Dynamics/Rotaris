## A quit with its standard output closed loops on its own EPIPE and never exits

When the reader of the main process's standard output and standard error has gone, the application cannot quit. A
SIGTERM, or anything else that starts the quit path, then leaves the main thread at 100% CPU with no end. The first
line the quit path logs is `quit: requested (before-quit)`, and its write fails with EPIPE. `process.stdout` here is a
socket, so Node reports the failure as an `error` event that nothing handles, and it arrives as an uncaught
exception. Main's `uncaughtException` handler (`apps/desktop/src/main/index.ts`, beside the comment "nothing here may
hang") logs the exception through the same `console.log` to the same closed stream. That write fails with EPIPE
too, and so on without end. Each turn is asynchronous, so the loop starves the event loop: the quit never completes,
and no timer runs, the 30 s force-exit backstop included. Chromium's shutdown handler has taken the first SIGTERM and
restored the default action, so a second SIGTERM ends the process, and so does SIGKILL.

This is what `resilience-proof`'s override launch was. `spawnSync(…, { timeout })` sends its signal and closes its ends
of the child's pipes at the same moment. The application never reached its quit and was alive 649 s after a 180 s
timeout. The log could not show `quit: requested (before-quit)` because the pipe that line needed was already
closed. It was not evidence that the signal went unanswered.

**Measured 2026-09-28 as root under Xvfb on Linux, Node 24, the built app of this branch, in the quota wait of
REQ-NOTIFY-083** (scenario 4's script), each launch by a probe in the scratchpad:

| Launch | SIGTERM at | Result |
|---|---|---|
| async `spawn`, pipes read throughout | 20 s, and 33 s | `quit: requested (before-quit)`, `quit: exiting with status 0`, exit 0 within 70 ms |
| async `spawn`, stdin a pipe too | 20 s | the same: exit 0 in 61 ms |
| idle window (no run), pipes read | 28 s | the same: exit 0 in 45 ms |
| `spawnSync`, `timeout: 20000` and `40000` | at the timeout | never returned; the main thread in state R, CPU time rising ~1 s per second; renderers and zygotes gone; SIGTERM no longer caught (`SigCgt` lost bit 15); a second SIGTERM at 70 s ended it |
| async `spawn`, the parent closes its ends of stdout and stderr, then SIGTERM | 15 s, 20 s | the same spin for 20 s until SIGKILL. `strace -p` shows the main thread repeating `write(1, "… error   UNCAUGHT in main: Error: write EPIPE\n … at afterWriteDispatched (node:internal/stream_base_commons:159:15) …", 1100) = -1 EPIPE` |
| async `spawn`, the parent closes the pipes, no SIGTERM | 20 s | no spin over 20 s in the wait: the loop begins only when something is logged |

So the product does **not** ignore SIGTERM under Xvfb as root. It answers SIGTERM whenever its standard output can
still be written.

## Specs

- `REQ-MONITOR-131`: shutdown carries a force-exit backstop of 30 seconds from the quit request. This quit request
  never ends: the loop starves the timer that would force the exit.
- The code's own stated invariant for this handler (ADR-0019's prohibition, as `index.ts` words it: "nothing here may
  hang").

The loop is reachable outside the proofs too. A development launch or `pnpm dev` whose terminal is closed, or any
launch whose log reader exits first, never quits from then on. Whether a packaged launch on a desktop has a standard
output that can break this way was not measured.

## Relevant files

- `apps/desktop/src/main/index.ts`: `logAt`'s `write: (line) => console.log(line)`, the `uncaughtException` and
  `unhandledRejection` handlers that log through it, and `app.on('before-quit')`, whose line starts the loop.
- `apps/desktop/src/main/app-log.ts`: `createAppLog`, the one writer; its `write` port is where a failed write could
  be absorbed.
- `apps/desktop/scripts/lib/bounded-launch.mjs`: `spawnBounded`, which keeps the pipes open and read across SIGTERM,
  so a proof's SIGTERM reaches the quit path; `bounded-launch.test.ts` pins that.

Noticed 2026-09-28 while investigating the override launch's overrun under R-062, in the thirty minutes the task
allowed. Not repaired: product code, outside a harness-only repair.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, with live-run finding L13 on the same logging path. The application log no longer
writes through `console.log`: `standardStreamWriter` (`apps/desktop/src/main/app-log.ts`) listens for the stream's
`error` event, so a failed write is never an uncaught exception, and from the stream's first failure (or a write that
throws at once) it writes nothing more to it — nobody is left to read the line. `index.ts` builds the log over
`standardStreamWriter(process.stdout)` and gives standard error the same listener. The uncaught-exception handler is
unchanged: with the stream's failure absorbed there is nothing for it to loop on, and any other exception it logs to a
broken stream goes nowhere instead of failing again.

Pinned by `apps/desktop/src/main/app-log.test.ts` (the four cases "REQ-MONITOR-131: a standard stream whose reader has
gone …": a whole stream's lines; an emitted EPIPE that throws without the listener and is absorbed with it, the lines
after it written nowhere; a write that throws at once, tried once; the logger over a broken stream silent). Measured on
the built app as root under Xvfb, Node 24, by a scratch probe that launches `out/main/index.js` with piped standard
output and error, waits 12 s, closes its ends of both pipes and sends SIGTERM — this note's fifth row: with the repair
the application exited 0 in 55, 65 and 53 ms over three launches; the same build with the writer put back to
`console.log` was still running 20 s after the SIGTERM, main thread in state R with 19.7 s of user CPU, and was
SIGKILLed. The `spawnSync` rows were not re-run.
