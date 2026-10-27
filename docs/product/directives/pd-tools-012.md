[Product directives](../directives.md) › PD-TOOLS-012

<a id="pd-tools-012"></a>

### PD-TOOLS-012 — the code-intelligence runtime's marker directory is a hard-coded ignore component, and every agent is told what the product's own workspace directories are

*Revision 2 (2026-10-07, R-072, the ruling of OQ-230 on finding D4 of the final duress live run at `a68f121`) — the heading
widens, the clause marked "— revision 2" below is added, the disposition gains REQ-WORKSPACE-060, and two sentences of
revision 1 no longer govern (quoted beside the new clause). Revision 1's heading was: "PD-TOOLS-012 — the code-intelligence
runtime's marker directory is a hard-coded ignore component", and its disposition: "Extends: REQ-TOOLS-140".*

The directory that holds the code-intelligence runtime's per-project marker file SHALL be a member of REQ-TOOLS-140's
hard-coded ignore components, beside `.rotaris`, matched at any depth. Its name is the first segment of the marker path in
REQ-MCP-116's binding manifest, and the code SHALL NOT write it as a literal. REQ-TOOLS-139's grep and glob scans and
REQ-TOOLS-134's directory and parent listings therefore skip it as they skip `.rotaris`, by reference to REQ-TOOLS-140; a
file inside it named by its path is still served by `read_file` and `haet_read` (REQ-TOOLS-139). Nothing else about the
directory changes: `.rotaris/` alone goes in `.gitignore` and the marker's directory in the repository's `info/exclude`
(OQ-161, ruled as built), the marker and its memories stay in the workspace root and are reached through the memory tools
(REQ-MCP-102), and where an isolated tree's memories live stays with OQ-195, deferred.

**What every agent is told about the product's own directories — revision 2.** Every agent built for a session SHALL
receive one product statement as its own always-active context unit, placed after REQ-WORKSPACE-060's four units: the entry
agent and every child, whether its persona is built in or configured (REQ-CONFIG-100). The statement is independent of
context-file injection (REQ-WORKSPACE-047): a workspace with no instruction files, no skills, or injection disabled still
gives it. Every prompt that carries the statement SHALL carry the same characters in the same order. The wording is the
implementation's; it SHALL carry four points, each true in every workspace:

- (a) the workspace scope directory and the directory holding REQ-MCP-116's marker, named from their single sources and never
  written as literals, and that where present they hold the application's own state and its code-intelligence runtime's
  project data;
- (b) that the application keeps them out of version control with lines it writes itself: the scope directory in the
  workspace's `.gitignore`, and the marker's directory in the repository's `info/exclude` only when the workspace is a
  repository's top level, so elsewhere version control may list it as untracked;
- (c) that glob, grep and directory listings never show them and a terminal does;
- (d) that unless the task concerns them, they stay out of documents, reports, findings, answers and project memories, and are
  not counted as changes to the workspace.

Revision 1 said, and no longer governs: "Nothing else about the directory changes" — the agents are now told about it — and,
among its costs, "An agent with a terminal can still list it with `find` or `ls -a`", which revision 2 answers. The rest of
revision 1 stands: the directory, the exclude line, the tool descriptions and the memories already written are unchanged.

