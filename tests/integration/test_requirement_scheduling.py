"""Productive use: a user releases several requirements at once — some depending on each
other, some more urgent than others — and lets Rotaris work through them without supervising
which one goes next.
Expected outcome: Rotaris runs them in dependency order, uses the priority only to order what
is already eligible, works on independent units at the same time up to the configured limit,
keeps a readable reason for everything it is not running, and a unit that fails takes neither
its siblings nor the rest of the queue with it."""

from __future__ import annotations

import datetime as dt
import json
import threading
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import RequirementPriority, UnitState
from rotaris_core.requirements.delivery.state import DeliveryState
from rotaris_core.requirements.execution.scheduler import (
    HoldReason,
    ScheduledRequirement,
    SchedulerLimits,
    Selection,
    run_selected,
    schedule,
)
from rotaris_core.requirements.execution.units import (
    RequirementUnits,
    UnitSpec,
    plan_units,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence
    from pathlib import Path

AT = dt.datetime(2026, 8, 14, 15, 0, tzinfo=dt.UTC)


class Board:
    """The delivery state the scheduler reads and a run wave writes back to.

    Deliberately the smallest thing that can hold the two facts SWR-3412 needs
    across passes — where each requirement stands, and where each of its units
    stands — so the test drives the real scheduler over changing state rather
    than asserting one frozen decision.
    """

    def __init__(
        self,
        plans: Mapping[str, RequirementUnits],
        *,
        priorities: Mapping[str, RequirementPriority] | None = None,
        depends_on: Mapping[str, Sequence[str]] | None = None,
        files: Mapping[str, Sequence[str]] | None = None,
    ) -> None:
        self.units = dict(plans)
        self.priorities = dict(priorities or {})
        self.depends_on = {key: tuple(value) for key, value in (depends_on or {}).items()}
        self.files = dict(files or {})
        self.states: dict[str, DeliveryState] = dict.fromkeys(plans, DeliveryState.READY)
        self.waves: list[tuple[str, ...]] = []
        self.holds: list[dict[str, HoldReason]] = []
        self.failed: set[str] = set()
        self._lock = threading.Lock()

    # -- what the scheduler is given --------------------------------------

    def candidates(self) -> list[ScheduledRequirement]:
        return [
            ScheduledRequirement.from_units(
                units,
                state=self.states[req_id],
                priority=self.priorities.get(req_id, RequirementPriority.NORMAL),
                depends_on=self.depends_on.get(req_id, ()),
                expected_files={
                    unit.unit_id: self.files.get(unit.unit_id, ()) for unit in units.units
                },
            )
            for req_id, units in self.units.items()
        ]

    # -- what a wave writes back ------------------------------------------

    def finish(self, choice: Selection, *, failing: bool = False) -> str:
        with self._lock:
            state = UnitState.FAILED if failing else UnitState.FINISHED
            self.units[choice.req_id] = self.units[choice.req_id].with_state(
                choice.unit_id,
                state,
                failure_reason="the agent gave up" if failing else "",
            )
            if failing:
                self.failed.add(choice.unit_id)
        return choice.unit_id

    def settle(self) -> None:
        """Promote the requirements whose units have all finished."""
        for req_id, units in self.units.items():
            started = any(unit.state is not UnitState.PENDING for unit in units.units)
            if units.complete:
                self.states[req_id] = DeliveryState.DONE
            elif started and self.states[req_id] is DeliveryState.READY:
                self.states[req_id] = DeliveryState.RUNNING


def drive(
    board: Board,
    *,
    limits: SchedulerLimits,
    start: Callable[[Selection], str] | None = None,
    max_waves: int = 12,
) -> Board:
    """Schedule, run the selection, record the result, repeat until nothing moves."""
    runner = start if start is not None else board.finish
    for _ in range(max_waves):
        decision = schedule(board.candidates(), limits=limits, at=AT)
        board.holds.append(decision.reasons)
        if not decision.selected:
            break
        results = run_selected(decision, runner)
        board.waves.append(tuple(result.unit_id for result in results))
        board.settle()
    return board


def one_unit(req_id: str) -> RequirementUnits:
    return plan_units(req_id, (UnitSpec(key="impl"),))


# -- five requirements, dependencies and priorities ------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3412)
def test_a_queue_of_five_requirements_executes_in_dependency_order() -> None:
    """Priority orders what is eligible; a dependency decides what is eligible at all."""
    plans = {
        req_id: one_unit(req_id) for req_id in ("SWR-10", "SWR-20", "SWR-30", "SWR-40", "SWR-50")
    }
    board = Board(
        plans,
        priorities={
            "SWR-10": RequirementPriority.CRITICAL,
            "SWR-20": RequirementPriority.HIGH,
            "SWR-30": RequirementPriority.NORMAL,
            "SWR-40": RequirementPriority.LOW,
            # The most urgent requirement in the queue — and the last one that runs,
            # because two dependencies stand in front of it.
            "SWR-50": RequirementPriority.CRITICAL,
        },
        depends_on={"SWR-20": ("SWR-10",), "SWR-40": ("SWR-20",), "SWR-50": ("SWR-40",)},
    )

    drive(board, limits=SchedulerLimits(concurrency=2))

    order = [unit_id for wave in board.waves for unit_id in wave]
    positions = {plans[req_id].ids[0]: order.index(plans[req_id].ids[0]) for req_id in plans}

    assert set(board.states.values()) == {DeliveryState.DONE}
    # Dependencies, in the order the queue was obliged to respect.
    assert positions[plans["SWR-10"].ids[0]] < positions[plans["SWR-20"].ids[0]]
    assert positions[plans["SWR-20"].ids[0]] < positions[plans["SWR-40"].ids[0]]
    assert positions[plans["SWR-40"].ids[0]] < positions[plans["SWR-50"].ids[0]]
    # Priority did its job among the eligible: the critical, dependency-free one
    # went first, and the unprioritised-but-free one came before the blocked ones.
    assert order[0] == plans["SWR-10"].ids[0]
    assert positions[plans["SWR-30"].ids[0]] < positions[plans["SWR-50"].ids[0]]
    # The first wave used the whole limit and no more.
    assert len(board.waves[0]) == 2


@pytest.mark.integration
@verifies(SWR.SWR_3412)
def test_every_candidate_the_queue_did_not_start_said_why() -> None:
    """Across every pass of a chained queue, no candidate is ever held silently."""
    plans = {req_id: one_unit(req_id) for req_id in ("SWR-10", "SWR-20", "SWR-30")}
    board = Board(
        plans,
        depends_on={"SWR-20": ("SWR-10",), "SWR-30": ("SWR-20",)},
    )

    drive(board, limits=SchedulerLimits(concurrency=3))

    assert board.holds, "the queue never held anything, so nothing was proven"
    seen = {reason for wave in board.holds for reason in wave.values()}
    assert HoldReason.REQUIREMENT_DEPENDENCY in seen
    # And the first pass held exactly the two blocked requirements, with reasons.
    assert set(board.holds[0].values()) == {HoldReason.REQUIREMENT_DEPENDENCY}
    assert len(board.holds[0]) == 2


# -- independent units really overlap --------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3406)
def test_a_user_watches_two_units_of_one_requirement_progress_at_the_same_time() -> None:
    """Both units must reach a barrier: a serial queue would never release it."""
    units = plan_units(
        "SWR-3406",
        (
            UnitSpec(key="impl"),
            UnitSpec(key="docs"),
            UnitSpec(key="release", depends_on=("impl", "docs")),
        ),
    )
    impl_id, docs_id, release_id = units.ids
    board = Board({"SWR-3406": units})
    barrier = threading.Barrier(2, timeout=20)
    together: list[str] = []

    def start(choice: Selection) -> str:
        if choice.unit_id in {impl_id, docs_id}:
            barrier.wait()
            together.append(choice.unit_id)
        return board.finish(choice)

    drive(board, limits=SchedulerLimits(concurrency=2), start=start)

    assert sorted(together) == sorted([docs_id, impl_id])
    assert board.waves[0] == (impl_id, docs_id)
    assert board.waves[1] == (release_id,)
    assert board.holds[0] == {release_id: HoldReason.UNIT_DEPENDENCY}
    assert board.states["SWR-3406"] is DeliveryState.DONE


@pytest.mark.integration
@verifies(SWR.SWR_3406)
def test_a_failing_unit_stops_its_dependents_and_nothing_else() -> None:
    """The rest of the queue keeps moving; the requirement does not reach Done."""
    blocked = plan_units(
        "SWR-1",
        (UnitSpec(key="impl"), UnitSpec(key="tests", depends_on=("impl",)), UnitSpec(key="docs")),
    )
    healthy = one_unit("SWR-2")
    impl_id, tests_id, docs_id = blocked.ids
    board = Board({"SWR-1": blocked, "SWR-2": healthy})

    drive(
        board,
        limits=SchedulerLimits(concurrency=3),
        start=lambda choice: board.finish(choice, failing=choice.unit_id == impl_id),
    )

    started = [unit_id for wave in board.waves for unit_id in wave]
    assert impl_id in started
    assert docs_id in started
    assert healthy.ids[0] in started
    # The dependent unit never ran, and said so on every pass after the failure.
    assert tests_id not in started
    assert board.holds[-1][tests_id] is HoldReason.UNIT_DEPENDENCY
    # Its requirement is therefore not Done, while the healthy one is.
    assert board.states["SWR-1"] is DeliveryState.RUNNING
    assert board.states["SWR-2"] is DeliveryState.DONE


# -- the user-visible flow -------------------------------------------------


@pytest.mark.integration
@verifies(SWR.SWR_3412, SWR.SWR_3216)
def test_a_user_releases_four_requirements_and_reads_the_queue_while_it_works() -> None:
    """The public boundary: what the board shows at each pass, and in what order."""
    plans = {req_id: one_unit(req_id) for req_id in ("SWR-1", "SWR-2", "SWR-3", "SWR-4")}
    board = Board(
        plans,
        priorities={"SWR-4": RequirementPriority.CRITICAL},
        depends_on={"SWR-4": ("SWR-1",), "SWR-2": ("SWR-1",)},
    )
    limits = SchedulerLimits(concurrency=1, automatic=True)

    first = schedule(board.candidates(), limits=limits, at=AT)
    queue = first.to_queue_view()

    # What the user sees before anything runs: one thing starting, three reasons.
    assert queue.automatic is True
    assert queue.concurrency_limit == 1
    assert queue.next_up is not None
    assert queue.next_up.req_id == "SWR-1"
    held = {entry.req_id: entry.hold_reason for entry in queue.held}
    assert set(held) == {"SWR-2", "SWR-3", "SWR-4"}
    assert "requirement-dependency" in held["SWR-4"]
    assert "requirement-dependency" in held["SWR-2"]
    assert "concurrency-limit" in held["SWR-3"]
    assert all(entry.waiting_for or entry.hold_reason for entry in queue.held)

    drive(board, limits=limits)

    order = [unit_id for wave in board.waves for unit_id in wave]
    assert order[0] == plans["SWR-1"].ids[0]
    assert set(board.states.values()) == {DeliveryState.DONE}
    # The critical requirement waited for its dependency, and then went before the
    # unprioritised one that had been queued longer.
    assert order.index(plans["SWR-4"].ids[0]) > order.index(plans["SWR-1"].ids[0])
    assert order.index(plans["SWR-4"].ids[0]) < order.index(plans["SWR-3"].ids[0])


# -- the product boundary: the shipped composition, in dependency order ----
#
# Everything below runs through ``workspace_actions`` — the one production
# composition — over a real checkout with a real requirement source, a real
# delivery store, the real transition function and the real scheduler. The
# single replacement is the agent, which is the one external system; the
# requirement documents, the source configuration and the check suite are what a
# user would have.
#
# The source is a *declarative* one (SWR-3104) rather than the built-in ReqToCode
# store, and that is a finding rather than a convenience: ``ReqToCodeSource``
# produces ``derived-from`` relations and nothing else, so a ``depends-on``
# cannot be expressed in the built-in store at all. A project that wants
# dependency gating has to configure a source that maps it, which is exactly the
# configuration SWR-3106's accepted proposal persists.


def _git_in(cwd: Path, *args: str) -> str:
    import subprocess

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


def _spec(req_id: str, *, title: str, depends_on: Sequence[str] = ()) -> str:
    waits = "".join(f"\n  - {other}" for other in depends_on)
    block = f"depends-on:{waits}\n" if depends_on else ""
    return (
        f"---\nid: {req_id}\nstatus: approved\n{block}---\n\n"
        f"# {title}\n\nThe product does {title.casefold()}.\n"
    )


SOURCE_CONFIG = json.dumps(
    {
        "source-id": "specs",
        "type": "markdown",
        "glob": "specs/**/*.md",
        "id": "frontmatter.id",
        "title": "heading",
        "description": "body",
        "status": "frontmatter.status",
        "relations": {"depends-on": "frontmatter.depends-on"},
    },
    indent=2,
    sort_keys=True,
)


def _configured_project(root: Path, specs: Mapping[str, Sequence[str]]) -> Path:
    """A checkout whose requirement source is the configuration a user accepted."""
    (root / "specs").mkdir(parents=True)
    for req_id, depends_on in specs.items():
        (root / "specs" / f"{req_id.casefold()}.md").write_text(
            _spec(req_id, title=f"Feature {req_id}", depends_on=depends_on),
            encoding="utf-8",
        )
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / ".rotaris").mkdir()
    (root / ".rotaris" / "requirement-source.json").write_text(SOURCE_CONFIG, encoding="utf-8")
    (root / ".rotaris" / "agents.yaml").write_text(
        "verifier:\n  checks:\n    - name: repository\n      command: git rev-parse HEAD\n"
        # Splitting switched off, which is also what keeps this flow hermetic:
        # a workspace that permits no decomposition asks no model anything, so
        # nothing on this path reaches a provider (SWR-3117).
        "requirements:\n  execution:\n    decomposition:\n      enabled: false\n",
        encoding="utf-8",
    )
    (root / "src").mkdir()
    (root / "tests").mkdir()
    (root / "src" / "app.py").write_text("def run() -> None: ...\n", encoding="utf-8")
    _git_in(root, "init", "-b", "main")
    _git_in(root, "config", "user.name", "Test User")
    _git_in(root, "config", "user.email", "test@example.invalid")
    _git_in(root, "add", ".")
    _git_in(root, "commit", "-m", "the project as it stands")
    return root


