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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Prompt Stash (Git-Style Input Stack) (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-120000.md` — document status: Complete

#### Description

A new feature that allows users to stash the current prompt input onto a stack, analogous to `git stash`. The stashed input can later be restored via a pop operation. Both operations are accessible through the existing settings menu, alongside existing entries such as "Toggle Send Mode". A dedicated stash command (e.g., keyboard shortcut or button) is also provided for quick access without opening the menu.

#### Implementation Notes

**Requirements Document:**

**Resolution Items:**

#### Acceptance Criteria

**Constraints:**

### TUI - Slash Commands for Control Actions in the Input Field (2026-04-17)

Original: `docs/requirement-log/done/requirements-20260417-slash-commands.md` — document status: Done

#### Description

Implemented slash command support for TUI control actions. Users can type `/stop`, `/pause`, `/new`, `/theme`, etc. directly into the input field to trigger control actions without using the command palette or keyboard shortcuts. The autocomplete overlay, filtering, and keyboard navigation are implemented and traced by dedicated tests.

#### Implementation Notes

**Requirements Document - Slash Commands Implementation:**

**Requirement ID:** REQ-20260417-190000

**Implementation Status:**

**Completed (Core Functionality):**

**Completed Overlay Area:**

- The autocomplete overlay and its filtering/keyboard behavior exist in `src/rotaris_core/tui/widgets/slash_commands.py` and are wired from `src/rotaris_core/tui/widgets/input_composer.py`.
- Dedicated automated coverage is annotated under `REQ-20260417-190000-025..027`.

**Testing Complete:**

Test ID | Status | Count

**Files Created:**

**Core Implementation:**

- `src/rotaris_core/tui/widgets/slash_commands.py` (165 lines)

- `SlashCommand` dataclass

- `SlashCommandRegistry` class

- `create_builtin_registry()` factory function

- 9 built-in command handlers

**Modified Files:**

- `src/rotaris_core/tui/widgets/input_composer.py` (updated)

- Added `_slash_registry` initialization

- Added `_try_execute_slash_command()` method

- Updated `on_input_submitted()` to intercept slash commands

- Updated `on_key()` to handle multiline slash commands

**Tests:**

- `tests/unit/test_slash_commands.py` (23 tests)

- Registry functionality tests

- Built-in command tests

- Edge case tests

- `tests/unit/test_input_composer_slash_commands.py` (11 tests)

- InputComposer integration tests

- Command execution tests

- Error handling tests

**Snapshots Updated:**

- `tests/unit/__snapshots__/test_tui_workflows/test_snapshot_initial_app_layout.svg`

- `tests/unit/__snapshots__/test_tui_workflows/test_snapshot_after_user_message_submitted.svg`

- `tests/unit/__snapshots__/test_tui_workflows/test_snapshot_multiline_mode_active.svg`

**Unit Tests:**

- **Total:** 34 tests

- **Passed:** 34

- **Failed:** 0

- **Coverage:** 100% of slash command code

**Regression Tests:**

- **Total:** 825 tests (excluding pre-existing failure)

- **Passed:** 825

- **Failed:** 0

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Done`.

### Rotaris - TUI Input Composer Prompt History (2026-05-22)

Original: `docs/requirement-log/done/requirements-20260522-prompt-history-cycling.md` — document status: Complete

#### Description

Provide cyclic navigation through recently submitted prompt texts in the TUI prompt input composer using the Up and Down arrow keys - identical to the familiar `↑`/`↓` history navigation in POSIX shells (bash, zsh) and most REPLs. When the user presses Up in the prompt input, the most recent submitted prompt fills the field; pressing Up again walks backwards through earlier submissions. Down cycles forward toward the empty (unsent) state. This is entirely autonomous - no manual stash key required. Prompt history must also persist across app restarts for the same workspace.

**Problem being solved:**

Every TUI interaction requires retyping a previously submitted prompt if the user wants to reuse or adjust it. The existing `PromptStash` (Ctrl+S, LIFO push/pop) is a manual, opt-in mechanism - users forget to stash, and it offers no forward/backward cycling, only pop. There is zero auto-record of what was sent.

**Current behaviour:**

- `InputComposer` accepts text via a single-line `Input` widget or a `TextArea` (multiline toggle).

- On Enter/Ctrl+J, `on_input_submitted` fires `InputSubmitted` and the widget clears immediately (`_clear_submitted_text`).

- The cleared text is gone forever - no record, no history, no undo of the clearing.

- `PromptStash` (Ctrl+S) manually saves text into a persistent JSON-backed LIFO stack; popped values are prepended to the current field content. Completely decoupled from submission.

**What needs to change:**

1. The composer must keep a ring buffer of the last N submitted prompt texts (in FIFO order; oldest evicted when full).

2. In the single-line `Input` widget, pressing Up loads the previous entry into the field without modifying the ring buffer. Pressing Down advances toward the end.

3. Typing into the field (while in history walk) saves the current index as "broken" - the ring buffer is untouched until a new submission occurs.

4. New submissions append to the ring buffer regardless of the current history-navigation position.

5. Blank submissions are never recorded in the ring buffer.

6. Prompt history is restored when the TUI is reopened for the same workspace.

#### Implementation Notes

**Requirements - Prompt Input History Cycling (Arrow-Up / Arrow-Down):**

**Dependencies:**

- Depends on: `FR-6-005` (Input Composer - TUI Core, `requirements-20260413-000004-tui-core.md`)

- Blocks: Unit/UI tests for `InputComposer` in `tests/unit/tui/` and `tests/capability/`

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution `requirements-20260503-session-task-name-hygiene.md` (PromptStash manual LIFO push/pop) | Separate feature; PromptStash is opt-in, persistent, manual. History ring buffer is auto-record, in-memory, cyclic navigation. They serve overlapping user goals but differ in mental model (persistent stash vs. transient repl-like history). | Feature co-existence. PromptStash stays manual and persistent; this feature provides spontaneous hot-reload of what was just sent. No overlap in trigger - Ctrl+S vs. ↑/↓ arrows.

**Notes:**

**Assumption - Capacity 50:** The ring buffer holds the last 50 entries. This is large enough to cover a typical session, small enough to fit in memory comfortably, and avoids the psychological burden of "too much history." Configurable via model config or user setting is out of scope for this iteration. **Assumption - Workspace-local persistence:** History is stored per workspace under `.rotaris/prompt_history.json` so separate repos do not share recalled prompts. **Assumption - Cursor reset semantics:** Submitting always appends to the tail and resets the cursor to "after tail" (empty field). This mirrors bash/zsh behavior precisely. **Design note:** The existing `PromptStash` serves a different purpose - deliberate, manual recall of longer-form prompts across sessions. Up/Down history is about rapidly re-submitting or tweaking what was just sent. Both belong. Out of scope (deferred):

- Configurable ring-buffer size

- Search/filter within history

- Cross-session history

- Integration with session/task prompt recovery

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] Ten prompts are submitted sequentially; pressing Up ten times reconstructs them in reverse order from most-recent to oldest.

