"""What the automatic paths could not do to the gate, as reviewable evidence.

The gate adapts itself within a deliberately narrow authority (SWR-2614): add a
check, replace a command inside a role at the same severity. Everything outside
that — removing a check, lowering a severity, adopting a sub-project's suite,
replacing a command with one that is not a same-role equivalent — is refused, and
refusing it would be useless if that were the end of it. A repo changes shape
over time, and the changes that matter most are exactly the ones no automatic
path may make.

So they arrive at the post-run improvement loop instead, where they become a
decision a person makes with the resulting configuration in front of them.

This module is the evidence half: it renders what a run learned about its own
gate into the shape the collector reads. It proposes nothing — the collector
authors proposals, the user approves them, and the gatekeeper's write path
applies them (SWR-2617). Three steps, three owners.

**Deduplication is not a prompt instruction.** A model told not to repeat itself
repeats itself, so :func:`is_duplicate_gate_proposal` compares content keys after
the fact: an unapproved, unchanged gate proposal is dropped, and one whose
evidence moved — a new fingerprint, a newly failing role, a check that became
invalid — is emitted again.
"""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

    from rotaris_core.improvement.proposals import ImprovementProposal
    from rotaris_core.verifier.runner import VerifierRunResult
    from rotaris_core.verifier.suite import ResolvedCheckSuite

__all__ = [
    "GATE_EVIDENCE_KIND",
    "describe_gate_evidence",
    "gate_evidence",
    "gate_proposal_key",
    "is_duplicate_gate_proposal",
    "stamp_gate_proposal",
]

#: The ``kind`` a gate proposal's evidence entry carries, so a reader can tell
#: where the observation came from without parsing its prose.
GATE_EVIDENCE_KIND = "verifier_gate_state"

#: Roles a workspace can hold markers for. A marker with no check is drift the
#: user may want to close, and it is invisible without being named.
_ROLES: tuple[str, ...] = ("test", "typecheck", "lint")

#: What a detected marker's trailing token means as a role. Detection reports
#: markers as ``pyproject.toml:mypy`` or ``Makefile:test`` — a *tool* or a
#: *target*, not a role — and asking "does this workspace have a type checker it
#: does not run" needs that translation.
_MARKER_ROLES: dict[str, str] = {
    "pytest": "test",
    "test": "test",
    "vitest": "test",
    "jest": "test",
    "mypy": "typecheck",
    "typecheck": "typecheck",
    "tsc": "typecheck",
    "pyright": "typecheck",
    "ruff": "lint",
    "lint": "lint",
    "eslint": "lint",
    "biome": "lint",
}


@traces(SWR.SWR_2617)
def gate_evidence(
    suite: ResolvedCheckSuite | None,
    run: VerifierRunResult | None,
) -> dict[str, Any]:
    """Everything a gate-update proposal has to be able to cite.

    Deliberately a plain mapping: it travels into a prompt, into an artifact's
    evidence and into a dedupe key, and a model would only have to flatten a
    richer structure anyway.
    """
    checks = list(suite.checks) if suite is not None else []
    gate = suite.gate if suite is not None else None
    results = list(run.results) if run is not None else []
    covered = {check.role for check in checks if check.role != "other"}

    return {
        "state": gate.state if gate is not None else "",
        "fingerprint": gate.fingerprint if gate is not None else "",
        "suite_source": suite.source if suite is not None else "",
        "suite_origin": (gate.suite_origin or "") if gate is not None else "",
        "checks": [
            {
                "name": check.name,
                "command": check.command,
                "role": check.role,
                "severity": check.severity,
                "cwd": check.cwd or "",
            }
            for check in checks
        ],
        "probes": (
            [
                {"check": probe.check, "command": probe.command, "verdict": probe.verdict}
                for probe in gate.probes
            ]
            if gate is not None
            else []
        ),
        "outcomes": [
            {
                "name": result.name,
                "status": result.status,
                "severity": result.severity,
                "reason": result.skip_reason or "",
            }
            for result in results
        ],
        "invalid": [result.name for result in results if result.status == "invalid"],
        # Markers exist for these roles and nothing verifies them. The one piece
        # of evidence that is about what the gate *lacks* rather than what it has.
        "roles_without_a_check": sorted(
            role for role in _ROLES if role not in covered and role in _marker_roles(suite)
        ),
    }


def _marker_roles(suite: ResolvedCheckSuite | None) -> set[str]:
    """The roles this workspace has recognized markers for, whatever runs them."""
    detections: Iterable[str] = list(suite.detections) if suite is not None else []
    found: set[str] = set()
    for marker in detections:
        token = marker.rsplit(":", 1)[-1].strip().casefold()
        role = _MARKER_ROLES.get(token)
        if role is not None:
            found.add(role)
    return found


