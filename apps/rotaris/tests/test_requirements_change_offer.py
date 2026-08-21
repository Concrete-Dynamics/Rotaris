"""Productive use: a person tightens an acceptance criterion on a requirement Rotaris
already delivered, opens the board, and clicks the card.
Expected outcome: the detail says what the change was judged to cost and what accepting
would do — in the engine's words, with the price named — and only the board's single write
path carries it out, attributed to them. Nothing ran because they looked.

The engine half is unit-tested next door. What is proved here is that the answer reaches
the surface a person meets, that the surface adds no sentence of its own, and that the
action goes through `perform` like every other."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.projection import OfferView
from rotaris_core.requirements.delivery.state import DeliveryActor

from rotaris.models.requirements_state import build_change_work, build_detail
from rotaris.services.requirements_actions import BoardAction, RequirementActions

if TYPE_CHECKING:
    from rotaris_core.requirements.change_host import ChangeOffer, OfferOutcome

pytestmark = pytest.mark.unit


def offer_view(
    *,
    units: tuple[str, ...] = ("tests",),
    verifies_instead: bool = False,
    decomposes: bool = False,
) -> OfferView:
    return OfferView(
        req_id="SWR-9001",
        outcome="tests-affected",
        summary="SWR-9001: tests-affected — accepting would create 1 unit(s): tests",
        reasoning="the criterion the covering tests assert on moved",
        units=units,
        verifies_instead=verifies_instead,
        decomposes=decomposes,
    )


class _Entry:
    """The one field of a board entry this surface reads."""

    def __init__(self, offer: OfferView | None) -> None:
        self.offer = offer


@verifies(SWR.SWR_3616)
def test_the_offer_reaches_the_surface_in_the_engines_own_words() -> None:
    """Carried through, never composed. A board that phrased "this would create two
    units" itself would be a button nobody can take responsibility for (SWR-3512)."""
    work = build_change_work(_Entry(offer_view()))  # type: ignore[arg-type]

    assert work is not None
    assert work.outcome == "tests-affected"
    assert work.summary.endswith("1 unit(s): tests")
    assert work.reasoning == "the criterion the covering tests assert on moved"
    assert work.units == ("tests",)


@verifies(SWR.SWR_3616)
def test_a_card_with_nothing_to_decide_carries_no_offer() -> None:
    assert build_change_work(_Entry(None)) is None  # type: ignore[arg-type]


@verifies(SWR.SWR_3616)
def test_the_offer_states_the_price_and_the_two_prices_are_different() -> None:
    """Minutes of this workspace's own suite and an agent run against a model are
    different decisions, and the person taking them is entitled to know which."""
    agent = build_change_work(_Entry(offer_view()))  # type: ignore[arg-type]
    suite = build_change_work(
        _Entry(offer_view(units=(), verifies_instead=True)),  # type: ignore[arg-type]
    )
    split = build_change_work(
        _Entry(offer_view(units=(), decomposes=True)),  # type: ignore[arg-type]
    )

    assert agent is not None and suite is not None and split is not None
    assert "agent run" in agent.cost
    assert "checks once" in suite.cost and "No agent run" in suite.cost
    assert "Plans the split first" in split.cost
    assert len({agent.cost, suite.cost, split.cost}) == 3


@verifies(SWR.SWR_3616, SWR.SWR_3307)
def test_the_detail_shows_the_offer_where_execution_is_shown(
    board_entry_factory: object = None,
) -> None:
    """It is *execution that has not begun*. A user reading "no units, no runs" needs to
    see in the same place that there is work waiting for their word."""
    from rotaris_core.requirements.delivery.projection import BoardInputs, project_board
    from rotaris_core.requirements.model import CanonicalRequirement, RequirementLifecycle
    from rotaris_core.requirements.registry import RequirementIndex

    del board_entry_factory
    requirement = CanonicalRequirement(
        req_id="SWR-9001",
        title="Log in",
        description="The user signs in with an email and a password.",
        lifecycle=RequirementLifecycle.APPROVED,
        source_id="reqtocode",
    )
    # The real projection, so the entry this reads is the one the board builds.
    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(requirement,)),
            offers={"SWR-9001": offer_view()},
        ),
    )
    entry = projection.entry("SWR-9001")
    assert entry is not None

    detail = build_detail(entry)

    assert detail.offer is not None
    execution = detail.section("execution")
    assert execution is not None
    assert not execution.empty, "a card with work waiting is not an empty execution section"
    stated = [fact for fact in execution.facts if fact.label == "This change asks for"]
    assert stated, [fact.label for fact in execution.facts]
    assert stated[0].value == detail.offer.summary


