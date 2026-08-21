"""Terminal run result — one value behind the result event and the exit code.

SWR-1828 requires the final event of a headless run to carry the terminal
status, the final report reference, and aggregate token/cost figures, *and*
the process exit code to reflect the run outcome.  Before this module those
two lived apart: the CLI re-derived its exit code from
:func:`~rotaris_core.ralph.state.summarize_run_progress`'s severity while the
reported figures came from the session state and the on-disk metrics.  Two
derivations can disagree; one cannot.

:class:`RunResult` is that one value.  :func:`build_run_result` composes it
from whatever the run managed to produce — including nothing at all, because
a run that crashed during bootstrap still owes its caller a result event and
an exit code.  ``build_run_result`` therefore never raises.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

from rotaris_core.cost import CostSnapshot
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tokens import TokenSnapshot


@traces(SWR.SWR_1828)
class RunStatus(StrEnum):
    """Terminal outcome of a run, as reported to a machine consumer."""

    COMPLETED = "completed"
    FAILED = "failed"
    MAX_ITERATIONS = "max_iterations"
    INTERRUPTED = "interrupted"
    ERROR = "error"


#: Exit code per terminal status.  Deliberately total: :attr:`RunResult.exit_code`
#: indexes this mapping directly, so a new :class:`RunStatus` member without an
#: entry raises instead of silently reporting success.
EXIT_CODES: dict[RunStatus, int] = {
    RunStatus.COMPLETED: 0,
    RunStatus.FAILED: 1,
    RunStatus.ERROR: 1,
    RunStatus.MAX_ITERATIONS: 2,
    # Conventional SIGINT code — the CLI's DoubleCtrlCHandler path.
    RunStatus.INTERRUPTED: 130,
}

#: The four keys ``session.diagnostics._artifact_refs`` keeps.  A report
#: reference has exactly this shape everywhere in the codebase.
REPORT_REF_KEYS: tuple[str, ...] = ("id", "agent_name", "status", "path")

#: ``RalphProgressFile.stop_reason`` values that mean "a human (or the double
#: Ctrl-C handler) stopped this run".  ``summarize_run_progress`` only knows
#: the first of them; the other two would otherwise summarize as "completed".
INTERRUPT_STOP_REASONS: frozenset[str] = frozenset(
    {
        "stopped by user",
        "interrupted by user",
        "user cancelled at message limit",
    },
)

#: Stop reasons that are failures regardless of how many tasks completed.
#: ``agent session aborted`` is set when a child escalated — reporting that as
#: a completed run would show green in CI for a run that gave up.
FAILURE_STOP_REASONS: frozenset[str] = frozenset({"agent session aborted"})

#: The stop reason for hitting ``--max-iterations``.
ITERATION_LIMIT_STOP_REASON = "iteration limit reached"

#: Fallback when no progress file exists but the session recorded a terminal
#: execution status.  ``idle``/``running`` are deliberately absent: they are
#: not terminal, so they resolve to :attr:`RunStatus.ERROR`.
_STATUS_BY_EXECUTION_STATUS: dict[str, RunStatus] = {
    "completed": RunStatus.COMPLETED,
    "failed": RunStatus.FAILED,
    "paused": RunStatus.INTERRUPTED,
    "paused_message_limit": RunStatus.INTERRUPTED,
}


@traces(SWR.SWR_1828)
class ReportRef(BaseModel):
    """Reference to a run's final report artifact.

    Mirrors ``session.diagnostics._artifact_refs`` key for key so the stream
    and the on-disk diagnostics describe an artifact identically.
    """

    id: str = ""
    agent_name: str = ""
    status: str = ""
    path: str = ""


@traces(SWR.SWR_1828, SWR.SWR_1829)
class RunResult(BaseModel):
    """Terminal status, report reference and aggregate figures for one run."""

    session_id: str
    status: RunStatus
    summary: str = ""
    stop_reason: str = ""
    iterations_completed: int = 0
    report: ReportRef | None = None
    tokens: TokenSnapshot | None = None
    # ``None`` means "no cost information at all".  A present snapshot whose
    # ``source`` is ``unavailable`` means "calls happened, none could be
    # priced" — a consumer must be able to tell that apart from a free run,
    # so the snapshot keeps its ``source``/``unpriced_calls`` fields.
    cost: CostSnapshot | None = None
    error: str | None = None

    @property
    def exit_code(self) -> int:
        """Process exit code for this outcome.

        Raises ``KeyError`` for a status with no mapping rather than guessing
        a default — an unmapped status must break a test, not a user's CI.
        """
        return EXIT_CODES[self.status]


def _iteration_count(progress: Any) -> int:
    iterations = getattr(progress, "iterations", None)
    try:
        return len(iterations)  # type: ignore[arg-type]
    except TypeError:
        return 0


def _text(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def _snapshot(source: Any, attribute: str, model: type[Any]) -> Any:
    """Read a pydantic snapshot off a partially-populated object."""
    value = getattr(source, attribute, None)
    if value is None:
        return None
    if isinstance(value, model):
        return value
    payload: Any = value
    if not isinstance(payload, Mapping):
        dump = getattr(payload, "model_dump", None)
        if not callable(dump):
            return None
        try:
            payload = dump(mode="json")
        except Exception:  # noqa: BLE001 - a foreign snapshot is not worth a crash.
            return None
    try:
        return model.model_validate(dict(payload))
    except Exception:  # noqa: BLE001 - same.
        return None


def _report_ref(report: Mapping[str, Any] | None) -> ReportRef | None:
    """Keep only the four ``_artifact_refs`` keys; ignore everything else."""
    if report is None:
        return None
    try:
        values = {key: report.get(key) for key in REPORT_REF_KEYS}
    except Exception:  # noqa: BLE001 - a hostile mapping is not worth a crash.
        return None
    if all(value is None for value in values.values()):
        return None
    return ReportRef(**{key: _text(value) for key, value in values.items()})


def _summarize(progress: Any) -> tuple[str, str, str] | None:
    # Imported lazily: ``rotaris_core.ralph.state`` pulls in
    # ``rotaris_core.llm_errors`` and with it the whole OpenHands SDK (~12 s).
    # A result model must stay cheap enough to import from a CLI entry point.
    try:
        from rotaris_core.ralph.state import summarize_run_progress

        return summarize_run_progress(progress)
    except Exception:  # noqa: BLE001 - a malformed progress file still needs a result.
        return None


def _status_without_progress(state: Any) -> tuple[RunStatus, str, str | None]:
    execution_status = _text(getattr(state, "execution_status", None)) if state is not None else ""
    mapped = _STATUS_BY_EXECUTION_STATUS.get(execution_status)
    if mapped is not None:
        return (mapped, f"Run ended with status {execution_status}.", None)
    detail = f"execution status {execution_status!r}" if execution_status else "no session state"
    return (
        RunStatus.ERROR,
        "Run ended without a terminal status.",
        f"No run progress was recorded ({detail}); the outcome is unknown.",
    )


def _derive_status(
    progress: Any,
    state: Any,
    stop_reason: str,
) -> tuple[RunStatus, str, str | None]:
    """Return ``(status, summary, error)`` for a non-interrupted, non-errored run."""
    if progress is None:
        return _status_without_progress(state)

    if stop_reason in INTERRUPT_STOP_REASONS:
        return (RunStatus.INTERRUPTED, f"Run interrupted: {stop_reason}.", None)

    summarized = _summarize(progress)
    if summarized is None:
        return (
            RunStatus.ERROR,
            "Run ended with an unreadable progress file.",
            "Run progress could not be summarized; the outcome is unknown.",
        )
    summarized_status, summary, _severity = summarized

    if stop_reason in FAILURE_STOP_REASONS:
        return (RunStatus.FAILED, f"Run failed: {stop_reason}.", None)
    if summarized_status == "failed":
        return (RunStatus.FAILED, summary, None)
    if summarized_status == "paused":
        return (RunStatus.INTERRUPTED, summary, None)
    if summarized_status == "completed":
        if stop_reason == ITERATION_LIMIT_STOP_REASON:
            return (RunStatus.MAX_ITERATIONS, f"Run stopped: {stop_reason}.", None)
        return (RunStatus.COMPLETED, summary, None)
    # Never fall through to "completed": an unrecognised status string means
    # this module is out of date with summarize_run_progress, and reporting
    # such a run as successful is the worst thing this module could do.
    return (
        RunStatus.ERROR,
        summary,
        f"Unrecognised run status {summarized_status!r}; the outcome is unknown.",
    )


@traces(SWR.SWR_1828)
def build_run_result(
    *,
    session_id: str,
    state: Any | None,
    progress: Any | None,
    report: Mapping[str, Any] | None = None,
    error: str | None = None,
    interrupted: bool = False,
) -> RunResult:
    """Compose the terminal :class:`RunResult` for a run.

    Every input may be ``None`` or partially populated — a run that crashed
    during bootstrap has neither state nor progress and still needs a result
    event and an exit code.  This function never raises; when it cannot
    determine a status it returns :attr:`RunStatus.ERROR` with the reason in
    :attr:`RunResult.error`.

    ``error`` wins over everything; ``interrupted`` wins over the progress
    file.  ``report`` is filtered down to the four :data:`REPORT_REF_KEYS`.
    """
    try:
        stop_reason = _text(getattr(progress, "stop_reason", None)) if progress is not None else ""
        iterations_completed = _iteration_count(progress) if progress is not None else 0

        derived_error: str | None = None
        if error:
            status = RunStatus.ERROR
            summary = f"Run failed: {error}"
        elif interrupted:
            status = RunStatus.INTERRUPTED
            summary = "Run interrupted before completion."
        else:
            status, summary, derived_error = _derive_status(progress, state, stop_reason)

        return RunResult(
            session_id=session_id,
            status=status,
            summary=summary,
            stop_reason=stop_reason,
            iterations_completed=iterations_completed,
            report=_report_ref(report),
            tokens=_snapshot(state, "global_token_usage", TokenSnapshot),
            cost=_snapshot(state, "global_cost", CostSnapshot),
            error=error if error else derived_error,
        )
    except Exception as exc:  # noqa: BLE001 - the error path must not have an error path.
        return RunResult(
            session_id=session_id,
            status=RunStatus.ERROR,
            summary="Run result could not be determined.",
            error=error or f"Failed to build the run result: {exc!r}",
        )
