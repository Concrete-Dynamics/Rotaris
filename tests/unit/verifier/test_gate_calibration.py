"""Productive use: a user points Rotaris at a workspace whose `pyproject.toml`
mentions pytest, mypy and ruff — and whose host has two of the three installed,
whose test suite currently collects nothing, and whose `make test` target was
renamed last week.

Expected outcome: the gate is a statement about commands that actually run here.
A tool that does not resolve never binds; a test check that collects nothing
binds advisory so it cannot report as having verified anything; a command nobody
knows how to pre-check still gates, because refusing to gate on it would be worse
than not pre-checking it. Nothing is ever demoted on a guess.

No real command runs here. Every probe answer is scripted.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.calibration import (
    bound_severity,
    calibrate,
    calibrated_suite,
    probe_check,
    probe_form,
)
from rotaris_core.verifier.gate_state import GateRecord, ProbeRecord
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


def _check(
    name: str = "pytest",
    command: str = "pytest -q",
    *,
    role: str = "test",
    severity: str = "blocking",
    cwd: str | None = None,
) -> ResolvedCheck:
    return ResolvedCheck(
        name=name,
        command=command,
        role=role,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        cwd=cwd,
    )


def _answers(*pairs: tuple[int, str]):
    """A runner that replays scripted `(exit_code, output)` answers in order."""
    replies = list(pairs)
    seen: list[str] = []

    def run(command: str) -> tuple[int, str]:
        seen.append(command)
        return replies.pop(0) if replies else (0, "")

    run.seen = seen  # type: ignore[attr-defined]
    return run


# -- what a probe is ---------------------------------------------------------


@verifies(SWR.SWR_2613)
def test_a_probe_is_the_cheap_form_and_never_the_real_suite() -> None:
    """The property the whole requirement rests on: probing must not cost a run."""
    assert probe_form("uv run pytest -q tests") == "uv run pytest -q tests --collect-only -q"
    assert probe_form("make test") == "make -n test"
    assert probe_form("just check") == "just --dry-run check"
    assert probe_form("npm run lint") == "npm run lint --dry-run"
    assert probe_form("cargo test --all") == "cargo test --no-run"
    assert probe_form("uv run mypy src/") == "mypy --version"


@verifies(SWR.SWR_2613)
def test_a_custom_script_has_no_cheap_form_and_says_so() -> None:
    """There is no general way to ask a shell script what it would do.

    Answering `undecidable` is the honest outcome, and it is why `undecidable`
    binds rather than being refused: a workspace verified by `./run-checks.sh`
    must still be gated.
    """
    assert probe_form("./run-checks.sh") == ""

    probe = probe_check(_check("checks", "./run-checks.sh"), _answers())

    assert probe.verdict == "undecidable"
    assert "no cheap probe form" in probe.note


# -- the four verdicts -------------------------------------------------------


@verifies(SWR.SWR_2613)
def test_a_command_that_resolves_and_collects_work_is_verified() -> None:
    probe = probe_check(_check(), _answers((0, "42 tests collected in 0.4s")))

    assert probe.verdict == "verified"
    assert probe.detected_severity == "blocking"


@verifies(SWR.SWR_2613)
def test_a_test_check_that_collects_nothing_is_empty() -> None:
    """A suite that collects zero tests exits 0, and a gate would read that as
    verified. That is the false green this verdict exists to prevent."""
    probe = probe_check(_check(), _answers((0, "collected 0 items\n\nno tests ran in 0.01s")))

    assert probe.verdict == "empty"


@verifies(SWR.SWR_2613)
def test_a_command_that_does_not_resolve_here_is_unavailable() -> None:
    """The same predicate SWR-2620's fallback rests on, asked here."""
    probe = probe_check(
        _check("make:test", "make test"),
        _answers((2, "make: *** No rule to make target 'test'.  Stop.")),
    )

    assert probe.verdict == "unavailable"

    missing = probe_check(_check("mypy", "mypy .", role="typecheck"), _answers((127, "")))
    assert missing.verdict == "unavailable"