def _req_id_in(text: str) -> str:
    return next(word for word in text.split() if word.startswith("SWR-")).strip(".,")


class ImplementingAgent:
    """The one external system: an agent that changes files and commits them."""

    def __init__(self) -> None:
        self.tasks: list[str] = []

    def __call__(self, task: str, tree: Path) -> object:
        from rotaris_core.run_result import RunResult, RunStatus

        self.tasks.append(task)
        req_id = _req_id_in(task)
        stem = req_id.casefold().replace("-", "_")
        (tree / "src").mkdir(exist_ok=True)
        (tree / "tests").mkdir(exist_ok=True)
        (tree / "src" / f"{stem}.py").write_text(
            f"# implements {req_id}\ndef run() -> None: ...\n",
            encoding="utf-8",
        )
        (tree / "tests" / f"test_{stem}.py").write_text(
            f"# verifies {req_id}\ndef test_run() -> None: ...\n",
            encoding="utf-8",
        )
        _git_in(tree, "add", f"src/{stem}.py", f"tests/test_{stem}.py")
        _git_in(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"work for {req_id}",
        )
        return RunResult(
            session_id=f"session-{len(self.tasks)}",
            status=RunStatus.COMPLETED,
            summary=f"implemented {req_id} as the task described it",
        )

    @property
    def order(self) -> list[str]:
        """The requirement ids in the order the agent was actually asked for them."""
        return [_req_id_in(task) for task in self.tasks]


