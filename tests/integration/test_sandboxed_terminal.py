"""Productive use: an operator opts a session into the OS-level sandbox and works in it.
Expected outcome: every command the agent starts — foreground or background — really is
executed through the sandbox backend, a sandbox that cannot start stops the session
instead of quietly running on the host, and the session snapshot records which it was.

The sandbox cannot run on native Windows, so the backend is injected through the real
registration path rather than probed from the host; what is exercised for real is the
wiring, the spawn paths and the snapshot.
"""

from __future__ import annotations

import datetime as dt
import json
import time
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.agents.tool_registration import _register_terminal_tool_factory
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.permissions import (
    announce_effective_permission_mode,
    reset_approval_registry,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox import SandboxAvailability, SandboxSpec, SandboxUnavailableError
from rotaris_core.session.diagnostics import write_split_state
from rotaris_core.session.state import SessionState
from rotaris_core.tools.terminal import HardenedTerminalAction

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path

pytestmark = pytest.mark.integration

MARKER = "SBX7F3"


class FakeBackend:
    """A sandbox backend that marks what it wrapped, so the executed string is provable.

    The marker is appended as a plain argument rather than as a wrapper command so the
    wrapped string stays runnable on every shell the terminal may use (sh, PowerShell,
    cmd) — the point of this file is the wiring, not the OS mechanism.
    """

    name = "fake"

    def __init__(self, *, available: bool = True) -> None:
        self._available = available
        self.calls: list[str] = []

    def probe(self) -> SandboxAvailability:
        if self._available:
            return SandboxAvailability(available=True, backend=self.name)
        return SandboxAvailability(
            available=False,
            backend=self.name,
            reason="This host has no OS-level sandbox.",
            remediation="Run Rotaris inside WSL2 and install bubblewrap.",
        )

    def wrap(self, command: str, spec: SandboxSpec) -> str:
        del spec
        self.calls.append(command)
        if not self._available:
            raise SandboxUnavailableError(self.probe())
        return f"{command} {MARKER}"


class _FakeTerminalSession:
    """Stands in for the OS shell the SDK would spawn.

    The shell is the one external system this file fakes: probing for a real
    PowerShell costs seconds and fails under load, and what is under test is
    which *string* reaches the shell, not the shell.  Everything above this —
    registration, sandbox resolution, the executor, the wrap point — is real.
    """

    def __init__(self, work_dir: str) -> None:
        self.work_dir = work_dir
        self.commands: list[str] = []
        self.prev_status: Any = None
        self._closed = False

    def initialize(self) -> None:
        return None

    def close(self) -> None:
        self._closed = True

    def execute(self, action: Any) -> Any:
        from openhands.tools.terminal.definition import TerminalObservation
        from openhands.tools.terminal.metadata import CmdOutputMetadata

        self.commands.append(action.command)
        return TerminalObservation.from_text(
            text=f"ran: {action.command}",
            command=action.command,
            exit_code=0,
            metadata=CmdOutputMetadata(exit_code=0, working_dir=self.work_dir),
        )


class _FakeWorkspace:
    def __init__(self, working_dir: Path) -> None:
        self.working_dir = str(working_dir)


class _FakeConvState:
    def __init__(self, working_dir: Path) -> None:
        self.workspace = _FakeWorkspace(working_dir)
        self.env_observation_persistence_dir = None


def _config(workspace_root: Path, mode: str = "workspace-write") -> RotarisConfig:
    persona = PersonaConfig(name="coder", model="small_model")
    config = RotarisConfig(
        personas={persona.name: persona},
        default_persona=persona.name,
        workspace_root=workspace_root,
    )
    config.runtime.sandbox_mode = mode
    return config


def _build_terminal_tool(
    monkeypatch: pytest.MonkeyPatch,
    config: RotarisConfig,
    workspace: Path,
    backend: FakeBackend,
) -> Any:
    """Build the terminal tool the way a session does, with *backend* injected.

    Injection goes through ``resolve_backend`` — the seam the production
    registration path actually uses — rather than through the executor, so this
    exercises the real wiring instead of a hand-assembled executor.
    """
    registrations: list[Any] = []

    def _record(name: str, factory: Any) -> None:
        if name == "terminal":
            registrations.append(factory)

    monkeypatch.setattr("rotaris_core.agents.tool_registration._register_tool_factory", _record)
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._terminal_registered_config_id",
        None,
        raising=False,
    )
    monkeypatch.setattr("rotaris_core.sandbox.session.resolve_backend", lambda: backend)

    _register_terminal_tool_factory(config)
    tools = registrations[-1](conv_state=_FakeConvState(workspace))
    return tools[0]


@pytest.fixture
def sandboxed_terminal(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[Any, Any]]:
    """A real terminal tool built the way a sandboxed session builds one."""
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    backend = FakeBackend()
    # Pin the single-session backend so the same seam is faked on every host.
    monkeypatch.setattr("openhands.tools.terminal.impl._is_tmux_available", lambda: False)
    monkeypatch.setattr(
        "openhands.tools.terminal.impl.create_terminal_session",
        lambda work_dir, **kwargs: _FakeTerminalSession(work_dir),
    )
    tool = _build_terminal_tool(monkeypatch, _config(workspace), workspace, backend)
    try:
        yield tool, backend
    finally:
        tool.executor.cleanup()