@verifies(SWR.SWR_2613)
def test_a_probe_that_fails_for_its_own_reasons_is_undecidable_not_a_demotion() -> None:
    """A collection error is a real problem and it is not the gate's question.

    Reading it as `empty` would demote a blocking check on the strength of an
    output nobody interpreted.
    """
    probe = probe_check(_check(), _answers((2, "ERROR tests/test_a.py - ImportError: no module")))

    assert probe.verdict == "undecidable"


@verifies(SWR.SWR_2613)
def test_an_unrecognised_output_shape_stays_verified() -> None:
    """The one asymmetry that matters: never demote on a guess.

    Demoting is the direction that silently weakens a gate, and an unfamiliar
    runner's output is exactly what invites a wrong guess.
    """
    probe = probe_check(_check(), _answers((0, "~~ some runner nobody has ever seen ~~")))

    assert probe.verdict == "verified"


@verifies(SWR.SWR_2613)
def test_only_a_test_check_can_be_empty() -> None:
    """A type-checker's work is the tree; there is no "collected nothing" for it."""
    lint = probe_check(
        _check("ruff", "ruff check .", role="lint", severity="advisory"),
        _answers((0, "no tests found")),
    )

    assert lint.verdict == "verified"


@verifies(SWR.SWR_2613, SWR.SWR_2501)
def test_a_denied_probe_is_never_a_pass_and_never_a_demotion() -> None:
    """What the policy forbids is the *probe*. That says nothing about the check.

    A policy able to quietly turn a blocking check advisory would be a way to
    weaken a gate without anybody deciding to.
    """

    class _Deny:
        policy = None

        def resolve(self, request: object) -> object:
            del request
            from rotaris_core.permissions.engine import Decision

            return type("D", (), {"decision": Decision.DENY, "rule_id": "r1", "reason": "no"})()

    probe = probe_check(_check(), _answers((0, "ok")), engine=_Deny())  # type: ignore[arg-type]

    assert probe.verdict == "undecidable"
    assert "Permission denied" in probe.note


@verifies(SWR.SWR_2613)
def test_a_probe_that_raises_leaves_the_gate_alone() -> None:
    def _explode(command: str) -> tuple[int, str]:
        del command
        raise RuntimeError("terminal is gone")

    probe = probe_check(_check(), _explode)

    assert probe.verdict == "undecidable"


# -- what a verdict binds ----------------------------------------------------


def _record(*probes: ProbeRecord, fingerprint: str = "fp") -> GateRecord:
    return GateRecord(state="calibrated", fingerprint=fingerprint, probes=probes)


@verifies(SWR.SWR_2613)
def test_each_verdict_binds_the_way_the_requirement_says() -> None:
    check = _check()

    assert bound_severity(check, _record(_probe(check, "verified"))) == "blocking"
    assert bound_severity(check, _record(_probe(check, "undecidable"))) == "blocking"
    assert bound_severity(check, _record(_probe(check, "empty"))) == "advisory"
    assert bound_severity(check, _record(_probe(check, "unavailable"))) is None
    # No verdict at all — the pre-SWR-2613 behaviour, unchanged.
    assert bound_severity(check, None) == "blocking"


def _probe(check: ResolvedCheck, verdict: str) -> ProbeRecord:
    return ProbeRecord(
        check=check.name,
        command=check.command,
        verdict=verdict,  # type: ignore[arg-type]
        detected_severity=check.severity,
    )


@verifies(SWR.SWR_2613)
def test_an_unavailable_check_does_not_bind_and_an_empty_one_binds_advisory() -> None:
    """The suite the runner is handed is the calibrated one, not the detected one."""
    suite = ResolvedCheckSuite(
        checks=[
            _check("pytest", "pytest -q"),
            _check("mypy", "mypy .", role="typecheck"),
            _check("make:lint", "make lint", role="lint", severity="advisory"),
        ],
        source="detected",
    )
    record = _record(
        _probe(suite.checks[0], "empty"),
        _probe(suite.checks[1], "unavailable"),
        _probe(suite.checks[2], "verified"),
    )

    bound = calibrated_suite(suite, record)

    assert [(check.name, check.severity) for check in bound.checks] == [
        ("pytest", "advisory"),
        ("make:lint", "advisory"),
    ]


