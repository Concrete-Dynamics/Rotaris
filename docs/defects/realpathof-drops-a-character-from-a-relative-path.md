## `realPathOf` drops a character from a relative path

`realPathOf` (`packages/agent-tools/src/tools/fence.ts`) walks up to the nearest existing ancestor and rebuilds
the missing tail with `existing.slice(parent.length)`, then strips one leading separator. When the input is
relative and the walk reaches `.`, the parent is `.` and its length is 1. So for `D:/ws` on a POSIX host
(where it is relative), `'D:'.slice(1)` keeps `:` and the root reads `<cwd>/:/ws`. `checkFence` then reports a
path under `<cwd>/D:/ws` as outside the workspace root `<cwd>/:/ws`.

No production caller is known to pass a relative path, because the fence is always handed a resolved root. It
was found because `gate.test.ts`'s fixed root `D:/ws` is relative on Linux: a gate test that needs the fence to
answer inside the root cannot use that harness root there. Noticed 2026-09-23 while writing PD-TOOLS-006's gate
tests, which use a real temporary directory instead.

## Specs

None contradicted by a reachable path. `REQ-TOOLS-129` makes this the one workspace-boundary check, so the
function it rests on answering wrongly for a class of input is recorded rather than relied on.

## Relevant files

- `packages/agent-tools/src/tools/fence.ts`: `realPathOf`, the tail reconstruction.
- `packages/agent-tools/src/gate.test.ts`: `ROOT = 'D:/ws'`, relative on a POSIX host.
