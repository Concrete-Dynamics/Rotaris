"""Productive use: a headless run — a CLI invocation, a CI job, a scheduler — asks the
engine's own run host to implement one execution unit and to report what happened, on a
machine with no display and no desktop app installed.
Expected outcome: the host runs the agent in the unit's own worktree through the shared
run entry point, measures what the worktree actually gained and what the workspace's own
checks said about it, and keeps that measurement structurally out of the agent's reach —
a model that answers with a payload claiming `verified`, `produced_commits` or
`checks_passed` has those keys stripped and named, and the report still says exactly what
Rotaris measured. The session the run creates says which requirement and unit it is for,
and is filed in the base checkout rather than in the worktree that is about to be thrown
away."""

from __future__ import annotations

import datetime as dt
import json
import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import CheckOutcome, RunOutcome
from rotaris_core.requirements.execution.cli_host import (
    NOTHING_COMMITTED,
    CliRunHost,
    read_claim,
)
from rotaris_core.requirements.execution.contract import RUNNER_OWNED_FIELDS
from rotaris_core.requirements.execution.run_seam import (
    RunWorkspace,
    UnitLaunch,
    unit_isolation,
)
from rotaris_core.requirements.execution.snapshot import capture_snapshot
from rotaris_core.requirements.execution.verification import SuiteRun
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.run_result import RunResult as AgentRunResult
from rotaris_core.run_result import RunStatus

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.execution.snapshot import RunSnapshot
    from rotaris_core.run_host import RunRequest
    from rotaris_core.session.manager import SessionManager

pytestmark = pytest.mark.unit

REQ = "SWR-3416"
UNIT = "swr-3416-impl"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


# --------------------------------------------------------------------------
# a real worktree, because "what the run produced" is measured off one
# --------------------------------------------------------------------------


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def repository(root: Path) -> str:
    """A checkout with one commit. Answers with the commit a run starts from."""
    root.mkdir(parents=True, exist_ok=True)
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    (root / "base.txt").write_text("base\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-m", "initial")
    return git(root, "rev-parse", "HEAD").strip()


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Requirement runs are launchable without the desktop",
        description="The headless CLI is a consumer of the seam, not a second engine.",
        source_id="specs",
        source_path="specs/run-seam.md",
        source_revision="r3",
    )


def snapshot_of(base_commit: str = "c0ffee1") -> RunSnapshot:
    return capture_snapshot(
        requirement(),
        run_id="run-1",
        base_commit=base_commit,
        at=AT,
        unit_id=UNIT,
        session_id="20260814-abcdef",
    )


def launch_over(tree: Path, base_revision: str, *, prompt: str = "") -> UnitLaunch:
    return UnitLaunch(
        run_id="run-1",
        req_id=REQ,
        unit_id=UNIT,
        snapshot=snapshot_of(base_revision),
        isolation=unit_isolation(REQ, UNIT, run_id="run-1"),
        workspace=RunWorkspace(
            path=str(tree),
            branch=f"rotaris/req/{UNIT}",
            base_branch="main",
            base_revision=base_revision,
        ),
        prompt=prompt,
    )


def agent_result(
    summary: str = "changed the file and committed it",
    *,
    status: RunStatus = RunStatus.COMPLETED,
    error: str | None = None,
) -> AgentRunResult:
    return AgentRunResult(
        session_id="20260814-abcdef",
        status=status,
        summary=summary,
        error=error,
    )


def passing_suite(_tree: Path) -> SuiteRun:
    return SuiteRun(
        executed=True,
        checks=(CheckOutcome(name="tests", status="passed", detail="1 passed"),),
        duration_s=0.5,
    )


# --------------------------------------------------------------------------
# the seam's question, answered headlessly
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3416)
def test_the_host_runs_the_agent_in_the_units_own_worktree(tmp_path: Path) -> None:
    """SWR-3416's headless consumer: a unit run, reported, with no desktop in sight."""
    base = tmp_path / "base"
    base_commit = repository(base)
    tree = tmp_path / "tree"
    tree_commit = repository(tree)
    seen: list[tuple[str, Path]] = []

    def run_agent(task: str, where: Path) -> AgentRunResult:
        seen.append((task, where))
        return agent_result()

    host = CliRunHost(base, run_agent=run_agent, run_checks=passing_suite)
    report = host.start(launch_over(tree, tree_commit, prompt="implement the unit"))

    assert [where for _task, where in seen] == [tree]
    assert seen[0][0] == "implement the unit"
    assert report.outcome is RunOutcome.SUCCEEDED
    assert report.session_id == "20260814-abcdef"
    # The base checkout is the run's *configuration*, never its workspace (SWR-3405).
    assert git(base, "rev-parse", "HEAD").strip() == base_commit
    assert git(base, "status", "--porcelain") == ""


