## Two fixed defect notes miss the schema or their repair

- `docs/defects/fixed/the-initialize-project-button-refuses-an-already-running-setup.md` is the one fixed note with no
  `## Specs` and no `## Relevant files` heading, which the schema in `docs/defects/README.md` requires; it was created
  that way in `90c492f`.
- `docs/defects/fixed/a-relay-send-to-a-disposed-frame-threw-and-darkened-the-window.md` was moved to `fixed/` by
  `0c543f5` (a rename with no insertions) and still describes only the unrepaired state; the repair, `3360bce`
  ("fix(relay): shed dead sinks instead of throwing on a disposed frame (REQ-MONITOR-226)"), is named nowhere on it.

Found by the 2026-10-13 survey at `6de2a67` (item N99).

## Specs

- `docs/defects/README.md`'s schema (the first); the repaired-note convention `references/repository.md` states (the
  second).

## Relevant files

- The two notes above.
- `apps/desktop/src/renderer/main.tsx` — the MCP settings action's `mcp.setup.running` branch.
- `packages/shell/src/relay.ts`, `process-link.ts`, `apps/desktop/src/main/{index,main-windows,terminal}.ts`,
  `packages/shell/src/shell.test.ts` — `3360bce`.
