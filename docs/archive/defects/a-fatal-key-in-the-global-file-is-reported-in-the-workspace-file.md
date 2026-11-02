## A fatal key in the global configuration file is reported in the workspace file

**Outcome: repaired 2026-10-14 by fin45 (`fin45-config-and-terminal`).** Confirmed first on the branch: with the global
`agents.yaml` stating `requirements: { scheduling: { mode: automatic }, no_such_key: 1 }` and no workspace file, the report
named `<workspace>/.rotaris/agents.yaml … (workspace scope)`; five of the new cases in `packages/config/src/load.test.ts`
failed on it, each on `file` and `scope` alone. `resolveMerged` (`packages/config/src/load.ts`) now attributes each fault its
typed section readers raise with `statingFile`: the scope file stating the longest prefix of the fault's path, the later in
REQ-CONFIG-031's merge order (global `agents.yaml`, global `models.yml`, workspace `agents.yaml`, workspace `models.yml`) on a
tie, since that is the layer whose value the merge kept there. The path walk (`statedPrefixLength`) takes the longest key at
each level, so a model name holding a dot (`models.gpt-4.1.…`) is matched whole; a top-level null states nothing
(REQ-CONFIG-052/054); each `agents.yaml` is read with its legacy role names canonicalised as it was merged (REQ-CONFIG-062)
and each `models.yml` for `models:` alone (REQ-CONFIG-004). A path no scope file states (a value only a built-in default, the
discovery snapshot or a run's live overlay supplied) still names the workspace `agents.yaml`, the file a user edits by
default (REQ-CONFIG-463); no fault of that shape was found reachable. Faults found before the merge keep their own file.

Pinned by `packages/config/src/load.test.ts` ("REQ-CONFIG-478: a merged-document fault names the file and scope that stated
it": the global fault with no workspace file, a workspace sibling key in the same section, a key both scopes state, a
top-level null over a global value, a field in the global `models.yml` under a dotted model name, a role under its legacy
name, and the path walk itself); `apps/desktop/src/workspace-service/delivery.test.ts`'s OQ-279 queue case now requires the
global file and `(global scope)` where it accepted either; and `notice-proof` section 1d (`global-merged-fault`), which writes
the unknown key into the driven profile's global `agents.yaml` and reads the open-time notice naming that file and the global
scope — red on the unrepaired build (the notice read `…/workspace/.rotaris/agents.yaml at requirements.no_such_key (workspace
scope)`), green after. `03-runtime-view.md` §8 states the attribution.

Noticed 2026-10-14 by fin44 (`fin44-hooks-and-config`) while writing the test for
[`the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md`](the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md);
not repaired, outside that task.

A schema fault found in the MERGED document — an unknown key under `requirements:` (REQ-CONFIG-183), and every other fault the
typed section readers raise after the two scopes are merged — is attributed to the workspace file and the workspace scope
whatever file declared it. Reproduced with `loadConfiguration` over a global `agents.yaml` holding
`requirements:\n  scheduling:\n    mode: automatic\n  no_such_key: 1` and a workspace with no `.rotaris/agents.yaml` at all:
the report reads `<workspace>/.rotaris/agents.yaml at requirements.no_such_key (workspace scope): unknown key 'no_such_key' …`,
naming a file that does not exist and the wrong scope. Faults found before the merge (a YAML syntax error, the hooks section)
carry their own file and scope and are not affected.

The difference matters by REQ-CONFIG-478's own words: a global fault keeps every workspace from loading, a workspace fault only
that one, and "naming the scope is not optional". A user told to correct a workspace file that does not exist cannot follow the
step the report names.

## Specs

REQ-CONFIG-478 ("MUST identify the offending file by its full path and by which scope it belongs to"; the remedy is correcting
the named file), REQ-CONFIG-233 (which faults are fatal), REQ-CONFIG-183 (the unknown key under `requirements:`).

## Relevant files

- `packages/config/src/load.ts` — `resolveMerged`: `sink.errors.map((p) => ({ ...p, file: files.workspace.agents, scope: 'workspace' }))`, the attribution of every merged-document fault.
- `packages/config/src/merge.ts` — the layers carry their `source` file, which the attribution does not consult.
- `apps/desktop/src/workspace-service/delivery.test.ts` — the OQ-279 queue test, which writes the key into the global file and accepts either scope in the report because of this.
