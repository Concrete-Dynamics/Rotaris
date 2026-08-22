"""Productive use: a person watches an agent's long command produce output as it happens.
Expected outcome: the terminal tool publishes live frames *while* a command is still
blocking, through the real registration path, and stops publishing when it ends.

The foreground streaming path is what makes the difference between watching a four-minute
test run and staring at a spinner, so it is exercised through the real
``HardenedTerminalExecutor`` rather than through a hand-built tap.
"""

from __future__ import annotations

import sys
import threading
import time
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.agents.tool_registration import _register_terminal_tool_factory
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.terminal_stream.hub import TerminalStreamHub, frames_to_text
from rotaris_core.tools.terminal import HardenedTerminalAction

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

SESSION = "sess-stream"
BINDING_KEY = f"{SESSION}/coder"


class _StreamingTerminal:
    """A terminal backend that fills its buffer *while* a command blocks.

    Shaped like the SDK's PTY backend — a lock-guarded line buffer a reader
    thread appends to — because that is the shape the tap samples.
    """

    def __init__(self, work_dir: str) -> None:
        self.work_dir = work_dir
        self.output_buffer: list[str] = []
        self.output_lock = threading.Lock()
        self.sent: list[tuple[str, bool]] = []

    def send_keys(self, text: str, enter: bool = True) -> None:
        self.sent.append((text, enter))

    def interrupt(self) -> bool:
        return True

    def emit(self, text: str) -> None:
        with self.output_lock:
            self.output_buffer.append(text)


class _BlockingSession:
    """A terminal session whose ``execute`` takes real time, like a build does."""

    def __init__(self, work_dir: str) -> None:
        self.work_dir = work_dir
        self.terminal = _StreamingTerminal(work_dir)
        self.prev_status = None
        self._closed = False

    def initialize(self) -> None:
        return None

    def close(self) -> None:
        self._closed = True

    def execute(self, action: Any) -> Any:
        from openhands.tools.terminal.definition import TerminalObservation
        from openhands.tools.terminal.metadata import CmdOutputMetadata

        for line in ("step 1\n", "step 2\n", "step 3\n"):
            self.terminal.emit(line)
            time.sleep(0.12)
        return TerminalObservation.from_text(
            text="step 1\nstep 2\nstep 3\n",
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


def _build_terminal_tool(
    monkeypatch: pytest.MonkeyPatch,
    workspace: Path,
    hub: TerminalStreamHub,
    *,
    streaming: bool = True,
    session_factory: type[_BlockingSession] = _BlockingSession,
) -> Any:
    """Build the terminal tool the way a session does, with *hub* injected."""
    persona = PersonaConfig(name="coder", model="small_model")
    config = RotarisConfig(
        personas={persona.name: persona},
        default_persona=persona.name,
        workspace_root=workspace,
    )
    config.runtime.terminal_stream_enabled = streaming
    config.runtime.terminal_stream_interval_ms = 20

    registrations: list[Any] = []
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._register_tool_factory",
        lambda name, factory: registrations.append(factory) if name == "terminal" else None,
    )
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._terminal_registered_config_id",
        None,
        raising=False,
    )
    monkeypatch.setattr("rotaris_core.terminal_stream.hub.default_hub", lambda: hub)
    monkeypatch.setattr("openhands.tools.terminal.impl._is_tmux_available", lambda: False)
    monkeypatch.setattr(
        "openhands.tools.terminal.impl.create_terminal_session",
        lambda work_dir, **kwargs: session_factory(work_dir),
    )
    _register_terminal_tool_factory(config)
    tools = registrations[-1](conv_state=_FakeConvState(workspace), binding_key=BINDING_KEY)
    return tools[0]


@pytest.fixture
def hub() -> TerminalStreamHub:
    return TerminalStreamHub(buffer_bytes=64 * 1024)


@verifies(SWR.SWR_3618)
def test_output_reaches_a_watcher_before_the_command_returns(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    hub: TerminalStreamHub,
) -> None:
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    seen: list[str] = []
    hub.register_sink(SESSION, lambda frame: seen.append(frame.data))
    tool = _build_terminal_tool(monkeypatch, workspace, hub)

    during: list[int] = []

    def _watch() -> None:
        time.sleep(0.2)
        during.append(len([data for data in seen if data]))

    watcher = threading.Thread(target=_watch)
    watcher.start()
    observation = tool.executor(HardenedTerminalAction(command="make build"))
    watcher.join()

    assert during and during[0] >= 1, "nothing had streamed while the command was still running"
    assert "step 3" in frames_to_text(hub.replay(SESSION, "fg:coder"))
    assert observation.exit_code == 0, "streaming must not change what the agent gets"


@verifies(SWR.SWR_3618)
def test_the_stream_is_listed_while_it_runs_and_closed_when_it_ends(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    hub: TerminalStreamHub,
) -> None:
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    tool = _build_terminal_tool(monkeypatch, workspace, hub)

    tool.executor(HardenedTerminalAction(command="pytest -q"))

    listed = {info.stream_id: info for info in hub.open_streams(SESSION)}
    assert "fg:coder" in listed
    assert listed["fg:coder"].command == "pytest -q"
    assert listed["fg:coder"].running is False, "a finished command must stop offering input"


