---
req-id: SWR-2424
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2000
title: "Settings inventory tabs"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2424 — Settings inventory tabs

The Rotaris Settings view MUST expose four read-only inventory categories —
**Instructions**, **Hooks**, **Plugins**, and **Tools** — so a user can see what
is actually active for the current workspace without leaving Settings and
without editing configuration files by hand.

Every inventory category renders the same three-column table (`Name`, `Source`,
`Description`) and shows an explanatory empty-state label when it has no
entries. The tables are informational: they carry no toggles, no editors, and
no participation in the save/discard lifecycle defined by SWR-2094.

Contents per category:

- **Instructions** — `AGENTS.md` and `AGENTS.override.md` in the active
  workspace, when present, with the absolute path as the description.
- **Hooks** — the registered run-lifecycle observers.
- **Plugins** — every `*.py` module discovered under
  `<workspace>/.rotaris/plugins`, sorted by file name.
- **Tools** — the friendly tool names from `TOOL_NAME_MAP` mapped to their SDK
  class names.

Inventory rows derive from the workspace, so they MUST be rebuilt only when
their source data changes, not on every store notification (see SWR-2094's
widget-reuse budget).

## Acceptance criteria

- Instructions, Hooks, Plugins, and Tools each appear as a Settings category
  with a `Name` / `Source` / `Description` table.
- A category with no entries shows its empty-state label instead of an empty
  table.
- With no workspace configured, Instructions and Plugins are empty and the view
  still constructs without error.
- Inventory tables contain no interactive controls.

Derived from: [SWR-2000 — Rotaris Desktop](../2000-rotaris-desktop.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)

> Superseded for the **Instructions** category by [SWR-3007 — Instruction file
> toggles in Settings](SWR-3007-instruction-file-toggles.md): instruction files
> now carry per-file on/off toggles. Hooks, Plugins, and Tools remain read-only.
