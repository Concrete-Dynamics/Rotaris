"""Running one command, for everything in the verifier that needs to.

Three callers want the same small thing and used to have one and a half
implementations of it between them:

- :mod:`rotaris_core.verifier.runner` runs the bound suite (SWR-2602);
- :mod:`rotaris_core.verifier.calibration` runs a *probe* — the cheapest
  invocation that proves a command resolves here (SWR-2613);
- :mod:`rotaris_core.verifier.report_adapters` validates a proposed adapter by
  running it (SWR-2623), and declares that need as a
  ``Callable[[str], tuple[int, str]]`` it has so far had no production supplier
  for. :class:`CommandRunner` is that supplier.

Everything goes through
:class:`~rotaris_core.tools.terminal.HardenedTerminalExecutor`, so the SWR-2501
permission policy, SWR-2507 sandboxing and the timeout kill semantics apply to a
probe exactly as they apply to a real check. A probe is a command like any other
and must not get a quieter door.

Nothing here decides anything. It runs a command and reports what came back.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.terminal_outcome import classify_terminal_observation

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.permissions.engine import PermissionEngine

_log = logging.getLogger(__name__)

__all__ = [
    "CommandRunner",
    "cleanup_executor",
    "excerpt",
    "observation_text",
    "permission_denial",
    "run_command",
]

#: Upper bound on the excerpt kept inline per command. The full output is written
#: to the evidence directory and referenced by path, so a 200k-line pytest run
#: never travels through a report or a snapshot.
MAX_EXCERPT_CHARS = 4000


@traces(SWR.SWR_2602)
def observation_text(observation: Any) -> str:
    """Best-effort output text of a terminal observation."""
    text = getattr(observation, "text", None)
    if text is not None:
        return str(text)
    content = getattr(observation, "content", None)
    if isinstance(content, list):
        parts = [str(item.text) for item in content if getattr(item, "text", None) is not None]
        return "\n".join(parts)
    return ""


@traces(SWR.SWR_2602)
def excerpt(text: str, limit: int = MAX_EXCERPT_CHARS) -> str:
    """Bound *text* to *limit*, keeping head and tail.

    Head *and* tail because the two ends answer different questions: a runner
    says what it is doing at the start and what went wrong at the end, and
    truncating either way loses one of them.
    """
    if len(text) <= limit:
        return text
    half = limit // 2
    omitted = len(text) - 2 * half
    return f"{text[:half]}\n... [{omitted} characters omitted] ...\n{text[-half:]}"


@traces(SWR.SWR_2602)
def cleanup_executor(executor: Any | None) -> None:
    """Tear a terminal down, duck-typed and defensively.

    A test double or a bare callable has no ``cleanup``; it simply gets nothing.
    A cleanup that raises is logged rather than propagated, because failing to
    close a terminal must never be how a verification run ends.
    """
    if executor is None:
        return
    cleanup = getattr(executor, "cleanup", None)
    if cleanup is None:
        return
    try:
        cleanup()
    except Exception as error:  # noqa: BLE001
        _log.debug("Verifier terminal cleanup failed: %s", error)


@traces(SWR.SWR_2602, SWR.SWR_2613)
def run_command(executor: Any, command: str, *, timeout: float) -> tuple[int, str]:
    """Run *command* on *executor* and report ``(exit_code, output)``.

    The exit code is the classifier's, not the raw one: a command that exits 0
    while printing a failure summary is a ``suspicious_success`` and reports a
    non-zero code here, which is the same reading the suite runner takes.

    A command that could not be executed at all reports ``(127, reason)`` — the
    shell's own "I could not run that", which is exactly what every caller here
    already knows how to interpret (``runner.could_not_start``).
    """
    from rotaris_core.tools.terminal import HardenedTerminalAction

    action = HardenedTerminalAction(command=command, timeout=float(timeout))
    try:
        observation = executor(action)
    except Exception as error:  # noqa: BLE001 - reported as a failure, never raised
        _log.debug("Verifier command %r could not be executed: %s", command, error)
        return 127, f"Command could not be executed: {error}"
    outcome = classify_terminal_observation(observation)
    text = observation_text(observation)
    code = outcome.exit_code
    if code is None:
        code = 0 if outcome.kind in {"success", "background_terminal"} else 1
    elif code == 0 and outcome.kind not in {"success", "background_terminal"}:
        code = 1
    return code, text


@traces(SWR.SWR_2501, SWR.SWR_2602, SWR.SWR_2613)
def permission_denial(
    command: str,
    engine: PermissionEngine | None,
    persona: str,
) -> str:
    """Why the policy refuses *command*, or ``""`` when it allows it.

    ``PermissionEngine.resolve`` never raises and never returns ``ask`` — an
    ``ask`` is routed through the session's approval resolver first — so only
    allow and deny reach here.

    A denial is never silence: every caller turns this string into a recorded
    outcome, because a check nobody was allowed to run must not be able to read
    as a check that passed.
    """
    if engine is None:
        return ""

    from rotaris_core.permissions.engine import Decision, PermissionRequest

    decision = engine.resolve(
        PermissionRequest(
            tool_name="terminal",
            persona=persona,
            arguments={"command": command},
            command=command,
        ),
    )
    if decision.decision is Decision.ALLOW:
        return ""
    return f"Permission denied by rule '{decision.rule_id}'. {decision.reason}"


@traces(SWR.SWR_2613, SWR.SWR_2623)
class CommandRunner:
    """One terminal, many commands, and the shape both the probe pass and the
    adapter validator are written against.

    Built lazily: composing a runner costs nothing, and a pass that ends up with
    nothing to run never opens a terminal. The caller closes it —
    :meth:`close` is idempotent and safe on a runner that never opened one.
    """

    def __init__(
        self,
        working_dir: Path,
        *,
        timeout: float = 30.0,
        executor: Any | None = None,
        executor_factory: Any | None = None,
    ) -> None:
        self._working_dir = working_dir
        self._timeout = timeout
        self._executor = executor
        self._factory = executor_factory
        self._owns = executor is None

    def _resolve(self) -> Any:
        if self._executor is None:
            if self._factory is not None:
                self._executor = self._factory()
            else:
                from rotaris_core.tools.terminal import HardenedTerminalExecutor

                self._executor = HardenedTerminalExecutor(working_dir=str(self._working_dir))
        return self._executor

    def __call__(self, command: str) -> tuple[int, str]:
        return run_command(self._resolve(), command, timeout=self._timeout)

    def close(self) -> None:
        """Tear down the terminal, if this runner built one."""
        if self._owns:
            cleanup_executor(self._executor)
        self._executor = None
