"""Productive use: a user's requirement was split into three units, three agents worked in
three separate worktrees, and the user wants the combined result on their branch — as one
verified change, or not at all.
Expected outcome: against a real git repository the three unit branches merge in an
integration worktree, are verified there, and only then fast-forward onto the base; when two
units touched the same lines the integration reports which units collided, keeps all three
unit branches and leaves the base checkout byte-for-byte where it was."""

from __future__ import annotations

import datetime as dt
import subprocess
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import CheckOutcome, RunOutcome
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.cli_host import integration_for
from rotaris_core.requirements.execution.flow import (
    FlowStage,
    FlowStateStore,
    RequirementFlow,
)
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.integration import (
    INTEGRATION_WORKTREE_SUBPATH,
    RequirementIntegrator,
    UnitBranch,
    plan_integration,
)
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    GitIsolation,
    RequirementRunSeam,
    RunReport,
    UnitLaunch,
)
from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, SnapshotStore
from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore
from rotaris_core.requirements.execution.target import (
    TargetBranch,
    TargetBranchError,
    resolve_target_branch,
)
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.execution.verification import SuiteRun
from rotaris_core.requirements.execution.worktrees import UnitWorktrees
from rotaris_core.requirements.model import CanonicalRequirement

REQ = "SWR-3409"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, f"git {' '.join(args)}: {result.stderr}"
    return result.stdout


def repository(root: Path) -> Path:
    """A real repository with one commit and a shared file two units can collide on."""
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "shared.txt").write_text("base\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-m", "initial")
    return root


def work(tree: Path, filename: str, content: str, *, message: str) -> str:
    """Do what an agent would do in its own worktree: change a file and commit it."""
    (tree / filename).write_text(content, encoding="utf-8")
    git(tree, "add", filename)
    git(
        tree,
        "-c",
        "user.name=Unit Agent",
        "-c",
        "user.email=unit@example.invalid",
        "commit",
        "-m",
        message,
    )
    return git(tree, "rev-parse", "HEAD").strip()


def head_of(root: Path) -> str:
    return git(root, "rev-parse", "HEAD").strip()


def branch_exists(root: Path, branch: str) -> bool:
    return (
        subprocess.run(
            ["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"],
            cwd=root,
            capture_output=True,
            check=False,
        ).returncode
        == 0
    )


def passing(_tree: Path) -> SuiteRun:
    return SuiteRun(executed=True, checks=(CheckOutcome(name="pytest", status="passed"),))


