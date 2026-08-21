"""Productive use: a user starts a requirement whose work is split into units, and each
unit's agent gets a working tree of its own instead of fighting over the user's checkout.
Expected outcome: every unit run is handed a branch in Rotaris' requirement namespace and a
worktree under `.rotaris/requirements/worktrees/`, the recorded path and branch are the ones
git reports, two units of one requirement never share either, and a workspace that turns out
to be the base checkout is refused rather than written into."""

from __future__ import annotations

from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.execution.run_seam import (
    REQUIREMENT_BRANCH_PREFIX,
    REQUIREMENT_WORKTREE_SUBPATH,
    IsolationError,
    IsolationRequest,
    RunWorkspace,
    unit_branch,
)
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.execution.worktrees import (
    DEFAULT_BRANCH_TEMPLATE,
    BaseFingerprint,
    BranchStrategy,
    UnitWorkspace,
    UnitWorktrees,
    WorktreeError,
    WorktreeLedger,
)

REQ = "SWR-3405"


def key(path: Path | str) -> str:
    """How the production code compares two worktree paths."""
    return str(Path(str(path)).resolve())


class FakeInspector:
    """What git would say about a tree — scriptable, so a disagreement is testable."""

    def __init__(self, base: Path, *, branch: str = "main", head: str = "c0ffee1") -> None:
        self.branch_of: dict[str, str] = {key(base): branch}
        self.head_of: dict[str, str] = {key(base): head}

    def observe(self, workspace: RunWorkspace) -> None:
        """Record what git would report for a tree the provider just created."""
        self.branch_of[key(workspace.path)] = workspace.branch
        self.head_of.setdefault(key(workspace.path), "c0ffee1")

    def top_level(self, path: Path) -> Path:
        return Path(key(path))

    def branch(self, path: Path) -> str:
        return self.branch_of.get(key(path), "")

    def head(self, path: Path) -> str:
        return self.head_of.get(key(path), "")


class LyingInspector(FakeInspector):
    """An inspector whose answer disagrees with what the provider reported."""

    def branch(self, path: Path) -> str:
        answer = FakeInspector.branch(self, path)
        return "somebody-elses-branch" if answer.startswith(REQUIREMENT_BRANCH_PREFIX) else answer


class FakeIsolation:
    """An isolation provider that really creates the directory it reports.

    Real enough for the confirmation step to mean something: the inspector
    answers about a tree that exists, so a mismatch here is a mismatch the
    production code would also see against git.
    """

    def __init__(
        self,
        root: Path,
        *,
        inspector: FakeInspector | None = None,
        fail: str = "",
        hand_back: Path | None = None,
    ) -> None:
        self.root = root
        self.requests: list[IsolationRequest] = []
        self._inspector = inspector
        self._fail = fail
        self._hand_back = hand_back

    def provide(self, request: IsolationRequest) -> RunWorkspace:
        self.requests.append(request)
        if self._fail:
            raise IsolationError(self._fail)
        target = self._hand_back
        if target is None:
            target = self.root / (request.session_id or "unnamed")
        target.mkdir(parents=True, exist_ok=True)
        workspace = RunWorkspace(
            path=str(target),
            branch=request.branch or "detached",
            base_branch="main",
            base_revision="c0ffee1",
        )
        if self._inspector is not None:
            self._inspector.observe(workspace)
        return workspace


def build(
    tmp_path: Path,
    *,
    strategy: BranchStrategy | None = None,
    hand_back: Path | None = None,
    inspector: FakeInspector | None = None,
) -> tuple[UnitWorktrees, FakeIsolation, FakeInspector]:
    """A service wired to a provider that creates trees and an inspector that sees them."""
    base = tmp_path / "base"
    base.mkdir(exist_ok=True)
    trees = tmp_path / "trees"
    trees.mkdir(exist_ok=True)
    seer = inspector if inspector is not None else FakeInspector(base)
    isolation = FakeIsolation(trees, inspector=seer, hand_back=hand_back)
    service = UnitWorktrees(base, strategy=strategy, isolation=isolation, inspector=seer)
    return service, isolation, seer