@verifies(SWR.SWR_2507)
def test_a_foreground_command_really_runs_through_the_sandbox(
    sandboxed_terminal: tuple[Any, Any],
) -> None:
    """Productive use: an agent runs a command in a session the operator sandboxed.
    Expected outcome: the shell executes the sandbox-wrapped command, and the agent sees
    its own command back rather than the wrapper."""
    tool, backend = sandboxed_terminal

    observation = tool.executor(HardenedTerminalAction(command="echo hello", timeout=60))

    assert backend.calls == ["echo hello"]
    # Proof the *wrapped* string is what reached the shell, not just what was built.
    assert tool.executor._session.commands == [f"echo hello {MARKER}"]
    assert observation.command == "echo hello"


@verifies(SWR.SWR_2507)
def test_a_background_command_really_runs_through_the_sandbox(
    sandboxed_terminal: tuple[Any, Any],
) -> None:
    """Productive use: an agent starts a background command in a sandboxed session.
    Expected outcome: the wrapped command is what gets spawned — asking for a background
    command is not a way around the sandbox."""
    tool, backend = sandboxed_terminal

    spawned = tool.executor(
        HardenedTerminalAction(command="echo hello", background=True, timeout=60),
    )
    session_id = spawned.session_id
    assert session_id is not None
    assert backend.calls == ["echo hello"]

    registry = tool.executor._session_registry
    assert registry._sessions[session_id].command == f"echo hello {MARKER}"

    deadline = time.monotonic() + 30
    output = ""
    while time.monotonic() < deadline:
        polled = tool.executor(HardenedTerminalAction(session_id=session_id))
        output += polled.text or ""
        if MARKER in output:
            break
        time.sleep(0.2)

    assert MARKER in output


@verifies(SWR.SWR_2507)
def test_listing_background_sessions_is_not_a_sandboxed_command(
    sandboxed_terminal: tuple[Any, Any],
) -> None:
    """Productive use: an agent lists its background sessions in a sandboxed session.
    Expected outcome: session control never reaches the sandbox backend as a command."""
    tool, backend = sandboxed_terminal

    tool.executor(HardenedTerminalAction(session_action="list"))

    assert backend.calls == []


@verifies(SWR.SWR_2507)
def test_a_sandboxed_terminal_still_declares_its_session_resource(
    sandboxed_terminal: tuple[Any, Any],
) -> None:
    """Productive use: an operator's sandboxed session runs terminal calls concurrently.
    Expected outcome: the tool still declares the single-session resource, so the
    scheduler serializes terminal work exactly as it did before the sandbox."""
    tool, _backend = sandboxed_terminal

    resources = tool.declared_resources(HardenedTerminalAction(command="echo hello"))

    assert resources.keys == ("terminal:session",)


@verifies(SWR.SWR_2507)
def test_a_session_whose_sandbox_cannot_start_does_not_start_at_all(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator enables the sandbox on a host that cannot provide one.
    Expected outcome: building the session's terminal fails with the remediation, instead
    of handing the agent an unsandboxed shell."""
    backend = FakeBackend(available=False)

    with pytest.raises(SandboxUnavailableError) as excinfo:
        _build_terminal_tool(monkeypatch, _config(tmp_path), tmp_path, backend)

    assert "WSL2" in str(excinfo.value)
    # Nothing was ever wrapped, because nothing was ever allowed to run.
    assert backend.calls == []


# ---------------------------------------------------------------------------
# Session snapshot
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clean_approval_registry() -> Iterator[None]:
    reset_approval_registry()
    yield
    reset_approval_registry()


def _state(workspace_root: Path) -> SessionState:
    now = dt.datetime.now(dt.UTC)
    return SessionState(
        session_id="sess-sandbox",
        workspace_root=str(workspace_root),
        created_at=now,
        updated_at=now,
    )


def _resume(session_dir: Path) -> dict[str, Any]:
    return json.loads((session_dir / "state" / "resume.json").read_text(encoding="utf-8"))


@verifies(SWR.SWR_2507)
def test_a_sandboxed_run_is_recorded_in_the_session_snapshot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator audits a finished session for whether it was sandboxed.
    Expected outcome: the snapshot says it was, and names the mechanism."""
    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: SandboxAvailability(available=True, backend="bubblewrap"),
    )
    state = _state(tmp_path)
    session_dir = tmp_path / "sessions" / state.session_id

    announce_effective_permission_mode(state, _config(tmp_path, "workspace-write"))
    write_split_state(session_dir, state)

    assert state.sandboxed is True
    assert _resume(session_dir)["sandboxed"] is True
    assert _resume(session_dir)["sandbox_backend"] == "bubblewrap"


