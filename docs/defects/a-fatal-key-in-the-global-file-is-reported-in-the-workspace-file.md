## A fatal key in the global configuration file is reported in the workspace file

Noticed 2026-10-14 by fin44 (`fin44-hooks-and-config`) while writing the test for
[`the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md`](fixed/the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md);
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
