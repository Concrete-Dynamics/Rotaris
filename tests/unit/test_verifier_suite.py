"""Productive use: a user decides what "verified" means for their workspace — by
configuring a check suite, by explicitly declaring that nothing is verified, or by
leaving it to auto-detection.

Expected outcome: an explicit config always wins over detection, an explicit empty
suite stays distinguishable from a detection that found nothing, and resolution
never fails a session start.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from rotaris_core.config.schema import CheckConfig, RotarisConfig, VerifierConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite, resolve_check_suite


def _config(checks: list[CheckConfig] | None) -> RotarisConfig:
    return RotarisConfig(verifier=VerifierConfig(checks=checks))


def _python_workspace(root: Path) -> Path:
    (root / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\naddopts = '-q'\n",
        encoding="utf-8",
    )
    return root


@verifies(SWR.SWR_2601)
def test_a_blank_check_name_is_rejected() -> None:
    with pytest.raises(ValidationError, match="must not be blank"):
        CheckConfig(name="   ", command="echo hi")


@verifies(SWR.SWR_2601)
def test_a_blank_check_command_is_rejected() -> None:
    with pytest.raises(ValidationError, match="must not be blank"):
        CheckConfig(name="pytest", command="")


@verifies(SWR.SWR_2601)
def test_duplicate_check_names_are_rejected() -> None:
    with pytest.raises(ValidationError, match="duplicate check name"):
        VerifierConfig(
            checks=[
                CheckConfig(name="pytest", command="pytest -q"),
                CheckConfig(name="pytest", command="pytest tests/"),
            ],
        )


@verifies(SWR.SWR_2601)
def test_a_check_defaults_to_blocking_with_a_bounded_timeout() -> None:
    check = CheckConfig(name="pytest", command="pytest -q")

    assert check.severity == "blocking"
    assert check.timeout == 600


@verifies(SWR.SWR_2601)
def test_a_non_positive_timeout_is_rejected() -> None:
    with pytest.raises(ValidationError):
        CheckConfig(name="pytest", command="pytest -q", timeout=0)


@verifies(SWR.SWR_2601)
def test_configured_checks_resolve_with_source_config(tmp_path: Path) -> None:
    config = _config(
        [
            CheckConfig(name="pytest", command="uv run pytest -q", timeout=900),
            CheckConfig(name="ruff", command="uv run ruff check .", severity="advisory"),
        ],
    )

    suite = resolve_check_suite(config, tmp_path)

    assert suite.source == "config"
    assert [check.name for check in suite.checks] == ["pytest", "ruff"]
    assert suite.checks[0].timeout == 900
    assert suite.checks[0].detected_from is None
    assert suite.detections == []


@verifies(SWR.SWR_2601)
def test_an_explicit_config_wins_over_detection(tmp_path: Path) -> None:
    _python_workspace(tmp_path)
    config = _config([CheckConfig(name="only-mine", command="echo hi")])

    suite = resolve_check_suite(config, tmp_path)

    assert suite.source == "config"
    assert [check.name for check in suite.checks] == ["only-mine"]


@verifies(SWR.SWR_2601)
def test_an_explicit_empty_suite_is_recorded_as_a_decision(tmp_path: Path) -> None:
    # The workspace has a detectable marker; the explicit `checks: []` must still win
    # and must not be reported as a failed detection.
    _python_workspace(tmp_path)

    suite = resolve_check_suite(_config([]), tmp_path)

    assert suite.source == "explicit_empty"
    assert suite.checks == []


@verifies(SWR.SWR_2601)
def test_an_unset_suite_falls_back_to_detection(tmp_path: Path) -> None:
    _python_workspace(tmp_path)

    suite = resolve_check_suite(_config(None), tmp_path)

    assert suite.source == "detected"
    assert [check.name for check in suite.checks] == ["pytest"]
    assert suite.detections == ["pyproject.toml:pytest"]


@verifies(SWR.SWR_2601)
def test_a_workspace_without_markers_reports_detection_empty(tmp_path: Path) -> None:
    suite = resolve_check_suite(_config(None), tmp_path)

    assert suite.source == "detection_empty"
    assert suite.checks == []


@verifies(SWR.SWR_2601)
def test_resolution_never_raises_on_a_broken_workspace(tmp_path: Path) -> None:
    suite = resolve_check_suite(_config(None), tmp_path / "does-not-exist")

    assert suite.source == "detection_empty"
    assert suite.checks == []


@verifies(SWR.SWR_2601)
def test_resolution_survives_a_detector_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from rotaris_core.verifier import suite as suite_module

    def _boom(_root: Path) -> list[ResolvedCheck]:
        raise RuntimeError("detector exploded")

    monkeypatch.setattr("rotaris_core.verifier.detection.detect_checks", _boom)

    resolved = suite_module.resolve_check_suite(_config(None), tmp_path)

    assert resolved.source == "detection_empty"
    assert resolved.checks == []


@verifies(SWR.SWR_2601)
def test_blocking_checks_are_separable_from_advisory_ones() -> None:
    suite = ResolvedCheckSuite(
        checks=[
            ResolvedCheck(name="pytest", command="pytest -q", severity="blocking"),
            ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"),
        ],
        source="config",
    )

    assert [check.name for check in suite.blocking_checks] == ["pytest"]


@verifies(SWR.SWR_2608)
def test_the_suite_budget_rides_along_on_a_configured_suite() -> None:
    """One number bounds verification, and it travels with the suite that runs."""
    config = RotarisConfig(
        verifier=VerifierConfig(
            checks=[CheckConfig(name="pytest", command="pytest -q")],
            suite_timeout=420,
        ),
    )

    suite = resolve_check_suite(config, Path())

    assert suite.source == "config"
    assert suite.suite_timeout == 420


@verifies(SWR.SWR_2608)
def test_the_suite_budget_rides_along_on_a_detected_suite(tmp_path: Path) -> None:
    """A workspace that configured no checks still gets the budget it configured."""
    _python_workspace(tmp_path)
    config = RotarisConfig(verifier=VerifierConfig(suite_timeout=300))

    suite = resolve_check_suite(config, tmp_path)

    assert suite.source == "detected"
    assert suite.suite_timeout == 300


@verifies(SWR.SWR_2608)
def test_verification_is_bounded_by_default() -> None:
    """A workspace that says nothing still cannot spend an unbounded hour verifying."""
    assert VerifierConfig().suite_timeout == 900


@verifies(SWR.SWR_2608)
def test_a_workspace_may_opt_out_of_the_budget() -> None:
    """`None` is the explicit "let the per-check timeouts decide" answer."""
    config = RotarisConfig(verifier=VerifierConfig(suite_timeout=None))

    assert resolve_check_suite(config, Path()).suite_timeout is None
