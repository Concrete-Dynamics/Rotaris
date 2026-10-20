## On Windows, discovery cuts the first language-server install short and the session's install fails

Windows-only; for the Windows session; seen on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64,
`C:/dev/Rotaris-crw-wt-loc1-rename` at `0d89e971` (with loc1's `rename` bundle's uncommitted PD-MCP-004 revision 2 changes, which
the failure precedes: it happens before any symbol tool reaches a language server). Recorded by that bundle while running
`code-intel-proof`; not repaired here.

`node apps/desktop/scripts/code-intel-proof.mjs --skip-build --steps=10,11,13,14,15`, the tree's first proof run (a fresh runtime
home under `.proof/code-intel-proof/profile/local/rotaris/data/code-intelligence`, no TypeScript language server provisioned in
it), stopped at launch 10: the child's reference search and its rename both failed with the runtime's "The language server
manager is not initialized … typescript: Command 'npm install --prefix ./ typescript@5.9.3' returned non-zero exit status
4294963245". The runtime's own logs give the order:

1. The run start's discovery launched the server against the workspace (pid 12180, 22:16:43 local time). Activating the project,
   the server began provisioning the TypeScript language server in the background (`npm install --prefix ./ typescript@5.9.3` at
   22:16:44.97), answered `tools/list`, and was closed by the discovery at 22:16:45.4. npm's own log of that install ends after
   `ADD node_modules/typescript`: no `package.json` was written at the prefix, so the install did not finish.
2. The session's server (pid 28228, 22:17:00) ran the same install at 22:17:02, and npm failed removing the tree the first one
   left: `ENOTEMPTY: directory not empty, rmdir '…\ts-lsp\node_modules\typescript\lib'` (errno −4051, the unsigned exit status
   above). The language server never started, and every symbol tool of that session failed.

The same runtime started by itself on this host, with no discovery before it, provisioned the same two packages in about 20 s and
answered (OQ-362's spike, `docs/defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md`).
With that provisioned `language_servers/static/TypeScriptLanguageServer/` copied into the proof's runtime home, the proof's
re-run proceeded. A person meets the same order at the first run in a TypeScript workspace on a fresh Windows profile.

**Why Windows.** The interrupted first install is the platform-independent part: the runtime provisions at server start, and
discovery closes the server within seconds
(`docs/defects/the-code-intelligence-server-provisions-its-language-servers-at-discovery-before-any-symbol-tool-is-used.md`).
The second install's failure is npm's removal of the partial
tree under Windows file semantics, after the run host has ended the discovery server's runner by stdin EOF and the tree kill
(R-074, PD-MCP-003). **Not measured:** whether the same happens off Windows (the Linux runs on record provisioned in launch 4,
or in a home kept from an earlier run), and whether a later run at the same root recovers by itself.

## Specs

- `REQ-MCP-118` and IC-7 (adopted 2026-09-06): the runtime obtains a language's server at the first use of a symbol-level tool;
  here that first use fails, and nothing tells the person why beyond the runtime's own text in the call's result.
- `REQ-STARTUP-159`: the language servers are among what is fetched after installation; the fetch must succeed for the symbol
  tools to work.

## Relevant files

- `packages/mcp/src/discovery.ts` (`ToolDiscovery`) — the run start's discovery, which launches the server and closes it after
  `tools/list`.
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.prepare`, where the run start's discovery is kicked off.
- `apps/desktop/resources/code-intelligence/runtime/…/site-packages/solidlsp/language_servers/common.py` — the runtime's
  `npm install` (built by `pnpm code-intel:bundle`, not in the repository).
- `apps/desktop/scripts/code-intel-proof.mjs` — the runtime home it keeps across runs, which a failed first install leaves partial.
