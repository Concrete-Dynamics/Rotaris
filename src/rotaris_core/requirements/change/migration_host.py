"""Carrying out an approved migration, in the unit's own worktree (SWR-3507, SWR-3508).

The last hop. Everything before this planned, stored, asked and approved; this is
where an approved worklist becomes changed files — and it is the only place in
the whole epic that writes into a user's own source.

**It is an ordinary execution unit, and that is the design.** The flow provisions
a worktree before it touches any host, retries what fails, verifies what it
produced, records the run and lands the branch through the integrator. A
migration that ran outside all of that would have had to re-derive every one of
them, and would have arrived at the user's branch by a path nothing else uses. So
the unit's ``agent`` names the worklist rather than a prompt
(:data:`~rotaris_core.requirements.change.superseding.MIGRATION_AGENT`), the
composition dispatches on it, and everything else is the pipeline every other
unit takes.

**Two writes, one commit.** The annotation rewrites (SWR-3507) and the
``status: deprecated`` the superseded requirements now carry (SWR-3508) are the
same change: a requirement marked replaced whose code still claims it is exactly
the half-migrated state both requirements exist to prevent. They land together or
not at all, and they reach the base only if the suite passed in the worktree.

**Order is the requirement.** ``SupersedingCompletion`` refuses to deprecate
anything while the execution is incomplete, and an execution is incomplete while
any edit is unapplied. A site the editor would have to guess at therefore stops
the deprecation too, without this module deciding anything.

**Nothing here approves.** The approval is loaded, never made:
:class:`~rotaris_core.requirements.change.superseding.ApprovedMigration` cannot
be built without a named human, and a host that could build one would be the
agent signing its own work.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.change.superseding import MIGRATION_AGENT

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.change.superseding import MigrationExecution
    from rotaris_core.requirements.delivery.projection import CheckOutcome
    from rotaris_core.requirements.execution.run_seam import RunHost, RunReport, UnitLaunch

__all__ = ["MIGRATION_AGENT", "MigrationRunHost", "dispatching_host"]

#: Said when the unit is launched but no approved worklist is on disk for it.
NOTHING_APPROVED = "no approved migration worklist is stored for this requirement"

#: Said when the worklist applied but the deprecation could not be written.
NOT_DEPRECATED = "the annotations were rewritten but the lifecycle was not written"


@traces(SWR.SWR_3507, SWR.SWR_3508, SWR.SWR_3405)
class MigrationRunHost:
    """Applies one approved worklist in the worktree the seam already provisioned."""

    def __init__(
        self,
        workspace: Path,
        *,
        config: RotarisConfig | None = None,
    ) -> None:
        self._workspace = workspace
        self._config = config

    @traces(SWR.SWR_3507, SWR.SWR_3508)
    def start(self, launch: UnitLaunch) -> RunReport:
        """Rewrite the annotations, deprecate what was replaced, and commit both."""
        from rotaris_core.requirements.change.migration_store import MigrationPlanStore
        from rotaris_core.requirements.change.superseding import (
            MigrationExecutor,
        )
        from rotaris_core.requirements.change.trace_editor import SourceTraceEditor
        from rotaris_core.requirements.delivery.projection import RunOutcome as Outcome
        from rotaris_core.requirements.execution.run_seam import RunReport as Report

        tree = Path(launch.workspace.path)
        # The approval is read from the *base* workspace: it is a decision about
        # the project, taken before this tree existed, and a worktree copy of it
        # would be a second answer that could disagree.
        approved = MigrationPlanStore(self._workspace).load_approved(launch.req_id)
        if approved is None:
            return Report(outcome=Outcome.FAILED, failure_reason=NOTHING_APPROVED)

        execution = MigrationExecutor(editor=SourceTraceEditor(tree)).execute(approved)
        if not execution.completed:
            return Report(
                outcome=Outcome.FAILED,
                failure_reason=execution.message,
                agent_summary=execution.message,
            )

        deprecated = self._deprecate(tree, execution)
        if deprecated is not None:
            return Report(outcome=Outcome.FAILED, failure_reason=deprecated)

        commits, changed = self._commit(tree, launch, execution)
        if not commits:
            return Report(
                outcome=Outcome.FAILED,
                failure_reason="the worklist applied but nothing was committed",
            )
        verified, detail, checks = self._verify(tree)
        return Report(
            outcome=Outcome.SUCCEEDED,
            produced_commits=commits,
            changed_files=changed,
            verified=verified,
            verification_detail=detail,
            checks=checks,
            agent_summary=execution.message,
            # Nothing was claimed: a mechanical run reports what it measured and
            # asserts nothing about it (SWR-3408).
            agent_claimed_complete=False,
        )

    # -- the steps -----------------------------------------------------------

    @traces(SWR.SWR_3508)
    def _deprecate(self, tree: Path, execution: MigrationExecution) -> str | None:
        """Write ``status: deprecated`` onto the replaced requirements, in *tree*.

        Rooted at the worktree, so the lifecycle change is part of the same
        branch as the annotation rewrites. A read-only source answers with the
        manual steps SWR-3508 already models, and those are a *result* rather
        than a failure — the migration applied, and a person has to finish it in
        a system Rotaris cannot write to.
        """
        from rotaris_core.requirements.change.superseding import SupersedingCompletion
        from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for
        from rotaris_core.requirements.writeback import RequirementWriteBack

        source = reqtocode_source_for(tree)
        if source is None:
            return f"{NOT_DEPRECATED}: {tree} keeps no requirement store"
        try:
            known = {one.req_id: one for one in source.read().requirements}
            result = SupersedingCompletion(RequirementWriteBack([source])).complete(
                execution,
                requirements=known,
            )
        except Exception as error:  # noqa: BLE001 - a source failure is one sentence
            return f"{NOT_DEPRECATED}: {type(error).__name__}: {error}"
        if result.refusal:
            return f"{NOT_DEPRECATED}: {result.refusal}"
        return None

    def _commit(
        self,
        tree: Path,
        launch: UnitLaunch,
        execution: MigrationExecution,
    ) -> tuple[tuple[str, ...], tuple[str, ...]]:
        """Commit whatever the rewrite and the deprecation changed, as one commit."""
        message = execution.message
        _git(tree, "add", "-A")
        status = _git(tree, "status", "--porcelain")
        if not status.strip():
            return (), ()
        _git(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"{launch.req_id}: {message}",
        )
        base = launch.workspace.base_revision.strip()
        if not base:
            return (), ()
        commits = tuple(reversed(_git(tree, "rev-list", f"{base}..HEAD").split()))
        changed = _git(tree, "diff", "--name-only", base, "HEAD").splitlines()
        return commits, tuple(sorted({line.strip() for line in changed if line.strip()}))

    @traces(SWR.SWR_3410)
    def _verify(self, tree: Path) -> tuple[bool | None, str, tuple[CheckOutcome, ...]]:
        """The workspace's own suite, run in *tree* — the engine's builder, called."""
        from rotaris_core.requirements.execution.cli_host import workspace_checks_for

        suite = workspace_checks_for(self._workspace, config=self._config)(tree)
        if not suite.executed:
            return None, suite.skip_reason, ()
        return suite.passed, f"{len(suite.checks)} check(s) ran", suite.checks


@traces(SWR.SWR_3507, SWR.SWR_3416)
def dispatching_host(default: RunHost, migrations: RunHost) -> RunHost:
    """*default* for every unit, *migrations* for the ones carrying a worklist.

    One flow has one host, so this is where "some units are mechanical" is
    expressed — on the unit's own ``agent``, which is the only per-unit signal
    the seam carries. A composition that wants both passes this; one that wants
    neither passes its own host and behaves exactly as it did.
    """

    class _Dispatching:
        def start(self, launch: UnitLaunch) -> RunReport:
            host = migrations if launch.agent == MIGRATION_AGENT else default
            return host.start(launch)

    return _Dispatching()


def _git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=60,
    )
    return result.stdout if result.returncode == 0 else ""