**Why, and what it costs.** OQ-161's ruling accepted that the file tools list the directory on one run's evidence (the duress
run at `27a5127`: 38 calls by 5 agents and 80 rows naming it, three of the verifier's five defects about it). The two duress
runs since measured the cost again and found it larger. At `c2fdd6a` (finding L3), 5 agents made 41 calls and wrote 112 rows
naming it, and 37 of the failed child d2's 45 requests, 1,142.5 s of its 1,222.6 s of generation, reasoned about `.serena`,
`.rotaris` or `.git` on the run's critical path; both defects the user was told of were about product files. At `c2a9444`
(finding N6), 28 calls and 96 rows named it, a memory was written into the tree and the delivered overview listed the
runtime's files as repository files. The build already handled the directory two ways: REQ-TOOLS-140's `cache` hid its
`cache/` and listed the rest. What it costs: a user who tracks the directory themselves (a shared `project.yml` or shared
memories) loses glob, grep and listings over it from the product's agents, as REQ-TOOLS-140 already does for `build`, `out`,
`target`, `.idea` and `.vscode`; `read_file` by path, the memory tools and the terminal still reach it. A nested directory of
that name, in a subproject, is hidden too. An agent with a terminal can still list it with `find` or `ls -a`. REQ-TOOLS-140 is
a closed list, so black-box conformance against it sees one extra member.

**Revision 2's why and cost.** The final duress run at `a68f121` (finding D4; session `e6747bd0`) measured what revision 1
left: the file tools were clean (six whole-tree `glob **/*` calls and `**/.*` listed neither directory), and the terminal
carried the rest — 21 calls and 32 rows naming the directories; line 224 of the delivered `docs/verification.md` discussing the
marker directory's files; the answer's "Remains" relaying that `docs/overview.md` claims everything gitignored is absent while
both are present (a claim written by a docs-writer that holds no terminal, so the hidden directories read as absent); and
`edit_memory` #311 writing into the project memory that "absence must be checked with `ls`". It was the third duress run in a
row whose report to the user carried product files (at `c2fdd6a` 41 calls and 112 rows, both of the user's defects about them;
at `c2a9444` 28 and 96, the overview listing the runtime's files). A unit, not the terminal's description, because the writer
of the false claim held no terminal. What it costs: about 80 tokens per request; a fifth always-active unit that black-box
conformance against REQ-WORKSPACE-060 sees; a statement that may prime an agent to mention the directories, or to hold back a
fact about them that matters; a poorer fit for a user who tracks the marker directory; and no change to memories already
written.

> **Extends:** REQ-TOOLS-140, REQ-WORKSPACE-060

*Raised under the owner's delegation, 2026-10-07, ruling OQ-215 (the consortium's ruling of live-run findings L3 and N6);
logged as [R-072](../requests.md#r-072).* *Revision 2 raised under the owner's delegation, 2026-10-07, ruling OQ-230
(live-run finding D4); logged as [R-072](../requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072):** the rule held as written. `IGNORE_COMPONENTS`
> (`packages/agent-tools/src/tools/search.ts`) takes `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]` from `@rotaris/config`, and the
> one set already fed both the scan's walker and `read_file`'s directory listing (`listing`, `files.ts`). **Found:** the parent
> listing of a missing path read the directory unfiltered, so it listed every ignore component, `.rotaris` included; it now
> reads the same set
> ([`a-missing-paths-parent-listing-shows-the-ignore-components.md`](../../defects/fixed/a-missing-paths-parent-listing-shows-the-ignore-components.md)).
> **What was measured.** The case "the code-intelligence marker directory is a hard-coded ignore component, named by the
> manifest" in `packages/agent-tools/src/tools/tools.test.ts`, red on `d12f1f2` (glob `**/*` listed
> `.serena/memories/m.md` and `.serena/project.yml`): glob, grep, the root listing and a missing path's parent listing
> skip the directory, and its marker file named by path is served; and the parent-listing case beside it, red on `d12f1f2`. **What was not measured.** No live run: the next duress
> run is the measurement (file-tool rows under the directory near zero, no marker files in the delivered overview, `git
> status` still clean). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`; a default
> pack, not the duress run named above):** none of the pack's 165 tool records names the marker directory in its arguments
> or its result, terminal included. The one whole-tree scan, the requirements session's `#1` `glob **/*` at the worktree's
> root 5 s after the code-intelligence server started there, returned 17 paths and none under the directory; at `c2a9444`
> the same scenario's first look at its worktree listed it. **Not shown:** that the directory existed at that instant (the
> run's sandbox is gone), and the duress measurement above, which is still owed. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 1, first duress execution, 2026-10-07 (the duress run at `a68f121`, pack `2026-10-07T07-09-30-708Z`, session
> `e6747bd0`, finding D4):** the rule held as written. The six whole-tree `glob **/*` calls (#1, #24, #29, #73, #126, #135) and
> `**/.*` (#65) listed neither directory; 0 file-tool calls named one as a path; the delivered overview listed no marker files.
> **What it did not reach:** the terminal — 5 terminal commands put the directories in front of the agents, and 21 calls and 32
> rows named them, which reached the delivered report, the answer and a project memory. That remainder is revision 2's. The row is
> in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Revision 2, first execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin32):** the rule held as written.
> `PRODUCT_DIRECTORIES_UNIT` (`packages/config/src/product-directories.ts`) carries points (a) to (d) with both names built from
> `WORKSPACE_SCOPE_DIR` and `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]`; `SkillHost.contextUnits` (`apps/desktop/src/run-host/skills.ts`)
> pushes it last on every call; the engine was unchanged (`withContextUnits` already appends the units after any persona's
> prompt, the entry agent's and each child's). **What was measured.** `product-directories.test.ts` (the four points, the names
> from their sources, no literal in the source); seven cases in `apps/desktop/src/run-host/skills.test.ts` red on the code before
> (the statement last with and without context files, skills and force-loaded bodies; alone with no instruction file, the skill
> switch off or an unreadable body; between the closed files and the MCP section); a guard in
> `packages/engine/src/run/record.test.ts` (the entry agent and a child whose persona carries a configured prompt both end their
> units with the run host's last one, before the MCP section); `pnpm mcp-proof`'s launch 1 on the built app, the orchestrator's
> recorded prompt carrying the statement alone between the closed `AGENTS.md` and the MCP section. **Found:** the statement is
> 599 characters, nearer 150 tokens a request than the ruling's estimate of about 80 (*corrected by the bundle's review,
> 2026-10-07:* that statement left out point (b)'s last words, that elsewhere version control may list the marker's directory
> as untracked; with them it is 662 characters, nearer 165 tokens —
> [`the-product-statement-leaves-out-that-the-marker-directory-may-show-as-untracked`](../../defects/fixed/the-product-statement-leaves-out-that-the-marker-directory-may-show-as-untracked.md)); and a session started with no `configure`
> (a process-wide model, which only tests and scripts use) receives no units at all, the statement included. **What was not
> measured.** No live run: the next default and duress runs are the measurement — no delivered file, answer or memory naming
> either directory, calls and rows naming them well below 21 and 32, and in the default run no priming. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: revision 1's duress
> measure and revision 2's default and duress measures. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
>
> - **Revision 2's statement reached every agent:** 144 of 144 agent requests at `552d346`'s default pack, 188 of 188 in its
>   duress pack, 188 of 188 at `0bc3eee`.
> - **Duress: held.** No file-tool result listed `.serena`, and no memory, answer or delivered file named it; the one deliverable
>   naming `.rotaris` is `docs/overview.md`'s faithful quote of the workspace's `.gitignore` line (`#64`). 23 calls and 33 rows
>   name either directory, against 21 and 32 at `a68f121`, but the two counts are not like for like: 15 of the 23 calls are that
>   `.gitignore` line read back (directly or through `docs/overview.md`), 3 are e2's reads into `.rotaris` hunting the answer V1
>   cut, 3 are terminal listings that show them (`#31`'s `ls -a`, `#215`, `#229`), and 2 are the verifier's `find` excluding
>   both. Calls naming `.serena` itself: 5.
> - **Default: no delivered file names either directory in either pack, and the priming clause is mixed.** At `552d346`
>   `.serena` showed only in two terminal listings (requirements `#36`, `#53`), no answer, child report or artifact named it,
>   and the worktree's `git status` (`#22`, `#35`) listed no `.serena/`. At `0bc3eee` two of the coordinator's briefs named
>   both directories as tooling not to write about (requirements `#65`, `#90`) and the verifier's report repeated it (`#108`),
>   so the default run carried some priming, though nothing delivered named them.
>
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
