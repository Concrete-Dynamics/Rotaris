"""A migration reaches the user's branch, or does not reach it at all (SWR-3507, SWR-3508).

The last hop of the epic, over a real git repository and a real ReqToCode store.
Everything before this test was reachable in pieces: a worklist could be planned,
stored, approved and applied, and no shipped code chained those into an act. This
drives the act — the unit host the flow dispatches to — and asks the two questions
the requirements ask.

Marker tokens are assembled rather than written, so this file's own source stays
unscannable by the repository's own coverage sweep.
"""

from __future__ import annotations

import datetime as dt
import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.coverage import coverage_from_sweep
from rotaris_core.reqtocode.layout import RepoLayout
from rotaris_core.reqtocode.verifier import sweep_references
from rotaris_core.requirements.change.migration_store import MigrationPlanStore
from rotaris_core.requirements.change.superseding import (
    MIGRATION_AGENT,
    MigrationInventory,
    MigrationRequest,
    MigrationSite,
    SiteKind,
    approve_migration,
    plan_migration,
)
from rotaris_core.requirements.delivery.projection import RunOutcome
from rotaris_core.requirements.delivery.state import DeliveryActor
from rotaris_core.requirements.execution.run_seam import (
    IsolationRequest,
    RunWorkspace,
    UnitLaunch,
)
from rotaris_core.requirements.execution.snapshot import RunSnapshot
from rotaris_core.requirements.execution.store import UnitStore

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.integration

T = "traces"
V = "verifies"
SYM = "SWR.SWR_"

OLD = "SWR-501"
NEW = "SWR-601"
AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
ADA = DeliveryActor.user("ada")
PERSONA = "migration-analyst"
MODEL = "scripted-1"
LAYOUT = RepoLayout(impl_roots=("src",), test_roots=("tests",))


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


def document(req_id: str, title: str, *, status: str = "approved") -> str:
    return (
        "---\n"
        f"req-id: {req_id}\n"
        f"status: {status}\n"
        "trace: required\n"
        "test: required\n"
        f'title: "{title}"\n'
        "---\n"
        f"\n# {req_id} — {title}\n\nProse the store owns.\n"
    )


def project(root: Path) -> Path:
    """A real checkout: a ReqToCode store, code that claims the old id, and a commit."""
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")

    store = root / "docs" / "requirements" / "500-payment"
    store.mkdir(parents=True)
    (root / "docs" / "requirements" / "500-payment.md").write_text(
        document("SWR-500", "Payment"),
        encoding="utf-8",
    )
    (store / "SWR-501-basket.md").write_text(
        document(OLD, "A basket can be paid for"), encoding="utf-8"
    )
    (store / "SWR-601-checkout.md").write_text(
        document(NEW, "Checkout replaces the basket"), encoding="utf-8"
    )

    (root / "src" / "pkg").mkdir(parents=True)
    (root / "src" / "pkg" / "basket.py").write_text(
        f"from rotaris_core.reqtocode import SWR, {T}\n\n\n@{T}({SYM}501)\ndef pay() -> None: ...\n",
        encoding="utf-8",
    )
    (root / "tests").mkdir(parents=True, exist_ok=True)
    (root / "tests" / "test_basket.py").write_text(
        f"from rotaris_core.reqtocode import SWR, {V}\n\n\n@{V}({SYM}501)\ndef test_pay() -> None: ...\n",
        encoding="utf-8",
    )
    (root / ".reqtocode.json").write_text(
        '{"layout": {"impl_roots": ["src"], "test_roots": ["tests"]}}\n',
        encoding="utf-8",
    )
    git(root, "add", ".")
    git(root, "commit", "-m", "initial")
    return root


def sites_of(root: Path, req_id: str) -> MigrationInventory:
    sweep = sweep_references(root, {}, LAYOUT)
    found = coverage_from_sweep(sweep, int(req_id.removeprefix("SWR-")))
    return MigrationInventory(
        sites=tuple(
            MigrationSite(req_id=req_id, path=site.path, line=site.line, kind=kind)
            for kind, group in (
                (SiteKind.TRACE, found.implementations),
                (SiteKind.TEST, found.tests),
            )
            for site in group
        ),
    )


class RePointing:
    """Every site moves to the replacement."""

    def classify(self, request: MigrationRequest) -> dict[str, dict[str, object]]:
        return {
            site.key: {
                "action": "re-point",
                "target": NEW,
                "reasoning": "the behaviour belongs to the replacement",
            }
            for site in request.inventory.sites
        }


