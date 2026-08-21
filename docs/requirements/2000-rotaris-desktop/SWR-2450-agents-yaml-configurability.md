---
req-id: SWR-2450
status: draft
trace: required
test: required
type: product
title: "Full agents.yaml configurability in Settings"
epic: SWR-2000
date: 2026-08-12
---

# SWR-2450 — Full agents.yaml configurability in Settings

The Rotaris Settings UI MUST let a user configure **every** field of
`agents.yaml` that affects persona behaviour without hand-editing YAML.
Today the Personas tab edits only the model and reasoning columns; SWR-2430
adds tool checkboxes. This requirement adds delegation targets, the system
prompt with discoverable template blocks, persona flags, model-family
variants, MCP server assignments, top-level defaults, and circuit-breaker
tuning — consolidating all per-persona editing into one detail panel and
adding the remaining config sections the Settings UI still lacks.

## UX principles

1. **Progressive disclosure.** The persona table remains the scanning surface;
   clicking a persona opens a detail panel to its right. Advanced fields
   (flags, stall timeout, fallback model) live in a collapsible "Advanced"
   group so a new user editing tools or delegation never sees them by
   accident.
2. **Discoverable blocks, not magic strings.** The system prompt editor lets
   the user insert template blocks (`[tools]`, `[persona name]`, `[delegates]`,
   `[mcp servers]`, `[tools section]`, `[delegates section]`, `[mcp section]`)
   from a palette or by typing `[[`, and renders them inline as styled chips
   rather than raw `[[ROTARIS:TOOL_NAMES]]` text. The underlying persisted
   value stays the existing token format — the chip rendering is an editor
   affordance only.
3. **Workspace / global scope consistently.** Every persona field that is
   persisted to `agents.yaml` participates in the same workspace-over-global
   override pattern established by SWR-2072 and SWR-2073 and participates in
   the save/discard lifecycle (SWR-2094).
4. **Validation at the control, not at save time.** A persona whose tools list
   references an MCP server that isn't configured, a `delegates_to` entry that
   names a non-existent persona, or a stale model reference is flagged with an
   inline warning — not a save-time error dialog.

## Functional requirements

### 1. Persona detail panel (replaces per-column drill-in)

