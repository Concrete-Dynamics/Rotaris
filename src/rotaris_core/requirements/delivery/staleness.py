"""Evidence rots while the requirement stands still (SWR-3209).

A requirement's text can be untouched for a year and its evidence be worthless:
the implementation was refactored, the covering test was deleted, a trace moved
to another module, the commit that was verified was rebased away. Reacting only
to requirement-hash changes (SWR-3502) would leave every one of those invisible,
which is why *evidence* freshness is tracked separately from *requirement*
freshness and lives here rather than beside the hash comparison.

Everything in this module is a pure function of data. Whether a file changed,
whether a commit is still an ancestor of ``HEAD``, where the annotations are
now — those are repository facts, and they are **inputs**
(:class:`FreshnessInputs`), gathered by a caller that is allowed to touch git and
the filesystem. That is what makes the rules testable without a repository
(SWR-3207's fourth criterion) and what stops a board refresh from becoming a
`git` invocation per requirement.

Every finding carries a machine-readable :class:`StalenessReason`, not a colour:
"stale" alone tells a user nothing they can act on, while
``covering-test-disappeared`` names the thing to go and fix.
"""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.delivery.obligations import EVIDENCE_KINDS, EvidenceKind
from rotaris_core.verifier.requirement_evidence import (  # noqa: TC001 - a Pydantic field type.
    RequirementSite,
)

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

__all__ = [
    "DEFAULT_FRESHNESS_POLICY",
    "FreshnessInputs",
    "FreshnessPolicy",
    "StalenessFinding",
    "StalenessReason",
    "VerifiedEvidence",
    "evaluate_freshness",
    "stale_kinds",
]


@traces(SWR.SWR_3209)
class StalenessReason(StrEnum):
    """Why evidence stopped being current — machine-readable (SWR-3209)."""

    #: A file holding an implementation site changed after the verification.
    IMPLEMENTATION_CHANGED = "implementation-changed"
    #: A file holding a covering test changed after the verification.
    TEST_CHANGED = "test-changed"
    #: An annotation is still there but in a different place — refactored into
    #: another module, or moved within its file.
    TRACE_MOVED = "trace-moved"
    #: An implementation site that existed at verification time is gone.
    TRACE_DISAPPEARED = "trace-disappeared"
    #: A covering test that existed at verification time is gone.
    COVERING_TEST_DISAPPEARED = "covering-test-disappeared"
    #: The verified commit is no longer an ancestor of ``HEAD`` — rebased,
    #: amended or dropped. Stale verification, never a failure (SWR-3209).
    VERIFIED_COMMIT_UNREACHABLE = "verified-commit-unreachable"
    #: The requirement's own content moved on since the verification (SWR-3107).
    SPECIFICATION_MOVED = "specification-moved"
    #: Evidence exists but nothing ever executed it.
    NEVER_RUN = "never-run"
    #: A check reached the covering test but observed nothing about it — the run
    #: was killed, the suite failed as a whole, or it ran part of the file. The
    #: evidence is not current because this pass did not renew it, and it is not
    #: failed because nothing measured it (SWR-2606).
    RESULT_UNKNOWN = "result-unknown"


@traces(SWR.SWR_3209)
class StalenessFinding(BaseModel):
    """One reason one kind of evidence is no longer current.

    Findings accumulate rather than collapse: a refactoring that moves a trace
    *and* edits the module produces two facts, and a user fixing one wants to
    still see the other.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: EvidenceKind
    reason: StalenessReason
    #: What the finding is about: a repository-relative path, a commit, a hash.
    #: Empty only when the reason is about the kind as a whole.
    subject: str = ""
    #: What it was before, when the finding is a move.
    was: str = ""

    @property
    def message(self) -> str:
        """One line a board can show and a log can grep."""
        about = f" {self.subject}" if self.subject else ""
        moved = f" (was {self.was})" if self.was else ""
        return f"{self.kind.label} evidence is stale: {self.reason}{about}{moved}"


@traces(SWR.SWR_3209)
class VerifiedEvidence(BaseModel):
    """What the last successful verification saw — the baseline for freshness.

    Recorded at verification time, never recomputed: comparing today's
    repository with itself proves nothing. The sites are kept with their lines
    so a trace that moved *within* a file is still a move.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: The commit that was verified. Empty when the verification recorded none.
    commit: str = ""
    #: The requirement's ``current_hash`` at verification time (SWR-3107).
    requirement_hash: str = ""
    implementations: tuple[RequirementSite, ...] = ()
    covering_tests: tuple[RequirementSite, ...] = ()


