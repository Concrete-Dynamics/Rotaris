---
req-id: SWR-2430
status: draft
trace: required
test: required
type: product
title: "Persona Tool Configuration"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2430 — Persona Tool Configuration

The Rotaris Settings → Personas tab MUST let a user configure which tools each
persona can use, without hand-editing `agents.yaml`. Currently the Tools column
(column 5) is read-only plain text. This requirement replaces that with an
interactive tool editor.

## Functional requirements

1. **Tool-config trigger per persona.** Each persona row in the `persona_table`
   MUST display a gear/settings icon button in the first column (Persona, column
   0) alongside the persona name. When the user clicks that icon, the persona's
   tool configuration editor opens.

2. **Tool editor panel.** The editor MUST open as a separate panel or dialog that
   lists every available tool — both built-in tools from `TOOL_NAME_MAP`
   (`agents/factory.py`) and every MCP server name from the resolved
   `mcp_servers` configuration — grouped into two labeled sections: **Built-in
   Tools** and **MCP Servers**.

3. **Checkbox toggles.** Every tool entry MUST render a checkbox whose checked
   state reflects whether that tool is currently assigned to the persona.
   Checking a tool adds it to the persona's `tools` list; unchecking removes it.

4. **MCP server tools.** MCP server entries in the tool editor MUST display the
   server name and, when the server is healthy and reachable, its discovered tool
   names (from the MCP `tools/list` handshake) as indented read-only labels
   beneath the server checkbox. When the MCP server is not reachable, the server
   name alone is shown with a warning indicator.

5. **Workspace-scoped persistence.** Tool changes MUST persist to the workspace
   `agents.yaml` under the persona's `tools` field, following the same
   workspace/global scope pattern established by the existing Model (SWR-2072)
   and Reasoning (SWR-2073) persona controls. The `WorkspaceStore` MUST gain new
   `set_persona_tools(name, tools)` and `unset_persona_tools(name)` methods, and
   `PersonaSpec` MUST gain a `tools_scope: str = "default"` field mirroring
   `model_scope` / `reasoning_scope`.

6. **Tools column update.** After a tool-config change is saved, the persona
   table's Tools column (column 5) MUST update to reflect the new tool list
   within the same poll cycle. The update MUST follow the existing `blockSignals`
   / `setItemWidget` / signal-connect pattern demonstrated by the Model (column
   2) and Reasoning (column 3) columns.

7. **Save/discard participation.** Tool edits MUST participate in the Settings
   dirty-state and save/discard lifecycle defined by SWR-2094. Pending tool
   changes are discarded on Cancel, saved atomically alongside pending model and
   reasoning changes on Save.

8. **Empty-tool guard.** A persona with zero tools (all checkboxes cleared) MUST
   be allowed but MUST show a visible warning — either an inline label or a
   tooltip on the Tools column — reading "No tools assigned" so the user
   understands the persona will have no SDK tools at runtime.

## Scope and exclusions

- Tool configuration is per-persona, workspace-scoped. Global-scope tool
  overrides are explicitly deferred to a future requirement.
- `custom_tools` (plugin-based tools from `PersonaConfig.custom_tools`) are
  displayed read-only in the editor but are NOT toggleable in this requirement —
  they are configured through the Plugins inventory tab (SWR-2424).
- This requirement does NOT change the runtime tool resolution pipeline
  (`_apply_tool_restrictions`, `coordinator_only`, `read_only`,
  `intent_allowed_tools`). Those filters continue to apply on top of the
  persona's configured tool list.
- The gear icon does NOT need to be the same rendering as `_glyph_icon()` from
  `chrome.py`; a Unicode gear glyph (⚙, U+2699) on a small flat `QPushButton` or
  `QToolButton` is acceptable. A `_glyph_icon()`-style icon is also acceptable
  but not required.

## Acceptance criteria

- **AC-1:** Every persona row in the Personas tab displays a gear icon in the
  Persona column. Clicking it opens the tool editor for that persona.
  Verification: manual inspection + pytest-qt test that locates the gear button
  and simulates a click, confirming the editor panel/dialog appears.

- **AC-2:** The tool editor lists every entry from `TOOL_NAME_MAP` (17 built-in
  tools) and every configured MCP server, grouped into two labeled sections.
  Verification: unit test against a known `TOOL_NAME_MAP` snapshot and MCP
  config.

- **AC-3:** All built-in tool checkboxes reflect the persona's current `tools`
  list. Checking/unchecking a built-in tool updates the working copy.
  Verification: pytest-qt test that toggles checkboxes and reads the widget
  state.

- **AC-4:** Checking an MCP server checkbox adds its server name to the
  persona's `tools` list. Unchecking removes it. Verification: unit test on
  the store's `set_persona_tools` method.

- **AC-5:** Saving the tool configuration persists the new `tools` list to the
  workspace `agents.yaml` and the persona table's Tools column updates within one
  poll cycle. Verification: integration test through `ConfigService` readback.

- **AC-6:** Discarding (Cancel) reverts tool changes to the last saved state.
  Verification: pytest-qt test that edits tools, cancels, and confirms the table
  column is unchanged.

- **AC-7:** Clearing all built-in tool checkboxes and saving shows the "No tools
  assigned" warning in the Tools column. Verification: pytest-qt test that
  clears all tools and asserts the warning label is visible.

- **AC-8:** An MCP server that is unreachable (unhealthy) still appears in the
  editor with its server name, but no discovered tool names are listed beneath
  it and a warning indicator is shown. Verification: unit test with a mocked
  unreachable MCP server state.

- **AC-9:** Tool configuration changes do NOT affect model or reasoning
  configuration. Editing tools and saving alongside pending model/reasoning
  changes works atomically. Verification: integration test.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | `set_persona_tools` / `unset_persona_tools` on `WorkspaceStore` | Store method correctness, signal emission | `apps/rotaris/tests/test_models.py` (new test) |
| Unit | `PersonaSpec.tools_scope` field serialization | `PersonaSpec` dataclass round-trip | `apps/rotaris/tests/test_models.py` (new test) |
| Integration | Tool editor populated from `TOOL_NAME_MAP` + MCP config | SettingsView widget tree, checkbox state | `apps/rotaris/tests/test_views.py` (new test) |
| Integration | Save persists tools to `agents.yaml` and table updates | `ConfigService` → YAML readback | `apps/rotaris/tests/test_services.py` (new test) |
| User-flow E2E | User opens persona tool editor, toggles tools, saves, sees updated Tools column | Gear click → editor open → checkbox toggle → save → table refresh | `apps/rotaris/tests/test_main_window.py` (new test) |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
