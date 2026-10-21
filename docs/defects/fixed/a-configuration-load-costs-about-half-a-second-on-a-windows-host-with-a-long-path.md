## A configuration load costs about half a second on a Windows host with a long PATH

Seen on Windows 11 x64 (build 26200), Node 24.11.0, at `30e2137b`: `apps/desktop/src/run-host/configuration.test.ts`'s
"the egress reader … the cost is measured" read a median of 251 and 254 ms in two `pnpm check` runs of `pnpm worktree:land`,
and 367 and 455 ms run alone, against its bound of 250 ms. Earlier the same day two full gates on the same host passed it.

A CPU profile of five `egressReader` reads (467–495 ms each) put about 2.2 s of their 2.4 s in `stat`, through
`findExecutable` (`packages/platform/src/spawn.ts`) as `resolveCommand` (`packages/config/src/mcp/commands.ts`) looks up an MCP
server's command on PATH during `loadConfiguration`. On win32 the lookup `stat`s every PATH directory under every PATHEXT
extension. This host's PATH holds 85 entries (73 distinct, 5 missing) and its PATHEXT 13 extensions, so one lookup is 1,105
`stat` calls, and a `stat` costs about 0.8 ms here: measured outside the product, a lookup of `npx`, of `uvx` and of a name
that exists nowhere each took 864–886 ms. The host runs several file-system filter drivers (a VPN, a security agent, a cloud
drive), which is the likely reason a `stat` costs that much; that was not isolated.

The egress reader reads the configuration at each tool call (REQ-SANDBOX-038/118, REQ-TOOLS-089), so on this host every tool
call pays that cost, and so does every other configuration load.

Measured alternatives, for whoever repairs it: reading each PATH directory once (`readdirSync`, 12,472 entries) took 224–297 ms;
one `stat` of each directory, the price of reusing listings while a directory's modification time holds, took 88–100 ms.

## Specs

REQ-MCP-037 fixes the lookup's outcome, not its cost, and no requirement bounds a configuration load's time; the unit test's
250 ms is its own loose bound. No requirement is contradicted. Recorded as a cost the specification does not price.

## Relevant files

- `packages/platform/src/spawn.ts` — `findExecutable` and `presentExecutable`: one `stat` per directory and extension.
- `packages/config/src/mcp/commands.ts` — `resolveCommand`, the caller during a configuration load.
- `apps/desktop/src/run-host/configuration.ts` — `egressReader`, a full `loadConfiguration` per call.
- `apps/desktop/src/run-host/configuration.test.ts` — the case whose 250 ms bound this host exceeds.

## Repaired — 2026-10-20

`findExecutable` lists each PATH directory once and keeps the listing while the directory's modification time holds, so
a lookup costs one `stat` of each directory it walks plus one of a name the listing holds; the `stat` under every PATHEXT
extension is gone. A listing is not kept when the directory's time moved while it was read, nor when that time has no
fraction of a millisecond (a coarse filesystem), and a directory that cannot be listed falls back to the old `stat` of each
candidate. The answer is unchanged (REQ-MCP-037). On the same host the egress reader's median read fell from 367–455 ms
run alone to 13 ms. `packages/platform/src/platform.test.ts` holds the kept listing, its renewal when the time moves, the
coarse-time case, and a PATH entry naming a file, nothing, or a directory spelled like the command.
