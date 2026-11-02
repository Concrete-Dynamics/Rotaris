## The MCP suite's scratch directory is still held when its connections have closed on Windows

Found 2026-10-15 by the full suite on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev
tree, pwsh 7.6.7, at `b9e30052` (A1 of the Windows ARM64 session). `packages/mcp/src/mcp.test.ts` passes all 21 cases and
fails as a file in both full runs and alone: its `afterAll` awaits `closeAll()` on every registry, then
`rmSync(dir, { recursive: true, force: true, maxRetries: 3 })`, which throws `EPERM` on the scratch directory
(`%TEMP%\rotaris-mcp-*`). The directory and its files (`clients.jsonl`, the `*.pids` files, `runner.cmd`) are left behind.
A process snapshot taken as vitest exits, and again 10 s later, shows no new `node`, `cmd` or `conhost` process, and the
directory removes without error seconds afterwards: a hold that ends shortly after `closeAll()` resolves, not a survivor.

Which process holds it, and how long after `closeAll()` it lets go, is not yet measured. The fixture servers include one
started through a `.cmd` runner (cmd.exe, then node), whose grandchild is the likeliest holder.

Not repaired (record-only). Whether the product's `closeAll()` resolves before a server it started has let go of what it
holds (the product's own question), or the test's retry budget is too short for Windows (the harness's), is open.

## Specs

Possibly REQ-MCP-066/067 as `SessionConnections.closeAll` documents them: "nothing open once the first call has returned".
If a server process still holds its working directory after that return, that statement does not hold on Windows. If only
the test's 300 ms of retries is short of the exit, none.

## Relevant files

- `packages/mcp/src/mcp.test.ts` — the `afterAll` (line 48) and its scratch directory.
- `packages/mcp/src/sessions.ts`, `packages/mcp/src/discovery.ts` — the two `closeAll` implementations.
- `packages/mcp/src/client.ts` — `openClient`'s `close`, and the `.cmd` wrap (REQ-MCP-113).

## Outcome

Repaired 2026-10-16 under R-074. The runner case now isolates the server's working directory and renames it immediately after closeAll returns. It failed EBUSY before the repair. Windows kill() was ending cmd.exe before its server: termination now lets stdin EOF close the tree during the existing grace and leaves taskkill /T /F to the grace bound. All 22 MCP cases pass, including the immediate rename after graceful close, a server that ignores EOF and must be tree-killed, and scratch cleanup, without added cleanup retries.
