from __future__ import annotations

import importlib
import sys
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path

from openhands.sdk.llm import TextContent
from openhands.tools.terminal.definition import TerminalObservation as SDKTerminalObservation
from openhands.tools.terminal.metadata import CmdOutputMetadata
from openhands.tools.terminal.terminal.terminal_session import TerminalCommandStatus

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox.backends import BUBBLEWRAP_BACKEND, SEATBELT_BACKEND
from rotaris_core.tools.terminal import (
    HardenedTerminalAction,
    HardenedTerminalExecutor,
    HardenedTerminalObservation,
    HardenedTerminalTool,
)
from rotaris_core.tools.terminal_outcome import classify_terminal_observation


def _drain_session(query, session_id: str, timeout: float = 10.0) -> tuple[str, str, int | None]:
    """Poll a background session to completion and return its status and whole output.

    A fixed ``time.sleep(1)`` was both slower and weaker: it cost a full second even
    when ``echo`` had finished in three milliseconds, and it would still have raced on
    a loaded machine where the reader thread needed longer than the second it was
    given. Output is accumulated because ``query`` is a *consuming* read -- it hands
    back what has arrived since the last call and moves the cursor past it -- so a
    poll loop that threw the reads away would be the reason the output looked empty.
    """
    deadline = time.monotonic() + timeout
    collected: list[str] = []
    while True:
        status, chunk, exit_code = query(session_id)
        collected.append(chunk)
        if status != "running" or time.monotonic() >= deadline:
            return status, "".join(collected), exit_code
        time.sleep(0.01)


