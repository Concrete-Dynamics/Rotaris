## Every configuration load adds `.serena/` to the user's `.gitignore`, and the run's agents cannot account for the change

`keepScopeDirIgnored` makes REQ-CONFIG-013's best-effort amendment. It appends two lines to the workspace's `.gitignore`
when they are missing: `.rotaris/`, which the requirement names, and `.serena/`, the code-intelligence runtime's marker
directory, which no requirement names. The build added the second line on 2026-09-06 (ADR-0035, "At the merge"). The
runtime creates `.serena/project.yml` in the workspace root whenever it starts with a project, so every first run had
left an untracked directory in the user's repository. ADR-0035 and `codebase.md` call the line "a reading flagged for
the owner". No open question or ruling carries it.

The product makes the change at the first load, before any agent runs, and nothing the agents are given says so.
`git status` shows ` M .gitignore` to every agent that checks its own work, and each one reports it as a change it did
not make. In the default live run of 2026-10-01, the answers of `edit`, `resume` and `frictions` each told the user
that the working tree carried an unexplained `.gitignore` change. In the duress run the orchestrator commissioned a
ninth child, unrequested, to find out who had changed the file.

Live-run finding: a71-1

Raised as [OQ-161](../../architecture/open-questions.md): whether the load may append the marker's directory at all, and
if it may, whether anyone is told. Recorded, not repaired.

## Specs

- `REQ-CONFIG-013`: "if `<workspace>/.gitignore` contains no line that, once trimmed and stripped of a trailing `/`,
  equals `.rotaris`, the line `.rotaris/` is appended". The requirement names one line, and the build appends two.
- `REQ-MCP-089`: "the workspace `.gitignore` SHALL be best-effort amended to exclude `.rotaris/`". The same.
- `REQ-CONFIG-456` and ground 3 of `REQ-CONFIG-477` ("Version control stays the user's choice") make the one line a
  default and not a prohibition. Neither reaches a second directory.

## Evidence