# -- one requirement, three units, three worktrees -------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3405, SWR.SWR_3406)
def test_two_units_get_two_real_worktrees_and_the_base_is_never_written_to(
    tmp_path: Path,
) -> None:
    """Acceptance criterion 3 of the slice, against real git."""
    base = repository(tmp_path / "base")
    before = head_of(base)
    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="docs")))
    worktrees = UnitWorktrees(base)

    ledger = worktrees.provision_all(REQ, units.units, run_ids=("run-1", "run-2"))

    assert len(ledger.workspaces) == 2
    assert len(set(ledger.branches)) == 2
    assert len(set(ledger.paths)) == 2
    for workspace in ledger.workspaces:
        tree = Path(workspace.path)
        assert tree.is_dir()
        assert tree.parent == base / ".rotaris" / "requirements" / "worktrees"
        assert workspace.branch.startswith(f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/")
        assert git(tree, "branch", "--show-current").strip() == workspace.branch

    # Each unit does its work in its own tree …
    for index, workspace in enumerate(ledger.workspaces, start=1):
        work(Path(workspace.path), f"unit-{index}.txt", f"unit {index}\n", message=f"unit {index}")

    # … and the user's checkout has neither the files nor a moved HEAD.
    assert not (base / "unit-1.txt").exists()
    assert not (base / "unit-2.txt").exists()
    assert head_of(base) == before
    assert git(base, "branch", "--show-current").strip() == "main"
    assert (
        worktrees.assert_base_untouched(
            worktrees.fingerprint_base(),
        ).revision
        == before
    )


@pytest.mark.integration
@verifies(SWR.SWR_3409, SWR.SWR_3410)
def test_three_unit_branches_integrate_verify_and_only_then_land_on_the_base(
    tmp_path: Path,
) -> None:
    """The whole path: merge somewhere else, verify there, fast-forward last."""
    base = repository(tmp_path / "base")
    started_at = head_of(base)
    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="tests"), UnitSpec(key="docs")))
    ledger = UnitWorktrees(base).provision_all(
        REQ,
        units.units,
        run_ids=("run-1", "run-2", "run-3"),
    )
    for index, workspace in enumerate(ledger.workspaces, start=1):
        work(Path(workspace.path), f"unit-{index}.txt", f"unit {index}\n", message=f"unit {index}")

    verified_in: list[Path] = []

    def verify(tree: Path) -> SuiteRun:
        verified_in.append(tree)
        # A real check: every unit's work has to be present before this passes.
        present = all((tree / f"unit-{index}.txt").is_file() for index in (1, 2, 3))
        return SuiteRun(
            executed=True,
            checks=(
                CheckOutcome(name="all-units-present", status="passed" if present else "failed"),
            ),
        )

    plan = plan_integration(
        REQ,
        [
            UnitBranch(unit_id=workspace.unit_id, branch=workspace.branch, run_id=workspace.run_id)
            for workspace in ledger.workspaces
        ],
        integration_id="int-1",
        base_branch="main",
        base_revision=started_at,
    )
    outcome = RequirementIntegrator(base, verify=verify).integrate(plan)

    assert outcome.succeeded is True, outcome.failure_reason
    assert outcome.merged is True
    assert outcome.verified is True
    assert outcome.promoted is True
    assert outcome.conflicting_units == ()

    # It was verified in the integration worktree, not in the base.
    assert len(verified_in) == 1
    assert verified_in[0].resolve() != base.resolve()
    assert verified_in[0].parent == base / ".rotaris" / INTEGRATION_WORKTREE_SUBPATH

    # The base moved exactly once, to the integrated commit, and carries all three units.
    assert head_of(base) != started_at
    assert head_of(base) == outcome.merged_commit
    for index in (1, 2, 3):
        assert (base / f"unit-{index}.txt").read_text(encoding="utf-8") == f"unit {index}\n"
    assert git(base, "branch", "--show-current").strip() == "main"

    # Every unit branch survives the integration.
    for workspace in ledger.workspaces:
        assert branch_exists(base, workspace.branch)

    record = outcome.to_record()
    assert record.succeeded is True
    assert record.unit_ids == units.ids
    assert record.merged_commit == head_of(base)


# -- the conflict path -----------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3409)
def test_a_real_conflict_names_the_units_and_leaves_the_base_untouched(
    tmp_path: Path,
) -> None:
    """The failure that must never reach the user's checkout, exercised for real."""
    base = repository(tmp_path / "base")
    started_at = head_of(base)
    original = (base / "shared.txt").read_text(encoding="utf-8")
    units = plan_units(REQ, (UnitSpec(key="alpha"), UnitSpec(key="docs"), UnitSpec(key="beta")))
    ledger = UnitWorktrees(base).provision_all(
        REQ,
        units.units,
        run_ids=("run-a", "run-b", "run-c"),
    )
    alpha, docs, beta = ledger.workspaces

    work(Path(alpha.path), "shared.txt", "alpha rewrote this line\n", message="alpha")
    work(Path(docs.path), "docs.md", "# docs\n", message="docs")
    work(Path(beta.path), "shared.txt", "beta rewrote this line\n", message="beta")

    verified: list[Path] = []

    def verify(tree: Path) -> SuiteRun:
        verified.append(tree)
        return passing(tree)

    plan = plan_integration(
        REQ,
        [
            UnitBranch(unit_id=workspace.unit_id, branch=workspace.branch)
            for workspace in (alpha, docs, beta)
        ],
        integration_id="int-2",
        base_branch="main",
        base_revision=started_at,
    )
    outcome = RequirementIntegrator(base, verify=verify).integrate(plan)

    assert outcome.succeeded is False
    assert outcome.promoted is False
    assert outcome.merged is False
    assert outcome.conflicting_files == ("shared.txt",)
    # The unit whose merge failed, and the one it collided with — not the innocent one.
    assert outcome.conflicting_units == (beta.unit_id, alpha.unit_id)
    assert docs.unit_id not in outcome.conflicting_units
    assert "shared.txt" in outcome.failure_reason
    assert alpha.unit_id in outcome.failure_reason

    # Verification never ran: there was nothing coherent to verify.
    assert verified == []

    # The base checkout is exactly where it was, content included.
    assert head_of(base) == started_at
    assert (base / "shared.txt").read_text(encoding="utf-8") == original
    assert not (base / "docs.md").exists()
    assert git(base, "status", "--porcelain").strip() == ""
    assert outcome.base_untouched

    # Every unit branch is preserved, so the work can be rescued by hand.
    for workspace in ledger.workspaces:
        assert branch_exists(base, workspace.branch)
        assert Path(workspace.path).is_dir()

    view = outcome.to_view()
    assert view.succeeded is False
    assert beta.unit_id in view.summary


