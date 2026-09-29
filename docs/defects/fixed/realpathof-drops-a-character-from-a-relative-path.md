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

> **2026-09-27:** "No production caller is known to pass a relative path" is false. The permission policy's path
> scope hands the resolver the raw argument, so a workspace-relative path reaches `realPathOf` relative to the run
> host's process directory: recorded as
> [`path-scope-resolves-a-relative-path-against-the-process-directory.md`](path-scope-resolves-a-relative-path-against-the-process-directory.md).

## Specs

None contradicted by a reachable path. `REQ-TOOLS-129` makes this the one workspace-boundary check, so the
function it rests on answering wrongly for a class of input is recorded rather than relied on.

## Relevant files

- `packages/agent-tools/src/tools/fence.ts`: `realPathOf`, the tail reconstruction.
- `packages/agent-tools/src/gate.test.ts`: `ROOT = 'D:/ws'`, relative on a POSIX host.

## Repaired — 2026-09-28, under R-062

`realPathOf` (`packages/agent-tools/src/tools/fence.ts`) rebuilds the missing tail segment by segment with `basename`
instead of `existing.slice(parent.length)` less one separator; the slice was one character short whenever the parent
was `.`. `realPathOf('specs/index.md')` from a directory holding no `specs` now answers `<cwd>/specs/index.md` (it
answered `<cwd>/pecs/index.md`), and `realPathOf('D:/ws')` on POSIX `<cwd>/D:/ws` (it answered `<cwd>/:/ws`). The
falsified premise above — "no production caller is known to pass a relative path" — is kept beside its replacement in
the function's comment.

Pinned by: `tools/tools.test.ts` — "realPathOf rebuilds the missing tail of a relative path whole — REQ-TOOLS-129 rests
on it answering rightly for every input", including `checkFence` over a root spelled relative, which is the shape this
note was found by. Run against the previous slice it fails; with `basename` it passes.