@traces(SWR.SWR_3209)
class FreshnessPolicy(BaseModel):
    """Which freshness rules a workspace runs (SWR-3117's evidence block)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    stale_on_lost_ancestor: bool = True
    stale_on_trace_move: bool = True

    @classmethod
    def read(cls, evidence_config: object) -> FreshnessPolicy:
        """Read ``requirements.evidence`` (SWR-3117) structurally."""
        ancestor = getattr(evidence_config, "stale_on_lost_ancestor", None)
        move = getattr(evidence_config, "stale_on_trace_move", None)
        return cls(
            stale_on_lost_ancestor=ancestor if isinstance(ancestor, bool) else True,
            stale_on_trace_move=move if isinstance(move, bool) else True,
        )


#: The policy of a workspace that configured nothing: every rule on.
DEFAULT_FRESHNESS_POLICY = FreshnessPolicy()


@traces(SWR.SWR_3209)
class FreshnessInputs(BaseModel):
    """The repository facts the freshness rules read, as data.

    Gathered by a caller with filesystem and git access; nothing in this module
    reaches for either. ``verified`` being ``None`` means no verification has
    happened yet, and that is *not* staleness — a requirement nobody ever
    verified has evidence that was never fresh to begin with, which the evidence
    projection reports as missing (SWR-3207).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    req_id: str = ""
    #: The requirement's ``current_hash`` now (SWR-3107).
    requirement_hash: str = ""
    #: Implementation sites and covering tests as they are **today**.
    implementations: tuple[RequirementSite, ...] = ()
    covering_tests: tuple[RequirementSite, ...] = ()
    #: The baseline. ``None`` ⇒ never verified.
    verified: VerifiedEvidence | None = None
    #: Repository-relative paths that changed since the verified commit.
    changed_paths: frozenset[str] = frozenset()
    #: Whether the verified commit is still an ancestor of ``HEAD``. ``None``
    #: when nobody asked git — an unknown answer must not read as a lost commit.
    verified_commit_is_ancestor: bool | None = None


def _by_path(sites: Iterable[RequirementSite]) -> dict[str, list[int]]:
    index: dict[str, list[int]] = {}
    for site in sites:
        index.setdefault(site.path, []).append(site.line)
    return index


def _moves(
    kind: EvidenceKind,
    before: Sequence[RequirementSite],
    after: Sequence[RequirementSite],
    *,
    gone_reason: StalenessReason,
) -> list[StalenessFinding]:
    """Sites that disappeared or moved between *before* and *after*."""
    current = _by_path(after)
    findings: list[StalenessFinding] = []
    for path, lines in sorted(_by_path(before).items()):
        now = current.get(path)
        if now is None:
            findings.append(
                StalenessFinding(kind=kind, reason=gone_reason, subject=path),
            )
            continue
        for line in sorted(lines):
            if line not in now:
                findings.append(
                    StalenessFinding(
                        kind=kind,
                        reason=StalenessReason.TRACE_MOVED,
                        subject=path,
                        was=f"{path}:{line}",
                    ),
                )
    return findings


def _changed(
    kind: EvidenceKind,
    sites: Sequence[RequirementSite],
    changed_paths: frozenset[str],
    reason: StalenessReason,
) -> list[StalenessFinding]:
    """Sites whose file was edited since the verification and still exists."""
    return [
        StalenessFinding(kind=kind, reason=reason, subject=path)
        for path in sorted({site.path for site in sites} & changed_paths)
    ]


@traces(SWR.SWR_3209)
def evaluate_freshness(
    inputs: FreshnessInputs,
    *,
    policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
) -> tuple[StalenessFinding, ...]:
    """Every reason *inputs* say this requirement's evidence is no longer current.

    Empty for an unchanged repository, and empty for a requirement that was
    never verified — there is no baseline to have drifted from. Findings are
    ordered by kind and then by reason, so two runs over the same facts produce
    the same tuple and a diff of them means something.

    A file that *disappeared* is reported once, as a disappearance; the same file
    is not also reported as changed, because "the trace is gone" and "the trace's
    file was edited" are two different repairs and only the first one applies.
    """
    verified = inputs.verified
    if verified is None:
        return ()

    findings: list[StalenessFinding] = []
    if policy.stale_on_trace_move:
        findings += _moves(
            EvidenceKind.IMPLEMENTATION,
            verified.implementations,
            inputs.implementations,
            gone_reason=StalenessReason.TRACE_DISAPPEARED,
        )
        findings += _moves(
            EvidenceKind.TEST,
            verified.covering_tests,
            inputs.covering_tests,
            gone_reason=StalenessReason.COVERING_TEST_DISAPPEARED,
        )

    findings += _changed(
        EvidenceKind.IMPLEMENTATION,
        inputs.implementations,
        inputs.changed_paths,
        StalenessReason.IMPLEMENTATION_CHANGED,
    )
    findings += _changed(
        EvidenceKind.TEST,
        inputs.covering_tests,
        inputs.changed_paths,
        StalenessReason.TEST_CHANGED,
    )

    if policy.stale_on_lost_ancestor and inputs.verified_commit_is_ancestor is False:
        findings.append(
            StalenessFinding(
                kind=EvidenceKind.VERIFICATION,
                reason=StalenessReason.VERIFIED_COMMIT_UNREACHABLE,
                subject=verified.commit,
            ),
        )
    if (
        verified.requirement_hash
        and inputs.requirement_hash
        and verified.requirement_hash != inputs.requirement_hash
    ):
        findings.append(
            StalenessFinding(
                kind=EvidenceKind.VERIFICATION,
                reason=StalenessReason.SPECIFICATION_MOVED,
                subject=inputs.requirement_hash,
                was=verified.requirement_hash,
            ),
        )

    findings.sort(
        key=lambda finding: (
            EVIDENCE_KINDS.index(finding.kind),
            finding.reason,
            finding.subject,
        ),
    )
    return tuple(findings)


def stale_kinds(findings: Iterable[StalenessFinding]) -> frozenset[EvidenceKind]:
    """Which kinds of evidence *findings* touch — the projection's index into them."""
    return frozenset(finding.kind for finding in findings)