@pytest.mark.integration
@verifies(SWR.SWR_3409, SWR.SWR_3410)
def test_an_integration_that_fails_verification_never_reaches_the_base(
    tmp_path: Path,
) -> None:
    """A clean merge is not a good change; the suite decides, and the base waits."""
    base = repository(tmp_path / "base")
    started_at = head_of(base)
    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="docs")))
    ledger = UnitWorktrees(base).provision_all(REQ, units.units, run_ids=("run-1", "run-2"))
    for index, workspace in enumerate(ledger.workspaces, start=1):
        work(Path(workspace.path), f"unit-{index}.txt", f"unit {index}\n", message=f"unit {index}")

    outcome = RequirementIntegrator(
        base,
        verify=lambda _tree: SuiteRun(
            executed=True,
            checks=(CheckOutcome(name="pytest", status="failed"),),
        ),
    ).integrate(
        plan_integration(
            REQ,
            [
                UnitBranch(unit_id=workspace.unit_id, branch=workspace.branch)
                for workspace in ledger.workspaces
            ],
            integration_id="int-3",
            base_branch="main",
            base_revision=started_at,
        ),
    )

    assert outcome.merged is True
    assert outcome.verified is False
    assert outcome.promoted is False
    assert outcome.succeeded is False
    assert "pytest" in outcome.failure_reason
    assert head_of(base) == started_at
    assert not (base / "unit-1.txt").exists()
    # The merged result is still on its branch, so a fix can start from it.
    assert branch_exists(base, outcome.branch or "")


@pytest.mark.integration
@verifies(SWR.SWR_3409)
def test_a_single_unit_requirement_creates_no_integration_worktree(tmp_path: Path) -> None:
    """Nothing to integrate means nothing is created — not an empty integration."""
    base = repository(tmp_path / "base")
    started_at = head_of(base)
    units = plan_units(REQ, (UnitSpec(key="impl"),))
    ledger = UnitWorktrees(base).provision_all(REQ, units.units, run_ids=("run-1",))
    work(Path(ledger.workspaces[0].path), "only.txt", "one\n", message="the only unit")

    outcome = RequirementIntegrator(base, verify=passing).integrate(
        plan_integration(
            REQ,
            [UnitBranch(unit_id=units.ids[0], branch=ledger.branches[0])],
            integration_id="int-4",
            base_branch="main",
            base_revision=started_at,
        ),
    )

    assert outcome.skipped is True
    assert outcome.succeeded is True
    assert outcome.worktree_path is None
    assert not (base / ".rotaris" / "requirements" / "integrations").exists()
    assert head_of(base) == started_at
    assert outcome.base_untouched


# -- the target branch, and the flow that reaches the integrator ------------


