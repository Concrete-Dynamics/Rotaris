# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — Decision

Part 4 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## Decision

**Three connection paths over one shared launch primitive** (ADR-0033's transport factory and the
nine-value identity function, both used by all three so launch behaviour is identical everywhere, which
is what `REQ-MCP-050` requires):

- `ToolDiscovery` — its own short-lived connection, memoised by the nine-value identity, with an
  **outer watchdog** giving the 35 s bound independently of the transport's own timeout.
- `HealthProbe` — its own connection every time, closed every time, 8-second budget, two outcomes,
  never raising, writing nothing into any cache.
- `SessionConnections` — the shared registry: a map from server name to a promise of a connected,
  hook-completed session, created under a **keyed single-flight** so two concurrent first-demands share
  one promise, plus a **shutdown latch** that makes post-shutdown requests fail, plus an idempotent
  `closeAll()`. Because the single-flight is keyed per server, "while one server is still starting,
  calls to already-connected servers complete without waiting" falls out rather than being arranged.

The connected-session value holds the client, the **unfiltered** tool list (so post-connect probes and
`REQ-MCP-064` are satisfied without a second listing), the current callable set per persona, the
**connect-time** callable set (retained so `REQ-MCP-060`'s "a name the update introduces shall not
become callable" can be enforced), and a warned-unreachable flag.

**Configuration resolution is a pure pipeline returning a value *and* a diagnostics list.** Each stage
— load discovered files, merge, resolve environment, resolve commands, compute availability, resolve
persona, describe for the backend, render the prompt section — is pure over its inputs. Every diagnostic
is a value carrying its severity, its de-duplication key and its **scope** (`load`, `process`,
`session`), and **one diagnostic sink** applies the scope rules and fans out to the two channels of
`REQ-MCP-044`. The fatal YAML case is "accumulate, then reject at the end", never "throw on the first",
because `REQ-MCP-002` requires every defect to be reported.

Two representation details this decision fixes:

- **Grants are `undefined` (no entry, unrestricted) versus the empty list (nothing), never collapsed**,
  so `REQ-MCP-055`'s cases (b) and (c) stay distinguishable through the whole pipeline.
- **All ordering uses an explicit code-point comparator.** Locale-aware collation is banned in this area
  by lint rule, because `REQ-MCP-117` requires identical order on every platform and under every
  locale, and the default sort's code-unit order differs from code-point order for astral characters —
  a real difference for a tool name containing an emoji, which is not hypothetical for MCP servers.

**Placement.** The MCP library is written with **no process assumptions and no Electron imports**, and
is instantiated in whichever process owns a session — the run host — while the settings surface
instantiates the discovery and probe paths in its own process. That is what `REQ-MCP-047` already
describes and permits: per-process, never-shared caching means a probe from the window and a discovery
inside a run are *supposed* to be independent observations, and `REQ-MCP-054`'s "reports the state of
the server at the moment it runs" endorses the difference. The alternative — one central MCP service
with the run calling tools over IPC — was rejected because it puts the run's tool latency and the
window's responsiveness on one channel, which `REQ-MCP-068` and `REQ-MCP-108`'s 100 ms budget both
press on.
