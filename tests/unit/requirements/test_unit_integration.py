"""Productive use: a user's requirement was split into several units, each of which
produced its own branch, and the user wants the combined result — verified — without the
combination being tried out on their own checkout.
Expected outcome: the branches are merged in a separate integration worktree and only reach
the base after verification passes; a conflict aborts, names the units and files that
collided, keeps every unit branch and leaves the base exactly where it was; and a
single-unit requirement produces no integration at all."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import CheckOutcome
from rotaris_core.requirements.execution.integration import (
    DEFAULT_INTEGRATION_BRANCH_TEMPLATE,
    SINGLE_UNIT_LANDED_REASON,
    SINGLE_UNIT_SKIP_REASON,
    UNVERIFIED_SKIP_REASON,
    IntegrationError,
    IntegrationOutcome,
    RequirementIntegrator,
    UnitBranch,
    integration_branch_for,
    plan_integration,
)
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    IsolationRequest,
    RunWorkspace,
)
from rotaris_core.requirements.execution.verification import SuiteRun
from rotaris_core.requirements.execution.worktrees import GitCommand, WorktreeError

REQ = "SWR-3409"
AT = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)


class FakeRepo:
    """A git port over a scripted repository: enough merge behaviour to be real.

    It tracks what has been merged, which branch will conflict and on which
    files, and it advances the base only when a fast-forward is actually asked
    for — so "the base was left untouched" is measured here, not assumed.
    """

    def __init__(self, base: Path, *, base_head: str = "base-1", branch: str = "main") -> None:
        self.base = base
        self.base_head = base_head
        self.base_branch = branch
        self.integration_head = base_head
        self.changed_by: dict[str, tuple[str, ...]] = {}
        self.will_conflict: dict[str, tuple[str, ...]] = {}
        self.merged: list[str] = []
        self.aborted = 0
        self.calls: list[tuple[str, tuple[str, ...]]] = []
        #: How many git calls had happened when verification ran, and where.
        self.verified_after: int | None = None
        self.verified_in: str = ""
        #: Branches this repository has that the checkout does not have out.
        self.other_heads: dict[str, str] = {}
        #: Every ``fetch . <src>:<dst>`` as (source, destination).
        self.fetched: list[tuple[str, str]] = []
        self._unmerged: tuple[str, ...] = ()

    # -- GitPort ----------------------------------------------------------

    def run(self, cwd: Path, *args: str) -> GitCommand:
        self.calls.append((str(cwd), args))
        rest = list(args)
        while rest[:1] == ["-c"]:
            rest = rest[2:]
        in_base = Path(cwd).resolve() == self.base.resolve()
        return self._answer(tuple(rest), in_base=in_base)

    @property
    def commands(self) -> list[tuple[str, ...]]:
        """Every git invocation, identity flags stripped."""
        stripped: list[tuple[str, ...]] = []
        for _cwd, args in self.calls:
            rest = list(args)
            while rest[:1] == ["-c"]:
                rest = rest[2:]
            stripped.append(tuple(rest))
        return stripped

    def _answer(self, args: tuple[str, ...], *, in_base: bool) -> GitCommand:
        if args == ("branch", "--show-current"):
            return self._ok(args, self.base_branch if in_base else "integration")
        if args == ("rev-parse", "HEAD"):
            return self._ok(args, self.base_head if in_base else self.integration_head)
        if len(args) == 3 and args[:2] == ("rev-parse", "--verify"):
            branch = args[2].removeprefix("refs/heads/")
            if branch in self.other_heads:
                return self._ok(args, self.other_heads[branch])
            return GitCommand(args=args, returncode=128, stderr=f"unknown revision {branch}")
        if args[:2] == ("fetch", "."):
            source, _, destination = args[2].partition(":")
            self.fetched.append((source, destination))
            self.other_heads[destination] = self.integration_head
            return self._ok(args, "")
        if args == ("diff", "--name-only", "--diff-filter=U"):
            return self._ok(args, "\n".join(self._unmerged))
        if len(args) == 3 and args[:2] == ("diff", "--name-only") and ".." in args[2]:
            branch = args[2].split("..", 1)[1]
            return self._ok(args, "\n".join(self.changed_by.get(branch, ())))
        if args[:2] == ("merge", "--abort"):
            self.aborted += 1
            self._unmerged = ()
            return self._ok(args, "")
        if args[:2] == ("merge", "--ff-only"):
            self.base_head = self.integration_head
            return self._ok(args, "")
        if args[0] == "merge":
            return self._merge(args, args[-1])
        return self._ok(args, "")

    def _merge(self, args: tuple[str, ...], branch: str) -> GitCommand:
        conflicts = self.will_conflict.get(branch, ())
        if conflicts:
            self._unmerged = conflicts
            return GitCommand(
                args=args,
                returncode=1,
                stdout="CONFLICT (content): Merge conflict\n",
                stderr="Automatic merge failed; fix conflicts and then commit the result.",
            )
        self.merged.append(branch)
        self.integration_head = f"int-{len(self.merged)}"
        return self._ok(args, "")

    @staticmethod
    def _ok(args: tuple[str, ...], stdout: str) -> GitCommand:
        return GitCommand(args=args, returncode=0, stdout=stdout)


class FakeIsolation:
    """Creates the integration worktree the integrator asks for."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.requests: list[IsolationRequest] = []

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        self.requests.append(request)
        target = self.root / (request.session_id or "integration")
        target.mkdir(parents=True, exist_ok=True)
        return RunWorkspace(path=str(target), branch=request.branch or "detached")


