## The command dispatcher catches nothing, so a handler that throws rejects the renderer's invoke

`runCommand` in `apps/desktop/src/main/index.ts` parses the request, picks the handler and awaits it with no `try`/`catch`
around the call. The comment beside the call says "Nothing throws out of here (ADR-0019) — a handler that does is caught
below", and nothing below catches it. A handler that throws therefore rejects the `ipcMain.handle` promise: the renderer's
`invoke` rejects with Electron's wrapped error text instead of a `CommandOutcome`, the renderer's callers, written against
the outcome shape, get an exception, and the application log holds the stack only if the handler logged it itself. Found
2026-11-01 by the read-only survey for [R-091](../product/requests.md#r-091); not observed in a run.

## Specs

`.claude/rules/contracts-and-ipc.md` ("nothing throws out of `runCommand`") and ADR-0044 (the IPC contract: every answer
is a `CommandOutcomeSchema`). No requirement names the dispatcher; REQ-MONITOR-007 (controls answer `false` rather than
raising) states the same discipline for the controls the commands drive.

## Relevant files

- `apps/desktop/src/main/index.ts` — `runCommand`, the `const outcome = await handler(req, …)` line and the comment that
  claims a catch; `ipcMain.handle(CHANNEL.command, …)` below it.
- `packages/contracts/src/commands.ts` — `CommandOutcomeSchema`: `code` is a free string, so a `command.failed` outcome
  needs no widening of a vocabulary.
- `apps/desktop/scripts/driver-proof.mjs` — drives `runCommand` by the renderer's own path; the place a throwing kind is
  measured.
