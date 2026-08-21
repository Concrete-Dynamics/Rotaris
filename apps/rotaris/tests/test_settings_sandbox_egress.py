"""Settings ▸ Runtime: reaching the sandbox and egress policy without a text editor.

SWR-2507 and SWR-2505 are already enforced by the engine; until these controls
existed the only way to turn either on was to hand-edit ``agents.yaml``, so the
shipped answer for every desktop user was the default — no sandbox, and an
egress policy nobody had seen. These tests drive the controls the way a user
reaches them (switch to the Runtime tab, pick a mode, type a host, save) and
then read the result back off the workspace configuration the next session
loads, so a control that renders but does not persist fails here.

The host's own sandbox verdict is always forced: Rotaris on native Windows
probes as unavailable by design, and a test that believed its own host would
assert something different on every machine.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from PySide6.QtWidgets import (
    QComboBox,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QPushButton,
)
from rotaris_core.config.bootstrap import write_minimal_agents_yaml
from rotaris_core.config.loader import load_config
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox import SandboxAvailability
from ui_query import click_by_name, find_by_accessible_name, settle, type_text

from rotaris.models.store import WorkspaceStore
from rotaris.services.config_service import ConfigService
from rotaris.views.settings import SettingsView
from rotaris.widgets import ToggleSwitch

if TYPE_CHECKING:
    from pathlib import Path

    from pytestqt.qtbot import QtBot

pytestmark = pytest.mark.integration

_AVAILABLE = SandboxAvailability(available=True, backend="bubblewrap")
_UNAVAILABLE = SandboxAvailability(
    available=False,
    backend="unavailable",
    reason="Rotaris ships no OS-level sandbox backend for this platform.",
    remediation="Run Rotaris inside WSL2, where the bubblewrap backend is available.",
)


def _force_sandbox(monkeypatch: pytest.MonkeyPatch, verdict: SandboxAvailability) -> None:
    """Make the host answer ``verdict``, whatever this machine can really do.

    One seam covers both readers: ``sandbox_status`` and the settings view take
    the probe off the same module attribute, so the verdict and the reason
    shown beside it cannot disagree.
    """
    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda *_args, **_kwargs: verdict,
    )


def _workspace(tmp_path: Path) -> Path:
    """A real workspace whose agents.yaml the product's own loader can read."""
    write_minimal_agents_yaml(tmp_path / ".rotaris" / "agents.yaml")
    return tmp_path


def _service(workspace: Path) -> ConfigService:
    """A loaded ConfigService over a real workspace.

    Only the two network-touching projections are stubbed: a real
    ``_providers()`` probes every configured endpoint and costs 5-18 s.
    """
    service = ConfigService(workspace, WorkspaceStore())
    service._providers = lambda: []  # type: ignore[method-assign]
    service._subscription_limits = lambda: []  # type: ignore[method-assign]
    service.load()
    return service


def _open_runtime_tab(qtbot: QtBot, service: ConfigService) -> SettingsView:
    """Show Settings at its smallest supported size, on the Runtime tab."""
    view = SettingsView(service.store, provider_service=service)
    view.save_requested.connect(service.save)
    qtbot.addWidget(view)
    view.resize(1000, 680)
    view.show()
    qtbot.waitExposed(view)
    view.set_active_tab("runtime")
    qtbot.waitUntil(lambda: view.tabs.tabText(view.tabs.currentIndex()) == "Runtime")
    settle(qtbot)
    return view


def _combo(view: SettingsView, name: str) -> QComboBox:
    return find_by_accessible_name(view, name, QComboBox, visible_only=True)


def _entry(view: SettingsView, noun: str) -> QLineEdit:
    return find_by_accessible_name(view, f"New {noun}", QLineEdit, visible_only=True)


def _list(view: SettingsView, title: str) -> QListWidget:
    return find_by_accessible_name(view, title, QListWidget, visible_only=True)


def _listed(view: SettingsView, title: str) -> list[str]:
    widget = _list(view, title)
    return [widget.item(row).text() for row in range(widget.count())]


def _problem(view: SettingsView, title: str) -> str:
    return find_by_accessible_name(view, f"{title} entry problem", QLabel, visible_only=True).text()


def _add(qtbot: QtBot, view: SettingsView, noun: str, value: str) -> None:
    type_text(qtbot, _entry(view, noun), value)
    click_by_name(qtbot, view, f"Add {noun}", QPushButton)


