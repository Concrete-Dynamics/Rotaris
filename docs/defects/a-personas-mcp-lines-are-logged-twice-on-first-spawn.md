## A persona's MCP surface and grant lines are logged twice on its first spawn

The MCP surface is memoised on a key that includes the reserved (native) tool names. The spawn evidence asks for the
surface with no reserved set and the tool port asks with the callable set, so the first spawn of each persona resolves
the surface twice, and each resolution logs the surface line and the grant diagnostics again. The grant diagnostics
carry an empty key and are not de-duplicated.

Live-run finding: D7 (live runs of 2026-09-29)

## Specs

- None; log noise.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), `duress/app.log`: pairs at 03:07:35.650/.678, .685/.700, .708/.722, and 03:45:01.580/.599.

## Relevant files

- `apps/desktop/src/run-host/mcp.ts:210-211` — the memo key includes `reserved`; `:229` — the surface line; `:235` —
  `evidenceFor`'s call with no reserved set.
- `apps/desktop/src/run-host/tools.ts:363` — the port's call with `new Set(callable.keys())`.
- `packages/config/src/mcp/persona.ts:176-178` — the grant diagnostics.
