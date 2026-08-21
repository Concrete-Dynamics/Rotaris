# Bug — Slash command overlay: input loses focus, overlay doesn't appear, filtering broken

**Date:** 2026-07-08
**Status:** Open
**Severity:** High (user-facing feature regression)
**Affected requirement:** `docs/requirement-log/done/requirements-20260417-slash-commands.md`

---

## What happened

Typing `/` in the input composer immediately unfocuses the text field. The slash-command autocomplete overlay does not appear properly, and command filtering does not work. Slash commands can only be used by blindly typing the full command name and pressing Enter.

## Steps to reproduce

1. Open the TUI (`python -m rotaris_core`)
2. Click into the input field and type `/`
3. Observe: cursor disappears from input (field unfocuses)
4. Observe: overlay may or may not appear; if it does, there is no visible filtering
5. Continue typing `theme` — the input field still shows only `/` and no filtering/suggestions happen for `/them`
6. Press Enter — `/them` is sent as a regular message rather than resolved to `/theme`

## What was expected

1. Typing `/` shows an autocomplete overlay listing all available slash commands
2. Continuing to type (e.g., `the`) filters the overlay to show matching commands (e.g., `/theme`)
3. The input field remains focused and displays the full typed text (e.g., `/theme`)
4. Pressing Enter/Tab selects the highlighted command and inserts it into the input
5. Pressing Escape dismisses the overlay and returns focus to the input without executing

## Root causes (from code inspection)

### 1. `SlashCommandOverlay.show()` steals focus from the input widget

**File:** `src/rotaris_core/tui/widgets/slash_commands.py`, line 328

```python
def show(self, filter_text: str = "") -> None:
    ...
    self.add_class("showing")
    self.focus()  # <-- steals focus from the Input widget immediately
```

When the user types `/`, `on_input_changed` triggers `self._overlay.show(event.value)`, which calls `self.focus()` on the overlay widget. This removes focus from the `Input` widget, causing the cursor to vanish and subsequent keystrokes to be captured by the overlay instead of the input.

### 2. `on_input_changed` only triggers on exact `"/"` — never refires

**File:** `src/rotaris_core/tui/widgets/input_composer.py`, line 240

```python
def on_input_changed(self, event: Input.Changed) -> None:
    if event.input is not self.input_widget:
        return
    if event.value == "/" and not self._overlay.has_class("showing"):
        self._overlay.show(event.value)
```

The guard `event.value == "/"` only fires when the value is a lone slash. Once the overlay has focus, the input never receives further keystrokes, so `on_input_changed` never fires again. There is no code to:
- Re-show or update the overlay on incremental typing in the input
- Track the overlay's filter state against the input's value

### 3. Overlay `on_key` captures keystrokes but never synchronizes with the input widget

**File:** `src/rotaris_core/tui/widgets/slash_commands.py`, lines 339–385

The overlay's `on_key` method captures all single-character keystrokes for internal filtering:

```python
if len(event.key) == 1:
    self._filter_text += event.key
    self._update_commands()
    event.stop()
```

This updates `_filter_text` and re-renders the overlay list, but never writes to `self.input_widget.value`. The input stays at `"/"` while the user types characters that only affect the overlay's internal state.

## Proposed fix direction

The overlay should not steal focus. Instead:

1. **Keep focus on the `Input` widget** — don't call `self.focus()` in `show()`. The overlay should be a passive suggestion panel.
2. **Drive filtering from `Input.Changed` events** — instead of exact `"/"` match, check `event.value.startswith("/")` on every change and call `overlay.show(event.value[1:])` or `.update_filter(event.value[1:])`.
3. **Let the overlay be keyboard-navigable without stealing focus** — use Textual's focus model so the overlay can receive up/down/enter/escape while the input keeps characters. Or use a simpler approach: render the overlay as a non-focusable list, and let the input's `on_key` delegate navigation keys.
4. **On selection, insert the command name into the input** — already handled by `_on_slash_command_selected`.

## Related code

| File | Lines | Concern |
|------|-------|---------|
| `src/rotaris_core/tui/widgets/slash_commands.py` | 322–328 | `show()` steals focus |
| `src/rotaris_core/tui/widgets/slash_commands.py` | 339–385 | `on_key` captures keystrokes |
| `src/rotaris_core/tui/widgets/input_composer.py` | 237–241 | `on_input_changed` only fires on exact `"/"` |
| `tests/unit/test_slash_commands.py` | 1–50 | Existing overlay tests |
| `tests/unit/test_input_composer_slash_commands.py` | 1–50 | Existing composer integration tests |