def _shipped(root: Path, agent: ImplementingAgent) -> object:
    """``workspace_actions`` as the desktop builds it, with only the agent replaced."""
    from rotaris.services.requirements_actions import workspace_actions

    actions = workspace_actions(
        root,
        actor_name="dvf",
        # The flow runs on the calling thread so the test can observe its end.
        dispatch=lambda work: work(),
        run_agent=agent,  # type: ignore[arg-type]
    )
    assert actions is not None, "the project keeps a requirement store Rotaris can write"
    return actions


def _state(root: Path, req_id: str) -> DeliveryState:
    from rotaris_core.requirements.delivery.store import DeliveryStore

    return DeliveryStore(root).load(req_id).record.delivery.state


@pytest.mark.e2e
@verifies(SWR.SWR_3510, SWR.SWR_3412)
def test_a_user_releases_two_dependent_requirements_and_they_run_in_the_right_order(
    tmp_path: Path,
) -> None:
    """Productive use: a person releases a requirement and the one that depends on it,
    in the wrong order, and walks away.
    Expected outcome: the dependent does not start — Rotaris says which requirement it
    waits for — and when the dependency is accepted the dependent starts by itself,
    with nobody releasing it a second time."""
    root = _configured_project(tmp_path / "project", {"SWR-1": (), "SWR-2": ("SWR-1",)})
    agent = ImplementingAgent()
    actions = _shipped(root, agent)

    # The dependent is released first, and deliberately.
    held = actions.release("SWR-2", source="backlog")  # type: ignore[attr-defined]
    assert held.accepted, held.reason
    assert held.failure, "a release that started nothing says so"
    assert "SWR-1" in held.failure, "and names the requirement it waits for"
    assert agent.tasks == [], "nothing ran for a requirement whose dependency is unmet"
    assert _state(root, "SWR-2") is DeliveryState.READY

    released = actions.release("SWR-1", source="backlog")  # type: ignore[attr-defined]
    assert released.accepted, released.reason
    assert released.failure == "", released.failure
    assert agent.order == ["SWR-1"], "the dependency ran, and only the dependency"
    assert _state(root, "SWR-1") is DeliveryState.REVIEW

    # Accepting the dependency is the only thing the user does next.
    accepted = actions.accept("SWR-1")  # type: ignore[attr-defined]
    assert accepted.accepted, f"{accepted.reason} :: {accepted.details}"
    assert _state(root, "SWR-1") is DeliveryState.DONE

    assert agent.order == ["SWR-1", "SWR-2"], (
        "completing the dependency released its dependent without user action (SWR-3510)"
    )
    assert _state(root, "SWR-2") is DeliveryState.REVIEW