- Duress pack `.live-run/runs/2026-10-01T03-15-27-194Z/` (the `accept` worktree; git-ignored), session `57095770`:
  - #144 (reconcile-docs, `git diff .gitignore`): HEAD's file holds `node_modules/`, `dist/` and `.rotaris/`, and the
    working tree adds `+.serena/`. #284 (verify-result) shows the file's mtime as 03:15:29.554. That is the sign-in launch,
    whose first repository read at 03:15:29.626 already counted one uncommitted file (`sign-in/app.log`). The run
    started at 03:15:44.
  - Transcript row 701 (orchestrator): "`.serena/` was ADDED by a child". Row 704 is tool call #341, `delegate` of
    `gitignore-delta` (codebase-analyst): "Has `.gitignore` in the working tree been modified relative to HEAD". The
    child ran from 04:34:02.868 to 04:39:22.260 (319.4 s) and made 50 tool calls. The autopsy counts 25 requests and a
    25.0 s summariser (372,313 in / 21,257 out), which is 6.3 % of the run's wall time. The verifier recorded the change
    as its finding 3.5, and the orchestrator wrote it into a memory (#393: "`.gitignore` has one **uncommitted** added
    line, `.serena/`").
- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/`:
  - `edit` (`23e44242`), rows 47 and 78: "both independently noticed `git status` lists `.gitignore` as modified. That
    is not from this task".
  - `resume` (`390a39f0`), rows 36 and 40.
  - `frictions` (`fe3884f7`), rows 12 and 29: "the working tree already had unrelated changes before this run
    ( M .gitignore …".

## Relevant files

- `packages/config/src/load.ts:157-178` — `keepScopeDirIgnored` and its comment. `:172` adds
  `CODE_INTELLIGENCE_MARKER_SEGMENTS[0]` beside `WORKSPACE_SCOPE_DIR`, and `:236` runs the function on every load unless
  `keepIgnored` is false.
- `packages/config/src/mcp/code-intelligence.ts:104` — the marker's path segments, read from the generated manifest
  (`code-intelligence-manifest.generated.ts:23`, `.serena/project.yml`).
- `docs/architecture/adr/0035-the-bundled-code-intelligence-runtime.md:294-299` — "At the merge": the reading taken and
  flagged.
- `docs/architecture/codebase.md:456-460` — the same flag in the codebase map.
- `apps/desktop/scripts/fixtures/todo-app/.gitignore` — the live run's fixture. It already carries `.rotaris/`, so
  `.serena/` is the only line the load appends to it.

## Repaired in part — 2026-10-01; open for OQ-161's ruling

**Found true on the branch** (`fin2-config-readings`, from `origin/main` at `f41dc2a`): a repository whose committed
`.gitignore` already named `.rotaris/` read ` M .gitignore` in `git status --porcelain` after one configuration load
(`packages/config/src/load.test.ts`, "a repository whose committed .gitignore already names `.rotaris/` stays clean
once the runtime's marker exists", red on the code before, with the other four new cases and the amended REQ-CONFIG-013 case).

**The part repaired, under a reading recorded in [OQ-161](../../architecture/open-questions.md) and not a ruling.** The
load appends `.rotaris/` alone to the workspace's `.gitignore`, the one line REQ-CONFIG-013 and REQ-MCP-089 name. The
marker's directory goes to the repository-local exclude file (`info/exclude` in the common directory of the repository
whose top level is the workspace, a linked worktree's included), which Git honours and nobody tracks: `git status`
stays clean, and no file the user tracks changes, ~~so there is nothing left for an agent to account for~~ *(falsified
2026-10-06 by the duress run at `27a5127`: the file tools still list the marker's directory as workspace content, and the
agents documented it as the user's repository — see "Seen again" below)*. Best-effort and
idempotent; nothing is written for a workspace below a repository's top level or in none (OQ-161 states why), nor
through a `.git` file whose `gitdir:` names no git directory Git would recognise (a stale pointer, or one to any other
directory), and nothing is created in the repository but `info/` and its file. Pinned by nine cases in `load.test.ts`
(`OQ-161's reading: …`) and the amended REQ-CONFIG-013 case; the four added at verification (a stale pointer, a pointer
to a directory that is not a repository, a `commondir` naming one, a repository without `info/`) — the first three red
on the lookup before.

