# Textual Framework: Production Architectural Patterns

**Date**: April 29, 2026  
**Source**: Official Textual v8.2.1 documentation + source inspection (commit 759e66f)  
**Scope**: Reactivity, Screens, Themes, Testing, Widget Composition

---

## 1. REACTIVE ATTRIBUTES AS THE SOLE ORCHESTRATION INTERFACE

### Pattern: Reactive-First Architecture

**Core Principle**: Reactive attributes are the ONLY interface between orchestration logic and rendering. No direct widget manipulation from outside the widget hierarchy.

**Evidence** (Textual Reactivity Guide + reactive.py source):
- Reactive attributes use Python's descriptor protocol (same as `property`)
- Setting a reactive attribute automatically triggers:
  - `render()` refresh (if `repaint=True`, default)
  - Layout recalculation (if `layout=True`)
  - Watch method invocation (if defined)
  - Compute method re-evaluation (if defined)
- Textual checks if value changed before triggering refresh (no unnecessary updates)
- Source: `reactive.py` lines 316-369 show `_set()` method dispatch logic

**Implementation Pattern**:

```python
from textual.reactive import reactive
from textual.widget import Widget

class MyWidget(Widget):
    # Reactive attribute: sole interface for state changes
    count = reactive(0)  # Default value
    
    def render(self) -> str:
        # Render is called automatically when count changes
        return f"Count: {self.count}"
    
    def watch_count(self, old_value: int, new_value: int) -> None:
        # Called when count changes (receives old & new values)
        # Use for side effects: updating child widgets, logging, etc.
        pass
    
    def compute_count(self) -> int:
        # Optional: compute derived state
        # Called after watch methods
        return self.count * 2
```

**Orchestration Pattern** (from outside):
```python
# CORRECT: Set reactive attribute
widget.count = 42  # Triggers render + watch + compute automatically

# WRONG: Direct widget manipulation
widget.query_one("#label").update("...")  # Breaks reactivity contract
```

**Key Insight**: Reactives are the "contract" between orchestration and rendering. Never bypass them.

---

## 2. SMART REFRESH SEMANTICS

### Pattern: Automatic Refresh Optimization

**Three Refresh Modes** (from reactive.py lines 142-163):

1. **`repaint=True` (default)**: Calls `render()`, updates content only
   - Fast, no layout recalculation
   - Use for: text updates, color changes, content-only changes

2. **`layout=True`**: Calls `render()` + recalculates CSS layout
   - Slower, triggers full layout pass
   - Use for: width/height changes, dynamic sizing

3. **`var()` (no refresh)**: No automatic refresh
   - Use for: internal state that doesn't affect rendering
   - Must manually call `refresh()` if needed

**Evidence** (reactive.py lines 364-369):
```python
# Refresh according to descriptor flags
if self._layout or self._repaint or self._recompose:
    obj.refresh(
        repaint=self._repaint,
        layout=self._layout,
        recompose=self._recompose,
    )
```

**Optimization**: Multiple reactive changes in same event → single refresh
```python
# Only ONE refresh happens, not three
self.count += 1
self.status = "updated"
self.timestamp = now()
```

**Real-world example** (calculator.py):
```python
numbers = var("0")  # var() = no auto-refresh
show_ac = var(True)  # var() = no auto-refresh

def watch_numbers(self, value: str) -> None:
    """Called when numbers is updated."""
    self.query_one("#numbers", Digits).update(value)
```

---

## 3. WATCH METHODS: CALLING CONVENTIONS

### Pattern: Watch Method Signatures

**Three Calling Conventions** (from reactive.py lines 90-122):

```python
class MyWidget(Widget):
    value = reactive(0)
    
    # Convention 1: New value only
    def watch_value(self, new_value: int) -> None:
        print(f"New value: {new_value}")
    
    # Convention 2: Old and new values
    def watch_value(self, old_value: int, new_value: int) -> None:
        print(f"Changed from {old_value} to {new_value}")
    
    # Convention 3: No arguments (called on any change)
    def watch_value(self) -> None:
        print("Value changed")
```

**Calling Semantics** (from reactive.py lines 106-116):
- Watch methods are called ONLY if value actually changed
- Override with `always_update=True` to call even if value unchanged
- Watch methods can be async (Textual awaits them via `await_watcher`)
- Watchers can post messages or call other methods
- Parameter count is auto-detected via `count_parameters()`

