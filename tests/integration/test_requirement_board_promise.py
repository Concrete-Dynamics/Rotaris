"""Productive use: a person keeps their requirements in their own project, Rotaris has
already delivered one of them, and then they change it — one more sentence, written into
their own file. They release the changed requirement again, let Rotaris work, read the
review and accept the result.
Expected outcome: the whole loop closes without anybody editing Rotaris' own state — the
board moves the delivered requirement to `Needs Update` on the normal evaluation path while
still naming the version that was built, `Done` is unreachable until a run has produced
evidence for the *new* text, the release starts a real run in a worktree of its own, the
review shows what the agent claimed beside what Rotaris measured, and the acceptance
records the new specification version as the requirement's `satisfied_hash`.

This is the acceptance run of the Requirements Board epic (SWR-3100 – SWR-3600). The
sequence is the promise, so it is asserted as one test rather than step by step — a suite
that checked each step in isolation would still let the seams between them drift apart. The
first delivery is additionally asserted on its own, because for one round the full sequence
was `xfail`: a requirement could be delivered only once, and a single marker over the whole
sequence would have swallowed a regression in the half that worked. The defect is fixed and
the marker is gone; the split stays, because the reasoning that produced it survives the
fix — a long sequence deserves a guard on its first half whatever the state of its second.

It is driven through the product's own two entry points — `workspace_actions` for every
write and `WorkspaceBoard.project()` for every read — so what is exercised is the wiring a
user gets and not a wiring this file assembled. **Only external systems are faked**, each at
its own seam and none of them Rotaris' own logic:

* the **model as the agent** — through `run_agent`, the injection point `workspace_actions`
  documents for it. The run host, the launch seam, the Git worktree and the measurement of
  what the run produced are the shipped objects;
* the **model as the analysts** — the scope assessment and the impact analysis (SWR-3404,
  SWR-3503) now reach a provider on this path, so the judge's call is cut off and the
  documented degradation applies. Neither answer is an input to the promise under test;
* the **shell** — through the verifier's `_new_executor`, replaced by one that
  runs each check with `subprocess` instead of the SDK's hardened terminal. The check
  *suite* is the project's own configuration, really resolved and really run, and the two
  checks genuinely inspect the worktree: a run that committed no test, or a source file
  that does not trace the requirement, fails them and cannot reach `Done`.
"""

from __future__ import annotations

import datetime as dt
import subprocess
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.change.detection import (
    ChangeKind,
    RequirementBaseline,
    SourceChangeDetector,
)
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.satisfied import SatisfactionState
from rotaris_core.requirements.delivery.state import ActorKind, DeliveryState
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.registry import RequirementRegistry
from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for
from rotaris_core.run_result import RunResult as AgentRunResult
from rotaris_core.run_result import RunStatus

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris.services.requirements_actions import ActionOutcome

    from rotaris_core.requirements.delivery.projection import BoardEntry, BoardProjection
    from rotaris_core.requirements.model import CanonicalRequirement

pytestmark = pytest.mark.e2e

REQ = "SWR-501"
AT = dt.datetime(2026, 8, 15, 9, 0, tzinfo=dt.UTC)
#: The person doing the releasing and the accepting. Never "system": the whole
#: point of SWR-3610 is that those two entries carry a name.
USER_NAME = "dvf"

PROSE = "A basket becomes an order when it is paid for."
#: The sentence the user adds to their own requirement file. This is the one
#: change a person makes, and the one that has to cost a run (SWR-3503).
ADDED_SENTENCE = "A payment that fails three times locks the basket for an hour."
EDITED_PROSE = f"{PROSE}\n\n{ADDED_SENTENCE}"

#: What the faked agent commits. Fixed names rather than per-attempt ones: both
#: runs are cut from the same base commit — nothing is ever merged back into the
#: user's checkout — so each run sees both files as its own work either way, and
#: the project's check suite can name them.
SOURCE = "src/payment.py"
COVERING_TEST = "tests/test_payment.py"


# --------------------------------------------------------------------------
# The user's own project: a real checkout with a real requirement store
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


