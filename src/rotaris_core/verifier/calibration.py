"""Nothing binds to the gate unprobed (SWR-2613).

A check used to enter the gate on filesystem inference alone: a ``pyproject.toml``
mentioning pytest produced a ``pytest`` check whether or not pytest was installed
here, whether or not it collected anything, and whether or not the ``make test``
target it was written against still existed. The gate was then a statement about
*markers that happen to exist* rather than about *commands that actually run
here*, and the difference only surfaced as a red suite an agent was asked to
repair.

A **probe** is the cheapest invocation that proves a command resolves on this
host and finds work to do — ``pytest --collect-only -q``, ``make -n test``,
``cargo test --no-run``, or a tool's ``--version`` where nothing cheaper exists.
A probe never runs the real suite.

Four verdicts, and what each one binds:

``verified``    the command resolves and reports work — binds at its detected severity.
``undecidable`` no cheap probe form is known, or the probe could not be read —
                binds at its detected severity anyway, because refusing to gate on
                a command we merely cannot *pre-check* would weaken the gate for
                the common custom-script case.
``empty``       the command resolves and finds nothing — binds ``advisory`` with
                the reason recorded, so a suite that collects zero tests can never
                report as having verified anything.
``unavailable`` the command does not resolve here — does not bind at all.

Two asymmetries are deliberate and load-bearing:

- **``empty`` is only ever produced for a ``test`` role, and only on a positively
  recognised zero-collection signal.** An output shape this module does not
  recognise stays ``verified``. Demoting on a guess is the one direction that
  silently weakens a gate, and a guess is exactly what an unfamiliar runner's
  output invites.
- **A denied or unreadable probe never demotes anything.** A permission policy
  that forbids probing is a fact about the policy, not about the check, and it
  must not be able to quietly turn a blocking check advisory.

The demotion is reversible because
:attr:`~rotaris_core.verifier.gate_state.ProbeRecord.detected_severity` survives
it: an ``empty`` check is promoted back by a later probe that finds work, which is
what makes the verdict a fact about a fingerprint rather than a permanent
judgement.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, NamedTuple

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.execution import CommandRunner, permission_denial
from rotaris_core.verifier.gate_state import GateRecord, ProbeRecord, unprobed_checks

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence
    from pathlib import Path

    from rotaris_core.permissions.engine import PermissionEngine
    from rotaris_core.verifier.gate_state import ProbeVerdict
    from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

_log = logging.getLogger(__name__)

__all__ = [
    "DEFAULT_PROBE_TIMEOUT",
    "PROBE_FORMS",
    "CalibrationOutcome",
    "bound_severity",
    "calibrate",
    "calibrated_suite",
    "probe_check",
    "probe_form",
]

#: Seconds one probe may take. Independent of ``verifier.suite_timeout``, which
#: governs real suite runs: a collect-only pass that needs ten minutes is broken
#: in a way no budget should accommodate.
DEFAULT_PROBE_TIMEOUT = 30

#: How to ask a runner we recognise whether it resolves and finds work, in the
#: order they are tried. ``{command}`` is the check's own command.
#:
#: Deliberately shaped like — and kept separate from —
#: :data:`~rotaris_core.verifier.report_adapters.PROBE_ARGUMENTS`. That table asks
#: *how do I get per-test results out of this*; this one asks *does this resolve
#: and find work*. Fusing them would make one answer decide two questions.
PROBE_FORMS: tuple[tuple[str, str], ...] = (
    ("pytest", "{command} --collect-only -q"),
    ("cargo test", "cargo test --no-run"),
    ("go test", "go test -run=^$ ./..."),
    ("jest", "{command} --listTests"),
    ("vitest", "{command} --run --reporter=dot --passWithNoTests"),
    ("npm test", "npm test --dry-run"),
    ("npm run", "{command} --dry-run"),
    ("pnpm run", "{command} --dry-run"),
    ("yarn ", "{command} --dry-run"),
    ("mypy", "mypy --version"),
    ("ruff", "ruff --version"),
    ("tsc", "tsc --version"),
    ("eslint", "eslint --version"),
    ("biome", "biome --version"),
)

#: A ``make`` invocation and the target it names, so the probe can be ``make -n``.
_MAKE_RE = re.compile(r"^\s*make\s+([A-Za-z0-9_.\-/]+)")

#: A ``just`` or ``task`` invocation, whose dry forms take the same shape.
_JUST_RE = re.compile(r"^\s*(just|task)\s+([A-Za-z0-9_.\-/:]+)")

#: What a runner says when it resolved and collected nothing. Positive signals
#: only: an output shape absent from this table leaves the check ``verified``,
#: because a guess in this direction is the one that weakens a gate.
_EMPTY_SIGNALS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bno tests ran\b", re.IGNORECASE),
    re.compile(r"\bcollected 0 items\b", re.IGNORECASE),
    re.compile(r"\bno tests found\b", re.IGNORECASE),
    re.compile(r"\bno test files found\b", re.IGNORECASE),
    re.compile(r"^\s*0 tests?\b", re.IGNORECASE | re.MULTILINE),
    re.compile(r"\btesting: warning: no tests to run\b", re.IGNORECASE),
)

#: What ``make -n`` says when the target exists and has nothing to do. Not an
#: ``empty`` verdict: a make target with no prerequisites is a normal, working
#: target, and the role it fills is usually not ``test``.
_NOTHING_TO_DO_RE = re.compile(r"Nothing to be done for", re.IGNORECASE)


@traces(SWR.SWR_2613)
class CalibrationOutcome(NamedTuple):
    """What one calibration pass concluded, and whether it got to finish."""

    #: The record to persist: the incoming one plus this pass's verdicts.
    record: GateRecord
    #: Verdicts taken during *this* pass, in check order.
    taken: tuple[ProbeRecord, ...]
    #: Set when the pass could not complete — the previously bound suite then
    #: stays bound and the state stays ``stale`` (SWR-2613).
    failure: str = ""

    @property
    def complete(self) -> bool:
        """Whether every check that needed a probe got one."""
        return not self.failure


@traces(SWR.SWR_2613)
def probe_form(command: str) -> str:
    """The cheapest invocation that proves *command* resolves, or ``""``.

    ``""`` is the ``undecidable`` case, and it is the honest answer for a custom
    script: there is no general way to ask ``./run-checks.sh`` what it would do
    without running it, and running it is precisely what a probe must not do.
    """
    make = _MAKE_RE.match(command)
    if make is not None:
        return f"make -n {make.group(1)}"
    runner = _JUST_RE.match(command)
    if runner is not None:
        return f"{runner.group(1)} --dry-run {runner.group(2)}"
    for token, form in PROBE_FORMS:
        if token in command:
            return form.format(command=command)
    return ""


def _reports_no_work(check: ResolvedCheck, output: str) -> bool:
    """Whether *output* positively says this test check collected nothing.

    Restricted to the ``test`` role on purpose. "Zero tests collected" is a
    meaningful, checkable statement about a test runner; there is no equivalent
    for a type-checker or a linter, whose work is the tree itself, and inventing
    one would demote checks nobody asked to demote.
    """
    if check.role != "test":
        return False
    return any(signal.search(output) for signal in _EMPTY_SIGNALS)


@traces(SWR.SWR_2613)
def probe_check(
    check: ResolvedCheck,
    run: Callable[[str], tuple[int, str]],
    *,
    engine: PermissionEngine | None = None,
    persona: str = "verifier",
) -> ProbeRecord:
    """Probe one check and report what the workspace said about it.

    Never raises: an exploding probe is ``undecidable``, which binds the check at
    its detected severity. Calibration must not be able to change a gate by
    failing.
    """
    from rotaris_core.verifier.runner import CheckResult, could_not_start  # noqa: PLC0415

    def record(verdict: ProbeVerdict, note: str = "") -> ProbeRecord:
        return ProbeRecord(
            check=check.name,
            command=check.command,
            verdict=verdict,
            detected_severity=check.severity,
            note=note,
        )

    form = probe_form(check.command)
    if not form:
        return record("undecidable", "no cheap probe form is known for this command")

    denial = permission_denial(form, engine, persona)
    if denial:
        # Never a pass, and never a demotion: what the policy forbids is the
        # probe, and that says nothing at all about the check (SWR-2501).
        return record("undecidable", denial)

    try:
        exit_code, output = run(form)
    except Exception as error:  # noqa: BLE001 - a broken probe never moves a gate
        _log.debug("Probe %r failed: %s", form, error, exc_info=True)
        return record("undecidable", f"the probe could not be run ({error})")

    # `could_not_start` is the same predicate SWR-2620's fallback rests on, and
    # it answers the same question here: did this command run at all?
    probe_result = CheckResult(
        name=check.name,
        command=form,
        status="failed",
        exit_code=exit_code,
        output_excerpt=output,
    )
    if exit_code != 0 and could_not_start(probe_result):
        return record("unavailable", f"{check.command!r} does not resolve in this workspace")
    if exit_code != 0:
        return record("undecidable", "the probe did not succeed and did not say it could not run")
    if _NOTHING_TO_DO_RE.search(output):
        return record("verified", "the target resolves and has nothing to rebuild")
    if _reports_no_work(check, output):
        return record("empty", "the command resolves and collects no tests here")
    return record("verified")


@traces(SWR.SWR_2613)
def bound_severity(check: ResolvedCheck, record: GateRecord | None) -> str | None:
    """The severity *check* binds at, or ``None`` when it does not bind.

    The whole binding rule, in one place, so the runner and the board cannot
    disagree about what a verdict meant.
    """
    if record is None:
        return check.severity
    probe = record.probe_for(check.name, check.command)
    if probe is None:
        return check.severity
    if probe.verdict == "unavailable":
        return None
    if probe.verdict == "empty":
        return "advisory"
    # `verified` and `undecidable` both bind at the severity detection gave the
    # check — and the *detected* severity, not the current one, so a check
    # demoted by an earlier `empty` is promoted back the moment a probe finds
    # work (SWR-2613).
    return probe.detected_severity


@traces(SWR.SWR_2613)
def calibrated_suite(suite: ResolvedCheckSuite, record: GateRecord | None) -> ResolvedCheckSuite:
    """*suite* with each check bound as its probe verdict says, or dropped.

    Pure: it reads verdicts and rewrites severities. Probing itself is
    :func:`calibrate`, and keeping the two apart is what lets a session apply a
    cached calibration without executing anything.
    """
    if record is None or not suite.checks:
        return suite
    bound: list[ResolvedCheck] = []
    for check in suite.checks:
        severity = bound_severity(check, record)
        if severity is None:
            _log.info(
                "Verifier check %r does not bind: it does not resolve in this workspace.",
                check.name,
            )
            continue
        bound.append(
            check
            if severity == check.severity
            else check.model_copy(update={"severity": severity}),
        )
    return suite.model_copy(update={"checks": bound})


@traces(SWR.SWR_2613)
def calibrate(
    suite: ResolvedCheckSuite,
    workspace_root: Path,
    record: GateRecord | None,
    *,
    fingerprint: str,
    engine: PermissionEngine | None = None,
    persona: str = "verifier",
    timeout: int = DEFAULT_PROBE_TIMEOUT,
    runner_factory: Callable[[Path], Callable[[str], tuple[int, str]]] | None = None,
) -> CalibrationOutcome:
    """Probe whatever in *suite* has no current verdict, and report the result.

    A ``calibrated`` gate costs nothing: :func:`unprobed_checks` answers with an
    empty tuple and no terminal is ever opened.

    **Probing must not block a run.** If the pass cannot complete, the outcome
    carries the reason, the verdicts it did take are still returned, and the
    caller keeps whatever suite was already bound — an unprobeable workspace
    keeps the gate it had.
    """
    pending = unprobed_checks(suite, record, fingerprint)
    carried: tuple[ProbeRecord, ...] = (
        record.probes if record is not None and record.fingerprint == fingerprint else ()
    )
    if not pending:
        base = record if record is not None else GateRecord(fingerprint=fingerprint)
        return CalibrationOutcome(record=base, taken=())

    taken: list[ProbeRecord] = []
    failure = ""
    runners: dict[str, Callable[[str], tuple[int, str]]] = {}
    owned: list[CommandRunner] = []
    try:
        for check in pending:
            where = check.cwd or ""
            existing = runners.get(where)
            if existing is None:
                directory = workspace_root / where if where else workspace_root
                if runner_factory is not None:
                    existing = runner_factory(directory)
                else:
                    built = CommandRunner(directory, timeout=float(timeout))
                    owned.append(built)
                    existing = built
                runners[where] = existing
            taken.append(probe_check(check, existing, engine=engine, persona=persona))
    except Exception as error:  # noqa: BLE001 - a failed pass leaves the gate alone
        _log.warning("Calibration pass failed for %s: %s", workspace_root, error, exc_info=True)
        failure = str(error)
    finally:
        for built in owned:
            built.close()

    merged = _merge(carried, taken)
    return CalibrationOutcome(
        record=GateRecord(
            state="calibrated" if not failure and len(merged) >= len(suite.checks) else "stale",
            fingerprint=fingerprint,
            suite_origin=record.suite_origin if record is not None else None,
            probes=merged,
            run_id=record.run_id if record is not None else "",
            authoring_note=record.authoring_note if record is not None else "",
        ),
        taken=tuple(taken),
        failure=failure,
    )


def _merge(carried: Sequence[ProbeRecord], taken: Sequence[ProbeRecord]) -> tuple[ProbeRecord, ...]:
    """Fresh verdicts win; verdicts about other checks survive."""
    replaced = {(probe.check, probe.command) for probe in taken}
    kept = [probe for probe in carried if (probe.check, probe.command) not in replaced]
    return (*kept, *taken)
