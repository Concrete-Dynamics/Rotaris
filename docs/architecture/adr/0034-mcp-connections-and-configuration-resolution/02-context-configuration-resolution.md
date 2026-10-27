# ADR-0034 — MCP: three connection paths, one launch primitive, and a pure configuration pipeline — Context — configuration resolution

Part 2 of 7 of [ADR-0034](../0034-mcp-connections-and-configuration-resolution.md), which indexes every part.

## Context — configuration resolution

`REQ-MCP-025`, `REQ-MCP-026` and `REQ-MCP-008`: merge order is defaults, discovered, global YAML,
workspace YAML, field-wise for same-named entries, with a machine-maintained origin map that is never
user-settable. `REQ-MCP-002` and `REQ-MCP-023`: **the same defect is fatal from YAML — reporting every
defect, not the first — and non-fatal from a discovered file, dropping that entry alone.**
`REQ-MCP-027`: discovered files are consumed strictly read-only and must be byte-for-byte identical
after any number of loads; an unrecognised key inside an entry is warned about at most once per (file,
server, key) **per load** and does not skip the entry.

Four different warning de-duplication scopes coexist: per load (`REQ-MCP-027`), once per server per
**process** (`REQ-MCP-041`), once per identity (`REQ-MCP-048`), once per (server, tool) per process
(`REQ-MCP-058`), once per server per **session** (`REQ-MCP-069`).

`REQ-MCP-055`: grant resolution has five named cases and cases (b) "no entry means everything" and (c)
"empty list means nothing" must be **distinguishable in the resulting surface**. `REQ-MCP-004` and
`REQ-MCP-056`: denial outranks every grant. `REQ-MCP-057`: candidate spellings are the literal name
**plus** the unprefixed remainder under three provider prefixes — added, never substituted.
`REQ-MCP-005`: renaming applies only to survivors, makes the replacement the only callable name, and is
matched **against the server-reported name only** for disable and grant purposes — "renaming is a
presentation decision and never a permission decision". `REQ-MCP-006`: an entry's static `tools` list
is inert.

`REQ-MCP-043`: the normalised runtime description has an **exactly-equal key set** with one key absent
when the timeout is unset, "so a consumer can compare the description's key set against this list
exactly"; filtering, renaming and grants are applied *before* it is produced and are never expressed as
keys; a remote entry is never PATH-checked while producing it.

`REQ-MCP-061`: a persona's callable tool set is a **function of configuration alone**, and the identical
filtered set is observed whether the persona runs in a watched run or a background one. `REQ-MCP-009`:
resolving a persona's server set is side-effect free on configuration, including its argument list,
under repeated resolution. `REQ-MCP-117`: every ordered presentation uses ascending code-point order
over the raw string, case-sensitive and locale-independent, identical on every platform.

`REQ-MCP-101` and `REQ-MCP-102` fix the prompt rendering byte-exactly, and the printed names are exactly
the callable names after denial, grants and renaming. `REQ-MCP-044`: warnings reach the user through
exactly **two** channels — an 8-second warning toast and a persisted session issue with a fixed kind,
severity and actor. `REQ-MCP-107`: a launch failure whose cause chain holds an MCP connection error
produces **exactly one** diagnostic, never zero, never two.

`REQ-MCP-078`, `REQ-MCP-115` and `REQ-MCP-094`: enablement is consulted afresh at every persona
resolution, changing it mid-run never crashes the run and takes effect on the next iteration, and there
are exactly two controls and no third store — the durable field and a session-only desktop override
discarded at exit.
