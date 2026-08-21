"""Checkpointing and undoing an applied improvement run (SWR-1641).

An improvement run lets an agent edit the user's workspace. Approval gates *what*
it may do; this module makes *what it did* reversible, by reusing the generic
:class:`~rotaris_core.session.checkpoints.CheckpointEngine` — the same engine
session iteration checkpoints use — under its own ref namespace:

``refs/rotaris/improvements/<artifact_id>/<sequence>``

Keeping the segment distinct from ``refs/rotaris/checkpoints/<session_id>/…`` is
what SWR-1641 means by "can never be pruned by, or confused with, an ordinary
session's iteration checkpoints": ``CheckpointEngine.prune`` and ``delete_all``
only ever walk their own prefix, so neither feature can delete the other's refs.

The shape mirrors :class:`~rotaris_core.session.checkpoint_restore.CheckpointRestorer`
deliberately, so the two rollbacks a user can reach behave identically:

1. :meth:`ImprovementRollbackService.preview` says what would change and whether
   anything of the user's is in the way, without touching the tree.
2. :meth:`ImprovementRollbackService.rollback` takes a safety checkpoint of the
   current state *first*, then restores, then puts the applied proposals back to
   ``pending_review`` so the history does not silently disagree with the files.

Nothing here raises for a refusal: "you have uncommitted work in the way" and
"this workspace is not a Git repository" are things to render, not tracebacks.

One inherited caveat: a restore is a Git checkout, so a repository configured to
convert line endings (``core.autocrlf``, ``text=auto``) applies that conversion
on the way back, exactly as a session checkpoint restore does. In a normal
checkout that is a no-op — the pre-run bytes came out of the same conversion —
and matching the session engine here matters more than the edge case.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.improvement.history import ImprovementHistoryCause
from rotaris_core.improvement.persistence import (
    load_improvement_artifact,
    save_improvement_artifact,
)
from rotaris_core.improvement.proposals import (
    CHECKPOINT_KIND_APPLIED,
    CHECKPOINT_KIND_PRE_IMPROVEMENT,
    CHECKPOINT_KIND_PRE_ROLLBACK,
    ApprovalStatus,
    ImprovementCheckpointRecord,
    ImprovementProposal,
    ImprovementProposalArtifact,
)
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.checkpoints import (
    CHECKPOINT_REF_PREFIX,
    CheckpointEngine,
    CheckpointError,
    CheckpointRef,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.session.checkpoints import CheckpointDiffEntry

__all__ = [
    "DEFAULT_CHECKPOINT_RETENTION",
    "IMPROVEMENT_CHECKPOINT_REF_PREFIX",
    "ImprovementCheckpointEngine",
    "ImprovementCheckpointOutcome",
    "ImprovementRollbackPreview",
    "ImprovementRollbackResult",
    "ImprovementRollbackService",
]

_log = logging.getLogger(__name__)

#: Ref namespace reserved for improvement rollback points. Distinct from
#: :data:`~rotaris_core.session.checkpoints.CHECKPOINT_REF_PREFIX` so session
#: pruning and improvement rollback cannot reach each other's refs.
IMPROVEMENT_CHECKPOINT_REF_PREFIX = "refs/rotaris/improvements"

#: How many recorded improvement checkpoints ``_drift_baseline`` compares the
#: working tree against. Each comparison stages the whole tree.
_DRIFT_BASELINE_LOOKBACK = 5

#: How many checkpoints one artifact keeps. Each pins a full-tree commit that no
#: branch reaches, so ``git gc`` can never reclaim it; without a bound, a much
#: re-run improvement would grow the repository forever. The newest pre-run point
#: is never dropped — it is the thing a rollback restores.
DEFAULT_CHECKPOINT_RETENTION = 10

#: Kinds that describe the workspace *after* an improvement run. Only these are
#: baselines for "what has the user changed since?"; the pre-run point is the
#: rollback target, and measuring drift against it would report the run's own
#: edits as the user's.
_DRIFT_BASELINE_KINDS = frozenset({CHECKPOINT_KIND_APPLIED, CHECKPOINT_KIND_PRE_ROLLBACK})


@traces(SWR.SWR_1641)
class ImprovementCheckpointEngine(CheckpointEngine):
    """A :class:`CheckpointEngine` writing under the improvement ref namespace.

    Only the ref prefix differs. Everything else — the throwaway index, the
    ``.rotaris`` exclusion, the promise never to touch the user's HEAD, index,
    stash or reflog — is inherited unchanged, because an improvement rollback and
    a session rollback must not be two different pieces of Git plumbing.
    """

    @staticmethod
    def _session_prefix(session_id: str) -> str:
        # Validate the id through the base implementation so the rules about
        # ref-unsafe names live in exactly one place, then re-home the result.
        validated = CheckpointEngine._session_prefix(session_id)  # noqa: SLF001
        return IMPROVEMENT_CHECKPOINT_REF_PREFIX + validated[len(CHECKPOINT_REF_PREFIX) :]

    @property
    def work_dir(self) -> Path | None:
        """The Git top level this engine operates on; ``None`` outside a repository.

        Two worktrees of one repository share refs and objects but are different
        trees, and this is what tells them apart.
        """
        return self._resolve_work_dir()

    def delete_ref(self, ref: CheckpointRef) -> None:
        """Drop one improvement checkpoint ref.

        Raises:
            CheckpointError: Git refused.
        """
        self._git("update-ref", "-d", ref.ref, ref.commit)

    def create_or_pin(
        self,
        *,
        session_id: str,
        sequence: int,
        message: str,
    ) -> CheckpointRef | None:
        """Record the working tree, pinning ``HEAD`` when it is already clean.

        ``CheckpointEngine.create`` returns ``None`` for a tree that matches
        ``HEAD`` — for a session that means "nothing new happened", but for an
        improvement run it would mean no rollback point at all in the most
        ordinary case of all: a user with a committed, clean workspace. ``HEAD``
        *is* the pre-run state there, so it gets pinned under this artifact's ref
        instead, which both records it and keeps it reachable.

        Returns ``None`` only when there is genuinely nothing to record: an empty
        repository with no commit and no content.

        Raises:
            CheckpointError: Git is unavailable or refused a plumbing command.
        """
        recorded = self.create(
            session_id=session_id,
            sequence=sequence,
            message=message,
            include_untracked=True,
        )
        if recorded is not None:
            return recorded
        head = self._head_commit()
        if head is None:
            return None
        ref_name = self._ref_name(session_id, sequence)
        self._git("update-ref", ref_name, head)
        return CheckpointRef(ref=ref_name, commit=head, session_id=session_id, sequence=sequence)


@dataclass(frozen=True, slots=True)
class ImprovementCheckpointOutcome:
    """The result of trying to record a checkpoint around an improvement run."""

    #: The artifact as persisted afterwards — carrying ``point`` when one was
    #: taken. ``None`` only when the artifact itself could not be read.
    artifact: ImprovementProposalArtifact | None = None
    #: The recorded checkpoint, or ``None`` when none could be taken.
    point: ImprovementCheckpointRecord | None = None
    #: Empty on success; otherwise why there is no rollback point. A workspace
    #: that is not a Git repository lands here — the improvement run still runs.
    reason: str = ""

    @property
    def recorded(self) -> bool:
        """Whether a rollback point now exists for this artifact."""
        return self.point is not None


@dataclass(frozen=True, slots=True)
class ImprovementRollbackPreview:
    """What rolling back one improvement run would do, computed without touching the tree."""

    artifact_id: str
    #: The pre-run checkpoint a rollback would return to, when there is one.
    checkpoint: ImprovementCheckpointRecord | None = None
    #: Paths that differ, in the engine's checkpoint-relative direction: ``"A"``
    #: means a rollback *removes* the path. Use
    #: :func:`~rotaris_core.session.checkpoint_restore.restore_action` before
    #: showing these to a user.
    entries: tuple[CheckpointDiffEntry, ...] = ()
    #: Work done since the improvement run that this rollback would overwrite.
    dirty_paths: tuple[str, ...] = ()
    #: Empty when a rollback may proceed without ``force``; otherwise a sentence.
    blocked_reason: str = ""


@dataclass(frozen=True, slots=True)
class ImprovementRollbackResult:
    """The outcome of a rollback attempt."""

    artifact_id: str
    restored: bool = False
    #: The ``pre_rollback`` checkpoint recorded before the tree was changed, so
    #: the rollback is itself reversible. ``None`` when the rollback was refused.
    safety_point: ImprovementCheckpointRecord | None = None
    changed_paths: tuple[str, ...] = ()
    #: Proposals put back to ``pending_review`` because their application is gone.
    reverted_proposal_ids: tuple[str, ...] = ()
    #: Empty on success; otherwise why the working tree was left alone.
    blocked_reason: str = ""
    #: Something that went wrong *after* the tree was already restored, and that
    #: the user needs to know about even though the rollback itself succeeded.
    warning: str = ""
    #: The artifact as persisted afterwards.
    artifact: ImprovementProposalArtifact | None = None


@traces(SWR.SWR_1641)
class ImprovementRollbackService:
    """Records rollback points for improvement runs and undoes them.

    Args:
        workspace_root: Where the improvement artifacts live.
        tree_root: The working tree to checkpoint and restore. Defaults to
            ``workspace_root``; pass it explicitly for a session running in an
            isolated worktree.
    """

    def __init__(self, workspace_root: Path, *, tree_root: Path | None = None) -> None:
        self._workspace_root = Path(workspace_root)
        self._engine = ImprovementCheckpointEngine(
            Path(tree_root) if tree_root is not None else self._workspace_root,
        )

    @property
    def available(self) -> bool:
        """Whether rollback points can be taken at all (Git plus a working tree)."""
        return self._engine.available

    @property
    def tree_root(self) -> Path:
        """The working tree a rollback would change."""
        return self._engine.tree_root

    @property
    def engine(self) -> ImprovementCheckpointEngine:
        """The underlying checkpoint engine, for callers that need Git detail."""
        return self._engine

    # -- recording ---------------------------------------------------------

    def capture_run_checkpoint(
        self,
        artifact_id: str,
        *,
        proposal_ids: Sequence[str] | None = None,
    ) -> ImprovementCheckpointOutcome:
        """Record the pre-run state of the workspace and pin it to the artifact.

        An artifact that already has a pre-run point it has not been rolled back
        from keeps it: a run that failed half-way and is retried must still undo
        to the state before the *first* attempt, not to the half-applied tree the
        retry would otherwise checkpoint.

        Never raises for a workspace Git does not manage: the improvement run
        must still be allowed to happen, it simply has no rollback point
        (SWR-1641). The returned ``reason`` says so.
        """
        existing = self._reusable_run_checkpoint(artifact_id)
        if existing is not None:
            return existing
        return self._capture(
            artifact_id,
            kind=CHECKPOINT_KIND_PRE_IMPROVEMENT,
            proposal_ids=proposal_ids,
            summary="before applying approved improvement proposals",
        )

    def _reusable_run_checkpoint(
        self,
        artifact_id: str,
    ) -> ImprovementCheckpointOutcome | None:
        """The pre-run point a retry must keep, or ``None`` to take a fresh one."""
        artifact = self._load(artifact_id)
        if artifact is None:
            return None
        point = artifact.rollback_point
        if point is None:
            return None
        # A rollback consumed the point; the next run gets its own.
        if artifact.rolled_back_at is not None and artifact.rolled_back_at >= point.created_at:
            return None
        if self._resolve(artifact_id, point) is None:
            return None
        return ImprovementCheckpointOutcome(artifact=artifact, point=point)

    def record_applied_state(self, artifact_id: str) -> ImprovementCheckpointOutcome:
        """Record the workspace as the improvement run left it.

        This is the baseline that separates the run's own edits from work the
        user did afterwards. Without it a rollback cannot tell the two apart and
        conservatively treats every changed path as the user's, which is a
        refusal the user has to ``--force`` past.
        """
        return self._capture(
            artifact_id,
            kind=CHECKPOINT_KIND_APPLIED,
            proposal_ids=None,
            summary="after applying approved improvement proposals",
        )

    # -- rollback ----------------------------------------------------------

    def preview(self, artifact_id: str) -> ImprovementRollbackPreview:
        """What rolling ``artifact_id`` back would change. Never raises."""
        artifact = self._load(artifact_id)
        if artifact is None:
            return ImprovementRollbackPreview(
                artifact_id=artifact_id,
                blocked_reason=f"No improvement artifact {artifact_id} exists in this workspace.",
            )
        point = artifact.rollback_point
        if point is None:
            return ImprovementRollbackPreview(
                artifact_id=artifact_id,
                blocked_reason=self._no_point_reason(artifact_id),
            )
        mismatch = self._tree_mismatch_reason(point)
        if mismatch:
            return ImprovementRollbackPreview(
                artifact_id=artifact_id,
                checkpoint=point,
                blocked_reason=mismatch,
            )
        ref = self._resolve(artifact_id, point)
        if ref is None:
            return ImprovementRollbackPreview(
                artifact_id=artifact_id,
                checkpoint=point,
                blocked_reason=self._missing_ref_reason(artifact_id),
            )
        try:
            entries = self._engine.diff_summary(ref)
            dirty = self._dirty_paths(artifact, ref, entries)
        except CheckpointError as exc:
            return ImprovementRollbackPreview(
                artifact_id=artifact_id,
                checkpoint=point,
                blocked_reason=f"Git could not inspect the rollback point: {exc}",
            )
        return ImprovementRollbackPreview(
            artifact_id=artifact_id,
            checkpoint=point,
            entries=entries,
            dirty_paths=dirty,
            blocked_reason=_dirty_reason(dirty),
        )

    def rollback(self, artifact_id: str, *, force: bool = False) -> ImprovementRollbackResult:
        """Return the workspace to the state it had before the improvement run.

        Records a ``pre_rollback`` checkpoint first, so undoing the undo is
        possible, and afterwards puts every proposal the run applied back to
        ``pending_review`` so the artifact history shows the reversal.

        Never raises. A refusal comes back as ``restored=False`` with a populated
        ``blocked_reason`` and an untouched working tree.

        Args:
            artifact_id: The improvement artifact whose run to undo.
            force: Proceed even though work done since the run would be
                overwritten. Only ever bypasses that one check.
        """
        artifact = self._load(artifact_id)
        if artifact is None:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                blocked_reason=f"No improvement artifact {artifact_id} exists in this workspace.",
            )
        point = artifact.rollback_point
        if point is None:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=artifact,
                blocked_reason=self._no_point_reason(artifact_id),
            )
        mismatch = self._tree_mismatch_reason(point)
        if mismatch:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=artifact,
                blocked_reason=mismatch,
            )
        ref = self._resolve(artifact_id, point)
        if ref is None:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=artifact,
                blocked_reason=self._missing_ref_reason(artifact_id),
            )
        try:
            entries = self._engine.diff_summary(ref)
            dirty = self._dirty_paths(artifact, ref, entries)
        except CheckpointError as exc:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=artifact,
                blocked_reason=f"Git could not inspect the rollback point: {exc}",
            )
        if dirty and not force:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=artifact,
                blocked_reason=_dirty_reason(dirty),
            )

        safety = self._capture(
            artifact_id,
            kind=CHECKPOINT_KIND_PRE_ROLLBACK,
            proposal_ids=None,
            summary="before rolling back an applied improvement run",
        )
        if not safety.recorded or safety.artifact is None:
            # An irreversible rollback is exactly what SWR-1641 forbids.
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=safety.artifact or artifact,
                blocked_reason=(
                    f"Could not record a safety checkpoint before the rollback: {safety.reason}"
                ),
            )

        try:
            changed = self._engine.restore(ref)
        except CheckpointError as exc:
            return ImprovementRollbackResult(
                artifact_id=artifact_id,
                artifact=safety.artifact,
                safety_point=safety.point,
                blocked_reason=f"Git could not restore the rollback point: {exc}",
            )

        reverted, updated, warning = self._revert_applied_proposals(safety.artifact, point)
        return ImprovementRollbackResult(
            artifact_id=artifact_id,
            restored=True,
            safety_point=safety.point,
            changed_paths=changed,
            reverted_proposal_ids=reverted,
            warning=warning,
            artifact=updated,
        )

    # -- internals ---------------------------------------------------------

    def _load(self, artifact_id: str) -> ImprovementProposalArtifact | None:
        try:
            return load_improvement_artifact(self._workspace_root, artifact_id)
        except (OSError, ValueError):
            return None

    def _capture(
        self,
        artifact_id: str,
        *,
        kind: str,
        proposal_ids: Sequence[str] | None,
        summary: str,
    ) -> ImprovementCheckpointOutcome:
        artifact = self._load(artifact_id)
        if artifact is None:
            return ImprovementCheckpointOutcome(
                reason=f"No improvement artifact {artifact_id} exists in this workspace.",
            )
        if not self._engine.available:
            return ImprovementCheckpointOutcome(
                artifact=artifact,
                reason=(
                    f"{self._engine.tree_root} is not inside a Git working tree, so no "
                    f"rollback point could be taken for this improvement run."
                ),
            )
        sequence = self._next_sequence(artifact_id, artifact)
        try:
            ref = self._engine.create_or_pin(
                session_id=artifact_id,
                sequence=sequence,
                message=(
                    f"rotaris improvement checkpoint {sequence} for artifact "
                    f"{artifact_id} ({summary})"
                ),
            )
        except CheckpointError as exc:
            return ImprovementCheckpointOutcome(
                artifact=artifact,
                reason=f"Git refused to record a rollback point: {exc}",
            )
        if ref is None:
            return ImprovementCheckpointOutcome(
                artifact=artifact,
                reason=(
                    "The workspace has no committed content and no files to record, "
                    "so no rollback point could be taken."
                ),
            )
        files: tuple[str, ...] = ()
        with suppress(CheckpointError):
            files = self._engine.files_in(ref)
        work_dir = self._engine.work_dir
        record = ImprovementCheckpointRecord(
            sequence=ref.sequence,
            ref=ref.ref,
            commit=ref.commit,
            kind=kind,
            created_at=dt.datetime.now(dt.UTC),
            files=list(files),
            proposal_ids=list(proposal_ids or []),
            tree_root=str(work_dir) if work_dir is not None else None,
        )
        kept = self._prune_checkpoints(artifact.artifact_id, [*artifact.checkpoints, record])
        updated = artifact.model_copy(update={"checkpoints": kept})
        try:
            save_improvement_artifact(
                self._workspace_root,
                updated,
                cause=ImprovementHistoryCause.CHECKPOINT,
            )
        except (OSError, ValueError) as exc:
            # A checkpoint no artifact points at is one nothing can offer, which
            # is the same as not having taken it.
            return ImprovementCheckpointOutcome(
                artifact=artifact,
                reason=f"Could not persist the rollback point on the artifact: {exc}",
            )
        return ImprovementCheckpointOutcome(artifact=updated, point=record)

    def _prune_checkpoints(
        self,
        artifact_id: str,
        records: list[ImprovementCheckpointRecord],
    ) -> list[ImprovementCheckpointRecord]:
        """Drop this artifact's oldest checkpoints, refs included.

        Each checkpoint pins a full-tree commit no branch reaches, so Git can
        never reclaim it on its own; an artifact re-run many times would grow the
        repository without bound. The newest pre-run point is exempt whatever the
        retention says — it is the state a rollback exists to restore.
        """
        ordered = sorted(records, key=lambda entry: entry.sequence)
        if len(ordered) <= DEFAULT_CHECKPOINT_RETENTION:
            return ordered
        newest_run_point = max(
            (entry for entry in ordered if entry.kind == CHECKPOINT_KIND_PRE_IMPROVEMENT),
            key=lambda entry: entry.sequence,
            default=None,
        )
        exempt = newest_run_point.sequence if newest_run_point is not None else None
        surplus = len(ordered) - DEFAULT_CHECKPOINT_RETENTION
        kept: list[ImprovementCheckpointRecord] = []
        for record in ordered:
            if surplus > 0 and record.sequence != exempt:
                surplus -= 1
                ref = self._resolve(artifact_id, record)
                if ref is not None:
                    try:
                        self._engine.delete_ref(ref)
                    except CheckpointError:
                        _log.warning(
                            "Could not drop improvement checkpoint ref %s",
                            record.ref,
                            exc_info=True,
                        )
                continue
            kept.append(record)
        return kept

    def _tree_mismatch_reason(self, point: ImprovementCheckpointRecord) -> str:
        """Why this checkpoint must not be restored here; empty when it may be.

        Git worktrees share one object store and one ref namespace, so a
        checkpoint taken in an isolated worktree resolves perfectly well from the
        main checkout — and restoring it there would write that worktree's
        contents over a tree it never described. Checkpoints written before this
        was recorded carry no tree and are trusted, as they always were.
        """
        if not point.tree_root:
            return ""
        current = self._engine.work_dir
        if current is None or _same_path(point.tree_root, current):
            return ""
        return (
            f"That rollback point was taken in {point.tree_root}, not in {current}. "
            f"Restoring it here would overwrite a working tree it never described."
        )

    def _next_sequence(self, artifact_id: str, artifact: ImprovementProposalArtifact) -> int:
        """One past the highest sequence either the artifact or Git knows about.

        Both are consulted so an artifact whose refs outlived a rewrite cannot
        hand back a number ``update-ref`` would silently overwrite.
        """
        sequences = [entry.sequence for entry in artifact.checkpoints]
        with suppress(CheckpointError):
            sequences.extend(entry.sequence for entry in self._engine.list_refs(artifact_id))
        return max(sequences, default=0) + 1

    def _resolve(
        self,
        artifact_id: str,
        record: ImprovementCheckpointRecord,
    ) -> CheckpointRef | None:
        try:
            return self._engine.resolve(artifact_id, record.sequence)
        except CheckpointError:
            return None

    def _no_point_reason(self, artifact_id: str) -> str:
        if not self._engine.available:
            return (
                f"{self._engine.tree_root} is not inside a Git working tree, so improvement "
                f"{artifact_id} has no rollback point."
            )
        return f"No rollback point was recorded for improvement {artifact_id}."

    def _missing_ref_reason(self, artifact_id: str) -> str:
        if not self._engine.available:
            return (
                f"{self._engine.tree_root} is not inside a Git working tree, so improvement "
                f"{artifact_id} cannot be rolled back."
            )
        return (
            f"Improvement {artifact_id} has a recorded rollback point but its Git snapshot "
            f"is gone, so it can no longer be rolled back."
        )

    def _dirty_paths(
        self,
        artifact: ImprovementProposalArtifact,
        target: CheckpointRef,
        entries: tuple[CheckpointDiffEntry, ...],
    ) -> tuple[str, ...]:
        """Paths this rollback would overwrite that no checkpoint holds a copy of.

        The baseline is a checkpoint of the workspace *after* the run — never
        ``HEAD``, and never the pre-run point. An applied improvement run
        legitimately differs from the pre-run point in every file it touched, so
        using that as the baseline would report the agent's own edits as the
        user's and refuse the ordinary rollback that immediately follows a run.

        With no post-run checkpoint recorded (see :meth:`record_applied_state`)
        there is nothing to measure against, so nothing is reported as at risk:
        the preview still lists every path that would change, and the
        ``pre_rollback`` safety checkpoint still captures whatever is there
        before the tree is touched.

        Raises:
            CheckpointError: Git refused; the caller turns that into a reason.
        """
        touched = {entry.path for entry in entries}
        if not touched:
            return ()
        baseline = self._drift_baseline(artifact, target, entries)
        if baseline is None:
            return ()
        if baseline.commit == target.commit:
            drifted = touched
        else:
            drifted = {entry.path for entry in self._engine.diff_summary(baseline)}
        return tuple(sorted(drifted & touched))

    def _drift_baseline(
        self,
        artifact: ImprovementProposalArtifact,
        target: CheckpointRef,
        known_entries: tuple[CheckpointDiffEntry, ...],
    ) -> CheckpointRef | None:
        """What to measure unrecorded work against; ``None`` when there is none.

        Walks this artifact's post-run checkpoints (see
        :data:`_DRIFT_BASELINE_KINDS`) newest first. A checkpoint the working
        tree matches exactly means the tree *is* a state Rotaris recorded, so
        nothing has drifted — the ordinary case right after a run whose applied
        state was recorded. Otherwise the newest such checkpoint is the baseline.

        Raises:
            CheckpointError: Git refused; the caller turns that into a reason.
        """
        recorded = sorted(
            (entry for entry in artifact.checkpoints if entry.kind in _DRIFT_BASELINE_KINDS),
            key=lambda entry: entry.sequence,
            reverse=True,
        )
        newest: CheckpointRef | None = None
        for record in recorded[:_DRIFT_BASELINE_LOOKBACK]:
            ref = self._resolve(artifact.artifact_id, record)
            if ref is None:
                continue
            # The caller already staged the tree once to diff the target; that is
            # the most expensive Git call here, so reuse it when it applies.
            diff = known_entries if ref.commit == target.commit else self._engine.diff_summary(ref)
            if not diff:
                return None
            if newest is None:
                newest = ref
        return newest

    def _revert_applied_proposals(
        self,
        artifact: ImprovementProposalArtifact,
        point: ImprovementCheckpointRecord,
    ) -> tuple[tuple[str, ...], ImprovementProposalArtifact, str]:
        """Put the proposals the run applied back to ``pending_review``.

        Leaving them ``approved`` after their effect was undone would make the
        history disagree with the files on disk, and would let a second run
        re-apply them without anybody approving them again.

        Runs *after* the tree was already restored, so a failure to persist can
        no longer be turned into a refusal. It comes back as the third element —
        a warning the caller shows — rather than as an exception out of a method
        documented never to raise.
        """
        targets = set(point.proposal_ids)
        reverted: list[str] = []
        proposals: list[ImprovementProposal] = []
        for proposal in artifact.proposals:
            # A checkpoint recorded which proposals the run was about to apply;
            # an older one that did not falls back to "everything still approved".
            in_scope = proposal.id in targets if targets else True
            if in_scope and proposal.status == ApprovalStatus.APPROVED:
                reverted.append(proposal.id)
                proposals.append(
                    proposal.model_copy(update={"status": ApprovalStatus.PENDING_REVIEW}),
                )
            else:
                proposals.append(proposal)
        updated = artifact.model_copy(
            update={
                "proposals": proposals,
                "rolled_back_at": dt.datetime.now(dt.UTC),
            },
        )
        try:
            save_improvement_artifact(
                self._workspace_root,
                updated,
                cause=ImprovementHistoryCause.ROLLBACK,
            )
        except (OSError, ValueError) as exc:
            _log.warning(
                "Rolled back improvement %s but could not persist the reversal",
                artifact.artifact_id,
                exc_info=True,
            )
            return (
                (),
                artifact,
                (
                    f"The workspace was rolled back, but the reversal could not be recorded "
                    f"on improvement {artifact.artifact_id}: {exc}. Its proposals still read "
                    f"as approved even though their changes are gone."
                ),
            )
        return tuple(reverted), updated, ""


def _same_path(left: str | Path, right: str | Path) -> bool:
    """Whether two paths name the same directory, case-insensitively on Windows."""
    try:
        resolved_left = Path(left).resolve()
        resolved_right = Path(right).resolve()
    except OSError:
        return str(left) == str(right)
    return os.path.normcase(str(resolved_left)) == os.path.normcase(str(resolved_right))


def _dirty_reason(dirty_paths: tuple[str, ...]) -> str:
    if not dirty_paths:
        return ""
    shown = ", ".join(dirty_paths[:5])
    more = f" and {len(dirty_paths) - 5} more" if len(dirty_paths) > 5 else ""
    return (
        f"{len(dirty_paths)} change(s) made since the improvement run would be overwritten: "
        f"{shown}{more}. Roll back again with force to overwrite them."
    )
