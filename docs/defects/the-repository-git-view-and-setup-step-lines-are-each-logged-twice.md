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
[`a-personas-mcp-lines-are-logged-twice-on-first-spawn.md`](fixed/a-personas-mcp-lines-are-logged-twice-on-first-spawn.md),
was a different pair. Recorded, not repaired.

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
