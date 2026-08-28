---
req-id: [SWR-1100, SWR-1101, SWR-1102, SWR-1103, SWR-1104, SWR-1105, SWR-1106, SWR-1107, SWR-1108, SWR-1109, SWR-1110, SWR-1111, SWR-1113, SWR-1114, SWR-1115, SWR-1116, SWR-1117, SWR-1118, SWR-1119, SWR-1120, SWR-1122, SWR-1123, SWR-1124, SWR-1125, SWR-1126, SWR-1127, SWR-1128, SWR-1129, SWR-1130, SWR-1131, SWR-1132, SWR-1133, SWR-1134, SWR-1135, SWR-1136, SWR-1137, SWR-1138, SWR-1139, SWR-1140, SWR-1141, SWR-1142, SWR-1147, SWR-1148, SWR-1149, SWR-1153, SWR-1154, SWR-1155, SWR-1156, SWR-1157, SWR-1158, SWR-1159, SWR-1160, SWR-1161, SWR-1162, SWR-1163, SWR-1164, SWR-1165, SWR-1166, SWR-1167, SWR-1168, SWR-1169, SWR-1170, SWR-1171, SWR-1172, SWR-1173, SWR-1174, SWR-1175, SWR-1176, SWR-1177, SWR-1178, SWR-1179, SWR-1180, SWR-1181, SWR-1182, SWR-1183, SWR-1184, SWR-1185]
status: approved
trace: required
test: required
title: "TUI Input, Commands & Shortcuts"
---

# 1100-tui-input spec

## SWR-1100 — TUI Input, Commands & Shortcuts
trace: optional
test: optional

Input composer features: slash commands, prompt stash and history, keyboard shortcut architecture, and the command-palette cheat sheet.

## SWR-1101 — Stash Command
legacy-id: REQ-20260414-120000-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The application must provide a dedicated command to stash the current prompt input.

## SWR-1102 — Stash via Settings Menu
legacy-id: REQ-20260414-120000-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The settings menu must include a "Stash Input" entry that, when triggered, pushes the current prompt text onto the stash stack.

## SWR-1103 — Stash Clears Input Field
legacy-id: REQ-20260414-120000-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

After a successful stash operation, the prompt input field must be cleared.

## SWR-1104 — Stack Persistence
legacy-id: REQ-20260414-120000-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The stash stack must persist across app launches.

## SWR-1105 — Pop via Settings Menu
legacy-id: REQ-20260414-120000-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The settings menu must include a "Pop Input" entry that, when triggered, pops the top entry from the stash stack and restores it into the prompt input field.

## SWR-1106 — Pop Overwrites Current Input
legacy-id: REQ-20260414-120000-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

When popping, if the input field is not empty, the popped content will be inserted at the cursor or appended.

## SWR-1107 — Pop on Empty Stack
legacy-id: REQ-20260414-120000-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

If a pop operation is triggered on an empty stack, the application must display a non-blocking notification indicating the stack is empty.

## SWR-1108 — Settings Menu Placement
legacy-id: REQ-20260414-120000-008
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The "Stash Input" and "Pop Input" menu items must appear as sibling entries to existing items (e.g., "Toggle Send Mode") within the same settings menu.

## SWR-1109 — LIFO Order
legacy-id: REQ-20260414-120000-009
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The stash stack must follow Last-In-First-Out order - the most recently stashed entry is the first to be popped.

## SWR-1110 — Discoverability
legacy-id: REQ-20260414-120000-010
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

The stash command must be accessible without opening the settings menu (via a keyboard shortcut and a dedicated toolbar button). **Note (2026-06-16):** The keyboard shortcut for stash is migrated from `Ctrl+S` to `Ctrl+X S` per `requirements-20260616-000001-keyboard-shortcut-architecture.md`. The `/stash` slash command remains the IDE-safe fallback.

## SWR-1111 — Settings Menu Scope
trace: optional
legacy-id: REQ-20260414-120000-011
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

No new top-level UI surface may be introduced; all stash/pop controls must reside within the existing settings menu or as an inline command.

## SWR-1113 — 'Stash input' entry in command palette (search + discover)
legacy-id: REQ-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

"Stash input" entry in command palette (search + discover)

## SWR-1114 — `action_stash_input` clears input via `composer.set_text('')`
legacy-id: REQ-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

`action_stash_input` clears input via `composer.set_text("")`

## SWR-1115 — `PromptStash` persists to `~/.config/rotaris/prompt_stash.json` via atomic wri
legacy-id: REQ-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

`PromptStash` persists to `~/.config/rotaris/prompt_stash.json` via atomic write

## SWR-1116 — 'Pop input' entry in command palette posts `PopInput` message
legacy-id: REQ-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

"Pop input" entry in command palette posts `PopInput` message

