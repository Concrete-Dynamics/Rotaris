from __future__ import annotations

import json
import os
import shutil
import signal
import time
from contextlib import contextmanager, suppress
from typing import TYPE_CHECKING, Any, ClassVar, Literal, Self, cast

from openhands.sdk.llm import ImageContent, TextContent
from openhands.sdk.logger import get_logger
from openhands.sdk.tool import (
    Action,
    DeclaredResources,
    ToolAnnotations,
    ToolDefinition,
    ToolExecutor,
)
from openhands.sdk.utils import maybe_truncate
from pydantic import Field
from rich.text import Text

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sandbox.backends import BUBBLEWRAP_BACKEND, SEATBELT_BACKEND
from rotaris_core.sandbox.spec import SandboxMode, SandboxUnavailableError

if TYPE_CHECKING:
    from collections.abc import Sequence

    from openhands.sdk.conversation.state import ConversationState
    from openhands.tools.terminal.definition import TerminalAction as SDKTerminalAction
    from openhands.tools.terminal.definition import (
        TerminalObservation as SDKTerminalObservationBase,
    )
    from openhands.tools.terminal.impl import TerminalExecutor as SDKTerminalExecutorBase

    from rotaris_core.sandbox.backends import SandboxBackend
    from rotaris_core.sandbox.spec import SandboxSpec
    from rotaris_core.terminal_stream.hub import TerminalStreamHub


_log = get_logger(__name__)


#: Line prefixes each sandbox launcher uses for its *own* diagnostics, keyed by
#: backend name (SWR-2507).  ``bwrap`` and ``sandbox-exec`` both prefix every
#: message they emit with their own name, and neither prefixes the wrapped
#: command's output — which is what makes the distinction in
#: :func:`_is_sandbox_startup_failure` possible at all.
#:
#: Keyed by the backend-name constants rather than by string literals: a rename
#: on the sandbox side would otherwise turn every lookup below into a silent
#: miss, and a silent miss here means the diagnosis quietly stops happening.
_SANDBOX_LAUNCHER_PREFIXES: dict[str, tuple[str, ...]] = {
    BUBBLEWRAP_BACKEND: ("bwrap:",),
    SEATBELT_BACKEND: ("sandbox-exec:", "sandbox_apply:"),
}


_POWERSHELL_PROBE_INSTALLED = False


@traces(SWR.SWR_2908)
def _install_cached_powershell_probe() -> None:
    """Cache the SDK's PowerShell probe result for the whole process.

    The vendor probe launches every candidate binary with a hard 5 s timeout
    and never caches the outcome, so under CPU load (parallel test runs,
    sibling agents) every candidate times out and terminal construction fails
    with "PowerShell is not available on this system" on machines that plainly
    have it (docs/bug/2026-08-08-verifier-executor-failure-reports-passed.md).
    Resolve via PATH first — existence does not need a live launch — fall back
    to the vendor probe for exotic installs, and cache any success so later
    executor constructions cannot fail spuriously.
    """
    global _POWERSHELL_PROBE_INSTALLED
    if _POWERSHELL_PROBE_INSTALLED:
        return
    try:
        from openhands.tools.terminal.terminal import factory
    except ImportError:  # pragma: no cover — SDK layout changed
        return

    original = factory._get_powershell_command
    cache: dict[str, str] = {}

    def _cached_probe(explicit_shell_path: str | None = None) -> str | None:
        key = explicit_shell_path or ""
        hit = cache.get(key)
        if hit is not None:
            return hit
        resolved: str | None = None
        for candidate in (explicit_shell_path, "pwsh", "powershell"):
            if candidate and shutil.which(candidate):
                resolved = candidate
                break
        if resolved is None:
            resolved = original(explicit_shell_path)
        if resolved is not None:
            cache[key] = resolved
        return resolved

    factory._get_powershell_command = _cached_probe
    _POWERSHELL_PROBE_INSTALLED = True


@traces(SWR.SWR_2507)
def _is_sandbox_startup_failure(text: str, prefixes: tuple[str, ...]) -> bool:
    """Whether *text* is a sandbox launcher that never got as far as the command.

    The discriminator is that the launcher produced *all* of the output.  A
    ``bwrap`` that cannot build its namespace prints its own error and exits
    without ever executing the command, so nothing else can be there; a command
    that failed *inside* a working sandbox produces its own output — a compiler
    diagnostic, a pytest summary, a stack trace — which no launcher prefix
    matches.  Requiring every line to be a launcher line is what keeps a failing
    test suite from being reported as a broken sandbox, which would be a worse
    bug than the one this exists to catch.
    """
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        # A wrapper that failed silently is indistinguishable from a command
        # that exited non-zero without output; do not guess.
        return False
    return all(line.startswith(prefixes) for line in lines)


class _EncodingCompatibleStream:
    """Proxy streams that provide text attributes expected by terminal backends."""

    def __init__(self, wrapped: Any) -> None:
        self._wrapped = wrapped
        self.encoding = getattr(wrapped, "encoding", None) or "utf-8"
        self.errors = getattr(wrapped, "errors", None) or "replace"

    def __getattr__(self, name: str) -> Any:
        return getattr(self._wrapped, name)


@traces(SWR.SWR_2127)
@contextmanager
def _sdk_import_stdio_compat() -> Any:
    """Ensure SDK terminal imports see stdout/stderr objects with encoding metadata."""
    import sys

    original_stdout = sys.stdout
    original_stderr = sys.stderr
    if hasattr(original_stdout, "encoding") and hasattr(original_stderr, "encoding"):
        yield
        return

    sys.stdout = _EncodingCompatibleStream(original_stdout)
    sys.stderr = _EncodingCompatibleStream(original_stderr)
    try:
        yield
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr


def _load_sdk_terminal_types() -> tuple[Any, Any, Any, Any, Any, Any]:
    import importlib

    with _sdk_import_stdio_compat():
        constants = importlib.import_module("openhands.tools.terminal.constants")
        definition = importlib.import_module("openhands.tools.terminal.definition")
        impl = importlib.import_module("openhands.tools.terminal.impl")
        metadata = importlib.import_module("openhands.tools.terminal.metadata")
        session = importlib.import_module("openhands.tools.terminal.terminal.terminal_session")

    return (
        constants.MAX_CMD_OUTPUT_SIZE,
        constants.NO_CHANGE_TIMEOUT_SECONDS,
        definition.TerminalObservation,
        impl.TerminalExecutor,
        metadata.CmdOutputMetadata,
        session.TerminalCommandStatus,
    )


(
    MAX_CMD_OUTPUT_SIZE,
    NO_CHANGE_TIMEOUT_SECONDS,
    SDKTerminalObservation,
    SDKTerminalExecutor,
    CmdOutputMetadata,
    TerminalCommandStatus,
) = _load_sdk_terminal_types()

if not TYPE_CHECKING:
    SDKTerminalObservationBase = SDKTerminalObservation
    SDKTerminalExecutorBase = SDKTerminalExecutor


# Background terminal session pool. Re-exported for backwards-compatible imports
# (`from rotaris_core.tools.terminal import TerminalSessionRegistry`).
from rotaris_core.tools.terminal_outcome import classify_terminal_observation  # noqa: E402
from rotaris_core.tools.terminal_session import (  # noqa: E402
    _TIMEOUT_EXIT_CODE,
    BgSessionStatus,
    TerminalSessionRegistry,
)


