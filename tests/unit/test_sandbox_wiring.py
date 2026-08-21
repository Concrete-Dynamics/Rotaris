"""Productive use: an operator turns the OS-level sandbox on for a session and the
terminal tool runs every new command through it — or refuses to run at all.
Expected outcome: foreground and background commands are wrapped by the configured
backend, session control and keystrokes are left alone, and a sandbox that cannot
start produces a readable error instead of an unsandboxed command."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox import (
    SandboxAvailability,
    SandboxMode,
    SandboxSpec,
    SandboxUnavailableError,
)
from rotaris_core.sandbox.session import (
    ensure_sandbox_available,
    resolve_sandbox_spec,
    sandbox_status,
)
from rotaris_core.tools.terminal import HardenedTerminalAction, HardenedTerminalExecutor

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

MARKER = "SBX7F3"


class FakeBackend:
    """Records every wrap and marks the command so the executed string is provable."""

    name = "fake"

    def __init__(self, *, available: bool = True) -> None:
        self._available = available
        self.calls: list[tuple[str, SandboxSpec]] = []

    def probe(self) -> SandboxAvailability:
        if self._available:
            return SandboxAvailability(available=True, backend=self.name)
        return SandboxAvailability(
            available=False,
            backend=self.name,
            reason="No sandbox on this host.",
            remediation="Run inside WSL2 and install bubblewrap.",
        )

    def wrap(self, command: str, spec: SandboxSpec) -> str:
        self.calls.append((command, spec))
        if not self._available:
            raise SandboxUnavailableError(self.probe())
        return f"{command} {MARKER}"


class _RecordingSession:
    """Stands in for the SDK terminal session and records what it was asked to run."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.prev_status = None
        self._closed = False

    def close(self) -> None:
        self._closed = True

    def execute(self, action: Any) -> Any:
        from openhands.tools.terminal.definition import TerminalObservation
        from openhands.tools.terminal.metadata import CmdOutputMetadata

        self.calls.append(action.command)
        return TerminalObservation.from_text(
            text="ran",
            command=action.command,
            exit_code=0,
            metadata=CmdOutputMetadata(exit_code=0, working_dir="/workspace"),
        )