def branches(count: int) -> tuple[UnitBranch, ...]:
    return tuple(
        UnitBranch(unit_id=f"unit-{index}", branch=f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/u{index}")
        for index in range(1, count + 1)
    )


def build(
    tmp_path: Path,
    *,
    verify: SuiteRun | None = None,
) -> tuple[RequirementIntegrator, FakeRepo, FakeIsolation]:
    base = tmp_path / "base"
    base.mkdir(exist_ok=True)
    repo = FakeRepo(base)
    isolation = FakeIsolation(tmp_path / "integrations")

    def checked(tree: Path) -> SuiteRun:
        assert verify is not None
        repo.verified_after = len(repo.calls)
        repo.verified_in = str(tree)
        return verify

    integrator = RequirementIntegrator(
        base,
        git=repo,
        isolation=isolation,
        verify=checked if verify is not None else None,
        clock=lambda: AT,
    )
    return integrator, repo, isolation


def plan_for(units: tuple[UnitBranch, ...], *, head: str = "base-1"):  # noqa: ANN201 - a fixture
    return plan_integration(
        REQ,
        units,
        integration_id="int-1",
        base_branch="main",
        base_revision=head,
    )


# -- planning --------------------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_single_unit_requirement_needs_no_integration() -> None:
    """The skip is decidable from the plan, before anything is created."""
    one = plan_for(branches(1))
    two = plan_for(branches(2))

    assert one.needed is False
    assert one.skip_reason == SINGLE_UNIT_SKIP_REASON
    assert two.needed is True
    assert two.skip_reason == ""
    assert two.unit_ids == ("unit-1", "unit-2")


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_plan_refuses_to_merge_one_unit_twice_or_onto_itself() -> None:
    """An incoherent plan cannot be built and then discovered mid-merge."""
    duplicate = UnitBranch(unit_id="unit-1", branch="rotaris/req/swr-3409/u1")

    with pytest.raises(IntegrationError, match="listed twice"):
        plan_for((duplicate, duplicate))

    with pytest.raises(IntegrationError, match="branch .* listed twice"):
        plan_for(
            (
                duplicate,
                UnitBranch(unit_id="unit-2", branch="rotaris/req/swr-3409/u1"),
            ),
        )

    plan = plan_for(branches(2))
    with pytest.raises(IntegrationError, match="on the integration branch itself"):
        plan_for(
            (
                duplicate,
                UnitBranch(unit_id="unit-2", branch=plan.integration_branch),
            ),
        )


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_plan_without_a_base_commit_is_refused() -> None:
    """A promotion that cannot tell whether the base moved is not a promotion."""
    with pytest.raises(IntegrationError, match="names the commit the base stood at"):
        plan_integration(
            REQ,
            branches(2),
            integration_id="int-1",
            base_branch="main",
            base_revision="  ",
        )


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_the_integration_branch_lives_in_the_requirement_namespace() -> None:
    """A requirement integration can never take a session integration's branch."""
    branch = integration_branch_for("SWR-3409", "int-1")

    assert branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/integration/int-1"
    assert not branch.startswith("rotaris/integration/")
    assert not branch.startswith("rotaris/session/")
    assert DEFAULT_INTEGRATION_BRANCH_TEMPLATE.startswith(REQUIREMENT_BRANCH_PREFIX)
    assert (
        integration_branch_for("PROJ/7", "a b")
        == f"{REQUIREMENT_BRANCH_PREFIX}/proj-7/integration/a-b"
    )

    with pytest.raises(IntegrationError, match="cannot derive an integration branch"):
        integration_branch_for("***", "int-1")


# -- the skip --------------------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3409, SWR.SWR_3420)
def test_a_single_unit_nothing_verified_runs_no_integration_and_does_not_land(
    tmp_path: Path,
) -> None:
    """No worktree, no branch, no merge — and the base is where it was.

    Productive use: a workspace with no check suite runs a requirement that needs
    no splitting. Expected outcome: nothing is integrated *and* nothing is
    promoted, because "nobody checked" does not earn a landing (SWR-3420).
    """
    integrator, repo, isolation = build(tmp_path, verify=SuiteRun(executed=True))

    outcome = integrator.integrate(plan_for(branches(1)))

    assert outcome.skipped is True
    assert outcome.succeeded is True
    assert outcome.promoted is False
    assert outcome.skip_reason == UNVERIFIED_SKIP_REASON
    assert outcome.worktree_path is None
    assert outcome.branch is None
    assert isolation.requests == []
    assert repo.merged == []
    assert repo.base_head == "base-1"
    assert outcome.base_untouched
    assert outcome.to_record().unit_ids == ("unit-1",)


# -- the conflict path -----------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_conflict_names_the_colliding_units_and_leaves_the_base_untouched(
    tmp_path: Path,
) -> None:
    """The failure a user has to read: which units collided, and on what."""
    integrator, repo, isolation = build(tmp_path, verify=SuiteRun(executed=True))
    units = branches(3)
    repo.changed_by = {
        units[0].branch: ("src/shared.py",),
        units[1].branch: ("docs/readme.md",),
        units[2].branch: ("src/shared.py",),
    }
    repo.will_conflict = {units[2].branch: ("src/shared.py",)}

    outcome = integrator.integrate(plan_for(units))

    assert outcome.succeeded is False
    assert outcome.merged is False
    assert outcome.promoted is False
    assert outcome.conflicting_units == ("unit-3", "unit-1")
    assert outcome.conflicting_files == ("src/shared.py",)
    assert "src/shared.py" in outcome.failure_reason
    assert "unit-1" in outcome.failure_reason

    # The merge was aborted, nothing was fast-forwarded, and the base stands still.
    assert repo.aborted == 1
    assert not any(command[:2] == ("merge", "--ff-only") for command in repo.commands)
    assert repo.verified_after is None
    assert repo.base_head == "base-1"
    assert outcome.base_untouched

    # Every unit branch is preserved — nothing was deleted, reset or pushed.
    assert not any(command[0] in {"reset", "push", "worktree"} for command in repo.commands)
    assert not any(command[:2] == ("branch", "-D") for command in repo.commands)
    assert isolation.requests[0].branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/integration/int-1"

    view = outcome.to_view()
    assert view.succeeded is False
    assert view.conflicting_units == ("unit-3", "unit-1")
    assert "unit-3" in view.summary


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_unit_that_declares_its_files_is_not_asked_git_about_them(tmp_path: Path) -> None:
    """The caller already knows what a unit changed; the report uses it."""
    integrator, repo, _isolation = build(tmp_path, verify=SuiteRun(executed=True))
    first = UnitBranch(
        unit_id="unit-1",
        branch="rotaris/req/swr-3409/u1",
        changed_files=("src/only-mine.py",),
    )
    second = UnitBranch(unit_id="unit-2", branch="rotaris/req/swr-3409/u2")
    repo.will_conflict = {second.branch: ("src/other.py",)}

    outcome = integrator.integrate(plan_for((first, second)))

    # unit-1 changed a file that did not collide, so it is not blamed.
    assert outcome.conflicting_units == ("unit-2",)
    assert not any(
        command[:2] == ("diff", "--name-only") and command[-1].endswith("u1")
        for command in repo.commands
    )