@traces(SWR.SWR_2126)
class HardenedTerminalAction(Action):
    """Schema for bash command execution with hard timeout semantics and background sessions."""

    command: str = Field(
        default="",
        description=(
            "The bash command to execute. Can be empty string to retrieve"
            " additional logs when the previous command returned exit code"
            " `-1` from a soft no-output pause. Can be a special key name"
            " when `is_input` is True: `C-c` (Ctrl+C), `C-d` (Ctrl+D/EOF),"
            " `C-z` (Ctrl+Z), or any `C-<letter>` for Ctrl sequences;"
            " navigation keys `UP`, `DOWN`, `LEFT`, `RIGHT`, `HOME`, `END`,"
            " `PGUP`, `PGDN`; and `TAB`, `ESC`, `BS` (Backspace), `ENTER`."
            " Note: You can only execute one bash command at a time. If you"
            " need to run multiple commands sequentially, use `&&` or `;`."
        ),
    )
    is_input: bool = Field(
        default=False,
        description=(
            "If True, the command is input for the currently running process."
            " If False, the command is executed as a bash command."
        ),
    )
    timeout: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Optional hard wall-clock timeout in seconds. When this limit is"
            " reached, the tool force-kills the command by restarting the"
            " underlying terminal session or tmux pane, then returns a"
            " structured timeout error. Because the terminal backend is"
            " recreated, shell state such as cwd changes, exports, aliases,"
            " and running jobs from that session is lost after a timeout."
            f" If omitted, commands instead pause after {NO_CHANGE_TIMEOUT_SECONDS}"
            " seconds of no new output and can then be resumed or interrupted"
            " interactively."
        ),
    )
    reset: bool = Field(
        default=False,
        description=(
            "If True, reset the terminal by creating a new session before"
            " running this command. Use this only when the terminal becomes"
            " unresponsive. Cannot be combined with `is_input=True`."
        ),
    )
    background: bool = Field(
        default=False,
        description=(
            "If True, run the command in a new background terminal session and"
            " return immediately with a session_id. The session persists across"
            " multiple tool calls and can be polled, killed, or fed input via"
            " its session_id. Use this for servers, containers, daemons, and"
            " any command that you expect to run indefinitely. Cannot be combined"
            " with `is_input=True`, `reset=True`, or `session_id`."
        ),
    )
    session_id: str | None = Field(
        default=None,
        description=(
            "Target a background session by its session_id (format: ts_XXXXXXXX)."
            " When set without `session_action`, defaults to 'query' — returns"
            " new output since the last poll. Cannot be combined with"
            " `background=True`."
        ),
    )
    session_action: Literal["query", "kill", "send_input", "send_signal", "list"] | None = Field(
        default=None,
        description=(
            "Action to perform on a background session. 'query' (default when"
            " session_id is set): returns new output since last poll. 'kill':"
            " SIGTERM then SIGKILL the session, returns final output. 'send_input':"
            " write data from `input_data` to the process stdin. 'send_signal':"
            " send a signal specified by `signal` (default SIGTERM). 'list':"
            " returns all active sessions — no session_id required."
        ),
    )
    signal: Literal["SIGTERM", "SIGINT", "SIGKILL", "SIGHUP"] | None = Field(
        default=None,
        description="Signal to send when session_action='send_signal'. Default: SIGTERM.",
    )
    input_data: str | None = Field(
        default=None,
        description="Data to write to the process stdin when session_action='send_input'.",
    )

    @property
    def visualize(self) -> Text:
        content = Text()
        content.append("$ ", style="bold green")
        if self.command:
            content.append(self.command, style="white")
        else:
            content.append("[empty command]", style="italic")

        if self.is_input:
            content.append(" ", style="white")
            content.append("(input to running process)", style="yellow")

        if self.timeout is not None:
            content.append(" ", style="white")
            content.append(f"[timeout: {self.timeout}s]", style="cyan")

        if self.reset:
            content.append(" ", style="white")
            content.append("[reset terminal]", style="red bold")

        if self.background:
            content.append(" ", style="white")
            content.append("[background]", style="magenta bold")

        if self.session_id:
            content.append(" ", style="white")
            content.append(f"[session: {self.session_id}]", style="blue")

        if self.session_action:
            content.append(" ", style="white")
            content.append(f"[{self.session_action}]", style="yellow")

        return content


@traces(SWR.SWR_509, SWR.SWR_515)
class HardenedTerminalObservation(SDKTerminalObservationBase):
    """Terminal observation with explicit machine-readable failure diagnostics and bg sessions."""

    failure_kind: (
        Literal["timeout", "invalid_request", "execution_error", "sandbox_unavailable"] | None
    ) = Field(
        default=None,
        description="Structured failure category for agents consuming the result.",
    )
    timeout_seconds: float | None = Field(
        default=None,
        description="Hard timeout that triggered this observation, when applicable.",
    )
    kill_status: (
        Literal[
            "session_reset",
            "pane_replaced",
            "reset_failed",
            "replace_failed",
        ]
        | None
    ) = Field(
        default=None,
        description="Whether the timed-out process was terminated by rebuilding the backend.",
    )
    session_reinitialized: bool = Field(
        default=False,
        description="Whether the terminal backend was successfully recreated after failure.",
    )
    backend: Literal["single-session", "tmux-pool"] | None = Field(
        default=None,
        description="Backend mode that executed the terminal command.",
    )
    error_class: str | None = Field(
        default=None,
        description="Python exception class when an internal execution error occurred.",
    )
    detail: str | None = Field(
        default=None,
        description="Human-readable explanation of the failure.",
    )
    # --- Background session fields ---
    session_id: str | None = Field(
        default=None,
        description="Background session identifier (format: ts_XXXXXXXX).",
    )
    session_status: BgSessionStatus | None = Field(
        default=None,
        description="Status of the background session.",
    )
    session_exit_code: int | None = Field(
        default=None,
        description="Exit code of the background session (when completed/failed/timeout).",
    )
    active_sessions: list[dict[str, Any]] | None = Field(
        default=None,
        description=(
            "List of active background sessions when session_action='list'. "
            "Each entry has: session_id, command, status, exit_code, started_at."
        ),
    )
    outcome_kind: str | None = Field(
        default=None,
        description="Classified terminal outcome for diagnostics and agent consumption.",
    )
    outcome_severity: Literal["info", "warning", "error"] | None = Field(
        default=None,
        description="Severity derived from the classified terminal outcome.",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Outcome warnings, such as suspicious successful pipeline output.",
    )

    def _diagnostic_payload(self) -> dict[str, Any]:
        outcome = classify_terminal_observation(self)
        warnings = self.warnings or outcome.warnings
        payload: dict[str, Any] = {
            "backend": self.backend,
            "command": self.command,
            "detail": self.detail,
            "error_class": self.error_class,
            "exit_code": self.exit_code,
            "failure_kind": self.failure_kind,
            "kill_status": self.kill_status,
            "outcome_kind": self.outcome_kind or outcome.kind,
            "outcome_severity": self.outcome_severity or outcome.severity,
            "session_reinitialized": self.session_reinitialized,
            "timeout": self.timeout,
            "timeout_seconds": self.timeout_seconds,
            "warnings": warnings or None,
            "working_dir": self.metadata.working_dir,
        }
        if self.session_id:
            payload["session_id"] = self.session_id
            payload["session_status"] = self.session_status
            payload["session_exit_code"] = self.session_exit_code
        if self.active_sessions is not None:
            payload["active_sessions"] = self.active_sessions
        return {key: value for key, value in payload.items() if value is not None}

    @property
    def to_llm_content(self) -> Sequence[TextContent | ImageContent]:
        diagnostic_block = json.dumps(self._diagnostic_payload(), sort_keys=True)
        sections = [f"[terminal_diagnostic]\n{diagnostic_block}"]

        # Format active sessions list if present
        if self.active_sessions is not None:
            if self.active_sessions:
                lines = ["[active_sessions]"]
                lines.append(f"  {'ID':<14} {'STATUS':<12} {'EXIT':<6} COMMAND")
                lines.append(f"  {'-' * 14} {'-' * 12} {'-' * 6} {'-' * 40}")
                for s in self.active_sessions:
                    sid = s.get("session_id", "?")
                    status = s.get("status", "?")
                    exit_code = str(s.get("exit_code") or "?")
                    command = s.get("command", "")[:40]
                    lines.append(f"  {sid:<14} {status:<12} {exit_code:<6} {command}")
            else:
                lines = ["[active_sessions]\n  (none)"]
            sections.append("\n".join(lines))
        elif self.session_id:
            status_label = self.session_status or "unknown"
            sections.insert(
                0,
                f"[bg_session: {self.session_id}] status={status_label}"
                f" exit_code={self.session_exit_code}",
            )

        if self.text:
            label = (
                "partial_terminal_output" if self.failure_kind == "timeout" else "terminal_output"
            )
            sections.append(f"[{label}]\n{self.text}")
        elif self.exit_code == -1 and self.failure_kind is None and self.session_id is None:
            # Soft no-output pause with no captured output.  Emit an explicit
            # placeholder rather than omitting the section entirely — an absent
            # [terminal_output] section is ambiguous to models and has been
            # observed to cause them to report the tool as non-functional.
            sections.append("[terminal_output]\n(no output)")

        text = "\n\n".join(sections)
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"

        truncated = maybe_truncate(
            content=text,
            truncate_after=MAX_CMD_OUTPUT_SIZE,
            save_dir=self.full_output_save_dir,
            tool_prefix="bash",
        )
        return [TextContent(text=truncated)]

    @property
    def visualize(self) -> Text:
        if not self.is_error and self.failure_kind is None and not self.timeout:
            return super().visualize

        text = Text()
        if self.is_error:
            text.append(self.ERROR_MESSAGE_HEADER, style="bold red")
        text.append("[terminal_diagnostic]\n", style="bold yellow")
        text.append(json.dumps(self._diagnostic_payload(), sort_keys=True), style="yellow")
        if self.text:
            label = (
                "partial_terminal_output" if self.failure_kind == "timeout" else "terminal_output"
            )
            text.append(f"\n\n[{label}]\n", style="bold")
            text.append(self.text, style="white")
        return text


