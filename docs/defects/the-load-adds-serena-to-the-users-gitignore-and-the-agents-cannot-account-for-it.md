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

Raised as [OQ-161](../architecture/open-questions.md): whether the load may append the marker's directory at all, and
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

**The part repaired, under a reading recorded in [OQ-161](../architecture/open-questions.md) and not a ruling.** The
load appends `.rotaris/` alone to the workspace's `.gitignore`, the one line REQ-CONFIG-013 and REQ-MCP-089 name. The
marker's directory goes to the repository-local exclude file (`info/exclude` in the common directory of the repository
whose top level is the workspace, a linked worktree's included), which Git honours and nobody tracks: `git status`
stays clean, and no file the user tracks changes, so there is nothing left for an agent to account for. Best-effort and
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
`.gitignore`. The `duress` run, where the unrequested child appeared, was not run in this round (the acceptance plan's).

**Left to the owner.** OQ-161's ruling: whether the load may write the marker's directory anywhere at all, and if so
whether the exclude file is the place, or whether the runtime should be started so that it creates no marker in the
workspace root. A `.gitignore` an earlier build amended keeps its `.serena/` line: the product never removes a line from
a file the user owns. The note stays open until the ruling.
