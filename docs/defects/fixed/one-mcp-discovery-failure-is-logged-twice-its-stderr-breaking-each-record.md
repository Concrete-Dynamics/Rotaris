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
[`the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`](the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md)
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

## Repaired — 2026-10-03

One emitter, one line. `ToolDiscovery`'s REQ-MCP-048 warning (`packages/mcp/src/discovery.ts`) is the failure's one record:
it now carries the time (`tool discovery failed in N ms`), the project the run host launched (`mcp <name> (project <root>):`,
from the new optional `DiscoverRequest.context`, so REQ-MCP-034's binding stays readable from a failure) and the detail with
its lines trimmed and joined by ` | `, so the child's standard error stays inside the one physical line. `McpHost.prepare`
(`apps/desktop/src/run-host/mcp.ts`) logs a success only. `apps/desktop/scripts/lib/restated-facts.mjs` knows the run host's
old line as a fifth restatement (`KNOWN_RESTATEMENTS`, which the live run's check label now reads), and
`apps/desktop/scripts/lib/code-intelligence-binding.mjs` reads the project from the warning as well as from an older pack's
run-host line. `mcp-proof`'s exit-bound launch reads the 35 s bound from the warning.

**Two more readers of the removed line, repaired 2026-10-03 in the same plan's repair round** (the verifier's finding: the
first repair left them matching only the run host's line). `apps/desktop/scripts/plan-gate-proof.mjs`'s guard that its
fixture turned code intelligence off (launch 1, from the fixed
[`plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md`](plan-gate-proof-turns-code-intelligence-off-with-a-key-nothing-reads.md))
tested the log for `discovery of 'code_intelligence'`; on a proof tree, which has no bundle, the only discovery is a failed
one, so after the first repair the guard could no longer fail. It now reads `codeIntelligenceDiscovered`
(`lib/code-intelligence-discovery.mjs`): a discovery that listed tools or failed, in either form, and never a setup step,
which runs while the server is disabled. `apps/desktop/scripts/mcp-console-spike.mjs` read its `token` server's failure as
`discovery of 'token' failed`, which left `reservedToken` empty; it now reads `discoveryFailed('token')`, the same module's
pattern for one server's failure in either form. `code-intelligence-discovery.test.ts` pins both readers, and it fails
on any script under `apps/desktop/scripts/` that still matches a named server's `discovery of '<name>'` for anything but a
listing. Run against the two scripts as they were, that test named both lines.

Pinned by (each red before the repair, run against the unrepaired code with the tests in place):

- `packages/mcp/src/mcp.test.ts` — "warns a failure once, on one line that keeps the child's whole standard error and the
  time it took (REQ-MCP-048, U4)", with the `context` naming the project;
- `apps/desktop/src/run-host/mcp.test.ts` — "writes no line of its own for a failed discovery: the failure is the
  discovery's one warning", beside "says a successful discovery once, with its tool count and time";
- `apps/desktop/scripts/lib/restated-facts.test.ts` — the five restatements named by line, fact and owner, and a success's
  line taken for none;
- `apps/desktop/scripts/lib/code-intelligence-binding.test.ts` — a failed discovery read from the warning, with and without
  a project;
- `apps/desktop/scripts/lib/code-intelligence-discovery.test.ts` — "every reader of a failed discovery reads its one form
  since 2026-10-03 (U4)": `discoveryFailed` and `codeIntelligenceDiscovered` over both forms, and no script left matching
  the removed line (red on the two scripts as they were);
- `mcp-proof` launch 6 (drop rules) — `broken`'s failure is one `warning` record on one line carrying both of its stderr
  lines, and `restatedFacts` finds nothing in the launch's log.

Shown on the built branch (fin13, worktree `Rotaris-crw-wt-fin13-mcpfateandli`), after `pnpm build`:

- before the repair, the same launch 6 logged the pair (`drop-rules.log` lines 68-71: the warning at 09:17:32.904 as two
  physical lines, then `mcp: discovery of 'broken' failed (…)` at info 2 ms later, again two lines);
- after it, `mcp-proof --skip-build` passed (load average 6 to 7.2), its `results.json` `dropRules.brokenWarning` reading
  `warning run host: mcp broken: tool discovery failed in 423 ms (Version negotiation probe failed: write EPIPE (broken exited
  with code 3; stderr: broken: first stderr line | broken: second stderr line)); the persona prompt will list this server
  with no tool details attached (REQ-MCP-048)`, and its exit-bound launch reading 35,002 ms from the warning;
- `injection-proof --skip-build` read both code-intelligence bindings from the warning (`mcp code_intelligence (project
  <worktree>): tool discovery failed in 923 ms (…)`, one line), and `git-proof --skip-build` passed with no restatement.

The live scenario that shows it is any live-run launch whose discovery fails (a duress run on a tree without the bundle, as
at `1763f7f`; since this plan's live-run precondition such a tree refuses to start, so a server that fails discovery for
another reason): one warning line per failure and the restatement check reading "none of the 5 known restatements"; the
orchestrator runs it after the merge.
