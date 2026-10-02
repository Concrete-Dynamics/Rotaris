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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The two resolutions stay two, because they can differ: the port reserves the persona's
native tool names, and a server tool that collides with one is offered under its `<server>_` prefix. The evidence
reserves none. What changed is what the second resolution writes.

- `McpHost` (`apps/desktop/src/run-host/mcp.ts`) now keeps `announced`: what each persona's resolutions have already
  written, keyed like the memo but without the reserved names.
- A resolution writes the surface line only when that exact line has not been written for the key. The same holds for
  an unkeyed diagnostic such as REQ-MCP-059's grant count.
- A surface the reserved names changed renders a different line, and that line is written.
- `announced` is cleared with the memo on a new configuration and on a session override.

The header comment's claim that the evidence and the port "read literally one resolution" is kept as written. It is
marked falsified, with this reading beside it.

Pinned by `apps/desktop/src/run-host/mcp.test.ts`:

- The evidence and the port resolving the same surface write the surface line and the grant count once. A later spawn
  writes nothing.
- A collision the reserved names prefix writes its own surface line, and the grant count once.
- A new configuration load writes both again.

The first two fail on the code before the repair.

Live, `pnpm live-run --confirm --only=edit` on this branch passed twice, against `katalyst`. Both packs are git-ignored.

- Pack `.live-run/runs/2026-09-29T23-26-20-433Z` ran with the code-intelligence runtime bundled
  (`pnpm code-intel:bundle`). Its `app.log` holds each persona's lines once: one
  `12 of 22 tools granted on server 'code_intelligence'` and one `surface for orchestrator`, then one
  `19 of 22 tools granted …` and one `surface for coding-agent` for the two `coding-agent` children. The pack of
  2026-09-29T02-41-56 had a pair at each child's spawn.
- Pack `.live-run/runs/2026-09-29T23-21-17-800Z` ran without the runtime, so discovery failed. It wrote one
  `surface for coding-agent` line.

Noticed on the way, not changed here: REQ-MCP-059 calls the grant count a debug line, and it is written at `info`.
Recorded as [`the-mcp-grant-count-is-logged-at-info-not-debug.md`](the-mcp-grant-count-is-logged-at-info-not-debug.md).