def _await_session_exit(registry, session_id: str, timeout: float = 10.0) -> None:
    """Wait for a background session to leave ``running``, without reading its output."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        session = registry.session(session_id)
        if session is None or session.status != "running":
            return
        time.sleep(0.01)


def _sleep_command(seconds: int) -> str:
    return f'"{sys.executable}" -c "import time; time.sleep({seconds})"'


@verifies(SWR.SWR_2127)
def test_hardened_terminal_tool_name_is_terminal() -> None:
    assert HardenedTerminalTool.name == "terminal"


@verifies(SWR.SWR_2127)
def test_terminal_module_import_handles_stdio_without_encoding(monkeypatch) -> None:
    class StreamWithoutEncoding:
        def write(self, text: str) -> int:
            return len(text)

        def flush(self) -> None:
            return None

        def isatty(self) -> bool:
            return True

    for module_name in tuple(sys.modules):
        if module_name == "libtmux" or module_name.startswith("libtmux."):
            sys.modules.pop(module_name, None)
        if module_name == "openhands.tools.terminal" or module_name.startswith(
            "openhands.tools.terminal.",
        ):
            sys.modules.pop(module_name, None)
        if module_name == "rotaris_core.tools.terminal" or module_name.startswith(
            "rotaris_core.tools.terminal.",
        ):
            sys.modules.pop(module_name, None)

    monkeypatch.setattr(sys, "stdout", StreamWithoutEncoding())
    monkeypatch.setattr(sys, "stderr", StreamWithoutEncoding())

    module = importlib.import_module("rotaris_core.tools.terminal")

    assert module.HardenedTerminalTool.__name__ == "HardenedTerminalTool"


class _FakeSession:
    def __init__(
        self,
        observation: SDKTerminalObservation,
        *,
        status: TerminalCommandStatus,
    ) -> None:
        self._observation = observation
        self.prev_status = status
        self._closed = False
        self.calls: list[HardenedTerminalAction] = []

    def execute(self, action: HardenedTerminalAction) -> SDKTerminalObservation:
        self.calls.append(action)
        return self._observation


class _ExplodingSession:
    _closed = False

    def execute(self, action: HardenedTerminalAction) -> SDKTerminalObservation:
        raise RuntimeError(f"boom: {action.command}")


class _PaneHandle:
    def __init__(self, terminal: object) -> None:
        self.terminal = terminal


class _FakeTerminal:
    def __init__(self) -> None:
        self._closed = False


class _FakePool:
    def __init__(self, old_terminal: object, new_terminal: object) -> None:
        self.handle = _PaneHandle(old_terminal)
        self.new_terminal = new_terminal
        self.replaced: list[object] = []
        self._closed = False
        self._initialized = True
        self.recover_calls: list[object] = []
        self.close_calls = 0

    @contextmanager
    def pane(self):
        yield self.handle

    def replace(self, terminal: object) -> object:
        self.replaced.append(terminal)
        return self.new_terminal

    def close(self) -> None:
        self.close_calls += 1
        self._closed = True


def _build_executor(session: object) -> HardenedTerminalExecutor:
    executor = HardenedTerminalExecutor.__new__(HardenedTerminalExecutor)
    executor._pool = None
    executor._session = session
    executor._sessions = {}
    executor._working_dir = "/workspace"
    executor._username = None
    executor._no_change_timeout_seconds = None
    executor._terminal_type = None
    executor.shell_path = None
    executor.full_output_save_dir = None
    executor._default_timeout_seconds = None
    executor._mask_observation = lambda observation, conversation=None: observation
    executor._pool_recovery_attempts = 0
    executor._pool_recovery_last_time = 0.0
    return executor


@verifies(SWR.SWR_510)
def test_omitted_terminal_timeout_uses_executor_default(monkeypatch) -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="ok",
            command="echo hi",
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)
    executor._default_timeout_seconds = 42.0
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    executor(HardenedTerminalAction(command="echo hi"))

    assert session.calls[0].timeout == 42.0


@verifies(SWR.SWR_509, SWR.SWR_515)
def test_successful_terminal_observation_to_llm_content_includes_output_and_cwd() -> None:
    observation = HardenedTerminalObservation.from_text(
        text="tests passed",
        command="pytest tests/unit",
        exit_code=0,
        metadata=CmdOutputMetadata(working_dir="/workspace"),
    )

    rendered = observation.to_llm_content[0].text

    assert "[terminal_diagnostic]" in rendered
    assert '"working_dir": "/workspace"' in rendered
    assert '"exit_code": 0' in rendered
    assert "[terminal_output]" in rendered
    assert "tests passed" in rendered


@verifies(SWR.SWR_508, SWR.SWR_509)
def test_single_session_timeout_forcibly_resets_terminal_and_returns_diagnostics(
    monkeypatch,
) -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="partial output",
            command="sleep 5",
            exit_code=-1,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.HARD_TIMEOUT,
    )
    executor = _build_executor(session)
    reset_calls: list[str] = []

    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        executor,
        "_reset_single_session",
        lambda: (
            reset_calls.append("reset")
            or SDKTerminalObservation.from_text("terminal reset", command="[RESET]", exit_code=0)
        ),
        raising=False,
    )

    observation = executor._execute_single_session(
        HardenedTerminalAction(command="sleep 5", timeout=1.5),
    )

    assert isinstance(observation, HardenedTerminalObservation)
    assert reset_calls == ["reset"]
    assert observation.is_error is True
    assert observation.timeout is True
    assert observation.failure_kind == "timeout"
    assert observation.timeout_seconds == 1.5
    assert observation.kill_status == "session_reset"
    assert observation.session_reinitialized is True
    assert observation.exit_code == 124
    rendered = observation.to_llm_content[0].text
    assert '"failure_kind": "timeout"' in rendered
    assert '"kill_status": "session_reset"' in rendered
    assert "partial output" in rendered


@verifies(SWR.SWR_508, SWR.SWR_509, SWR.SWR_515)
def test_pooled_timeout_replaces_pane_and_returns_diagnostics(monkeypatch) -> None:
    old_terminal = _FakeTerminal()
    new_terminal = _FakeTerminal()
    pool = _FakePool(old_terminal, new_terminal)
    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="still running",
            command="pytest",
            exit_code=-1,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.HARD_TIMEOUT,
    )
    executor = _build_executor(session)
    executor._pool = pool

    monkeypatch.setattr(executor, "_wrap_session", lambda terminal: session, raising=False)
    monkeypatch.setattr(executor, "_prepare_pooled_session", lambda wrapped: None, raising=False)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)
    monkeypatch.setattr(executor, "_discard_session", lambda terminal: None, raising=False)

    observation = executor._execute_pooled(HardenedTerminalAction(command="pytest", timeout=30))

    assert isinstance(observation, HardenedTerminalObservation)
    assert pool.replaced == [old_terminal]
    assert pool.handle.terminal is new_terminal
    assert observation.failure_kind == "timeout"
    assert observation.kill_status == "pane_replaced"
    assert observation.session_reinitialized is True
    rendered = observation.to_llm_content[0].text
    assert '"backend": "tmux-pool"' in rendered
    assert '"kill_status": "pane_replaced"' in rendered
    assert "still running" in rendered


@verifies(SWR.SWR_513, SWR.SWR_514)
def test_reset_and_input_error_returns_structured_observation() -> None:
    executor = _build_executor(
        _FakeSession(
            SDKTerminalObservation.from_text("", command="", exit_code=0),
            status=TerminalCommandStatus.COMPLETED,
        ),
    )

    observation = executor(
        HardenedTerminalAction(command="C-c", is_input=True, reset=True),
    )

    assert observation.is_error is True
    assert observation.failure_kind == "invalid_request"
    assert observation.error_class == "ValueError"
    rendered = observation.to_llm_content[0].text
    assert '"failure_kind": "invalid_request"' in rendered
    assert "Cannot use reset=True with is_input=True" in rendered


@verifies(SWR.SWR_509)
def test_executor_wraps_unexpected_exceptions_in_error_observation(monkeypatch) -> None:
    executor = _build_executor(_ExplodingSession())
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    observation = executor(HardenedTerminalAction(command="explode"))

    assert observation.is_error is True
    assert observation.failure_kind == "execution_error"
    assert observation.error_class == "RuntimeError"
    rendered = observation.to_llm_content[0].text
    assert '"failure_kind": "execution_error"' in rendered
    assert "boom: explode" in rendered


# ---------------------------------------------------------------------------
# Soft no-output pause (exit_code=-1, no failure_kind, no text)
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_511, SWR.SWR_515, SWR.SWR_516)
def test_soft_pause_no_output_coerce_adds_detail_and_backend() -> None:
    """_coerce_observation must annotate the soft-pause case so the model
    understands why there is no output rather than guessing the tool is broken.
    """
    raw = SDKTerminalObservation.from_text(
        text="",
        command="pnpm typecheck",
        exit_code=-1,
        metadata=CmdOutputMetadata(working_dir="/workspace"),
    )
    executor = _build_executor(_FakeSession(raw, status=TerminalCommandStatus.COMPLETED))

    obs = executor._coerce_observation(raw)

    assert obs.backend == "single-session"
    assert obs.detail is not None
    assert "stderr" in obs.detail
    assert "no" in obs.detail.lower()  # "no stdout" or "no output"


@verifies(SWR.SWR_511)
def test_soft_pause_no_output_llm_content_shows_explicit_placeholder() -> None:
    """to_llm_content must emit an explicit [terminal_output] placeholder when
    the soft pause fires with no captured output.  An absent section is
    ambiguous to models and was observed to cause false 'tool broken' reports.
    """
    observation = HardenedTerminalObservation.from_text(
        text="",
        command="pnpm typecheck",
        exit_code=-1,
        metadata=CmdOutputMetadata(working_dir="/workspace"),
    )

    rendered = observation.to_llm_content[0].text

    assert "[terminal_output]" in rendered
    assert "(no output)" in rendered
    assert "[terminal_diagnostic]" in rendered
    assert '"exit_code": -1' in rendered


@verifies(SWR.SWR_511)
def test_soft_pause_with_partial_output_preserves_existing_behaviour() -> None:
    """When the command produced some output before stalling, to_llm_content
    must still render that output (not replace it with the placeholder).
    """
    observation = HardenedTerminalObservation.from_text(
        text="compiling...\n",
        command="pnpm build",
        exit_code=-1,
        metadata=CmdOutputMetadata(working_dir="/workspace"),
    )

    rendered = observation.to_llm_content[0].text

    assert "[terminal_output]" in rendered
    assert "compiling..." in rendered
    assert "(no output)" not in rendered


@verifies(SWR.SWR_515, SWR.SWR_516)
def test_soft_pause_no_output_backend_appears_in_diagnostic_json() -> None:
    """Backend must appear in the JSON diagnostic even for non-error paths
    so operators can identify which backend ran the command.
    """
    raw = SDKTerminalObservation.from_text(
        text="",
        command="ls",
        exit_code=-1,
        metadata=CmdOutputMetadata(working_dir="/workspace"),
    )
    executor = _build_executor(_FakeSession(raw, status=TerminalCommandStatus.COMPLETED))

    obs = executor._coerce_observation(raw)
    rendered = obs.to_llm_content[0].text

    assert '"backend": "single-session"' in rendered


# ---------------------------------------------------------------------------
# Background session tests
# ---------------------------------------------------------------------------


def _build_executor_with_registry(
    session: object,
    max_background: int = 5,
    background_timeout: float = 3600,
) -> HardenedTerminalExecutor:
    executor = _build_executor(session)
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    executor._session_registry = TerminalSessionRegistry(
        max_sessions=max_background,
        default_timeout=background_timeout,
    )
    return executor


@verifies(SWR.SWR_2126)
def test_background_action_has_new_fields() -> None:
    action = HardenedTerminalAction(
        command="python -m http.server 8080",
        background=True,
        timeout=600,
    )
    assert action.background is True
    assert action.session_id is None
    assert action.session_action is None

    # session-management action
    action2 = HardenedTerminalAction(
        session_id="ts_f8bd7970",
        session_action="query",
    )
    assert action2.session_id == "ts_f8bd7970"
    assert action2.session_action == "query"
    assert action2.background is False


@verifies(SWR.SWR_2126)
def test_background_action_visualize_shows_tags() -> None:
    bg_action = HardenedTerminalAction(command="serve", background=True)
    vis = bg_action.visualize
    assert "[background]" in vis.plain

    session_action = HardenedTerminalAction(session_id="ts_abc12345", session_action="kill")
    vis2 = session_action.visualize
    assert "[session: ts_abc12345]" in vis2.plain
    assert "[kill]" in vis2.plain


@verifies(SWR.SWR_2126)
def test_session_registry_spawn_and_query() -> None:
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    registry = TerminalSessionRegistry(max_sessions=5, default_timeout=30)

    sid = registry.spawn("echo hello", working_dir=tempfile.gettempdir(), timeout=5)
    assert sid.startswith("ts_")

    status, output, exit_code = _drain_session(registry.query, sid)
    assert status == "completed"
    assert "hello" in output
    assert exit_code == 0

    registry.cleanup()


@verifies(SWR.SWR_2126)
def test_session_registry_kill() -> None:
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    registry = TerminalSessionRegistry(max_sessions=5, default_timeout=60)

    sid = registry.spawn(_sleep_command(30), working_dir=tempfile.gettempdir(), timeout=60)
    assert sid.startswith("ts_")

    status, output, exit_code = registry.kill(sid)
    assert status == "killed"
    assert exit_code == -1

    registry.cleanup()


@verifies(SWR.SWR_2126)
def test_session_registry_list() -> None:
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    registry = TerminalSessionRegistry(max_sessions=5, default_timeout=30)

    sid1 = registry.spawn("echo one", working_dir=tempfile.gettempdir(), timeout=5)
    sid2 = registry.spawn(_sleep_command(10), working_dir=tempfile.gettempdir(), timeout=10)

    sessions = registry.list_sessions()
    assert len(sessions) == 2
    sids = {s["session_id"] for s in sessions}
    assert sid1 in sids
    assert sid2 in sids

    active = registry.get_active_session_ids()
    assert len(active) >= 1

    registry.cleanup()


@verifies(SWR.SWR_2126)
def test_session_registry_max_sessions() -> None:
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    registry = TerminalSessionRegistry(max_sessions=2, default_timeout=30)

    registry.spawn(_sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60)
    registry.spawn(_sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60)

    import pytest

    with pytest.raises(RuntimeError, match="Maximum background terminal"):
        registry.spawn(_sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60)

    registry.cleanup()


@verifies(SWR.SWR_2126)
def test_session_registry_cleanup() -> None:
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    registry = TerminalSessionRegistry(max_sessions=5, default_timeout=10)

    registry.spawn(_sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60)
    registry.spawn(_sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60)

    registry.cleanup()

    # After cleanup, list should be empty
    sessions = registry.list_sessions()
    assert len(sessions) == 0


@verifies(SWR.SWR_2126)
def test_executor_dispatch_background_spawn() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session, background_timeout=5)
    executor._working_dir = tempfile.gettempdir()

    observation = executor(
        HardenedTerminalAction(command="echo bg_test", background=True),
    )

    assert observation.session_id is not None
    assert observation.session_id.startswith("ts_")
    assert observation.session_status == "running"
    assert "bg_test" in observation.text

    executor.cleanup()


@verifies(SWR.SWR_2126, SWR.SWR_514)
def test_executor_dispatch_background_rejects_is_input() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session)

    observation = executor(
        HardenedTerminalAction(command="echo", is_input=True, background=True),
    )

    assert observation.failure_kind == "invalid_request"
    assert "is_input" in (observation.detail or "")


@verifies(SWR.SWR_2126)
def test_executor_dispatch_background_rejects_reset() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session)

    observation = executor(
        HardenedTerminalAction(command="echo", reset=True, background=True),
    )

    assert observation.failure_kind == "invalid_request"
    assert "reset" in (observation.detail or "")


@verifies(SWR.SWR_2126)
def test_executor_dispatch_list_sessions() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session, background_timeout=30)

    # Spawn a session first
    executor._session_registry.spawn(
        _sleep_command(60), working_dir=tempfile.gettempdir(), timeout=30
    )

    observation = executor(HardenedTerminalAction(session_action="list"))

    assert observation.active_sessions is not None
    assert len(observation.active_sessions) >= 1
    assert observation.active_sessions[0]["status"] == "running"

    executor.cleanup()


@verifies(SWR.SWR_2126)
def test_executor_dispatch_session_query() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session, background_timeout=5)

    sid = executor._session_registry.spawn(
        "echo query_test", working_dir=tempfile.gettempdir(), timeout=5
    )

    # Waits for the shell to finish without consuming its output: the executor's own
    # query below is what this test is about, so the text has to still be there for it.
    _await_session_exit(executor._session_registry, sid)

    observation = executor(
        HardenedTerminalAction(session_id=sid, session_action="query"),
    )

    assert observation.session_id == sid
    assert observation.session_status == "completed"
    assert "query_test" in observation.text

    executor.cleanup()


@verifies(SWR.SWR_2126)
def test_executor_dispatch_session_query_unknown_id() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session)

    observation = executor(
        HardenedTerminalAction(session_id="ts_nonexist", session_action="query"),
    )

    assert observation.failure_kind == "invalid_request"
    assert observation.error_class == "ValueError"


@verifies(SWR.SWR_2126)
def test_executor_dispatch_session_kill() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session, background_timeout=30)

    sid = executor._session_registry.spawn(
        _sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60
    )

    observation = executor(
        HardenedTerminalAction(session_id=sid, session_action="kill"),
    )

    assert observation.session_id == sid
    assert observation.session_status == "killed"
    assert observation.session_exit_code == -1

    executor.cleanup()


@verifies(SWR.SWR_2126)
def test_executor_dispatch_send_input_requires_input_data() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session)

    # Spawn a session first so the ID exists
    sid = executor._session_registry.spawn(
        _sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60
    )

    observation = executor(
        HardenedTerminalAction(session_id=sid, session_action="send_input", input_data=None),
    )

    assert observation.failure_kind == "invalid_request"
    assert "input_data" in (observation.detail or "")

    executor.cleanup()


@verifies(SWR.SWR_2126)
def test_executor_cleanup_kills_all_sessions() -> None:
    session = _FakeSession(
        SDKTerminalObservation.from_text("ok", command="", exit_code=0),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor_with_registry(session, background_timeout=30)

    executor._session_registry.spawn(
        _sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60
    )
    executor._session_registry.spawn(
        _sleep_command(60), working_dir=tempfile.gettempdir(), timeout=60
    )
    assert len(executor._session_registry.list_sessions()) == 2

    executor.cleanup()
    assert len(executor._session_registry.list_sessions()) == 0


@verifies(SWR.SWR_2126)
def test_observation_diagnostic_includes_session_fields() -> None:
    observation = HardenedTerminalObservation.from_text(
        text="started",
        command="echo hi",
        exit_code=0,
        metadata=CmdOutputMetadata(exit_code=0, working_dir="/workspace"),
        session_id="ts_f8bd7970",
        session_status="running",
    )

    rendered = observation.to_llm_content[0].text

    assert '"session_id": "ts_f8bd7970"' in rendered
    assert '"session_status": "running"' in rendered


@verifies(SWR.SWR_2126)
def test_observation_active_sessions_table_rendering() -> None:
    observation = HardenedTerminalObservation(
        content=[TextContent(text="")],
        command="[list]",
        exit_code=0,
        metadata={"exit_code": 0, "working_dir": "/workspace"},
        active_sessions=[
            {
                "session_id": "ts_abc12345",
                "command": "python server.py",
                "status": "running",
                "exit_code": None,
                "started_at": "2026-01-01T00:00:00+00:00",
            },
        ],
    )

    rendered = observation.to_llm_content[0].text

    assert "[active_sessions]" in rendered
    assert "ts_abc12345" in rendered
    assert "running" in rendered
    assert "python server.py" in rendered


@verifies(SWR.SWR_559)
def test_terminal_classifier_marks_nonzero_exit_as_shell_failure() -> None:
    observation = HardenedTerminalObservation.from_text(
        text="ERROR: file or directory not found: tests/missing.py",
        command="python -m pytest tests/missing.py",
        exit_code=4,
        metadata=CmdOutputMetadata(exit_code=4, working_dir="/workspace"),
    )

    outcome = classify_terminal_observation(observation)

    assert outcome.kind == "shell_failure"
    assert outcome.severity == "error"
    assert outcome.exit_code == 4


@verifies(SWR.SWR_559)
def test_terminal_classifier_marks_pipeline_zero_exit_with_failure_output_as_suspicious() -> None:
    observation = HardenedTerminalObservation.from_text(
        text="ERROR: file or directory not found: tests/missing.py\nno tests ran",
        command="python -m pytest tests/missing.py 2>&1 | head -60",
        exit_code=0,
        metadata=CmdOutputMetadata(exit_code=0, working_dir="/workspace"),
    )

    outcome = classify_terminal_observation(observation)

    assert outcome.kind == "suspicious_success"
    assert outcome.severity == "warning"
    assert any("Pipeline command" in warning for warning in outcome.warnings)


@verifies(SWR.SWR_559)
def test_terminal_diagnostic_includes_classified_outcome() -> None:
    observation = HardenedTerminalObservation.from_text(
        text="Traceback (most recent call last):",
        command="python broken.py",
        exit_code=1,
        metadata=CmdOutputMetadata(exit_code=1, working_dir="/workspace"),
    )

    rendered = observation.to_llm_content[0].text

    assert '"outcome_kind": "shell_failure"' in rendered
    assert '"outcome_severity": "error"' in rendered


# ---------------------------------------------------------------------------
# Recovery-loop guard + proactive liveness check + cleanup pool close
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_503, SWR.SWR_509)
def test_recovery_counter_resets_after_successful_call(monkeypatch) -> None:
    """After a successful _execute_pooled call the recovery counter must be 0."""
    old_terminal = _FakeTerminal()
    new_terminal = _FakeTerminal()
    pool = _FakePool(old_terminal, new_terminal)
    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="ok",
            command="echo hi",
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)
    executor._pool = pool
    executor._pool_recovery_attempts = 2  # simulate prior recoveries
    monkeypatch.setattr(executor, "_wrap_session", lambda terminal: session, raising=False)
    monkeypatch.setattr(executor, "_prepare_pooled_session", lambda wrapped: None, raising=False)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    _observation = executor._execute_pooled(HardenedTerminalAction(command="echo hi"))

    assert executor._pool_recovery_attempts == 0


@verifies(SWR.SWR_503, SWR.SWR_509)
def test_recovery_skipped_after_max_attempts_in_cooldown(monkeypatch) -> None:
    """When recovery is triggered > MAX_ATTEMPTS in the cooldown window,
    _execute_pooled returns an error observation instead of trying recovery again."""
    old_terminal = _FakeTerminal()
    new_terminal = _FakeTerminal()
    pool = _FakePool(old_terminal, new_terminal)

    # Make pool.pane() throw immediately — simulates persistent pool death.
    def _exploding_pane():
        raise RuntimeError("TmuxPanePool is not initialized or already closed")

    pool.pane = _exploding_pane  # type: ignore[assignment]

    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="",
            command="",
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)
    executor._pool = pool
    executor._pool_recovery_attempts = 3  # already at max
    executor._pool_recovery_last_time = time.monotonic()
    monkeypatch.setattr(executor, "_recover_tmux_pool", lambda p: pool.recover_calls.append(p))

    observation = executor._execute_pooled(HardenedTerminalAction(command="ls"))

    assert observation.is_error is True
    assert observation.failure_kind == "execution_error"
    assert "Pool unstable" in (observation.detail or "")
    assert len(pool.recover_calls) == 0  # recovery was skipped


@verifies(SWR.SWR_503, SWR.SWR_509)
def test_recovery_counter_resets_after_cooldown(monkeypatch) -> None:
    """When the cooldown window elapses the recovery counter resets to 0."""
    old_terminal = _FakeTerminal()
    new_terminal = _FakeTerminal()
    pool = _FakePool(old_terminal, new_terminal)

    def _exploding_pane():
        raise RuntimeError("TmuxPanePool is not initialized or already closed")

    pool.pane = _exploding_pane  # type: ignore[assignment]

    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="",
            command="",
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)
    executor._pool = pool
    executor._pool_recovery_attempts = 3
    executor._pool_recovery_last_time = time.monotonic() - 15.0  # outside cooldown
    monkeypatch.setattr(executor, "_recover_tmux_pool", lambda p: pool.recover_calls.append(p))
    monkeypatch.setattr(
        executor,
        "_tmux_pool_recovery_observation",
        lambda action, error: SDKTerminalObservation.from_text(
            text="recovered",
            command=action.command,
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
    )

    observation = executor._execute_pooled(HardenedTerminalAction(command="ls"))

    # Counter should have been reset and recovery triggered
    assert len(pool.recover_calls) == 1
    assert isinstance(observation, HardenedTerminalObservation)


@verifies(SWR.SWR_503, SWR.SWR_509)
def test_cleanup_closes_pool() -> None:
    """cleanup() must close the tmux pool, not just the background session registry."""
    old_terminal = _FakeTerminal()
    new_terminal = _FakeTerminal()
    pool = _FakePool(old_terminal, new_terminal)
    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="ok",
            command="",
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)
    executor._pool = pool
    from rotaris_core.tools.terminal import TerminalSessionRegistry

    executor._session_registry = TerminalSessionRegistry(max_sessions=5, default_timeout=30)

    executor.cleanup()

    assert pool._closed is True
    assert pool.close_calls >= 1


@verifies(SWR.SWR_503, SWR.SWR_509)
def test_proactive_recovery_on_closed_pool(monkeypatch) -> None:
    """When pool._closed is True, _execute_pooled silently rebuilds the pool
    before checkout, so the agent never sees the error."""
    old_terminal = _FakeTerminal()
    new_terminal = _FakeTerminal()
    pool = _FakePool(old_terminal, new_terminal)
    pool._closed = True  # simulate silent pool death

    session = _FakeSession(
        SDKTerminalObservation.from_text(
            text="ok",
            command="echo hi",
            exit_code=0,
            metadata=CmdOutputMetadata(working_dir="/workspace"),
        ),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)
    executor._pool = pool
    monkeypatch.setattr(executor, "_recover_tmux_pool", lambda p: pool.recover_calls.append(p))
    monkeypatch.setattr(executor, "_wrap_session", lambda terminal: session, raising=False)
    monkeypatch.setattr(executor, "_prepare_pooled_session", lambda wrapped: None, raising=False)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    # After recovery, _pool must be set to a working pool. Simulate by
    # reassigning after the fake recovery appends to recover_calls.
    def _fake_recover(p: object) -> None:
        pool.recover_calls.append(p)
        pool._closed = False
        executor._pool = pool

    monkeypatch.setattr(executor, "_recover_tmux_pool", _fake_recover)

    observation = executor._execute_pooled(HardenedTerminalAction(command="echo hi"))

    assert len(pool.recover_calls) == 1
    assert not observation.is_error


# ---------------------------------------------------------------------------
# A sandbox that fails to start must not read as a failing command (SWR-2507)
# ---------------------------------------------------------------------------

#: What bwrap prints when the kernel forbids unprivileged user namespaces.
_BWRAP_STARTUP_FAILURE = (
    "bwrap: No permissions to creating new namespace, likely because the kernel"
    " does not allow non-privileged user namespaces."
)


class _StubSandboxBackend:
    """A backend that wraps by prefixing, so the wrap point is provably taken."""

    def __init__(self, name: str) -> None:
        self.name = name

    def wrap(self, command: str, spec: object) -> str:
        del spec
        return f"{self.name}-wrapper {command}"


def _sandboxed_executor(session: object, backend_name: str = BUBBLEWRAP_BACKEND):
    """An executor wired the way a sandboxed session wires one."""
    from rotaris_core.sandbox import SandboxMode, SandboxSpec

    executor = _build_executor(session)
    executor._sandbox_spec = SandboxSpec(
        mode=SandboxMode.WORKSPACE_WRITE,
        workspace_root=Path("/workspace"),
    )
    executor._sandbox_backend = _StubSandboxBackend(backend_name)
    return executor


def _observation(text: str, *, exit_code: int) -> SDKTerminalObservation:
    return SDKTerminalObservation.from_text(
        text=text,
        command="pytest tests/unit",
        exit_code=exit_code,
        metadata=CmdOutputMetadata(exit_code=exit_code, working_dir="/workspace"),
    )


@verifies(SWR.SWR_2507)
def test_a_bwrap_that_fails_to_start_is_reported_as_an_unavailable_sandbox(monkeypatch) -> None:
    """Productive use: an operator sandboxes a session on a host whose kernel
    forbids unprivileged user namespaces, and the agent runs a command.
    Expected outcome: the agent is told the *sandbox* failed, not that its command
    failed — otherwise it retries a command that never ran, once per turn, while
    the actual fix is on the host."""
    session = _FakeSession(
        _observation(_BWRAP_STARTUP_FAILURE, exit_code=1),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _sandboxed_executor(session)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    observation = executor(HardenedTerminalAction(command="pytest tests/unit"))

    # The wrap point really was taken, so this is the sandboxed path.
    assert session.calls[0].command == "bubblewrap-wrapper pytest tests/unit"
    assert observation.failure_kind == "sandbox_unavailable"
    assert observation.outcome_kind == "sandbox_unavailable"
    assert observation.is_error
    assert "did not run" in (observation.detail or "")
    # The launcher's own message survives, because it is the diagnosis.
    assert "non-privileged user namespaces" in (observation.text or "")


@verifies(SWR.SWR_2507)
def test_a_command_failing_inside_a_working_sandbox_is_still_a_command_failure(
    monkeypatch,
) -> None:
    """Productive use: an agent runs a failing test suite in a sandboxed session.
    Expected outcome: it reads as an ordinary non-zero exit. Getting this wrong
    is worse than the bug it guards: every red test run would look like a broken
    sandbox and the agent would stop trying to fix its own code."""
    failing_suite = "FAILED tests/unit/test_thing.py::test_it\n1 failed, 3 passed"
    session = _FakeSession(
        _observation(failing_suite, exit_code=1),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _sandboxed_executor(session)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    observation = executor(HardenedTerminalAction(command="pytest tests/unit"))

    assert observation.failure_kind is None
    assert observation.outcome_kind == "shell_failure"
    assert classify_terminal_observation(observation).kind == "shell_failure"


@verifies(SWR.SWR_2507)
def test_a_command_that_merely_mentions_the_launcher_is_not_a_sandbox_failure(
    monkeypatch,
) -> None:
    """Productive use: an agent greps the codebase for `bwrap:` and the grep fails.
    Expected outcome: still a command failure. The launcher only owns the output
    when it owns *all* of it, because a wrapper that never started cannot have
    let anything else print."""
    mixed = f"searching...\n{_BWRAP_STARTUP_FAILURE}\nno matches"
    session = _FakeSession(
        _observation(mixed, exit_code=2),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _sandboxed_executor(session)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    observation = executor(HardenedTerminalAction(command="grep -r 'bwrap:' ."))

    assert observation.failure_kind is None


@verifies(SWR.SWR_2507)
def test_a_seatbelt_startup_failure_is_recognised_the_same_way(monkeypatch) -> None:
    """Productive use: the same host problem on macOS instead of Linux.
    Expected outcome: the same verdict. A diagnosis that only worked on one
    backend would send macOS operators down the wrong path."""
    session = _FakeSession(
        _observation("sandbox-exec: sandbox_apply: Operation not permitted", exit_code=1),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _sandboxed_executor(session, backend_name=SEATBELT_BACKEND)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    observation = executor(HardenedTerminalAction(command="pytest tests/unit"))

    assert observation.failure_kind == "sandbox_unavailable"


@verifies(SWR.SWR_2507)
def test_an_unsandboxed_session_never_reads_output_as_a_sandbox_failure(monkeypatch) -> None:
    """Productive use: a session runs with the sandbox off and a command happens to
    print a line that looks like a bwrap diagnostic.
    Expected outcome: an ordinary command failure. Nothing was wrapped, so there
    is no wrapper that could have failed."""
    session = _FakeSession(
        _observation(_BWRAP_STARTUP_FAILURE, exit_code=1),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _build_executor(session)  # no sandbox spec, no backend
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)

    observation = executor(HardenedTerminalAction(command="cat error.log"))

    assert observation.failure_kind is None
    assert observation.outcome_kind == "shell_failure"


class _FakeSessionRegistry:
    """Stands in for the background session pool, returning a canned poll result."""

    def __init__(self, status: str, output: str, exit_code: int | None) -> None:
        self._result = (status, output, exit_code)

    def query(self, session_id: str):
        del session_id
        return self._result

    def cleanup(self) -> None:
        return None


@verifies(SWR.SWR_2507)
def test_a_background_command_whose_sandbox_failed_to_start_says_so_too() -> None:
    """Productive use: an agent starts a long-running command with background=true
    in a sandboxed session on a host whose sandbox cannot start, then polls it.
    Expected outcome: the poll reports an unavailable sandbox. The spawn returns
    before the wrapper has had a chance to fail, so this poll is the first place
    the failure is readable — and background commands are wrapped exactly so
    `background: true` is not a way around the sandbox. It must not be a way
    around the diagnosis either."""
    executor = _sandboxed_executor(session=None)
    executor._session_registry = _FakeSessionRegistry(
        status="failed",
        output=_BWRAP_STARTUP_FAILURE,
        exit_code=1,
    )

    observation = executor(HardenedTerminalAction(session_id="ts_abcd1234"))

    assert observation.failure_kind == "sandbox_unavailable"
    assert observation.outcome_kind == "sandbox_unavailable"


@verifies(SWR.SWR_2507)
def test_a_still_running_background_session_is_not_read_as_a_sandbox_failure() -> None:
    """Productive use: an agent polls a healthy background command that has not
    produced output yet.
    Expected outcome: nothing is relabelled. A session with no exit code has not
    failed at all, so there is no failure to diagnose."""
    executor = _sandboxed_executor(session=None)
    executor._session_registry = _FakeSessionRegistry(
        status="running",
        output="",
        exit_code=None,
    )

    observation = executor(HardenedTerminalAction(session_id="ts_abcd1234"))

    assert observation.failure_kind is None
    assert observation.session_status == "running"


@verifies(SWR.SWR_2507)
def test_both_ways_the_sandbox_can_be_missing_report_the_same_outcome(monkeypatch) -> None:
    """Productive use: an operator reads the diagnostics of two sessions on the
    same broken host — one where the wrap step refused up front, one where the
    wrapper was built and then failed to launch.
    Expected outcome: the same outcome_kind. One host problem that reports itself
    two different ways is a diagnosis the operator cannot act on."""
    from rotaris_core.sandbox import SandboxAvailability, SandboxUnavailableError

    refused = _sandboxed_executor(session=None)._sandbox_unavailable_observation(
        "pytest tests/unit",
        SandboxUnavailableError(
            SandboxAvailability(
                available=False,
                backend=BUBBLEWRAP_BACKEND,
                reason="bwrap could not start.",
                remediation="Check unprivileged user namespaces.",
            ),
        ),
    )

    session = _FakeSession(
        _observation(_BWRAP_STARTUP_FAILURE, exit_code=1),
        status=TerminalCommandStatus.COMPLETED,
    )
    executor = _sandboxed_executor(session)
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)
    launched = executor(HardenedTerminalAction(command="pytest tests/unit"))

    assert refused.failure_kind == launched.failure_kind == "sandbox_unavailable"
    assert refused.outcome_kind == launched.outcome_kind == "sandbox_unavailable"
    assert refused.outcome_severity == launched.outcome_severity == "error"


@verifies(SWR.SWR_2507)
def test_a_shell_that_could_not_be_started_is_not_blamed_on_the_sandbox(monkeypatch) -> None:
    """Productive use: the terminal backend itself fails to come up — openhands'
    PowerShell discovery times out under CPU contention, say — in a session that
    happens to be sandboxed.
    Expected outcome: `execution_error`, the diagnosis that tells the agent to
    reset and retry. Reporting it as `sandbox_unavailable` would send the
    operator to check their kernel's namespace settings over a machine that was
    merely busy, and the two failures need different responses."""
    executor = _sandboxed_executor(_ExplodingSession())
    monkeypatch.setattr(executor, "_export_envs", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        executor,
        "_execute_single_session",
        lambda action, conversation=None: (_ for _ in ()).throw(
            RuntimeError("PowerShell is not available on this system"),
        ),
        raising=False,
    )

    observation = executor(HardenedTerminalAction(command="pytest tests/unit"))

    assert observation.failure_kind == "execution_error"
    assert observation.error_class == "RuntimeError"


@verifies(SWR.SWR_2908)
def test_powershell_probe_resolves_from_path_and_caches(monkeypatch) -> None:
    from openhands.tools.terminal.terminal import factory

    import rotaris_core.tools.terminal as terminal_module

    probe_calls: list[str | None] = []

    def vendor_probe(explicit_shell_path: str | None = None) -> str | None:
        probe_calls.append(explicit_shell_path)
        return None

    monkeypatch.setattr(terminal_module, "_POWERSHELL_PROBE_INSTALLED", False)
    monkeypatch.setattr(factory, "_get_powershell_command", vendor_probe)
    monkeypatch.setattr(
        terminal_module.shutil,
        "which",
        lambda candidate: "C:/pwsh/pwsh.exe" if candidate == "pwsh" else None,
    )

    terminal_module._install_cached_powershell_probe()
    terminal_module._install_cached_powershell_probe()  # idempotent

    assert factory._get_powershell_command() == "pwsh"
    assert probe_calls == []

    # Cached: still resolves even when PATH lookup stops finding it.
    monkeypatch.setattr(terminal_module.shutil, "which", lambda candidate: None)
    assert factory._get_powershell_command() == "pwsh"
    assert probe_calls == []


@verifies(SWR.SWR_2908)
def test_powershell_probe_failure_is_not_cached(monkeypatch) -> None:
    from openhands.tools.terminal.terminal import factory

    import rotaris_core.tools.terminal as terminal_module

    probe_calls: list[str | None] = []
    answers = iter([None, "powershell.exe", "unreachable"])

    def vendor_probe(explicit_shell_path: str | None = None) -> str | None:
        probe_calls.append(explicit_shell_path)
        return next(answers)

    monkeypatch.setattr(terminal_module, "_POWERSHELL_PROBE_INSTALLED", False)
    monkeypatch.setattr(factory, "_get_powershell_command", vendor_probe)
    monkeypatch.setattr(terminal_module.shutil, "which", lambda candidate: None)

    terminal_module._install_cached_powershell_probe()

    assert factory._get_powershell_command() is None
    assert factory._get_powershell_command() == "powershell.exe"
    assert factory._get_powershell_command() == "powershell.exe"
    assert len(probe_calls) == 2