**Dynamic Watchers** (for external widgets):
```python
# In parent widget
def on_mount(self) -> None:
    counter = self.query_one(Counter)
    
    def update_progress(value: int) -> None:
        self.query_one(ProgressBar).update(progress=value)
    
    # Dynamically add watcher to external widget's reactive
    self.watch(counter, "counter_value", update_progress)
```

**Real-world example** (calculator.py):
```python
def watch_show_ac(self, show_ac: bool) -> None:
    """Called when show_ac changes."""
    self.query_one("#c").display = not show_ac
    self.query_one("#ac").display = show_ac
```

---

## 4. RECOMPOSE VS. REFRESH DECISION TREE

### Pattern: When to Use Recompose

**Refresh** (`repaint=True`, default):
- ✅ Content changes (text, colors)
- ✅ Fast, no widget tree changes
- ✅ Child widget state preserved
- ❌ Can't change number of children
- ❌ Can't change widget types

**Recompose** (`recompose=True`):
- ✅ Dynamic widget tree (add/remove children)
- ✅ Change widget types based on state
- ❌ Slower (removes all children, calls `compose()` again)
- ❌ Child widget state is LOST (fresh mount)
- ❌ Avoid for stateful children (Input, TextArea, DataTable)

**Decision Tree**:
```
Does the change affect the widget tree structure?
├─ NO (just content/style) → use refresh (default)
└─ YES (add/remove/change widgets) → use recompose=True
    └─ WARNING: Child state will be reset!
```

**Example: Recompose for Dynamic Layout**:
```python
class DynamicLayout(Widget):
    layout_mode = reactive("vertical", recompose=True)
    
    def compose(self) -> ComposeResult:
        if self.layout_mode == "vertical":
            yield VerticalScroll(
                Static("Item 1"),
                Static("Item 2"),
            )
        else:
            yield Horizontal(
                Static("Item 1"),
                Static("Item 2"),
            )
```

---

## 5. COMPUTE METHODS: DERIVED STATE PATTERN

### Pattern: Reactive Computation

**Purpose**: Calculate derived state from other reactives

```python
class Calculator(Widget):
    left = reactive(0)
    right = reactive(0)
    operator = reactive("+")
    
    # Computed reactive: automatically recalculated when dependencies change
    def compute_result(self) -> int:
        if self.operator == "+":
            return self.left + self.right
        elif self.operator == "-":
            return self.left - self.right
        # ...
```