class _RecordingRegistry:
    """Stands in for TerminalSessionRegistry and records the spawned command string."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def spawn(self, command: str, working_dir: str, timeout: float | None = None) -> str:
        del working_dir, timeout
        self.calls.append(command)
        return "ts_deadbeef"

    def query(self, session_id: str) -> tuple[str, str, int | None]:
        del session_id
        return ("running", "", None)

    def list_sessions(self) -> list[dict[str, Any]]:
        return []

    def get_active_session_ids(self) -> list[str]:
        return []

    def cleanup(self) -> None:
        return None


def _spec(workspace_root: Path) -> SandboxSpec:
    return SandboxSpec.for_workspace(workspace_root, mode=SandboxMode.WORKSPACE_WRITE)


def _executor(
    workspace_root: Path,
    backend: FakeBackend,
    *,
    session: _RecordingSession | None = None,
) -> tuple[HardenedTerminalExecutor, _RecordingSession, _RecordingRegistry]:
    """A wired executor without a real terminal backend behind it.

    Constructed field-by-field rather than through ``__init__`` because building
    a real terminal costs ~12 s of PowerShell start-up per test; the sandbox
    fields under test are set exactly as ``__init__`` sets them.
    """
    executor = HardenedTerminalExecutor.__new__(HardenedTerminalExecutor)
    recording_session = session if session is not None else _RecordingSession()
    registry = _RecordingRegistry()
    executor._pool = None
    executor._session = recording_session
    executor._sessions = {}
    executor._working_dir = str(workspace_root)
    executor._username = None
    executor._no_change_timeout_seconds = None
    executor._terminal_type = None
    executor.shell_path = None
    executor.full_output_save_dir = None
    executor._default_timeout_seconds = None
    executor._mask_observation = lambda observation, conversation=None: observation
    executor._export_envs = lambda action, conversation=None, session=None: None
    executor._pool_recovery_attempts = 0
    executor._pool_recovery_last_time = 0.0
    executor._session_registry = registry
    executor._sandbox_spec = _spec(workspace_root)
    executor._sandbox_backend = backend
    return executor, recording_session, registry


def _config(workspace_root: Path, mode: str = "workspace-write") -> RotarisConfig:
    persona = PersonaConfig(name="coder", model="small_model")
    config = RotarisConfig(
        personas={persona.name: persona},
        default_persona=persona.name,
        workspace_root=workspace_root,
    )
    config.runtime.sandbox_mode = mode
    return config


# ---------------------------------------------------------------------------
# resolve_sandbox_spec / ensure_sandbox_available
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2507)
def test_sandbox_off_resolves_to_no_spec(tmp_path: Path) -> None:
    """Productive use: an operator leaves the sandbox off and keeps host execution.
    Expected outcome: no sandbox spec is produced, so nothing wraps their commands."""
    assert resolve_sandbox_spec(_config(tmp_path, "off"), tmp_path) is None


@verifies(SWR.SWR_2507)
def test_sandbox_spec_makes_the_session_workspace_writable(tmp_path: Path) -> None:
    """Productive use: an operator enables workspace-write for a session's worktree.
    Expected outcome: the spec makes that directory writable and denies the network."""
    config = _config(tmp_path)
    config.runtime.sandbox_writable_roots = [str(tmp_path / "cache")]

    spec = resolve_sandbox_spec(config, tmp_path)

    assert spec is not None
    assert spec.mode is SandboxMode.WORKSPACE_WRITE
    assert spec.workspace_root == tmp_path.resolve()
    assert (tmp_path / "cache").resolve() in spec.effective_writable_roots()
    assert spec.allow_network is False


@verifies(SWR.SWR_2507)
def test_sandbox_spec_carries_the_network_opt_in(tmp_path: Path) -> None:
    """Productive use: an operator allows network access inside the sandbox.
    Expected outcome: the spec records the opt-in rather than defaulting it away."""
    config = _config(tmp_path)
    config.runtime.sandbox_allow_network = True

    spec = resolve_sandbox_spec(config, tmp_path)

    assert spec is not None
    assert spec.allow_network is True


@verifies(SWR.SWR_2507)
def test_unavailable_sandbox_refuses_instead_of_returning_a_passthrough(tmp_path: Path) -> None:
    """Productive use: an operator enables the sandbox on a host that cannot provide one.
    Expected outcome: they get the reason and the remediation, not a silent host run."""
    with pytest.raises(SandboxUnavailableError) as excinfo:
        ensure_sandbox_available(_spec(tmp_path), backend=FakeBackend(available=False))

    assert "No sandbox on this host." in str(excinfo.value)
    assert "WSL2" in str(excinfo.value)


@verifies(SWR.SWR_2507)
def test_available_sandbox_returns_the_backend_that_will_run_it(tmp_path: Path) -> None:
    """Productive use: an operator enables the sandbox on a supported host.
    Expected outcome: the backend that will enforce it is handed back to the caller."""
    backend = FakeBackend()

    assert ensure_sandbox_available(_spec(tmp_path), backend=backend) is backend


# ---------------------------------------------------------------------------
# The wrap point in HardenedTerminalExecutor.__call__
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2507)
def test_foreground_command_runs_through_the_sandbox(tmp_path: Path) -> None:
    """Productive use: an agent runs a command in a sandboxed session.
    Expected outcome: the terminal executes the wrapped command, not the bare one."""
    backend = FakeBackend()
    executor, session, _registry = _executor(tmp_path, backend)

    observation = executor(HardenedTerminalAction(command="echo hello"))

    assert [command for command, _spec in backend.calls] == ["echo hello"]
    assert session.calls == [f"echo hello {MARKER}"]
    # The agent sees the command it asked for, not the wrapper noise.
    assert observation.command == "echo hello"


@verifies(SWR.SWR_2507)
def test_background_command_runs_through_the_sandbox(tmp_path: Path) -> None:
    """Productive use: an agent starts a long-running server in a sandboxed session.
    Expected outcome: the background spawn gets the wrapped command, so asking for a
    background command is not a way out of the sandbox."""
    backend = FakeBackend()
    executor, session, registry = _executor(tmp_path, backend)

    observation = executor(HardenedTerminalAction(command="python server.py", background=True))

    assert [command for command, _spec in backend.calls] == ["python server.py"]
    assert registry.calls == [f"python server.py {MARKER}"]
    assert session.calls == []
    assert observation.command == "python server.py"
    assert MARKER not in observation.text


@verifies(SWR.SWR_2507)
def test_a_background_spawn_is_wrapped_even_beside_a_session_id(tmp_path: Path) -> None:
    """Productive use: an agent sends a background command with a stray session id.
    Expected outcome: the spawn is still sandboxed — the pair is documented as invalid
    but nothing rejects it, so it must not be a one-field escape from the sandbox."""
    backend = FakeBackend()
    executor, _session, registry = _executor(tmp_path, backend)

    executor(
        HardenedTerminalAction(
            command="python server.py",
            background=True,
            session_id="ts_deadbeef",
        ),
    )

    assert registry.calls == [f"python server.py {MARKER}"]


@verifies(SWR.SWR_2507)
def test_keystrokes_into_a_running_process_are_not_wrapped(tmp_path: Path) -> None:
    """Productive use: an agent interrupts a running command with Ctrl+C.
    Expected outcome: the keystroke reaches the process untouched — wrapping it would
    type the sandbox invocation into that process's stdin."""
    backend = FakeBackend()
    executor, session, _registry = _executor(tmp_path, backend)

    executor(HardenedTerminalAction(command="C-c", is_input=True))

    assert backend.calls == []
    assert session.calls == ["C-c"]


