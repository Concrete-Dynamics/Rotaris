"""Productive use: a user opens the board of a project Rotaris has never run against,
sees every requirement in Backlog without a single file being written, and later sees a
requirement that is `approved` in the project's store *and* `Needs Update` in Rotaris —
two facts on one card, neither of them rewriting the other.
Expected outcome: every state round-trips through the store's spelling; a value written
by some other build degrades to Backlog with a stated notice instead of crashing the
board; a Blocked requirement always carries its reason; and moving the delivery state
never touches the requirement's own file, nor does editing that file move the state."""

from __future__ import annotations

import datetime as dt
from typing import TYPE_CHECKING

import pytest
from pydantic import ValidationError

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery import (
    DEFAULT_DELIVERY_STATE,
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    DeliveryStore,
    DeliveryView,
    TransitionCause,
    parse_delivery_state,
    read_delivery_state,
)
from rotaris_core.requirements.model import (
    DELIVERY_FIELD_NAMES,
    CanonicalRequirement,
    RequirementLifecycle,
)

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 12, 0, tzinfo=dt.UTC)
SYSTEM = DeliveryActor.system("requirement-runner")
USER = DeliveryActor.user("dvf")


def moved(state: DeliveryState, *, reason: str = "") -> DeliveryStatus:
    """A status in *state* with the provenance every moved state must carry."""
    return DeliveryStatus().moved_to(
        state,
        actor=SYSTEM,
        at=AT,
        cause=TransitionCause.RUN_STARTED,
        reason=reason,
    )


# -- the closed set (SWR-3201) ---------------------------------------------


@verifies(SWR.SWR_3201)
def test_every_state_round_trips_through_its_persisted_token() -> None:
    """The board's seven columns survive a write and a read, spelling included."""
    assert len(DeliveryState) == 7
    for state in DeliveryState:
        assert parse_delivery_state(str(state)) is state
        assert parse_delivery_state(state.label) is state
        assert parse_delivery_state(state.value.upper()) is state
        assert parse_delivery_state(state.value.replace("-", "_")) is state
    assert DeliveryState.NEEDS_UPDATE.label == "Needs Update"
    assert str(DeliveryState.NEEDS_UPDATE) == "needs-update"


@verifies(SWR.SWR_3201)
def test_an_unknown_persisted_state_degrades_to_backlog_and_is_reported() -> None:
    """A value from another build costs one card its state, never the board."""
    state, notice = read_delivery_state("Shipped", req_id="SWR-3201")
    assert state is DEFAULT_DELIVERY_STATE
    assert notice is not None
    assert notice.raw == "Shipped"
    assert notice.degraded_to is DeliveryState.BACKLOG
    assert "SWR-3201" in notice.message
    assert "Shipped" in notice.message

    known, no_notice = read_delivery_state("running")
    assert known is DeliveryState.RUNNING
    assert no_notice is None


@verifies(SWR.SWR_3201)
def test_a_missing_or_malformed_state_is_a_notice_not_an_exception() -> None:
    """``None``, an empty string and a number are all "unknown", not a crash."""
    for raw in (None, "", "   ", 7, ["running"]):
        state, notice = read_delivery_state(raw, req_id="SWR-3201")
        assert state is DeliveryState.BACKLOG
        assert notice is not None


@verifies(SWR.SWR_3201)
def test_a_requirement_rotaris_has_never_seen_is_backlog_without_provenance() -> None:
    """Backlog is free: the default costs no actor, no timestamp and no write."""
    status = DeliveryStatus()
    assert status.state is DeliveryState.BACKLOG
    assert status.pristine
    assert status.changed_at is None
    assert not moved(DeliveryState.READY).pristine


@verifies(SWR.SWR_3201)
def test_blocked_carries_a_stated_reason_and_the_state_it_came_from() -> None:
    """ "Blocked" alone is never the answer; the reason is part of the state."""
    ready = moved(DeliveryState.READY)
    blocked = ready.moved_to(
        DeliveryState.BLOCKED,
        actor=USER,
        at=LATER,
        cause=TransitionCause.BLOCKER_RAISED,
        reason="waiting for the API key",
    )
    assert blocked.blocked
    assert blocked.blocked_reason == "waiting for the API key"
    assert blocked.blocked_from is DeliveryState.READY
    assert "waiting for the API key" in blocked.summary

    with pytest.raises(ValidationError, match="stated reason"):
        DeliveryStatus(
            state=DeliveryState.BLOCKED,
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.BLOCKER_RAISED,
        )


@verifies(SWR.SWR_3201)
def test_leaving_blocked_drops_the_blocker_instead_of_carrying_it_along() -> None:
    """A stale reason travelling with a running requirement would misreport it."""
    blocked = moved(DeliveryState.READY).moved_to(
        DeliveryState.BLOCKED,
        actor=USER,
        at=LATER,
        cause=TransitionCause.BLOCKER_RAISED,
        reason="waiting for the API key",
    )
    resumed = blocked.moved_to(
        DeliveryState.READY,
        actor=USER,
        at=LATER,
        cause=TransitionCause.BLOCKER_CLEARED,
    )
    assert resumed.blocked_reason == ""
    assert resumed.blocked_from is None

    with pytest.raises(ValidationError, match="only a Blocked requirement"):
        DeliveryStatus(
            state=DeliveryState.READY,
            blocked_reason="stale",
            changed_at=AT,
            changed_by=USER,
            cause=TransitionCause.BLOCKER_RAISED,
        )


