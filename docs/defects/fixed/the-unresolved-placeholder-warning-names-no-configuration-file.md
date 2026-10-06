## The unresolved-placeholder warning names no configuration file

`resolveRemoteUrl` (`packages/config/src/mcp/environment.ts`) reports a remote tool server whose `url` keeps a `${VAR}`
that neither a stored secret nor the environment resolves. The warning an enabled entry raises reads "mcp <server>: the
placeholder ${<VAR>} in its url could not be resolved from a stored secret or the environment; the server is configured
but unavailable until it is (REQ-MCP-088, REQ-CONFIG-225)". It names the server and the variable and no file: the
function is given the server's name, its url, the environment, the secrets and `enabled`, and nothing says which
configuration file the entry came from, and the diagnostic it builds (`warn` in `packages/config/src/mcp/diagnostics.ts`)
has no field for one (`server`, `persona`, `channels`). A person with the same server named in more than one layer
(the user-global and the workspace configuration, or a discovered server file) cannot tell from the warning which file
to correct.

## Specs

- **REQ-CONFIG-225** — "a warning is emitted naming the tool server, the variable and the file the entry came from".
  The file is not named. (For the shipped default entry there is no file; the requirement is about an entry a person
  configured.)

## Relevant files

- `packages/config/src/mcp/environment.ts` — `resolveRemoteUrl`, which builds the message.
- `packages/config/src/mcp/index.ts` — `resolveMcpConfiguration`, which calls it with the entry's name and knows the
  entry's origin (`yaml`, `default`, or a discovered origin) but not its file.
- `packages/config/src/load.ts` — where the layers are merged and the entry's provenance (REQ-CONFIG-222) would have to be
  handed down.
- `packages/config/src/mcp/diagnostics.ts` — the `Diagnostic` shape.

Noticed 2026-10-06 by fin18 (bundle `fin18-rail-label-and-observations`) while confirming the autopsy's observation of
a disabled server's placeholder line (`docs/defects/fixed/a-disabled-servers-unresolved-placeholder-line-says-a-key-would-make-it-available.md`).
Not repaired: recorded on the way, outside the observation it was found beside.

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

"The file the entry came from" is read as the file that **stated the url** the placeholder sits in: the entry is merged
field by field (REQ-CONFIG-043), so a workspace file that only switches the shipped `web_search` on wrote none of its
url, and naming it would send the reader to the wrong file.

- `packages/config/src/load.ts` (`resolveMerged`) records, per server, the `agents.yaml` whose `mcp_servers:` entry
  stated a `url` (the workspace scope's over the global's) and hands it to `resolveMcpConfiguration` as `urlFiles`.
- `packages/config/src/mcp/discovery-files.ts`: `DiscoveredServers.sources` keeps the `mcp.json` each winning discovered
  entry was read from.
- `packages/config/src/mcp/index.ts`: `urlSourceOf` chooses the YAML file, else the discovered file when that file stated
  the url, else none (the built-in defaults, REQ-CONFIG-181).
- `packages/config/src/mcp/environment.ts`: `resolveRemoteUrl` takes that source and the line now reads "mcp <server>: the
  placeholder ${<VAR>} in its url, set in <file>, could not be resolved …", or "…, from the built-in defaults, …" when no
  file stated it. Severity, scope, channel and key are unchanged.

Pinned by `packages/config/src/load.test.ts`, "REQ-CONFIG-225: the unresolved-placeholder warning names the file the entry
came from" (the workspace file over the global one; the global one when the workspace entry states no url; a discovered
`.mcp.json`; the built-in defaults for a `web_search` a workspace only switches on), and by
`packages/config/src/mcp/mcp.test.ts`, "REQ-CONFIG-225: the unresolved-placeholder line names the file that stated the url,
or the built-in defaults". All three were red before the repair (the message held no file). No proof names this line; the
next default live run shows the shipped `web_search`'s line in `app.log` reading "from the built-in defaults".
