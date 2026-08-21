"""Resolution of the deterministic verifier's check suite (SWR-2601).

An explicit ``verifier.checks`` config always wins over auto-detection. The
three-valued config (unset / explicit empty / explicit list) is preserved in the
resolved suite's :attr:`ResolvedCheckSuite.source` so "this workspace runs no
verification" is always distinguishable from "detection found nothing" — the
requirement is explicit that no-verification must be a visible decision.

Nothing here executes a check; SWR-2602 supplies the runner.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.gate_state import (
    GateRecord,  # noqa: TC001 - Pydantic resolves this at runtime.
)

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig

_log = logging.getLogger(__name__)

SuiteSource = Literal["config", "detected", "explicit_empty", "detection_empty"]

#: The semantic slot a check fills, independent of the tool that fills it
#: (SWR-2608). Detection emits at most one check per role, so a workspace that
#: declares its tests twice — say ``pyproject.toml`` and a ``make test`` target —
#: still runs them once. ``other`` opts out: several ``other`` checks coexist.
CheckRole = Literal["test", "typecheck", "lint", "other"]

#: Where a check's command came from, in decreasing order of how well it can be
#: trusted to describe what this project actually checks (SWR-2608):
#:
#: - ``config``      — the user wrote it under ``verifier.checks``. Nothing beats
#:   a stated intention.
#: - ``declared``    — the *project* wrote it down: a ``Makefile`` target, an npm
#:   script, a tox environment. It carries the scope, flags, excludes and
#:   parallelism the project actually uses, none of which Rotaris can infer.
#: - ``synthesized`` — Rotaris composed it from a marker. Correct in shape and
#:   frequently wrong in scope: ``mypy .`` type-checks a tree the project may
#:   never have type-checked, and a serial ``pytest -q`` can take many times
#:   longer than the parallel invocation the project uses.
#:
#: Preferring a declared command is the whole of the ordering, and the runner's
#: fallback (SWR-2620) is what makes preferring it safe on a host that cannot run
#: it.
CheckOrigin = Literal["config", "declared", "synthesized"]


@traces(SWR.SWR_2601, SWR.SWR_2608)
class ResolvedCheck(BaseModel):
    """One check of a resolved suite, ready for SWR-2602 to execute."""

    name: str
    command: str
    timeout: int = 600
    severity: Literal["blocking", "advisory"] = "blocking"
    #: Marker this check was detected from (e.g. ``"pyproject.toml:pytest"``).
    #: ``None`` for checks that came from explicit config.
    detected_from: str | None = None
    #: Where this command came from, which is also how far it can be trusted to
    #: describe the project's real scope (SWR-2608).
    origin: CheckOrigin = "synthesized"
    #: Other commands that fill this same role, best first. The runner falls back
    #: through them when the chosen one cannot start on this host — which is what
    #: lets a project's own target be preferred without betting the suite on it.
    alternatives: tuple[ResolvedCheck, ...] = ()
    #: What this check verifies (SWR-2608). Assigned by detection; explicitly
    #: configured checks stay ``other``, because a workspace that spelled its
    #: suite out is stating exactly what it wants run.
    role: CheckRole = "other"
    #: Workspace-relative directory this check runs in; ``None`` is the root
    #: (SWR-2618). What lets one root gate cover a workspace holding several
    #: projects, and what a report needs in order to say which tree a check
    #: actually verified.
    cwd: str | None = None


@traces(SWR.SWR_2601, SWR.SWR_2608)
class ResolvedCheckSuite(BaseModel):
    """The check suite a session will verify with, plus where it came from.

    ``source`` values:

    - ``config`` — an explicit non-empty ``verifier.checks`` list.
    - ``explicit_empty`` — an explicit ``checks: []``; the user stated that this
      workspace runs no verification.
    - ``detected`` — no config; auto-detection produced at least one check.
    - ``detection_empty`` — no config and detection recognized no marker. Not a
      user decision; callers should surface this rather than treat it as
      "verification intentionally off".
    """

    checks: list[ResolvedCheck] = Field(default_factory=list)
    source: SuiteSource
    #: Markers that fired during detection, in order. This lists every marker
    #: that was recognized, including those whose check a same-role check
    #: already covers (SWR-2608) — suppressing a check must not erase the
    #: evidence that its marker exists.
    detections: list[str] = Field(default_factory=list)
    #: Wall-clock budget for one whole suite run, in seconds (SWR-2608).
    #: ``None`` means unbounded, in which case only the per-check timeouts apply.
    suite_timeout: int | None = None
    #: Seconds one calibration probe may take (SWR-2613). Independent of
    #: ``suite_timeout``, which governs real runs.
    probe_timeout: int = 30
    #: The gate's lifecycle state and marker fingerprint (SWR-2612).
    #:
    #: ``None`` means **not computed**, which is deliberately not the same fact as
    #: ``absent``: resolving a suite is a pure, cheap read that several callers
    #: make per pass, and computing a fingerprint is a bounded filesystem walk
    #: that only a session start and a marker-touching iteration should pay for.
    #: So :func:`resolve_check_suite` leaves this unset and
    #: :func:`~rotaris_core.verifier.gate_state.refresh_gate_state` fills it in.
    gate: GateRecord | None = None

    @property
    def blocking_checks(self) -> list[ResolvedCheck]:
        return [check for check in self.checks if check.severity == "blocking"]


@traces(SWR.SWR_2601, SWR.SWR_2608)
def resolve_check_suite(config: RotarisConfig, workspace_root: Path) -> ResolvedCheckSuite:
    """Resolve the effective check suite for *workspace_root*.

    Explicit config always wins over detection. Never raises: a detection
    failure degrades to an empty ``detection_empty`` suite so a broken or
    unreadable workspace can never stop a session from starting.

    The suite budget (SWR-2608) rides along on every source, including the empty
    ones, so a caller never has to ask the config a second question to learn how
    long a suite may take.
    """
    suite_timeout = config.verifier.suite_timeout
    probe_timeout = config.verifier.probe_timeout
    configured = config.verifier.checks
    if configured is not None:
        if not configured:
            return ResolvedCheckSuite(
                checks=[],
                source="explicit_empty",
                suite_timeout=suite_timeout,
                probe_timeout=probe_timeout,
            )
        return ResolvedCheckSuite(
            checks=[
                ResolvedCheck(
                    name=check.name,
                    command=check.command,
                    timeout=check.timeout,
                    severity=check.severity,
                    cwd=check.cwd,
                    role=check.role or "other",
                    # A stated intention outranks anything detection could infer,
                    # and carries no alternatives: there is nothing to fall back
                    # to when the user has said what to run (SWR-2620).
                    origin="config",
                )
                for check in configured
            ],
            source="config",
            suite_timeout=suite_timeout,
            probe_timeout=probe_timeout,
        )

    from rotaris_core.verifier.detection import detect_check_suite  # noqa: PLC0415

    try:
        detection = detect_check_suite(workspace_root)
    except Exception:  # noqa: BLE001
        _log.warning(
            "Check-suite detection failed for %s; resolving an empty suite.",
            workspace_root,
            exc_info=True,
        )
        detection = None
    if detection is None or not detection.checks:
        return ResolvedCheckSuite(
            checks=[],
            source="detection_empty",
            suite_timeout=suite_timeout,
            probe_timeout=probe_timeout,
        )
    return ResolvedCheckSuite(
        checks=detection.checks,
        source="detected",
        detections=detection.detections,
        suite_timeout=suite_timeout,
        probe_timeout=probe_timeout,
    )