def document(prose: str) -> str:
    """The requirement as its own artefact — the file the user edits."""
    return (
        f"---\nreq-id: {REQ}\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "A basket can be paid for"\nepic: SWR-500\n---\n\n'
        f"# {REQ} — A basket can be paid for\n\n{prose}\n\n"
        "## Acceptance criteria\n\n- The receipt names every line item.\n"
    )


def requirement_path(root: Path) -> Path:
    return root / "docs" / "requirements" / "500-checkout" / f"{REQ}-basket.md"


def project(root: Path) -> Path:
    """A git checkout that has adopted ReqToCode, with one epic and one requirement.

    It declares a check suite of its own, and the two checks are real: the first
    fails unless the run committed a covering test, the second unless the source
    it committed traces the requirement. That is what makes the acceptance at the
    end of this test mean something — ``Done`` is granted by measurement, not by
    a host that asserted it.
    """
    (root / "docs" / "requirements" / "500-checkout").mkdir(parents=True)
    (root / "docs" / "requirements" / "500-checkout.md").write_text(
        "---\nreq-id: SWR-500\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Checkout"\n---\n\n# 500 — Checkout\n',
        encoding="utf-8",
    )
    requirement_path(root).write_text(document(PROSE), encoding="utf-8")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / ".rotaris").mkdir()
    (root / ".rotaris" / "agents.yaml").write_text(
        "verifier:\n"
        "    checks:\n"
        f"      - name: tests\n        command: git ls-files --error-unmatch {COVERING_TEST}\n"
        f"      - name: traceability\n        command: git grep -q {REQ} -- {SOURCE}\n",
        encoding="utf-8",
    )
    (root / "src").mkdir()
    (root / "tests").mkdir()
    (root / "src" / "checkout.py").write_text("def pay() -> None: ...\n", encoding="utf-8")
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    git(root, "add", ".")
    git(root, "commit", "-m", "the project as it stands")
    return root


def ticking(start: dt.datetime = AT) -> Callable[[], dt.datetime]:
    counter = iter(range(100_000))
    return lambda: start + dt.timedelta(seconds=next(counter))


# --------------------------------------------------------------------------
# The two faked systems: the model, and the shell the checks run in
# --------------------------------------------------------------------------


class ImplementingAgent:
    """The model, and only the model — what `workspace_actions(run_agent=…)` takes.

    It does what an agent does: change files in the worktree it was given and
    commit them. It never reports on itself; what the run *produced* is measured
    afterwards from the repository by the shipped ``AgentRunHost``, which is the
    separation SWR-3408 is about.

    The task text it receives is the run's own instruction, rendered by the host
    from the launch's snapshot (SWR-3402) — so asserting on it is asserting that
    the run was aimed at the specification version it was started for.
    """

    def __init__(self) -> None:
        self.tasks: list[str] = []
        self.trees: list[Path] = []

    def __call__(self, task: str, tree: Path) -> AgentRunResult:
        self.tasks.append(task)
        self.trees.append(tree)
        # What it writes follows the task it was given, and that is not decoration.
        # Since a verified unit lands (SWR-3420), a second delivery cycle starts
        # from a base that already carries the first one's work — so a double that
        # wrote the same bytes whatever it was asked would have nothing to commit,
        # and the run would fail for a reason no real agent would produce. An agent
        # implementing an edited requirement writes something different; this one
        # does too.
        revision = len(self.tasks)
        (tree / "src").mkdir(exist_ok=True)
        (tree / "tests").mkdir(exist_ok=True)
        (tree / SOURCE).write_text(
            f"# implements {REQ}\ndef pay() -> None: ...  # rev {revision}\n",
            encoding="utf-8",
        )
        (tree / COVERING_TEST).write_text(
            f"# verifies {REQ}\ndef test_pay() -> None: ...  # rev {revision}\n",
            encoding="utf-8",
        )
        git(tree, "add", SOURCE, COVERING_TEST)
        git(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"work for {REQ}",
        )
        return AgentRunResult(
            session_id="20260815-abcdef",
            status=RunStatus.COMPLETED,
            summary=f"implemented {REQ} as the snapshot describes it",
        )


