# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — Consequences accepted

Part 5 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## Consequences accepted

1. **Probing is more expensive than reusing a connection — deliberately.** The status-check control
   probes sequentially off the interface thread, which bounds the cost.
2. **An stdio server may be running twice at once** — once for a run's session, once transiently for a
   probe or a discovery. `REQ-MCP-067`'s one-process guarantee is scoped to the session's shared
   connection, so this is conformant, but it is surprising and must be documented for whoever writes a
   test that counts processes.
3. Two processes may hold different tool lists for one server, and that is correct behaviour rather
   than a bug.
4. Threading a diagnostics list through every stage is verbose, bought for testability of the
   requirements that matter most.
5. **`REQ-MCP-087` and `REQ-MCP-090` fix the precedence among the sources of the environment map but
   never say whether the resulting map replaces or overlays the parent environment.** Servers launched
   through package runners plainly need a search path, and `REQ-MCP-037` judges availability by a path
   lookup, so some inheritance is implied — but "some" is not a contract, and the SDK's own default is a
   curated safe subset, which would be a third behaviour. The signature of the environment-resolution
   stage differs depending on the answer, so this blocks that stage. See OQ-22. *(Ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the overlay as built, with no scrubbing.)*