# -- verification stands between the merge and the base --------------------


@pytest.mark.unit
@verifies(SWR.SWR_3409, SWR.SWR_3410)
def test_an_unverified_integration_does_not_reach_the_base(tmp_path: Path) -> None:
    """A suite that did not run is not a pass, so nothing is promoted."""
    integrator, repo, _isolation = build(tmp_path)

    outcome = integrator.integrate(plan_for(branches(2)))

    assert repo.merged == list(branch.branch for branch in branches(2))
    assert outcome.merged is True
    assert outcome.verified is None
    assert outcome.promoted is False
    assert outcome.succeeded is False
    assert "declares no check suite" in outcome.failure_reason
    assert not any(command[:2] == ("merge", "--ff-only") for command in repo.commands)
    assert repo.base_head == "base-1"
    assert outcome.base_untouched


@pytest.mark.unit
@verifies(SWR.SWR_3409, SWR.SWR_3410)
def test_a_failing_integration_suite_names_the_check_and_spares_the_base(
    tmp_path: Path,
) -> None:
    """The merge was clean; the result is still not something the base gets."""
    integrator, repo, _isolation = build(
        tmp_path,
        verify=SuiteRun(
            executed=True,
            checks=(
                CheckOutcome(name="pytest", status="failed"),
                CheckOutcome(name="ruff", status="passed"),
            ),
        ),
    )

    outcome = integrator.integrate(plan_for(branches(2)))

    assert outcome.merged is True
    assert outcome.verified is False
    assert outcome.promoted is False
    assert "pytest" in outcome.failure_reason
    assert repo.base_head == "base-1"
    assert outcome.base_untouched


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_verified_integration_lands_on_the_base(tmp_path: Path) -> None:
    """Merge, verify, and only then fast-forward — in that order."""
    integrator, repo, _isolation = build(
        tmp_path,
        verify=SuiteRun(executed=True, checks=(CheckOutcome(name="pytest", status="passed"),)),
    )
    units = branches(3)

    outcome = integrator.integrate(plan_for(units))

    assert repo.merged == [unit.branch for unit in units]
    assert outcome.merged is True
    assert outcome.verified is True
    assert outcome.promoted is True
    assert outcome.succeeded is True
    assert outcome.merged_commit == "int-3"
    assert outcome.checks == ("pytest",)
    assert repo.base_head == "int-3"

    # Merge, then verify, then promote — the order is the requirement.
    unit_merges = [
        index for index, command in enumerate(repo.commands) if command[:2] == ("merge", "--no-ff")
    ]
    promotion = next(
        index
        for index, command in enumerate(repo.commands)
        if command[:2] == ("merge", "--ff-only")
    )
    assert repo.verified_after is not None
    assert max(unit_merges) < repo.verified_after <= promotion
    assert repo.verified_in != str(integrator.base_workspace)

    record = outcome.to_record(session_id="session-7")
    assert record.succeeded is True
    assert record.merged_commit == "int-3"
    assert record.unit_ids == ("unit-1", "unit-2", "unit-3")
    assert record.address.startswith("integration:int-1@")

    view = outcome.to_view()
    assert view.succeeded is True
    assert view.branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/integration/int-1"
    assert view.finished_at == AT


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_a_base_that_moved_since_the_plan_stops_the_integration_before_it_starts(
    tmp_path: Path,
) -> None:
    """No worktree is created for an integration that could not be promoted anyway."""
    integrator, repo, isolation = build(tmp_path, verify=SuiteRun(executed=True))
    repo.base_head = "somebody-else-pushed"

    outcome = integrator.integrate(plan_for(branches(2), head="base-1"))

    assert outcome.succeeded is False
    assert outcome.promoted is False
    assert "the base moved" in outcome.failure_reason
    assert isolation.requests == []
    assert repo.merged == []


