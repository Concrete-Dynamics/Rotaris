"""The headless consumer of the run seam, and the composition behind it (SWR-3416).

SWR-3416 says the desktop coordinator "becomes one consumer of that seam; the
headless CLI and the tests are others".  The seam and the desktop consumer both
shipped; this module is the missing third one, and it is deliberately *thin*:

* :class:`CliRunHost` answers the seam's one question — "run this unit and
  report what happened" — through :func:`rotaris_core.run_host.execute_run`, the
  same entry point the desktop's ``AgentRunHost`` and the headless ``run``
  command already use.  Nothing about the agent, the loop, the hooks or the
  event stream is rebuilt here.
* :func:`run_requirement` is the composition root a CLI command needs: the
  guarded write path, the requirement lookup, the worktree provider, the run
  seam and the flow, assembled exactly once so both CLI surfaces (argparse and
  Typer) drive the *same* object rather than two that happen to agree.

Two properties are the point rather than an implementation detail:

**Claimed and measured never merge (SWR-3408).**  What the agent says lands in
the ``agent_*`` fields of the report and nowhere else; ``produced_commits``,
``changed_files``, ``verified`` and ``checks`` come from Git and from the
workspace's own check suite.  A model that answers with a JSON object trying to
set ``verified`` has that key *stripped and named* — see :func:`read_claim` —
and the run is still measured the way every other run is.

**No Qt, and no desktop package.**  Every runtime import in this module that is
not stdlib lives inside a function body, so importing it costs nothing and pulls
in neither the SDK nor a display.  ``rotaris_core.requirements.execution`` is an
eager barrel; submodules are therefore imported directly, never through it.
"""

from __future__ import annotations

import contextlib
import datetime as dt
import json
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.requirements.pass_progress import PassPhase

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.delivery.projection import CheckOutcome, RunOutcome
    from rotaris_core.requirements.execution.contract import ClaimIntake
    from rotaris_core.requirements.execution.decomposition import (
        Decomposer,
        RequirementAssessment,
    )
    from rotaris_core.requirements.execution.flow import FlowResult, StageEvent
    from rotaris_core.requirements.execution.integration import (
        IntegrationOutcome,
        UnitBranch,
    )
    from rotaris_core.requirements.execution.run_seam import (
        RunEvent,
        RunHost,
        RunReport,
        RunResult,
        UnitLaunch,
    )
    from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
    from rotaris_core.requirements.execution.target import TargetBranch
    from rotaris_core.requirements.execution.units import RequirementUnits
    from rotaris_core.requirements.execution.verification import SuiteRun, WorkspaceChecks
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.registry import RequirementRegistry
    from rotaris_core.run_result import RunResult as AgentRunResult

__all__ = [
    "INTEGRATION_CHANGE_REASON",
    "NOTHING_COMMITTED",
    "NOT_A_CHECKOUT",
    "NO_CHECK_SUITE",
    "NO_MIGRATION_WORKLIST",
    "NO_REQUIREMENT_STORE",
    "RUN_CHANGE_REASON",
    "UNNAMED_APPROVER",
    "CliRunHost",
    "DeniedTools",
    "HeadlessReport",
    "HeadlessRun",
    "decomposition_for",
    "evaluation_report",
    "integration_for",
    "migration_offer",
    "pending_migrations",
    "read_claim",
    "read_denied_tools",
    "requirement_rows",
    "run_requirement",
    "tools_confiscated",
    "verification_report",
    "workspace_checks_for",
]

_log = logging.getLogger(__name__)

#: What ``requirements migrate`` says when the requirement exists and no worklist
#: is waiting on it. Distinct from "no such requirement": one is a typo, the
#: other is "there is nothing here to decide yet", and a user repairs them
#: differently.
NO_MIGRATION_WORKLIST = "no migration worklist is waiting for a decision"

#: What ``requirements migrate`` says when nobody named themselves. SWR-3512's
#: whole subject is that this decision reaches a person, and ``require_human``
#: enforces it by raising — so the surface refuses first, with the flag to pass.
UNNAMED_APPROVER = (
    "approving a migration records who took the decision; pass --actor NAME (SWR-3512)"
)

#: Why a run that committed nothing has ``verified=None`` rather than ``False``.
#: "Nothing verified this run" and "verification failed" are different facts, and
#: the completion gate treats them differently (SWR-3410).
NOTHING_COMMITTED = "the run committed nothing, so nothing could be verified"

#: Why a workspace with no configured checks verifies nothing.
NO_CHECK_SUITE = "this workspace configures no check suite; nothing verified the run"

#: A workspace that keeps its requirements somewhere Rotaris cannot read is not
#: a broken project — it is a command with nothing to act on.
NO_REQUIREMENT_STORE = (
    "this workspace has no ReqToCode requirement store, so there is no requirement to run"
)

#: A requirement run is cut from a commit (SWR-3402); a directory git does not
#: answer for has nothing to branch a worktree from.
#:
#: This used to read "is not a Git checkout **with a commit**", and covered the
#: commit-less checkout too — a project on its first day, told it was not a
#: checkout at all and given no remedy. That situation is now its own refusal,
#: :func:`~rotaris_core.requirements.execution.target.no_commit_refusal`, in the
#: same words the desktop uses. What is left here is the case it always meant:
#: a path that is no repository.
NOT_A_CHECKOUT = "is not a Git checkout, so a run has no base to start from"