@verifies(SWR.SWR_3416, SWR.SWR_3402)
def test_a_run_without_a_rendered_context_is_given_the_snapshots_own_text(
    tmp_path: Path,
) -> None:
    """A run always has a specification to work from, and never re-reads it."""
    tree = tmp_path / "tree"
    commit = repository(tree)
    tasks: list[str] = []

    def run_agent(task: str, _where: Path) -> AgentRunResult:
        tasks.append(task)
        return agent_result()

    host = CliRunHost(tmp_path / "base", run_agent=run_agent, run_checks=passing_suite)
    host.start(launch_over(tree, commit))

    assert REQ in tasks[0]
    assert "The headless CLI is a consumer of the seam" in tasks[0]
    assert "do not re-read the requirement file" in tasks[0]


def denied_trail(workspace: Path, *tools: str, source: str = "headless-policy") -> None:
    """Write the permission trail a run whose tool calls were refused leaves behind."""
    evidence = workspace / ".rotaris" / "sessions" / "20260814-abcdef" / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    lines = [
        json.dumps(
            {
                "decision": "allow",
                "source": "rule",
                "tool_name": "artifact_list",
                "reason": "Read-only tool.",
            },
        ),
        *(json.dumps({"decision": "deny", "source": source, "tool_name": name}) for name in tools),
    ]
    (evidence / "permissions.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")


@verifies(SWR.SWR_3408)
def test_an_agent_denied_its_tools_and_committing_nothing_is_not_a_success(
    tmp_path: Path,
) -> None:
    """Productive use: a user releases a requirement in a workspace whose permission mode
    is `ask`, so the headless run has no one to answer its approval prompts.

    Expected outcome: the run is reported failed and names the tools it was refused —
    rather than the green `succeeded` an agent produces when it summarises the nothing it
    was allowed to do, which is what left the board sitting in Running with no evidence
    that anything was wrong."""
    base = tmp_path / "base"
    repository(base)
    tree = tmp_path / "tree"
    tree_commit = repository(tree)
    denied_trail(base, "todo", "delegate")

    host = CliRunHost(
        base,
        run_agent=lambda _task, _where: agent_result("Implemented the unit."),
        run_checks=passing_suite,
    )
    report = host.start(launch_over(tree, tree_commit))

    assert report.outcome is RunOutcome.FAILED
    assert "todo" in report.failure_reason
    assert "delegate" in report.failure_reason
    assert "committed nothing" in report.failure_reason
    # What the agent claimed is still recorded — it is just no longer believed.
    assert report.agent_summary == "Implemented the unit."


@verifies(SWR.SWR_3408)
def test_an_agent_that_was_denied_something_and_committed_anyway_still_succeeds(
    tmp_path: Path,
) -> None:
    """Productive use: an agent is refused one tool, works around it and commits.

    Expected outcome: the run stands. A denial is only fatal when it is the reason there
    is nothing to show; throwing away real work because one call was refused would cost
    the user the run they were waiting for."""
    base = tmp_path / "base"
    repository(base)
    tree = tmp_path / "tree"
    base_revision = repository(tree)
    denied_trail(base, "todo")
    (tree / "feature.py").write_text("value = 1\n", encoding="utf-8")
    git(tree, "add", "-A")
    git(tree, "commit", "-m", "implement the unit")

    host = CliRunHost(
        base,
        run_agent=lambda _task, _where: agent_result(),
        run_checks=passing_suite,
    )
    report = host.start(launch_over(tree, base_revision))

    assert report.outcome is RunOutcome.SUCCEEDED
    assert report.produced_commits != ()
    assert report.failure_reason == ""