**FR-1.1 — Detail panel trigger.** Clicking a persona row in the Personas
table MUST open a detail panel in the right half of the Settings view
(replacing the table's stretched space, not a modal). The detail panel header
shows the persona name, a scope badge ("workspace" / "global"), and a "Done"
button that returns to the full table.

**FR-1.2 — Sections.** The detail panel MUST contain these labeled sections
in order:

| Section       | Content                                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | Name, purpose (editable single-line), model selector, reasoning selector, summary model selector                                                                                                                                        |
| System Prompt | The block-based prompt editor (FR-2)                                                                                                                                                                                                    |
| Tools         | Checkbox grid of built-in tools and MCP servers (SWR-2430, reused inline)                                                                                                                                                               |
| Delegation    | Drag-and-drop dual-pane delegation editor (FR-3)                                                                                                                                                                                        |
| MCP Servers   | Checkbox grid of configured MCP servers (FR-4)                                                                                                                                                                                          |
| Advanced      | Collapsible group: coordinator-only toggle, read-only toggle, can-publish-artifacts toggle, skip-auto-sibling-context toggle, stall timeout spinner, permission mode selector, fallback model selector, model-family variant text areas |

**FR-1.3 — Model-family variants.** The Advanced section MUST contain
one `QPlainTextEdit` per known model family (`claude`, `gpt`, `gemini`,
`deepseek`) so a user can append family-specific prompt additions. Empty
fields are not persisted. The label shows the family name and the control
tooltip reads "Appended to the system prompt when a {family} model is
resolved for this persona."

**FR-1.4 — Scope badge.** The Overview header MUST display a scope badge
matching the current Workspace/Global segmented control. Changing scope
outside the detail panel while it is open MUST update the badge and
reload the detail panel's values for the new scope.

### 2. Block-based system prompt editor

**FR-2.1 — Block palette.** A horizontal palette of available template blocks
sits directly above the prompt editor text area. Each block is a flat
button (or small chip) labeled with the friendly token name: `Tools`,
`Tool names`, `Delegates`, `Persona name`, `MCP servers`, `Tools section`,
`Delegates section`, `MCP section`. Hovering a block shows a tooltip with
the raw `[[ROTARIS:...]]` token it inserts.

**FR-2.2 — Block insertion.** Clicking a block in the palette inserts
the corresponding `[[ROTARIS:TOKEN]]` at the current cursor position in the
editor. The inserted text appears immediately as a styled inline chip
(see FR-2.4).

**FR-2.3 — Autocomplete on `[[`.** Typing `[[` inside the prompt editor
opens a small autocomplete popup listing every available token: `TOOL_NAMES`,
`TOOLS_SECTION`, `DELEGATE_NAMES`, `DELEGATES_SECTION`, `PERSONA_NAME`,
`MCP_SECTION`. Continuing to type filters the list. Selecting an entry (click
or Enter) replaces the `[[` prefix and partial text with the full
`[[ROTARIS:TOKEN]]` token, rendered as a chip. Pressing Escape closes the
popup and leaves the raw text as typed.

**FR-2.4 — Inline chip rendering.** Within the editor area, every
`[[ROTARIS:TOKEN]]` token MUST render as a styled chip (pill/badge) with
the friendly short name — e.g. the text `[[ROTARIS:TOOL_NAMES]]` renders
as a teal `[tool names]` chip. The chip is a single unit for cursor
navigation and deletion: pressing Backspace with the cursor immediately
after a chip deletes the whole token; pressing Delete with the cursor
immediately before it does the same. Arrow keys skip over a chip in one
step. Placing the cursor mid-chip expands it back to its raw text form
so the user can edit it.

**FR-2.5 — Preview pane.** The right side of the prompt editor dialog
(or the bottom half of a split) MUST show a read-only rendered preview
of the system prompt with chips resolved to the actual injected text for
a sample run: `[tool names]` → `ask_questions, delegate, terminal, ...`,
`[persona name]` → the persona's current name. The preview updates
asynchronously (debounced 300 ms) so it never blocks typing.

**FR-2.6 — External file reference.** A "Load from file…" button above the
editor lets the user select a `.md` file as `system_prompt_file`. When a
file is selected, the editor becomes read-only and displays the resolved
file path with a "Clear" action to revert to inline editing. The two
fields are mutually exclusive per `PersonaConfig` semantics — setting one
clears the other.

**FR-2.7 — Token count.** A live token-count label beneath the editor
displays `~N tokens` estimated as `chars / 4`, updating on each keystroke
(debounced 300 ms). The label turns amber above the active model's context
threshold (when known) and red at 2× the threshold.

### 3. Delegation targets — drag-and-drop dual-pane

**FR-3.1 — Dual-pane layout.** The Delegation section shows two list panes
side by side, each with a header label:

| Left pane            | Right pane        |
| -------------------- | ----------------- |
| "Available personas" | "Can delegate to" |

**FR-3.2 — Populated from configured personas.** The left pane lists every
persona configured in the resolved config **except** the current persona
(self-delegation is nonsensical). The right pane lists the persona's current
`delegates_to` entries in order. Both panes show the persona name and its
`purpose` line.

**FR-3.3 — Drag to assign.** Dragging a persona from the left pane to the
right pane adds it to `delegates_to`. Dragging from right to left removes
it. Dragging within the right pane reorders the `delegates_to` list (order
is significant — the first entry is the default delegate).

**FR-3.4 — Click-to-assign fallback.** Double-clicking a persona in either
pane moves it to the other pane, as a mouse-only fallback for drag-and-drop.

**FR-3.5 — Delegation graph visual.** A small read-only Mermaid-style text
diagram below the dual pane shows the delegation graph for the current
persona: `orchestrator → architect → backend-dev`. This is a static `QLabel`
rendered from the current `delegates_to` list — no interactive graph
manipulation.

### 4. MCP server assignment

**FR-4.1 — Checkbox grid.** The MCP Servers section lists every configured
MCP server from the resolved config. Each entry shows the server name,
a status dot (reusing the SWR-2097 live-status indicator), and a checkbox
reflecting whether it is assigned to the persona's `mcp_servers` list.

**FR-4.2 — Discovered tool count.** A healthy MCP server entry also shows
its discovered tool count — e.g. `serena · 4 tools` — as a muted label
to the right of the server name.

**FR-4.3 — Assigning an unreachable server.** Checking an MCP server that
is currently unreachable MUST show a warning: "serena is not reachable.
It can still be assigned, but its tools will be unavailable at runtime."
The checkbox still works.

### 5. Top-level defaults

A new **General** card sits above the persona table on the Personas tab,
containing:

**FR-5.1 — Default persona.** A dropdown listing all configured personas.
Changing it writes `default_persona` to the current scope's `agents.yaml`.

**FR-5.2 — Model slots.** Four rows — `Small model`, `Medium model`,
`Large model`, `Fallback model` — each with a model selector and a thinking
selector. These write `small_model`, `medium_model`, `large_model`, and
`fallback_model` (plus their `*_thinking` variants). A muted label beneath
each row explains the alias: "Personas referencing 'small_model' resolve
to this model at runtime."

**FR-5.3 — Default summary model.** A model selector for
`default_summary_model` and its thinking level. A muted label reads
"Cheap model used for child-agent summary reports."

**FR-5.4 — Improvement collector model.** A model selector for
`improvement_collector_model` and its thinking level.

### 6. Circuit breaker

A new collapsible **Circuit Breaker** card on the Runtime tab, collapsed
by default, containing:

**FR-6.1 — Enable toggle.** An on/off toggle for `circuit_breaker.enabled`.

**FR-6.2 — Model and timeout.** A model selector for `circuit_breaker.model`
and a timeout spinner (`timeout_seconds`, 0.5–60 s, step 0.5).

**FR-6.3 — Activation mode.** A segmented control: "Independent" /
"Weighted", writing `activation_mode`.

**FR-6.4 — Thresholds.** Two spin boxes (`tool_call_threshold`,
`message_count_threshold`) and two weight sliders (`tool_weight`,
`message_weight`) visible only when activation mode is "Weighted". The
sliders snap to 0.1 increments and their labels read `× tool_weight`
and `× message_weight`.

**FR-6.5 — Analysis window.** Spin boxes for `max_recent_events`,
`max_transcript_chars`, `repetition_threshold`, `cycle_threshold`, and
`target_score`.

### 7. Save, discard, and dirty-state

**FR-7.1 — Unified dirty tracking.** Every control in the detail panel,
General card, and Circuit Breaker card participates in the existing
`WorkspaceStore` dirty-state tracking (SWR-2094). The Settings save/discard
bar appears when any field differs from its last-saved value.

**FR-7.2 — Atomic scope-level write.** Save writes all dirty persona
fields, General fields, and circuit-breaker fields for the active scope
in one atomic `agents.yaml` write. The write preserves unrelated YAML keys
and comments (via the existing `_load_agents_yaml` → mutate → atomic-write
pipeline).

**FR-7.3 — Discard granularity.** Discard reverts ALL dirty fields across
ALL sections — there is no section-level revert.

### 8. Validation and warnings

**FR-8.1 — Orphaned delegation target.** If `delegates_to` references a
persona that no longer exists in the resolved config, a warning badge
appears next to that entry reading "Not configured". The entry stays in
the list so the user can remove it or re-create the missing persona.

**FR-8.2 — Orphaned MCP server reference.** If `mcp_servers` references
a server not in the resolved `mcp_servers` config, a warning badge appears
next to that entry reading "Not configured".

**FR-8.3 — Empty tools.** A persona with zero tools (all checkboxes
cleared) MUST show a visible warning — "No tools assigned" — as a muted
label beneath the Tools checkbox grid. The configuration is still saveable.

**FR-8.4 — Stale model reference.** If the persona's `model` field references
a model not in the resolved model registry, the model selector shows the
stale name with an amber border and a tooltip reading "Model '{name}' is
not in the current model registry."

### 9. Empty and edge states

**FR-9.1 — No personas configured.** When `personas` is empty, the persona
table shows its existing empty-state label. The General card remains visible
and usable.

**FR-9.2 — Circuit breaker defaults.** When no `circuit_breaker` key exists
in the config, all controls display their schema defaults (from
`CircuitBreakerConfig`) and are pristine (not dirty). The card starts
collapsed.

**FR-9.3 — First use of detail panel.** When the user has never opened a
detail panel before, a one-time tooltip appears on the first persona row:
"Click a persona to edit its tools, prompt, and delegation targets."
This tooltip is dismissed on first click and never shown again
(per-workspace, persisted as a simple boolean).

## Acceptance criteria

- **AC-1:** Clicking any persona row opens a detail panel in the right half
  of the Personas tab. The panel shows Overview, System Prompt, Tools,
  Delegation, MCP Servers, and Advanced sections. Clicking "Done" returns
  to the full table. Verification: pytest-qt test that clicks a persona row
  and asserts all section headers are visible.

- **AC-2:** The block palette above the prompt editor shows 8 block buttons.
  Clicking `[tools]` inserts `[[ROTARIS:TOOL_NAMES]]` at the cursor, and
  the inserted text renders as a teal chip reading `[tools]`. Pressing
  Backspace after the chip deletes the entire token. Verification: pytest-qt
  test that clicks the block button, reads the editor's backing text, and
  asserts it contains `[[ROTARIS:TOOL_NAMES]]`.

- **AC-3:** Typing `[[` in the prompt editor opens an autocomplete popup
  listing all 6 tokens. Typing `tool` narrows to `TOOL_NAMES` and
  `TOOLS_SECTION`. Selecting `TOOL_NAMES` inserts the full token rendered
  as a chip. Verification: pytest-qt test that types `[[tool`, asserts the
  popup is visible and filtered, selects an entry, and checks the resulting
  text.

- **AC-4:** The preview pane shows resolved values for all chips in the
  prompt, matching what the agent would receive at runtime.
  Verification: unit test on a prompt with every token type, asserting
  resolved text contains the persona name, tool list, and delegate names.

- **AC-5:** Dragging "architect" from Available to "Can delegate to" adds
  it to the persona's `delegates_to` list. Saving writes it to the workspace
  `agents.yaml`. Verification: integration test through `ConfigService`
  readback.

- **AC-6:** Changing the Workspace/Global scope control while the detail
  panel is open reloads the panel's values to reflect the new scope.
  Verification: pytest-qt test that opens a persona, switches scope, and
  asserts model values changed.

- **AC-7:** A `delegates_to` entry referencing a deleted persona shows the
  "Not configured" warning. The entry remains in the right pane.
  Verification: unit test on the store's warning derivation.

- **AC-8:** Saving the General card's `default_persona` to "architect"
  writes `default_persona: architect` to the correct scope's `agents.yaml`.
  Verification: integration test.

- **AC-9:** Toggling the Circuit Breaker card collapsed/expanded does not
  mark the config dirty. Changing any control inside it does.
  Verification: pytest-qt test.

- **AC-10:** Discarding after editing the system prompt, tools, and
  delegation targets reverts all three to their last-saved values.
  Verification: pytest-qt test that dirties three sections, cancels, and
  asserts all three are reverted.

- **AC-11:** A persona whose `model` references a deleted model shows the
  amber-bordered stale-model warning in the model selector.
  Verification: unit test on the store projection.

- **AC-12:** Assigning an unreachable MCP server to a persona shows the
  "serena is not reachable" warning next to the checkbox. The checkbox
  remains checkable and saves successfully. Verification: pytest-qt test
  with a mocked unhealthy MCP server.

## Test portfolio

| Level         | Productive scenario                                                                                                                                                        | Exercised boundary                                                                 | Planned/covering test                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unit          | Block chip insertion and deletion in prompt editor model                                                                                                                   | Prompt backing text ↔ chip representation, cursor navigation                       | `apps/rotaris/tests/test_models.py` (new `TestPromptBlockEditor`) |
| Unit          | Token resolution for preview pane                                                                                                                                          | Every `[[ROTARIS:...]]` token resolved with sample data                            | `apps/rotaris/tests/test_services.py` (new test)                  |
| Unit          | Delegation drag-and-drop model operations                                                                                                                                  | Add, remove, reorder in `delegates_to` list                                        | `apps/rotaris/tests/test_models.py` (new test)                    |
| Unit          | Orphan detection: stale model, missing delegate, missing MCP server                                                                                                        | Store projection warning derivation                                                | `apps/rotaris/tests/test_models.py` (new test)                    |
| Integration   | Persona detail panel opens and populates all sections                                                                                                                      | `SettingsView` widget tree, combo/section visibility, scope switching              | `apps/rotaris/tests/test_views.py` (new test)                     |
| Integration   | General card save persists `default_persona` and model slots                                                                                                               | `ConfigService` → YAML readback, scope layering                                    | `apps/rotaris/tests/test_services.py` (existing, extended)        |
| Integration   | Circuit breaker card save persists all fields                                                                                                                              | `ConfigService` → YAML readback, default vs custom values                          | `apps/rotaris/tests/test_services.py` (new test)                  |
| Integration   | Save writes all dirty sections atomically                                                                                                                                  | `agents.yaml` write pipeline, unrelated keys preserved, comments retained          | `apps/rotaris/tests/test_services.py` (new test)                  |
| User-flow E2E | User opens persona detail panel, edits system prompt with two block inserts, drags a delegate target, toggles read-only, saves, reopens, and confirms all values persisted | Click persona → edit prompt → drag delegate → toggle flag → save → reopen → assert | `apps/rotaris/tests/test_main_window.py` (new test)               |
| User-flow E2E | User changes General defaults, switches persona model, edits circuit breaker, saves, restarts app, confirms values loaded                                                  | General card → persona detail → circuit breaker → save → restart → assert          | `apps/rotaris/tests/test_main_window.py` (new test)               |

## Scope and exclusions

- **In scope:** Persona detail panel (all `PersonaConfig` fields), block-based
  system prompt editor, delegation drag-and-drop, MCP server assignment,
  top-level defaults (General card), circuit breaker card, unified dirty-state
  participation, inline validation warnings.
- **Out of scope (deferred):** Global-scope tool and delegation overrides
  (workspace-scope only for now — matches SWR-2430's scope boundary). Adding
  or deleting personas from the UI. Adding or deleting models from the UI.
  Adding or deleting MCP server definitions from the UI. Reordering the
  persona list. Prompt variant A/B testing or version history. Prompt block
  customisation beyond the 8 built-in tokens. Circuit breaker real-time
  simulation or dry-run.

Derived from: [SWR-2006 — Layered config persistence](../2000-rotaris-desktop.md),
[SWR-2072 — Persona model control](../2000-rotaris-desktop.md),
[SWR-2073 — Persona reasoning control](../2000-rotaris-desktop.md),
[SWR-2430 — Persona Tool Configuration](SWR-2430-persona-tool-configuration.md)

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
