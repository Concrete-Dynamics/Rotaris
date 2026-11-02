## codebase.md and the release plan list built work as owed

Two records list as owed what is built or decided:

- `docs/architecture/codebase.md` says implementation conditions are marked by "`TODO(IC-6)` in
  `apps/desktop/electron-builder.yml`"; no such marker exists (IC-6 was discharged 2026-09-04), only `TODO(IC-4)` in
  `platform/src/machine-id.ts`.
- `docs/architecture/first-release-plan.md` §1 lists "The unbuilt directives `PD-TOOLS-003`, `PD-TOOLS-004`, … `PD-ORCH-004`
  and `PD-MONITOR-002`", annotating only `PD-TOOLS-005` as built; all four others were first executed on 2026-09-27
  (R-055, R-057).
- `codebase.md`'s "Where the next work lands" still owes §10's manual compression (REQ-CHAT-078..081, REQ-MONITOR-090..097;
  built in Part AO), Ctrl+Shift+T and the terminal window's role (built 2026-09-10, as the terminal-grid row says),
  REQ-CHAT-073's Clear action (Part AO), REQ-CONFIG-472's Display surface (`DisplaySettings.tsx`, Part AG) and the
  REQ-TRACE-104/109/110 syntax-tree parser (`traceability/parser.ts`, Part AJ2); it owes "a notice queue (ADR-0049)",
  which ADR-0049's revisit answered "not a queue" (REQ-NOTIFY-024); and the MCP and code-intelligence rows still say
  "IC-7 proposed", though IC-7 was adopted 2026-09-06 and discharged 2026-09-27.

Found by the 2026-10-13 survey at `6de2a67` (item N89).

## Specs

- None contradicted; the records trail the code.

## Relevant files

- `docs/architecture/codebase.md` — "Implementation conditions are markers"; the "Where the next work lands" table.
- `docs/architecture/first-release-plan.md` — §1, "Deferred by 'thats it'".
- `packages/engine/src/sessions.ts` (`forceCompression`), `packages/ui/src/slash/controls.tsx` (Clear transcript),
  `packages/ui/src/settings/DisplaySettings.tsx`, `packages/workspace/src/traceability/parser.ts`,
  `packages/ui/src/commands/registry.ts` (Ctrl+Shift+T).

## Repaired — 2026-10-13 (fin41)

Struck in place with the replacement beside each, nothing deleted:

- `codebase.md`'s IC-marker line strikes `TODO(IC-6)` and says IC-6's marker went with its discharge, as IC-5's did.
- `first-release-plan.md` §1 annotates `PD-TOOLS-003` and `PD-MONITOR-002` (built 2026-09-27, R-055) and `PD-TOOLS-004`
  and `PD-ORCH-004` (built 2026-09-27, R-057).
- `codebase.md`'s "Where the next work lands": manual compression (Part AO), Ctrl+Shift+T and the terminal window's role
  (2026-09-10, in both rows that owed them), the Clear action (Part AO), the Display surface (Part AG) and the syntax-tree
  parser (Part AJ2) struck as built; both "a notice queue" entries struck as decided against (ADR-0049's revisit,
  REQ-NOTIFY-024); both "IC-7 proposed" parentheticals corrected (adopted 2026-09-06, discharged 2026-09-27). What is truly
  still owed stays, the machine-setup half of REQ-MCP-112 and 095/096 among it.

Each "built" was confirmed in the code at `6de2a67`: `Sessions.forceCompression` (`engine/src/sessions.ts`),
`slash/controls.tsx`'s "Clear transcript", `settings/DisplaySettings.tsx`, `traceability/parser.ts`, the `terminal.open`
command's `Ctrl+Shift+T` (`ui/src/commands/registry.ts`); and `grep -rn 'TODO(IC'` finds only `TODO(IC-4)`. No test: record
only.