@verifies(SWR.SWR_3416, SWR.SWR_3415)
def test_an_agent_that_raises_is_a_failed_report_and_never_an_exception(
    tmp_path: Path,
) -> None:
    """A scheduler has to record a failed launch, not catch it."""

    def run_agent(_task: str, _where: Path) -> AgentRunResult:
        raise RuntimeError("the model provider returned 503")

    host = CliRunHost(tmp_path / "base", run_agent=run_agent, run_checks=passing_suite)
    report = host.start(launch_over(tmp_path, "c0ffee1"))

    assert report.outcome is RunOutcome.FAILED
    assert report.failure_reason == "RuntimeError: the model provider returned 503"
    assert report.produced_commits == ()


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (RunStatus.COMPLETED, RunOutcome.SUCCEEDED),
        (RunStatus.FAILED, RunOutcome.FAILED),
        (RunStatus.MAX_ITERATIONS, RunOutcome.FAILED),
        (RunStatus.INTERRUPTED, RunOutcome.INTERRUPTED),
        (RunStatus.ERROR, RunOutcome.FAILED),
    ],
)
@verifies(SWR.SWR_3416)
def test_the_runs_terminal_status_becomes_the_boards_outcome(
    tmp_path: Path,
    status: RunStatus,
    expected: RunOutcome,
) -> None:
    """One mapping, so the headless run and the board never disagree about an outcome."""
    tree = tmp_path / "tree"
    commit = repository(tree)
    host = CliRunHost(
        tmp_path / "base",
        run_agent=lambda _task, _where: agent_result(status=status),
        run_checks=passing_suite,
    )

    report = host.start(launch_over(tree, commit))

    assert report.outcome is expected


# --------------------------------------------------------------------------
# what Rotaris measured
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3416, SWR.SWR_3410)
def test_the_report_measures_the_commits_and_files_the_worktree_actually_gained(
    tmp_path: Path,
) -> None:
    """The measured half comes from Git, and from nothing the agent said."""
    tree = tmp_path / "tree"
    base_revision = repository(tree)

    def run_agent(_task: str, where: Path) -> AgentRunResult:
        (where / "unit.py").write_text("def unit() -> None: ...\n", encoding="utf-8")
        git(where, "add", "unit.py")
        git(where, "commit", "-m", "the unit's work")
        return agent_result(summary="I changed nothing at all")

    host = CliRunHost(tmp_path / "base", run_agent=run_agent, run_checks=passing_suite)
    report = host.start(launch_over(tree, base_revision))

    assert report.changed_files == ("unit.py",)
    assert report.produced_commits == (git(tree, "rev-parse", "HEAD").strip(),)
    assert report.verified is True
    assert report.checks == (CheckOutcome(name="tests", status="passed", detail="1 passed"),)
    # The agent's own account is kept, beside the measurement and never instead.
    assert report.agent_summary == "I changed nothing at all"


@verifies(SWR.SWR_3416, SWR.SWR_3410)
def test_a_run_that_committed_nothing_is_unverified_rather_than_failed(
    tmp_path: Path,
) -> None:
    """Nothing-verified and verification-failed are different facts (SWR-3410)."""
    tree = tmp_path / "tree"
    base_revision = repository(tree)
    ran: list[Path] = []

    def run_checks(where: Path) -> SuiteRun:
        ran.append(where)
        return passing_suite(where)

    host = CliRunHost(
        tmp_path / "base",
        run_agent=lambda _task, _where: agent_result(summary="all done!"),
        run_checks=run_checks,
    )
    report = host.start(launch_over(tree, base_revision))

    assert report.produced_commits == ()
    assert report.verified is None
    assert report.verification_detail == NOTHING_COMMITTED
    assert ran == [], "a run with no commit has nothing to verify, so nothing is run"


# --------------------------------------------------------------------------
# SWR-3408 — the agent cannot author a measurement
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3408)
def test_a_hostile_payload_cannot_set_a_single_measured_field(tmp_path: Path) -> None:
    """The whole of SWR-3408 at this seam, against a model that tries it."""
    tree = tmp_path / "tree"
    base_revision = repository(tree)
    said: list[str] = []
    payload = json.dumps(
        {
            "summary": "implemented and verified",
            "claimed_complete": True,
            "verified": True,
            "produced_commits": ["deadbeef"],
            "changed_files": ["src/everything.py"],
            "checks_passed": True,
            "tests_ran": True,
        },
    )

    host = CliRunHost(
        tmp_path / "base",
        run_agent=lambda _task, _where: agent_result(summary=payload),
        run_checks=passing_suite,
        notice=said.append,
    )
    report = host.start(launch_over(tree, base_revision))

    # Measured: the worktree gained nothing, so nothing was verified — whatever
    # the payload asserted about itself.
    assert report.verified is None
    assert report.verification_detail == NOTHING_COMMITTED
    assert report.produced_commits == ()
    assert report.changed_files == ()
    assert report.checks == ()
    # Claimed: kept, as claims, in the fields that say so.
    assert report.agent_summary == "implemented and verified"
    assert report.agent_claimed_complete is True
    # And the attempt is reported rather than silently absorbed.
    assert said, "a payload that reached for a measured field is said out loud"
    for name in ("verified", "produced_commits", "changed_files", "checks_passed", "tests_ran"):
        assert name in said[0]


