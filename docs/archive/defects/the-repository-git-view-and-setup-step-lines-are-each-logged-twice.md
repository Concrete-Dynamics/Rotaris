## The repository read, the git view and each setup step's success are each logged twice

Three facts reach the application log twice, from two emitters each, within a millisecond:

- **The repository read.** The workspace service logs "workspace service: repository …" when it answers
  `repository.read`, and main's command handler logs "repository …" with the same fields when it receives the answer.
- **The git view.** The same pattern for `git.view`: "workspace service: git view: 9 reads in 73 ms (…)" from the
  service, then "git view: 9 reads in 73 ms (…)" from main.
- **A setup step's success.** The run host's step reporter logs "mcp setup: index succeeded (2271 ms)", and
  `runSetupSteps`, logging through the MCP log, writes "mcp setup: index succeeded in 2271 ms". The same pair follows
  for `create` and `memory`.

The repository and git-view pairs appear in every default launch of the live run. The setup pair appears in every launch
whose background setup ran a step to success. A fourth pair, which the autopsy did not list, has the same shape: main
logs "credentials leased: …" when it lends, and the run host logs "run host: credentials: leased for … (workspace …)"
when it receives (`duress/app.log` lines 36/37).

Live-run finding: a71-9

Its sibling, the fixed
[`a-personas-mcp-lines-are-logged-twice-on-first-spawn.md`](a-personas-mcp-lines-are-logged-twice-on-first-spawn.md),
was a different pair.

## Specs

- None found; log noise. PD-MONITOR-002 governs the application log's levels and does not address duplicates.

## Evidence

- Duress pack `.live-run/runs/2026-10-01T03-15-27-194Z/` (the `accept` worktree; git-ignored), `duress/app.log`:
  - lines 10/11, the repository read (03:15:39.526/.527);
  - lines 12/13 and 26/27, the git view;
  - lines 28/29 (`index`) and 32/33 (`memory`), the setup steps;
  - lines 36/37, the credentials lease.
- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/`: every scenario's `app.log` carries the repository pair once
  and the git-view pair once or twice. `ask/app.log`, the launch whose setup ran, carries the setup-step pairs.

## Relevant files

- `apps/desktop/src/workspace-service/index.ts:181` — the service's repository line.
- `apps/desktop/src/main/commands/config.ts:62` — main's repository line, written from the service's answer.
- `apps/desktop/src/workspace-service/index.ts:187` — the service's git-view line.
- `apps/desktop/src/main/commands/git.ts:25` — main's git-view line.
- `packages/mcp/src/setup.ts:154` — `runSetupSteps`' "succeeded in N ms".
- `apps/desktop/src/run-host/mcp.ts:446` — the run host's step reporter's "succeeded (N ms)".
- `apps/desktop/src/main/index.ts:272-273` and `apps/desktop/src/run-host/launch.ts:81-82` — the credentials pair.

## Repaired — 2026-10-01

One emitter per fact; the process that did the work keeps the line, the process it answers stops restating it:

- **The repository read** and **the Git view** are the workspace service's lines (`workspace-service/index.ts`, which
  performed the reads and whose lines carry more: the root, the upstream, the uncommitted count). Main's `repository.read`
  (`main/commands/config.ts`) and `git.read` (`main/commands/git.ts`) relay the answer and write nothing of it; `git.read`
  keeps its own "notice: Working without Git", which is main's fact.
- **A setup step's outcome** is the run host's step reporter's (`run-host/mcp.ts`, `onStep`), which says every status and
  not only success. `runSetupSteps` (`packages/mcp/src/setup.ts`) keeps only the command line a step spawns.
- **The credentials lease** is the run host's `LeaseReportLog` (`run-host/launch.ts`), REQ-PROVIDER-068's report: whole
  once per workspace root, then only what changed. Main's ask handler (`main/index.ts`) no longer writes "credentials
  leased: …"; `live-run.mjs`'s ask check and `slice-proof.mjs`'s lease check read the run host's line instead.

Pinned by:

- `apps/desktop/src/main/commands/git.test.ts` and `apps/desktop/src/main/commands/config.test.ts` — the handlers answer
  with the service's state and write no repository or Git-view line (both red before the repair);
- `packages/mcp/src/setup.test.ts` — "a step's outcome is the caller's to log (its onStep), never the runner's as well"
  (red before the repair);
- `apps/desktop/scripts/lib/restated-facts.mjs` (with its test) — the reader that names a restatement of any of the four
  facts in a launch's log; `git-proof` asserts none in its painted and no-git launches, and every live-run launch checks
  "none of the four known restatements reaches the application log" (labelled "each fact reaches the application log
  from one emitter" until the verifier's first round: it knows these four restatements only, and a duplicate of another
  fact passes it). The lease has no unit test of its own: main's ask handler is inline in `main/index.ts`, so the
  live-run check is its pin.

Shown on the built branch: `git-proof` passed, its painted launch carrying the workspace service's repository line once,
its two Git-view refreshes once each, and no line of main's; a live-run sign-in launch (`--only=`, which runs sign-in
alone; pack `.live-run/runs/2026-10-01T13-09-07-111Z/` of the `fin2-logandreader` worktree, git-ignored) passed "sign-in:
each fact reaches the application log from one emitter" (the check's label then), its `app.log` carrying the repository line and the Git-view line
once each. That launch neither leases a credential nor runs a setup step to success (the worktree has no bundled
code-intelligence runtime, so `create` exits 127), so the lease and setup-step repairs are shown by the unit tests above
and by the live-run check in every scenario that does, not by this pack.