## SWR-1117 — Pop appends to existing text when input is non-empty
legacy-id: REQ-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

Pop appends to existing text when input is non-empty

## SWR-1118 — `on_pop_input` calls `self.notify('Stash is empty.')` when stack is empty
legacy-id: REQ-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

`on_pop_input` calls `self.notify("Stash is empty.")` when stack is empty

## SWR-1119 — Stash/Pop entries are siblings to existing command palette entries
legacy-id: REQ-008
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

Stash/Pop entries are siblings to existing command palette entries

## SWR-1120 — `PromptStash` uses `list.append`/`list.pop` (LIFO)
legacy-id: REQ-009
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

`PromptStash` uses `list.append`/`list.pop` (LIFO)

## SWR-1122 — All controls in command palette and meta bar; no new UI surface
legacy-id: REQ-011
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-120000.md

All controls in command palette and meta bar; no new UI surface

## SWR-1123 — Slash command interception implemented in InputComposer
legacy-id: REQ-20260417-190000-001
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Slash command interception implemented in InputComposer

Coverage: at least one test per registered command, and one test asserting an
unknown `/command` is rejected rather than dispatched.

## SWR-1124 — `/stop` command dispatches StopRun()
legacy-id: REQ-20260417-190000-002
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/stop` command dispatches StopRun()

## SWR-1125 — `/pause` command dispatches PauseRun()
legacy-id: REQ-20260417-190000-003
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/pause` command dispatches PauseRun()

## SWR-1126 — `/resume` command invokes action_show_session_picker()
legacy-id: REQ-20260417-190000-004
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/resume` command invokes action_show_session_picker()

## SWR-1127 — `/new` command dispatches NewSession()
legacy-id: REQ-20260417-190000-005
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/new` command dispatches NewSession()

## SWR-1128 — `/tools` command dispatches ToggleToolEvents()
legacy-id: REQ-20260417-190000-006
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/tools` command dispatches ToggleToolEvents()

## SWR-1129 — `/background` command dispatches SendToBackground()
legacy-id: REQ-20260417-190000-007
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/background` command dispatches SendToBackground()

## SWR-1130 — `/stash` command dispatches StashInput()
legacy-id: REQ-20260417-190000-008
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/stash` command dispatches StashInput()

## SWR-1131 — `/pop` command dispatches PopInput()
legacy-id: REQ-20260417-190000-009
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/pop` command dispatches PopInput()

## SWR-1132 — `/theme <name>` command dispatches SetTheme(name) with validation
legacy-id: REQ-20260417-190000-010
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

`/theme <name>` command dispatches SetTheme(name) with validation

Coverage: valid theme name, invalid theme name, and dispatch through the composer.

## SWR-1133 — Case-insensitive command matching
legacy-id: REQ-20260417-190000-014
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Case-insensitive command matching

Coverage: one test executing a registered command in non-matching case.

## SWR-1134 — Commands never forwarded to agent
legacy-id: REQ-20260417-190000-015
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Commands never forwarded to agent

Coverage: one test asserting a normal, non-slash message is forwarded to the agent
unchanged.

## SWR-1135 — No perceptible latency added
legacy-id: REQ-20260417-190000-016
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

No perceptible latency added

## SWR-1136 — No regression to existing shortcuts
legacy-id: REQ-20260417-190000-017
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

No regression to existing shortcuts

Coverage: the pre-existing shortcut and composer regression tests continue to pass.

## SWR-1137 — Implementation confined to InputComposer
legacy-id: REQ-20260417-190000-018
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Implementation confined to InputComposer

## SWR-1138 — Works in both single-line and multiline modes
legacy-id: REQ-20260417-190000-019
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Works in both single-line and multiline modes

Coverage: one test asserting multiline input does not intercept a leading slash.

## SWR-1139 — Lazy imports used for TUI messages
legacy-id: REQ-20260417-190000-020
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Lazy imports used for TUI messages

## SWR-1140 — Autocomplete overlay shown from the composer slash path
legacy-id: REQ-20260417-190000-011
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Autocomplete overlay shown from the composer slash path

## SWR-1141 — Keyboard navigation for autocomplete implemented
legacy-id: REQ-20260417-190000-012
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Keyboard navigation for autocomplete implemented

## SWR-1142 — Command registry implemented (infrastructure ready)
legacy-id: REQ-20260417-190000-013
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Derived requirements: [SWR-1186 — File-based custom prompt slash commands](1100-tui-input/SWR-1186-file-based-custom-prompt-commands.md)

Command registry implemented (infrastructure ready)

## SWR-1147 — Overlay behavior exists and is traced by dedicated requirement-level coverage
legacy-id: REQ-20260417-190000-025
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Overlay behavior exists and is traced by dedicated requirement-level coverage.

