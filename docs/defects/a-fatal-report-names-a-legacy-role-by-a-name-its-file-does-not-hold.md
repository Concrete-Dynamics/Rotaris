## A fatal report names a role stated under its legacy name by a name the file does not hold

Noticed 2026-10-14 by the reviewer of fin45 (`fin45-config-and-terminal`) while checking the repair of
[`a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`](fixed/a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md);
not repaired, outside that bundle's tasks.

Legacy role names are canonicalised per scope before the merge (REQ-CONFIG-062), and the typed readers raise their faults on
the merged document, so the path in a fatal report carries the CANONICAL name. A global `agents.yaml` stating
`personas:\n  oracle:\n    purpose: "two\nlines"` is reported at `personas.codebase-analyst.purpose` in that file (pinned as
such by `load.test.ts`'s case "a role stated under its legacy name in the global file is found under its canonical name"):
the file is now the right one, but the key path names a role the file does not contain, so a user searching the named file
for it finds nothing.

## Specs

REQ-CONFIG-478 ("MUST identify the rejected key or value by its full path within that file"), REQ-CONFIG-062 (the
canonicalisation that renames the key before the reader sees it).

## Relevant files

- `packages/config/src/load.ts` — `resolveMerged` and `statingFile`: the latter already finds the file through the
  canonicalised document, and could map the path's role key back to the spelling that file states.
- `packages/config/src/merge.ts` — `canonicaliseRoles`.
- `packages/config/src/load.test.ts` — the case above, which asserts the canonical path.
