## A background session whose spawn fails reads `failed` with exit −1

When the background session's process emits `error` instead of starting, for example because the shell file cannot be
executed, `BackgroundSession`'s `error` handler appends `[spawn error] …` to the buffer and sets status `failed` with
exit code −1. REQ-TOOLS-179 gives −1 to `killed` alone on a background session, and REQ-TOOLS-109 reads `failed` as a
nonzero exit, which a command that never ran does not have. The observation also carries no `failure_kind`, although
`execution_error` is the terminal vocabulary's word for a command the tool could not run (REQ-TOOLS-100). A spawn
that throws synchronously is already answered as an error at the start (`The background command could not be
started: …`), so this is only the asynchronous `error` event.

Noticed 2026-09-29 while repairing live-run finding L4 (a signal death read `failed (exit -1)`), which left this path
as it was. Not repaired, and not measured: no run has produced it.

## Specs

- `REQ-TOOLS-179`: −1 is a soft pause (foreground) or killed (background).
- `REQ-TOOLS-109`: `failed` is a nonzero exit.
- `REQ-TOOLS-100`: `execution_error` is a `failure_kind`.

## Relevant files

- `packages/agent-tools/src/terminal/background.ts`: the `child.on('error', …)` handler in `BackgroundSession`'s constructor.
- `packages/agent-tools/src/terminal/index.ts`: `sessionAction`'s `finish`, which classifies whatever status and code
  the session holds.
