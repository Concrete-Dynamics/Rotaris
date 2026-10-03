## One MCP discovery failure is logged twice, its stderr breaking each record across lines

Observed 2026-10-03 by the orchestrator's duress live run at origin/main `1763f7f` (pack `2026-10-03T06-15-52-273Z` of the
`wt-live` worktree, git-ignored; finding U4 of its autopsy). One failed tool discovery of `code_intelligence` reached the
application log as two records from two emitters in the run host, each carrying the child's whole standard error:

- `duress/app.log:37-39` (06:16:07.854, `warning`) — `ToolDiscovery`'s REQ-MCP-048 warning, "mcp code_intelligence: tool
  discovery failed (Connection closed (code_intelligence exited with code 127; stderr: …)); the persona prompt will list
  this server with no tool details attached (REQ-MCP-048)";
- `duress/app.log:40-42` (06:16:07.855, `info`) — `McpHost.prepare`'s "mcp: discovery of 'code_intelligence' failed
  (…same detail…) in 508 ms".

The detail holds the child's stderr, two lines here, and the application log writes a message of several lines as several
physical lines, so each record printed as three lines, the stderr lines reading as "warning run host: [13101:…] Failed to
connect to the bus …" — three of the log's 51 `warning` lines describe one fact, and three `info` lines repeat it.

This is the class of the fixed
[`the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`](fixed/the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md)
(a71-9): one fact, two emitters. `apps/desktop/scripts/lib/restated-facts.mjs` knows that note's four pairs only, so the
live run's "none of the four known restatements reaches the application log" passed over this one.

## Specs

- REQ-MCP-048 — on a discovery failure "a warning SHALL be logged at most once per identity noting that the persona
  prompt will list this server with no tool details attached". The warning is the required record; the second record
  restates it.
- PD-MONITOR-002 governs the application log's levels, not duplicates; no requirement is contradicted by the line breaks.

## Relevant files

- `packages/mcp/src/discovery.ts` — `ToolDiscovery.interrogate`'s `finish`, the REQ-MCP-048 warning (line 105 at
  `1763f7f`).
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.prepare`, which logs every non-memoised discovery outcome, the failure
  included (line 209 at `1763f7f`).
- `apps/desktop/src/main/app-log.ts` — `formatAppLogLine` writes each line of a multi-line message as its own physical
  line.
- `apps/desktop/scripts/lib/restated-facts.mjs` — the reader of known restatements, which does not know this pair.

Noticed 2026-10-03 by the autopsy of the duress live run at `1763f7f`.