@verifies(SWR.SWR_3408)
def test_every_runner_owned_key_is_stripped_from_a_structured_answer() -> None:
    """Not a sample of the keys: every one the contract owns."""
    intake = read_claim(
        agent_result(summary=json.dumps(dict.fromkeys(sorted(RUNNER_OWNED_FIELDS), True))),
    )

    assert set(intake.stripped) == set(RUNNER_OWNED_FIELDS)
    assert intake.tampered is True
    assert intake.claim.summary == ""
    assert intake.claim.claimed_complete is False


@verifies(SWR.SWR_3408)
def test_prose_is_read_as_a_claim_and_an_error_withdraws_the_claim() -> None:
    """A run that ended in an error has not claimed to be finished."""
    finished = read_claim(agent_result(summary="wired the seam up"))
    broken = read_claim(agent_result(summary="wired the seam up", error="provider timed out"))

    assert finished.claim.summary == "wired the seam up"
    assert finished.claim.claimed_complete is True
    assert finished.tampered is False
    assert broken.claim.claimed_complete is False


@verifies(SWR.SWR_3408)
def test_an_unparseable_or_non_object_answer_is_prose() -> None:
    """A model cannot fail the run by answering with something that is not JSON."""
    for summary in ("{not json at all", "[1, 2, 3]", "{}", "plain english"):
        intake = read_claim(agent_result(summary=summary))
        assert intake.tampered is False
        assert intake.claim.risks == ()


@verifies(SWR.SWR_3408, SWR.SWR_3603)
def test_the_agents_risks_survive_a_structured_answer(tmp_path: Path) -> None:
    """What the agent flagged is what a reviewer reads beside the measurement."""
    tree = tmp_path / "tree"
    base_revision = repository(tree)
    payload = json.dumps(
        {
            "summary": "done, with one worry",
            "claimed_complete": True,
            "risks": ["the locking window is a guess"],
        },
    )

    host = CliRunHost(
        tmp_path / "base",
        run_agent=lambda _task, _where: agent_result(summary=payload),
        run_checks=passing_suite,
    )
    report = host.start(launch_over(tree, base_revision))

    assert report.agent_risks == ("the locking window is a guess",)
    assert report.agent_summary == "done, with one worry"


# --------------------------------------------------------------------------
# SWR-3612 — the session says what it is for, and lands where it is read
# --------------------------------------------------------------------------


class _Recorded:
    """What the shipped agent path handed the run entry point."""

    def __init__(self) -> None:
        self.requests: list[RunRequest] = []
        self.managers: list[SessionManager] = []