def _verdict(view: SettingsView) -> str:
    return find_by_accessible_name(view, "Sandbox availability", QLabel, visible_only=True).text()


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_all_six_sandbox_and_egress_settings_round_trip_through_settings(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: an operator confines a workspace's agents from the Settings window.
    Expected outcome: all six sandbox and egress settings persist to the workspace
    configuration and come back on the controls when the workspace is loaded again."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)

    _combo(view, "Sandbox mode").setCurrentText("workspace-write")
    _add(qtbot, view, "writable root", "/srv/build-cache")
    click_by_name(qtbot, view, "Allow network access inside the sandbox", ToggleSwitch)
    _combo(view, "Network egress policy").setCurrentText("deny")
    _add(qtbot, view, "allowed host", "*.example.com")
    _add(qtbot, view, "denied host", "metadata.example.com")
    click_by_name(qtbot, view, "Save settings", QPushButton)
    settle(qtbot)

    saved = load_config(tmp_path).runtime
    assert saved.sandbox_mode == "workspace-write"
    assert saved.sandbox_writable_roots == ["/srv/build-cache"]
    assert saved.sandbox_allow_network is True
    assert saved.network_egress_policy == "deny"
    assert saved.network_allowed_hosts == ["*.example.com"]
    assert saved.network_denied_hosts == ["metadata.example.com"]

    # A second session over the same workspace: every control shows it back.
    reopened = _open_runtime_tab(qtbot, _service(tmp_path))
    assert _combo(reopened, "Sandbox mode").currentText() == "workspace-write"
    assert _listed(reopened, "Sandbox writable roots") == ["/srv/build-cache"]
    assert (
        find_by_accessible_name(
            reopened,
            "Allow network access inside the sandbox",
            ToggleSwitch,
            visible_only=True,
        ).isChecked()
        is True
    )
    assert _combo(reopened, "Network egress policy").currentText() == "deny"
    assert _listed(reopened, "Allowed hosts") == ["*.example.com"]
    assert _listed(reopened, "Denied hosts") == ["metadata.example.com"]


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_reloading_the_workspace_does_not_write_the_policy_back(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user reloads a workspace after editing the policy elsewhere.
    Expected outcome: the controls repopulate from the file and Settings stays clean,
    rather than the refresh re-reporting what it just read as an unsaved edit."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)
    _combo(view, "Sandbox mode").setCurrentText("workspace-write")
    _add(qtbot, view, "denied host", "metadata.example.com")
    click_by_name(qtbot, view, "Save settings", QPushButton)
    settle(qtbot)
    service.store.mark_settings_saved()

    # Local edits that the reload has to overwrite, so the controls really are
    # repopulated rather than skipped as unchanged.
    service.store.set_runtime_toggle("sandbox_mode", "read-only")
    service.store.set_runtime_list("network_denied_hosts", ["elsewhere.example.com"])
    service.store.mark_settings_saved()
    dirty_events: list[bool] = []
    service.store.settings_dirty_changed.connect(dirty_events.append)

    service.load()
    settle(qtbot)

    assert _combo(view, "Sandbox mode").currentText() == "workspace-write"
    assert _listed(view, "Denied hosts") == ["metadata.example.com"]
    assert service.store.ui.settings_dirty is False
    assert True not in dirty_events


@verifies(SWR.SWR_2507)
def test_a_relative_writable_root_is_refused_at_the_control(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user types a relative path into the sandbox writable roots.
    Expected outcome: the entry is refused with an explanation and nothing reaches the
    policy, instead of the configuration model raising on assignment later."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)

    _add(qtbot, view, "writable root", "relative/build-cache")

    assert "absolute path" in _problem(view, "Sandbox writable roots")
    assert _listed(view, "Sandbox writable roots") == []
    assert service.store.runtime.sandbox_writable_roots == []
    assert service.store.ui.settings_dirty is False


@verifies(SWR.SWR_2505)
def test_an_unsupported_host_wildcard_is_refused_at_the_control(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user types a host pattern with a wildcard in the middle.
    Expected outcome: the pattern is refused with the supported form spelled out, so the
    egress check never has to classify a pattern it would raise on."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)

    _add(qtbot, view, "allowed host", "ex*ample.com")

    problem = _problem(view, "Allowed hosts")
    assert "wildcard" in problem
    assert "*.example.com" in problem
    assert _listed(view, "Allowed hosts") == []
    assert service.store.runtime.network_allowed_hosts == []


@verifies(SWR.SWR_2505)
def test_the_egress_hint_states_the_precedence_and_the_wildcard_rule(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user decides which host list to put an exception in.
    Expected outcome: the controls say that a denied host wins and that ``*.example.com``
    does not cover bare ``example.com`` — the two rules users get backwards."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)

    disposition = _combo(view, "Network egress policy").accessibleDescription()
    hosts = _list(view, "Allowed hosts").accessibleDescription()

    assert "Denied hosts stays denied" in disposition
    assert "not example.com on its own" in hosts


@verifies(SWR.SWR_2507)
def test_the_verdict_names_the_backend_that_will_wrap_commands(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user turns the sandbox on where an OS backend exists.
    Expected outcome: Settings confirms the sandbox is active and names the backend, so
    the user can tell the setting took effect rather than merely being stored."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)

    assert "sandbox mode is off" in _verdict(view)

    _combo(view, "Sandbox mode").setCurrentText("workspace-write")
    settle(qtbot)

    verdict = _verdict(view)
    assert "Sandbox active" in verdict
    assert "bubblewrap" in verdict


@verifies(SWR.SWR_2507)
def test_the_verdict_repeats_the_backend_remediation_where_no_sandbox_exists(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user opens Settings on a host with no sandbox backend.
    Expected outcome: the tab says the sandbox is unavailable and repeats the backend's
    own reason and remediation, rather than implying the setting will take effect."""
    _force_sandbox(monkeypatch, _UNAVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)

    assert _UNAVAILABLE.reason in _verdict(view)
    assert _UNAVAILABLE.remediation in _verdict(view)

    _combo(view, "Sandbox mode").setCurrentText("read-only")
    settle(qtbot)

    verdict = _verdict(view)
    assert "Sandbox unavailable" in verdict
    assert _UNAVAILABLE.remediation in verdict
    assert "fail rather than start" in verdict
    # The selector still works: the setting is stored for the host that can run it.
    assert service.store.runtime.sandbox_mode == "read-only"


@verifies(SWR.SWR_2505)
def test_widening_the_egress_policy_is_confirmed_before_it_is_stored(
    qtbot: QtBot, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Productive use: a user picks the permissive egress disposition by mistake.
    Expected outcome: Rotaris asks first, and a cancelled answer leaves both the policy
    and the control on the previous value."""
    _force_sandbox(monkeypatch, _AVAILABLE)
    service = _service(_workspace(tmp_path))
    view = _open_runtime_tab(qtbot, service)
    monkeypatch.setattr(
        "rotaris.views.settings.QMessageBox.warning",
        lambda *_args, **_kwargs: QMessageBox.StandardButton.Cancel,
    )

    _combo(view, "Network egress policy").setCurrentText("allow")
    settle(qtbot)

    assert service.store.runtime.network_egress_policy == "ask"
    assert _combo(view, "Network egress policy").currentText() == "ask"


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_a_policy_the_schema_rejects_is_reported_and_nothing_is_written(
    tmp_path: Path,
) -> None:
    """Productive use: a value reaches the policy past the settings controls.
    Expected outcome: saving reports the schema's own complaint as an error the desktop
    can show, and leaves a workspace configuration that still loads."""
    workspace = _workspace(tmp_path)
    service = _service(workspace)
    service.store.runtime.sandbox_writable_roots = ["relative/build-cache"]

    with pytest.raises(ValueError, match="absolute path"):
        service.save()

    # Validated before the write, so the workspace is not left unloadable.
    assert load_config(workspace).runtime.sandbox_writable_roots == []


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_a_run_starts_with_the_policy_shown_in_settings(tmp_path: Path) -> None:
    """Productive use: a user tightens the policy and starts a run without saving first.
    Expected outcome: the run's configuration carries the sandbox mode and egress lists
    the Settings window is showing, not the last values written to disk."""
    service = _service(_workspace(tmp_path))
    service.store.set_runtime_toggle("sandbox_mode", "read-only")
    service.store.set_runtime_toggle("sandbox_allow_network", True)
    service.store.set_runtime_list("sandbox_writable_roots", ["/srv/build-cache"])
    service.store.set_runtime_toggle("network_egress_policy", "deny")
    service.store.set_runtime_list("network_allowed_hosts", ["*.example.com"])
    service.store.set_runtime_list("network_denied_hosts", ["metadata.example.com"])

    runtime = service.build_run_config().runtime

    assert runtime.sandbox_mode == "read-only"
    assert runtime.sandbox_allow_network is True
    assert runtime.sandbox_writable_roots == ["/srv/build-cache"]
    assert runtime.network_egress_policy == "deny"
    assert runtime.network_allowed_hosts == ["*.example.com"]
    assert runtime.network_denied_hosts == ["metadata.example.com"]


@verifies(SWR.SWR_2505, SWR.SWR_2507)
def test_the_new_controls_did_not_move_any_settings_tab(qtbot: QtBot) -> None:
    """Productive use: a returning user reopens Settings where they left it.
    Expected outcome: the tab identifiers are unchanged, so the persisted preference and
    the tab it selects still mean the same category."""
    view = SettingsView(WorkspaceStore())
    qtbot.addWidget(view)

    assert SettingsView._TAB_IDS == (
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
    assert view.set_active_tab("runtime") == "runtime"
    assert view.tabs.tabText(view.tabs.currentIndex()) == "Runtime"
