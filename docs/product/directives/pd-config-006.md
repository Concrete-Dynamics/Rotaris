[Product directives](../directives.md) › PD-CONFIG-006

<a id="pd-config-006"></a>

### PD-CONFIG-006 — the MCP Servers row's ON press writes `enabled` for a configured-off server

*Revision 2 (2026-11-21, [R-119](../requests.md#r-119)) — **the web-search panel's Save and test makes the same write**,
at the foot. Revision 1 (2026-11-08, [R-095](../requests.md#r-095)) is the text above it, unchanged.*

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

**The web-search panel's press — revision 2.** The same durable write SHALL also be made by the **Save and test** press of
REQ-MCP-111's web-search control, for the `web_search` entry and for no other: once the key is stored, an **available** `web_search`
entry whose configured value is `false` is switched on by the write and the override-clearing command this directive gives the row's
ON press, and the press then probes the server (REQ-MCP-092) and states its answer in REQ-CONFIG-353's words. An entry configured on, or
one the stored key leaves unavailable, is not written. A stored key alone still turns nothing on outside that press, and the row's own
switch is unchanged.

*Why, and what it costs (revision 2).* The shipped entry is declared `enabled: false` (REQ-CONFIG-181), so a user who had stored the
key still had to find the row's switch and then the probe — three acts in three places for one intent, which the owner reported as
awkward. Every harness surveyed for R-119 that asks for a search key treats supplying it as switching search on. What it costs: the press
that stores a key also writes the configuration file, at the moment it is pressed, and its confirmation says so in the words the row's
press uses. Revision 1 said nothing this replaces: it gave the write to the row's press alone, and that press keeps it.

> **Narrows:** REQ-CONFIG-417, REQ-MCP-094, REQ-MCP-115
> **Extends:** REQ-MCP-111

*Raised by the owner, 2026-11-08, relayed in a lane brief; logged as [R-095](../requests.md#r-095).*