_HARDENED_TOOL_DESCRIPTION = f"""Execute a bash command in a persistent terminal session.


### Command Execution
* One command at a time: Use `&&` or `;` if you need a short sequence.
* Persistent session: Environment variables, working directory, and shell state persist between
  commands until the session is reset or a hard timeout rebuilds the backend.
* Hard timeout: If you set `timeout`, it is a real wall-clock limit. Once it is reached,
  the tool force-kills the command by rebuilding the terminal session or tmux pane and returns
  a structured error diagnostic.
* Soft no-output pause: If you omit `timeout`, the tool pauses after
  {NO_CHANGE_TIMEOUT_SECONDS} seconds with no new output and returns exit code `-1` so you can
  fetch more logs, send input, or interrupt the process.
* Shell options: Do NOT use `set -e`, `set -eu`, or `set -euo pipefail` in this environment.

### Platform: Windows / PowerShell
The shell backend on Windows is **PowerShell**, not bash.
* NEVER use bash heredocs (`<<EOF`, `<<'PY'`, `<<'END'`): they hang permanently and never
  return on PowerShell. There is no workaround — write multi-line content to a file instead.
* NEVER use bash arrays, `[[ ]]` conditionals, `source`, or bash-only builtins.
* `&&`, `;`, `2>&1` redirection, and `$env:VAR` references are safe in PowerShell.
* For multi-line Python, write a temp script with `write_file` and run `python temp_file.py`,
  or use a single-line `python -c "..."`.

### Long-running Commands
* Use `timeout` for builds, tests, installs, or any bounded command where you want a
  guaranteed cutoff.
* For daemons or servers, run them in the background and redirect output to a file,
  e.g. `python3 app.py > server.log 2>&1 &`.
* If a command returns exit code `-1`, that means it hit the soft no-output pause and is
  still running. Use `is_input=true` to fetch more logs, send stdin, or send control keys
  like `C-c`.

### Failure Handling
Every observation includes a `[terminal_diagnostic]` JSON block. When `failure_kind` is
present, **read the diagnostic before retrying**.
* `failure_kind = "timeout"` (exit 124): the process was force-killed and session state is
  lost. Do NOT retry the same command — rethink the approach.
* `exit_code = -1` without `failure_kind`: soft no-output pause; command still running or
  produced output only on stderr (not captured). When `[terminal_output]` shows `(no output)`,
  the process wrote nothing to stdout. Send an empty command with `is_input=true` to poll for
  more output, or `C-c` to interrupt. Re-run with `2>&1` appended to capture stderr alongside
  stdout (e.g. `pnpm typecheck 2>&1`).
* `failure_kind = "execution_error"`: internal tool error; check `error_class` and `detail`.
  Try `reset=true` before retrying.
* `failure_kind = "sandbox_unavailable"`: this session requires an OS-level sandbox and the
  sandbox could not be applied or could not start, so the command **did not run**. This is a
  host configuration problem. Do NOT retry and do NOT rewrite the command — report the
  `detail` and the `[terminal_output]` to the user instead.
* Non-zero exit without `failure_kind`: runtime failure. Read `[terminal_output]` for the
  error text before retrying.

### Timeout Diagnostics
* A hard-timeout result is an error observation with machine-readable diagnostics including
  `failure_kind`, `timeout_seconds`, `kill_status`, `session_reinitialized`, and `backend`.
* After a hard timeout, the shell backend is recreated. Expect session state from that
  terminal instance to be lost.

### Terminal Reset
* `reset=true` starts from a fresh terminal session before running the command.
* Reset cannot be combined with `is_input=true`.

### Background Sessions (servers, containers, daemons)
Use `background=true` to start commands that should run independently while you continue
working. The tool returns a `session_id` immediately; query, control, and kill the session
by its ID in subsequent calls.

* **Start a background command:** set `background=true` with a `command`. Returns a
  `session_id` (format: `ts_XXXXXXXX`) and session_status="running". The command runs
  persistently in its own subprocess.
* **Poll for output:** set `session_id` to a background session ID (defaults to
  session_action="query"). Each call returns only *new* output since the last poll.
  Accumulate manually if full history is needed.
* **List active sessions:** set `session_action="list"` (no session_id needed). Returns
  all sessions with their status, command, and exit code.
* **Kill a session:** set `session_id` + `session_action="kill"`. Sends SIGTERM, waits 5s,
  then SIGKILL. Returns final output and exit code.
* **Send stdin input:** set `session_id` + `session_action="send_input"` + `input_data`.
  Writes to the process stdin.
* **Send a signal:** set `session_id` + `session_action="send_signal"` + `signal`
  (SIGTERM, SIGINT, SIGKILL, or SIGHUP; defaults to SIGTERM).
* **Concurrency:** you can run multiple background sessions in parallel (up to the
  configured max). Each gets its own session_id. Use `session_action="list"` to see them all.
* **Output buffer:** capped at 1 MB per session. Oldest output is silently truncated.
* **Timeout:** each background session has a configurable wall-clock timeout. When it
  expires, the process is force-killed (exit code 124, status="timeout"). The default
  is set in the runtime config (see config.runtime.shell_background_timeout).
* Background mode cannot be combined with `is_input`, `reset`, or regular sync commands.
"""


@traces(
    SWR.SWR_503,
    SWR.SWR_506,
    SWR.SWR_508,
    SWR.SWR_510,
    SWR.SWR_511,
    SWR.SWR_513,
    SWR.SWR_514,
    SWR.SWR_516,
    SWR.SWR_2116,
    SWR.SWR_2507,
)
@traces(SWR.SWR_3618)
def _observation_output_text(observation: Any) -> str:
    """The command's own output, as a display should finally show it."""
    for attribute in ("output", "text"):
        value = getattr(observation, attribute, None)
        if isinstance(value, str) and value.strip():
            return value
    return ""