class _Observation:
    """The shape the verifier's classifier reads off a finished command."""

    def __init__(self, command: str, exit_code: int, text: str) -> None:
        self.command = command
        self.exit_code = exit_code
        self.text = text
        self.failure_kind: str | None = None


class RealShell:
    """The check suite's terminal, run with ``subprocess`` instead of the SDK.

    Faked at the *executor*, never at the result: each check's own command really
    runs, in the worktree the verifier points it at, and its real exit code is
    what the suite classifies. A run that commits no test therefore fails the
    ``tests`` check here exactly as it would in a user's project.
    """

    def __init__(self, working_dir: Path) -> None:
        self.working_dir = working_dir
        self.commands: list[str] = []

    def __call__(self, action: Any) -> _Observation:
        self.commands.append(action.command)
        finished = subprocess.run(
            action.command,
            shell=True,
            cwd=self.working_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=action.timeout,
            check=False,
        )
        return _Observation(
            action.command,
            finished.returncode,
            f"{finished.stdout}{finished.stderr}",
        )

    def cleanup(self) -> None:
        """Nothing to tear down — a subprocess is not a session."""


@pytest.fixture(autouse=True)
def no_model_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """This project has no model endpoint, and says so without reaching for one.

    The production composition now asks a model twice on this path — the scope
    assessment before a run and the impact analysis on evaluation (SWR-3404,
    SWR-3503) — and both are built from the workspace's configuration, which on a
    developer's machine resolves to whatever model they happen to have. Left
    alone this test would make a real API call, and its result would depend on
    the credentials of whoever ran it.

    Cutting the call at the judge's own seam keeps that out and exercises the
    documented behaviour instead: an unreachable analyst is a *degradation*, not
    a failure, and the flow proceeds on its default verdict. The promise under
    test does not depend on either analyst's answer — decomposition is optional
    and the impact analysis is advisory — so this narrows what is faked rather
    than what is proven.
    """

    async def unreachable(*_args: object, **_kwargs: object) -> object:
        raise RuntimeError("this workspace configures no model endpoint")

    monkeypatch.setattr(
        "rotaris_core.requirements.analysis.judge.call_llm_detached",
        unreachable,
    )


@pytest.fixture
def real_shell(monkeypatch: pytest.MonkeyPatch) -> list[RealShell]:
    """Point the verifier at a subprocess terminal, and record the ones it built."""
    built: list[RealShell] = []

    def build(working_dir: Path) -> RealShell:
        shell = RealShell(working_dir)
        built.append(shell)
        return shell

    monkeypatch.setattr("rotaris_core.verifier.runner._new_executor", build)
    return built


# --------------------------------------------------------------------------
# The product, and the readers a test needs to see what it did
# --------------------------------------------------------------------------


