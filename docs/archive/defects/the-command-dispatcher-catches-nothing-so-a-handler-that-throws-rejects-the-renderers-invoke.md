## The command dispatcher catches nothing, so a handler that throws rejects the renderer's invoke

**Outcome (repaired 2026-11-01, R-091 bundle A1).** `runCommand` now hands the request to `dispatchCommand`
(`apps/desktop/src/main/command-dispatch.ts`), which awaits the handler inside a `try`: a throw or a rejection is answered
`{ ok: false, code: 'command.failed', headline: 'The command failed', detail }`, the detail being the error's message through
`redact` (`packages/kernel/src/redaction.ts`) cut to 500 characters, and one `error` record in the application log carries the
command's kind and the redacted stack, never the request. `command-dispatch.test.ts` pins it with a handler table whose kind
throws, one whose promise rejects with a non-`Error` reason, the redaction and the bound; those three cases are red with the `try` removed (measured). The
comment that claimed a catch is replaced where the call now lives. **Met on the built app without being sought:** in
`pnpm driver-proof`'s cut launch on 2026-11-01, `session.subscribe`, `workspace.usage` and `session.list` each let the run
host's `NoReplyWithinBound` escape their handler, and each was answered `command.failed` with one `error` record — the shape
this note describes, now caught ([the note on those handlers](../../defects/commands-that-await-the-run-host-bare-answer-a-missed-bound-only-through-the-dispatchers-catch.md)).
A scenario that makes a command throw on purpose is bundle F3's (`docs/architecture/hardening.md` §5).
**Moved at the bundle's review (2026-11-01)**, the builder having left it in place: the move is the task's own
(R-091's brief, "Move the note to docs/defects/fixed/"; since R-092 retired `fixed/` the same day, a repaired note goes to
`docs/archive/defects/`, where the landing's rebase put it), so R-091's link to it in `docs/product/requests.md` was repointed
with it, that row's target alone, as were `hardening.md` §3.1's, the views' reconciliation-log entry's, the first-executions
row's, `command-dispatch.ts`'s and the run-host note's.

`runCommand` in `apps/desktop/src/main/index.ts` parses the request, picks the handler and awaits it with no `try`/`catch`
around the call. The comment beside the call says "Nothing throws out of here (ADR-0019) — a handler that does is caught
below", and nothing below catches it. A handler that throws therefore rejects the `ipcMain.handle` promise: the renderer's
`invoke` rejects with Electron's wrapped error text instead of a `CommandOutcome`, the renderer's callers, written against
the outcome shape, get an exception, and the application log holds the stack only if the handler logged it itself. Found
2026-11-01 by the read-only survey for [R-091](../../product/requests.md#r-091); not observed in a run.

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