@traces(SWR.SWR_3618)
def _foreground_control(tap: Any, terminal: Any) -> Any:
    """Bind a running foreground terminal's input paths for the display."""
    from rotaris_core.terminal_stream.hub import TerminalStreamControl

    def send_keys(text: str, enter: bool) -> None:
        tap.send_keys(text, enter=enter)

    def resize(cols: int, rows: int) -> bool:
        return bool(tap.resize(cols, rows))

    interrupt = getattr(terminal, "interrupt", None)
    return TerminalStreamControl(send_keys=send_keys, resize=resize, interrupt=interrupt)


class HardenedTerminalExecutor(SDKTerminalExecutorBase):
    """Terminal executor that converts timeout into a forced kill and clear diagnostics."""

    _POOL_RECOVERY_MAX_ATTEMPTS: ClassVar[int] = 3
    _POOL_RECOVERY_COOLDOWN_S: ClassVar[float] = 10.0

    # Class-level defaults, not just ``__init__`` assignments: the SDK and the
    # test suite both build executors without calling ``__init__``, and "no
    # sandbox" is the only safe thing such an executor can mean — the alternative
    # is an AttributeError at the wrap point, i.e. a broken terminal.
    _sandbox_spec: SandboxSpec | None = None
    _sandbox_backend: SandboxBackend | None = None
    # Same reasoning for the live-output wiring (SWR-3618): an executor built
    # without ``__init__`` streams nothing rather than raising at the tap point.
    _stream_hub: TerminalStreamHub | None = None
    _stream_session_id: str = ""
    _stream_key: str = ""
    _stream_interval_s: float = 0.1

    def __init__(
        self,
        working_dir: str,
        username: str | None = None,
        no_change_timeout_seconds: int | None = None,
        terminal_type: Literal["tmux", "subprocess"] | None = None,
        shell_path: str | None = None,
        full_output_save_dir: str | None = None,
        default_timeout_seconds: float | None = None,
        max_background_sessions: int = 20,
        background_default_timeout: float = 3600,
        sandbox_spec: SandboxSpec | None = None,
        sandbox_backend: SandboxBackend | None = None,
        stream_hub: TerminalStreamHub | None = None,
        stream_session_id: str = "",
        stream_key: str = "",
        stream_interval_s: float = 0.1,
    ) -> None:
        _install_cached_powershell_probe()
        super().__init__(
            working_dir=working_dir,
            username=username,
            no_change_timeout_seconds=no_change_timeout_seconds,
            terminal_type=terminal_type,
            shell_path=shell_path,
            full_output_save_dir=full_output_save_dir,
        )
        self._default_timeout_seconds = default_timeout_seconds
        self._session_registry = TerminalSessionRegistry(
            max_sessions=max_background_sessions,
            default_timeout=background_default_timeout,
        )
        self._pool_recovery_attempts: int = 0
        self._pool_recovery_last_time: float = 0.0
        # ``off`` is normalized to "no sandbox" so the wrap point has exactly one
        # falsy state to test rather than two that must stay in agreement.
        if sandbox_spec is not None and sandbox_spec.mode is SandboxMode.OFF:
            sandbox_spec = None
        self._stream_hub = stream_hub
        self._stream_session_id = stream_session_id
        self._stream_key = stream_key or "root"
        self._stream_interval_s = stream_interval_s
        self._sandbox_spec = sandbox_spec
        self._sandbox_backend = None
        if sandbox_spec is not None:
            if sandbox_backend is None:
                from rotaris_core.sandbox.backends import resolve_backend

                sandbox_backend = resolve_backend()
            self._sandbox_backend = sandbox_backend

    def _backend_name(self) -> Literal["single-session", "tmux-pool"]:
        return "tmux-pool" if self._pool is not None else "single-session"

    def _apply_default_timeout(self, action: HardenedTerminalAction) -> HardenedTerminalAction:
        if action.is_input or action.timeout is not None or self._default_timeout_seconds is None:
            return action
        return action.model_copy(update={"timeout": float(self._default_timeout_seconds)})

    @traces(SWR.SWR_2507)
    def _sandbox_applies(self, action: HardenedTerminalAction) -> bool:
        """Whether *action* carries a new command that must be sandbox-wrapped.

        Only a *new command string* is wrappable.  Session control (``list``,
        ``query``, ``kill`` …) is not a command; keystrokes sent with
        ``is_input`` go to a process that is already running inside its own
        wrapper, and wrapping them would type the wrapper into that process's
        stdin; an empty command is the "give me more output" poll.  Everything
        else is wrapped — deliberately including ``background``, whose spawn
        path is a separate :func:`subprocess.Popen` that would otherwise be a
        one-flag escape from the sandbox.

        The order below mirrors the dispatch order in :meth:`__call__` on
        purpose.  ``background`` outranks ``session_id`` there, so it has to
        outrank it here too: the two fields are documented as mutually
        exclusive but nothing rejects the pair, and reading ``session_id``
        first would let an agent spawn an unsandboxed process by sending both.
        """
        if self._sandbox_spec is None or self._sandbox_backend is None:
            return False
        if action.is_input or not action.command.strip():
            return False
        if action.session_action == "list":
            return False
        if action.background:
            return True
        return action.session_action is None and action.session_id is None

    @traces(SWR.SWR_2507)
    def _sandboxed_action(self, action: HardenedTerminalAction) -> HardenedTerminalAction:
        """A *copy* of *action* whose command runs under the sandbox.

        A copy, never an in-place edit: the caller keeps its action, and a retry
        of the same action therefore wraps once rather than nesting wrappers.
        """
        spec = self._sandbox_spec
        backend = self._sandbox_backend
        if spec is None or backend is None:  # pragma: no cover - guarded by caller
            raise RuntimeError("Sandbox wrap requested without a configured sandbox.")
        return action.model_copy(update={"command": backend.wrap(action.command, spec)})

    @traces(SWR.SWR_2507)
    def _sandbox_unavailable_observation(
        self,
        command: str,
        error: BaseException,
    ) -> HardenedTerminalObservation:
        """Report a sandbox that could not be applied — without running anything.

        SWR-2507 forbids falling back to the host shell, so this is returned
        *instead of* execution, carrying the backend's own remediation so the
        user can act on it.  ``exit_code`` 126 ("command found but could not be
        executed") keeps the outcome classifier from reading a command that
        never ran as a success.

        The outcome is stamped explicitly rather than left to
        :func:`classify_terminal_observation`, which has no
        ``sandbox_unavailable`` arm and would fall through to "shell failure".
        Without this, the same host problem reported two different outcomes
        depending on whether the sandbox refused at wrap time or at launch time
        (:meth:`_relabel_sandbox_startup_failure`).
        """
        return self._error_observation(
            command=command,
            failure_kind="sandbox_unavailable",
            detail=(
                "This session requires the OS-level sandbox, but the command could "
                f"not be sandboxed and was therefore not run: {error}"
            ),
            error_class=type(error).__name__,
            exit_code=126,
        ).model_copy(
            update={
                "outcome_kind": "sandbox_unavailable",
                "outcome_severity": "error",
            },
        )

    @traces(SWR.SWR_2507)
    def _relabel_sandbox_startup_failure(
        self,
        observation: HardenedTerminalObservation,
    ) -> HardenedTerminalObservation:
        """Re-label a wrapper that never started as ``sandbox_unavailable``.

        The sandbox has two ways to be missing and only one of them was visible
        before.  :meth:`_sandbox_unavailable_observation` covers the wrap step
        refusing up front; this covers the wrapper being *built* fine and then
        failing at exec time — the case a ``shutil.which`` probe cannot rule out
        on a host that forbids unprivileged user namespaces.  Left alone, every
        command in such a session looks like an ordinary non-zero exit, so the
        agent retries the command instead of the operator fixing the host.

        Returns *observation* unchanged unless it is unambiguously a launcher
        failure: a wrapped command, a non-zero exit, no failure kind already
        assigned (a hard timeout is a timeout, whatever the output says), and
        output consisting only of the launcher's own diagnostics.
        """
        backend = self._sandbox_backend
        if backend is None or self._sandbox_spec is None:
            return observation
        if observation.failure_kind is not None:
            return observation
        prefixes = _SANDBOX_LAUNCHER_PREFIXES.get(getattr(backend, "name", ""))
        if not prefixes:
            return observation
        if observation.exit_code in (None, 0):
            return observation
        if not _is_sandbox_startup_failure(observation.text or "", prefixes):
            return observation
        return observation.model_copy(
            update={
                "is_error": True,
                "failure_kind": "sandbox_unavailable",
                "detail": (
                    "The OS-level sandbox failed to start, so the command did not run. "
                    "This is a host problem, not a problem with the command — retrying "
                    "it, or rewriting it, will not help. The launcher's own message is "
                    "in the terminal output below."
                ),
                "outcome_kind": "sandbox_unavailable",
                "outcome_severity": "error",
            },
        )

    @staticmethod
    def _with_display_command(
        observation: HardenedTerminalObservation,
        command: str | None,
    ) -> HardenedTerminalObservation:
        """Restore the command the caller asked for on a sandboxed result.

        The executed string carries the whole Seatbelt profile / ``bwrap`` argv;
        echoing that back would bury the actual command in wrapper noise and
        invite the model to "fix" the wrapper on a retry.
        """
        if command is None:
            return observation
        return observation.model_copy(update={"command": command})

    def _coerce_observation(
        self,
        observation: Any,
    ) -> HardenedTerminalObservation:
        if isinstance(observation, HardenedTerminalObservation):
            obs = observation
        else:
            obs = HardenedTerminalObservation(**observation.model_dump(exclude={"kind"}))

        # Always stamp the backend so it appears in every diagnostic payload.
        updates: dict[str, Any] = {"backend": self._backend_name()}

        # Soft no-output pause: the SDK returns exit_code=-1 with empty text when a
        # command produces no stdout for NO_CHANGE_TIMEOUT_SECONDS seconds.  Without
        # an explicit detail the model only sees {"exit_code": -1} and has no way to
        # distinguish a silently-failing command from a broken tool.  Annotate so it
        # can take the right corrective action.
        if obs.exit_code == -1 and obs.failure_kind is None and not obs.text:
            updates["detail"] = (
                f"Soft no-output pause: the command produced no stdout for "
                f"{NO_CHANGE_TIMEOUT_SECONDS} seconds. The process may still be "
                "running, or all output went to stderr (not captured by the "
                "terminal). Use is_input=true with an empty command to poll for "
                "more output, send 'C-c' to interrupt, or re-run the command with "
                "'2>&1' appended to merge stderr into stdout."
            )

        obs = obs.model_copy(update=updates)
        outcome = classify_terminal_observation(obs)
        return obs.model_copy(
            update={
                "outcome_kind": outcome.kind,
                "outcome_severity": outcome.severity,
                "warnings": outcome.warnings,
            },
        )

    def _with_prelude(
        self,
        observation: Any,
        prelude_text: str | None,
        command: str,
    ) -> Any:
        if not prelude_text:
            return observation
        combined_text = prelude_text
        if observation.text:
            combined_text = f"{combined_text}\n\n{observation.text}"
        return observation.model_copy(
            update={
                "content": [TextContent(text=combined_text)],
                "command": command,
            },
        )

    def _error_observation(
        self,
        *,
        command: str,
        failure_kind: Literal[
            "timeout",
            "invalid_request",
            "execution_error",
            "sandbox_unavailable",
        ],
        detail: str,
        error_class: str | None = None,
        timeout_seconds: float | None = None,
        kill_status: Literal[
            "session_reset",
            "pane_replaced",
            "reset_failed",
            "replace_failed",
        ]
        | None = None,
        session_reinitialized: bool = False,
        exit_code: int | None = None,
        output_text: str = "",
    ) -> HardenedTerminalObservation:
        metadata = CmdOutputMetadata(
            exit_code=exit_code if exit_code is not None else -1,
            working_dir=self._working_dir,
        )
        return HardenedTerminalObservation.from_text(
            text=output_text,
            is_error=True,
            command=command,
            exit_code=exit_code,
            timeout=failure_kind == "timeout",
            metadata=metadata,
            full_output_save_dir=self.full_output_save_dir,
            failure_kind=failure_kind,
            timeout_seconds=timeout_seconds,
            kill_status=kill_status,
            session_reinitialized=session_reinitialized,
            backend=self._backend_name(),
            error_class=error_class,
            detail=detail,
        )

    def _timeout_observation(
        self,
        observation: Any,
        *,
        action: HardenedTerminalAction,
        kill_status: Literal[
            "session_reset",
            "pane_replaced",
            "reset_failed",
            "replace_failed",
        ],
        session_reinitialized: bool,
        detail: str,
        error_class: str | None = None,
    ) -> HardenedTerminalObservation:
        base = self._coerce_observation(observation)
        metadata = base.metadata.model_copy(
            update={"exit_code": _TIMEOUT_EXIT_CODE, "prefix": "", "suffix": ""},
        )
        return base.model_copy(
            update={
                "command": base.command or action.command,
                "exit_code": _TIMEOUT_EXIT_CODE,
                "timeout": True,
                "is_error": True,
                "metadata": metadata,
                "failure_kind": "timeout",
                "timeout_seconds": action.timeout,
                "kill_status": kill_status,
                "session_reinitialized": session_reinitialized,
                "backend": self._backend_name(),
                "error_class": error_class,
                "detail": detail,
            },
        )

    def _finalize_single_session_timeout(
        self,
        observation: Any,
        action: HardenedTerminalAction,
        *,
        prelude_text: str | None = None,
        command_label: str | None = None,
    ) -> HardenedTerminalObservation:
        timed_out_observation = self._with_prelude(
            observation,
            prelude_text,
            command_label or action.command,
        )
        try:
            self._reset_single_session()
        except Exception as exc:  # noqa: BLE001
            _log.warning("terminal timeout reset failed: %s", exc, exc_info=True)
            return self._timeout_observation(
                timed_out_observation,
                action=action,
                kill_status="reset_failed",
                session_reinitialized=False,
                detail=(
                    "Command exceeded its timeout, but rebuilding the terminal session"
                    f" failed: {exc}"
                ),
                error_class=type(exc).__name__,
            )

        return self._timeout_observation(
            timed_out_observation,
            action=action,
            kill_status="session_reset",
            session_reinitialized=True,
            detail=(
                "Command exceeded its timeout and the terminal session was forcibly"
                " restarted to terminate the process tree. Shell session state was lost."
            ),
        )

    def _finalize_pooled_timeout(
        self,
        handle: Any,
        session: Any,
        observation: Any,
        action: HardenedTerminalAction,
        *,
        prelude_text: str | None = None,
        command_label: str | None = None,
    ) -> HardenedTerminalObservation:
        timed_out_observation = self._with_prelude(
            observation,
            prelude_text,
            command_label or action.command,
        )
        old_terminal = handle.terminal
        try:
            pool = self._pool
            if pool is None:
                raise RuntimeError("Terminal pool is not initialized")
            self._discard_session(old_terminal)
            handle.terminal = pool.replace(old_terminal)
        except Exception as exc:  # noqa: BLE001
            _log.warning("terminal timeout pane replacement failed: %s", exc, exc_info=True)
            session.prev_status = None
            return self._timeout_observation(
                timed_out_observation,
                action=action,
                kill_status="replace_failed",
                session_reinitialized=False,
                detail=(
                    "Command exceeded its timeout, but replacing the timed-out tmux pane"
                    f" failed: {exc}"
                ),
                error_class=type(exc).__name__,
            )

        session.prev_status = None
        return self._timeout_observation(
            timed_out_observation,
            action=action,
            kill_status="pane_replaced",
            session_reinitialized=True,
            detail=(
                "Command exceeded its timeout and the timed-out tmux pane was replaced"
                " to terminate the process tree. Shell session state in that pane was lost."
            ),
        )

    @property
    def foreground_stream_id(self) -> str:
        """Identifier this executor's foreground terminal publishes under."""
        return f"fg:{self._stream_key or 'root'}"

    @traces(SWR.SWR_3618)
    @contextmanager
    def _streaming(self, command: str, terminal: Any, outcome: dict[str, Any]) -> Any:
        """Publish *terminal*'s output for as long as the block runs.

        Everything here is best effort by construction: no hub, no listener, a
        backend nothing can sample, or an outright failure all resolve to "no
        live preview".  None of them may change the observation the agent gets.
        """
        hub = self._stream_hub
        session_id = self._stream_session_id
        if hub is None or not session_id or not command.strip():
            yield
            return
        tap = None
        stream_id = self.foreground_stream_id
        try:
            from rotaris_core.terminal_stream.tap import tap_for_terminal

            hub.open_stream(session_id, stream_id, command=command)
            tap = tap_for_terminal(
                terminal,
                hub,
                session_id,
                stream_id,
                interval_s=self._stream_interval_s,
            )
            if tap is not None:
                tap.start()
                hub.register_control(
                    session_id,
                    stream_id,
                    _foreground_control(tap, terminal),
                )
        except Exception:  # noqa: BLE001 - streaming must never fail a command
            _log.debug("Could not start terminal streaming for %s", stream_id, exc_info=True)
            tap = None
        try:
            yield
        finally:
            if tap is not None:
                with suppress(Exception):
                    tap.stop()
            # The last word belongs to the observation, not to the last sample.
            # A tmux pane is cleared for the next command the moment this one
            # ends, so a final scrape would replace the output the user was
            # reading with an empty prompt.
            final_text = str(outcome.get("text") or "")
            if final_text:
                with suppress(Exception):
                    hub.publish(session_id, stream_id, "screen", final_text)
            with suppress(Exception):
                hub.close_stream(session_id, stream_id, exit_code=outcome.get("exit_code"))

    def _execute_streamed(self, session: Any, sdk_action: Any) -> Any:
        """Run one command on *session*, streaming its output while it blocks."""
        command = str(getattr(sdk_action, "command", "") or "")
        outcome: dict[str, Any] = {}
        with self._streaming(command, getattr(session, "terminal", None), outcome):
            observation = session.execute(sdk_action)
            outcome["text"] = _observation_output_text(observation)
            exit_code = getattr(observation, "exit_code", None)
            outcome["exit_code"] = exit_code if isinstance(exit_code, int) else None
            return observation

    def _execute_single_session(
        self,
        action: Any,
        conversation: Any = None,
    ) -> HardenedTerminalObservation:
        session = self._session
        if session is None:
            raise RuntimeError("Terminal session is not initialized")

        if action.reset or session._closed:
            reset_result = self._reset_single_session()

            if action.command.strip():
                session = self._session
                if session is None:
                    raise RuntimeError("Terminal session is not initialized after reset")
                command_action = HardenedTerminalAction(
                    command=action.command,
                    timeout=action.timeout,
                    is_input=False,
                )
                sdk_action = cast("SDKTerminalAction", command_action)
                self._export_envs(sdk_action, conversation, session=session)
                command_result = self._mask_observation(
                    self._execute_streamed(session, sdk_action), conversation
                )

                if session.prev_status is TerminalCommandStatus.HARD_TIMEOUT:
                    return self._finalize_single_session_timeout(
                        command_result,
                        action,
                        prelude_text=reset_result.text,
                        command_label=f"[RESET] {action.command}",
                    )

                observation = self._with_prelude(
                    command_result,
                    reset_result.text,
                    f"[RESET] {action.command}",
                )
            else:
                observation = reset_result
        else:
            sdk_action = cast("SDKTerminalAction", action)
            self._export_envs(sdk_action, conversation, session=session)
            command_result = self._mask_observation(
                self._execute_streamed(session, sdk_action), conversation
            )
            if session.prev_status is TerminalCommandStatus.HARD_TIMEOUT:
                return self._finalize_single_session_timeout(command_result, action)
            observation = command_result

        return self._coerce_observation(observation)

    def _execute_pooled(
        self,
        action: Any,
        conversation: Any = None,
    ) -> HardenedTerminalObservation:
        pool = self._pool
        if pool is None:
            raise RuntimeError("Terminal pool is not initialized")

        # Proactive liveness check: if the tmux session died silently
        # between calls, rebuild the pool now so the agent never sees
        # a "not initialized or already closed" error.
        if pool._closed or not pool._initialized:
            _log.warning(
                "TmuxPanePool is %s; proactively rebuilding before command execution",
                "closed" if pool._closed else "not initialized",
            )
            self._recover_tmux_pool(pool)
            pool = self._pool
            if pool is None:
                raise RuntimeError("Terminal pool is not initialized after proactive recovery")

        try:
            with pool.pane() as handle:
                reset_text: str | None = None

                if action.reset or handle.terminal._closed:
                    self._discard_session(handle.terminal)
                    handle.terminal = pool.replace(handle.terminal)
                    reset_text = (
                        "Terminal session has been reset. All previous environment variables"
                        " and session state have been cleared."
                    )
                    _log.info("Terminal pane replaced (reset) working_dir: %s", self._working_dir)

                    if not action.command.strip():
                        observation: Any = SDKTerminalObservation.from_text(
                            text=reset_text,
                            command="[RESET]",
                            exit_code=0,
                        )
                        self._pool_recovery_attempts = 0
                        return self._coerce_observation(observation)

                session = self._wrap_session(handle.terminal)
                self._prepare_pooled_session(session)

                command_action = (
                    action
                    if reset_text is None
                    else HardenedTerminalAction(
                        command=action.command,
                        timeout=action.timeout,
                        is_input=False,
                    )
                )
                sdk_action = cast("SDKTerminalAction", command_action)
                self._export_envs(sdk_action, conversation, session=session)
                command_result = self._mask_observation(
                    self._execute_streamed(session, sdk_action), conversation
                )

                if session.prev_status is TerminalCommandStatus.HARD_TIMEOUT:
                    # Timeout is a terminal outcome — don't reset recovery counter
                    # (the pool is about to be replaced anyway).
                    return self._finalize_pooled_timeout(
                        handle,
                        session,
                        command_result,
                        action,
                        prelude_text=reset_text,
                        command_label=f"[RESET] {action.command}"
                        if reset_text is not None
                        else None,
                    )

                if reset_text is not None:
                    command_result = self._with_prelude(
                        command_result,
                        reset_text,
                        f"[RESET] {action.command}",
                    )

                # Successful execution proves the pool is healthy.
                self._pool_recovery_attempts = 0
                return self._coerce_observation(command_result)
        except Exception as error:
            if not self._is_recoverable_tmux_pool_error(error) and not (
                isinstance(error, RuntimeError)
                and "not initialized or already closed" in str(error)
            ):
                raise

            # Recovery-loop guard: if the pool keeps failing within the
            # cooldown window, stop recovering and return a clean error
            # instead of looping forever.
            now = time.monotonic()
            if now - self._pool_recovery_last_time > self._POOL_RECOVERY_COOLDOWN_S:
                self._pool_recovery_attempts = 0
            self._pool_recovery_attempts += 1
            self._pool_recovery_last_time = now
            if self._pool_recovery_attempts > self._POOL_RECOVERY_MAX_ATTEMPTS:
                _log.warning(
                    "Pool unstable: %d recovery attempts in %.1f s cooldown window",
                    self._pool_recovery_attempts - 1,
                    self._POOL_RECOVERY_COOLDOWN_S,
                )
                return self._error_observation(
                    command=action.command,
                    failure_kind="execution_error",
                    detail=(
                        f"Pool unstable: {self._pool_recovery_attempts} recovery "
                        f"attempts within {self._POOL_RECOVERY_COOLDOWN_S:.0f} s "
                        "cooldown window. The tmux server may be unreachable."
                    ),
                    error_class="RuntimeError",
                )

            _log.warning(
                "Recovering terminal pane pool after tmux session error (attempt %d/%d): %s",
                self._pool_recovery_attempts,
                self._POOL_RECOVERY_MAX_ATTEMPTS,
                error,
                exc_info=True,
            )
            try:
                self._recover_tmux_pool(pool)
            except Exception as recovery_error:
                _log.warning(
                    "Failed to recover terminal pane pool: %s",
                    recovery_error,
                    exc_info=True,
                )
                raise
            observation = self._tmux_pool_recovery_observation(action, error)
            return self._coerce_observation(observation)

    def __call__(
        self,
        action: Any,
        conversation: Any = None,
    ) -> HardenedTerminalObservation:
        action = self._apply_default_timeout(action)

        # --- Sandbox wrap (SWR-2507) ---
        # Before dispatch, so the one chokepoint covers both spawn paths: the
        # SDK terminal for foreground work and TerminalSessionRegistry.spawn for
        # background work.  Deliberately outside the try/except below: a sandbox
        # failure must not be catchable into the generic "execution_error" retry
        # path, which would run the command again unwrapped.
        display_command: str | None = None
        if self._sandbox_applies(action):
            requested_command = action.command
            try:
                action = self._sandboxed_action(action)
            except SandboxUnavailableError as exc:
                return self._sandbox_unavailable_observation(requested_command, exc)
            except Exception as exc:  # noqa: BLE001 - never run the command unwrapped
                _log.warning(
                    "sandbox wrap failed for command %r: %s",
                    requested_command,
                    exc,
                    exc_info=True,
                )
                return self._sandbox_unavailable_observation(requested_command, exc)
            display_command = requested_command

        # --- Background session dispatch ---
        if action.session_action == "list":
            return self._handle_list_sessions()

        if action.background:
            return self._handle_background_spawn(action, display_command=display_command)

        if action.session_id is not None:
            return self._handle_session_action(action)

        # --- Existing sync validation ---
        if action.reset and action.is_input:
            return self._error_observation(
                command=action.command,
                failure_kind="invalid_request",
                detail="Cannot use reset=True with is_input=True in the same terminal call.",
                error_class="ValueError",
            )

        try:
            if self._pool is not None:
                result = self._execute_pooled(action, conversation)
            else:
                result = self._execute_single_session(action, conversation)
            # Successful execution proves the pool is healthy.
            self._pool_recovery_attempts = 0
            if display_command is not None:
                # Only a command this call actually wrapped can be re-read as a
                # launcher failure; anything else never went near the sandbox.
                result = self._relabel_sandbox_startup_failure(result)
            return self._with_display_command(result, display_command)
        except Exception as exc:  # noqa: BLE001
            _log.warning(
                "terminal executor failed for command %r: %s",
                action.command,
                exc,
                exc_info=True,
            )
            # Attempt lazy pool recovery so the next terminal call has a
            # working pool.  This covers the case where a previous
            # _execute_pooled recovery attempt itself failed (e.g.
            # _initialize_pool raised), leaving the pool in a broken state.
            if (
                isinstance(exc, RuntimeError)
                and (
                    "not initialized or already closed" in str(exc)
                    or "Terminal pool is not initialized" in str(exc)
                )
                and self._pool is not None
            ):
                with suppress(Exception):
                    self._recover_tmux_pool(self._pool)
            return self._with_display_command(
                self._error_observation(
                    command=action.command,
                    failure_kind="execution_error",
                    detail=f"Terminal execution failed before completion: {exc}",
                    error_class=type(exc).__name__,
                ),
                display_command,
            )

    # ------------------------------------------------------------------
    # Background session handlers
    # ------------------------------------------------------------------

    def _handle_background_spawn(
        self,
        action: HardenedTerminalAction,
        display_command: str | None = None,
    ) -> HardenedTerminalObservation:
        """Validate and spawn a background terminal session.

        *action* carries the command that is actually spawned — already sandbox-
        wrapped when the session is sandboxed (SWR-2507).  *display_command* is
        the command the agent asked for, echoed back so the result reads as the
        agent's own command rather than as a wall of wrapper argv.
        """
        shown = display_command if display_command is not None else action.command
        if action.is_input:
            return self._error_observation(
                command=shown,
                failure_kind="invalid_request",
                detail="Cannot use background=True with is_input=True.",
                error_class="ValueError",
            )
        if action.reset:
            return self._error_observation(
                command=shown,
                failure_kind="invalid_request",
                detail="Cannot use background=True with reset=True.",
                error_class="ValueError",
            )
        if not action.command.strip():
            return self._error_observation(
                command=shown,
                failure_kind="invalid_request",
                detail="A command is required when background=True.",
                error_class="ValueError",
            )

        try:
            session_id = self._session_registry.spawn(
                command=action.command,
                working_dir=self._working_dir,
                timeout=action.timeout,
            )
        except RuntimeError as exc:
            return self._error_observation(
                command=shown,
                failure_kind="execution_error",
                detail=str(exc),
                error_class="RuntimeError",
            )

        self._stream_background_session(session_id, shown)

        return HardenedTerminalObservation.from_text(
            text=f"Background session started: {session_id}\nCommand: {shown}",
            command=shown,
            exit_code=0,
            metadata=CmdOutputMetadata(exit_code=0, working_dir=self._working_dir),
            full_output_save_dir=self.full_output_save_dir,
            session_id=session_id,
            session_status="running",
            backend=self._backend_name(),
        )

    @traces(SWR.SWR_3618)
    def _stream_background_session(self, session_id: str, command: str) -> None:
        """Publish a background session's output and accept input for it.

        A background session is a pipe, not a terminal, so its stream is pure
        appended output and its input path is stdin — but the display asks the
        hub the same way it does for a foreground command.
        """
        hub = self._stream_hub
        stream_session = self._stream_session_id
        if hub is None or not stream_session:
            return
        session = self._session_registry.session(session_id)
        if session is None:
            return
        stream_id = f"bg:{session_id}"
        try:
            from rotaris_core.terminal_stream.hub import TerminalStreamControl

            hub.open_stream(stream_session, stream_id, command=command)

            def _on_output(chunk: str) -> None:
                hub.publish(stream_session, stream_id, "delta", chunk)

            def _on_exit(code: int | None) -> None:
                hub.close_stream(stream_session, stream_id, exit_code=code)

            def _send_keys(text: str, enter: bool) -> None:
                session.send_input(text + ("\n" if enter else ""))

            def _interrupt() -> bool:
                session.send_signal(signal.SIGINT)
                return True

            session.observe(on_output=_on_output, on_exit=_on_exit)
            hub.register_control(
                stream_session,
                stream_id,
                TerminalStreamControl(
                    send_keys=_send_keys,
                    interrupt=_interrupt,
                    kill=session.kill,
                ),
            )
        except Exception:  # noqa: BLE001 - streaming must never fail a spawn
            _log.debug("Could not stream background session %s", session_id, exc_info=True)

    def _handle_session_action(self, action: HardenedTerminalAction) -> HardenedTerminalObservation:
        """Dispatch to the correct background session handler."""
        session_id = action.session_id
        assert session_id is not None  # Already guarded

        session_action = action.session_action or "query"

        if session_action == "query":
            return self._handle_session_query(session_id, action)
        if session_action == "kill":
            return self._handle_session_kill(session_id, action)
        if session_action == "send_input":
            return self._handle_session_send_input(session_id, action)
        if session_action == "send_signal":
            return self._handle_session_send_signal(session_id, action)

        return self._error_observation(
            command="",
            failure_kind="invalid_request",
            detail=f"Unknown session_action: {session_action!r}",
            error_class="ValueError",
        )

    def _handle_list_sessions(self) -> HardenedTerminalObservation:
        """Return a list of all active background sessions."""
        sessions = self._session_registry.list_sessions()
        active_ids = self._session_registry.get_active_session_ids()

        lines = [f"{len(sessions)} session(s), {len(active_ids)} running:"]
        for s in sessions:
            flag = "▶" if s["status"] == "running" else "✓" if s["status"] == "completed" else "✗"
            lines.append(f"  {flag} {s['session_id']} {s['status']} — {s['command'][:60]}")

        return HardenedTerminalObservation.from_text(
            text="\n".join(lines),
            command="[list]",
            exit_code=0,
            metadata=CmdOutputMetadata(exit_code=0, working_dir=self._working_dir),
            full_output_save_dir=self.full_output_save_dir,
            active_sessions=sessions,
            backend=self._backend_name(),
        )

    def _handle_session_query(
        self,
        session_id: str,
        action: HardenedTerminalAction,
    ) -> HardenedTerminalObservation:
        try:
            status, output, exit_code = self._session_registry.query(session_id)
        except ValueError as exc:
            return self._error_observation(
                command=action.command,
                failure_kind="invalid_request",
                detail=str(exc),
                error_class="ValueError",
            )

        # A background spawn is wrapped like any other command, but its launcher
        # failure only becomes visible here — the spawn itself returns before the
        # process has had a chance to fail.  Without this the diagnosis would
        # cover foreground work only, and `background: true` would be the one way
        # to keep a broken sandbox looking like a broken command.
        return self._relabel_sandbox_startup_failure(
            HardenedTerminalObservation.from_text(
                text=output or "(no new output since last poll)",
                command=f"[query {session_id}]",
                exit_code=exit_code,
                metadata=CmdOutputMetadata(
                    exit_code=exit_code if exit_code is not None else -1,
                    working_dir=self._working_dir,
                ),
                full_output_save_dir=self.full_output_save_dir,
                session_id=session_id,
                session_status=status,
                session_exit_code=exit_code,
                backend=self._backend_name(),
            ),
        )

    def _handle_session_kill(
        self,
        session_id: str,
        action: HardenedTerminalAction,
    ) -> HardenedTerminalObservation:
        try:
            status, output, exit_code = self._session_registry.kill(session_id)
        except ValueError as exc:
            return self._error_observation(
                command=action.command,
                failure_kind="invalid_request",
                detail=str(exc),
                error_class="ValueError",
            )

        # Same reason as in the query path: the launcher's failure is only
        # readable once the background process's output comes back.
        return self._relabel_sandbox_startup_failure(
            HardenedTerminalObservation.from_text(
                text=output or "(no output)",
                command=f"[kill {session_id}]",
                exit_code=exit_code,
                metadata=CmdOutputMetadata(
                    exit_code=exit_code if exit_code is not None else -1,
                    working_dir=self._working_dir,
                ),
                full_output_save_dir=self.full_output_save_dir,
                session_id=session_id,
                session_status=status,
                session_exit_code=exit_code,
                backend=self._backend_name(),
            ),
        )

    def _handle_session_send_input(
        self,
        session_id: str,
        action: HardenedTerminalAction,
    ) -> HardenedTerminalObservation:
        if not action.input_data:
            return self._error_observation(
                command=action.command,
                failure_kind="invalid_request",
                detail="session_action='send_input' requires input_data.",
                error_class="ValueError",
            )
        try:
            self._session_registry.send_input(session_id, action.input_data)
        except ValueError as exc:
            return self._error_observation(
                command=action.command,
                failure_kind="invalid_request",
                detail=str(exc),
                error_class="ValueError",
            )

        return HardenedTerminalObservation.from_text(
            text=f"Sent {len(action.input_data)} byte(s) to session {session_id}.",
            command=f"[send_input {session_id}]",
            exit_code=0,
            metadata=CmdOutputMetadata(exit_code=0, working_dir=self._working_dir),
            full_output_save_dir=self.full_output_save_dir,
            session_id=session_id,
            session_status="running",
            backend=self._backend_name(),
        )

    def _handle_session_send_signal(
        self,
        session_id: str,
        action: HardenedTerminalAction,
    ) -> HardenedTerminalObservation:
        sig_name = action.signal or "SIGTERM"
        sig_num = getattr(signal, sig_name, signal.SIGTERM)
        try:
            self._session_registry.send_signal(session_id, sig_num)
        except ValueError as exc:
            return self._error_observation(
                command=action.command,
                failure_kind="invalid_request",
                detail=str(exc),
                error_class="ValueError",
            )

        return HardenedTerminalObservation.from_text(
            text=f"Sent {sig_name} to session {session_id}.",
            command=f"[send_signal {session_id}]",
            exit_code=0,
            metadata=CmdOutputMetadata(exit_code=0, working_dir=self._working_dir),
            full_output_save_dir=self.full_output_save_dir,
            session_id=session_id,
            session_status="running",
            backend=self._backend_name(),
        )

    def cleanup(self) -> None:
        """Kill all background sessions, close tmux pool, and release resources."""
        try:
            self._session_registry.cleanup()
        except Exception as exc:  # noqa: BLE001
            _log.warning("Background session cleanup error: %s", exc)
        try:
            self.close()
        except Exception as exc:  # noqa: BLE001
            _log.warning("Terminal pool close error during cleanup: %s", exc)

    def __del__(self) -> None:
        with suppress(Exception):
            self.cleanup()


