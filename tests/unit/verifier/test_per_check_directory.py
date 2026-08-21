"""Productive use: a workspace holding more than one project — this repository's
own `src/rotaris_core` beside `apps/rotaris`, or a `packages/*` monorepo.

Expected outcome: one root gate covers every project. Each check runs where its
command resolves rather than at the root, the two projects' same-role checks both
survive, their names say which tree they verified, and a sub-project's per-test
report is matched against workspace-relative covering tests rather than falling
silently on the floor.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.config.schema import CheckConfig
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
from rotaris_core.verifier.detection import detect_check_suite
from rotaris_core.verifier.runner import run_check_suite
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite
from rotaris_core.verifier.test_results import TestCaseResult, TestRunReport, rebased

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

_JUNIT = """<?xml version="1.0"?>
<testsuite name="s">
  <testcase name="test_reads" file="tests/test_store.py" line="9"/>
</testsuite>
"""


class _Shell:
    """A terminal that records where it was built and what it was asked to run."""

    def __init__(self, working_dir: str) -> None:
        self.working_dir = working_dir
        self.commands: list[str] = []

    def __call__(self, action: Any) -> Any:
        self.commands.append(action.command)
        return type("Obs", (), {"text": "ok", "exit_code": 0})()


# -- configuration -----------------------------------------------------------


@verifies(SWR.SWR_2618)
def test_a_working_directory_outside_the_workspace_is_refused_at_load_time() -> None:
    """A check pointed outside the workspace is a mistake with a blast radius.

    The verifier runs commands. A gate that verifies somebody else's tree while
    reporting on this one is worse than no gate at all, so this is refused where
    it is written rather than where it would run.
    """
    for escape in ("../elsewhere", "/etc", "a/../../b", "C:\\\\windows"):
        with pytest.raises(ValueError, match="cwd"):
            CheckConfig(name="t", command="pytest", cwd=escape)

    inside = CheckConfig(name="t", command="pytest", cwd="apps/desktop")
    assert inside.cwd == "apps/desktop"


@verifies(SWR.SWR_2618)
def test_a_configured_working_directory_reaches_the_resolved_check(tmp_path: Path) -> None:
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.verifier.suite import resolve_check_suite

    config = RotarisConfig(workspace_root=tmp_path)
    config.verifier.checks = [CheckConfig(name="app", command="pytest", cwd="apps/desktop")]

    suite = resolve_check_suite(config, tmp_path)

    assert suite.checks[0].cwd == "apps/desktop"


# -- detection ---------------------------------------------------------------


def _python_project(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\ntestpaths = ['tests']\n",
        encoding="utf-8",
    )
    (directory / "tests").mkdir(exist_ok=True)


@verifies(SWR.SWR_2618)
def test_a_sub_project_contributes_its_own_check_to_the_one_root_gate(
    tmp_path: Path,
) -> None:
    """Both projects keep their test check; neither is deduplicated away.

    Role deduplication (SWR-2608) exists to stop one project being verified
    twice. Two projects filling the same role is the opposite situation, and
    collapsing them would leave one of them silently unverified.
    """
    _python_project(tmp_path)
    _python_project(tmp_path / "apps" / "desktop")

    checks = detect_check_suite(tmp_path).checks
    tests = [check for check in checks if check.role == "test"]

    assert {check.cwd for check in tests} == {None, "apps/desktop"}
    assert {check.name for check in tests} == {"pytest", "pytest:apps/desktop"}


@verifies(SWR.SWR_2618, SWR.SWR_2608)
def test_the_roots_own_duplicate_is_still_suppressed(tmp_path: Path) -> None:
    """Per-directory dedupe must not become no dedupe."""
    _python_project(tmp_path)
    (tmp_path / "Makefile").write_text("test:\n\tpytest\n", encoding="utf-8")

    root_tests = [
        check
        for check in detect_check_suite(tmp_path).checks
        if check.role == "test" and check.cwd is None
    ]

    assert len(root_tests) == 1
    # The project wrote the Makefile target down, so it wins the role (SWR-2620)
    # and the synthesized command survives as the fallback.
    assert root_tests[0].name == "make:test"
    assert [alternative.name for alternative in root_tests[0].alternatives] == ["pytest"]


@verifies(SWR.SWR_2618)
def test_a_sub_projects_marker_is_named_where_it_lives(tmp_path: Path) -> None:
    """Evidence has to locate the marker, not just name it."""
    _python_project(tmp_path)
    _python_project(tmp_path / "packages" / "core")

    detections = detect_check_suite(tmp_path).detections

    assert "pyproject.toml:pytest" in detections
    assert "packages/core/pyproject.toml:pytest" in detections


@verifies(SWR.SWR_2618)
def test_a_uv_workspace_member_still_gets_the_prefix_that_resolves_it(
    tmp_path: Path,
) -> None:
    """A uv workspace keeps one lockfile at the root and none in its members.

    Reading only the member's own directory would drop `uv run` from exactly the
    commands that need it most.
    """
    _python_project(tmp_path)
    (tmp_path / "uv.lock").write_text("", encoding="utf-8")
    _python_project(tmp_path / "apps" / "desktop")

    member = next(
        check for check in detect_check_suite(tmp_path).checks if check.cwd == "apps/desktop"
    )

    assert member.command.startswith("uv run ")


# -- execution ---------------------------------------------------------------


def _run(suite: ResolvedCheckSuite, root: Path, shells: list[_Shell]) -> Any:
    built: list[_Shell] = []

    def factory() -> _Shell:
        shell = shells[len(built)]
        built.append(shell)
        return shell

    return asyncio.run(
        run_check_suite(
            suite,
            workspace_root=root,
            change=WorkspaceChangeSignal(changed=True, reason="edited"),
            executor_factory=factory,
        ),
    )


@verifies(SWR.SWR_2618)
def test_one_terminal_per_directory_and_the_directory_travels_on_the_result(
    tmp_path: Path,
) -> None:
    """Two projects cost two terminals, not one per check.

    And the result says which tree it verified: a multi-project workspace cannot
    answer that from the command, because both projects run `pytest`.
    """
    (tmp_path / "apps" / "x").mkdir(parents=True)
    shells = [_Shell("root"), _Shell("app")]
    suite = ResolvedCheckSuite(
        checks=[
            ResolvedCheck(name="pytest", command="pytest", role="test"),
            ResolvedCheck(name="ruff", command="ruff check .", role="lint"),
            ResolvedCheck(name="pytest:apps/x", command="pytest", role="test", cwd="apps/x"),
        ],
        source="detected",
    )

    result = _run(suite, tmp_path, shells)

    assert [entry.cwd for entry in result.results] == [None, None, "apps/x"]
    # The root's two checks share one terminal; the sub-project gets its own.
    assert len(shells[0].commands) == 2
    assert len(shells[1].commands) == 1


@verifies(SWR.SWR_2618, SWR.SWR_2608)
def test_the_suite_budget_is_shared_across_directories(tmp_path: Path) -> None:
    """Adding a project extends coverage, never the ceiling.

    A per-directory budget would let a workspace grow its verification cost
    without anybody choosing to.
    """
    (tmp_path / "apps" / "x").mkdir(parents=True)
    shells = [_Shell("root"), _Shell("app")]
    suite = ResolvedCheckSuite(
        checks=[
            ResolvedCheck(name="a", command="a", role="test"),
            ResolvedCheck(name="b", command="b", role="test", cwd="apps/x"),
        ],
        source="detected",
        suite_timeout=0,
    )

    result = _run(suite, tmp_path, shells)

    assert [entry.status for entry in result.results] == ["skipped", "skipped"]
    assert all("budget" in (entry.skip_reason or "") for entry in result.results)


@verifies(SWR.SWR_2618, SWR.SWR_2622)
def test_a_sub_projects_report_is_rebased_onto_the_workspace(tmp_path: Path) -> None:
    """Otherwise a sub-project's tests read as unobserved forever, and silently.

    The report a check writes is relative to the directory it ran in; every
    covering-test site it will be matched against is relative to the workspace.
    """
    report = TestRunReport(
        check_name="pytest",
        cases=(TestCaseResult(file="tests/test_store.py", name="test_reads", outcome="passed"),),
    )

    moved = rebased(report, "apps/desktop")

    assert moved.cases[0].file == "apps/desktop/tests/test_store.py"
    assert rebased(report, "") is report


@verifies(SWR.SWR_2618, SWR.SWR_2622)
def test_a_report_written_in_a_sub_project_is_found_and_attributed(tmp_path: Path) -> None:
    """The whole path, end to end: the check runs in `apps/x`, writes its report
    there, and the result names the workspace-relative test it observed."""
    app = tmp_path / "apps" / "x"
    (app / "tests").mkdir(parents=True)
    (app / "tests" / "test_store.py").write_text("", encoding="utf-8")

    class _Writer(_Shell):
        def __call__(self, action: Any) -> Any:
            (app / "junit.xml").write_text(_JUNIT, encoding="utf-8")
            return super().__call__(action)

    suite = ResolvedCheckSuite(
        checks=[
            ResolvedCheck(
                name="pytest:apps/x",
                command="pytest --junitxml=junit.xml",
                role="test",
                cwd="apps/x",
            ),
        ],
        source="detected",
    )

    result = _run(suite, tmp_path, [_Writer("app")])

    produced = result.results[0].report
    assert produced is not None
    assert produced.cases[0].file == "apps/x/tests/test_store.py"


@verifies(SWR.SWR_2618, SWR.SWR_2616)
def test_a_sub_project_that_moved_is_gate_drift_not_a_code_failure(tmp_path: Path) -> None:
    """Running the command at the root would verify the wrong tree, and reporting
    a failure would blame the code for a directory nobody's change removed."""
    shells = [_Shell("root")]
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="pytest:gone", command="pytest", role="test", cwd="gone")],
        source="detected",
    )

    result = _run(suite, tmp_path, shells)

    assert [entry.status for entry in result.results] == ["invalid"]
    assert shells[0].commands == []
    assert result.blocking_failures == []
