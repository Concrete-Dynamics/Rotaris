"""Project-initialization state: workspace config → ConfigService → store (SWR-2802).

Drives the real :class:`ConfigService` against a scratch workspace so the
projection is exercised end to end; only the provider/subscription probes are
stubbed out, because those talk to external LLM providers over the network.
"""

from __future__ import annotations

import shutil

import pytest
import yaml
from rotaris_core.config.project_init_state import mark_task
from rotaris_core.reqtocode import SWR, verifies

from rotaris.models.state import SERENA_INIT_TASK, ProjectInitState
from rotaris.models.store import WorkspaceStore
from rotaris.services import config_service as config_service_module
from rotaris.services.config_service import ConfigService

pytestmark = pytest.mark.integration


def _workspace(tmp_path):
    """A workspace whose agents.yaml already carries an unrelated top-level key."""
    config_dir = tmp_path / ".rotaris"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "agents.yaml").write_text(
        yaml.safe_dump({"rotaris": {"theme": "dark"}}, sort_keys=False),
        encoding="utf-8",
    )
    return tmp_path


def _service(tmp_path, monkeypatch, *, serena_installed: bool = True) -> ConfigService:
    """Real ConfigService with only the external provider probes stubbed."""
    real_which = shutil.which

    def fake_which(cmd, *args, **kwargs):
        if cmd == "uvx":
            return "/usr/bin/uvx" if serena_installed else None
        return real_which(cmd, *args, **kwargs)

    monkeypatch.setattr(config_service_module.shutil, "which", fake_which)
    service = ConfigService(_workspace(tmp_path), WorkspaceStore())
    monkeypatch.setattr(ConfigService, "_providers", lambda self: [])
    monkeypatch.setattr(ConfigService, "_subscription_limits", lambda self: [])
    return service


@verifies(SWR.SWR_2802)
def test_store_setter_suppresses_duplicate_initialization_emit() -> None:
    """Productive use: a config reload must not re-open the initialization modal.

    Expected outcome: an identical state is swallowed, a different one is published.
    """
    store = WorkspaceStore()
    emissions: list[ProjectInitState] = []
    store.initialization_changed.connect(emissions.append)

    pending = ProjectInitState(pending=(SERENA_INIT_TASK,))
    store.set_initialization(pending)
    store.set_initialization(ProjectInitState(pending=(SERENA_INIT_TASK,)))

    assert emissions == [pending]
    assert store.initialization == pending

    store.set_initialization(
        ProjectInitState(completed=(SERENA_INIT_TASK,), never_initialized=False)
    )

    assert len(emissions) == 2
    assert store.initialization.resolved is True


@verifies(SWR.SWR_2802, SWR.SWR_2805)
def test_running_and_error_flags_drive_the_transient_states() -> None:
    """Productive use: the init run reports progress, then a recoverable failure.

    Expected outcome: pending tasks survive the failure so a retry has something to run.
    """
    store = WorkspaceStore()
    store.set_initialization(ProjectInitState(pending=(SERENA_INIT_TASK,)))

    store.set_initialization_running(True)
    assert store.initialization.running is True
    assert store.initialization.should_prompt is False

    store.set_initialization_error("serena activate_project failed: connection refused")
    assert store.initialization.running is False
    assert store.initialization.last_error.startswith("serena activate_project failed")
    assert store.initialization.pending == (SERENA_INIT_TASK,)

    store.set_initialization_running(True)
    assert store.initialization.last_error == ""


@verifies(SWR.SWR_2802, SWR.SWR_2820)
def test_fresh_workspace_projects_as_never_initialized(tmp_path, monkeypatch) -> None:
    """Productive use: a user opens a workspace that was never initialized.

    Expected outcome: the store reports Serena setup as pending so Settings ▸ Project can
    show it — and asks for no prompt, because setting a project up is not the user's
    decision to make (SWR-2820).
    """
    service = _service(tmp_path, monkeypatch)
    service.load()

    state = service.store.initialization
    assert state.never_initialized is True
    assert state.pending == (SERENA_INIT_TASK,)
    assert state.pending_labels == ("Serena project setup",)
    assert state.completed == () and state.skipped == ()
    assert state.resolved is False
    assert state.pending_consent == ()
    assert state.should_prompt is False
    assert state.running is False
    assert state.last_error == ""


