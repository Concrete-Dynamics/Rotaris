"""Graphical configuration for models, personas, delegation, and runtime policy."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import TYPE_CHECKING, Any

from PySide6.QtCore import Qt, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QComboBox,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLayout,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSpinBox,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces
from shiboken6 import isValid

from rotaris.models.state import (
    HookTrustSummary,
    ModelOption,
    ProviderInfo,
    init_task_label,
    permission_mode_names,
)
from rotaris.theme import available_themes, set_theme, tokens
from rotaris.theme.manager import Themed
from rotaris.views.provider_auth import AddProviderDialog, ProviderAuthDialog, ProviderTask
from rotaris.widgets import (
    Card,
    EmptyState,
    SegmentedControl,
    StatusDot,
    ToggleSwitch,
    make_availability_help,
    make_button,
    populate_model_combo,
    set_action_availability,
)
from rotaris.widgets.hook_trust_dialog import hook_trust_summary

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris.models.state import ProjectInitState
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme


_LOAD_CHOICES = (
    ("on-demand", "name-only"),
    ("always", "on"),
    ("manual only", "user-invocable-only"),
    ("hidden", "off"),
)
_TRIGGER_CHOICES = (
    ("default (both)", "default"),
    ("manual only", "manual-only"),
    ("auto only", "auto-only"),
)
_INIT_ACTION_LABEL = "Initialize Project…"
"""Resting label of the SWR-2805 manual initialization action."""


def _health_color(health: str) -> str:
    """One MCP server's health, as the dot that stands for it.

    A function rather than a table because a table is built once, at import,
    before the user has chosen a theme (SWR-3706). These are the graphical steps
    throughout: the health is written out beside the dot, never encoded in it.
    """
    color = tokens().color
    return {
        "unknown": color.idle,
        "checking": color.wait,
        "healthy": color.run,
        "unreachable": color.fail,
    }.get(health, color.idle)


class _StyledLabel(Themed, QLabel):
    """A label that keeps the recipe for its style instead of the result.

    Settings is full of small captions the application stylesheet has no
    selector for, and most of them are created once and never rebuilt. Holding
    the function that builds the style is what lets those follow a theme
    switch — a resolved size or colour would stay on the palette it was born in.
    """

    def __init__(
        self, text: str, style: Callable[[Theme], str], parent: QWidget | None = None
    ) -> None:
        super().__init__(text, parent)
        self._style = style
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.setStyleSheet(self._style(theme))


# Both vocabularies are spelled out here rather than imported from
# ``rotaris_core.config.schema``: that module is private about them and importing it
# drags the agent SDK into the settings view's import path. The service still assigns
# through ``RuntimePolicy``, so a drift between these tuples and the schema surfaces as
# a caught ``ValidationError`` rather than as a silently accepted bad value.
#: SWR-2507 sandbox modes, in the order the schema accepts them.
SANDBOX_MODES = ("off", "workspace-write", "read-only")
#: SWR-2505 egress dispositions for a host in neither list.
NETWORK_EGRESS_POLICIES = ("allow", "ask", "deny")

_SANDBOX_MODE_HINT = (
    "off runs terminal commands directly on the host. workspace-write confines "
    "writes to the session's workspace plus the writable roots below. read-only "
    "blocks every write. Sandboxing needs an OS backend — Apple Seatbelt on macOS, "
    "bubblewrap on Linux and WSL2 — and a run that asks for a sandbox the host "
    "cannot provide fails instead of running unsandboxed."
)
_WRITABLE_ROOTS_HINT = (
    "Absolute paths that stay writable in workspace-write mode, in addition to the "
    "workspace itself — a shared build or package cache, for example. A relative "
    "path is refused."
)
_EGRESS_POLICY_HINT = (
    "How a host that appears in neither list below is treated. Denied hosts win: a "
    "host in Denied hosts stays denied even when an Allowed hosts pattern also "
    "matches it. A host Rotaris cannot read is denied."
)
_HOST_PATTERN_HINT = (
    "One host per entry. A single leading '*.' is the only wildcard: '*.example.com' "
    "matches api.example.com and a.b.example.com, but not example.com on its own — "
    "list that separately if you want it."
)


@traces(SWR.SWR_2505, SWR.SWR_2507)
def _validated_writable_root(value: str) -> str:
    """Normalize one sandbox writable root, or say why it cannot be used.

    Mirrors ``RuntimePolicy._validate_sandbox_writable_roots``: both POSIX and
    Windows spellings count as absolute, so a workspace configuration stays
    portable between the machines that share it. Checking here rather than at
    save time means the user is told at the control they typed into, instead of
    the model raising on assignment several screens later.
    """
    entry = (value or "").strip()
    if not entry:
        raise ValueError("Enter a path first.")
    if not (PurePosixPath(entry).is_absolute() or PureWindowsPath(entry).is_absolute()):
        raise ValueError(
            f"{entry!r} is not an absolute path. Enter a full path such as /srv/cache or C:\\cache."
        )
    return entry


@traces(SWR.SWR_2505)
def _validated_host_pattern(value: str) -> str:
    """Normalize one egress host pattern, or say why it cannot be used.

    Runs the pattern through the same ``rotaris_core.permissions.network``
    reader the fetch check uses, so an unsupported wildcard is refused at the
    control rather than raising ``ValueError`` later, when a tool call is being
    classified and there is no one to answer.
    """
    from rotaris_core.permissions.network import host_matches, normalize_host

    entry = (value or "").strip().lower().rstrip(".")
    if not entry:
        raise ValueError("Enter a host such as github.com, or a pattern such as *.example.com.")
    if "*" in entry:
        # Raises on every wildcard form except a single leading '*.'.
        host_matches("probe.invalid", entry)
        if not normalize_host(entry[2:]):
            raise ValueError(f"{entry!r} has no host after the '*.' wildcard.")
        return entry
    normalized = normalize_host(entry)
    if not normalized:
        raise ValueError(f"{entry!r} is not a host name Rotaris can read.")
    return normalized


@traces(SWR.SWR_2505, SWR.SWR_2507)
class PatternListEditor(QWidget):
    """An add/remove list of security patterns that validates before accepting.

    Used for the sandbox writable roots and for both egress host lists. The
    ``validate`` callable returns the normalized entry or raises ``ValueError``
    with the sentence the user sees; nothing invalid ever reaches the store, so
    ``RuntimePolicy``'s assignment validators cannot fire on a value the user
    could have been warned about here.
    """

    changed = Signal()

    def __init__(
        self,
        *,
        title: str,
        noun: str,
        placeholder: str,
        hint: str,
        validate: Callable[[str], str],
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._validate = validate
        self._noun = noun
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 6, 0, 2)
        layout.setSpacing(tokens().space.xs)

        caption = _StyledLabel(title, lambda t: f"font-weight:{t.type.weight_display};")
        layout.addWidget(caption)
        hint_label = QLabel(hint)
        hint_label.setObjectName("muted")
        hint_label.setWordWrap(True)
        layout.addWidget(hint_label)

        self.list = QListWidget()
        self.list.setAccessibleName(title)
        self.list.setAccessibleDescription(hint)
        self.list.setMaximumHeight(94)
        self.list.itemSelectionChanged.connect(self._refresh_remove_availability)
        layout.addWidget(self.list)

        self.empty_label = QLabel(f"No {noun} is configured.")
        self.empty_label.setObjectName("muted")
        self.empty_label.setWordWrap(True)
        layout.addWidget(self.empty_label)

        entry_row = QHBoxLayout()
        entry_row.setSpacing(6)
        self.entry = QLineEdit()
        self.entry.setPlaceholderText(placeholder)
        self.entry.setAccessibleName(f"New {noun}")
        self.entry.setAccessibleDescription(hint)
        self.entry.returnPressed.connect(self.add_entry)
        entry_row.addWidget(self.entry, 1)
        self.add_button = make_button(f"Add {noun}", "secondary")
        self.add_button.setAccessibleName(f"Add {noun}")
        self.add_button.clicked.connect(self.add_entry)
        entry_row.addWidget(self.add_button)
        self.remove_button = make_button(f"Remove {noun}", "secondary")
        self.remove_button.setAccessibleName(f"Remove {noun}")
        self.remove_button.clicked.connect(self.remove_selected)
        entry_row.addWidget(self.remove_button)
        layout.addLayout(entry_row)

        # The refusal is a sentence, so it takes the text step of the failure
        # ramp rather than the saturated one a dot would use.
        self.error_label = _StyledLabel("", lambda t: f"color:{t.color.fail_text};")
        self.error_label.setWordWrap(True)
        self.error_label.setAccessibleName(f"{title} entry problem")
        self.error_label.hide()
        layout.addWidget(self.error_label)

        self._refresh_row_state()

    def values(self) -> list[str]:
        """Every entry currently listed, top to bottom."""
        return [self.list.item(row).text() for row in range(self.list.count())]

    def set_values(self, values: list[str]) -> None:
        """Show ``values`` without reporting a change back.

        Signals stay blocked across the rebuild: a reload that emitted would
        mark Settings dirty and write back exactly what it just read.
        """
        if self.values() == list(values):
            self._refresh_row_state()
            return
        self.list.blockSignals(True)
        self.list.clear()
        self.list.addItems(list(values))
        self.list.blockSignals(False)
        self.clear_error()
        self._refresh_row_state()

    def add_entry(self) -> None:
        """Validate the entry field and append it, or explain the refusal."""
        raw = self.entry.text()
        try:
            value = self._validate(raw)
        except ValueError as exc:
            self._show_error(str(exc))
            return
        if value in self.values():
            self._show_error(f"{value} is already listed.")
            return
        self.list.addItem(value)
        self.entry.clear()
        self.clear_error()
        self._refresh_row_state()
        self.changed.emit()

    def remove_selected(self) -> None:
        """Drop every selected entry."""
        rows = sorted((self.list.row(item) for item in self.list.selectedItems()), reverse=True)
        if not rows:
            self._show_error(f"Select a {self._noun} in the list first.")
            return
        for row in rows:
            self.list.takeItem(row)
        self.clear_error()
        self._refresh_row_state()
        self.changed.emit()

    def clear_error(self) -> None:
        self.error_label.clear()
        self.error_label.hide()

    def _show_error(self, message: str) -> None:
        # "Not added" carries the outcome in words; the colour only reinforces it.
        text = f"Not added — {message}"
        self.error_label.setText(text)
        self.error_label.setAccessibleDescription(text)
        self.error_label.show()

    def _refresh_row_state(self) -> None:
        self.empty_label.setVisible(self.list.count() == 0)
        self._refresh_remove_availability()

    def _refresh_remove_availability(self) -> None:
        selected = bool(self.list.selectedItems())
        self.remove_button.setEnabled(selected)
        reason = (
            f"Remove the selected {self._noun} from the list"
            if selected
            else f"Select a {self._noun} in the list to remove it"
        )
        self.remove_button.setToolTip(reason)
        self.remove_button.setAccessibleDescription(reason)


@dataclass(frozen=True, slots=True)
class _SandboxProbeRuntime:
    sandbox_mode: str


@dataclass(frozen=True, slots=True)
class _SandboxProbeConfig:
    """The one field ``sandbox_status`` reads, for the mode being *edited*.

    ``sandbox_status`` is duck-typed on purpose so it can answer for any
    configuration-shaped object. Settings has to ask about the pending
    selection rather than the loaded config, or the verdict would describe the
    last saved mode while the user looks at a different one.
    """

    runtime: _SandboxProbeRuntime

    @classmethod
    def for_mode(cls, mode: str) -> _SandboxProbeConfig:
        return cls(_SandboxProbeRuntime(mode))


@dataclass(slots=True)
class _ProviderRowControls:
    row: QWidget
    dot: StatusDot
    status: QLabel
    detail: QLabel
    check: QPushButton
    authenticate: QPushButton
    logout: QPushButton
    delete: QPushButton | None


@traces(
    SWR.SWR_2006,
    SWR.SWR_2022,
    SWR.SWR_2023,
    SWR.SWR_2031,
    SWR.SWR_2070,
    SWR.SWR_2072,
    SWR.SWR_2073,
    SWR.SWR_2074,
    SWR.SWR_2075,
    SWR.SWR_2076,
    SWR.SWR_2090,
    SWR.SWR_2094,
    SWR.SWR_2095,
    SWR.SWR_2096,
    SWR.SWR_2420,
    SWR.SWR_2424,
    SWR.SWR_2432,
    SWR.SWR_2505,
    SWR.SWR_2507,
    SWR.SWR_2804,
    SWR.SWR_2805,
)
class SettingsView(Themed, QWidget):
    save_requested = Signal()
    discard_requested = Signal()
    agent_popout_changed = Signal(bool)
    terminal_popout_changed = Signal(bool)
    auto_collapse_tools_changed = Signal(bool)
    group_tool_calls_changed = Signal(bool)
    worktree_cleanup_changed = Signal(bool)
    #: The user asked for every resizable pane to go back to its default size
    #: (SWR-3012). The view only states the intent; the window owns the service
    #: that holds the stored sizes and the confirmation the user reads.
    panel_sizes_reset_requested = Signal()
    active_tab_changed = Signal(str)
    #: The user asked to run the pending initialization tasks (SWR-2805).
    #: This view only states the intent; opening the modal is the host's job.
    initialize_project_requested = Signal()
    #: The user asked to read this workspace's hook commands and decide on them
    #: (SWR-2701). The review modal — the only place those commands are shown —
    #: is opened by the host, not here.
    hook_trust_review_requested = Signal()
    #: A Rotaris Cloud sign-in changed the account, so its balance is stale (SWR-3013).
    cloud_credit_refresh_requested = Signal()

    # Positionally aligned with the addTab() call order below, and persisted as
    # the "interface/settingsTab" preference. New ids append to the end: an
    # insertion in the middle silently reassigns every saved preference.
    _TAB_IDS = (
        "models",
        "personas",
        "runtime",
        "interface",
        "display",
        "skills",
        "instructions",
        "hooks",
        "mcp",
        "plugins",
        "tools",
        "project",
    )

    def __init__(
        self,
        store: WorkspaceStore,
        provider_service: Any | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._store = store
        self._provider_service = provider_service
        self._config_service = provider_service
        self._provider_tasks: set[ProviderTask] = set()
        self._active_provider_operations: set[str] = set()
        self._auth_dialog: ProviderAuthDialog | None = None
        self._add_provider_dialog: AddProviderDialog | None = None
        self._content_signature_cache: tuple[Any, ...] | None = None
        self._customization_signature_cache: tuple[Any, ...] | None = None
        # Guards the sandbox availability probe: refresh() also runs on every
        # provider-health tick, and probing the OS backend per repaint would put
        # a filesystem lookup on the Qt event loop for nothing.
        self._security_signature_cache: tuple[Any, ...] | None = None
        # The hook set and its trust verdict live in files, not in the store, so
        # the Hooks tab keeps its own guard: rebuilding the table on every
        # provider-health tick would drop the user's scroll position for nothing.
        self._hook_summary: HookTrustSummary | None = None
        self._provider_controls: dict[str, _ProviderRowControls] = {}
        self._health_check_task: Any | None = None
        root = QVBoxLayout(self)
        root.setContentsMargins(26, 22, 26, 22)
        root.setSpacing(14)
        title = QLabel("Settings")
        title.setObjectName("pageTitle")
        heading = QHBoxLayout()
        heading.addWidget(title)
        self.dirty_label = QLabel("Saved")
        self.dirty_label.setObjectName("muted")
        self.dirty_label.setAccessibleName("Settings save status")
        heading.addWidget(self.dirty_label)
        heading.addStretch(1)
        self.discard_button = make_button("Discard", "secondary")
        self.discard_button.clicked.connect(self.discard_requested.emit)
        heading.addWidget(self.discard_button)
        self.save_button = make_button("Save settings", "primary")
        self.save_button.setAccessibleDescription(
            "Persist model and runtime settings in their selected scopes"
        )
        self.save_button.clicked.connect(self.save_requested.emit)
        heading.addWidget(self.save_button)
        root.addLayout(heading)

        self.tabs = QTabWidget()
        self.tabs.setAccessibleName("Settings categories")
        self.tabs.currentChanged.connect(self._emit_active_tab_changed)
        root.addWidget(self.tabs, 1)

        models_page, models_layout = self._tab_page()

        models = Card("Model slots", accented=True)
        self.model_grid = QGridLayout()
        models.body.addLayout(self.model_grid)
        models_layout.addWidget(models)

        providers = Card("Providers")
        provider_heading = QHBoxLayout()
        provider_heading.addStretch(1)
        self.add_provider_button = _provider_button("Add endpoint", "secondary")
        self.add_provider_button.setToolTip("Add a user-wide OpenAI-compatible endpoint")
        self.add_provider_button.clicked.connect(self._open_add_provider)
        provider_heading.addWidget(self.add_provider_button)
        providers.body.addLayout(provider_heading)
        self.provider_rows = QVBoxLayout()
        providers.body.addLayout(self.provider_rows)
        models_layout.addWidget(providers)
        models_layout.addStretch(1)
        self.tabs.addTab(models_page, "Models")

        personas_page, personas_layout = self._tab_page()
        personas_layout.setContentsMargins(0, 0, 0, 0)
        self.personas_card = Card("Personas", accented=True)
        persona_scope_row = QHBoxLayout()
        persona_scope_row.addWidget(_label("Edit scope"))
        self.persona_scope = SegmentedControl(["Workspace", "Global"])
        self.persona_scope.setAccessibleName("Persona edit scope")
        self.persona_scope.setAccessibleDescription(
            "Choose whether persona model and reasoning edits apply to this workspace or globally"
        )
        self.persona_scope.changed.connect(
            lambda scope: self._store.set_persona_edit_scope(scope.lower())
        )
        persona_scope_row.addWidget(self.persona_scope)
        persona_scope_row.addStretch(1)
        self.personas_card.body.addLayout(persona_scope_row)
        self.persona_table = QTreeWidget()
        self.persona_table.setMinimumHeight(220)
        self.persona_table.setHeaderLabels(
            ["Persona", "Role", "Model", "Reasoning", "Scope", "Tools"]
        )
        self.persona_table.setRootIsDecorated(False)
        self.persona_table.setAccessibleName("Persona model settings")
        header = self.persona_table.header()
        header.setMinimumSectionSize(72)
        for column in range(self.persona_table.columnCount()):
            header.setSectionResizeMode(column, QHeaderView.ResizeMode.Stretch)
        self.personas_card.body.addWidget(self.persona_table, 1)
        self.personas_empty = QLabel(
            "No personas are configured. Add personas to the workspace agents configuration."
        )
        self.personas_empty.setObjectName("muted")
        self.personas_empty.setWordWrap(True)
        self.personas_card.body.addWidget(self.personas_empty)
        personas_layout.addWidget(self.personas_card, 1)
        self.tabs.addTab(personas_page, "Personas")

        runtime_page, runtime_layout = self._tab_page()

        delegation = Card("Delegation", accented=True)
        self.strategy = SegmentedControl(["orchestrator", "swarm", "single"])
        self.strategy.changed.connect(self._store.set_strategy)
        delegation.body.addWidget(self.strategy)
        limits = QGridLayout()
        limits.addWidget(_label("Depth cap"), 0, 0)
        self.depth_spin = QSpinBox()
        self.depth_spin.setRange(1, 12)
        self.depth_spin.valueChanged.connect(self._set_depth)
        limits.addWidget(self.depth_spin, 0, 1)
        limits.addWidget(_label("Fan-out limit"), 1, 0)
        self.fanout = QSpinBox()
        self.fanout.setRange(1, 64)
        self.fanout.valueChanged.connect(self._set_fanout)
        limits.addWidget(self.fanout, 1, 1)
        delegation.body.addLayout(limits)
        runtime_layout.addWidget(delegation)

        runtime = Card("Runtime policy")
        self.runtime_rows = QVBoxLayout()
        runtime.body.addLayout(self.runtime_rows)
        runtime_layout.addWidget(runtime)
        runtime_layout.addWidget(self._build_security_policy_card())
        runtime_layout.addStretch(1)
        self.tabs.addTab(runtime_page, "Runtime")

        interface_page, interface_layout = self._tab_page()
        interface = Card("Interface")

        theme_row = QWidget()
        theme_layout = QHBoxLayout(theme_row)
        theme_layout.setContentsMargins(0, 2, 0, 2)
        theme_copy = QVBoxLayout()
        theme_copy.addWidget(QLabel("Theme"))
        # The description belongs to the *selected* theme, not to the setting:
        # a user choosing an appearance wants to know what they are choosing,
        # and three names on their own do not say it.
        self.theme_hint = QLabel("")
        self.theme_hint.setObjectName("muted")
        self.theme_hint.setWordWrap(True)
        theme_copy.addWidget(self.theme_hint)
        theme_layout.addLayout(theme_copy, 1)
        self.theme_select = QComboBox()
        self.theme_select.setAccessibleName("Theme")
        self.theme_select.setAccessibleDescription(
            "The palette Rotaris paints itself in. Applies immediately."
        )
        for option in available_themes():
            self.theme_select.addItem(option.label, option.name)
        self.theme_select.currentIndexChanged.connect(self._on_theme_selected)
        theme_layout.addWidget(self.theme_select)
        interface.body.addWidget(theme_row)
        self._show_active_theme()

        popout_row = QWidget()
        popout_layout = QHBoxLayout(popout_row)
        popout_layout.setContentsMargins(0, 2, 0, 2)
        popout_copy = QVBoxLayout()
        popout_label = QLabel("Open agent details in separate window")
        popout_hint = QLabel("Off keeps agent inspection docked in Workspace.")
        popout_hint.setObjectName("muted")
        popout_hint.setWordWrap(True)
        popout_copy.addWidget(popout_label)
        popout_copy.addWidget(popout_hint)
        popout_layout.addLayout(popout_copy, 1)
        self.agent_popout_toggle = ToggleSwitch(self._store.ui.agent_popout)
        self.agent_popout_toggle.setAccessibleName("Open agent details in separate window")
        self.agent_popout_toggle.setAccessibleDescription(
            "When enabled, clicking an agent also opens its separate persona window"
        )
        self.agent_popout_toggle.toggled.connect(self.agent_popout_changed.emit)
        popout_layout.addWidget(self.agent_popout_toggle)
        interface.body.addWidget(popout_row)
        terminal_row = QWidget()
        terminal_layout = QHBoxLayout(terminal_row)
        terminal_layout.setContentsMargins(0, 2, 0, 2)
        terminal_copy = QVBoxLayout()
        terminal_label = QLabel("Open the terminal window when a command starts")
        terminal_hint = QLabel(
            "Off shows the live command output inline in the transcript, "
            "where you can still open the terminal window yourself."
        )
        terminal_hint.setObjectName("muted")
        terminal_hint.setWordWrap(True)
        terminal_copy.addWidget(terminal_label)
        terminal_copy.addWidget(terminal_hint)
        terminal_layout.addLayout(terminal_copy, 1)
        self.terminal_popout_toggle = ToggleSwitch(self._store.ui.terminal_popout)
        self.terminal_popout_toggle.setAccessibleName(
            "Open the terminal window when a command starts"
        )
        self.terminal_popout_toggle.setAccessibleDescription(
            "When enabled, the interactive terminal window opens by itself as soon as "
            "an agent runs a shell command"
        )
        self.terminal_popout_toggle.toggled.connect(self.terminal_popout_changed.emit)
        terminal_layout.addWidget(self.terminal_popout_toggle)
        interface.body.addWidget(terminal_row)
        cleanup_row = QWidget()
        cleanup_layout = QHBoxLayout(cleanup_row)
        cleanup_layout.setContentsMargins(0, 2, 0, 2)
        cleanup_copy = QVBoxLayout()
        cleanup_label = QLabel("Prompt to delete worktrees after merge")
        cleanup_hint = QLabel(
            "After merging isolated worktrees, Rotaris asks whether to delete the now-merged worktrees."
        )
        cleanup_hint.setObjectName("muted")
        cleanup_hint.setWordWrap(True)
        cleanup_copy.addWidget(cleanup_label)
        cleanup_copy.addWidget(cleanup_hint)
        cleanup_layout.addLayout(cleanup_copy, 1)
        self.worktree_cleanup_toggle = ToggleSwitch(self._store.ui.worktree_cleanup_prompt_enabled)
        self.worktree_cleanup_toggle.setAccessibleName("Prompt to delete worktrees after merge")
        self.worktree_cleanup_toggle.setAccessibleDescription(
            "When enabled, Rotaris asks whether to delete merged worktrees after successful integration"
        )
        self.worktree_cleanup_toggle.toggled.connect(self.worktree_cleanup_changed.emit)
        cleanup_layout.addWidget(self.worktree_cleanup_toggle)
        interface.body.addWidget(cleanup_row)
        # SWR-3012: pane sizes persist, so they also need a way back. One
        # control, because a user who wants their layout back wants all of it.
        panels_row = QWidget()
        panels_layout = QHBoxLayout(panels_row)
        panels_layout.setContentsMargins(0, 2, 0, 2)
        panels_copy = QVBoxLayout()
        panels_label = QLabel("Panel sizes")
        panels_hint = QLabel(
            "Restores every resizable pane in Rotaris — Workspace, Overview, Mission, Git, "
            "and Library — to its default width and height. Takes effect immediately."
        )
        panels_hint.setObjectName("muted")
        panels_hint.setWordWrap(True)
        panels_copy.addWidget(panels_label)
        panels_copy.addWidget(panels_hint)
        panels_layout.addLayout(panels_copy, 1)
        self.reset_panels_button = make_button("Reset panel sizes", "secondary")
        self.reset_panels_button.setAccessibleName("Reset panel sizes")
        self.reset_panels_button.setAccessibleDescription(
            "Restores every resizable pane in every view to its default size. "
            "Panel sizes are the only thing affected."
        )
        self.reset_panels_button.clicked.connect(self.panel_sizes_reset_requested.emit)
        panels_layout.addWidget(self.reset_panels_button)
        interface.body.addWidget(panels_row)
        interface_layout.addWidget(interface)
        interface_layout.addStretch(1)
        self.tabs.addTab(interface_page, "Interface")

        display_page, display_layout = self._tab_page()
        display = Card("Transcript")
        collapse_row = QWidget()
        collapse_layout = QHBoxLayout(collapse_row)
        collapse_layout.setContentsMargins(0, 2, 0, 2)
        collapse_copy = QVBoxLayout()
        collapse_label = QLabel("Auto-collapse older tool outputs")
        collapse_hint = QLabel(
            "Only the most recent tool call and result stay expanded. "
            "Older tool rows show just the tool name and a clickable expand chevron."
        )
        collapse_hint.setObjectName("muted")
        collapse_hint.setWordWrap(True)
        collapse_copy.addWidget(collapse_label)
        collapse_copy.addWidget(collapse_hint)
        collapse_layout.addLayout(collapse_copy, 1)
        self.auto_collapse_tools_toggle = ToggleSwitch(self._store.ui.auto_collapse_tools)
        self.auto_collapse_tools_toggle.setAccessibleName("Auto-collapse older tool outputs")
        self.auto_collapse_tools_toggle.setAccessibleDescription(
            "When enabled, older tool call and result rows collapse to show only the tool name"
        )
        self.auto_collapse_tools_toggle.toggled.connect(self._store.set_auto_collapse_tools)
        self.auto_collapse_tools_toggle.toggled.connect(self.auto_collapse_tools_changed.emit)
        collapse_layout.addWidget(self.auto_collapse_tools_toggle)
        display.body.addWidget(collapse_row)

        group_row = QWidget()
        group_layout = QHBoxLayout(group_row)
        group_layout.setContentsMargins(0, 2, 0, 2)
        group_copy = QVBoxLayout()
        group_label = QLabel("Group consecutive tool calls")
        group_hint = QLabel(
            "A run of calls of the same kind becomes one row — reading ×17 — that counts "
            "upward and names the call in flight. Click it to see the individual calls."
        )
        group_hint.setObjectName("muted")
        group_hint.setWordWrap(True)
        group_copy.addWidget(group_label)
        group_copy.addWidget(group_hint)
        group_layout.addLayout(group_copy, 1)
        self.group_tool_calls_toggle = ToggleSwitch(self._store.ui.group_tool_calls)
        self.group_tool_calls_toggle.setAccessibleName("Group consecutive tool calls")
        self.group_tool_calls_toggle.setAccessibleDescription(
            "When enabled, consecutive tool calls of the same kind collapse into one "
            "expandable row that shows how many calls ran and which one is running now"
        )
        self.group_tool_calls_toggle.toggled.connect(self._store.set_group_tool_calls)
        self.group_tool_calls_toggle.toggled.connect(self.group_tool_calls_changed.emit)
        group_layout.addWidget(self.group_tool_calls_toggle)
        display.body.addWidget(group_row)

        display_layout.addWidget(display)
        display_layout.addStretch(1)
        self.tabs.addTab(display_page, "Display")

        skills_page, skills_layout = self._tab_page()
        skills = Card("Portable skills", accented=True)
        self.skills_enabled = ToggleSwitch(True)
        self.skills_enabled.setAccessibleName("Enable portable skills")
        self.skills_enabled.setAccessibleDescription(
            "Controls whether any portable skill is injected into newly created agents"
        )
        self.skills_enabled.toggled.connect(self._store.set_skills_enabled)
        skills.add_header_widget(QLabel("Enable skills"))
        skills.add_header_widget(self.skills_enabled)
        self.skill_table = QTreeWidget()
        self.skill_table.setHeaderLabels(["Skill", "Source", "Trigger", "Load", "Description"])
        self.skill_table.setRootIsDecorated(False)
        self.skill_table.setAccessibleName("Portable skill injection settings")
        self.skill_table.header().setStretchLastSection(True)
        skills.body.addWidget(self.skill_table)
        self.skills_empty = QLabel("No portable skills were discovered.")
        self.skills_empty.setObjectName("muted")
        skills.body.addWidget(self.skills_empty)
        skills_layout.addWidget(skills, 1)
        self.tabs.addTab(skills_page, "Skills")

        self._add_inventory_tab("instructions", "Instructions", "Active instruction files")
        # Keeps the "hooks" slot in _TAB_IDS: the tuple is positionally bound to
        # addTab() order and to a persisted preference, so this tab is replaced
        # in place rather than appended.
        self._add_hooks_tab()

        mcp_page, mcp_layout = self._tab_page()
        mcp = Card("Configured servers", accented=True)
        self.check_health_button = make_button("Check status", "secondary")
        self.check_health_button.setAccessibleDescription("Probe every configured MCP server")
        self.check_health_button.setEnabled(self._config_service is not None)
        self.check_health_button.clicked.connect(self._start_health_check)
        mcp.add_header_widget(self.check_health_button)
        self.mcp_rows = QVBoxLayout()
        mcp.body.addLayout(self.mcp_rows)
        mcp_layout.addWidget(mcp)
        mcp_layout.addStretch(1)
        self.tabs.addTab(mcp_page, "MCP Servers")

        self._add_inventory_tab("plugins", "Plugins", "Discovered tool plugins")
        self._add_inventory_tab("tools", "Tools", "Available agent tools")
        self._add_project_tab()

        store.settings_changed.connect(self.refresh)
        store.library_changed.connect(self.refresh)
        store.ui_changed.connect(self._refresh_interface_toggles)
        store.settings_dirty_changed.connect(lambda _dirty: self._refresh_dirty_state())
        store.initialization_changed.connect(lambda _state: self._refresh_project_init())
        self.refresh()
        self._refresh_project_init()
        if provider_service is not None:
            self.refresh_provider_health()
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild the rows that colour themselves as they are built.

        A provider's status dot, an MCP health dot and the sandbox verdict are
        handed a finished colour, so a repolish has nothing to recompute for
        them. :meth:`refresh` rebuilds all three — but it is guarded by
        signatures taken from the store, and a theme change moves nothing the
        store knows about. Dropping the guards is what lets the rebuild happen.
        """
        self._content_signature_cache = None
        self._customization_signature_cache = None
        self._security_signature_cache = None
        self.refresh()

    @traces(SWR.SWR_2804, SWR.SWR_2805)
    def _add_project_tab(self) -> None:
        """Build the Project tab: initialization status plus its one action.

        Everything rendered here is derived from ``store.initialization``; the
        task names come from the task-label registry rather than being written
        out, so an initialization task registered later shows up in this tab
        without a change to this file.
        """
        page, layout = self._tab_page()
        card = Card("Project initialization", accented=True)

        # Size and colour come from the application stylesheet; the headline
        # only asks to be heavier than the detail underneath it.
        self.project_init_status = _StyledLabel(
            "", lambda t: f"font-weight:{t.type.weight_display};"
        )
        self.project_init_status.setWordWrap(True)
        self.project_init_status.setAccessibleName("Project initialization status")
        card.body.addWidget(self.project_init_status)

        self.project_init_detail = QLabel()
        self.project_init_detail.setObjectName("muted")
        self.project_init_detail.setWordWrap(True)
        self.project_init_detail.setAccessibleName("Project initialization details")
        self.project_init_detail.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse
        )
        card.body.addWidget(self.project_init_detail)

        self.project_init_progress = QProgressBar()
        # Indeterminate: the initializer reports steps, not a percentage.
        self.project_init_progress.setRange(0, 0)
        self.project_init_progress.setTextVisible(False)
        self.project_init_progress.setFixedHeight(6)
        self.project_init_progress.setAccessibleName("Project initialization progress")
        self.project_init_progress.setAccessibleDescription(
            "Shown while the initialization tasks are running"
        )
        self.project_init_progress.hide()
        card.body.addWidget(self.project_init_progress)

        action_row = QHBoxLayout()
        self.initialize_project_button = make_button(_INIT_ACTION_LABEL, "primary")
        self.initialize_project_button.clicked.connect(self.initialize_project_requested.emit)
        action_row.addWidget(self.initialize_project_button)
        self.project_init_help = make_availability_help("project initialization")
        action_row.addWidget(self.project_init_help)
        action_row.addStretch(1)
        card.body.addLayout(action_row)

        layout.addWidget(card)
        layout.addStretch(1)
        self.tabs.addTab(page, "Project")

    @traces(SWR.SWR_2804, SWR.SWR_2805)
    def _refresh_project_init(self) -> None:
        """Render the one initialization state the workspace is currently in.

        The five branches are the workflow states ``apps/rotaris/AGENTS.md``
        requires a surface to make explicit: recoverable error, in progress,
        ready, success, and empty. Each names its tasks, and the action states
        its reason whenever it is unavailable.
        """
        state = self._store.initialization
        pending = _task_list(state.pending)
        label = _INIT_ACTION_LABEL
        if state.last_error:
            headline = "Initialization failed"
            detail = state.last_error
            if pending:
                detail = f"{detail} Nothing was recorded, so {pending} can be run again."
            label, enabled, reason = "Retry initialization", True, ""
        elif state.running:
            headline = "Initializing project…"
            detail = (
                f"Running {pending}. This tab updates when the run finishes."
                if pending
                else "Running the pending initialization tasks."
            )
            label, enabled = "Initializing…", False
            reason = "Initialization is already running for this workspace."
        elif state.pending:
            headline = "Initialization pending"
            detail = f"Not run yet: {pending}."
            enabled, reason = True, ""
        elif state.skipped:
            # Skipped tasks are "resolved" only in the sense that they no longer
            # prompt; SWR-2805 exists so the user can still run them from here.
            headline = "Initialization deferred"
            detail = f"You skipped {_task_list(state.skipped)}. Run them whenever you want."
            if state.completed:
                detail = f"{_completed_sentence(state)} {detail}"
            enabled, reason = True, ""
        elif state.completed:
            headline = "Project initialized"
            detail = _completed_sentence(state)
            classification = _classification_sentence(state)
            if classification:
                detail = f"{detail} {classification}"
            enabled = False
            reason = "Every initialization task for this workspace is already resolved."
        else:
            headline = "Nothing to initialize yet"
            detail = (
                "No initialization task applies to this workspace. A task appears here "
                "once the tool it depends on is configured — add it under MCP Servers "
                "and reload the workspace."
            )
            enabled = False
            reason = "No initialization task applies to this workspace yet."

        self.project_init_status.setText(headline)
        self.project_init_status.setAccessibleDescription(detail)
        self.project_init_detail.setText(detail)
        self.project_init_progress.setVisible(state.running)
        self.initialize_project_button.setText(label)
        self.initialize_project_button.setAccessibleName(label)
        set_action_availability(
            self.initialize_project_button,
            enabled=enabled,
            reason=reason,
            help_button=self.project_init_help,
        )

    @traces(SWR.SWR_2505, SWR.SWR_2507)
    def _build_security_policy_card(self) -> Card:
        """Build the sandbox and network egress controls for the Runtime tab.

        One card rather than two: both answer the same question — how far an
        agent's commands may reach beyond this workspace — and both are off or
        unrestricted-by-default, so a user who cannot tell what they do will
        leave them that way. Every control states its effect in the hint rather
        than in a tooltip.
        """
        space = tokens().space
        card = Card("Sandbox and network egress", accented=True)

        intro = QLabel(
            "How far agent commands in this workspace may reach: which paths a "
            "terminal command may write to, and which hosts the agent may open. "
            "These are the workspace defaults and apply to every new session."
        )
        intro.setObjectName("muted")
        intro.setWordWrap(True)
        card.body.addWidget(intro)

        mode_row = QHBoxLayout()
        mode_row.setContentsMargins(0, space.xs, 0, 0)
        mode_row.addWidget(QLabel("Sandbox mode"))
        mode_row.addStretch(1)
        self.sandbox_mode_combo = QComboBox()
        self.sandbox_mode_combo.setAccessibleName("Sandbox mode")
        self.sandbox_mode_combo.setAccessibleDescription(_SANDBOX_MODE_HINT)
        self.sandbox_mode_combo.addItems(SANDBOX_MODES)
        self.sandbox_mode_combo.currentTextChanged.connect(self._set_sandbox_mode)
        mode_row.addWidget(self.sandbox_mode_combo)
        card.body.addLayout(mode_row)

        mode_hint = QLabel(_SANDBOX_MODE_HINT)
        mode_hint.setObjectName("muted")
        mode_hint.setWordWrap(True)
        card.body.addWidget(mode_hint)

        self.sandbox_availability = QLabel()
        self.sandbox_availability.setWordWrap(True)
        self.sandbox_availability.setAccessibleName("Sandbox availability")
        self.sandbox_availability.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse
        )
        card.body.addWidget(self.sandbox_availability)

        network_row = QWidget()
        network_layout = QHBoxLayout(network_row)
        network_layout.setContentsMargins(0, space.xs, 0, 2)
        network_copy = QVBoxLayout()
        network_copy.addWidget(QLabel("Allow network access inside the sandbox"))
        sandbox_network_hint = QLabel(
            "Off keeps sandboxed commands off the network entirely. Only applies "
            "while the sandbox mode is not off; the egress policy below still "
            "governs what the agent's own fetch tool may open."
        )
        sandbox_network_hint.setObjectName("muted")
        sandbox_network_hint.setWordWrap(True)
        network_copy.addWidget(sandbox_network_hint)
        network_layout.addLayout(network_copy, 1)
        self.sandbox_network_toggle = ToggleSwitch(False)
        self.sandbox_network_toggle.setAccessibleName("Allow network access inside the sandbox")
        self.sandbox_network_toggle.setAccessibleDescription(
            "When enabled, processes started inside the sandbox may reach the network"
        )
        self.sandbox_network_toggle.toggled.connect(self._set_sandbox_allow_network)
        network_layout.addWidget(self.sandbox_network_toggle)
        card.body.addWidget(network_row)

        self.sandbox_roots_editor = PatternListEditor(
            title="Sandbox writable roots",
            noun="writable root",
            placeholder="/srv/build-cache",
            hint=_WRITABLE_ROOTS_HINT,
            validate=_validated_writable_root,
        )
        self.sandbox_roots_editor.changed.connect(
            lambda: self._store.set_runtime_list(
                "sandbox_writable_roots", self.sandbox_roots_editor.values()
            )
        )
        card.body.addWidget(self.sandbox_roots_editor)

        egress_row = QHBoxLayout()
        egress_row.setContentsMargins(0, space.sm, 0, 0)
        egress_row.addWidget(QLabel("Network egress policy"))
        egress_row.addStretch(1)
        self.network_policy_combo = QComboBox()
        self.network_policy_combo.setAccessibleName("Network egress policy")
        self.network_policy_combo.setAccessibleDescription(_EGRESS_POLICY_HINT)
        self.network_policy_combo.addItems(NETWORK_EGRESS_POLICIES)
        self.network_policy_combo.currentTextChanged.connect(self._set_network_egress_policy)
        egress_row.addWidget(self.network_policy_combo)
        card.body.addLayout(egress_row)

        egress_hint = QLabel(_EGRESS_POLICY_HINT)
        egress_hint.setObjectName("muted")
        egress_hint.setWordWrap(True)
        card.body.addWidget(egress_hint)

        self.network_allowed_editor = PatternListEditor(
            title="Allowed hosts",
            noun="allowed host",
            placeholder="github.com or *.npmjs.org",
            hint=_HOST_PATTERN_HINT,
            validate=_validated_host_pattern,
        )
        self.network_allowed_editor.changed.connect(
            lambda: self._store.set_runtime_list(
                "network_allowed_hosts", self.network_allowed_editor.values()
            )
        )
        card.body.addWidget(self.network_allowed_editor)

        self.network_denied_editor = PatternListEditor(
            title="Denied hosts",
            noun="denied host",
            placeholder="metadata.example.com",
            hint=f"{_HOST_PATTERN_HINT} An entry here wins over Allowed hosts.",
            validate=_validated_host_pattern,
        )
        self.network_denied_editor.changed.connect(
            lambda: self._store.set_runtime_list(
                "network_denied_hosts", self.network_denied_editor.values()
            )
        )
        card.body.addWidget(self.network_denied_editor)
        return card

    @traces(SWR.SWR_2505, SWR.SWR_2507)
    def _refresh_security_policy(self) -> None:
        """Show the stored sandbox and egress policy without writing it back.

        Every control is repopulated behind ``blockSignals``; a reload that
        re-emitted would mark Settings dirty and persist what it had just read.
        The work is skipped entirely while the six values are unchanged, so the
        provider-health tick that calls :meth:`refresh` does not re-probe the
        host's sandbox backend several times a second.
        """
        runtime = self._store.runtime
        signature = (
            runtime.sandbox_mode,
            bool(runtime.sandbox_allow_network),
            tuple(runtime.sandbox_writable_roots),
            runtime.network_egress_policy,
            tuple(runtime.network_allowed_hosts),
            tuple(runtime.network_denied_hosts),
        )
        if signature == self._security_signature_cache:
            return
        self._security_signature_cache = signature

        _select_text(self.sandbox_mode_combo, runtime.sandbox_mode)
        self.sandbox_network_toggle.blockSignals(True)
        self.sandbox_network_toggle.setChecked(bool(runtime.sandbox_allow_network))
        self.sandbox_network_toggle.blockSignals(False)
        self.sandbox_roots_editor.set_values(list(runtime.sandbox_writable_roots))
        _select_text(self.network_policy_combo, runtime.network_egress_policy)
        self.network_allowed_editor.set_values(list(runtime.network_allowed_hosts))
        self.network_denied_editor.set_values(list(runtime.network_denied_hosts))
        self._refresh_sandbox_availability()

    @traces(SWR.SWR_2507)
    def _refresh_sandbox_availability(self) -> None:
        """State whether the selected sandbox mode can actually run on this host.

        Rotaris on native Windows has no sandbox backend, so the honest answer
        is often "unavailable". The backend's own reason and remediation are
        shown verbatim rather than paraphrased: they name the mechanism that is
        missing and the supported way to get it.
        """
        from rotaris_core.sandbox import session as sandbox_session

        # The verdict is a sentence, so every branch below picks a *text* step:
        # the saturated step these states use for a dot does not clear 4.5:1.
        color_tokens = tokens().color
        mode = self._store.runtime.sandbox_mode
        try:
            active, backend = sandbox_session.sandbox_status(_SandboxProbeConfig.for_mode(mode))
        except ValueError:
            # Only reachable if the store was written past the selector; say so
            # rather than letting a repaint raise out of the event loop.
            text = f"{mode!r} is not a sandbox mode Rotaris knows. Choose one from the list."
            self.sandbox_availability.setText(text)
            self.sandbox_availability.setAccessibleDescription(text)
            self.sandbox_availability.setStyleSheet(f"color:{color_tokens.wait_text};")
            return
        if active:
            text = (
                f"Sandbox active: the {backend} backend wraps every terminal command "
                "in this workspace."
            )
            color = color_tokens.text_secondary
        else:
            # Read off the session module rather than off ``sandbox.backends``
            # so this and ``sandbox_status`` above resolve the same probe: one
            # seam to fake, and no way for the verdict and its reason to
            # disagree. Not in that module's ``__all__``, hence the ignore.
            availability = sandbox_session.probe_sandbox()  # type: ignore[attr-defined]
            if availability.available:
                text = (
                    f"Sandbox available on this host ({availability.backend}), but not "
                    "applied: the sandbox mode is off."
                )
                color = color_tokens.text_secondary
            else:
                parts = ["Sandbox unavailable on this host.", availability.reason]
                if availability.remediation:
                    parts.append(availability.remediation)
                if mode == "off":
                    parts.append("Leave the mode off until a backend is available.")
                else:
                    parts.append("A run that asks for this mode will fail rather than start.")
                text = " ".join(part for part in parts if part)
                color = color_tokens.wait_text
        self.sandbox_availability.setText(text)
        self.sandbox_availability.setAccessibleDescription(text)
        self.sandbox_availability.setStyleSheet(f"color:{color};")

    @traces(SWR.SWR_2507)
    def _set_sandbox_mode(self, mode: str) -> None:
        """Store the selected sandbox mode; a widening change is confirmed first."""
        if not mode or mode == self._store.runtime.sandbox_mode:
            return
        if mode == "off":
            answer = QMessageBox.warning(
                self,
                "Turn the sandbox off?",
                "Terminal commands will run directly on this host, with no limit on "
                "the paths they may write to beyond the permission mode.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer is not QMessageBox.StandardButton.Yes:
                self._restore_security_controls()
                return
        self._store.set_runtime_toggle("sandbox_mode", mode)

    @traces(SWR.SWR_2507)
    def _set_sandbox_allow_network(self, allowed: bool) -> None:
        self._store.set_runtime_toggle("sandbox_allow_network", bool(allowed))

    @traces(SWR.SWR_2505)
    def _set_network_egress_policy(self, disposition: str) -> None:
        """Store the egress disposition; 'allow' widens access, so it is confirmed."""
        if not disposition or disposition == self._store.runtime.network_egress_policy:
            return
        if disposition == "allow":
            answer = QMessageBox.warning(
                self,
                "Allow every host by default?",
                "Agents will open any host that is not in Denied hosts, without "
                "asking you first. Denied hosts still win.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer is not QMessageBox.StandardButton.Yes:
                self._restore_security_controls()
                return
        self._store.set_runtime_toggle("network_egress_policy", disposition)

    def _restore_security_controls(self) -> None:
        """Put the controls back on the stored values after a cancelled change."""
        self._security_signature_cache = None
        self._refresh_security_policy()

    def active_tab_id(self) -> str:
        """Return the stable identifier for the visible settings category."""
        index = self.tabs.currentIndex()
        return self._TAB_IDS[index] if index >= 0 else self._TAB_IDS[0]

    def set_active_tab(self, tab_id: str) -> str:
        """Select *tab_id*, falling back to Models for stale preferences."""
        try:
            index = self._TAB_IDS.index(tab_id)
        except ValueError:
            index = 0
        self.tabs.setCurrentIndex(index)
        return self._TAB_IDS[index]

    def _emit_active_tab_changed(self, index: int) -> None:
        if index >= 0:
            self.active_tab_changed.emit(self._TAB_IDS[index])

    @traces(SWR.SWR_2701, SWR.SWR_2704)
    def _add_hooks_tab(self) -> None:
        """Build the Hooks tab: the effective hook set and its trust verdict.

        The table deliberately stops at name, event, matcher and scope. A
        workspace hook's *command* is written by whoever wrote the repository,
        so it is shown only inside the review dialog the user opens on purpose —
        never in a table the tab renders by itself.
        """
        page, layout = self._tab_page()
        card = Card("Lifecycle hooks", accented=True)

        self.hook_trust_label = QLabel()
        self.hook_trust_label.setWordWrap(True)
        self.hook_trust_label.setAccessibleName("Workspace hook trust status")
        self.hook_trust_label.setObjectName("muted")
        card.body.addWidget(self.hook_trust_label)

        self.review_hooks_button = make_button("Review workspace hooks…", "secondary")
        self.review_hooks_button.setAccessibleName("Review workspace hooks")
        self.review_hooks_button.clicked.connect(self.hook_trust_review_requested.emit)
        card.add_header_widget(self.review_hooks_button)

        self.hooks_table = QTreeWidget()
        self.hooks_table.setHeaderLabels(["Hook", "Event", "Matches", "Source", "Status"])
        self.hooks_table.setRootIsDecorated(False)
        self.hooks_table.setAccessibleName("Lifecycle hooks")
        self.hooks_table.setAccessibleDescription(
            "Every hook this workspace would run, with the scope that declared it "
            "and whether it is allowed"
        )
        self.hooks_table.header().setStretchLastSection(True)
        card.body.addWidget(self.hooks_table)

        self.hooks_empty = QLabel()
        self.hooks_empty.setObjectName("muted")
        self.hooks_empty.setWordWrap(True)
        self.hooks_empty.setAccessibleName("Hook list status")
        card.body.addWidget(self.hooks_empty)

        layout.addWidget(card, 1)
        self.tabs.addTab(page, "Hooks")

    @property
    def hook_summary(self) -> HookTrustSummary:
        """The hook set and verdict currently rendered (recomputed on demand)."""
        if self._hook_summary is None:
            self.refresh_hooks()
        return self._hook_summary or HookTrustSummary()

    @traces(SWR.SWR_2701, SWR.SWR_2704)
    def refresh_hooks(self) -> None:
        """Recompute the effective hook set and re-render the Hooks tab."""
        config = getattr(self._config_service, "config", None)
        workspace = getattr(self._config_service, "workspace", None)
        summary = (
            hook_trust_summary(config, workspace)
            if config is not None and workspace is not None
            else HookTrustSummary()
        )
        if summary == self._hook_summary:
            return
        self._hook_summary = summary

        self.hooks_table.clear()
        for hook in summary.hooks:
            status = "allowed" if hook.allowed else "blocked — not reviewed"
            item = QTreeWidgetItem(
                [
                    hook.name,
                    hook.event,
                    hook.matcher or "every tool call",
                    hook.scope_label,
                    status,
                ]
            )
            # Never the command: a blocked workspace hook's text is exactly what
            # must not appear outside the review dialog.
            item.setToolTip(
                4,
                (
                    "Runs during this workspace's sessions."
                    if hook.allowed
                    else "Skipped until you review this workspace's hooks."
                ),
            )
            self.hooks_table.addTopLevelItem(item)
        for column in range(self.hooks_table.columnCount()):
            self.hooks_table.resizeColumnToContents(column)

        self.hooks_empty.setText(
            "No lifecycle hooks are configured. Declare them under `hooks:` in "
            "agents.yaml to run a command around agent activity."
        )
        self.hooks_empty.setVisible(not summary.hooks)
        self.hook_trust_label.setText(
            f"{summary.status_label} {summary.notice}".strip()
            if summary.notice
            else summary.status_label
        )
        set_action_availability(
            self.review_hooks_button,
            enabled=bool(summary.pending),
            reason=(
                "" if summary.pending else "This workspace declares no hooks of its own to review."
            ),
        )

    @traces(SWR.SWR_2424)
    def _add_inventory_tab(self, tab_id: str, label: str, title: str) -> None:
        """Build a read-only Name/Source/Description table tab for *tab_id*."""
        page, layout = self._tab_page()
        card = Card(title, accented=True)
        table = QTreeWidget()
        table.setHeaderLabels(["Name", "Source", "Description"])
        table.setRootIsDecorated(False)
        table.setAccessibleName(label)
        table.header().setStretchLastSection(True)
        empty = QLabel(f"No {label.lower()} are active for this workspace.")
        empty.setObjectName("muted")
        card.body.addWidget(table)
        card.body.addWidget(empty)
        layout.addWidget(card, 1)
        setattr(self, f"{tab_id}_table", table)
        setattr(self, f"{tab_id}_empty", empty)
        self.tabs.addTab(page, label)

    def _start_health_check(self) -> None:
        if self._config_service is None or self._config_service.config is None:
            return
        if self._health_check_task is not None and self._health_check_task.isRunning():
            return
        from rotaris.services.mcp_health import McpHealthCheckTask

        configured = self._config_service.config.mcp_servers
        pending = {}
        for server in self._store.mcp_servers:
            if not server.available:
                self._store.set_mcp_health(
                    server.name, "unreachable", detail="Command not found on PATH"
                )
            elif server.name in configured:
                pending[server.name] = configured[server.name]
                self._store.set_mcp_health(server.name, "checking")
        if not pending:
            return
        self.check_health_button.setEnabled(False)
        task = McpHealthCheckTask(self._config_service.workspace, pending, parent=self)
        task.server_checked.connect(self._on_server_checked)
        task.finished.connect(self._on_health_check_finished)
        self._health_check_task = task
        task.start()

    def _on_server_checked(self, name: str, healthy: bool, error: str, tool_count: object) -> None:
        self._store.set_mcp_health(
            name,
            "healthy" if healthy else "unreachable",
            detail=error,
            tool_count=tool_count if isinstance(tool_count, int) else None,
        )

    def _on_health_check_finished(self) -> None:
        self.check_health_button.setEnabled(self._config_service is not None)
        self._health_check_task = None

    def _show_active_theme(self) -> None:
        """Select the running theme and describe it, without echoing a change back."""
        active = tokens()
        index = self.theme_select.findData(active.name)
        if index >= 0:
            blocked = self.theme_select.blockSignals(True)
            self.theme_select.setCurrentIndex(index)
            self.theme_select.blockSignals(blocked)
        self.theme_hint.setText(active.description)

    @traces(SWR.SWR_3701)
    def _on_theme_selected(self, index: int) -> None:
        """Apply the chosen theme to the running application.

        Applied here rather than routed through the host because a theme is an
        application-level service like the panel layout, not view state — the
        manager repaints every open window itself, including this one, and there
        is nothing for `MainWindow` to coordinate.
        """
        name = self.theme_select.itemData(index)
        if not isinstance(name, str):
            return
        set_theme(name)
        self.theme_hint.setText(tokens().description)

    @staticmethod
    def _tab_page() -> tuple[QScrollArea, QVBoxLayout]:
        """Build one independently scrollable Settings category page."""
        page = QScrollArea()
        page.setWidgetResizable(True)
        page.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        page.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        content = QWidget()
        layout = QVBoxLayout(content)
        layout.setSizeConstraint(QLayout.SizeConstraint.SetMinimumSize)
        layout.setContentsMargins(0, tokens().space.md, 0, 0)
        layout.setSpacing(14)
        page.setWidget(content)
        return page, layout

    def refresh(self) -> None:
        self._refresh_dirty_state()
        # Ahead of the content-signature short circuit: the six sandbox and
        # egress fields are not part of that signature, so a change to one of
        # them would otherwise never reach its controls.
        self._refresh_security_policy()
        # Also ahead of the short circuit: the hook set and its verdict live in
        # files the store knows nothing about, so no store signature can report
        # that they changed.
        self.refresh_hooks()
        content_signature = self._content_signature()
        if content_signature == self._content_signature_cache:
            self._refresh_provider_controls()
            self._refresh_customizations()
            return
        self._content_signature_cache = content_signature
        _clear(self.model_grid)
        catalog = self._store.model_options
        for grid_row, (slot, model) in enumerate(self._store.model_slots):
            self.model_grid.addWidget(_label(slot), grid_row, 0)
            combo = QComboBox()
            combo.setAccessibleName(f"Model for {slot}")
            populate_model_combo(combo, catalog, current=model)
            combo.currentTextChanged.connect(
                lambda value, name=slot: self._set_model_slot(name, value)
            )
            self.model_grid.addWidget(combo, grid_row, 1)

            thinking = QComboBox()
            thinking.setAccessibleName(f"Thinking strength for {slot}")
            thinking.setAccessibleDescription(
                f"Reasoning or thinking strength used by the model in {slot}"
            )
            choices = self._store.model_thinking_choices.get(model, [None])
            configurable = len(choices) > 1
            selected = self._store.model_slot_thinking.get(slot)
            if selected is not None and selected not in choices:
                choices = [*choices, selected]
            for level in choices:
                thinking.addItem(level or "Provider default", level)
            selected_index = thinking.findData(selected)
            thinking.setCurrentIndex(max(0, selected_index))
            thinking.setEnabled(configurable)
            if not configurable:
                thinking.setToolTip("This model does not expose configurable thinking strength.")
            thinking.currentIndexChanged.connect(
                lambda index, name=slot, control=thinking: self._set_model_slot_thinking(
                    name, control.itemData(index)
                )
            )
            self.model_grid.addWidget(thinking, grid_row, 2)
        if not self._store.model_slots:
            self.model_grid.addWidget(
                QLabel("No model slots are configured for this workspace."), 0, 0, 1, 3
            )

        _clear(self.provider_rows)
        self._provider_controls.clear()
        self.add_provider_button.setEnabled(
            self._provider_service is not None
            and "__register__" not in self._active_provider_operations
        )
        if not self._store.providers:
            self.provider_rows.addWidget(
                EmptyState(
                    "No providers discovered",
                    "Configure a provider or model endpoint before starting a run.",
                    compact=True,
                )
            )
        for provider in self._store.providers:
            provider_row = QWidget()
            row_layout = QVBoxLayout(provider_row)
            row_layout.setContentsMargins(0, 5, 0, 5)
            status_layout = QHBoxLayout()
            dot = StatusDot(size=7)
            dot.set_state(_provider_status_colors(provider.status).dot)
            dot.setToolTip(provider.detail)
            status_layout.addWidget(dot)
            status_layout.addWidget(QLabel(provider.label))
            status = QLabel(provider.status.replace("_", " "))
            status.setStyleSheet(_provider_status_style(provider.status))
            status.setAccessibleName(f"{provider.label} status")
            status_layout.addWidget(status)
            detail = _StyledLabel(
                provider.detail,
                lambda t: f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};",
            )
            status_layout.addWidget(detail, 1)
            row_layout.addLayout(status_layout)
            actions = QHBoxLayout()
            actions.addStretch(1)
            busy = provider.id in self._active_provider_operations
            if provider.quick_start_url:
                quick_start = _provider_button("Quick Start", "warning")
                quick_start.setAccessibleName(f"{provider.label} quick start")
                quick_start.setToolTip("Open the Rotaris Cloud quick start guide")
                quick_start.clicked.connect(
                    lambda _checked=False, url=provider.quick_start_url: self._open_quick_start(url)
                )
                actions.addWidget(quick_start)
            check = _provider_button("Check")
            check.setToolTip("Provider operation in progress" if busy else "Check provider health")
            check.setEnabled(self._provider_service is not None and not busy)
            check.setAccessibleName(f"Check {provider.label} health")
            check.clicked.connect(lambda _checked=False, pid=provider.id: self._check_provider(pid))
            actions.addWidget(check)
            authenticate = _provider_button(
                "Re-authenticate" if provider.has_credentials else "Authenticate"
            )
            authenticate.setToolTip(
                "Re-authenticate provider" if provider.connected else "Authenticate provider"
            )
            authenticate.setEnabled(bool(provider.auth_flow) and not busy)
            if not provider.auth_flow:
                authenticate.setToolTip("This provider has no supported authentication flow")
            elif busy:
                authenticate.setToolTip("Provider operation in progress")
            authenticate.setAccessibleName(
                f"{'Re-authenticate' if provider.connected else 'Authenticate'} {provider.label}"
            )
            authenticate.clicked.connect(
                lambda _checked=False, item=provider: self._open_auth(item)
            )
            actions.addWidget(authenticate)
            logout = _provider_button("Log out")
            logout.setEnabled(bool(provider.has_credentials) and not busy)
            logout.setToolTip(
                "Provider operation in progress"
                if busy
                else (
                    "Remove stored credentials but keep this provider"
                    if provider.has_credentials
                    else "No stored credentials to remove"
                )
            )
            logout.clicked.connect(
                lambda _checked=False, item=provider: self._logout_provider(item)
            )
            actions.addWidget(logout)
            delete: QPushButton | None = None
            if provider.user_defined:
                delete = _provider_button("Delete", "danger")
                delete.setEnabled(not busy)
                delete.setToolTip(
                    "Provider operation in progress"
                    if busy
                    else "Permanently delete this user-wide endpoint"
                )
                delete.clicked.connect(
                    lambda _checked=False, item=provider: self._delete_provider(item)
                )
                actions.addWidget(delete)
            row_layout.addLayout(actions)
            self.provider_rows.addWidget(provider_row)
            self._provider_controls[provider.id] = _ProviderRowControls(
                row=provider_row,
                dot=dot,
                status=status,
                detail=detail,
                check=check,
                authenticate=authenticate,
                logout=logout,
                delete=delete,
            )

        self.strategy.set_value(self._store.delegation.strategy)
        for widget, value in (
            (self.depth_spin, self._store.delegation.depth_cap),
            (self.fanout, self._store.delegation.fanout_limit),
        ):
            widget.blockSignals(True)
            widget.setValue(value)
            widget.blockSignals(False)

        _clear(self.runtime_rows)
        toggles = [
            ("Circuit breaker", "circuit_breaker"),
            ("Allow outside workspace", "allow_outside_workspace"),
            ("Improvement loop", "improvement_loop"),
        ]
        for text, field in toggles:
            toggle_row = QWidget()
            layout = QHBoxLayout(toggle_row)
            layout.setContentsMargins(0, 2, 0, 2)
            layout.addWidget(QLabel(text))
            layout.addStretch(1)
            toggle = ToggleSwitch(bool(getattr(self._store.runtime, field)))
            toggle.setAccessibleName(text)
            toggle.setAccessibleDescription(
                f"{text} is {'enabled' if toggle.isChecked() else 'disabled'}"
            )
            toggle.toggled.connect(
                lambda checked, name=field: self._set_runtime_toggle(name, checked)
            )
            layout.addWidget(toggle)
            self.runtime_rows.addWidget(toggle_row)

        mode_row = QWidget()
        mode_layout = QHBoxLayout(mode_row)
        mode_layout.setContentsMargins(0, 2, 0, 2)
        mode_layout.addWidget(QLabel("Permission mode"))
        mode_layout.addStretch(1)
        permission_combo = QComboBox()
        permission_combo.setAccessibleName("Permission mode")
        permission_combo.setAccessibleDescription(
            "How much agents may do without asking: restricted, ask, or autonomous"
        )
        permission_combo.addItems(permission_mode_names())
        permission_combo.setCurrentText(self._store.runtime.permission_mode)
        permission_combo.currentTextChanged.connect(self._set_permission_mode)
        mode_layout.addWidget(permission_combo)
        self.runtime_rows.addWidget(mode_row)

        self.runtime_rows.addWidget(self._released_run_permission_row())

        redaction_row = QWidget()
        redaction_layout = QHBoxLayout(redaction_row)
        redaction_layout.setContentsMargins(0, 2, 0, 2)
        redaction_label = QLabel("Secret redaction: always active")
        # Stated, not offered: the stylesheet's muted step is what says "this is
        # a fact about Rotaris" rather than "this is a control you left off".
        redaction_label.setObjectName("muted")
        redaction_layout.addWidget(redaction_label)
        redaction_layout.addStretch(1)
        self.runtime_rows.addWidget(redaction_row)

        for label_text, field, minimum, maximum, suffix in (
            ("Compression threshold", "compression_threshold_pct", 50, 95, "%"),
            ("Iteration cap", "iteration_cap", 1, 500, " iterations"),
        ):
            value_row = QWidget()
            value_layout = QHBoxLayout(value_row)
            value_layout.setContentsMargins(0, 2, 0, 2)
            value_layout.addWidget(QLabel(label_text))
            value_layout.addStretch(1)
            spin = QSpinBox()
            spin.setRange(minimum, maximum)
            spin.setSuffix(suffix)
            spin.setValue(int(getattr(self._store.runtime, field)))
            spin.setAccessibleName(label_text)
            spin.valueChanged.connect(
                lambda value, name=field: self._store.set_runtime_toggle(name, value)
            )
            value_layout.addWidget(spin)
            self.runtime_rows.addWidget(value_row)

        self.persona_scope.set_value(self._store.persona_edit_scope.title())
        self.persona_table.clear()
        slots = [name for name, _model in self._store.model_slots]
        # Personas may target a slot ("large_model") as well as a concrete model.
        model_options = [ModelOption(name) for name in dict.fromkeys(slots)] + [
            option for option in self._store.model_options if option.name not in set(slots)
        ]
        for persona in self._store.personas:
            displayed_model = self._store.persona_value(persona.name, "model")
            displayed_reasoning = self._store.persona_value(persona.name, "reasoning")
            item = QTreeWidgetItem(
                [persona.name, persona.role, "", "", "", ", ".join(persona.tools)]
            )
            self.persona_table.addTopLevelItem(item)

            persona_model_combo = QComboBox()
            persona_model_combo.setAccessibleName(f"Model for persona {persona.name}")
            populate_model_combo(persona_model_combo, model_options, current=displayed_model)
            persona_model_combo.currentTextChanged.connect(
                lambda value, name=persona.name: self._store.set_persona_model(name, value)
            )
            self.persona_table.setItemWidget(item, 2, persona_model_combo)

            reasoning = QComboBox()
            reasoning.setAccessibleName(f"Reasoning for persona {persona.name}")
            reasoning_model = dict(self._store.model_slots).get(displayed_model, displayed_model)
            model_choices = self._store.model_thinking_choices.get(reasoning_model, [None])
            persona_choices: list[str] = [
                "default",
                "provider_default",
                *[str(value) for value in model_choices if value is not None],
            ]
            selected = displayed_reasoning or "default"
            if selected not in persona_choices:
                persona_choices.append(selected)
            for level in persona_choices:
                label = {
                    "default": "Default",
                    "provider_default": "Provider default",
                }.get(level, level)
                reasoning.addItem(label, level)
            reasoning.blockSignals(True)
            selected_index = reasoning.findData(selected)
            reasoning.setCurrentIndex(max(0, selected_index))
            reasoning.blockSignals(False)
            reasoning.currentIndexChanged.connect(
                lambda index, name=persona.name, control=reasoning: (
                    self._store.set_persona_reasoning(name, control.itemData(index) or "")
                )
            )
            self.persona_table.setItemWidget(item, 3, reasoning)

            scope_widget = QWidget()
            scope_layout = QVBoxLayout(scope_widget)
            scope_layout.setContentsMargins(0, 0, 0, 0)
            scope_layout.setSpacing(1)
            for field in ("model", "reasoning"):
                origin = self._store.persona_value_origin(persona.name, field)
                field_row = QHBoxLayout()
                field_row.setContentsMargins(0, 0, 0, 0)
                field_row.addWidget(_label(f"{field.title()}: {origin}"))
                if origin == self._store.persona_edit_scope:
                    unset = _provider_button("Unset")
                    unset.setAccessibleName(f"Unset {field} override for {persona.name}")
                    unset.setToolTip(f"Fall back to the lower-precedence {field} value")
                    unset.clicked.connect(
                        lambda _checked=False, name=persona.name, target=field: (
                            self._store.unset_persona_override(name, target)
                        )
                    )
                    field_row.addWidget(unset)
                scope_layout.addLayout(field_row)
            self.persona_table.setItemWidget(item, 4, scope_widget)
        self.personas_empty.setVisible(self.persona_table.topLevelItemCount() == 0)

        self._refresh_customizations()

    def _refresh_interface_toggles(self) -> None:
        self.agent_popout_toggle.blockSignals(True)
        self.agent_popout_toggle.setChecked(self._store.ui.agent_popout)
        self.terminal_popout_toggle.setChecked(self._store.ui.terminal_popout)
        self.agent_popout_toggle.blockSignals(False)
        self.worktree_cleanup_toggle.blockSignals(True)
        self.worktree_cleanup_toggle.setChecked(self._store.ui.worktree_cleanup_prompt_enabled)
        self.worktree_cleanup_toggle.blockSignals(False)

    def _refresh_customizations(self) -> None:
        # Skill/MCP/inventory rows are rebuilt from scratch, so only touch them when their
        # source data actually changed — refresh() also runs on every provider health tick.
        customization_signature = self._customization_signature()
        if customization_signature == self._customization_signature_cache:
            return
        self._customization_signature_cache = customization_signature
        self.skills_enabled.blockSignals(True)
        self.skills_enabled.setChecked(self._store.skills_enabled)
        self.skills_enabled.blockSignals(False)
        self.skill_table.clear()
        for skill in self._store.skills:
            item = QTreeWidgetItem([skill.name, skill.scope, "", "", skill.description])
            item.setToolTip(4, skill.description)
            if skill.shadowed_paths:
                item.setText(1, f"{skill.scope}  ⓘ")
                item.setToolTip(
                    1,
                    "Workspace skill wins. Ignored duplicate(s):\n"
                    + "\n".join(skill.shadowed_paths),
                )
            self.skill_table.addTopLevelItem(item)
            trigger = QComboBox()
            trigger.setAccessibleName(f"Invocation policy for {skill.name}")
            for label, value in _TRIGGER_CHOICES:
                trigger.addItem(label, value)
            trigger.setCurrentIndex(trigger.findData(skill.invocation_mode))
            trigger.currentIndexChanged.connect(
                lambda _index, name=skill.name, control=trigger: (
                    self._store.set_skill_invocation_mode(name, str(control.currentData()))
                )
            )
            self.skill_table.setItemWidget(item, 2, trigger)
            load = QComboBox()
            load.setAccessibleName(f"Load policy for {skill.name}")
            for label, value in _LOAD_CHOICES:
                load.addItem(label, value)
            load.setCurrentIndex(load.findData(skill.load_mode))
            load.currentIndexChanged.connect(
                lambda _index, name=skill.name, control=load: self._store.set_skill_load_mode(
                    name, str(control.currentData())
                )
            )
            self.skill_table.setItemWidget(item, 3, load)
        self.skills_empty.setVisible(self.skill_table.topLevelItemCount() == 0)

        _clear(self.mcp_rows)
        for server in self._store.mcp_servers:
            row = QWidget()
            layout = QHBoxLayout(row)
            dot = StatusDot(_health_color(server.health), size=8)
            dot.set_state(_health_color(server.health), pulse=server.health == "checking")
            dot.setToolTip(server.health_detail or server.health)
            layout.addWidget(dot)
            layout.addWidget(QLabel(f"{server.name} · {server.type}"))
            detail = QLabel(server.description)
            detail.setObjectName("muted")
            layout.addWidget(detail, 1)
            layout.addWidget(QLabel(server.source))
            toggle = ToggleSwitch(server.enabled and server.available)
            toggle.setEnabled(server.available)
            toggle.setToolTip("Command not found on PATH" if not server.available else "")
            toggle.toggled.connect(
                lambda enabled, name=server.name: self._store.set_mcp_enabled(name, enabled)
            )
            layout.addWidget(toggle)
            self.mcp_rows.addWidget(row)
        if not self._store.mcp_servers:
            self.mcp_rows.addWidget(
                EmptyState("No MCP servers", "Configure a server in agents.yaml.", compact=True)
            )

        workspace = getattr(self._config_service, "workspace", None)
        inventories: dict[str, list[tuple[str, str, str]]] = {
            "instructions": [],
            "plugins": [],
            "tools": [],
        }
        if workspace is not None:
            workspace = Path(workspace)
            for path in (workspace / "AGENTS.md", workspace / "AGENTS.override.md"):
                if path.exists():
                    inventories["instructions"].append((path.name, "workspace", str(path)))
            plugin_dir = workspace / ".rotaris" / "plugins"
            if plugin_dir.is_dir():
                inventories["plugins"].extend(
                    (path.stem, "workspace", str(path)) for path in sorted(plugin_dir.glob("*.py"))
                )
        from rotaris_core.agents.factory import TOOL_NAME_MAP

        inventories["tools"] = [
            (name, "built-in", target) for name, target in sorted(TOOL_NAME_MAP.items())
        ]
        for tab_id, entries in inventories.items():
            table = getattr(self, f"{tab_id}_table")
            table.clear()
            for name, source, description in entries:
                item = QTreeWidgetItem([name, source, description])
                item.setToolTip(2, description)
                table.addTopLevelItem(item)
            getattr(self, f"{tab_id}_empty").setVisible(not entries)

    def _customization_signature(self) -> tuple[Any, ...]:
        return (
            self._store.skills_enabled,
            tuple(
                (
                    skill.name,
                    skill.scope,
                    skill.description,
                    skill.invocation_mode,
                    skill.load_mode,
                    skill.shadowed_paths,
                )
                for skill in self._store.skills
            ),
            tuple(
                (
                    server.name,
                    server.type,
                    server.description,
                    server.source,
                    server.enabled,
                    server.available,
                    server.health,
                    server.health_detail,
                )
                for server in self._store.mcp_servers
            ),
            str(getattr(self._config_service, "workspace", "")),
        )

    def _content_signature(self) -> tuple[Any, ...]:
        return (
            tuple(self._store.model_catalog),
            tuple(self._store.model_slots),
            tuple(sorted(self._store.model_slot_thinking.items())),
            tuple(
                (name, tuple(values))
                for name, values in sorted(self._store.model_thinking_choices.items())
            ),
            tuple(
                (provider.id, provider.label, provider.auth_flow, provider.user_defined)
                for provider in self._store.providers
            ),
            (
                self._store.delegation.strategy,
                self._store.delegation.depth_cap,
                self._store.delegation.fanout_limit,
            ),
            (
                self._store.runtime.circuit_breaker,
                self._store.runtime.allow_outside_workspace,
                self._store.runtime.improvement_loop,
                self._store.runtime.compression_threshold_pct,
                self._store.runtime.iteration_cap,
            ),
            self._store.persona_edit_scope,
            tuple(sorted(self._store.persona_scope_values.items())),
            tuple(
                (
                    persona.name,
                    persona.role,
                    persona.model,
                    persona.reasoning,
                    persona.model_scope,
                    persona.reasoning_scope,
                    tuple(persona.tools),
                )
                for persona in self._store.personas
            ),
        )

    def _refresh_provider_controls(self) -> None:
        self.add_provider_button.setEnabled(
            self._provider_service is not None
            and "__register__" not in self._active_provider_operations
        )
        for provider in self._store.providers:
            controls = self._provider_controls.get(provider.id)
            if controls is None:
                continue
            controls.dot.set_state(_provider_status_colors(provider.status).dot)
            controls.dot.setToolTip(provider.detail)
            controls.status.setText(provider.status.replace("_", " "))
            controls.status.setStyleSheet(_provider_status_style(provider.status))
            controls.detail.setText(provider.detail)
            busy = provider.id in self._active_provider_operations
            controls.check.setToolTip(
                "Provider operation in progress" if busy else "Check provider health"
            )
            controls.check.setEnabled(self._provider_service is not None and not busy)
            controls.authenticate.setText(
                "Re-authenticate" if provider.has_credentials else "Authenticate"
            )
            controls.authenticate.setAccessibleName(
                f"{'Re-authenticate' if provider.connected else 'Authenticate'} {provider.label}"
            )
            controls.authenticate.setEnabled(bool(provider.auth_flow) and not busy)
            if not provider.auth_flow:
                controls.authenticate.setToolTip(
                    "This provider has no supported authentication flow"
                )
            elif busy:
                controls.authenticate.setToolTip("Provider operation in progress")
            else:
                controls.authenticate.setToolTip(
                    "Re-authenticate provider" if provider.connected else "Authenticate provider"
                )
            controls.logout.setEnabled(bool(provider.has_credentials) and not busy)
            controls.logout.setToolTip(
                "Provider operation in progress"
                if busy
                else (
                    "Remove stored credentials but keep this provider"
                    if provider.has_credentials
                    else "No stored credentials to remove"
                )
            )
            if controls.delete is not None:
                controls.delete.setEnabled(not busy)
                controls.delete.setToolTip(
                    "Provider operation in progress"
                    if busy
                    else "Permanently delete this user-wide endpoint"
                )

    def _set_model_slot(self, slot: str, value: str) -> None:
        self._store.model_slots = [
            (name, value if name == slot else model) for name, model in self._store.model_slots
        ]
        choices = self._store.model_thinking_choices.get(value, [None])
        if self._store.model_slot_thinking.get(slot) not in choices:
            self._store.model_slot_thinking[slot] = None
        self._store.mark_settings_dirty()

    def _set_model_slot_thinking(self, slot: str, value: str | None) -> None:
        if self._store.model_slot_thinking.get(slot) == value:
            return
        self._store.model_slot_thinking[slot] = value
        self._store.mark_settings_dirty()

    def _set_depth(self, value: int) -> None:
        self._store.delegation.depth_cap = value
        self._store.mark_settings_dirty()

    def _set_fanout(self, value: int) -> None:
        self._store.delegation.fanout_limit = value
        self._store.mark_settings_dirty()

    def _set_runtime_toggle(self, name: str, checked: bool) -> None:
        if name == "allow_outside_workspace" and checked:
            answer = QMessageBox.warning(
                self,
                "Allow access outside workspace?",
                "Agents may read or modify files outside the selected workspace. "
                "Enable this only when the task explicitly requires it.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer is not QMessageBox.StandardButton.Yes:
                self.refresh()
                return
        self._store.set_runtime_toggle(name, checked)

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    @traces(SWR.SWR_3707)
    def _released_run_permission_row(self) -> QWidget:
        """The switch for what a requirement released on the board is given.

        It sits under the permission mode it overrides, and it is a preference
        rather than a runtime field: the elevation is a fact about how *this
        desktop* starts requirement runs, not about the project, so it does not
        belong in the workspace's configuration and takes no Save.

        This row is also the only place the behaviour is visible once the user
        has told the release dialog not to appear again (SWR-3707, AC-6).
        """
        from rotaris.services.requirement_run_permissions import (
            full_permission_runs,
            set_full_permission_runs,
        )

        row = QWidget()
        layout = QVBoxLayout(row)
        layout.setContentsMargins(0, 2, 0, 2)

        top = QHBoxLayout()
        top.setContentsMargins(0, 0, 0, 0)
        label = QLabel("Released requirements run with full permissions")
        top.addWidget(label)
        top.addStretch(1)
        self.released_run_toggle = ToggleSwitch(full_permission_runs())
        self.released_run_toggle.setAccessibleName(
            "Released requirements run with full permissions"
        )
        self.released_run_toggle.setAccessibleDescription(
            "A requirement released on the board runs unattended, so it is given every "
            "tool and does not stop to ask. Turned off, it follows the permission mode "
            "above and may stop partway."
        )
        self.released_run_toggle.toggled.connect(set_full_permission_runs)
        top.addWidget(self.released_run_toggle)
        layout.addLayout(top)

        note = QLabel(
            "Nobody is watching a released run, so a permission prompt it raises has "
            "nobody to answer it. Turn this off and a release follows the mode above."
        )
        note.setObjectName("muted")
        note.setWordWrap(True)
        layout.addWidget(note)
        return row

    def _set_permission_mode(self, mode: str) -> None:
        """Store the chosen preset, confirming the permission-widening one.

        Settings keeps its explicit Save/Discard flow, so unlike the composer
        chip this only marks the store dirty; it never reaches a live run.
        """
        if not mode or mode == self._store.runtime.permission_mode:
            return
        if mode == "autonomous":
            answer = QMessageBox.warning(
                self,
                "Switch to autonomous mode?",
                "Agents will run mutating tools inside the workspace without asking "
                "you first. Calls touching paths outside the workspace still need "
                "your approval.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if answer is not QMessageBox.StandardButton.Yes:
                self.refresh()
                return
        self._store.set_runtime_toggle("permission_mode", mode)

    def _refresh_dirty_state(self) -> None:
        dirty = self._store.ui.settings_dirty
        self.dirty_label.setText("Unsaved changes" if dirty else "Saved")
        # Cleared rather than repainted when saved: the label already carries
        # the `muted` objectName, so the application stylesheet says "settled"
        # and only the unsaved state needs a colour of its own — the text step,
        # because this is a word and not a dot.
        self.dirty_label.setStyleSheet(f"color:{tokens().color.wait_text};" if dirty else "")
        self.save_button.setEnabled(dirty and self._provider_service is not None)
        self.discard_button.setEnabled(dirty)

    def refresh_provider_health(self) -> None:
        for provider in list(self._store.providers):
            if provider.auth_flow:
                self._check_provider(provider.id)

    def _check_provider(self, provider_id: str) -> None:
        if self._provider_service is None:
            return
        self._set_provider_status(
            provider_id, status="checking", detail="Checking provider health…"
        )
        self._start_task(
            provider_id,
            lambda _prompt: self._provider_service.check_provider_health(provider_id),
        )

    def _open_quick_start(self, url: str) -> None:
        QDesktopServices.openUrl(QUrl(url))

    def _open_auth(self, provider: Any) -> None:
        if self._provider_service is None or not provider.auth_flow:
            return
        dialog = ProviderAuthDialog(
            provider.label,
            provider.auth_flow,
            reauth=provider.status not in {"unauthenticated", "unknown"},
            parent=self,
        )
        dialog.submitted.connect(lambda api_key: self._authenticate(provider.id, api_key, dialog))
        self._auth_dialog = dialog
        dialog.open()

    def _open_add_provider(self) -> None:
        service = self._provider_service
        if service is None:
            return
        builtin_providers = service.addable_builtin_providers()
        dialog = AddProviderDialog(self, builtin_providers=builtin_providers)
        dialog.submitted.connect(
            lambda label, url, key: self._register_provider(label, url, key, dialog)
        )
        dialog.builtin_selected.connect(
            lambda provider_id: self._authenticate_builtin_provider(provider_id, builtin_providers)
        )
        self._add_provider_dialog = dialog
        dialog.open()

    def _authenticate_builtin_provider(
        self, provider_id: str, builtin_providers: list[tuple[str, str, str]]
    ) -> None:
        self._add_provider_dialog = None
        label, auth_flow = next(
            (label, flow) for pid, label, flow in builtin_providers if pid == provider_id
        )
        self._open_auth(ProviderInfo(provider_id, label, False, "", "unauthenticated", auth_flow))

    def _register_provider(
        self, label: str, base_url: str, api_key: str, dialog: AddProviderDialog
    ) -> None:
        service = self._provider_service
        if service is None:
            return
        self._start_task(
            "__register__",
            lambda _prompt: service.register_openai_compatible_provider(label, base_url, api_key),
            on_success=lambda result: self._registration_succeeded(result, dialog),
            on_failure=dialog.set_error,
        )

    def _authenticate(
        self,
        provider_id: str,
        api_key: str,
        dialog: ProviderAuthDialog,
    ) -> None:
        service = self._provider_service
        if service is None:
            return
        existing = self._provider(provider_id)
        reauth = existing is not None and existing.status not in {"unauthenticated", "unknown"}
        self._start_task(
            provider_id,
            lambda prompt: service.authenticate_provider(
                provider_id,
                api_key=api_key,
                reauth=reauth,
                on_prompt=prompt,
                cancel_event=dialog.cancel_event,
            ),
            dialog=dialog,
            on_success=lambda result: self._authentication_succeeded(provider_id, result, dialog),
        )

    def _authentication_succeeded(
        self,
        provider_id: str,
        result: Any,
        dialog: ProviderAuthDialog | None,
    ) -> None:
        self._provider_task_succeeded(provider_id, result, dialog)
        if result.connected and provider_id in {"codex", "copilot"}:
            self._refresh_subscription_limits()
        if provider_id == "concrete-cloud":
            # Signing in — or out of a failed attempt — changes which account the
            # balance belongs to, so the reading it replaces is meaningless.
            self.cloud_credit_refresh_requested.emit()

    @traces(SWR.SWR_3013)
    def authenticate_rotaris_cloud(self) -> None:
        """Start Rotaris Cloud sign-in, for a surface that is not this one."""
        provider = self._provider("concrete-cloud")
        if provider is not None:
            self._open_auth(provider)

    def _refresh_subscription_limits(self) -> None:
        service = self._provider_service
        if service is None:
            return
        task = ProviderTask(lambda _prompt: service.refresh_subscription_limits())
        self._provider_tasks.add(task)
        task.succeeded.connect(self._subscription_limits_refreshed)
        task.finished.connect(lambda: self._provider_tasks.discard(task))
        task.start()

    def _subscription_limits_refreshed(self, limits: Any) -> None:
        if not isValid(self):
            return
        self._store.subscription_limits = limits
        self._store.settings_changed.emit()

    def _logout_provider(self, provider: Any) -> None:
        if self._provider_service is None:
            return
        answer = QMessageBox.question(
            self,
            "Log out provider",
            f"Remove stored authentication for {provider.label}?",
        )
        if answer is not QMessageBox.StandardButton.Yes:
            return
        self._set_provider_status(provider.id, status="checking", detail="Logging out…")
        self._start_task(
            provider.id,
            lambda _prompt: self._provider_service.logout_provider(provider.id),
        )

    def _delete_provider(self, provider: Any) -> None:
        service = self._provider_service
        if service is None:
            return
        references = [
            f"slot {slot}"
            for slot, model in self._store.model_slots
            if model.startswith(f"{provider.id}/")
        ]
        references.extend(
            f"persona {persona.name}"
            for persona in self._store.personas
            if persona.model.startswith(f"{provider.id}/")
        )
        affected = ", ".join(references) if references else "none in this workspace"
        answer = QMessageBox.warning(
            self,
            "Delete provider user-wide?",
            f"Delete {provider.label} ({provider.id}) for every workspace on this computer?\n\n"
            f"Current workspace references: {affected}.\n"
            "Those references will remain unchanged for manual repair. Other workspaces were not inspected.",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Cancel,
        )
        if answer is not QMessageBox.StandardButton.Yes:
            return
        self._set_provider_status(provider.id, status="checking", detail="Deleting provider…")
        self._start_task(
            provider.id,
            lambda _prompt: service.delete_openai_compatible_provider(provider.id),
            on_success=self._deletion_succeeded,
        )

    def _start_task(
        self,
        provider_id: str,
        operation: Any,
        *,
        dialog: ProviderAuthDialog | None = None,
        on_success: Any | None = None,
        on_failure: Any | None = None,
    ) -> None:
        self._active_provider_operations.add(provider_id)
        self.refresh()
        task = ProviderTask(operation)
        self._provider_tasks.add(task)
        if dialog is not None:
            task.prompt.connect(dialog.set_prompt)
        success_handler = on_success or (
            lambda result: self._provider_task_succeeded(provider_id, result, dialog)
        )
        failure_handler = on_failure or (
            lambda message: self._provider_task_failed(provider_id, message, dialog)
        )
        task.succeeded.connect(lambda result: self._provider_task_signal(success_handler, result))
        task.failed.connect(lambda message: self._provider_task_signal(failure_handler, message))
        task.finished.connect(lambda: self._provider_task_finished(provider_id, task))
        task.start()

    def _provider_task_signal(self, handler: Any, value: Any) -> None:
        if isValid(self):
            handler(value)

    def _provider_task_finished(self, provider_id: str, task: ProviderTask) -> None:
        self._provider_tasks.discard(task)
        self._active_provider_operations.discard(provider_id)
        if isValid(self):
            self.refresh()

    def _registration_succeeded(self, result: Any, dialog: AddProviderDialog) -> None:
        if not result.success:
            dialog.set_error(result.message)
            return
        service = self._provider_service
        if service is None:
            dialog.set_error("Provider service is unavailable.")
            return
        service.refresh_provider_catalog()
        dialog.accept()
        self._add_provider_dialog = None
        self._check_provider(result.provider_id)

    def _deletion_succeeded(self, result: Any) -> None:
        if not result.success:
            self._set_provider_status(result.provider_id, status="error", detail=result.message)
            return
        service = self._provider_service
        if service is not None:
            service.refresh_provider_catalog()

    def _provider_task_succeeded(
        self,
        provider_id: str,
        result: Any,
        dialog: ProviderAuthDialog | None,
    ) -> None:
        self._replace_provider(result)
        if dialog is not None:
            if result.connected:
                dialog.accept()
                self._auth_dialog = None
            else:
                dialog.set_error(result.detail)

    def _provider_task_failed(
        self,
        provider_id: str,
        message: str,
        dialog: ProviderAuthDialog | None,
    ) -> None:
        self._set_provider_status(provider_id, status="error", detail=message, connected=False)
        if dialog is not None:
            dialog.set_error(message)

    def _provider(self, provider_id: str) -> Any:
        return next((item for item in self._store.providers if item.id == provider_id), None)

    def _replace_provider(self, replacement: Any) -> None:
        existing = self._provider(replacement.id)
        if existing is None:
            # First-time auth of a builtin provider (e.g. via the "Add provider"
            # dropdown) — it has no row yet, so append instead of replacing.
            self._store.providers = [*self._store.providers, replacement]
            self._store.settings_changed.emit()
            return
        replacement.user_defined = existing.user_defined
        if replacement.status == "error" and existing.has_credentials:
            replacement.has_credentials = True
        self._store.providers = [
            replacement if item.id == replacement.id else item for item in self._store.providers
        ]
        self._store.settings_changed.emit()

    def _set_provider_status(
        self,
        provider_id: str,
        *,
        status: str,
        detail: str,
        connected: bool | None = None,
    ) -> None:
        provider = self._provider(provider_id)
        provider.status = status
        provider.detail = detail
        if connected is not None:
            provider.connected = connected
        self._store.settings_changed.emit()


def _label(text: str) -> QLabel:
    """The small caption that names the control beside it."""
    return _StyledLabel(
        text, lambda t: f"font-size:{t.type.scale.xs}px;color:{t.color.text_secondary};"
    )


def _select_text(combo: QComboBox, value: str) -> None:
    """Show ``value`` in ``combo`` without emitting a change back to the store.

    An unrecognized value is added rather than silently replaced by the first
    item: on a security selector, showing a setting the user did not choose is
    worse than showing one the product does not know.
    """
    combo.blockSignals(True)
    if combo.findText(value) < 0:
        combo.addItem(value)
    combo.setCurrentText(value)
    combo.blockSignals(False)


def _provider_button(text: str, variant: str = "secondary") -> QPushButton:
    button = make_button(text, variant)
    button.setProperty("compact", True)
    button.setSizePolicy(QSizePolicy.Policy.Maximum, QSizePolicy.Policy.Fixed)
    return button


def _clear(layout: QLayout) -> None:
    while layout.count():
        item = layout.takeAt(0)
        if item.widget():
            item.widget().deleteLater()
        elif item.layout():
            _clear(item.layout())


@traces(SWR.SWR_2805)
def _task_list(tasks: tuple[str, ...]) -> str:
    """Join initialization task ids as their display labels, or "" for none."""
    return ", ".join(init_task_label(task) for task in tasks)


@traces(SWR.SWR_2805)
def _completed_sentence(state: ProjectInitState) -> str:
    """Name the tasks that ran, and when, without naming any of them here."""
    completed = _task_list(state.completed)
    if not completed:
        return ""
    day = state.last_run.split("T")[0] if state.last_run else ""
    return f"Completed: {completed}{f' on {day}' if day else ''}."


@traces(SWR.SWR_2804)
def _classification_sentence(state: ProjectInitState) -> str:
    """Explain what the recorded ``code`` / ``non-code`` verdict meant (SWR-2804)."""
    if state.classification == "non-code":
        return "No code memories were created — this workspace is a documentation-only project."
    if state.classification == "code":
        return "Code memories were created from this workspace's sources."
    return ""


@dataclass(frozen=True, slots=True)
class _StatusColors:
    """One provider state in both of the forms this row paints it.

    Two values rather than one because the dot and the word beside it owe
    different ratios — 3:1 for a shape, 4.5:1 for text — and on this ground no
    single step of a ramp clears both. Keeping them together is what stops the
    row picking the shape's colour for its label.
    """

    dot: str
    word: str


def _provider_status_colors(status: str) -> _StatusColors:
    """The dot and the status word for one provider health value."""
    color = tokens().color
    return {
        "checking": _StatusColors(color.info_state, color.info_text),
        "healthy": _StatusColors(color.run, color.run_text),
        "warning": _StatusColors(color.wait, color.wait_text),
        "unauthenticated": _StatusColors(color.fail, color.fail_text),
        "error": _StatusColors(color.fail, color.fail_text),
    }.get(status, _StatusColors(color.idle, color.idle_text))


def _provider_status_style(status: str) -> str:
    """The status word's own style, kept in one place for both writers of it."""
    t = tokens()
    return f"font-size:{t.type.scale.x2s}px;color:{_provider_status_colors(status).word};"