# -- the outcome cannot lie ------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3409)
def test_an_outcome_that_did_not_land_has_to_say_why() -> None:
    """A silent failure is the one thing the board cannot render."""
    with pytest.raises(IntegrationError, match="names why"):
        IntegrationOutcome(integration_id="int-1", req_id=REQ, merged=True)

    with pytest.raises(IntegrationError, match="never reaches the base"):
        IntegrationOutcome(
            integration_id="int-1",
            req_id=REQ,
            merged=True,
            verified=True,
            promoted=True,
            conflicting_units=("unit-1",),
        )


# -- the target branch (SWR-3419) ------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3409, SWR.SWR_3419)
def test_a_verified_integration_promotes_a_branch_the_checkout_does_not_have_out(
    tmp_path: Path,
) -> None:
    """Productive use: a team stabilising on `dev` runs a requirement from a feature checkout.
    Expected outcome: `dev` advances to the verified integration and the user's own tree is never moved."""
    integrator, repo, _isolation = build(
        tmp_path,
        verify=SuiteRun(executed=True, checks=(CheckOutcome(name="pytest", status="passed"),)),
    )
    repo.base_branch = "feature/x"
    repo.other_heads["dev"] = "dev-1"
    plan = plan_integration(
        REQ,
        branches(2),
        integration_id="int-1",
        base_branch="dev",
        base_revision="dev-1",
    )

    outcome = integrator.integrate(plan)

    assert outcome.succeeded is True
    assert outcome.promoted is True
    assert repo.fetched == [(plan.integration_branch, "dev")]
    # The checkout was never merged into and never moved off its own branch.
    assert ("merge", "--ff-only", plan.integration_branch) not in repo.commands
    assert repo.base_head == "base-1"
    assert outcome.base_before == "dev-1"
    assert outcome.base_after == repo.other_heads["dev"]


