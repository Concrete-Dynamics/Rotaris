# ADR-0064 — Project initialization: a task registry in `config`, one marker writer in main, and the work delegated to whoever can do it — Consequences

Part 3 of 6 of [ADR-0064](../0064-the-project-initialization-registry.md), which indexes every part.

## Consequences

1. **A second reader of the `initialization:` section is a defect, not a feature.** The state is read
   from the workspace file directly and never through the layered loader, because `REQ-WORKSPACE-078`
   names that one file: read through the merge, a *global* `agents.yaml` could declare one machine's
   marker for every workspace on it.
2. **Classification moved, and the old answer was wrong.** See the first execution below.
3. **The gitignore grammar has one home.** `packages/config/src/init/gitignore.ts`; `agent-tools`'
   `tools/search.ts` re-exports it and no longer keeps a subset.
4. **`McpSetupStatus` gained `applicable`.** The MCP category may use it; this domain must, because
   `REQ-WORKSPACE-090` forbids a second availability rule.
5. **The consent dialog and the composer gate are unreachable from the shipped task set**, by design
   (`REQ-WORKSPACE-104`). They are exercised by `ROTARIS_INIT_TEST_TASK`, a verification-only seam that
   registers an ordinary task through the ordinary registry and adds no code path.
