## A background session on Linux refuses every signal

`send_signal` on a background terminal session answered `SIGINT could not be delivered … use kill, or SIGTERM/SIGKILL`
on Linux, and SIGTERM failed the same way. `BackgroundSession.signal` and `killTree` signal the session's process group
(`process.kill(-pid, …)`). `spawnChild` always started the child with `detached: false`, so on POSIX the child was
never the leader of a group, and the call failed with ESRCH. The tree kill behind `kill` failed the same way, leaving
only the fallback that ends the shell itself.

Found 2026-09-24 on Linux: `terminal.test.ts`'s OQ-10 case failed alone and in the suite.

## Specs

- `REQ-TOOLS-110`: `send_signal` delivers the named signal to the session. OQ-10 (R-044) ruled that SIGINT stops a
  background session rather than being refused.

## Relevant files

- `packages/platform/src/spawn.ts`: `spawnChild`.
- `packages/agent-tools/src/terminal/background.ts`: the background spawn and `signal`.
- `packages/agent-tools/src/terminal/foreground.ts`: `killTree`.

## Repaired — 2026-09-24

`SpawnSpec` gains `processGroup`. On POSIX it makes the child the leader of its own process group; on Windows it is
ignored, because there `detached` opens a new console and the tree kill is `taskkill /T`. Background sessions pass it,
so a signal and the tree kill reach the command and everything it started. Evidence: the OQ-10 case passes on Linux,
alone and in the full terminal suite (three runs out of three).
