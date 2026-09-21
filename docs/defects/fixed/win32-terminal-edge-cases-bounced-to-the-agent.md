## win32 terminal edge cases bounced to the agent instead of being absorbed

Observed 2026-09-20, run `7bd9c19d` (punchclock_v2): four one-off terminal frictions, each one wasted turn. `tool_calls` #254: `SIGINT cannot be delivered to a background pipe session on win32; use kill, or SIGTERM/SIGKILL.` — the agent attempted `send_signal` SIGINT on a pipe session the tool knew could not take it. `tool_calls` #138: `write_file` failed `ENOENT: no such file or directory, mkdir 'D:\Development\Apps\punchclock_v2\$env:TEMP'` — a PowerShell variable in the path treated literally. `tool_calls` #431: `Get-Content: A positional parameter cannot be found that accepts argument 'src/app/(public)/login/page.tsx'` — a parens-bearing path misquoted in the tool's own wrapping. `tool_calls` #218: `Session ts_86d2f7c9 is failed (exit 1).` on a reference to an already-dead session. Each refusal is truthful; none prevented the retry.

## Specs

No requirement contradicted — recorded for the four refusals sharing one area: the agent guessed at win32 behavior the tool already knew.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts` — the SIGINT refusal and session-reference handling.
- `packages/agent-tools/src/tools/files.ts` — literal `$env:TEMP` in the write path.

Noticed 2026-09-20 by the run-autopsy of run `7bd9c19d`.

## Repair

The SIGINT half is repaired as of 2026-09-21 (R-044): SIGINT and SIGHUP on a win32 background pipe session terminate the session's own tree — the mapping SIGTERM and SIGKILL already used (`packages/agent-tools/src/terminal/background.ts`) — instead of the `invalid_request` refusal, answering OQ-10 for background pipe sessions. The stored session record carries the truthful `killed` mechanism, and the stream-control `interrupt` (REQ-TOOLS-128) stops a win32 background session instead of answering false. Covered by `OQ-10 (R-044): send_signal SIGINT stops a background session instead of refusing it` in `packages/agent-tools/src/terminal/terminal.test.ts`, and by the `frictions` live scenario's SIGINT check.

The other three observations needed no change, on re-examination: the `$env:TEMP` path was passed literally by the agent (no expansion is the fence-safe behavior), the `Get-Content` call passed two paths (a positional and `-LiteralPath`) which PowerShell itself refuses, and the stale session poll was answered with that session's own failure output. Each was an agent error the tool reported truthfully.
