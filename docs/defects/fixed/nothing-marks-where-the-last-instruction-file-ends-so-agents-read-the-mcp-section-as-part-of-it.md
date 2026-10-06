## Nothing marks where the last instruction file ends, so agents read the prompt's MCP section as part of it

Every agent's system prompt carries the workspace's instruction files as one context unit: each file is introduced by its
`<!-- source: <path> -->` comment and nothing closes it. The unit is followed by the next one in REQ-WORKSPACE-060's order,
and the turn then appends the persona's MCP section (`## MCP servers` and its bullets) after one blank line. With no skill
catalog in the workspace, the last instruction file's text runs straight into `## MCP servers`, and nothing tells the model
that the heading is not the file's own.

Observed in the orchestrator's final duress live run at origin/main `27a5127` (2026-10-06, 01:48 to 02:44 UTC, against the
self-hosted endpoint; pack `2026-10-06T01-47-53-900Z`, finding H4 of its autopsy), an all-PASS run:

- **The prompt.** `duress/model-traffic.jsonl` record #11 (0-based; a docs-writer's request) ends with
  `<!-- source: <ws>/AGENTS.md -->`, the file's 13 lines (its own heading is `# Working in this repository`), a blank line,
  then `## MCP servers` and 19 tool bullets, which read as a subsection of the file.
- **A docs child believed it.** wave1c's call #83 wrote, in its `AGENTS.md` row, "Lists the MCP server `code_intelligence`
  and its tools". Row 166 of `duress/transcript.md`: "the system prompt version of AGENTS.md included the MCP section — that's
  the injected version. The actual file on disk (13 lines) has no MCP section". Calls #97 (a grep) and #99 removed the claim,
  51 s after it was written (01:51:35.8 to 01:52:26.7).
- **So did the orchestrator.** Row 199: "it's longer than 13 lines. Let me have the child verify by reading AGENTS.md"; the
  wave2d brief's item 6 then listed "AGENTS.md (13 lines)" to check, and row 397 records "verified 13 lines".

Two of the run's eight agents were misled: a false claim in a deliverable, and a needless verification item in a brief.

## Specs

None contradicted. REQ-WORKSPACE-043 fixes the merged output: each file preceded by its source comment, blocks separated by
one blank line, nothing said about an end. REQ-WORKSPACE-047 and REQ-WORKSPACE-060 make that output its own context unit,
ahead of the catalog, the force-loaded skill bodies and persona memory. REQ-MCP-101 fixes the MCP section's body and leaves its
heading to the build. ADR-0034 (REQ-MCP-101/102 byte-exact) and ADR-0063 (the ordered unit list) fix neither the section's
place in the prompt nor a boundary between the units. The layout is the build's to choose, and the one it chose leaves the end
of the last file unmarked.

## Relevant files

- `packages/config/src/instructions.ts` — `instructionSourceComment` and `mergeInstructionContext`: the merged output, a start
  comment per file and no end.
- `apps/desktop/src/run-host/skills.ts` — `contextUnits`: pushes the merged output as the first unit, unframed.
- `packages/engine/src/run/run.ts` — `withContextUnits`: joins the units after the role's prompt with one blank line.
- `packages/engine/src/run/turn.ts` — `runTurn`: appends the MCP section (`${systemPrompt}\n\n${section}`).
- `packages/config/src/mcp/prompt.ts` — `renderMcpSection`: the section, opening with `## MCP servers`.

Noticed 2026-10-06 by the autopsy of the final duress live run at `27a5127` (H4); recorded by plan fin19 before any repair.

## Outcome (2026-10-06, fin19, repaired)

The specification leaves the layout to the build, as the Specs section says, so the build now marks the end of the files.
`instructionContextUnit` (`packages/config/src/instructions.ts`) makes the workspace-context unit from the merged output,
unchanged, followed by one blank line and `INSTRUCTION_FILES_END_COMMENT`:
`<!-- end of instruction files: nothing below this line is part of them -->`. `SkillHost.contextUnits` builds the first unit
with it. Each file now runs from its source comment to the next source comment or to that line. Whatever the prompt carries
next, the skill catalog or the MCP section, comes after the close. The close sits outside the merged output, so
REQ-WORKSPACE-043's format, REQ-WORKSPACE-044's total limit and REQ-WORKSPACE-049's logged byte count all still describe the
files' own blocks. With no instruction file there is no unit and no close (REQ-WORKSPACE-047). `runTurn` appends the MCP
section through the exported `withMcpSection`, the same join as before, now named so the assembly can be tested as the
product does it. A session resumed across this change sees its instructions fingerprint change once (OQ-105's warning), as it
would for any change to the prompt.

Pinned by "REQ-WORKSPACE-043 with REQ-MCP-101: the instruction files are closed before the MCP section, so its heading is not
read as the last file's" in `apps/desktop/src/run-host/skills.test.ts`. The test assembles the prompt with the product's
three steps (`contextUnits`, `withContextUnits`, `withMcpSection`) over an `AGENTS.md` whose own heading is a `#` and no
skill: the live run's shape. Between the file's last line and `## MCP servers` stands exactly the close, with one blank line
on each side. With a skill added, the close ends the first unit and the catalog follows it. The test is red with
`skills.ts` unrepaired (between the file and the heading stood `"\n\n"`). Further cases: the no-file case in the same file,
and the unit's shape in `packages/config/src/instructions.test.ts`.

Shown by `pnpm mcp-proof`, whose launch 1 now writes an `AGENTS.md` into its workspace and reads the orchestrator's system
prompt as the model port received it (`ROTARIS_CAPTURE_MODEL_REQUESTS`, `.proof/mcp-proof/discovery.model-requests.jsonl`).
On the unrepaired build it stopped red: "nothing closes AGENTS.md; after its last line stands "\n\nPortable skills available
in this workspace. …"". On the repaired build all ten launches passed, and `results.json` records
`discovery.promptBoundary` as the close between two blank lines. Load average about 5 on 4 CPUs, with two other plans running.
In this proof the repository's own skills sit between the close and the MCP section, because its workspace lies inside the
checkout. That is recorded separately in `docs/defects/the-mcp-proofs-runs-list-the-repositorys-own-skills-in-their-catalog.md`.
