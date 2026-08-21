"""Guard: secret redaction has no off switch, and must never grow one.

Redaction in Rotaris is structural — ``redact_secrets`` (permissions), the
``field_validator``s on the event schema, and ``redact_payload`` (hooks) run on
every path that can reach a UI, a log, or a hook process.  Nothing consults a
setting first, so there is no configuration state that could ever mean "off".

That is a security property, and until now nothing enforced it: a contributor
adding a friendly "disable redaction" switch would have broken it with a green
suite.  These tests pin the *absence* — no toggle identifier, no redaction-named
configuration field, a static label instead of a control, and no onboarding copy
offering to configure it (SWR-2118 … SWR-2121).

They deliberately say nothing about the redaction implementation itself; that is
covered elsewhere.  The subject here is configurability, of which there is none.

Every source scan below asserts its own anchor — the file, the class, the label
it relies on — so that moving or renaming the code fails the test loudly instead
of letting an empty search pass for the wrong reason.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

# Imported once at module scope: pulling in the config schema drags the agent SDK
# with it, which costs about twelve seconds.
from rotaris_core.config.schema import RuntimePolicy
from rotaris_core.reqtocode import SWR, verifies

pytestmark = pytest.mark.unit

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_TREE = REPO_ROOT / "src" / "rotaris_core"
DESKTOP_TREE = REPO_ROOT / "apps" / "rotaris" / "src" / "rotaris"
SETTINGS_VIEW = DESKTOP_TREE / "views" / "settings.py"
CHROME_VIEW = DESKTOP_TREE / "views" / "chrome.py"
DASHBOARD_VIEW = DESKTOP_TREE / "views" / "dashboard.py"
STATE_MODELS = DESKTOP_TREE / "models" / "state.py"
WORKSPACE_STORE = DESKTOP_TREE / "models" / "store.py"

#: The identifier a redaction toggle would be named.  This file lives outside
#: both scanned trees, and ``_python_sources`` skips it besides, so the plain
#: literal here cannot make the scan flag itself.
FORBIDDEN_IDENTIFIER = "secret_redaction"

#: The two strings the product is allowed to say about redaction, verbatim.
SETTINGS_LABEL = "Secret redaction: always active"
CHROME_FLAG = "redaction: always on"

#: Widget classes a user can operate.  None of them may be built anywhere in the
#: redaction row's data flow — that is what "non-interactive" means concretely.
INTERACTIVE_WIDGETS = frozenset(
    {
        "ToggleSwitch",
        "QCheckBox",
        "QComboBox",
        "QPushButton",
        "QRadioButton",
        "QLineEdit",
        "QSpinBox",
        "QDoubleSpinBox",
        "QSlider",
        "QAction",
    }
)

#: Words that turn a mention of redaction into an offer to change it.
CONFIGURABILITY_WORDS = (
    "disable",
    "disabling",
    "turn off",
    "turn it off",
    "toggle",
    "opt out",
    "opt-out",
    "switch off",
    "configure",
    "configuring",
    "enable",
    "enabling",
    "unredact",
)

#: Copy that *reinforces* the property reads as "cannot be disabled" or "always
#: enabled" and must not be punished for using the same vocabulary — a guard that
#: reddens the build on the strongest phrasing of what it protects gets deleted.
REINFORCING_MARKERS = (
    "cannot",
    "can't",
    "never",
    "no way to",
    "not configurable",
    "always",
    "unconditional",
)

#: Names too common to follow when tracing a widget's data flow.
_TAINT_STOPWORDS = frozenset({"self", "cls", "super"})

_FUNCTION_NODES = (ast.FunctionDef, ast.AsyncFunctionDef)
_SIMPLE_STATEMENTS = (ast.Assign, ast.AnnAssign, ast.AugAssign, ast.Expr, ast.Return)


def _python_sources(tree: Path) -> list[Path]:
    """Every real source file under *tree*, byte-compiled copies excluded."""
    this_file = Path(__file__).resolve()
    return [
        path
        for path in sorted(tree.rglob("*.py"))
        if "__pycache__" not in path.parts and path.resolve() != this_file
    ]


def _parse(path: Path) -> tuple[str, ast.Module]:
    source = path.read_text(encoding="utf-8")
    return source, ast.parse(source, filename=str(path))


def _string_constants(node: ast.AST) -> list[str]:
    return [
        child.value
        for child in ast.walk(node)
        if isinstance(child, ast.Constant) and isinstance(child.value, str)
    ]


def _names_used(node: ast.AST) -> set[str]:
    """Variable names *node* reads, excluding the callee of a call.

    ``QWidget`` in ``row = QWidget()`` is a ``Name`` too, and following it would
    fuse every widget-building statement in the module into one blob.  Values
    flow through variables, so only variables are traced.
    """
    callees = {
        child.func
        for child in ast.walk(node)
        if isinstance(child, ast.Call) and isinstance(child.func, ast.Name)
    }
    return {
        child.id
        for child in ast.walk(node)
        if isinstance(child, ast.Name) and child not in callees and child.id not in _TAINT_STOPWORDS
    }


def _names_bound(statement: ast.stmt) -> set[str]:
    """Plain local names *statement* assigns to."""
    targets: list[ast.expr] = []
    if isinstance(statement, ast.Assign):
        targets = list(statement.targets)
    elif isinstance(statement, (ast.AnnAssign, ast.AugAssign)):
        targets = [statement.target]
    return {
        target.id
        for target in targets
        if isinstance(target, ast.Name) and target.id not in _TAINT_STOPWORDS
    }


def _called_names(nodes: list[ast.stmt]) -> set[str]:
    """Names of everything called anywhere inside *nodes* — classes and methods."""
    names: set[str] = set()
    for node in nodes:
        for child in ast.walk(node):
            if not isinstance(child, ast.Call):
                continue
            if isinstance(child.func, ast.Name):
                names.add(child.func.id)
            elif isinstance(child.func, ast.Attribute):
                names.add(child.func.attr)
    return names


def _appended_constants(call: ast.Call) -> list[object]:
    """The literal values *call* writes into a list, one level of tuple included.

    A status flag used to be a bare string.  It now travels as a
    ``(short form, explanation)`` pair, so the strip can say what ``CB armed``
    means without growing wider — and the argument to ``append`` became an
    ``ast.Tuple`` whose first element is the string this file is about.

    What this guard pins is *where* the append sits: one straight-line statement,
    with no ``if``, ``for`` or ``try`` above it, so no state can make redaction
    read as off.  The shape of the value appended is not that property, so one
    level of literal tuple is looked through.  Only a literal tuple, and only its
    constant elements: a conditional expression, a call or a name is not an
    ``ast.Constant`` and still fails the count below, which is the whole point.

    Only the tuple's **first** element is read, because that is the slot the strip
    displays (``chrome.py`` puts the short form there and the explanation second).
    Reading every element would reopen the hole the tuple form could otherwise
    punch in this guard: a conditional short form paired with an explanation that
    still says ``redaction: always on`` would satisfy a whole-tuple scan while the
    strip itself read as off — the flag conditional in the one place a user looks,
    and the invariant satisfied by a string nobody sees.
    """
    values: list[object] = []
    for argument in call.args:
        if isinstance(argument, ast.Constant):
            values.append(argument.value)
        elif isinstance(argument, ast.Tuple):
            values += [
                element.value for element in argument.elts[:1] if isinstance(element, ast.Constant)
            ]
    return values


def _redaction_data_flow(module: ast.Module, seed: str) -> list[ast.stmt]:
    """Statements reachable from the redaction row's local variables.

    A line-based scan is easy to slip past: a contributor can build a
    ``ToggleSwitch`` on one line and hand it to ``redaction_layout`` on the next,
    and only the second line says "redact".  So follow the data instead.  Any
    local whose name contains *seed* is tainted; a statement using a tainted name
    is tainted, and taint then spreads both to what that statement binds and to
    the names it reads — which drags in the statement that built the widget.
    """
    statements = [node for node in ast.walk(module) if isinstance(node, _SIMPLE_STATEMENTS)]
    # Precomputed once: the fixpoint below would otherwise re-walk every subtree
    # on every pass, and the settings view is a large module.
    touched_by = [_names_used(statement) | _names_bound(statement) for statement in statements]

    tainted_names = {name for names in touched_by for name in names if seed in name.lower()}
    tainted: set[int] = set()
    changed = True
    while changed:
        changed = False
        for index, touched in enumerate(touched_by):
            if index in tainted or not touched & tainted_names:
                continue
            tainted.add(index)
            tainted_names |= touched
            changed = True
    return [statements[index] for index in sorted(tainted)]


@verifies(SWR.SWR_2119, SWR.SWR_2121)
def test_no_secret_redaction_identifier_survives_in_either_tree() -> None:
    """A user cannot reach a switch that no code names.

    Expected outcome: neither the engine nor the desktop app contains the
    identifier ``secret_redaction`` — no field, no setter, no stale reference
    that a later change could quietly wire up to a real control.
    """
    assert CORE_TREE.is_dir(), f"engine tree moved away from {CORE_TREE}"
    assert DESKTOP_TREE.is_dir(), f"desktop tree moved away from {DESKTOP_TREE}"

    sources = _python_sources(CORE_TREE) + _python_sources(DESKTOP_TREE)
    offenders: list[str] = []
    saw_live_redaction_code = False
    for path in sources:
        text = path.read_text(encoding="utf-8")
        if FORBIDDEN_IDENTIFIER in text:
            offenders.append(str(path.relative_to(REPO_ROOT)))
        if "def redact_secrets(" in text:
            saw_live_redaction_code = True

    # Anchor: the scan really read source.  Without this, a tree that moved
    # would yield zero files and this test would pass by finding nothing.
    assert len(sources) > 100, f"only {len(sources)} sources scanned — tree moved?"
    assert saw_live_redaction_code, "redact_secrets not found — the scan missed live code"

    assert offenders == [], (
        "secret redaction is unconditional by design; these files name a "
        f"{FORBIDDEN_IDENTIFIER} identifier that implies otherwise: {offenders}"
    )


@verifies(SWR.SWR_2119)
def test_the_runtime_policy_carries_no_redaction_field() -> None:
    """Loading a workspace config can never produce "redaction: off".

    Expected outcome: ``RuntimePolicy`` — the model every run's policy is read
    from — has no field whose name mentions redaction, so no YAML key exists
    that a user could set to weaken it.
    """
    fields = set(RuntimePolicy.model_fields)

    # Anchor: this really is the runtime policy, not an empty stand-in.
    assert "allow_outside_workspace" in fields, "RuntimePolicy no longer looks like itself"

    redaction_fields = sorted(name for name in fields if "redact" in name.lower())
    assert redaction_fields == [], (
        f"RuntimePolicy grew redaction-named field(s) {redaction_fields}; "
        "redaction is not configurable"
    )


@verifies(SWR.SWR_2119)
def test_no_rotaris_state_model_or_store_member_mentions_redaction() -> None:
    """The desktop app has nowhere to remember a redaction preference.

    Expected outcome: neither the state dataclasses (``RuntimeToggles`` included)
    nor ``WorkspaceStore`` declares a field, attribute, property, or setter whose
    name mentions redaction — so the settings UI has no state to bind to.
    """
    assert STATE_MODELS.is_file(), f"state models moved away from {STATE_MODELS}"
    assert WORKSPACE_STORE.is_file(), f"workspace store moved away from {WORKSPACE_STORE}"

    members_by_class: dict[str, set[str]] = {}
    for path in (STATE_MODELS, WORKSPACE_STORE):
        _source, module = _parse(path)
        for node in ast.walk(module):
            if not isinstance(node, ast.ClassDef):
                continue
            members = members_by_class.setdefault(node.name, set())
            # Declared fields and class attributes.
            for statement in node.body:
                if isinstance(statement, ast.AnnAssign) and isinstance(statement.target, ast.Name):
                    members.add(statement.target.id)
                elif isinstance(statement, ast.Assign):
                    members |= _names_bound(statement)
                elif isinstance(statement, _FUNCTION_NODES):
                    members.add(statement.name)
            # Attributes the class assigns onto itself, wherever in its body.
            for child in ast.walk(node):
                if not isinstance(child, ast.Attribute) or not isinstance(child.ctx, ast.Store):
                    continue
                if isinstance(child.value, ast.Name) and child.value.id == "self":
                    members.add(child.attr)

    # Anchors: both models that *would* hold such a toggle are present and parsed.
    assert "allow_outside_workspace" in members_by_class.get("RuntimeToggles", set()), (
        "RuntimeToggles no longer holds the runtime flags — the parse found the wrong class"
    )
    assert "runtime" in members_by_class.get("WorkspaceStore", set()), (
        "WorkspaceStore no longer exposes `runtime` — the parse found the wrong class"
    )

    offenders = {
        class_name: sorted(name for name in members if "redact" in name.lower())
        for class_name, members in members_by_class.items()
        if any("redact" in name.lower() for name in members)
    }
    assert offenders == {}, (
        f"the desktop app grew redaction-named member(s): {offenders}; "
        "redaction has no user-visible state"
    )


@verifies(SWR.SWR_2118)
def test_the_settings_redaction_row_is_a_static_label_not_a_toggle() -> None:
    """Settings → Runtime Policy tells the user redaction is on; it does not ask.

    Expected outcome: the redaction row is a plain ``QLabel``, redaction is absent
    from the list that builds the ``ToggleSwitch`` rows, and nothing anywhere in
    the row's data flow builds an operable widget or connects a signal.
    """
    assert SETTINGS_VIEW.is_file(), f"settings view moved away from {SETTINGS_VIEW}"
    _source, module = _parse(SETTINGS_VIEW)

    # Anchor: the static label exists, and exists as a QLabel construction.
    static_labels = [
        node
        for node in ast.walk(module)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "QLabel"
        and node.args
        and isinstance(node.args[0], ast.Constant)
        and node.args[0].value == SETTINGS_LABEL
    ]
    assert len(static_labels) == 1, (
        f"expected exactly one QLabel({SETTINGS_LABEL!r}) in {SETTINGS_VIEW.name}, "
        f"found {len(static_labels)}"
    )

    # The list literal that drives the ToggleSwitch rows must not mention redaction.
    toggle_lists = [
        node
        for node in ast.walk(module)
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == "toggles" for target in node.targets)
        and isinstance(node.value, ast.List)
    ]
    assert len(toggle_lists) == 1, (
        f"expected one runtime `toggles = [...]` list in {SETTINGS_VIEW.name}, "
        f"found {len(toggle_lists)} — the toggle wiring moved"
    )
    toggle_entries = _string_constants(toggle_lists[0])
    # Anchor: this is the real runtime toggle list.
    assert "circuit_breaker" in toggle_entries, "the `toggles` list is not the runtime one"
    redaction_entries = [entry for entry in toggle_entries if "redact" in entry.lower()]
    assert redaction_entries == [], (
        f"redaction entered the runtime toggle list as {redaction_entries}; "
        "that list builds ToggleSwitch widgets"
    )

    # Nothing operable is reachable from the redaction row's variables.
    row_statements = _redaction_data_flow(module, "redact")
    # Anchor: the row is still built here, and the trace found it.
    assert row_statements, f"no redaction row left in {SETTINGS_VIEW.name}"
    called = _called_names(row_statements)
    assert "QLabel" in called, "the redaction row no longer builds its static QLabel"
    assert not called & INTERACTIVE_WIDGETS, (
        f"the settings redaction row now builds {sorted(called & INTERACTIVE_WIDGETS)}; "
        "it must stay a static label"
    )
    assert "connect" not in called, "the settings redaction row now wires a signal"


@verifies(SWR.SWR_2118)
def test_workspace_chrome_states_redaction_unconditionally_and_offers_no_control() -> None:
    """The status chrome reports redaction as a fact, not as a mode.

    Expected outcome: chrome appends "redaction: always on" as a bare statement in
    the refresh body — not behind an ``if`` that some state could make false — and
    that text lands in a read-only ``QLabel``.  The flag may carry the sentence
    that explains it (see :func:`_appended_constants`); it may not carry a
    condition.
    """
    assert CHROME_VIEW.is_file(), f"chrome view moved away from {CHROME_VIEW}"
    _source, module = _parse(CHROME_VIEW)

    unconditional_appends = []
    for node in ast.walk(module):
        if not isinstance(node, _FUNCTION_NODES):
            continue
        for statement in node.body:  # direct children only: no if/for/try wrapper
            # Match the bare statement itself, never its subtree: an `if` wrapper
            # is a *different* node type and so cannot match here.
            if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
                continue
            call = statement.value
            if not isinstance(call.func, ast.Attribute) or call.func.attr != "append":
                continue
            if CHROME_FLAG in _appended_constants(call):
                unconditional_appends.append((node.name, call))

    assert len(unconditional_appends) == 1, (
        f"expected {CHROME_FLAG!r} to be appended exactly once as a bare statement in a "
        f"refresh body of {CHROME_VIEW.name}; found {len(unconditional_appends)} — a "
        "conditional or a loop here would mean redaction can read as off"
    )

    # The flag text goes into a label, so there is no control to operate.
    _function_name, append_call = unconditional_appends[0]
    assert isinstance(append_call.func, ast.Attribute)
    flags_list = append_call.func.value
    assert isinstance(flags_list, ast.Name), (
        f"{CHROME_FLAG!r} is no longer appended to a local list of status flags"
    )
    sink_labels = [
        node
        for node in ast.walk(module)
        if isinstance(node, ast.Assign)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Name)
        and node.value.func.id == "QLabel"
        and any(
            isinstance(target, ast.Attribute) and target.attr == f"{flags_list.id}_label"
            for target in node.targets
        )
    ]
    assert len(sink_labels) == 1, (
        f"the chrome status flags no longer render into a QLabel named "
        f"self.{flags_list.id}_label; a control may have replaced the static text"
    )


@verifies(SWR.SWR_2118)
def test_the_chrome_scan_still_rejects_every_way_of_making_the_flag_conditional() -> None:
    """The guard above is only worth its line count if it can still fail.

    Expected outcome: the four shapes that would let redaction read as off — an
    ``if`` above the append, a loop above it, a conditional expression in the
    pair, and a flag built by a call instead of written down — are each rejected
    by the same matcher that accepts the shipped one.  The scan was widened to see
    a flag that travels beside its explanation, and this is what pins that the
    widening bought nothing else.
    """

    def matches(source: str) -> int:
        module = ast.parse(source)
        found = 0
        for node in ast.walk(module):
            if not isinstance(node, _FUNCTION_NODES):
                continue
            for statement in node.body:
                if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
                    continue
                call = statement.value
                if not isinstance(call.func, ast.Attribute) or call.func.attr != "append":
                    continue
                if CHROME_FLAG in _appended_constants(call):
                    found += 1
        return found

    accepted = (
        f"def refresh(self):\n    flags.append({CHROME_FLAG!r})\n",
        f"def refresh(self):\n    flags.append(({CHROME_FLAG!r}, 'Secret redaction: masked.'))\n",
    )
    for source in accepted:
        assert matches(source) == 1, f"the shipped shape stopped matching:\n{source}"

    rejected = (
        f"def refresh(self):\n    if on:\n        flags.append({CHROME_FLAG!r})\n",
        f"def refresh(self):\n    for _ in modes:\n        flags.append({CHROME_FLAG!r})\n",
        f"def refresh(self):\n    flags.append(({CHROME_FLAG!r} if on else 'off', 'why'))\n",
        # The mirror image, and the reason only the first element is read: the
        # displayed short form is conditional while the literal survives in the
        # explanation slot, where no user ever sees it.
        f"def refresh(self):\n    flags.append(('redaction: off' if on else 'on', {CHROME_FLAG!r}))\n",
        f"def refresh(self):\n    flags.append((label({CHROME_FLAG!r}), 'why'))\n",
    )
    for source in rejected:
        assert matches(source) == 0, f"a conditional flag would now pass the guard:\n{source}"


@verifies(SWR.SWR_2120, SWR.SWR_2121)
def test_no_rotaris_copy_offers_to_disable_or_configure_redaction() -> None:
    """Nothing the user reads — onboarding included — suggests redaction is optional.

    Expected outcome: across the whole desktop app, no string mentioning redaction
    pairs it with disabling, toggling, or configuring, unless the sentence is
    reinforcing the opposite ("cannot be disabled").  The onboarding surface does
    not mention redaction at all.
    """
    assert DESKTOP_TREE.is_dir(), f"desktop tree moved away from {DESKTOP_TREE}"
    assert DASHBOARD_VIEW.is_file(), f"dashboard view moved away from {DASHBOARD_VIEW}"

    all_texts: list[str] = []
    for path in _python_sources(DESKTOP_TREE):
        _source, module = _parse(path)
        all_texts += [text for text in _string_constants(module) if "redact" in text.lower()]

    # Anchors: both informational strings are still there to be checked.
    assert SETTINGS_LABEL in all_texts, f"{SETTINGS_LABEL!r} vanished from the desktop app"
    assert CHROME_FLAG in all_texts, f"{CHROME_FLAG!r} vanished from the desktop app"

    offenders = {
        text: [word for word in CONFIGURABILITY_WORDS if word in text.lower()]
        for text in all_texts
        if any(word in text.lower() for word in CONFIGURABILITY_WORDS)
        and not any(marker in text.lower() for marker in REINFORCING_MARKERS)
    }
    assert offenders == {}, (
        f"desktop copy now describes redaction as changeable: {offenders}; "
        "redaction is always active and must never be advertised otherwise"
    )

    # The onboarding surface stays silent about redaction entirely.
    dashboard_source, dashboard_module = _parse(DASHBOARD_VIEW)
    assert "onboarding" in dashboard_source, (
        f"the onboarding surface left {DASHBOARD_VIEW.name} — this check lost its subject"
    )
    dashboard_mentions = [
        text for text in _string_constants(dashboard_module) if "redact" in text.lower()
    ]
    assert dashboard_mentions == [], (
        f"onboarding copy now mentions redaction: {dashboard_mentions}; "
        "SWR-2120 keeps the first-run flow free of it"
    )