**Shown in a live run.** `pnpm build`, then `live-run.mjs --confirm --skip-build --only=edit,frictions` against the
registered `katalyst` endpoint (pack `.live-run/runs/2026-10-01T11-11-22-487Z/` of the `fin2-config-readings` worktree;
git-ignored): both scenarios passed. In `edit`, a child's own `git status --porcelain` (transcript step 44) listed only
`src/todos.js`, and the script's `git diff` counted the two files the task changed; neither transcript mentions
`.gitignore`. After the verifier's repair (only a git directory Git would recognise), `--only=edit` passed again on the
rebuilt head (pack `2026-10-01T12-07-54-539Z`), and nothing in its pack mentions `.gitignore`. The `duress` run, where
the unrequested child appeared, was not run in this round (the acceptance plan's).

**Left to the owner.** OQ-161's ruling: whether the load may write the marker's directory anywhere at all, and if so
whether the exclude file is the place, or whether the runtime should be started so that it creates no marker in the
workspace root. A `.gitignore` an earlier build amended keeps its `.serena/` line: the product never removes a line from
a file the user owns. The note stays open until the ruling.

## Seen again 2026-10-06, on `main` `27a5127`: the repaired part's reason is falsified; still open

The orchestrator's final duress live run at `27a5127` against the self-hosted endpoint (pack
`.live-run/runs/2026-10-06T01-47-53-900Z/` of the live worktree, git-ignored; `--only=duress`, `live-run PASSED` with 19
PASS, 0 FAIL, 5 NOTE), finding H3 of its autopsy. The part repaired held: `git status` stayed clean (tool calls #212 and
#301), and #177's `git check-ignore -v` names `.git/info/exclude:7:.serena/` as the only rule that applies. **The reason
the repair gave, "there is nothing left for an agent to account for", did not.** It is kept above, struck through, beside
this evidence (CLAUDE.md: a falsified reason is kept beside its replacement).

- **The file tools list it.** REQ-TOOLS-139's search filter honours "the workspace's `.gitignore`" and nothing else, so
  `.git/info/exclude` hides nothing from it, and `.serena` is not one of REQ-TOOLS-140's hard-coded ignore components
  (`.rotaris` is). `glob **/*` (#4, #28, #32, #133) lists four `.serena/` files — `.serena/.gitignore`,
  `.serena/memories/memory_maintenance.md`, `.serena/project.local.yml`, `.serena/project.yml` — beside the fixture's
  own, while `glob {node_modules,dist,.rotaris}/**` (#77) answers "No files found" although `.rotaris/` holds two files
  (#302's `find`). The tools behave as specified; the marker sits in the workspace root, where they look.
- **Three children documented it as repository content.** `wave1c repo overview` (#83) tabulated the four `.serena/`
  files as repository files and wrote that `.rotaris/` was absent; `wave2d reconcile docs` (#206, #220) grew the table to
  "28 rows … 29 files", six of them under `.serena/`, and its own `write_memory` (#237) added a fifth file there; the
  verifier `wave3 verify result` raised three of its five defects (D3, D4, D5) about `.serena/` rows or counts.
- **The user was told.** The final answer (transcript row 671) passed two `.serena/` items to the user as two of the five
  "remaining defects": "its `.serena/` ignore claim is wrong" and "one `.serena/memories/…` file has no table row".
- **Volume.** 38 tool calls by 5 agents name `.serena`, and 80 reasoning or answer rows mention it.

Recorded as evidence only; nothing is changed. Whether the runtime may leave a marker in the workspace root at all, and
where, stays the owner's ruling of OQ-161, "May a configuration load append the code-intelligence runtime's marker directory
to the user's `.gitignore` beside `.rotaris/`?" in [`open-questions.md`](../../architecture/open-questions.md). The build proceeds under the current behaviour.

## Ruled as built — 2026-10-06 ([R-071](../../product/requests.md#r-071)); closed

The owner accepted the current behaviour (OQ-161, ruled in [`open-questions.md`](../../architecture/open-questions.md)): `.rotaris/` goes in the workspace's `.gitignore`, and `.serena/` in the repository's untracked `info/exclude` file, as repaired above. The marker stays in the workspace root as the runtime creates it, so what "Seen again" records, the file tools listing `.serena/` as workspace content, is accepted with it. Nothing is changed in the code.

## Revised 2026-10-07 under the owner's delegation ([R-072](../../product/requests.md#r-072)); stays closed

The listing half of the ruling above is revised by OQ-215 (in [`open-questions.md`](../../architecture/open-questions.md)),
on the evidence of the two duress runs after `27a5127`: findings L3 at `c2fdd6a` (41 calls by 5 agents, 112 rows, 1,142.5 s of
the failed child d2's generation) and N6 at `c2a9444` (28 calls, 96 rows, a memory written into the tree, runtime files in the
delivered overview). The runtime's marker directory is now a hard-coded ignore component
([`PD-TOOLS-012`](../../product/directives/pd-tools-012.md#pd-tools-012)), its name read from the binding manifest, so glob, grep and
`read_file`'s listings skip it as they skip `.rotaris`, and a file in it named by its path is still served. The version-control
half stands as repaired: `.rotaris/` alone in `.gitignore`, the marker's directory in the repository's `info/exclude`. Pinned by
the case "the code-intelligence marker directory is a hard-coded ignore component, named by the manifest" in
`packages/agent-tools/src/tools/tools.test.ts`. A terminal's `find` or `ls -a` still lists the directory; whether that
remainder costs anything is the next duress run's to measure.
