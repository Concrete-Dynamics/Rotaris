"""Child report artifact schema (FR-1 mandatory)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.verifier.evidence import (
    VerifierEvidence,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.gate import (
    CompletionGateDecision,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.repair import (
    RepairDecision,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.requirement_evidence import (
    RequirementEvidence,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.scope_drift import (
    ScopeDriftEvidence,  # noqa: TC001 - Pydantic resolves this at runtime.
)


class EditedFile(BaseModel):
    path: str
    change_type: str  # "modified" | "deleted" | "renamed"
    commit_sha: str | None = None


class CreatedFile(BaseModel):
    path: str
    commit_sha: str | None = None


class Artifact(BaseModel):
    type: str
    path: str | None = None
    description: str


class CommandResult(BaseModel):
    command: str
    exit_code: int | None = None
    summary: str


class TestResult(BaseModel):
    name: str
    status: str  # "passed" | "failed" | "skipped" | "not_run"
    summary: str


class ErrorInfo(BaseModel):
    type: str
    message: str


class HighlightPath(BaseModel):
    path: str
    reason: str | None = None


class SnippetExcerpt(BaseModel):
    path: str | None = None
    content: str
    reason: str | None = None


class ChildDetailPayload(BaseModel):
    highlight_paths: list[HighlightPath] = Field(default_factory=list)
    snippets: list[SnippetExcerpt] = Field(default_factory=list)


@traces(SWR.SWR_215)
class EscalationSignal(BaseModel):
    session_id: str
    consecutive_activation_count: int
    reason: str


@traces(SWR.SWR_130, SWR.SWR_2132, SWR.SWR_2603, SWR.SWR_2604, SWR.SWR_2605)
@traces(SWR.SWR_2606, SWR.SWR_2607)
class ChildReportArtifact(BaseModel):
    """Ephemeral terminal result made available to a child task's parent."""

    agent_name: str
    persona: str
    status: str  # "succeeded" | "failed" | "cancelled" | "blocked"
    summary: str
    key_findings: str | None = None
    last_response: str | None = None
    final_response: str | None = None
    detail_payload: ChildDetailPayload | None = None
    edited_files: list[EditedFile] = Field(default_factory=list)
    created_files: list[CreatedFile] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    commands: list[CommandResult] = Field(default_factory=list)
    tests: list[TestResult] = Field(default_factory=list)
    errors: list[ErrorInfo] = Field(default_factory=list)
    next_recommended_actions: list[str] = Field(default_factory=list)
    escalation: EscalationSignal | None = None
    verifier_results: VerifierEvidence | None = Field(
        default=None,
        description=(
            "Deterministic check-suite evidence (SWR-2603), written by the verifier "
            "runner alone. Unlike `tests` and `errors`, which are LLM summarizations "
            "of the transcript, this field is never authored by the SummaryAgent — it "
            "is what the completion gate reads. `None` means no verifier pass was "
            "attached to this report; that is not the same as 'checks passed'."
        ),
    )
    completion_gate: CompletionGateDecision | None = Field(
        default=None,
        description=(
            "What the deterministic completion gate (SWR-2604) concluded from "
            "`verifier_results`, and why. Written by the loop alone, never by the "
            "SummaryAgent. A `gated` decision is the reason a report says `partial` "
            "even though the agent — and the LLM completion classifier — considered "
            "the work done. `None` means the gate did not run for this report."
        ),
    )
    repair: RepairDecision | None = Field(
        default=None,
        description=(
            "How the bounded repair budget (SWR-2605) was spent on a gated "
            "iteration: which attempt this was, how many the workspace allows, "
            "and whether the loop re-queued the task or escalated. Written by "
            "the loop alone, never by the SummaryAgent. An `escalate` action is "
            "the reason a report says `failed` with the checks named rather than "
            "being retried again. `None` means no repair budget was charged — "
            "the iteration was not gated, or gating is off."
        ),
    )
    gate_state: str | None = Field(
        default=None,
        description=(
            "The quality gate's lifecycle state when this iteration ran "
            "(SWR-2612/SWR-2615): 'absent', 'pending', 'calibrated' or 'stale'. "
            "Written by the loop alone, never by the SummaryAgent. `pending` is "
            "the one that matters to a reader: this workspace carries code and "
            "has no gate, so `verifier_results: skipped` means *nothing was "
            "verified* rather than 'there was nothing to verify'. `None` means "
            "the state was not computed for this report."
        ),
    )
    requirement_evidence: RequirementEvidence | None = Field(
        default=None,
        description=(
            "Which requirements this iteration's changed files implement, what "
            "tests are declared to cover them, and whether those tests actually "
            "ran in this iteration's check suite (SWR-2606). Written by the loop "
            "alone, never by the SummaryAgent. Reports; does not gate. `None` "
            "means 'not computed' — the workspace has no requirement store, the "
            "index was unreadable, or the iteration changed nothing. An instance "
            "whose `requirements` list is empty is the different, computed fact "
            "that the change touched no traced production code."
        ),
    )
    scope_drift: ScopeDriftEvidence | None = Field(
        default=None,
        description=(
            "Production files this iteration changed that trace to no "
            "requirement (SWR-2607), named rather than counted. Reuses "
            "ReqToCode's orphan-code rule; a file the orphan baseline excuses is "
            "still listed here, flagged as baselined, because the baseline "
            "forgives pre-existing debt and not this iteration's edit. Written "
            "by the loop alone, never by the SummaryAgent. `None` means 'not "
            "computed'; an instance with `files == []` means 'computed, nothing "
            "drifted'."
        ),
    )
    tags: list[str] = Field(
        default_factory=list,
        description=(
            "Tags from the closed vocabulary: research, planning, implementation, "
            "review, verification, errors. Used by SessionArtifactStore to enable "
            "phase-based artifact_list queries."
        ),
    )


def extract_final_response(transcript_events: list[dict[str, Any]]) -> str | None:
    """Return terminal assistant text only when no later tool activity follows it."""
    saw_tool_after_response = False

    for event in reversed(transcript_events):
        role = str(event.get("role", "")).lower()
        if role == "tool":
            saw_tool_after_response = True
            continue
        if role not in {"assistant", "agent"}:
            continue

        content = str(event.get("content", "")).strip()
        if content:
            return None if saw_tool_after_response else content

    return None


def extract_last_response(transcript_events: list[dict[str, Any]]) -> str | None:
    """Return the last non-empty assistant/agent response from a transcript."""
    for event in reversed(transcript_events):
        role = str(event.get("role", ""))
        if role not in {"assistant", "agent"}:
            continue

        content = str(event.get("content", "")).strip()
        if content:
            return content

    return None