@traces(SWR.SWR_2617)
def describe_gate_evidence(evidence: dict[str, Any]) -> str:
    """The evidence as the collector's prompt reads it.

    Empty when there is nothing to say, so a workspace whose gate is calibrated,
    complete and green contributes no block at all — and therefore never invites
    a proposal about it.
    """
    if not evidence.get("state"):
        return ""
    lines = [
        f"gate state: {evidence['state']} (suite from {evidence.get('suite_source') or 'nothing'}"
        f", origin {evidence.get('suite_origin') or 'unknown'})",
    ]
    for check in evidence.get("checks", []):
        where = f" in {check['cwd']}" if check.get("cwd") else ""
        lines.append(
            f"  check {check['name']} [{check['role']}/{check['severity']}]"
            f"{where}: {check['command']}",
        )
    for probe in evidence.get("probes", []):
        lines.append(f"  probe {probe['check']}: {probe['verdict']}")
    for outcome in evidence.get("outcomes", []):
        detail = f" — {outcome['reason']}" if outcome.get("reason") else ""
        lines.append(f"  ran {outcome['name']}: {outcome['status']}{detail}")
    if evidence.get("invalid"):
        lines.append(
            "  these checks could not be executed at all and verified nothing: "
            + ", ".join(evidence["invalid"]),
        )
    if evidence.get("roles_without_a_check"):
        lines.append(
            "  this workspace has markers for, but no check covering: "
            + ", ".join(evidence["roles_without_a_check"]),
        )
    return "\n".join(lines)


@traces(SWR.SWR_2617, SWR.SWR_1640)
def gate_proposal_key(
    section: dict[str, Any] | None,
    evidence: dict[str, Any] | None = None,
) -> str:
    """A stable content key for one gate proposal and the evidence behind it.

    Both halves, because either one moving makes the proposal worth showing
    again: a different block is a different suggestion, and the same block
    against a changed workspace is a suggestion the user is being asked a second,
    genuinely different time.
    """
    payload = {
        "section": section or {},
        "state": (evidence or {}).get("state", ""),
        "fingerprint": (evidence or {}).get("fingerprint", ""),
        "invalid": sorted((evidence or {}).get("invalid", [])),
        "missing": sorted((evidence or {}).get("roles_without_a_check", [])),
    }
    blob = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


@traces(SWR.SWR_2617, SWR.SWR_1640)
def stamp_gate_proposal(
    proposal: ImprovementProposal,
    evidence: dict[str, Any],
) -> ImprovementProposal:
    """Record, in the proposal's own citation, which evidence it was made from.

    SWR-2617 requires a gate proposal to cite its evidence like any other, and
    the citation is what later makes deduplication possible: without it, a
    proposal from three runs ago is indistinguishable from the same block
    proposed against a workspace that has since changed shape, and one of those
    deserves to be asked again.

    The key, not the whole snapshot: an evidence entry is read by a person, and a
    serialised gate state is not something a person reads.
    """
    from rotaris_core.improvement.proposals import (
        ImprovementEvidence,
        ImprovementProposalCategory,
    )

    if proposal.category != ImprovementProposalCategory.VERIFIER_GATE_UPDATE:
        return proposal
    key = gate_proposal_key(proposal.proposed_verifier_section, evidence)
    citation = ImprovementEvidence(
        kind=GATE_EVIDENCE_KIND,
        text=(
            f"gate state {evidence.get('state') or 'unknown'} at fingerprint "
            f"{(evidence.get('fingerprint') or 'unknown')[:12]}"
        ),
        excerpt=key,
    )
    kept = [entry for entry in proposal.evidence if entry.kind != GATE_EVIDENCE_KIND]
    return proposal.model_copy(update={"evidence": [*kept, citation]})


def _recorded_key(proposal: ImprovementProposal) -> str:
    """The evidence key a previous gate proposal was stamped with, or ``""``."""
    return next(
        (
            str(entry.excerpt or "")
            for entry in reversed(proposal.evidence)
            if entry.kind == GATE_EVIDENCE_KIND and entry.excerpt
        ),
        "",
    )


@traces(SWR.SWR_2617, SWR.SWR_1640)
def is_duplicate_gate_proposal(
    proposal: ImprovementProposal,
    evidence: dict[str, Any],
    history: Sequence[Any],
) -> bool:
    """Whether *proposal* repeats one the user has already been shown and not acted on.

    The comparison is between *this* proposal's key and the key each earlier one
    was stamped with — not between both against today's evidence, which would
    make every prior proposal look current and never re-raise anything.

    Only *pending* prior proposals count. A rejection is a decision the user made
    and re-raising it would be nagging; an approval has been applied and the
    evidence will have moved. What this drops is the third case: the same
    unanswered question, asked every run, until it stops being read — which costs
    the user the next question too.

    Applied after the collector answers rather than asked of it, because a model
    told not to repeat itself repeats itself.
    """
    from rotaris_core.improvement.proposals import (
        ApprovalStatus,
        ImprovementProposalCategory,
    )

    if proposal.category != ImprovementProposalCategory.VERIFIER_GATE_UPDATE:
        return False
    key = gate_proposal_key(proposal.proposed_verifier_section, evidence)
    return any(
        previous.category == ImprovementProposalCategory.VERIFIER_GATE_UPDATE
        and previous.status == ApprovalStatus.PENDING_REVIEW
        and _recorded_key(previous) == key
        for artifact in history
        for previous in (getattr(artifact, "proposals", []) or [])
    )
