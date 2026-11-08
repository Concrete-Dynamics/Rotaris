## An MCP server whose remote url still holds an unresolved placeholder is reported available, so a probe connects to it and the row shows a network failure where the missing prerequisite belongs

`packages/config/src/mcp/commands.ts`'s `availability()` is REQ-MCP-037's one rule for every surface, and its remote
branch read the transport alone: `if (entry.type !== 'stdio') return { available: true, why: 'remote' };`. It never
looked at the entry's `url` or at the placeholders left in it, which `resolveMcpConfiguration` had already computed
into `McpResolvedServer.unresolved`.

Three requirements read that branch differently, and they agree with each other:

- **REQ-CONFIG-371** — "an `http` or `sse` tool server exactly when it has no usable `url`, which includes a `url`
  still carrying an unresolved placeholder (REQ-CONFIG-225)". It names REQ-CONFIG-349 and REQ-CONFIG-352 as the same
  rule, and the resolution of 2026-08-30 records the ruling verbatim.
- **REQ-CONFIG-225** — "An entry whose resolved `url` still carries a placeholder is retained in the configuration and
  **marked unavailable**, so no request is ever sent to it and any attempt to use it is refused with a reason naming
  the unresolved variable."
- **REQ-MCP-093** — desktop availability "SHALL delegate to the shared rule of REQ-MCP-037", so the two cannot
  disagree; REQ-MCP-037's own remote clause fixes *reachability* ("nothing probes reachability at configuration
  time"), which a usable-address check is not.

What the build did instead, measured on the shipped defaults with the key unset (Linux, dev tree, 2026-11-08):

- `resolveMcpConfiguration` reported `web_search` as `available: true, why: 'remote'` with
  `unresolved: ['ROTARIS_SEARCH_API_KEY']` beside it.
- The Settings row therefore showed **`Unreachable`** with `Version negotiation probe failed: fetch failed`, because
  `McpHost.probeOne` only short-circuits an entry the rule calls unavailable and otherwise opens a real connection to
  `https://search.rotaris.invalid/mcp?key=**`.
- The verbatim placeholder host was reachable by a request at all, against REQ-CONFIG-225's "no request is ever sent
  to it".
- The unavailable row's wording named the executable search path in every case, so a remote row reported a missing
  command it does not have while the `availabilityDetail` the host had computed was carried over the wire and never
  drawn (`McpSettings.tsx` hardcoded both the hint and the toggle's `title`).

Repaired in the same commit: the remote branch reads `unresolved` and returns `available: false, why:
'unresolved-url'` with a detail naming the placeholders; `resolveMcpConfiguration` passes the list it already holds;
and the row draws the host's own detail for a remote entry, keeping the fixed PATH sentence for the stdio rows
REQ-MCP-091/092 were written for.

Not repaired, and reported instead: the shipped `web_search` url points at `search.rotaris.invalid`, a reserved
`.invalid` host that no resolver answers. REQ-CONFIG-181 leaves the search endpoint to the implementation and
resolution 15/03 #44 records that no vendor, egress path or user key is bound by the specification, so the stub is
deliberate; supplying `ROTARIS_SEARCH_API_KEY` alone cannot make that entry healthy, and a user who wants a working
search server declares an `mcp_servers.web_search` entry with a real `url`. Choosing a real endpoint is the owner's
decision and is raised in the handoff rather than invented here.

## Specs

REQ-CONFIG-371, REQ-CONFIG-349, REQ-CONFIG-352, REQ-CONFIG-225, REQ-MCP-037, REQ-MCP-093, REQ-MCP-091, REQ-MCP-092.

## Relevant files

- `packages/config/src/mcp/commands.ts` — `availability()` and its `Availability` type: the repaired rule and the new
  `unresolved-url` reason.
- `packages/config/src/mcp/index.ts` — `resolveMcpConfiguration`, the one place both `unresolved` and `availability`
  are computed, now passing the list into the rule.
- `packages/ui/src/settings/McpSettings.tsx` — the row's enablement hint and the toggle's `title`, which now read
  `row.availabilityDetail` for a remote entry.
- `apps/desktop/src/run-host/mcp.ts` — `list()` and `probeOne()`, unchanged: both already carry
  `availabilityDetail` and already short-circuit an unavailable entry, which is why the rule alone decides.
- `packages/config/src/mcp/mcp.test.ts`, `packages/config/src/load.test.ts` — the pins.
