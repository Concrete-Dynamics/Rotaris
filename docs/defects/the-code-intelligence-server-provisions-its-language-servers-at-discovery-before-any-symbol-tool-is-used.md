## The code-intelligence server provisions its language servers at discovery, before any symbol tool is used

The bundled runtime starts provisioning a project's language servers as soon as a server launched with `--project` activates
the project, before any tool is called. The product launches such a server at every run start whose personas carry the
code-intelligence server — the run start's discovery, which reads `tools/list` and closes the server within seconds — so in a
workspace whose language server is not yet provisioned, the download begins at the run's start, not "at the first use of a
symbol-level tool". Noticed 2026-10-20 by loc1's `rename` bundle (`loc1-rename`) in the runtime's own log of a
`code-intel-proof` launch, on Windows 11 ARM64 (build 26200), Node 24.18.0 arm64, `C:/dev/Rotaris-crw-wt-loc1-rename` at
`0d89e971`: the discovery server (pid 12180) logged, in this order and before the `ListToolsRequest` it was launched to answer,
"Activating workspace at …", "Scheduling Task-1:init_project_services", "Language server initialization starting ...",
"[StartLS:typescript] … Running command 'npm install --prefix ./ typescript@5.9.3'", then answered `tools/list` and shut down.
The activation and its language-server start are the runtime's own, with nothing platform-specific in the order; whether the
same holds off Windows is a reading, not measured here.

On Windows the discovery's close then cuts that install short and the session's own install fails
(`docs/defects/on-windows-discovery-cuts-the-first-language-server-install-short-and-the-sessions-install-fails.md`). Off
Windows an install cut short may finish or be repeated; either way it is a download made before any symbol tool was used.

Not repaired: the remedy is a choice the specification does not make — a discovery that launches the runtime without the
project, a runtime setting that defers the language servers if the pinned release has one, or a disclosure that says the
download begins at the first run in such a workspace (REQ-MCP-118's content is the specification's).

## Specs

- `REQ-MCP-118`: the language-server disclosure SHALL state "that the bundled runtime obtains a language's server at the first
  use of a symbol-level tool for that language, and that nothing is downloaded before then". The download starts at the run
  start's discovery, so the disclosure's statement is not what happens.
- `REQ-STARTUP-159` and IC-7 (adopted 2026-09-06): the language servers are fetched after installation, at first use, which
  REQ-MCP-118 is the surfacing of.

## Relevant files

- `packages/mcp/src/discovery.ts` (`ToolDiscovery`) — launches the server for `tools/list` and closes it.
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.prepare`, the run start's discovery for every carried server.
- `packages/config/src/mcp/commands.ts` — REQ-MCP-034's `--project <root>` appended at command resolution, which every launch
  carries, the discovery's included.
- `packages/ui/src/settings/McpSettings.tsx` — the MCP category's disclosure text (REQ-MCP-118): "At the first use of a symbol
  tool for a …".