def plan_for(root: Path):  # noqa: ANN201 - a MigrationPlan
    plan = plan_migration(
        MigrationRequest(
            superseding_id=NEW,
            superseded_ids=(OLD,),
            inventory=sites_of(root, OLD),
        ),
        analyst=RePointing(),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )
    assert plan.ready_for_approval, plan.message
    return plan


def approved_for(root: Path):  # noqa: ANN201 - an ApprovedMigration
    return approve_migration(plan_for(root), approver=ADA, at=AT)


def waiting_question(root: Path) -> None:
    """Raise the migration question the propagation pass raises, with its own options."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change.decisions import (
        DecisionOption,
        DecisionTrigger,
        PendingDecision,
    )
    from rotaris_core.requirements.change_host import MIGRATION_APPROVED, MIGRATION_DECLINED

    PendingDecisionStore(root).raise_question(
        PendingDecision.raised(
            NEW,
            DecisionTrigger.RISKY_MIGRATION,
            question=f"{NEW} replaces {OLD}. Carry out the migration now?",
            options=(
                DecisionOption(name=MIGRATION_APPROVED, consequence="the annotations move"),
                DecisionOption(name=MIGRATION_DECLINED, consequence="the worklist waits"),
            ),
            at=AT,
        ),
    )


def swept_coverage(root: Path):  # noqa: ANN201 - a coverage mapping
    """The inventory an approval is re-checked against, read the way a surface reads it."""
    from rotaris_core.requirements.change_host import evidence_of
    from rotaris_core.requirements.delivery.projection import CoverageEvidence
    from rotaris_core.requirements.registry import RequirementRegistry
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(root)
    assert source is not None
    requirements = RequirementRegistry([source]).refresh().requirements
    return evidence_of(requirements, CoverageEvidence.for_repository(root)).coverage


def launch_in(root: Path, tree: Path, branch: str, base: str) -> UnitLaunch:
    return UnitLaunch(
        run_id="run-1",
        req_id=NEW,
        unit_id="migration",
        snapshot=RunSnapshot(
            run_id="run-1",
            req_id=NEW,
            requirement_hash="a" * 16,
            base_commit=base,
            title="Checkout replaces the basket",
            captured_at=AT,
        ),
        isolation=IsolationRequest(branch=branch, session_id="run-1"),
        workspace=RunWorkspace(
            path=str(tree),
            branch=branch,
            base_branch="main",
            base_revision=base,
        ),
        agent=MIGRATION_AGENT,
    )


def worktree(root: Path, branch: str) -> Path:
    tree = root / ".rotaris" / "worktrees" / "migration"
    tree.parent.mkdir(parents=True, exist_ok=True)
    git(root, "worktree", "add", "-b", branch, str(tree), "HEAD")
    return tree


@verifies(SWR.SWR_3507, SWR.SWR_3508, SWR.SWR_3405)
def test_a_migration_rewrites_and_deprecates_in_one_commit_off_the_base(tmp_path: Path) -> None:
    """Productive use: a user approves the migration of a superseded requirement's code.
    Expected outcome: the annotations move to the replacement, the old requirement is marked
    deprecated, both are one commit on the unit's own branch — and the user's checkout has
    not changed at all, because nothing lands before the suite has run there."""
    from rotaris_core.requirements.change.migration_host import MigrationRunHost

    root = project(tmp_path / "project")
    MigrationPlanStore(root).approve(approved_for(root))
    base = git(root, "rev-parse", "HEAD").strip()
    tree = worktree(root, "rotaris/req/swr-601/migration")

    report = MigrationRunHost(root).start(
        launch_in(root, tree, "rotaris/req/swr-601/migration", base)
    )

    assert report.outcome is RunOutcome.SUCCEEDED, report.failure_reason
    assert report.produced_commits, "a migration that committed nothing landed nothing"

    # The annotations moved, in the worktree.
    assert f"{SYM}601" in (tree / "src" / "pkg" / "basket.py").read_text(encoding="utf-8")
    assert f"{SYM}501" not in (tree / "src" / "pkg" / "basket.py").read_text(encoding="utf-8")
    assert f"{SYM}601" in (tree / "tests" / "test_basket.py").read_text(encoding="utf-8")

    # And the superseded requirement is deprecated, in the same commit (SWR-3508).
    replaced = tree / "docs" / "requirements" / "500-payment" / "SWR-501-basket.md"
    assert "status: deprecated" in replaced.read_text(encoding="utf-8")
    assert sorted(report.changed_files) == [
        "docs/requirements/500-payment/SWR-501-basket.md",
        "src/pkg/basket.py",
        "tests/test_basket.py",
    ]
    assert len(report.produced_commits) == 1, "the rewrite and the deprecation are one change"

    # The user's own checkout is exactly where they left it.
    assert git(root, "rev-parse", "HEAD").strip() == base
    assert f"{SYM}501" in (root / "src" / "pkg" / "basket.py").read_text(encoding="utf-8")
    assert "status: approved" in (
        root / "docs" / "requirements" / "500-payment" / "SWR-501-basket.md"
    ).read_text(encoding="utf-8")

    # Nothing in the worktree still claims the retired id.
    after = sweep_references(tree, {}, LAYOUT)
    assert 501 not in after.all_references


@verifies(SWR.SWR_3507)
def test_a_unit_with_no_approved_worklist_fails_rather_than_inventing_one(tmp_path: Path) -> None:
    """Productive use: a migration unit is resumed after its approval was discarded.
    Expected outcome: a stated failure. A host that re-planned here would execute a worklist
    nobody signed."""
    from rotaris_core.requirements.change.migration_host import NOTHING_APPROVED, MigrationRunHost

    root = project(tmp_path / "project")
    base = git(root, "rev-parse", "HEAD").strip()
    tree = worktree(root, "rotaris/req/swr-601/migration")

    report = MigrationRunHost(root).start(
        launch_in(root, tree, "rotaris/req/swr-601/migration", base)
    )

    assert report.outcome is RunOutcome.FAILED
    assert report.failure_reason == NOTHING_APPROVED
    assert f"{SYM}501" in (tree / "src" / "pkg" / "basket.py").read_text(encoding="utf-8")


# --------------------------------------------------------------------------
# the two surfaces that reach the approval at all (SWR-3416, SWR-3512)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3507, SWR.SWR_3416, SWR.SWR_3512)
def test_the_cli_approves_a_waiting_worklist_and_plans_the_unit(tmp_path: Path) -> None:
    """Productive use: a user reads a planned migration worklist, decides to take it, and
    types the one command that accepts it.
    Expected outcome: the worklist is approved in their name, one unit is planned to carry
    it out — and not a single source file has changed, because approving and applying are
    two commands and the second one runs in a worktree."""
    from rotaris_core.requirements.execution.cli_host import migration_offer

    root = project(tmp_path / "project")
    MigrationPlanStore(root).save(plan_for(root))
    before = (root / "src" / "pkg" / "basket.py").read_text(encoding="utf-8")

    answer = migration_offer(root, NEW, actor_name="ada")

    assert answer.code == 0, answer.message
    approved = MigrationPlanStore(root).load_approved(NEW)
    assert approved is not None, "an accepted worklist is the one that was shown"
    assert approved.approval.approver == ADA

    units = UnitStore(root).load(NEW)
    assert [unit.agent for unit in units.units] == [MIGRATION_AGENT]

    # Nothing was applied. The worklist is still only a worklist.
    assert (root / "src" / "pkg" / "basket.py").read_text(encoding="utf-8") == before


@verifies(SWR.SWR_3507, SWR.SWR_3416)
def test_the_cli_refuses_a_worklist_whose_sites_have_moved(tmp_path: Path) -> None:
    """Productive use: a user edits the traced file between reading a worklist and accepting it.
    Expected outcome: a refusal naming what happened. The worklist addresses lines, and
    applying one aimed at lines that have moved is the failure this whole lane exists to
    avoid — so it is refused rather than applied to whatever is there now."""
    from rotaris_core.requirements.execution.cli_host import migration_offer

    root = project(tmp_path / "project")
    MigrationPlanStore(root).save(plan_for(root))
    traced = root / "src" / "pkg" / "basket.py"
    traced.write_text("# a line nobody planned for\n" + traced.read_text(encoding="utf-8"))

    answer = migration_offer(root, NEW, actor_name="ada")

    assert answer.code == 1, answer.message
    assert "moved" in answer.message
    assert MigrationPlanStore(root).load_approved(NEW) is None


@verifies(SWR.SWR_3512, SWR.SWR_3416)
def test_an_unnamed_approver_is_a_sentence_rather_than_a_traceback(tmp_path: Path) -> None:
    """Productive use: a user types the accept command and forgets to say who they are.
    Expected outcome: one sentence naming the flag. SWR-3512 requires a named person and
    enforces it by raising; a CLI that let that reach the terminal would answer a missing
    flag with a stack trace."""
    from rotaris_core.requirements.execution.cli_host import UNNAMED_APPROVER, migration_offer

    root = project(tmp_path / "project")
    MigrationPlanStore(root).save(plan_for(root))

    answer = migration_offer(root, NEW, actor_name="   ")

    assert answer.code == 2
    assert answer.message == f"{NEW}: {UNNAMED_APPROVER}"
    assert MigrationPlanStore(root).load_approved(NEW) is None


@verifies(SWR.SWR_3507, SWR.SWR_3416)
def test_listing_names_what_is_waiting_without_deciding_anything(tmp_path: Path) -> None:
    """Productive use: a user asks whether anything is waiting on them before deciding.
    Expected outcome: the requirement is named, and asking has changed nothing — which is
    what makes "inspectable before any code changes" a thing a user can check."""
    from rotaris_core.requirements.execution.cli_host import pending_migrations

    root = project(tmp_path / "project")
    assert pending_migrations(root) == ()

    MigrationPlanStore(root).save(plan_for(root))

    assert pending_migrations(root) == (NEW,)
    assert MigrationPlanStore(root).load_approved(NEW) is None
    assert pending_migrations(tmp_path / "nowhere") is None


# --------------------------------------------------------------------------
# answering the question actually answers it (SWR-3512)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3512, SWR.SWR_3507)
def test_answering_with_the_engines_own_option_carries_the_migration_out(tmp_path: Path) -> None:
    """Productive use: a user picks "carry out the migration" in the board's blocker panel.
    Expected outcome: the question is closed, the answer is in the decision log, and the unit
    that carries the worklist out exists. Before this, the option was recorded as free text on
    a state transition and the question stayed open — so choosing it did nothing at all."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change_host import MIGRATION_APPROVED, answer_decision

    root = project(tmp_path / "project")
    MigrationPlanStore(root).save(plan_for(root))
    waiting_question(root)

    outcome = answer_decision(
        root,
        NEW,
        MIGRATION_APPROVED,
        coverage=swept_coverage(root),
        current_for=lambda _req_id: None,
        actor=ADA,
        at=AT,
    )

    assert outcome.accepted, outcome.message
    store = PendingDecisionStore(root)
    assert store.open_for(NEW) is None, "an answered question does not come back"
    held = store.read(NEW)
    assert held is not None and held.log is not None
    assert [record.chosen for record in held.log.records] == [MIGRATION_APPROVED]
    assert [unit.agent for unit in UnitStore(root).load(NEW).units] == [MIGRATION_AGENT]