class HardenedTerminalTool(ToolDefinition[HardenedTerminalAction, HardenedTerminalObservation]):
    """Repo-owned terminal tool with forced timeout kill semantics."""

    name: ClassVar[str] = "terminal"

    def declared_resources(self, action: Action) -> DeclaredResources:  # noqa: ARG002
        if getattr(self.executor, "is_pooled", False):
            return DeclaredResources(keys=(), declared=True)
        return DeclaredResources(keys=("terminal:session",), declared=True)

    @classmethod
    def create(
        cls,
        conv_state: ConversationState,
        username: str | None = None,
        no_change_timeout_seconds: int | None = None,
        terminal_type: Literal["tmux", "subprocess"] | None = None,
        shell_path: str | None = None,
        default_timeout_seconds: float | None = None,
        max_background_sessions: int = 20,
        background_default_timeout: float = 3600,
        sandbox_spec: SandboxSpec | None = None,
        sandbox_backend: SandboxBackend | None = None,
        stream_hub: TerminalStreamHub | None = None,
        stream_session_id: str = "",
        stream_key: str = "",
        stream_interval_s: float = 0.1,
        executor: ToolExecutor[Any, Any] | None = None,
    ) -> Sequence[Self]:
        working_dir = conv_state.workspace.working_dir
        if not os.path.isdir(working_dir):
            raise ValueError(f"working_dir '{working_dir}' is not a valid directory")

        if executor is None:
            executor = HardenedTerminalExecutor(
                working_dir=working_dir,
                username=username,
                no_change_timeout_seconds=no_change_timeout_seconds,
                terminal_type=terminal_type,
                shell_path=shell_path,
                full_output_save_dir=conv_state.env_observation_persistence_dir,
                default_timeout_seconds=default_timeout_seconds,
                max_background_sessions=max_background_sessions,
                background_default_timeout=background_default_timeout,
                sandbox_spec=sandbox_spec,
                sandbox_backend=sandbox_backend,
                stream_hub=stream_hub,
                stream_session_id=stream_session_id,
                stream_key=stream_key,
                stream_interval_s=stream_interval_s,
            )

        return [
            cls(
                action_type=HardenedTerminalAction,
                observation_type=HardenedTerminalObservation,
                description=_HARDENED_TOOL_DESCRIPTION,
                annotations=ToolAnnotations(
                    title="terminal",
                    readOnlyHint=False,
                    destructiveHint=True,
                    idempotentHint=False,
                    openWorldHint=True,
                ),
                executor=executor,
            ),
        ]