@pytest.mark.integration
@verifies(SWR.SWR_3419, SWR.SWR_3409)
def test_units_fork_from_and_land_on_a_target_the_checkout_is_not_on(
    tmp_path: Path,
) -> None:
    """Productive use: a team stabilising on `dev` runs a requirement while standing on a feature branch.
    Expected outcome: the units are cut from `dev`, the integration lands on `dev`, and the user's own
    checkout is exactly where they left it — the case that produced no error at all before SWR-3419."""
    base = repository(tmp_path / "base")
    git(base, "branch", "dev")
    git(base, "checkout", "-b", "feature/x")
    (base / "unrelated.txt").write_text("mine\n", encoding="utf-8")
    git(base, "add", "unrelated.txt")
    git(base, "commit", "-m", "work of my own")
    feature_head = head_of(base)
    dev_head = git(base, "rev-parse", "refs/heads/dev").strip()

    target = resolve_target_branch(base, declared="dev")
    assert target.branch == "dev"
    assert target.elsewhere is True
    assert "dev" in target.notice and "feature/x" in target.notice

    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="tests")))
    ledger = UnitWorktrees(
        base,
        isolation=GitIsolation(base, storage_subpath="requirements/worktrees", target=target),
    ).provision_all(REQ, units.units, run_ids=("run-1", "run-2"))

    # Every unit tree was cut from dev, not from the branch the user is standing on.
    for workspace in ledger.workspaces:
        tree = Path(workspace.path)
        assert git(tree, "rev-parse", "HEAD").strip() == dev_head
        assert workspace.base_revision == dev_head
        assert workspace.base_branch == "dev"
        assert not (tree / "unrelated.txt").exists()

    for index, workspace in enumerate(ledger.workspaces, start=1):
        work(Path(workspace.path), f"unit-{index}.txt", f"unit {index}\n", message=f"unit {index}")

    plan = plan_integration(
        REQ,
        [
            UnitBranch(unit_id=workspace.unit_id, branch=workspace.branch, run_id=workspace.run_id)
            for workspace in ledger.workspaces
        ],
        integration_id="int-1",
        base_branch=target.branch,
        base_revision=target.revision,
    )
    outcome = RequirementIntegrator(base, verify=passing).integrate(plan)

    assert outcome.succeeded is True, outcome.failure_reason
    assert outcome.promoted is True

    # dev carries both units; the user's checkout never moved and still has their own work.
    assert git(base, "rev-parse", "refs/heads/dev").strip() == outcome.merged_commit
    assert git(base, "rev-parse", "refs/heads/dev").strip() != dev_head
    assert head_of(base) == feature_head
    assert git(base, "branch", "--show-current").strip() == "feature/x"
    assert (base / "unrelated.txt").read_text(encoding="utf-8") == "mine\n"
    assert not (base / "unit-1.txt").exists()


@pytest.mark.integration
@verifies(SWR.SWR_3419)
def test_a_target_branch_the_workspace_does_not_have_is_refused_before_anything_is_created(
    tmp_path: Path,
) -> None:
    """Productive use: the configured target branch is mistyped.
    Expected outcome: the branch is named and refused at the point work would start, with no
    worktree, no branch and no agent run paid for."""
    base = repository(tmp_path / "base")

    with pytest.raises(TargetBranchError) as refusal:
        resolve_target_branch(base, declared="develop")

    assert "develop" in str(refusal.value)
    assert not (base / ".rotaris" / "requirements").exists()
    assert git(base, "branch", "--list").strip() == "* main"


# -- the flow that reaches the integrator ----------------------------------
#
# Nothing drove `RequirementFlow` with an `integrate=` before this: the parameter
# had existed since the epic's first slice and neither composition ever passed
# one, so every run that has ever happened took the stage's `None` branch. These
# two go through the real flow and the real builder, because the defect was in
# the composition and a test that builds the integrator by hand cannot see it.