class Product:
    """The shipped composition of the requirement feature over one workspace.

    Nothing here wires an engine. There are two production entry points and this
    holds one of each:

    * :func:`workspace_actions` — the **write** path. The guarded writer, the
      completion gate, the run starter, the launch seam, the Git isolation and
      the run host, assembled by the product.
    * :class:`~rotaris.services.requirements_bridge.WorkspaceBoard` — the **read**
      path. It refreshes the registry, sweeps the repository for evidence, asks
      the scheduler for its decision and projects the board. It also runs the
      SWR-3502 evaluation itself, which is the point: the requirement says a
      delivered requirement whose text moved reaches ``Needs Update`` *on
      evaluation, without user action*, and a board read is where a Rotaris
      evaluation happens. Calling it is therefore how the test asks the question
      a user asks, rather than a projector this file assembled.

    ``dispatch`` runs the flow on the calling thread instead of a worker: the
    same object, the same order, without the test having to wait on a thread it
    does not own. ``clock`` is injected for the same reason it is everywhere in
    this codebase.
    """

    def __init__(self, root: Path, agent: ImplementingAgent) -> None:
        from rotaris.services.requirements_actions import workspace_actions
        from rotaris.services.requirements_bridge import WorkspaceBoard

        source = reqtocode_source_for(root)
        assert source is not None, "the project keeps its requirements in a ReqToCode store"
        self.root = root
        self.agent = agent
        self.source = source
        # The requirement store's own reader, for one question the board cannot
        # answer without side effects: "what does the file say right now".
        # Projecting the board *evaluates*, so reading a hash through it would
        # move the very card the test is about to assert on.
        self.registry = RequirementRegistry([source])
        self.registry.refresh()
        self.delivery = DeliveryStore(root)
        self.audit = AuditStore(root)
        # One board per workspace, held across the test exactly as the desktop
        # holds one: it caches its registry and store between reads, and a fresh
        # one per question would answer from a workspace it had just re-opened.
        self._board = WorkspaceBoard(root)
        actions = workspace_actions(
            root,
            actor_name=USER_NAME,
            clock=ticking(),
            # The flow on this thread, so the test reads a finished result.
            dispatch=lambda work: work(),
            run_agent=agent,
        )
        assert actions is not None, "a workspace with a requirement store has a write path"
        self.actions = actions

    # -- the two things a user does -----------------------------------------

    def release(self) -> ActionOutcome:
        """The drop on ``Ready`` — and, because the product says so, a real run."""
        return self.actions.release(REQ)

    def accept(self) -> ActionOutcome:
        """The drop on ``Done``: asked for, granted by the engine or by nothing."""
        return self.actions.accept(REQ)

    # -- what the product now says ------------------------------------------

    def current(self, req_id: str = REQ) -> CanonicalRequirement | None:
        return self.registry.refresh().requirement(req_id)

    def hash_of(self, req_id: str = REQ) -> str:
        found = self.current(req_id)
        assert found is not None, f"{req_id} is in the project's store"
        return found.current_hash

    def board(self) -> BoardProjection:
        """One board pass, the whole of it — the evaluation and then the read.

        The two stages the desktop's projection worker runs, in its order. Since
        SWR-3519 they are two calls: ``evaluate`` is the one that writes and
        moves a card (SWR-3502), ``project`` renders what it left and writes
        nothing (SWR-3216).
        """
        self._board.evaluate()
        return self._board.project()

    def entry(self) -> BoardEntry:
        """This requirement's card, as a user reading the board would see it."""
        found = self.board().entry(REQ)
        assert found is not None, f"{REQ} is on the board"
        return found

    @property
    def moves(self) -> tuple[str, ...]:
        """What the last board read moved by itself, one line per requirement."""
        return self._board.specification_moves


# --------------------------------------------------------------------------
# The acceptance run of the epic
# --------------------------------------------------------------------------


