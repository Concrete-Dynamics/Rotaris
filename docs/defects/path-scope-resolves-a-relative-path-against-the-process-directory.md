## Path scope resolves a relative path against the process directory, not the workspace root

`pathScopeMatches` (`packages/agent-tools/src/policy.ts`) hands each raw path argument straight to the
evaluation environment's resolver. In the run host that resolver is `realPathOf` (`run-host/tools.ts`), which
resolves a relative path against the **process's** working directory — and the run host is forked with no `cwd`
(`main/index.ts`), so that is main's directory, not the workspace. The same walk then loses the first character of
the path's first segment ([`realpathof-drops-a-character-from-a-relative-path.md`](realpathof-drops-a-character-from-a-relative-path.md)):
run from `/tmp`, `realPathOf('specs/index.md')` answered `/tmp/pecs/index.md` (Node 24, 2026-09-27). Read from the code, not driven: unless main happened to
start inside the workspace, a read-only tool given a workspace-relative path under the `restricted` preset lands
"outside" the root and `restricted:read-outside-workspace` asks, and `inside_workspace` cannot fire for it.

The unit tests do not see it: `policy.test.ts` and `gate.test.ts` inject a resolver that joins a relative path to
their root itself, which is the behaviour the production resolver lacks.

Noticed 2026-09-27 while building `PD-TOOLS-004` ([R-057](../product/requests.md#r-057)), whose path match resolves
each path against the workspace root first (`resolveInWorkspace`) and so does not inherit this. Not repaired there:
out of scope.

## Specs

Contradicts `REQ-TOOLS-018`: "Relative paths resolve against the workspace root."

## Relevant files

- `packages/agent-tools/src/policy.ts`: `pathScopeMatches` calls `env.resolvePath(p)` on the raw argument; `resolvedPathSet` beside it shows the root-first resolution.
- `apps/desktop/src/run-host/tools.ts`: the gate's `resolvePath` is `realPathOf`, relative to the process directory.
- `packages/agent-tools/src/tools/fence.ts`: `realPathOf`, and `resolveInWorkspace`, the one-line root join the path scope skips.
- `packages/agent-tools/src/policy.test.ts`, `gate.test.ts`: the injected resolvers that join the root themselves.