- [x] Pressing Up at the oldest entry (first in buffer) keeps the oldest text visible; repeated presses do not cycle endlessly or crash.

- [x] Pressing Down from the oldest entry advances through each subsequent entry until reaching empty.

- [x] Submitting a new prompt at any history position adds it to the tail and clears the history walk (field is empty thereafter).

- [x] Five blank submits followed by five real submits produces exactly five entries in the history ring buffer.

- [x] Editing the field text while on history entry 3, then pressing Up goes to entry 2 (not entry 4) - older direction is the sole navigation.

- [x] Switching multiline toggle mid-history-load transfers the loaded text to the alternate widget seamlessly.

- [x] App exits and restarts - previously submitted prompts are still available via `Up` in the same workspace.

### Rotaris - Command Palette Shortcut Cheat-Sheet Panel (2026-05-26)

Original: `docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md` — document status: Complete — implemented as `CommandPaletteCheatsheetScreen` in `tui/screens/command_palette_cheatsheet.py`.

#### Description

When the command palette is opened (via `Ctrl+X P` or `/` — see `requirements-20260616-000001-keyboard-shortcut-architecture.md`), reserve the bottom third of the screen as a static overlay panel displaying all available keyboard shortcuts. This gives users immediate visibility of every TUI key binding without needing to discover them separately or leave the command palette context.

**Problem being solved:**