# -- the namespace ---------------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_the_default_strategy_is_the_run_seams_own_branch_rule() -> None:
    """One namespace, one spelling: the strategy and the seam cannot drift apart."""
    strategy = BranchStrategy()

    assert strategy.template == DEFAULT_BRANCH_TEMPLATE
    for req_id, unit_id in (("SWR-3405", "swr-3405-impl"), ("PROJ/7", "unit one:two")):
        assert strategy.branch_for(req_id, unit_id) == unit_branch(req_id, unit_id)
    assert strategy.branch_for(REQ, "u").startswith(f"{REQUIREMENT_BRANCH_PREFIX}/")


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_requirement_branch_cannot_be_named_into_the_session_namespace() -> None:
    """Requirement worktrees and session worktrees never take each other's branch."""
    for reserved in ("rotaris/session/{req}-{unit}", "rotaris/integration/{req}/{unit}"):
        with pytest.raises(WorktreeError, match="belongs to isolated sessions"):
            BranchStrategy(template=reserved)

    # A legal alternative namespace is still accepted, so SWR-3117 stays configurable.
    custom = BranchStrategy(template="delivery/{req}/units/{unit}")
    assert custom.branch_for("SWR-1", "impl") == "delivery/swr-1/units/impl"


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_strategy_that_forgets_the_unit_is_refused_before_anything_runs() -> None:
    """Without {unit}, every unit of a requirement would share one branch."""
    with pytest.raises(WorktreeError, match=r"\{req\} and \{unit\}"):
        BranchStrategy(template="rotaris/req/{req}")
    with pytest.raises(WorktreeError, match=r"\{req\} and \{unit\}"):
        BranchStrategy(template="rotaris/req/{unit}")


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_retry_gets_its_own_branch_so_the_failed_one_stays_inspectable() -> None:
    """Attempt two never reuses the branch whose failure is still being read."""
    strategy = BranchStrategy()

    first = strategy.branch_for(REQ, "impl")
    second = strategy.branch_for(REQ, "impl", attempt=2)

    assert first != second
    assert second == f"{first}-a2"

    explicit = BranchStrategy(template="rotaris/req/{req}/{unit}/try-{attempt}")
    assert explicit.branch_for(REQ, "impl", attempt=3).endswith("/try-3")


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_an_id_with_no_usable_characters_cannot_produce_a_branch() -> None:
    """A branch derived from nothing would be a collision waiting to happen."""
    with pytest.raises(WorktreeError, match="cannot derive a branch"):
        BranchStrategy().branch_for("...", "***")


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_requirement_trees_cannot_be_stored_where_sessions_keep_theirs(tmp_path: Path) -> None:
    """`.rotaris/worktrees/` belongs to sessions; requirement runs stay out of it."""
    base = tmp_path / "base"
    base.mkdir()

    for refused in ("worktrees", "worktrees/requirements", "", "../escape"):
        with pytest.raises(WorktreeError):
            UnitWorktrees(base, storage_subpath=refused)

    assert UnitWorktrees(base).storage_subpath == REQUIREMENT_WORKTREE_SUBPATH
    assert REQUIREMENT_WORKTREE_SUBPATH.startswith("requirements/")


# -- what gets recorded ----------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_the_recorded_path_and_branch_are_the_ones_git_reports(tmp_path: Path) -> None:
    """A recorded worktree nobody asked git about is a rumour, not a record."""
    service, isolation, _seer = build(tmp_path)

    workspace = service.provision(REQ, "impl", run_id="run-1")

    assert isolation.requests[0].session_id == "run-1"
    assert isolation.requests[0].branch == f"{REQUIREMENT_BRANCH_PREFIX}/swr-3405/impl"
    assert workspace.branch == isolation.requests[0].branch
    assert key(workspace.path) == key(tmp_path / "trees" / "run-1")
    assert workspace.directory.is_dir()
    assert workspace.run_id == "run-1"
    assert workspace.attempt == 1
    assert workspace.address == f"{workspace.branch} @ {workspace.path}"


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_worktree_git_disagrees_about_is_refused(tmp_path: Path) -> None:
    """The provider says one branch, git says another — that workspace is unusable."""
    base = tmp_path / "base"
    base.mkdir()
    service, _isolation, _seer = build(tmp_path, inspector=LyingInspector(base))

    with pytest.raises(WorktreeError, match="but git reports"):
        service.provision(REQ, "impl", run_id="run-1")

    assert service.ledger_for(REQ).workspaces == ()


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_provided_workspace_that_is_the_base_checkout_is_refused(tmp_path: Path) -> None:
    """A unit that would run in the user's tree fails loudly instead of dirtying it."""
    base = tmp_path / "base"
    base.mkdir()
    service, _isolation, _seer = build(tmp_path, hand_back=base)

    with pytest.raises(WorktreeError, match="the base checkout"):
        service.provision(REQ, "impl", run_id="run-1")

    assert service.ledger_for(REQ).workspaces == ()


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_an_isolation_failure_names_the_requirement_and_the_unit(tmp_path: Path) -> None:
    """A run with no tree has to say whose tree it was."""
    base = tmp_path / "base"
    base.mkdir()
    service = UnitWorktrees(
        base,
        isolation=FakeIsolation(tmp_path / "trees", fail="worktree path already exists"),
        inspector=FakeInspector(base),
    )

    with pytest.raises(WorktreeError, match=r"SWR-3405/impl: worktree path already exists"):
        service.provision(REQ, "impl", run_id="run-1")


