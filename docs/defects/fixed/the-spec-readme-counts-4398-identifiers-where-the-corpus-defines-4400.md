## The spec README counts 4,398 identifiers where the corpus defines 4,400

`docs/spec/README.md` gives 3,954 shipping identifiers (3,696 live) and 4,398 in all, with REQ-TOOLS at 192 and REQ-MCP at
117. The corpus the symbol generator reads defines 4,400 (`packages/kernel/src/generated/requirements.ts`: "4400
requirement identifiers, 268 withdrawn in place"): REQ-TOOLS-193 (`git_read`, minted under OQ-61 on 2026-09-18) and
REQ-MCP-118 (the language-server disclosure, minted under ESC-32 on 2026-09-06) were never added to the table or the
totals, although the README's own code-intelligence round says it minted REQ-MCP-118, and REQ-TRACE-515 of the
board-parse round was counted. The withdrawn counts are right. Nothing checks the table against the corpus.

Found by the 2026-10-13 survey at `6de2a67` (item N91).

## Specs

- `docs/spec/README.md` itself: its status line and domain table misstate the corpus.

## Relevant files

- `docs/spec/README.md` — the Requirements status line, the domain table, the round narrative.
- `docs/spec/05-tools-permissions-approvals.md` — REQ-TOOLS-193; `docs/spec/16-mcp-integration.md` — REQ-MCP-118.
- `tools/symbol-artifact/generate.mjs` — the generator whose artifact counts them.

## Repaired — 2026-10-13 (fin41)

`docs/spec/README.md`'s status line reads 3,956 shipping identifiers, 3,698 live and 4,400 in all (withdrawn unchanged at
258, 10 and 268), with the old figures quoted beside it; the table gives REQ-TOOLS 193 and REQ-MCP 118; and a `git_read`
round line records OQ-61's REQ-TOOLS-193 beside the other rounds. No requirement's text changed.
`tools/symbol-artifact/spec-readme-counts.test.ts` reads every table row against the generated artifact's count and
withdrawn count for its prefix, and the status line's seven figures against the table's sums and the artifact's total:
on the README before the repair it failed 3 of 23 (REQ-TOOLS, REQ-MCP, the status line); after it, 23 of 23 pass.
`docs/architecture/codebase.md`'s 4,398, pinned to `bf55233`, is history and stays.