@verifies(SWR.SWR_2507)
def test_an_unsandboxed_run_is_recorded_as_unsandboxed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator audits a session that ran with the sandbox off.
    Expected outcome: the snapshot says so plainly, claiming no mechanism."""
    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: SandboxAvailability(available=True, backend="bubblewrap"),
    )
    state = _state(tmp_path)
    session_dir = tmp_path / "sessions" / state.session_id

    announce_effective_permission_mode(state, _config(tmp_path, "off"))
    write_split_state(session_dir, state)

    assert _resume(session_dir)["sandboxed"] is False
    assert _resume(session_dir)["sandbox_backend"] == ""


@pytest.fixture(autouse=True)
def _forget_trial_verdicts() -> Iterator[None]:
    """Keep the per-process sandbox trial cache from leaking between tests."""
    from rotaris_core.sandbox import reset_sandbox_probe_cache

    reset_sandbox_probe_cache()
    yield
    reset_sandbox_probe_cache()


def _linux_host_with_bwrap(name: str) -> str | None:
    return "/usr/bin/bwrap" if name == "bwrap" else None


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_a_bwrap_that_cannot_start_still_forces_an_unattended_autonomous_run_to_ask(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator turns the sandbox on and starts an unattended
    autonomous run on Ubuntu 24.04, where `bwrap` is installed but every
    invocation fails because unprivileged user namespaces are forbidden.
    Expected outcome: the run is downgraded to `ask` exactly as it would be on a
    host with no sandbox at all.

    The whole chain is driven in one test on purpose, because the chain *is* the
    bug: probe → `sandbox_status` → `SessionState.sandboxed` → the SWR-2508
    downgrade. Every link looks correct in isolation; what made the original
    defect dangerous is that a `shutil.which` at the first link silently lifted
    the safety net at the last one, leaving an autonomous run *less* protected
    than an honestly-unsandboxed one.

    Only the host is faked. The probe, the status seam and the mode resolution
    are the real ones — but a fake host is all this Windows machine can offer;
    step S2 of `docs/testing/sandbox-verification-protocol.md` still has to run
    on a real WSL2 host before this is more than a prediction.
    """
    from rotaris_core.permissions.modes import DOWNGRADE_TARGET
    from rotaris_core.sandbox.backends import probe_sandbox
    from rotaris_core.sandbox.session import sandbox_status

    def _trial_the_kernel_refuses(argv: Any) -> tuple[bool, str]:
        del argv
        return (False, "exit 1: bwrap: No permissions to creating new namespace")

    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: probe_sandbox("linux", _linux_host_with_bwrap, _trial_the_kernel_refuses),
    )
    config = _config(tmp_path, "workspace-write")
    config.runtime.permission_mode = "autonomous"
    state = _state(tmp_path)

    effective = announce_effective_permission_mode(state, config)

    # 1. The probe refuses to call a launcher it could not start "available".
    assert probe_sandbox("linux", _linux_host_with_bwrap, _trial_the_kernel_refuses).available is (
        False
    )
    # 2. …so "configured and available" is false, and no backend is claimed.
    assert sandbox_status(config) == (False, "")
    # 3. …so the session snapshot does not tell the operator they were protected.
    assert state.sandboxed is False
    # 4. …so the SWR-2508 downgrade stays in force.
    assert effective.downgraded
    assert effective.mode == DOWNGRADE_TARGET


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_the_same_host_with_a_working_bwrap_keeps_the_autonomous_mode(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Control for the test above: identical host, identical config, and the only
    difference is that the trial launch succeeds.
    Expected outcome: the run keeps `autonomous`. Without this the downgrade test
    would also pass on a probe that reported every host unavailable, which would
    be a bug of its own — the sandbox opt-in has to buy something."""
    from rotaris_core.sandbox.backends import probe_sandbox
    from rotaris_core.sandbox.session import sandbox_status

    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: probe_sandbox("linux", _linux_host_with_bwrap, lambda argv: (True, "")),
    )
    config = _config(tmp_path, "workspace-write")
    config.runtime.permission_mode = "autonomous"
    state = _state(tmp_path)

    effective = announce_effective_permission_mode(state, config)

    assert sandbox_status(config) == (True, "bubblewrap")
    assert state.sandboxed is True
    assert effective.downgraded is False
    assert effective.mode == "autonomous"


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_a_configured_but_unavailable_sandbox_is_recorded_as_unsandboxed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator enables the sandbox on a host that cannot run one and
    starts an unattended autonomous run.
    Expected outcome: the snapshot records an unsandboxed run and the permission mode is
    still downgraded — the sandbox opt-in never buys permissions it did not deliver."""
    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: SandboxAvailability(
            available=False,
            backend="bubblewrap",
            reason="bwrap not found.",
            remediation="Install bubblewrap.",
        ),
    )
    config = _config(tmp_path, "workspace-write")
    config.runtime.permission_mode = "autonomous"
    state = _state(tmp_path)
    session_dir = tmp_path / "sessions" / state.session_id

    effective = announce_effective_permission_mode(state, config)
    write_split_state(session_dir, state)

    assert effective.downgraded
    assert effective.mode == "ask"
    assert _resume(session_dir)["sandboxed"] is False