# -- two units, two trees --------------------------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3405, SWR.SWR_3406)
def test_two_units_of_one_requirement_get_two_branches_and_two_worktrees(
    tmp_path: Path,
) -> None:
    """SWR-3405's second acceptance criterion, as a value rather than as luck."""
    service, _isolation, _seer = build(tmp_path)
    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="tests", depends_on=("impl",))))

    ledger = service.provision_all(REQ, units.units, run_ids=("run-1", "run-2"))

    assert len(ledger.workspaces) == 2
    assert len(set(ledger.branches)) == 2
    assert len({key(path) for path in ledger.paths}) == 2
    assert ledger.unit_ids == units.ids
    assert all(
        branch.startswith(f"{REQUIREMENT_BRANCH_PREFIX}/swr-3405/") for branch in ledger.branches
    )
    impl = ledger.for_unit(units.ids[0])
    assert impl is not None
    assert impl.run_id == "run-1"


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_provisioning_needs_one_run_id_per_unit(tmp_path: Path) -> None:
    """A unit with no run id would file its tree under another unit's run."""
    service, _isolation, _seer = build(tmp_path)
    units = plan_units(REQ, (UnitSpec(key="impl"), UnitSpec(key="tests")))

    with pytest.raises(WorktreeError, match="2 unit"):
        service.provision_all(REQ, units.units, run_ids=("run-1",))


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_ledger_refuses_two_units_on_one_branch_or_in_one_tree() -> None:
    """The invariant is checked on construction, not noticed afterwards."""
    shared = {
        "req_id": REQ,
        "run_id": "run-1",
        "base_branch": "main",
        "base_revision": "c0ffee1",
    }
    one = UnitWorkspace(unit_id="impl", path="/w/one", branch="rotaris/req/a/impl", **shared)

    with pytest.raises(WorktreeError, match="would share"):
        WorktreeLedger(
            req_id=REQ,
            workspaces=(
                one,
                UnitWorkspace(
                    unit_id="tests",
                    path="/w/two",
                    branch="rotaris/req/a/impl",
                    **shared,
                ),
            ),
        )

    with pytest.raises(WorktreeError, match="would share worktree"):
        WorktreeLedger(
            req_id=REQ,
            workspaces=(
                one,
                UnitWorkspace(
                    unit_id="tests",
                    path="/w/one",
                    branch="rotaris/req/a/tests",
                    **shared,
                ),
            ),
        )


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_unit_workspace_names_every_part_of_itself() -> None:
    """An unnamed tree, branch or run cannot be opened by anyone later."""
    with pytest.raises(WorktreeError, match="names the requirement"):
        UnitWorkspace(req_id=REQ, unit_id="impl", run_id="run-1", path="   ", branch="b")


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_a_second_attempt_is_recorded_beside_the_first_rather_than_over_it(
    tmp_path: Path,
) -> None:
    """A retry keeps the failed tree; both are in the ledger, on different branches."""
    service, _isolation, _seer = build(tmp_path)

    first = service.provision(REQ, "impl", run_id="run-1")
    second = service.provision(REQ, "impl", run_id="run-2", attempt=2)

    ledger = service.ledger_for(REQ)
    assert [workspace.attempt for workspace in ledger.workspaces] == [1, 2]
    assert first.branch != second.branch
    assert key(first.path) != key(second.path)
    assert ledger.for_unit("impl") == second


# -- the base checkout stays where it was ----------------------------------


@pytest.mark.unit
@verifies(SWR.SWR_3405)
def test_the_base_checkout_moving_under_a_run_is_a_stated_failure(tmp_path: Path) -> None:
    """That no unit run writes into the base checkout is checked, not assumed."""
    service, _isolation, seer = build(tmp_path)

    before = service.fingerprint_base()
    assert before == BaseFingerprint(branch="main", revision="c0ffee1")
    assert service.assert_base_untouched(before) == before

    seer.head_of[key(service.base_workspace)] = "deadbee"
    with pytest.raises(WorktreeError, match="the base checkout moved from"):
        service.assert_base_untouched(before)
