---
req-id: SWR-2451
status: draft
trace: required
test: required
type: product
title: "Create and delete personas from Settings UI"
epic: SWR-2000
date: 2026-08-12
---

# SWR-2451 — Create and delete personas from Settings UI

The Rotaris Settings → Personas tab MUST let a user create new personas
and delete existing ones without hand-editing `agents.yaml`. Today personas
are defined exclusively in YAML; this requirement adds first-class create,
duplicate, and delete actions with appropriate safety guards and workspace
/ global scoping.

## Related requirements

- SWR-304 (custom personas alongside built-in ones — the config contract)
- SWR-2430 (per-persona tool checkboxes — reused for starter-tools picker)
- SWR-2450 (persona detail panel, save/discard, scope controls — reused for
  post-create editing)

## Functional requirements

### 1. Create persona

**FR-1.1 — + New Persona button.** A `+ New Persona` button sits above the
persona table, right-aligned in the card header row. It is always visible,
even when the table is empty.

**FR-1.2 — Create Persona dialog.** Clicking `+ New Persona` opens a modal
dialog with these fields in order:

| Field         | Control                                                                                                                                                         | Required | Default                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| Name          | `QLineEdit`, validated: lowercase, hyphens and alphanumeric only, 3–64 chars, unique among configured personas                                                  | Yes      | —                          |
| Purpose       | `QLineEdit`, single line                                                                                                                                        | No       | —                          |
| Model         | `QComboBox` of configured models + model slot aliases (small/medium/large)                                                                                      | Yes      | First model in registry    |
| Clone from    | `QComboBox`, optional — "None" + every configured persona                                                                                                       | No       | None                       |
| Scope         | Segmented control: Workspace / Global                                                                                                                           | Yes      | Current edit scope         |
| Starter tools | Multi-select checklist of built-in tools from `TOOL_NAME_MAP`, initially all checked when "Clone from" is None, pre-selected to match the clone source when set | No       | All built-in tools checked |

**FR-1.3 — Name validation feedback.** The name field validates on each
keystroke (debounced 300 ms). Validation rules, shown as an inline
message beneath the field when violated:

- "Name must be 3–64 characters" — too short or too long
- "Name may only contain lowercase letters, digits, and hyphens" — invalid
  characters
- "A persona named '{name}' already exists" — duplicate

The Create button is disabled while the name is invalid.

**FR-1.4 — Create action.** Clicking Create:

1. Builds a `PersonaConfig` with the dialog values: `name`, `purpose`,
   `model`, `tools` (from starter tools), and `delegates_to` / `mcp_servers`
   / `system_prompt` from the clone source when one was selected.
2. Adds it to the pending persona config for the selected scope.
3. Closes the dialog.
4. Inserts the new persona row into the table, scrolled into view.
5. Opens the SWR-2450 detail panel for the new persona so the user can
   immediately configure delegation, system prompt, MCP servers, and
   advanced options.
6. The config is now dirty — the new persona is pending until Save.

**FR-1.5 — Clone from semantics.** When "Clone from" is set, the new
persona inherits the source's `model`, `summary_model`, `tools`,
`delegates_to`, `mcp_servers`, `system_prompt`, `system_prompt_file`,
all flags (`coordinator_only`, `read_only`, `can_publish_artifacts`,
`skip_auto_sibling_context`), `stall_timeout`, `permission_mode`,
`fallback_model`, `thinking`, and `model_family_variants`. The purpose
field is cleared (intentionally not cloned) so the user writes a fresh
one-liner. Changing the Clone from selection resets the starter tools
checklist to match the new source.

**FR-1.6 — Scope selection.** The scope segmented control defaults to
the current Persona edit scope (the same control above the table). If
the user changes it in the dialog, the new persona is written to the
chosen scope's `agents.yaml`. The table scope control outside the dialog
is unchanged.

### 2. Duplicate persona

**FR-2.1 — Right-click context menu.** Right-clicking a persona row opens
a context menu with a "Duplicate…" action. The action is always enabled.

**FR-2.2 — Duplicate flow.** Selecting "Duplicate…" opens the Create
Persona dialog with these pre-filled values:

- **Name:** `{source-name}-copy` (incremented to `-copy-2`, `-copy-3`, etc.
  if the name already exists).
- **Clone from:** set to the source persona.
- **Starter tools:** pre-selected to match the source's `tools`.
- **Purpose:** cleared.
- **Scope:** set to the source persona's scope (where it is defined).
- **Model:** set to the source's `model`.

