"""Productive use: a repo whose shape changed — a package manager was swapped, a
type checker adopted, a sub-project appeared, a tool dropped — and whose gate no
longer describes it.

Expected outcome: everything the automatic paths were not allowed to do reaches
the user as a reviewable decision, with the resulting `verifier:` block in front
of them rather than a description of it; it is applied by the one writer rather
than interpreted by an agent; and the same unanswered question is not asked again
every single run.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.improvement.proposals import (
    ApprovalStatus,
    ImprovementEvidence,
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
    new_proposal_id,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.drift import (
    describe_gate_evidence,
    gate_evidence,
    is_duplicate_gate_proposal,
    stamp_gate_proposal,
)
from rotaris_core.verifier.runner import CheckResult, VerifierRunResult
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

_SECTION: dict[str, Any] = {
    "checks": [{"name": "pytest", "command": "uv run pytest -q", "role": "test"}],
}


def _proposal(
    *,
    section: dict[str, Any] | None = None,
    category: ImprovementProposalCategory = ImprovementProposalCategory.VERIFIER_GATE_UPDATE,
    status: ApprovalStatus = ApprovalStatus.PENDING_REVIEW,
) -> ImprovementProposal:
    return ImprovementProposal(
        id=new_proposal_id("t"),
        category=category,
        summary="adopt the sub-project's test suite",
        recommended_action="write the block below",
        status=status,
        proposed_verifier_section=_SECTION if section is None else section,
        evidence=[ImprovementEvidence(kind="verifier_gate_state", text="typecheck has no check")],
    )


def _artifact(*proposals: ImprovementProposal) -> ImprovementProposalArtifact:
    return ImprovementProposalArtifact(
        artifact_id="impart_00000001",
        source_session_id="s1",
        proposals=list(proposals),
    )


# -- the proposal has to carry the configuration -----------------------------


@verifies(SWR.SWR_2617)
def test_a_gate_proposal_carries_the_block_approval_would_produce() -> None:
    """The user reviews the resulting configuration, not a description of it.

    A gate change described in prose is a gate change nobody can check before
    approving.
    """
    proposal = _proposal()

    assert proposal.proposed_verifier_section == _SECTION


@verifies(SWR.SWR_2617)
def test_a_gate_proposal_without_the_block_is_rejected_where_it_is_built() -> None:
    """An unusable proposal must never reach a review screen."""
    with pytest.raises(ValueError, match="proposed_verifier_section"):
        _proposal(section={})


@verifies(SWR.SWR_2617)
def test_a_block_that_is_not_a_valid_verifier_section_is_rejected() -> None:
    """What approval applies has to be known to parse before anybody approves it."""
    with pytest.raises(ValueError, match="not a valid verifier"):
        _proposal(section={"checks": [{"name": "broken"}]})


@verifies(SWR.SWR_2617)
def test_every_other_category_is_unaffected() -> None:
    """The rule is per category, exactly like `target_persona` before it."""
    note = ImprovementProposal(
        id=new_proposal_id("t"),
        category=ImprovementProposalCategory.WORKSPACE_NOTE,
        summary="s",
        recommended_action="a",
        evidence=[ImprovementEvidence(kind="k", text="t")],
    )

    assert note.proposed_verifier_section is None


@verifies(SWR.SWR_2617)
def test_a_gate_proposal_is_approval_gated_even_at_low_risk() -> None:
    """Weakening a gate is never automatic, which is what makes the automatic
    paths safe to trust. Pinned rather than assumed."""
    proposal = _proposal()

    assert proposal.risk.value == "low"
    assert proposal.status == ApprovalStatus.PENDING_REVIEW


# -- the evidence ------------------------------------------------------------


def _suite(*checks: ResolvedCheck, detections: list[str] | None = None) -> ResolvedCheckSuite:
    from rotaris_core.verifier.gate_state import GateRecord, ProbeRecord

    return ResolvedCheckSuite(
        checks=list(checks),
        source="detected",
        detections=detections or [],
        gate=GateRecord(
            state="calibrated",
            fingerprint="fp",
            suite_origin="detected",
            probes=tuple(
                ProbeRecord(check=check.name, command=check.command, verdict="verified")
                for check in checks
            ),
        ),
    )


@verifies(SWR.SWR_2617)
def test_the_evidence_names_a_role_the_workspace_has_markers_for_and_no_check() -> None:
    """The one piece of evidence about what the gate *lacks* rather than what it
    has — and the only way a missing role is ever visible."""
    evidence = gate_evidence(
        _suite(
            ResolvedCheck(name="pytest", command="pytest -q", role="test"),
            detections=["pyproject.toml:pytest", "pyproject.toml:mypy"],
        ),
        None,
    )

    assert evidence["roles_without_a_check"] == ["typecheck"]


@verifies(SWR.SWR_2617, SWR.SWR_2616)
def test_the_evidence_carries_invalid_outcomes_and_probe_verdicts() -> None:
    """A check that could not be executed is drift, and drift is what this
    proposal category exists to surface."""
    run = VerifierRunResult(
        executed=True,
        suite_source="detected",
        results=[
            CheckResult(
                name="make:test",
                command="make test",
                status="invalid",
                skip_reason="the target is gone",
            ),
        ],
    )

    evidence = gate_evidence(
        _suite(ResolvedCheck(name="make:test", command="make test", role="test")),
        run,
    )

    assert evidence["invalid"] == ["make:test"]
    assert evidence["probes"][0]["verdict"] == "verified"
    assert evidence["outcomes"][0]["reason"] == "the target is gone"


@verifies(SWR.SWR_2617)
def test_a_gate_with_nothing_to_report_contributes_no_block_at_all() -> None:
    """So a healthy workspace never invites a proposal about its gate."""
    assert describe_gate_evidence({}) == ""
    assert describe_gate_evidence(gate_evidence(None, None)) == ""


@verifies(SWR.SWR_2617)
def test_the_described_evidence_is_what_a_proposal_has_to_cite() -> None:
    described = describe_gate_evidence(
        gate_evidence(
            _suite(
                ResolvedCheck(name="pytest", command="pytest -q", role="test"),
                detections=["pyproject.toml:pytest", "pyproject.toml:mypy"],
            ),
            None,
        ),
    )

    assert "gate state: calibrated" in described
    assert "check pytest [test/blocking]" in described
    assert "no check covering: typecheck" in described


# -- deduplication -----------------------------------------------------------


@verifies(SWR.SWR_2617, SWR.SWR_1640)
def test_an_unchanged_unapproved_gate_proposal_is_not_asked_again() -> None:
    """An unanswered question asked every single run stops being read — which
    costs the user the next question too."""
    evidence = {"state": "stale", "fingerprint": "fp", "invalid": [], "roles_without_a_check": []}
    history = [_artifact(stamp_gate_proposal(_proposal(), evidence))]

    assert is_duplicate_gate_proposal(_proposal(), evidence, history)


@verifies(SWR.SWR_2617, SWR.SWR_1640)
def test_a_proposal_is_asked_again_when_its_evidence_moved() -> None:
    """The same block against a changed workspace is a genuinely different
    question, and the user is entitled to be asked it."""
    before = {"state": "stale", "fingerprint": "fp", "invalid": [], "roles_without_a_check": []}
    after = {
        "state": "stale",
        "fingerprint": "moved",
        "invalid": ["mypy"],
        "roles_without_a_check": [],
    }
    history = [_artifact(stamp_gate_proposal(_proposal(), before))]

    assert is_duplicate_gate_proposal(_proposal(), before, history)
    assert not is_duplicate_gate_proposal(_proposal(), after, history)


@verifies(SWR.SWR_2617, SWR.SWR_1640)
def test_a_rejected_or_approved_proposal_never_suppresses_a_new_one() -> None:
    """A rejection is a decision the user made; re-raising it would be nagging.
    An approval has been applied, so the evidence will have moved anyway. What is
    dropped is only the third case: the same unanswered question."""
    evidence = {"state": "stale", "fingerprint": "fp", "invalid": [], "roles_without_a_check": []}

    for settled in (ApprovalStatus.REJECTED, ApprovalStatus.APPROVED):
        history = [_artifact(stamp_gate_proposal(_proposal(status=settled), evidence))]
        assert not is_duplicate_gate_proposal(_proposal(), evidence, history)


@verifies(SWR.SWR_2617)
def test_deduplication_never_touches_another_category() -> None:
    note = ImprovementProposal(
        id=new_proposal_id("t"),
        category=ImprovementProposalCategory.WORKSPACE_NOTE,
        summary="s",
        recommended_action="a",
        evidence=[ImprovementEvidence(kind="k", text="t")],
    )

    assert not is_duplicate_gate_proposal(note, {}, [_artifact(_proposal())])
    assert stamp_gate_proposal(note, {}) is note


# -- applying it -------------------------------------------------------------


@verifies(SWR.SWR_2617, SWR.SWR_2614)
def test_an_approved_gate_proposal_is_written_not_delegated(tmp_path: Path) -> None:
    """Every other category becomes a task an agent interprets. This one must
    not: SWR-2614 requires one writer, one set of constraints, one audit trail,
    and handing it to an agent would put a second author on the file.
    """
    from rotaris_core.improvement.improver import apply_gate_proposals, build_improver_todo
    from rotaris_core.verifier.gate_writer import read_verifier_section

    approved = _proposal(status=ApprovalStatus.APPROVED)

    applied = apply_gate_proposals(tmp_path, [approved])
    todo = build_improver_todo([approved])

    assert [check.name for check in read_verifier_section(tmp_path) or ()] == ["pytest"]
    assert applied and approved.id in applied[0]
    # Nothing left for an agent to do, so no phase is started at all.
    assert todo.phases == []


@verifies(SWR.SWR_2617, SWR.SWR_2614)
def test_approval_is_the_one_thing_that_may_weaken_a_gate(tmp_path: Path) -> None:
    """The automatic path refuses emptying a suite. A person may still decide to,
    and without this route the refusals would be a wall rather than a routing
    rule — a user could never retire a check."""
    from rotaris_core.config.schema import CheckConfig
    from rotaris_core.improvement.improver import apply_gate_proposals
    from rotaris_core.verifier.gate_writer import read_verifier_section, write_verifier_section

    write_verifier_section(
        tmp_path,
        [CheckConfig(name="pytest", command="pytest -q", role="test")],
        reason="configured",
    )

    apply_gate_proposals(
        tmp_path,
        [_proposal(section={"checks": []}, status=ApprovalStatus.APPROVED)],
    )

    assert read_verifier_section(tmp_path) == ()


@verifies(SWR.SWR_2617)
def test_an_unapproved_gate_proposal_changes_nothing(tmp_path: Path) -> None:
    from rotaris_core.improvement.approval import approved_proposals
    from rotaris_core.improvement.improver import apply_gate_proposals
    from rotaris_core.verifier.gate_writer import read_verifier_section

    artifact = _artifact(_proposal())

    apply_gate_proposals(tmp_path, approved_proposals(artifact))

    assert read_verifier_section(tmp_path) is None