Users of the Rotaris TUI have limited discoverability of keyboard shortcuts. The TUI has many key bindings (leader-chord commands like `Ctrl+X P` for command palette, `Ctrl+X M` for model picker, `Ctrl+X S` to stash, Space to cycle selections, etc. — see `requirements-20260616-000001-keyboard-shortcut-architecture.md`) documented in the README, but users must navigate away from the active screen or consult external documentation to learn them. Users working with the command palette in particular would benefit from having shortcuts visible inline at the moment of interaction.

**Current behaviour:**

- The command palette (`RotarisCommandPalette` in `tui/providers/command_palette.py`) opens as a Textual `Provider` overlay listing actionable commands

- Keyboard shortcuts are shown in the top-bar badge and described in README.md but not displayed interactively

- No overlay or panel renders keybinding reference information during any TUI session

**What needs to change:**

1. When the command palette is triggered via `Ctrl+X P` (or `/`), render a cheat-sheet overlay occupying the bottom one-third of the viewport

2. The cheat-sheet lists all currently available keyboard shortcuts with their key combination, description, and active screen/context

3. The cheat-sheet sits beneath the command palette search/query list without obscuring it (the palette retains its usual upper portion area)

4. The cheat-sheet closes automatically when the command palette closes

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: `tui/providers/command_palette.py` (RotarisCommandPalette provider)

- Depends on: `tui/app.py` (RotarisTuiApp command palette trigger logic)

- Depends on: `requirements-20260616-000001-keyboard-shortcut-architecture.md` (leader-chord system; defines `Ctrl+X P` as the command palette trigger and `Ctrl+X ?`/`/help` as the global help overlay)

- Related: `docs/requirement-log/partial/requirements-20260413-000004-tui-core.md` (TUI foundation requirements)

**Resolved Conflicts:**

No conflicts identified with existing requirements.

**Notes:**

- **Implementation approach:** This likely involves wrapping the Textual `Provider` overlay in a custom `ModalScreen` subclass rather than using `Provider` directly, since `Provider` overlays do not natively support split-layout panels. Alternatively, the command palette could be replaced or extended with a custom `Overlay` layout hosting both the searchable command list and the static cheat-sheet footer.

- **Innovation suggestion:** Consider making the cheat-sheet accessible globally (outside the command palette) via a dedicated key binding like `Ctrl+X ?` or the `/help` slash command, allowing users to reference shortcuts anytime without triggering a command search. (See `requirements-20260616-000001-keyboard-shortcut-architecture.md` REQ-20260616-009a and REQ-20260616-010.)

- **Scope boundary:** This requirement covers display only - it does not add new keyboard shortcuts itself, though the cheat-sheet should surface any shortcuts added by future enhancements (e.g. Settings panel shortcut).

- **Third-of-screen specification:** The bottom panel occupies approximately 33% of the terminal height; the remaining ~66% accommodates the command palette search input and filtered results.

#### Acceptance Criteria

**Acceptance Criteria:**

- [ ] Triggering `Ctrl+X P` (or `/`) opens the command palette with the cheat-sheet panel rendered in the bottom third of the screen

- [ ] The cheat-sheet lists every keyboard shortcut mapped in the current screen, formatted as `{key combo} - {description}`

- [ ] The command palette search list renders above the cheat-sheet without overlap or clipping

- [ ] Closing the command palette via Esc removes the cheat-sheet panel entirely

- [ ] Navigating the cheat-sheet entries with arrow keys is possible without leaving the command palette context

- [ ] The cheat-sheet adapts when switching screens (e.g. MainScreen vs SessionPicker) to reflect only applicable shortcuts

- [ ] Resizing the terminal does not clip or distort the cheat-sheet panel proportions

### Keyboard Shortcut Architecture: Leader-Prefix Chord System (2026-06-16)

Original: `docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md` — document status: Complete — all features including transcript search and command palette cheatsheet are now implemented.

#### Summary

