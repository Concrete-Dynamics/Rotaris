## The file tools' fence froze at the first run in a process, so `additional_read_only_roots` stopped taking effect

`apps/desktop/src/run-host/tools.ts` builds a `FenceConfig` per tool port from the run's own resolved
configuration, but the four file tools took theirs from `FileToolState`, which `executorsFor` caches **per
workspace root** and constructs once:

```ts
const fence = { workspaceRoot: root, allowOutsideWorkspace: runtime.allowOutsideWorkspace, additionalReadOnlyRoots: [...runtime.additionalReadOnlyRoots] };
let state = deps.fileStates.get(root);
if (!state) { state = new FileToolState(fence); deps.fileStates.set(root, state); }   // ← keeps the FIRST fence
```

So the second and every later tool port in one run-host process resolved `read_file`, `write_file`,
`haet_read` and `haet_edit` against the first run's fence, while `grep` and `glob` — which take the fence
directly — honoured the current one. **Two tools in one bundle disagreed about where the boundary was.**

Observable effect: a user adds a path to `runtime.additional_read_only_roots` in Settings and saves; the next
run in that workspace reads it only if no run had happened since the run host started. Otherwise the agent's
`grep` can search the new root and its `read_file` refuses the same path.

The comment on the line above said "the file-tool state is per workspace root and keeps the first fence it
saw", so the behaviour was written down — and read as a property of the read record (`REQ-TOOLS-137` shares
that across runs deliberately) rather than as what it also was: a configuration value that stops taking
effect. Nothing in the requirements is wrong; the code loaded the key at each run start and handed it to an
object that had already made up its mind.

**Why nothing caught it.** The key's default is the empty list, so the stale fence and the fresh one are
equal on every machine that has never set it — which is every machine in every proof this repository has run.
The first value that differs is the cataloged skill directories of `REQ-WORKSPACE-059`, which change on a
rescan and which `REQ-WORKSPACE-069` requires to govern agents constructed afterwards.

## Specs

- **`REQ-CONFIG-468`** — `additional_read_only_roots` "designates locations outside the workspace that the
  file-reading tools may read". It does not say "until the first run in this process".
- **`REQ-TOOLS-132`** — the read-only roots and the refusal of every write to them. The write half was never
  affected; only which roots were read.
- **`REQ-TOOLS-137`** — the read record shared by every run in a workspace, which is what `FileToolState` is
  for and which the repair leaves exactly as it was.
- **ADR-0037** puts the key in Tier B, read at each run start. The load obeyed that; the handover did not.

## Repaired

Repaired in the same change that found it (ADR-0063's first execution, 2026-09-14). The fence now travels
with the tool — `readFileTool(state, fence)`, `writeFileTool(state, fence)`, `haetReadTool(state, fence)`,
`haetEditTool(state, fence, name)` — and `FileToolState` holds only the read record and the undo stacks. The
falsified comment is kept beside its replacement in `run-host/tools.ts`.

Regression test: `apps/desktop/src/run-host/skills.test.ts`, "a second port's file tools honour the SECOND
port's read roots, not the first's" — one shared state, two fences, and the same path refused under the first
and read under the second, with `grep` agreeing and a write still refused.

## Relevant files

- `packages/agent-tools/src/tools/files.ts` — the four factories and `readTarget`; `FileToolState` no longer
  holds a fence.
- `apps/desktop/src/run-host/tools.ts` — `executorsFor`, where the per-port fence is built and where the
  falsified reason is kept.
- `apps/desktop/src/run-host/skills.test.ts` — the regression test.
- `packages/agent-tools/src/tools/fence.ts` — `checkFence`, unchanged: the rule was always right about the
  fence it was given.
