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
