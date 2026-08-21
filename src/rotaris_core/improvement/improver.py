"""Approval-gated :class:`Improver` executor.

The :class:`Improver` is a distinct execution role (REQ-20260515-POSTRUN-IMPROVE-009)
that runs only **approved** improvement proposals. It uses its own system
prompt, its own run classification (``RunType.IMPROVEMENT_RUN``), and operates
strictly on the proposal list passed in — never on the original user task
(REQ-20260515-POSTRUN-IMPROVE-010).

Recursive chaining is prevented at the :class:`~rotaris_core.ralph.loop.RalphLoop`
layer: ``_run_post_run_improvement_pass`` short-circuits when
``run_type != TASK_RUN``, so completing an improvement run never schedules a
second-generation collector or improvement run
(REQ-20260515-POSTRUN-IMPROVE-011).

This module deliberately avoids importing the heavy SDK or RalphLoop machinery
at module scope; callers wire the produced :class:`TodoList` and prompt into
their existing run infrastructure.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from rotaris_core.improvement.approval import approved_proposals
from rotaris_core.improvement.persistence import load_improvement_artifact
from rotaris_core.improvement.proposals import (
    ImprovementProposal,
    ImprovementProposalArtifact,
    ImprovementProposalCategory,
)
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.todo_state import TodoList, TodoPhase, TodoTask

if TYPE_CHECKING:
    from pathlib import Path


IMPROVER_SYSTEM_PROMPT = """You are the Improver.

You execute APPROVED workspace improvement proposals authored by the
Improvement Collector after a previous task run. You do NOT resume, reopen,
or reinterpret the original user task. You do NOT propose new improvements.
You do NOT install dependencies, edit configuration, or modify AGENTS.md
beyond what the approved proposals explicitly direct.

For each approved proposal:

1. Read the proposal's ``summary``, ``recommended_action``, and ``evidence``.
2. Make the smallest possible change that satisfies the proposal.
3. If a proposal cannot be applied safely (ambiguous target, missing context,
   would require unrelated changes), skip it and report why.
4. Never expand scope. Never bundle unrelated cleanups.

When you finish, summarise:

- Which proposals were applied and what files / settings changed.
- Which proposals were skipped and why.