# --------------------------------------------------------------------------
# Accepting: through `perform`, attributed, and the engine's refusal verbatim
# --------------------------------------------------------------------------


class _Transitions:
    """A write path that records nothing — this action never transitions itself."""

    enforces_specification_guard = True

    def apply(self, request: object) -> object:  # pragma: no cover - never reached
        raise AssertionError("accepting change work goes through the engine, not a transition")

    def record_event(self, event: object) -> object:
        return event


class _Changes:
    """The port, scripted: what it was asked and what it answers."""

    def __init__(self, outcome: OfferOutcome) -> None:
        self._outcome = outcome
        self.accepted: list[tuple[str, DeliveryActor]] = []

    def pending(self, req_id: str) -> ChangeOffer | None:  # pragma: no cover - unused here
        del req_id
        return None

    def accept(self, req_id: str, *, actor: DeliveryActor) -> OfferOutcome:
        self.accepted.append((req_id, actor))
        return self._outcome

    def question(self, req_id: str) -> None:  # pragma: no cover - no decisions here
        del req_id
        return None

    def answer(  # pragma: no cover - no decisions here
        self,
        req_id: str,
        option: str,
        *,
        actor: DeliveryActor,
    ) -> OfferOutcome:
        del req_id, option, actor
        return self._outcome


def outcome(*, accepted: bool, message: str, unit_ids: tuple[str, ...] = ()) -> OfferOutcome:
    from rotaris_core.requirements.change_host import OfferOutcome as Outcome

    return Outcome(req_id="SWR-9001", accepted=accepted, message=message, unit_ids=unit_ids)


@verifies(SWR.SWR_3616, SWR.SWR_3610)
def test_accepting_goes_through_the_board_and_names_who_accepted() -> None:
    """SWR-3610: an audit trail whose entries all say ``system`` cannot answer "who
    asked for this". The engine's actor for the *verdict* is the system; the actor for
    the *decision to take it* is the person, and this is where that is recorded."""
    port = _Changes(outcome(accepted=True, message="2 unit(s) planned", unit_ids=("a", "b")))
    actions = RequirementActions(_Transitions(), changes=port, actor_name="dvf")

    answer = actions.perform(BoardAction.ACCEPT_CHANGE_WORK, "SWR-9001")

    assert answer.accepted, answer.reason
    assert port.accepted == [("SWR-9001", DeliveryActor.user("dvf"))]
    assert any("Planned a" in line for line in answer.details), answer.details


@verifies(SWR.SWR_3616, SWR.SWR_3602)
def test_a_refused_acceptance_carries_the_engines_sentence() -> None:
    """A user told "the requirement changed again since this was analysed" re-reads it.
    One told "not allowed" does not."""
    stale = "SWR-9001: the requirement changed again since this was analysed"
    actions = RequirementActions(
        _Transitions(),
        changes=_Changes(outcome(accepted=False, message=stale)),
        actor_name="dvf",
    )

    answer = actions.perform(BoardAction.ACCEPT_CHANGE_WORK, "SWR-9001")

    assert not answer.accepted
    assert answer.reason == stale


@verifies(SWR.SWR_3616)
def test_a_workspace_with_no_store_says_so_rather_than_failing() -> None:
    actions = RequirementActions(_Transitions(), actor_name="dvf")

    answer = actions.perform(BoardAction.ACCEPT_CHANGE_WORK, "SWR-9001")

    assert not answer.accepted
    assert "keeps no requirement store" in answer.reason


@verifies(SWR.SWR_3616, SWR.SWR_3609)
def test_the_action_states_its_cost_and_counts_as_irreversible() -> None:
    """Every action that spends something says so before it is taken, and the board
    treats it as one a user cannot undo by dragging the card home again."""
    assert BoardAction.ACCEPT_CHANGE_WORK.consequence
    assert "Nothing runs until you accept" in BoardAction.ACCEPT_CHANGE_WORK.consequence
    # SWR-3601: the cost is stated before it happens, like every other action a
    # user cannot take back by dragging the card home again.
    assert BoardAction.ACCEPT_CHANGE_WORK.confirm
    assert BoardAction.ACCEPT_CHANGE_WORK.progress_label
    assert BoardAction.ACCEPT_CHANGE_WORK.changes_state