@verifies(SWR.SWR_2507)
def test_background_session_control_is_not_wrapped(tmp_path: Path) -> None:
    """Productive use: an agent polls and lists its background sessions.
    Expected outcome: session control is treated as control, never as a new command."""
    backend = FakeBackend()
    executor, _session, _registry = _executor(tmp_path, backend)

    executor(HardenedTerminalAction(session_action="list"))
    executor(HardenedTerminalAction(session_id="ts_deadbeef"))

    assert backend.calls == []


@verifies(SWR.SWR_2507)
def test_empty_poll_command_is_not_wrapped(tmp_path: Path) -> None:
    """Productive use: an agent sends an empty command to fetch more output.
    Expected outcome: the poll stays a poll instead of becoming a sandboxed empty shell."""
    backend = FakeBackend()
    executor, _session, _registry = _executor(tmp_path, backend)

    executor(HardenedTerminalAction(command="   "))

    assert backend.calls == []


@verifies(SWR.SWR_2507)
def test_unavailable_sandbox_never_falls_back_to_the_host_shell(tmp_path: Path) -> None:
    """Productive use: an operator's sandboxed session lands on a host whose sandbox
    cannot start.
    Expected outcome: the command is refused with the remediation and is never executed
    unsandboxed."""
    backend = FakeBackend(available=False)
    executor, session, registry = _executor(tmp_path, backend)

    observation = executor(HardenedTerminalAction(command="rm -rf /"))

    assert observation.failure_kind == "sandbox_unavailable"
    assert observation.is_error
    assert "WSL2" in (observation.detail or "")
    assert observation.command == "rm -rf /"
    # The load-bearing assertion: nothing ran.
    assert session.calls == []
    assert registry.calls == []


@verifies(SWR.SWR_2507)
def test_unavailable_sandbox_blocks_background_commands_too(tmp_path: Path) -> None:
    """Productive use: an agent tries a background command on a host with no sandbox.
    Expected outcome: no process is spawned, and the refusal names the remediation."""
    backend = FakeBackend(available=False)
    executor, _session, registry = _executor(tmp_path, backend)

    observation = executor(HardenedTerminalAction(command="python server.py", background=True))

    assert observation.failure_kind == "sandbox_unavailable"
    assert registry.calls == []