@verifies(SWR.SWR_2613)
def test_an_empty_check_is_promoted_back_when_a_later_probe_finds_work() -> None:
    """The demotion is a fact about a fingerprint, not a permanent judgement.

    It only works because the *detected* severity survives the demotion.
    """
    check = _check()
    demoted = calibrated_suite(
        ResolvedCheckSuite(checks=[check], source="detected"),
        _record(_probe(check, "empty")),
    )
    assert demoted.checks[0].severity == "advisory"

    promoted = calibrated_suite(
        ResolvedCheckSuite(checks=[check], source="detected"),
        _record(_probe(check, "verified")),
    )
    assert promoted.checks[0].severity == "blocking"


# -- the pass ----------------------------------------------------------------


@verifies(SWR.SWR_2613)
def test_a_calibrated_gate_probes_nothing(tmp_path: Path) -> None:
    """The cost guard. A workspace whose verdicts are current opens no terminal."""
    check = _check()
    suite = ResolvedCheckSuite(checks=[check], source="detected")

    def _never(_directory: Path):
        raise AssertionError("a calibrated gate must not probe")

    outcome = calibrate(
        suite,
        tmp_path,
        _record(_probe(check, "verified")),
        fingerprint="fp",
        runner_factory=_never,
    )

    assert outcome.taken == ()
    assert outcome.complete


@verifies(SWR.SWR_2613)
def test_a_moved_fingerprint_reprobes_and_the_verdicts_replace_the_old_ones(
    tmp_path: Path,
) -> None:
    check = _check()
    suite = ResolvedCheckSuite(checks=[check], source="detected")

    outcome = calibrate(
        suite,
        tmp_path,
        _record(_probe(check, "empty"), fingerprint="old"),
        fingerprint="new",
        runner_factory=lambda _d: _answers((0, "12 tests collected")),
    )

    assert [probe.verdict for probe in outcome.record.probes] == ["verified"]
    assert outcome.record.fingerprint == "new"
    assert outcome.record.state == "calibrated"


@verifies(SWR.SWR_2613, SWR.SWR_2618)
def test_each_directory_is_probed_where_its_command_resolves(tmp_path: Path) -> None:
    suite = ResolvedCheckSuite(
        checks=[_check(), _check("pytest:apps/x", "pytest -q", cwd="apps/x")],
        source="detected",
    )
    asked: list[Path] = []

    def factory(directory: Path):
        asked.append(directory)
        return _answers((0, "3 tests collected"))

    calibrate(suite, tmp_path, None, fingerprint="fp", runner_factory=factory)

    assert asked == [tmp_path, tmp_path / "apps/x"]


@verifies(SWR.SWR_2613)
def test_a_pass_that_cannot_finish_leaves_the_bound_suite_alone(tmp_path: Path) -> None:
    """An unprobeable workspace keeps the gate it had.

    Rebinding on a partial reading would let a broken terminal drop checks out of
    a suite that was working a minute ago.
    """
    suite = ResolvedCheckSuite(checks=[_check()], source="detected")

    def _explode(_directory: Path):
        raise OSError("no pty available")

    outcome = calibrate(suite, tmp_path, None, fingerprint="fp", runner_factory=_explode)

    assert not outcome.complete
    assert outcome.record.state == "stale"
    assert calibrated_suite(suite, outcome.record).checks == suite.checks


# -- through the runner, which is where a probe meets a real terminal ---------


class _Terminal:
    """A terminal that answers by pattern and records everything it was asked."""

    def __init__(self, replies: dict[str, tuple[int, str]]) -> None:
        self.replies = replies
        self.commands: list[str] = []

    def __call__(self, action: object) -> object:
        command = str(getattr(action, "command", ""))
        self.commands.append(command)
        for fragment, (code, text) in self.replies.items():
            if fragment in command:
                return type("Obs", (), {"text": text, "exit_code": code})()
        return type("Obs", (), {"text": "ok", "exit_code": 0})()


