"""Improvement proposal artifact schema.

Authored by :class:`~rotaris_core.improvement.collector.ImprovementCollector`
after a terminal ``task_run``. Each artifact persists as a single JSON file
under ``<workspace>/.rotaris/improvement_artifacts/<artifact_id>.json`` so
approval state (kept inside each proposal) survives reload across sessions.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import string
import time
import uuid
from enum import StrEnum
from typing import Any

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

from rotaris_core.improvement.types import RunType
from rotaris_core.reqtocode import SWR, traces

_BASE62_ALPHABET = string.digits + string.ascii_lowercase + string.ascii_uppercase


class ImprovementProposalCategory(StrEnum):
    """Bounded set of proposal categories (REQ-20260515-POSTRUN-IMPROVE-005)."""

    DOCUMENTATION_UPDATE = "documentation_update"
    AGENTS_MD_UPDATE = "agents_md_update"
    WORKSPACE_NOTE = "workspace_note"
    CONFIG_CHANGE = "config_change"
    TOOL_ENABLEMENT = "tool_enablement"
    DEPENDENCY_INSTALL = "dependency_install"
    PERSONA_OR_PROMPT_ADJUSTMENT = "persona_or_prompt_adjustment"
    PERSONA_MEMORY_UPDATE = "persona_memory_update"
    PREFLIGHT_CHECK = "preflight_check"
    #: A change to the workspace's quality gate that no automatic path may
    #: make on its own authority (SWR-2617): removing a check, lowering a
    #: severity, adopting a new sub-project's suite. Approval-gated even at
    #: ``risk: low`` — weakening a gate is never automatic, which is exactly
    #: what makes the automatic paths safe to trust.
    VERIFIER_GATE_UPDATE = "verifier_gate_update"


class ApprovalStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DEFERRED = "deferred"


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ImprovementEvidence(BaseModel):
    """Concrete evidence anchoring a proposal to the completed run.

    At least one ``ImprovementEvidence`` must back every emitted proposal
    (REQ-20260515-POSTRUN-IMPROVE-006). Speculative proposals without evidence
    are rejected at write time by :func:`validate_artifact`.
    """

    kind: str = Field(
        description=(
            "Short label classifying the evidence source, e.g. "
            "'transcript_observation', 'repeated_tool_failure', "
            "'missing_resource', 'child_report_finding'."
        ),
    )
    text: str = Field(description="Human-readable summary of the evidence.")
    source_task_id: str | None = None
    source_artifact_id: str | None = None
    source_session_id: str | None = Field(
        default=None,
        description=(
            "Session that produced this observation. Required for newly-authored "
            "cross-run artifacts; older legacy artifacts may omit it."
        ),
    )
    excerpt: str | None = Field(
        default=None,
        description="Optional verbatim transcript or report excerpt.",
    )

    @field_validator("kind", "text")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("evidence fields must not be empty")
        return stripped


class ImprovementProposal(BaseModel):
    """A single evidence-backed improvement proposal."""

    id: str = Field(description="Stable identifier of the form 'imp_<8 base62>'.")
    category: ImprovementProposalCategory
    summary: str = Field(min_length=1)
    evidence: list[ImprovementEvidence] = Field(default_factory=list)
    recommended_action: str = Field(min_length=1)
    risk: RiskLevel = RiskLevel.LOW
    status: ApprovalStatus = ApprovalStatus.PENDING_REVIEW
    target_persona: str | None = Field(
        default=None,
        description=(
            "Required when ``category == persona_memory_update``; identifies the "
            "persona whose workspace memory the proposal targets."
        ),
    )
    proposed_verifier_section: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Required when ``category == verifier_gate_update`` (SWR-2617): the "
            "concrete ``verifier:`` block approval would produce, so the user "
            "reviews the resulting configuration rather than a description of "
            "it. Applied deterministically through the gatekeeper's write path, "
            "never handed to an agent to interpret."
        ),
    )
    created_at: dt.datetime = Field(
        default_factory=lambda: dt.datetime.now(dt.UTC),
    )

    @model_validator(mode="after")
    def _must_have_evidence(self) -> ImprovementProposal:
        if not self.evidence:
            raise ValueError(
                "ImprovementProposal must include at least one evidence entry "
                "(REQ-20260515-POSTRUN-IMPROVE-006).",
            )
        if self.category == ImprovementProposalCategory.PERSONA_MEMORY_UPDATE:
            persona: str | None = self.target_persona
            if not persona or not persona.strip():
                raise ValueError(
                    "persona_memory_update proposals must set 'target_persona'.",
                )
        if self.category == ImprovementProposalCategory.VERIFIER_GATE_UPDATE:
            _validate_gate_section(self.proposed_verifier_section)
        return self


@traces(SWR.SWR_2617)
def _validate_gate_section(section: dict[str, Any] | None) -> None:
    """Refuse a gate proposal that does not carry the configuration it proposes.

    SWR-2617 is explicit that the user reviews the *resulting block*, not a
    description of it — a gate change described in prose is a gate change nobody
    can check before approving. Validating it here means an unusable proposal
    never reaches a review screen, and that the thing approval applies is known
    to parse.
    """
    from rotaris_core.config.schema import VerifierConfig

    if not section:
        raise ValueError(
            "verifier_gate_update proposals must carry 'proposed_verifier_section' — "
            "the concrete verifier: block approval would produce (SWR-2617).",
        )
    try:
        VerifierConfig.model_validate(section)
    except Exception as error:
        raise ValueError(
            f"'proposed_verifier_section' is not a valid verifier: block ({error})",
        ) from error


#: A checkpoint taken of the workspace tree *before* an improvement run applied
#: anything. Restoring it is what "undo this improvement" means.
CHECKPOINT_KIND_PRE_IMPROVEMENT = "pre_improvement"

#: A checkpoint of the workspace tree as the improvement run left it. It is the
#: baseline that separates "what the run changed" from "what the user changed
#: afterwards", so a rollback knows whose work it would destroy.
CHECKPOINT_KIND_APPLIED = "applied"

#: A checkpoint taken immediately before a rollback, so undoing an undo works.
CHECKPOINT_KIND_PRE_ROLLBACK = "pre_rollback"


@traces(SWR.SWR_1641)
class ImprovementCheckpointRecord(BaseModel):
    """A Git checkpoint recorded around an improvement run.

    Persisted on the artifact itself so "what was applied" and "how to undo it"
    survive a restart together. The Git objects live under an improvement-only
    ref namespace (see :mod:`rotaris_core.improvement.rollback`), never under the
    session checkpoint namespace.
    """

    sequence: int = Field(ge=0, description="Position within this artifact's checkpoints.")
    ref: str = Field(description="Full Git ref name pinning the checkpoint commit.")
    commit: str = Field(min_length=1, description="Commit object holding the tree.")
    kind: str = Field(
        default=CHECKPOINT_KIND_PRE_IMPROVEMENT,
        description="One of 'pre_improvement', 'applied', 'pre_rollback'.",
    )
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.UTC))
    files: list[str] = Field(
        default_factory=list,
        description="Paths the checkpoint commit changed, for display only.",
    )
    proposal_ids: list[str] = Field(
        default_factory=list,
        description="Proposals the run this checkpoint guards was about to apply.",
    )
    tree_root: str | None = Field(
        default=None,
        description=(
            "Git top level the checkpoint was taken against. Git worktrees share "
            "one object store and one ref namespace, so a checkpoint of an "
            "isolated worktree resolves perfectly well from the main checkout — "
            "and restoring it there would overwrite a tree it never described. "
            "Recording the tree is what lets a rollback refuse that."
        ),
    )


@traces(SWR.SWR_1604, SWR.SWR_1605)
class ImprovementProposalArtifact(BaseModel):
    """Run-level artifact carrying zero or more proposals."""

    artifact_id: str = Field(description="Stable identifier of the form 'impart_<8 base62>'.")
    source_session_id: str = Field(
        validation_alias=AliasChoices("source_session_id", "session_id"),
        description="Session that produced this workspace-scoped artifact.",
    )
    source_run_type: RunType = RunType.TASK_RUN
    generated_at: dt.datetime = Field(
        default_factory=lambda: dt.datetime.now(dt.UTC),
    )
    collector_model: str | None = Field(
        default=None,
        description="Model identifier of the LLM that authored this artifact.",
    )
    proposals: list[ImprovementProposal] = Field(default_factory=list)
    considered_session_ids: list[str] = Field(
        default_factory=list,
        description=(
            "Prior workspace task-run sessions whose artifacts were included in "
            "the collector context for this artifact."
        ),
    )
    notes: str | None = Field(
        default=None,
        description=(
            "Optional free-form notes from the collector — typically populated "
            "only on fallback (timeout, parse failure) or when the collector "
            "found no actionable signals."
        ),
    )
    checkpoints: list[ImprovementCheckpointRecord] = Field(
        default_factory=list,
        description=(
            "Rollback points recorded around this artifact's improvement run "
            "(SWR-1641). Absent on artifacts written before that requirement."
        ),
    )
    rolled_back_at: dt.datetime | None = Field(
        default=None,
        description="When this artifact's improvement run was last rolled back.",
    )

    @property
    def session_id(self) -> str:
        """Compatibility accessor for older call sites and tests."""
        return self.source_session_id

    @property
    def rollback_point(self) -> ImprovementCheckpointRecord | None:
        """The newest pre-run checkpoint, i.e. the state a rollback returns to."""
        return self.newest_checkpoint(CHECKPOINT_KIND_PRE_IMPROVEMENT)

    def newest_checkpoint(self, kind: str) -> ImprovementCheckpointRecord | None:
        """The highest-sequence checkpoint of ``kind``, or ``None``."""
        matching = [entry for entry in self.checkpoints if entry.kind == kind]
        if not matching:
            return None
        return max(matching, key=lambda entry: entry.sequence)


def _generate_id(prefix: str, seed: str) -> str:
    raw = f"{prefix}-{seed}-{time.monotonic_ns()}-{uuid.uuid4().hex}".encode()
    digest = hashlib.blake2b(raw, digest_size=6).digest()
    n = int.from_bytes(digest, "big")
    chars: list[str] = []
    while n and len(chars) < 8:
        n, rem = divmod(n, 62)
        chars.append(_BASE62_ALPHABET[rem])
    while len(chars) < 8:
        chars.append("0")
    return f"{prefix}_" + "".join(reversed(chars))


def new_proposal_id(seed: str = "") -> str:
    return _generate_id("imp", seed)


def new_artifact_id(seed: str = "") -> str:
    return _generate_id("impart", seed)


def validate_artifact(payload: dict[str, Any] | ImprovementProposalArtifact) -> None:
    """Raise ``ValueError`` if ``payload`` is not a well-formed artifact.

    Used at write time (REQ-20260515-POSTRUN-IMPROVE-T003). Already-typed
    artifacts pass through Pydantic validation; raw payloads are revalidated
    against :class:`ImprovementProposalArtifact`.
    """
    if isinstance(payload, ImprovementProposalArtifact):
        ImprovementProposalArtifact.model_validate(payload.model_dump(mode="json"))
        return

    try:
        ImprovementProposalArtifact.model_validate(payload)
    except Exception as exc:
        raise ValueError(f"malformed improvement artifact: {exc}") from exc