def _git(tree: Path, *args: str) -> str:
    """One read-only git command in *tree*. ``""`` when git refuses.

    Never raises and never writes: reporting what a run produced must not turn a
    repository that cannot answer into an exception in the middle of a delivery
    transition.
    """
    import subprocess

    try:
        result = subprocess.run(
            ["git", *args],
            cwd=tree,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout if result.returncode == 0 else ""


def _payload(summary: str) -> dict[str, object] | None:
    """*summary* read as a JSON object, or ``None`` when it is prose.

    A structured answer is the case worth handling carefully: it is the one in
    which a model can *name* fields, and therefore the only one in which it can
    try to name a measured one.  Anything else is prose and is treated as prose.
    """
    text = summary.strip()
    if not text.startswith("{"):
        return None
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    return {str(key): value for key, value in parsed.items()}


@traces(SWR.SWR_3408)
def read_claim(result: AgentRunResult) -> ClaimIntake:
    """Read the agent's answer as *claims*, dropping what only Rotaris may set.

    The whole of SWR-3408 at this seam.  A structured answer goes through
    :func:`~rotaris_core.requirements.execution.contract.parse_agent_claim`, so a
    payload carrying ``verified``, ``produced_commits`` or ``checks_passed`` has
    those keys stripped and named rather than absorbed.  Prose becomes a summary
    plus the one claim a finished run without an error implies — that the agent
    considers itself done, which is necessary and never sufficient.
    """
    from rotaris_core.requirements.execution.contract import (
        AgentClaim,
        ClaimIntake,
        parse_agent_claim,
    )

    payload = _payload(result.summary)
    if payload is not None:
        return parse_agent_claim(payload)
    return ClaimIntake(
        claim=AgentClaim(
            summary=result.summary,
            claimed_complete=bool(result.summary) and not result.error,
        ),
    )


@traces(SWR.SWR_3408)
@dataclass(frozen=True, slots=True)
class DeniedTools:
    """Tool calls the permission policy refused during one unit run.

    A *measured* fact in the SWR-3408 sense: it comes from the session's own
    permission trail, not from anything the model said. An agent that was
    refused its planning and delegation tools cannot say so — it has no way to
    know a refusal is unusual — so it summarises the nothing it did as a
    finished job. This is how the runner finds out instead.
    """

    #: How many calls were denied.
    count: int = 0
    #: Which tools, deduplicated, in first-seen order.
    tools: tuple[str, ...] = ()
    #: True when at least one denial came from the headless policy rather than
    #: from a rule or a user. That is the case worth separating: a rule that
    #: denies is the workspace working as configured, while a headless denial
    #: means the run was asked a question no one could answer.
    unattended: bool = False

    @property
    def blocked(self) -> bool:
        """Whether anything was denied at all."""
        return self.count > 0

    @property
    def sentence(self) -> str:
        """One line naming what was refused, for a run report's failure reason."""
        if not self.blocked:
            return ""
        named = ", ".join(self.tools) if self.tools else "tool call"
        calls = "call" if self.count == 1 else "calls"
        why = (
            "no approval UI is available in a requirement run, so the permission mode denied them"
            if self.unattended
            else "the workspace's permission rules denied them"
        )
        return f"the agent committed nothing after {self.count} {named} {calls} were denied: {why}"


@traces(SWR.SWR_3408)
def tools_confiscated(
    outcome: RunOutcome,
    commits: Sequence[str],
    denied: DeniedTools,
) -> tuple[RunOutcome, str]:
    """Downgrade a "success" that only succeeded because it did nothing.

    The two conditions are deliberately joined. A run that was denied a tool and
    committed anyway made progress in spite of the refusal, and calling that a
    failure would throw the work away; a run that committed nothing and was
    never denied anything has its own honest report — ``NOTHING_COMMITTED``
    through :attr:`RunReport.verified` — which says something different and
    truer than this. Only the intersection is the silent failure: the agent was
    refused the tools it needed and therefore has nothing to show.

    Returns the outcome and the sentence explaining it, empty when nothing
    changed, so the caller writes one failure reason rather than composing two.
    """
    from rotaris_core.requirements.delivery.projection import RunOutcome as Outcome

    if outcome is not Outcome.SUCCEEDED or commits or not denied.blocked:
        return outcome, ""
    return Outcome.FAILED, denied.sentence


@traces(SWR.SWR_3408)
def read_denied_tools(workspace: Path, session_id: str) -> DeniedTools:
    """What *session_id*'s permission trail says was refused.

    Best-effort by design: a run whose evidence file is missing or half-written
    answers "nothing was denied", because turning an unreadable trail into a
    reported failure would fail runs for the wrong reason. The trail is the
    same ``evidence/permissions.jsonl`` the session summary already cites, read
    here rather than re-derived, so the run report and the session summary
    cannot disagree about what happened.
    """
    if not session_id:
        return DeniedTools()
    from rotaris_core.session.manager import SessionManager

    try:
        trail = SessionManager(workspace).session_dir(session_id) / "evidence" / "permissions.jsonl"
        lines = trail.read_text(encoding="utf-8", errors="replace").splitlines()
    except (OSError, ValueError):
        return DeniedTools()

    count = 0
    unattended = False
    tools: list[str] = []
    for line in lines:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if not isinstance(entry, dict) or entry.get("decision") != "deny":
            continue
        count += 1
        if str(entry.get("source", "")) == "headless-policy":
            unattended = True
        name = str(entry.get("tool_name", "")).strip()
        if name and name not in tools:
            tools.append(name)
    return DeniedTools(count=count, tools=tuple(tools), unattended=unattended)


@traces(SWR.SWR_3416, SWR.SWR_3408, SWR.SWR_3612)
class CliRunHost:
    """The engine's run host for a headless run — ``execute_run``, and a report.

    The core twin of the desktop's ``AgentRunHost``: the same entry point, the
    same two-column report, and no Qt anywhere in the import graph.  A run is
    pointed at the worktree the seam provisioned rather than at the user's
    checkout (SWR-3405), and the configuration stays the *project's* — a
    requirement worktree carries no ``.rotaris/`` of its own, so reloading from
    there would silently give the run the built-in defaults.

    The report keeps two facts apart, by construction rather than by convention:

    - **what the agent claims** — its summary, its risks and whether it declared
      itself finished — reaches only the ``agent_*`` fields, through
      :func:`read_claim`;
    - **what Rotaris measured** — the commits the worktree actually gained, the
      files they actually changed and the workspace's own check suite run
      against them (SWR-3410) — is computed here from Git and the verifier, and
      is structurally unreachable from model output (SWR-3408).

    The run also says what it is for: the session it creates carries the
    requirement and the unit off the launch (SWR-3612), and is filed in the base
    checkout rather than in the throwaway worktree, so it appears in the session
    list a user actually reads. :meth:`_execute_agent` explains why those are two
    different roots.

    Synchronous, because the seam is: concurrency is the scheduler's decision
    (SWR-3406).

    *run_agent*, *run_checks* and *notice* are injected for the reason
    ``AgentRunHost`` injects the first two — they are the only parts that reach
    the world, so a test drives the whole host without a model, a network or a
    check suite.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        config: RotarisConfig | None = None,
        max_iterations: int | None = None,
        run_agent: Callable[[str, Path], AgentRunResult] | None = None,
        run_checks: Callable[[Path], SuiteRun] | None = None,
        notice: Callable[[str], None] | None = None,
    ) -> None:
        self._workspace = workspace
        self._config = config
        self._max_iterations = max_iterations
        # Held as ``None`` rather than defaulted to the bound method: the shipped
        # path needs the whole launch to attribute the session it creates
        # (SWR-3612), while an injected stand-in keeps the two-argument shape
        # ``AgentRunHost`` established and the tests were written against.
        self._run_agent = run_agent
        self._run_checks = run_checks if run_checks is not None else self._execute_checks
        self._notice = notice

    @property
    def workspace(self) -> Path:
        """The checkout the run's configuration is read from."""
        return self._workspace

    @traces(SWR.SWR_3416, SWR.SWR_3408)
    def start(self, launch: UnitLaunch) -> RunReport:
        """Run one unit in its own worktree and report what happened."""
        from rotaris_core.requirements.delivery.projection import RunOutcome as Outcome
        from rotaris_core.requirements.execution.run_seam import RunReport as Report

        tree = Path(launch.workspace.path)
        try:
            task = self._task(launch)
            result = (
                self._run_agent(task, tree)
                if self._run_agent is not None
                else self._execute_agent(task, tree, launch)
            )
        except Exception as exc:  # noqa: BLE001 — a failed launch is one sentence
            return Report(
                outcome=Outcome.FAILED,
                failure_reason=f"{type(exc).__name__}: {exc}".strip(": "),
            )

        # Measured first, and from the repository only. Nothing below this point
        # reads the agent's answer into a measured field, which is what makes
        # SWR-3408 a property of the code rather than a rule to remember.
        commits, changed = self._produced(tree, launch.workspace.base_revision)
        measured, detail, checks = self._verified(launch, commits)

        intake = read_claim(result)
        if intake.tampered:
            self._announce(f"{launch.run_id}: {intake.message}")

        outcome = self._outcome(result)
        denied = read_denied_tools(self._workspace, result.session_id or "")
        outcome, refusal = tools_confiscated(outcome, commits, denied)
        if refusal:
            self._announce(f"{launch.run_id}: {refusal}")
        return Report(
            outcome=outcome,
            session_id=result.session_id or None,
            produced_commits=commits,
            changed_files=changed,
            verified=measured,
            verification_detail=detail,
            checks=checks,
            failure_reason=(
                "" if outcome is Outcome.SUCCEEDED else (refusal or result.error or result.summary)
            ),
            agent_summary=intake.claim.summary or result.summary,
            agent_risks=intake.claim.risks,
            agent_claimed_complete=intake.claim.claimed_complete,
        )

    def _announce(self, line: str) -> None:
        """Say something the user should read, wherever this host was given one."""
        _log.warning("%s", line)
        if self._notice is not None:
            self._notice(line)

    # -- what the agent is asked to do -------------------------------------

    def _task(self, launch: UnitLaunch) -> str:
        """The agent's instruction: the rendered context, or the snapshot itself.

        A flow composed with an agent context (SWR-3407) renders it and the seam
        carries it here.  Without one the run still gets the *specification* —
        the snapshot's own text, never a re-read of the requirement (SWR-3402) —
        so a run can never be started with nothing to work from.
        """
        rendered = launch.prompt.strip()
        if rendered:
            return rendered
        snapshot = launch.snapshot
        unit = f" (unit {launch.unit_id})" if launch.unit_id else ""
        return (
            f"Implement requirement {snapshot.req_id}{unit} — {snapshot.title}.\n\n"
            f"{snapshot.description}\n\n"
            f"This is the specification as of {snapshot.requirement_hash}; work against it "
            "and do not re-read the requirement file.\n"
            "Work only in this worktree, and commit what you change."
        )

    # -- what Rotaris measured ---------------------------------------------

    def _produced(self, tree: Path, base_revision: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
        """The commits this run added to its worktree, and the files they touched."""
        base = base_revision.strip()
        if not base:
            return (), ()
        commits = tuple(reversed(_git(tree, "rev-list", f"{base}..HEAD").split()))
        if not commits:
            return (), ()
        changed = _git(tree, "diff", "--name-only", base, "HEAD").splitlines()
        return commits, tuple(sorted({line.strip() for line in changed if line.strip()}))

    def _verified(
        self,
        launch: UnitLaunch,
        commits: tuple[str, ...],
    ) -> tuple[bool | None, str, tuple[CheckOutcome, ...]]:
        """The workspace's own checks over the run's worktree (SWR-3410)."""
        from rotaris_core.requirements.execution.verification import (
            UnitVerification,
            VerificationError,
            verify_unit,
        )

        if not commits:
            return None, NOTHING_COMMITTED, ()
        try:
            verification: UnitVerification = verify_unit(
                snapshot=launch.snapshot,
                workspace=launch.workspace,
                base_workspace=self._workspace,
                run_checks=self._run_checks,
                commit=commits[-1],
            )
        except VerificationError as exc:
            return None, str(exc), ()
        return verification.verified, verification.detail, verification.suite.checks

    # -- the two things that reach the world -------------------------------

    @traces(SWR.SWR_3612, SWR.SWR_3405)
    def _execute_agent(self, task: str, tree: Path, launch: UnitLaunch) -> AgentRunResult:
        """One agent run in *tree*, through the shared host entry point.

        Two roots, deliberately apart, and *both recorded*. The session is filed
        in the base checkout, because that is the workspace whose session list a
        user reads (SWR-3612): one written into the worktree would be unreachable
        the moment the worktree is removed, and invisible in the meantime. The
        work happens in the unit's own worktree (SWR-3405).

        ``worktree_path`` is what keeps those two facts from contradicting each
        other. Without it the session record would say ``workspace_root`` = the
        checkout the run did *not* happen in and ``worktree`` = null, and the
        tree would survive only inside ``config_snapshot``: the session list
        would show the run's branch as ``—`` though it is on a real requirement
        branch, and a resumed run would have nothing to point it back at its
        tree. With it, the run records itself exactly as an isolated desktop run
        does — ``attach_existing`` validates that the tree belongs to this
        repository, reads its branch, and marks it ``created_by_session=False``,
        which is right for a tree the run seam provisioned and owns.

        The configuration is therefore handed over *base-rooted* and re-rooted by
        the binding, rather than being pointed at the tree here: that way
        ``create_session`` resolves the check suite against the same workspace it
        files the session under, instead of mixing one root with the other.

        The run also carries what it is for. The launch already knows both facts
        (SWR-3416), so a requirement-started session can state its requirement
        and its unit wherever sessions are listed, without anything downstream
        having to look them up.
        """
        import asyncio

        from rotaris_core.run_host import RunRequest, execute_run
        from rotaris_core.session.manager import SessionManager

        return asyncio.run(
            execute_run(
                RunRequest(
                    task=task,
                    config=self._run_config(),
                    max_iterations=self._max_iterations,
                    worktree_path=tree,
                    requirement_id=launch.req_id,
                    unit_id=launch.unit_id or "",
                ),
                SessionManager(self._workspace),
                notice=self._notice,
            ),
        )

    def _execute_checks(self, tree: Path) -> SuiteRun:
        """The completion verifier's suite, run in *tree* (SWR-2602, SWR-3410)."""
        return workspace_checks_for(self._workspace, config=self._run_config())(tree)

    def _run_config(self) -> RotarisConfig:
        """The project's configuration — the caller's, when it validated one."""
        if self._config is not None:
            return self._config
        from rotaris_core.config.loader import load_config

        return load_config(self._workspace)

    def _outcome(self, result: AgentRunResult) -> RunOutcome:
        from rotaris_core.requirements.delivery.projection import RunOutcome as Outcome
        from rotaris_core.run_result import RunStatus

        return {
            RunStatus.COMPLETED: Outcome.SUCCEEDED,
            RunStatus.MAX_ITERATIONS: Outcome.FAILED,
            RunStatus.INTERRUPTED: Outcome.INTERRUPTED,
        }.get(result.status, Outcome.FAILED)


@traces(SWR.SWR_3416)
@dataclass(frozen=True, slots=True)
class HeadlessRun:
    """What a headless requirement run answers with: a code, a line, the flow.

    ``code`` follows the convention the ``events`` group established — ``0`` for
    a command that did what it said, ``2`` for "not found" and for a request the
    workspace refuses — with ``1`` reserved for the one thing only this command
    reports: a flow that ran and did not reach a reviewable result.
    """

    code: int
    message: str
    flow: FlowResult | None = None


@traces(SWR.SWR_3416)
@dataclass(frozen=True, slots=True)
class HeadlessReport:
    """A command that reports rather than runs: its progress, and its last word.

    The shape both CLI surfaces render. Held here rather than composed twice
    because the *sentences* are the answer — a summary line one parser phrases
    differently from the other is two products with one name (SWR-3416).
    """

    progress: tuple[str, ...] = ()
    summary: str = ""


def _loaded_config(root: Path) -> RotarisConfig:
    """The workspace's configuration, for a caller that did not supply one."""
    from rotaris_core.config.loader import load_config

    return load_config(root)


@traces(SWR.SWR_3416, SWR.SWR_3413)
def run_requirement(
    workspace: Path,
    req_id: str,
    *,
    config: RotarisConfig | None = None,
    base_commit: str = "",
    max_iterations: int | None = None,
    flow_id: str = "",
    actor_name: str = "",
    host: RunHost | None = None,
    progress: Callable[[str], None] | None = None,
) -> HeadlessRun:
    """Take *req_id* from wherever it stands to a reviewable result, headlessly.

    SWR-3416's promise in one call: the same
    :class:`~rotaris_core.requirements.execution.flow.RequirementFlow` the desktop
    composes, over the same guarded writer, the same worktree provider and the
    same seam — with :class:`CliRunHost` in the desktop host's place and a text
    channel in Qt's.

    Releasing is part of it.  A requirement that is not yet ``Ready`` is moved
    there first and through the transition function, like every other actor
    (SWR-3203); a workspace that refuses the move says so, and nothing starts.

    Never raises for a requirement whose flow failed: the flow itself does not
    (SWR-3413), and a command that turned a blocked requirement into a traceback
    would be unusable in CI.
    """
    from rotaris_core.requirements.execution.flow import FlowStateStore, RequirementFlow
    from rotaris_core.requirements.execution.history import ExecutionHistory
    from rotaris_core.requirements.execution.run_seam import GitIsolation, RequirementRunSeam
    from rotaris_core.requirements.execution.snapshot import ExecutionTransitions, SnapshotStore
    from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore

    root = workspace.resolve()
    registry = _registry(root)
    if registry is None:
        return HeadlessRun(code=2, message=f"{root}: {NO_REQUIREMENT_STORE}")

    def current_for(one_id: str) -> CanonicalRequirement | None:
        # Re-read, never cached: the guard exists for a value that may have moved
        # since the run started (SWR-3403), and the refresh is incremental
        # (SWR-3116), so this is a stat sweep rather than a re-parse.
        return registry.refresh().requirement(one_id)

    def require(one_id: str) -> CanonicalRequirement:
        """The flow's own lookup, total: a run needs something to compare against."""
        found = current_for(one_id)
        if found is None:
            from rotaris_core.requirements.execution.flow import FlowError

            raise FlowError(f"{one_id} left the requirement store while its run was in flight")
        return found

    requirement = registry.index.requirement(req_id)
    if requirement is None:
        return HeadlessRun(
            code=2,
            message=f"{req_id} is not in this project's requirement store ({root}).",
        )

    # Said before the wait rather than discovered after it: a run under a
    # permission mode that denies by default spends a model call per unit having
    # its tools confiscated (SWR-2508). Not a refusal — ``ask`` is the shipped
    # default, so refusing here would refuse every unconfigured workspace — and
    # not silent either, which is what it used to be. The board says the same
    # sentence on the release it accepts.
    from rotaris_core.permissions.modes import unattended_run_refusal

    unattended = unattended_run_refusal(config or _loaded_config(root))
    if unattended and progress is not None:
        progress(f"{req_id}: {unattended}")

    from rotaris_core.requirements.execution.target import (
        TargetBranchError,
        no_commit_refusal,
        target_branch_for,
    )

    try:
        target = target_branch_for(root, config=config)
    except TargetBranchError as exc:
        # Git has three ways to answer badly and they are three different
        # answers, so the exception's flags decide rather than an empty string.
        # Reading ``base == ""`` could not tell a project that has never
        # committed from a path that is no repository, and folded both into the
        # not-a-checkout sentence — which named neither the fact nor a fix for
        # the case a person actually hits, their first day on a new project.
        #
        # All three stop here, ahead of the release below: nothing may move a
        # requirement to Ready for a run that cannot start (SWR-3419).
        if exc.no_commit:
            return HeadlessRun(code=2, message=no_commit_refusal(root, req_id))
        if exc.declared:
            return HeadlessRun(code=2, message=str(exc))
        return HeadlessRun(code=2, message=f"{root} {NOT_A_CHECKOUT}")

    # The commit the flow is cut from stays a separate read: a caller may supply
    # it, and a checkout standing on an unborn branch resolves a target and still
    # has no HEAD. Same condition as above, so the same sentence.
    base = base_commit.strip() or _git(root, "rev-parse", "HEAD").strip()
    if not base:
        return HeadlessRun(code=2, message=no_commit_refusal(root, req_id))

    transitions = ExecutionTransitions.for_workspace(root, current_for=current_for)
    refusal = _release(root, transitions, requirement, actor_name=actor_name)
    if refusal is not None:
        return refusal

    def on_run(event: RunEvent) -> None:
        if progress is not None:
            progress(event.message)

    def on_stage(event: StageEvent) -> None:
        if progress is not None:
            progress(event.message)

    decomposer, assess = decomposition_for(root, config=config)
    from rotaris_core.requirements.change.migration_host import (
        MigrationRunHost,
        dispatching_host,
    )

    if target.notice and progress is not None:
        progress(target.notice)
    flow = RequirementFlow(
        transitions=transitions,
        seam=RequirementRunSeam(
            isolation=GitIsolation(root, target=target),
            host=dispatching_host(
                host
                if host is not None
                else CliRunHost(
                    root,
                    config=config,
                    max_iterations=max_iterations,
                    notice=progress,
                ),
                MigrationRunHost(root, config=config),
            ),
            observer=on_run,
            snapshots=SnapshotStore(root),
        ),
        current_for=require,
        history=ExecutionHistory(root),
        decomposer=decomposer,
        assess=assess,
        observer=on_stage,
        progress=FlowStateStore(root),
        units=UnitStore(root),
        integrations=IntegrationLog(root),
        integrate=integration_for(root, config=config, target=target),
    )
    result = flow.start(requirement, base_commit=base, flow_id=flow_id, resume=True)
    return HeadlessRun(code=0 if result.succeeded else 1, message=result.message, flow=result)


def _utc_now() -> dt.datetime:
    """The default clock, replaced by any caller that carries one of its own."""
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3404, SWR.SWR_3416, SWR.SWR_3117)
def decomposition_for(
    workspace: Path,
    *,
    config: RotarisConfig | None = None,
    clock: Callable[[], dt.datetime] = _utc_now,
) -> tuple[Decomposer | None, Callable[[CanonicalRequirement], RequirementAssessment] | None]:
    """*workspace*'s own scope assessment and split planner (SWR-3404).

    **The one builder of this composition**, for both consumers. The desktop's
    run starter calls it too, so "what a release composes" and "what a headless
    run composes" are one answer rather than two that agree today.

    It sits in a module named for the CLI and that is deliberate, because the
    obvious alternative is worse. ``execution/decomposition.py`` is the *decision*
    module — its whole point is that the reasoning is a value computed from stated
    facts, and it imports neither configuration nor an analyst. A builder that
    reads config, resolves a persona and defers a provider handle would take that
    character away from it. Composition belongs beside the consumers, not inside
    the engine. Import it from wherever it is needed; a third copy of these twenty
    lines is the failure this docstring exists to prevent.

    *clock* is what the two consumers do differ on, and it is a seam rather than
    a policy: a desktop flow threads one injected clock through its transitions,
    its seam and its decomposer, so a plan's ``recorded_at`` and the stage events
    around it cannot come from two sources. A headless run injects none and every
    collaborator reads the wall clock, which is the same property arrived at from
    the other side.

    SWR-3413 lists decomposition as a stage of the flow and SWR-3404 puts it
    "before execution" without qualifying which surface started it, so a headless
    run gets the same two collaborators a desktop release does. Without them the
    flow still runs its DECOMPOSITION stage and still says out loud that no
    decomposer was configured — but every requirement is one unit, whatever its
    size, which is a different product depending on how the run was started.

    Both halves or neither. :class:`Decomposer` consults its model only once a
    measured signal is over a threshold, so a planner without an assessment
    measures nothing, finds nothing over a threshold and splits nothing —
    decomposition that is configured and never happens, which is worse than none
    because it looks wired.

    Nothing here builds an ``LLM``. The handle is deferred, so a workspace that
    never crosses a threshold never reaches a provider, and importing this module
    never reaches the SDK.

    A configuration that cannot be read, defines no persona, or switches
    decomposition off (SWR-3117) yields neither half rather than a failed run.
    """
    import logging

    from rotaris_core.requirements.analysis.analysts import (
        DecompositionAnalyst,
        RequirementAssessor,
        deferred_completion,
    )
    from rotaris_core.requirements.analysis.persona import resolve_analyst
    from rotaris_core.requirements.execution.decomposition import Decomposer

    try:
        settings_source = config if config is not None else _load_config(workspace)
        settings = settings_source.requirements.execution.decomposition
        resolved = (
            resolve_analyst(settings_source, DecompositionAnalyst.JOB) if settings.enabled else None
        )
    except Exception:  # noqa: BLE001 — a run must not fail over configuration
        logging.getLogger(__name__).warning(
            "No decomposition analyst for %s; requirements run as one unit",
            workspace,
            exc_info=True,
        )
        return None, None
    if resolved is None:
        # Switched off (SWR-3117), so neither half is built: measuring a
        # requirement whose split is not permitted would be a model call whose
        # answer nothing may act on.
        return None, None
    completion = deferred_completion(settings_source, resolved)
    return (
        Decomposer(
            model=DecompositionAnalyst(resolved, completion=completion),
            max_units=settings.max_units,
            enabled=settings.enabled,
            persona=resolved.persona,
            clock=clock,
        ),
        RequirementAssessor(resolved, completion=completion),
    )


#: Why a check suite is being run, per caller. Both are the same *fact* — a tree
#: has changes nobody has checked — said from the two places that produce one.
RUN_CHANGE_REASON = "the run committed changes to its worktree"
INTEGRATION_CHANGE_REASON = "the integration merged the units' branches"


@traces(SWR.SWR_3421, SWR.SWR_3410, SWR.SWR_3416)
def workspace_checks_for(
    workspace: Path,
    *,
    config: RotarisConfig | None = None,
    reason: str = RUN_CHANGE_REASON,
    sources: tuple[str, ...] = ("run:commit",),
) -> WorkspaceChecks:
    """*workspace*'s own check suite, as the callable that runs it in a tree.

    **The one builder of this composition**, beside :func:`decomposition_for` and
    for the same reason. ``resolve_check_suite`` → ``run_check_suite`` →
    ``SuiteRun.from_verifier_run`` had been written out identically in the
    headless host and in the desktop host, differing only in where the
    configuration came from, and SWR-3409's integrator needed a third. Three
    copies of "what counts as verified" is three chances for them to stop
    agreeing, which is exactly the thing a verdict is supposed to settle.

    It is a *builder*, not the runner: what it returns is the
    :data:`~rotaris_core.requirements.execution.verification.WorkspaceChecks`
    callable that module declares and deliberately never implements — that module
    states its own purity, and a subprocess launcher inside it would end that.

    The suite is the workspace's, resolved exactly as a delivering run resolves
    it. That is the only reason its verdict is worth anything: a check Rotaris
    invented would measure a tree against a standard nobody agreed to. A
    workspace that declares none yields ``not_run`` with the reason stated —
    "nobody checked" and "everything holds" are different answers and only one of
    them earns a promotion (SWR-3410).

    *reason* and *sources* travel into the change signal so a run's checks and an
    integration's checks are distinguishable in the verifier's own log, without
    either caller re-deriving the pipeline to say so.
    """

    def run_checks(tree: Path) -> SuiteRun:
        import asyncio

        from rotaris_core.requirements.execution.verification import SuiteRun as Suite
        from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
        from rotaris_core.verifier.runner import run_check_suite
        from rotaris_core.verifier.suite import resolve_check_suite

        settings = config if config is not None else _load_config(workspace)
        suite = resolve_check_suite(settings, tree)
        if not suite.checks:
            return Suite.not_run(NO_CHECK_SUITE)
        return Suite.from_verifier_run(
            asyncio.run(
                run_check_suite(
                    suite,
                    workspace_root=tree,
                    change=WorkspaceChangeSignal(changed=True, reason=reason, sources=sources),
                ),
            ),
        )

    return run_checks


@traces(SWR.SWR_3409, SWR.SWR_3420, SWR.SWR_3419, SWR.SWR_3416, SWR.SWR_3117)
def integration_for(
    workspace: Path,
    *,
    config: RotarisConfig | None = None,
    target: TargetBranch | None = None,
    clock: Callable[[], dt.datetime] = _utc_now,
) -> Callable[[RequirementUnits, Sequence[RunResult]], IntegrationOutcome]:
    """How *workspace*'s completed units reach the branch they belong on.

    **The one builder of this composition**, for both consumers, for the same
    reason as :func:`decomposition_for` and :func:`workspace_checks_for`. It is
    also the seam that had been missing entirely: ``RequirementFlow`` has
    declared an ``integrate=`` parameter since the epic's first slice, and
    neither the desktop nor the headless composition ever passed one — so the
    flow's integration stage took its ``None`` branch on every run that has ever
    happened, and nothing a requirement run produced reached the base by itself.

    What this returns is the adapter the flow's parameter is shaped for. The flow
    speaks units and run results; the integrator speaks a plan over branches.
    Between them sit three facts only a composition can supply: the target branch
    (SWR-3419), where it stands right now, and which of each unit's runs actually
    verified (SWR-3410) — the last of which is what decides whether a lone unit
    lands at all (SWR-3420).

    The integration id is derived from the requirement and its delivery cycle
    (SWR-3417), not drawn, so re-running a requirement after a restart names the
    same integration rather than accumulating one per attempt.

    **The most recent run of each unit wins.** A unit that failed and was retried
    (SWR-3415) has more than one run, and the branch that matters is the one the
    successful attempt left behind. Merging an abandoned attempt's branch would
    integrate work that was already judged wrong.

    Only runs that succeeded contribute a branch. A requirement whose units all
    failed produces a plan with no branches, which the integrator answers with a
    stated skip rather than an empty merge.
    """
    from rotaris_core.requirements.execution.integration import (
        RequirementIntegrator,
        plan_integration,
    )
    from rotaris_core.requirements.execution.target import target_branch_for
    from rotaris_core.requirements.execution.units import slug_token

    settings = None
    with contextlib.suppress(Exception):
        settings = config if config is not None else _load_config(workspace)
    where = target if target is not None else target_branch_for(workspace, config=settings)
    template = _integration_template(settings)
    integrator = RequirementIntegrator(
        workspace,
        verify=workspace_checks_for(
            workspace,
            config=settings,
            reason=INTEGRATION_CHANGE_REASON,
            sources=("requirement:integration",),
        ),
        clock=clock,
    )

    def integrate(units: RequirementUnits, results: Sequence[RunResult]) -> IntegrationOutcome:
        branches = _unit_branches(results)
        plan = plan_integration(
            units.req_id,
            branches,
            integration_id=f"{slug_token(units.req_id, limit=0) or 'req'}-i{units.cycle + 1}",
            base_branch=where.branch,
            base_revision=where.revision,
            template=template,
        )
        return integrator.integrate(plan)

    return integrate


#: The placeholder names the config block documented, mapped to the ones the
#: engine actually formats. The setting shipped saying ``{requirement_id}`` and
#: the engine has always written ``{req}``; nothing read the field, so nothing
#: ever noticed. Both spellings resolve now — the default was corrected, and a
#: workspace that copied the old description keeps working instead of failing at
#: merge time with a ``KeyError`` nobody can act on.
_TEMPLATE_ALIASES = {"{requirement_id}": "{req}", "{integration_id}": "{id}", "{unit_id}": "{id}"}


def _integration_template(config: RotarisConfig | None) -> str:
    """The workspace's integration branch template, or the built-in default.

    ``requirements.execution.integration_branch_template`` was declared in the
    epic's first slice and read by nothing until this builder existed — a user
    could set it and every integration branch was named the same way regardless.
    """
    from rotaris_core.requirements.execution.integration import (
        DEFAULT_INTEGRATION_BRANCH_TEMPLATE,
    )

    if config is None:
        return DEFAULT_INTEGRATION_BRANCH_TEMPLATE
    declared = config.requirements.execution.integration_branch_template.strip()
    if not declared:
        return DEFAULT_INTEGRATION_BRANCH_TEMPLATE
    for documented, formatted in _TEMPLATE_ALIASES.items():
        declared = declared.replace(documented, formatted)
    return declared


def _unit_branches(results: Sequence[RunResult]) -> tuple[UnitBranch, ...]:
    """One branch per unit, from that unit's most recent successful run.

    The branch is taken at the point the run is accepted rather than read back
    later, so "this run produced a branch" and "this is the branch" are one
    decision. A run that failed, that never got a workspace, or whose workspace
    has no branch contributes nothing — there is no branch to merge, and
    inventing one would integrate work that does not exist.
    """
    from rotaris_core.requirements.execution.integration import UnitBranch

    latest: dict[str, tuple[int, UnitBranch]] = {}
    for result in results:
        workspace = result.workspace
        if not result.succeeded or workspace is None or not workspace.branch:
            continue
        report = result.report
        candidate = UnitBranch(
            unit_id=result.unit_id or result.run_id,
            branch=workspace.branch,
            run_id=result.run_id,
            changed_files=report.changed_files if report is not None else (),
            verified=bool(report is not None and report.verified),
        )
        held = latest.get(candidate.unit_id)
        if held is None or result.attempt >= held[0]:
            latest[candidate.unit_id] = (result.attempt, candidate)
    return tuple(unit for _attempt, unit in (latest[key] for key in sorted(latest)))


def _load_config(workspace: Path) -> RotarisConfig:
    """The workspace's configuration, read lazily."""
    from rotaris_core.config.loader import load_config

    return load_config(workspace)


@traces(SWR.SWR_3416, SWR.SWR_3201)
def requirement_rows(workspace: Path) -> list[str] | None:
    """``SWR-3416  Ready  Requirement runs are launchable…`` — one row each.

    ``None`` when the workspace keeps no ReqToCode store: an absent store is a
    command with nothing to list, which the caller reports and still exits ``0``
    on, exactly as ``events list`` does for a workspace with no stored history.
    """
    from rotaris_core.requirements.delivery.store import DeliveryStore

    root = workspace.resolve()
    registry = _registry(root)
    if registry is None:
        return None
    delivery = DeliveryStore(root)
    return [
        f"  {found.req_id}  {delivery.read(found.req_id).state.label:<12}  {found.title}"
        for found in registry.index.requirements
    ]


@traces(SWR.SWR_3416, SWR.SWR_3615, SWR.SWR_3221, SWR.SWR_3513)
def verification_report(workspace: Path) -> HeadlessReport | None:
    """Run this workspace's checks once, record what they verified, restore what they earned.

    Both halves, and they are one user act. SWR-3513's fourth criterion — a
    requirement whose evidence came back returns to ``Done`` *after a
    verification* — is the only path back out of an evidence-driven ``Needs
    Update``, and it costs a suite run, so it happens where somebody asked for
    one rather than on a board read (SWR-3616's rule).

    One suite run serves both: :class:`WorkspaceReverifier` remembers the pass, so
    a hundred requirements restoring do not run the workspace's tests a hundred
    times over the same tree.

    ``None`` when the workspace keeps no ReqToCode store — the same answer
    :func:`requirement_rows` gives, for the same reason.
    """
    from rotaris_core.requirements.change_host import (
        WorkspaceReverifier,
        restore_verified_evidence,
    )

    root = workspace.resolve()
    index = _registry(root)
    if index is None:
        return None
    reverifier = WorkspaceReverifier(root)
    restored = restore_verified_evidence(
        root,
        current_for=index.index.requirement,
        reverifier=reverifier,
    )
    report = reverifier.report
    if report is None:
        # Nothing was in Needs Update, so nothing asked the reverifier anything
        # and the suite has not run. Run it: the user asked to verify.
        from rotaris_core.requirements.verification_host import verify_workspace

        report = verify_workspace(root, progress=_EchoProgress())
    return HeadlessReport(
        progress=tuple(result.message for result in report.results) + restored,
        summary=(
            report.summary
            if not restored
            else f"{report.summary}; {len(restored)} restored to Done"
        ),
    )


@traces(SWR.SWR_3620)
class _EchoProgress:
    """Says which phase a headless verification is in, on stderr.

    The second consumer of the pass-progress seam, and the reason it is a
    protocol of plain values rather than a Qt signal (SWR-3620): a seam with one
    consumer is a seam that quietly becomes that consumer's internals. It also
    earns its own keep — ``rotaris-headless requirements verify`` runs the same
    multi-minute suite the board does, with the same silence.

    Phases only. A line per requirement would bury the report the command exists
    to print, and the phase boundaries are where the long waits are.
    """

    def on_phase(self, phase: object, total: int = 0) -> None:
        counted = f" ({total})" if total else ""
        print(f"[verify] {phase}{counted}", file=sys.stderr)  # noqa: T201 - progress, not output

    def on_item(
        self,
        phase: object,
        label: str,
        index: int,
        total: int,
        detail: str = "",
        deadline_s: float = 0.0,
    ) -> None:
        del detail, deadline_s
        if phase != PassPhase.CHECKS:
            # Only the suite is slow enough per item to be worth a line.
            return
        print(f"[verify] {phase} {index}/{total} {label}", file=sys.stderr)  # noqa: T201


@traces(SWR.SWR_3416, SWR.SWR_3515)
def evaluation_report(workspace: Path) -> HeadlessReport | None:
    """Re-evaluate this workspace and answer what every propagation rule found.

    The headless half of SWR-3515: the same pass the board runs, over the same
    reader — the coverage sweep plus the last recorded verification and how far
    the repository has moved since it (SWR-3220, SWR-3209). A cheaper reader here
    would make the two consumers disagree about whether a requirement's evidence
    still holds.
    """
    from rotaris_core.requirements.change_host import evaluate_workspace, evidence_of
    from rotaris_core.requirements.delivery.projection import WorkspaceEvidence
    from rotaris_core.requirements.sources.base import history_of
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    root = workspace.resolve()
    source = reqtocode_source_for(root)
    if source is None:
        return None
    index = _registry(root)
    if index is None:  # pragma: no cover - a source that reads and a registry that does not
        return None
    requirements = index.index.requirements
    history = history_of(source)
    report = evaluate_workspace(
        root,
        requirements=requirements,
        current_for=index.index.requirement,
        swept=evidence_of(requirements, WorkspaceEvidence.for_repository(root)),
        version_at=history.read_requirement_at if history is not None else None,
        # What this refresh observed to have gone (SWR-3113), which the registry
        # can only know because its memory survived the last process (SWR-3119).
        tombstones=index.index.tombstones,
    )
    return HeadlessReport(
        progress=report.lines,
        summary=(
            "Nothing changed."
            if report.quiet
            else (
                f"{len(report.moved)} moved, {len(report.decayed)} decayed,"
                f" {len(report.analysed)} analysed,"
                f" {len(report.migrations)} worklist(s) planned,"
                f" {len(report.removals)} line(s) about what was removed"
            )
        ),
    )


@traces(SWR.SWR_3507, SWR.SWR_3416, SWR.SWR_3512)
def pending_migrations(workspace: Path) -> tuple[str, ...] | None:
    """Every requirement with a migration worklist waiting, or ``None`` with no store.

    The listing half of ``requirements migrate``, and the reason the command can
    be typed before anything is known: a worklist is inspectable *before* any
    code changes (SWR-3507), which is only true if a user can find out that one
    is waiting without approving it.

    Reads the plan store and nothing else. No sweep, no registry refresh, no git
    — asking "is there anything to decide" must not cost what deciding costs.
    """
    from rotaris_core.requirements.change.migration_store import MigrationPlanStore
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    root = workspace.resolve()
    if reqtocode_source_for(root) is None:
        return None
    return MigrationPlanStore(root).pending()


@traces(SWR.SWR_3507, SWR.SWR_3508, SWR.SWR_3416, SWR.SWR_3512)
def migration_offer(
    workspace: Path,
    req_id: str,
    *,
    actor_name: str = "",
    at: dt.datetime | None = None,
) -> HeadlessRun:
    """Approve *req_id*'s waiting worklist as a named person, and plan its unit.

    The headless half of SWR-3507's fourth criterion. Until this existed
    :func:`~rotaris_core.requirements.change_host.accept_migration` — the only
    path from a planned worklist to changed code — had no caller on any surface,
    so the migration lane shipped whole and unreachable.

    **Nothing is applied here.** What this produces is an approval and one
    execution unit; the rewriting happens later, in that unit's own worktree, and
    reaches the user's branch only if the suite passes there. So the two
    invocations a user makes are genuinely separable, which is what makes
    "inspectable before any code changes" a property rather than a promise.

    **The reader is the propagation pass's own** (:func:`evaluation_report`),
    deliberately, and not the cheaper coverage sweep underneath it. The two agree
    on every site today — :class:`~rotaris_core.requirements.delivery.projection.
    WorkspaceEvidence` passes ``implementations`` through untouched and preserves
    each covering test's path and line — but ``accept_migration`` refuses on a
    digest mismatch, so the day they stop agreeing this command would report that
    the worklist had moved in a workspace where nothing moved.

    **An unnamed approver is refused before the engine sees it.**
    ``require_human`` raises rather than returns, and a traceback is not the
    answer a CLI owes for a missing flag.
    """
    from rotaris_core.requirements.change.decisions import DecisionError
    from rotaris_core.requirements.change.migration_store import MigrationPlanStore
    from rotaris_core.requirements.change_host import accept_migration, evidence_of
    from rotaris_core.requirements.delivery.projection import WorkspaceEvidence
    from rotaris_core.requirements.delivery.state import DeliveryActor

    root = workspace.resolve()
    named = actor_name.strip()
    if not named:
        return HeadlessRun(code=2, message=f"{req_id}: {UNNAMED_APPROVER}")
    registry = _registry(root)
    if registry is None:
        return HeadlessRun(code=2, message=f"{root}: {NO_REQUIREMENT_STORE}")
    index = registry.index
    if req_id not in MigrationPlanStore(root).pending():
        if index.requirement(req_id) is None:
            return HeadlessRun(
                code=2,
                message=f"{req_id} is not in this project's requirement store ({root}).",
            )
        return HeadlessRun(code=2, message=f"{req_id}: {NO_MIGRATION_WORKLIST}")
    swept = evidence_of(index.requirements, WorkspaceEvidence.for_repository(root))
    try:
        outcome = accept_migration(
            root,
            req_id,
            coverage=swept.coverage,
            current_for=index.requirement,
            actor=DeliveryActor.user(named),
            at=at,
        )
    except DecisionError as refusal:  # pragma: no cover - `named` already guards this
        return HeadlessRun(code=2, message=f"{req_id}: {refusal}")
    return HeadlessRun(code=0 if outcome.accepted else 1, message=outcome.message)


def _registry(root: Path) -> RequirementRegistry | None:
    """*root*'s requirement registry, refreshed once, or ``None`` with no store.

    Carries the workspace's memory (SWR-3119), and for a CLI that is not an
    optimisation but the difference between detecting a removal and not: a
    headless invocation lives for one refresh, so without something that survives
    the process there is no previous read to differ from and a deleted
    requirement is indistinguishable from one that was never there.
    """
    from rotaris_core.requirements.memory import RegistryMemory
    from rotaris_core.requirements.registry import RequirementRegistry
    from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

    source = reqtocode_source_for(root)
    if source is None:
        return None
    registry = RequirementRegistry([source], memory=RegistryMemory(root))
    registry.refresh()
    return registry


def _release(
    workspace: Path,
    transitions: ExecutionTransitions,
    requirement: CanonicalRequirement,
    *,
    actor_name: str,
) -> HeadlessRun | None:
    """Move *requirement* to ``Ready`` when it is not there. ``None`` when it may run.

    Through the transition function, never around it: ``Ready`` is where the flow
    starts, and a headless release has to be as guarded and as audited as the one
    a user makes on the board (SWR-3203, SWR-3213).  A requirement already there
    is left alone — ``Ready → Ready`` is not an edge, and re-releasing would
    append an audit record for a change that did not happen.
    """
    import datetime as dt

    from rotaris_core.requirements.delivery.state import (
        DeliveryActor,
        DeliveryState,
        TransitionCause,
    )
    from rotaris_core.requirements.delivery.store import DeliveryStore
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

    if DeliveryStore(workspace).read(requirement.req_id).state is DeliveryState.READY:
        return None
    outcome = transitions.apply(
        TransitionRequest(
            req_id=requirement.req_id,
            target=DeliveryState.READY,
            actor=DeliveryActor.user(actor_name),
            cause=TransitionCause.USER_ACTION,
            at=dt.datetime.now(dt.UTC),
            requirement_hash=requirement.current_hash,
        ),
    )
    if not outcome.accepted:
        return HeadlessRun(code=2, message=outcome.message)
    return None
