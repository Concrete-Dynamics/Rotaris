## The inspector says there is no artifact store and no resolved tools

The agent inspector draws "No artifacts yet — this build has no artifact store." unconditionally, and "No tools
resolved." for the run-level agent. The artifact store exists since Part Y and held seven `child_report` artifacts in
the live run; the orchestrator made 2 to 15 calls per session. Both sentences are false in every screenshot.
`codebase.md` still lists "artifact links from the agent inspector" as owed, and its own parenthesis says the store
exists.

Live-run finding: K1 (live runs of 2026-09-29)

## Specs

- `REQ-MONITOR-052`: the inspector links an agent's artifacts.
- `REQ-MONITOR-060`: the declared tools stand in where no resolved set is known.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): every scenario PNG with the inspector open; the store held 7 `child_report` artifacts and 2–15 orchestrator
  calls per session.

## Relevant files

- `packages/ui/src/Inspector.tsx:60` — `NO_ARTIFACTS`; `:172` — drawn unconditionally; `:159` — "No tools resolved.".
- `packages/ui/src/PersonaWindow.tsx:156` — the same tools sentence.
- `docs/architecture/codebase.md:2036` — Part R's row, "artifact links from the agent inspector" owed.