@verifies(SWR.SWR_2821)
def test_a_consent_requiring_task_brings_the_prompt_back(tmp_path, monkeypatch) -> None:
    """Productive use: the day an initialization task needs the user again, the modal and
    the run gate return without either being rewired.

    Expected outcome: the projection follows the registered descriptor, so declaring
    consent is the whole change — the store, the modal trigger and the composer gate all
    read the same projected set.
    """
    service = _service(tmp_path, monkeypatch)
    service.load()
    assert service.store.initialization.should_prompt is False

    monkeypatch.setattr(
        ConfigService,
        "_init_task_needs_consent",
        staticmethod(lambda _task_id: True),
    )
    service.refresh_initialization()

    state = service.store.initialization
    assert state.pending == (SERENA_INIT_TASK,)
    assert state.pending_consent == (SERENA_INIT_TASK,)
    assert state.should_prompt is True
    assert state.never_initialized is True


@verifies(SWR.SWR_2802)
def test_reloading_the_same_config_does_not_re_emit(tmp_path, monkeypatch) -> None:
    """Productive use: any config reload re-projects initialization state.

    Expected outcome: the unchanged projection stays silent, so no modal re-opens.
    """
    service = _service(tmp_path, monkeypatch)
    emissions: list[ProjectInitState] = []
    service.store.initialization_changed.connect(emissions.append)

    service.load()
    service.load()

    assert len(emissions) == 1


@verifies(SWR.SWR_2802, SWR.SWR_2804)
def test_completed_task_projects_as_resolved_with_classification(tmp_path, monkeypatch) -> None:
    """Productive use: a workspace whose Serena setup already ran is reopened.

    Expected outcome: nothing is pending, the classification reaches the UI, and the
    desktop's own ``rotaris:`` settings in the same file survive the marker write.
    """
    service = _service(tmp_path, monkeypatch)
    service.load()
    assert service.store.initialization.pending == (SERENA_INIT_TASK,)

    mark_task(service.workspace, SERENA_INIT_TASK, outcome="completed", classification="non-code")
    service.load()

    state = service.store.initialization
    assert state.completed == (SERENA_INIT_TASK,)
    assert state.pending == ()
    assert state.resolved is True
    assert state.should_prompt is False
    assert state.never_initialized is False
    assert state.classification == "non-code"
    assert state.last_run

    payload = yaml.safe_load(
        (service.workspace / ".rotaris" / "agents.yaml").read_text(encoding="utf-8")
    )
    assert payload["rotaris"] == {"theme": "dark"}


@verifies(SWR.SWR_2802, SWR.SWR_2805)
def test_skipped_task_is_resolved_but_stays_re_runnable(tmp_path, monkeypatch) -> None:
    """Productive use: the user skipped initialization and reopens the workspace.

    Expected outcome: the prompt does not reappear, and the task is still listed as
    skipped so the manual SWR-2805 action can offer it again.
    """
    service = _service(tmp_path, monkeypatch)
    mark_task(service.workspace, SERENA_INIT_TASK, outcome="skipped")
    service.load()

    state = service.store.initialization
    assert state.skipped == (SERENA_INIT_TASK,)
    assert state.pending == ()
    assert state.should_prompt is False
    assert state.never_initialized is False


@verifies(SWR.SWR_2802)
def test_no_pending_task_when_serena_prerequisite_is_unmet(tmp_path, monkeypatch) -> None:
    """Productive use: a machine without the Serena launcher opens a fresh workspace.

    Expected outcome: nothing is pending, so no prompt offers an initialization that
    could not run.
    """
    service = _service(tmp_path, monkeypatch, serena_installed=False)
    service.load()

    state = service.store.initialization
    assert state.pending == ()
    assert state.never_initialized is True
    assert state.should_prompt is False
    assert state.resolved is True
