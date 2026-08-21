"""Productive use: a repo whose test runner changed last week — the `make test`
target was renamed, or a tool was swapped — and whose next task is ordinary work
that has nothing to do with either.

Expected outcome: the run is not blamed for the gate's breakage. A check that
could not be executed as a test of the code neither gates completion nor spends
the repair budget; where a probed equivalent of the same role exists, the gate
repairs itself deterministically and says so; where none does, that role is
simply unverified and the drift is reported rather than hidden.

No model is involved in any of this, and no real command runs: every probe
answer is scripted.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
from rotaris_core.verifier.evidence import VerifierEvidence
from rotaris_core.verifier.gate import evaluate_completion_gate
from rotaris_core.verifier.gate_repair import GateRepairBudget, find_replacement
from rotaris_core.verifier.gate_writer import read_verifier_section, write_verifier_section
from rotaris_core.verifier.repair import build_repair_context
from rotaris_core.verifier.runner import CheckResult, VerifierRunResult, run_check_suite
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

_MISSING_TARGET = "make: *** No rule to make target 'test'.  Stop."


def _result(name: str = "make:test", *, status: str = "invalid", **extra: Any) -> CheckResult:
    return CheckResult(
        name=name,
        command="make test",
        status=status,  # type: ignore[arg-type]
        **extra,
    )


def _evidence(*results: CheckResult) -> Any:
    return VerifierEvidence.from_run(
        VerifierRunResult(executed=True, suite_source="detected", results=list(results)),
    )


# -- an invalid check is a fact about the gate -------------------------------


@verifies(SWR.SWR_2616, SWR.SWR_2604)
def test_an_invalid_check_does_not_gate_completion(tmp_path: Path) -> None:
    """Gating on it would re-queue the task so an agent can repair a
    configuration it is not looking at and cannot change."""
    del tmp_path

    decision = evaluate_completion_gate(_evidence(_result()))

    assert decision.decision == "passed"
    assert decision.unsatisfied_checks == []


@verifies(SWR.SWR_2616, SWR.SWR_2604)
def test_a_failed_check_still_does_all_three_things(tmp_path: Path) -> None:
    """The separation has to cut, not blur: a real failure is unchanged."""
    del tmp_path

    decision = evaluate_completion_gate(_evidence(_result(status="failed")))

    assert decision.decision == "gated"
    assert decision.unsatisfied_checks == ["make:test"]


@verifies(SWR.SWR_2616, SWR.SWR_2604)
def test_a_gate_that_passes_beside_an_invalid_check_says_so(tmp_path: Path) -> None:
    """Never silently. A role that went unverified because its command stopped
    resolving belongs in the very sentence that says the gate passed."""
    del tmp_path

    decision = evaluate_completion_gate(
        _evidence(_result("pytest", status="passed"), _result()),
    )

    assert decision.decision == "passed"
    assert "make:test could not be executed here" in decision.reason


@verifies(SWR.SWR_2616, SWR.SWR_2605)
def test_an_invalid_check_never_reaches_the_repair_context(tmp_path: Path) -> None:
    """Describing a failure the code never had would waste an attempt *and*
    mislead the agent about what is wrong."""
    del tmp_path

    context = build_repair_context(
        _evidence(_result(), _result("pytest", status="failed", output_excerpt="assert 1 == 2")),
        attempt=1,
        max_attempts=2,
    )

    assert "make:test" not in context
    assert "assert 1 == 2" in context


# -- finding a replacement ---------------------------------------------------


def _answers(mapping: dict[str, tuple[int, str]]):
    seen: list[str] = []

    def run(command: str) -> tuple[int, str]:
        seen.append(command)
        for fragment, reply in mapping.items():
            if fragment in command:
                return reply
        return 0, "12 tests collected"

    run.seen = seen  # type: ignore[attr-defined]
    return run


def _python_project(root: Path) -> None:
    (root / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\ntestpaths = ['tests']\n",
        encoding="utf-8",
    )
    (root / "tests").mkdir(exist_ok=True)


@verifies(SWR.SWR_2616, SWR.SWR_2613)
def test_a_renamed_target_is_replaced_by_a_probed_equivalent(tmp_path: Path) -> None:
    """The productive case, and it costs no model call: re-detect, probe, swap."""
    _python_project(tmp_path)
    broken = ResolvedCheck(name="make:test", command="make test", role="test")

    repair = find_replacement(broken, tmp_path, _answers({}))

    assert repair.repaired
    assert repair.replacement is not None
    assert "pytest" in repair.replacement.command
    assert "probed verified and replaced it" in repair.note


@verifies(SWR.SWR_2616)
def test_a_candidate_that_does_not_probe_clean_is_not_a_repair(tmp_path: Path) -> None:
    """Swapping one command that does not resolve for another would be a repair
    in name only — and the next run would report the same drift again."""
    _python_project(tmp_path)
    broken = ResolvedCheck(name="make:test", command="make test", role="test")

    repair = find_replacement(
        broken,
        tmp_path,
        _answers({"--collect-only": (127, "pytest: command not found")}),
    )

    assert not repair.repaired
    assert "no probed equivalent" in repair.note


@verifies(SWR.SWR_2616, SWR.SWR_2614)
def test_a_repair_never_lowers_a_severity_to_find_a_candidate(tmp_path: Path) -> None:
    """A same-role replacement at a lower severity would repair the gate by
    weakening it, which is the one thing repair may not do."""
    _python_project(tmp_path)
    broken = ResolvedCheck(
        name="make:lint",
        command="make lint",
        role="lint",
        severity="blocking",
    )

    # Detection emits lint as advisory, so the only same-role candidate here is a
    # severity below the broken check's.
    repair = find_replacement(broken, tmp_path, _answers({}))

    assert not repair.repaired


@verifies(SWR.SWR_2616, SWR.SWR_2618)
def test_a_replacement_must_verify_the_same_tree(tmp_path: Path) -> None:
    """A root check is not a stand-in for a sub-project's, however alike they look."""
    _python_project(tmp_path)
    broken = ResolvedCheck(
        name="make:test:apps/x",
        command="make test",
        role="test",
        cwd="apps/x",
    )

    repair = find_replacement(broken, tmp_path, _answers({}))

    assert not repair.repaired


