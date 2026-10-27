# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — Alternatives considered

Part 3 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## Alternatives considered

**Connections — A: one pool serving all three paths with a cache policy per caller.** Faster, one place
that knows how to open a connection. Against: it makes `REQ-MCP-054` hard to honour and easy to
violate — a probe that reuses a session connection is not "contacting the server" in the sense the
requirement means — and it puts `REQ-MCP-047`'s memo and `REQ-MCP-054`'s explicit non-caching in the
same object with opposite policies.

**Connections — C: a supervisor per stdio server with automatic restart.** Robust; a crashed server
comes back. Against: `REQ-MCP-069` forbids it in terms, and automatic restart would break
`REQ-MCP-067`'s process count and make `REQ-MCP-054`'s "reports what it observes at that moment"
untrue.

**Configuration — A: resolve lazily at the point of use, emitting warnings where they arise.** Least
ceremony. Against: it makes the four de-duplication scopes into four ad-hoc caches scattered through the
code, makes `REQ-MCP-009`'s side-effect-freedom uncheckable, and makes `REQ-MCP-061`'s
function-of-configuration-alone a claim rather than a theorem.

**Configuration — C: validate with a schema library and let it produce the diagnostics.** Good for
shape. Against: the interesting defects are cross-field (stdio needs a command, remote entries need a
URL), **source-dependent in severity**, and deliberately lenient about unknown keys in the opposite
direction from the snapshot. A schema library is a good component inside the chosen design and a poor
replacement for it.