def _run_suite(suite: ResolvedCheckSuite, root: Path, terminal: _Terminal, **kwargs):
    import asyncio

    from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
    from rotaris_core.verifier.runner import run_check_suite

    return asyncio.run(
        run_check_suite(
            suite,
            workspace_root=root,
            change=WorkspaceChangeSignal(changed=True, reason="edited"),
            executor_factory=lambda: terminal,
            **kwargs,
        ),
    )


@verifies(SWR.SWR_2613)
def test_a_run_that_calibrates_probes_first_and_never_runs_what_does_not_resolve(
    tmp_path: Path,
) -> None:
    """The productive case: a `Makefile` target that was renamed last week.

    Before this, the gate ran it, got a non-zero exit, and spent the repair budget
    asking an agent to fix code that was never broken.
    """
    terminal = _Terminal({"make -n test": (2, "make: *** No rule to make target 'test'.  Stop.")})
    suite = ResolvedCheckSuite(
        checks=[_check("make:test", "make test"), _check("ruff", "ruff check .", role="lint")],
        source="detected",
    )

    result = _run_suite(suite, tmp_path, terminal, calibrate=True)

    assert "make test" not in terminal.commands
    assert [entry.name for entry in result.results] == ["ruff"]
    assert result.probed
    assert result.gate is not None


@verifies(SWR.SWR_2613)
def test_probing_shares_the_terminal_the_suite_was_given(tmp_path: Path) -> None:
    """A probe is a command like any other and must not get a quieter door.

    Sharing the seam is also what keeps a probe from opening a second terminal
    per check, and what lets a caller's test double cover both.
    """
    terminal = _Terminal({})
    suite = ResolvedCheckSuite(checks=[_check()], source="detected")

    _run_suite(suite, tmp_path, terminal, calibrate=True)

    assert terminal.commands == ["pytest -q --collect-only -q", "pytest -q"]


@verifies(SWR.SWR_2613)
def test_a_run_that_does_not_calibrate_probes_nothing_but_still_honours_verdicts(
    tmp_path: Path,
) -> None:
    """One caller owns the gate's lifecycle; the rest reuse what it learned.

    A requirement-verification pass handed an already-bound suite must not pay
    for probes the loop already ran — and must still not run a command this
    workspace has been shown not to resolve.
    """
    from rotaris_core.verifier.gate_state import save_gate_record

    check = _check("make:test", "make test")
    save_gate_record(
        tmp_path,
        GateRecord(state="calibrated", fingerprint="fp", probes=(_probe(check, "unavailable"),)),
    )
    terminal = _Terminal({})

    result = _run_suite(
        ResolvedCheckSuite(checks=[check], source="detected"),
        tmp_path,
        terminal,
    )

    assert terminal.commands == []
    assert not result.probed
    assert not result.executed
    assert "found every command unavailable" in (result.skip_reason or "")


@verifies(SWR.SWR_2613, SWR.SWR_2604)
def test_a_suite_whose_every_command_is_unavailable_reports_it_instead_of_passing(
    tmp_path: Path,
) -> None:
    """The false green this closes: an empty suite passes vacuously.

    Dropping every check and then reporting "nothing failed" is precisely how an
    unverifiable workspace used to read as a clean one.
    """
    terminal = _Terminal({"--collect-only": (127, "pytest: command not found")})
    suite = ResolvedCheckSuite(checks=[_check()], source="detected")

    result = _run_suite(suite, tmp_path, terminal, calibrate=True)

    assert not result.executed
    assert result.results == []
    assert "nothing to run" in (result.skip_reason or "")


@verifies(SWR.SWR_2613, SWR.SWR_2612)
def test_verdicts_are_persisted_so_the_next_run_probes_nothing(tmp_path: Path) -> None:
    from rotaris_core.verifier.gate_state import load_gate_record

    (tmp_path / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")
    suite = ResolvedCheckSuite(checks=[_check()], source="detected")

    _run_suite(suite, tmp_path, _Terminal({}), calibrate=True)
    recorded = load_gate_record(tmp_path)
    assert recorded is not None
    assert [probe.verdict for probe in recorded.probes] == ["verified"]

    second = _Terminal({})
    _run_suite(suite, tmp_path, second, calibrate=True)

    assert second.commands == ["pytest -q"]