You operate inside an ``improvement_run``. You MUST NOT trigger or request
another improvement run from your own output.
"""


_log = logging.getLogger(__name__)

_IMPROVER_PHASE_NAME = "improvement_run"


def _proposal_to_task(proposal: ImprovementProposal) -> TodoTask:
    """Render an approved proposal as a single executable :class:`TodoTask`."""
    evidence_lines = [f"- [{ev.kind}] {ev.text}" for ev in proposal.evidence]
    body_parts = [
        f"Proposal: {proposal.id} ({proposal.category.value})",
        f"Risk: {proposal.risk.value}",
        f"Summary: {proposal.summary}",
        f"Recommended action: {proposal.recommended_action}",
    ]
    if proposal.target_persona:
        body_parts.append(f"Target persona: {proposal.target_persona}")
    if proposal.category == ImprovementProposalCategory.PERSONA_MEMORY_UPDATE:
        # Direct the Improver at the workspace-local persona memory file
        # (REQ-20260515-POSTRUN-IMPROVE-016/018). Path is workspace-relative
        # so the Improver's standard file tools can edit it.
        persona = proposal.target_persona or "<unknown>"
        body_parts.append(
            f"Persona memory file: .rotaris/persona_memory/{persona}.md "
            f"(append/update; keep within {200} lines).",
        )
    if evidence_lines:
        body_parts.append("Evidence:\n" + "\n".join(evidence_lines))
    description = "\n".join(body_parts)

    name = f"Apply improvement {proposal.id}: {proposal.summary[:60]}"
    task = TodoTask(name=name, description=description)
    task.set_execution_context(description)
    return task


@traces(SWR.SWR_2617, SWR.SWR_2614)
def apply_gate_proposals(
    workspace_root: Path,
    proposals: list[ImprovementProposal],
) -> list[str]:
    """Write every approved gate change, and report what each one did.

    **Applied, not delegated.** Every other category becomes a ``TodoTask`` an
    agent interprets; a gate change must not, because SWR-2614 requires one
    writer with one set of constraints and one audit trail. Handing this to an
    agent would put a second author on the file and lose the guarantee.

    The write is made with the authority rule *disabled* — deliberately, and
    only here: these are precisely the changes that rule refuses, and a person
    has now approved them. That is the whole point of routing them here, and it
    is the only path in the product that passes ``authorize=False``.
    """
    from rotaris_core.config.schema import VerifierConfig
    from rotaris_core.verifier.gate_writer import write_verifier_section

    applied: list[str] = []
    for proposal in proposals:
        if proposal.category != ImprovementProposalCategory.VERIFIER_GATE_UPDATE:
            continue
        section = VerifierConfig.model_validate(proposal.proposed_verifier_section or {})
        outcome = write_verifier_section(
            workspace_root,
            list(section.checks or []),
            reason=f"approved improvement {proposal.id}: {proposal.summary}",
            authorize=False,
        )
        applied.append(f"{proposal.id}: {outcome.describe()}")
    return applied


def build_improver_todo(
    proposals: list[ImprovementProposal],
) -> TodoList:
    """Build a one-phase :class:`TodoList` containing one task per proposal.

    Gate proposals are deliberately absent from it: they are applied
    deterministically by :func:`apply_gate_proposals`, not interpreted by an
    agent. An approved suite that arrived as reviewable configuration must land
    as exactly that configuration.

    Raises ``ValueError`` if ``proposals`` is empty — the Improver must not be
    started without at least one explicitly approved proposal
    (REQ-20260515-POSTRUN-IMPROVE-T005).
    """
    if not proposals:
        raise ValueError(
            "Improver requires at least one approved proposal (REQ-20260515-POSTRUN-IMPROVE-T005).",
        )
    delegated = [
        proposal
        for proposal in proposals
        if proposal.category != ImprovementProposalCategory.VERIFIER_GATE_UPDATE
    ]
    if not delegated:
        # Everything approved was applied deterministically. An empty todo list
        # says "there is nothing for an agent to do", which is a better answer
        # than a run whose one phase holds no tasks.
        return TodoList(phases=[])
    phase = TodoPhase(
        name=_IMPROVER_PHASE_NAME,
        tasks=[_proposal_to_task(p) for p in delegated],
    )
    return TodoList(phases=[phase])


@traces(SWR.SWR_1609, SWR.SWR_1610, SWR.SWR_1641)
def prepare_improvement_run(
    workspace_root: Path,
    artifact_id: str,
    *,
    tree_root: Path | None = None,
    checkpoint: bool = True,
) -> tuple[ImprovementProposalArtifact, list[ImprovementProposal], TodoList]:
    """Load ``artifact_id`` and return (artifact, approved, improver_todo).

    Convenience for the CLI / TUI: callers feed the returned ``TodoList`` into
    a :class:`~rotaris_core.ralph.loop.RalphLoop` constructed with
    ``run_type=RunType.IMPROVEMENT_RUN``.

    Because this is the last thing that happens before an Improver run starts
    editing the workspace, it is also where the run's rollback point is taken
    (SWR-1641). A workspace Git does not manage simply gets no rollback point;
    the run is never refused over it, and the returned artifact says so by
    carrying no ``rollback_point``.

    Args:
        workspace_root: Where the improvement artifacts live.
        artifact_id: The artifact whose approved proposals the run will apply.
        tree_root: The working tree the run will edit, when it is not
            ``workspace_root`` (an isolated worktree, for example).
        checkpoint: Set ``False`` to skip the rollback point entirely — for
            callers that only want the todo list, such as a dry run.

    Raises ``ValueError`` when no proposals are approved.
    """
    artifact = load_improvement_artifact(workspace_root, artifact_id)
    approved = approved_proposals(artifact)
    todo = build_improver_todo(approved)
    # SWR-2617: a gate change is written here, by the one writer, before any
    # agent starts — never handed to the Improver to interpret.
    for line in apply_gate_proposals(workspace_root, approved):
        _log.info("Applied gate proposal — %s", line)
    if checkpoint:
        # Imported here so the module keeps its promise not to drag Git plumbing
        # into callers that only build todo lists.
        from rotaris_core.improvement.rollback import ImprovementRollbackService

        outcome = ImprovementRollbackService(
            workspace_root,
            tree_root=tree_root,
        ).capture_run_checkpoint(artifact_id, proposal_ids=[p.id for p in approved])
        if outcome.artifact is not None:
            artifact = outcome.artifact
    return artifact, approved, todo


@traces(SWR.SWR_1641)
def complete_improvement_run(
    workspace_root: Path,
    artifact_id: str,
    *,
    tree_root: Path | None = None,
) -> ImprovementProposalArtifact:
    """Record the workspace as the finished improvement run left it.

    The symmetric counterpart of :func:`prepare_improvement_run`: call it once
    the Improver's :class:`~rotaris_core.ralph.loop.RalphLoop` has stopped. It is
    what later lets a rollback tell the run's own edits apart from work the user
    did afterwards, so a rollback only warns about the latter.

    Skipping it costs nothing but that distinction — the rollback point taken
    before the run still works.

    Returns the artifact as persisted, whether or not a checkpoint was taken;
    a workspace Git does not manage simply records nothing.
    """
    from rotaris_core.improvement.rollback import ImprovementRollbackService

    outcome = ImprovementRollbackService(
        workspace_root,
        tree_root=tree_root,
    ).record_applied_state(artifact_id)
    if outcome.artifact is not None:
        return outcome.artifact
    return load_improvement_artifact(workspace_root, artifact_id)


# Re-exported here so callers can validate persona-memory targets without
# touching the proposals module directly.
PERSONA_MEMORY_CATEGORY = ImprovementProposalCategory.PERSONA_MEMORY_UPDATE