@verifies(SWR.SWR_3618)
def test_a_person_can_type_into_the_terminal_the_agent_is_using(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    hub: TerminalStreamHub,
) -> None:
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    typed: list[tuple[str, bool]] = []

    class _RecordingSession(_BlockingSession):
        def execute(self, action: Any) -> Any:
            # Input arrives while the command is mid-flight, which is the only
            # moment at which taking control means anything.
            control = hub.resolve_control(SESSION, "fg:coder")
            if control is not None:
                control.send_keys("yes", True)
                typed.extend(self.terminal.sent)
            return super().execute(action)

    tool = _build_terminal_tool(monkeypatch, workspace, hub, session_factory=_RecordingSession)

    tool.executor(HardenedTerminalAction(command="apt install foo"))

    assert typed == [("yes", True)]


@verifies(SWR.SWR_3618)
def test_streaming_can_be_switched_off_without_touching_the_command(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    hub: TerminalStreamHub,
) -> None:
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    tool = _build_terminal_tool(monkeypatch, workspace, hub, streaming=False)

    observation = tool.executor(HardenedTerminalAction(command="make build"))

    assert hub.open_streams(SESSION) == []
    assert observation.exit_code == 0


@verifies(SWR.SWR_3618)
def test_an_agents_own_terminal_tool_streams_under_its_run_and_its_name(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    hub: TerminalStreamHub,
) -> None:
    """Productive use: the person watching a run opens the terminal window mid-command.

    The tool is taken from the agent the factory actually builds, because the
    only thing that tells it *which* run to publish under is the identity the
    agent's tool spec carries.  A spec built without one leaves every screen
    empty and the window stuck on "No terminal yet", with nothing failing.
    """
    from openhands.sdk.llm.llm import LLM
    from openhands.sdk.tool.registry import resolve_tool

    from rotaris_core.agents.factory import create_agent_for_persona

    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    persona = PersonaConfig(name="verifier", model="small_model", tools=["terminal"])
    config = RotarisConfig(
        personas={persona.name: persona},
        default_persona=persona.name,
        workspace_root=workspace,
    )
    config.runtime.terminal_stream_interval_ms = 20
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._terminal_registered_config_id",
        None,
        raising=False,
    )
    monkeypatch.setattr("rotaris_core.terminal_stream.hub.default_hub", lambda: hub)
    monkeypatch.setattr("openhands.tools.terminal.impl._is_tmux_available", lambda: False)
    monkeypatch.setattr(
        "openhands.tools.terminal.impl.create_terminal_session",
        lambda work_dir, **kwargs: _BlockingSession(work_dir),
    )

    agent = create_agent_for_persona(
        persona,
        config,
        {"session_id": SESSION, "child_canonical_name": "verify-foundation"},
    )(LLM(model="openai/gpt-4o-mini", api_key="test"))
    spec = next(spec for spec in agent.tools if spec.name == "terminal")
    tool = resolve_tool(spec, _FakeConvState(workspace))[0]

    tool.executor(HardenedTerminalAction(command="npm run build"))

    listed = {info.stream_id: info for info in hub.open_streams(SESSION)}
    assert "fg:verify-foundation" in listed, (
        "the run's terminal must be listed under the session the desktop follows, "
        f"and under the agent's own name; got {sorted(listed)}"
    )
    assert "step 3" in frames_to_text(hub.replay(SESSION, "fg:verify-foundation"))


@pytest.mark.skipif(sys.platform == "win32", reason="the PTY backend is POSIX-only")
@verifies(SWR.SWR_3618)
def test_a_real_shell_command_streams_its_own_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    hub: TerminalStreamHub,
) -> None:
    """The same path, but against the real PTY backend and a real shell."""
    workspace = tmp_path / "workspace"
    (workspace / ".rotaris").mkdir(parents=True)
    persona = PersonaConfig(name="coder", model="small_model")
    config = RotarisConfig(
        personas={persona.name: persona},
        default_persona=persona.name,
        workspace_root=workspace,
    )
    config.runtime.terminal_stream_interval_ms = 20
    registrations: list[Any] = []
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._register_tool_factory",
        lambda name, factory: registrations.append(factory) if name == "terminal" else None,
    )
    monkeypatch.setattr(
        "rotaris_core.agents.tool_registration._terminal_registered_config_id",
        None,
        raising=False,
    )
    monkeypatch.setattr("rotaris_core.terminal_stream.hub.default_hub", lambda: hub)
    monkeypatch.setattr("openhands.tools.terminal.impl._is_tmux_available", lambda: False)
    _register_terminal_tool_factory(config)
    tool = registrations[-1](conv_state=_FakeConvState(workspace), binding_key=BINDING_KEY)[0]

    try:
        tool.executor(
            HardenedTerminalAction(
                command="for i in 1 2 3; do echo line-$i; sleep 0.15; done",
                timeout=30,
            )
        )
        streamed = frames_to_text(hub.replay(SESSION, "fg:coder"))
    finally:
        cleanup = getattr(tool.executor, "cleanup", None)
        if cleanup is not None:
            cleanup()

    assert "line-1" in streamed and "line-3" in streamed
