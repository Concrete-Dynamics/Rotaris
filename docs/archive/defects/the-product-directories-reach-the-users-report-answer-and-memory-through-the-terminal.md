## The product's directories reach the user's report, answer and memory through the terminal

Since PD-TOOLS-012 the file tools hide both of the product's own workspace directories — `.rotaris/` (REQ-TOOLS-140) and the
code-intelligence runtime's marker directory — while a terminal still lists them, and no agent is told what they are. An agent
without a terminal infers they are absent; an agent with one finds them, and reports them as a finding about the user's
project, into the user's documents, the final answer and the project memory.

Live-run finding: D4 of the final duress live run at `a68f121` (2026-10-07, pack `2026-10-07T07-09-30-708Z` of the live
worktree, session `e6747bd0`, the self-hosted endpoint), the remainder OQ-215 said would be raised as its own question if it
cost.

- **Where it entered:** b's `ls -a` (#47); wave3's `ls -la` and `find . -type f` (#249, #250) and its `git check-ignore` probes
  (#281, #283, #285, #286); wave3b's `ls -a .rotaris .serena` (#354). The file tools were clean: the six whole-tree `glob **/*`
  calls (#1, #24, #29, #73, #126, #135) and `**/.*` (#65) listed neither directory, and 0 file-tool calls named one.
- **The delivered report:** wave3 wrote it into `docs/verification.md` (#289); line 224 of the final file discusses the
  marker directory's `project.yml` and `project.local.yml`.
- **The answer:** row 766's "Remains" relays that `docs/overview.md:22-23` claims everything gitignored is absent "when
  `.rotaris/` and `.serena/` are present". That claim was written by docs-writer c, a persona with no terminal
  (`BUILT_IN_ROLE_TOOLS`), which the file tools had told nothing.
- **The memory:** wave3's `edit_memory` #311 wrote into the project memory `todo-app/docs-pair` that `.rotaris/` and the marker
  directory are present and "absence must be checked with `ls`" — read by every later run's agents before they start.
- **Volume:** 21 calls and 32 rows (25 of them thinking rows in the two cut-off testers), against 28 / 96 at `c2a9444` (N6)
  and 41 / 112 at `c2fdd6a` (L3); the third duress run in a row whose report to the user carried product files.

## Specs

- None contradicted as written: OQ-161 (R-071) ruled that "the agents are not told that the product wrote the exclude line",
  and OQ-215 kept "the agents' instructions are unchanged" pending this measurement. Ruled 2026-10-07 under R-072 as OQ-230:
  [`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012) revision 2 extends REQ-WORKSPACE-060 with a product statement every
  agent receives as its last always-active context unit.
- REQ-TOOLS-140 and PD-TOOLS-012 (the file tools hide both); REQ-MCP-099 and REQ-MCP-102 (memories persist across runs);
  REQ-WORKSPACE-060 (the context units); REQ-CONFIG-100 (a configured persona's prompt).

## Relevant files

- `apps/desktop/src/run-host/skills.ts` — `SkillHost.contextUnits`, the units every agent of a session receives.
- `packages/engine/src/run/run.ts` (`withContextUnits`, the entry agent) and `packages/engine/src/children/orchestration.ts`
  (each child, whatever its persona's prompt) — where the units reach the system prompt.
- `packages/agent-tools/src/tools/search.ts` — `IGNORE_COMPONENTS`; `packages/config/src/load.ts` — `keepScopeDirIgnored`
  and the marker's `info/exclude` line.

## Repaired — 2026-10-07 (fin32, under PD-TOOLS-012 revision 2)

`PRODUCT_DIRECTORIES_UNIT` (`packages/config/src/product-directories.ts`) states the directive's four points, the two names
built from `WORKSPACE_SCOPE_DIR` and `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]`; `SkillHost.contextUnits`
(`apps/desktop/src/run-host/skills.ts`) pushes it last on every call, with no instruction file, no skill and injection off
too. Pinned by `packages/config/src/product-directories.test.ts`, by seven cases in `apps/desktop/src/run-host/skills.test.ts`
red on the code before (among them "PD-TOOLS-012 revision 2: every call ends with the same product statement …"), and by a
guard in `packages/engine/src/run/record.test.ts` (the entry agent and a child with a configured prompt both end their units
with the run host's last one). `pnpm mcp-proof`'s launch 1 reads the built app's orchestrator prompt and asserts the statement
stands, alone, between the closed instruction files and the MCP section. Not measured: the live effect — the next default and
duress live runs are the measurement (no delivered file, answer or memory naming either directory; calls and rows naming them
well below 21 and 32). Memories already written, such as the `todo-app/docs-pair` edit of this pack, are unchanged.
