"""Productive use: an operator sets a permission mode in config or on a
persona and the agent factory wires the matching preset into that persona's
policy engine. Expected outcome: persona override wins over the runtime
default; an unrecognized name still produces a usable (strictest) engine
rather than failing agent construction."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.agents.factory import _build_permission_engine
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.permissions import (
    ApprovalHost,
    register_approval_host,
    reset_approval_registry,
    reset_session_mode_overrides,
    set_session_mode_override,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture(autouse=True)
def _clean_approval_registry() -> Iterator[None]:
    reset_approval_registry()
    reset_session_mode_overrides()
    yield
    reset_approval_registry()
    reset_session_mode_overrides()


if TYPE_CHECKING:
    from pathlib import Path


def _persona(name: str = "coder", **kwargs: object) -> PersonaConfig:
    return PersonaConfig(name=name, model="small_model", **kwargs)  # type: ignore[arg-type]


def _register_interactive_host(session_id: str) -> None:
    """A host that can present a prompt — i.e. a human is watching the run."""
    register_approval_host(session_id, ApprovalHost(present=lambda payload: None))


@verifies(SWR.SWR_2503)
def test_runtime_default_mode_is_used_when_persona_has_no_override(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "restricted"

    engine = _build_permission_engine(config, _persona(), runtime_kwargs=None)

    assert engine.policy.preset_name == "restricted"


@verifies(SWR.SWR_2503)
def test_persona_override_wins_over_runtime_default(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "restricted"
    # Without the opt-in this unattended run would be downgraded (SWR-2508);
    # the precedence under test is the persona-over-runtime one.
    config.runtime.allow_unsandboxed_autonomous = True

    engine = _build_permission_engine(
        config,
        _persona(permission_mode="autonomous"),
        runtime_kwargs=None,
    )

    assert engine.policy.preset_name == "autonomous"


@verifies(SWR.SWR_2503)
def test_default_config_resolves_to_the_ask_preset(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)

    engine = _build_permission_engine(config, _persona(), runtime_kwargs=None)

    assert engine.policy.preset_name == "ask"


@verifies(SWR.SWR_2503)
def test_unknown_mode_falls_back_instead_of_raising(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)

    engine = _build_permission_engine(
        config,
        _persona(permission_mode="not-a-real-mode"),
        runtime_kwargs=None,
    )

    assert engine.policy.preset_name == "restricted"


@verifies(SWR.SWR_2503)
def test_a_session_mode_override_beats_the_runtime_default(tmp_path: Path) -> None:
    """An agent built after a mid-run mode change starts in the new mode — this
    is what carries the change into the next Ralph iteration."""
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "ask"
    set_session_mode_override("session-switched", "restricted")

    engine = _build_permission_engine(
        config,
        _persona(),
        runtime_kwargs={"session_id": "session-switched"},
    )

    assert engine.policy.preset_name == "restricted"


@verifies(SWR.SWR_2503)
def test_a_persona_override_beats_a_session_mode_override(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    set_session_mode_override("session-switched", "ask")

    engine = _build_permission_engine(
        config,
        _persona(permission_mode="restricted"),
        runtime_kwargs={"session_id": "session-switched"},
    )

    assert engine.policy.preset_name == "restricted"


@verifies(SWR.SWR_2503)
def test_another_sessions_override_does_not_reach_this_agent(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "ask"
    set_session_mode_override("session-switched", "restricted")

    engine = _build_permission_engine(
        config,
        _persona(),
        runtime_kwargs={"session_id": "session-untouched"},
    )

    assert engine.policy.preset_name == "ask"


@verifies(SWR.SWR_2508)
def test_autonomous_is_downgraded_when_no_one_can_approve(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "autonomous"

    engine = _build_permission_engine(
        config,
        _persona(),
        runtime_kwargs={"session_id": "session-unattended"},
    )

    assert engine.policy.preset_name == "ask"


@verifies(SWR.SWR_2508)
def test_autonomous_survives_when_an_interactive_host_is_registered(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "autonomous"
    _register_interactive_host("session-watched")

    engine = _build_permission_engine(
        config,
        _persona(),
        runtime_kwargs={"session_id": "session-watched"},
    )

    assert engine.policy.preset_name == "autonomous"


@verifies(SWR.SWR_2508)
def test_workspace_opt_in_keeps_autonomous_on_an_unattended_run(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "autonomous"
    config.runtime.allow_unsandboxed_autonomous = True

    engine = _build_permission_engine(
        config,
        _persona(),
        runtime_kwargs={"session_id": "session-unattended"},
    )

    assert engine.policy.preset_name == "autonomous"


@verifies(SWR.SWR_2508)
def test_a_non_interactive_lifecycle_host_still_counts_as_unattended(tmp_path: Path) -> None:
    config = RotarisConfig(workspace_root=tmp_path)
    config.runtime.permission_mode = "autonomous"
    # The headless runner registers a host purely for the abort hook; it
    # cannot ask a human, so the run stays unattended.
    register_approval_host("session-headless", ApprovalHost())

    engine = _build_permission_engine(
        config,
        _persona(),
        runtime_kwargs={"session_id": "session-headless"},
    )

    assert engine.policy.preset_name == "ask"