@verifies(SWR.SWR_3201)
def test_a_state_that_moved_names_who_moved_it_when_and_why() -> None:
    """Without provenance a state is an assertion nobody can check (SWR-3213)."""
    with pytest.raises(ValidationError, match="did not arrive by itself"):
        DeliveryStatus(state=DeliveryState.DONE)
    with pytest.raises(ValidationError, match="actor, time and cause together"):
        DeliveryStatus(state=DeliveryState.BACKLOG, changed_at=AT)
    with pytest.raises(ValidationError, match="aware timestamp"):
        DeliveryStatus(
            state=DeliveryState.READY,
            changed_at=dt.datetime(2026, 8, 14, 10, 0),  # noqa: DTZ001 - the point of the test
            changed_by=USER,
            cause=TransitionCause.USER_ACTION,
        )


# -- the two axes stay apart (SWR-3202) ------------------------------------


@verifies(SWR.SWR_3202)
def test_both_axes_are_representable_in_every_combination_and_both_render() -> None:
    """`approved` + `Needs Update` and `draft` + `Running` are normal, not errors."""
    approved = CanonicalRequirement(
        req_id="SWR-3202",
        title="Delivery state is independent of the lifecycle",
        lifecycle=RequirementLifecycle.APPROVED,
    )
    drafted = approved.evolve(lifecycle=RequirementLifecycle.DRAFT)

    stale = DeliveryView.of(approved, moved(DeliveryState.NEEDS_UPDATE))
    running = DeliveryView.of(drafted, moved(DeliveryState.RUNNING))

    assert stale.badges == ("approved", "Needs Update")
    assert running.badges == ("draft", "Running")
    assert stale.state is DeliveryState.NEEDS_UPDATE
    assert running.state is DeliveryState.RUNNING


@verifies(SWR.SWR_3202)
def test_the_delivery_status_holds_no_lifecycle_and_the_requirement_no_state() -> None:
    """Neither type can express the other's axis, so neither can overwrite it."""
    assert "lifecycle" not in DeliveryStatus.model_fields
    assert "status" not in DeliveryStatus.model_fields
    for field in DELIVERY_FIELD_NAMES:
        assert field not in CanonicalRequirement.model_fields


@verifies(SWR.SWR_3202)
def test_a_lifecycle_change_in_the_source_leaves_the_delivery_state_alone() -> None:
    """Approving a requirement must not silently reset the work's progress."""
    drafted = CanonicalRequirement(req_id="SWR-3202", title="Two axes")
    status = moved(DeliveryState.RUNNING)
    before = DeliveryView.of(drafted, status)

    approved = drafted.evolve(lifecycle=RequirementLifecycle.APPROVED)
    after = DeliveryView.of(approved, status)

    assert approved.current_hash != drafted.current_hash  # the specification moved
    assert after.delivery == before.delivery  # the delivery state did not
    assert after.badges == ("approved", "Running")


@verifies(SWR.SWR_3202)
def test_the_only_coupling_between_the_axes_is_that_deprecated_is_not_schedulable() -> None:
    """SWR-3412's rule, stated once and derived — never stored on the record."""
    deprecated = CanonicalRequirement(
        req_id="SWR-3202",
        lifecycle=RequirementLifecycle.DEPRECATED,
    )
    live = deprecated.evolve(lifecycle=RequirementLifecycle.APPROVED)

    assert not DeliveryView.of(deprecated, moved(DeliveryState.READY)).schedulable
    assert DeliveryView.of(live, moved(DeliveryState.READY)).schedulable
    # The delivery state itself is untouched by the lifecycle: a deprecated
    # requirement that was Running still reports Running.
    assert DeliveryView.of(deprecated, moved(DeliveryState.RUNNING)).state is DeliveryState.RUNNING


@verifies(SWR.SWR_3202, SWR.SWR_3201)
def test_setting_a_delivery_state_never_writes_to_the_requirement_source(tmp_path: Path) -> None:
    """The project's file is the project's: Rotaris writes beside it, never into it."""
    source = tmp_path / "docs" / "requirements" / "SWR-3202.md"
    source.parent.mkdir(parents=True)
    original = "---\nreq-id: SWR-3202\nstatus: approved\n---\n\n# SWR-3202 — Two axes\n"
    source.write_text(original, encoding="utf-8")

    store = DeliveryStore(tmp_path)
    store.update_record(
        "SWR-3202",
        lambda record: record.evolve(delivery=moved(DeliveryState.RUNNING)),
    )

    assert source.read_text(encoding="utf-8") == original
    written = {
        path.relative_to(tmp_path).as_posix()
        for path in tmp_path.rglob("*")
        if path.is_file() and not path.is_relative_to(source.parent)
    }
    assert written == {".rotaris/requirements/delivery/SWR-3202.json"}