# -- the budget --------------------------------------------------------------


@verifies(SWR.SWR_2616)
def test_a_role_gets_one_repair_per_session(tmp_path: Path) -> None:
    """So a hostile or unfixable workspace cannot spin."""
    del tmp_path
    budget = GateRepairBudget()

    assert budget.charge("test")
    assert not budget.charge("test")
    assert budget.charge("typecheck")
    assert budget.spent_roles == frozenset({"test", "typecheck"})


# -- through the runner ------------------------------------------------------


class _Terminal:
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


def _run(suite: ResolvedCheckSuite, root: Path, terminal: _Terminal, **kwargs: Any) -> Any:
    return asyncio.run(
        run_check_suite(
            suite,
            workspace_root=root,
            change=WorkspaceChangeSignal(changed=True, reason="edited"),
            executor_factory=lambda: terminal,
            **kwargs,
        ),
    )


@verifies(SWR.SWR_2616)
def test_a_run_repairs_the_gate_and_re_runs_that_one_check(tmp_path: Path) -> None:
    """Within the same iteration: the role is verified rather than skipped."""
    _python_project(tmp_path)
    terminal = _Terminal({"make test": (2, _MISSING_TARGET)})
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="make:test", command="make test", role="test")],
        source="detected",
    )

    result = _run(suite, tmp_path, terminal, gate_repair=GateRepairBudget())

    assert [entry.status for entry in result.results] == ["passed"]
    assert any("pytest" in command for command in terminal.commands)


@verifies(SWR.SWR_2616)
def test_a_run_with_no_equivalent_leaves_the_role_unverified_and_says_so(
    tmp_path: Path,
) -> None:
    """The suite is never silently emptied and no severity is silently lowered.

    The role is unverified for this run, the reason is on the result, and it does
    not gate — the drift reaches the user through a proposal instead (SWR-2617).
    """
    terminal = _Terminal({"make test": (2, _MISSING_TARGET)})
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="make:test", command="make test", role="test")],
        source="detected",
    )

    result = _run(suite, tmp_path, terminal, gate_repair=GateRepairBudget())

    assert [entry.status for entry in result.results] == ["invalid"]
    assert result.blocking_failures == []
    assert result.invalid_checks
    assert any("no probed equivalent" in warning for warning in result.results[0].warnings)


@verifies(SWR.SWR_2616, SWR.SWR_2614)
def test_a_repair_is_written_through_the_gatekeepers_path(tmp_path: Path) -> None:
    """One writer, one authority rule, one audit trail — whoever initiated it."""
    from rotaris_core.config.schema import CheckConfig

    _python_project(tmp_path)
    write_verifier_section(
        tmp_path,
        [CheckConfig(name="make:test", command="make test", role="test")],
        reason="configured by hand",
    )
    terminal = _Terminal({"make test": (2, _MISSING_TARGET)})
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="make:test", command="make test", role="test")],
        source="config",
    )

    _run(suite, tmp_path, terminal, gate_repair=GateRepairBudget())

    configured = read_verifier_section(tmp_path) or ()
    assert [check.role for check in configured] == ["test"]
    assert "pytest" in configured[0].command


@verifies(SWR.SWR_2616)
def test_a_detected_suite_is_not_written_into_a_workspace_that_configured_none(
    tmp_path: Path,
) -> None:
    """Detection will find the replacement itself next time.

    Writing a gate the user never asked for is SWR-2615's decision to make, on a
    techstack event, and not a side effect of one check breaking.
    """
    _python_project(tmp_path)
    terminal = _Terminal({"make test": (2, _MISSING_TARGET)})
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="make:test", command="make test", role="test")],
        source="detected",
    )

    _run(suite, tmp_path, terminal, gate_repair=GateRepairBudget())

    assert read_verifier_section(tmp_path) is None


@verifies(SWR.SWR_2616)
def test_a_second_break_in_the_same_role_is_reported_not_repaired_again(
    tmp_path: Path,
) -> None:
    """One attempt per role per session, so an unfixable workspace cannot spin."""
    _python_project(tmp_path)
    budget = GateRepairBudget()
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="make:test", command="make test", role="test")],
        source="detected",
    )

    first = _Terminal({"make test": (2, _MISSING_TARGET)})
    _run(suite, tmp_path, first, gate_repair=budget)

    second = _Terminal({"make test": (2, _MISSING_TARGET)})
    result = _run(suite, tmp_path, second, gate_repair=budget)

    assert [entry.status for entry in result.results] == ["invalid"]
    assert any("already used its one gate repair" in w for w in result.results[0].warnings)
    assert not any("--collect-only" in command for command in second.commands)


@verifies(SWR.SWR_2616)
def test_a_run_without_a_budget_reports_the_drift_and_repairs_nothing(
    tmp_path: Path,
) -> None:
    """Repair is the caller's to enable: it costs probes and writes configuration."""
    _python_project(tmp_path)
    terminal = _Terminal({"make test": (2, _MISSING_TARGET)})
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="make:test", command="make test", role="test")],
        source="detected",
    )

    result = _run(suite, tmp_path, terminal)

    assert [entry.status for entry in result.results] == ["invalid"]
    assert not any("--collect-only" in command for command in terminal.commands)