@verifies(
    SWR.SWR_3600,
    SWR.SWR_3204,
    SWR.SWR_3215,
    SWR.SWR_3413,
    SWR.SWR_3405,
    SWR.SWR_3603,
    SWR.SWR_3610,
)
def test_a_released_requirement_is_implemented_measured_and_accepted(
    tmp_path: Path,
    real_shell: list[RealShell],
) -> None:
    """The first delivery, whole, over the shipped wiring.

    Split out from the sequence below so the first half of the promise is guarded
    on its own. That sequence was ``xfail`` for one round on a defect in the run
    starter, and without this test the marker would have swallowed a regression in
    everything leading up to it. Both pass now; the split is worth keeping for the
    next time something in the second half breaks.
    """
    root = project(tmp_path)
    agent = ImplementingAgent()
    product = Product(root, agent)
    delivered_hash = product.hash_of()

    released = product.release()

    assert released.accepted, released.reason
    assert not released.failure, released.failure
    # The release did not only move a card: the flow ran to a reviewable result.
    assert product.delivery.read(REQ).state is DeliveryState.REVIEW

    # What the agent claimed, beside what Rotaris measured (SWR-3603) — and the
    # measurement is the project's own checks, really run over what was really
    # committed, in a worktree that is not the user's checkout (SWR-3405).
    review = product.entry().review
    assert review is not None
    assert review.agent_claimed_complete and review.agent_summary
    assert review.verified is True
    assert [check.name for check in review.checks] == ["tests", "traceability"]
    assert sorted(review.changed_files) == [SOURCE, COVERING_TEST]
    assert review.branch and review.worktree_path
    assert [shell.commands for shell in real_shell] == [
        [
            f"git ls-files --error-unmatch {COVERING_TEST}",
            f"git grep -q {REQ} -- {SOURCE}",
        ],
    ]
    assert real_shell[0].working_dir != root

    accepted = product.accept()
    assert accepted.accepted, accepted.reason

    entry = product.entry()
    assert entry.state is DeliveryState.DONE
    assert entry.satisfied_hash == delivered_hash
    assert entry.satisfaction is SatisfactionState.SATISFIED

    # Both human decisions carry the person's name (SWR-3610).
    trail = product.audit.read(REQ)
    decisions = [
        event
        for event in trail.events
        if event.to_state in {DeliveryState.READY, DeliveryState.DONE}
    ]
    assert len(decisions) == 2
    assert {event.actor.kind for event in decisions} == {ActorKind.USER}
    assert {event.actor.name for event in decisions} == {USER_NAME}

    # The user's own checkout was never written to (SWR-3405).
    assert git(root, "status", "--porcelain") == ""