## SWR-1148 — Filtering behavior exists and is traced by dedicated requirement-level coverage
legacy-id: REQ-20260417-190000-026
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Filtering behavior exists and is traced by dedicated requirement-level coverage.

## SWR-1149 — Keyboard navigation exists and is traced by dedicated requirement-level coverage
legacy-id: REQ-20260417-190000-027
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-slash-commands.md

Keyboard navigation exists and is traced by dedicated requirement-level coverage.

## SWR-1153 — Prompt Submission Ring Buffer
legacy-id: REQ-20260522-HISTCYCLE-001
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: High

The `InputComposer` shall maintain a FIFO ring buffer of the last 50 submitted prompt texts. Entries exceeding 50 are evicted oldest-first. The ring buffer tracks a cursor index representing the current position during navigation.

## SWR-1154 — Up-Arrow Loads Previous Prompt
legacy-id: REQ-20260522-HISTCYCLE-002
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: High

When the user presses the Up arrow key while the prompt input is focused, the text at the current ring-buffer index − 1 is placed into the input field. The cursor index decreases. At the beginning of the buffer (index 0), further Up presses have no effect and the cursor remains at 0.

## SWR-1155 — Down-Arrow Advances Forward
legacy-id: REQ-20260522-HISTCYCLE-003
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: High

When the user presses the Down arrow key, the cursor index increases by one. If the cursor is at the end of the ring buffer (past the newest entry), the input field resets to empty (representing the unsent state). Otherwise, the text at the new index is displayed.

## SWR-1156 — Ring Buffer Is Append-On-Submit
legacy-id: REQ-20260522-HISTCYCLE-004
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: High

Upon successful submission of non-blank text, the text is appended to the end of the ring buffer, truncating to capacity (50). The cursor resets to the position after the newly-added entry (i.e., the "unsent" position).

## SWR-1157 — Typing Breaks History Walk
legacy-id: REQ-20260522-HISTCYCLE-005
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: Medium

While the user has a history entry loaded and begins typing or editing the input field content, the cursor stops advancing automatically - further Up/Down jumps continue from the current loaded entry outward (toward older entries). The underlying ring buffer is not mutated. Loading a newer entry again restores the live tail.

## SWR-1158 — Blank Submissions Are Not Recorded
legacy-id: REQ-20260522-HISTCYCLE-006
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: Medium

Submitting an empty (stripped-whitespace) prompt does not append to the ring buffer.

## SWR-1159 — Works Identically in Single-Line and Multi-Line Modes
legacy-id: REQ-20260522-HISTCYCLE-007
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: Medium

Up/Down cycling applies to both the `Input` widget (single-line mode) and the `TextArea` widget (multi-line mode). When the mode is toggled during a history walk, the loaded text transfers to whichever widget is active at that moment.

## SWR-1160 — History Persists Across Restarts
legacy-id: REQ-20260522-HISTCYCLE-008
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md
priority: High

Prompt history shall persist across app restarts for the same workspace. The stored history remains bounded to 50 entries, reloads into the composer on startup, and still resets the active cursor to the unsent position on launch.

## SWR-1161 — The command palette overlay reserves the bottom third of the screen height for a static cheat-sheet panel that displays all available keyboard shortcuts
legacy-id: REQ-20260526-001
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md
priority: High



## SWR-1162 — The cheat-sheet panel is visible simultaneously with the command palette search list; the palette's searchable items occupy the remaining upper area
legacy-id: REQ-20260526-002
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md
priority: High



## SWR-1163 — Each shortcut entry in the cheat-sheet shows the key combination (e.g. `Ctrl+X P`), a short description, and the context/screen where it is active. Shortcuts SHALL be displayed in leader-chord notation per `requirements-20260616-000001-keyboard-shortcut-architecture.md`.
legacy-id: REQ-20260526-003
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md
priority: Medium



## SWR-1164 — The cheat-sheet panel closes when the command palette is dismissed (Esc or command selection)
legacy-id: REQ-20260526-004
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md
priority: Medium



## SWR-1165 — The cheat-sheet dynamically reflects the current screen/context - only shortcuts active in the current screen are shown
legacy-id: REQ-20260526-005
date: 2026-05-26
source: docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md
priority: Low



