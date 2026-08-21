# Rotaris — UI Style Guide

> **Purpose:** Single source of truth for all TUI visual decisions, component patterns,
> and UX rules. Every TUI change must comply with this guide. When a new widget or screen
> is added, its visual contract must be documented here.
>
> **Status:** Active — maintains visual consistency across chat, composer, right rail,
> command palette, modal screens, and notifications.
>
> **Related:** The [Rotaris Design System](https://claude.ai/design/p/13d7ad0d-cb06-4e6e-b6ec-06f25615a7d7?via=share)
> covers the visual design system for the Rotaris desktop app (PySide6).
> This style guide covers the Textual TUI only.
>
> **Last updated:** 2026-06-09

---

## 1. Design Principles

These principles are the foundation. Every visual decision traces back to at least one.

| #   | Principle                    | Requirement                | Meaning                                                                                                                                         |
| --- | ---------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Keyboard-first**           | FR-6-006                   | Every interaction reachable without a mouse. Mouse is a convenience, not a requirement. Every clickable element must also have a keyboard path. |
| P2  | **Not color-only**           | FR-6-015                   | Status is always communicated by icon/text + color. Never rely on color alone to convey meaning.                                                |
| P3  | **Terminal-agnostic**        | FR-6-014                   | Legible on light and dark terminal backgrounds. Use semantic theme variables; never assume a dark background.                                   |
| P4  | **Semantic theming**         | REQ-20260503-STYLE-001     | Colors chosen by semantic role (e.g. "success", "muted chrome"), never by widget name.                                                          |
| P5  | **Visual continuity**        | REQ-20260503-STYLE-NF-001  | Chat, composer, right rail, command palette, modals, toasts — all share the same theme layer.                                                   |
| P6  | **Reactive-first**           | TEXTUAL_PATTERNS.md Rule 1 | Orchestration sets reactive attributes. Widgets self-render. Never manipulate widgets directly from outside.                                    |
| P7  | **Progressive disclosure**   | REQ-20260511-006..011      | Show detail on demand. Default views are compact; drill-down reveals more.                                                                      |
| P8  | **State distinguishability** | REQ-20260503-STYLE-NF-002  | Every important state (running, waiting, succeeded, failed, etc.) must be visually distinct in every built-in theme.                            |
| P9  | **Incremental rendering**    | RenderState                | Only rebuild what changed. Use `RenderState` caching; avoid full transcript rebuilds on every sync tick.                                        |
| P10 | **Accessible**               | —                          | Textual's built-in a11y (screen readers, high-contrast, monochrome modes) must not be broken by custom rendering.                               |

---

## 2. Visual Hierarchy (5 Layers)

```
┌──────────────────────────────────────────────────┐
│ Layer 1 — Background        $theme-bg            │  darkest / most neutral
│   ┌────────────────────────────────────────────┐ │
│   │ Layer 2 — Chrome          $theme-fg-muted   │ │  borders, panel titles, metadata
│   │   ┌──────────────────────────────────────┐ │ │
│   │   │ Layer 3 — Content      $theme-fg      │ │ │  primary text, user messages
│   │   │   ┌────────────────────────────────┐ │ │ │
│   │   │   │ Layer 4 — Accent   semantic     │ │ │ │  status colors, brand highlights
│   │   │   │   ┌──────────────────────────┐ │ │ │ │
│   │   │   │   │ Layer 5 — Focus  border-  │ │ │ │ │  active selection, input focus
│   │   │   │   │               focus       │ │ │ │ │
│   │   │   │   └──────────────────────────┘ │ │ │ │
│   │   │   └────────────────────────────────┘ │ │ │
│   │   └──────────────────────────────────────┘ │ │
│   └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**Layer rule:** Each layer must be visually distinguishable from adjacent layers in every theme.
The default baseline (REQ-20260511-004) enforces: black bg → light-gray chrome → white content.

---

## 3. Theme Token Catalog

All colors flow through `Theme` dataclass → `$theme-*` CSS variables. Never hardcode a color.

### 3.1 Background Tokens

| CSS Variable              | Role                                | Used In                                                                                                  |
| ------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `$theme-bg`               | Primary application background      | `Screen`, `RotarisTuiApp`, all panels, all widgets                                                           |
| `$theme-bg-overlay`       | Modal/screen dim overlay            | `SessionPickerScreen`, `ProviderSettingsScreen`, `CompressionSettingsScreen`, `ToolResultSettingsScreen` |
| `$theme-bg-selection`     | Selected/highlighted row background | `DataTable > .datatable--cursor`, `DataTable > .datatable--fixed-cursor`                                 |
| `$theme-bg-toast-warning` | Warning toast background            | `Toast.-warning`                                                                                         |
| `$theme-bg-toast-error`   | Error toast background              | `Toast.-error`                                                                                           |

### 3.2 Foreground Tokens

| CSS Variable       | Role                                                    | Used In                                                                                    |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `$theme-fg`        | Primary content text — highest contrast                 | Chat messages, input text, labels, DataTable content                                       |
| `$theme-fg-muted`  | Secondary chrome text — borders, panel titles, metadata | Composer meta bar, `FooterDescription`, panel border titles, `#composer-meta-*`            |
| `$theme-fg-dim`    | Tertiary muted hints — dimmed but readable              | Status bar, settings hints, empty-state text, `#top-bar-focus` (neutral)                   |
| `$theme-fg-subtle` | Subtle chrome accents — between muted and dim           | Section titles inside panels (`.tool-settings-section`, `.compression-settings-row Label`) |

### 3.3 Border Tokens

| CSS Variable           | Role                            | Used In                                                                                                             |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `$theme-border`        | Default panel border            | All bordered widgets, `Header`, `Footer`, `#chat-panel`, `#agent-status`, `#info-pane`, `#todo-pane`, `#right-pane` |
| `$theme-border-input`  | Input field border (unfocused)  | `Input`, `TextArea`                                                                                                 |
| `$theme-border-focus`  | Focused element border          | `:focus` states, modal container borders, `CommandPalette`                                                          |
| `$theme-border-active` | Active/running indicator border | Active agent indicators, running state borders                                                                      |

### 3.4 Semantic Accent Tokens

| CSS Variable          | Semantic Role                  | States / Contexts                                                                   |
| --------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| `$theme-green`        | Success, active, running       | Running agent state, git branch in status bar, todo border (active), success badges |
| `$theme-blue`         | Info, completed, header chrome | Succeeded agent state, header titles, `Header` color, panel chrome accents          |
| `$theme-blue-light`   | Lighter blue for highlights    | Header icons, version display, `ProviderSettingsScreen` title                       |
| `$theme-yellow`       | Warning, waiting, attention    | Waiting agent state, warning toasts, discard dialog border                          |
| `$theme-yellow-vivid` | High-urgency warning           | Toast.-warning text, quota-wait title                                               |
| `$theme-red`          | Error, failure                 | Failed agent state, error badges                                                    |
| `$theme-red-vivid`    | High-urgency error             | Toast.-error text/border                                                            |
| `$theme-cyan`         | Summarizing, user label        | User message label, summarizing animation                                           |
| `$theme-purple`       | Cancelled, blocked, terminated | Cancelled/blocked agent states                                                      |
| `$theme-footer-key`   | Footer keybinding labels       | `FooterKey` widget                                                                  |

### 3.5 Rich Render Palette

For Rich-rendered content (chat messages, agent rows, todo items), use `RenderPalette.from_theme(get_theme())`:

| Palette Field                       | Maps To                    | Used For                    |
| ----------------------------------- | -------------------------- | --------------------------- |
| `fg`                                | `theme.fg`                 | Primary text                |
| `fg_dim`                            | `theme.fg_dim`             | Dim hints                   |
| `fg_muted`                          | `theme.fg_muted`           | Muted secondary text        |
| `fg_subtle`                         | `theme.fg_subtle`          | Subtle accents              |
| `user_label`                        | `bold $theme-cyan`         | "user" prefix in chat       |
| `agent_label`                       | `bold $theme-green`        | "ai" prefix in chat         |
| `persona_label`                     | `bold $theme-blue`         | Persona name in chat header |
| `system_label`                      | `bold $theme-fg_dim`       | "sys" prefix                |
| `auth_label`                        | `bold $theme-yellow`       | "auth" prefix               |
| `green/blue/cyan/yellow/red/purple` | Corresponding theme fields | Status coloring             |
| `border`                            | `theme.border`             | Panel borders               |
| `border_active`                     | `theme.border_active`      | Active state borders        |

---

## 4. Component Catalog

Every reusable TUI component. When building a new feature, prefer composing from these over
creating new widgets.

### 4.1 ChatPanel

- **File:** `tui/widgets/chat_panel.py`
- **Class:** `ChatPanel(RichLog)`
- **Purpose:** Primary transcript panel — renders Markdown, code blocks, diffs, agent output, inline report artifacts.
- **CSS ID:** `#chat-panel`
- **Key behaviors:**
  - Auto-scrolls to bottom on new messages (when scrolled near bottom).
  - When user scrolls up, new messages do NOT force scroll — a visual indicator appears.
  - Clickable URLs (opens browser via `webbrowser` with `xdg-open`/`gio` fallback).
  - Renders `ChildReportArtifact` inline with agent attribution.
  - Supports mouse-wheel scroll and keyboard navigation.
- **Reactive contract:** Content is written via `write()` (inherited from `RichLog`).
- **Theme usage:** `$theme-bg`, `$theme-fg`, `$theme-border`, `$theme-border-focus` (CSS). `RenderPalette` for Rich-rendered message labels.
- **Accessibility:** Markdown rendered as Rich renderables; Textual handles screen-reader integration.

### 4.2 AgentStatusPane

- **File:** `tui/widgets/agent_status.py`
- **Class:** `AgentStatusPane(VerticalScroll)`
- **Purpose:** Shows each active/completed agent's name, persona, state, dependency state, last activity time. Supports keyboard navigation (arrow keys) through the logical agent list.
- **CSS ID:** `#agent-status`
- **Border title:** `" agents "` / subtitle: state-dependent
- **Key behaviors:**
  - Renders agent rows with state chips, activity icons, elapsed time, tool-call counts.
  - Summarizing children: braille spinner + cyan "Summarizing response" text (FR-6-003).
  - Waiting parents: `◴◷◶◵` spinner animation.
  - Collapsed presentation (max 5 visible rows, ellipsis for hidden ranges — REQ-20260511-006..011).
  - Arrow-key traversal through logical agent history (not limited to visible rows).
  - Newest-first ordering.
- **Animation frames:**
  - `BRAILLE_FRAMES` (`"⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"`) — active execution
  - `_WAITING_FRAMES` (`["◴", "◷", "◶", "◵"]`) — dependency waiting
  - `_ANIMATION_FRAMES` (`[".", "..", "...", ".."]`) — thinking states
- **Reactive contract:** External code calls `update_agents(agents, activity_events)` and sets `focused_agent_id`.
- **Theme usage:** `$theme-border`, `$theme-bg` (CSS). `RenderPalette` for Rich-rendered rows.
- **Accessibility:** State chips include text labels alongside color (FR-6-015).

### 4.3 InputComposer

- **File:** `tui/widgets/input_composer.py`
- **Class:** `InputComposer(Vertical)`
- **Purpose:** Persistent input area at the bottom of the main screen.
- **CSS ID:** `#input-composer`
- **Key behaviors:**
  - Supports single-line (`Input`) and multi-line (`TextArea`) entry, toggled with `Ctrl+E`.
  - **Meta bar** (`#composer-meta`) above the input shows:
    - Status indicator (idle/running)
    - Multiline toggle shortcut (`Ctrl+E`)
    - Current model name + swap shortcut (`Ctrl+M`)
    - Run timer (REQ-20260511-001..003)
    - Settings shortcut (`Ctrl+P`)
    - Stash shortcut (`Ctrl+S`)
  - Slash-command overlay for `/theme`, `/model`, `/compress`, etc.
  - Prompt history navigation (up/down arrow in single-line mode).
- **Reactive contract:** `InputComposer.ChangeModel`, `InputComposer.ToggleMultiline`, `InputComposer.OpenSettings` messages.
- **Theme usage:** `$theme-bg`, `$theme-border`, `$theme-border-focus`, `$theme-fg-muted` (CSS).
- **Accessibility:** Keyboard-only; all meta bar shortcuts are clickable (mouse) or key-binding (keyboard).

### 4.4 InfoPane

- **File:** `tui/widgets/info_pane.py`
- **Class:** `InfoPane(VerticalScroll)`
- **Purpose:** Right-rail panel showing focused agent metadata.
- **CSS ID:** `#info-pane`
- **Border title:** `" info "`
- **Displays:**
  - Token usage estimate (cumulative + per-agent)
  - Context window tokens (live size driving compression decisions)
  - Tool call counts (per-agent)
  - Compression counts
  - Active MCP servers (name + availability status)
  - Active tools (with "used" vs "unused" distinction)
  - Warnings (context near threshold, tool errors, agent terminations)
  - Active workspace path
  - Current model
  - Open todos summary
  - Artifacts produced/received
- **Reactive contract:** `update_info(**kwargs)` with typed keyword fields.
- **Theme usage:** `$theme-border`, `$theme-bg` (CSS). `RenderPalette` for Rich-rendered content.
- **Accessibility:** All numeric values have labels; warnings use `$theme-yellow` text.

### 4.5 TodoPane

- **File:** `tui/widgets/todo_pane.py`
- **Class:** `TodoPane(VerticalScroll)`
- **Purpose:** Right-rail panel showing the current anchored phase/task list.
- **CSS ID:** `#todo-pane`
- **Border title:** `" todo "` / subtitle: source (`"agent"` or `"plan"`)
- **Key behaviors:**
  - Renders `TodoList` with checkboxes (completed/in-progress/pending).
  - Active todo list gets green border; empty list gets default border.
  - Markdown checkbox rendering in chat content.
- **Reactive contract:** `update_todos(todo: TodoList, *, source: str = "agent")`.
- **Theme usage:** `$theme-border`, `$theme-bg` (CSS). `RenderPalette` for Rich-rendered items.
- **Accessibility:** Checkbox states use `[x]` / `[ ]` / `[~]` text markers, not color alone.

### 4.6 TopBar

- **File:** `tui/widgets/top_bar.py`
- **Class:** `TopBar(Horizontal)`
- **Purpose:** Top bar spanning the full width above the main grid.
- **CSS ID:** `#top-bar`
- **Contains:**
  - `#top-bar-title` — app title (left)
  - `#top-bar-focus` — focused agent badge (center) with state-based color class
  - `#top-bar-version` — version display (right)
- **Focused agent badge states (CSS classes):**
  - `.-none` — no agent selected (neutral)
  - `.-running` — `$theme-green` + bold
  - `.-waiting` — `$theme-yellow` + bold
  - `.-succeeded` — `$theme-blue` + bold
  - `.-failed` — `$theme-red` + bold
  - `.-cancelled` — `$theme-purple` + bold
- **Reactive contract:** `update_focus_badge(badge: FocusedAgentBadge | None)`.
- **Theme usage:** `$theme-bg`, `$theme-blue`, `$theme-border` (CSS).
- **Accessibility:** Badge includes text label + elapsed time; color is supplementary.

### 4.7 StatusBar

- **File:** `tui/widgets/status_bar.py`
- **Class:** `StatusBar(Horizontal)`
- **Purpose:** Bottom bar showing workspace path and git branch.
- **CSS ID:** `#status-bar`
- **Contains:**
  - `#status-bar-path` — workspace path (home-collapsed with `~`, middle-truncated)
  - `#status-bar-sep` — separator
  - `#status-bar-branch` — git branch name (green, bold)
- **Key behaviors:** Polls git branch every 10s with 1s timeout; path updates reactively.
- **Reactive contract:** `update_workspace(path: Path)`.
- **Theme usage:** `$theme-bg`, `$theme-fg-dim`, `$theme-fg-subtle`, `$theme-green`, `$theme-border` (CSS).

### 4.8 SpinnerWidget

- **File:** `tui/widgets/spinner.py`
- **Class:** `SpinnerWidget(Static)`
- **Purpose:** Inline braille spinner with "running" label, shown during agent execution.
- **CSS ID:** `#spinner`
- **Animation:** Braille frames at 10 Hz, gated by `_active` flag (idle = no refresh).
- **Reactive contract:** `set_active(active: bool)`.
- **Theme usage:** `$theme-bg`, `$theme-fg-dim` (CSS). Green spinner via `theme.green`.
- **Accessibility:** Always paired with "running" text label.

### 4.9 ReportViewer & ArtifactEditor

- **Files:** `tui/widgets/report_viewer.py`, `tui/widgets/artifact_editor.py`
- **Purpose:** Inline rendering of structured child report artifacts (`ReportViewer`) and editable artifact views (`ArtifactEditor`) with a discard-confirmation dialog.
- **CSS IDs:** `#artifact-editor`, `#discard-artifact-edits-dialog`
- **Key behaviors:**
  - `ReportViewer` renders artifacts inline in the transcript.
  - `ArtifactEditor` provides editable view with discard dialog.
  - Discard dialog: yellow border, bold title, confirmation prompt.
- **Theme usage:** `$theme-bg`, `$theme-fg`, `$theme-border`, `$theme-border-focus`, `$theme-yellow` (CSS).

### 4.10 Command Palette

- **File:** `tui/palette.py`, `tui/providers/command_palette.py`
- **Purpose:** `Ctrl+P` fuzzy-search command palette.
- **Minimum entries:**
  - Stop current run
  - New session
  - Continue session
  - Switch active transcript/agent view
  - Toggle tool event visibility
  - Toggle reasoning-summary visibility
  - Model-selection screen
  - Send session to background mode
  - Theme switching (`/theme <name>`)
- **Theme usage:** `$theme-bg`, `$theme-fg`, `$theme-border-focus` (CSS).

### 4.11 Toast Notifications

- **Classes:** `Toast.-information`, `Toast.-warning`, `Toast.-error`
- **Purpose:** User-facing error/warning/info messages surfaced via `self.notify()`.
- **Variants:**
  - `-information`: `$theme-blue-light` border, default bg/fg.
  - `-warning`: `$theme-bg-toast-warning` bg, `$theme-yellow-vivid` border + text.
  - `-error`: `$theme-bg-toast-error` bg, `$theme-red-vivid` border + text.
- **Usage rule:** Use `severity="error"` for unrecoverable issues, `"warning"` for recoverable, `"information"` for neutral.
- **Accessibility:** Toasts use text + border color; never color-alone.

### 4.12 DataTable (Session Picker)

- **File:** `tui/screens/session_picker.py`
- **CSS ID:** `#session-table`
- **Purpose:** Sortable, scrollable table for session selection.
- **Theme usage:** `$theme-bg`, `$theme-fg`, `$theme-bg-selection`, `$theme-footer-key` (header).
- **Accessibility:** Zebra-stripe-like cursor highlight; keyboard navigable.

### 4.13 Modal Screens

All modal screens share this visual contract:

| Screen               | File                              | Container CSS ID                  | Border                      |
| -------------------- | --------------------------------- | --------------------------------- | --------------------------- |
| Session Picker       | `screens/session_picker.py`       | `#session-picker-container`       | `heavy $theme-border-focus` |
| Provider Settings    | `screens/provider_settings.py`    | `#provider-settings-container`    | `solid $theme-border-focus` |
| Compression Settings | `screens/compression_settings.py` | `#compression-settings-container` | `heavy $theme-border-focus` |
| Tool Result Settings | `screens/tool_result_settings.py` | `#tool-result-settings-container` | `heavy $theme-border-focus` |
| Startup Models       | `screens/startup_models.py`       | `#startup-models-container`       | `heavy $theme-border-focus` |
| Runtime Models       | `screens/runtime_models.py`       | `#runtime-models-container`       | `heavy $theme-border-focus` |
| MCP Servers          | `screens/mcp_servers.py`          | —                                 | —                           |
| Quota Wait Dialog    | `screens/modals.py`               | `#quota-wait-dialog`              | `heavy $theme-border-focus` |

**Shared patterns:**

- Background: `$theme-bg-overlay` (dims the main screen).
- Container: centered (`align: center middle`), `$theme-bg`, bordered.
- Title: bold, colored with `$theme-blue-light` or `$theme-yellow-vivid` (for warnings).
- Hint text: `$theme-fg-dim`.
- All keyboard-navigable; `Escape` dismisses.

---

## 5. Status & State Conventions

Every agent state must be communicated by **icon/animation + color + text label** (FR-6-015).
The table below is definitive.

| State                     | Icon / Animation                            | Color (CSS var) | Label Text    | CSS Class (TopBar) | Notes                                                   |
| ------------------------- | ------------------------------------------- | --------------- | ------------- | ------------------ | ------------------------------------------------------- |
| `queued`                  | `◴` (waiting spinner)                       | `$theme-yellow` | "queued"      | `.-waiting`        | Agent spawned but not yet running                       |
| `running`                 | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (braille, 10 Hz)               | `$theme-green`  | "running"     | `.-running`        | Active execution                                        |
| `summarizing`             | `⠋⠙⠹...` (braille) + "Summarizing response" | `$theme-cyan`   | "summarizing" | `.-running`        | Summary agent active; must be visible in TUI (FR-6-003) |
| `waiting_on_dependencies` | `◴◷◶◵` (cycle, 2 Hz)                        | `$theme-yellow` | "waiting"     | `.-waiting`        | Blocked on unfinished parent/sibling                    |
| `succeeded`               | `✓` (check)                                 | `$theme-blue`   | "succeeded"   | `.-succeeded`      | Terminal — task completed                               |
| `failed`                  | `✗` (cross)                                 | `$theme-red`    | "failed"      | `.-failed`         | Terminal — task errored                                 |
| `cancelled`               | `⊘`                                         | `$theme-purple` | "cancelled"   | `.-cancelled`      | Terminal — user interrupted                             |
| `blocked`                 | `⊘`                                         | `$theme-purple` | "blocked"     | `.-cancelled`      | Terminal — dependency cycle or config error             |

**Implementation notes:**

- State transitions must call `record.transition(new_state)` — never set `record.state` directly.
- The `SUMMARIZING` state must yield to the TUI event loop before the summary agent blocks (see Phase 4 gap).
- State chips in `AgentStatusPane` must include both the icon and the text label in the Rich renderable.

---

## 6. Animation & Loading Standards

All animations defined in ONE place and imported by widgets. Do not duplicate frame sequences.

### 6.1 Frame Sources

| Animation          | Source                                               | Frames                     | Rate  | Widgets                                                   |
| ------------------ | ---------------------------------------------------- | -------------------------- | ----- | --------------------------------------------------------- |
| Braille spinner    | `palette.py::BRAILLE_FRAMES` / `spinner.py::_FRAMES` | `"⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"`             | 10 Hz | `SpinnerWidget`, `AgentStatusPane` (running), `ChatPanel` |
| Waiting spinner    | `AgentStatusPane._WAITING_FRAMES`                    | `["◴", "◷", "◶", "◵"]`     | 2 Hz  | `AgentStatusPane` (waiting)                               |
| Dots animation     | `AgentStatusPane._ANIMATION_FRAMES`                  | `[".", "..", "...", ".."]` | 2 Hz  | `AgentStatusPane` (thinking)                              |
| Run timer (live)   | `run_timer.py`                                       | —                          | 1 Hz  | `InputComposer` meta bar                                  |
| Shutdown countdown | `app.py`                                             | —                          | 1 Hz  | Status text in agent pane                                 |

### 6.2 Rules

1. **Use `set_interval()` timers.** Never busy-loop or sleep for animation.
2. **Gate on `_active` flag.** Idle widgets must not refresh. `SpinnerWidget` demonstrates the pattern.
3. **Single source.** If multiple widgets need the same animation, import the frames from `palette.py`.
4. **Clean up timers on unmount.** Call `timer.stop()` in widget cleanup or use Textual's auto-cleanup.
5. **No animation in chat content.** The transcript is persistent history — animations belong in status widgets only.

### 6.3 Loading States

| Context                    | Visual Treatment                                                |
| -------------------------- | --------------------------------------------------------------- |
| Agent running (transcript) | `SpinnerWidget` below chat with green braille + "running"       |
| Agent waiting on deps      | `◴◷◶◵` spinner in agent row + yellow "waiting" label            |
| Agent summarizing          | Braille spinner in agent row + cyan "Summarizing response" text |
| Compression in progress    | Status label in InfoPane; logged latency                        |
| Shutdown in progress       | Countdown timer + status text in agent activity pane            |
| Session loading            | Modal/screen with progress indicator                            |

---

## 7. Layout Grid & Spacing

### 7.1 Main Grid

```
┌─────────────────────────────────────────────────┐
│ TopBar                                           │  height: 1
├──────────────────────┬──────────────────────────┤
│                      │                          │
│   Left Pane          │   Right Pane             │
│   (chat + composer)  │   (agents + info + todo) │
│                      │                          │
│   $layout-left-col   │   $layout-right-col      │  grid-gutter: 1
│                      │                          │
├──────────────────────┴──────────────────────────┤
│ StatusBar                                        │  height: 1
└─────────────────────────────────────────────────┘
```

- **CSS:** `grid-size: 2 1; grid-columns: $layout-left-col $layout-right-col; grid-gutter: 1;`
- **Padding:** `1 2` on the grid container.
- **Left pane:** vertical layout, `#left-pane` fills the column.
- **Right pane:** vertical layout with left border, padding `0 0 0 1`.

### 7.2 Right Rail Vertical Split (3:2:2)

Per REQ-20260527-TUI-SCROLLIN-001:

| Panel        | Height Variable          | Fraction |
| ------------ | ------------------------ | -------- |
| Agent Status | `$layout-right-agents-h` | `3fr`    |
| Info         | `$layout-right-info-h`   | `2fr`    |
| Todo         | `$layout-right-todo-h`   | `2fr`    |

- **Scrolling:** `overflow-y: auto` on each panel; borders remain fixed (Textual native, not `Rich.Panel`).
- **Padding:** `0 1` for all right-rail panels.
- **Chat panel:** `height: 1fr` (fills left pane), `overflow-y: auto`, padding `1 1`.

### 7.3 Composer Layout

```
┌──────────────────────────────────────────┐
│ #composer-meta  status | ctrl+e | model  │  height: 1
│                 ctrl+m | timer | ctrl+s  │
├──────────────────────────────────────────┤
│                                          │
│ Input / TextArea                         │  height: auto
│                                          │
└──────────────────────────────────────────┘
```

- Meta bar: horizontal, height 1, `margin-bottom: 1`.
- Meta items: `width: auto`, `$theme-fg-muted`.
- Input: `margin-top: 1` (between meta and input), bordered.

### 7.4 Spacing Rules

| Context                    | Padding | Margin                               |
| -------------------------- | ------- | ------------------------------------ |
| Panel content (right rail) | `0 1`   | —                                    |
| Panel content (chat)       | `1 1`   | —                                    |
| Panel borders              | —       | — (CSS `border`)                     |
| Grid gutter                | —       | `1` cell                             |
| Composer meta → input      | —       | `margin-bottom: 1` / `margin-top: 1` |
| Modal container            | `1 2`   | — (centered via `align`)             |
| Settings rows              | —       | `margin-top: 1`                      |
| Section titles             | —       | `margin-top: 1`                      |

---

## 8. Typography & Text Conventions

The terminal inherits the user's font — we control style, not typeface.

### 8.1 Text Styles

| Style    | CSS / Rich         | Usage                                             |
| -------- | ------------------ | ------------------------------------------------- |
| **Bold** | `text-style: bold` | Titles, active states, key labels, footer keys    |
| Dim      | `$theme-fg-dim`    | Hints, metadata, secondary info, empty states     |
| Muted    | `$theme-fg-muted`  | Chrome text, borders, panel titles, composer meta |
| Subtle   | `$theme-fg-subtle` | Section headings within panels                    |
| Primary  | `$theme-fg`        | User messages, input text, primary content        |

### 8.2 Alignment

| Context                | Alignment                                        |
| ---------------------- | ------------------------------------------------ |
| Labels (settings rows) | `content-align: left middle`                     |
| Badges (focused agent) | `content-align: center middle`                   |
| Version, git branch    | `content-align: right middle`                    |
| Modal titles           | `content-align: left middle` (via `width: 100%`) |

### 8.3 Truncation

- Use `…` (U+2026) for text truncation, not `...` (three dots).
- Status bar path: home-collapse (`~`) + middle-truncate.
- Agent display labels: abbreviate non-focused rows.

---

## 9. Keyboard & Focus Conventions

### 9.1 Global Key Bindings

| Key               | Action                                  | Requirement             |
| ----------------- | --------------------------------------- | ----------------------- |
| `Ctrl+P`          | Command palette                         | FR-6-008                |
| `Ctrl+M`          | Model selection screen                  | FR-6-007                |
| `Ctrl+Q`          | Coordinated quit (deferred during run)  | REQ-20260506-QUIT-001   |
| `Ctrl+C` (double) | Immediate force-stop                    | —                       |
| `Ctrl+E`          | Toggle multiline input                  | —                       |
| `Ctrl+S`          | Stash current input                     | —                       |
| `Escape`          | Dismiss modal / overlay                 | —                       |
| `Up` / `Down`     | Navigate agent list (when not in input) | REQ-20260413-204058-029 |

### 9.2 Focus Indicators

- **Focused widgets:** `border: solid $theme-border-focus` (from `:focus` CSS pseudo-class).
- **Focused input:** `border: solid $theme-border-focus` on `Input:focus` / `TextArea:focus`.
- **DataTable cursor:** `background: $theme-bg-selection`.
- **No hidden focus traps.** Every focusable element must have a visible indicator.
- **Arrow keys in input vs. navigation:** Arrow keys navigate agent list ONLY when focus is NOT in the input field (REQ-20260413-204058-029).

### 9.3 Tab Order

Logical tab order: `InputComposer` → `ChatPanel` → `AgentStatusPane` → `InfoPane` → `TodoPane` → cycle.

### 9.5 Mouse Interaction (Secondary to Keyboard)

Mouse clicks are a convenience, not a requirement. Every clickable element must also be keyboard-reachable (P1: Keyboard-first). The following elements support mouse clicks:

| Widget            | Click Target                                        | Action                                  | Implementation                                             |
| ----------------- | --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `ChatPanel`       | URLs in transcript                                  | Open in browser                         | `on_mouse_up` with `_URL_RE` regex match                   |
| `ChatPanel`       | "Thought…" reasoning headers                        | Toggle reasoning visibility             | `on_mouse_up` checking `_reasoning_header_lines`           |
| `ChatPanel`       | Selected text (right-click)                         | Copy to clipboard                       | `on_mouse_up` with button==3                               |
| `AgentStatusPane` | Agent rows                                          | Focus that agent (same as Up/Down keys) | `on_click` resolving y-coordinate via `_agent_line_map`    |
| `InfoPane`        | Artifact entries                                    | Focus/open that artifact                | `on_click` resolving y-coordinate via `_artifact_line_map` |
| `InputComposer`   | Meta bar shortcuts (model, toggle, settings, stash) | Trigger respective action               | `on_click` on `Static` subclasses                          |
| `DataTable`       | Rows in session picker                              | Select session                          | Built-in DataTable row click                               |
| All modals        | Buttons, switches, inputs                           | Standard widget interaction             | Textual built-in                                           |

**Implementation pattern for Rich-rendered clickable items:**

When interactive items are rendered via Rich `Text` into a `Static` widget:

1. Build a `dict[int, str]` mapping rendered line index → item ID during `_build_renderable()`.
2. Implement `on_click(self, event: Click)` — resolve `event.y` to an item ID, post a custom `Message`.
3. Handle the message in `app.py` to update reactive state (e.g., `focused_agent_id`, `focused_artifact_id`).
4. Always provide the same action via keyboard (Up/Down for agents, `[` / `]` for artifacts).

**Rules:**

- Never make something clickable without also making it keyboard-accessible.
- Use custom `Message` subclasses for click-to-action communication (decoupled from widget hierarchy).
- Click handlers must not assume focus — the clicked widget may not have keyboard focus.
- Avoid double actions: clicking an already-focused agent should not re-trigger side effects.

---

## 10. Accessibility Checklist

Every TUI change must satisfy these checks:

- [ ] **Not color-only (FR-6-015):** All status indicators use icon/text + color. Verify by mentally "turning off" color — is the state still unambiguous?
- [ ] **Keyboard reachable (FR-6-006):** Every interactive element can be reached and activated via keyboard. No mouse-only paths.
- [ ] **Focus visible:** Every focusable widget has a visible focus indicator (`:focus` CSS rule).
- [ ] **Text contrast:** Use `$theme-fg` on `$theme-bg` for primary content. Use Textual's `$text-primary` / `$text-secondary` when available.
- [ ] **Screen reader compatible:** Custom Rich renderables should not break Textual's built-in screen-reader integration. Avoid raw ANSI escape sequences.
- [ ] **Toast accessibility:** Critical toasts use `severity="error"` and are not auto-dismissed. Warning toasts are distinguishable from errors.
- [ ] **No seizure triggers:** Animations at 10 Hz max. No flashing between drastically different brightness levels.
- [ ] **Terminal-agnostic (FR-6-014):** Test with a light terminal theme. All `$theme-*` variables must produce legible output.

---

## 11. Anti-Patterns

These are things to NEVER do. They are known from past regressions and code review findings.

### ❌ Hardcoded Colors

```python
# WRONG
text = Text("error", style="bold red")
```

```python
# CORRECT
p = RenderPalette.from_theme(get_theme())
text = Text("error", style=f"bold {p.red}")
```

### ❌ Color-Only Status

```python
# WRONG — a red icon with no text label
row.append(Text("●", style=p.red))
```

```python
# CORRECT — icon + text label
row.append(Text("✗ failed", style=p.red))
```

### ❌ Direct Widget Manipulation from Orchestration

```python
# WRONG — bypassing reactives
self.query_one("#chat-panel").write(message)
```

```python
# CORRECT — set reactive attribute, let widget handle rendering
chat_panel.write(message)  # RichLog.write() is the public API
```

### ❌ Duplicated Animation Frames

```python
# WRONG — redefining frames in each widget
_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
```

```python
# CORRECT — import from single source
from rotaris_core.tui.palette import BRAILLE_FRAMES
```

### ❌ Nested VerticalScroll Wrappers

```python
# WRONG — Rich.Panel + VerticalScroll nesting
yield VerticalScroll(Panel(Static()))
```

```python
# CORRECT — Textual native border + overflow-y: auto in CSS
self.styles.border = ("solid", p.border)
# In app.tcss:
# #my-panel { overflow-y: auto; }
```

### ❌ Rich.Panel for Borders

Per REQ-20260527-TUI-SCROLLIN-001: use Textual native `styles.border` + `border_title`/`border_subtitle`. Never wrap content in `rich.panel.Panel` for border decoration — it causes "jumping" borders when scrolling.

### ❌ Unbounded Agent List

Per REQ-20260511-007: never show more than 5 concrete agent rows. Use ellipsis collapsing for hidden ranges.

### ❌ New Theme Variable Without Full Registration

Adding a new semantic color requires:

1. Add field to `Theme` dataclass in `themes/base.py`
2. Add `$theme-*` mapping in `Theme.css_variables()`
3. Set value in BOTH `tokyo_night.py` AND `dark.py`
4. Optionally add to `RenderPalette.from_theme()` if used in Rich rendering

Skipping any step breaks theme switching.

### ❌ Busy-Looping or `time.sleep` for Animation

```python
# WRONG
while self._active:
    self._frame = (self._frame + 1) % len(_FRAMES)
    self.refresh()
    time.sleep(0.1)
```

```python
# CORRECT
self.set_interval(0.1, self._tick)  # Textual timer, cooperatively scheduled
```

---

## 12. Adding a New Component

When creating a new widget or screen:

1. **Choose existing patterns first.** Check Section 4 (Component Catalog) — can you compose from existing widgets?
2. **Use `$theme-*` variables for ALL colors.** No hardcoded hex/rgb values.
3. **Use `RenderPalette.from_theme(get_theme())` for Rich rendering.** Not raw theme colors.
4. **Follow the reactive contract.** Define public reactive attributes; never manipulate child widgets directly.
5. **Add CSS rules in `app.tcss`.** Keep styles with the stylesheet, not inline.
6. **Document the component here.** Add an entry to Section 4 with: file, class, purpose, CSS ID, behaviors, reactive contract, theme usage, accessibility notes.
7. **Add snapshot tests.** Per `docs/textualize_testing_guide.md`, cover: full workflow, alternative path, random interaction.
8. **Update `docs/INDEX.md`** if the new component introduces a new concept area.

---

## Cross-References

| Requirement Document                                       | IDs Covered                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| `requirements-20260413-000004-tui-core.md`                 | FR-6-001..015, FR-BG-001..008, FR-SESSION-001..005                         |
| `requirements-20260413-204058.md`                          | REQ-20260413-204058-012..031 (right panel, navigation, chat scroll)        |
| `requirements-20260503-style-guided-theme.md`              | REQ-20260503-STYLE-001..008, NF-001..004                                   |
| `requirements-20260511-164500.md`                          | REQ-20260511-001..011 (timing strip, default chrome, collapsed agent list) |
| `requirements-20260527-tui-scrolling.md`                   | REQ-20260527-TUI-SCROLLIN-001                                              |
| `requirements-20260513-focused-agent-transcript-header.md` | REQ-20260513-203000-001..006                                               |
| `requirements-20260506-quit-hardening.md`                  | REQ-20260506-QUIT-001..006                                                 |
| `docs/ui-patterns/TEXTUAL_PATTERNS.md`                     | Textual framework patterns (reactives, themes, testing)                    |