def released_at(base: Path, req: CanonicalRequirement) -> ExecutionTransitions:
    """*req* dropped on Ready through the guarded write path — the flow's start."""
    transitions = ExecutionTransitions.for_workspace(base, current_for=lambda _rid: req)
    outcome = transitions.apply(
        TransitionRequest(
            req_id=req.req_id,
            target=DeliveryState.READY,
            actor=DeliveryActor.user("dvf"),
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
    )
    assert outcome.accepted, outcome.message
    return transitions


class CommittingHost:
    """A host that does what an agent does: commit work in its own worktree."""

    def __init__(self) -> None:
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        tree = Path(launch.workspace.path)
        name = f"{launch.unit_id or 'unit'}.txt"
        (tree / name).write_text(f"{launch.req_id}/{launch.unit_id}\n", encoding="utf-8")
        git(tree, "add", name)
        git(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"work for {launch.unit_id}",
        )
        return RunReport(
            outcome=RunOutcome.SUCCEEDED,
            session_id=launch.run_id,
            produced_commits=(git(tree, "rev-parse", "HEAD").strip(),),
            changed_files=(name,),
            verified=True,
            verification_detail="1 check(s) passed",
            agent_summary="committed the unit's work",
            agent_claimed_complete=True,
        )


def flow_that_lands(
    base: Path,
    req: CanonicalRequirement,
    host: CommittingHost,
    *,
    target: TargetBranch,
    decomposer: object | None = None,
    assess: object | None = None,
) -> RequirementFlow:
    """The production composition, with the integrator the builder supplies."""
    return RequirementFlow(
        transitions=released_at(base, req),
        seam=RequirementRunSeam(
            isolation=GitIsolation(base, target=target),
            host=host,  # type: ignore[arg-type]
            snapshots=SnapshotStore(base),
        ),
        current_for=lambda _rid: req,
        history=ExecutionHistory(base),
        decomposer=decomposer,  # type: ignore[arg-type]
        assess=assess,  # type: ignore[arg-type]
        progress=FlowStateStore(base),
        units=UnitStore(base),
        integrations=IntegrationLog(base),
        integrate=integration_for(base, target=target),
    )


@pytest.mark.integration
@verifies(SWR.SWR_3420, SWR.SWR_3409, SWR.SWR_3419)
def test_a_users_requirement_run_leaves_its_work_on_their_branch(tmp_path: Path) -> None:
    """Productive use: a user releases a requirement, walks away, and comes back.
    Expected outcome: the work is on their branch — which before this lane it never was, because
    the flow's integration stage had no integrator and nothing a run produced ever left its worktree."""
    base = repository(tmp_path / "base")
    req = CanonicalRequirement(
        req_id=REQ,
        title="Multi-unit results are integrated before they reach the base",
        description="Their branches are merged, verified, and only then taken to the base.",
        source_id="specs",
        source_path=f"docs/requirements/{REQ}.md",
        source_revision="rev-1",
    )
    started_at = head_of(base)
    host = CommittingHost()
    flow = flow_that_lands(base, req, host, target=resolve_target_branch(base))

    result = flow.start(req, base_commit=started_at)

    assert result.succeeded, result.message
    stage = result.outcome_for(FlowStage.INTEGRATION)
    assert stage is not None
    assert "no integrator is configured" not in stage.detail

    # The user's own branch carries the run's work, and the run's branch survives.
    assert head_of(base) != started_at
    tree = Path(host.launches[0].workspace.path)
    committed = git(tree, "rev-parse", "HEAD").strip()
    assert head_of(base) == committed
    assert branch_exists(base, host.launches[0].workspace.branch)

    # And it is recorded as integration evidence, not as a private fact.
    landed = IntegrationLog(base).load(REQ)
    assert landed and landed[-1].succeeded is True


@pytest.mark.integration
@verifies(SWR.SWR_3420, SWR.SWR_3410)
def test_a_run_nothing_verified_leaves_the_users_branch_alone(tmp_path: Path) -> None:
    """Productive use: a workspace with no check suite runs a requirement.
    Expected outcome: the work stays on its own branch and the user's branch is untouched —
    "nobody checked" does not earn a landing."""
    base = repository(tmp_path / "base")
    req = CanonicalRequirement(
        req_id=REQ,
        title="Multi-unit results are integrated before they reach the base",
        description="Their branches are merged, verified, and only then taken to the base.",
        source_id="specs",
        source_path=f"docs/requirements/{REQ}.md",
        source_revision="rev-1",
    )
    started_at = head_of(base)

    class UnverifiedHost(CommittingHost):
        def start(self, launch: UnitLaunch) -> RunReport:
            report = super().start(launch)
            return report.model_copy(update={"verified": None, "verification_detail": ""})

    host = UnverifiedHost()
    flow = flow_that_lands(base, req, host, target=resolve_target_branch(base))

    result = flow.start(req, base_commit=started_at)

    assert result.succeeded, result.message
    assert head_of(base) == started_at
    assert branch_exists(base, host.launches[0].workspace.branch)