Redesign the Rotaris TUI keyboard shortcut architecture to avoid collisions with IDE and integrated-terminal default keybindings. Replace all single-stroke `Ctrl+<letter>` app-command shortcuts with a configurable leader-prefix chord system (default `Ctrl+X`). Keep slash commands as the guaranteed IDE/terminal-safe fallback for every action. This eliminates conflicts with VS Code (`Ctrl+P`, `Ctrl+S`, `Ctrl+Q`, `Ctrl+K`, `Ctrl+Shift+P`), JetBrains IDEs, Visual Studio, GNU Readline, and Windows Terminal without requiring users to remap their IDE keybindings.

---

#### Context

### Problem being solved

The Rotaris TUI currently uses single-stroke `Ctrl+<letter>` shortcuts for core app commands:

- `Ctrl+P` → command palette (collides with VS Code Quick Open, JetBrains Parameter Info, Visual Studio Print, Readline previous-history)
- `Ctrl+M` → model switcher (risky in terminal contexts; VS Code uses `Ctrl+M` for Tab/indent toggle)
- `Ctrl+S` → stash input (collides with Save in VS Code/IDEs)
- `Ctrl+Q` → quit (collides with Close Editor in VS Code on Linux, and `Ctrl+W`/`Ctrl+Q` patterns in JetBrains)
- `Ctrl+R` → toggle reasoning (VS Code uses `Ctrl+R` for Open Recent)

When the app runs inside a VS Code integrated terminal, JetBrains terminal, or any terminal with Readline keybindings active, the IDE/terminal captures these keystrokes before the app sees them. Users must either remap their IDE keybindings (unreasonable expectation) or abandon keyboard shortcuts entirely and use slash commands or the mouse. This degrades the keyboard-first experience mandated by FR-6-006.

### Current behaviour

- `RotarisTuiApp.BINDINGS` in `src/rotaris_core/tui/app.py` defines 7 `Ctrl+<letter>` bindings and 8 navigation bindings:
  - **App commands (problematic):** `ctrl+p`, `ctrl+m`, `ctrl+r`, `ctrl+s`, `ctrl+q`, `q`
  - **Navigation (low collision risk):** `ctrl+up/down/left/right`, `alt+up/down/left/right`
- Slash commands (`/stop`, `/pause`, `/new`, `/stash`, `/pop`, `/theme`, `/tools`, `/background`, `/mcp`, `/improvements`, `/compress`, `/logout`, `/resume`) work inside the input composer and are IDE/terminal-safe
- `Ctrl+C` is handled specially via `DoubleCtrlCHandler` — first press triggers graceful shutdown, second press force-exits
- No leader-prefix or chord mechanism exists
- The leader key is not configurable

### What needs to change

1. Replace all single-stroke `Ctrl+<letter>` app-command bindings with `Ctrl+X <mnemonic>` chord sequences
2. Add a configurable leader key (default `Ctrl+X`) so Emacs users can choose a non-conflicting alternative
3. Add new slash commands so every app action is accessible without ANY keyboard shortcut
4. Keep navigation bindings (`ctrl+arrows`, `alt+arrows`) unchanged — these control internal widget focus and have negligible IDE collision risk
5. Keep `DoubleCtrlCHandler` behaviour unchanged — `Ctrl+C` remains the emergency interrupt
6. Update the command palette cheatsheet (see `requirements-20260526-command-palette-shortcuts.md`) to reflect the new bindings
7. Update all in-app shortcut references (help text, toasts, `main.py` status prompts) to show the new bindings

---

#### Acceptance Criteria