@pytest.mark.unit
@verifies(SWR.SWR_3409, SWR.SWR_3419)
def test_a_target_branch_that_moved_while_the_units_ran_stops_the_promotion(
    tmp_path: Path,
) -> None:
    """Productive use: somebody else pushes to `dev` while a multi-unit requirement runs.
    Expected outcome: the promotion is refused naming both readings, and `dev` is left where they put it."""
    integrator, repo, isolation = build(
        tmp_path,
        verify=SuiteRun(executed=True, checks=(CheckOutcome(name="pytest", status="passed"),)),
    )
    repo.base_branch = "feature/x"
    repo.other_heads["dev"] = "dev-2"
    plan = plan_integration(
        REQ,
        branches(2),
        integration_id="int-1",
        base_branch="dev",
        base_revision="dev-1",
    )

    outcome = integrator.integrate(plan)

    assert outcome.succeeded is False
    assert "the base moved" in outcome.failure_reason
    assert repo.fetched == []
    assert isolation.requests == []
    assert repo.other_heads["dev"] == "dev-2"


@pytest.mark.unit
@verifies(SWR.SWR_3419)
def test_a_target_branch_that_does_not_exist_is_named(tmp_path: Path) -> None:
    """Productive use: the configured target branch was deleted between two runs.
    Expected outcome: the branch is named, rather than the integration comparing itself against HEAD."""
    integrator, repo, _isolation = build(tmp_path)
    repo.base_branch = "feature/x"

    with pytest.raises(WorktreeError, match="release/2.1"):
        integrator.fingerprint_target("release/2.1")


