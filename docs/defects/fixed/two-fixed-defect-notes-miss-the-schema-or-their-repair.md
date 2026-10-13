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

## Repaired — 2026-10-13 (fin41)

- The initialize-project note's three paragraphs now stand under the schema's headings, no sentence changed: the first
  as the description, the second under `## Specs` (REQ-WORKSPACE-083, REQ-MCP-112), and a `## Relevant files` list
  naming the settings action in `apps/desktop/src/renderer/main.tsx`, `main/initialization.ts`, its test and ADR-0064's
  seventh round; a dated line says what was restructured.
- The relay note gains "Repaired — 2026-09-21, `3360bce`": what that commit changed in `relay.ts`, `main-windows.ts`,
  `index.ts`, `process-link.ts` and `terminal.ts`, and its four tests. (The survey's other candidate, `ca36032`, rewords
  two unrelated notes.)

`tools/defect-notes-schema.test.ts` reads every open and fixed note for a `## ` title, `## Specs` and `## Relevant
files`: on the notes before the repair it failed naming the initialize-project note alone; after it, it passes. The
relay note's repair record follows a convention, not the schema, so no test pins it.