def _shipped_host(
    base: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[CliRunHost, _Recorded]:
    """A host with no agent injected — the path that builds the real RunRequest.

    ``run_agent`` is deliberately left out so ``CliRunHost._execute_agent`` runs;
    the stand-in replaces only the one thing that reaches the world, and it is
    patched on ``run_host`` itself because that is where the lazy import inside
    the method resolves it from.
    """
    from rotaris_core.config.schema import RotarisConfig

    recorded = _Recorded()

    async def execute_run(
        request: RunRequest,
        session_manager: SessionManager,
        **_kwargs: object,
    ) -> AgentRunResult:
        recorded.requests.append(request)
        recorded.managers.append(session_manager)
        return agent_result()

    monkeypatch.setattr("rotaris_core.run_host.execute_run", execute_run)
    host = CliRunHost(base, config=RotarisConfig(workspace_root=base), run_checks=passing_suite)
    return host, recorded


@verifies(SWR.SWR_3612)
def test_the_run_says_which_requirement_and_unit_it_is_for(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The launch already knows both, so nothing downstream has to look them up."""
    base = tmp_path / "base"
    repository(base)
    tree = tmp_path / "tree"
    commit = repository(tree)
    host, recorded = _shipped_host(base, monkeypatch)

    host.start(launch_over(tree, commit))

    assert recorded.requests, "the shipped path reaches execute_run"
    assert recorded.requests[0].requirement_id == REQ
    assert recorded.requests[0].unit_id == UNIT


@verifies(SWR.SWR_3612, SWR.SWR_3405)
def test_the_session_is_filed_in_the_base_checkout_not_in_the_worktree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A session written into a throwaway worktree is one nobody can ever list."""
    base = tmp_path / "base"
    repository(base)
    tree = tmp_path / "tree"
    commit = repository(tree)
    host, recorded = _shipped_host(base, monkeypatch)

    host.start(launch_over(tree, commit))

    assert recorded.managers[0].workspace_root == base
    # The work still happens in the unit's own worktree (SWR-3405), and the run
    # *says so* rather than leaving it to be inferred: two roots, deliberately
    # apart and both recorded.
    assert recorded.requests[0].worktree_path == tree
    # The configuration goes over base-rooted; the worktree binding re-roots it,
    # so `create_session` resolves the check suite against the workspace it files
    # the session under instead of mixing one root with the other.
    assert recorded.requests[0].config.workspace_root == base


@verifies(SWR.SWR_3612, SWR.SWR_3405)
def test_the_run_records_the_tree_it_ran_in(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Without this the session list shows a requirement run's branch as "—".

    ``config_for_session_worktree`` only re-roots a session whose ``worktree`` is
    bound, and only ``worktree_path`` (or ``isolate``) binds one. A run that
    passed neither would record ``workspace_root`` = the checkout it did not run
    in and ``worktree`` = null, leaving the tree reachable only from inside
    ``config_snapshot`` — which nothing reads.
    """
    from rotaris_core.run_host import validate_run_request

    base = tmp_path / "base"
    repository(base)
    tree = tmp_path / "tree"
    commit = repository(tree)
    host, recorded = _shipped_host(base, monkeypatch)

    host.start(launch_over(tree, commit))

    request = recorded.requests[0]
    assert request.worktree_path == tree
    # Attaching an existing tree and creating one are exclusive, and a run that
    # asked for both would be refused before it started.
    assert request.isolate is False
    assert request.session_id is None
    assert validate_run_request(request) is None


@verifies(SWR.SWR_3612)
def test_a_launch_without_a_unit_attributes_the_requirement_alone(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A launch may carry no unit; the request then says "" rather than None."""
    base = tmp_path / "base"
    repository(base)
    tree = tmp_path / "tree"
    commit = repository(tree)
    host, recorded = _shipped_host(base, monkeypatch)

    host.start(launch_over(tree, commit).model_copy(update={"unit_id": None}))

    assert recorded.requests[0].requirement_id == REQ
    assert recorded.requests[0].unit_id == ""


@verifies(SWR.SWR_3416)
def test_an_injected_agent_keeps_the_two_argument_shape(tmp_path: Path) -> None:
    """The stand-in contract AgentRunHost established, which the tests rely on."""
    tree = tmp_path / "tree"
    commit = repository(tree)
    seen: list[tuple[str, Path]] = []

    def run_agent(task: str, where: Path) -> AgentRunResult:
        seen.append((task, where))
        return agent_result()

    host = CliRunHost(tmp_path / "base", run_agent=run_agent, run_checks=passing_suite)
    report = host.start(launch_over(tree, commit))

    assert len(seen) == 1
    assert report.outcome is RunOutcome.SUCCEEDED


# --------------------------------------------------------------------------
# SWR-3404 — the headless flow decomposes on the same terms the desktop does
# --------------------------------------------------------------------------


def _configured(**decomposition: object) -> RotarisConfig:
    """A workspace that configures a decomposition analyst, as SWR-3117 spells it."""
    from rotaris_core.config.schema import PersonaConfig, RotarisConfig

    config = RotarisConfig()
    config.personas["planner"] = PersonaConfig(name="planner", model="a/model", tools=[])
    config.default_persona = "planner"
    config.requirements.personas.decomposition = "planner"
    for key, value in decomposition.items():
        setattr(config.requirements.execution.decomposition, key, value)
    return config


@verifies(SWR.SWR_3404, SWR.SWR_3416)
def test_a_configured_workspace_gets_both_halves_of_decomposition(tmp_path: Path) -> None:
    """A planner without an assessment measures nothing and would split nothing."""
    from rotaris_core.requirements.execution.cli_host import decomposition_for

    decomposer, assess = decomposition_for(tmp_path, config=_configured(enabled=True))

    assert decomposer is not None
    assert assess is not None


@verifies(SWR.SWR_3404, SWR.SWR_3117, SWR.SWR_3503)
def test_both_halves_get_the_deadline_the_workspace_configured(tmp_path: Path) -> None:
    """Productive use: a workspace releases a requirement whose decomposition runs on a
    reasoning model it gave a longer timeout to.

    Expected outcome: the analysts this builder composes wait that long. This is the exact
    composition a release goes through, and it used to hand both halves a hard-coded 90 s
    — under one configured HTTP attempt — so a planner that was still thinking was
    recorded as a ``model-error`` and its requirement was blocked.
    """
    from rotaris_core.config.schema import ModelConfig
    from rotaris_core.requirements.analysis.persona import ANSWERS_PER_JUDGEMENT
    from rotaris_core.requirements.execution.cli_host import decomposition_for

    config = _configured(enabled=True)
    config.models["a/model"] = ModelConfig(provider="deepseek", model_id="m", timeout=300)

    decomposer, assess = decomposition_for(tmp_path, config=config)

    assert decomposer is not None and assess is not None
    assert assess.resolved.timeout == 300 * ANSWERS_PER_JUDGEMENT


@verifies(SWR.SWR_3404, SWR.SWR_3117)
def test_switching_decomposition_off_builds_neither_half(tmp_path: Path) -> None:
    """A model call whose answer nothing may act on is a call not worth making."""
    from rotaris_core.requirements.execution.cli_host import decomposition_for

    assert decomposition_for(tmp_path, config=_configured(enabled=False)) == (None, None)


@verifies(SWR.SWR_3404)
def test_a_workspace_with_no_persona_runs_as_one_unit_rather_than_failing(
    tmp_path: Path,
) -> None:
    """A release must not fail over configuration; it degrades to a single unit."""
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.execution.cli_host import decomposition_for

    bare = RotarisConfig(workspace_root=tmp_path)
    bare.personas.clear()

    assert decomposition_for(tmp_path, config=bare) == (None, None)


@verifies(SWR.SWR_3404, SWR.SWR_3416)
def test_building_the_analysts_reaches_no_provider(tmp_path: Path) -> None:
    """The handle is deferred: composing a flow must not cost a model call.

    This is what lets the headless path carry decomposition without the CLI
    paying the SDK's import at start-up — the guard in
    tests/integration/test_cli_requirements.py asserts the other half.
    """
    import sys

    from rotaris_core.requirements.execution.cli_host import decomposition_for

    before = {name for name in sys.modules if name.startswith(("openhands", "litellm"))}
    decomposer, assess = decomposition_for(tmp_path, config=_configured(enabled=True))
    after = {name for name in sys.modules if name.startswith(("openhands", "litellm"))}

    assert decomposer is not None and assess is not None
    assert after == before, "constructing the analysts pulled a provider in"


@verifies(SWR.SWR_3421, SWR.SWR_3410)
def test_a_workspace_with_no_checks_verifies_nothing_and_says_so(tmp_path: Path) -> None:
    """Productive use: a project with no configured check suite runs a requirement.
    Expected outcome: the one builder answers "nothing verified this" everywhere, never a vacuous pass."""
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.requirements.execution.cli_host import NO_CHECK_SUITE, workspace_checks_for

    checks = workspace_checks_for(tmp_path, config=RotarisConfig(workspace_root=tmp_path))

    suite = checks(tmp_path)

    assert suite.executed is False
    assert suite.passed is False
    assert suite.skip_reason == NO_CHECK_SUITE


@verifies(SWR.SWR_3421)
def test_the_builder_hands_back_the_injected_check_shape(tmp_path: Path) -> None:
    """Productive use: the run host, the desktop host and the integrator all need a check runner.
    Expected outcome: they get the same callable shape SWR-3410 declares, from one place rather than three copies."""
    import inspect

    from rotaris_core.requirements.execution.cli_host import (
        INTEGRATION_CHANGE_REASON,
        RUN_CHANGE_REASON,
        workspace_checks_for,
    )

    checks = workspace_checks_for(tmp_path)

    assert callable(checks)
    signature = inspect.signature(checks)
    assert list(signature.parameters) == ["tree"]
    # A run's checks and an integration's checks are distinguishable in the log.
    assert RUN_CHANGE_REASON != INTEGRATION_CHANGE_REASON