- [ ] Pressing `Ctrl+X` enters leader-pending state with a visible indicator; pressing `P` within 2 seconds opens the command palette
- [ ] Pressing `Ctrl+X` followed by an unmapped key (e.g., `Z`) cancels the leader state with no side effects
- [ ] Pressing `Ctrl+X` and waiting 2 seconds cancels the leader state automatically
- [ ] Configuring `tui.keyboard.leader: "Ctrl+G"` in `agents.yaml` changes the leader to `Ctrl+G`; all chord commands work with the new leader
- [ ] Setting an invalid leader value (e.g., `"F12"`) falls back to `Ctrl+X` with a warning toast on startup
- [ ] Typing `/help` in the input composer displays an overlay showing all slash commands and leader-chord bindings
- [ ] Typing `/model` in the input composer opens the model selection screen
- [ ] Typing `/quit` in the input composer initiates graceful quit (with run-active confirmation if applicable)
- [ ] Typing `/clear` in the input composer clears the transcript (after confirmation)
- [ ] Typing `/cancel` in the input composer cancels any active modal or generation
- [ ] `Ctrl+P`, `Ctrl+M`, `Ctrl+S`, `Ctrl+Q`, `Ctrl+R` are NOT captured by the app — they pass through to the host terminal/IDE
- [ ] Existing slash commands (`/stop`, `/pause`, `/new`, `/stash`, `/pop`, `/theme`, `/tools`, `/background`, `/compress`, etc.) function identically to before the migration
- [ ] `Ctrl+up/down/left/right` and `Alt+up/down/left/right` continue to navigate widget focus and artifacts respectively
- [ ] `Ctrl+C` once during an active run triggers graceful shutdown; `Ctrl+C` twice force-exits (existing behaviour preserved)
- [ ] `Ctrl+C` during leader-pending state cancels the leader state without triggering interrupt
- [ ] The command palette cheatsheet (when implemented per `requirements-20260526-command-palette-shortcuts.md`) displays leader-chord notation matching the configured leader
- [ ] All in-app shortcut references (main screen status text, toast messages, meta-bar badges) use leader-chord notation

---

#### Dependencies

- Depends on: `requirements-20260417-slash-commands.md` (slash command infrastructure)
- Depends on: `requirements-20260526-command-palette-shortcuts.md` (command palette cheatsheet display)
- Depends on: `requirements-20260413-000004-tui-core.md` FR-6-006 (keyboard-first), FR-6-007, FR-6-008 (existing `Ctrl+M` / `Ctrl+P` bindings)
- Depends on: `requirements-20260414-120000.md` (stash shortcut `Ctrl+S`)
- Blocks: Any future keybinding additions — they must use leader-chord notation

---

#### Resolved Conflicts