**Semantics** (from reactive.py lines 412-434):
- Compute methods are called after watch methods
- Called whenever ANY reactive changes (not just dependencies)
- Result is cached (not recalculated if dependencies unchanged)
- Use for: derived state, validation, aggregation
- Compute methods are read-only (can't set a reactive with a compute method)

**Real-world example** (calculator.py):
```python
def compute_show_ac(self) -> bool:
    """Compute switch to show AC or C button"""
    return self.value in ("", "0") and self.numbers == "0"
```

---

## 6. SCREEN STACK & LIFECYCLE

### Pattern: Screen Management

**Screen Stack Mechanics** (from screen.py):
- Only top screen is active (receives input, renders)
- Screens below are hidden (can be translucent)
- Stack must always have ≥1 screen

**Three Stack Operations**:

```python
# Push: add screen on top (previous screen hidden)
self.app.push_screen(MyScreen())

# Pop: remove top screen (previous screen becomes active)
self.app.pop_screen()

# Switch: replace top screen
self.app.switch_screen(MyScreen())
```

**Named Screens** (for reuse):
```python
class MyApp(App):
    SCREENS = {
        "main": MainScreen(),
        "settings": SettingsScreen(),
    }
    
    def on_mount(self) -> None:
        # Or install dynamically
        self.install_screen(SettingsScreen(), name="settings")
```

**Screen Lifecycle** (from screen.py):
```
on_mount() → compose() → on_show() → [active] → on_hide() → on_unmount()
```

**Returning Data from Screens**:
```python
class SettingsScreen(Screen[dict]):
    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "save":
            self.dismiss({"theme": "dark", "font_size": 12})

# In parent:
def action_open_settings(self) -> None:
    def handle_settings(result: dict) -> None:
        self.app.theme = result["theme"]
    
    self.app.push_screen(SettingsScreen(), callback=handle_settings)
```

---

## 7. THEMES & DESIGN TOKENS (TCSS)

### Pattern: CSS Variable-Based Theming

**Theme Structure**:
```python
from textual.theme import Theme

my_theme = Theme(
    name="my_theme",
    primary="#0066cc",      # Branding color
    secondary="#ff6600",    # Alternative branding
    accent="#ffcc00",       # Highlight color
    foreground="#ffffff",   # Text color
    background="#000000",   # Screen background
    surface="#1a1a1a",      # Widget background
    panel="#2a2a2a",        # Panel/sidebar background
    success="#00cc00",      # Success indicator
    warning="#ffaa00",      # Warning indicator
    error="#ff0000",        # Error indicator
    dark=True,              # Light/dark theme
    variables={
        "block-cursor-text-style": "none",
        "footer-key-foreground": "#0066cc",
    }
)

# Register and use
app.register_theme(my_theme)
app.theme = "my_theme"
```

**CSS Variable Usage**:
```tcss
MyWidget {
    background: $primary;
    color: $foreground;
    border: solid $secondary;
}

/* Shades: -lighten-1/2/3, -darken-1/2/3 */
Button {
    background: $primary-darken-1;
}

/* Text colors (guaranteed legible) */
Label {
    color: $text-primary;  /* Legible on any background */
}
```

**Key Insight**: Use CSS variables, NOT hard-coded colors. Enables theme switching without code changes.

---

## 8. COMPOSE VS. ON_MOUNT DECISION

### Pattern: Widget Construction Timing

**`compose()` Method**:
- Called once at widget mount time
- Returns child widgets to add
- Use for: static widget tree, initial children
- ✅ Declarative, clean
- ❌ Can't access app state (not mounted yet)

**`on_mount()` Method**:
- Called after widget is mounted and children are added
- Use for: dynamic setup, accessing app state, starting workers
- ✅ Can access app, parent, siblings
- ✅ Can start async tasks
- ❌ More imperative

**Pattern**:
```python
class MyWidget(Widget):
    def compose(self) -> ComposeResult:
        # Static children
        yield Header()
        yield Footer()
    
    def on_mount(self) -> None:
        # Dynamic setup
        self.app.theme = "dark"
        self.query_one(Header).title = "My App"
        self.work(self.load_data())
```

**Real-world example** (calculator.py):
```python
def compose(self) -> ComposeResult:
    """Add our buttons."""
    with Container(id="calculator"):
        yield Digits(id="numbers")
        yield Button("AC", id="ac", variant="primary")
        # ... more buttons
```

---

## 9. TESTABLE WIDGETS

### Pattern: Widget Testing Without App Startup

**Testing Framework**: pytest + pytest-asyncio

**Basic Test Pattern**:
```python
async def test_widget_render():
    widget = MyWidget()
    async with widget.run_test() as pilot:
        # Simulate user interaction
        await pilot.press("enter")
        
        # Assert state
        assert widget.count == 1
        assert "Count: 1" in widget.render()
```

**Testing Reactives**:
```python
async def test_reactive_update():
    widget = MyWidget()
    async with widget.run_test() as pilot:
        # Change reactive
        widget.count = 42
        
        # Pause to process messages
        await pilot.pause()
        
        # Assert render output
        assert "42" in widget.render()
```

**Snapshot Testing** (visual regression):
```python
def test_widget_appearance(snap_compare):
    assert snap_compare("path/to/widget.py")
```

---

## 10. LAYOUT ABSTRACTION PATTERNS

### Pattern: Swappable Layouts Without Widget Logic Changes

**Container-Based Layout**:
```python
class MyApp(App):
    layout_mode = reactive("vertical")
    
    def compose(self) -> ComposeResult:
        if self.layout_mode == "vertical":
            with Vertical():
                yield Sidebar()
                yield MainContent()
        else:
            with Horizontal():
                yield Sidebar()
                yield MainContent()
```

**CSS-Based Layout** (preferred):
```python
# Python: same widget tree always
def compose(self) -> ComposeResult:
    yield Sidebar(id="sidebar")
    yield MainContent(id="main")

# TCSS: switch layout via CSS
Screen.vertical {
    layout: vertical;
}

Screen.horizontal {
    layout: horizontal;
}

#sidebar {
    width: 20;
}

#main {
    width: 1fr;
}
```

**Key Insight**: Use CSS for layout switching, not Python. Keeps widget logic clean.

---

## 11. EVENT HANDLING & MESSAGE DISPATCH

### Pattern: Reactive Event Binding

**Decorator-based event binding** (from calculator.py):
```python
@on(Button.Pressed, ".number")
def number_pressed(self, event: Button.Pressed) -> None:
    """Pressed a number."""
    assert event.button.id is not None
    number = event.button.id.partition("-")[-1]
    self.numbers = self.value = self.value.lstrip("0") + number
```

**Key patterns**:
- `@on(EventType, selector)` decorator for event handling
- Selector can be CSS class (`.number`) or ID (`#plus`)
- Event handler receives the event object
- Setting reactives inside handlers triggers watch methods

**Real-world example** (calculator.py):
```python
@on(Button.Pressed, "#ac")
def pressed_ac(self) -> None:
    """Pressed AC"""
    self.value = ""
    self.left = self.right = Decimal(0)
    self.operator = "plus"
    self.numbers = "0"
```

---

## 12. REACTIVE INITIALIZATION & LAZY DEFAULTS

### Pattern: Initialize Reactive with Callable

**Three initialization modes** (from reactive.py lines 214-223):

```python
# Mode 1: Static default
count = reactive(0)

# Mode 2: Callable default (called once at first access)
items = reactive(list)  # Calls list() to get default

# Mode 3: Initialize wrapper (for method-based defaults)
class MyApp(App):
    def get_names(self) -> list[str]:
        return ["foo", "bar", "baz"]
    
    # The `names` property will call `get_names` to get its default
    names = reactive(Initialize(get_names))
```

**Key insight**: Lazy initialization prevents shared mutable defaults across instances.

---

## SYNTHESIS: RECOMMENDED ARCHITECTURE FOR ROTARIS-AI

### Proposed Seams

1. **Orchestration Layer** (RalphLoop, Scheduler):
   - Only modifies reactive attributes on Screen/Widget
   - Never queries or manipulates widgets directly
   - Posts messages for async operations

2. **Rendering Layer** (Screen, Widget):
   - Defines reactive attributes as public interface
   - Implements `render()` for content
   - Implements `watch_*()` for side effects
   - Uses `compose()` for static children
   - Uses `on_mount()` for dynamic setup

3. **Theme Layer**:
   - Define design tokens in TCSS
   - Use CSS variables (`$primary`, `$foreground`, etc.)
   - Switch themes via `app.theme = "name"`

4. **Testing Layer**:
   - Test widgets in isolation via `run_test()`
   - Test reactives by setting attributes
   - Use snapshot tests for visual regression

5. **Event Layer**:
   - Use `@on()` decorator for event binding
   - Event handlers set reactives (not direct widget manipulation)
   - Watchers handle side effects

---

## CRITICAL IMPLEMENTATION RULES

### Rule 1: Reactive Attributes Are Contracts
- Every reactive attribute is a public interface
- External code should ONLY set reactives, never query/manipulate widgets
- Watchers handle all side effects

### Rule 2: Watch Methods Are Side-Effect Handlers
- Watch methods run AFTER reactive value is set
- Use for: updating child widgets, logging, triggering async tasks
- Never set the same reactive inside its own watcher (infinite loop)

### Rule 3: Compute Methods Are Read-Only
- Compute methods calculate derived state
- Cannot be set directly (read-only)
- Called after watch methods

### Rule 4: Refresh Semantics Matter
- `repaint=True` (default): fast, content-only
- `layout=True`: slow, triggers layout recalculation
- `recompose=True`: very slow, rebuilds widget tree
- Choose wisely to avoid performance issues

### Rule 5: Compose Is Static, On_Mount Is Dynamic
- `compose()`: declare static widget tree
- `on_mount()`: perform dynamic setup, access app state
- Never try to access app in `compose()`

---

## REFERENCES

- **Reactivity Guide**: https://textual.textualize.io/guide/reactivity/
- **Screens Guide**: https://textual.textualize.io/guide/screens/
- **Themes Guide**: https://textual.textualize.io/guide/design/
- **Testing Guide**: https://textual.textualize.io/guide/testing/
- **Textual Source**: https://github.com/textualize/textual/blob/759e66f/src/textual/
- **Calculator Example**: https://github.com/textualize/textual/blob/759e66f/examples/calculator.py