The user can adjust any field before clicking Create.

### 3. Delete persona

**FR-3.1 — Right-click context menu.** Right-clicking a persona row opens
a context menu with a "Delete…" action. The action is always present but
may be disabled with a reason (see FR-3.4).

**FR-3.2 — Delete confirmation dialog.** Selecting "Delete…" opens a
confirmation dialog. The dialog states:

> Delete persona "{name}"?
>
> This persona will be removed from the {workspace | global} configuration.
>
> [List of active warnings, if any — see FR-3.3]
>
> This cannot be undone. The persona definition is permanently removed
> from agents.yaml on the next Save.

Buttons: "Cancel" (default, focus) and "Delete {name}" (destructive).

**FR-3.3 — Delete warnings.** Before confirming, the dialog lists active
warnings:

| Condition                                    | Warning text                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Referenced in other personas' `delegates_to` | "Referenced as a delegate target by: architect, tester. Deleting '{name}' will also remove it from their delegates_to lists."                |
| Currently running in an active session       | "Agent 'docs-writer' is currently running with this persona. The running agent will continue normally; new runs will not find this persona." |

If the persona is the `default_persona`, the Delete button is disabled and
the dialog shows: "Cannot delete: '{name}' is the default persona. Change
the default persona in General settings first."

If the persona is the last remaining persona in the resolved config, the
Delete button is disabled and the dialog shows: "Cannot delete: at least
one persona must exist."

Warnings combine — a persona can both be a delegate target and have active
agents.

**FR-3.4 — Delete action.** On confirmation:

1. The persona is removed from the pending config for its scope.
2. If the persona is referenced in other personas' `delegates_to`, those
   references are removed from the pending copies of those personas.
3. If the persona's detail panel is currently open, it closes and the
   table is shown.
4. The persona row is removed from the table.
5. The config is now dirty — the deletion is pending until Save.

**FR-3.5 — Cascade on scope change.** If the user is viewing the Workspace
scope and deletes a persona that overrides a global persona, the workspace
override is removed and the global persona reappears in the table (marked
with a "global" origin badge). This is the normal config overlay behaviour,
surfaced through the delete action.

### 4. Save / discard integration

**FR-4.1 — Pending creates and deletes participate in dirty state.**
Created personas and deleted personas are held in the `WorkspaceStore`
as pending mutations alongside edited fields (SWR-2450, SWR-2094). The
Settings save/discard bar appears whenever at least one create or delete
is pending, even if no field edits have been made.

**FR-4.2 — Save commits creates and deletes atomically.** On Save, all
pending creates and deletes are committed to the target scope's
`agents.yaml` in the same atomic write as pending field edits. The write
preserves unrelated YAML keys and comments.

**FR-4.3 — Discard reverts creates and deletes.** On Cancel, all pending
creates and deletes are discarded. Created persona rows disappear from the
table. Deleted persona rows reappear with their last-saved values.

### 5. Edge cases

**FR-5.1 — Empty table.** When no personas are configured, the `+ New
Persona` button remains visible above the empty-state label. This is the
primary call-to-action for new workspaces.

**FR-5.2 — Name collision across scopes.** A new persona in the workspace
scope may share a name with a global persona — this is the normal overlay
pattern and is allowed (the workspace definition replaces the global one).
The name uniqueness check only considers personas in the same scope.

**FR-5.3 — Built-in personas.** Personas defined in Rotaris's built-in
defaults (e.g. the `intent-classifier` internal persona) are not
user-deletable. They appear in the table with a "built-in" badge in the
scope column and their right-click menu has no Delete action. They can
still be cloned.

**FR-5.4 — Rapid create-delete-create.** Creating, deleting, and
re-creating a persona with the same name before saving is a no-op on
the final re-create (the earlier create and delete cancel each other).

**FR-5.5 — Clone from deleted source.** If the user clones a persona
and then deletes the clone source before saving, the clone is unaffected
(it captured the values at clone time). Saving then deleting the source
is valid.

## Acceptance criteria

- **AC-1:** `+ New Persona` button is visible above an empty persona table.
  Clicking it opens the Create Persona dialog. Filling the required fields
  and clicking Create inserts a new row and opens the detail panel.
  Verification: pytest-qt test.