| Prior Requirement                                                          | Conflict                                                                                                 | Resolution                                                                                                                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FR-6-007` in `requirements-20260413-000004-tui-core.md`                   | Defines `Ctrl+M` as the model selection shortcut.                                                        | Superseded. `Ctrl+M` is freed; model selection moves to `Ctrl+X M` and `/model`.                                                                    |
| `FR-6-008` in `requirements-20260413-000004-tui-core.md`                   | Defines `Ctrl+P` as the command palette shortcut.                                                        | Superseded. `Ctrl+P` is freed; command palette moves to `Ctrl+X P` and `/`.                                                                         |
| `REQ-20260414-120000-010` / `REQ-001` in `requirements-20260414-120000.md` | Defines `Ctrl+S` as the stash input shortcut.                                                            | Superseded. `Ctrl+S` is freed; stash moves to `Ctrl+X S` and `/stash`.                                                                              |
| `requirements-20260526-command-palette-shortcuts.md`                       | References `Ctrl+P` for command palette trigger and `Ctrl+Shift+H` for a hypothetical global cheatsheet. | Amended. Cheatsheet trigger description should reference `Ctrl+X P` (or `/help`) instead. The cheatsheet itself must display leader-chord notation. |

---

#### Implementation Notes

- Implemented app-level leader capture in `src/rotaris_core/tui/app.py` using `on_key`, a 2-second pending timeout, and modal overlays from `src/rotaris_core/tui/screens/modals.py`.
- Added `tui.keyboard.leader` configuration support in `src/rotaris_core/config/schema.py` with loader merge support in `src/rotaris_core/config/loader.py`. Invalid values normalize back to `Ctrl+X` and emit a startup warning.
- Added shared leader-chord formatting helpers in `src/rotaris_core/tui/shortcuts.py` and migrated shortcut text in the input composer, settings screens, artifact warnings, and main-screen prompts.
- Added `/help`, `/model`, `/quit`, `/clear`, `/cancel`, and `/search` to `src/rotaris_core/tui/widgets/slash_commands.py`.
- `/search` was implemented as a full-featured `TranscriptSearchScreen` in `src/rotaris_core/tui/screens/transcript_search.py` with substring filtering and proportional scroll-to-event navigation. `Ctrl+X /` was added as the leader-chord shortcut.
- The command-palette cheatsheet was implemented as `CommandPaletteCheatsheetScreen` in `src/rotaris_core/tui/screens/command_palette_cheatsheet.py`, replacing Textual's built-in command palette. It displays a searchable command list in the upper two-thirds and a static shortcut cheatsheet in the bottom third.
- All shortcut references use leader-chord notation with the configured leader key. REQ-20260616-013, REQ-20260616-009, and REQ-20260616-009f are now Complete.

---

#### Notes

**Assumption — Leader default `Ctrl+X`:** Chosen because it is widely available (not captured by VS Code, JetBrains, or Readline at the terminal level) and is already a well-known prefix key convention (Emacs). The user's research confirms this is the least-colliding option.

**Assumption — Emacs users will reconfigure:** The leader is configurable (`tui.keyboard.leader`). Emacs users who already use `Ctrl+X` as their major-mode prefix should set the leader to `Ctrl+G` or `Esc`. A startup warning toast is NOT shown for the default `Ctrl+X` leader (that would be noisy for non-Emacs users), but the `/help` overlay and documentation SHALL mention configurability.

**Decision — `Ctrl+X S` maps to stash, not save/export:** The user's original proposal maps `Ctrl+X S` to "save/export transcript." The current app has no "save transcript to file" feature — the only `Ctrl+S` action is stash input. Stash semantically means "save this input for later," so the `S` mnemonic is defensible. If a true transcript-export feature is added later, it should use a different mnemonic (e.g., `Ctrl+X E` for export) or become the primary `Ctrl+X S` action with stash moving to another letter. This is recorded for future reference.

**Decision — Navigation bindings unchanged:** `Ctrl+up/down/left/right` and `Alt+up/down/left/right` navigate widget focus and artifacts. These operate within the Textual widget tree and have negligible collision risk with IDE-level keybindings. The user's analysis did not flag these as problematic.

**Decision — `/search` is Low priority:** Transcript search is a new capability. The user's proposal includes `Ctrl+X /` for search and `/search` as the slash fallback. This requirement documents the intent, but the feature is Low priority because the existing command palette and artifact navigation already provide transcript navigation.

**Decision — No `Ctrl+X O` (open/load context):** The user's proposed map includes `Ctrl+X O` for "open/load context." The current app has no "open file" dialog — context is the workspace directory. This is deferred until a concrete open/load feature exists.

**Decision — No `Ctrl+X L` (logs) or `Ctrl+X B` (sidebar):** The current TUI has a fixed 3-pane layout with no toggleable logs panel or sidebar. These are deferred until the UI has these panels.

**Decision — No `Ctrl+X I` (inspect/details):** The current TUI shows agent details inline in the status pane. A dedicated "inspect" overlay would be a new feature and is deferred.

**Decision — No `Ctrl+X [` / `Ctrl+X ]` (previous/next message):** Message-level navigation through the transcript is a new feature. The existing `ctrl+up/down` navigates widget focus, not messages. Deferred until transcript message navigation is implemented.

**Decision — No `Ctrl+X Y` (copy selected response):** Copy-to-clipboard in a terminal TUI is inherently limited (terminals own copy/paste). The user's own analysis notes "Let host terminal/editor paste handle it." This is deferred.

**Decision — `Esc` already works as cancel:** The `Esc` key is not bound by `RotarisTuiApp.BINDINGS` as a single action, but Textual's default behaviour and existing modal screens use `Esc` to dismiss. No change is needed. The `/cancel` slash command provides the keyboard-free fallback.

**Innovation suggestion:** Consider implementing the leader-pending state as a Textual `Screen`-level key capture using `on_key` rather than `BINDINGS`, since `BINDINGS` in Textual are per-widget and leader chords span the entire app. This avoids duplicating leader-handling logic across screens and widgets. The leader-pending indicator could be a small `Footer`-style widget that auto-hides after the timeout.

**Scope boundary:** This requirement covers keyboard shortcut architecture only. It does NOT add new features (transcript search, file open, logs panel, sidebar, message navigation, clipboard copy). Those features are noted for future reference but have no requirements here.

**Out of scope for this iteration:**

- Configurable individual chord mappings (beyond the leader key itself)
- Per-screen leader-chord overrides
- Leader-chord recording/playback macros
- Visual keybinding editor (GUI for remapping)
- Windows `Win+` modifier support (Microsoft Learn notes OS-reserved Win+ combinations may never reach the terminal)