@verifies(SWR.SWR_2507)
def test_a_broken_backend_does_not_leak_an_unsandboxed_command(tmp_path: Path) -> None:
    """Productive use: an operator hits a sandbox backend that fails in an unexpected way.
    Expected outcome: the failure is reported and the command still does not run."""

    class ExplodingBackend(FakeBackend):
        def wrap(self, command: str, spec: SandboxSpec) -> str:
            self.calls.append((command, spec))
            raise OSError("bwrap: permission denied")

    backend = ExplodingBackend()
    executor, session, _registry = _executor(tmp_path, backend)

    observation = executor(HardenedTerminalAction(command="echo hello"))

    assert observation.failure_kind == "sandbox_unavailable"
    assert observation.error_class == "OSError"
    assert session.calls == []


@verifies(SWR.SWR_2507)
def test_repeating_a_command_wraps_it_once(tmp_path: Path) -> None:
    """Productive use: an agent retries the same action after a failure.
    Expected outcome: the retry is wrapped once, because the caller's action was copied
    rather than rewritten in place."""
    backend = FakeBackend()
    executor, session, _registry = _executor(tmp_path, backend)
    action = HardenedTerminalAction(command="echo hello")

    executor(action)
    executor(action)

    assert action.command == "echo hello"
    assert session.calls == [f"echo hello {MARKER}", f"echo hello {MARKER}"]


@verifies(SWR.SWR_2507)
def test_an_unsandboxed_session_is_left_exactly_as_it_was(tmp_path: Path) -> None:
    """Productive use: an operator keeps the sandbox off, as it ships.
    Expected outcome: commands reach the terminal byte-for-byte unchanged."""
    executor, session, _registry = _executor(tmp_path, FakeBackend())
    executor._sandbox_spec = None
    executor._sandbox_backend = None

    executor(HardenedTerminalAction(command="echo hello"))

    assert session.calls == ["echo hello"]


# ---------------------------------------------------------------------------
# Registration path
# ---------------------------------------------------------------------------


def _capture_terminal_factory(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    """Record every terminal factory the registration path installs."""
    registrations: list[Any] = []

    def _record(name: str, factory: Any) -> None:
        if name == "terminal":
            registrations.append(factory)

    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._register_tool_factory",
        _record,
    )
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._terminal_registered_config_id",
        None,
        raising=False,
    )
    return registrations


class _FakeWorkspace:
    def __init__(self, working_dir: Path) -> None:
        self.working_dir = str(working_dir)


class _FakeConvState:
    def __init__(self, working_dir: Path) -> None:
        self.workspace = _FakeWorkspace(working_dir)
        self.env_observation_persistence_dir = None


