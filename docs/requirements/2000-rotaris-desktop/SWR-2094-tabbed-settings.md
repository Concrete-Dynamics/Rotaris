---
req-id: SWR-2094
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2000
title: "Tabbed Settings organization"
epic: SWR-2000
date: 2026-07-22
---

# SWR-2094 — Tabbed Settings organization

The Rotaris Settings view MUST organize its controls into the **Models**,
**Personas**, **Runtime**, **Interface**, **Display**, **Skills**,
**Instructions**, **Hooks**, **MCP Servers**, **Plugins**, and **Tools**
categories, in that order. Save, Discard, and save-status controls remain
visible while navigating every category and continue to apply to the entire
pending settings state.

Each category must remain vertically accessible at the supported `1000×680`
window size without horizontal scrolling. Rotaris MUST remember the selected
category as a user-wide desktop preference and fall back to **Models** when a
stored preference is absent or no longer valid.

Settings is the single home for these controls: the Library view MUST NOT
duplicate the skill, MCP server, or inventory surfaces.

## Acceptance criteria

- The categories appear in the specified order and contain the corresponding
  controls.
- Changes from any category share the existing save/discard lifecycle.
- Restarting Rotaris restores the last selected valid category.
- A missing or stale category preference opens Models.
- No skill, MCP server, or inventory control remains reachable from Library.

Derived from: [SWR-2000 — Rotaris Desktop](../2000-rotaris-desktop.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