@pytest.mark.unit
@verifies(SWR.SWR_3420)
def test_a_verified_single_unit_lands_without_an_integration_worktree(tmp_path: Path) -> None:
    """Productive use: a user runs a requirement small enough to need no splitting.
    Expected outcome: the work is on their branch afterwards, and no integration worktree was ever created."""
    integrator, repo, isolation = build(tmp_path)
    unit = UnitBranch(
        unit_id="unit-1",
        branch=f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/u1",
        verified=True,
    )
    repo.integration_head = "unit-1-head"

    outcome = integrator.integrate(plan_for((unit,)))

    assert outcome.promoted is True
    assert outcome.succeeded is True
    assert outcome.skipped is True
    assert outcome.skip_reason == SINGLE_UNIT_LANDED_REASON
    assert outcome.branch == unit.branch
    # No integration tree, and the fast-forward took the unit's own branch.
    assert isolation.requests == []
    assert outcome.worktree_path is None
    assert ("merge", "--ff-only", unit.branch) in repo.commands
    assert repo.base_head == "unit-1-head"
    assert "1 unit landed" in outcome.summary


@pytest.mark.unit
@verifies(SWR.SWR_3420, SWR.SWR_3419)
def test_a_verified_single_unit_lands_on_a_target_the_checkout_is_not_on(
    tmp_path: Path,
) -> None:
    """Productive use: a team on `dev` runs a one-unit requirement from a feature checkout.
    Expected outcome: `dev` advances and the user's own tree is untouched."""
    integrator, repo, _isolation = build(tmp_path)
    repo.base_branch = "feature/x"
    repo.other_heads["dev"] = "dev-1"
    repo.integration_head = "unit-1-head"
    unit = UnitBranch(
        unit_id="unit-1",
        branch=f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/u1",
        verified=True,
    )
    plan = plan_integration(
        REQ,
        (unit,),
        integration_id="int-1",
        base_branch="dev",
        base_revision="dev-1",
    )

    outcome = integrator.integrate(plan)

    assert outcome.promoted is True
    assert repo.fetched == [(unit.branch, "dev")]
    assert repo.base_head == "base-1"


@pytest.mark.unit
@verifies(SWR.SWR_3420)
def test_a_single_unit_that_cannot_fast_forward_leaves_the_target_alone(
    tmp_path: Path,
) -> None:
    """Productive use: the target branch moved on while a one-unit requirement ran.
    Expected outcome: a stated refusal naming the unit, and the branch is left where it was."""

    class Refusing(FakeRepo):
        def _answer(self, args: tuple[str, ...], *, in_base: bool) -> GitCommand:
            if args[:2] == ("merge", "--ff-only"):
                return GitCommand(args=args, returncode=1, stderr="Not possible to fast-forward")
            return super()._answer(args, in_base=in_base)

    base = tmp_path / "base"
    base.mkdir(exist_ok=True)
    repo = Refusing(base)
    integrator = RequirementIntegrator(
        base,
        git=repo,
        isolation=FakeIsolation(tmp_path / "integrations"),
        clock=lambda: AT,
    )
    unit = UnitBranch(
        unit_id="unit-1",
        branch=f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/u1",
        verified=True,
    )

    outcome = integrator.integrate(plan_for((unit,)))

    assert outcome.succeeded is False
    assert outcome.promoted is False
    assert "unit-1" in outcome.failure_reason
    assert "fast-forward" in outcome.failure_reason
    assert repo.base_head == "base-1"
    assert outcome.base_untouched


@pytest.mark.unit
@verifies(SWR.SWR_3420, SWR.SWR_3216)
def test_a_landing_reaches_the_board_and_a_no_op_does_not(tmp_path: Path) -> None:
    """Productive use: a user looks at the card of a requirement that needed no splitting.
    Expected outcome: the landing is on it. The board filtered skipped integrations, and
    a single unit's landing is recorded as a skipped integration that promoted."""
    integrator, repo, _isolation = build(tmp_path)
    repo.integration_head = "unit-1-head"
    landed = integrator.integrate(
        plan_for(
            (
                UnitBranch(
                    unit_id="unit-1",
                    branch=f"{REQUIREMENT_BRANCH_PREFIX}/swr-3409/u1",
                    verified=True,
                ),
            ),
        ),
    )
    nothing = integrator.integrate(plan_for(branches(1), head=repo.base_head))

    assert landed.promoted is True
    assert landed.skipped is True
    assert landed.worth_showing is True, "a landing a board never shows is not a landing"
    assert nothing.skipped is True
    assert nothing.promoted is False
    assert nothing.worth_showing is False