# This test was `xfail(strict=True)` for one round, and what it recorded was
# real: a requirement could be delivered exactly once. `schedule_now` read the
# *previous* cycle's unit set to decide whether the *next* cycle could start, and
# a set holding one FINISHED unit is neither empty (so the undecomposed-requirement
# fallback did not fire) nor startable (so the scheduler selected nothing) — the
# release was refused with "the scheduler selected nothing for it". That made
# SWR-3502 hollow: returning a delivered requirement to Needs Update means nothing
# if it can never be delivered again.
#
# The fix is one condition in `schedule_now`: the fallback now asks whether any
# live unit still *owes work* rather than whether the set is empty. Two dead ends
# were measured on the way and both look right, which is why they are named here.
# Discarding the finished units at release does unblock the run — but the flow's
# next `_save_units` writes a freshly planned set with `discarded=()` and drops
# the very history the discard was meant to keep. And the id collision that seemed
# to force a cycle-aware identity never happens, because the flow re-plans through
# `plan_units` rather than `added()`, so nothing consults the retired ids.
#
# One real defect remains and is older than this test: both cycles mint the same
# unit id, so `ExecutionHistory` holds their runs under one id with no cycle
# marker. Closing *that* does need a discriminator in the unit identity. It is
# invisible until someone delivers twice, which is why nothing had caught it.
@verifies(
    SWR.SWR_3600,
    SWR.SWR_3204,
    SWR.SWR_3215,
    SWR.SWR_3413,
    SWR.SWR_3502,
    SWR.SWR_3603,
    SWR.SWR_3609,
    SWR.SWR_3610,
)
def test_a_changed_requirement_travels_from_needs_update_to_done_with_a_new_satisfied_hash(
    tmp_path: Path,
    real_shell: list[RealShell],
) -> None:
    """Edit → Needs Update → release → run → review → Done, over the shipped wiring."""
    root = project(tmp_path)
    agent = ImplementingAgent()
    product = Product(root, agent)
    detector = SourceChangeDetector()
    baseline = detector.detect(
        product.source,
        RequirementBaseline.unevaluated(product.source.source_id),
    ).baseline

    # -- 1. Rotaris delivers the requirement once --------------------------
    first_hash = product.hash_of()
    released = product.release()
    assert released.accepted, released.reason
    assert not released.failure, released.failure
    # The release did not only move a card: the flow ran to a reviewable result.
    assert product.delivery.read(REQ).state is DeliveryState.REVIEW

    accepted = product.accept()
    assert accepted.accepted, accepted.reason

    entry = product.entry()
    assert entry.state is DeliveryState.DONE
    assert entry.satisfied_hash == first_hash
    assert entry.satisfaction is SatisfactionState.SATISFIED

    # -- 2. The user edits their own file ----------------------------------
    requirement_path(root).write_text(document(EDITED_PROSE), encoding="utf-8")
    second_hash = product.hash_of()
    assert second_hash != first_hash, "an edit to the requirement's own text moves its hash"

    detected = detector.detect(product.source, baseline)
    assert detected.changes.by_id()[REQ].kind is ChangeKind.MODIFIED

    # -- 3. The board asks for an update, on the normal evaluation path -----
    entry = product.entry()
    assert any(REQ in line for line in product.moves), product.moves
    assert entry.state is DeliveryState.NEEDS_UPDATE
    # Still naming the version that was built: "needs updating", never "unbuilt".
    assert entry.satisfied_hash == first_hash
    assert entry.satisfaction is SatisfactionState.STALE

    # -- 4. Done is not available for the asking (SWR-3609, SWR-3215) -------
    forced = product.accept()
    assert not forced.accepted, "a card cannot reach Done while the engine refuses"
    assert forced.reason, "the refusal states the engine's own precondition"
    assert product.delivery.read(REQ).state is DeliveryState.NEEDS_UPDATE
    assert product.delivery.read(REQ).satisfied_hash == first_hash

    # -- 5. The user releases the changed requirement -----------------------
    rereleased = product.release()
    assert rereleased.accepted, rereleased.reason
    assert not rereleased.failure, rereleased.failure
    assert len(agent.tasks) == 2
    # The second run worked against the *new* text, in a worktree of its own.
    assert ADDED_SENTENCE in agent.tasks[1]
    assert ADDED_SENTENCE not in agent.tasks[0]
    assert agent.trees[1] != agent.trees[0]

    # -- 6. The review separates the claim from the measurement (SWR-3603) --
    review = product.entry().review
    assert review is not None
    assert review.snapshot_hash == second_hash
    assert not review.specification_changed
    assert review.agent_claimed_complete and review.agent_summary
    # Measured, not claimed: the project's own checks ran in the run's worktree
    # and both passed, over the files the run actually committed.
    assert review.verified is True
    assert [check.name for check in review.checks] == ["tests", "traceability"]
    assert sorted(review.changed_files) == [SOURCE, COVERING_TEST]
    assert review.branch and review.worktree_path
    # Two runs, two suites, each in its own worktree — never in the checkout.
    assert len(real_shell) == 2
    assert all(shell.working_dir != root for shell in real_shell)

    # -- 7. Accepting records the new version -------------------------------
    delivered = product.accept()
    assert delivered.accepted, delivered.reason

    entry = product.entry()
    assert entry.state is DeliveryState.DONE
    assert entry.satisfied_hash == second_hash, "Done records the version that was built"
    assert entry.satisfaction is SatisfactionState.SATISFIED
    assert [delivery.satisfied_hash for delivery in entry.deliveries] == [first_hash, second_hash]

    # -- 8. Both human decisions are attributed (SWR-3610) ------------------
    trail = product.audit.read(REQ)
    releases = [event for event in trail.events if event.to_state is DeliveryState.READY]
    acceptances = [event for event in trail.events if event.to_state is DeliveryState.DONE]
    assert len(releases) == 2, "each release is one record"
    assert len(acceptances) == 2, "each acceptance is one record"
    assert {event.actor.kind for event in (*releases, *acceptances)} == {ActorKind.USER}
    assert {event.actor.name for event in (*releases, *acceptances)} == {USER_NAME}
    assert [event.satisfied_hash for event in acceptances] == [first_hash, second_hash]
    # The one move nobody made by hand: the specification change is the system's.
    moved = [event for event in trail.events if event.to_state is DeliveryState.NEEDS_UPDATE]
    assert moved and all(event.actor.kind is ActorKind.SYSTEM for event in moved)

    # -- 9. The user's own checkout was never written to (SWR-3405) ---------
    assert git(root, "status", "--porcelain").split() == [
        "M",
        f"docs/requirements/500-checkout/{REQ}-basket.md",
    ]
