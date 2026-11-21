[Product directives](../directives.md) › PD-CONFIG-013

<a id="pd-config-013"></a>

### PD-CONFIG-013 — the web search panel writes the provider it is pointed at

Settings › Tools' web search panel (REQ-MCP-111's control) SHALL let the user choose which search service the built-in
`web_search` entry reaches, and SHALL write that choice itself: one press persists `mcp_servers.web_search.url` — that
one field of that one entry, and no other — into the selected scope's `agents.yaml` through the scoped per-field write
path of REQ-CONFIG-441, followed by the configuration reload, and the panel thereafter names the provider the url
points at. The choices are the hosted providers the implementation lists (REQ-CONFIG-181 leaves the vendor open), each
written as its own url with `${ROTARIS_SEARCH_API_KEY}` where it takes a key, and **your own server**, an `http` or
`https` address the user types, which the panel refuses unless it parses as one. The press writes no key: the key stays
REQ-MCP-111's, in the secrets store, and a provider that takes one reads the key already stored. The written `url`
SHALL be a value the file then holds in plain sight, as any other field the screen writes. The file edit stays offered
beside it — the stanza, Copy and Open the file — for any other change to the entry.

Everything else REQ-CONFIG-350 and REQ-CONFIG-464 say governs unchanged: the screen creates no tool server and removes
none, renames none, writes no other entry's address, no command line, no `headers` and no `env`, and the empty state
for a configuration with no `web_search` entry still names the file. A provider whose key travels only in a header is
not offered, because the key control satisfies a url placeholder alone (REQ-MCP-088) and a key written into a header
would stand in the configuration file as plain text.
REQ-CONFIG-464 is narrowed twice already, by `PD-CONFIG-001` (a role's MCP grant fields) and `PD-WORKSPACE-002` (the
instruction files' overrides); this case — one field of one tool-server entry — is disjoint from both.

**Why, and what it costs.** The owner asked for the search setup to stop being awkward and chose, of the two paths put
to them, both: the shipped default made to work with a key alone (no directive), then this. Every harness surveyed for
R-119 that offers a choice of search provider makes it a setting, not a file edit; the stanza to copy by hand was the
pattern they avoid. REQ-CONFIG-350's reason — a tool server's declaration carries a command line or an address and is
reviewed as configuration — is met narrowly rather than dropped: the screen writes one address, of the one entry the
product ships for this purpose, from a list it shows or from an address the user typed, and the write lands in the
user's own file where it is reviewed like any other. What it costs is the screen's clean line that no address is ever
written by it; the line now has one named exception, and the panel says in words that choosing writes the file.

> **Narrows:** REQ-CONFIG-350, REQ-CONFIG-464
> **Extends:** REQ-MCP-111

*Raised by the owner, 2026-11-21, in conversation ("A, then B", over a plan whose path B was this); logged as
[R-119](../requests.md#r-119). Minted by the agent that built it (`claude-opus-5-5`).*