@verifies(SWR.SWR_3512, SWR.SWR_3507)
def test_answering_with_the_other_option_closes_the_question_and_changes_nothing(
    tmp_path: Path,
) -> None:
    """Productive use: a user picks "leave the code as it is".
    Expected outcome: the question is closed with that answer on the record and no unit is
    planned. The two options doing different things is the whole point of offering two."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change_host import MIGRATION_DECLINED, answer_decision

    root = project(tmp_path / "project")
    MigrationPlanStore(root).save(plan_for(root))
    waiting_question(root)

    outcome = answer_decision(
        root,
        NEW,
        MIGRATION_DECLINED,
        coverage=swept_coverage(root),
        current_for=lambda _req_id: None,
        actor=ADA,
        at=AT,
    )

    assert outcome.accepted, outcome.message
    assert PendingDecisionStore(root).open_for(NEW) is None
    assert not UnitStore(root).load(NEW).units
    assert MigrationPlanStore(root).load_approved(NEW) is None
    # The worklist survives the "no": it is offered again on the next read.
    assert MigrationPlanStore(root).load(NEW) is not None


@verifies(SWR.SWR_3512)
def test_an_unnamed_person_cannot_answer_and_the_question_stays_open(tmp_path: Path) -> None:
    """Productive use: an answer arrives with nobody's name on it.
    Expected outcome: a stated refusal, and the question still waiting. SWR-3512 exists so
    these decisions reach a person; an unnamed answer is not a record of one."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change_host import MIGRATION_APPROVED, answer_decision
    from rotaris_core.requirements.delivery.state import DeliveryActor

    root = project(tmp_path / "project")
    MigrationPlanStore(root).save(plan_for(root))
    waiting_question(root)

    outcome = answer_decision(
        root,
        NEW,
        MIGRATION_APPROVED,
        coverage=swept_coverage(root),
        current_for=lambda _req_id: None,
        actor=DeliveryActor.user(""),
        at=AT,
    )

    assert not outcome.accepted
    assert "person" in outcome.message or "audit trail" in outcome.message
    assert PendingDecisionStore(root).open_for(NEW) is not None