## SWR-1166 — Leader-prefix chord system.** The TUI SHALL support a configurable leader key (default `Ctrl+X`) that, when pressed, enters a leader-pending state awaiting a mnemonic key to form a complete command chord. The leader SHALL be consumed by the app and NOT forwarded to the terminal or IDE.
legacy-id: REQ-20260616-001
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1167 — Leader configurability.** The leader key SHALL be configurable via the app configuration system (layered YAML: `~/.config/rotaris/` and `<workspace>/.rotaris/`). Configuration key: `tui.keyboard.leader`. Valid values: `Ctrl+X` (default), `Ctrl+G`, `Esc`, or any user-defined `Ctrl+<letter>` sequence. Invalid values SHALL fall back to `Ctrl+X` with a warning toast.
legacy-id: REQ-20260616-002
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1168 — Leader-pending visual indicator.** When the leader key is pressed, the TUI SHALL display a transient visual indicator (e.g., a status bar badge or overlay hint) showing the leader is active and awaiting a mnemonic. Pressing any unmapped key or waiting longer than 2 seconds SHALL cancel the leader-pending state. Pressing `Ctrl+C` during leader-pending SHALL cancel the leader state and NOT trigger the interrupt handler.
legacy-id: REQ-20260616-003
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1169 — Command palette binding migration.** The `Ctrl+P` binding SHALL be removed. The command palette SHALL be accessible via `Ctrl+X P` and the existing `/` (slash command autocomplete) and command palette entry points.
legacy-id: REQ-20260616-004
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1170 — Model switcher binding migration.** The `Ctrl+M` binding SHALL be removed. The model switcher SHALL be accessible via `Ctrl+X M`, the existing command palette entry, and a new `/model` slash command.
legacy-id: REQ-20260616-005
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1171 — Quit binding migration.** The `Ctrl+Q` binding SHALL be removed. Quit SHALL be accessible via `Ctrl+X Q`, the existing `q` binding (force quit), and a new `/quit` slash command.
legacy-id: REQ-20260616-006
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1172 — Stash binding migration.** The `Ctrl+S` binding SHALL be removed. Stash SHALL be accessible via `Ctrl+X S`, the existing `/stash` slash command, and the command palette entry.
legacy-id: REQ-20260616-007
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1173 — Reasoning toggle binding migration.** The `Ctrl+R` binding SHALL be removed. Toggle reasoning SHALL be accessible via `Ctrl+X R`, the existing command palette entry, and the existing reasoning toggle click-target.
legacy-id: REQ-20260616-008
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1174 — New slash commands for full IDE-safe coverage.** The following slash commands SHALL be added to the built-in registry (`create_builtin_registry()` in `tui/widgets/slash_commands.py`) so every app action has a keyboard-shortcut-free access path:
status: draft
legacy-id: REQ-20260616-009
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1175 — `/help` — Display a help overlay listing all available slash commands and leader-chord shortcuts with their descriptions.
legacy-id: REQ-20260616-009a
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1176 — `/model` — Open the runtime model selection screen (same as `action_show_runtime_models`).
legacy-id: REQ-20260616-009b
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1177 — `/quit` — Quit the application gracefully (same as `action_quit`). If a run is active, show the existing quit-confirmation flow.
legacy-id: REQ-20260616-009c
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1178 — `/clear` — Clear the current conversation transcript (with confirmation toast).
legacy-id: REQ-20260616-009d
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1179 — `/cancel` — Cancel the current generation or modal (same as `Esc`).
legacy-id: REQ-20260616-009e
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1180 — `/search` — Open a search/filter overlay for the transcript/context.
legacy-id: REQ-20260616-009f
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Low



## SWR-1181 — Leader-chord discovery via `/help`.** The `/help` slash command overlay SHALL display the full leader-chord command map, including the current configured leader key. If the leader has been changed from the default (Ctrl+X), the display SHALL reflect the configured value.
legacy-id: REQ-20260616-010
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1182 — Navigation bindings preserved.** The existing navigation keybindings SHALL remain unchanged: `ctrl+up/down/left/right` for widget focus navigation, `alt+up/down/left/right` for artifact navigation. These operate within the TUI widget tree and do not conflict with IDE-level keybindings.
legacy-id: REQ-20260616-011
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1183 — Double-Ctrl+C interrupt preserved.** The existing `DoubleCtrlCHandler` behaviour SHALL NOT be altered. `Ctrl+C` continues to serve as the emergency interrupt: first press triggers graceful shutdown, second press force-exits. `Ctrl+C` during leader-pending state SHALL cancel the leader state without triggering the interrupt handler.
legacy-id: REQ-20260616-012
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## SWR-1184 — Default leader documented in user-facing help.** All in-app help text, status prompts, and the command palette cheatsheet (per `requirements-20260526-command-palette-shortcuts.md`) SHALL reference leader-chord notation (e.g., `Ctrl+X P`) rather than single-stroke `Ctrl+` shortcuts.
trace: optional
legacy-id: REQ-20260616-013
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: Medium



## SWR-1185 — Backward compatibility — existing slash commands preserved.** All existing slash commands (`/stop`, `/pause`, `/resume`, `/new`, `/stash`, `/pop`, `/theme`, `/tools`, `/background`, `/mcp`, `/improvements`, `/compress`, `/logout`) SHALL continue to function identically. Their behaviour SHALL NOT be altered by the leader-chord migration.
legacy-id: REQ-20260616-014
date: 2026-06-16
source: docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md
priority: High



## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
