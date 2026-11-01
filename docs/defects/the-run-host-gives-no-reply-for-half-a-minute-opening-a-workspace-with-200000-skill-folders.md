## The run host gives no reply for half a minute opening a workspace with 200,000 skill folders

Driving the built app on a workspace whose `.agents/skills` holds 200,000 empty folders, the run host answered nothing for about
36 s after the open (2026-11-01, Windows 11 ARM64): `workspace.usage` and `mcp.setup` expired in main, code-intelligence setup was
reported failed, and the presenter liveness lapsed. The warm-up's own task queue was one cause (`shift` on a queue that long, now a
cursor, which took the walk from 79.6 s to 41.4 s), but the silence remained after that repair, so something else also holds the
loop. What that is was not identified: nothing here shows whether it is the walk's many promises, its sort and fold, or another
reader of the same tree. The tree is far beyond a real one. The case is written down because it is the only slow walk measured on
the built app.

## Specs

OQ-386 point 1: the warm-up "never holds" the run host's event loop. If the walk is the holder, this contradicts it at this size.

## Relevant files

- `packages/config/src/skills/discover.ts`: `discoverSkillsAsync` and its `bounded` queue.
- `apps/desktop/src/run-host/skills.ts`: `SkillHost.warm`.