- **AC-2:** The name field validates on keystroke: showing "Name must be
  3–64 characters" for a 2-character name, "Name may only contain lowercase
  letters, digits, and hyphens" for a name with spaces, and "A persona named
  'architect' already exists" for a duplicate. Create is disabled until the
  name is valid. Verification: pytest-qt test that types invalid names and
  asserts error labels and button state.

- **AC-3:** Creating a persona with "Clone from: architect" pre-selects
  architect's tools in the starter tools checklist. Changing the clone
  source to "tester" resets the checklist to tester's tools. Creating
  the persona persists the cloned tools to the store.
  Verification: pytest-qt test.

- **AC-4:** Right-clicking a persona row and selecting "Duplicate…" opens
  the dialog pre-filled with `{name}-copy`, the source as Clone from,
  and matching tools. The purpose field is empty. Creating it adds the
  duplicate row. Verification: integration test.

- **AC-5:** Deleting a persona that is referenced in `delegates_to` of
  "architect" and "tester" shows the warning: "Referenced as a delegate
  target by: architect, tester. Deleting '{name}' will also remove it
  from their delegates_to lists." On confirmation, both references are
  removed. Verification: integration test through ConfigService readback.

- **AC-6:** Deleting the `default_persona` shows the block message and
  disables the Delete button. Verification: pytest-qt test.

- **AC-7:** Deleting the last remaining persona shows the block message
  and disables the Delete button. Verification: unit test.

- **AC-8:** Creating a persona in the Workspace scope, saving, switching
  to Global scope, and confirming the global config is unchanged.
  Verification: integration test.

- **AC-9:** Creating two personas and then discarding removes both rows
  from the table. Verification: pytest-qt test.

- **AC-10:** Built-in personas (e.g. `intent-classifier`) show a "built-in"
  badge, have no Delete action in the context menu, and can still be
  cloned. Verification: pytest-qt test.

- **AC-11:** Creating a persona, then deleting it, then re-creating it
  with the same name before saving results in one persona row after save.
  Verification: unit test on the pending-mutation store logic.

## Test portfolio

| Level         | Productive scenario                                                                                                                   | Exercised boundary                                                            | Planned/covering test                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Unit          | Name validation: length, charset, uniqueness                                                                                          | Validation function, scope-aware uniqueness                                   | `apps/rotaris/tests/test_models.py` (new `TestPersonaNameValidation`) |
| Unit          | Pending create/delete store operations and dirty tracking                                                                             | `WorkspaceStore` mutations, signal emission, create-delete-create no-op       | `apps/rotaris/tests/test_models.py` (new test)                        |
| Unit          | Delete cascade: delegates_to references removed                                                                                       | Store projection of cascaded deletion                                         | `apps/rotaris/tests/test_models.py` (new test)                        |
| Integration   | Create dialog populates and validates                                                                                                 | `SettingsView` widget tree, combo population, validation feedback             | `apps/rotaris/tests/test_views.py` (new test)                         |
| Integration   | Clone from populates starter tools correctly                                                                                          | Tool checklist pre-selection from source persona                              | `apps/rotaris/tests/test_views.py` (new test)                         |
| Integration   | Delete with cascade saves correctly                                                                                                   | `ConfigService` → YAML readback, delegates_to cleaned                         | `apps/rotaris/tests/test_services.py` (new test)                      |
| Integration   | Save commits creates + deletes atomically alongside field edits                                                                       | `agents.yaml` write pipeline, scope layering                                  | `apps/rotaris/tests/test_services.py` (new test)                      |
| User-flow E2E | User creates a persona with clone, edits its system prompt, deletes another persona blocked by default_persona guard, saves, restarts | Create dialog → clone → edit → delete blocked → save → restart → assert state | `apps/rotaris/tests/test_main_window.py` (new test)                   |

## Scope and exclusions

- **In scope:** Create Persona dialog with validation, right-click Duplicate,
  right-click Delete with confirmation and cascade, built-in persona
  protection, workspace/global scoping, save/discard integration.
- **Out of scope (deferred):** Renaming an existing persona. Reordering
  personas in the table. Import/export of persona definitions as YAML
  snippets. Bulk delete. Undo for individual creates/deletes (only
  whole-settings Discard is supported). Persona name refactoring across
  `delegates_to` references when renaming.

Derived from: SWR-304 (custom personas)
Related: SWR-2430 (persona tool configuration), SWR-2450 (persona detail panel)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
