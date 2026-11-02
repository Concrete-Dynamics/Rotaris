## code-intel-proof reads the discovery line without its project and records NaN

`pnpm code-intel-proof`'s launch 2 reads the tool count and the discovery time from the run host's line
"mcp: discovery of 'code_intelligence' listed <n> tool(s) in <ms> ms". Since `643e17c` (REQ-MCP-034's binding shown in the log)
that line names the project the run host launched — "discovery of 'code_intelligence' (project <path>) listed 22 tool(s)
in 2869 ms" — and the proof's two regular expressions no longer match it. Both values become `NaN`: the console prints
"2 discovery: NaN listed in NaN ms", and `results.json` records `discovery.listed` and `discovery.discoveryMs` as `null`.
No assertion reads either value, so the proof stays green while its record of the discovery is empty.

Noticed 2026-10-06 while running the proof for fin18 (task G3); not repaired here.

## Specs

None contradicted by the product: the line is REQ-MCP-034's and PD-MONITOR-002's as built. The proof's own record of
REQ-MCP-053's discovery time and the 22-name listing is what is lost.

## Relevant files

- `apps/desktop/scripts/code-intel-proof.mjs:280-281` — the two regular expressions, `discovery of 'code_intelligence'
  listed (\d+) tool\(s\) in (\d+) ms` and `… listed (\d+) tool\(s\)`, with no room for the ` (project …)` part.
- `apps/desktop/src/run-host/mcp.ts` — `McpHost.prepare`'s line, "mcp: discovery of '<name>' (<project words>) listed …".
- Evidence: `.proof/code-intel-proof/discovery.log` (git-ignored) holds the line with its project; the console line of the
  run on 2026-10-06 reads "[code-intel-proof] 2 discovery: NaN listed in NaN ms".

## Repaired — 2026-10-06 (fin21, bundle `fin21-leftover-notes`)

Launch 2 reads the listing through `codeIntelligenceListing` (`apps/desktop/scripts/lib/code-intelligence-discovery.mjs`),
which uses the module's own `LISTED` pattern, the one the live run's U5 statement already reads with the line's optional
` (project …)`: it answers `{ listed, ms, project }` for the first discovery that listed the tools, or null. The proof now
fails when no line records the listing and its time, or when the line names a project other than the workspace launch 2
ran in, instead of recording `null`.

Pinned by `apps/desktop/scripts/lib/code-intelligence-discovery.test.ts`, "code-intel-proof's record of the discovery"
(the line with its project, an older line without one, and null where discovery failed or nothing ran). Shown with the
proof, `--steps=2,3 --skip-build` after `pnpm build`, as root under Xvfb, Node 24, load 5.9 to 6.1 on 4 CPUs with another
plan's agents on the host: the unrepaired script (from `HEAD`, run from a scratch copy beside it) printed "2 discovery: NaN
listed in NaN ms" and passed; the repaired one printed "2 discovery: 22 listed in 3811 ms" and `results.json` records
`discovery.listed` 22 and `discovery.discoveryMs` 3811. Stages 1 and 4 to 7 were not run for this change.
