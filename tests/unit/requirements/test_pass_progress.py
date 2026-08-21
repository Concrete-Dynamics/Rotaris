"""Productive use: a host that started an adoption or verification pass — the
desktop's worker, or `rotaris-headless requirements verify` — wants to say what
the pass is doing while it does it, instead of showing one static sentence for
the several minutes the workspace's check suite takes.

Expected outcome: the pass reports its phases in the order it walks them and
states each phase's total before its first item, the suite runner's own per-check
reports arrive as items of the check phase, one item is reported per verification
written, and none of it can change what the pass concludes — a host that raises
is stepped over, and a pass given no host writes exactly what it wrote before.
"""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.pass_progress import (
    PassPhase,
    check_suite_progress,
    notify,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit


class _Recorder:
    """A progress host that remembers what it was told, in order."""

    def __init__(self) -> None:
        self.phases: list[tuple[str, int]] = []
        self.items: list[tuple[str, str, int, int]] = []

    def on_phase(self, phase: PassPhase, total: int = 0) -> None:
        self.phases.append((str(phase), total))

    def on_item(
        self,
        phase: PassPhase,
        label: str,
        index: int,
        total: int,
        detail: str = "",
        deadline_s: float = 0.0,
    ) -> None:
        del detail, deadline_s
        self.items.append((str(phase), label, index, total))


class _Angry:
    """A host that fails on every call — the one a pass must survive."""

    def on_phase(self, phase: PassPhase, total: int = 0) -> None:
        raise RuntimeError("this host is broken")

    def on_item(self, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("this host is broken")


@verifies(SWR.SWR_3620)
def test_a_pass_with_no_host_reports_nothing_and_raises_nothing() -> None:
    """The default path: absent host, no work done, no failure."""
    notify(None, "on_phase", PassPhase.CHECKS, 3)
    notify(None, "on_item", PassPhase.RECORDING, "SWR-1", 1, 1)


@verifies(SWR.SWR_3620)
def test_a_host_that_raises_is_stepped_over() -> None:
    """Reporting is an observation; an observation cannot fail the pass."""
    notify(_Angry(), "on_phase", PassPhase.CHECKS, 2)
    notify(_Angry(), "on_item", PassPhase.CHECKS, "pytest", 1, 2)


@verifies(SWR.SWR_3620)
def test_a_host_missing_a_hook_is_stepped_over() -> None:
    """A host may implement half the protocol and still be usable."""

    class _Half:
        def __init__(self) -> None:
            self.phases: list[str] = []

        def on_phase(self, phase: PassPhase, total: int = 0) -> None:
            del total
            self.phases.append(str(phase))

    host = _Half()
    notify(host, "on_phase", PassPhase.COVERAGE)
    notify(host, "on_item", PassPhase.COVERAGE, "anything", 1, 1)
    assert host.phases == ["coverage"]


@verifies(SWR.SWR_3620)
def test_the_check_suite_adapter_reports_starts_and_finishes_as_check_items() -> None:
    """The suite's own progress (SWR-2609) arrives as items of the check phase."""
    from rotaris_core.verifier.runner import CheckResult
    from rotaris_core.verifier.suite import ResolvedCheck

    recorder = _Recorder()
    adapter = check_suite_progress(recorder)
    assert adapter is not None
    adapter.on_check_start(
        ResolvedCheck(name="pytest", command="uv run pytest"),
        1,
        2,
        600.0,
    )
    adapter.on_check_finish(
        CheckResult(
            name="pytest",
            command="uv run pytest",
            status="passed",
            exit_code=0,
            duration_s=1.0,
        ),
        1,
        2,
    )
    assert recorder.items == [
        ("checks", "pytest", 1, 2),
        ("checks", "pytest", 1, 2),
    ]


@verifies(SWR.SWR_3620)
def test_no_host_means_the_suite_runner_is_handed_no_host() -> None:
    """``run_check_suite`` stays on exactly the path it takes today."""
    assert check_suite_progress(None) is None


@verifies(SWR.SWR_3620)
def test_a_verification_pass_reports_its_phases_in_order(tmp_path: Path) -> None:
    """reading → checks → coverage → recording, each with its total up front."""
    from rotaris_core.requirements.verification_host import verify_workspace

    workspace = _workspace_with_one_requirement(tmp_path)
    recorder = _Recorder()
    verify_workspace(workspace, verify=lambda _root: ((), ""), progress=recorder)

    walked = [phase for phase, _total in recorder.phases]
    assert walked[:2] == ["reading", "coverage"], walked
    assert "recording" in walked


@verifies(SWR.SWR_3620)
def test_recording_reports_one_item_per_written_verification(tmp_path: Path) -> None:
    """The count a user reads is the number of files this pass wrote."""
    from rotaris_core.requirements.delivery.verification_pass import VerificationTarget
    from rotaris_core.requirements.verification_host import verify_requirements
    from rotaris_core.verifier.runner import CheckResult

    workspace = _workspace_with_one_requirement(tmp_path)
    requirements = _requirements_of(workspace)
    recorder = _Recorder()
    report = verify_requirements(
        workspace,
        requirements=requirements,
        evidence_for=_evidence_for,
        checks=[
            CheckResult(
                name="pytest",
                command="uv run pytest",
                status="passed",
                exit_code=0,
            ),
        ],
        target=VerificationTarget(branch="main", commit="0" * 40),
        at=dt.datetime(2026, 8, 19, tzinfo=dt.UTC),
        progress=recorder,
    )

    written = len(report.verifications)
    assert written, "the fixture must record something for a count to mean anything"
    recorded = [item for item in recorder.items if item[0] == "recording"]
    assert ("recording", written) in recorder.phases
    assert len(recorded) == written
    assert [index for _phase, _label, index, _total in recorded] == list(range(1, written + 1))
    assert [label for _phase, label, _index, _total in recorded] == [
        verification.req_id for verification in report.verifications
    ]


@verifies(SWR.SWR_3620)
def test_a_pass_with_no_host_writes_what_it_always_wrote(tmp_path: Path) -> None:
    """The seam is an addition, never a change of outcome."""
    from rotaris_core.requirements.verification_host import verify_workspace

    with_host = _workspace_with_one_requirement(tmp_path / "reported")
    without = _workspace_with_one_requirement(tmp_path / "silent")

    reported = verify_workspace(with_host, verify=lambda _root: ((), ""), progress=_Recorder())
    silent = verify_workspace(without, verify=lambda _root: ((), ""))

    assert reported.summary == silent.summary
    assert [result.req_id for result in reported.results] == [
        result.req_id for result in silent.results
    ]


def _evidence_for(requirement: Any) -> Any:
    """Evidence inputs for a requirement one test covers and one site implements."""
    from rotaris_core.requirements.delivery.evidence import EvidenceInputs
    from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

    return EvidenceInputs(
        req_id=requirement.req_id,
        requirement_hash=requirement.current_hash,
        implementations=(RequirementSite(path="src/thing.py", line=1),),
        covering_tests=(CoveringTest(path="tests/test_thing.py", line=1),),
    )


def _requirements_of(workspace: Path) -> tuple[Any, ...]:
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(workspace)
    assert source is not None
    return tuple(source.read().requirements)


def _workspace_with_one_requirement(root: Path) -> Path:
    """A checkout carrying one approved requirement, and nothing else."""
    import subprocess

    epic = root / "docs" / "requirements" / "9900-progress-fixture"
    epic.mkdir(parents=True, exist_ok=True)
    (epic.parent / "9900-progress-fixture.md").write_text(
        "---\nreq-id: SWR-9900\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Progress fixture"\n---\n\n# SWR-9900 — Progress fixture\n',
        encoding="utf-8",
    )
    (epic / "SWR-9901-one-requirement.md").write_text(
        "---\nreq-id: SWR-9901\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "One requirement"\nepic: SWR-9900\n---\n\n'
        "# SWR-9901 — One requirement\n\nSomething this fixture asserts.\n",
        encoding="utf-8",
    )
    (root / ".rotaris").mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "init", "-q"], cwd=root, check=True)  # noqa: S603, S607
    subprocess.run(["git", "add", "-A"], cwd=root, check=True)  # noqa: S603, S607
    subprocess.run(  # noqa: S603, S607
        ["git", "-c", "user.email=t@e.st", "-c", "user.name=T", "commit", "-qm", "fixture"],
        cwd=root,
        check=True,
    )
    return root
