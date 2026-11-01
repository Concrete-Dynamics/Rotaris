## Commands that await the run host bare answer a missed bound only through the dispatcher's catch

Many command handlers under `apps/desktop/src/main/commands/` await `runHost.request(…, millis(5_000))` with no `.catch`,
and `ProcessLink` rejects that promise with `NoReplyWithinBound` when the run host does not answer within the bound. Until
2026-11-01 such a rejection left `runCommand` and rejected the renderer's `invoke`
([the dispatcher note](the-command-dispatcher-catches-nothing-so-a-handler-that-throws-rejects-the-renderers-invoke.md)); since
R-091's bundle A1 the dispatcher answers it `command.failed` with the headline "The command failed" and the bound's message as
its detail. That is a value, but not the handler's own refusal: `session.start` answers the same condition
`run-host.unreachable`, "The run host did not answer", and the others say nothing about the run host at all.

Measured on the built app, 2026-11-01, `pnpm driver-proof`'s cut launch (Windows 11 ARM64, Node 26.13.0, the CPU reading
100 % with another tree's proofs beside it): at 19:45:02.747Z three commands were answered through the catch, each with one
`error` record — `session.subscribe` (`no reply to session.attach within 5000 ms`), `workspace.usage` and `session.list` (each
`no reply to … within 5000 ms`). The proof's checks passed; what the renderer showed for the three was not read.

Counted by `grep -c "runHost.request("` over the non-test facets: `session.ts` 16, `library.ts` 9, `mcp.ts` 6, `hooks.ts` 5,
`skills.ts` 4, `checkpoints.ts` 3, `config.ts`, `improvements.ts`, `shell.ts` and `workspace.ts` 1 each; `session.ts` holds 7
`.catch(` and `workspace.ts` none, so most of them await bare.

## Specs

REQ-NOTIFY-005 (a failure's notice says what failed) and ADR-0044 (an answer is a `CommandOutcomeSchema` value): met in shape
by the catch; whether each command should name the unreachable run host, as `session.start` does, is not stated anywhere.

## Relevant files

- `apps/desktop/src/main/commands/session.ts` — `session.subscribe`'s `session.attach` request (around line 336); `session.start`'s
  `.catch` that answers `run-host.unreachable`.
- `apps/desktop/src/main/commands/library.ts` — `session.list` (around line 81).
- `apps/desktop/src/main/commands/workspace.ts` — `workspace.usage` (around line 39).
- `apps/desktop/src/main/command-dispatch.ts` — the catch that now answers them.
