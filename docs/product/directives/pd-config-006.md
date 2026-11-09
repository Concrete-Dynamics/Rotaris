[Product directives](../directives.md) › PD-CONFIG-006

<a id="pd-config-006"></a>

### PD-CONFIG-006 — the MCP Servers row's ON press writes `enabled` for a configured-off server

Settings › MCP Servers SHALL make a press of ON on an **available** row whose configured value is `false` do what the screen says it
does: the press SHALL persist `mcp_servers.<name>.enabled: true` into the selected scope's `agents.yaml` through the scoped per-field
write path of REQ-CONFIG-441, followed by the configuration reload, in **one press**, and the row SHALL thereafter read as enabled.
For every other case the session toggle of REQ-MCP-094 and REQ-MCP-115 keeps its meaning unchanged — a server configured on stays
session-scoped, and no third store of enablement is created. An **unavailable** server keeps REQ-CONFIG-349's non-interactive switch and
its reason; the screen itself still creates no server and removes none (REQ-CONFIG-464, REQ-CONFIG-350). A press that persists
`enabled: true` also clears any session override held for that name, so the two controls of REQ-MCP-115 never disagree about a row the
user just switched on; a configuration reload alone never clears an override.

**Why, and what it costs.** The owner reports that pressing ON on the shipped `browser` server — configured off, available — changes
nothing that survives, and that the row's wording promised otherwise. Two earlier directives took the neighbouring narrowings and left
this one: PD-CONFIG-003 took the two Runtime timeouts and PD-WORKSPACE-002 the instruction files, each joining destination 1 of
REQ-CONFIG-417. This is that destination's third joining, and it is the one REQ-MCP-115 already said must exist — a settings surface
that writes configuration is the durable control. What it costs is the session's remaining licence to be silent: an ON press now writes
a file, one key of it, at the moment it is pressed rather than at Save, which is exactly the pair of write policies REQ-CONFIG-328
keeps, and the row's own text must say so.

> **Narrows:** REQ-CONFIG-417, REQ-MCP-094, REQ-MCP-115

*Raised by the owner, 2026-11-08, relayed in a lane brief; logged as [R-095](../requests.md#r-095).*
