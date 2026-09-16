## The application log prints the level as text and filters on nothing

`apps/desktop/src/main/index.ts` writes the application log through one closure —
`const log = (m: string) => console.log(...)` — and the two places that forward a child process's
diagnostics into it print the level **inside the message**: `run host ${e.level}: ${e.message}` and
`workspace service ${e.level}: ${e.message}`. Nothing reads `e.level`. A `debug` line and an `error`
line reach the log identically, and the only way to lose a line is for its sender not to send it.

Seen on run `a26918e8`'s launch log (2026-09-16): about eighty lines of one MCP server's handshake
validation, plus about fifty-five lines of the same server's startup noise. The repair that landed an
hour later (`15414d7`) moved a child's stderr to `debug` and stopped the run host flattening `debug`
into `info` — so those lines now read `run host debug:` rather than `run host info:`, which is what
that repair claimed and all it claimed. They are still in the log.

**Measured after the repair, 2026-09-16.** The built app driven against a throwaway workspace with one
scripted run (`pnpm app:drive`, bundled runtime present): 195 lines of application log, **141** of them
`run host debug: mcp code_intelligence stderr:` and **0** at `info`, 44 carrying serena's own `INFO`
records. The level moved; the volume did not.

## Specs

**No requirement is contradicted, and that is the finding.** The application log is a named surface in
`REQ-TOOLS-171`, `REQ-HOOKS-102/138`, `REQ-SANDBOX-071` and `REQ-LIBRARY-035/047/124`, but each of those
fixes *what* is written to it and none fixes a level or a filter. Every level requirement in the corpus
— `REQ-CONFIG-121`, `REQ-SESSION-142`, `REQ-MONITOR-238`, `REQ-CLI-065` — governs the **per-session**
log at `<session_dir>/evidence/debug.log` instead.

Raised as **OQ-63** in `docs/architecture/open-questions.md`, with what the build proceeds under (the
log keeps every level). Recorded here as well because a reader of the code meets this before they meet
the open question.

## Relevant files

- `apps/desktop/src/main/index.ts` — the `log` closure, and the two forwarders that print `e.level`
  into the message rather than reading it.
- `packages/mcp/src/transport.ts` — a child server's stderr, now forwarded at `debug`.
- `apps/desktop/src/run-host/mcp.ts` — the run host's log adapter, which no longer flattens `debug`.