@pytest.mark.e2e
@verifies(SWR.SWR_3412, SWR.SWR_3510, SWR.SWR_3608)
def test_a_user_releases_four_requirements_and_rotaris_works_through_them_in_order(
    tmp_path: Path,
) -> None:
    """Productive use: a person releases four requirements at once — two of them
    depending on the first — and lets Rotaris get on with it.
    Expected outcome: the two independent ones are worked on, the two dependents wait
    with the requirement they wait for named, and once the dependency is accepted
    Rotaris works through the rest in dependency order without being asked again."""
    root = _configured_project(
        tmp_path / "project",
        {"SWR-1": (), "SWR-2": ("SWR-1",), "SWR-3": (), "SWR-4": ("SWR-1",)},
    )
    agent = ImplementingAgent()
    actions = _shipped(root, agent)

    outcomes = {
        req_id: actions.release(req_id, source="backlog")  # type: ignore[attr-defined]
        for req_id in ("SWR-1", "SWR-2", "SWR-3", "SWR-4")
    }

    assert all(outcome.accepted for outcome in outcomes.values()), "every card moved"
    assert agent.order == ["SWR-1", "SWR-3"], "only what nothing was waiting for ran"
    # The two that did not start say why, in the scheduler's own words.
    assert "SWR-1" in outcomes["SWR-2"].failure
    assert "SWR-1" in outcomes["SWR-4"].failure
    assert outcomes["SWR-1"].failure == "", outcomes["SWR-1"].failure
    assert outcomes["SWR-3"].failure == "", outcomes["SWR-3"].failure
    assert all(_state(root, req_id) is DeliveryState.READY for req_id in ("SWR-2", "SWR-4")), (
        "a held requirement stays released, waiting — it is not sent back"
    )

    accepted = actions.accept("SWR-1")  # type: ignore[attr-defined]
    assert accepted.accepted, f"{accepted.reason} :: {accepted.details}"

    # One accept, and the queue emptied itself in dependency order.
    assert set(agent.order) == {"SWR-1", "SWR-2", "SWR-3", "SWR-4"}
    assert agent.order.index("SWR-2") > agent.order.index("SWR-1")
    assert agent.order.index("SWR-4") > agent.order.index("SWR-1")
    assert all(
        _state(root, req_id) is DeliveryState.REVIEW for req_id in ("SWR-2", "SWR-3", "SWR-4")
    ), "every requirement reached a reviewable result"