@verifies(SWR.SWR_2507)
def test_registration_hands_the_terminal_tool_the_session_sandbox(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator enables the sandbox and starts a session.
    Expected outcome: the terminal tool is built with that session's sandbox, rooted at
    the directory the session actually runs in."""
    from rotaris_core.agents.tool_registration import _register_terminal_tool_factory

    registrations = _capture_terminal_factory(monkeypatch)
    backend = FakeBackend()
    monkeypatch.setattr("rotaris_core.sandbox.session.resolve_backend", lambda: backend)
    created: dict[str, Any] = {}
    monkeypatch.setattr(
        "rotaris_core.tools.terminal.HardenedTerminalTool.create",
        classmethod(lambda cls, **kwargs: created.update(kwargs) or []),
    )

    _register_terminal_tool_factory(_config(tmp_path))
    registrations[-1](conv_state=_FakeConvState(tmp_path))

    assert created["sandbox_spec"] is not None
    assert created["sandbox_spec"].workspace_root == tmp_path.resolve()
    assert created["sandbox_backend"] is backend


@verifies(SWR.SWR_2507)
def test_registration_refuses_a_session_whose_sandbox_cannot_start(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator enables the sandbox on a host that cannot run one.
    Expected outcome: the session fails to start with the remediation, rather than
    starting with an unsandboxed terminal."""
    from rotaris_core.agents.tool_registration import _register_terminal_tool_factory

    registrations = _capture_terminal_factory(monkeypatch)
    monkeypatch.setattr(
        "rotaris_core.sandbox.session.resolve_backend",
        lambda: FakeBackend(available=False),
    )

    _register_terminal_tool_factory(_config(tmp_path))

    with pytest.raises(SandboxUnavailableError):
        registrations[-1](conv_state=_FakeConvState(tmp_path))


@verifies(SWR.SWR_2507)
def test_changing_the_sandbox_setting_re_registers_the_terminal_tool(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator turns the sandbox on for their next session.
    Expected outcome: the next session gets a terminal tool built for the new setting
    instead of the memoized one from the previous session."""
    from rotaris_core.agents.tool_registration import _register_terminal_tool_factory

    registrations = _capture_terminal_factory(monkeypatch)
    config = _config(tmp_path, "off")

    _register_terminal_tool_factory(config)
    _register_terminal_tool_factory(config)
    assert len(registrations) == 1

    config.runtime.sandbox_mode = "workspace-write"
    _register_terminal_tool_factory(config)

    assert len(registrations) == 2


@verifies(SWR.SWR_2507)
def test_an_unchanged_config_is_still_registered_only_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: several agents in one session each ask for the terminal tool.
    Expected outcome: the factory is installed once, as before the sandbox existed."""
    from rotaris_core.agents.tool_registration import _register_terminal_tool_factory

    registrations = _capture_terminal_factory(monkeypatch)
    config = _config(tmp_path, "off")

    _register_terminal_tool_factory(config)
    _register_terminal_tool_factory(config)
    _register_terminal_tool_factory(config)

    assert len(registrations) == 1


# ---------------------------------------------------------------------------
# sandbox_active / SWR-2508 interaction
# ---------------------------------------------------------------------------


def _availability(*, available: bool) -> Any:
    return SandboxAvailability(
        available=available,
        backend="fake",
        reason="" if available else "No sandbox here.",
        remediation="" if available else "Use WSL2.",
    )


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_sandbox_is_active_only_when_configured_and_available(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator checks whether their run is really sandboxed.
    Expected outcome: 'active' means the sandbox is both asked for and usable."""
    from rotaris_core.permissions.modes import sandbox_active

    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: _availability(available=True),
    )

    assert sandbox_active(_config(tmp_path, "workspace-write")) is True
    assert sandbox_active(_config(tmp_path, "off")) is False


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_a_sandbox_that_cannot_start_does_not_count_as_sandboxed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator enables the sandbox on a host that cannot run one and
    starts an unattended autonomous run.
    Expected outcome: the run is still treated as unsandboxed, so the SWR-2508 downgrade
    to 'ask' stays in force while the commands would run on the host."""
    from rotaris_core.permissions.modes import DOWNGRADE_TARGET, resolve_effective_mode
    from rotaris_core.permissions.modes import sandbox_active as _sandbox_active

    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: _availability(available=False),
    )
    config = _config(tmp_path, "workspace-write")

    sandboxed = _sandbox_active(config)
    effective = resolve_effective_mode(
        "autonomous",
        interactive=False,
        sandboxed=sandboxed,
        opt_in=False,
    )

    assert sandboxed is False
    assert effective.mode == DOWNGRADE_TARGET
    assert effective.downgraded


@verifies(SWR.SWR_2507)
def test_sandbox_status_names_the_backend_that_enforces_it(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Productive use: an operator wants to know which mechanism sandboxed their run.
    Expected outcome: the active backend is named, and nothing is claimed when it is not."""
    monkeypatch.setattr(
        "rotaris_core.sandbox.session.probe_sandbox",
        lambda: SandboxAvailability(available=True, backend="bubblewrap"),
    )

    assert sandbox_status(_config(tmp_path, "read-only")) == (True, "bubblewrap")
    assert sandbox_status(_config(tmp_path, "off")) == (False, "")
